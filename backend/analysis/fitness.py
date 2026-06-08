"""
VO2max: estimat din alergare via formula Daniels/Jones (pace + HR)
FTP:    estimat din ciclism — 95% din best 20-min avg power
CSS:    Critical Swim Speed — calculat din best 400m si 200m
"""
import math
from typing import Optional


def estimate_vo2max(activities: list) -> Optional[float]:
    """Jack Daniels VO2max estimate from best recent 5K-ish effort."""
    run_activities = [
        a for a in activities
        if a.get("sport_type", a.get("type", "")) in ("Run", "TrailRun", "Walk")
        and a.get("distance", 0) >= 3000
    ]
    if not run_activities:
        return None

    best_vo2 = 0.0
    for a in run_activities:
        dist = a.get("distance", 0)
        time = a.get("moving_time", 0)
        if not dist or not time:
            continue
        speed_m_per_min = (dist / time) * 60
        vo2_demand = -4.6 + 0.182258 * speed_m_per_min + 0.000104 * speed_m_per_min ** 2
        vo2_fraction = 0.8 + 0.1894393 * math.exp(-0.012778 * time / 60) + 0.2989558 * math.exp(-0.1932605 * time / 60)
        vo2 = vo2_demand / vo2_fraction
        if vo2 > best_vo2:
            best_vo2 = vo2

    return round(best_vo2, 1) if best_vo2 > 0 else None


def estimate_ftp(activities: list) -> Optional[float]:
    """FTP = 95% of best 20-min average power from cycling activities."""
    ride_activities = [
        a for a in activities
        if a.get("sport_type", a.get("type", "")) in ("Ride", "VirtualRide")
        and a.get("moving_time", 0) >= 1200
        and a.get("average_watts")
    ]
    if not ride_activities:
        return None

    sorted_rides = sorted(ride_activities, key=lambda x: x.get("average_watts", 0), reverse=True)

    for a in sorted_rides:
        watts = a.get("average_watts", 0)
        time = a.get("moving_time", 0)
        if watts and time >= 1200:
            return round(watts * 0.95, 0)

    return None


def estimate_css(activities: list) -> Optional[float]:
    """
    Critical Swim Speed (seconds per 100m).
    Requires best 400m and 200m times from swim activities.
    """
    swims = [
        a for a in activities
        if a.get("sport_type", a.get("type", "")) == "Swim"
        and a.get("distance", 0) > 0
    ]
    if not swims:
        return None

    best_400 = None
    best_200 = None

    for a in swims:
        dist = a.get("distance", 0)
        time = a.get("moving_time", 0)
        if not dist or not time:
            continue
        pace_per_100 = (time / dist) * 100

        if 350 <= dist <= 450:
            if best_400 is None or time < best_400[1]:
                best_400 = (dist, time, pace_per_100)
        elif 175 <= dist <= 225:
            if best_200 is None or time < best_200[1]:
                best_200 = (dist, time, pace_per_100)

    if best_400 and best_200:
        t400 = best_400[1] * (400 / best_400[0])
        t200 = best_200[1] * (200 / best_200[0])
        css = (400 - 200) / (t400 - t200)
        css_per_100 = 100 / css
        return round(css_per_100, 1)

    if swims:
        sorted_swims = sorted(swims, key=lambda x: x.get("distance", 0), reverse=True)
        for a in sorted_swims:
            dist = a.get("distance", 0)
            time = a.get("moving_time", 0)
            if dist >= 400 and time:
                return round((time / dist) * 100, 1)

    return None
