"""Unit and integration tests for WorkspaceFileManager and filesystem persistence."""

import json
from pathlib import Path

import pytest

from piddi.models.collection import Collection
from piddi.models.request import (
    AuthConfig,
    AuthType,
    BodyType,
    CanonicalRequestModel,
    HTTPMethod,
    KeyValueItem,
    RequestBody,
)
from piddi.storage.file_manager import (
    WorkspaceFileManager,
    generate_collection_id,
    generate_request_id,
)


@pytest.fixture
def temp_workspace(tmp_path: Path) -> Path:
    """Provide an isolated temporary workspace path."""
    return tmp_path / "my_project"


@pytest.mark.asyncio
async def test_ensure_workspace_structure(temp_workspace: Path):
    """Verify .piddi/collections and .piddi/.gitignore are created."""
    collections_dir = WorkspaceFileManager.ensure_workspace_structure(temp_workspace)

    assert collections_dir.exists()
    assert collections_dir.is_dir()
    assert collections_dir == temp_workspace / ".piddi" / "collections"

    gitignore = temp_workspace / ".piddi" / ".gitignore"
    assert gitignore.exists()
    content = gitignore.read_text(encoding="utf-8")
    assert "*.secrets.json" in content
    assert "*.local.json" in content


@pytest.mark.asyncio
async def test_collection_create_save_load(temp_workspace: Path):
    """Verify creating, saving, and loading collections from disk."""
    col_id = generate_collection_id()
    req_id = generate_request_id()

    req = CanonicalRequestModel(
        id=req_id,
        name="Get Users",
        method=HTTPMethod.GET,
        url="http://localhost:8000/users",
        params=[KeyValueItem(key="limit", value="10", enabled=True)],
        headers=[KeyValueItem(key="Accept", value="application/json", enabled=True)],
    )

    collection = Collection(
        id=col_id,
        name="Users API",
        description="Endpoints for user management",
        requests=[req],
    )

    # Save to disk
    saved = await WorkspaceFileManager.save_collection(temp_workspace, collection)
    assert saved.id == col_id

    # Verify file exists on disk
    file_path = temp_workspace / ".piddi" / "collections" / f"{col_id}.json"
    assert file_path.exists()

    # Load via get_collection
    loaded = await WorkspaceFileManager.get_collection(temp_workspace, col_id)
    assert loaded is not None
    assert loaded.id == col_id
    assert loaded.name == "Users API"
    assert len(loaded.requests) == 1
    assert loaded.requests[0].id == req_id
    assert loaded.requests[0].name == "Get Users"
    assert loaded.requests[0].url == "http://localhost:8000/users"


@pytest.mark.asyncio
async def test_deterministic_serialization(temp_workspace: Path):
    """Verify serialized JSON uses fixed key ordering, 2 spaces indentation, and trailing newline."""
    col_id = "col_112233445566"
    req_id = "req_aabbccddeeff"

    collection = Collection(
        id=col_id,
        name="Test API",
        description="Deterministic serialization test",
        requests=[
            CanonicalRequestModel(
                id=req_id,
                name="Echo",
                method=HTTPMethod.POST,
                url="http://localhost:8000/echo",
            )
        ],
    )

    await WorkspaceFileManager.save_collection(temp_workspace, collection)
    file_path = temp_workspace / ".piddi" / "collections" / f"{col_id}.json"
    raw_content = file_path.read_text(encoding="utf-8")

    # Assert trailing newline
    assert raw_content.endswith("\n")

    # Parse and re-dump with indent=2, ensure string match
    parsed = json.loads(raw_content)
    expected = json.dumps(parsed, indent=2, ensure_ascii=False) + "\n"
    assert raw_content == expected


