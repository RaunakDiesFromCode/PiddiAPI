"""User preferences REST API endpoint."""

from fastapi import APIRouter

from piddi.models.environment import UserPreferences
from piddi.storage.preferences_manager import PreferencesManager

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


@router.get("", response_model=UserPreferences)
async def get_preferences() -> UserPreferences:
    """Get machine-specific user preferences (e.g. active environment ID)."""
    return await PreferencesManager.load_preferences()


@router.put("", response_model=UserPreferences)
async def update_preferences(payload: UserPreferences) -> UserPreferences:
    """Update machine-specific user preferences."""
    saved = await PreferencesManager.save_preferences(payload)
    return saved
