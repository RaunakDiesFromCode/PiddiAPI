"""Security and loopback defense-in-depth test suite."""

import httpx
import pytest

from piddi.config import AppConfig


@pytest.mark.asyncio
async def test_valid_token_valid_origin_allowed(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Valid session token with trusted Origin succeeds."""
    headers = {
        "x-piddi-token": test_config.session_token,
        "origin": f"http://127.0.0.1:{test_config.port}",
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"
    assert data["port"] == test_config.port


@pytest.mark.asyncio
async def test_valid_token_missing_origin_allowed(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Valid session token without Origin header (direct CLI/test client) succeeds."""
    headers = {
        "x-piddi-token": test_config.session_token,
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_invalid_token_valid_origin_rejected(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Invalid session token with valid Origin is rejected with 401 Unauthorized."""
    headers = {
        "x-piddi-token": "wrong-token-abc12345",
        "origin": f"http://127.0.0.1:{test_config.port}",
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHORIZED_LOOPBACK"


@pytest.mark.asyncio
async def test_missing_token_valid_origin_rejected(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Missing session token with valid Origin is rejected with 401 Unauthorized."""
    headers = {
        "origin": f"http://127.0.0.1:{test_config.port}",
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHORIZED_LOOPBACK"


@pytest.mark.asyncio
async def test_invalid_token_missing_origin_rejected(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Missing or invalid token with no Origin header is rejected with 401 Unauthorized."""
    headers = {
        "x-piddi-token": "unauthorized-attacker-token",
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHORIZED_LOOPBACK"


@pytest.mark.asyncio
async def test_invalid_host_valid_token_rejected(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """DNS-rebinding attempt (evil Host header) with valid token is rejected with 403 Forbidden."""
    headers = {
        "host": "evil-rebinding-domain.com",
        "x-piddi-token": test_config.session_token,
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN_HOST"


@pytest.mark.asyncio
async def test_invalid_host_invalid_token_rejected(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """DNS-rebinding attempt (evil Host header) with invalid token is rejected with 403 Forbidden."""
    headers = {
        "host": "attacker.xyz",
        "x-piddi-token": "bad-token",
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN_HOST"


@pytest.mark.asyncio
async def test_invalid_origin_valid_token_rejected(
    app_client: httpx.AsyncClient, test_config: AppConfig
) -> None:
    """Drive-by SSRF from evil website (untrusted Origin) is rejected with 403 Forbidden."""
    headers = {
        "origin": "https://malicious-website.com",
        "x-piddi-token": test_config.session_token,
    }
    res = await app_client.get("/api/health", headers=headers)
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN_ORIGIN"
