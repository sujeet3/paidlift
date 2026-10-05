# PAID LIFT — Product Requirements Document (PRD)

**Version:** 1.3  
**Date:** August 7, 2026  
**Status:** MVP Built + Payment & Maps Integrations Complete (Simulation Mode)  
**Document Owner:** Product Team

---

## 1. Executive Summary

**PAID LIFT** is a peer-to-peer (P2P) ride-sharing and empty-seat marketplace mobile application designed for the Indian market. The app connects **vehicle owners** travelling on highways, inter-city routes, and common corridors with **passengers** looking for affordable seats on those same routes — enabling cost sharing, reducing empty seats on Indian roads, and creating micro-earning opportunities for vehicle owners.

Unlike Ola/Uber (driver-as-a-service / commercial taxi model), PAID LIFT is a **community marketplace**: vehicle owners list trips they are *already* taking and fill empty seats; passengers split the fuel/toll cost at a price the owner sets.

**Tagline:** *Share the ride. Split the cost.*

---

## 2. Problem Statement

1. **Empty seats waste money.** Crores of private vehicles travel Indian highways daily with 2–5 empty seats; owners bear the entire fuel + toll cost.
2. **Inter-city public transport is expensive/unreliable.** Trains sell out; private buses overcharge on festival dates; cabs are 5–10× the fair per-seat cost.
3. **No trust infrastructure.** Existing informal ride-sharing (Facebook groups, Telegram) has zero identity verification, no payments, no dispute handling, and no safety features.
4. **Bus-stand / highway pickups are unserved.** Aggregators optimize for door-to-door metro rides, not bus-stand-to-bus-stand corridor travel.

---

## 3. Goals & Success Metrics

| Goal | Metric | Target (6 mo) |
|---|---|---|
| Marketplace liquidity | Completed rides / week | 1,000+ |
| Owner supply | Active vehicle owners | 5,000 |
| Passenger conversion | Search → booking rate | 15% |
| Trust | Avg. ride rating | ≥ 4.5 ★ |
| Safety | SOS incidents resolved < 15 min | 100% |
| Revenue | GMV take rate (commission) | 10% |
| Retention | W4 repeat booking rate | 30% |

---

## 4. User Personas

### 4.1 Passenger — "Ravi, 27, IT professional, Bengaluru"
- Travels Bengaluru→Mysuru every 2nd weekend.
- Trains sell out; private bus costs ₹600; wants a comfortable ₹300–400 ride.
- Cares about: verified driver, on-time departure, in-app payment, safety (SOS).

### 4.2 Vehicle Owner — "Rahul, 34, sales manager, drives Mumbai↔Pune weekly"
- Drives alone, pays ₹1,500 fuel + tolls round trip.
- Wants to offset ₹400–600 per trip by selling 2 empty seats.
- Cares about: verified passengers, instant payment, minimal detours, accept/reject control.

### 4.3 Platform Admin — Internal
- Monitors SOS alerts, verifies vehicles, reviews disputes, tracks GMV/commission.

---

## 5. Scope

### 5.1 In Scope (MVP — ✅ Built)
- Phone-OTP registration (mocked) with profile setup
- Mocked Aadhaar verification (12-digit + OTP) with trust badge
- Dual role: Passenger + Vehicle Owner on one account
- Vehicle management (6 types: 2-wheeler, auto, sedan, SUV, bus/tempo, luxury) with RC/insurance/DL fields
- Offer-a-ride flow: route + intermediate stops + date/time + seats + price per seat
- Find-a-ride flow: from/to search (autocomplete), date, seats, vehicle-type filters
- Smart matching: route + date + vehicle-type filtering, popular-route chips
- Booking flow: request → owner accept/reject → pay → complete
- In-app chat (passenger ↔ owner, 3s polling)
- In-app wallet: top-up (gateway), ride payments, 10% platform commission auto-split, transaction ledger
- **Razorpay + PhonePe payment integration** (real code; runs in sandbox/simulator mode until keys provided)
- **Google Maps Directions + Places integration** (real code; mock route mode until key provided)
- Live tracking screen with animated driver marker + ETA countdown
- SOS emergency alert (home FAB + tracking FAB + dedicated screen)
- Ratings & reviews (5-star, comment, auto-recomputed user rating)
- Ride history (passenger + owner views)
- In-app admin panel: platform stats, users, rides, SOS alerts
- Seed data: 4 demo rides across Mumbai-Pune, Delhi-Jaipur, Ahmedabad-Vadodara, Bengaluru-Mysuru corridors

