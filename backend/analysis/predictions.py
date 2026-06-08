"""
Race time predictions using:
- Running: Riegel formula (t2 = t1 * (d2/d1)^1.06) based on best recent effort
- Cycling: Power-based scaling using FTP estimate
- Triathlon: Combined T1/T2 transitions + swim/bike/run splits
"""
import math
from analysis.fitness import estimate_vo2max, estimate_ftp, estimate_css


RIEGEL_EXP = 1.06

RUN_DISTANCES = {
    "5K": 5000,
    "10K": 10000,
    "Half Marathon": 21097,
    "Marathon": 42195,
}

TRIATHLON_DISTANCES = {
    "Sprint": {"swim": 750, "bike": 20000, "run": 5000},
    "Olympic": {"swim": 1500, "bike": 40000, "run": 10000},
    "70.3 (Half Ironman)": {"swim": 1900, "bike": 90000, "run": 21097},
    "Ironman": {"swim": 3800, "bike": 180000, "run": 42195},
}


def format_time(seconds: float) -> str:
    seconds = int(seconds)
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def riegel(t1: float, d1: float, d2: float) -> float:
    return t1 * (d2 / d1) ** RIEGEL_EXP


def predict_run_times(activities: list) -> dict:
    run_acts = [
        a for a in activities
        if a.get("sport_type", a.get("type", "")) in ("Run", "TrailRun")
        and a.get("distance", 0) >= 1000
        and a.get("moving_time", 0) > 0
    ]
    if not run_acts:
        return {}

    # find best pace effort (pace = time/distance, lower = faster)
    best_act = min(run_acts, key=lambda x: x["moving_time"] / x["distance"])
    ref_dist = best_act["distance"]
    ref_time = best_act["moving_time"]

    predictions = {}
    for name, dist in RUN_DISTANCES.items():
        pred_time = riegel(ref_time, ref_dist, dist)
        pace_per_km = (pred_time / dist) * 1000
        predictions[name] = {
            "time": format_time(pred_time),
            "pace_per_km": format_time(pace_per_km),
            "seconds": round(pred_time),
        }
    return predictions


def predict_swim_times(activities: list) -> dict:
    css = estimate_css(activities)
    if not css:
        return {}

    css_speed = 100 / css  # m/s
    predictions = {}
    for name, dists in TRIATHLON_DISTANCES.items():
        swim_dist = dists["swim"]
        swim_time = swim_dist / css_speed
        predictions[name] = {
            "distance_m": swim_dist,
            "time": format_time(swim_time),
            "pace_per_100m": format_time(css),
            "seconds": round(swim_time),
        }
    return predictions


def predict_bike_times(activities: list) -> dict:
    ftp = estimate_ftp(activities)
    if not ftp:
        ride_acts = [
            a for a in activities
            if a.get("sport_type", a.get("type", "")) in ("Ride", "VirtualRide")
            and a.get("distance", 0) > 0
            and a.get("moving_time", 0) > 0
        ]
        if not ride_acts:
            return {}
        best = max(ride_acts, key=lambda x: x.get("average_speed", 0))
        avg_speed = best.get("average_speed", 8.0)
    else:
        avg_speed = ftp * 0.045

    avg_speed = max(avg_speed, 7.0)

    predictions = {}
    for name, dists in TRIATHLON_DISTANCES.items():
        bike_dist = dists["bike"]
        bike_time = bike_dist / avg_speed
        speed_kmh = avg_speed * 3.6
        predictions[name] = {
            "distance_km": round(bike_dist / 1000, 1),
            "time": format_time(bike_time),
            "avg_speed_kmh": round(speed_kmh, 1),
            "seconds": round(bike_time),
        }
    return predictions


def predict_triathlon_times(activities: list) -> dict:
    swim_preds = predict_swim_times(activities)
    bike_preds = predict_bike_times(activities)
    run_preds = predict_run_times(activities)

    transitions = {
        "Sprint": 120,
        "Olympic": 180,
        "70.3 (Half Ironman)": 300,
        "Ironman": 600,
    }

    results = {}
    for name in TRIATHLON_DISTANCES:
        swim_s = swim_preds.get(name, {}).get("seconds")
        bike_s = bike_preds.get(name, {}).get("seconds")
        run_dist = TRIATHLON_DISTANCES[name]["run"]

        run_ref = None
        for r_name, r_dist in RUN_DISTANCES.items():
            if r_dist == run_dist:
                run_ref = run_preds.get(r_name, {}).get("seconds")
                break
        if not run_ref and run_preds:
            first_run_key = list(run_preds.keys())[0]
            ref_dist = RUN_DISTANCES[first_run_key]
            ref_time = run_preds[first_run_key]["seconds"]
            run_ref = riegel(ref_time, ref_dist, run_dist)

        if not (swim_s and bike_s and run_ref):
            continue

        total = swim_s + bike_s + run_ref + transitions[name]
        results[name] = {
            "total": format_time(total),
            "total_seconds": round(total),
            "swim": format_time(swim_s),
            "bike": format_time(bike_s),
            "run": format_time(run_ref),
            "transitions": format_time(transitions[name]),
        }
    return results


def predict_races(activities: list) -> dict:
    return {
        "run": predict_run_times(activities),
        "triathlon": predict_triathlon_times(activities),
        "swim": predict_swim_times(activities),
        "bike": predict_bike_times(activities),
    }
