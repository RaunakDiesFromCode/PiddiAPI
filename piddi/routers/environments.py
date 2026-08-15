"""Environments and Secrets Vault REST API endpoints."""

from fastapi import APIRouter, HTTPException, status

from piddi.config import get_config
from piddi.models.environment import (
    VAR_KEY_PATTERN,
    Environment,
    EnvironmentCreate,
    EnvironmentUpdate,
    SecretRevealResponse,
    SecretValueUpdate,
)
from piddi.storage.environment_manager import (
    EnvironmentFileManager,
    generate_environment_id,
)

router = APIRouter(prefix="/api/environments", tags=["environments"])


@router.get("", response_model=list[Environment])
async def list_environments() -> list[Environment]:
    """List all workspace environments.

    Secret variable values are strictly omitted/null.
    """
    config = get_config()
    environments, _ = await EnvironmentFileManager.load_environments(config.workspace_path)
    return environments


@router.post("", response_model=Environment, status_code=status.HTTP_201_CREATED)
async def create_environment(payload: EnvironmentCreate) -> Environment:
    """Create a new environment definition.

    Secret values cannot be supplied in this endpoint.
    """
    config = get_config()
    env_id = generate_environment_id()
    new_env = Environment(
        id=env_id,
        name=payload.name,
        description=payload.description,
        variables=payload.variables,
    )
    saved = await EnvironmentFileManager.save_environment(config.workspace_path, new_env)
    return saved


@router.get("/{id}", response_model=Environment)
async def get_environment(id: str) -> Environment:
    """Get a single environment definition by ID.

    Secret variable values are strictly omitted/null.
    """
    config = get_config()
    try:
        EnvironmentFileManager.validate_id(id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    env = await EnvironmentFileManager.get_environment(config.workspace_path, id)
    if not env:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Environment with ID '{id}' not found",
        )
    return env


@router.put("/{id}", response_model=Environment)
async def update_environment(id: str, payload: EnvironmentUpdate) -> Environment:
    """Update environment metadata and variable definitions.

    Secret values cannot be supplied in this endpoint.
    """
    config = get_config()
    try:
        EnvironmentFileManager.validate_id(id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    existing = await EnvironmentFileManager.get_environment(config.workspace_path, id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Environment with ID '{id}' not found",
        )

    updated_env = Environment(
        id=id,
        name=payload.name,
        description=payload.description,
        variables=payload.variables,
    )
    saved = await EnvironmentFileManager.save_environment(config.workspace_path, updated_env)
    return saved


@router.delete("/{id}")
async def delete_environment(id: str) -> dict[str, str | bool]:
    """Delete an environment definition and its secret vault."""
    config = get_config()
    try:
        EnvironmentFileManager.validate_id(id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    deleted = await EnvironmentFileManager.delete_environment(config.workspace_path, id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Environment with ID '{id}' not found",
        )
    return {"deleted": True, "id": id}


@router.get("/{id}/secrets/{key}", response_model=SecretRevealResponse)
async def reveal_secret(id: str, key: str) -> SecretRevealResponse:
    """Explicitly reveal a specific secret value for an environment."""
    config = get_config()
    try:
        EnvironmentFileManager.validate_id(id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    cleaned_key = key.strip()
    if not cleaned_key or not VAR_KEY_PATTERN.match(cleaned_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid secret variable key '{key}'. Keys must contain only alphanumeric characters, underscores, hyphens, and dots.",
        )

    env = await EnvironmentFileManager.get_environment(config.workspace_path, id)
    if not env:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Environment with ID '{id}' not found",
        )

    secret_val = await EnvironmentFileManager.get_secret(config.workspace_path, id, cleaned_key)
    if secret_val is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Secret variable '{cleaned_key}' not found in environment secret vault",
        )

    return SecretRevealResponse(key=cleaned_key, value=secret_val, is_set=True)


@router.put("/{id}/secrets/{key}")
async def set_secret_value(id: str, key: str, payload: SecretValueUpdate) -> dict[str, str | bool]:
    """Set or update a specific secret value in the environment secret vault."""
    config = get_config()
    try:
        EnvironmentFileManager.validate_id(id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    cleaned_key = key.strip()
    if not cleaned_key or not VAR_KEY_PATTERN.match(cleaned_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid secret variable key '{key}'. Keys must contain only alphanumeric characters, underscores, hyphens, and dots.",
        )

    env = await EnvironmentFileManager.get_environment(config.workspace_path, id)
    if not env:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Environment with ID '{id}' not found",
        )

    await EnvironmentFileManager.set_secret(config.workspace_path, id, cleaned_key, payload.value)
    return {"success": True, "key": cleaned_key, "is_set": True}


@router.delete("/{id}/secrets/{key}")
async def delete_secret_value(id: str, key: str) -> dict[str, str | bool]:
    """Delete a secret value from the environment secret vault."""
    config = get_config()
    try:
        EnvironmentFileManager.validate_id(id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    cleaned_key = key.strip()
    if not cleaned_key or not VAR_KEY_PATTERN.match(cleaned_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid secret variable key '{key}'. Keys must contain only alphanumeric characters, underscores, hyphens, and dots.",
        )

    deleted = await EnvironmentFileManager.delete_secret(config.workspace_path, id, cleaned_key)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Secret variable '{cleaned_key}' not found in secret vault",
        )

    return {"deleted": True, "key": cleaned_key}
