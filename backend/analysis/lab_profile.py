"""
Lab test results — Unstoppable Performance Lab, 09 Iunie 2026, 10:15
COSMED metabolic testing: stationary bike + treadmill.
Data extracted from official report. Used as ground truth for Ironman predictions.
"""

from .predictions import fmt

# ─── Lab test data ────────────────────────────────────────────────────────────

LAB_DATE     = "09 Iunie 2026"
LAB_LOCATION = "Unstoppable Performance Lab, București"

BIKE_ZONES = [
    {"zone": "Z1", "hr_min": 125, "hr_max": 142, "watts_min": 125, "watts_max": 165,
     "kcal_burn": 770, "kcal_intake": 385, "duration": "1–6 h",
     "note": "Aerob baz㠗 zona Ironman"},
    {"zone": "Z2", "hr_min": 143, "hr_max": 158, "watts_min": 166, "watts_max": 190,
     "kcal_burn": 850, "kcal_intake": 425, "duration": "1–3 h",
     "note": "Prag aerob — limita superioară pentru curse lungi"},
    {"zone": "Z3", "hr_min": None, "hr_max": None, "watts_min": None, "watts_max": None,
     "kcal_burn": None, "kcal_intake": None, "duration": "50–90 min", "note": "Tempo"},
    {"zone": "Z4", "hr_min": None, "hr_max": None, "watts_min": None, "watts_max": None,
     "kcal_burn": None, "kcal_intake": None, "duration": "30–60 min", "note": "Prag lactatic"},
    {"zone": "Z5", "hr_min": None, "hr_max": None, "watts_min": None, "watts_max": None,
     "kcal_burn": None, "kcal_intake": None, "duration": "15–30 min", "note": "VO2max"},
]

RUN_ZONES = [
    {"zone": "Z1", "hr_min": 120, "hr_max": 154, "pace": "5:00", "pace_s_per_km": 300,
     "kcal_burn": 556, "kcal_intake": 330, "duration": "1–6 h",
     "note": "Aerob baz㠗 ritmul target Ironman maraton"},
    {"zone": "Z2", "hr_min": 155, "hr_max": 165, "pace": "4:37", "pace_s_per_km": 277,
     "kcal_burn": 750, "kcal_intake": 375, "duration": "1–3 h",
     "note": "Prag aerob — maraton standalone"},
    {"zone": "Z3", "hr_min": 166, "hr_max": 177, "pace": "4:17", "pace_s_per_km": 257,
     "kcal_burn": 870, "kcal_intake": 290, "duration": "50–90 min",
     "note": "Tempo — semimaraton"},
    {"zone": "Z4", "hr_min": None, "hr_max": None, "pace": None, "pace_s_per_km": None,
     "kcal_burn": None, "kcal_intake": None, "duration": "30–60 min", "note": "Prag lactatic"},
    {"zone": "Z5", "hr_min": None, "hr_max": None, "pace": None, "pace_s_per_km": None,
     "kcal_burn": None, "kcal_intake": None, "duration": "15–30 min", "note": "VO2max"},
]

ELECTROLYTES = {
    "sodium_mg_per_L":    1086,
    "potassium_mg_per_L": 105,
    "sweat_rate_L_per_h": 0.73,
}

# ─── Race-day nutrition plan (from whiteboard in lab) ─────────────────────────

RACE_NUTRITION = {
    "pre_race": [
        "T-10min → 1 gel cu cofeină",
        "La 2000m înot → gel 25g",
    ],
    "T1": ["T1 → gel 25g"],
    "bike": [
        "La fiecare 15 minute → 1 plic BetaFuel 80g (5 total)",
        "1 bidon 750ml / oră + linguriță sare",
        "Km 90 → nutriție suplimentară",
        "Km 150 → 1 gel cu cofeină",
        "Km 187 → 1 gel",
    ],
    "T2": ["T2 → nimic (stomacul se resetează)"],
    "run": [
        "Km 2 → gel",
        "La fiecare 20 min: km 6 – 10 – 1h – 18 – 22 → gel",
        "Km 28 → isotonic + gel cu COFEINĂ",
    ],
    "hydration": [
        f"Rată transpirație: {ELECTROLYTES['sweat_rate_L_per_h']} L/h → "
        f"minim 730ml/h lichide",
        f"Sodiu: {ELECTROLYTES['sodium_mg_per_L']} mg/L transpirație "
        f"→ sursă: gel-uri sărare + sare în bidon",
    ],
}

