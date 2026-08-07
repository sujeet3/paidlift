"""Tests for /api/maps/directions and /api/maps/places/autocomplete + regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://paid-lift.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Maps: Directions ----------
class TestDirections:
    def test_mumbai_pune_lonavala(self, api):
        r = api.post(f"{BASE_URL}/api/maps/directions", json={
            "origin": "Mumbai", "destination": "Pune", "waypoints": ["Lonavala"]
        })
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("distanceMeters", "durationSeconds", "overviewPolyline", "start", "end", "mocked"):
            assert k in d, f"missing {k}"
        assert d["mocked"] is True
        assert isinstance(d["overviewPolyline"], str) and len(d["overviewPolyline"]) > 0
        assert "lat" in d["start"] and "lng" in d["start"]
        assert "lat" in d["end"] and "lng" in d["end"]
        # Mumbai(19.076,72.877) → Pune(18.520,73.856), ~150km
        assert 100_000 < d["distanceMeters"] < 300_000, d["distanceMeters"]
        assert d["durationSeconds"] > 0

    def test_unknown_cities_fallback(self, api):
        r = api.post(f"{BASE_URL}/api/maps/directions", json={
            "origin": "Foobar", "destination": "Barbaz"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mocked"] is True
        assert d["overviewPolyline"]
        # Fallback: origin -> India centroid, destination -> origin+1
        assert d["start"]["lat"] and d["end"]["lat"]

    def test_long_origin_returns_422(self, api):
        r = api.post(f"{BASE_URL}/api/maps/directions", json={
            "origin": "A" * 400, "destination": "Pune"
        })
        assert r.status_code == 422, r.text

    def test_delhi_jaipur_with_waypoints(self, api):
        r = api.post(f"{BASE_URL}/api/maps/directions", json={
            "origin": "Delhi", "destination": "Jaipur",
            "waypoints": ["Gurugram", "Behror"]
        })
        assert r.status_code == 200
        d = r.json()
        # Delhi -> Gurugram -> Behror -> Jaipur, mock haversine ~240-280 km
        assert 200_000 < d["distanceMeters"] < 350_000, d["distanceMeters"]
        assert d["mocked"] is True


# ---------- Maps: Places Autocomplete ----------
class TestPlaces:
    def test_autocomplete_mum(self, api):
        r = api.get(f"{BASE_URL}/api/maps/places/autocomplete",
                    params={"input": "mum", "session_token": "abc"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mocked"] is True
        assert isinstance(d["suggestions"], list) and len(d["suggestions"]) >= 1
        ids = [s["placeId"] for s in d["suggestions"]]
        assert "mock_mumbai" in ids
        # each has text
        for s in d["suggestions"]:
            assert s["placeId"] and s["text"]

    def test_autocomplete_min_length(self, api):
        r = api.get(f"{BASE_URL}/api/maps/places/autocomplete",
                    params={"input": "m", "session_token": "abc"})
        assert r.status_code == 422

    def test_autocomplete_missing_token(self, api):
        r = api.get(f"{BASE_URL}/api/maps/places/autocomplete",
                    params={"input": "mumbai"})
        assert r.status_code == 422


# ---------- Regression on existing endpoints ----------
class TestRegression:
    def test_root(self, api):
        r = api.get(f"{BASE_URL}/api/")
        assert r.status_code == 200

    def test_rides_search(self, api):
        r = api.get(f"{BASE_URL}/api/rides",
                    params={"from_location": "Mumbai", "to_location": "Pune"})
        assert r.status_code == 200
        rides = r.json()
        assert isinstance(rides, list)
        assert len(rides) >= 1
        assert rides[0]["from_location"].lower() == "mumbai"

    def test_bookings_list_empty_ok(self, api):
        r = api.get(f"{BASE_URL}/api/bookings", params={"user_id": "nonexistent"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_payments_order_create(self, api):
        # Should still return something (simulation mode)
        r = api.post(f"{BASE_URL}/api/payments/order", json={
            "booking_id": "test_booking_id",
            "amount": 500,
            "provider": "simulator",
        })
        # Payments module has its own contract — accept 200 or 4xx (not 500)
        assert r.status_code < 500, r.text

    def test_wallet_get(self, api):
        # verify wallet endpoint still routes correctly (404 for missing user)
        r = api.get(f"{BASE_URL}/api/wallet/nonexistent_user")
        assert r.status_code == 404
