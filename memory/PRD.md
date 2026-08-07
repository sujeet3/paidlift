# PAID LIFT — Product Requirements Document

## Overview
PAID LIFT is a peer-to-peer ride-sharing and empty-seat marketplace for the Indian market. Any person can book a ride, and any vehicle owner can offer empty seats — highway, bus stand or any location. Both sides complete full profile with Aadhaar verification (mocked in MVP).

## Stack
- **Frontend**: Expo 54 (React Native) with Expo Router, TypeScript
- **Backend**: FastAPI + Motor (async MongoDB) + Pydantic v2
- **Storage**: MongoDB (already-configured `MONGO_URL`)
- **Design**: iOS-Native Clean with warm terracotta accent (`#EF6C00`)

## MVP Features
1. Dual registration — Passenger / Vehicle Owner, phone + OTP + Aadhaar OTP (mocked, OTP = `123456`)
2. Vehicle management — 2-wheeler, auto, sedan, SUV, bus/tempo, luxury with RC/insurance/DL
3. Offer-a-Ride — Route (with stops), date/time, seats, price per seat, notes
4. Find-a-Ride — Search by from/to/date, filter by vehicle type
5. Booking — Pending → accept/reject (decrements seats) → passenger pays from wallet
6. Wallet & Payments — Mock top-up; ride payment debits passenger and credits owner (10% platform commission)
7. In-app chat — Polling-based realtime
8. Live tracking — Map placeholder + fake ETA + floating SOS
9. Ratings & Reviews — 5-star with comment, recomputes user's `rating_avg`
10. SOS — Dedicated screen + overlay during live tracking
11. My Rides — Passenger + owner tabs with status pills
12. In-app Admin Panel — Stats/users/rides/SOS

## Mocked Integrations
- Phone OTP → `123456`
- Aadhaar OTP → any 12-digit + OTP `123456`
- Payment gateway → wallet instantly credited on top-up
- Push notifications → in-app polling only (no real push)
- GPS live tracking → static map + fake ETA

## Backend Auto-Seed
On startup if `rides` is empty: 3 demo owners + 3 vehicles + 4 rides (Mumbai↔Pune, Delhi↔Jaipur, Ahmedabad↔Vadodara, Bengaluru↔Mysuru).

## Testing
- 19/19 backend pytest tests pass (`/app/test_reports/pytest/paidlift_results.xml`)
- Frontend onboarding + search verified via browser automation
