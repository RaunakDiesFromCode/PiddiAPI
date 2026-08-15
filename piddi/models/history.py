"""Canonical History record data models."""

import secrets
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from piddi.models.request import CanonicalRequestModel, HTTPMethod


def _default_history_id() -> str:
    """Generate an opaque 12-hex character history ID."""
    return f"hist_{secrets.token_hex(6)}"


def _default_timestamp() -> str:
    """Generate an ISO-8601 UTC timestamp string."""
    return datetime.now(timezone.utc).isoformat()


class HistoryRecord(BaseModel):
    """Canonical record representing an executed HTTP request stored in ~/.piddi/history.jsonl."""

    id: str = Field(default_factory=_default_history_id)
    timestamp: str = Field(default_factory=_default_timestamp)
    method: HTTPMethod
    url: str
    status: int
    duration_ms: float
    size_bytes: int
    request_snapshot: CanonicalRequestModel
