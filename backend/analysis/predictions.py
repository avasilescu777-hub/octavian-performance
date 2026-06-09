"""
Ironman-specific race predictions using actual Strava average_speed data.

Methodology:
- Swim:  Weighted average pace from ALL swim sessions (Strava average_speed), +6% open water
- Bike:  Weighted average from ALL outdoor rides (Strava average_speed), excludes VirtualRide
- Run:   Flat-equivalent pace from ALL runs, grade-adjusted for elevation gain, +18% Ironman fatigue
- Total: swim + T1 + bike + T2 + run
"""
from typing import Optional

RIEGEL_EXP = 1.06

RUN_DISTANCES = {
    "5K": 5000,
    "10K": 10000,
    "Half Marathon": 21097,
    "Marathon": 42195,
}

TRIATHLON_DISTANCES = {
    "Sprint":              {"swim": 750,  "bike": 20000,  "run": 5000},
    "Olympic":             {"swim": 1500, "bike": 40000,  "run": 10000},
    "70.3 (Half Ironman)": {"swim": 1900, "bike": 90000,  "run": 21097},
    "Ironman":             {"swim": 3800, "bike": 180000, "run": 42195},
}

IRONMAN_TRANSITIONS = {"Sprint": 120, "Olympic": 180, "70.3 (Half Ironman)": 300, "Ironman": 600}

# Fatigue penalty on run after swim+bike (Ironman ~18%, 70.3 ~10%, Olympic ~5%)
IRONMAN_RUN_PENALTY = {"Sprint": 1.02, "Olympic": 1.05, "70.3 (Half Ironman)": 1.10, "Ironman": 1.18}

# Open water vs pool: +6% on swim time
OPEN_WATER_FACTOR = 1.06


def fmt(seconds: float) -> str:
    s = int(round(seconds))
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h > 0 else f"{m}:{sec:02d}"


def riegel(t1: float, d1: float, d2: float) -> float:
    return t1 * (d2 / d1) ** RIEGEL_EXP


# ─── SWIM ────────────────────────────────────────────────────────────────────

def _swim_speed_from_activities(activities: list) -> Optional[tuple[float, str]]:
    """
    Returns (meters_per_second, method_description).
    Uses ALL swim sessions — weighted average by distance.
    """
    swims = [a for a in activities
             if a.get("sport_type", a.get("type", "")) == "Swim"
             and a.get("distance", 0) > 0 and a.get("moving_time", 0) > 0]
    if not swims:
        return None

    speeds = []
    for a in swims:
        spd = a.get("average_speed")
        dist = a["distance"]
        if spd and spd > 0:
            speeds.append((spd, dist))
        else:
            speeds.append((dist / a["moving_time"], dist))

    total_weight = sum(d for _, d in speeds)
    avg_speed = sum(s * d for s, d in speeds) / total_weight
    pace_per_100 = 100 / avg_speed
    return (avg_speed, f"medie {fmt(pace_per_100)}/100m din {len(swims)} sesiuni")


def predict_swim(activities: list, dist_m: float, open_water: bool = True) -> Optional[dict]:
    result = _swim_speed_from_activities(activities)
    if not result:
        return None
    speed, method = result
    pool_time = dist_m / speed
    race_time = pool_time * (OPEN_WATER_FACTOR if open_water else 1.0)
    pace_100 = 100 / speed
    return {
        "seconds": round(race_time),
        "time": fmt(race_time),
        "pace_per_100m": fmt(pace_100),
        "method": method,
        "open_water_factor": open_water,
    }


# ─── BIKE ────────────────────────────────────────────────────────────────────

def _bike_speed_from_activities(activities: list) -> Optional[tuple[float, str]]:
    """
    Returns (meters_per_second, method_description).
    ALL outdoor rides — excludes VirtualRide/Zwift, weighted average by distance.
    """
    rides = [a for a in activities
             if a.get("sport_type", a.get("type", "")) == "Ride"
             and a.get("distance", 0) > 0 and a.get("moving_time", 0) > 0]
    if not rides:
        return None

    speeds = []
    for a in rides:
        spd = a.get("average_speed")
        dist = a["distance"]
        if spd and spd > 0:
            speeds.append((spd, dist))
        else:
            speeds.append((dist / a["moving_time"], dist))

    total_weight = sum(d for _, d in speeds)
    avg_speed = sum(s * d for s, d in speeds) / total_weight
    kmh = round(avg_speed * 3.6, 1)
    return (avg_speed, f"{kmh} km/h medie din {len(rides)} ieșiri outdoor")


def predict_bike(activities: list, dist_m: float) -> Optional[dict]:
    result = _bike_speed_from_activities(activities)
    if not result:
        return None
    speed, method = result
    time = dist_m / speed
    kmh = speed * 3.6
    return {
        "seconds": round(time),
        "time": fmt(time),
        "avg_speed_kmh": round(kmh, 1),
        "method": method,
    }


# ─── RUN ─────────────────────────────────────────────────────────────────────

# Grade adjustment: each 100m of elevation gain per km adds ~10% to time.
# Dividing actual time by this factor gives the flat-equivalent time.
GRADE_FACTOR_PER_100M_PER_KM = 0.10

# Flat threshold: runs with < this many m/km gain are considered "flat"
FLAT_GAIN_PER_KM = 8.0


