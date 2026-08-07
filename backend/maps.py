"""
Google Maps integration for PAID LIFT — Directions + Places Autocomplete proxy.

Keeps the server API key server-side (never exposed to client). Frontend calls
these endpoints and receives normalised JSON. Uses MongoDB TTL cache to reduce
Google API cost.

MOCKED mode: when GOOGLE_MAPS_API_KEY is missing / placeholder, endpoints return
a synthetic straight-line route + estimated duration so the app still runs.
"""
import os
import json
import math
import hashlib
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

MAPS_PLACEHOLDER = "YOUR_SERVER_KEY"


def maps_configured() -> bool:
    k = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    return bool(k) and k != MAPS_PLACEHOLDER


class DirectionsIn(BaseModel):
    origin: str
    destination: str
    waypoints: List[str] = Field(default_factory=list)
    mode: str = "driving"
    departure_time: Optional[str] = "now"


def _encode_polyline(points: List[tuple]) -> str:
    """Encode list of (lat,lng) to Google's encoded polyline algorithm."""
    result = []
    prev_lat = prev_lng = 0
    for lat, lng in points:
        lat_i = int(round(lat * 1e5))
        lng_i = int(round(lng * 1e5))
        for delta in (lat_i - prev_lat, lng_i - prev_lng):
            v = ~(delta << 1) if delta < 0 else (delta << 1)
            while v >= 0x20:
                result.append(chr((0x20 | (v & 0x1f)) + 63))
                v >>= 5
            result.append(chr(v + 63))
        prev_lat, prev_lng = lat_i, lng_i
    return "".join(result)


# --- rough city lat/lng lookup for mock mode ---
CITY_COORDS = {
    "mumbai": (19.076, 72.8777),
    "pune": (18.5204, 73.8567),
    "delhi": (28.7041, 77.1025),
    "jaipur": (26.9124, 75.7873),
    "gurugram": (28.4595, 77.0266),
    "behror": (27.8830, 76.2822),
    "ahmedabad": (23.0225, 72.5714),
    "vadodara": (22.3072, 73.1812),
    "bengaluru": (12.9716, 77.5946),
    "bangalore": (12.9716, 77.5946),
    "mysuru": (12.2958, 76.6394),
    "mysore": (12.2958, 76.6394),
    "chennai": (13.0827, 80.2707),
    "pondicherry": (11.9139, 79.8145),
    "lonavala": (18.7546, 73.4062),
    "ramanagara": (12.7154, 77.2810),
    "hyderabad": (17.3850, 78.4867),
    "kolkata": (22.5726, 88.3639),
}


def _lookup(name: str) -> Optional[tuple]:
    n = (name or "").strip().lower()
    if n in CITY_COORDS:
        return CITY_COORDS[n]
    for k, v in CITY_COORDS.items():
        if k in n or n in k:
            return v
    return None


def _haversine(a: tuple, b: tuple) -> float:
    """Distance in meters between (lat, lng) tuples."""
    R = 6371000.0
    lat1, lng1 = a
    lat2, lng2 = b
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    aa = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(aa))


def _mock_route(origin: str, destination: str, waypoints: List[str]) -> dict:
    """Fallback route when Google isn't configured — straight line between known cities."""
    o = _lookup(origin) or (20.5937, 78.9629)  # India centroid fallback
    d = _lookup(destination) or (o[0] + 1, o[1] + 1)
    stops = [_lookup(w) for w in waypoints]
    stops = [s for s in stops if s]
    seq = [o] + stops + [d]
    # Interpolate a few points between each pair for a nicer line
    dense = []
    for i in range(len(seq) - 1):
        a, b = seq[i], seq[i + 1]
        steps = 8
        for s in range(steps):
            t = s / steps
            dense.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    dense.append(seq[-1])
    dist = sum(_haversine(dense[i], dense[i + 1]) for i in range(len(dense) - 1))
    # driving speed ~45 km/h
    duration_sec = int(dist / (45_000 / 3600))
    return {
        "distanceMeters": int(dist),
        "durationSeconds": duration_sec,
        "overviewPolyline": _encode_polyline(dense),
        "start": {"lat": o[0], "lng": o[1]},
        "end": {"lat": d[0], "lng": d[1]},
        "mocked": True,
    }


