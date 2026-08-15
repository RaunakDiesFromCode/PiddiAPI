"""History storage manager and HistorySanitizer for PiddiAPI."""

import asyncio
import json
import logging
import os
import re
from collections.abc import Sequence
from pathlib import Path
from typing import ClassVar
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import aiofiles
from pydantic import ValidationError

from piddi.models.history import HistoryRecord
from piddi.models.request import AuthType, CanonicalRequestModel
from piddi.models.response import CanonicalResponseModel

logger = logging.getLogger("piddi.history")

TEMPLATE_PATTERN = re.compile(r"\{\{.+?\}\}")


class HistorySanitizer:
    """Deterministic sanitizer for request history snapshots.

    Adheres strictly to the project security invariant:
    - Known sensitive locations (auth headers, API keys, sensitive query params) -> sanitized to [REDACTED]
    - Template expressions (e.g. {{authToken}}) -> preserved verbatim
    - Arbitrary request body -> opaque/verbatim
    """

    SENSITIVE_HEADERS: ClassVar[set[str]] = {
        "authorization",
        "proxy_authorization",
        "proxy-authorization",
        "x_api_key",
        "x-api-key",
        "x_auth_token",
        "x-auth-token",
        "x_access_token",
        "x-access-token",
        "x_api_token",
        "x-api-token",
        "auth_token",
        "auth-token",
        "cookie",
        "set_cookie",
        "set-cookie",
    }

    SENSITIVE_PARAMS: ClassVar[set[str]] = {
        "api_key",
        "apikey",
        "api-key",
        "access_token",
        "access-token",
        "auth_token",
        "auth-token",
        "authorization",
        "token",
        "secret",
        "password",
        "client_secret",
        "client-secret",
    }

    @classmethod
    def is_templated(cls, value: str | None) -> bool:
        """Check if a string contains variable template expressions like {{var}}."""
        if not value:
            return False
        return bool(TEMPLATE_PATTERN.search(value))

    @classmethod
    def sanitize_header_value(cls, key: str, value: str) -> str:
        """Sanitize a header value if the key matches known sensitive headers."""
        norm_key = key.strip().lower()
        if (
            (
                norm_key in cls.SENSITIVE_HEADERS
                or norm_key.replace("-", "_") in cls.SENSITIVE_HEADERS
            )
            and not cls.is_templated(value)
            and value.strip()
        ):
            return "[REDACTED]"
        return value

    @classmethod
    def sanitize_query_param_value(cls, key: str, value: str) -> str:
        """Sanitize a query parameter value if the key matches known sensitive parameters."""
        norm_key = key.strip().lower()
        if (
            (norm_key in cls.SENSITIVE_PARAMS or norm_key.replace("-", "_") in cls.SENSITIVE_PARAMS)
            and not cls.is_templated(value)
            and value.strip()
        ):
            return "[REDACTED]"
        return value

    @classmethod
    def sanitize_url(cls, url: str) -> str:
        """Sanitize sensitive query parameters embedded in the URL string."""
        if not url or "?" not in url:
            return url

        parsed = urlsplit(url)
        if not parsed.query:
            return url

        query_tuples = parse_qsl(parsed.query, keep_blank_values=True)
        sanitized_tuples: list[tuple[str, str]] = []
        for k, v in query_tuples:
            sanitized_val = cls.sanitize_query_param_value(k, v)
            sanitized_tuples.append((k, sanitized_val))

        new_query = urlencode(sanitized_tuples, safe="{}")
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))

    @classmethod
    def sanitize_request(cls, request: CanonicalRequestModel) -> CanonicalRequestModel:
        """Construct a sanitized deep copy of a canonical request model for history persistence."""
        snapshot = request.model_copy(deep=True)

        # 1. Sanitize URL query parameters
        snapshot.url = cls.sanitize_url(snapshot.url)

        # 2. Sanitize request.params items
        for param in snapshot.params:
            if (
                param.key.strip().lower() in cls.SENSITIVE_PARAMS
                and not cls.is_templated(param.value)
                and param.value.strip()
            ):
                param.value = "[REDACTED]"

        # 3. Sanitize request.headers items
        for header in snapshot.headers:
            if (
                header.key.strip().lower() in cls.SENSITIVE_HEADERS
                and not cls.is_templated(header.value)
                and header.value.strip()
            ):
                header.value = "[REDACTED]"

        # 4. Sanitize AuthConfig
        if snapshot.auth.type == AuthType.BEARER:
            if snapshot.auth.token and not cls.is_templated(snapshot.auth.token):
                snapshot.auth.token = "[REDACTED]"
        elif snapshot.auth.type == AuthType.BASIC:
            if snapshot.auth.password and not cls.is_templated(snapshot.auth.password):
                snapshot.auth.password = "[REDACTED]"
        elif (
            snapshot.auth.type == AuthType.API_KEY
            and snapshot.auth.value
            and not cls.is_templated(snapshot.auth.value)
        ):
            snapshot.auth.value = "[REDACTED]"

        # 5. Request body is preserved opaque and verbatim
        return snapshot