@pytest.mark.asyncio
async def test_known_credentials_sanitization(temp_workspace: Path):
    """
    Verify raw literal credentials in known locations are sanitized to empty string,
    while variable expressions {{var}} are preserved.
    """
    col_id = generate_collection_id()

    # 1. Request with raw literal credentials
    req_literal = CanonicalRequestModel(
        id=generate_request_id(),
        name="Literal Secret",
        method=HTTPMethod.POST,
        url="http://localhost:8000/login",
        auth=AuthConfig(
            type=AuthType.BEARER,
            token="super_secret_raw_jwt_token_12345",
        ),
        headers=[
            KeyValueItem(key="Authorization", value="Bearer literal_secret_bearer"),
            KeyValueItem(key="Proxy-Authorization", value="Basic secret_proxy_hash"),
            KeyValueItem(key="X-Custom", value="safe_custom_value"),
        ],
    )

    # 2. Request with variable template expressions
    req_template = CanonicalRequestModel(
        id=generate_request_id(),
        name="Template Secret",
        method=HTTPMethod.POST,
        url="http://localhost:8000/secure",
        auth=AuthConfig(
            type=AuthType.BEARER,
            token="{{authToken}}",
        ),
        headers=[
            KeyValueItem(key="Authorization", value="Bearer {{authToken}}"),
            KeyValueItem(key="Proxy-Authorization", value="{{proxyToken}}"),
        ],
    )

    # 3. Request with API Key and Basic Auth literal secrets
    req_apikey_basic = CanonicalRequestModel(
        id=generate_request_id(),
        name="Basic & API Key",
        method=HTTPMethod.GET,
        url="http://localhost:8000/data",
        auth=AuthConfig(
            type=AuthType.API_KEY,
            key="X-Api-Key",
            value="raw_api_key_literal",
            placement="header",
        ),
    )

    collection = Collection(
        id=col_id,
        name="Auth Security Test",
        requests=[req_literal, req_template, req_apikey_basic],
    )

    await WorkspaceFileManager.save_collection(temp_workspace, collection)

    # Inspect file directly on disk
    file_path = temp_workspace / ".piddi" / "collections" / f"{col_id}.json"
    data = json.loads(file_path.read_text(encoding="utf-8"))

    # Assert literal Bearer token sanitized to ""
    assert data["requests"][0]["auth"]["token"] == ""
    # Assert literal Authorization and Proxy-Authorization headers sanitized to ""
    assert data["requests"][0]["headers"][0]["value"] == ""
    assert data["requests"][0]["headers"][1]["value"] == ""
    # Non-sensitive header preserved
    assert data["requests"][0]["headers"][2]["value"] == "safe_custom_value"

    # Assert template variable expressions preserved verbatim
    assert data["requests"][1]["auth"]["token"] == "{{authToken}}"
    assert data["requests"][1]["headers"][0]["value"] == "Bearer {{authToken}}"
    assert data["requests"][1]["headers"][1]["value"] == "{{proxyToken}}"

    # Assert API key literal value sanitized to ""
    assert data["requests"][2]["auth"]["key"] == "X-Api-Key"
    assert data["requests"][2]["auth"]["value"] == ""


@pytest.mark.asyncio
async def test_arbitrary_request_body_persisted_verbatim(temp_workspace: Path):
    """
    Verify arbitrary request bodies (JSON, raw text, urlencoded form params)
    are persisted verbatim without heuristic modification.
    """
    col_id = generate_collection_id()

    req_json = CanonicalRequestModel(
        id=generate_request_id(),
        name="JSON Body with password",
        method=HTTPMethod.POST,
        url="http://localhost:8000/auth",
        body=RequestBody(
            type=BodyType.JSON,
            raw='{\n  "username": "admin",\n  "password": "SuperSecretPassword123"\n}',
        ),
    )

    req_raw = CanonicalRequestModel(
        id=generate_request_id(),
        name="Raw text body",
        method=HTTPMethod.POST,
        url="http://localhost:8000/raw",
        body=RequestBody(
            type=BodyType.RAW,
            raw="PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...",
        ),
    )

    req_form = CanonicalRequestModel(
        id=generate_request_id(),
        name="URL-encoded body",
        method=HTTPMethod.POST,
        url="http://localhost:8000/form",
        body=RequestBody(
            type=BodyType.FORM_URLENCODED,
            form_params=[KeyValueItem(key="client_secret", value="secret_form_val", enabled=True)],
        ),
    )

    collection = Collection(
        id=col_id,
        name="Bodies Verbatim Test",
        requests=[req_json, req_raw, req_form],
    )

    await WorkspaceFileManager.save_collection(temp_workspace, collection)

    # Load and inspect disk content
    loaded = await WorkspaceFileManager.get_collection(temp_workspace, col_id)
    assert loaded is not None
    assert "SuperSecretPassword123" in loaded.requests[0].body.raw
    assert "BEGIN RSA PRIVATE KEY" in loaded.requests[1].body.raw
    assert loaded.requests[2].body.form_params[0].value == "secret_form_val"


@pytest.mark.asyncio
async def test_duplicate_collection_id_rejection(temp_workspace: Path):
    """
    Verify that if two files declare the same collection ID:
    - The first in alphabetical order is loaded.
    - The second is rejected with code DUPLICATE_ID.
    - No silent ID mutation occurs.
    """
    collections_dir = WorkspaceFileManager.ensure_workspace_structure(temp_workspace)

    col_data_1 = {
        "schema_version": 1,
        "id": "col_111122223333",
        "name": "First Collection",
        "requests": [],
    }

    col_data_2 = {
        "schema_version": 1,
        "id": "col_111122223333",  # Duplicate ID
        "name": "Second Conflicting Collection",
        "requests": [],
    }

    # Write two files with identical ID
    file_a = collections_dir / "col_a.json"
    file_b = collections_dir / "col_b.json"

    file_a.write_text(json.dumps(col_data_1), encoding="utf-8")
    file_b.write_text(json.dumps(col_data_2), encoding="utf-8")

    summary = await WorkspaceFileManager.load_workspace(temp_workspace)

    # Only 1 collection loaded
    assert len(summary.collections) == 1
    assert summary.collections[0].name == "First Collection"
    assert summary.collections[0].id == "col_111122223333"

    # Conflicting file recorded in errors
    assert len(summary.errors) == 1
    assert summary.errors[0].code == "DUPLICATE_ID"
    assert summary.errors[0].file == "col_b.json"
    assert "Duplicate collection ID 'col_111122223333'" in summary.errors[0].error


