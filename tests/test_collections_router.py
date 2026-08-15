"""Integration tests for collections and workspace REST API routes."""

from pathlib import Path

import httpx
import pytest

from piddi.config import AppConfig


@pytest.fixture
def workspace_with_config(tmp_path: Path, test_config: AppConfig) -> Path:
    """Set the test config workspace path to an isolated directory."""
    ws = tmp_path / "api_workspace"
    test_config.workspace_path = ws
    return ws


@pytest.mark.asyncio
async def test_workspace_router_endpoints(
    app_client: httpx.AsyncClient, test_config: AppConfig, workspace_with_config: Path
):
    """Test full collection CRUD and request management via REST endpoints."""
    headers = {"X-Piddi-Token": test_config.session_token}

    # 1. GET /api/workspace (initially empty)
    res = await app_client.get("/api/workspace", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["workspace_path"] == str(workspace_with_config.resolve())
    assert data["collections"] == []
    assert data["errors"] == []

    # 2. POST /api/collections (create collection)
    create_res = await app_client.post(
        "/api/collections",
        headers=headers,
        json={"name": "Auth API", "description": "Login and tokens"},
    )
    assert create_res.status_code == 201
    created_col = create_res.json()
    assert created_col["name"] == "Auth API"
    assert created_col["description"] == "Login and tokens"
    col_id = created_col["id"]
    assert col_id.startswith("col_")

    # 3. GET /api/collections (list collections)
    list_res = await app_client.get("/api/collections", headers=headers)
    assert list_res.status_code == 200
    cols = list_res.json()
    assert len(cols) == 1
    assert cols[0]["id"] == col_id

    # 4. POST /api/collections/{id}/requests (add request to collection)
    add_req_res = await app_client.post(
        f"/api/collections/{col_id}/requests",
        headers=headers,
        json={
            "name": "Login Request",
            "method": "POST",
            "url": "http://localhost:8000/api/login",
            "body": {
                "type": "json",
                "raw": '{"user": "admin"}',
                "form_params": [],
            },
        },
    )
    assert add_req_res.status_code == 201
    col_with_req = add_req_res.json()
    assert len(col_with_req["requests"]) == 1
    req_id = col_with_req["requests"][0]["id"]
    assert req_id.startswith("req_")

    # 5. PUT /api/collections/{id}/requests/{req_id} (update request)
    update_req_res = await app_client.put(
        f"/api/collections/{col_id}/requests/{req_id}",
        headers=headers,
        json={
            "id": req_id,
            "name": "Updated Login",
            "method": "POST",
            "url": "http://localhost:8000/api/v2/login",
        },
    )
    assert update_req_res.status_code == 200
    updated_col = update_req_res.json()
    assert updated_col["requests"][0]["name"] == "Updated Login"
    assert updated_col["requests"][0]["url"] == "http://localhost:8000/api/v2/login"

    # 6. PUT /api/collections/{id} (rename collection)
    rename_res = await app_client.put(
        f"/api/collections/{col_id}",
        headers=headers,
        json={
            "id": col_id,
            "name": "Renamed Auth API",
            "description": "Updated description",
            "requests": updated_col["requests"],
        },
    )
    assert rename_res.status_code == 200
    assert rename_res.json()["name"] == "Renamed Auth API"

    # 7. DELETE /api/collections/{id}/requests/{req_id} (delete request)
    del_req_res = await app_client.delete(
        f"/api/collections/{col_id}/requests/{req_id}",
        headers=headers,
    )
    assert del_req_res.status_code == 200
    assert len(del_req_res.json()["requests"]) == 0

    # 8. DELETE /api/collections/{id} (delete collection)
    del_col_res = await app_client.delete(f"/api/collections/{col_id}", headers=headers)
    assert del_col_res.status_code == 200
    assert del_col_res.json() == {"deleted": True, "id": col_id}

    # 9. GET /api/collections/{id} should now return 404
    get_res = await app_client.get(f"/api/collections/{col_id}", headers=headers)
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_collections_security_token_enforcement(
    app_client: httpx.AsyncClient, test_config: AppConfig
):
    """Verify requests without valid X-Piddi-Token receive 401 Unauthorized."""
    # Unauthenticated GET
    res = await app_client.get("/api/collections")
    assert res.status_code == 401

    # Unauthenticated POST
    res = await app_client.post("/api/collections", json={"name": "Hacked"})
    assert res.status_code == 401

    # Unauthenticated GET workspace
    res = await app_client.get("/api/workspace")
    assert res.status_code == 401
