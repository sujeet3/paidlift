"""
PAID LIFT — Enterprise Super Admin Router & Full-Authority CRUD Engine
Provides unrestricted, role-based administrative control across all platform entities:
- Users (CRUD, 360-degree audit, wallet balance adjust, Aadhaar override, suspension)
- Vehicles (CRUD, KYC review, approve, reject with reason)
- Rides (CRUD, force-cancel with automatic passenger wallet refund, status overrides)
- Bookings (CRUD, manual status transition, seat recalculation, force-refund)
- SOS Alerts (CRUD, emergency dispatch tracking, acknowledge, resolve with notes)
- Financial Ledger & Payouts (Platform commission revenue, GMV, driver withdrawal approvals)
- System Settings & Maintenance (Dynamic commission %, expired ride cleanup, seat reconciliation)

Authentication:
- Validates 'X-Admin-Key' header against ADMIN_SECRET_KEY env variable
- Or validates Authorization Bearer token
"""
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Literal, Dict, Any

from fastapi import APIRouter, HTTPException, Header, Depends, Query, Request
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

PROJECT = {"_id": 0}
ADMIN_SECRET_KEY = os.environ.get("ADMIN_SECRET_KEY", "paidlift_superadmin_secret_2026")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ==================== Pydantic Schemas for Admin CRUD ====================

class AdminAuthRequest(BaseModel):
    admin_key: str
    username: Optional[str] = "admin"


class AdminAuthResponse(BaseModel):
    success: bool
    token: str
    role: str = "superadmin"
    authenticated_at: str


class AdminUserCreate(BaseModel):
    phone: str
    name: str = ""
    email: str = ""
    role: Literal["passenger", "owner", "both", "admin"] = "passenger"
    aadhaar_last4: str = ""
    aadhaar_verified: bool = False
    wallet_balance: float = 0.0
    status: Literal["active", "suspended", "banned"] = "active"


class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[Literal["passenger", "owner", "both", "admin"]] = None
    aadhaar_last4: Optional[str] = None
    aadhaar_verified: Optional[bool] = None
    status: Optional[Literal["active", "suspended", "banned"]] = None
    rating_avg: Optional[float] = None
    rating_count: Optional[int] = None
    moderation_notes: Optional[str] = None


class AdminWalletAdjust(BaseModel):
    amount: float  # positive for credit, negative for debit
    reason: str
    admin_id: Optional[str] = "superadmin"


class AdminVehicleCreate(BaseModel):
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


class AdminVehicleUpdate(BaseModel):
    vehicle_type: Optional[Literal["two-wheeler", "auto", "sedan", "suv", "bus", "luxury"]] = None
    make: Optional[str] = None
    model: Optional[str] = None
    plate: Optional[str] = None
    seats_total: Optional[int] = None
    rc_number: Optional[str] = None
    insurance_number: Optional[str] = None
    dl_number: Optional[str] = None
    photo: Optional[str] = None
    approved: Optional[bool] = None
    rejection_reason: Optional[str] = None


class AdminVehicleReview(BaseModel):
    approved: bool
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None


class AdminRideCreate(BaseModel):
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
    status: Literal["open", "in_progress", "completed", "cancelled"] = "open"


class AdminRideUpdate(BaseModel):
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    stops: Optional[List[str]] = None
    depart_at: Optional[str] = None
    seats_available: Optional[int] = None
    price_per_seat: Optional[float] = None
    vehicle_type: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Literal["open", "in_progress", "completed", "cancelled"]] = None


class AdminForceCancelRide(BaseModel):
    reason: str
    refund_passengers: bool = True


class AdminBookingCreate(BaseModel):
    ride_id: str
    passenger_id: str
    seats: int
    status: Literal["pending", "accepted", "rejected", "completed", "cancelled"] = "accepted"
    paid: bool = False


class AdminBookingUpdate(BaseModel):
    seats: Optional[int] = None
    status: Optional[Literal["pending", "accepted", "rejected", "completed", "cancelled"]] = None
    paid: Optional[bool] = None
    total_price: Optional[float] = None


class AdminSOSUpdate(BaseModel):
    status: Literal["active", "investigating", "police_notified", "resolved"]
    resolution_notes: Optional[str] = None
    officer_assigned: Optional[str] = None


