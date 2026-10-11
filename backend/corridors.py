"""
PAID LIFT — Highway Corridor & Smart Waypoint Matching Engine
Provides corridor routing definitions for top Indian highways and inter-city routes:
- Mumbai <-> Pune (Expressway / Old Highway)
- Delhi <-> Jaipur (NH 48)
- Bengaluru <-> Mysuru (Access Controlled Expressway)
- Ahmedabad <-> Vadodara (NE 1)
- Delhi <-> Chandigarh (NH 44)
"""
from typing import List, Dict, Any, Optional
import math

MAJOR_CORRIDORS: List[Dict[str, Any]] = [
    {
        "id": "mumbai-pune",
        "name": "Mumbai — Pune Expressway",
        "cities": ["Mumbai", "Navi Mumbai", "Panvel", "Lonavala", "Khandala", "Wakad", "Pune"],
        "popular_stops": [
            "Kalamboli McDonalds, Navi Mumbai",
            "Panvel Bus Stand",
            "Khopoli Toll Plaza",
            "Lonavala Center Point",
            "Talegaon Toll Plaza",
            "Wakad Bridge, Pune",
            "Hinjawadi Flyover, Pune",
            "Shivajinagar, Pune",
        ],
    },
    {
        "id": "delhi-jaipur",
        "name": "Delhi — Jaipur Corridor (NH 48)",
        "cities": ["Delhi", "Gurugram", "Manesar", "Dharuhera", "Behror", "Kotputli", "Shahpura", "Jaipur"],
        "popular_stops": [
            "Dhaula Kuan Metro, Delhi",
            "IFFCO Chowk, Gurugram",
            "Rajiv Chowk, Gurugram",
            "Manesar Toll Plaza",
            "Behror Mid-way",
            "Amer / Transport Nagar, Jaipur",
            "Sindhi Camp Bus Stand, Jaipur",
        ],
    },
    {
        "id": "bengaluru-mysuru",
        "name": "Bengaluru — Mysuru Expressway",
        "cities": ["Bengaluru", "Kengeri", "Bidadi", "Ramanagara", "Channapatna", "Maddur", "Mandya", "Srirangapatna", "Mysuru"],
        "popular_stops": [
            "Kengeri Metro Station, Bengaluru",
            "Ramanagara Toll Plaza",
            "Channapatna Bypass",
            "Maddur Tiffany's",
            "Mandya Bus Stand",
            "Columbia Asia Junction, Mysuru",
        ],
    },
    {
        "id": "ahmedabad-vadodara",
        "name": "Ahmedabad — Vadodara Expressway (NE 1)",
        "cities": ["Ahmedabad", "Nadiad", "Anand", "Vadodara"],
        "popular_stops": [
            "CTM Cross Road, Ahmedabad",
            "Expressway Toll Plaza, Ahmedabad",
            "Nadiad Chokdi",
            "Anand Expressway Junction",
            "Golden Chokdi, Vadodara",
            "Amit Nagar Circle, Vadodara",
        ],
    },
    {
        "id": "delhi-chandigarh",
        "name": "Delhi — Chandigarh Highway (NH 44)",
        "cities": ["Delhi", "Sonipat", "Panipat", "Karnal", "Kurukshetra", "Ambala", "Zirakpur", "Chandigarh"],
        "popular_stops": [
            "Kashmere Gate ISBT, Delhi",
            "Murthal Haveli, Sonipat",
            "Panipat Toll Plaza",
            "Karnal Lake Oasis",
            "Ambala Cantt Junction",
            "Zirakpur Traffic Lights",
            "Sector 17 / Tribune Chowk, Chandigarh",
        ],
    },
]


def find_matching_corridors(from_loc: str, to_loc: str) -> List[Dict[str, Any]]:
    """Identifies which major highway corridors cover the requested origin and destination."""
    from_lower = from_loc.strip().lower()
    to_lower = to_loc.strip().lower()

    matched = []
    for c in MAJOR_CORRIDORS:
        cities_lower = [city.lower() for city in c["cities"]]
        from_idx = next((i for i, city in enumerate(cities_lower) if city in from_lower or from_lower in city), -1)
        to_idx = next((i for i, city in enumerate(cities_lower) if city in to_lower or to_lower in city), -1)

        if from_idx != -1 and to_idx != -1:
            matched.append(c)
    return matched


def get_corridor_stops(city: str) -> List[str]:
    """Returns verified highway stops related to a specific city."""
    city_lower = city.strip().lower()
    stops = []
    for c in MAJOR_CORRIDORS:
        for stop in c["popular_stops"]:
            if city_lower in stop.lower():
                stops.append(stop)
    return stops
