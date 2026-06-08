"""
Ironman-specific race predictions using long efforts and fatigue factors.

Methodology:
- Swim:  CSS from 400/200m OR pace from long swims (>1500m), +6% open water factor
- Bike:  Average speed from longest rides (>2h), weighted by duration proximity to 180km
- Run:   Pace from long runs (>15km), +18% Ironman fatigue penalty vs standalone marathon
- Total: swim + T1 + bike + T2 + run

Standalone race predictions use best effort with Riegel formula.
"""
from typing import Optional
from analysis.fitness import estimate_css

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
    """Returns (meters_per_second, method_description)."""
    swims = [a for a in activities
             if a.get("sport_type", a.get("type", "")) == "Swim"
             and a.get("distance", 0) > 0 and a.get("moving_time", 0) > 0]
    if not swims:
        return None

    # Try CSS first (most accurate)
    css_pace = estimate_css(activities)  # s/100m
    if css_pace:
        speed = 100 / css_pace
        return (speed, f"CSS {css_pace:.1f}s/100m")

    # Long swim sessions (>1500m) — average pace
    long_swims = [a for a in swims if a.get("distance", 0) >= 1500]
    if long_swims:
        # weight by distance (longer = more representative)
        total_dist = sum(a["distance"] for a in long_swims)
        total_time = sum(a["moving_time"] for a in long_swims)
        avg_speed = total_dist / total_time
        pace_per_100 = 100 / avg_speed
        return (avg_speed, f"medie {pace_per_100:.1f}s/100m din {len(long_swims)} sesiuni lungi")

    # Fallback: any swim
    total_dist = sum(a["distance"] for a in swims)
    total_time = sum(a["moving_time"] for a in swims)
    avg_speed = total_dist / total_time
    pace_per_100 = 100 / avg_speed
    return (avg_speed, f"medie {pace_per_100:.1f}s/100m din toate sesiunile")


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
    """Returns (meters_per_second, method_description)."""
    rides = [a for a in activities
             if a.get("sport_type", a.get("type", "")) in ("Ride", "VirtualRide")
             and a.get("moving_time", 0) >= 3600  # at least 1h
             and a.get("distance", 0) > 0]
    if not rides:
        # fallback: any ride
        rides = [a for a in activities
                 if a.get("sport_type", a.get("type", "")) in ("Ride", "VirtualRide")
                 and a.get("distance", 0) > 0 and a.get("moving_time", 0) > 0]
    if not rides:
        return None

    # Weight rides by duration — longer rides more representative for 180km
    # Cap weight at 6h (equivalent to Ironman bike time)
    long_rides = sorted(rides, key=lambda x: x.get("moving_time", 0), reverse=True)[:10]

    weighted_speed = 0.0
    total_weight = 0.0
    for ride in long_rides:
        dist = ride.get("distance", 0)
        time = ride.get("moving_time", 0)
        if not dist or not time:
            continue
        speed = dist / time  # m/s
        # weight = capped duration in hours
        weight = min(time / 3600, 6.0)
        weighted_speed += speed * weight
        total_weight += weight

    if total_weight == 0:
        return None

    avg_speed = weighted_speed / total_weight
    kmh = avg_speed * 3.6
    n = len(long_rides)
    return (avg_speed, f"{kmh:.1f} km/h medie din cele mai lungi {n} ieșiri")


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

def _run_pace_from_activities(activities: list) -> Optional[tuple[float, str]]:
    """Returns (seconds_per_meter, method_description)."""
    runs = [a for a in activities
            if a.get("sport_type", a.get("type", "")) in ("Run", "TrailRun")
            and a.get("distance", 0) > 0 and a.get("moving_time", 0) > 0]
    if not runs:
        return None

    # Long runs (>15km) — best representative of marathon fitness
    long_runs = [a for a in runs if a.get("distance", 0) >= 15000]
    if long_runs:
        # Use weighted average pace from long runs (distance-weighted)
        total_dist = sum(a["distance"] for a in long_runs)
        total_time = sum(a["moving_time"] for a in long_runs)
        pace = total_time / total_dist  # s/m
        km_pace = pace * 1000
        return (pace, f"medie {fmt(km_pace)}/km din {len(long_runs)} alergări lungi (>{15}km)")

    # Medium runs (>8km)
    medium_runs = [a for a in runs if a.get("distance", 0) >= 8000]
    if medium_runs:
        total_dist = sum(a["distance"] for a in medium_runs)
        total_time = sum(a["moving_time"] for a in medium_runs)
        pace = total_time / total_dist
        km_pace = pace * 1000
        return (pace, f"medie {fmt(km_pace)}/km din {len(medium_runs)} alergări (>8km)")

    # Best effort with Riegel
    best = min(runs, key=lambda x: x["moving_time"] / x["distance"])
    pace = best["moving_time"] / best["distance"]
    km_pace = pace * 1000
    return (pace, f"Riegel din cel mai bun efort ({fmt(km_pace)}/km)")


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
            if a.get("sport_type", a.get("type", "")) in ("Run", "TrailRun")
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
