"""
Flights & hotels — simulated (mock) data.

The task explicitly permits a "mock flight/hotel API", and Amadeus is retiring
its self-service developer portal (full shutdown 2026-07-17), so no free real
flight/hotel API remains. To keep the mock believable rather than arbitrary, it
is GROUNDED in real geocoding: flight duration and price are derived from the
actual great-circle distance between the two cities. Results are deterministic
per (route, date) so repeated queries are stable. Every payload is clearly
labelled `"source": "Simulated"` so the agent never presents it as live data.
"""
from __future__ import annotations

import hashlib
import math
from datetime import datetime, timedelta
from typing import Optional

from services.geocode import geocode_city

# Plausible international carriers (purely illustrative).
_AIRLINES = [
    ("Singapore Airlines", "SQ"), ("Emirates", "EK"), ("Qatar Airways", "QR"),
    ("Cathay Pacific", "CX"), ("ANA", "NH"), ("Japan Airlines", "JL"),
    ("Lufthansa", "LH"), ("KLM", "KL"), ("British Airways", "BA"),
    ("Turkish Airlines", "TK"), ("Air France", "AF"), ("Qantas", "QF"),
]

_HOTEL_BRANDS = {
    "budget": [
        ("{city} Backpackers Hostel", 2, (28, 60), ["WiFi", "Shared kitchen"], True),
        ("{city} CityStay Inn", 2, (45, 85), ["WiFi", "Breakfast"], False),
        ("{city} EasySleep Lodge", 3, (55, 95), ["WiFi", "24h reception"], True),
    ],
    "mid-range": [
        ("{city} Comfort Suites", 3, (95, 160), ["WiFi", "Pool", "Gym", "Breakfast"], True),
        ("{city} Riverside Hotel", 4, (130, 210), ["WiFi", "Restaurant", "Bar"], False),
        ("{city} Garden Boutique", 4, (150, 240), ["WiFi", "Spa", "Breakfast"], True),
    ],
    "luxury": [
        ("{city} Grand Palace Hotel", 5, (320, 520), ["WiFi", "Pool", "Spa", "Fine dining", "Concierge"], True),
        ("{city} The Skyline Ritz", 5, (450, 780), ["WiFi", "Infinity pool", "Michelin restaurant", "Butler"], False),
    ],
}


def _seed(*parts: str) -> int:
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return int(h[:8], 16)


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def search_flights(
    origin: str, destination: str, date: str, passengers: int = 1
) -> dict:
    o = await geocode_city(origin, "en")
    d = await geocode_city(destination, "en")
    if not o or not d:
        return {
            "origin": origin, "destination": destination, "date": date,
            "flights": [], "error": "city_not_found",
            "message": f"Could not locate "
                       f"{origin if not o else destination}.",
            "source": "Simulated",
        }

    dist = _haversine_km(o["latitude"], o["longitude"], d["latitude"], d["longitude"])
    # ~800 km/h cruise + ~1h ground; price scales with distance.
    base_hours = dist / 800.0 + 1.0
    base_price = 40 + dist * 0.11  # USD, one-way economy estimate

    seed = _seed(origin.lower(), destination.lower(), date)
    flights = []
    for i in range(4):
        s = seed + i * 7919
        stops = 0 if (dist < 4000 and i % 2 == 0) else (s % 2)
        dur_h = base_hours + stops * 1.8 + (s % 5) * 0.2
        dep_hour = 6 + (s % 14)
        try:
            dep_dt = datetime.strptime(date, "%Y-%m-%d").replace(hour=dep_hour, minute=(s % 4) * 15)
        except ValueError:
            dep_dt = datetime.now().replace(hour=dep_hour, minute=0, second=0, microsecond=0)
        arr_dt = dep_dt + timedelta(hours=dur_h)
        price = round((base_price * (0.85 + (s % 40) / 100.0) + stops * 30) * passengers, 0)
        airline, code = _AIRLINES[s % len(_AIRLINES)]
        flights.append({
            "airline": airline,
            "flight_no": f"{code}{100 + s % 899}",
            "departure": dep_dt.strftime("%Y-%m-%d %H:%M"),
            "arrival": arr_dt.strftime("%Y-%m-%d %H:%M"),
            "duration_hours": round(dur_h, 1),
            "stops": stops,
            "price": price,
            "currency": "USD",
            "cabin": "Economy",
            "seats_available": 3 + s % 28,
        })

    flights.sort(key=lambda f: f["price"])
    return {
        "origin": o["name"], "destination": d["name"], "date": date,
        "passengers": passengers,
        "distance_km": round(dist),
        "flights": flights,
        "source": "Simulated",
        "note": "Simulated flight offers (no live booking). Prices are distance-based "
                "estimates in USD; verify on an airline/OTA before booking.",
    }


async def search_hotels(
    city: str,
    check_in: Optional[str] = None,
    check_out: Optional[str] = None,
    budget: str = "any",
    pet_friendly: bool = False,
) -> dict:
    geo = await geocode_city(city, "en")
    if not geo:
        return {"city": city, "hotels": [], "error": "city_not_found",
                "message": f"Could not locate city '{city}'.", "source": "Simulated"}

    canonical = geo["name"]
    tiers = (["budget", "mid-range", "luxury"] if budget == "any" else [budget])
    seed = _seed(canonical.lower(), budget, str(pet_friendly))

    # nights for total price (default 1)
    nights = 1
    if check_in and check_out:
        try:
            nights = max(1, (datetime.strptime(check_out, "%Y-%m-%d")
                             - datetime.strptime(check_in, "%Y-%m-%d")).days)
        except ValueError:
            nights = 1

    hotels = []
    idx = 0
    for tier in tiers:
        for tmpl, stars, (lo, hi), amenities, pet_ok in _HOTEL_BRANDS.get(tier, []):
            if pet_friendly and not pet_ok:
                continue
            s = seed + idx * 104729
            idx += 1
            nightly = lo + s % max(1, (hi - lo))
            rating = round(3.6 + (s % 14) / 10.0, 1)
            hotels.append({
                "name": tmpl.format(city=canonical),
                "stars": stars,
                "budget_tier": tier,
                "rating": min(rating, 5.0),
                "price_per_night": nightly,
                "total_price": nightly * nights,
                "nights": nights,
                "currency": "USD",
                "pet_friendly": pet_ok,
                "amenities": amenities,
            })

    hotels.sort(key=lambda h: h["price_per_night"])
    return {
        "city": canonical,
        "country": geo.get("country"),
        "check_in": check_in, "check_out": check_out,
        "hotels": hotels,
        "source": "Simulated",
        "note": "Simulated hotel options (no live availability). Prices in USD; "
                "confirm with the hotel/OTA before booking.",
    }
