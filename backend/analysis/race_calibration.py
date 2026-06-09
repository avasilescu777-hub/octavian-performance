"""
Race-day calibration: compare 6-month training averages vs actual race performance
on a specific date, derive improvement factors per discipline, then apply those
factors to current training data for a calibrated Ironman prediction.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from .predictions import (
    _flat_equivalent_time, _swim_speed_from_activities,
    _bike_speed_from_activities, _run_pace_from_activities,
    fmt, OPEN_WATER_FACTOR, IRONMAN_RUN_PENALTY,
)

IRONMAN_SWIM_M = 3800
IRONMAN_BIKE_M = 180000
IRONMAN_RUN_M  = 42195
T1_S = 480
T2_S = 300


# ─── helpers ─────────────────────────────────────────────────────────────────

def _activity_date(a: dict) -> Optional[datetime]:
    raw = a.get("start_date") or a.get("start_date_local")
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return datetime.fromisoformat(raw)
    except Exception:
        return None


def _to_utc(d: datetime) -> datetime:
    if d.tzinfo is None:
        return d.replace(tzinfo=timezone.utc)
    return d


def _acts_in_range(activities: list, start: datetime, end: datetime) -> list:
    result = []
    for a in activities:
        d = _activity_date(a)
        if d is None:
            continue
        d = _to_utc(d)
        if start <= d <= end:
            result.append(a)
    return result


def _sport(a: dict) -> str:
    return a.get("sport_type", a.get("type", "")).lower()


# ─── pace helpers ─────────────────────────────────────────────────────────────

def _swim_pace_s_per_100m(activities: list) -> Optional[float]:
    res = _swim_speed_from_activities(activities)
    if not res:
        return None
    speed_mps, _ = res
    return 100 / speed_mps  # s/100m


def _bike_speed_kmh(activities: list) -> Optional[float]:
    res = _bike_speed_from_activities(activities)
    if not res:
        return None
    speed_mps, _ = res
    return speed_mps * 3.6


def _run_pace_s_per_km(activities: list) -> Optional[float]:
    res = _run_pace_from_activities(activities)
    if not res:
        return None
    pace_s_per_m, _ = res
    return pace_s_per_m * 1000  # s/km


# ─── race day detection ───────────────────────────────────────────────────────

def _find_race_activities(activities: list, race_dt: datetime) -> dict:
    """
    Find swim/bike/run activities on race day (±12h window).
    Returns best candidate per sport: fastest swim, fastest bike, fastest run.
    """
    window_start = _to_utc(race_dt) - timedelta(hours=12)
    window_end   = _to_utc(race_dt) + timedelta(hours=36)
    day_acts     = _acts_in_range(activities, window_start, window_end)

    swims = [a for a in day_acts if _sport(a) in ("swim",) and a.get("distance", 0) > 0]
    rides = [a for a in day_acts if _sport(a) in ("ride",) and a.get("distance", 0) > 0]
    runs  = [a for a in day_acts if _sport(a) == "run" and a.get("distance", 0) > 0]

    # Also check for multi-sport triathlon activity
    triathlons = [a for a in day_acts if _sport(a) in ("triathlon",)]

    def fastest_pace(acts):
        if not acts:
            return None
        return min(acts, key=lambda a: a.get("moving_time", 9999999) / max(a.get("distance", 1), 1))

    best_swim = fastest_pace(swims)
    best_bike = fastest_pace(rides)
    best_run  = fastest_pace(runs)

    return {
        "swim": best_swim,
        "bike": best_bike,
        "run":  best_run,
        "triathlon": triathlons[0] if triathlons else None,
        "all": day_acts,
    }


def _race_swim_pace(race_acts: dict) -> Optional[tuple]:
    """Returns (pace_s_per_100m, distance_m, time_s, speed_mps)."""
    a = race_acts.get("swim")
    if not a:
        return None
    dist = a.get("distance", 0)
    t    = a.get("moving_time", 0)
    if not dist or not t:
        return None
    speed = a.get("average_speed") or dist / t
    pace  = 100 / speed
    return (pace, dist, t, speed)


def _race_bike_speed(race_acts: dict) -> Optional[tuple]:
    """Returns (speed_kmh, distance_m, time_s)."""
    a = race_acts.get("bike")
    if not a:
        return None
    dist = a.get("distance", 0)
    t    = a.get("moving_time", 0)
    if not dist or not t:
        return None
    speed = a.get("average_speed") or dist / t
    return (speed * 3.6, dist, t)


def _race_run_pace(race_acts: dict) -> Optional[tuple]:
    """Returns (pace_s_per_km, distance_m, time_s)."""
    a = race_acts.get("run")
    if not a:
        return None
    dist = a.get("distance", 0)
    t    = a.get("moving_time", 0)
    elev = a.get("total_elevation_gain", 0) or 0
    if not dist or not t:
        return None
    flat_t = _flat_equivalent_time(t, dist, elev)
    return (flat_t / dist * 1000, dist, t)


# ─── improvement % ────────────────────────────────────────────────────────────

def _improvement_pct(training_val: float, race_val: float, higher_is_better: bool) -> float:
    """
    Returns % improvement on race day relative to training.
    For swim/run: pace (lower=better), so improvement = (training - race) / training
    For bike: speed (higher=better), so improvement = (race - training) / training
    """
    if not training_val or not race_val:
        return 0.0
    if higher_is_better:
        return (race_val - training_val) / training_val * 100
    else:
        return (training_val - race_val) / training_val * 100


# ─── ironman split from calibrated pace ──────────────────────────────────────

def _ironman_total(swim_speed_mps: float, bike_speed_mps: float, run_pace_s_per_m: float) -> dict:
    swim_t = IRONMAN_SWIM_M / swim_speed_mps * OPEN_WATER_FACTOR
    bike_t = IRONMAN_BIKE_M / bike_speed_mps
    run_t  = IRONMAN_RUN_M  * run_pace_s_per_m * IRONMAN_RUN_PENALTY["Ironman"]
    total  = swim_t + T1_S + bike_t + T2_S + run_t
    return {
        "swim": fmt(swim_t), "swim_pace": fmt(100 / swim_speed_mps),
        "T1": fmt(T1_S),
        "bike": fmt(bike_t), "bike_speed": f"{round(bike_speed_mps * 3.6, 1)} km/h",
        "T2": fmt(T2_S),
        "run": fmt(run_t), "run_pace": fmt(run_pace_s_per_m * 1000),
        "total": fmt(total), "total_s": round(total),
    }


# ─── main entry ──────────────────────────────────────────────────────────────

def calibrate_from_race(activities: list, race_date_str: str = "2025-09-06") -> dict:
    year, month, day = map(int, race_date_str.split("-"))
    race_dt = datetime(year, month, day, 7, 0, 0, tzinfo=timezone.utc)

    # Pre-race training window: 6 months before race
    pre_start = race_dt - timedelta(days=180)
    pre_acts  = _acts_in_range(activities, pre_start, race_dt - timedelta(hours=12))

    # Current training window: last 6 months
    now          = datetime.now(timezone.utc)
    current_acts = _acts_in_range(activities, now - timedelta(days=180), now)

    # Race-day activities
    race_acts = _find_race_activities(activities, race_dt)

    if not race_acts["swim"] and not race_acts["bike"] and not race_acts["run"]:
        return {
            "available": False,
            "note": f"Nicio activitate găsită pe {race_date_str} în Strava. "
                    "Verifică că activitățile sunt înregistrate.",
            "race_date": race_date_str,
        }

    # ── Pre-race training averages ──────────────────────────────────────────
    pre_swim_pace  = _swim_pace_s_per_100m(pre_acts)   # s/100m (lower = faster)
    pre_bike_speed = _bike_speed_kmh(pre_acts)          # km/h   (higher = faster)
    pre_run_pace   = _run_pace_s_per_km(pre_acts)       # s/km   (lower = faster)

    # ── Race-day performance ────────────────────────────────────────────────
    r_swim = _race_swim_pace(race_acts)
    r_bike = _race_bike_speed(race_acts)
    r_run  = _race_run_pace(race_acts)

    race_swim_pace  = r_swim[0] if r_swim else None
    race_bike_speed = r_bike[0] if r_bike else None
    race_run_pace   = r_run[0]  if r_run  else None

    # ── Improvement % ───────────────────────────────────────────────────────
    swim_impr = _improvement_pct(pre_swim_pace,  race_swim_pace,  higher_is_better=False) if pre_swim_pace and race_swim_pace else None
    bike_impr = _improvement_pct(pre_bike_speed, race_bike_speed, higher_is_better=True)  if pre_bike_speed and race_bike_speed else None
    run_impr  = _improvement_pct(pre_run_pace,   race_run_pace,   higher_is_better=False) if pre_run_pace and race_run_pace else None

    # Average improvement across available disciplines
    imprs = [x for x in [swim_impr, bike_impr, run_impr] if x is not None]
    avg_impr = sum(imprs) / len(imprs) if imprs else 0.0

    # ── Current training averages ────────────────────────────────────────────
    cur_swim_pace  = _swim_pace_s_per_100m(current_acts)
    cur_bike_speed = _bike_speed_kmh(current_acts)
    cur_run_pace   = _run_pace_s_per_km(current_acts)

    # ── Calibrated race-day paces ────────────────────────────────────────────
    # Apply each discipline's improvement factor (or avg if not available)
    s_impr = swim_impr if swim_impr is not None else avg_impr
    b_impr = bike_impr if bike_impr is not None else avg_impr
    r_impr = run_impr  if run_impr  is not None else avg_impr

    cal_swim_speed_mps = None
    cal_bike_speed_mps = None
    cal_run_pace_s_per_m = None

    if cur_swim_pace:
        cal_swim_pace = cur_swim_pace * (1 - s_impr / 100)   # faster pace = lower number
        cal_swim_speed_mps = 100 / cal_swim_pace

    if cur_bike_speed:
        cal_bike_speed = cur_bike_speed * (1 + b_impr / 100)
        cal_bike_speed_mps = cal_bike_speed / 3.6

    if cur_run_pace:
        cal_run_pace = cur_run_pace * (1 - r_impr / 100)
        cal_run_pace_s_per_m = cal_run_pace / 1000

    # ── Ironman predictions ──────────────────────────────────────────────────
    # Standard (training averages only, no calibration)
    std_prediction = None
    if cur_swim_pace and cur_bike_speed and cur_run_pace:
        std_swim_mps = 100 / cur_swim_pace
        std_bike_mps = cur_bike_speed / 3.6
        std_run_mps  = cur_run_pace / 1000
        std_prediction = _ironman_total(std_swim_mps, std_bike_mps, std_run_mps)

    # Calibrated (training + race-day factor)
    cal_prediction = None
    if cal_swim_speed_mps and cal_bike_speed_mps and cal_run_pace_s_per_m:
        cal_prediction = _ironman_total(cal_swim_speed_mps, cal_bike_speed_mps, cal_run_pace_s_per_m)

    return {
        "available": True,
        "race_date": race_date_str,
        "race_activities_found": len([x for x in [race_acts["swim"], race_acts["bike"], race_acts["run"]] if x]),

        "pre_race_training": {
            "swim_pace_100m": fmt(pre_swim_pace) if pre_swim_pace else None,
            "bike_speed_kmh": round(pre_bike_speed, 1) if pre_bike_speed else None,
            "run_pace_km":    fmt(pre_run_pace) if pre_run_pace else None,
        },

        "race_day": {
            "swim_pace_100m":  fmt(race_swim_pace) if race_swim_pace else None,
            "swim_distance_m": r_swim[1] if r_swim else None,
            "bike_speed_kmh":  round(race_bike_speed, 1) if race_bike_speed else None,
            "bike_distance_km": round(r_bike[1] / 1000, 1) if r_bike else None,
            "run_pace_km":     fmt(race_run_pace) if race_run_pace else None,
            "run_distance_km": round(r_run[1] / 1000, 1) if r_run else None,
        },

        "improvement": {
            "swim_pct": round(swim_impr, 1) if swim_impr is not None else None,
            "bike_pct": round(bike_impr, 1) if bike_impr is not None else None,
            "run_pct":  round(run_impr, 1)  if run_impr  is not None else None,
            "avg_pct":  round(avg_impr, 1),
        },

        "current_training": {
            "swim_pace_100m": fmt(cur_swim_pace) if cur_swim_pace else None,
            "bike_speed_kmh": round(cur_bike_speed, 1) if cur_bike_speed else None,
            "run_pace_km":    fmt(cur_run_pace) if cur_run_pace else None,
        },

        "calibrated_paces": {
            "swim_pace_100m": fmt(100 / cal_swim_speed_mps) if cal_swim_speed_mps else None,
            "bike_speed_kmh": round(cal_bike_speed_mps * 3.6, 1) if cal_bike_speed_mps else None,
            "run_pace_km":    fmt(cal_run_pace_s_per_m * 1000) if cal_run_pace_s_per_m else None,
        },

        "ironman_standard":   std_prediction,
        "ironman_calibrated": cal_prediction,
    }
