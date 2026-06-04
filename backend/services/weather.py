"""
Real weather data via Open-Meteo (https://open-meteo.com) — free, no API key.

Provides current conditions + a 3-day forecast (today + next 2 days, matching
the 2-day trip horizon). WMO weather codes are mapped to human descriptions.
"""
from __future__ import annotations

from services.geocode import geocode_city
from services.http_client import request_json

_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather interpretation codes -> (en description, zh description, emoji)
_WMO = {
    0: ("Clear sky", "晴", "☀️"),
    1: ("Mainly clear", "大致晴朗", "🌤️"),
    2: ("Partly cloudy", "多云", "⛅"),
    3: ("Overcast", "阴", "☁️"),
    45: ("Fog", "雾", "🌫️"),
    48: ("Depositing rime fog", "雾凇", "🌫️"),
    51: ("Light drizzle", "小毛毛雨", "🌦️"),
    53: ("Moderate drizzle", "毛毛雨", "🌦️"),
    55: ("Dense drizzle", "大毛毛雨", "🌧️"),
    61: ("Slight rain", "小雨", "🌧️"),
    63: ("Moderate rain", "中雨", "🌧️"),
    65: ("Heavy rain", "大雨", "🌧️"),
    66: ("Freezing rain", "冻雨", "🌧️"),
    67: ("Heavy freezing rain", "强冻雨", "🌧️"),
    71: ("Slight snow", "小雪", "🌨️"),
    73: ("Moderate snow", "中雪", "🌨️"),
    75: ("Heavy snow", "大雪", "❄️"),
    77: ("Snow grains", "雪粒", "🌨️"),
    80: ("Rain showers", "阵雨", "🌦️"),
    81: ("Moderate rain showers", "中阵雨", "🌧️"),
    82: ("Violent rain showers", "强阵雨", "⛈️"),
    85: ("Snow showers", "阵雪", "🌨️"),
    86: ("Heavy snow showers", "强阵雪", "❄️"),
    95: ("Thunderstorm", "雷暴", "⛈️"),
    96: ("Thunderstorm with hail", "雷暴伴冰雹", "⛈️"),
    99: ("Thunderstorm with heavy hail", "强雷暴冰雹", "⛈️"),
}


def _describe(code: int, language: str) -> tuple[str, str]:
    en, zh, emoji = _WMO.get(code, ("Unknown", "未知", "🌡️"))
    return (zh if language == "zh" else en), emoji


async def get_weather(city: str, language: str = "zh") -> dict:
    geo = await geocode_city(city, "en")
    if not geo:
        return {
            "city": city,
            "error": "city_not_found",
            "message": (
                f"找不到城市“{city}”的位置信息。" if language == "zh"
                else f"Could not locate city '{city}'."
            ),
        }

    data = await request_json(
        "GET",
        _FORECAST_URL,
        params={
            "latitude": geo["latitude"],
            "longitude": geo["longitude"],
            "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,"
                     "precipitation_probability_max",
            "timezone": "auto",
            "forecast_days": 3,
        },
    )
    if not data:
        return {
            "city": city,
            "error": "weather_unavailable",
            "message": (
                "天气服务暂时不可用。" if language == "zh"
                else "Weather service temporarily unavailable."
            ),
        }

    cur = data.get("current", {})
    cur_code = int(cur.get("weather_code", 0))
    cur_desc, cur_emoji = _describe(cur_code, language)
    humidity = cur.get("relative_humidity_2m", 0)

    daily = data.get("daily", {})
    forecast = []
    dates = daily.get("time", [])
    for i, d in enumerate(dates):
        code = int(daily.get("weather_code", [0])[i])
        desc, emoji = _describe(code, language)
        forecast.append({
            "date": d,
            "temp_max_c": daily.get("temperature_2m_max", [None])[i],
            "temp_min_c": daily.get("temperature_2m_min", [None])[i],
            "precip_probability": daily.get("precipitation_probability_max", [None])[i],
            "condition": desc,
            "emoji": emoji,
        })

    rain_soon = any(
        (f.get("precip_probability") or 0) >= 50 for f in forecast[:2]
    )
    if language == "zh":
        tip = "未来两天降雨概率较高，记得带伞。" if rain_soon else "天气适宜，适合户外观光。"
    else:
        tip = ("High chance of rain in the next two days — bring an umbrella."
               if rain_soon else "Pleasant weather, great for sightseeing.")

    return {
        "city": geo["name"],
        "country": geo.get("country"),
        "source": "Open-Meteo",
        "current": {
            "temp_c": cur.get("temperature_2m"),
            "humidity": humidity,
            "wind_speed_kmh": cur.get("wind_speed_10m"),
            "condition": cur_desc,
            "emoji": cur_emoji,
        },
        "forecast": forecast,
        "travel_tip": tip,
    }
