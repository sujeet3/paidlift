"""
PAID LIFT v1.3 feature-gap test suite (iteration 4).
Covers: QA guards (self-booking, overbooking, rate limits), vehicle approval,
ride auto-expire, corridor matching, women-only rides, EV filter, Driver Plus
(subscription + 0% commission), withdrawals, cancellation refunds, referrals,
live location, badges, admin moderation + revenue, object storage upload,
WebSocket chat.
"""
import io
import json
import os
import time
import uuid
import asyncio

import pytest
import requests


def _load_base_url() -> str:
    env_path = "/app/frontend/.env"
    with open(env_path) as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                return line.strip().split("=", 1)[1].rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL missing in frontend/.env")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _uniq_phone() -> str:
    return "97" + uuid.uuid4().hex[:8].replace("a", "1").replace("b", "2").replace("c", "3").replace("d", "4").replace("e", "5").replace("f", "6")


def create_user(client, name, gender="male"):
    phone = _uniq_phone()
    r = client.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "123456"})
    assert r.status_code == 200, r.text
    r = client.post(f"{API}/users/upsert", json={"phone": phone, "name": name, "gender": gender})
    assert r.status_code == 200, r.text
    return r.json()


def create_vehicle(client, owner_id, fuel="petrol"):
    r = client.post(f"{API}/vehicles", json={
        "owner_id": owner_id, "vehicle_type": "sedan", "make": "TEST", "model": "Car",
        "plate": f"TEST{uuid.uuid4().hex[:6].upper()}", "seats_total": 4, "fuel_type": fuel,
    })
    assert r.status_code == 200, r.text
    return r.json()


def create_ride(client, owner_id, vehicle_id, seats=2, depart_in_hours=24, women_only=False,
                frm="TESTCityA", to="TESTCityB"):
    from datetime import datetime, timezone, timedelta
    depart = (datetime.now(timezone.utc) + timedelta(hours=depart_in_hours)).isoformat()
    r = client.post(f"{API}/rides", json={
        "owner_id": owner_id, "vehicle_id": vehicle_id, "from_location": frm,
        "to_location": to, "stops": [], "depart_at": depart, "seats_available": seats,
        "price_per_seat": 100, "vehicle_type": "sedan", "women_only": women_only,
    })
    return r


def topup(client, user_id, amount):
    r = client.post(f"{API}/wallet/{user_id}/topup", params={"amount": amount})
    assert r.status_code == 200, r.text


def wallet_balance(client, user_id):
    r = client.get(f"{API}/wallet/{user_id}")
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Health ----------
class TestHealth:
    def test_api_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert "PAID LIFT" in r.json().get("message", "")


# ---------- QA guards ----------
class TestQAGuards:
    def test_self_booking_returns_400(self, client):
        rides = client.get(f"{API}/rides").json()
        ride = next(r for r in rides if r["from_location"] == "Mumbai" and r["to_location"] == "Pune")
        r = client.post(f"{API}/bookings", json={
            "ride_id": ride["id"], "passenger_id": ride["owner_id"], "seats": 1,
        })
        assert r.status_code == 400, r.text
        assert "Self-booking" in r.json()["detail"]

    def test_overbooking_accept_returns_400(self, client):
        owner = create_user(client, "TEST Overbook Owner")
        veh = create_vehicle(client, owner["id"])
        client.post(f"{API}/admin/vehicles/{veh['id']}/approve")
        ride = create_ride(client, owner["id"], veh["id"], seats=1).json()
        p1 = create_user(client, "TEST P1")
        p2 = create_user(client, "TEST P2")
        b1 = client.post(f"{API}/bookings", json={"ride_id": ride["id"], "passenger_id": p1["id"], "seats": 1}).json()
        b2 = client.post(f"{API}/bookings", json={"ride_id": ride["id"], "passenger_id": p2["id"], "seats": 1}).json()
        r1 = client.patch(f"{API}/bookings/{b1['id']}", json={"status": "accepted"})
        assert r1.status_code == 200, r1.text
        r2 = client.patch(f"{API}/bookings/{b2['id']}", json={"status": "accepted"})
        assert r2.status_code == 400, r2.text
        # ride seats must not go negative
        ride_after = client.get(f"{API}/rides/{ride['id']}").json()
        assert ride_after["seats_available"] == 0

    def test_send_otp_rate_limited(self, client):
        phone = _uniq_phone()
        codes = [client.post(f"{API}/auth/send-otp", json={"phone": phone}).status_code for _ in range(6)]
        assert codes[:5] == [200] * 5, codes
        assert codes[5] == 429, codes


