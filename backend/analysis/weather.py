"""
Race-day weather forecast for Ironman Tours (Tours, France).
Source: Open-Meteo (free, no API key).
Computes performance impact factors for bike (wind) and run (heat).
"""

import httpx
from datetime import date

TOURS_LAT = 47.3941
TOURS_LON = 0.6848
RACE_DATE  = "2026-06-14"

WMO_CODES = {
    0: "Senin",
    1: "Predominant senin", 2: "Parțial noros", 3: "Acoperit",
    45: "Ceață", 48: "Ceață cu chiciură",
    51: "Burniță ușoară", 53: "Burniță moderată", 55: "Burniță densă",
    61: "Ploaie ușoară", 63: "Ploaie moderată", 65: "Ploaie torențială",
    71: "Ninsoare ușoară", 73: "Ninsoare moderată", 75: "Ninsoare abundentă",
    80: "Averse ușoare", 81: "Averse moderate", 82: "Averse violente",
    95: "Furtună", 96: "Furtună cu grindină", 99: "Furtună severă",
}

WIND_DIRECTION_LABELS = {
    (0,   22): "N",  (22,  67): "NE", (67, 112): "E",  (112, 157): "SE",
    (157, 202): "S", (202, 247): "SV",(247, 292): "V",  (292, 337): "NV",
    (337, 360): "N",
}


def _wind_label(deg: float) -> str:
    for (lo, hi), label in WIND_DIRECTION_LABELS.items():
        if lo <= deg < hi:
            return label
    return "N"


def _bike_wind_penalty_kmh(wind_kmh: float, gusts_kmh: float) -> float:
    """
    Estimate average speed loss due to wind on a looped course.
    Headwind costs more than tailwind helps (P ∝ v³ aero drag).
    """
    penalty = 0.0
    if wind_kmh >= 30:
        penalty += 2.5
    elif wind_kmh >= 20:
        penalty += 1.5
    elif wind_kmh >= 10:
        penalty += 0.8
    # Extra penalty for strong gusts (bike handling, hesitation)
    if gusts_kmh >= 40:
        penalty += 0.8
    elif gusts_kmh >= 30:
        penalty += 0.4
    return round(penalty, 1)


def _run_heat_penalty_pct(temp_max: float) -> float:
    """
    % slowing of run pace due to heat (zones calibrated indoors ~20°C).
    Based on sports science consensus: ~1.5% per °C above 20°C for endurance.
    For Ironman run starting ~14:00 local, temp near daily max.
    """
    if temp_max <= 18:
        return 0.0
    elif temp_max <= 22:
        return 2.0
    elif temp_max <= 26:
        return 5.0
    elif temp_max <= 30:
        return 8.0
    elif temp_max <= 34:
        return 12.0
    else:
        return 16.0


def _race_condition_label(temp_max: float, wind_kmh: float, precip: float) -> str:
    parts = []
    if precip > 2:
        parts.append("ploaie")
    if temp_max >= 32:
        parts.append("caniculă")
    elif temp_max >= 28:
        parts.append("cald")
    if wind_kmh >= 25:
        parts.append("vânt puternic")
    elif wind_kmh >= 15:
        parts.append("vânt moderat")
    return "Condiții: " + ", ".join(parts) if parts else "Condiții bune"


async def fetch_race_weather() -> dict:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={TOURS_LAT}&longitude={TOURS_LON}"
        "&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,"
        "wind_direction_10m_dominant,wind_gusts_10m_max,precipitation_sum,weathercode"
        "&timezone=Europe/Paris"
        f"&start_date={RACE_DATE}&end_date={RACE_DATE}"
    )
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    d = data["daily"]

    temp_max  = d["temperature_2m_max"][0]
    temp_min  = d["temperature_2m_min"][0]
    wind      = d["wind_speed_10m_max"][0]
    wind_dir  = d["wind_direction_10m_dominant"][0]
    gusts     = d["wind_gusts_10m_max"][0]
    precip    = d["precipitation_sum"][0]
    wcode     = d["weathercode"][0]

    bike_penalty = _bike_wind_penalty_kmh(wind, gusts)
    heat_pct     = _run_heat_penalty_pct(temp_max)

    return {
        "race_date":    RACE_DATE,
        "location":     "Tours, Franța",
        "temp_max":     temp_max,
        "temp_min":     temp_min,
        "wind_kmh":     wind,
        "wind_dir":     _wind_label(wind_dir),
        "wind_dir_deg": wind_dir,
        "gusts_kmh":    gusts,
        "precip_mm":    precip,
        "condition":    WMO_CODES.get(wcode, "Necunoscut"),
        "condition_label": _race_condition_label(temp_max, wind, precip),

        # Impact factors
        "bike_speed_penalty_kmh": bike_penalty,
        "run_heat_penalty_pct":   heat_pct,

        # Human-readable impact
        "bike_impact_note": (
            f"−{bike_penalty} km/h față de viteză optimă (vânt {wind:.0f} km/h, "
            f"rafale {gusts:.0f} km/h din {_wind_label(wind_dir)})"
            if bike_penalty > 0 else "Vânt neglijabil pe ciclism"
        ),
        "run_impact_note": (
            f"−{heat_pct:.0f}% viteză alergare față de test lab "
            f"(temperatura max {temp_max:.1f}°C, alergare ~14:00 local)"
            if heat_pct > 0 else "Temperatură optimă pentru alergare"
        ),
        "alert": (
            "⚠️ CANICULĂ — hidratare critică, pace conservator, prioritizează îngurgitarea la fiecare punct de alimentare"
            if temp_max >= 30 else None
        ),
        "source": "open-meteo.com · actualizat automat",
    }
