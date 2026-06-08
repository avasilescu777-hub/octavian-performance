"""
Training zones distribution per sport type.
Run/Swim: HR zones (% of max HR)
Ride: Power zones (% of FTP)
"""
from collections import defaultdict
from analysis.fitness import estimate_ftp

HR_ZONES = [
    ("Z1 Recovery",   0,    0.60),
    ("Z2 Aerobic",    0.60, 0.70),
    ("Z3 Tempo",      0.70, 0.80),
    ("Z4 Threshold",  0.80, 0.90),
    ("Z5 VO2max",     0.90, 1.00),
    ("Z6 Anaerobic",  1.00, 9.99),
]

POWER_ZONES = [
    ("Z1 Active Recovery", 0,    0.55),
    ("Z2 Endurance",       0.55, 0.75),
    ("Z3 Tempo",           0.75, 0.87),
    ("Z4 Lactate",         0.87, 0.95),
    ("Z5 VO2max",          0.95, 1.05),
    ("Z6 Anaerobic",       1.05, 1.20),
    ("Z7 Neuromuscular",   1.20, 9.99),
]


def compute_zones(activities: list, sport_type: str = "Run") -> dict:
    sport_map = {
        "Run": ("Run", "TrailRun"),
        "Ride": ("Ride", "VirtualRide"),
        "Swim": ("Swim",),
    }
    target_types = sport_map.get(sport_type, (sport_type,))

    filtered = [
        a for a in activities
        if a.get("sport_type", a.get("type", "")) in target_types
    ]
    if not filtered:
        return {"zones": [], "sport": sport_type}

    zone_time = defaultdict(float)

    if sport_type == "Ride":
        ftp = estimate_ftp(activities) or 200
        for a in filtered:
            watts = a.get("average_watts")
            time = a.get("moving_time", 0)
            if not watts or not time:
                continue
            ratio = watts / ftp
            for name, lo, hi in POWER_ZONES:
                if lo <= ratio < hi:
                    zone_time[name] += time
                    break
    else:
        all_hr_max = [a.get("max_heartrate") for a in filtered if a.get("max_heartrate")]
        hr_max_ref = max(all_hr_max) if all_hr_max else 190

        for a in filtered:
            hr_avg = a.get("average_heartrate")
            hr_max = a.get("max_heartrate", hr_max_ref)
            time = a.get("moving_time", 0)
            if not hr_avg or not time:
                continue
            ratio = hr_avg / hr_max_ref
            for name, lo, hi in HR_ZONES:
                if lo <= ratio < hi:
                    zone_time[name] += time
                    break

    total_time = sum(zone_time.values())
    zones_list = []
    zone_defs = POWER_ZONES if sport_type == "Ride" else HR_ZONES
    for name, lo, hi in zone_defs:
        t = zone_time.get(name, 0)
        zones_list.append({
            "zone": name,
            "time_seconds": round(t),
            "time_hours": round(t / 3600, 2),
            "percentage": round((t / total_time * 100) if total_time else 0, 1),
        })

    return {
        "sport": sport_type,
        "total_time_hours": round(total_time / 3600, 2),
        "zones": zones_list,
    }