class AdminPayoutProcess(BaseModel):
    action: Literal["approve", "reject"]
    transaction_ref: Optional[str] = None
    rejection_reason: Optional[str] = None


class AdminPlatformSettings(BaseModel):
    commission_percentage: Optional[float] = Field(default=10.0, ge=0.0, le=50.0)
    emergency_contact_number: Optional[str] = "112"
    support_phone: Optional[str] = "+918000000000"
    auto_expire_hours_after_departure: Optional[int] = 2
    maintenance_mode: Optional[bool] = False


# ==================== Admin Router Builder ====================

def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/api/admin", tags=["Super Admin"])

    # ---------- Admin Security Guard ----------
    async def verify_admin(
        request: Request,
        x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
        authorization: Optional[str] = Header(None, alias="Authorization"),
    ):
        """
        Grants full super-admin access if:
        1. X-Admin-Key matches ADMIN_SECRET_KEY, OR
        2. Authorization header has Bearer <ADMIN_SECRET_KEY>, OR
        3. Query param ?admin_key=... matches
        """
        query_key = request.query_params.get("admin_key")
        token = None
        if authorization and authorization.startswith("Bearer "):
            token = authorization[7:].strip()

        key = x_admin_key or token or query_key
        if not key or key != ADMIN_SECRET_KEY:
            raise HTTPException(
                status_code=401,
                detail={"error": "UNAUTHORIZED_ADMIN", "message": "Super Admin authentication required. Provide valid X-Admin-Key header."}
            )
        return True

    # ---------- Auth Endpoints ----------
    @router.post("/auth/login", response_model=AdminAuthResponse)
    async def admin_login(payload: AdminAuthRequest):
        if payload.admin_key != ADMIN_SECRET_KEY:
            raise HTTPException(401, "Invalid Admin Credentials")
        return AdminAuthResponse(
            success=True,
            token=ADMIN_SECRET_KEY,
            role="superadmin",
            authenticated_at=now_iso(),
        )

    @router.get("/auth/verify", dependencies=[Depends(verify_admin)])
    async def admin_verify():
        return {"valid": True, "role": "superadmin", "timestamp": now_iso()}

    # ==================== 1. PLATFORM OVERVIEW & REVENUE ANALYTICS ====================
    @router.get("/stats", dependencies=[Depends(verify_admin)])
    async def get_overview_stats():
        """Aggregated platform-wide metrics with financial counters."""
        total_users = await db.users.count_documents({})
        total_vehicles = await db.vehicles.count_documents({})
        pending_vehicles = await db.vehicles.count_documents({"approved": False})
        total_rides = await db.rides.count_documents({})
        active_rides = await db.rides.count_documents({"status": "open"})
        total_bookings = await db.bookings.count_documents({})
        active_sos = await db.sos.count_documents({"status": {"$in": ["active", "investigating", None]}})

        # Financial totals from bookings
        completed_bookings = await db.bookings.find({"status": "completed", "paid": True}, PROJECT).to_list(10000)
        gmv = sum(b.get("total_price", 0.0) for b in completed_bookings)
        platform_revenue = round(gmv * 0.10, 2)  # 10% standard commission

        # Total wallet balances in circulation
        users = await db.users.find({}, {"wallet_balance": 1}).to_list(10000)
        total_wallet_liability = round(sum(u.get("wallet_balance", 0.0) for u in users), 2)

        return {
            "counts": {
                "users": total_users,
                "vehicles": total_vehicles,
                "pending_vehicles": pending_vehicles,
                "rides": total_rides,
                "active_rides": active_rides,
                "bookings": total_bookings,
                "active_sos": active_sos,
            },
            "financials": {
                "gmv": gmv,
                "platform_revenue": platform_revenue,
                "wallet_liability": total_wallet_liability,
            },
            "system_time": now_iso(),
        }

    # ==================== 2. USERS: FULL CRUD & MODERATION ====================
    @router.post("/users", dependencies=[Depends(verify_admin)])
    async def create_user_admin(payload: AdminUserCreate):
        """Admin creates any user profile directly with specified balances and roles."""
        existing = await db.users.find_one({"phone": payload.phone})
        if existing:
            raise HTTPException(400, "User with this phone number already exists")

        user_doc = payload.dict()
        user_doc["id"] = new_id()
        user_doc["created_at"] = now_iso()
        user_doc["rating_avg"] = 5.0
        user_doc["rating_count"] = 0
        await db.users.insert_one(user_doc)
        return await db.users.find_one({"id": user_doc["id"]}, PROJECT)

    @router.get("/users", dependencies=[Depends(verify_admin)])
    async def list_users_admin(
        query: Optional[str] = None,
        role: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = Query(100, le=500),
        skip: int = 0
    ):
        """List users with search filters on phone, name, email, role, or status."""
        filters: Dict[str, Any] = {}
        if role:
            filters["role"] = role
        if status:
            filters["status"] = status
        if query:
            filters["$or"] = [
                {"name": {"$regex": query, "$options": "i"}},
                {"phone": {"$regex": query, "$options": "i"}},
                {"email": {"$regex": query, "$options": "i"}},
            ]

        users = await db.users.find(filters, PROJECT).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        total = await db.users.count_documents(filters)
        return {"total": total, "users": users}

    @router.get("/users/{user_id}", dependencies=[Depends(verify_admin)])
    async def get_user_360(user_id: str):
        """Comprehensive 360-degree user inspection (profile, vehicles, rides, bookings, ledger)."""
        user = await db.users.find_one({"id": user_id}, PROJECT)
        if not user:
            raise HTTPException(404, "User not found")

        vehicles = await db.vehicles.find({"owner_id": user_id}, PROJECT).to_list(50)
        rides_posted = await db.rides.find({"owner_id": user_id}, PROJECT).sort("created_at", -1).limit(20).to_list(20)
        bookings_taken = await db.bookings.find({"passenger_id": user_id}, PROJECT).sort("created_at", -1).limit(20).to_list(20)
        wallet_txns = await db.wallet_txns.find({"user_id": user_id}, PROJECT).sort("created_at", -1).limit(30).to_list(30)

        return {
            "user": user,
            "vehicles": vehicles,
            "rides_posted": rides_posted,
            "bookings_taken": bookings_taken,
            "wallet_transactions": wallet_txns,
        }

    @router.patch("/users/{user_id}", dependencies=[Depends(verify_admin)])
    async def update_user_admin(user_id: str, payload: AdminUserUpdate):
        """Update any user profile attribute, status (active/suspended/banned), or Aadhaar flag."""
        updates = {k: v for k, v in payload.dict().items() if v is not None}
        if not updates:
            raise HTTPException(400, "No fields to update")

        res = await db.users.update_one({"id": user_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "User not found")
        return await db.users.find_one({"id": user_id}, PROJECT)

    @router.post("/users/{user_id}/wallet-adjust", dependencies=[Depends(verify_admin)])
    async def adjust_user_wallet(user_id: str, payload: AdminWalletAdjust):
        """Credit or debit user wallet with full audit logging in wallet_txns."""
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(404, "User not found")

        new_bal = round(user.get("wallet_balance", 0.0) + payload.amount, 2)
        if new_bal < 0:
            raise HTTPException(400, f"Insufficient funds. Resulting balance would be negative: ₹{new_bal}")

        await db.users.update_one({"id": user_id}, {"$set": {"wallet_balance": new_bal}})

        txn = {
            "id": new_id(),
            "user_id": user_id,
            "amount": payload.amount,
            "kind": "admin_adjustment",
            "note": f"Admin Adjustment: {payload.reason} (by {payload.admin_id})",
            "created_at": now_iso(),
        }
        await db.wallet_txns.insert_one(txn)
        return {"user_id": user_id, "previous_balance": user.get("wallet_balance", 0.0), "new_balance": new_bal, "transaction_id": txn["id"]}

    @router.delete("/users/{user_id}", dependencies=[Depends(verify_admin)])
    async def delete_user_admin(user_id: str, purge: bool = False):
        """
        Soft-deactivates user (status: banned) or permanently purges if ?purge=true.
        """
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(404, "User not found")

        if purge:
            await db.users.delete_one({"id": user_id})
            await db.vehicles.delete_many({"owner_id": user_id})
            await db.rides.delete_many({"owner_id": user_id})
            return {"deleted": True, "purged": True, "user_id": user_id}
        else:
            await db.users.update_one({"id": user_id}, {"$set": {"status": "banned", "moderation_notes": "Banned by Admin"}})
            # Also cancel all open rides
            await db.rides.update_many({"owner_id": user_id, "status": "open"}, {"$set": {"status": "cancelled"}})
            return {"deleted": True, "purged": False, "status": "banned", "user_id": user_id}

    # ==================== 3. VEHICLES: FULL CRUD & KYC APPROVAL ====================
    @router.post("/vehicles", dependencies=[Depends(verify_admin)])
    async def create_vehicle_admin(payload: AdminVehicleCreate):
        """Admin creates/registers a vehicle for any driver."""
        owner = await db.users.find_one({"id": payload.owner_id})
        if not owner:
            raise HTTPException(404, "Owner user not found")

        doc = payload.dict()
        doc["id"] = new_id()
        doc["created_at"] = now_iso()
        await db.vehicles.insert_one(doc)
        return await db.vehicles.find_one({"id": doc["id"]}, PROJECT)

    @router.get("/vehicles", dependencies=[Depends(verify_admin)])
    async def list_vehicles_admin(
        status: Optional[Literal["all", "pending", "approved", "rejected"]] = "all",
        query: Optional[str] = None,
        limit: int = 100,
        skip: int = 0
    ):
        """List vehicles with status filters (pending/approved) and plate search."""
        filters: Dict[str, Any] = {}
        if status == "pending":
            filters["approved"] = False
            filters["rejection_reason"] = {"$in": [None, ""]}
        elif status == "approved":
            filters["approved"] = True
        elif status == "rejected":
            filters["approved"] = False
            filters["rejection_reason"] = {"$exists": True, "$ne": ""}

        if query:
            filters["$or"] = [
                {"plate": {"$regex": query, "$options": "i"}},
                {"make": {"$regex": query, "$options": "i"}},
                {"model": {"$regex": query, "$options": "i"}},
                {"rc_number": {"$regex": query, "$options": "i"}},
            ]

        vehicles = await db.vehicles.find(filters, PROJECT).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        # Attach owner mini-profile
        for v in vehicles:
            v["owner"] = await db.users.find_one({"id": v["owner_id"]}, {"name": 1, "phone": 1, "email": 1, "_id": 0}) or {}
        total = await db.vehicles.count_documents(filters)
        return {"total": total, "vehicles": vehicles}

    @router.get("/vehicles/{vehicle_id}", dependencies=[Depends(verify_admin)])
    async def get_vehicle_admin(vehicle_id: str):
        v = await db.vehicles.find_one({"id": vehicle_id}, PROJECT)
        if not v:
            raise HTTPException(404, "Vehicle not found")
        v["owner"] = await db.users.find_one({"id": v["owner_id"]}, PROJECT) or {}
        return v

    @router.patch("/vehicles/{vehicle_id}", dependencies=[Depends(verify_admin)])
    async def update_vehicle_admin(vehicle_id: str, payload: AdminVehicleUpdate):
        updates = {k: v for k, v in payload.dict().items() if v is not None}
        if not updates:
            raise HTTPException(400, "No fields to update")
        res = await db.vehicles.update_one({"id": vehicle_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "Vehicle not found")
        return await db.vehicles.find_one({"id": vehicle_id}, PROJECT)

    @router.post("/vehicles/{vehicle_id}/review", dependencies=[Depends(verify_admin)])
    async def review_vehicle_admin(vehicle_id: str, payload: AdminVehicleReview):
        """Approve or reject vehicle document KYC verification."""
        v = await db.vehicles.find_one({"id": vehicle_id})
        if not v:
            raise HTTPException(404, "Vehicle not found")

        updates: Dict[str, Any] = {
            "approved": payload.approved,
            "reviewed_at": now_iso(),
        }
        if not payload.approved:
            updates["rejection_reason"] = payload.rejection_reason or "Document verification failed"
        else:
            updates["rejection_reason"] = ""

        if payload.notes:
            updates["admin_review_notes"] = payload.notes

        await db.vehicles.update_one({"id": vehicle_id}, {"$set": updates})
        return await db.vehicles.find_one({"id": vehicle_id}, PROJECT)

    @router.delete("/vehicles/{vehicle_id}", dependencies=[Depends(verify_admin)])
    async def delete_vehicle_admin(vehicle_id: str):
        res = await db.vehicles.delete_one({"id": vehicle_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Vehicle not found")
        return {"deleted": True, "vehicle_id": vehicle_id}

    # ==================== 4. RIDES: FULL CRUD & FORCE CANCELLATION ====================
    @router.post("/rides", dependencies=[Depends(verify_admin)])
    async def create_ride_admin(payload: AdminRideCreate):
        """Admin creates or schedules a ride directly."""
        owner = await db.users.find_one({"id": payload.owner_id})
        if not owner:
            raise HTTPException(404, "Owner not found")

        doc = payload.dict()
        doc["id"] = new_id()
        doc["created_at"] = now_iso()
        await db.rides.insert_one(doc)
        return await db.rides.find_one({"id": doc["id"]}, PROJECT)

    @router.get("/rides", dependencies=[Depends(verify_admin)])
    async def list_rides_admin(
        status: Optional[str] = None,
        query: Optional[str] = None,
        owner_id: Optional[str] = None,
        limit: int = 100,
        skip: int = 0
    ):
        filters: Dict[str, Any] = {}
        if status:
            filters["status"] = status
        if owner_id:
            filters["owner_id"] = owner_id
        if query:
            filters["$or"] = [
                {"from_location": {"$regex": query, "$options": "i"}},
                {"to_location": {"$regex": query, "$options": "i"}},
            ]

        rides = await db.rides.find(filters, PROJECT).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        for r in rides:
            r["owner"] = await db.users.find_one({"id": r["owner_id"]}, {"name": 1, "phone": 1, "rating_avg": 1, "_id": 0}) or {}
            r["bookings_count"] = await db.bookings.count_documents({"ride_id": r["id"]})
        total = await db.rides.count_documents(filters)
        return {"total": total, "rides": rides}

    @router.get("/rides/{ride_id}", dependencies=[Depends(verify_admin)])
    async def get_ride_admin(ride_id: str):
        r = await db.rides.find_one({"id": ride_id}, PROJECT)
        if not r:
            raise HTTPException(404, "Ride not found")
        r["owner"] = await db.users.find_one({"id": r["owner_id"]}, PROJECT) or {}
        r["vehicle"] = await db.vehicles.find_one({"id": r["vehicle_id"]}, PROJECT) or {}
        r["bookings"] = await db.bookings.find({"ride_id": ride_id}, PROJECT).to_list(100)
        return r

    @router.patch("/rides/{ride_id}", dependencies=[Depends(verify_admin)])
    async def update_ride_admin(ride_id: str, payload: AdminRideUpdate):
        updates = {k: v for k, v in payload.dict().items() if v is not None}
        if not updates:
            raise HTTPException(400, "No fields to update")
        res = await db.rides.update_one({"id": ride_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "Ride not found")
        return await db.rides.find_one({"id": ride_id}, PROJECT)

    @router.post("/rides/{ride_id}/force-cancel", dependencies=[Depends(verify_admin)])
    async def force_cancel_ride_admin(ride_id: str, payload: AdminForceCancelRide):
        """
        Cancels the ride and automatically refunds all passengers who booked seats.
        """
        ride = await db.rides.find_one({"id": ride_id})
        if not ride:
            raise HTTPException(404, "Ride not found")

        # Mark ride cancelled
        await db.rides.update_one(
            {"id": ride_id},
            {"$set": {"status": "cancelled", "cancel_reason": f"Admin Cancellation: {payload.reason}"}}
        )

        refund_results = []
        if payload.refund_passengers:
            bookings = await db.bookings.find({"ride_id": ride_id, "status": {"$in": ["accepted", "pending"]}}).to_list(500)
            for b in bookings:
                # Cancel booking
                await db.bookings.update_one(
                    {"id": b["id"]},
                    {"$set": {"status": "cancelled", "cancel_reason": payload.reason}}
                )
                # If paid, refund wallet
                if b.get("paid"):
                    passenger_id = b["passenger_id"]
                    refund_amt = b.get("total_price", 0.0)
                    user = await db.users.find_one({"id": passenger_id})
                    if user:
                        new_bal = round(user.get("wallet_balance", 0.0) + refund_amt, 2)
                        await db.users.update_one({"id": passenger_id}, {"$set": {"wallet_balance": new_bal}})
                        txn = {
                            "id": new_id(),
                            "user_id": passenger_id,
                            "amount": refund_amt,
                            "kind": "admin_refund",
                            "note": f"Admin Ride Cancellation Refund for ride {ride_id}: {payload.reason}",
                            "created_at": now_iso(),
                        }
                        await db.wallet_txns.insert_one(txn)
                        refund_results.append({"booking_id": b["id"], "passenger_id": passenger_id, "refunded_amount": refund_amt})

        return {"ride_id": ride_id, "status": "cancelled", "refunds_issued": refund_results}

    @router.delete("/rides/{ride_id}", dependencies=[Depends(verify_admin)])
    async def delete_ride_admin(ride_id: str):
        res = await db.rides.delete_one({"id": ride_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Ride not found")
        return {"deleted": True, "ride_id": ride_id}

    # ==================== 5. BOOKINGS: FULL CRUD & FORCE REFUNDS ====================
    @router.post("/bookings", dependencies=[Depends(verify_admin)])
    async def create_booking_admin(payload: AdminBookingCreate):
        ride = await db.rides.find_one({"id": payload.ride_id})
        if not ride:
            raise HTTPException(404, "Ride not found")

        doc = payload.dict()
        doc["id"] = new_id()
        doc["owner_id"] = ride["owner_id"]
        doc["total_price"] = ride["price_per_seat"] * payload.seats
        doc["created_at"] = now_iso()
        await db.bookings.insert_one(doc)

        # Decrement seats if accepted
        if payload.status == "accepted":
            await db.rides.update_one({"id": payload.ride_id}, {"$inc": {"seats_available": -payload.seats}})

        return await db.bookings.find_one({"id": doc["id"]}, PROJECT)

    @router.get("/bookings", dependencies=[Depends(verify_admin)])
    async def list_bookings_admin(
        status: Optional[str] = None,
        paid: Optional[bool] = None,
        ride_id: Optional[str] = None,
        passenger_id: Optional[str] = None,
        limit: int = 100,
        skip: int = 0
    ):
        filters: Dict[str, Any] = {}
        if status:
            filters["status"] = status
        if paid is not None:
            filters["paid"] = paid
        if ride_id:
            filters["ride_id"] = ride_id
        if passenger_id:
            filters["passenger_id"] = passenger_id

        bookings = await db.bookings.find(filters, PROJECT).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        for b in bookings:
            b["passenger"] = await db.users.find_one({"id": b["passenger_id"]}, {"name": 1, "phone": 1, "_id": 0}) or {}
            b["ride"] = await db.rides.find_one({"id": b["ride_id"]}, {"from_location": 1, "to_location": 1, "depart_at": 1, "_id": 0}) or {}
        total = await db.bookings.count_documents(filters)
        return {"total": total, "bookings": bookings}

    @router.get("/bookings/{booking_id}", dependencies=[Depends(verify_admin)])
    async def get_booking_admin(booking_id: str):
        b = await db.bookings.find_one({"id": booking_id}, PROJECT)
        if not b:
            raise HTTPException(404, "Booking not found")
        b["passenger"] = await db.users.find_one({"id": b["passenger_id"]}, PROJECT) or {}
        b["owner"] = await db.users.find_one({"id": b["owner_id"]}, PROJECT) or {}
        b["ride"] = await db.rides.find_one({"id": b["ride_id"]}, PROJECT) or {}
        return b

    @router.patch("/bookings/{booking_id}", dependencies=[Depends(verify_admin)])
    async def update_booking_admin(booking_id: str, payload: AdminBookingUpdate):
        updates = {k: v for k, v in payload.dict().items() if v is not None}
        if not updates:
            raise HTTPException(400, "No fields to update")

        res = await db.bookings.update_one({"id": booking_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "Booking not found")
        return await db.bookings.find_one({"id": booking_id}, PROJECT)

    @router.post("/bookings/{booking_id}/refund", dependencies=[Depends(verify_admin)])
    async def refund_booking_admin(booking_id: str, reason: str = "Admin force refund"):
        b = await db.bookings.find_one({"id": booking_id})
        if not b:
            raise HTTPException(404, "Booking not found")
        if not b.get("paid"):
            raise HTTPException(400, "Booking is not marked as paid; cannot issue monetary refund")

        passenger_id = b["passenger_id"]
        refund_amount = b.get("total_price", 0.0)

        user = await db.users.find_one({"id": passenger_id})
        if not user:
            raise HTTPException(404, "Passenger user account not found")

        new_bal = round(user.get("wallet_balance", 0.0) + refund_amount, 2)
        await db.users.update_one({"id": passenger_id}, {"$set": {"wallet_balance": new_bal}})
        await db.bookings.update_one({"id": booking_id}, {"$set": {"status": "cancelled", "refunded": True, "paid": False}})

        txn = {
            "id": new_id(),
            "user_id": passenger_id,
            "amount": refund_amount,
            "kind": "admin_refund",
            "note": f"Manual Admin Refund for Booking {booking_id}: {reason}",
            "created_at": now_iso(),
        }
        await db.wallet_txns.insert_one(txn)
        return {"booking_id": booking_id, "refunded_amount": refund_amount, "new_wallet_balance": new_bal}

    @router.delete("/bookings/{booking_id}", dependencies=[Depends(verify_admin)])
    async def delete_booking_admin(booking_id: str):
        res = await db.bookings.delete_one({"id": booking_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Booking not found")
        return {"deleted": True, "booking_id": booking_id}

    # ==================== 6. SOS EMERGENCY MANAGEMENT ====================
    @router.get("/sos", dependencies=[Depends(verify_admin)])
    async def list_sos_admin(status: Optional[str] = None):
        filters: Dict[str, Any] = {}
        if status:
            filters["status"] = status
        alerts = await db.sos.find(filters, PROJECT).sort("created_at", -1).to_list(200)
        for a in alerts:
            a["user"] = await db.users.find_one({"id": a["user_id"]}, {"name": 1, "phone": 1, "_id": 0}) or {}
            a["booking"] = await db.bookings.find_one({"id": a.get("booking_id")}, {"ride_id": 1, "owner_id": 1, "_id": 0}) or {}
        return alerts

    @router.patch("/sos/{sos_id}", dependencies=[Depends(verify_admin)])
    async def update_sos_admin(sos_id: str, payload: AdminSOSUpdate):
        updates: Dict[str, Any] = {
            "status": payload.status,
            "updated_at": now_iso(),
        }
        if payload.resolution_notes:
            updates["resolution_notes"] = payload.resolution_notes
        if payload.officer_assigned:
            updates["officer_assigned"] = payload.officer_assigned

        res = await db.sos.update_one({"id": sos_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "SOS Alert not found")
        return await db.sos.find_one({"id": sos_id}, PROJECT)

    @router.delete("/sos/{sos_id}", dependencies=[Depends(verify_admin)])
    async def delete_sos_admin(sos_id: str):
        res = await db.sos.delete_one({"id": sos_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "SOS Alert not found")
        return {"deleted": True, "sos_id": sos_id}

    # ==================== 7. DRIVER PAYOUTS & WITHDRAWALS ====================
    @router.get("/payouts", dependencies=[Depends(verify_admin)])
    async def list_payout_requests(status: Optional[str] = "all"):
        filters: Dict[str, Any] = {}
        if status != "all":
            filters["status"] = status
        payouts = await db.payouts.find(filters, PROJECT).sort("created_at", -1).to_list(200)
        for p in payouts:
            p["owner"] = await db.users.find_one({"id": p.get("user_id")}, {"name": 1, "phone": 1, "wallet_balance": 1, "_id": 0}) or {}
        return payouts

    @router.post("/payouts/{payout_id}/process", dependencies=[Depends(verify_admin)])
    async def process_payout_admin(payout_id: str, payload: AdminPayoutProcess):
        payout = await db.payouts.find_one({"id": payout_id})
        if not payout:
            raise HTTPException(404, "Payout request not found")

        if payload.action == "approve":
            await db.payouts.update_one(
                {"id": payout_id},
                {"$set": {
                    "status": "completed",
                    "processed_at": now_iso(),
                    "transaction_ref": payload.transaction_ref or f"MANUAL_BANK_REF_{new_id()[:8].upper()}"
                }}
            )
            return {"payout_id": payout_id, "status": "completed", "ref": payload.transaction_ref}
        else:
            # Rejection: refund the amount back to user's wallet
            user_id = payout["user_id"]
            amount = payout["amount"]
            user = await db.users.find_one({"id": user_id})
            if user:
                new_bal = round(user.get("wallet_balance", 0.0) + amount, 2)
                await db.users.update_one({"id": user_id}, {"$set": {"wallet_balance": new_bal}})
                txn = {
                    "id": new_id(),
                    "user_id": user_id,
                    "amount": amount,
                    "kind": "withdraw_rejected",
                    "note": f"Payout Rejected & Refunded: {payload.rejection_reason}",
                    "created_at": now_iso(),
                }
                await db.wallet_txns.insert_one(txn)

            await db.payouts.update_one(
                {"id": payout_id},
                {"$set": {
                    "status": "rejected",
                    "rejection_reason": payload.rejection_reason or "Verification failed",
                    "processed_at": now_iso(),
                }}
            )
            return {"payout_id": payout_id, "status": "rejected", "refunded_to_wallet": True}

    # ==================== 8. SYSTEM CONFIGURATION & MAINTENANCE ====================
    @router.get("/settings", dependencies=[Depends(verify_admin)])
    async def get_system_settings():
        settings = await db.settings.find_one({"id": "platform_config"}, PROJECT)
        if not settings:
            # Default configuration
            return {
                "commission_percentage": 10.0,
                "emergency_contact_number": "112",
                "support_phone": "+918000000000",
                "auto_expire_hours_after_departure": 2,
                "maintenance_mode": False,
            }
        return settings

    @router.patch("/settings", dependencies=[Depends(verify_admin)])
    async def update_system_settings(payload: AdminPlatformSettings):
        updates = {k: v for k, v in payload.dict().items() if v is not None}
        updates["updated_at"] = now_iso()
        await db.settings.update_one(
            {"id": "platform_config"},
            {"$set": updates},
            upsert=True
        )
        return await db.settings.find_one({"id": "platform_config"}, PROJECT)

    @router.post("/maintenance/cleanup-expired-rides", dependencies=[Depends(verify_admin)])
    async def cleanup_expired_rides():
        """Auto-expires all rides whose depart_at has passed and are still marked 'open'."""
        now_str = now_iso()
        res = await db.rides.update_many(
            {"status": "open", "depart_at": {"$lt": now_str}},
            {"$set": {"status": "completed", "auto_expired": True, "expired_at": now_str}}
        )
        return {"success": True, "expired_rides_count": res.modified_count, "executed_at": now_str}

    @router.post("/maintenance/fix-seat-counts", dependencies=[Depends(verify_admin)])
    async def reconcile_ride_seats():
        """Recalculates seats_available for all open rides based on active accepted bookings."""
        rides = await db.rides.find({"status": "open"}).to_list(1000)
        reconciled = 0
        for r in rides:
            vehicle = await db.vehicles.find_one({"id": r["vehicle_id"]})
            total_seats = vehicle.get("seats_total", 4) if vehicle else 4
            accepted_bookings = await db.bookings.find({"ride_id": r["id"], "status": "accepted"}).to_list(100)
            booked_seats = sum(b.get("seats", 1) for b in accepted_bookings)
            computed_available = max(0, total_seats - booked_seats)

            if r.get("seats_available") != computed_available:
                await db.rides.update_one({"id": r["id"]}, {"$set": {"seats_available": computed_available}})
                reconciled += 1

        return {"success": True, "rides_checked": len(rides), "rides_reconciled": reconciled}

    return router
