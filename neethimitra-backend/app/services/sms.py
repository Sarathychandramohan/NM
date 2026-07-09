"""
SMS service for OTP delivery using Fast2SMS (free tier, Indian numbers).

Free tier: 50 SMS/day -- sufficient for development and hackathon demos.

NOTE-MANUAL: Get your API key from https://fast2sms.com ->> Dev API
             Set FAST2SMS_API_KEY in your .env file.

In development mode (ENVIRONMENT != "production"), OTP is NOT sent via SMS.
The OTP is returned as otp_hint in the response for easy testing.
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2"


def send_otp_sms(phone: str, otp_code: str) -> bool:
    """
    Send OTP via Fast2SMS.

    Args:
        phone: 10-digit Indian mobile number (no country code).
        otp_code: 6-digit OTP string.

    Returns:
        True if SMS was dispatched successfully, False on failure.
        In development mode, always returns True without sending.
    """
    # Development mode: skip SMS, just log
    if settings.ENVIRONMENT != "production":
        logger.info(
            "[DEV] SMS not sent. OTP for %s is: %s (returned as otp_hint in response)",
            phone,
            otp_code,
        )
        return True

    # Production mode: send via Fast2SMS
    if not settings.FAST2SMS_API_KEY:
        logger.error(
            "FAST2SMS_API_KEY not configured. Cannot send OTP. "
            "Get your key from https://fast2sms.com -> Dev API"
        )
        return False

    try:
        response = httpx.post(
            FAST2SMS_URL,
            headers={
                "authorization": settings.FAST2SMS_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "route": "otp",
                "variables_values": otp_code,
                "flash": 0,
                "numbers": phone,
            },
            timeout=10.0,
        )

        data = response.json()
        if response.status_code == 200 and data.get("return") is True:
            logger.info("OTP SMS sent to %s via Fast2SMS.", phone)
            return True
        else:
            logger.error(
                "Fast2SMS OTP send failed (%s): %s",
                response.status_code,
                data,
            )
            return False

    except httpx.TimeoutException:
        logger.error("Fast2SMS request timed out for phone %s.", phone)
        return False
    except Exception as exc:
        logger.error("Fast2SMS unexpected error: %s", exc)
        return False