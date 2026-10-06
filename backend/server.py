from fastapi import FastAPI, APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import time
import re
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="PAID LIFT API")
api_router = APIRouter(prefix="/api")

from payments import build_router as build_payments_router  # noqa: E402
from maps import build_router as build_maps_router  # noqa: E402
from push import router as push_router, send_push  # noqa: E402
from storage import build_router as build_storage_router, init_storage  # noqa: E402
from features import build_router as build_features_router, compute_badges, driver_plus_active  # noqa: E402

API_PUBLIC_URL = os.environ.get("API_PUBLIC_URL", "http://localhost:8001")


# ---------- Utils ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def referral_code_for(name: str) -> str:
    base = re.sub(r"[^A-Z]", "", (name or "LIFT").upper())[:4] or "LIFT"
    return f"{base}{uuid.uuid4().hex[:4].upper()}"


# ---------- Rate limiting (in-memory token bucket) ----------
_rate: dict = {}


def rate_limit(key: str, limit: int, window_sec: int):
    now = time.time()
    hits = [t for t in _rate.get(key, []) if now - t < window_sec]
    if len(hits) >= limit:
        raise HTTPException(429, "Too many requests. Please wait and try again.")
    hits.append(now)
    _rate[key] = hits


# ---------- WebSocket chat manager ----------
class ChatManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, booking_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(booking_id, []).append(ws)

    def disconnect(self, booking_id: str, ws: WebSocket):
        if booking_id in self.rooms and ws in self.rooms[booking_id]:
            self.rooms[booking_id].remove(ws)

    async def broadcast(self, booking_id: str, message: dict):
        for ws in list(self.rooms.get(booking_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(booking_id, ws)


chat_manager = ChatManager()


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
    gender: str = ""  # male | female | other
    aadhaar_last4: str = ""
    aadhaar_verified: bool = False
    role: Literal["passenger", "owner", "both"] = "passenger"
    photo: str = ""
    rating_avg: float = 0.0
    rating_count: int = 0
    wallet_balance: float = 0.0
    referral_code: str = ""
    referred_by: str = ""
    referral_pending: bool = False
    driver_plus: dict = Field(default_factory=dict)
    suspended: bool = False
    created_at: str = Field(default_factory=now_iso)


class UserUpsert(BaseModel):
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None
    aadhaar_last4: Optional[str] = None
    role: Optional[str] = None
    photo: Optional[str] = None
    referral_code: Optional[str] = None  # someone else's code, applied at signup


class Vehicle(BaseModel):
    id: str = Field(default_factory=new_id)
    owner_id: str
    vehicle_type: Literal["two-wheeler", "auto", "sedan", "suv", "bus", "luxury"]
    make: str = ""
    model: str = ""
    plate: str
    seats_total: int
    fuel_type: str = "petrol"  # petrol | diesel | cng | ev
    rc_number: str = ""
    insurance_number: str = ""
    dl_number: str = ""
    photo: str = ""
    doc_photos: dict = Field(default_factory=dict)
    approved: bool = False  # pending admin review until docs verified
    created_at: str = Field(default_factory=now_iso)


class VehicleCreate(BaseModel):
    owner_id: str
    vehicle_type: str
    make: str = ""
    model: str = ""
    plate: str
    seats_total: int
    fuel_type: str = "petrol"
    rc_number: str = ""
    insurance_number: str = ""
    dl_number: str = ""
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


class RidePatch(BaseModel):
    status: Optional[str] = None


class Booking(BaseModel):
    id: str = Field(default_factory=new_id)
    ride_id: str
    passenger_id: str
    owner_id: str
    seats: int
    total_price: float
    status: Literal["pending", "accepted", "rejected", "completed", "cancelled"] = "pending"
    paid: bool = False
    seats_decremented: bool = False
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
    kind: Literal["topup", "ride_payment", "ride_earning", "commission", "withdraw"]
    note: str = ""
    created_at: str = Field(default_factory=now_iso)


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
    resolved: bool = False
    created_at: str = Field(default_factory=now_iso)


class SOSCreate(BaseModel):
    booking_id: str
    user_id: str
    location: str = ""


# ---------- Helpers ----------
PROJECT = {"_id": 0}


async def get_user(user_id: str) -> Optional[dict]:
    return await db.users.find_one({"id": user_id}, PROJECT)


async def credit_wallet(user_id: str, amount: float, kind: str, note: str):
    await db.users.update_one({"id": user_id}, {"$inc": {"wallet_balance": amount}})
    await db.wallet_txns.insert_one(
        WalletTxn(user_id=user_id, amount=amount, kind=kind, note=note).dict()
    )


async def refund_booking(b: dict, reason: str):
    """Full refund of a paid booking to the passenger, debited from owner wallet."""
    if not b.get("paid"):
        return
    owner = await get_user(b["owner_id"])
    owner_amt = b["total_price"]
    await credit_wallet(b["passenger_id"], b["total_price"], "topup", f"Refund: {reason}")
    if owner:
        await credit_wallet(b["owner_id"], -owner_amt * 0.9, "withdraw", f"Refund debit: {reason}")


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "PAID LIFT API running"}


# --- Auth (mock OTP) ---
@api_router.post("/auth/send-otp")
async def send_otp(payload: OTPRequest, request: Request):
    rate_limit(f"otp:{payload.phone}", 5, 60)
    return {"ok": True, "mock_otp": "123456", "phone": payload.phone}


@api_router.post("/auth/verify-otp")
async def verify_otp(payload: OTPVerify):
    if payload.otp != "123456":
        raise HTTPException(status_code=400, detail="Invalid OTP. Use 123456 for demo.")
    user = await db.users.find_one({"phone": payload.phone}, PROJECT)
    if user and user.get("suspended"):
        raise HTTPException(403, "Account suspended. Contact support.")
    if not user:
        u = UserProfile(phone=payload.phone, referral_code=referral_code_for("LIFT"))
        await db.users.insert_one(u.dict())
        return {"user": u.dict(), "is_new": True}
    return {"user": user, "is_new": False}


# --- Users ---
@api_router.post("/users/upsert")
async def upsert_user(payload: UserUpsert):
    user = await db.users.find_one({"phone": payload.phone}, PROJECT)
    updates = {k: v for k, v in payload.dict().items() if v is not None and k not in ("phone", "referral_code")}
    if updates.get("aadhaar_last4"):
        updates["aadhaar_verified"] = True  # mock
    if not user:
        u = UserProfile(phone=payload.phone, referral_code=referral_code_for(payload.name or "LIFT"), **updates)
        await db.users.insert_one(u.dict())
        user_id = u.id
    else:
        if updates:
            await db.users.update_one({"phone": payload.phone}, {"$set": updates})
        user_id = user["id"]

    # Apply referral code at signup (if provided and not yet referred)
    if payload.referral_code:
        fresh = await db.users.find_one({"id": user_id}, PROJECT)
        if fresh and not fresh.get("referred_by"):
            referrer = await db.users.find_one({"referral_code": payload.referral_code.upper().strip()}, PROJECT)
            if referrer and referrer["id"] != user_id:
                await db.users.update_one(
                    {"id": user_id},
                    {"$set": {"referred_by": referrer["id"], "referral_pending": True}},
                )
    return await db.users.find_one({"id": user_id}, PROJECT)


@api_router.get("/users/{user_id}")
async def get_user_route(user_id: str):
    u = await get_user(user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if not u.get("referral_code"):
        code = referral_code_for(u.get("name") or "LIFT")
        await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
        u["referral_code"] = code
    u["badges"] = await compute_badges(db, u)
    u["driver_plus_active"] = driver_plus_active(u)
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
    return await db.vehicles.find(q, PROJECT).to_list(1000)


# --- Rides ---
@api_router.post("/rides", response_model=Ride)
async def create_ride(payload: RideCreate):
    vehicle = await db.vehicles.find_one({"id": payload.vehicle_id}, PROJECT)
    if not vehicle:
        raise HTTPException(404, "Vehicle not found")
    if not vehicle.get("approved"):
        raise HTTPException(400, "Vehicle is pending admin approval. Upload clear RC/DL/insurance photos for faster review.")
    r = Ride(**payload.dict())
    await db.rides.insert_one(r.dict())
    return r


def _route_seq(ride: dict) -> List[str]:
    return [ride.get("from_location", "")] + list(ride.get("stops", [])) + [ride.get("to_location", "")]


def _corridor_match(ride: dict, frm: Optional[str], to: Optional[str]) -> bool:
    """Smart corridor matching: passenger's from/to must appear along the ride's
    route sequence (from → stops → to), in order, case-insensitive substring."""
    seq = [s.lower() for s in _route_seq(ride)]
    def find_idx(term: str, start: int = 0) -> int:
        for i in range(start, len(seq)):
            if term in seq[i] or seq[i] in term:
                return i
        return -1
    if frm:
        fi = find_idx(frm.lower())
        if fi < 0:
            return False
    else:
        fi = 0
    if to:
        ti = find_idx(to.lower(), fi + 1)
        if ti < 0:
            return False
    return True


@api_router.get("/rides")
async def search_rides(
    from_location: Optional[str] = None,
    to_location: Optional[str] = None,
    date: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    women_only: Optional[bool] = None,
    fuel_type: Optional[str] = None,
    owner_id: Optional[str] = None,
):
    q: dict = {"status": "open"}
    if owner_id:
        q = {"owner_id": owner_id}
    else:
        # Auto-expire: hide rides departing more than 3h in the past
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
        q["depart_at"] = {"$gte": cutoff}
        if vehicle_type and vehicle_type != "all":
            q["vehicle_type"] = vehicle_type
        if women_only:
            q["women_only"] = True
        if date:
            q["depart_at"] = {"$regex": f"^{date}", "$gte": cutoff}
        # Broad DB filter to keep result set small; corridor match below refines
        if from_location:
            q["$or"] = [
                {"from_location": {"$regex": from_location, "$options": "i"}},
                {"stops": {"$regex": from_location, "$options": "i"}},
            ]
    docs = await db.rides.find(q, PROJECT).to_list(1000)

    # Corridor matching refinement
    if not owner_id and (from_location or to_location):
        docs = [d for d in docs if _corridor_match(d, from_location, to_location)]

    # Enrich + fuel filter + Driver Plus priority
    enriched = []
    for d in docs:
        owner = await get_user(d["owner_id"]) or {}
        vehicle = await db.vehicles.find_one({"id": d["vehicle_id"]}, PROJECT) or {}
        if fuel_type and vehicle.get("fuel_type") != fuel_type:
            continue
        d["owner"] = owner
        d["vehicle"] = vehicle
        d["owner_badges"] = await compute_badges(db, owner) if owner else []
        d["driver_plus"] = driver_plus_active(owner) if owner else False
        enriched.append(d)

    # Priority listing: Driver Plus owners first, then by departure time
    enriched.sort(key=lambda d: (not d["driver_plus"], d["depart_at"]))
    return enriched


@api_router.get("/rides/{ride_id}")
async def get_ride(ride_id: str):
    r = await db.rides.find_one({"id": ride_id}, PROJECT)
    if not r:
        raise HTTPException(404, "Ride not found")
    owner = await get_user(r["owner_id"]) or {}
    r["owner"] = owner
    r["owner_badges"] = await compute_badges(db, owner) if owner else []
    r["vehicle"] = await db.vehicles.find_one({"id": r["vehicle_id"]}, PROJECT) or {}
    return r


@api_router.patch("/rides/{ride_id}")
async def update_ride(ride_id: str, payload: RidePatch):
    r = await db.rides.find_one({"id": ride_id}, PROJECT)
    if not r:
        raise HTTPException(404, "Ride not found")
    if payload.status == "cancelled":
        # Cancel all active bookings, refund paid ones, restore seats
        bookings = await db.bookings.find(
            {"ride_id": ride_id, "status": {"$in": ["pending", "accepted"]}}, PROJECT
        ).to_list(500)
        for b in bookings:
            if b.get("seats_decremented"):
                await db.rides.update_one({"id": ride_id}, {"$inc": {"seats_available": b["seats"]}})
            await refund_booking(b, "ride cancelled by driver")
            await db.bookings.update_one({"id": b["id"]}, {"$set": {"status": "cancelled"}})
            try:
                await send_push([b["passenger_id"]], {
                    "title": "Ride Cancelled",
                    "message": f"{r['from_location']} → {r['to_location']} was cancelled by the driver.{' Full refund issued to wallet.' if b.get('paid') else ''}",
                    "action_url": "/(tabs)/rides",
                })
            except Exception:
                pass
    await db.rides.update_one({"id": ride_id}, {"$set": {"status": payload.status}})
    return await db.rides.find_one({"id": ride_id}, PROJECT)


# --- Bookings ---
@api_router.post("/bookings")
async def create_booking(payload: BookingCreate):
    ride = await db.rides.find_one({"id": payload.ride_id}, PROJECT)
    if not ride:
        raise HTTPException(404, "Ride not found")
    if payload.passenger_id == ride["owner_id"]:
        raise HTTPException(400, "Self-booking disallowed")
    if ride["status"] != "open":
        raise HTTPException(400, "Ride is not open for booking")
    if ride.get("women_only"):
        passenger = await get_user(payload.passenger_id)
        if not passenger or passenger.get("gender") != "female":
            raise HTTPException(400, "This ride is women-only")
    if ride["seats_available"] < payload.seats:
        raise HTTPException(400, "Not enough seats available")
    b = Booking(
        ride_id=payload.ride_id,
        passenger_id=payload.passenger_id,
        owner_id=ride["owner_id"],
        seats=payload.seats,
        total_price=ride["price_per_seat"] * payload.seats,
    )
    await db.bookings.insert_one(b.dict())
    passenger = await get_user(payload.passenger_id)
    try:
        await send_push([ride["owner_id"]], {
            "title": "New Booking Request",
            "message": f"{passenger.get('name','A passenger')} requested {payload.seats} seat(s) · {ride['from_location']} → {ride['to_location']} · ₹{b.total_price:.0f}",
            "action_url": f"/booking/{b.id}",
        }, idempotency_key=f"booking-{b.id}")
    except Exception as e:
        logging.getLogger(__name__).warning(f"Push failed (non-blocking): {e}")
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
        if not b.get("seats_decremented") and not b.get("paid"):
            ride = await db.rides.find_one({"id": b["ride_id"]}, PROJECT)
            if not ride or ride["seats_available"] < b["seats"]:
                raise HTTPException(400, "Not enough seats left to accept this booking")
            res = await db.rides.update_one(
                {"id": b["ride_id"], "seats_available": {"$gte": b["seats"]}},
                {"$inc": {"seats_available": -b["seats"]}},
            )
            if res.modified_count != 1:
                raise HTTPException(400, "Not enough seats left to accept this booking")
            updates["seats_decremented"] = True
        try:
            await send_push([b["passenger_id"]], {
                "title": "Booking Accepted 🎉",
                "message": "Your seat is confirmed. Pay now to lock it in.",
                "action_url": f"/booking/{booking_id}",
            }, idempotency_key=f"accept-{booking_id}")
        except Exception:
            pass

    if updates.get("status") == "rejected":
        try:
            await send_push([b["passenger_id"]], {
                "title": "Booking Declined",
                "message": "The driver couldn't take this request. Try another ride.",
                "action_url": "/(tabs)/home",
            }, idempotency_key=f"reject-{booking_id}")
        except Exception:
            pass

    if updates.get("status") == "cancelled":
        # Passenger/driver cancellation with refund + seat restore
        if b.get("seats_decremented"):
            await db.rides.update_one({"id": b["ride_id"]}, {"$inc": {"seats_available": b["seats"]}})
        await refund_booking(b, "booking cancelled")

    if updates.get("paid"):
        # wallet-pay path (internal transfer, Driver Plus commission waiver)
        owner = await get_user(b["owner_id"])
        commission = 0.0 if (owner and driver_plus_active(owner)) else round(b["total_price"] * 0.10, 2)
        owner_amt = b["total_price"] - commission
        await db.users.update_one({"id": b["passenger_id"]}, {"$inc": {"wallet_balance": -b["total_price"]}})
        await db.users.update_one({"id": b["owner_id"]}, {"$inc": {"wallet_balance": owner_amt}})
        await db.wallet_txns.insert_one(WalletTxn(user_id=b["passenger_id"], amount=-b["total_price"], kind="ride_payment", note=f"Booking {booking_id}").dict())
        await db.wallet_txns.insert_one(WalletTxn(user_id=b["owner_id"], amount=owner_amt, kind="ride_earning", note=f"Booking {booking_id}").dict())
        if commission > 0:
            await db.wallet_txns.insert_one(WalletTxn(user_id=b["owner_id"], amount=-commission, kind="commission", note=f"Booking {booking_id} platform fee").dict())
        elif owner and driver_plus_active(owner):
            await db.users.update_one({"id": b["owner_id"]}, {"$inc": {"driver_plus.rides_left": -1}})

    await db.bookings.update_one({"id": booking_id}, {"$set": updates})

    if updates.get("status") == "completed":
        # Referral payout: passenger's first completed ride
        features_router.maybe_pay_referral and await _pay_referral_hook(b["passenger_id"])

    return await db.bookings.find_one({"id": booking_id}, PROJECT)


async def _pay_referral_hook(passenger_id: str):
    from features import REFERRAL_BONUS
    user = await get_user(passenger_id)
    if not user or not user.get("referral_pending"):
        return
    completed = await db.bookings.count_documents({"passenger_id": passenger_id, "status": "completed"})
    if completed < 1:
        return
    referrer_id = user.get("referred_by")
    await db.users.update_one({"id": passenger_id}, {"$set": {"referral_pending": False}})
    for uid, note in [
        (passenger_id, "Referral bonus — first ride completed 🎉"),
        (referrer_id, f"Referral bonus — {user.get('name','your friend')} completed their first ride"),
    ]:
        await credit_wallet(uid, REFERRAL_BONUS, "topup", note)
        try:
            await send_push([uid], {"title": "Referral Bonus ₹50 🎁", "message": note, "action_url": "/(tabs)/wallet"})
        except Exception:
            pass


# --- Chat ---
@api_router.get("/chat/{booking_id}")
async def list_chat(booking_id: str):
    return await db.chat.find({"booking_id": booking_id}, PROJECT).sort("created_at", 1).to_list(500)


@api_router.post("/chat")
async def create_chat(payload: ChatCreate):
    m = ChatMessage(**payload.dict())
    await db.chat.insert_one(m.dict())
    # Real-time fanout
    await chat_manager.broadcast(payload.booking_id, m.dict())
    # Push to recipient
    try:
        booking = await db.bookings.find_one({"id": payload.booking_id}, PROJECT)
        if booking:
            recipient = booking["owner_id"] if payload.sender_id == booking["passenger_id"] else booking["passenger_id"]
            sender = await get_user(payload.sender_id)
            await send_push([recipient], {
                "title": sender.get("name", "New message") if sender else "New message",
                "message": payload.text[:100],
                "action_url": f"/chat/{payload.booking_id}",
            })
    except Exception:
        pass
    return m.dict()


@api_router.websocket("/chat/ws/{booking_id}")
async def chat_ws(websocket: WebSocket, booking_id: str):
    await chat_manager.connect(booking_id, websocket)
    try:
        while True:
            # keepalive — client may send pings; we mostly push
            await websocket.receive_text()
    except WebSocketDisconnect:
        chat_manager.disconnect(booking_id, websocket)
    except Exception:
        chat_manager.disconnect(booking_id, websocket)


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
    await credit_wallet(user_id, amount, "topup", "Wallet top-up (direct)")
    return {"ok": True}


# --- Ratings ---
@api_router.post("/ratings")
async def create_rating(payload: RatingCreate):
    r = Rating(**payload.dict())
    await db.ratings.insert_one(r.dict())
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
        "pending_vehicles": await db.vehicles.count_documents({"approved": False}),
        "pending_withdrawals": await db.withdrawals.count_documents({"status": "pending"}),
        "open_sos": await db.sos.count_documents({"resolved": {"$ne": True}}),
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
    if await db.rides.count_documents({}) > 0:
        return {"ok": True, "seeded": False, "note": "Data already present"}
    owner1 = UserProfile(
        phone="+919000000001", name="Rahul Verma", email="rahul@example.com", gender="male",
        aadhaar_last4="1234", aadhaar_verified=True, role="owner",
        rating_avg=4.6, rating_count=42, referral_code=referral_code_for("Rahul"),
    )
    owner2 = UserProfile(
        phone="+919000000002", name="Priya Sharma", email="priya@example.com", gender="female",
        aadhaar_last4="5678", aadhaar_verified=True, role="owner",
        rating_avg=4.9, rating_count=88, referral_code=referral_code_for("Priya"),
        driver_plus={"active": True, "rides_left": 20, "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()},
    )
    owner3 = UserProfile(
        phone="+919000000003", name="Amit Patel", email="amit@example.com", gender="male",
        aadhaar_last4="9999", aadhaar_verified=True, role="owner",
        rating_avg=4.3, rating_count=17, referral_code=referral_code_for("Amit"),
    )
    await db.users.insert_many([owner1.dict(), owner2.dict(), owner3.dict()])

    v1 = Vehicle(owner_id=owner1.id, vehicle_type="sedan", make="Honda", model="City", plate="MH12AB1234",
                 seats_total=4, fuel_type="petrol", rc_number="RC001", insurance_number="INS001", dl_number="DL001", approved=True)
    v2 = Vehicle(owner_id=owner2.id, vehicle_type="suv", make="Toyota", model="Innova", plate="DL8CAF5678",
                 seats_total=6, fuel_type="diesel", rc_number="RC002", insurance_number="INS002", dl_number="DL002", approved=True)
    v3 = Vehicle(owner_id=owner3.id, vehicle_type="auto", make="Bajaj", model="RE EV", plate="GJ01AA9999",
                 seats_total=3, fuel_type="ev", rc_number="RC003", insurance_number="INS003", dl_number="DL003", approved=True)
    await db.vehicles.insert_many([v1.dict(), v2.dict(), v3.dict()])

    base = datetime.now(timezone.utc).replace(hour=8, minute=0, second=0, microsecond=0)
    rides = [
        Ride(owner_id=owner1.id, vehicle_id=v1.id, from_location="Mumbai", to_location="Pune",
             stops=["Lonavala"], depart_at=(base + timedelta(days=1)).isoformat(),
             seats_available=3, price_per_seat=450, vehicle_type="sedan",
             notes="Non-stop AC ride. Highway route via Expressway."),
        Ride(owner_id=owner2.id, vehicle_id=v2.id, from_location="Delhi", to_location="Jaipur",
             stops=["Gurugram", "Behror"], depart_at=(base + timedelta(days=1, hours=2)).isoformat(),
             seats_available=5, price_per_seat=600, vehicle_type="suv",
             notes="Comfortable SUV, spacious luggage room.", women_only=False),
        Ride(owner_id=owner3.id, vehicle_id=v3.id, from_location="Ahmedabad", to_location="Vadodara",
             stops=[], depart_at=(base + timedelta(days=2)).isoformat(),
             seats_available=2, price_per_seat=180, vehicle_type="auto",
             notes="Budget-friendly electric auto ride. Zero emissions!"),
        Ride(owner_id=owner1.id, vehicle_id=v1.id, from_location="Bengaluru", to_location="Mysuru",
             stops=["Ramanagara"], depart_at=(base + timedelta(days=3)).isoformat(),
             seats_available=4, price_per_seat=400, vehicle_type="sedan"),
        Ride(owner_id=owner2.id, vehicle_id=v2.id, from_location="Delhi", to_location="Jaipur",
             stops=["Gurugram"], depart_at=(base + timedelta(days=2, hours=6)).isoformat(),
             seats_available=4, price_per_seat=550, vehicle_type="suv",
             notes="Women-only ride. Safe, verified co-passengers.", women_only=True),
    ]
    await db.rides.insert_many([r.dict() for r in rides])
    return {"ok": True, "seeded": True, "rides": len(rides)}


# Include routers
app.include_router(api_router)
app.include_router(build_payments_router(db, API_PUBLIC_URL))
app.include_router(build_maps_router(db))
app.include_router(push_router)
app.include_router(build_storage_router(db))
features_router = build_features_router(db)
app.include_router(features_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    try:
        if await db.rides.count_documents({}) == 0:
            await seed_demo()
            logger.info("Demo data seeded.")
    except Exception as e:
        logger.warning(f"Seed failed: {e}")
    try:
        init_storage()
        logger.info("Object storage initialised.")
    except Exception as e:
        logger.warning(f"Storage init deferred: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
