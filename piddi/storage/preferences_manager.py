"""User preferences manager for ~/.piddi/preferences.json."""

import json
import logging
import os
import secrets
from pathlib import Path

import aiofiles
from pydantic import ValidationError

from piddi.models.environment import UserPreferences

logger = logging.getLogger("piddi.storage.preferences")


class PreferencesManager:
    """Manages user machine-specific preferences stored in ~/.piddi/preferences.json."""

    @staticmethod
    def get_preferences_path() -> Path:
        """Get the preferences file path in user profile directory."""
        from piddi.paths import get_user_piddi_home

        return (get_user_piddi_home() / "preferences.json").resolve()

    @classmethod
    async def load_preferences(cls) -> UserPreferences:
        """Load user preferences from ~/.piddi/preferences.json or return default."""
        pref_path = cls.get_preferences_path()
        if not pref_path.exists() or not pref_path.is_file():
            return UserPreferences()

        try:
            async with aiofiles.open(pref_path, "r", encoding="utf-8") as f:
                raw = await f.read()
            data = json.loads(raw)
            if isinstance(data, dict):
                return UserPreferences.model_validate(data)
        except (OSError, json.JSONDecodeError, ValidationError) as e:
            logger.warning(f"Could not load ~/.piddi/preferences.json: {e}")

        return UserPreferences()

    @classmethod
    async def save_preferences(cls, prefs: UserPreferences) -> UserPreferences:
        """Atomically save user preferences to ~/.piddi/preferences.json."""
        pref_path = cls.get_preferences_path()
        pref_path.parent.mkdir(parents=True, exist_ok=True)

        temp_file = pref_path.with_name(
            f".{pref_path.name}.tmp_{os.getpid()}_{secrets.token_hex(4)}"
        )

        try:
            content = json.dumps(prefs.model_dump(), indent=2, ensure_ascii=False) + "\n"
            async with aiofiles.open(temp_file, "w", encoding="utf-8") as f:
                await f.write(content)
                await f.flush()
                try:
                    os.fsync(f.fileno())
                except (AttributeError, OSError, ValueError):
                    pass

            os.replace(temp_file, pref_path)
            return prefs
        except Exception:
            if temp_file.exists():
                try:
                    temp_file.unlink(missing_ok=True)
                except OSError:
                    pass
            raise
