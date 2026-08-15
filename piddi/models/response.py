"""Canonical response data models."""

from pydantic import BaseModel, Field


class TimingMetrics(BaseModel):
    """Network connection and transfer timing metrics (in milliseconds)."""

    dns_ms: float = 0.0
    connect_ms: float = 0.0
    tls_ms: float = 0.0
    ttfb_ms: float = 0.0
    transfer_ms: float = 0.0


class ResponseError(BaseModel):
    """Structured error descriptor when execution fails."""

    code: str
    message: str
    details: str | None = None


class CanonicalResponseModel(BaseModel):
    """Canonical response payload model returned by /api/execute."""

    status: int
    status_text: str
    headers: dict[str, str] = Field(default_factory=dict)
    cookies: dict[str, str] = Field(default_factory=dict)
    body: str = ""
    content_type: str = "text/plain"
    size_bytes: int = 0
    duration_ms: float = 0.0
    timing: TimingMetrics | None = None
    is_truncated: bool = False
    temp_file_path: str | None = None
    error: ResponseError | None = None
