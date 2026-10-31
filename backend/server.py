from fastapi import FastAPI, APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import time
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="PAID LIFT API")
api_router = APIRouter(prefix="/api")

# Payments, Maps, Storage & Admin routers
from payments import build_router as build_payments_router  # noqa: E402
from maps import build_router as build_maps_router  # noqa: E402
from admin import build_router as build_admin_router  # noqa: E402
from storage import build_storage_router  # noqa: E402
from sms import OTPService  # noqa: E402
from websocket import ws_manager  # noqa: E402
from notifications import save_user_push_token, notify_user  # noqa: E402
from corridors import find_matching_corridors, get_corridor_stops, MAJOR_CORRIDORS  # noqa: E402
from referrals import ensure_user_referral_code, apply_referral_code  # noqa: E402
from subscriptions import get_active_subscription, SubscriptionPlan  # noqa: E402

API_PUBLIC_URL = os.environ.get("API_PUBLIC_URL", "http://localhost:8001")
otp_service = OTPService(db)

# Rate limiter for OTP (max 5 requests per 60s per IP/phone)
_OTP_RATE_LIMITS: Dict[str, list] = {}


def check_otp_rate_limit(key: str, max_requests: int = 5, window_seconds: int = 60) -> bool:
    now = time.time()
    timestamps = [t for t in _OTP_RATE_LIMITS.get(key, []) if now - t < window_seconds]
    if len(timestamps) >= max_requests:
        _OTP_RATE_LIMITS[key] = timestamps
        return False
    timestamps.append(now)
    _OTP_RATE_LIMITS[key] = timestamps
    return True


# ---------- Utils ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:

    return str(uuid.uuid4())


# ---------- Models ----------
class OTPRequest(BaseModel):
    phone: str


class OTPVerify(BaseModel):
    phone: str
    otp: str


class UserProfile(BaseModel):
    id: str = Field(default_factory=new_id)
    phone: str
    name: str = ""
    email: str = ""
    aadhaar_last4: str = ""
    aadhaar_verified: bool = False
    role: Literal["passenger", "owner", "both"] = "passenger"
    gender: str = ""  # male, female, other
    photo: str = ""  # base64 or url
    rating_avg: float = 0.0
    rating_count: int = 0
    wallet_balance: float = 0.0
    driver_plus: bool = False
    driver_plus_expires: Optional[str] = None
    referral_code: str = ""
    referred_by: Optional[str] = None
    push_token: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class UserUpsert(BaseModel):
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None
    aadhaar_last4: Optional[str] = None
    role: Optional[str] = None
    photo: Optional[str] = None


class Vehicle(BaseModel):
    id: str = Field(default_factory=new_id)
    owner_id: str
    vehicle_type: Literal["two-wheeler", "auto", "sedan", "suv", "bus", "luxury"]
    make: str = ""
    model: str = ""
    plate: str
    seats_total: int
    rc_number: str = ""
    insurance_number: str = ""
    dl_number: str = ""
    rc_photo: str = ""
    dl_photo: str = ""
    insurance_photo: str = ""
    photo: str = ""
    approved: bool = False  # Pending admin verification
    created_at: str = Field(default_factory=now_iso)


class VehicleCreate(BaseModel):
    owner_id: str
    vehicle_type: str
    make: str = ""
    model: str = ""
    plate: str
    seats_total: int
    rc_number: str = ""
    insurance_number: str = ""
    dl_number: str = ""
    rc_photo: str = ""
    dl_photo: str = ""
    insurance_photo: str = ""
    photo: str = ""


class Ride(BaseModel):
    id: str = Field(default_factory=new_id)
    owner_id: str
    vehicle_id: str
    from_location: str
    to_location: str
    stops: List[str] = []
    depart_at: str  # iso
    seats_available: int
    price_per_seat: float
    vehicle_type: str
    notes: str = ""
    women_only: bool = False
    status: Literal["open", "in_progress", "completed", "cancelled"] = "open"
    last_location: Optional[dict] = None
    created_at: str = Field(default_factory=now_iso)


