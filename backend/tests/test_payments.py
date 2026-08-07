"""Payments module tests — Razorpay + PhonePe simulator, idempotency, tamper-resistance."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://paid-lift.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def passenger(api):
    # Create a fresh passenger via OTP verify
    phone = "+91900TEST001"
    r = api.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "otp": "123456"})
    assert r.status_code == 200
    return r.json()["user"]


@pytest.fixture(scope="module")
def second_user(api):
    phone = "+91900TEST002"
    r = api.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "otp": "123456"})
    return r.json()["user"]


@pytest.fixture(scope="module")
def booking(api, passenger, second_user):
    # Create own vehicle + ride so the fixture is self-sufficient
    veh = api.post(f"{BASE_URL}/api/vehicles", json={
        "owner_id": second_user["id"], "vehicle_type": "sedan",
        "plate": "TESTPAY01", "seats_total": 4,
    }).json()
    from datetime import datetime, timedelta, timezone
    depart = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    ride = api.post(f"{BASE_URL}/api/rides", json={
        "owner_id": second_user["id"], "vehicle_id": veh["id"],
        "from_location": "TESTA", "to_location": "TESTB",
        "depart_at": depart, "seats_available": 4,
        "price_per_seat": 200, "vehicle_type": "sedan",
    }).json()
    r = api.post(f"{BASE_URL}/api/bookings", json={
        "ride_id": ride["id"], "passenger_id": passenger["id"], "seats": 1,
    })
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Order creation ----------
class TestOrderCreation:
    def test_razorpay_wallet_topup_order(self, api, passenger):
        r = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "wallet_topup",
            "user_id": passenger["id"], "amount": 500,
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["payment_id"] and j["checkout_url"] and j["simulated"] is True
        assert j["amount_paise"] == 50000
        assert "/simulator?payment_id=" in j["checkout_url"]

    def test_phonepe_wallet_topup_order(self, api, passenger):
        r = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "phonepe", "purpose": "wallet_topup",
            "user_id": passenger["id"], "amount": 250,
        })
        assert r.status_code == 200
        j = r.json()
        assert j["simulated"] is True
        assert j["amount_paise"] == 25000
        assert j["provider"] == "phonepe"

    def test_wallet_topup_requires_amount(self, api, passenger):
        r = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "wallet_topup",
            "user_id": passenger["id"],
        })
        assert r.status_code == 400

    def test_ride_requires_booking_id(self, api, passenger):
        r = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "ride",
            "user_id": passenger["id"], "amount": 1,
        })
        assert r.status_code == 400

    def test_ride_amount_server_side(self, api, passenger, booking):
        # Try to tamper amount — server should still use booking.total_price
        r = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "ride",
            "user_id": passenger["id"], "booking_id": booking["id"],
            "amount": 1,  # attempted tamper
        })
        assert r.status_code == 200
        j = r.json()
        expected_paise = int(round(booking["total_price"] * 100))
        assert j["amount_paise"] == expected_paise, f"expected {expected_paise} got {j['amount_paise']}"

    def test_ride_passenger_mismatch_403(self, api, second_user, booking):
        r = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "ride",
            "user_id": second_user["id"], "booking_id": booking["id"],
        })
        assert r.status_code == 403

    def test_unknown_booking_404(self, api, passenger):
        r = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "ride",
            "user_id": passenger["id"], "booking_id": "nope",
        })
        assert r.status_code == 404


# ---------- Simulator + finalisation ----------
class TestSimulatorFinalisation:
    def test_simulator_html(self, api, passenger):
        order = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "wallet_topup",
            "user_id": passenger["id"], "amount": 100,
        }).json()
        r = api.get(f"{BASE_URL}/api/payments/simulator", params={"payment_id": order["payment_id"]})
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "Pay " in r.text and "100.00" in r.text

    def test_wallet_topup_credits_wallet(self, api, passenger):
        before = api.get(f"{BASE_URL}/api/wallet/{passenger['id']}").json()["balance"]
        order = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "wallet_topup",
            "user_id": passenger["id"], "amount": 300,
        }).json()
        r = api.post(f"{BASE_URL}/api/payments/simulator/callback", json={
            "payment_id": order["payment_id"], "result": "success"
        })
        assert r.status_code == 200

        # status now paid
        st = api.post(f"{BASE_URL}/api/payments/status", json={"payment_id": order["payment_id"]}).json()
        assert st["status"] == "paid"

        after = api.get(f"{BASE_URL}/api/wallet/{passenger['id']}").json()
        assert round(after["balance"] - before, 2) == 300.00
        assert any(t["kind"] == "topup" and t["amount"] == 300 for t in after["transactions"])

    def test_idempotent_double_callback(self, api, passenger):
        order = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "phonepe", "purpose": "wallet_topup",
            "user_id": passenger["id"], "amount": 150,
        }).json()
        before = api.get(f"{BASE_URL}/api/wallet/{passenger['id']}").json()["balance"]
        for _ in range(3):
            api.post(f"{BASE_URL}/api/payments/simulator/callback",
                     json={"payment_id": order["payment_id"], "result": "success"})
        after = api.get(f"{BASE_URL}/api/wallet/{passenger['id']}").json()["balance"]
        assert round(after - before, 2) == 150.00, "Double credit! Idempotency broken"

    def test_ride_payment_flow(self, api, passenger, second_user):
        # Fresh ride & booking so we can also verify seats decrement + owner credit
        # Use existing owner from seed
        rides = api.get(f"{BASE_URL}/api/rides").json()
        # find any open ride
        ride = next((r for r in rides if r["seats_available"] > 0), None)
        assert ride
        seats_before = ride["seats_available"]
        owner_id = ride["owner_id"]
        owner_balance_before = api.get(f"{BASE_URL}/api/wallet/{owner_id}").json()["balance"]

        b = api.post(f"{BASE_URL}/api/bookings", json={
            "ride_id": ride["id"], "passenger_id": passenger["id"], "seats": 1,
        }).json()

        order = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "ride",
            "user_id": passenger["id"], "booking_id": b["id"],
        }).json()
        api.post(f"{BASE_URL}/api/payments/simulator/callback",
                 json={"payment_id": order["payment_id"], "result": "success"})

        # booking now paid
        b2 = api.get(f"{BASE_URL}/api/bookings/{b['id']}").json()
        assert b2["paid"] is True

        # seats decremented
        r2 = api.get(f"{BASE_URL}/api/rides/{ride['id']}").json()
        assert r2["seats_available"] == seats_before - 1

        # owner wallet credited 90%
        commission = round(b["total_price"] * 0.10, 2)
        expected_credit = round(b["total_price"] - commission, 2)
        owner_balance_after = api.get(f"{BASE_URL}/api/wallet/{owner_id}").json()["balance"]
        assert round(owner_balance_after - owner_balance_before, 2) == expected_credit

    def test_paid_booking_cannot_reorder(self, api, passenger):
        # Create + pay a booking
        rides = api.get(f"{BASE_URL}/api/rides").json()
        ride = next((r for r in rides if r["seats_available"] > 0), None)
        assert ride
        b = api.post(f"{BASE_URL}/api/bookings", json={
            "ride_id": ride["id"], "passenger_id": passenger["id"], "seats": 1,
        }).json()
        order = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "phonepe", "purpose": "ride",
            "user_id": passenger["id"], "booking_id": b["id"],
        }).json()
        api.post(f"{BASE_URL}/api/payments/simulator/callback",
                 json={"payment_id": order["payment_id"], "result": "success"})
        # Attempt to re-order
        r = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "ride",
            "user_id": passenger["id"], "booking_id": b["id"],
        })
        assert r.status_code == 400

    def test_failed_callback(self, api, passenger):
        order = api.post(f"{BASE_URL}/api/payments/order", json={
            "provider": "razorpay", "purpose": "wallet_topup",
            "user_id": passenger["id"], "amount": 100,
        }).json()
        before = api.get(f"{BASE_URL}/api/wallet/{passenger['id']}").json()["balance"]
        api.post(f"{BASE_URL}/api/payments/simulator/callback",
                 json={"payment_id": order["payment_id"], "result": "failed"})
        st = api.post(f"{BASE_URL}/api/payments/status", json={"payment_id": order["payment_id"]}).json()
        assert st["status"] == "failed"
        after = api.get(f"{BASE_URL}/api/wallet/{passenger['id']}").json()["balance"]
        assert after == before  # no credit


class TestRegressions:
    def test_root(self, api):
        assert api.get(f"{BASE_URL}/api/").status_code == 200

    def test_send_otp(self, api):
        assert api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "+919999999999"}).status_code == 200

    def test_admin_stats(self, api):
        r = api.get(f"{BASE_URL}/api/admin/stats")
        assert r.status_code == 200
        j = r.json()
        for k in ("users", "vehicles", "rides", "bookings"):
            assert k in j

    def test_rides_search(self, api):
        r = api.get(f"{BASE_URL}/api/rides", params={"from_location": "Mumbai"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_status_unknown_payment(self, api):
        r = api.post(f"{BASE_URL}/api/payments/status", json={"payment_id": "nope"})
        assert r.status_code == 404
