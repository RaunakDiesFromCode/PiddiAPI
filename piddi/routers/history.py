"""History REST API endpoints."""

from fastapi import APIRouter, Query

from piddi.models.history import HistoryRecord
from piddi.storage.history import get_history_manager

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=list[HistoryRecord])
async def list_history(
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[HistoryRecord]:
    """Retrieve history records in reverse chronological order (newest first)."""
    history_manager = get_history_manager()
    return await history_manager.get_history(limit=limit)


@router.delete("")
async def clear_history() -> dict[str, bool]:
    """Clear all history records."""
    history_manager = get_history_manager()
    success = await history_manager.clear_history()
    return {"cleared": success}