class RideCreate(BaseModel):
    owner_id: str
    vehicle_id: str
    from_location: str
    to_location: str
    stops: List[str] = []
    depart_at: str
    seats_available: int
    price_per_seat: float
    vehicle_type: str
    notes: str = ""
    women_only: bool = False


class Booking(BaseModel):
    id: str = Field(default_factory=new_id)
    ride_id: str
    passenger_id: str
    owner_id: str
    seats: int
    total_price: float
    status: Literal["pending", "accepted", "rejected", "completed", "cancelled"] = "pending"
    paid: bool = False
    created_at: str = Field(default_factory=now_iso)


class BookingCreate(BaseModel):
    ride_id: str
    passenger_id: str
    seats: int


class BookingUpdate(BaseModel):
    status: Optional[str] = None
    paid: Optional[bool] = None


class ChatMessage(BaseModel):
    id: str = Field(default_factory=new_id)
    booking_id: str
    sender_id: str
    text: str
    created_at: str = Field(default_factory=now_iso)


class ChatCreate(BaseModel):
    booking_id: str
    sender_id: str
    text: str


class WalletTxn(BaseModel):
    id: str = Field(default_factory=new_id)
    user_id: str
    amount: float  # +credit, -debit
    kind: Literal[
        "topup",
        "ride_payment",
        "ride_earning",
        "commission",
        "withdraw",
        "subscription",
        "referral_bonus",
        "ride_refund",
    ]
    note: str = ""
    created_at: str = Field(default_factory=now_iso)


class PushTokenIn(BaseModel):
    token: str


class ReferralApplyIn(BaseModel):
    code: str


class LocationUpdateIn(BaseModel):
    latitude: float
    longitude: float
    heading: Optional[float] = None
    speed: Optional[float] = None



class Rating(BaseModel):
    id: str = Field(default_factory=new_id)
    booking_id: str
    rater_id: str
    rated_id: str
    stars: int
    comment: str = ""
    created_at: str = Field(default_factory=now_iso)


class RatingCreate(BaseModel):
    booking_id: str
    rater_id: str
    rated_id: str
    stars: int
    comment: str = ""


class SOSAlert(BaseModel):
    id: str = Field(default_factory=new_id)
    booking_id: str
    user_id: str
    location: str = ""
    created_at: str = Field(default_factory=now_iso)


class SOSCreate(BaseModel):
    booking_id: str
    user_id: str
    location: str = ""


# ---------- Helpers ----------
PROJECT = {"_id": 0}


async def get_user(user_id: str) -> Optional[dict]:
    return await db.users.find_one({"id": user_id}, PROJECT)


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "PAID LIFT API running"}


