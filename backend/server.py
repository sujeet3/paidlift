from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="PAID LIFT API")
api_router = APIRouter(prefix="/api")

# Payments router (Razorpay + PhonePe + Simulator fallback)
from payments import build_router as build_payments_router  # noqa: E402
from maps import build_router as build_maps_router  # noqa: E402
API_PUBLIC_URL = os.environ.get("API_PUBLIC_URL", "http://localhost:8001")


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
    photo: str = ""  # base64 or url
    rating_avg: float = 0.0
    rating_count: int = 0
    wallet_balance: float = 0.0
    created_at: str = Field(default_factory=now_iso)


class UserUpsert(BaseModel):
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
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
    photo: str = ""
    approved: bool = True
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


# --- Auth (mock OTP) ---
@api_router.post("/auth/send-otp")
async def send_otp(payload: OTPRequest):
    # Mock: always succeed. OTP is 123456.
    return {"ok": True, "mock_otp": "123456", "phone": payload.phone}


@api_router.post("/auth/verify-otp")
async def verify_otp(payload: OTPVerify):
    if payload.otp != "123456":
        raise HTTPException(status_code=400, detail="Invalid OTP. Use 123456 for demo.")
    user = await db.users.find_one({"phone": payload.phone}, PROJECT)
    if not user:
        u = UserProfile(phone=payload.phone)
        await db.users.insert_one(u.dict())
        return {"user": u.dict(), "is_new": True}
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
):
    q: dict = {"status": "open"}
    if owner_id:
        q = {"owner_id": owner_id}
    else:
        if from_location:
            q["from_location"] = {"$regex": from_location, "$options": "i"}
        if to_location:
            q["to_location"] = {"$regex": to_location, "$options": "i"}
        if vehicle_type and vehicle_type != "all":
            q["vehicle_type"] = vehicle_type
        if date:
            q["depart_at"] = {"$regex": f"^{date}"}
    docs = await db.rides.find(q, PROJECT).sort("depart_at", 1).to_list(500)
    # enrich with owner + vehicle
    for d in docs:
        d["owner"] = await get_user(d["owner_id"]) or {}
        d["vehicle"] = await db.vehicles.find_one({"id": d["vehicle_id"]}, PROJECT) or {}
    return docs


@api_router.get("/rides/{ride_id}")
async def get_ride(ride_id: str):
    r = await db.rides.find_one({"id": ride_id}, PROJECT)
    if not r:
        raise HTTPException(404, "Ride not found")
    r["owner"] = await get_user(r["owner_id"]) or {}
    r["vehicle"] = await db.vehicles.find_one({"id": r["vehicle_id"]}, PROJECT) or {}
    return r


# --- Bookings ---
@api_router.post("/bookings")
async def create_booking(payload: BookingCreate):
    ride = await db.rides.find_one({"id": payload.ride_id}, PROJECT)
    if not ride:
        raise HTTPException(404, "Ride not found")
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
        # decrement seats only if not already decremented and enough available
        if not b.get("seats_decremented") and not b.get("paid"):
            ride = await db.rides.find_one({"id": b["ride_id"]}, PROJECT)
            if ride and ride["seats_available"] >= b["seats"]:
                await db.rides.update_one(
                    {"id": b["ride_id"], "seats_available": {"$gte": b["seats"]}},
                    {"$inc": {"seats_available": -b["seats"]}},
                )
                updates["seats_decremented"] = True
    if updates.get("paid"):
        # wallet: debit passenger, credit owner (minus 10% commission)
        commission = round(b["total_price"] * 0.10, 2)
        owner_amt = b["total_price"] - commission
        await db.users.update_one({"id": b["passenger_id"]}, {"$inc": {"wallet_balance": -b["total_price"]}})
        await db.users.update_one({"id": b["owner_id"]}, {"$inc": {"wallet_balance": owner_amt}})
        await db.wallet_txns.insert_one(WalletTxn(user_id=b["passenger_id"], amount=-b["total_price"], kind="ride_payment", note=f"Booking {booking_id}").dict())
        await db.wallet_txns.insert_one(WalletTxn(user_id=b["owner_id"], amount=owner_amt, kind="ride_earning", note=f"Booking {booking_id}").dict())
        await db.wallet_txns.insert_one(WalletTxn(user_id=b["owner_id"], amount=-commission, kind="commission", note=f"Booking {booking_id} platform fee").dict())
    await db.bookings.update_one({"id": booking_id}, {"$set": updates})
    return await db.bookings.find_one({"id": booking_id}, PROJECT)


# --- Chat ---
@api_router.get("/chat/{booking_id}")
async def list_chat(booking_id: str):
    return await db.chat.find({"booking_id": booking_id}, PROJECT).sort("created_at", 1).to_list(500)


@api_router.post("/chat")
async def create_chat(payload: ChatCreate):
    m = ChatMessage(**payload.dict())
    await db.chat.insert_one(m.dict())
    return m.dict()


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


# Include router
app.include_router(api_router)
app.include_router(build_payments_router(db, API_PUBLIC_URL))
app.include_router(build_maps_router(db))

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
