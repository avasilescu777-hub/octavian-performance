from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import httpx
import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from analysis.training_load import compute_training_load
from analysis.predictions import predict_races
from analysis.zones import compute_zones
from analysis.fitness import estimate_vo2max, estimate_ftp, estimate_css
from analysis.ironman_coach import full_ironman_analysis
from analysis.race_calibration import calibrate_from_race

load_dotenv()

app = FastAPI(title="Octavian Performance API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://octavian-performance.vercel.app",
        "https://octavian-performance-j42ysvmgp-pungescu-s-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STRAVA_CLIENT_ID = os.getenv("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET")
STRAVA_REDIRECT_URI = os.getenv("STRAVA_REDIRECT_URI", "http://localhost:8000/auth/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


@app.get("/")
def root():
    return {"app": "Octavian Performance", "status": "running"}


@app.get("/auth/login")
def strava_login():
    url = (
        f"https://www.strava.com/oauth/authorize"
        f"?client_id={STRAVA_CLIENT_ID}"
        f"&redirect_uri={STRAVA_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=read,activity:read_all"
    )
    return RedirectResponse(url)


@app.get("/auth/callback")
async def strava_callback(code: str = Query(...)):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Strava auth failed")

    data = resp.json()
    access_token = data["access_token"]
    refresh_token = data["refresh_token"]
    athlete = data["athlete"]

    redirect_url = (
        f"{FRONTEND_URL}/octavian"
        f"?access_token={access_token}"
        f"&refresh_token={refresh_token}"
        f"&athlete_id={athlete['id']}"
        f"&athlete_name={athlete['firstname']}+{athlete['lastname']}"
    )
    return RedirectResponse(redirect_url)


@app.get("/auth/refresh")
async def refresh_token(refresh_token: str = Query(...)):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Token refresh failed")
    return resp.json()


async def fetch_all_activities(access_token: str, per_page: int = 100, months: int = 0) -> list:
    """Fetch activities. If months > 0, only fetch activities from the last N months."""
    activities = []
    page = 1
    params: dict = {"per_page": per_page, "page": page}
    if months > 0:
        after_ts = int((datetime.now(timezone.utc) - timedelta(days=months * 30)).timestamp())
        params["after"] = after_ts

    async with httpx.AsyncClient() as client:
        while True:
            params["page"] = page
            resp = await client.get(
                "https://www.strava.com/api/v3/athlete/activities",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
            )
            if resp.status_code != 200:
                break
            batch = resp.json()
            if not batch:
                break
            activities.extend(batch)
            if len(batch) < per_page:
                break
            page += 1
    return activities


@app.get("/activities")
async def get_activities(access_token: str = Query(...)):
    activities = await fetch_all_activities(access_token)
    return {"count": len(activities), "activities": activities}


@app.get("/analysis/training-load")
async def get_training_load(access_token: str = Query(...)):
    # Training load needs full history for accurate CTL curve
    activities = await fetch_all_activities(access_token)
    result = compute_training_load(activities)
    return result


@app.get("/analysis/fitness")
async def get_fitness(access_token: str = Query(...)):
    activities = await fetch_all_activities(access_token, months=6)
    vo2max = estimate_vo2max(activities)
    ftp = estimate_ftp(activities)
    css = estimate_css(activities)
    return {
        "vo2max": vo2max,
        "ftp_watts": ftp,
        "css_per_100m": css,
    }


@app.get("/analysis/zones")
async def get_zones(
    access_token: str = Query(...),
    sport_type: str = Query("Run"),
):
    activities = await fetch_all_activities(access_token, months=6)
    zones = compute_zones(activities, sport_type)
    return zones


@app.get("/analysis/predictions")
async def get_predictions(access_token: str = Query(...)):
    activities = await fetch_all_activities(access_token, months=6)
    predictions = predict_races(activities)
    return predictions


@app.get("/analysis/ironman-coach")
async def get_ironman_coach(access_token: str = Query(...)):
    activities = await fetch_all_activities(access_token, months=6)
    return full_ironman_analysis(activities)


@app.get("/analysis/race-calibration")
async def get_race_calibration(
    access_token: str = Query(...),
    race_date: str = Query("2025-09-06"),
):
    # Need full history: pre-race training + race day + current period
    activities = await fetch_all_activities(access_token)
    return calibrate_from_race(activities, race_date)


@app.get("/athlete")
async def get_athlete(access_token: str = Query(...)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.strava.com/api/v3/athlete",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch athlete")
    return resp.json()