class HistoryManager:
    """Application-lifetime service managing the circular JSONL history persistence."""

    MAX_ENTRIES: int = 200
    PRUNE_THRESHOLD: int = 250

    def __init__(self, history_file_path: Path | None = None) -> None:
        self.history_file_path = (
            history_file_path or (Path.home() / ".piddi" / "history.jsonl")
        ).resolve()
        self._lock = asyncio.Lock()
        self._pending_tasks: set[asyncio.Task[None]] = set()

    def ensure_history_structure(self) -> None:
        """Ensure the ~/.piddi directory exists."""
        self.history_file_path.parent.mkdir(parents=True, exist_ok=True)

    async def append_record(self, record: HistoryRecord) -> None:
        """Append a single HistoryRecord to the JSONL history file with circular pruning."""
        self.ensure_history_structure()
        record_json = record.model_dump_json()

        async with self._lock:
            async with aiofiles.open(self.history_file_path, "a", encoding="utf-8") as f:
                await f.write(f"{record_json}\n")

            await self._prune_if_needed()

    async def _prune_if_needed(self) -> None:
        """Prune history file to newest 200 records if count exceeds 250 records."""
        if not self.history_file_path.exists():
            return

        async with aiofiles.open(self.history_file_path, "r", encoding="utf-8") as f:
            lines = await f.readlines()

        if len(lines) > self.PRUNE_THRESHOLD:
            pruned_lines = lines[-self.MAX_ENTRIES :]
            temp_file = self.history_file_path.with_suffix(".tmp")
            async with aiofiles.open(temp_file, "w", encoding="utf-8") as f:
                await f.writelines(pruned_lines)
            os.replace(temp_file, self.history_file_path)

    async def get_history(self, limit: int = 200) -> list[HistoryRecord]:
        """Read history records in reverse chronological order (newest first).

        Corrupted or unparseable lines are skipped silently without crashing.
        """
        if not self.history_file_path.exists():
            return []

        records: list[HistoryRecord] = []
        async with self._lock:
            try:
                async with aiofiles.open(self.history_file_path, "r", encoding="utf-8") as f:
                    lines = await f.readlines()
            except OSError as e:
                logger.warning("Failed to read history file: %s", e)
                return []

        # Parse valid lines in reverse order
        for line in reversed(lines):
            line_str = line.strip()
            if not line_str:
                continue
            try:
                data = json.loads(line_str)
                record = HistoryRecord.model_validate(data)
                records.append(record)
                if len(records) >= limit:
                    break
            except (json.JSONDecodeError, ValidationError, ValueError, TypeError):
                # Silently skip corrupted lines per specification
                continue

        return records

    async def clear_history(self) -> bool:
        """Clear all history records by truncating the history file."""
        self.ensure_history_structure()
        async with self._lock:
            temp_file = self.history_file_path.with_suffix(".tmp")
            async with aiofiles.open(temp_file, "w", encoding="utf-8") as f:
                await f.write("")
            os.replace(temp_file, self.history_file_path)
        return True

    def schedule_record(
        self,
        sanitized_snapshot: CanonicalRequestModel,
        response: CanonicalResponseModel,
    ) -> asyncio.Task[None]:
        """Schedule non-blocking asynchronous recording of an executed request.

        Maintains task references so that normal application shutdown can flush pending writes.
        """
        record = HistoryRecord(
            method=sanitized_snapshot.method,
            url=sanitized_snapshot.url,
            status=response.status,
            duration_ms=response.duration_ms,
            size_bytes=response.size_bytes,
            request_snapshot=sanitized_snapshot,
        )

        task = asyncio.create_task(self._safe_append(record))
        self._pending_tasks.add(task)
        task.add_done_callback(self._pending_tasks.discard)
        return task

    async def _safe_append(self, record: HistoryRecord) -> None:
        """Internal worker wrapping append_record in defensive failure isolation."""
        try:
            await self.append_record(record)
        except Exception as exc:  # noqa: BLE001
            logger.warning("History persistence failed: %s", exc)

    async def flush_pending_tasks(self, timeout: float = 3.0) -> None:
        """Await all pending history writes during application shutdown with bounded timeout."""
        if not self._pending_tasks:
            return

        tasks: Sequence[asyncio.Task[None]] = list(self._pending_tasks)
        try:
            _done, pending = await asyncio.wait(tasks, timeout=timeout)
            for t in pending:
                t.cancel()

        except Exception as exc:  # noqa: BLE001
            logger.warning("Error flushing pending history tasks on shutdown: %s", exc)


_history_manager_instance: HistoryManager | None = None


def get_history_manager(history_file_path: Path | None = None) -> HistoryManager:
    """Get or initialize the application-lifetime HistoryManager singleton."""
    global _history_manager_instance
    if _history_manager_instance is None or history_file_path is not None:
        if history_file_path is not None:
            _history_manager_instance = HistoryManager(history_file_path)
        elif _history_manager_instance is None:
            _history_manager_instance = HistoryManager()
    return _history_manager_instance


def set_history_manager(manager: HistoryManager | None) -> None:
    """Override the HistoryManager singleton (used for testing fixtures)."""
    global _history_manager_instance
    _history_manager_instance = manager
