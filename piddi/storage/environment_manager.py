"""Filesystem persistence manager for PiddiAPI environments and local secret vaults."""

import asyncio
import json
import logging
import os
import re
import secrets
import stat
from pathlib import Path
from typing import ClassVar

import aiofiles
from pydantic import ValidationError

from piddi.models.collection import WorkspaceFileError
from piddi.models.environment import (
    Environment,
    EnvironmentSecrets,
)

logger = logging.getLogger("piddi.storage.environment")

ID_SAFE_REGEX = re.compile(r"^[a-zA-Z0-9_-]+$")


def generate_environment_id() -> str:
    """Generate a stable, opaque environment identifier."""
    return f"env_{secrets.token_hex(6)}"


class EnvironmentFileManager:
    """Manages reading, writing, validating, and isolating environments and secrets in .piddi/environments/."""

    _locks: ClassVar[dict[str, asyncio.Lock]] = {}

    @classmethod
    def _get_lock(cls, env_id: str) -> asyncio.Lock:
        """Get or create an asyncio.Lock for the specified environment ID to serialize mutations."""
        if env_id not in cls._locks:
            cls._locks[env_id] = asyncio.Lock()
        return cls._locks[env_id]

    @staticmethod
    def validate_id(identifier: str) -> None:
        """Validate that an ID contains only safe alphanumeric, dash, and underscore characters."""
        if not identifier or not ID_SAFE_REGEX.match(identifier):
            raise ValueError(
                f"Invalid identifier '{identifier}'. IDs must only contain letters, digits, underscores, or hyphens."
            )

    @classmethod
    def get_environments_dir(cls, workspace_path: Path) -> Path:
        """Get the environments directory path for a workspace."""
        return workspace_path.resolve() / ".piddi" / "environments"

    @classmethod
    def get_environment_path(cls, workspace_path: Path, env_id: str) -> Path:
        """Derive the safe file path for an environment definition and ensure path containment."""
        cls.validate_id(env_id)
        environments_dir = cls.get_environments_dir(workspace_path)
        target_path = (environments_dir / f"{env_id}.json").resolve()

        if not target_path.is_relative_to(environments_dir.resolve()):
            raise ValueError(f"Path traversal detected for environment ID '{env_id}'")

        return target_path

    @classmethod
    def get_secrets_path(cls, workspace_path: Path, env_id: str) -> Path:
        """Derive the safe file path for an environment secret vault and ensure path containment."""
        cls.validate_id(env_id)
        environments_dir = cls.get_environments_dir(workspace_path)
        target_path = (environments_dir / f"{env_id}.secrets.json").resolve()

        if not target_path.is_relative_to(environments_dir.resolve()):
            raise ValueError(f"Path traversal detected for environment secrets ID '{env_id}'")

        return target_path

    @classmethod
    def ensure_environments_structure(cls, workspace_path: Path) -> Path:
        """Ensure .piddi/ and .piddi/environments/ exist, and create/update .piddi/.gitignore."""
        ws_resolved = workspace_path.resolve()
        piddi_dir = ws_resolved / ".piddi"
        environments_dir = piddi_dir / "environments"
        environments_dir.mkdir(parents=True, exist_ok=True)

        gitignore_path = piddi_dir / ".gitignore"
        content = (
            "# PiddiAPI Local Secrets (Never commit credentials to Git)\n"
            "*.secrets.json\n"
            "*.local.json\n"
            ".*.tmp*\n"
            ".tmp*\n"
        )
        if not gitignore_path.exists():
            gitignore_path.write_text(content, encoding="utf-8")
        else:
            try:
                current_text = gitignore_path.read_text(encoding="utf-8")
                missing_entries = []
                for entry in ["*.secrets.json", "*.local.json", ".*.tmp*", ".tmp*"]:
                    if entry not in current_text:
                        missing_entries.append(entry)
                if missing_entries:
                    updated_text = current_text.rstrip() + "\n" + "\n".join(missing_entries) + "\n"
                    gitignore_path.write_text(updated_text, encoding="utf-8")
            except OSError:
                pass

        return environments_dir

    @classmethod
    async def atomic_write_json(cls, filepath: Path, data: dict, mode: int | None = None) -> None:
        """Atomically write JSON data to filepath using temp-file replace semantics.

        Optionally enforces POSIX file permission mode (e.g. 0o600 for secrets) right at creation.
        """
        filepath.parent.mkdir(parents=True, exist_ok=True)
        temp_file = filepath.with_name(f".{filepath.name}.tmp_{os.getpid()}_{secrets.token_hex(4)}")

        try:
            content = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
            flags = os.O_CREAT | os.O_WRONLY | os.O_TRUNC
            target_mode = mode if mode is not None else 0o666
            fd = os.open(str(temp_file), flags, target_mode)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(content)
                    f.flush()
                    try:
                        os.fsync(f.fileno())
                    except (AttributeError, OSError, ValueError):
                        pass
            except Exception:
                try:
                    os.close(fd)
                except OSError:
                    pass
                raise

            if mode is not None:
                try:
                    os.chmod(temp_file, mode)
                except (AttributeError, OSError):
                    pass

            os.replace(temp_file, filepath)

            if mode is not None:
                try:
                    os.chmod(filepath, mode)
                except (AttributeError, OSError):
                    pass
        except Exception:
            if temp_file.exists():
                try:
                    temp_file.unlink(missing_ok=True)
                except OSError:
                    pass
            raise

    @classmethod
    async def load_environments(
        cls, workspace_path: Path
    ) -> tuple[list[Environment], list[WorkspaceFileError]]:
        """Scan and load all environment definition files from .piddi/environments/.

        Returns public environment definitions (secrets masked/omitted) and structured diagnostics.
        """
        environments_dir = cls.ensure_environments_structure(workspace_path)
        environments: list[Environment] = []
        errors: list[WorkspaceFileError] = []
        seen_env_ids: set[str] = set()

        json_files = sorted(environments_dir.glob("*.json"))

        for file_path in json_files:
            filename = file_path.name
            # Skip secret vault files, hidden files, or temporary files
            if filename.endswith(".secrets.json") or filename.startswith(".") or ".tmp" in filename:
                continue

            try:
                async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                    raw_content = await f.read()
            except (OSError, UnicodeDecodeError) as e:
                errors.append(
                    WorkspaceFileError(
                        file=filename,
                        error=f"Could not read environment file: {e}",
                        code="FILE_READ_ERROR",
                    )
                )
                continue

            try:
                data = json.loads(raw_content)
            except json.JSONDecodeError as e:
                errors.append(
                    WorkspaceFileError(
                        file=filename,
                        error=f"Invalid JSON syntax in environment file: {e}",
                        code="MALFORMED_JSON",
                    )
                )
                continue

            if not isinstance(data, dict):
                errors.append(
                    WorkspaceFileError(
                        file=filename,
                        error="Root JSON value must be an object",
                        code="INVALID_SCHEMA",
                    )
                )
                continue

            schema_version = data.get("schema_version", 1)
            if schema_version > 1:
                errors.append(
                    WorkspaceFileError(
                        file=filename,
                        error=f"Environment requires schema version {schema_version}, but engine only supports version 1.",
                        code="UNSUPPORTED_VERSION",
                    )
                )
                continue

            try:
                env = Environment.model_validate(data)
            except ValidationError as e:
                errors.append(
                    WorkspaceFileError(
                        file=filename,
                        error=f"Invalid environment schema: {e}",
                        code="INVALID_SCHEMA",
                    )
                )
                continue

            if env.id in seen_env_ids:
                errors.append(
                    WorkspaceFileError(
                        file=filename,
                        error=f"Duplicate environment ID '{env.id}' conflicts with an earlier loaded environment",
                        code="DUPLICATE_ID",
                    )
                )
                continue

            seen_env_ids.add(env.id)

            # Check corresponding secrets file diagnostics
            secrets_path = cls.get_secrets_path(workspace_path, env.id)
            secret_keys_declared = [v.key for v in env.variables if v.is_secret]

            if secret_keys_declared:
                if not secrets_path.exists():
                    for sec_key in secret_keys_declared:
                        errors.append(
                            WorkspaceFileError(
                                file=f"{env.id}.secrets.json",
                                error=f"Secret variable '{sec_key}' defined in environment '{env.name}' but secret vault file is missing",
                                code="MISSING_SECRET_VALUE",
                            )
                        )
                else:
                    try:
                        async with aiofiles.open(secrets_path, "r", encoding="utf-8") as sf:
                            sec_raw = await sf.read()
                        sec_data = json.loads(sec_raw)
                        sec_vals = sec_data.get("values", {}) if isinstance(sec_data, dict) else {}
                        for sec_key in secret_keys_declared:
                            if sec_key not in sec_vals:
                                errors.append(
                                    WorkspaceFileError(
                                        file=f"{env.id}.secrets.json",
                                        error=f"Secret variable '{sec_key}' defined in environment '{env.name}' but not found in secrets vault",
                                        code="MISSING_SECRET_VALUE",
                                    )
                                )
                    except (OSError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
                        errors.append(
                            WorkspaceFileError(
                                file=f"{env.id}.secrets.json",
                                error=f"Invalid or unreadable secrets file: {e}",
                                code="MALFORMED_JSON",
                            )
                        )

            # Ensure all secret variable definitions have value=None in memory
            for v in env.variables:
                if v.is_secret:
                    v.value = None

            environments.append(env)

        environments.sort(key=lambda e: e.name.lower())
        return environments, errors

    @classmethod
    async def get_environment(cls, workspace_path: Path, env_id: str) -> Environment | None:
        """Load a single environment definition by ID (secrets omitted)."""
        try:
            file_path = cls.get_environment_path(workspace_path, env_id)
        except ValueError:
            return None

        if not file_path.exists() or not file_path.is_file():
            return None

        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
            raw_content = await f.read()

        try:
            data = json.loads(raw_content)
            env = Environment.model_validate(data)
            for v in env.variables:
                if v.is_secret:
                    v.value = None
            return env
        except (OSError, json.JSONDecodeError, ValidationError):
            return None

    @classmethod
    async def save_environment(cls, workspace_path: Path, env: Environment) -> Environment:
        """Save public environment definition to .piddi/environments/env_<id>.json.

        Strictly guarantees that secret variables have value=None.
        Cleans up any secrets in .secrets.json that were converted to plain variables.
        Mutations are serialized via per-environment lock.
        """
        cls.ensure_environments_structure(workspace_path)
        file_path = cls.get_environment_path(workspace_path, env.id)

        # Enforce invariant: secret variables must have value=None
        for v in env.variables:
            if v.is_secret:
                v.value = None

        async with cls._get_lock(env.id):
            # Clean up secrets file if variables converted to plain or removed
            secrets_path = cls.get_secrets_path(workspace_path, env.id)
            if secrets_path.exists():
                try:
                    async with aiofiles.open(secrets_path, "r", encoding="utf-8") as sf:
                        sec_raw = await sf.read()
                    sec_data = json.loads(sec_raw)
                    if isinstance(sec_data, dict) and "values" in sec_data:
                        current_secret_keys = {v.key for v in env.variables if v.is_secret}
                        old_values = dict(sec_data.get("values", {}))
                        pruned_values = {
                            k: v for k, v in old_values.items() if k in current_secret_keys
                        }
                        if pruned_values != old_values:
                            sec_data["values"] = pruned_values
                            await cls.atomic_write_json(
                                secrets_path, sec_data, mode=stat.S_IRUSR | stat.S_IWUSR
                            )
                except (OSError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
                    logger.warning(f"Failed to prune stale secrets for environment {env.id}: {e}")

            data = env.model_dump()
            await cls.atomic_write_json(file_path, data)
            return env

    @classmethod
    async def delete_environment(cls, workspace_path: Path, env_id: str) -> bool:
        """Delete an environment definition and its secret vault."""
        cls.validate_id(env_id)
        async with cls._get_lock(env_id):
            deleted = False
            try:
                file_path = cls.get_environment_path(workspace_path, env_id)
                if file_path.exists() and file_path.is_file():
                    file_path.unlink()
                    deleted = True
            except ValueError:
                pass

            try:
                secrets_path = cls.get_secrets_path(workspace_path, env_id)
                if secrets_path.exists() and secrets_path.is_file():
                    secrets_path.unlink()
            except ValueError:
                pass

            return deleted

    @classmethod
    async def get_secret(cls, workspace_path: Path, env_id: str, key: str) -> str | None:
        """Retrieve a specific secret value for an environment."""
        cls.validate_id(env_id)
        secrets_path = cls.get_secrets_path(workspace_path, env_id)
        if not secrets_path.exists() or not secrets_path.is_file():
            return None

        try:
            async with aiofiles.open(secrets_path, "r", encoding="utf-8") as f:
                raw_content = await f.read()
            data = json.loads(raw_content)
            if isinstance(data, dict):
                values = data.get("values", {})
                if isinstance(values, dict) and key in values:
                    return str(values[key])
        except (OSError, json.JSONDecodeError, UnicodeDecodeError, ValueError):
            return None

        return None

    @classmethod
    async def set_secret(cls, workspace_path: Path, env_id: str, key: str, value: str) -> None:
        """Set or update a single secret value in .piddi/environments/env_<id>.secrets.json.

        Written with POSIX 0o600 mode permissions and protected by per-environment lock.
        """
        cls.validate_id(env_id)
        cls.ensure_environments_structure(workspace_path)
        secrets_path = cls.get_secrets_path(workspace_path, env_id)

        async with cls._get_lock(env_id):
            sec_model = EnvironmentSecrets(environment_id=env_id, values={})
            if secrets_path.exists() and secrets_path.is_file():
                try:
                    async with aiofiles.open(secrets_path, "r", encoding="utf-8") as f:
                        raw_content = await f.read()
                    data = json.loads(raw_content)
                    if isinstance(data, dict):
                        sec_model = EnvironmentSecrets.model_validate(data)
                except (
                    OSError,
                    json.JSONDecodeError,
                    UnicodeDecodeError,
                    ValidationError,
                    ValueError,
                ):
                    sec_model = EnvironmentSecrets(environment_id=env_id, values={})

            sec_model.values[key] = value
            await cls.atomic_write_json(
                secrets_path,
                sec_model.model_dump(),
                mode=stat.S_IRUSR | stat.S_IWUSR,  # 0o600
            )

    @classmethod
    async def delete_secret(cls, workspace_path: Path, env_id: str, key: str) -> bool:
        """Delete a secret key from .piddi/environments/env_<id>.secrets.json."""
        cls.validate_id(env_id)
        secrets_path = cls.get_secrets_path(workspace_path, env_id)
        if not secrets_path.exists() or not secrets_path.is_file():
            return False

        async with cls._get_lock(env_id):
            if not secrets_path.exists() or not secrets_path.is_file():
                return False

            try:
                async with aiofiles.open(secrets_path, "r", encoding="utf-8") as f:
                    raw_content = await f.read()
                data = json.loads(raw_content)
                if isinstance(data, dict) and "values" in data:
                    values = dict(data.get("values", {}))
                    if key in values:
                        del values[key]
                        data["values"] = values
                        await cls.atomic_write_json(
                            secrets_path, data, mode=stat.S_IRUSR | stat.S_IWUSR
                        )
                        return True
            except (OSError, json.JSONDecodeError, UnicodeDecodeError, ValueError):
                return False

        return False

    @classmethod
    async def get_environment_context(
        cls, workspace_path: Path, env_id: str
    ) -> tuple[dict[str, str], dict[str, str]]:
        """Get enabled (env_vars, secret_vars) for a given environment ID for request interpolation."""
        env = await cls.get_environment(workspace_path, env_id)
        if not env:
            return {}, {}

        env_vars: dict[str, str] = {}
        secret_vars: dict[str, str] = {}

        # Plain variables
        for v in env.variables:
            if v.enabled and not v.is_secret and v.value is not None:
                env_vars[v.key] = str(v.value)

        # Secret variables
        secret_keys = [v.key for v in env.variables if v.enabled and v.is_secret]
        if secret_keys:
            secrets_path = cls.get_secrets_path(workspace_path, env_id)
            if secrets_path.exists() and secrets_path.is_file():
                try:
                    async with aiofiles.open(secrets_path, "r", encoding="utf-8") as f:
                        raw_content = await f.read()
                    sec_data = json.loads(raw_content)
                    if isinstance(sec_data, dict):
                        vals = sec_data.get("values", {})
                        if isinstance(vals, dict):
                            for k in secret_keys:
                                if k in vals:
                                    secret_vars[k] = str(vals[k])
                except (OSError, json.JSONDecodeError, UnicodeDecodeError, ValueError):
                    pass

        return env_vars, secret_vars
