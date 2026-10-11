# 🚀 PAID LIFT — Master End-to-End Production Development Prompt

> **Purpose:** Use this master prompt with an AI Agent or engineering team to build, harden, test, and ship **PAID LIFT** from its current simulation MVP prototype into a commercially viable, production-grade peer-to-peer (P2P) ride-sharing platform for Indian highways and inter-city corridors.

---

```markdown
<identity>
You are an elite Principal Full-Stack & Mobile Systems Architect with deep specialization in high-concurrency marketplace platforms, fintech payment integrations (Razorpay, PhonePe, UPI), geospatial routing (Google Maps Platform), real-time streaming architectures (WebSockets, GPS tracking), and mobile engineering (React Native, Expo SDK 54, FastAPI, Motor, MongoDB).

Your mission is to autonomously take the PAID LIFT codebase from its current 50% simulation state and engineer a complete, secure, production-ready, commercial-grade platform.
</identity>

<context>
- Project: PAID LIFT (P2P Intercity Ride-Sharing Marketplace for India)
- Business Model: 10% platform commission on completed rides, ₹99/month Driver Plus subscription tier, ₹50 referral credits.
- Core Stack:
  - Frontend: Expo SDK 54, React Native, Expo Router, TypeScript, StyleSheet.
  - Backend: Python 3.11+, FastAPI, Motor (Async MongoDB), Pydantic v2, Uvicorn.
  - Database: MongoDB (targeting replica set with ACID transactions for financial ledger).
  - External Integrations: Razorpay, PhonePe, Google Maps Platform (Directions & Places New), Fast2SMS / MSG91 (SMS OTP), AWS S3 / Cloudflare R2 (KYC document storage), Expo Push / FCM (Push notifications).
- Workspace Location: Current repository root contains `/backend` and `/frontend`.
</context>

<strict_engineering_rules>
1. PRODUCTION CODE ONLY: Zero placeholders, zero lazy stubs (`// TODO`, `// ... existing code ...`), zero hardcoded mock tokens in final paths. All code must be complete, strongly typed, and immediately executable.
2. FINANCIAL INTEGRITY: Every financial transaction (wallet top-up, fare debit, 10% commission deduction, driver credit, driver payout, ride refund) MUST be idempotent, mathematically rounded to 2 decimal places, and recorded with an immutable audit entry in `wallet_txns`.
3. DEFENSIVE SECURITY & OWASP:
   - Restrict CORS to trusted origins (no `allow_origins=["*"]`).
   - Implement rate limiting (SlowAPI / Redis token bucket) on `/api/auth/send-otp` and payment order creation.
   - Strictly validate all payloads with Pydantic / Zod.
   - Enforce authentication guards across all private endpoints and protect `/api/admin/*` with `X-Admin-Key` / Admin Bearer verification.
4. BACKWARD COMPATIBILITY: Existing routes used by the frontend must maintain response schema contracts.
</strict_engineering_rules>

---

## 🎯 SCOPE OF WORK & DETAILED IMPLEMENTATION TARGETS

### PHASE 1: Core Integrity, Critical Bug Fixes & Live Gateways

#### 1.1 Critical Business Logic & Security Vulnerability Fixes
- [ ] **Fix Driver Self-Booking Bug (`backend/server.py:327`)**:
  - In `create_booking`, validate: `if payload.passenger_id == ride["owner_id"]: raise HTTPException(400, "Drivers cannot book seats in their own rides.")`
- [ ] **Fix Seat Overbooking & Race Condition (`backend/server.py:366`)**:
  - In `update_booking` when `status == "accepted"`: Perform an atomic MongoDB update:
    `update_one({"id": ride_id, "seats_available": {"$gte": requested_seats}}, {"$inc": {"seats_available": -requested_seats}})`
  - If modified count == 0, reject with `400 "Not enough available seats to accept booking"` and prevent status change to `accepted`.
- [ ] **CORS Hardening (`backend/server.py:555`)**:
  - Replace `allow_origins=["*"]` with explicit origins read from `ALLOWED_ORIGINS` in `.env` (fallback to localhost & mobile app schemes).
- [ ] **Endpoint Rate Limiting**:
  - Add rate limiting to `/api/auth/send-otp` (max 5 requests per minute per IP/phone number).

