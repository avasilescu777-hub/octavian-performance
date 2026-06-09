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

async function refreshAccessToken(): Promise<string | null> {
  const refresh = typeof window !== "undefined" ? localStorage.getItem("strava_refresh_token") : null;
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh?refresh_token=${refresh}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem("strava_access_token", data.access_token);
      if (data.refresh_token) localStorage.setItem("strava_refresh_token", data.refresh_token);
      return data.access_token;
    }
  } catch { /* ignore */ }
  return null;
}

async function apiGet<T>(path: string, token?: string): Promise<T> {
  let t = token || getToken();
  if (!t) throw new Error("No access token");
  let res = await fetch(`${API_BASE}${path}?access_token=${t}`);
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      t = newToken;
      res = await fetch(`${API_BASE}${path}?access_token=${t}`);
    }
  }
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

// ─── Ironman Coach ────────────────────────────────────────────────────────────

export interface CoachScenario {
  swim: string; swim_pace: string;
  T1: string;
  bike: string; bike_speed: string;
  T2: string;
  run: string; run_pace: string;
  total: string; total_s: number;
}

export interface CoachSportAnalysis {
  available: boolean;
  note?: string;
  sessions_6m?: number;
  sessions_12w?: number;
  sessions_6w?: number;
  // swim
  total_distance_km?: number;
  weekly_avg_km?: number;
  longest_m?: number;
  avg_pace_100m?: string;
  css_pace_100m?: string;
  recent_6w_pace_100m?: string;
  trend?: string;
  // bike
  rides_6m?: number;
  long_rides_4h_plus?: number;
  very_long_rides_5h_plus?: number;
  longest_ride_km?: number;
  avg_speed_kmh_all?: number;
  avg_speed_kmh_long_rides?: number;
  ftp?: {
    ftp_watts?: number;
    target_im_watts_aggressive?: number;
    target_im_watts_realistic?: number;
    target_im_watts_conservative?: number;
  };
  aerobic_decoupling?: string;
  // run
  runs_6m?: number;
  long_runs_25km_plus?: number;
  marathon_distance_runs?: number;
  total_run_km?: number;
  weekly_run_avg_km?: number;
  avg_pace_km?: string;
  long_run_pace_km?: string;
  brick_pace_km?: string;
  vo2max_estimate?: number;
  longest_run_km?: number;
}

export interface CoachLoad {
  available: boolean;
  current_ctl?: number;
  current_atl?: number;
  current_tsb?: number;
  freshness?: string;
  consistency_pct?: number;
  active_days_12w?: number;
  weekly_load_history?: number[];
}

export interface IronmanCoachAnalysis {
  swim: CoachSportAnalysis;
  bike: CoachSportAnalysis;
  run: CoachSportAnalysis;
  load: CoachLoad;
  scenarios: {
    aggressive?: CoachScenario;
    realistic?: CoachScenario;
    conservative?: CoachScenario;
  };
  probabilities: {
    sub_12h_pct?: number;
    sub_11h30_pct?: number;
    sub_11h_pct?: number;
  };
  pacing: { tips: string[] };
  race_date: string;
  race_name: string;
}

export const fetchIronmanCoach = (token?: string) =>
  apiGet<IronmanCoachAnalysis>("/analysis/ironman-coach", token);

// ─── Lab Profile ──────────────────────────────────────────────────────────────

export interface LabZone {
  zone: string;
  hr_min?: number; hr_max?: number;
  watts_min?: number; watts_max?: number;
  pace?: string; pace_s_per_km?: number;
  kcal_burn?: number; kcal_intake?: number;
  duration?: string; note?: string;
}

export interface LabScenario {
  swim: string; swim_pace: string;
  T1: string;
  bike: string; bike_speed: string; bike_watts: string; bike_hr: string;
  T2: string;
  run: string; run_pace: string; run_label: string;
  total: string; total_s: number;
}

export interface LabProfile {
  lab_date: string; lab_location: string;
  bike_zones: LabZone[];
  run_zones: LabZone[];
  electrolytes: { sodium_mg_per_L: number; potassium_mg_per_L: number; sweat_rate_L_per_h: number };
  nutrition: { pre_race: string[]; T1: string[]; bike: string[]; T2: string[]; run: string[]; hydration: string[] };
  scenarios: { aggressive?: LabScenario; realistic?: LabScenario; conservative?: LabScenario };
  methodology: string;
}

export const fetchLabProfile = (token?: string) =>
  apiGet<LabProfile>("/analysis/lab-profile", token);

// ─── Race Calibration ─────────────────────────────────────────────────────────

export interface RaceSplit {
  swim: string; swim_pace: string; T1: string;
  bike: string; bike_speed: string; T2: string;
  run: string; run_pace: string;
  total: string; total_s: number;
}

export interface RaceCalibration {
  available: boolean;
  note?: string;
  race_date: string;
  race_activities_found?: number;
  pre_race_training?: { swim_pace_100m?: string; bike_speed_kmh?: number; run_pace_km?: string };
  race_day?: {
    swim_pace_100m?: string; swim_distance_m?: number;
    bike_speed_kmh?: number; bike_distance_km?: number;
    run_pace_km?: string;   run_distance_km?: number;
  };
  improvement?: { swim_pct?: number; bike_pct?: number; run_pct?: number; avg_pct?: number };
  current_training?: { swim_pace_100m?: string; bike_speed_kmh?: number; run_pace_km?: string };
  calibrated_paces?: { swim_pace_100m?: string; bike_speed_kmh?: number; run_pace_km?: string };
  ironman_standard?: RaceSplit;
  ironman_calibrated?: RaceSplit;
}

// ─── Weather ──────────────────────────────────────────────────────────────────

export interface WeatherForecast {
  race_date: string;
  location: string;
  temp_max: number;
  temp_min: number;
  wind_kmh: number;
  wind_dir: string;
  wind_dir_deg: number;
  gusts_kmh: number;
  precip_mm: number;
  condition: string;
  condition_label: string;
  bike_speed_penalty_kmh: number;
  run_heat_penalty_pct: number;
  bike_impact_note: string;
  run_impact_note: string;
  alert: string | null;
  source: string;
}

export const fetchWeather = (token?: string) =>
  apiGet<WeatherForecast>("/analysis/weather", token);

export const fetchRaceCalibration = (token?: string) => {
  const t = token || getToken();
  if (!t) throw new Error("No access token");
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return fetch(`${API_BASE}/analysis/race-calibration?access_token=${t}&race_date=2025-09-06`)
    .then(r => { if (!r.ok) throw new Error(`API error: ${r.status}`); return r.json() as Promise<RaceCalibration>; });
};
