"""
Ironman coach analysis — builds multi-method predictions from actual Strava data.

Swim:  CSS estimate + weighted avg pace, open-water factor, volume/trend
Bike:  FTP (power-based or estimated), long-ride avg speed, aerobic decoupling
Run:   Flat-equivalent long-run pace, brick runs, fatigue-adjusted marathon
Load:  CTL/ATL/TSB from last 6 months → freshness classification
"""

import math
from datetime import datetime, timedelta, timezone
from typing import Optional
from .predictions import _flat_equivalent_time, fmt, OPEN_WATER_FACTOR

# ─── constants ───────────────────────────────────────────────────────────────

IRONMAN_SWIM_M   = 3800
IRONMAN_BIKE_M   = 180000
IRONMAN_RUN_M    = 42195
T1_S             = 480   # 8 min
T2_S             = 300   # 5 min

# Fatigue penalty on marathon after full Ironman bike
FATIGUE_AGGRESSIVE   = 1.12   # excellent day, great conditioning
FATIGUE_REALISTIC    = 1.18   # typical Ironman fatigue
FATIGUE_CONSERVATIVE = 1.27   # harder day / pacing errors

# Ironman bike effort as fraction of FTP (sustainable for 5-6h)
IRONMAN_BIKE_FTP_PCT_AGGRESSIVE   = 0.78
IRONMAN_BIKE_FTP_PCT_REALISTIC    = 0.73
IRONMAN_BIKE_FTP_PCT_CONSERVATIVE = 0.68

# Open water factor already in predictions.py (1.06)
OPEN_WATER_SWIM_FACTOR = OPEN_WATER_FACTOR  # 1.06

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


def _activities_in_window(activities: list, weeks: int) -> list:
    cutoff = datetime.now(timezone.utc) - timedelta(weeks=weeks)
    result = []
    for a in activities:
        d = _activity_date(a)
        if d is None:
            continue
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        if d >= cutoff:
            result.append(a)
    return result


def _pace_fmt(seconds_per_meter: float) -> str:
    """Format pace as MM:SS/km."""
    return fmt(seconds_per_meter * 1000)


def _speed_to_pace_100(speed_mps: float) -> str:
    """Format swim speed as MM:SS/100m."""
    if speed_mps <= 0:
        return "N/A"
    return fmt(100 / speed_mps)


def _weighted_avg_speed(sport_acts: list, speed_key="average_speed") -> Optional[float]:
    """Weighted average speed (m/s) by distance."""
    items = []
    for a in sport_acts:
        dist = a.get("distance", 0)
        spd = a.get(speed_key)
        if dist > 0 and spd and spd > 0:
            items.append((spd, dist))
        elif dist > 0 and a.get("moving_time", 0) > 0:
            items.append((dist / a["moving_time"], dist))
    if not items:
        return None
    total_w = sum(d for _, d in items)
    return sum(s * d for s, d in items) / total_w


# ─── swim analysis ────────────────────────────────────────────────────────────

