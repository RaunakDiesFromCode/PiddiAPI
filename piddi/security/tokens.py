"""Session token generation and validation."""

import hmac
import secrets


def generate_session_token() -> str:
    """Generate a 32-byte (64-character hex) cryptographically secure session token."""
    return secrets.token_hex(32)


def validate_session_token(provided_token: str | None, expected_token: str) -> bool:
    """Validate a provided session token against the expected token in constant time."""
    if not provided_token or not expected_token:
        return False
    return hmac.compare_digest(provided_token.strip(), expected_token.strip())