# --- Auth (Rate Limited + Real SMS Gateway & Dev Simulator) ---
@api_router.post("/auth/send-otp")
async def send_otp(payload: OTPRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{payload.phone}"
    if not check_otp_rate_limit(rate_key, max_requests=5, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please wait a minute before trying again.")

    ok, otp_code = await otp_service.issue_otp(payload.phone)
    resp = {"ok": ok, "phone": payload.phone}
    # In development mode, provide mock_otp for automated tests and developer simulation
    if os.environ.get("ENVIRONMENT", "development") == "development":
        resp["mock_otp"] = otp_code
    return resp


@api_router.post("/auth/verify-otp")
async def verify_otp(payload: OTPVerify):
    valid = await otp_service.verify_otp(payload.phone, payload.otp)
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    user = await db.users.find_one({"phone": payload.phone}, PROJECT)
    if not user:
        u = UserProfile(phone=payload.phone)
        u_dict = u.dict()
        u_dict["referral_code"] = await ensure_user_referral_code(db, u.id)
        await db.users.insert_one(u_dict)
        return {"user": u_dict, "is_new": True}

    if not user.get("referral_code"):
        code = await ensure_user_referral_code(db, user["id"])
        user["referral_code"] = code

    return {"user": user, "is_new": False}



# --- Users ---
@api_router.post("/users/upsert")
async def upsert_user(payload: UserUpsert):
    user = await db.users.find_one({"phone": payload.phone}, PROJECT)
    updates = {k: v for k, v in payload.dict().items() if v is not None and k != "phone"}
    if updates.get("aadhaar_last4"):
        updates["aadhaar_verified"] = True  # mock
    if not user:
        u = UserProfile(phone=payload.phone, **updates)
        await db.users.insert_one(u.dict())
        return u.dict()
    await db.users.update_one({"phone": payload.phone}, {"$set": updates})
    return await db.users.find_one({"phone": payload.phone}, PROJECT)


@api_router.get("/users/{user_id}")
async def get_user_route(user_id: str):
    u = await get_user(user_id)
    if not u:
        raise HTTPException(404, "User not found")
    return u


# --- Vehicles ---
@api_router.post("/vehicles", response_model=Vehicle)
async def create_vehicle(payload: VehicleCreate):
    v = Vehicle(**payload.dict())
    await db.vehicles.insert_one(v.dict())
    return v


@api_router.get("/vehicles")
async def list_vehicles(owner_id: Optional[str] = None):
    q = {"owner_id": owner_id} if owner_id else {}
    docs = await db.vehicles.find(q, PROJECT).to_list(1000)
    return docs


# --- Rides ---
@api_router.post("/rides", response_model=Ride)
async def create_ride(payload: RideCreate):
    r = Ride(**payload.dict())
    await db.rides.insert_one(r.dict())
    return r


@api_router.get("/rides")
async def search_rides(
    from_location: Optional[str] = None,
    to_location: Optional[str] = None,
    date: Optional[str] = None,  # YYYY-MM-DD
    vehicle_type: Optional[str] = None,
    owner_id: Optional[str] = None,
    women_only: Optional[bool] = None,
    include_expired: Optional[bool] = False,
):
    q: dict = {"status": "open"}
    if owner_id:
        q = {"owner_id": owner_id}
    else:
        # Auto-expire past rides (keep rides from today onwards)
        if not include_expired:
            q["depart_at"] = {"$gte": now_iso()[:10]}
        if from_location:
            q["from_location"] = {"$regex": from_location, "$options": "i"}
        if to_location:
            q["to_location"] = {"$regex": to_location, "$options": "i"}
        if vehicle_type and vehicle_type != "all":
            q["vehicle_type"] = vehicle_type
        if date:
            q["depart_at"] = {"$regex": f"^{date}"}
        if women_only is not None:
            q["women_only"] = women_only

    docs = await db.rides.find(q, PROJECT).sort("depart_at", 1).to_list(500)
    # enrich with owner + vehicle
    for d in docs:
        d["owner"] = await get_user(d["owner_id"]) or {}
        d["vehicle"] = await db.vehicles.find_one({"id": d["vehicle_id"]}, PROJECT) or {}

    # Driver Plus priority placement: Driver Plus subscribers float to the top
    docs.sort(key=lambda r: 0 if r.get("owner", {}).get("driver_plus") else 1)
    return docs


@api_router.get("/rides/{ride_id}")
async def get_ride(ride_id: str):
    r = await db.rides.find_one({"id": ride_id}, PROJECT)
    if not r:
        raise HTTPException(404, "Ride not found")
    r["owner"] = await get_user(r["owner_id"]) or {}
    r["vehicle"] = await db.vehicles.find_one({"id": r["vehicle_id"]}, PROJECT) or {}
    return r


@api_router.post("/rides/{ride_id}/cancel")
async def cancel_ride(ride_id: str, reason: str = Query("Ride cancelled by driver")):
    """Cancels a ride, auto-refunds all passengers 100% to wallet, and records audit ledger."""
    ride = await db.rides.find_one({"id": ride_id}, PROJECT)
    if not ride:
        raise HTTPException(404, "Ride not found")
    if ride.get("status") == "cancelled":
        return {"ok": True, "message": "Ride is already cancelled"}

    await db.rides.update_one({"id": ride_id}, {"$set": {"status": "cancelled", "cancel_reason": reason}})

    # Find and refund all affected bookings
    bookings = await db.bookings.find({"ride_id": ride_id, "status": {"$in": ["pending", "accepted"]}}, PROJECT).to_list(100)
    refund_count = 0
    for b in bookings:
        updates = {"status": "cancelled", "cancel_reason": reason}
        if b.get("paid"):
            # 100% passenger refund
            await db.users.update_one({"id": b["passenger_id"]}, {"$inc": {"wallet_balance": b["total_price"]}})
            await db.wallet_txns.insert_one(WalletTxn(
                user_id=b["passenger_id"],
                amount=b["total_price"],
                kind="ride_refund",
                note=f"100% Refund: Ride cancelled ({reason})",
            ).dict())
            updates["paid"] = False
            refund_count += 1
        await db.bookings.update_one({"id": b["id"]}, {"$set": updates})
        await notify_user(
            db,
            b["passenger_id"],
            "Ride Cancelled — Refund Issued",
            f"Ride was cancelled ({reason}). ₹{b['total_price']} refunded to your wallet.",
            {"ride_id": ride_id, "booking_id": b["id"]},
        )

    return {"ok": True, "cancelled": True, "passengers_refunded": refund_count}


# --- Bookings ---
@api_router.post("/bookings")
async def create_booking(payload: BookingCreate):
    ride = await db.rides.find_one({"id": payload.ride_id}, PROJECT)
    if not ride:
        raise HTTPException(404, "Ride not found")
    # Fix driver self-booking bug
    if payload.passenger_id == ride["owner_id"]:
        raise HTTPException(400, "Drivers cannot book seats in their own rides.")
    if ride["seats_available"] < payload.seats:
        raise HTTPException(400, "Not enough seats available")

    # Enforce Women-Only rides policy
    if ride.get("women_only"):
        passenger = await get_user(payload.passenger_id)
        if not passenger or passenger.get("gender", "").lower() != "female":
            raise HTTPException(403, "This is a Women-Only ride. Only verified female passengers can book this ride.")

    b = Booking(
        ride_id=payload.ride_id,
        passenger_id=payload.passenger_id,
        owner_id=ride["owner_id"],
        seats=payload.seats,
        total_price=round(ride["price_per_seat"] * payload.seats, 2),
    )
    await db.bookings.insert_one(b.dict())

    # Notify driver of new booking request
    await notify_user(
        db,
        ride["owner_id"],
        "New Booking Request",
        f"A passenger requested {payload.seats} seat(s) on your ride.",
        {"booking_id": b.id, "ride_id": payload.ride_id},
    )
    return b.dict()


@api_router.get("/bookings")
async def list_bookings(user_id: str, role: str = "passenger"):
    q = {"passenger_id": user_id} if role == "passenger" else {"owner_id": user_id}
    docs = await db.bookings.find(q, PROJECT).sort("created_at", -1).to_list(500)
    for d in docs:
        d["ride"] = await db.rides.find_one({"id": d["ride_id"]}, PROJECT) or {}
        d["passenger"] = await get_user(d["passenger_id"]) or {}
        d["owner"] = await get_user(d["owner_id"]) or {}
    return docs


@api_router.get("/bookings/{booking_id}")
async def get_booking(booking_id: str):
    b = await db.bookings.find_one({"id": booking_id}, PROJECT)
    if not b:
        raise HTTPException(404, "Not found")
    b["ride"] = await db.rides.find_one({"id": b["ride_id"]}, PROJECT) or {}
    b["passenger"] = await get_user(b["passenger_id"]) or {}
    b["owner"] = await get_user(b["owner_id"]) or {}
    return b


@api_router.patch("/bookings/{booking_id}")
async def update_booking(booking_id: str, payload: BookingUpdate):
    b = await db.bookings.find_one({"id": booking_id}, PROJECT)
    if not b:
        raise HTTPException(404, "Not found")
    updates = {k: v for k, v in payload.dict().items() if v is not None}

    if updates.get("status") == "accepted":
        # Atomically decrement seats with strict race condition prevention
        if not b.get("seats_decremented") and not b.get("paid"):
            res = await db.rides.update_one(
                {"id": b["ride_id"], "seats_available": {"$gte": b["seats"]}},
                {"$inc": {"seats_available": -b["seats"]}},
            )
            if res.modified_count == 0:
                raise HTTPException(400, "Not enough available seats to accept booking")
            updates["seats_decremented"] = True

    # Handle cancellation or rejection: restore seats & refund if paid
    if updates.get("status") in ("rejected", "cancelled"):
        if b.get("seats_decremented"):
            await db.rides.update_one({"id": b["ride_id"]}, {"$inc": {"seats_available": b["seats"]}})
            updates["seats_decremented"] = False
        if b.get("paid"):
            # Automated 100% passenger wallet refund
            await db.users.update_one({"id": b["passenger_id"]}, {"$inc": {"wallet_balance": b["total_price"]}})
            await db.wallet_txns.insert_one(WalletTxn(
                user_id=b["passenger_id"],
                amount=b["total_price"],
                kind="ride_refund",
                note=f"Automatic refund for {updates.get('status')} booking {booking_id}",
            ).dict())
            # Reversal of owner credit
            commission = round(b["total_price"] * 0.10, 2)
            owner_amt = b["total_price"] - commission
            await db.users.update_one({"id": b["owner_id"]}, {"$inc": {"wallet_balance": -owner_amt}})
            await db.wallet_txns.insert_one(WalletTxn(
                user_id=b["owner_id"],
                amount=-owner_amt,
                kind="ride_refund",
                note=f"Reversal for {updates.get('status')} booking {booking_id}",
            ).dict())
            updates["paid"] = False

    if updates.get("paid"):
        # Check if owner has Driver Plus (0% commission)
        commission_waived = False
        try:
            from subscriptions import consume_driver_commission_waiver
            commission_waived = await consume_driver_commission_waiver(db, b["owner_id"])
        except Exception as e:
            logger.warning(f"Driver plus check failed: {e}")

        commission = 0.0 if commission_waived else round(b["total_price"] * 0.10, 2)
        owner_amt = round(b["total_price"] - commission, 2)
        await db.users.update_one({"id": b["passenger_id"]}, {"$inc": {"wallet_balance": -b["total_price"]}})
        await db.users.update_one({"id": b["owner_id"]}, {"$inc": {"wallet_balance": owner_amt}})
        await db.wallet_txns.insert_one(WalletTxn(user_id=b["passenger_id"], amount=-b["total_price"], kind="ride_payment", note=f"Booking {booking_id}").dict())
        await db.wallet_txns.insert_one(WalletTxn(user_id=b["owner_id"], amount=owner_amt, kind="ride_earning", note=f"Booking {booking_id}" + (" (0% commission Driver Plus)" if commission_waived else "")).dict())
        if commission > 0:
            await db.wallet_txns.insert_one(WalletTxn(user_id=b["owner_id"], amount=-commission, kind="commission", note=f"Booking {booking_id} platform fee").dict())

    await db.bookings.update_one({"id": booking_id}, {"$set": updates})

    # Push notification on status change
    if updates.get("status") in ("accepted", "rejected", "cancelled"):
        recipient = b["passenger_id"] if updates.get("status") in ("accepted", "rejected") else b["owner_id"]
        await notify_user(
            db,
            recipient,
            f"Booking {updates['status'].title()}",
            f"Your booking has been {updates['status']}.",
            {"booking_id": booking_id, "ride_id": b["ride_id"]},
        )

    return await db.bookings.find_one({"id": booking_id}, PROJECT)


# --- Chat ---
@api_router.get("/chat/{booking_id}")
async def list_chat(booking_id: str):
    return await db.chat.find({"booking_id": booking_id}, PROJECT).sort("created_at", 1).to_list(500)


@api_router.post("/chat")
async def create_chat(payload: ChatCreate):
    m = ChatMessage(**payload.dict())
    m_dict = m.dict()
    await db.chat.insert_one(m_dict)
    # Broadcast to active WebSocket connections
    await ws_manager.broadcast_chat(payload.booking_id, m_dict)
    # Push notification to recipient
    booking = await db.bookings.find_one({"id": payload.booking_id}, PROJECT)
    if booking:
        recipient_id = booking["owner_id"] if payload.sender_id == booking["passenger_id"] else booking["passenger_id"]
        sender = await get_user(payload.sender_id)
        sender_name = sender.get("name", "Someone") if sender else "Someone"
        await notify_user(db, recipient_id, f"New message from {sender_name}", payload.text, {"booking_id": payload.booking_id})
    return m_dict



# --- Wallet ---
@api_router.get("/wallet/{user_id}")
async def get_wallet(user_id: str):
    u = await get_user(user_id)
    if not u:
        raise HTTPException(404, "User not found")
    txns = await db.wallet_txns.find({"user_id": user_id}, PROJECT).sort("created_at", -1).to_list(500)
    return {"balance": u.get("wallet_balance", 0.0), "transactions": txns}


@api_router.post("/wallet/{user_id}/topup")
async def wallet_topup(user_id: str, amount: float):
    if amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": amount}})
    await db.wallet_txns.insert_one(WalletTxn(user_id=user_id, amount=amount, kind="topup", note="Wallet top-up (mocked)").dict())
    return {"ok": True}


# --- Ratings ---
@api_router.post("/ratings")
async def create_rating(payload: RatingCreate):
    r = Rating(**payload.dict())
    await db.ratings.insert_one(r.dict())
    # recompute
    user_ratings = await db.ratings.find({"rated_id": payload.rated_id}, PROJECT).to_list(1000)
    if user_ratings:
        avg = sum(x["stars"] for x in user_ratings) / len(user_ratings)
        await db.users.update_one(
            {"id": payload.rated_id},
            {"$set": {"rating_avg": round(avg, 2), "rating_count": len(user_ratings)}},
        )
    return r.dict()


@api_router.get("/ratings")
async def list_ratings(user_id: str):
    return await db.ratings.find({"rated_id": user_id}, PROJECT).sort("created_at", -1).to_list(200)


# --- SOS ---
@api_router.post("/sos")
async def create_sos(payload: SOSCreate):
    s = SOSAlert(**payload.dict())
    await db.sos.insert_one(s.dict())
    return s.dict()


# --- Admin ---
@api_router.get("/admin/stats")
async def admin_stats():
    return {
        "users": await db.users.count_documents({}),
        "vehicles": await db.vehicles.count_documents({}),
        "rides": await db.rides.count_documents({}),
        "bookings": await db.bookings.count_documents({}),
        "sos_alerts": await db.sos.count_documents({}),
    }


@api_router.get("/admin/users")
async def admin_users():
    return await db.users.find({}, PROJECT).sort("created_at", -1).to_list(500)


@api_router.get("/admin/rides")
async def admin_rides():
    return await db.rides.find({}, PROJECT).sort("created_at", -1).to_list(500)


@api_router.get("/admin/sos")
async def admin_sos():
    return await db.sos.find({}, PROJECT).sort("created_at", -1).to_list(500)


# ---------- Seed ----------
@api_router.post("/admin/seed")
async def seed_demo():
    """Seeds a couple of demo vehicle owners + rides so search returns results."""
    if await db.rides.count_documents({}) > 0:
        return {"ok": True, "seeded": False, "note": "Data already present"}
    # Seed 2 owners
    owner1 = UserProfile(
        phone="+919000000001",
        name="Rahul Verma",
        email="rahul@example.com",
        aadhaar_last4="1234",
        aadhaar_verified=True,
        role="owner",
        rating_avg=4.6,
        rating_count=42,
    )
    owner2 = UserProfile(
        phone="+919000000002",
        name="Priya Sharma",
        email="priya@example.com",
        aadhaar_last4="5678",
        aadhaar_verified=True,
        role="owner",
        rating_avg=4.9,
        rating_count=88,
    )
    owner3 = UserProfile(
        phone="+919000000003",
        name="Amit Patel",
        email="amit@example.com",
        aadhaar_last4="9999",
        aadhaar_verified=True,
        role="owner",
        rating_avg=4.3,
        rating_count=17,
    )
    await db.users.insert_many([owner1.dict(), owner2.dict(), owner3.dict()])

    v1 = Vehicle(owner_id=owner1.id, vehicle_type="sedan", make="Honda", model="City", plate="MH12AB1234", seats_total=4, rc_number="RC001", insurance_number="INS001", dl_number="DL001")
    v2 = Vehicle(owner_id=owner2.id, vehicle_type="suv", make="Toyota", model="Innova", plate="DL8CAF5678", seats_total=6, rc_number="RC002", insurance_number="INS002", dl_number="DL002")
    v3 = Vehicle(owner_id=owner3.id, vehicle_type="auto", make="Bajaj", model="RE", plate="GJ01AA9999", seats_total=3, rc_number="RC003", insurance_number="INS003", dl_number="DL003")
    await db.vehicles.insert_many([v1.dict(), v2.dict(), v3.dict()])

    from datetime import timedelta
    base = datetime.now(timezone.utc).replace(hour=8, minute=0, second=0, microsecond=0)
    rides = [
        Ride(owner_id=owner1.id, vehicle_id=v1.id, from_location="Mumbai", to_location="Pune",
             stops=["Lonavala"], depart_at=(base + timedelta(days=1)).isoformat(),
             seats_available=3, price_per_seat=450, vehicle_type="sedan",
             notes="Non-stop AC ride. Highway route via Expressway."),
        Ride(owner_id=owner2.id, vehicle_id=v2.id, from_location="Delhi", to_location="Jaipur",
             stops=["Gurugram", "Behror"], depart_at=(base + timedelta(days=1, hours=2)).isoformat(),
             seats_available=5, price_per_seat=600, vehicle_type="suv",
             notes="Comfortable SUV, spacious luggage room."),
        Ride(owner_id=owner3.id, vehicle_id=v3.id, from_location="Ahmedabad", to_location="Vadodara",
             stops=[], depart_at=(base + timedelta(days=2)).isoformat(),
             seats_available=2, price_per_seat=180, vehicle_type="auto",
             notes="Budget-friendly auto ride."),
        Ride(owner_id=owner1.id, vehicle_id=v1.id, from_location="Bengaluru", to_location="Mysuru",
             stops=["Ramanagara"], depart_at=(base + timedelta(days=3)).isoformat(),
             seats_available=4, price_per_seat=400, vehicle_type="sedan"),
    ]
    await db.rides.insert_many([r.dict() for r in rides])
    return {"ok": True, "seeded": True, "rides": len(rides)}


# --- Driver Live GPS Streaming ---
@api_router.patch("/rides/{ride_id}/location")
async def update_ride_location(ride_id: str, payload: LocationUpdateIn):
    """Updates driver's live GPS coordinates via HTTP and broadcasts to WS passengers."""
    loc_data = payload.dict()
    loc_data["updated_at"] = now_iso()
    await ws_manager.broadcast_location(ride_id, loc_data, db)
    return {"ok": True, "location": loc_data}


# --- Push Notifications ---
@api_router.post("/users/{user_id}/push-token")
async def register_push_token(user_id: str, payload: PushTokenIn):
    """Registers Expo Push Notification token for a user."""
    await save_user_push_token(db, user_id, payload.token)
    return {"ok": True}


# --- Driver Plus Subscriptions (₹99/Month) ---
@api_router.get("/subscriptions/plans")
async def get_subscription_plans():
    return [SubscriptionPlan().dict()]


@api_router.get("/subscriptions/{user_id}")
async def get_user_subscription(user_id: str):
    sub = await get_active_subscription(db, user_id)
    return {"has_driver_plus": bool(sub), "subscription": sub}


# --- Viral Referrals & ₹50 Rewards ---
@api_router.get("/referrals/{user_id}")
async def get_user_referral_info(user_id: str):
    code = await ensure_user_referral_code(db, user_id)
    referrals = await db.referrals.find({"referrer_id": user_id}, PROJECT).to_list(100)
    rewarded_count = sum(1 for r in referrals if r.get("rewarded"))
    return {
        "referral_code": code,
        "share_message": f"Join PAID LIFT for affordable highway rides! Use my referral code {code} to get ₹50 welcome wallet credit: https://paidlift.in/r/{code}",
        "total_referrals": len(referrals),
        "rewarded_referrals": rewarded_count,
        "earned_rewards": rewarded_count * 50.0,
    }


@api_router.post("/referrals/apply")
async def apply_referral(user_id: str, payload: ReferralApplyIn):
    res = await apply_referral_code(db, user_id, payload.code)
    if not res.get("success"):
        raise HTTPException(400, res.get("error", "Failed to apply referral code"))
    return res


# --- Highway Corridors & Waypoints ---
@api_router.get("/corridors")
async def list_corridors(from_location: Optional[str] = None, to_location: Optional[str] = None):
    if from_location and to_location:
        return find_matching_corridors(from_location, to_location)
    return MAJOR_CORRIDORS


@api_router.get("/corridors/stops")
async def list_corridor_stops(city: str = Query(...)):
    return get_corridor_stops(city)


# ---------- WebSockets Hub ----------
@app.websocket("/ws/chat/{booking_id}")
async def websocket_chat(websocket: WebSocket, booking_id: str):
    await ws_manager.connect_chat(booking_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg_payload = json.loads(data)
                if msg_payload.get("text") and msg_payload.get("sender_id"):
                    msg = ChatMessage(
                        booking_id=booking_id,
                        sender_id=msg_payload["sender_id"],
                        text=msg_payload["text"],
                    ).dict()
                    await db.chat.insert_one(msg)
                    await ws_manager.broadcast_chat(booking_id, msg)
            except Exception as e:
                logger.error(f"WS Chat error: {e}")
    except WebSocketDisconnect:
        ws_manager.disconnect_chat(booking_id, websocket)


@app.websocket("/ws/ride/{ride_id}/location")
async def websocket_location(websocket: WebSocket, ride_id: str):
    await ws_manager.connect_tracking(ride_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                loc_payload = json.loads(data)
                await ws_manager.broadcast_location(ride_id, loc_payload, db)
            except Exception as e:
                logger.error(f"WS Location error: {e}")
    except WebSocketDisconnect:
        ws_manager.disconnect_tracking(ride_id, websocket)


# Root Health Endpoint
@app.get("/")
def read_root():
    return {
        "status": "ok",
        "message": "PaidLift Backend API is running",
        "docs": "/docs",
        "api": "/api",
        "health": "/health"
    }


@app.get("/health")
async def health_check():
    try:
        await client.admin.command('ping')
        return {
            "status": "healthy",
            "database": "connected",
            "db_name": os.environ.get("DB_NAME", "paidlift")
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }


# Include routers
app.include_router(api_router)
app.include_router(build_payments_router(db, API_PUBLIC_URL))
app.include_router(build_maps_router(db))
app.include_router(build_admin_router(db))
app.include_router(build_storage_router(API_PUBLIC_URL))

# Serve Super Admin Web Dashboard
admin_dist_dir = os.path.join(os.path.dirname(__file__), "admin_dist")
if os.path.isdir(admin_dist_dir):
    assets_dir = os.path.join(admin_dist_dir, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="admin_assets_root")

    @app.api_route("/admin", methods=["GET", "HEAD"], include_in_schema=False)
    @app.api_route("/admin/", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_admin_root():
        index_path = os.path.join(admin_dist_dir, "index.html")
        return FileResponse(index_path)

    @app.api_route("/admin/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_admin_spa(full_path: str):
        file_path = os.path.join(admin_dist_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        index_path = os.path.join(admin_dist_dir, "index.html")
        return FileResponse(index_path)

# Hardened CORS configuration
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "")
if allowed_origins_env == "*":
    allow_all_origins = True
    allowed_origins = ["*"]
elif allowed_origins_env:
    allow_all_origins = False
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    allow_all_origins = False
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:8001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8081",
        "http://127.0.0.1:8001",
        "https://paidlift.onrender.com",
        "https://paidlift-admin-web.onrender.com",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True if not allow_all_origins else False,
    allow_origins=allowed_origins if allowed_origins else ["*"],
    allow_origin_regex=r"https://.*\.onrender\.com" if not allow_all_origins else None,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    # Auto-seed on startup if no rides
    try:
        if await db.rides.count_documents({}) == 0:
            await seed_demo()
            logger.info("Demo data seeded.")
    except Exception as e:
        logger.warning(f"Seed failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