# ---------- Ride search: expiry, corridor, women-only, EV, Driver Plus ----------
class TestRideSearch:
    def test_auto_expire_excludes_old_rides(self, client):
        owner = create_user(client, "TEST Expiry Owner")
        veh = create_vehicle(client, owner["id"])
        client.post(f"{API}/admin/vehicles/{veh['id']}/approve")
        resp = create_ride(client, owner["id"], veh["id"], depart_in_hours=-5)
        assert resp.status_code == 200, resp.text
        old_ride = resp.json()
        public_ids = [r["id"] for r in client.get(f"{API}/rides").json()]
        assert old_ride["id"] not in public_ids
        # owner view still shows it
        own_ids = [r["id"] for r in client.get(f"{API}/rides", params={"owner_id": owner["id"]}).json()]
        assert old_ride["id"] in own_ids

    def test_corridor_matching_via_stop(self, client):
        r = client.get(f"{API}/rides", params={"from_location": "Lonavala", "to_location": "Pune"})
        assert r.status_code == 200
        rides = r.json()
        assert any(x["from_location"] == "Mumbai" and x["to_location"] == "Pune" for x in rides), rides
        # reverse order must NOT match (Pune -> Lonavala along Mumbai->Pune route)
        r2 = client.get(f"{API}/rides", params={"from_location": "Pune", "to_location": "Lonavala"})
        assert not any(x["from_location"] == "Mumbai" and x["to_location"] == "Pune" for x in r2.json())

    def test_women_only_filter_and_booking_guard(self, client):
        r = client.get(f"{API}/rides", params={"women_only": "true"})
        assert r.status_code == 200
        rides = r.json()
        assert len(rides) >= 1
        assert all(x.get("women_only") for x in rides)
        wo = rides[0]
        male = create_user(client, "TEST Male", gender="male")
        rb = client.post(f"{API}/bookings", json={"ride_id": wo["id"], "passenger_id": male["id"], "seats": 1})
        assert rb.status_code == 400, rb.text
        female = create_user(client, "TEST Female", gender="female")
        rf = client.post(f"{API}/bookings", json={"ride_id": wo["id"], "passenger_id": female["id"], "seats": 1})
        assert rf.status_code == 200, rf.text
        # cleanup: cancel pending booking
        client.patch(f"{API}/bookings/{rf.json()['id']}", json={"status": "cancelled"})

    def test_ev_filter(self, client):
        r = client.get(f"{API}/rides", params={"fuel_type": "ev"})
        assert r.status_code == 200
        rides = r.json()
        assert len(rides) >= 1
        assert all((x.get("vehicle") or {}).get("fuel_type") == "ev" for x in rides)

    def test_driver_plus_sorted_first(self, client):
        rides = client.get(f"{API}/rides").json()
        flags = [bool(r.get("driver_plus")) for r in rides]
        assert flags == sorted(flags, reverse=True), flags
        assert any(flags), "expected at least one Driver Plus ride (seed Priya)"


# ---------- Vehicle approval workflow ----------
class TestVehicleApproval:
    def test_new_vehicle_pending_then_approve(self, client):
        owner = create_user(client, "TEST Veh Owner")
        veh = create_vehicle(client, owner["id"], fuel="ev")
        assert veh["approved"] is False
        # ride creation blocked while pending
        blocked = create_ride(client, owner["id"], veh["id"])
        assert blocked.status_code == 400, blocked.text
        # pending list includes it
        pending = client.get(f"{API}/admin/vehicles", params={"status": "pending"}).json()
        assert any(v["id"] == veh["id"] for v in pending)
        # approve
        r = client.post(f"{API}/admin/vehicles/{veh['id']}/approve")
        assert r.status_code == 200 and r.json()["approved"] is True
        ok = create_ride(client, owner["id"], veh["id"])
        assert ok.status_code == 200, ok.text


