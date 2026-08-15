"""Tests for environment and secrets vault filesystem persistence layer."""

import os
import stat
from pathlib import Path

import pytest
from pydantic import ValidationError

from piddi.models.environment import (
    Environment,
    EnvironmentVariableDefinition,
)
from piddi.storage.environment_manager import (
    EnvironmentFileManager,
    generate_environment_id,
)


@pytest.mark.asyncio
async def test_create_and_load_environment(tmp_path: Path) -> None:
    """Verify creating public environment definitions and reading back from disk."""
    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="Development",
        description="Dev environment",
        variables=[
            EnvironmentVariableDefinition(
                key="baseUrl",
                value="http://localhost:8000",
                enabled=True,
                is_secret=False,
                description="Server base URL",
            ),
            EnvironmentVariableDefinition(
                key="apiKey",
                value=None,
                enabled=True,
                is_secret=True,
                description="API secret key",
            ),
        ],
    )

    saved = await EnvironmentFileManager.save_environment(tmp_path, env)
    assert saved.id == env_id

    # Verify public file exists and has value: null for secret
    env_file = EnvironmentFileManager.get_environment_path(tmp_path, env_id)
    assert env_file.exists()
    content = env_file.read_text(encoding="utf-8")
    assert '"baseUrl"' in content
    assert '"http://localhost:8000"' in content
    assert '"apiKey"' in content
    assert '"value": null' in content

    # Load back
    loaded_envs, _errors = await EnvironmentFileManager.load_environments(tmp_path)
    assert len(loaded_envs) == 1

    assert loaded_envs[0].name == "Development"
    assert len(loaded_envs[0].variables) == 2
    assert loaded_envs[0].variables[0].key == "baseUrl"
    assert loaded_envs[0].variables[0].value == "http://localhost:8000"
    assert loaded_envs[0].variables[1].key == "apiKey"
    assert loaded_envs[0].variables[1].value is None


@pytest.mark.asyncio
async def test_secrets_isolation_split(tmp_path: Path) -> None:
    """Verify secret values are saved to .secrets.json with 0o600 mode and not in public json."""
    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="Production",
        variables=[
            EnvironmentVariableDefinition(
                key="host",
                value="https://api.prod.com",
                enabled=True,
                is_secret=False,
            ),
            EnvironmentVariableDefinition(
                key="masterKey",
                value=None,
                enabled=True,
                is_secret=True,
            ),
        ],
    )
    await EnvironmentFileManager.save_environment(tmp_path, env)
    await EnvironmentFileManager.set_secret(
        tmp_path, env_id, "masterKey", "super_secret_production_key"
    )

    # Verify secrets file exists
    secrets_file = EnvironmentFileManager.get_secrets_path(tmp_path, env_id)
    assert secrets_file.exists()
    sec_content = secrets_file.read_text(encoding="utf-8")
    assert "super_secret_production_key" in sec_content

    # Verify POSIX file permissions if on POSIX
    if os.name == "posix":
        mode = stat.S_IMODE(secrets_file.stat().st_mode)
        assert mode == 0o600

    # Verify public environment file does NOT contain the secret
    env_file = EnvironmentFileManager.get_environment_path(tmp_path, env_id)
    pub_content = env_file.read_text(encoding="utf-8")
    assert "super_secret_production_key" not in pub_content

    # Verify secret retrieval
    retrieved = await EnvironmentFileManager.get_secret(tmp_path, env_id, "masterKey")
    assert retrieved == "super_secret_production_key"


def test_secret_variable_with_public_value_rejected() -> None:
    """Verify schema enforces that is_secret=True variables cannot have a non-empty public value."""
    with pytest.raises(ValidationError) as exc:
        EnvironmentVariableDefinition(
            key="apiKey",
            value="RAW_SECRET_VALUE",
            is_secret=True,
        )
    assert "Secret variable 'apiKey' cannot have a public value" in str(exc.value)


@pytest.mark.asyncio
async def test_secret_to_plain_transition_prevents_leakage(tmp_path: Path) -> None:
    """Verify changing is_secret=True to False deletes key from .secrets.json and does NOT promote secret value."""
    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="Staging",
        variables=[
            EnvironmentVariableDefinition(
                key="token",
                value=None,
                enabled=True,
                is_secret=True,
            )
        ],
    )
    await EnvironmentFileManager.save_environment(tmp_path, env)
    await EnvironmentFileManager.set_secret(tmp_path, env_id, "token", "stg_secret_123")

    # Now user switches is_secret to False with plain value "public_token"
    updated_env = Environment(
        id=env_id,
        name="Staging",
        variables=[
            EnvironmentVariableDefinition(
                key="token",
                value="public_token",
                enabled=True,
                is_secret=False,
            )
        ],
    )
    await EnvironmentFileManager.save_environment(tmp_path, updated_env)

    # Verify secret was pruned from .secrets.json
    sec_val = await EnvironmentFileManager.get_secret(tmp_path, env_id, "token")
    assert sec_val is None

    # Verify public file has only "public_token" and not "stg_secret_123"
    env_file = EnvironmentFileManager.get_environment_path(tmp_path, env_id)
    pub_content = env_file.read_text(encoding="utf-8")
    assert "stg_secret_123" not in pub_content
    assert "public_token" in pub_content


def test_duplicate_variable_keys_rejected() -> None:
    """Verify duplicate variable keys inside an environment raise validation error."""
    with pytest.raises(ValidationError) as exc:
        Environment(
            id=generate_environment_id(),
            name="Dev",
            variables=[
                EnvironmentVariableDefinition(key="baseUrl", value="http://a", is_secret=False),
                EnvironmentVariableDefinition(key="baseUrl", value="http://b", is_secret=False),
            ],
        )
    assert "Duplicate variable key 'baseUrl'" in str(exc.value)


