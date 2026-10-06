"""
Emergent-managed push notifications (SuprSend relay) for PAID LIFT.

- POST /api/register-push — registers native device token (FCM/APNs)
- send_push() helper — server-side trigger; never blocks caller
"""
import os
import logging
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)

router = APIRouter(prefix="/api")


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


@router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    resp = await _client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


async def send_push(recipients: list[str], data: dict, idempotency_key: str | None = None) -> None:
    """Fire-and-forget push. Callers must wrap in try/except."""
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per call")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code >= 400:
        logger.warning(f"Push trigger failed: {resp.status_code} {resp.text[:200]}")