### 5.2 Out of Scope (MVP)
- Real Aadhaar eKYC (DigiLocker)
- Real payment gateway live mode (keys pending from user)
- Real Google Maps key / native map rendering (key pending; native build pending)
- Real-time push notifications
- Hindi language + Dark mode (user deferred)
- Web admin dashboard (in-app admin shipped instead)
- Real GPS tracking of driver (animated polyline simulation for MVP)
- Owner payouts (RazorpayX Route)

---

## 6. Functional Requirements

### 6.1 Authentication & Onboarding ✅
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-1.1 | User registers with 10-digit phone + OTP | P0 | ✅ (mock OTP `123456`) |
| FR-1.2 | Profile capture: name, email (optional) | P0 | ✅ |
| FR-1.3 | Aadhaar verification: 12-digit + OTP | P0 | ✅ (mocked) |
| FR-1.4 | Role selection: Find a Ride vs Offer a Ride | P0 | ✅ |
| FR-1.5 | Session persistence (survives app restart) | P0 | ✅ |
| FR-1.6 | Anonymous access redirects to onboarding | P1 | ✅ |

### 6.2 Vehicle Management ✅
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-2.1 | Add vehicle: type, make, model, plate, seats | P0 | ✅ |
| FR-2.2 | Document fields: RC, insurance, DL numbers | P0 | ✅ (stored, not file-uploaded yet) |
| FR-2.3 | Multiple vehicles per owner; select at publish | P0 | ✅ |
| FR-2.4 | Vehicle document photo upload | P1 | ⏳ Backlog |
| FR-2.5 | Admin vehicle approval workflow | P1 | ⏳ Backlog (auto-approved in MVP) |

### 6.3 Offer a Ride ✅
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-3.1 | Publish ride: from, to, stops[], date, time, seats, price/seat, notes | P0 | ✅ |
| FR-3.2 | Ride listing immediately searchable | P0 | ✅ |
| FR-3.3 | Auto-expire rides past departure | P1 | ⏳ Backlog |
| FR-3.4 | Ride cancellation with passenger refunds | P1 | ⏳ Backlog |

### 6.4 Find & Book ✅
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-4.1 | Search by from/to with Places autocomplete | P0 | ✅ (mock suggestions; real on key) |
| FR-4.2 | Filter: date, vehicle type, seats | P0 | ✅ |
| FR-4.3 | Results card: owner, rating, vehicle, route, stops, price, seats left | P0 | ✅ |
| FR-4.4 | Ride details: map + route polyline + ETA + driver profile + vehicle docs status | P0 | ✅ |
| FR-4.5 | Book N seats → booking request (PENDING) | P0 | ✅ |
| FR-4.6 | Owner accepts (seats decremented atomically) / rejects | P0 | ✅ |
| FR-4.7 | Passenger pays: Razorpay / PhonePe / Wallet | P0 | ✅ (simulation mode) |
| FR-4.8 | Prevent self-booking; prevent overbooking; prevent double-payment | P0 | ✅ |
| FR-4.9 | Smart route matching (from anywhere along corridor) | P1 | ⏳ Backlog |
| FR-4.10 | "Bus-stand to bus-stand" pickup-point selection | P1 | ⏳ Backlog |

### 6.5 Payments & Wallet ✅
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-5.1 | Wallet balance + full transaction ledger | P0 | ✅ |
| FR-5.2 | Wallet top-up via Razorpay/PhonePe | P0 | ✅ (simulation mode) |
| FR-5.3 | Direct ride payment via Razorpay/PhonePe | P0 | ✅ (simulation mode) |
| FR-5.4 | Pay-from-wallet (internal transfer) | P0 | ✅ |
| FR-5.5 | 10% commission auto-split on payment | P0 | ✅ |
| FR-5.6 | Idempotent payment finalization (no double-credit) | P0 | ✅ |
| FR-5.7 | Server-side amount recompute (anti-tampering) | P0 | ✅ |
| FR-5.8 | Webhooks (Razorpay + PhonePe) with signature verification | P1 | ✅ (code ready; needs public URL + keys) |
| FR-5.9 | Owner withdrawal to bank/UPI | P1 | ⏳ Backlog |
| FR-5.10 | Refunds on rejection/cancellation | P1 | ⏳ Backlog |

### 6.6 Maps, Routing & ETA ✅
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-6.1 | Backend Directions proxy (key stays server-side) | P0 | ✅ |
| FR-6.2 | Route polyline rendering on Ride Details | P0 | ✅ (Leaflet/OSM) |
| FR-6.3 | Real ETA display (driving, with waypoints) | P0 | ✅ (mock calc; real on key) |
| FR-6.4 | Places autocomplete (India-scoped, session tokens) | P0 | ✅ (mock list; real on key) |
| FR-6.5 | Live tracking: animated driver marker + countdown ETA | P0 | ✅ (simulated progress) |
| FR-6.6 | Real driver GPS broadcast (WebSocket) | P1 | ⏳ Backlog |
| FR-6.7 | Native Google Maps rendering (dev build) | P1 | ⏳ Ready (key + build needed) |

