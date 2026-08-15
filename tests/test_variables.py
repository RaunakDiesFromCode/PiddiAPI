"""Tests for the variable interpolation engine and dynamic generators."""

import datetime
import time
import uuid

from piddi.engine.variables import VariableResolver, interpolate_request
from piddi.models.request import (
    AuthConfig,
    AuthType,
    BodyType,
    CanonicalRequestModel,
    KeyValueItem,
    RequestBody,
)


def test_dynamic_generators() -> None:
    """Verify built-in dynamic generators generate correct formats."""
    # 1. $uuid
    uuid_str = VariableResolver.interpolate_string("{{$uuid}}")
    parsed_uuid = uuid.UUID(uuid_str)
    assert parsed_uuid.version == 4

    # 2. $timestamp
    ts_str = VariableResolver.interpolate_string("{{$timestamp}}")
    ts_int = int(ts_str)
    assert abs(ts_int - int(time.time())) < 5

    # 3. $isoDate
    iso_str = VariableResolver.interpolate_string("{{$isoDate}}")
    assert iso_str.endswith("Z")
    # Verify parseable as ISO datetime
    dt = datetime.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    assert dt.year >= 2026

    # 4. $randomInt
    rnd_str = VariableResolver.interpolate_string("{{$randomInt}}")
    rnd_val = int(rnd_str)
    assert 1000 <= rnd_val <= 999999


def test_variable_interpolation_precedence() -> None:
    """Verify dynamic generators > secrets > environment > collection precedence."""
    # Dynamic generator precedence
    context = {"$uuid": "fake-uuid-not-used"}
    res = VariableResolver.interpolate_string("{{$uuid}}", context)
    assert res != "fake-uuid-not-used"
    assert uuid.UUID(res).version == 4

    # Precedence context merging: secrets > env > collection
    col_vars = {"baseUrl": "http://collection.com", "apiKey": "col-key", "tag": "prod"}
    env_vars = {"baseUrl": "http://staging.com", "apiKey": "env-key"}
    sec_vars = {"apiKey": "super-secret-key"}

    merged = VariableResolver.build_context(
        collection_vars=col_vars, env_vars=env_vars, secret_vars=sec_vars
    )
    assert merged["tag"] == "prod"
    assert merged["baseUrl"] == "http://staging.com"
    assert merged["apiKey"] == "super-secret-key"

    resolved = VariableResolver.interpolate_string("{{baseUrl}}/v1?key={{apiKey}}", merged)
    assert resolved == "http://staging.com/v1?key=super-secret-key"


def test_variable_interpolation_in_all_fields() -> None:
    """Verify interpolation across URL, params, headers, auth, and body."""
    context = {
        "host": "127.0.0.1",
        "port": "8000",
        "filterKey": "status",
        "filterVal": "active",
        "authHdr": "X-API-Custom",
        "authVal": "secret123",
        "user": "alice",
        "pwd": "password123",
        "name": "Bob",
    }

    req = CanonicalRequestModel(
        url="http://{{host}}:{{port}}/api/users",
        params=[KeyValueItem(key="{{filterKey}}", value="{{filterVal}}")],
        headers=[KeyValueItem(key="{{authHdr}}", value="{{authVal}}")],
        auth=AuthConfig(
            type=AuthType.BASIC,
            username="{{user}}",
            password="{{pwd}}",
        ),
        body=RequestBody(
            type=BodyType.JSON,
            raw='{"name": "{{name}}"}',
            form_params=[KeyValueItem(key="field_{{user}}", value="val_{{name}}")],
        ),
    )

    interpolated = interpolate_request(req, context)

    assert interpolated.url == "http://127.0.0.1:8000/api/users"
    assert interpolated.params[0].key == "status"
    assert interpolated.params[0].value == "active"
    assert interpolated.headers[0].key == "X-API-Custom"
    assert interpolated.headers[0].value == "secret123"
    assert interpolated.auth.username == "alice"
    assert interpolated.auth.password == "password123"
    assert interpolated.body.raw == '{"name": "Bob"}'
    assert interpolated.body.form_params[0].key == "field_alice"
    assert interpolated.body.form_params[0].value == "val_Bob"


def test_missing_variable_leaves_literal() -> None:
    """Verify unknown variables remain untouched as literal string."""
    text = "http://api.com/{{unknownVar}}/item/{{alsoMissing}}"
    resolved = VariableResolver.interpolate_string(text, {"known": "val"})
    assert resolved == "http://api.com/{{unknownVar}}/item/{{alsoMissing}}"


def test_variable_recursion_depth_limit() -> None:
    """Verify multi-hop chained variables resolve and circular variables terminate cleanly."""
    # Multi-hop chained variables (up to depth 3)
    chain_ctx = {
        "a": "{{b}}",
        "b": "{{c}}",
        "c": "finished",
    }
    res = VariableResolver.interpolate_string("{{a}}", chain_ctx, max_depth=3)
    assert res == "finished"

    # Circular recursion
    circular_ctx = {
        "a": "{{b}}",
        "b": "{{a}}",
    }
    # Should not infinite loop or crash
    circ_res = VariableResolver.interpolate_string("{{a}}", circular_ctx, max_depth=3)
    assert circ_res in ("{{a}}", "{{b}}")