def _flat_equivalent_time(moving_time: float, distance: float, elevation_gain: float) -> float:
    """Return the flat-equivalent moving time, correcting for elevation gain."""
    if not elevation_gain or elevation_gain <= 0 or not distance:
        return moving_time
    gain_per_km = (elevation_gain / distance) * 1000
    factor = 1.0 + (gain_per_km / 100.0) * GRADE_FACTOR_PER_100M_PER_KM
    return moving_time / factor


def _run_pace_from_activities(activities: list) -> Optional[tuple[float, str]]:
    """
    Returns (flat_equivalent_seconds_per_meter, method_description).
    Only road runs (Run) — TrailRun excluded (Ironman marathon is flat road).
    Weighted by dist^1.5 so long quality runs dominate short recovery jogs.
    """
    runs = [a for a in activities
            if a.get("sport_type", a.get("type", "")) == "Run"
            and a.get("distance", 0) > 0 and a.get("moving_time", 0) > 0]
    if not runs:
        return None

    total_weight = 0.0
    total_weighted_pace = 0.0
    for a in runs:
        dist = a["distance"]
        time = a["moving_time"]
        pace_s_per_m = time / dist
        weight = dist ** 1.5
        total_weight += weight
        total_weighted_pace += pace_s_per_m * weight

    pace = total_weighted_pace / total_weight
    return (pace, f"medie {fmt(pace*1000)}/km din {len(runs)} alergări șosea")


def predict_run(activities: list, dist_m: float, ironman_fatigue: float = 1.0) -> Optional[dict]:
    result = _run_pace_from_activities(activities)
    if not result:
        return None
    pace_s_per_m, method = result
    # Apply fatigue factor
    race_pace = pace_s_per_m * ironman_fatigue
    time = dist_m * race_pace
    km_pace = race_pace * 1000
    return {
        "seconds": round(time),
        "time": fmt(time),
        "pace_per_km": fmt(km_pace),
        "method": method,
        "fatigue_factor": ironman_fatigue,
    }


# ─── STANDALONE RUN PREDICTIONS (Riegel best effort) ─────────────────────────

def predict_run_times(activities: list) -> dict:
    runs = [a for a in activities
            if a.get("sport_type", a.get("type", "")) == "Run"
            and a.get("distance", 0) >= 1000 and a.get("moving_time", 0) > 0]
    if not runs:
        return {}
    best = min(runs, key=lambda x: x["moving_time"] / x["distance"])
    ref_dist = best["distance"]
    ref_time = best["moving_time"]
    result = {}
    for name, dist in RUN_DISTANCES.items():
        t = riegel(ref_time, ref_dist, dist)
        result[name] = {
            "time": fmt(t),
            "pace_per_km": fmt((t / dist) * 1000),
            "seconds": round(t),
        }
    return result


# ─── TRIATHLON PREDICTIONS ───────────────────────────────────────────────────

def predict_triathlon_times(activities: list) -> dict:
    results = {}
    for name, dists in TRIATHLON_DISTANCES.items():
        is_ironman_type = name in ("Ironman", "70.3 (Half Ironman)")
        fatigue = IRONMAN_RUN_PENALTY[name]
        open_water = is_ironman_type

        swim = predict_swim(activities, dists["swim"], open_water=open_water)
        bike = predict_bike(activities, dists["bike"])
        run = predict_run(activities, dists["run"], ironman_fatigue=fatigue)
        t = IRONMAN_TRANSITIONS[name]

        if not (swim and bike and run):
            continue

        total = swim["seconds"] + bike["seconds"] + run["seconds"] + t
        results[name] = {
            "total": fmt(total),
            "total_seconds": total,
            "swim": swim["time"],
            "bike": bike["time"],
            "run": run["time"],
            "transitions": fmt(t),
            "swim_pace_100m": swim["pace_per_100m"],
            "bike_speed_kmh": bike["avg_speed_kmh"],
            "run_pace_km": run["pace_per_km"],
            "swim_method": swim["method"],
            "bike_method": bike["method"],
            "run_method": run["method"],
            "run_fatigue_pct": round((fatigue - 1) * 100),
        }
    return results


# ─── MAIN ────────────────────────────────────────────────────────────────────

def predict_races(activities: list) -> dict:
    return {
        "run": predict_run_times(activities),
        "triathlon": predict_triathlon_times(activities),
        "swim": {
            name: predict_swim(activities, dists["swim"], open_water=True)
            for name, dists in TRIATHLON_DISTANCES.items()
            if predict_swim(activities, dists["swim"])
        },
        "bike": {
            name: predict_bike(activities, dists["bike"])
            for name, dists in TRIATHLON_DISTANCES.items()
            if predict_bike(activities, dists["bike"])
        },
        "activity_summary": _activity_summary(activities),
    }


def _activity_summary(activities: list) -> dict:
    runs = [a for a in activities if a.get("sport_type", a.get("type", "")) in ("Run", "TrailRun")]
    rides = [a for a in activities if a.get("sport_type", a.get("type", "")) in ("Ride", "VirtualRide")]
    swims = [a for a in activities if a.get("sport_type", a.get("type", "")) == "Swim"]

    def longest(acts):
        if not acts:
            return 0
        return round(max(a.get("distance", 0) for a in acts) / 1000, 1)

    return {
        "total_activities": len(activities),
        "runs": len(runs),
        "rides": len(rides),
        "swims": len(swims),
        "longest_run_km": longest(runs),
        "longest_ride_km": longest(rides),
        "longest_swim_km": longest(swims),
    }