def analyze_swim(activities: list) -> dict:
    all_swims = [a for a in activities
                 if a.get("sport_type", a.get("type", "")) == "Swim"
                 and a.get("distance", 0) > 0 and a.get("moving_time", 0) > 0]

    recent_12w = _activities_in_window(all_swims, 12)
    recent_6w  = _activities_in_window(all_swims, 6)

    if not all_swims:
        return {"available": False, "note": "Nicio sesiune de înot găsită"}

    # Volume
    total_dist_km = sum(a["distance"] for a in all_swims) / 1000
    weekly_dist_km = total_dist_km / 24 if all_swims else 0

    # Avg speed weighted by distance
    avg_speed = _weighted_avg_speed(all_swims)
    recent_speed = _weighted_avg_speed(recent_6w) if recent_6w else None

    # Longest swim
    longest = max(a["distance"] for a in all_swims)

    # CSS estimate from best 400m-ish effort
    css_speed = _estimate_css_speed(all_swims)

    # Use CSS if available and faster (better indicator), else training avg
    reference_speed = css_speed if (css_speed and css_speed > (avg_speed or 0)) else avg_speed

    # Trend
    trend = "stabil"
    if recent_speed and avg_speed:
        delta_pct = (recent_speed - avg_speed) / avg_speed * 100
        if delta_pct > 2:
            trend = f"în progres (+{delta_pct:.1f}%)"
        elif delta_pct < -2:
            trend = f"în scădere ({delta_pct:.1f}%)"

    # Race predictions — aggressive uses CSS/best, realistic uses avg, conservative adds penalty
    def race_swim(speed_mps: float, penalty: float = 1.0) -> dict:
        pool_time = IRONMAN_SWIM_M / speed_mps
        race_time = pool_time * OPEN_WATER_SWIM_FACTOR * penalty
        return {"seconds": round(race_time), "time": fmt(race_time),
                "pace_100m": _speed_to_pace_100(speed_mps)}

    if not reference_speed:
        return {"available": False, "note": "Date insuficiente pentru predicție"}

    return {
        "available": True,
        "sessions_6m": len(all_swims),
        "sessions_12w": len(recent_12w),
        "sessions_6w": len(recent_6w),
        "total_distance_km": round(total_dist_km, 1),
        "weekly_avg_km": round(weekly_dist_km, 2),
        "longest_m": round(longest),
        "avg_pace_100m": _speed_to_pace_100(avg_speed),
        "css_pace_100m": _speed_to_pace_100(css_speed) if css_speed else None,
        "recent_6w_pace_100m": _speed_to_pace_100(recent_speed) if recent_speed else None,
        "trend": trend,
        "reference_speed_mps": reference_speed,
        "aggressive":   race_swim(reference_speed, 0.97),
        "realistic":    race_swim(reference_speed, 1.00),
        "conservative": race_swim(reference_speed, 1.06),
    }


def _estimate_css_speed(swims: list) -> Optional[float]:
    """Critical Swim Speed as m/s from best 400m and 200m efforts."""
    best_400 = None
    best_200 = None
    for a in swims:
        dist = a.get("distance", 0)
        time = a.get("moving_time", 0)
        if not dist or not time:
            continue
        if 350 <= dist <= 450:
            if best_400 is None or time * (400/dist) < best_400:
                best_400 = time * (400 / dist)
        elif 175 <= dist <= 225:
            if best_200 is None or time * (200/dist) < best_200:
                best_200 = time * (200 / dist)
    if best_400 and best_200 and best_400 > best_200:
        css_mps = (400 - 200) / (best_400 - best_200)
        return css_mps if css_mps > 0 else None
    return None


# ─── bike analysis ────────────────────────────────────────────────────────────