# ─── Ironman Tours prediction from lab data ───────────────────────────────────

IRONMAN_SWIM_M  = 3800
IRONMAN_BIKE_M  = 180000
IRONMAN_RUN_M   = 42195
OPEN_WATER      = 1.06
T1_S = 480   # 8 min
T2_S = 300   # 5 min


def lab_ironman_prediction(swim_speed_mps=None) -> dict:
    """
    Ironman prediction grounded in lab test zones:

    BIKE: Target Z1 (125–165W, HR 125–142 bpm) for the full 180km.
    Speed calibrated: if Z2 avg (178W) ≈ 29.5 km/h outdoor, then Z1 avg (145W)
    via cubic aero drag: v ∝ P^(1/3) → 29.5 × (145/178)^(1/3) ≈ 27.9 km/h.

    RUN: Lab Z1 is 5:00/km (1–6h sustainable). After Ironman swim+bike,
    realistic target stays near Z1 with small fatigue adjustment per scenario.
    """

    # BIKE scenarios (km/h based on lab Z1 zone + power-speed calibration)
    bike_scenarios = {
        "aggressive":   {"kmh": 29.5, "watts": "165W (Z1 max)",  "hr": "142 bpm"},
        "realistic":    {"kmh": 28.0, "watts": "145W (Z1 mid)",  "hr": "135 bpm"},
        "conservative": {"kmh": 26.5, "watts": "130W (Z1 baz㔚, "hr": "128 bpm"},
    }

    # RUN scenarios (s/km based on lab Z1 + Ironman cumulative fatigue)
    # Z1 = 300 s/km. After 180km bike fatigue: +0% / +5% / +12%
    run_scenarios = {
        "aggressive":   {"pace_s_km": 300, "label": "5:00/km (Z1 pur)"},
        "realistic":    {"pace_s_km": 315, "label": "5:15/km (Z1 + oboseală medie)"},
        "conservative": {"pace_s_km": 336, "label": "5:36/km (Z1 + oboseală mare)"},
    }

    scenarios = {}
    for key in ("aggressive", "realistic", "conservative"):
        b = bike_scenarios[key]
        r = run_scenarios[key]

        bike_mps  = b["kmh"] / 3.6
        bike_t    = IRONMAN_BIKE_M / bike_mps
        run_pace  = r["pace_s_km"] / 1000   # s/m
        run_t     = IRONMAN_RUN_M * run_pace

        swim_t = None
        if swim_speed_mps:
            swim_t = IRONMAN_SWIM_M / swim_speed_mps * OPEN_WATER
            swim_fmt = fmt(swim_t)
            swim_pace_fmt = fmt(100 / swim_speed_mps)
        else:
            swim_t = 4500   # fallback ~75min if no Strava data
            swim_fmt = "—"
            swim_pace_fmt = "—"

        total = swim_t + T1_S + bike_t + T2_S + run_t
        scenarios[key] = {
            "swim":       swim_fmt,
            "swim_pace":  swim_pace_fmt,
            "T1":         fmt(T1_S),
            "bike":       fmt(bike_t),
            "bike_speed": f"{b['kmh']} km/h",
            "bike_watts": b["watts"],
            "bike_hr":    b["hr"],
            "T2":         fmt(T2_S),
            "run":        fmt(run_t),
            "run_pace":   fmt(r["pace_s_km"]),
            "run_label":  r["label"],
            "total":      fmt(total),
            "total_s":    round(total),
        }

    return {
        "lab_date":    LAB_DATE,
        "lab_location": LAB_LOCATION,
        "bike_zones":  BIKE_ZONES,
        "run_zones":   RUN_ZONES,
        "electrolytes": ELECTROLYTES,
        "nutrition":   RACE_NUTRITION,
        "scenarios":   scenarios,
        "methodology": (
            "Bike: Z1 lab (125–165W, HR 125–142) — zona sustenabilă 1–6h. "
            "Viteză calculată via relație putere–viteză P∝v³. "
            "Run: Z1 lab (5:00/km, HR 120–154) + factor oboseală Ironman."
        ),
    }


def get_lab_profile(swim_speed_mps=None) -> dict:
    return lab_ironman_prediction(swim_speed_mps)
