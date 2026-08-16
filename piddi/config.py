"""PiddiAPI configuration settings and paths."""

import os
import secrets
import sys
from pathlib import Path

from pydantic import BaseModel, Field

from piddi.paths import get_bundle_dir, get_user_piddi_home

try:
    from dotenv import find_dotenv, load_dotenv

    env_file = find_dotenv(usecwd=True)
    if env_file:
        load_dotenv(env_file)
    else:
        repo_env = get_bundle_dir() / ".env"
        if repo_env.exists():
            load_dotenv(repo_env)
except ImportError:
    pass


def _default_session_token() -> str:
    return secrets.token_hex(32)


def _is_dev_mode() -> bool:
    dev_val = os.getenv("PIDDI_DEV", "").strip().lower()
    if dev_val in ("1", "true", "yes", "dev", "development"):
        return True
    if dev_val in ("0", "false", "no", "prod", "production"):
        return False
    # If running in a frozen bundle, default to production mode
    if getattr(sys, "frozen", False):
        return False
    # If running from source checkout with frontend/src present, default to dev mode
    repo_frontend_src = get_bundle_dir() / "frontend" / "src"
    return repo_frontend_src.is_dir()


class AppConfig(BaseModel):
    """Runtime configuration for the PiddiAPI engine."""

    host: str = "127.0.0.1"
    port: int = 4111
    session_token: str = Field(default_factory=_default_session_token)
    workspace_path: Path = Field(default_factory=lambda: Path(os.getcwd()).resolve())
    temp_dir: Path = Field(default_factory=lambda: get_user_piddi_home() / "temp")
    max_payload_size_bytes: int = 50 * 1024 * 1024  # 50 MB
    debug: bool = Field(default_factory=_is_dev_mode)

    model_config = {"arbitrary_types_allowed": True}


_config_instance: AppConfig | None = None


def get_config() -> AppConfig:
    """Get the active application configuration singleton."""
    global _config_instance
    if _config_instance is None:
        _config_instance = AppConfig()
    return _config_instance


def set_config(config: AppConfig) -> None:
    """Override the active configuration (primarily for testing and custom CLI port binding)."""
    global _config_instance
    _config_instance = config
