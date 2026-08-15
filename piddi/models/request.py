"""Canonical request data models."""

from enum import Enum

from pydantic import BaseModel, Field, field_validator


class HTTPMethod(str, Enum):
    """Supported HTTP request methods."""

    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
    HEAD = "HEAD"
    OPTIONS = "OPTIONS"


class AuthType(str, Enum):
    """Supported authentication schemes."""

    NONE = "none"
    BEARER = "bearer"
    BASIC = "basic"
    API_KEY = "apikey"


class AuthConfig(BaseModel):
    """Authentication configuration for a request."""

    type: AuthType = AuthType.NONE
    token: str | None = None
    username: str | None = None
    password: str | None = None
    key: str | None = None
    value: str | None = None
    placement: str = "header"  # "header" or "query"


class KeyValueItem(BaseModel):
    """Generic key-value pair for headers, params, and form data."""

    key: str
    value: str = ""
    enabled: bool = True
    description: str | None = None
    type: str = "text"  # "text" or "file"


class BodyType(str, Enum):
    """Supported request body content types."""

    NONE = "none"
    JSON = "json"
    FORM_URLENCODED = "urlencoded"
    MULTIPART = "multipart"
    RAW = "raw"


class RequestBody(BaseModel):
    """Request body configuration."""

    type: BodyType = BodyType.NONE
    raw: str = ""
    form_params: list[KeyValueItem] = Field(default_factory=list)

    @field_validator("type", mode="before")
    @classmethod
    def normalize_body_type(cls, v: object) -> object:
        """Normalize common body type aliases."""
        if isinstance(v, str):
            v_lower = v.lower().strip()
            if v_lower in ("x-www-form-urlencoded", "form_urlencoded", "form-urlencoded"):
                return BodyType.FORM_URLENCODED
            if v_lower in ("form-data", "form_data"):
                return BodyType.MULTIPART
        return v


class RequestSettings(BaseModel):
    """Execution settings for an individual HTTP request."""

    timeout_ms: int = 30000
    follow_redirects: bool = True
    verify_ssl: bool = True


class CanonicalRequestModel(BaseModel):
    """Canonical request payload model accepted by /api/execute."""

    id: str | None = None
    name: str | None = "Untitled Request"
    method: HTTPMethod = HTTPMethod.GET
    url: str
    params: list[KeyValueItem] = Field(default_factory=list)
    headers: list[KeyValueItem] = Field(default_factory=list)
    auth: AuthConfig = Field(default_factory=AuthConfig)
    body: RequestBody = Field(default_factory=RequestBody)
    settings: RequestSettings = Field(default_factory=RequestSettings)
    environment_id: str | None = None
