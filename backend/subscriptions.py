"""
PAID LIFT — Driver Plus Subscription Engine (₹99/Month)
Features:
- ₹99/month recurring tier
- 0% platform commission on first 20 completed rides every calendar month
- Priority search placement badge
- Automatic subscription validity checks and renewal tracking
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


class SubscriptionPlan(BaseModel):
    id: str = "driver_plus_monthly"
    name: str = "Driver Plus Membership"
    price: float = 99.0  # INR
    validity_days: int = 30
    commission_free_rides: int = 20
    priority_search: bool = True
    description: str = "0% commission on your first 20 rides every month + priority badge in search."


class UserSubscription(BaseModel):
    id: str = Field(default_factory=new_id)
    user_id: str
    plan_id: str = "driver_plus_monthly"
    amount_paid: float = 99.0
    status: str = "active"  # active, expired, cancelled
    starts_at: str = Field(default_factory=now_iso)
    expires_at: str
    free_rides_used: int = 0
    max_free_rides: int = 20
    created_at: str = Field(default_factory=now_iso)


async def get_active_subscription(db: AsyncIOMotorDatabase, user_id: str) -> Optional[Dict[str, Any]]:
    """Checks if a user has an active, unexpired Driver Plus subscription."""
    now = now_iso()
    sub = await db.subscriptions.find_one(
        {
            "user_id": user_id,
            "status": "active",
            "expires_at": {"$gt": now},
        },
        {"_id": 0},
    )
    return sub


async def activate_driver_plus(db: AsyncIOMotorDatabase, user_id: str, amount: float = 99.0) -> Dict[str, Any]:
    """Activates 30 days of Driver Plus for a user."""
    start = datetime.now(timezone.utc)
    expires = start + timedelta(days=30)

    sub = UserSubscription(
        user_id=user_id,
        amount_paid=amount,
        starts_at=start.isoformat(),
        expires_at=expires.isoformat(),
    )
    await db.subscriptions.insert_one(sub.dict())
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"driver_plus": True, "driver_plus_expires": expires.isoformat()}},
    )
    return sub.dict()


async def consume_driver_commission_waiver(db: AsyncIOMotorDatabase, owner_id: str) -> bool:
    """
    Checks if owner has Driver Plus with remaining commission-free rides.
    If so, increments used count and returns True (commission waived).
    """
    sub = await get_active_subscription(db, owner_id)
    if not sub:
        return False

    if sub.get("free_rides_used", 0) < sub.get("max_free_rides", 20):
        await db.subscriptions.update_one(
            {"id": sub["id"]},
            {"$inc": {"free_rides_used": 1}}
        )
        return True
    return False
