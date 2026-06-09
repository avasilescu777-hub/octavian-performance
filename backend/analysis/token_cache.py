# Server-side Strava token cache.
# Stores access + refresh tokens so the frontend never needs to re-authenticate.
# Persistence layers (in order of reliability):
#   1. In-memory dict (per process, fastest)
#   2. /tmp/strava_tokens.json (survives restarts, lost on deploy)
#   3. STRAVA_STORED_REFRESH env var (survives deploys -- set once via Railway CLI)

import os
import json
import time
import httpx

_CACHE_FILE = "/tmp/strava_tokens.json"

_cache = {
    "access_token": None,
    "refresh_token": os.getenv("STRAVA_STORED_REFRESH", ""),
    "expires_at": 0,
}


def _load_file():
    try:
        with open(_CACHE_FILE) as f:
            data = json.load(f)
            _cache.update(data)
    except Exception:
        pass


def _save_file():
    try:
        with open(_CACHE_FILE, "w") as f:
            json.dump(_cache, f)
    except Exception:
        pass


_load_file()


def store_tokens(access_token: str, refresh_token: str, expires_at: int = 0):
    _cache["access_token"] = access_token
    _cache["refresh_token"] = refresh_token
    _cache["expires_at"] = expires_at or int(time.time()) + 21600
    _save_file()


async def get_valid_token(client_token: str = None) -> str:
    """
    Return a valid Strava access token.
    Priority: client_token (if fresh) > cached token > refresh from stored refresh_token.
    """
    # Use whatever the client sent if it looks real
    if client_token and len(client_token) > 10:
        return client_token

    # Cached token still valid
    if _cache.get("access_token") and _cache.get("expires_at", 0) > time.time() + 60:
        return _cache["access_token"]

    # Auto-refresh using stored refresh token
    refresh = _cache.get("refresh_token") or os.getenv("STRAVA_STORED_REFRESH", "")
    if not refresh:
        return client_token or ""

    client_id     = os.getenv("STRAVA_CLIENT_ID")
    client_secret = os.getenv("STRAVA_CLIENT_SECRET")
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.post(
                "https://www.strava.com/oauth/token",
                data={
                    "client_id":     client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh,
                    "grant_type":    "refresh_token",
                },
            )
        if resp.status_code == 200:
            data = resp.json()
            store_tokens(
                data["access_token"],
                data.get("refresh_token", refresh),
                data.get("expires_at", 0),
            )
            return data["access_token"]
    except Exception:
        pass

    return client_token or ""


def has_stored_token() -> bool:
    has_refresh = bool(_cache.get("refresh_token") or os.getenv("STRAVA_STORED_REFRESH", ""))
    has_valid   = bool(_cache.get("access_token") and _cache.get("expires_at", 0) > time.time())
    return has_refresh or has_valid