def analyze_bike(activities: list) -> dict:
    outdoor_rides = [a for a in activities
                     if a.get("sport_type", a.get("type", "")) == "Ride"
                     and a.get("distance", 0) > 0 and a.get("moving_time", 0) > 0]

    if not outdoor_rides:
        return {"available": False, "note": "Nicio ieșire outdoor cu bicicleta găsită"}

    long_rides = [a for a in outdoor_rides if a.get("moving_time", 0) >= 14400]  # >4h
    very_long   = [a for a in outdoor_rides if a.get("moving_time", 0) >= 18000]  # >5h

    # FTP estimate
    ftp = _estimate_ftp(outdoor_rides)

    # Weighted avg speed: all rides vs long rides
    avg_speed_all  = _weighted_avg_speed(outdoor_rides)
    avg_speed_long = _weighted_avg_speed(long_rides) if long_rides else None

    # Aerobic decoupling proxy: HR drift in last 6 weeks
    recent_long = _activities_in_window(long_rides, 6)
    decoupling_note = _hr_decoupling_note(recent_long)

    # Ironman bike predictions
    def ironman_bike(speed_mps: float) -> dict:
        t = IRONMAN_BIKE_M / speed_mps
        return {"seconds": round(t), "time": fmt(t), "avg_speed_kmh": round(speed_mps * 3.6, 1)}

    # Use long-ride speed as primary predictor; fall back to all-ride avg
    ref_speed = avg_speed_long if avg_speed_long else avg_speed_all

    agr_speed  = ref_speed * 1.00  # best long-ride performance
    real_speed = ref_speed * 0.95  # typical ironman pacing (5% below training avg)
    cons_speed = ref_speed * 0.88  # conservative/safer pacing

    # If FTP available, also compute via FTP%
    ftp_predictions = {}
    if ftp and avg_speed_all:
        # Calibrate: power-speed relationship from training (assume speed scales with power^0.33)
        # We know avg FTP → avg speed in training; scale to target FTP%
        # Better: use watts/kg if weight known, or just use long-ride speeds directly
        ftp_predictions = {
            "ftp_watts": round(ftp),
            "target_im_watts_aggressive":   round(ftp * IRONMAN_BIKE_FTP_PCT_AGGRESSIVE),
            "target_im_watts_realistic":    round(ftp * IRONMAN_BIKE_FTP_PCT_REALISTIC),
            "target_im_watts_conservative": round(ftp * IRONMAN_BIKE_FTP_PCT_CONSERVATIVE),
        }

    # Longest ride distance
    longest_km = round(max(a["distance"] for a in outdoor_rides) / 1000, 1)

    # Long ride avg speed for context
    long_avg_kmh = round(avg_speed_long * 3.6, 1) if avg_speed_long else None

    return {
        "available": True,
        "rides_6m": len(outdoor_rides),
        "long_rides_4h_plus": len(long_rides),
        "very_long_rides_5h_plus": len(very_long),
        "longest_ride_km": longest_km,
        "avg_speed_kmh_all": round(avg_speed_all * 3.6, 1) if avg_speed_all else None,
        "avg_speed_kmh_long_rides": long_avg_kmh,
        "ftp": ftp_predictions,
        "aerobic_decoupling": decoupling_note,
        "aggressive":   ironman_bike(agr_speed),
        "realistic":    ironman_bike(real_speed),
        "conservative": ironman_bike(cons_speed),
        "ref_speed_mps": ref_speed,
    }


def _estimate_ftp(rides: list) -> Optional[float]:
    """FTP = 95% best 20-min avg power from rides with power data."""
    power_rides = [a for a in rides
                   if a.get("average_watts") and a.get("moving_time", 0) >= 1200]
    if not power_rides:
        return None
    best = max(power_rides, key=lambda a: a.get("average_watts", 0))
    return best["average_watts"] * 0.95


def _hr_decoupling_note(rides: list) -> str:
    hr_rides = [a for a in rides if a.get("average_heartrate") and a.get("moving_time", 0) >= 7200]
    if not hr_rides:
        return "date HR insuficiente pentru analiza decuplajului"
    avg_hr = sum(a["average_heartrate"] for a in hr_rides) / len(hr_rides)
    if avg_hr < 140:
        return f"HR mediu {avg_hr:.0f} bpm în ieșirile lungi — aerobic bun"
    elif avg_hr < 155:
        return f"HR mediu {avg_hr:.0f} bpm — ritm aerobic moderat"
    else:
        return f"HR mediu {avg_hr:.0f} bpm — atenție la ritmul cardiac la Ironman"


# ─── run analysis ─────────────────────────────────────────────────────────────

