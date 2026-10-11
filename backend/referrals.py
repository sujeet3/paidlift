"""
PAID LIFT — Viral Referral & Two-Sided Reward Engine
Rules:
- Every user gets a unique 6-character uppercase referral code upon registration (e.g., PL7X9A).
- New users can apply a referral code during signup/onboarding.
- Upon completion of referee's first paid ride:
  - Referee receives ₹50 bonus in wallet.
  - Referrer receives ₹50 bonus in wallet.
  - Ledger entries logged in `wallet_txns` with kind="referral_bonus".
"""
import secrets
import string
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)

REFERRAL_BONUS_AMOUNT = 50.0  # INR


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_referral_code() -> str:
    """Generates a memorable 6-character alphanumeric code."""
    chars = string.ascii_uppercase + "23456789"  # omit confusing 0, 1, O, I
    return "PL" + "".join(secrets.choice(chars) for _ in range(4))


async def ensure_user_referral_code(db: AsyncIOMotorDatabase, user_id: str) -> str:
    """Ensures user has a unique referral code assigned."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "referral_code": 1})
    if user and user.get("referral_code"):
        return user["referral_code"]

    for _ in range(5):
        code = generate_referral_code()
        existing = await db.users.find_one({"referral_code": code})
        if not existing:
            await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
            return code
    # Fallback
    fallback = f"PL{user_id[:4].upper()}"
    await db.users.update_one({"id": user_id}, {"$set": {"referral_code": fallback}})
    return fallback


async def apply_referral_code(db: AsyncIOMotorDatabase, referee_id: str, code: str) -> Dict[str, Any]:
    """Applies a referral code for a newly registered referee."""
    code_clean = code.strip().upper()
    referrer = await db.users.find_one({"referral_code": code_clean}, {"_id": 0})
    if not referrer:
        return {"success": False, "error": "Invalid referral code"}

    if referrer["id"] == referee_id:
        return {"success": False, "error": "Cannot use your own referral code"}

    # Check if already referred
    existing = await db.referrals.find_one({"referee_id": referee_id})
    if existing:
        return {"success": False, "error": "Referral code already applied"}

    record = {
        "referrer_id": referrer["id"],
        "referee_id": referee_id,
        "referral_code": code_clean,
        "rewarded": False,
        "created_at": now_iso(),
    }
    await db.referrals.insert_one(record)
    await db.users.update_one({"id": referee_id}, {"$set": {"referred_by": referrer["id"]}})
    return {"success": True, "referrer_name": referrer.get("name", "A PaidLift user")}


async def process_referral_reward_on_first_ride(db: AsyncIOMotorDatabase, passenger_id: str):
    """
    Called when a booking is completed and paid.
    If passenger had a pending referral reward and this is their first completed ride,
    awards ₹50 to referee and ₹50 to referrer!
    """
    ref = await db.referrals.find_one({"referee_id": passenger_id, "rewarded": False})
    if not ref:
        return

    referrer_id = ref["referrer_id"]
    now = now_iso()

    # Credit referee ₹50
    await db.users.update_one({"id": passenger_id}, {"$inc": {"wallet_balance": REFERRAL_BONUS_AMOUNT}})
    await db.wallet_txns.insert_one({
        "id": f"txn_{secrets.token_hex(8)}",
        "user_id": passenger_id,
        "amount": REFERRAL_BONUS_AMOUNT,
        "kind": "referral_bonus",
        "note": "₹50 Welcome Referral Reward on your first completed ride",
        "created_at": now,
    })

    # Credit referrer ₹50
    await db.users.update_one({"id": referrer_id}, {"$inc": {"wallet_balance": REFERRAL_BONUS_AMOUNT}})
    await db.wallet_txns.insert_one({
        "id": f"txn_{secrets.token_hex(8)}",
        "user_id": referrer_id,
        "amount": REFERRAL_BONUS_AMOUNT,
        "kind": "referral_bonus",
        "note": f"₹50 Referral Bonus (Friend completed their first ride)",
        "created_at": now,
    })

    # Mark referral rewarded
    await db.referrals.update_one(
        {"referee_id": passenger_id},
        {"$set": {"rewarded": True, "rewarded_at": now}}
    )
    logger.info(f"Awarded two-sided referral rewards of ₹{REFERRAL_BONUS_AMOUNT} to {passenger_id} and {referrer_id}")
