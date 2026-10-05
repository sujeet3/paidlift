# PAID LIFT — Test Credentials

The auth flow is a **mocked phone + OTP + Aadhaar** flow. There are no persistent admin accounts; any phone number works.

## How to sign in (testing agent)

1. On onboarding, enter any valid 10-digit phone number (e.g. `9876543210`).
2. Tap "Send OTP".
3. On the OTP step, enter: `123456`
4. If the user is new, complete profile (name, optional email).
5. For Aadhaar step: enter any 12-digit number (e.g. `123412341234`) and OTP `123456`.
6. Pick a role (Passenger or Owner) and finish.

## Demo (seeded) users on backend

Not usable for login (login is by phone OTP), but they own the seeded rides:
- `+919000000001` – Rahul Verma (owner, sedan Mumbai→Pune)
- `+919000000002` – Priya Sharma (owner, SUV Delhi→Jaipur)
- `+919000000003` – Amit Patel (owner, auto Ahmedabad→Vadodara)

## Admin panel

In-app: Profile tab → "Admin panel" row. No password.
