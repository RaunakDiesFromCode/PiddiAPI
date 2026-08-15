"""API Routers package for PiddiAPI."""

from piddi.routers.collections import router as collections_router
from piddi.routers.environments import router as environments_router
from piddi.routers.execute import router as execute_router
from piddi.routers.history import router as history_router
from piddi.routers.preferences import router as preferences_router
from piddi.routers.workspace import router as workspace_router

__all__ = [
    "collections_router",
    "environments_router",
    "execute_router",
    "history_router",
    "preferences_router",
    "workspace_router",
]