# ---------- Driver Plus subscription ----------
class TestDriverPlus:
    def test_subscription_order_and_activation(self, client):
        user = create_user(client, "TEST Sub User")
        r = client.post(f"{API}/payments/order", json={
            "provider": "razorpay", "purpose": "subscription", "user_id": user["id"], "amount": 99999,
        })
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["amount_paise"] == 9900, order  # fixed server-side, ignores client amount
        assert order["simulated"] is True
        cb = client.post(f"{API}/payments/simulator/callback", json={"payment_id": order["payment_id"], "result": "success"})
        assert cb.status_code == 200
        u = client.get(f"{API}/users/{user['id']}").json()
        dp = u.get("driver_plus") or {}
        assert dp.get("active") is True
        assert dp.get("rides_left") == 20
        from datetime import datetime, timezone
        expires = datetime.fromisoformat(dp["expires_at"])
        delta_days = (expires - datetime.now(timezone.utc)).days
        assert 28 <= delta_days <= 31
        assert u.get("driver_plus_active") is True

    def test_driver_plus_ride_payment_zero_commission(self, client):
        # Priya (seed) has active Driver Plus; her non-women-only Delhi->Jaipur ride
        rides = client.get(f"{API}/rides").json()
        ride = next(r for r in rides if r["from_location"] == "Delhi" and not r.get("women_only"))
        owner_id = ride["owner_id"]
        owner_before = client.get(f"{API}/users/{owner_id}").json()
        rides_left_before = (owner_before.get("driver_plus") or {}).get("rides_left")
        owner_wallet_before = wallet_balance(client, owner_id)["balance"]

        passenger = create_user(client, "TEST DP Passenger")
        b = client.post(f"{API}/bookings", json={"ride_id": ride["id"], "passenger_id": passenger["id"], "seats": 1}).json()
        order = client.post(f"{API}/payments/order", json={
            "provider": "phonepe", "purpose": "ride", "user_id": passenger["id"], "booking_id": b["id"],
        }).json()
        cb = client.post(f"{API}/payments/simulator/callback", json={"payment_id": order["payment_id"], "result": "success"})
        assert cb.status_code == 200

        b_after = client.get(f"{API}/bookings/{b['id']}").json()
        assert b_after["paid"] is True
        total = b_after["total_price"]
        # owner got full amount, zero commission
        owner_wallet_after = wallet_balance(client, owner_id)
        assert abs((owner_wallet_after["balance"] - owner_wallet_before) - total) < 0.01
        commission_txns = [t for t in owner_wallet_after["transactions"]
                           if t["kind"] == "commission" and b["id"] in t.get("note", "")]
        assert commission_txns == []
        # rides_left decremented
        owner_after = client.get(f"{API}/users/{owner_id}").json()
        assert (owner_after.get("driver_plus") or {}).get("rides_left") == rides_left_before - 1


# ---------- Withdrawals ----------
class TestWithdrawals:
    def test_withdraw_and_admin_reject_refund(self, client):
        user = create_user(client, "TEST Withdraw")
        topup(client, user["id"], 300)
        bal0 = wallet_balance(client, user["id"])["balance"]
        r = client.post(f"{API}/wallet/{user['id']}/withdraw", json={"amount": 200, "upi_id": "test@upi"})
        assert r.status_code == 200, r.text
        wd = r.json()
        assert wd["status"] == "pending"
        assert wallet_balance(client, user["id"])["balance"] == bal0 - 200
        # admin reject -> refund
        d = client.post(f"{API}/admin/withdrawals/{wd['id']}/decide", params={"approve": "false"})
        assert d.status_code == 200 and d.json()["status"] == "rejected"
        assert wallet_balance(client, user["id"])["balance"] == bal0
        txns = wallet_balance(client, user["id"])["transactions"]
        assert any("refunded" in t.get("note", "").lower() for t in txns)

    def test_withdraw_insufficient_balance_400(self, client):
        user = create_user(client, "TEST Withdraw Poor")
        r = client.post(f"{API}/wallet/{user['id']}/withdraw", json={"amount": 500, "upi_id": "x@upi"})
        assert r.status_code == 400