@pytest.mark.asyncio
async def test_duplicate_request_id_inside_collection_rejection(temp_workspace: Path):
    """
    Verify that if a collection file contains duplicate request IDs:
    - The file is rejected with code DUPLICATE_REQUEST_ID.
    - No silent mutation or loading is performed.
    """
    collections_dir = WorkspaceFileManager.ensure_workspace_structure(temp_workspace)

    dup_req_id = "req_111122223333"
    col_data = {
        "schema_version": 1,
        "id": "col_444455556666",
        "name": "Duplicate Requests API",
        "requests": [
            {"id": dup_req_id, "name": "Req 1", "method": "GET", "url": "http://a"},
            {"id": dup_req_id, "name": "Req 2", "method": "POST", "url": "http://b"},
        ],
    }

    file_path = collections_dir / "col_dup_reqs.json"
    file_path.write_text(json.dumps(col_data), encoding="utf-8")

    summary = await WorkspaceFileManager.load_workspace(temp_workspace)

    assert len(summary.collections) == 0
    assert len(summary.errors) == 1
    assert summary.errors[0].code == "DUPLICATE_REQUEST_ID"
    assert summary.errors[0].file == "col_dup_reqs.json"


@pytest.mark.asyncio
async def test_malformed_json_and_schema_version_handling(temp_workspace: Path):
    """
    Verify corrupted JSON and unsupported schema versions are reported cleanly in errors
    without crashing the workspace loader.
    """
    collections_dir = WorkspaceFileManager.ensure_workspace_structure(temp_workspace)

    # 1. Valid collection
    valid_col = Collection(
        id="col_aaaaaaaaaaaa",
        name="Valid API",
        requests=[],
    )
    await WorkspaceFileManager.save_collection(temp_workspace, valid_col)

    # 2. Malformed JSON file
    (collections_dir / "broken.json").write_text("{ unclosed json", encoding="utf-8")

    # 3. Unsupported schema version file
    (collections_dir / "future_ver.json").write_text(
        json.dumps({"schema_version": 99, "id": "col_bbbbbbbbbbbb", "name": "Future API"}),
        encoding="utf-8",
    )

    # 4. Invalid schema (missing required name)
    (collections_dir / "invalid_schema.json").write_text(
        json.dumps({"schema_version": 1, "id": "col_cccccccccccc"}),
        encoding="utf-8",
    )

    summary = await WorkspaceFileManager.load_workspace(temp_workspace)

    # Valid collection loaded
    assert len(summary.collections) == 1
    assert summary.collections[0].name == "Valid API"

    # 3 structured errors captured
    error_codes = {e.code for e in summary.errors}
    assert "MALFORMED_JSON" in error_codes
    assert "UNSUPPORTED_VERSION" in error_codes
    assert "INVALID_SCHEMA" in error_codes


@pytest.mark.asyncio
async def test_path_traversal_prevention(temp_workspace: Path):
    """Verify path traversal attempts in collection IDs are rejected."""
    WorkspaceFileManager.ensure_workspace_structure(temp_workspace)

    # 1. Path traversal ID attempts
    traversal_ids = [
        "../escape",
        "..\\escape",
        "col/subfolder",
        "col\\subfolder",
        "col\0nullbyte",
        "../../etc/passwd",
    ]

    for bad_id in traversal_ids:
        with pytest.raises(ValueError):
            WorkspaceFileManager.get_collection_path(temp_workspace, bad_id)


@pytest.mark.asyncio
async def test_delete_collection(temp_workspace: Path):
    """Verify deleting a collection unlinks its file from disk."""
    col_id = generate_collection_id()
    col = Collection(id=col_id, name="To Delete", requests=[])
    await WorkspaceFileManager.save_collection(temp_workspace, col)

    file_path = temp_workspace / ".piddi" / "collections" / f"{col_id}.json"
    assert file_path.exists()

    deleted = await WorkspaceFileManager.delete_collection(temp_workspace, col_id)
    assert deleted is True
    assert not file_path.exists()

    # Deleting nonexistent collection returns False
    deleted_again = await WorkspaceFileManager.delete_collection(temp_workspace, col_id)
    assert deleted_again is False
