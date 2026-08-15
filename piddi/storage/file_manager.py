"""Filesystem persistence manager for PiddiAPI collections and workspaces."""

import json
import logging
import os
import re
import secrets
from pathlib import Path

import aiofiles
from pydantic import ValidationError

from piddi.models.collection import Collection, WorkspaceFileError, WorkspaceSummary
from piddi.models.request import AuthType, CanonicalRequestModel

logger = logging.getLogger("piddi.storage")

ID_SAFE_REGEX = re.compile(r"^[a-zA-Z0-9_-]+$")
TEMPLATE_VAR_REGEX = re.compile(r"\{\{[^{}]+\}\}")
SENSITIVE_HEADER_NAMES = {"authorization", "proxy-authorization"}


def generate_collection_id() -> str:
    """Generate a stable, opaque collection identifier."""
    return f"col_{secrets.token_hex(6)}"


def generate_request_id() -> str:
    """Generate a stable, opaque request identifier."""
    return f"req_{secrets.token_hex(6)}"


def is_template_variable(value: str | None) -> bool:
    """Check if a string contains a template variable expression (e.g. {{authToken}} or Bearer {{token}})."""
    if not value or not isinstance(value, str):
        return False
    return TEMPLATE_VAR_REGEX.search(value) is not None


def sanitize_request_for_persistence(request: CanonicalRequestModel) -> CanonicalRequestModel:
    """
    Sanitize known credential locations in a request before saving to Git-tracked JSON.

    Known credential locations sanitized:
    - AuthConfig.token (Bearer)
    - AuthConfig.password (Basic)
    - AuthConfig.value (API Key)
    - Authorization and Proxy-Authorization headers

    Variable template expressions (e.g. {{token}}) and arbitrary request bodies
    are preserved verbatim.
    """
    data = request.model_dump()

    # 1. Sanitize AuthConfig
    auth = data.get("auth") or {}
    auth_type = auth.get("type", AuthType.NONE)

    if auth_type == AuthType.BEARER or auth_type == "bearer":
        token = auth.get("token")
        if token and not is_template_variable(token):
            auth["token"] = ""
    elif auth_type == AuthType.BASIC or auth_type == "basic":
        password = auth.get("password")
        if password and not is_template_variable(password):
            auth["password"] = ""
    elif auth_type == AuthType.API_KEY or auth_type == "apikey":
        value = auth.get("value")
        if value and not is_template_variable(value):
            auth["value"] = ""

    data["auth"] = auth

    # 2. Sanitize sensitive headers (Authorization, Proxy-Authorization)
    headers = data.get("headers") or []
    for h in headers:
        header_key = (h.get("key") or "").strip().lower()
        if header_key in SENSITIVE_HEADER_NAMES:
            val = h.get("value")
            if val and not is_template_variable(val):
                h["value"] = ""

    data["headers"] = headers

    # Request bodies (raw, form_params) are preserved verbatim as per Phase 3 spec
    return CanonicalRequestModel.model_validate(data)


