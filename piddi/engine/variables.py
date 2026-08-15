"""Dynamic variable interpolation and template resolver."""

import datetime
import random
import re
import time
import uuid

from piddi.models.request import AuthConfig, CanonicalRequestModel, KeyValueItem, RequestBody

VAR_REGEX = re.compile(r"\{\{([^{}]+)\}\}")


class VariableResolver:
    """Resolves template variables with precedence and dynamic generators."""

    @staticmethod
    def generate_dynamic(name: str) -> str | None:
        """Generate value for built-in dynamic variables."""
        if name == "$uuid":
            return str(uuid.uuid4())
        if name == "$timestamp":
            return str(int(time.time()))
        if name == "$isoDate":
            utc_now = datetime.datetime.now(datetime.timezone.utc)
            # Format to YYYY-MM-DDTHH:MM:SS.fffZ
            return utc_now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        if name == "$randomInt":
            return str(random.randint(1000, 999999))
        return None

    @classmethod
    def interpolate_string(
        cls,
        template: str,
        context: dict[str, str] | None = None,
        max_depth: int = 3,
    ) -> str:
        """Interpolate dynamic generators and context variables with recursion depth guard."""
        if not template or not isinstance(template, str):
            return template

        ctx = context or {}
        current = template

        for _ in range(max_depth):
            matches = list(VAR_REGEX.finditer(current))
            if not matches:
                break

            changed = False

            def replacer(match: re.Match) -> str:
                nonlocal changed
                var_name = match.group(1).strip()

                # 1. Dynamic generators (highest precedence)
                dynamic_val = cls.generate_dynamic(var_name)
                if dynamic_val is not None:
                    changed = True
                    return dynamic_val

                # 2. Context variables (secrets > env > collection)
                if var_name in ctx:
                    changed = True
                    return str(ctx[var_name])

                # 3. Missing variables: leave intact
                return match.group(0)

            new_text = VAR_REGEX.sub(replacer, current)
            if not changed or new_text == current:
                break
            current = new_text

        return current

    @classmethod
    def build_context(
        cls,
        collection_vars: dict[str, str] | None = None,
        env_vars: dict[str, str] | None = None,
        secret_vars: dict[str, str] | None = None,
    ) -> dict[str, str]:
        """Build merged variable dictionary according to precedence rules:

        Secrets > Environment > Collection.
        """
        merged: dict[str, str] = {}
        if collection_vars:
            merged.update(collection_vars)
        if env_vars:
            merged.update(env_vars)
        if secret_vars:
            merged.update(secret_vars)
        return merged


def _interpolate_key_value_list(
    items: list[KeyValueItem], context: dict[str, str] | None
) -> list[KeyValueItem]:
    result = []
    for item in items:
        result.append(
            KeyValueItem(
                key=VariableResolver.interpolate_string(item.key, context),
                value=VariableResolver.interpolate_string(item.value, context),
                enabled=item.enabled,
                description=item.description,
                type=item.type,
            )
        )
    return result


def interpolate_request(
    request: CanonicalRequestModel,
    context: dict[str, str] | None = None,
) -> CanonicalRequestModel:
    """Return a new CanonicalRequestModel with all fields interpolated."""
    # 1. Interpolate URL
    url = VariableResolver.interpolate_string(request.url, context)

    # 2. Interpolate Params and Headers
    params = _interpolate_key_value_list(request.params, context)
    headers = _interpolate_key_value_list(request.headers, context)

    # 3. Interpolate Auth
    auth = AuthConfig(
        type=request.auth.type,
        token=(
            VariableResolver.interpolate_string(request.auth.token, context)
            if request.auth.token is not None
            else None
        ),
        username=(
            VariableResolver.interpolate_string(request.auth.username, context)
            if request.auth.username is not None
            else None
        ),
        password=(
            VariableResolver.interpolate_string(request.auth.password, context)
            if request.auth.password is not None
            else None
        ),
        key=(
            VariableResolver.interpolate_string(request.auth.key, context)
            if request.auth.key is not None
            else None
        ),
        value=(
            VariableResolver.interpolate_string(request.auth.value, context)
            if request.auth.value is not None
            else None
        ),
        placement=request.auth.placement,
    )

    # 4. Interpolate Body
    body = RequestBody(
        type=request.body.type,
        raw=VariableResolver.interpolate_string(request.body.raw, context),
        form_params=_interpolate_key_value_list(request.body.form_params, context),
    )

    # Return copy with interpolated components
    return CanonicalRequestModel(
        id=request.id,
        name=request.name,
        method=request.method,
        url=url,
        params=params,
        headers=headers,
        auth=auth,
        body=body,
        settings=request.settings.model_copy(),
        environment_id=request.environment_id,
    )
