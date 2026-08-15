"""Environment and Secrets data models."""

import re

from pydantic import BaseModel, Field, field_validator, model_validator

ENV_ID_PATTERN = re.compile(r"^env_[a-f0-9]{12}$")
VAR_KEY_PATTERN = re.compile(r"^[a-zA-Z0-9_.-]+$")


class EnvironmentVariableDefinition(BaseModel):
    """Public variable definition inside an environment."""

    id: str | None = None
    key: str = Field(..., min_length=1, max_length=255)
    value: str | None = None
    enabled: bool = True
    is_secret: bool = False
    description: str | None = None

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Variable key cannot be empty")
        if not VAR_KEY_PATTERN.match(stripped):
            raise ValueError(
                f"Invalid variable key '{stripped}'. Keys must contain only alphanumeric characters, underscores, hyphens, and dots."
            )
        return stripped

    @model_validator(mode="after")
    def validate_secret_value_invariant(self) -> "EnvironmentVariableDefinition":
        """Enforce strict invariant: Secret variables MUST NOT have a non-empty public value."""
        if self.is_secret and self.value is not None and self.value != "":
            raise ValueError(
                f"Secret variable '{self.key}' cannot have a public value in environment definitions. "
                "Secret values must be set exclusively via PUT /api/environments/{id}/secrets/{key}."
            )
        if self.is_secret:
            self.value = None
        return self


class Environment(BaseModel):
    """Public environment model returned by GET and PUT endpoints (never contains secrets)."""

    schema_version: int = 1
    id: str = Field(..., pattern=r"^env_[a-f0-9]{12}$")
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    variables: list[EnvironmentVariableDefinition] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Environment name cannot be empty")
        return stripped

    @field_validator("variables")
    @classmethod
    def validate_unique_keys(
        cls, vars_list: list[EnvironmentVariableDefinition]
    ) -> list[EnvironmentVariableDefinition]:
        seen_keys: set[str] = set()
        for var in vars_list:
            if var.key in seen_keys:
                raise ValueError(
                    f"Duplicate variable key '{var.key}' is not allowed in the same environment"
                )
            seen_keys.add(var.key)
        return vars_list


class EnvironmentCreate(BaseModel):
    """Schema for creating a new environment definition."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    variables: list[EnvironmentVariableDefinition] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Environment name cannot be empty")
        return stripped

    @field_validator("variables")
    @classmethod
    def validate_unique_keys(
        cls, vars_list: list[EnvironmentVariableDefinition]
    ) -> list[EnvironmentVariableDefinition]:
        seen_keys: set[str] = set()
        for var in vars_list:
            if var.key in seen_keys:
                raise ValueError(
                    f"Duplicate variable key '{var.key}' is not allowed in the same environment"
                )
            seen_keys.add(var.key)
        return vars_list


class EnvironmentUpdate(BaseModel):
    """Schema for updating environment metadata and public variable definitions."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    variables: list[EnvironmentVariableDefinition] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Environment name cannot be empty")
        return stripped

    @field_validator("variables")
    @classmethod
    def validate_unique_keys(
        cls, vars_list: list[EnvironmentVariableDefinition]
    ) -> list[EnvironmentVariableDefinition]:
        seen_keys: set[str] = set()
        for var in vars_list:
            if var.key in seen_keys:
                raise ValueError(
                    f"Duplicate variable key '{var.key}' is not allowed in the same environment"
                )
            seen_keys.add(var.key)
        return vars_list


class SecretValueUpdate(BaseModel):
    """Payload for setting or updating a single secret variable value."""

    value: str


class SecretRevealResponse(BaseModel):
    """Payload returned exclusively when a secret is explicitly revealed."""

    key: str
    value: str
    is_set: bool = True


class EnvironmentSecrets(BaseModel):
    """Internal model for .piddi/environments/env_<id>.secrets.json."""

    schema_version: int = 1
    environment_id: str = Field(..., pattern=r"^env_[a-f0-9]{12}$")
    values: dict[str, str] = Field(default_factory=dict)


class UserPreferences(BaseModel):
    """User machine-specific preferences persisted in ~/.piddi/preferences.json."""

    schema_version: int = 1
    active_environment_id: str | None = None
