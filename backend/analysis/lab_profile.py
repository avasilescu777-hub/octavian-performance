# Lab test results -- Unstoppable Performance Lab, 09 Iunie 2026, 10:15
# COSMED metabolic testing: stationary bike + treadmill.
# Data extracted from official report. Used as ground truth for Ironman predictions.

from .predictions import fmt

# --- Lab test data -----------------------------------------------------------

LAB_DATE     = "09 Iunie 2026"
LAB_LOCATION = "Unstoppable Performance Lab, Bucuresti"

BIKE_ZONES = [
    {"zone": "Z1", "hr_min": 125, "hr_max": 142, "watts_min": 125, "watts_max": 165,
     "kcal_burn": 770, "kcal_intake": 385, "duration": "1-6 h",
     "note": "Aerob baza -- zona Ironman"},
    {"zone": "Z2", "hr_min": 143, "hr_max": 158, "watts_min": 166, "watts_max": 190,
     "kcal_burn": 850, "kcal_intake": 425, "duration": "1-3 h",
     "note": "Prag aerob -- limita superioara pentru curse lungi"},
    {"zone": "Z3", "hr_min": None, "hr_max": None, "watts_min": None, "watts_max": None,
     "kcal_burn": None, "kcal_intake": None, "duration": "50-90 min", "note": "Tempo"},
    {"zone": "Z4", "hr_min": None, "hr_max": None, "watts_min": None, "watts_max": None,
     "kcal_burn": None, "kcal_intake": None, "duration": "30-60 min", "note": "Prag lactatic"},
    {"zone": "Z5", "hr_min": None, "hr_max": None, "watts_min": None, "watts_max": None,
     "kcal_burn": None, "kcal_intake": None, "duration": "15-30 min", "note": "VO2max"},
]

RUN_ZONES = [
    {"zone": "Z1", "hr_min": 120, "hr_max": 154, "pace": "5:00", "pace_s_per_km": 300,
     "kcal_burn": 556, "kcal_intake": 330, "duration": "1-6 h",
     "note": "Aerob baza -- ritmul target Ironman maraton"},
    {"zone": "Z2", "hr_min": 155, "hr_max": 165, "pace": "4:37", "pace_s_per_km": 277,
     "kcal_burn": 750, "kcal_intake": 375, "duration": "1-3 h",
     "note": "Prag aerob -- maraton standalone"},
    {"zone": "Z3", "hr_min": 166, "hr_max": 177, "pace": "4:17", "pace_s_per_km": 257,
     "kcal_burn": 870, "kcal_intake": 290, "duration": "50-90 min",
     "note": "Tempo -- semimaraton"},
    {"zone": "Z4", "hr_min": None, "hr_max": None, "pace": None, "pace_s_per_km": None,
     "kcal_burn": None, "kcal_intake": None, "duration": "30-60 min", "note": "Prag lactatic"},
    {"zone": "Z5", "hr_min": None, "hr_max": None, "pace": None, "pace_s_per_km": None,
     "kcal_burn": None, "kcal_intake": None, "duration": "15-30 min", "note": "VO2max"},
]

ELECTROLYTES = {
    "sodium_mg_per_L":    1086,
    "potassium_mg_per_L": 105,
    "sweat_rate_L_per_h": 0.73,
}

# --- Race-day nutrition plan -------------------------------------------------

RACE_NUTRITION = {
    "pre_race": [
        "T-10min -> 1 gel cu cofeina",
        "La 2000m inot -> gel 25g",
    ],
    "T1": ["T1 -> gel 25g"],
    "bike": [
        "La fiecare 15 minute -> 1 plic BetaFuel 80g (5 total)",
        "1 bidon 750ml / ora + lingurita sare",
        "Km 90 -> nutritie suplimentara",
        "Km 150 -> 1 gel cu cofeina",
        "Km 187 -> 1 gel",
    ],
    "T2": ["T2 -> nimic (stomacul se reseteaza)"],
    "run": [
        "Km 2 -> gel",
        "La fiecare 20 min: km 6 - 10 - 1h - 18 - 22 -> gel",
        "Km 28 -> isotonic + gel cu COFEINA",
    ],
    "hydration": [
        "Rata transpiratie: %s L/h -> minim 730ml/h lichide" % ELECTROLYTES["sweat_rate_L_per_h"],
        "Sodiu: %s mg/L transpirat -> sursa: gel-uri sarate + sare in bidon" % ELECTROLYTES["sodium_mg_per_L"],
    ],
}

# --- Ironman Tours prediction from lab data ----------------------------------

IRONMAN_SWIM_M  = 3800
IRONMAN_BIKE_M  = 180000
IRONMAN_RUN_M   = 42195
OPEN_WATER      = 1.06
T1_S = 480   # 8 min
T2_S = 300   # 5 min


def lab_ironman_prediction(swim_speed_mps=None) -> dict:
    """
    Ironman prediction grounded in lab test zones.
    BIKE: Z1 lab (125-165W, HR 125-142). Speed via P~v^3 aero drag.
    RUN: Z1 lab (5:00/km, HR 120-154) + Ironman fatigue factor.
    """

    bike_scenarios = {
        "aggressive":   {"kmh": 29.5, "watts": "165W (Z1 max)", "hr": "142 bpm"},
        "realistic":    {"kmh": 28.0, "watts": "145W (Z1 mid)", "hr": "135 bpm"},
        "conservative": {"kmh": 26.5, "watts": "130W (Z1 baza)", "hr": "128 bpm"},
    }

    run_scenarios = {
        "aggressive":   {"pace_s_km": 300, "label": "5:00/km (Z1 pur)"},
        "realistic":    {"pace_s_km": 315, "label": "5:15/km (Z1 + oboseala medie)"},
        "conservative": {"pace_s_km": 336, "label": "5:36/km (Z1 + oboseala mare)"},
    }

    scenarios = {}
    for key in ("aggressive", "realistic", "conservative"):
        b = bike_scenarios[key]
        r = run_scenarios[key]

        bike_mps = b["kmh"] / 3.6
        bike_t   = IRONMAN_BIKE_M / bike_mps
        run_t    = IRONMAN_RUN_M * r["pace_s_km"] / 1000

        if swim_speed_mps:
            swim_t        = IRONMAN_SWIM_M / swim_speed_mps * OPEN_WATER
            swim_fmt      = fmt(swim_t)
            swim_pace_fmt = fmt(100 / swim_speed_mps)
        else:
            swim_t        = 4500
            swim_fmt      = "1:15:00"
            swim_pace_fmt = "--"

        total = swim_t + T1_S + bike_t + T2_S + run_t
        scenarios[key] = {
            "swim":       swim_fmt,
            "swim_pace":  swim_pace_fmt,
            "T1":         fmt(T1_S),
            "bike":       fmt(bike_t),
            "bike_speed": "%s km/h" % b["kmh"],
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
        "lab_date":     LAB_DATE,
        "lab_location": LAB_LOCATION,
        "bike_zones":   BIKE_ZONES,
        "run_zones":    RUN_ZONES,
        "electrolytes": ELECTROLYTES,
        "nutrition":    RACE_NUTRITION,
        "scenarios":    scenarios,
        "methodology": (
            "Bike: Z1 lab (125-165W, HR 125-142) -- zona sustenabila 1-6h. "
            "Viteza calculata via relatie putere-viteza P~v^3. "
            "Run: Z1 lab (5:00/km, HR 120-154) + factor oboseala Ironman."
        ),
    }


def get_lab_profile(swim_speed_mps=None) -> dict:
    return lab_ironman_prediction(swim_speed_mps)