def analyze_run(activities: list) -> dict:
    # TrailRun excluded — Ironman marathon is flat road
    runs = [a for a in activities
            if a.get("sport_type", a.get("type", "")) == "Run"
            and a.get("distance", 0) > 0 and a.get("moving_time", 0) > 0]

    if not runs:
        return {"available": False, "note": "Nicio alergare găsită"}

    long_runs  = [a for a in runs if a["distance"] >= 25000]
    marathon_approx = [a for a in runs if a["distance"] >= 35000]

    # Flat-equivalent pace — weighted by dist^1.5 so long quality runs dominate
    # over short recovery jogs (a 20km run weighs ~7× more than a 3km jog)
    total_weight = 0.0
    total_weighted_pace = 0.0
    for a in runs:
        dist = a["distance"]
        elev = a.get("total_elevation_gain", 0) or 0
        flat_t = _flat_equivalent_time(a["moving_time"], dist, elev)
        w = dist ** 1.5
        total_weight += w
        total_weighted_pace += (flat_t / dist) * w
    avg_pace = total_weighted_pace / total_weight  # s/m

    # Long-run pace (flat-equiv, weighted by dist^1.5)
    long_pace = None
    if long_runs:
        lw, lwp = 0.0, 0.0
        for a in long_runs:
            dist = a["distance"]
            elev = a.get("total_elevation_gain", 0) or 0
            ft = _flat_equivalent_time(a["moving_time"], dist, elev)
            w = dist ** 1.5
            lw += w
            lwp += (ft / dist) * w
        long_pace = lwp / lw

    # Brick runs: runs within 90 min after a bike ride on the same day
    brick_pace = _estimate_brick_pace(activities)

    # VO2max proxy from best effort
    vo2max = _vo2max_from_runs(runs)

    # Volume
    total_run_km = sum(a["distance"] for a in runs) / 1000
    weekly_km = total_run_km / 24

    # Best reference pace for marathon prediction
    ref_pace = long_pace if long_pace else avg_pace

    # Marathon fatigue-adjusted predictions
    def ironman_run(pace_s_per_m: float, fatigue: float) -> dict:
        rp = pace_s_per_m * fatigue
        t = IRONMAN_RUN_M * rp
        return {"seconds": round(t), "time": fmt(t), "pace_per_km": fmt(rp * 1000)}

    return {
        "available": True,
        "runs_6m": len(runs),
        "long_runs_25km_plus": len(long_runs),
        "marathon_distance_runs": len(marathon_approx),
        "total_run_km": round(total_run_km, 1),
        "weekly_avg_km": round(weekly_km, 1),
        "avg_pace_km": _pace_fmt(avg_pace),
        "long_run_pace_km": _pace_fmt(long_pace) if long_pace else None,
        "brick_pace_km": brick_pace,
        "vo2max_estimate": vo2max,
        "longest_run_km": round(max(a["distance"] for a in runs) / 1000, 1),
        "aggressive":   ironman_run(ref_pace, FATIGUE_AGGRESSIVE),
        "realistic":    ironman_run(ref_pace, FATIGUE_REALISTIC),
        "conservative": ironman_run(ref_pace, FATIGUE_CONSERVATIVE),
        "ref_pace_mps": ref_pace,
        "fatigue_factors": {
            "aggressive": FATIGUE_AGGRESSIVE,
            "realistic": FATIGUE_REALISTIC,
            "conservative": FATIGUE_CONSERVATIVE,
        },
    }


def _estimate_brick_pace(activities: list) -> Optional[str]:
    """Find runs that started within 90 min of a bike ride ending."""
    bikes = [a for a in activities
             if a.get("sport_type", a.get("type", "")) in ("Ride",)
             and a.get("distance", 0) > 0]
    runs  = [a for a in activities
             if a.get("sport_type", a.get("type", "")) == "Run"
             and a.get("distance", 0) > 0]

    brick_paces = []
    for bike in bikes:
        b_start = _activity_date(bike)
        b_dur   = bike.get("moving_time", 0)
        if not b_start or not b_dur:
            continue
        b_end = b_start + timedelta(seconds=b_dur)

        for run in runs:
            r_start = _activity_date(run)
            if not r_start:
                continue
            if r_start.tzinfo is None:
                r_start = r_start.replace(tzinfo=timezone.utc)
            gap = (r_start - b_end).total_seconds()
            if 0 <= gap <= 5400:  # run started within 90 min of bike end
                dist  = run["distance"]
                elev  = run.get("total_elevation_gain", 0) or 0
                ft    = _flat_equivalent_time(run["moving_time"], dist, elev)
                brick_paces.append(ft / dist)

    if not brick_paces:
        return None
    avg = sum(brick_paces) / len(brick_paces)
    return _pace_fmt(avg)