# ---------- Ride cancellation refunds ----------
class TestRideCancellation:
    def test_cancel_ride_refunds_and_restores(self, client):
        owner = create_user(client, "TEST Cancel Owner")
        veh = create_vehicle(client, owner["id"])
        client.post(f"{API}/admin/vehicles/{veh['id']}/approve")
        ride = create_ride(client, owner["id"], veh["id"], seats=2).json()

        passenger = create_user(client, "TEST Cancel Passenger")
        topup(client, passenger["id"], 500)
        b = client.post(f"{API}/bookings", json={"ride_id": ride["id"], "passenger_id": passenger["id"], "seats": 1}).json()
        ra = client.patch(f"{API}/bookings/{b['id']}", json={"status": "accepted"})
        assert ra.status_code == 200, ra.text
        r = client.patch(f"{API}/bookings/{b['id']}", json={"paid": True})
        assert r.status_code == 200, r.text
        total = b["total_price"]
        p_bal_after_pay = wallet_balance(client, passenger["id"])["balance"]
        o_bal_after_pay = wallet_balance(client, owner["id"])["balance"]
        seats_after_pay = client.get(f"{API}/rides/{ride['id']}").json()["seats_available"]
        assert seats_after_pay == 1

        rc = client.patch(f"{API}/rides/{ride['id']}", json={"status": "cancelled"})
        assert rc.status_code == 200, rc.text
        assert rc.json()["status"] == "cancelled"
        # booking cancelled
        b_after = client.get(f"{API}/bookings/{b['id']}").json()
        assert b_after["status"] == "cancelled"
        # seats restored
        assert client.get(f"{API}/rides/{ride['id']}").json()["seats_available"] == 2
        # passenger refunded full
        assert abs(wallet_balance(client, passenger["id"])["balance"] - (p_bal_after_pay + total)) < 0.01
        # owner debited 90% of total
        assert abs(wallet_balance(client, owner["id"])["balance"] - (o_bal_after_pay - total * 0.9)) < 0.01


# ---------- Referral ----------
class TestReferral:
    def test_referral_bonus_both_sides(self, client):
        referrer = create_user(client, "TEST Referrer")
        referee = create_user(client, "TEST Referee")
        r = client.post(f"{API}/referrals/apply", json={"user_id": referee["id"], "code": referrer["referral_code"]})
        assert r.status_code == 200, r.text

        # referee completes first booking (on a TEST ride owned by a third user)
        owner = create_user(client, "TEST Ref Owner")
        veh = create_vehicle(client, owner["id"])
        client.post(f"{API}/admin/vehicles/{veh['id']}/approve")
        ride = create_ride(client, owner["id"], veh["id"], seats=1).json()
        topup(client, referee["id"], 500)
        b = client.post(f"{API}/bookings", json={"ride_id": ride["id"], "passenger_id": referee["id"], "seats": 1}).json()
        client.patch(f"{API}/bookings/{b['id']}", json={"paid": True})
        ref_bal0 = wallet_balance(client, referrer["id"])["balance"]
        fee_bal0 = wallet_balance(client, referee["id"])["balance"]
        rc = client.patch(f"{API}/bookings/{b['id']}", json={"status": "completed"})
        assert rc.status_code == 200, rc.text
        assert abs(wallet_balance(client, referrer["id"])["balance"] - (ref_bal0 + 50)) < 0.01
        assert abs(wallet_balance(client, referee["id"])["balance"] - (fee_bal0 + 50)) < 0.01
        txns = wallet_balance(client, referrer["id"])["transactions"]
        assert any("Referral bonus" in t.get("note", "") for t in txns)


# ---------- Live location ----------
class TestLiveLocation:
    def test_post_and_get_fresh_location(self, client):
        bid = f"TEST-loc-{uuid.uuid4().hex[:8]}"
        r = client.post(f"{API}/location", json={
            "booking_id": bid, "user_id": "u1", "latitude": 19.07, "longitude": 72.87, "heading": 90,
        })
        assert r.status_code == 200
        g = client.get(f"{API}/location/{bid}")
        assert g.status_code == 200
        loc = g.json()
        assert loc["available"] is True
        assert abs(loc["latitude"] - 19.07) < 0.001
        assert loc["age_seconds"] < 120

    def test_unknown_booking_location_unavailable(self, client):
        g = client.get(f"{API}/location/TEST-nonexistent-{uuid.uuid4().hex[:6]}")
        assert g.status_code == 200
        assert g.json()["available"] is False


