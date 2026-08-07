"""PAID LIFT backend tests — covers full mocked p2p ride marketplace API."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://paid-lift.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Health ----------
def test_health(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert "PAID LIFT" in r.json().get("message", "")


# ---------- Auth ----------
UNIQUE_PHONE = f"98{int(time.time()) % 100000000:08d}"


def test_send_otp(s):
    r = s.post(f"{API}/auth/send-otp", json={"phone": UNIQUE_PHONE})
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["mock_otp"] == "123456"


def test_verify_otp_invalid(s):
    r = s.post(f"{API}/auth/verify-otp", json={"phone": UNIQUE_PHONE, "otp": "000000"})
    assert r.status_code == 400


def test_verify_otp_creates_user(s):
    r = s.post(f"{API}/auth/verify-otp", json={"phone": UNIQUE_PHONE, "otp": "123456"})
    assert r.status_code == 200
    data = r.json()
    assert data["is_new"] is True
    assert data["user"]["phone"] == UNIQUE_PHONE
    pytest.user_id = data["user"]["id"]


# ---------- Users ----------
def test_users_upsert_creates_and_aadhaar_sets_verified(s):
    r = s.post(f"{API}/users/upsert", json={
        "phone": UNIQUE_PHONE, "name": "TEST_User", "email": "t@test.com",
        "aadhaar_last4": "1234", "role": "both",
    })
    assert r.status_code == 200
    u = r.json()
    assert u["name"] == "TEST_User"
    assert u["aadhaar_verified"] is True
    assert u["role"] == "both"


def test_users_get(s):
    r = s.get(f"{API}/users/{pytest.user_id}")
    assert r.status_code == 200
    assert r.json()["phone"] == UNIQUE_PHONE


# ---------- Vehicles ----------
def test_vehicle_create_and_list(s):
    r = s.post(f"{API}/vehicles", json={
        "owner_id": pytest.user_id, "vehicle_type": "sedan", "make": "Maruti",
        "model": "Swift", "plate": f"TEST{int(time.time()) % 10000}", "seats_total": 4,
    })
    assert r.status_code == 200
    v = r.json()
    assert v["owner_id"] == pytest.user_id
    pytest.vehicle_id = v["id"]

    r2 = s.get(f"{API}/vehicles", params={"owner_id": pytest.user_id})
    assert r2.status_code == 200
    assert any(x["id"] == pytest.vehicle_id for x in r2.json())


# ---------- Rides ----------
def test_ride_create(s):
    r = s.post(f"{API}/rides", json={
        "owner_id": pytest.user_id, "vehicle_id": pytest.vehicle_id,
        "from_location": "TestCity", "to_location": "DestCity", "stops": [],
        "depart_at": "2027-01-01T09:00:00+00:00", "seats_available": 3,
        "price_per_seat": 500, "vehicle_type": "sedan", "notes": "TEST",
    })
    assert r.status_code == 200
    pytest.ride_id = r.json()["id"]


def test_ride_search_seeded_mumbai_pune(s):
    r = s.get(f"{API}/rides", params={"from_location": "Mumbai", "to_location": "Pune"})
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) >= 1
    d = docs[0]
    assert d["from_location"] == "Mumbai"
    assert d["to_location"] == "Pune"
    assert "owner" in d and d["owner"].get("name")
    assert "vehicle" in d and d["vehicle"].get("plate")
    pytest.seeded_ride_id = d["id"]


def test_ride_search_vehicle_type_filter(s):
    r = s.get(f"{API}/rides", params={"vehicle_type": "sedan"})
    assert r.status_code == 200
    for d in r.json():
        assert d["vehicle_type"] == "sedan"


def test_get_single_ride_enriched(s):
    r = s.get(f"{API}/rides/{pytest.seeded_ride_id}")
    assert r.status_code == 200
    data = r.json()
    assert data["owner"].get("name")
    assert data["vehicle"].get("plate")


# ---------- Bookings ----------
def test_booking_create(s):
    r = s.post(f"{API}/bookings", json={
        "ride_id": pytest.seeded_ride_id, "passenger_id": pytest.user_id, "seats": 1,
    })
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "pending"
    assert b["total_price"] == 450.0
    pytest.booking_id = b["id"]


def test_booking_accept_decrements_seats(s):
    ride_before = s.get(f"{API}/rides/{pytest.seeded_ride_id}").json()
    seats_before = ride_before["seats_available"]
    r = s.patch(f"{API}/bookings/{pytest.booking_id}", json={"status": "accepted"})
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"
    ride_after = s.get(f"{API}/rides/{pytest.seeded_ride_id}").json()
    assert ride_after["seats_available"] == seats_before - 1


def test_wallet_topup_then_paid_flow(s):
    # topup passenger
    r = s.post(f"{API}/wallet/{pytest.user_id}/topup", params={"amount": 1000})
    assert r.status_code == 200
    w = s.get(f"{API}/wallet/{pytest.user_id}").json()
    assert w["balance"] >= 1000
    assert any(t["kind"] == "topup" for t in w["transactions"])

    owner_id = s.get(f"{API}/bookings/{pytest.booking_id}").json()["owner_id"]
    owner_bal_before = s.get(f"{API}/wallet/{owner_id}").json()["balance"]

    # mark paid
    r2 = s.patch(f"{API}/bookings/{pytest.booking_id}", json={"paid": True})
    assert r2.status_code == 200
    assert r2.json()["paid"] is True

    # verify wallet txns
    p_txns = s.get(f"{API}/wallet/{pytest.user_id}").json()["transactions"]
    assert any(t["kind"] == "ride_payment" and t["amount"] == -450.0 for t in p_txns)

    o_wallet = s.get(f"{API}/wallet/{owner_id}").json()
    o_txns = o_wallet["transactions"]
    # Owner earns 90% (450 - 45 commission = 405); commission txn logged as -45
    assert any(t["kind"] == "ride_earning" and t["amount"] == 405.0 for t in o_txns)
    assert any(t["kind"] == "commission" and t["amount"] == -45.0 for t in o_txns)
    # net owner earning = 450 - 45 = 405
    assert round(o_wallet["balance"] - owner_bal_before, 2) == 405.0


# ---------- Chat ----------
def test_chat_post_and_list(s):
    r = s.post(f"{API}/chat", json={
        "booking_id": pytest.booking_id, "sender_id": pytest.user_id, "text": "TEST hello",
    })
    assert r.status_code == 200
    r2 = s.get(f"{API}/chat/{pytest.booking_id}")
    assert r2.status_code == 200
    assert any(m["text"] == "TEST hello" for m in r2.json())


# ---------- Ratings ----------
def test_rating_creates_and_recomputes(s):
    owner_id = s.get(f"{API}/bookings/{pytest.booking_id}").json()["owner_id"]
    r = s.post(f"{API}/ratings", json={
        "booking_id": pytest.booking_id, "rater_id": pytest.user_id,
        "rated_id": owner_id, "stars": 5, "comment": "TEST great",
    })
    assert r.status_code == 200
    u = s.get(f"{API}/users/{owner_id}").json()
    assert u["rating_count"] >= 1
    assert u["rating_avg"] > 0


# ---------- SOS ----------
def test_sos_create(s):
    r = s.post(f"{API}/sos", json={
        "booking_id": pytest.booking_id, "user_id": pytest.user_id, "location": "12.9,77.5",
    })
    assert r.status_code == 200
    assert r.json()["booking_id"] == pytest.booking_id


# ---------- Admin ----------
def test_admin_stats(s):
    r = s.get(f"{API}/admin/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ("users", "vehicles", "rides", "bookings", "sos_alerts"):
        assert k in d and d[k] >= 1


def test_admin_users_rides_sos(s):
    for path in ("users", "rides", "sos"):
        r = s.get(f"{API}/admin/{path}")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