def _vo2max_from_runs(runs: list) -> Optional[float]:
    best = 0.0
    for a in runs:
        dist = a.get("distance", 0)
        time = a.get("moving_time", 0)
        if not dist or not time:
            continue
        spd = (dist / time) * 60  # m/min
        demand = -4.6 + 0.182258 * spd + 0.000104 * spd ** 2
        frac   = 0.8 + 0.1894393 * math.exp(-0.012778 * time / 60) + \
                 0.2989558 * math.exp(-0.1932605 * time / 60)
        vo2 = demand / frac if frac else 0
        best = max(best, vo2)
    return round(best, 1) if best > 0 else None


# ─── training load analysis ───────────────────────────────────────────────────

def analyze_load(activities: list) -> dict:
    """EMA-based CTL/ATL/TSB over last 6 months."""
    if not activities:
        return {"available": False}

    dated = []
    for a in activities:
        d = _activity_date(a)
        if d:
            dated.append((d, a))
    dated.sort(key=lambda x: x[0])

    # Simple TRIMP per activity
    def trimp(a):
        hr = a.get("average_heartrate")
        duration_h = a.get("moving_time", 0) / 3600
        if hr and hr > 50:
            return duration_h * hr * 0.64  # basic TRIMP formula
        # Fallback: distance-based load
        dist_km = a.get("distance", 0) / 1000
        sport = a.get("sport_type", a.get("type", ""))
        if sport in ("Run", "TrailRun"):
            return dist_km * 1.0
        elif sport in ("Ride",):
            return dist_km * 0.25
        elif sport == "Swim":
            return dist_km * 3.0
        return dist_km * 0.5

    # Build daily load map
    daily = {}
    for d, a in dated:
        key = d.date()
        daily[key] = daily.get(key, 0) + trimp(a)

    if not daily:
        return {"available": False}

    all_dates = sorted(daily.keys())
    start = all_dates[0]
    end   = all_dates[-1]

    ctl, atl = 0.0, 0.0
    ctl_k = 2 / (42 + 1)
    atl_k = 2 / (7 + 1)

    cur = start
    weekly_load = []
    week_acc = 0.0
    week_days = 0

    while cur <= end:
        load = daily.get(cur, 0.0)
        ctl  = load * ctl_k + ctl * (1 - ctl_k)
        atl  = load * atl_k + atl * (1 - atl_k)
        week_acc += load
        week_days += 1
        if week_days == 7:
            weekly_load.append(round(week_acc, 1))
            week_acc, week_days = 0, 0
        cur += timedelta(days=1)

    tsb = ctl - atl

    # Consistency: % of days with some load in last 12 weeks
    last_84 = [(end - timedelta(days=i)).date() for i in range(84)]
    active_days = sum(1 for d in last_84 if daily.get(d, 0) > 0)
    consistency_pct = round(active_days / 84 * 100)

    # Freshness classification
    if tsb > 15:
        freshness = "Odihnit — forma excelentă pentru cursă"
    elif tsb > 5:
        freshness = "Bine odihnit — tapering reușit"
    elif tsb > -5:
        freshness = "Neutru — formă decentă, nu deplin odihnit"
    elif tsb > -15:
        freshness = "Ușor obosit — conținuă tapering-ul"
    else:
        freshness = "Oboseală acumulată — reducere urgentă de volum"

    return {
        "available": True,
        "current_ctl": round(ctl, 1),
        "current_atl": round(atl, 1),
        "current_tsb": round(tsb, 1),
        "freshness": freshness,
        "consistency_pct": consistency_pct,
        "active_days_12w": active_days,
        "weekly_load_history": weekly_load[-12:],  # last 12 weeks
    }


# ─── full ironman prediction ──────────────────────────────────────────────────

