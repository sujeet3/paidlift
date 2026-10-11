"""
PAID LIFT — Production SMS Gateway Service
Supports Fast2SMS, MSG91, Twilio, and Development Mock Simulator.
Provides cryptographically secure 6-digit OTP generation with 5-minute TTL.
"""
import os
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "simulator").lower()
FAST2SMS_API_KEY = os.environ.get("FAST2SMS_API_KEY", "")
MSG91_AUTH_KEY = os.environ.get("MSG91_AUTH_KEY", "")
MSG91_TEMPLATE_ID = os.environ.get("MSG91_TEMPLATE_ID", "")
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_PHONE = os.environ.get("TWILIO_FROM_PHONE", "")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()

OTP_TTL_MINUTES = 5


def generate_otp() -> str:
    """Generates a cryptographically secure 6-digit OTP."""
    return str(secrets.randbelow(900000) + 100000)


async def send_sms_via_fast2sms(phone: str, otp: str) -> bool:
    """Dispatches OTP SMS via Fast2SMS Quick SMS API."""
    if not FAST2SMS_API_KEY:
        logger.warning("FAST2SMS_API_KEY is not configured.")
        return False
    # Clean phone (remove +91 prefix if present)
    clean_phone = phone.replace("+91", "").strip()[-10:]
    url = "https://www.fast2sms.com/dev/bulkV2"
    headers = {"authorization": FAST2SMS_API_KEY}
    payload = {
        "variables_values": otp,
        "route": "otp",
        "numbers": clean_phone,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, data=payload)
            data = resp.json()
            if resp.status_code == 200 and data.get("return") is True:
                logger.info(f"Fast2SMS OTP sent successfully to {clean_phone}")
                return True
            logger.error(f"Fast2SMS error: {data}")
            return False
    except Exception as e:
        logger.error(f"Failed to send SMS via Fast2SMS: {e}")
        return False


async def send_sms_via_msg91(phone: str, otp: str) -> bool:
    """Dispatches OTP SMS via MSG91 Send OTP API."""
    if not MSG91_AUTH_KEY:
        logger.warning("MSG91_AUTH_KEY is not configured.")
        return False
    clean_phone = phone.replace("+", "").strip()
    if not clean_phone.startswith("91") and len(clean_phone) == 10:
        clean_phone = f"91{clean_phone}"
    url = "https://control.msg91.com/api/v5/otp"
    headers = {
        "authkey": MSG91_AUTH_KEY,
        "content-type": "application/json",
    }
    payload = {
        "template_id": MSG91_TEMPLATE_ID,
        "mobile": clean_phone,
        "otp": otp,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            data = resp.json()
            if resp.status_code == 200 and data.get("type") == "success":
                logger.info(f"MSG91 OTP sent successfully to {clean_phone}")
                return True
            logger.error(f"MSG91 error: {data}")
            return False
    except Exception as e:
        logger.error(f"Failed to send SMS via MSG91: {e}")
        return False


async def send_sms_via_twilio(phone: str, otp: str) -> bool:
    """Dispatches OTP SMS via Twilio Messaging API."""
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_PHONE):
        logger.warning("Twilio credentials not configured.")
        return False
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
    auth = (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    data = {
        "To": phone if phone.startswith("+") else f"+91{phone}",
        "From": TWILIO_FROM_PHONE,
        "Body": f"<#> Your PAID LIFT verification code is {otp}. Valid for 5 minutes. Never share this code.",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, auth=auth, data=data)
            if resp.status_code in (200, 201):
                logger.info(f"Twilio OTP sent successfully to {phone}")
                return True
            logger.error(f"Twilio error: {resp.text}")
            return False
    except Exception as e:
        logger.error(f"Failed to send SMS via Twilio: {e}")
        return False


class OTPService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def issue_otp(self, phone: str) -> Tuple[bool, str]:
        """
        Generates and sends an OTP for the given phone number.
        Returns (success: bool, otp_code: str).
        In development/simulator mode, returns the generated code for testing.
        """
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)

        # In development or if explicitly simulator, support 123456 as well as secure OTP
        otp_code = "123456" if ENVIRONMENT == "development" and SMS_PROVIDER == "simulator" else generate_otp()

        # Save to DB token store
        await self.db.otp_tokens.update_one(
            {"phone": phone},
            {
                "$set": {
                    "phone": phone,
                    "otp": otp_code,
                    "expires_at": expires_at.isoformat(),
                    "created_at": now.isoformat(),
                    "attempts": 0,
                    "verified": False,
                }
            },
            upsert=True,
        )

        sent = False
        if SMS_PROVIDER == "fast2sms":
            sent = await send_sms_via_fast2sms(phone, otp_code)
        elif SMS_PROVIDER == "msg91":
            sent = await send_sms_via_msg91(phone, otp_code)
        elif SMS_PROVIDER == "twilio":
            sent = await send_sms_via_twilio(phone, otp_code)
        else:
            # Simulator mode
            logger.info(f"[SIMULATOR] OTP for {phone}: {otp_code}")
            sent = True

        return sent, otp_code

    async def verify_otp(self, phone: str, otp: str) -> bool:
        """
        Verifies if OTP matches and has not expired.
        Allows '123456' in development mode.
        """
        if ENVIRONMENT == "development" and otp == "123456":
            return True

        record = await self.db.otp_tokens.find_one({"phone": phone})
        if not record:
            return False

        now_iso = datetime.now(timezone.utc).isoformat()
        if record.get("expires_at", "") < now_iso:
            return False

        if record.get("otp") == otp:
            # Mark verified and invalidate
            await self.db.otp_tokens.update_one(
                {"phone": phone},
                {"$set": {"verified": True, "otp": ""}}
            )
            return True

        # Increment failed attempts
        await self.db.otp_tokens.update_one(
            {"phone": phone},
            {"$inc": {"attempts": 1}}
        )
        return False
