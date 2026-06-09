# Race-day weather forecast for Ironman Tours (Tours, France).
# Source: Open-Meteo (free, no API key).
# Computes performance impact factors for bike (wind) and run (heat).

import httpx

TOURS_LAT = 47.3941
TOURS_LON = 0.6848
RACE_DATE  = "2026-06-14"

WMO_CODES = {
    0: "Senin",
    1: "Predominant senin", 2: "Partial noros", 3: "Acoperit",
    45: "Ceata", 48: "Ceata cu chiciura",
    51: "Burnita usoara", 53: "Burnita moderata", 55: "Burnita densa",
    61: "Ploaie usoara", 63: "Ploaie moderata", 65: "Ploaie torentiala",
    71: "Ninsoare usoara", 73: "Ninsoare moderata", 75: "Ninsoare abundenta",
    80: "Averse usoare", 81: "Averse moderate", 82: "Averse violente",
    95: "Furtuna", 96: "Furtuna cu grindina", 99: "Furtuna severa",
}

WIND_DIRECTION_LABELS = {
    (0,   22): "N",  (22,  67): "NE", (67, 112): "E",  (112, 157): "SE",
    (157, 202): "S", (202, 247): "SV", (247, 292): "V",  (292, 337): "NV",
    (337, 360): "N",
}


def _wind_label(deg):
    for (lo, hi), label in WIND_DIRECTION_LABELS.items():
        if lo <= deg < hi:
            return label
    return "N"


def _bike_wind_penalty_kmh(wind_kmh, gusts_kmh, temp_c=20.0, power_w=145):
    """
    Net speed loss on a looped course due to wind, computed via
    bikecalculator.com exact physics (harmonic mean of head/tail legs).
    Headwind costs more than tailwind helps (P ~ v^3 aero drag).
    Also includes a small extra penalty for gusts (bike handling).
    """
    import math
    CDA, CRR, RWEIGHT, BWEIGHT = 0.233, 0.004, 77.0, 9.0
    TRAN, ELEV = 0.95, 58.0

    def speed(hw_kmh):
        hw   = hw_kmh / 3.6
        rho  = (1.293 - 0.00426 * temp_c) * math.exp(-ELEV / 7000.0)
        tres = 9.8 * (RWEIGHT + BWEIGHT) * CRR
        aeff = CDA * rho / 2.0
        vel  = 8.0
        for _ in range(200):
            tv  = vel + hw
            f   = vel * (aeff * tv * tv + tres) - TRAN * power_w
            fp  = aeff * (3.0 * vel + hw) * tv + tres
            if abs(fp) < 1e-12:
                break
            vel -= f / fp
            if abs(f) < 0.0001:
                break
        return vel * 3.6

    if wind_kmh < 2:
        base = speed(0)
        return 0.0, base

    base       = speed(0)
    v_head     = speed(wind_kmh)
    v_tail     = speed(-wind_kmh)
    # harmonic mean (equal distance each way)
    t_total    = 90.0 / v_head + 90.0 / v_tail
    v_avg      = 180.0 / t_total
    penalty    = round(base - v_avg, 1)

    # small extra for strong gusts (handling, braking in crosswind)
    if gusts_kmh >= 40:
        penalty += 0.5
    elif gusts_kmh >= 30:
        penalty += 0.2

    return max(0.0, round(penalty, 1)), round(base, 1)


def _run_heat_penalty_pct(temp_max):
    """
    % slowing of run pace due to heat (lab zones calibrated indoors ~20 C).
    Sports science: ~1.5% per deg C above 20 C for endurance events.
    Ironman run starts ~14:00 local, temp near daily max.
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


def _race_condition_label(temp_max, wind_kmh, precip):
    parts = []
    if precip > 2:
        parts.append("ploaie")
    if temp_max >= 32:
        parts.append("canicula")
    elif temp_max >= 28:
        parts.append("cald")
    if wind_kmh >= 25:
        parts.append("vant puternic")
    elif wind_kmh >= 15:
        parts.append("vant moderat")
    return "Conditii: " + ", ".join(parts) if parts else "Conditii bune"


async def fetch_race_weather():
    url = (
        "https://api.open-meteo.com/v1/forecast"
        "?latitude=%s&longitude=%s" % (TOURS_LAT, TOURS_LON)
        + "&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,"
        "wind_direction_10m_dominant,wind_gusts_10m_max,precipitation_sum,weathercode"
        "&timezone=Europe/Paris"
        "&start_date=%s&end_date=%s" % (RACE_DATE, RACE_DATE)
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

    bike_penalty, base_speed = _bike_wind_penalty_kmh(wind, gusts, temp_c=temp_max, power_w=145)
    heat_pct     = _run_heat_penalty_pct(temp_max)
    wind_label   = _wind_label(wind_dir)

    bike_note = (
        "-%s km/h fata de viteza pe circuit (vant %d km/h, rafale %d km/h din %s)" % (
            bike_penalty, round(wind), round(gusts), wind_label)
        if bike_penalty > 0 else "Vant neglijabil pe ciclism"
    )
    run_note = (
        "-%d%% viteza alergare fata de test lab (temperatura max %.1f C, alergare ~14:00 local)" % (
            heat_pct, temp_max)
        if heat_pct > 0 else "Temperatura optima pentru alergare"
    )
    alert = (
        "CANICULA -- hidratare critica, pace conservator, prioritizeaza fiecare punct de alimentare"
        if temp_max >= 30 else None
    )

    return {
        "race_date":    RACE_DATE,
        "location":     "Tours, Franta",
        "temp_max":     temp_max,
        "temp_min":     temp_min,
        "wind_kmh":     wind,
        "wind_dir":     wind_label,
        "wind_dir_deg": wind_dir,
        "gusts_kmh":    gusts,
        "precip_mm":    precip,
        "condition":    WMO_CODES.get(wcode, "Necunoscut"),
        "condition_label": _race_condition_label(temp_max, wind, precip),
        "bike_speed_penalty_kmh": bike_penalty,
        "run_heat_penalty_pct":   heat_pct,
        "bike_impact_note": bike_note,
        "run_impact_note":  run_note,
        "alert":  alert,
        "source": "open-meteo.com -- actualizat automat",
    }
