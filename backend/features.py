"""
PAID LIFT growth & operations features:
- Referrals (two-sided ₹50 wallet credit on first completed ride)
- Driver Plus subscription status queries (payments handled in payments.py)
- Withdrawals (owner payout requests, admin approve/reject)
- Live location broadcast (driver GPS)
- Admin moderation (suspend user, delist ride, resolve SOS, vehicle approval)
- Revenue analytics
- Badges computation
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from push import send_push

PROJECT = {"_id": 0}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


REFERRAL_BONUS = 50.0
DRIVER_PLUS_PRICE = 99.0
DRIVER_PLUS_RIDES = 20
DRIVER_PLUS_DAYS = 30


# ---------- Badges ----------
async def compute_badges(db, user: dict) -> list[dict]:
    badges = []
    uid = user["id"]
    if user.get("aadhaar_verified"):
        badges.append({"key": "verified", "label": "Aadhaar Verified", "icon": "shield-checkmark"})
    if user.get("rating_avg", 0) >= 4.7 and user.get("rating_count", 0) >= 10:
        badges.append({"key": "top_driver", "label": "Top Driver", "icon": "trophy"})
    completed = await db.bookings.count_documents({"owner_id": uid, "status": "completed"})
    if completed >= 50:
        badges.append({"key": "rides_50", "label": "50 Rides Club", "icon": "ribbon"})
    # Safe Driver: no SOS on their rides
    owner_bookings = await db.bookings.find({"owner_id": uid}, {"id": 1, "_id": 0}).to_list(500)
    b_ids = [b["id"] for b in owner_bookings]
    sos_count = await db.sos.count_documents({"booking_id": {"$in": b_ids}}) if b_ids else 0
    if completed >= 5 and sos_count == 0:
        badges.append({"key": "safe_driver", "label": "Safe Driver", "icon": "heart"})
    ev = await db.vehicles.count_documents({"owner_id": uid, "fuel_type": "ev"})
    if ev > 0:
        badges.append({"key": "ev_host", "label": "EV Host", "icon": "leaf"})
    dp = user.get("driver_plus") or {}
    if dp.get("active") and dp.get("expires_at", "") > now_iso():
        badges.append({"key": "driver_plus", "label": "Driver Plus", "icon": "star"})
    return badges


def driver_plus_active(user: dict) -> bool:
    dp = user.get("driver_plus") or {}
    return bool(dp.get("active")) and dp.get("expires_at", "") > now_iso() and dp.get("rides_left", 0) > 0


# ---------- Router ----------
def build_router(db) -> APIRouter:
    router = APIRouter(prefix="/api")

    # ===== Referrals =====
    class ApplyReferral(BaseModel):
        user_id: str
        code: str

    @router.post("/referrals/apply")
    async def apply_referral(body: ApplyReferral):
        user = await db.users.find_one({"id": body.user_id}, PROJECT)
        if not user:
            raise HTTPException(404, "User not found")
        if user.get("referred_by"):
            raise HTTPException(400, "Referral already applied")
        referrer = await db.users.find_one({"referral_code": body.code.upper().strip()}, PROJECT)
        if not referrer:
            raise HTTPException(404, "Invalid referral code")
        if referrer["id"] == user["id"]:
            raise HTTPException(400, "Cannot refer yourself")
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"referred_by": referrer["id"], "referral_pending": True}},
        )
        return {"ok": True, "referrer": referrer.get("name", "")}

    async def _maybe_pay_referral(passenger_id: str):
        """Credit ₹50 both sides on the referred user's first completed ride."""
        user = await db.users.find_one({"id": passenger_id}, PROJECT)
        if not user or not user.get("referral_pending"):
            return
        referrer_id = user.get("referred_by")
        await db.users.update_one({"id": passenger_id}, {"$set": {"referral_pending": False}})
        for uid, note in [
            (passenger_id, "Referral bonus — first ride completed"),
            (referrer_id, f"Referral bonus — {user.get('name','friend')} joined & rode"),
        ]:
            await db.users.update_one({"id": uid}, {"$inc": {"wallet_balance": REFERRAL_BONUS}})
            await db.wallet_txns.insert_one({
                "id": new_id(), "user_id": uid, "amount": REFERRAL_BONUS,
                "kind": "topup", "note": note, "created_at": now_iso(),
            })

    # ===== Withdrawals =====
    class WithdrawIn(BaseModel):
        amount: float
        upi_id: str

    @router.post("/wallet/{user_id}/withdraw")
    async def withdraw(user_id: str, body: WithdrawIn):
        if body.amount <= 0 or not body.upi_id.strip():
            raise HTTPException(400, "Amount and UPI ID required")
        user = await db.users.find_one({"id": user_id}, PROJECT)
        if not user:
            raise HTTPException(404, "User not found")
        if user.get("wallet_balance", 0) < body.amount:
            raise HTTPException(400, "Insufficient balance")
        req = {
            "id": new_id(), "user_id": user_id, "amount": body.amount,
            "upi_id": body.upi_id.strip(), "status": "pending",
            "created_at": now_iso(),
        }
        await db.withdrawals.insert_one(req)
        await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": -body.amount}})
        await db.wallet_txns.insert_one({
            "id": new_id(), "user_id": user_id, "amount": -body.amount,
            "kind": "withdraw", "note": f"Withdrawal to {body.upi_id} (pending)",
            "created_at": now_iso(),
        })
        req.pop("_id", None)
        return req

    @router.get("/withdrawals")
    async def list_withdrawals(user_id: Optional[str] = None, status: Optional[str] = None):
        q = {}
        if user_id:
            q["user_id"] = user_id
        if status:
            q["status"] = status
        return await db.withdrawals.find(q, PROJECT).sort("created_at", -1).to_list(500)

    @router.post("/admin/withdrawals/{wid}/decide")
    async def decide_withdrawal(wid: str, approve: bool = True):
        w = await db.withdrawals.find_one({"id": wid}, PROJECT)
        if not w:
            raise HTTPException(404, "Not found")
        if w["status"] != "pending":
            raise HTTPException(400, "Already processed")
        new_status = "paid" if approve else "rejected"
        await db.withdrawals.update_one({"id": wid}, {"$set": {"status": new_status, "resolved_at": now_iso()}})
        if not approve:
            # refund to wallet
            await db.users.update_one({"id": w["user_id"]}, {"$inc": {"wallet_balance": w["amount"]}})
            await db.wallet_txns.insert_one({
                "id": new_id(), "user_id": w["user_id"], "amount": w["amount"],
                "kind": "topup", "note": "Withdrawal rejected — refunded", "created_at": now_iso(),
            })
        try:
            await send_push([w["user_id"]], {
                "title": f"Withdrawal {new_status.title()}",
                "message": f"₹{w['amount']:.0f} withdrawal to {w['upi_id']} is {new_status}.",
                "action_url": "/(tabs)/wallet",
            })
        except Exception:
            pass
        return {"ok": True, "status": new_status}

    # ===== Live location (driver GPS broadcast) =====
    class LocationIn(BaseModel):
        booking_id: str
        user_id: str
        latitude: float
        longitude: float
        heading: Optional[float] = 0

    @router.post("/location")
    async def post_location(body: LocationIn):
        await db.live_locations.update_one(
            {"booking_id": body.booking_id},
            {"$set": {
                "booking_id": body.booking_id,
                "user_id": body.user_id,
                "latitude": body.latitude,
                "longitude": body.longitude,
                "heading": body.heading or 0,
                "updated_at": now_iso(),
            }},
            upsert=True,
        )
        return {"ok": True}

    @router.get("/location/{booking_id}")
    async def get_location(booking_id: str):
        loc = await db.live_locations.find_one({"booking_id": booking_id}, PROJECT)
        if not loc:
            return {"available": False}
        try:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(loc["updated_at"])).total_seconds()
        except Exception:
            age = 9999
        loc["available"] = age < 120
        loc["age_seconds"] = int(age)
        return loc

    # ===== Admin moderation =====
    @router.post("/admin/users/{user_id}/suspend")
    async def suspend_user(user_id: str, suspended: bool = True):
        await db.users.update_one({"id": user_id}, {"$set": {"suspended": suspended}})
        return {"ok": True, "suspended": suspended}

    @router.post("/admin/rides/{ride_id}/delist")
    async def delist_ride(ride_id: str):
        await db.rides.update_one({"id": ride_id}, {"$set": {"status": "cancelled"}})
        return {"ok": True}

    @router.post("/admin/sos/{sos_id}/resolve")
    async def resolve_sos(sos_id: str):
        await db.sos.update_one({"id": sos_id}, {"$set": {"resolved": True, "resolved_at": now_iso()}})
        return {"ok": True}

    @router.post("/admin/vehicles/{vehicle_id}/approve")
    async def approve_vehicle(vehicle_id: str, approve: bool = True):
        await db.vehicles.update_one(
            {"id": vehicle_id},
            {"$set": {"approved": approve, "reviewed_at": now_iso()}},
        )
        v = await db.vehicles.find_one({"id": vehicle_id}, PROJECT)
        if v:
            try:
                await send_push([v["owner_id"]], {
                    "title": f"Vehicle {'Approved' if approve else 'Rejected'}",
                    "message": f"{v.get('make','')} {v.get('model','')} ({v.get('plate','')}) has been {'approved — you can publish rides!' if approve else 'rejected. Please re-upload clear documents.'}",
                    "action_url": "/vehicles",
                })
            except Exception:
                pass
        return {"ok": True, "approved": approve}

    @router.get("/admin/vehicles")
    async def admin_vehicles(status: Optional[str] = None):
        q = {}
        if status == "pending":
            q["approved"] = False
        elif status == "approved":
            q["approved"] = True
        docs = await db.vehicles.find(q, PROJECT).sort("created_at", -1).to_list(500)
        for d in docs:
            d["owner"] = await db.users.find_one({"id": d["owner_id"]}, PROJECT) or {}
        return docs

    @router.get("/admin/revenue")
    async def admin_revenue():
        txns = await db.wallet_txns.find({}, PROJECT).to_list(10000)
        gmv = sum(-t["amount"] for t in txns if t["kind"] == "ride_payment")
        commission = sum(-t["amount"] for t in txns if t["kind"] == "commission")
        topups = sum(t["amount"] for t in txns if t["kind"] == "topup" and "bonus" not in t.get("note", "").lower())
        withdrawals = sum(-t["amount"] for t in txns if t["kind"] == "withdraw")
        bookings_total = await db.bookings.count_documents({})
        bookings_paid = await db.bookings.count_documents({"paid": True})
        plus_subs = await db.users.count_documents({"driver_plus.active": True})
        return {
            "gmv": round(gmv, 2),
            "commission": round(commission, 2),
            "topups": round(topups, 2),
            "withdrawals": round(withdrawals, 2),
            "bookings_total": bookings_total,
            "bookings_paid": bookings_paid,
            "driver_plus_subscribers": plus_subs,
        }

    # ===== Referral internal hook (called by server.py on ride completion) =====
    router.maybe_pay_referral = _maybe_pay_referral  # type: ignore
    return router