### 6.7 Communication & Trust ✅
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-7.1 | In-app chat per booking | P0 | ✅ |
| FR-7.2 | 5-star rating + comment post-ride | P0 | ✅ |
| FR-7.3 | Aadhaar-verified badge on profiles & cards | P0 | ✅ |
| FR-7.4 | SOS: alert with booking + location context | P0 | ✅ (admin-visible) |
| FR-7.5 | Push notifications (booking events) | P1 | ⏳ Backlog |
| FR-7.6 | SMS fallback for OTP/confirmations | P2 | ⏳ Backlog |
| FR-7.7 | Masked phone calling | P2 | ⏳ Backlog |

### 6.8 Admin Panel ✅ (in-app)
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-8.1 | Platform stats: users, vehicles, rides, bookings, SOS | P0 | ✅ |
| FR-8.2 | User list with verification/wallet/rating | P0 | ✅ |
| FR-8.3 | Ride list with status | P0 | ✅ |
| FR-8.4 | SOS alert feed | P0 | ✅ |
| FR-8.5 | Revenue/commission dashboard | P1 | ⏳ Backlog |
| FR-8.6 | Suspend user / delist ride actions | P1 | ⏳ Backlog |

---

## 7. Smart Features (Roadmap — from original spec)

| Feature | Priority | Status |
|---|---|---|
| Smart matching engine (route-overlap scoring, detour tolerance) | P1 | ⏳ Backlog |
| Real-time alerts for matching rides ("3 new rides Mumbai→Pune") | P1 | ⏳ Backlog |
| Referral system (₹50 wallet credit both sides) | P1 | ⏳ Backlog |
| Rewards & badges (Top Driver, 50 Rides Club, Safe Driver) | P2 | ⏳ Backlog |
| EV-only rides filter (green travel badge) | P2 | ⏳ Backlog |
| Driver Plus subscription ₹99/mo (0% commission first 20 rides + priority listing) | P1 | ⏳ Backlog — **proposed monetization** |
| Dynamic pricing suggestions for owners | P2 | ⏳ Backlog |
| Women-only ride preference | P1 | ⏳ Backlog |
| Multi-language (Hindi first) | P1 | ⏳ Deferred by user |
| Dark mode | P2 | ⏳ Deferred by user |

---

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Search results < 2s; chat delivery < 3s (polling); payment finalization < 5s |
| **Scalability** | Stateless FastAPI; MongoDB indexes on rides(route+date), bookings(user), payments(id) |
| **Security** | Server-side payment amount computation; HMAC webhook verification; no secrets in client; Aadhaar stored as last-4 only |
| **Reliability** | Idempotent payment ledger (atomic `credited` claim); graceful map fallback when Google key absent |
| **Usability** | 44pt+ touch targets; safe-area aware; works in Expo Go + web preview |
| **Compliance** | Motor Vehicles (Amendment) carpooling provision adherence; payment data via PCI-DSS compliant gateways only |

---

## 9. Monetization

1. **Commission** (live): 10% of every paid booking — auto-split at payment finalization.
2. **Driver Plus subscription** (planned): ₹99/month — 0% commission on first 20 rides + priority search placement.
3. **Featured rides** (planned): owners pay ₹20 to top-list a ride for 24h.
4. **Advertising** (future): fuel/highway-dhaba partner placements along route.

---

## 10. Release History

| Date | Release | Contents |
|---|---|---|
| 2026-08-07 | v1.0 MVP | Full dual-role marketplace: auth, Aadhaar (mock), vehicles, rides, bookings, chat, wallet, ratings, SOS, admin. 19/19 backend tests + frontend E2E pass |
| 2026-08-07 | v1.1 Payments | Razorpay + PhonePe integration (sandbox/simulator mode), wallet top-up + direct ride payment, idempotent ledger, webhooks. 18/18 payment tests pass |
| 2026-08-07 | v1.2 Maps | Google Directions + Places proxy (mock mode), Leaflet/OSM map component, real ETA pills, autocomplete fields, animated live tracking. 12/12 maps tests pass |

---

## 11. Open Questions

1. KYC depth: is Aadhaar-OTP enough, or do we need DL verification for owners before first payout?
2. Commission floor: should short rides (<₹100) have flat ₹10 commission instead of 10%?
3. Insurance: do we partner for per-ride passenger accident cover?
4. Cancellation policy: who bears gateway fees on refunds?
