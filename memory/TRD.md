# PAID LIFT — Technical Requirements Document (TRD)

**Version:** 1.3  
**Date:** August 7, 2026  
**Companion to:** PRD v1.3 (`/app/memory/PRD.md`)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     MOBILE CLIENT (Expo)                     │
│  React Native 0.81 · Expo SDK 54 · expo-router · TypeScript │
│                                                              │
│  app/ (routes)          src/                                 │
│  ├─ onboarding.tsx      ├─ theme.ts        (design tokens)   │
│  ├─ (tabs)/             ├─ api.ts          (REST client)     │
│  │  ├─ home.tsx         ├─ maps.ts         (polyline,ETA)    │
│  │  ├─ rides.tsx        ├─ context/user.tsx (session)        │
│  │  ├─ wallet.tsx       ├─ utils/storage/  (KV + secure)     │
│  │  └─ profile.tsx      └─ components/                       │
│  ├─ search-results.tsx      ├─ RideMap.tsx  (Leaflet WV)     │
│  ├─ ride/[id].tsx           └─ PlaceField.tsx (autocomplete) │
│  ├─ offer-ride.tsx                                         │
│  ├─ vehicles.tsx                                           │
│  ├─ booking/[id].tsx                                       │
│  ├─ chat/[bookingId].tsx                                   │
│  ├─ live-tracking/[bookingId].tsx                          │
│  ├─ checkout.tsx  (hosted checkout + status polling)        │
│  ├─ sos.tsx · admin.tsx                                    │
└──────────────┬───────────────────────────────────────────────┘
               │ HTTPS /api/*  (ingress → :8001)
┌──────────────▼───────────────────────────────────────────────┐
│              BACKEND — FastAPI 0.110 (Python 3.11)           │
│                                                              │
│  server.py    — auth, users, vehicles, rides, bookings,      │
│                 chat, wallet, ratings, sos, admin, seed      │
│  payments.py  — Razorpay, PhonePe, simulator, webhooks       │
│  maps.py      — Directions + Places proxy (TTL-cached)       │
│                                                              │
│  MongoDB (motor async)  ←  collections below                 │
└──────────────┬───────────────────────────────────────────────┘
               │
   ┌───────────┼────────────────────┐
   ▼           ▼                    ▼
 Razorpay   PhonePe V2        Google Maps Platform
 (hosted    (PG_CHECKOUT,     (Directions API,
  Checkout)  O-Bearer OAuth)   Places API New)
```

**Infrastructure:** Kubernetes pod; nginx ingress routes `/api/*` → FastAPI `:8001`, everything else → Metro `:3000` (Expo web preview). MongoDB local instance.

---

## 2. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Mobile | Expo SDK 54, React Native 0.81, expo-router v6, TS 5.9 | Single codebase iOS/Android/web-preview |
| Backend | FastAPI 0.110, uvicorn, Pydantic v2 | Async, typed, OpenAPI auto-docs |
| DB | MongoDB via motor 3.3 | Document model fits marketplace entities |
| Payments | razorpay 1.4.2 (pip), PhonePe V2 via httpx | Both Indian gateways side-by-side |
| Maps | Google Directions/Places (server proxy); Leaflet 1.9 + OSM tiles (client render) | Key server-side; works w/o key in Expo Go |
| State | React context + `@/src/utils/storage` (AsyncStorage + SecureStore) | No redux; storage wrapper auto-JSON |
| UI tokens | `src/theme.ts` from design_guidelines.json (terracotta #EF6C00) | Single source of truth |
| Map component | react-native-webview (Leaflet) — universal; react-native-maps 1.20.1 installed for future native | Expo-Go compatible today, native-ready tomorrow |

---

## 3. Data Model (MongoDB collections)

All documents use string UUIDs as `id`; `_id` excluded from API responses.

### 3.1 `users`
```json
{
  "id": "uuid", "phone": "+91XXXXXXXXXX", "name": "", "email": "",
  "aadhaar_last4": "1234", "aadhaar_verified": true,
  "role": "passenger|owner|both", "photo": "",
  "rating_avg": 4.6, "rating_count": 42,
  "wallet_balance": 500.0, "created_at": "iso8601"
}
```
**Indexes:** `phone` (unique), `id`.

### 3.2 `vehicles`
```json
{ "id", "owner_id", "vehicle_type": "two-wheeler|auto|sedan|suv|bus|luxury",
  "make", "model", "plate", "seats_total": 4,
  "rc_number", "insurance_number", "dl_number", "photo",
  "approved": true, "created_at" }
```

### 3.3 `rides`
```json
{ "id", "owner_id", "vehicle_id",
  "from_location", "to_location", "stops": ["Lonavala"],
  "depart_at": "iso8601", "seats_available": 3,
  "price_per_seat": 450.0, "vehicle_type": "sedan", "notes": "",
  "status": "open|in_progress|completed|cancelled", "created_at" }
```
**Indexes:** `(from_location, to_location, depart_at)`, `owner_id`, `status`.

### 3.4 `bookings`
```json
{ "id", "ride_id", "passenger_id", "owner_id",
  "seats": 1, "total_price": 450.0,
  "status": "pending|accepted|rejected|completed|cancelled",
  "paid": false, "seats_decremented": false, "created_at" }
```
- `seats_decremented` guards against double seat-decrement (accept + payment race).
- Seat decrement uses conditional update `{"seats_available": {"$gte": seats}}` — never goes negative.

### 3.5 `chat`
```json
{ "id", "booking_id", "sender_id", "text", "created_at" }
```
**Index:** `(booking_id, created_at)`. Client polls every 3s.

### 3.6 `payments` (v1.1+)
```json
{ "id", "user_id", "booking_id", "purpose": "wallet_topup|ride",
  "provider": "razorpay|phonepe", "amount_paise": 50000, "currency": "INR",
  "provider_order_id": "order_xxx", "provider_payment_id": null,
  "status": "created|paid|failed|refunded",
  "credited": false, "simulated": true, "created_at", "updated_at" }
```
**Idempotency:** atomic claim `{id, credited: {$ne: true}} → {$set: {credited: true, ...}}`. Only the claimant mutates wallet/booking — duplicate callbacks are no-ops. Verified with 3× duplicate-callback test.

### 3.7 `wallet_txns` (immutable ledger)
```json
{ "id", "user_id", "amount": ±rupees,
  "kind": "topup|ride_payment|ride_earning|commission|withdraw",
  "note", "created_at" }
```
Ledger is append-only; `users.wallet_balance` is the cached sum.

### 3.8 `ratings`
```json
{ "id", "booking_id", "rater_id", "rated_id", "stars": 1-5, "comment", "created_at" }
```
On insert: recomputes `users.rating_avg` + `rating_count`.

### 3.9 `sos`
```json
{ "id", "booking_id", "user_id", "location", "created_at" }
```

### 3.10 `map_cache`
```json
{ "_id": "sha256(params)", "value": {distanceMeters, durationSeconds, overviewPolyline, ...}, "expiresAt": "date" }
```
TTL index on `expiresAt` (300s non-traffic).

---

## 4. API Reference

Base: `{EXPO_PUBLIC_BACKEND_URL}/api`

### 4.1 Auth (mock OTP)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/send-otp` | `{phone}` | `{ok, mock_otp:"123456"}` |
| POST | `/auth/verify-otp` | `{phone, otp}` | `{user, is_new}` (creates user) |

### 4.2 Users
| Method | Path | Notes |
|---|---|---|
| POST | `/users/upsert` | Creates/updates by phone; sets `aadhaar_verified` when `aadhaar_last4` present |
| GET | `/users/{id}` | 404 if missing |

### 4.3 Vehicles
| Method | Path | Notes |
|---|---|---|
| POST | `/vehicles` | Create (owner_id required) |
| GET | `/vehicles?owner_id=` | List |

### 4.4 Rides
| Method | Path | Notes |
|---|---|---|
| POST | `/rides` | Publish |
| GET | `/rides?from_location&to_location&date&vehicle_type&owner_id` | Regex case-insensitive search; enriches each with `owner` + `vehicle` |
| GET | `/rides/{id}` | Single, enriched |

### 4.5 Bookings
| Method | Path | Notes |
|---|---|---|
| POST | `/bookings` | `{ride_id, passenger_id, seats}` — 400 if seats unavailable |
| GET | `/bookings?user_id&role=passenger|owner` | Enriched with ride + both users |
| GET | `/bookings/{id}` | Enriched |
| PATCH | `/bookings/{id}` | `{status?, paid?}` — accept→decrement seats (once); paid→wallet split (legacy wallet path) |

### 4.6 Chat
| Method | Path |
|---|---|
| GET | `/chat/{booking_id}` (asc) |
| POST | `/chat` `{booking_id, sender_id, text}` |

### 4.7 Wallet
| Method | Path | Notes |
|---|---|---|
| GET | `/wallet/{user_id}` | `{balance, transactions[]}` |
| POST | `/wallet/{user_id}/topup?amount=` | Legacy direct top-up (kept; gateway path preferred) |

### 4.8 Payments (`payments.py`)
| Method | Path | Notes |
|---|---|---|
| POST | `/payments/order` | `{provider, purpose, user_id, amount?|booking_id?}` → `{payment_id, checkout_url, simulated}`. **Amount recomputed server-side**; ride payment verifies passenger ownership; 400 on already-paid |
| POST | `/payments/status` | `{payment_id}` → current status (polls PhonePe gateway in live mode) |
| GET | `/payments/simulator?payment_id=` | Sandbox checkout HTML (Success/Fail buttons) |
| POST | `/payments/simulator/callback` | `{payment_id, result}` → finalizes |
| GET | `/payments/razorpay/checkout?payment_id=` | Hosted Checkout.js page |
| POST | `/payments/razorpay/verify` | HMAC-SHA256 `order_id|payment_id` verify → finalize |
| POST | `/payments/razorpay/webhook` | Raw-body HMAC w/ `X-Razorpay-Signature` |
| GET | `/payments/phonepe/return?payment_id=` | Redirect landing |
| POST | `/payments/phonepe/webhook` | Checksum verify → finalize |

**Finalization semantics (`_finalise`):**
- `wallet_topup`: credit user wallet + `topup` ledger row.
- `ride`: booking.paid=true; seat decrement (if not already); owner wallet += 90%; ledger rows: `ride_payment` (passenger −100%), `ride_earning` (owner +90%), `commission` (−10%).

### 4.9 Maps (`maps.py`)
| Method | Path | Notes |
|---|---|---|
| POST | `/maps/directions` | `{origin, destination, waypoints[], mode, departure_time}` → `{distanceMeters, durationSeconds, overviewPolyline, start, end, mocked}`. Cached 300s. Mock mode: haversine between known-city coordinates @ 45 km/h |
| GET | `/maps/places/autocomplete?input&session_token` | India-scoped. Mock mode: city-list filter |

### 4.10 Ratings / SOS / Admin
| Method | Path |
|---|---|
| POST | `/ratings` (recomputes user rating) |
| GET | `/ratings?user_id=` |
| POST | `/sos` |
| GET | `/admin/stats` · `/admin/users` · `/admin/rides` · `/admin/sos` |
| POST | `/admin/seed` (idempotent demo data) |

---

## 5. Third-Party Integrations

### 5.1 Razorpay (Test mode ready)
- **Env:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (backend only; key_id safe for client via checkout page).
- **Flow:** order create (server) → hosted Checkout.js page → `handler` POSTs to `/razorpay/verify` → HMAC verify → finalize. Webhook `payment.captured` as backstop.
- **Simulation trigger:** key == `rzp_test_REPLACE` → simulator page instead.

### 5.2 PhonePe (Standard Checkout V2, sandbox)
- **Env:** `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`, `PHONEPE_ENV=sandbox|prod`, `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`.
- **Flow:** OAuth token (`/v1/oauth/token`, client_credentials) → `POST /checkout/v2/pay` with `PG_CHECKOUT` + redirectUrl → hosted page → redirect → app polls `/payments/status` which calls gateway `order/{id}/status` → finalize on COMPLETED + amount match.
- **Simulation trigger:** merchant id == `REPLACE`.

### 5.3 Google Maps Platform
- **Server env:** `GOOGLE_MAPS_API_KEY` (Directions Legacy + Places New). Placeholder `YOUR_SERVER_KEY` → mock mode.
- **Client env (native builds only):** `EXPO_PUBLIC_GOOGLE_MAPS_KEY`; `app.json` `android.config.googleMaps.apiKey` + `ios.config.googleMapsApiKey` (currently `YOUR_FRONTEND_MAP_KEY`).
- **Client rendering:** Leaflet/OSM via WebView (all platforms incl. Expo Go). `react-native-maps@1.20.1` installed for future native map; SDK-54 legacy config fields used (not the 1.22+ plugin).

### 5.4 Integration principle
All three follow: **real code path + automatic simulation/mock fallback driven by placeholder detection**. Dropping real keys into `.env` + backend restart flips to live with zero code changes.

---

## 6. Frontend Architecture

### 6.1 Routing (expo-router, file-based)
```
/ → index.tsx (auth gate → /onboarding or /(tabs)/home)
/onboarding
/(tabs) — guarded (redirect → /onboarding when no user)
   /home · /rides · /wallet · /profile
/search-results?from&to&date&vehicle_type
/ride/[id]            (details + map + ETA + seat stepper + book)
/offer-ride           (vehicle picker + route + schedule + price)
/vehicles             (list + add modal)
/booking/[id]         (accept/reject/pay/chat/track/complete/rate)
/chat/[bookingId]     (3s polling)
/live-tracking/[bookingId]
/checkout?payment_id&checkout_url&provider&simulated&return_path
/sos · /admin
```

### 6.2 State & storage
- `UserContext` (`src/context/user.tsx`): user object persisted as JSON string under `paidlift.user.v1` via `storage.getItem/setItem` (wrapper auto-serializes).
- No global store beyond user; screens fetch on `useFocusEffect`.

### 6.3 Key components
| Component | Purpose |
|---|---|
| `RideMap.tsx` | Universal map: Leaflet HTML string → WebView (native) / iframe srcDoc (web). Renders encoded polyline, start/end pins, stop pins, animated 🚗 driver marker; auto `fitBounds` |
| `PlaceField.tsx` | Debounced (300ms) autocomplete; per-session random token; dropdown with testIDs |
| `checkout.tsx` | `WebBrowser.openBrowserAsync(checkout_url)` + 2.5s status polling (30 rounds) + AppState foreground re-poll; success→redirect, failure→retry UI |

### 6.4 Design system
`src/theme.ts`: brand `#EF6C00` (terracotta), iOS-Native Clean personality, 8pt spacing grid, radius 6/12/20/pill, typography scale 12–28. All colors referenced from tokens (no hex literals in screens except third-party brand).

---

## 7. Security Requirements

| Area | Implementation |
|---|---|
| Secrets | All gateway/maps keys in backend `.env` only; only `RAZORPAY_KEY_ID` leaves server (embedded in hosted checkout page) |
| Payment integrity | Amount always recomputed from `bookings.total_price`; client `amount` ignored for ride purpose; HMAC-SHA256 on Razorpay callback + webhook (raw body); PhonePe checksum on webhook |
| Idempotency | Atomic `credited` claim in payments; `seats_decremented` flag + conditional `$gte` seat decrement in bookings |
| AuthZ | Ride payment requires `passenger_id == booking.passenger_id`; self-booking blocked |
| Data minimization | Only Aadhaar last-4 stored; no document images yet |
| Transport | HTTPS via ingress; CORS `*` (MVP; tighten to app origins at production) |
| PII/Logs | No payment payloads or keys logged |

---

## 8. Testing

| Suite | File | Result |
|---|---|---|
| Core API | `/app/backend/tests/test_paidlift_api.py` | 19/19 ✅ |
| Payments | `/app/backend/tests/test_payments.py` | 18/18 ✅ |
| Maps | `/app/backend/tests/test_maps.py` | 12/12 ✅ |
| E2E (frontend) | testing-agent Playwright @390×844 | onboarding→book→pay→wallet→admin ✅ |
| Reports | `/app/test_reports/iteration_{1,2,3}.json` | |

**Test credentials** (`/app/memory/test_credentials.md`): any 10-digit phone; OTP `123456`; Aadhaar any 12-digit + OTP `123456`. Simulator drives payment success/failure. Maps mock mode needs no key.

---

## 9. Build & Deploy

- **Preview:** supervisor services `backend` (uvicorn :8001, watchfiles reload) + `expo` (Metro :3000). Restart: `sudo supervisorctl restart backend expo`.
- **Publish:** Emergent Publish button → deploys; then generate iOS/Android builds (EAS managed by platform; `eas.json` is platform-owned — never edit).
- **app.json identifiers (do not change):** `com.emergent.paidlift.xat0q1` (both platforms).
- **Env promotion:** new `.env` keys auto-copy to deployment secrets on first publish; later changes made in Deployment Panel → Secrets.

---

## 10. Known Limitations & Technical Debt

1. **Chat via polling** (3s) — replace with WebSocket/SSE at scale.
2. **Driver location simulated** — polyline progress animation; needs real `expo-location` GPS broadcast + WebSocket.
3. **PhonePe token not cached** — fetched per call; add expiry-aware cache before production.
4. **No MongoDB replica set** in preview — payment ledger uses atomic claims rather than multi-doc transactions; adopt transactions in production.
5. **RN-web shadow* deprecation warnings** (cosmetic).
6. **CORS `*`** — restrict at production.
7. **No rate limiting** on public endpoints — add before public launch.
8. **Native map unused** — switch `RideMap` internals to `react-native-maps` when dev-build pipeline is in use (callers unaffected).