def build_router(db) -> APIRouter:
    router = APIRouter(prefix="/api/maps")

    @router.post("/directions")
    async def directions(body: DirectionsIn):
        if len(body.origin) > 300 or len(body.destination) > 300 or len(body.waypoints) > 10:
            raise HTTPException(422, "Invalid route input")

        if not maps_configured():
            return _mock_route(body.origin, body.destination, body.waypoints)

        key = os.environ["GOOGLE_MAPS_API_KEY"]
        params = {
            "origin": body.origin,
            "destination": body.destination,
            "mode": body.mode,
            "key": key,
            "region": "in",
            "language": "en",
        }
        if body.waypoints:
            params["waypoints"] = "|".join(body.waypoints)
        if body.departure_time:
            params["departure_time"] = body.departure_time

        cache_key = hashlib.sha256(json.dumps({**params, "key": ""}, sort_keys=True).encode()).hexdigest()
        hit = await db.map_cache.find_one({"_id": cache_key})
        if hit:
            return hit["value"]

        try:
            async with httpx.AsyncClient(timeout=8.0) as http:
                r = await http.get("https://maps.googleapis.com/maps/api/directions/json", params=params)
                data = r.json()
        except Exception:
            # graceful fallback
            return _mock_route(body.origin, body.destination, body.waypoints)

        if data.get("status") != "OK" or not data.get("routes"):
            return _mock_route(body.origin, body.destination, body.waypoints)

        route = data["routes"][0]
        legs = route.get("legs", [])
        value = {
            "distanceMeters": sum(x.get("distance", {}).get("value", 0) for x in legs),
            "durationSeconds": sum(x.get("duration_in_traffic", x.get("duration", {})).get("value", 0) for x in legs),
            "overviewPolyline": route.get("overview_polyline", {}).get("points", ""),
            "start": legs[0].get("start_location") if legs else None,
            "end": legs[-1].get("end_location") if legs else None,
            "mocked": False,
        }
        try:
            await db.map_cache.replace_one(
                {"_id": cache_key},
                {"_id": cache_key, "value": value,
                 "expiresAt": datetime.now(timezone.utc) + timedelta(seconds=300)},
                upsert=True,
            )
        except Exception:
            pass
        return value

    @router.get("/places/autocomplete")
    async def autocomplete(
        input: str = Query(min_length=2, max_length=120),
        session_token: str = Query(min_length=1, max_length=80),
    ):
        # Mock mode: return matching city suggestions
        if not maps_configured():
            q = input.lower()
            hits = [
                {"placeId": f"mock_{k}", "text": k.title(), "secondary": "India"}
                for k in CITY_COORDS if q in k
            ][:6]
            return {"suggestions": hits, "mocked": True}

        key = os.environ["GOOGLE_MAPS_API_KEY"]
        try:
            async with httpx.AsyncClient(timeout=5.0) as http:
                r = await http.post(
                    "https://places.googleapis.com/v1/places:autocomplete",
                    json={
                        "input": input,
                        "sessionToken": session_token,
                        "includedRegionCodes": ["IN"],
                        "languageCode": "en",
                        "regionCode": "IN",
                    },
                    headers={
                        "X-Goog-Api-Key": key,
                        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
                    },
                )
                raw = r.json()
        except Exception:
            return {"suggestions": [], "mocked": True}

        suggestions = []
        for s in raw.get("suggestions", []):
            p = s.get("placePrediction") or {}
            suggestions.append({
                "placeId": p.get("placeId"),
                "text": p.get("text", {}).get("text", ""),
                "secondary": (p.get("structuredFormat", {}).get("secondaryText") or {}).get("text", ""),
            })
        return {"suggestions": suggestions, "mocked": False}

    return router
