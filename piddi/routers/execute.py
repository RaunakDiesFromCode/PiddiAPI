"""Request execution API endpoint."""

from fastapi import APIRouter

from piddi.config import get_config
from piddi.engine.dispatcher import execute_request
from piddi.engine.variables import VariableResolver
from piddi.models.request import CanonicalRequestModel
from piddi.models.response import CanonicalResponseModel
from piddi.storage.environment_manager import EnvironmentFileManager
from piddi.storage.history import HistorySanitizer, get_history_manager
from piddi.storage.preferences_manager import PreferencesManager

router = APIRouter(prefix="/api", tags=["execution"])


@router.post("/execute", response_model=CanonicalResponseModel)
async def execute_http_request(
    request: CanonicalRequestModel,
) -> CanonicalResponseModel:
    """Execute an HTTP request with variable resolution and return the canonical response.

    Environment selection precedence:
    1. Explicit request.environment_id (if present)
    2. Global active_environment_id from ~/.piddi/preferences.json
    3. No environment
    """
    # 1. Create a sanitized request snapshot for history BEFORE variable resolution
    sanitized_snapshot = HistorySanitizer.sanitize_request(request)

    config = get_config()

    # 2. Determine target environment ID
    target_env_id = request.environment_id
    if not target_env_id:
        prefs = await PreferencesManager.load_preferences()
        target_env_id = prefs.active_environment_id

    env_vars: dict[str, str] = {}
    secret_vars: dict[str, str] = {}

    if target_env_id:
        env_vars, secret_vars = await EnvironmentFileManager.get_environment_context(
            config.workspace_path, target_env_id
        )

    # 3. Build merged resolution context
    context = VariableResolver.build_context(
        env_vars=env_vars,
        secret_vars=secret_vars,
    )

    # 4. Dispatch request
    response = await execute_request(request, variables=context)

    # 5. Schedule non-blocking async history persistence
    get_history_manager().schedule_record(sanitized_snapshot, response)

    return response
