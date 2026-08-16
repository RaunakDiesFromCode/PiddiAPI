"""Main FastAPI application definition and lifespan handler."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from piddi.config import get_config
from piddi.engine.dispatcher import get_client_manager
from piddi.routers.collections import router as collections_router
from piddi.routers.environments import router as environments_router
from piddi.routers.execute import router as execute_router
from piddi.routers.history import router as history_router
from piddi.routers.preferences import router as preferences_router
from piddi.routers.workspace import router as workspace_router
from piddi.security.middleware import LoopbackSecurityMiddleware
from piddi.storage.file_manager import WorkspaceFileManager
from piddi.storage.history import get_history_manager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycles."""
    config = get_config()
    # Ensure temporary and local config directories exist
    config.temp_dir.mkdir(parents=True, exist_ok=True)
    WorkspaceFileManager.ensure_workspace_structure(config.workspace_path)
    from piddi.storage.environment_manager import EnvironmentFileManager

    EnvironmentFileManager.ensure_environments_structure(config.workspace_path)
    get_history_manager().ensure_history_structure()
    yield
    # Shutdown: Flush pending history tasks and close HTTPX client connection pool cleanly
    await get_history_manager().flush_pending_tasks(timeout=3.0)
    client_manager = get_client_manager()
    await client_manager.close()


def create_app() -> FastAPI:
    """Create and configure the FastAPI engine application instance."""
    config = get_config()

    app = FastAPI(
        title="PiddiAPI Engine",
        version="0.1.0",
        docs_url="/api/docs" if config.debug else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if config.debug else None,
        lifespan=lifespan,
    )

    # Allowed loopback origins for CORS
    allowed_origins = [
        f"http://127.0.0.1:{config.port}",
        f"http://localhost:{config.port}",
        "http://127.0.0.1",
        "http://localhost",
        "http://testserver",
    ]
    if config.debug:
        allowed_origins.extend(["http://127.0.0.1:5173", "http://localhost:5173"])

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Security middleware: Token, Host, and Origin enforcement
    app.add_middleware(LoopbackSecurityMiddleware)

    # Register API routers
    app.include_router(workspace_router)
    app.include_router(collections_router)
    app.include_router(environments_router)
    app.include_router(preferences_router)
    app.include_router(history_router)
    app.include_router(execute_router)

    # Static file serving & deterministic runtime token injection
    from fastapi.responses import HTMLResponse
    from fastapi.staticfiles import StaticFiles

    from piddi.paths import get_static_dir

    static_dir = get_static_dir()
    if (static_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/", response_class=HTMLResponse)
    async def serve_index() -> HTMLResponse:
        index_file = static_dir / "index.html"
        if index_file.exists():
            html_content = index_file.read_text(encoding="utf-8")
            cfg = get_config()
            import re

            injected_html = re.sub(
                r'<meta\s+name="piddi-token"\s+content="[^"]*"\s*/?>',
                f'<meta name="piddi-token" content="{cfg.session_token}">',
                html_content,
            )
            return HTMLResponse(content=injected_html, status_code=200)
        return HTMLResponse(
            content="""<!DOCTYPE html>
<html>
<head><title>PiddiAPI Engine</title></head>
<body style="font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem;">
  <h2>PiddiAPI Engine Online</h2>
  <p>Status: Healthy (127.0.0.1)</p>
  <p>Frontend static assets not built yet. Run Vite development server on port 5173.</p>
</body>
</html>""",
            status_code=200,
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "code": "INTERNAL_SERVER_ERROR",
                "message": f"Unhandled server exception: {exc}",
            },
        )

    return app


app = create_app()
