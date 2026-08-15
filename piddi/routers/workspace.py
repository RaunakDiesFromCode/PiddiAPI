"""Workspace and health check router."""

from fastapi import APIRouter
from pydantic import BaseModel

import piddi
from piddi.config import get_config
from piddi.models.collection import WorkspaceSummary
from piddi.storage.file_manager import WorkspaceFileManager

router = APIRouter(prefix="/api", tags=["workspace"])


class HealthResponse(BaseModel):
    """Health check response schema."""

    status: str
    version: str
    workspace_path: str
    port: int


class BootstrapResponse(BaseModel):
    """Internal development bootstrap response schema."""

    token: str
    workspace_path: str
    port: int


@router.get("/workspace", response_model=WorkspaceSummary)
async def get_workspace() -> WorkspaceSummary:
    """Load and return the complete workspace collections and file error diagnostics."""
    config = get_config()
    summary = await WorkspaceFileManager.load_workspace(config.workspace_path)
    return summary


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Verify backend status and active session metadata."""
    config = get_config()
    return HealthResponse(
        status="ok",
        version=piddi.__version__,
        workspace_path=str(config.workspace_path),
        port=config.port,
    )


@router.get("/bootstrap", response_model=BootstrapResponse)
async def dev_bootstrap() -> BootstrapResponse:
    """Internal development-only bootstrap endpoint for Vite dev server."""
    config = get_config()
    if not config.debug:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Not Found")

    return BootstrapResponse(
        token=config.session_token,
        workspace_path=str(config.workspace_path),
        port=config.port,
    )
