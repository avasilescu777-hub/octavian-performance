"""
CTL (Chronic Training Load) = fitness, 42-day EMA of daily TSS
ATL (Acute Training Load)  = fatigue, 7-day EMA of daily TSS
TSB (Training Stress Balance) = form = CTL - ATL
"""
import pandas as pd
import numpy as np
from datetime import datetime, timezone


SPORT_MAP = {
    "Run": "run",
    "Ride": "ride",
    "VirtualRide": "ride",
    "Swim": "swim",
    "Walk": "run",
    "TrailRun": "run",
}


def activity_tss(activity: dict) -> float:
    sport = activity.get("sport_type", activity.get("type", ""))
    moving_time = activity.get("moving_time", 0)
    hr_avg = activity.get("average_heartrate")
    watts_avg = activity.get("average_watts")
    hr_max = activity.get("max_heartrate")

    if sport in ("Ride", "VirtualRide") and watts_avg:
        ftp = 200
        intensity_factor = watts_avg / ftp
        tss = (moving_time * watts_avg * intensity_factor) / (ftp * 3600) * 100
        return round(tss, 1)

    if hr_avg and hr_max:
        hr_reserve_ratio = hr_avg / hr_max
        tss = (moving_time / 3600) * hr_reserve_ratio * 100
        return round(tss, 1)

    distance = activity.get("distance", 0)
    tss = (moving_time / 3600) * 50
    return round(tss, 1)


def compute_training_load(activities: list) -> dict:
    if not activities:
        return {"ctl": [], "atl": [], "tsb": [], "weekly_volume": {}}

    records = []
    for a in activities:
        date_str = a.get("start_date_local", a.get("start_date", ""))
        if not date_str:
            continue
        try:
            date = pd.to_datetime(date_str).date()
        except Exception:
            continue
        sport = SPORT_MAP.get(a.get("sport_type", a.get("type", "")), "other")
        tss = activity_tss(a)
        dist = a.get("distance", 0) / 1000
        time_h = a.get("moving_time", 0) / 3600
        records.append({"date": date, "sport": sport, "tss": tss, "distance_km": dist, "time_h": time_h})

    if not records:
        return {"ctl": [], "atl": [], "tsb": [], "weekly_volume": {}}

    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])

    daily = df.groupby("date")["tss"].sum().reset_index()
    date_range = pd.date_range(daily["date"].min(), pd.Timestamp.today(), freq="D")
    daily = daily.set_index("date").reindex(date_range, fill_value=0).reset_index()
    daily.columns = ["date", "tss"]

    ctl_alpha = 2 / (42 + 1)
    atl_alpha = 2 / (7 + 1)
    ctl_vals, atl_vals, tsb_vals = [], [], []
    ctl = 0.0
    atl = 0.0
    for tss in daily["tss"]:
        ctl = ctl + ctl_alpha * (tss - ctl)
        atl = atl + atl_alpha * (tss - atl)
        ctl_vals.append(round(ctl, 1))
        atl_vals.append(round(atl, 1))
        tsb_vals.append(round(ctl - atl, 1))

    timeline = [d.strftime("%Y-%m-%d") for d in daily["date"]]
    last_90 = -90

    weekly = df.copy()
    weekly["week"] = weekly["date"].dt.to_period("W").astype(str)
    weekly_vol = weekly.groupby(["week", "sport"]).agg(
        distance_km=("distance_km", "sum"),
        time_h=("time_h", "sum"),
        sessions=("tss", "count"),
    ).reset_index()

    weekly_dict = {}
    for _, row in weekly_vol.iterrows():
        w = str(row["week"])
        if w not in weekly_dict:
            weekly_dict[w] = {}
        weekly_dict[w][row["sport"]] = {
            "distance_km": round(row["distance_km"], 1),
            "time_h": round(row["time_h"], 2),
            "sessions": int(row["sessions"]),
        }

    return {
        "dates": timeline[last_90:],
        "ctl": ctl_vals[last_90:],
        "atl": atl_vals[last_90:],
        "tsb": tsb_vals[last_90:],
        "current_ctl": ctl_vals[-1] if ctl_vals else 0,
        "current_atl": atl_vals[-1] if atl_vals else 0,
        "current_tsb": tsb_vals[-1] if tsb_vals else 0,
        "weekly_volume": weekly_dict,
    }