def full_ironman_analysis(activities: list) -> dict:
    swim_a = analyze_swim(activities)
    bike_a = analyze_bike(activities)
    run_a  = analyze_run(activities)
    load_a = analyze_load(activities)

    scenarios = {}

    if swim_a.get("available") and bike_a.get("available") and run_a.get("available"):
        for scenario in ("aggressive", "realistic", "conservative"):
            sw = swim_a[scenario]["seconds"]
            bk = bike_a[scenario]["seconds"]
            rn = run_a[scenario]["seconds"]
            total = sw + bk + rn + T1_S + T2_S
            scenarios[scenario] = {
                "swim":        swim_a[scenario]["time"],
                "swim_pace":   swim_a[scenario]["pace_100m"],
                "T1":          fmt(T1_S),
                "bike":        bike_a[scenario]["time"],
                "bike_speed":  f"{bike_a[scenario]['avg_speed_kmh']} km/h",
                "T2":          fmt(T2_S),
                "run":         run_a[scenario]["time"],
                "run_pace":    run_a[scenario]["pace_per_km"],
                "total":       fmt(total),
                "total_s":     total,
            }

    # Probability estimates based on realistic scenario ± std dev
    probs = {}
    if "realistic" in scenarios:
        real_s = scenarios["realistic"]["total_s"]
        agr_s  = scenarios["aggressive"]["total_s"]
        sd     = max((real_s - agr_s) / 1.28, 600)  # σ ≈ 10 min min
        def prob_faster(target_s):
            z = (real_s - target_s) / sd
            p = 0.5 * (1 + math.erf(z / math.sqrt(2)))
            return round(max(0, min(100, p * 100)))

        probs = {
            "sub_12h_pct":   prob_faster(12 * 3600),
            "sub_11h30_pct": prob_faster(11 * 3600 + 30 * 60),
            "sub_11h_pct":   prob_faster(11 * 3600),
        }

    # Pacing recommendations
    pacing = _pacing_recommendations(bike_a, run_a)

    return {
        "swim":      swim_a,
        "bike":      bike_a,
        "run":       run_a,
        "load":      load_a,
        "scenarios": scenarios,
        "probabilities": probs,
        "pacing": pacing,
        "race_date": "2026-06-14",
        "race_name": "Ironman Tours",
    }


def _pacing_recommendations(bike_a: dict, run_a: dict) -> dict:
    advice = []

    if bike_a.get("available"):
        spd = bike_a.get("avg_speed_kmh_all")
        ftp = bike_a.get("ftp", {})
        if ftp.get("target_im_watts_realistic"):
            advice.append(
                f"Bicicletă: tintește ~{ftp['target_im_watts_realistic']}W "
                f"(73% FTP). Nu depăși {ftp.get('target_im_watts_aggressive')}W "
                f"în primele 100km."
            )
        elif spd:
            im_speed = round(spd * 0.93, 1)
            advice.append(
                f"Bicicletă: medie antrenament {spd} km/h → viteza Ironman țintă "
                f"~{im_speed} km/h. Primele 90km mai conservator."
            )

    if run_a.get("available"):
        rp = run_a.get("long_run_pace_km") or run_a.get("avg_pace_km")
        brick = run_a.get("brick_pace_km")
        if brick:
            advice.append(
                f"Maraton: estimat {run_a['realistic']['pace_per_km']}/km "
                f"(ritmul brick al tău: {brick}/km). "
                "Primii 10km: mai lent cu 15-20 sec față de obiectiv."
            )
        elif rp:
            advice.append(
                f"Maraton: ritmul de alergare lungă {rp}/km → ritmul Ironman "
                f"realist ~{run_a['realistic']['pace_per_km']}/km. "
                "Disciplina la ieșirea din T2 e cheia."
            )

    advice.append(
        "Nutriție bicicletă: 80-90g carbohidrați/oră, 750ml-1L lichide/oră. "
        "Nu inova la cursă față de antrenament."
    )
    advice.append(
        "Cel mai mare risc: start prea rapid la bicicletă → crampe la maraton. "
        "Încearcă să alergi negativ — a doua jumătate mai rapid decât prima."
    )

    return {"tips": advice}