# ---------- Badges ----------
class TestBadges:
    def test_user_includes_badges_and_driver_plus_active(self, client):
        rides = client.get(f"{API}/rides").json()
        priya = next(r for r in rides if r.get("driver_plus"))["owner_id"]
        u = client.get(f"{API}/users/{priya}")
        assert u.status_code == 200
        data = u.json()
        assert "badges" in data and isinstance(data["badges"], list)
        keys = {b["key"] for b in data["badges"]}
        assert "driver_plus" in keys
        assert "top_driver" in keys  # Priya 4.9 rating x 88
        assert data["driver_plus_active"] is True


# ---------- Admin moderation & revenue ----------
class TestAdmin:
    def test_suspend_user_blocks_verify_otp(self, client):
        user = create_user(client, "TEST Suspend Me")
        r = client.post(f"{API}/admin/users/{user['id']}/suspend")
        assert r.status_code == 200 and r.json()["suspended"] is True
        v = client.post(f"{API}/auth/verify-otp", json={"phone": user["phone"], "otp": "123456"})
        assert v.status_code == 403, v.text
        # cleanup: unsuspend
        client.post(f"{API}/admin/users/{user['id']}/suspend", params={"suspended": "false"})
        v2 = client.post(f"{API}/auth/verify-otp", json={"phone": user["phone"], "otp": "123456"})
        assert v2.status_code == 200

    def test_delist_ride(self, client):
        owner = create_user(client, "TEST Delist Owner")
        veh = create_vehicle(client, owner["id"])
        client.post(f"{API}/admin/vehicles/{veh['id']}/approve")
        ride = create_ride(client, owner["id"], veh["id"]).json()
        r = client.post(f"{API}/admin/rides/{ride['id']}/delist")
        assert r.status_code == 200
        assert client.get(f"{API}/rides/{ride['id']}").json()["status"] == "cancelled"

    def test_sos_create_and_resolve(self, client):
        s = client.post(f"{API}/sos", json={"booking_id": "TEST-b", "user_id": "TEST-u", "location": "x"}).json()
        r = client.post(f"{API}/admin/sos/{s['id']}/resolve")
        assert r.status_code == 200
        sos_list = client.get(f"{API}/admin/sos").json()
        entry = next(x for x in sos_list if x["id"] == s["id"])
        assert entry["resolved"] is True

    def test_revenue_endpoint(self, client):
        r = client.get(f"{API}/admin/revenue")
        assert r.status_code == 200
        data = r.json()
        for k in ("gmv", "commission", "topups", "withdrawals", "bookings_total", "bookings_paid", "driver_plus_subscribers"):
            assert k in data, k
        assert data["driver_plus_subscribers"] >= 1


# ---------- Object storage upload ----------
class TestUpload:
    def test_upload_and_download(self, client):
        # minimal valid JPEG bytes
        jpg = bytes.fromhex("FFD8FFE000104A46494600010100000100010000FFDB004300") + b"\x00" * 64 + bytes.fromhex("FFD9")
        user = create_user(client, "TEST Uploader")
        r = requests.post(  # no JSON content-type; requests sets multipart boundary
            f"{API}/upload",
            files={"file": ("test.jpg", io.BytesIO(jpg), "image/jpeg")},
            data={"user_id": user["id"], "kind": "profile"},
        )
        if r.status_code in (402, 500, 502, 503):
            pytest.skip(f"Storage unavailable ({r.status_code}): {r.text[:200]}")
        assert r.status_code == 200, r.text
        path = r.json()["path"]
        g = client.get(f"{API}/files/{path}")
        assert g.status_code == 200
        assert len(g.content) > 0


# ---------- WebSocket chat ----------
class TestWebSocketChat:
    def test_chat_message_received_over_socket(self):
        booking_id = f"TEST-ws-{uuid.uuid4().hex[:8]}"

        async def run():
            import websockets
            ws_url = f"wss://{BASE_URL.split('://', 1)[1]}/api/chat/ws/{booking_id}"
            async with websockets.connect(ws_url, open_timeout=15) as ws:
                resp = requests.post(f"{API}/chat", json={
                    "booking_id": booking_id, "sender_id": "TEST-sender", "text": "hello over ws",
                })
                assert resp.status_code == 200, resp.text
                msg = await asyncio.wait_for(ws.recv(), timeout=10)
                data = json.loads(msg)
                assert data["text"] == "hello over ws"
                assert data["booking_id"] == booking_id

        asyncio.run(run())
