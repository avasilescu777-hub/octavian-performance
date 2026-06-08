const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("strava_access_token");
}

export function saveTokens(accessToken: string, refreshToken: string, athleteId: string, athleteName: string) {
  localStorage.setItem("strava_access_token", accessToken);
  localStorage.setItem("strava_refresh_token", refreshToken);
  localStorage.setItem("athlete_id", athleteId);
  localStorage.setItem("athlete_name", athleteName);
}

export function clearTokens() {
  localStorage.removeItem("strava_access_token");
  localStorage.removeItem("strava_refresh_token");
  localStorage.removeItem("athlete_id");
  localStorage.removeItem("athlete_name");
}

export function getAthleteName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("athlete_name") || "Athlete";
}

async function apiGet<T>(path: string, token?: string): Promise<T> {
  const t = token || getToken();
  if (!t) throw new Error("No access token");
  const res = await fetch(`${API_BASE}${path}?access_token=${t}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface TrainingLoad {
  dates: string[];
  ctl: number[];
  atl: number[];
  tsb: number[];
  current_ctl: number;
  current_atl: number;
  current_tsb: number;
  weekly_volume: Record<string, Record<string, { distance_km: number; time_h: number; sessions: number }>>;
}

export interface FitnessMetrics {
  vo2max: number | null;
  ftp_watts: number | null;
  css_per_100m: number | null;
}

export interface ZoneData {
  sport: string;
  total_time_hours: number;
  zones: { zone: string; time_seconds: number; time_hours: number; percentage: number }[];
}

export interface RunPrediction {
  time: string;
  pace_per_km: string;
  seconds: number;
}

export interface TriathlonPrediction {
  total: string;
  total_seconds: number;
  swim: string;
  bike: string;
  run: string;
  transitions: string;
  swim_pace_100m?: string;
  bike_speed_kmh?: number;
  run_pace_km?: string;
  swim_method?: string;
  bike_method?: string;
  run_method?: string;
  run_fatigue_pct?: number;
}

export interface ActivitySummary {
  total_activities: number;
  runs: number;
  rides: number;
  swims: number;
  longest_run_km: number;
  longest_ride_km: number;
  longest_swim_km: number;
}

export interface Predictions {
  run: Record<string, RunPrediction>;
  triathlon: Record<string, TriathlonPrediction>;
  swim: Record<string, { time: string; pace_per_100m: string; seconds: number }>;
  bike: Record<string, { time: string; avg_speed_kmh: number; seconds: number }>;
  activity_summary?: ActivitySummary;
}

export const fetchTrainingLoad = (token?: string) =>
  apiGet<TrainingLoad>("/analysis/training-load", token);

export const fetchFitness = (token?: string) =>
  apiGet<FitnessMetrics>("/analysis/fitness", token);

export const fetchZones = (sport: string, token?: string) =>
  apiGet<ZoneData>(`/analysis/zones?sport_type=${sport}`, token);

export const fetchPredictions = (token?: string) =>
  apiGet<Predictions>("/analysis/predictions", token);

export const fetchActivities = (token?: string) =>
  apiGet<{ count: number; activities: object[] }>("/activities", token);

export const getStravaLoginUrl = () => `${API_BASE}/auth/login`;