class WorkspaceFileManager:
    """Manages reading, writing, and validating collections in .piddi/."""

    @staticmethod
    def validate_id(identifier: str) -> None:
        """Validate that an ID contains only safe alphanumeric, dash, and underscore characters."""
        if not identifier or not ID_SAFE_REGEX.match(identifier):
            raise ValueError(
                f"Invalid identifier '{identifier}'. IDs must only contain letters, digits, underscores, or hyphens."
            )

    @classmethod
    def get_collections_dir(cls, workspace_path: Path) -> Path:
        """Get the collections directory path for a workspace."""
        return workspace_path.resolve() / ".piddi" / "collections"

    @classmethod
    def get_collection_path(cls, workspace_path: Path, collection_id: str) -> Path:
        """
        Derive the safe file path for a collection ID and ensure path containment.
        Rejects path traversal attempts.
        """
        cls.validate_id(collection_id)
        collections_dir = cls.get_collections_dir(workspace_path)
        target_path = (collections_dir / f"{collection_id}.json").resolve()

        # Path traversal guard: target must reside within collections_dir
        if not target_path.is_relative_to(collections_dir.resolve()):
            raise ValueError(f"Path traversal detected for collection ID '{collection_id}'")

        return target_path

    @classmethod
    def ensure_workspace_structure(cls, workspace_path: Path) -> Path:
        """
        Ensure .piddi/ and .piddi/collections/ exist, and create .piddi/.gitignore if missing.
        """
        ws_resolved = workspace_path.resolve()
        piddi_dir = ws_resolved / ".piddi"
        collections_dir = piddi_dir / "collections"
        collections_dir.mkdir(parents=True, exist_ok=True)

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

        return collections_dir

    @classmethod
    async def atomic_write_json(cls, filepath: Path, data: dict) -> None:
        """
        Atomically write JSON data to filepath using temp-file replace semantics.
        Guarantees atomic file replacement and kernel flush before rename.
        """
        filepath.parent.mkdir(parents=True, exist_ok=True)
        temp_file = filepath.with_name(f".{filepath.name}.tmp_{os.getpid()}_{secrets.token_hex(4)}")

        try:
            content = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
            async with aiofiles.open(temp_file, "w", encoding="utf-8") as f:
                await f.write(content)
                await f.flush()
                # Explicit flush to file descriptor if supported
                try:
                    os.fsync(f.fileno())
                except (AttributeError, OSError, ValueError):
                    pass

            os.replace(temp_file, filepath)
        except Exception:
            if temp_file.exists():
                try:
                    temp_file.unlink(missing_ok=True)
                except OSError:
                    pass
            raise

    @classmethod
    async def load_workspace(cls, workspace_path: Path) -> WorkspaceSummary:
        """
        Scan and load all collection files from .piddi/collections/.
        Isolates corrupted or invalid files into structured WorkspaceFileError diagnostics.
        """
        collections_dir = cls.ensure_workspace_structure(workspace_path)
        collections: list[Collection] = []
        errors: list[WorkspaceFileError] = []
        seen_collection_ids: set[str] = set()

        # Deterministic alphabetical file scanning
        json_files = sorted(collections_dir.glob("*.json"))

        for file_path in json_files:
            filename = file_path.name
            # Skip hidden files or temporary files
            if filename.startswith(".") or ".tmp" in filename:
                continue

            try:
                async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                    raw_content = await f.read()
            except (OSError, UnicodeDecodeError) as e:
                errors.append(
                    WorkspaceFileError(
                        file=filename,
                        error=f"Could not read file: {e}",
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
                        error=f"Invalid JSON syntax: {e}",
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
                        error=f"File requires schema version {schema_version}, but engine only supports version 1.",
                        code="UNSUPPORTED_VERSION",
                    )
                )
                continue

            try:
                collection = Collection.model_validate(data)
            except ValidationError as e:
                errors.append(
                    WorkspaceFileError(
                        file=filename,
                        error=f"Invalid collection schema: {e}",
                        code="INVALID_SCHEMA",
                    )
                )
                continue

            # Check 1: Duplicate Collection ID across files
            if collection.id in seen_collection_ids:
                errors.append(
                    WorkspaceFileError(
                        file=filename,
                        error=f"Duplicate collection ID '{collection.id}' conflicts with an earlier loaded collection",
                        code="DUPLICATE_ID",
                    )
                )
                continue

            # Check 2: Duplicate Request IDs within collection
            req_ids = [r.id for r in collection.requests if r.id]
            if len(req_ids) != len(set(req_ids)):
                errors.append(
                    WorkspaceFileError(
                        file=filename,
                        error=f"Collection '{collection.name}' contains duplicate request IDs",
                        code="DUPLICATE_REQUEST_ID",
                    )
                )
                continue

            seen_collection_ids.add(collection.id)

            # Sanitize requests on load to guarantee clean in-memory state
            sanitized_requests = [
                sanitize_request_for_persistence(req) for req in collection.requests
            ]
            collection.requests = sanitized_requests
            collections.append(collection)

        # Deterministically sort collections by name (case-insensitive)
        collections.sort(key=lambda c: c.name.lower())

        # Load environments and environment errors
        from piddi.storage.environment_manager import EnvironmentFileManager

        environments, env_errors = await EnvironmentFileManager.load_environments(workspace_path)
        errors.extend(env_errors)

        return WorkspaceSummary(
            workspace_path=str(workspace_path.resolve()),
            collections=collections,
            environments=environments,
            errors=errors,
        )

    @classmethod
    async def get_collection(cls, workspace_path: Path, collection_id: str) -> Collection | None:
        """Load a single collection by ID."""
        try:
            file_path = cls.get_collection_path(workspace_path, collection_id)
        except ValueError:
            return None

        if not file_path.exists() or not file_path.is_file():
            return None

        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
            raw_content = await f.read()

        try:
            data = json.loads(raw_content)
            collection = Collection.model_validate(data)
            collection.requests = [
                sanitize_request_for_persistence(req) for req in collection.requests
            ]
            return collection
        except (OSError, json.JSONDecodeError, ValidationError):
            return None

    @classmethod
    async def save_collection(cls, workspace_path: Path, collection: Collection) -> Collection:
        """
        Save a collection to .piddi/collections/col_<id>.json.
        Applies secret sanitization to known credential locations and atomic write semantics.
        """
        cls.ensure_workspace_structure(workspace_path)
        file_path = cls.get_collection_path(workspace_path, collection.id)

        # Check for duplicate request IDs before saving
        req_ids = [r.id for r in collection.requests if r.id]
        if len(req_ids) != len(set(req_ids)):
            raise ValueError(f"Collection '{collection.name}' contains duplicate request IDs")

        # Assign IDs to requests lacking an ID
        for req in collection.requests:
            if not req.id:
                req.id = generate_request_id()

        # Sanitize known credentials
        sanitized_requests = [sanitize_request_for_persistence(req) for req in collection.requests]
        collection.requests = sanitized_requests

        data = collection.model_dump()
        await cls.atomic_write_json(file_path, data)
        return collection

    @classmethod
    async def delete_collection(cls, workspace_path: Path, collection_id: str) -> bool:
        """Delete a collection file from .piddi/collections/."""
        try:
            file_path = cls.get_collection_path(workspace_path, collection_id)
        except ValueError:
            return False

        if file_path.exists() and file_path.is_file():
            file_path.unlink()
            return True
        return False
