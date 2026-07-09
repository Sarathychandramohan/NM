"""
Google OAuth ID Token verification service.

Usage:
    from app.services.google_auth import verify_google_id_token
    idinfo = verify_google_id_token(id_token_string)
    # idinfo contains: sub (google_id), email, name, picture, email_verified

NOTE-MANUAL: Set GOOGLE_CLIENT_ID in your .env file.
             Get it from: https://console.cloud.google.com -> APIs & Services -> Credentials
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def verify_google_id_token(token: str, client_id: Optional[str] = None) -> dict:
    """
    Verify a Google ID token and return the decoded payload.

    Args:
        token: The Google ID token string from the frontend (expo-auth-session).
        client_id: Your Google OAuth 2.0 Client ID. Falls back to settings if None.

    Returns:
        dict with keys: sub, email, name, picture, email_verified

    Raises:
        ValueError: If the token is invalid, expired, or the client_id is not configured.
    """
    from app.config import settings

    resolved_client_id = client_id or settings.GOOGLE_CLIENT_ID

    # -- Development fallback ---------------------------------------------------
    # If GOOGLE_CLIENT_ID is not configured, allow a mock token for local dev.
    # The mock token format is: "mock_google_<email>_<name>"
    if not resolved_client_id:
        if settings.ENVIRONMENT != "production" and token.startswith("mock_google_"):
            parts = token.split("_", 3)
            mock_email = parts[2] if len(parts) > 2 else "dev@neethimitra.ai"
            mock_name = parts[3].replace("_", " ") if len(parts) > 3 else "Dev Google User"
            logger.warning(
                "GOOGLE_CLIENT_ID not set. Accepting mock Google token for dev. "
                "This will FAIL in production."
            )
            return {
                "sub": f"mock_google_sub_{mock_email}",
                "email": mock_email,
                "name": mock_name,
                "picture": None,
                "email_verified": True,
            }
        raise ValueError(
            "GOOGLE_CLIENT_ID is not configured. "
            "Set it in your .env file from https://console.cloud.google.com"
        )

    # -- Real production verification ------------------------------------------
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            resolved_client_id,
        )

        if not idinfo.get("email_verified"):
            raise ValueError("Google account email is not verified.")

        return {
            "sub": idinfo["sub"],
            "email": idinfo.get("email"),
            "name": idinfo.get("name"),
            "picture": idinfo.get("picture"),
            "email_verified": idinfo.get("email_verified", False),
        }

    except ValueError as exc:
        # google-auth raises ValueError for invalid/expired tokens
        logger.warning("Google ID token verification failed: %s", exc)
        raise
    except Exception as exc:
        logger.error("Unexpected error during Google token verification: %s", exc)
        raise ValueError(f"Google token verification error: {exc}") from exc