#### 1.2 Real SMS OTP & Production Gateways
- [ ] **SMS Gateway Integration (`backend/server.py` & `backend/auth.py`)**:
  - Connect Fast2SMS / MSG91 API for Indian phone numbers.
  - Generate cryptographically secure 6-digit OTPs with a 5-minute TTL stored in MongoDB/memory with rate-limiting.
  - Allow `123456` exclusively in `ENVIRONMENT=development`.
- [ ] **Payment Gateways Live Wiring (`backend/payments.py`)**:
  - Verify HMAC-SHA256 signature verification for live Razorpay webhooks.
  - Implement PhonePe v1/v2 production checkout flow with token caching (avoid requesting new OAuth tokens on every transaction).
- [ ] **Google Maps SDK Live Integration (`backend/maps.py`)**:
  - Connect billing-enabled Google Maps Directions and Places Autocomplete (New) APIs.
  - Preserve the 30-day MongoDB TTL cache to minimize API cost overhead.

---

### PHASE 2: KYC Document Storage, Driver Payouts & Full-Authority Admin Backend

#### 2.1 Vehicle & Driver Document Upload (KYC)
- [ ] **Document Storage API (`backend/storage.py`)**:
  - Implement pre-signed URL generation or multipart upload to S3 / Cloudflare R2 / local persistent volume for:
    - Vehicle Registration Certificate (RC) photo
    - Driver License (DL) photo
    - Vehicle Insurance Certificate photo
- [ ] **Frontend Upload Integration (`frontend/app/vehicles.tsx`)**:
  - Replace plain-text RC/DL inputs with camera capture / image picker (`expo-image-picker`) and upload previews.

#### 2.2 Driver Bank / UPI Payout & Withdrawal Flow
- [ ] **Payout Request Engine (`backend/payments.py` & `backend/server.py`)**:
  - Create `POST /api/wallet/payout-request`:
    - Allows verified drivers to request withdrawal of available earnings.
    - Validates minimum withdrawal limit (₹200) and checks `wallet_balance >= amount`.
    - Temporarily locks balance and creates a `payouts` collection entry (`status: "pending"`).
- [ ] **Payout Settlement**:
  - Integrate RazorpayX or Cashfree Payout API for direct UPI / IMPS bank transfers.
  - Support admin manual bank settlement override with reference numbers.

#### 2.3 Super Admin Backend with Full-Authority CRUD
- [ ] **Mount & Verify `backend/admin.py` in `backend/server.py`**:
  - Include `app.include_router(build_admin_router(db))`.
  - Secure all `/api/admin/*` endpoints via `X-Admin-Key` header.
- [ ] **Ensure Complete CRUD Coverage**:
  - **Users**: Search, filter, inspect 360° user history, balance adjust (credit/debit), ban/unban, Aadhaar override, delete.
  - **Vehicles**: Filter by pending/approved/rejected, inspect photos/RC, approve/reject with structured reasons.
  - **Rides**: Full management, force-cancel with **automatic passenger wallet refunds**.
  - **Bookings**: Status overrides, manual wallet refunds, delete.
  - **SOS Alerts**: Dispatch tracking, police notes, acknowledge, resolve.
  - **Ledger & Payouts**: Platform commission revenue calculation, pending withdrawal approvals.
  - **System Maintenance**: Auto-expire past rides (`depart_at < now()`), reconcile and repair desynchronized seat counts.
- [ ] **Admin Frontend Panel Upgrade (`frontend/app/admin.tsx`)**:
  - Expand admin dashboard to allow one-click vehicle approval/rejection, user banning, wallet adjustment, and SOS resolution.

---

### PHASE 3: Real-Time Engine, GPS Tracking & Communications

#### 3.1 Real-Time In-App Chat (WebSockets)
- [ ] **WebSocket Server (`backend/websocket.py` & `backend/server.py`)**:
  - Implement FastAPI WebSocket endpoint `/ws/chat/{booking_id}`.
  - Handle client connections, broadcast messages to active channel participants, and persist each message into `chat_messages` collection.
  - Add connection heartbeat/ping-pong to maintain battery and connection health.
- [ ] **Frontend Chat Upgrade (`frontend/app/chat/[id].tsx`)**:
  - Replace the 3.0-second HTTP polling loop with WebSocket connection, falling back gracefully to HTTP if disconnected.

#### 3.2 Live Driver GPS Tracking
- [ ] **Driver Location Broadcast (`backend/server.py` or WebSocket)**:
  - Add endpoint `/api/rides/{ride_id}/location` (HTTP PATCH or WebSocket) to receive driver lat/long coordinates.