@pytest.mark.asyncio
async def test_missing_secrets_file_handled_gracefully(tmp_path: Path) -> None:
    """Verify environment loads without crash when .secrets.json is missing, reporting diagnostic error."""
    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="Dev Missing Secrets",
        variables=[
            EnvironmentVariableDefinition(
                key="apiKey",
                value=None,
                enabled=True,
                is_secret=True,
            )
        ],
    )
    await EnvironmentFileManager.save_environment(tmp_path, env)

    envs, errors = await EnvironmentFileManager.load_environments(tmp_path)
    assert len(envs) == 1
    assert any(e.code == "MISSING_SECRET_VALUE" for e in errors)


@pytest.mark.asyncio
async def test_delete_environment_removes_both_files(tmp_path: Path) -> None:
    """Verify deleting environment removes both env_<id>.json and env_<id>.secrets.json."""
    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="To Delete",
        variables=[
            EnvironmentVariableDefinition(
                key="secretKey",
                value=None,
                enabled=True,
                is_secret=True,
            )
        ],
    )
    await EnvironmentFileManager.save_environment(tmp_path, env)
    await EnvironmentFileManager.set_secret(tmp_path, env_id, "secretKey", "val123")

    env_path = EnvironmentFileManager.get_environment_path(tmp_path, env_id)
    sec_path = EnvironmentFileManager.get_secrets_path(tmp_path, env_id)
    assert env_path.exists()
    assert sec_path.exists()

    deleted = await EnvironmentFileManager.delete_environment(tmp_path, env_id)
    assert deleted is True
    assert not env_path.exists()
    assert not sec_path.exists()


@pytest.mark.asyncio
async def test_path_traversal_rejection(tmp_path: Path) -> None:
    """Verify path traversal in environment ID is rejected."""
    with pytest.raises(ValueError):
        EnvironmentFileManager.get_environment_path(tmp_path, "../malicious")

    with pytest.raises(ValueError):
        EnvironmentFileManager.get_secrets_path(tmp_path, "env_../../etc/passwd")


@pytest.mark.asyncio
async def test_concurrent_secret_mutations_preserve_all_keys(tmp_path: Path) -> None:
    """Verify 10 concurrent secret mutations against the same environment serialize safely without losing keys."""
    import asyncio

    env_id = generate_environment_id()
    env = Environment(
        id=env_id,
        name="Concurrency Test",
        variables=[
            EnvironmentVariableDefinition(
                key=f"sec_key_{i}",
                value=None,
                enabled=True,
                is_secret=True,
            )
            for i in range(10)
        ],
    )
    await EnvironmentFileManager.save_environment(tmp_path, env)

    # Launch 10 concurrent secret writes
    tasks = [
        EnvironmentFileManager.set_secret(tmp_path, env_id, f"sec_key_{i}", f"value_{i}")
        for i in range(10)
    ]
    await asyncio.gather(*tasks)

    # Verify all 10 keys survive in secrets vault
    for i in range(10):
        val = await EnvironmentFileManager.get_secret(tmp_path, env_id, f"sec_key_{i}")
        assert val == f"value_{i}", f"Expected key sec_key_{i} to have value_{i}, got {val}"


@pytest.mark.asyncio
async def test_secret_file_permissions_0600_at_creation_and_update(tmp_path: Path) -> None:
    """Verify secret file is created and updated with POSIX 0o600 mode permissions."""
    env_id = generate_environment_id()
    await EnvironmentFileManager.set_secret(tmp_path, env_id, "testKey", "initial_val")

    secrets_file = EnvironmentFileManager.get_secrets_path(tmp_path, env_id)
    assert secrets_file.exists()

    if os.name == "posix":
        mode = stat.S_IMODE(secrets_file.stat().st_mode)
        assert mode == 0o600

    # Update again and verify mode remains 0o600
    await EnvironmentFileManager.set_secret(tmp_path, env_id, "testKey2", "second_val")
    if os.name == "posix":
        mode_after = stat.S_IMODE(secrets_file.stat().st_mode)
        assert mode_after == 0o600


@pytest.mark.asyncio
async def test_failed_atomic_write_cleans_up_temporary_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify that if an atomic write encounters an error, the temporary file is unlinked."""
    target_file = tmp_path / "test_target.json"

    # Simulate an error during json dump or os.replace
    def failing_replace(src: Path, dst: Path) -> None:
        raise OSError("Simulated disk replacement error")

    monkeypatch.setattr(os, "replace", failing_replace)

    with pytest.raises(OSError, match="Simulated disk replacement error"):
        await EnvironmentFileManager.atomic_write_json(target_file, {"test": "data"})

    # Verify no temporary files remain in directory
    temp_files = list(tmp_path.glob(".*.tmp_*"))
    assert len(temp_files) == 0


@pytest.mark.asyncio
async def test_ensure_environments_structure_gitignore_content(tmp_path: Path) -> None:
    """Verify .piddi/.gitignore is initialized and updated with all secret/temp patterns."""
    EnvironmentFileManager.ensure_environments_structure(tmp_path)
    gitignore = tmp_path / ".piddi" / ".gitignore"
    assert gitignore.exists()

    content = gitignore.read_text(encoding="utf-8")
    assert "*.secrets.json" in content
    assert "*.local.json" in content
    assert ".*.tmp*" in content
    assert ".tmp*" in content
