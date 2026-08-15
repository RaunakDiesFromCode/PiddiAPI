"""PiddiAPI Collection and Workspace data models."""

import re

from pydantic import BaseModel, Field, field_validator

from piddi.models.environment import Environment
from piddi.models.request import CanonicalRequestModel

COLLECTION_ID_PATTERN = re.compile(r"^col_[a-f0-9]{12}$")
REQUEST_ID_PATTERN = re.compile(r"^req_[a-f0-9]{12}$")


class Collection(BaseModel):
    """Collection schema persisted in .piddi/collections/col_<id>.json."""

    schema_version: int = 1
    id: str = Field(..., pattern=r"^col_[a-f0-9]{12}$")
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    requests: list[CanonicalRequestModel] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Collection name cannot be empty or whitespace only")
        return stripped


class CollectionCreate(BaseModel):
    """Schema for creating a new collection."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Collection name cannot be empty or whitespace only")
        return stripped


class WorkspaceFileError(BaseModel):
    """Structured error for corrupt or unreadable workspace files."""

    file: str
    error: str
    code: str  # "MALFORMED_JSON", "INVALID_SCHEMA", "UNSUPPORTED_VERSION", "DUPLICATE_ID", "DUPLICATE_REQUEST_ID", "FILE_READ_ERROR"


class WorkspaceSummary(BaseModel):
    """Workspace metadata, loaded collections, loaded environments, and non-fatal file diagnostics."""

    workspace_path: str
    collections: list[Collection] = Field(default_factory=list)
    environments: list["Environment"] = Field(default_factory=list)
    errors: list[WorkspaceFileError] = Field(default_factory=list)