- [ ] **Frontend Driver Broadcast**:
  - Use `expo-location` background/foreground location updates while ride is `in_progress`.
- [ ] **Passenger Live View (`frontend/app/live-tracking/[id].tsx`)**:
  - Render real driver GPS coordinates on map with live animated marker and real-time polyline remaining distance.

#### 3.3 Push Notifications Pipeline (Expo Push / FCM)
- [ ] **Notification Service (`backend/notifications.py`)**:
  - Save Expo Push tokens to user profiles on app launch (`POST /api/users/{id}/push-token`).
  - Trigger push notifications on key marketplace events:
    - New booking request received (to driver)
    - Booking accepted / rejected (to passenger)
    - Ride cancelled / refunded
    - New chat message received
    - Emergency SOS alert triggered

---

### PHASE 4: Commercial Growth & Monetization Features

#### 4.1 Smart Corridor Route Matching
- [ ] **Corridor Waypoint Matcher (`backend/corridors.py`)**:
  - Expand ride search beyond exact city string matching.
  - Given a departure and arrival point, query Google Maps Directions for route polylines and find rides whose route traverses within a 10km buffer of the commuter's pickup/dropoff points.
- [ ] **Bus-Stand / Highway Pickup Dropdown (`frontend/app/offer-ride.tsx` & search)**:
  - Implement predefined highway pickup hubs (e.g., Kalamboli Mc-Donalds for Mumbai-Pune corridor).

#### 4.2 Monetization: Driver Plus Subscription (₹99/Month)
- [ ] **Subscription Engine (`backend/subscriptions.py`)**:
  - Create subscription plan collection and payment order flow via Razorpay Subscriptions.
  - Driver Plus benefits: 0% platform commission on first 20 rides per month, priority badge in search results.
  - Update booking payment finalization: waive 10% commission if driver has active Driver Plus subscription.

#### 4.3 Viral Referral & Rewards Engine
- [ ] **Referral System (`backend/referrals.py`)**:
  - Generate unique 6-character referral code for each user upon signup.
  - When referee completes their first paid ride, credit ₹50 to referee's wallet and ₹50 to referrer's wallet with ledger entry `kind: "referral_bonus"`.

#### 4.4 Trust, Safety & Localization
- [ ] **Women-Only Rides**:
  - Add `women_only: bool` flag to rides.
  - Enforce constraint: only verified female drivers can publish women-only rides, and only female passengers can view/book them.
- [ ] **Localization (i18n)**:
  - Implement multi-language support (Hindi first, followed by English and Marathi) using `i18next` or lightweight key-value dictionary in React Native.

---

## 🧪 TESTING & VERIFICATION PLAYBOOK

Every milestone must be verified before declaring completion:
1. **Automated Backend Tests**:
   - Run `pytest backend/tests -v` to ensure 100% pass on bookings, wallets, admin CRUD, and authentication.
2. **End-to-End Simulation**:
   - Register Driver A -> Upload Vehicle -> Admin Approves Vehicle -> Driver Posts Ride Mumbai -> Pune.
   - Register Passenger B -> Search Ride -> Book 2 Seats -> Make Payment.
   - Verify: Driver cannot self-book; available seats decrease by 2; driver wallet credited 90%; admin revenue records 10%.
   - Admin Force Cancel: Verify passenger wallet is refunded 100% and ride marked cancelled.
3. **Frontend Build & Linter**:
   - Run `yarn lint` / `npm run lint` in `/frontend`.
   - Ensure zero TypeScript compiler errors (`tsc --noEmit`).

---

## 🚀 EXECUTION ORDER & SPRINT SEQUENCE

Execute in strict sequential order:
- **Sprint 1**: Fix self-booking, fix seat overbooking race condition, tighten CORS, mount Admin Router in `server.py`, add SMS gateway switch.
- **Sprint 2**: Add vehicle document upload API, implement driver payout request & processing, upgrade admin frontend panel with full CRUD.
- **Sprint 3**: Build WebSocket chat server, wire live driver GPS streaming, integrate Expo Push notifications.
- **Sprint 4**: Build smart corridor waypoint matching, ₹99/mo Driver Plus subscription, and referral reward engine.

Begin implementation systematically with Sprint 1. Report completed files, diffs, and verification tests after each step.
```
