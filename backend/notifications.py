"""
PAID LIFT — Push Notifications Service (Expo Push / FCM)
Handles mobile push notification dispatch via Expo Push Notification API.
Triggers notifications on:
- Booking requested, accepted, rejected, cancelled
- Ride cancelled with refund
- Chat messages
- SOS emergency alerts
"""
import logging
from typing import List, Optional, Dict, Any
import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def save_user_push_token(db: AsyncIOMotorDatabase, user_id: str, token: str):
    """Saves or updates Expo Push token for a user."""
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"push_token": token}}
    )
    logger.info(f"Updated push token for user {user_id}")


async def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
    sound: str = "default",
    badge: Optional[int] = None,
) -> bool:
    """Dispatches a push notification via Expo Push Notification API."""
    if not token or not token.startswith("ExponentPushToken["):
        logger.info(f"[PUSH MOCK] To {token}: {title} - {body}")
        return True

    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": sound,
        "data": data or {},
    }
    if badge is not None:
        payload["badge"] = badge

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                EXPO_PUSH_URL,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                json=payload,
            )
            res_data = resp.json()
            if resp.status_code == 200:
                logger.info(f"Push notification sent successfully: {res_data}")
                return True
            logger.error(f"Push notification failed: {res_data}")
            return False
    except Exception as e:
        logger.error(f"Error dispatching push notification: {e}")
        return False


async def notify_user(
    db: AsyncIOMotorDatabase,
    user_id: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
):
    """Looks up user push token and dispatches notification."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "push_token": 1, "name": 1})
    if user and user.get("push_token"):
        await send_push_notification(user["push_token"], title, body, data)
    else:
        logger.info(f"[NOTIFICATION] User {user_id} (no push token registered): {title} - {body}")
