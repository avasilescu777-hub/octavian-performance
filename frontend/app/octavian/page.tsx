"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  saveTokens, getToken, getAthleteName, clearTokens,
  fetchTrainingLoad, fetchFitness, fetchZones,
  TrainingLoad, FitnessMetrics, ZoneData,
} from "@/lib/api";
import TrainingLoadChart from "@/components/TrainingLoadChart";
import WeeklyVolumeChart from "@/components/WeeklyVolumeChart";
import ZonesChart from "@/components/ZonesChart";
import StatCard from "@/components/StatCard";
import NavBar from "@/components/NavBar";

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [athleteName, setAthleteName] = useState("");
  const [trainingLoad, setTrainingLoad] = useState<TrainingLoad | null>(null);
  const [fitness, setFitness] = useState<FitnessMetrics | null>(null);
  const [zones, setZones] = useState<ZoneData | null>(null);
  const [selectedSport, setSelectedSport] = useState<"Run" | "Ride" | "Swim">("Run");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("access_token");
    const urlRefresh = params.get("refresh_token");
    const urlAthleteId = params.get("athlete_id");
    const urlAthleteName = params.get("athlete_name");

    if (urlToken && urlRefresh && urlAthleteId) {
      saveTokens(urlToken, urlRefresh, urlAthleteId, urlAthleteName?.replace("+", " ") || "");
      window.history.replaceState({}, "", "/octavian");
      setToken(urlToken);
      setAthleteName(urlAthleteName?.replace("+", " ") || "");
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      fetch(`${API_BASE}/auth/save-token?access_token=${urlToken}&refresh_token=${urlRefresh}`)
        .catch(() => {});
    } else {
      const stored = getToken();
      const storedRefresh = typeof window !== "undefined" ? localStorage.getItem("strava_refresh_token") : null;
      setToken(stored || "");
      setAthleteName(getAthleteName());
      // Push stored token to backend on every load so any device benefits
      if (stored && storedRefresh) {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        fetch(`${API_BASE}/auth/save-token?access_token=${stored}&refresh_token=${storedRefresh}`)
          .catch(() => {});
      }
    }
  }, [router]);

  const loadData = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    const [tl, fit] = await Promise.allSettled([
      fetchTrainingLoad(t),
      fetchFitness(t),
    ]);
    if (tl.status === "fulfilled") setTrainingLoad(tl.value);
    if (fit.status === "fulfilled") setFitness(fit.value);
    if (tl.status === "rejected" && fit.status === "rejected")
      setError("data_error");
    setLoading(false);
  }, []);

  useEffect(() => {
    if (token === null) return;
    loadData(token);
  }, [token, loadData]);

  useEffect(() => {
    if (!token) return;
    fetchZones(selectedSport, token)
      .then(setZones)
      .catch(() => setZones(null));
  }, [token, selectedSport]);

  const handleLogout = () => {
    clearTokens();
    router.replace("/");
  };

  const tsbColor = (tsb: number) => {
    if (tsb > 10) return "#4ecdc4";
    if (tsb > -10) return "#e8ff00";
    if (tsb > -30) return "#ff6b35";
    return "#ef4444";
  };

  const tsbLabel = (tsb: number) => {
    if (tsb > 10) return "Odihnit";
    if (tsb > -10) return "Optim";
    if (tsb > -30) return "Obosit";
    return "Suprasolicitat";
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar athleteName={athleteName} onLogout={handleLogout} />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            <p style={{ color: "var(--text-muted)" }}>Se încarcă datele din Strava...</p>
          </div>
        )}

        {(!loading && !trainingLoad && !fitness) && (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>
              Conectează-te cu Strava pentru a vedea datele
            </p>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/login`}
              className="flex items-center gap-3 px-8 py-4 rounded-full font-bold text-base transition-all hover:scale-105"
              style={{ background: "#FC4C02", color: "white", textDecoration: "none" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              Conectează Strava
            </a>
          </div>
        )}

        {!loading && (trainingLoad || fitness) && (
          <>
            {/* Fitness Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Fitness (CTL)"
                value={trainingLoad?.current_ctl?.toFixed(0) ?? "—"}
                unit="TSS"
                description="Fitness aerob acumulat"
                color="var(--accent)"
              />
              <StatCard
                label="Oboseală (ATL)"
                value={trainingLoad?.current_atl?.toFixed(0) ?? "—"}
                unit="TSS"
                description="Stres acut din ultimele 7 zile"
                color="var(--run)"
              />
              <StatCard
                label="Formă (TSB)"
                value={trainingLoad?.current_tsb?.toFixed(0) ?? "—"}
                unit=""
                description={trainingLoad ? tsbLabel(trainingLoad.current_tsb) : ""}
                color={trainingLoad ? tsbColor(trainingLoad.current_tsb) : "var(--text-muted)"}
              />
              <StatCard
                label="VO2max"
                value={fitness?.vo2max?.toFixed(1) ?? "—"}
                unit="ml/kg/min"
                description="Estimat din activități"
                color="var(--swim)"
              />
            </div>

            {/* Second stats row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              <StatCard
                label="FTP Ciclism"
                value={fitness?.ftp_watts?.toString() ?? "—"}
                unit="W"
                description="Putere pragul funcțional"
                color="var(--bike)"
              />
              <StatCard
                label="CSS Înot"
                value={fitness?.css_per_100m?.toFixed(1) ?? "—"}
                unit="s/100m"
                description="Viteză critică înot"
                color="var(--swim)"
              />
              <div
                className="rounded-xl p-5 flex flex-col justify-between cursor-pointer hover:opacity-90 transition-opacity"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                onClick={() => router.push("/predictor")}
              >
                <p className="text-xs font-semibold tracking-widest uppercase mb-3"
                  style={{ color: "var(--text-muted)" }}>Predicții Curse</p>
                <p className="text-2xl font-black" style={{ color: "var(--accent)" }}>→</p>
                <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
                  Vezi predicții pentru 5K, HM, 70.3, Ironman
                </p>
              </div>
            </div>

            {/* Training Load Chart */}
            {trainingLoad && trainingLoad.dates.length > 0 && (
              <div className="rounded-xl p-6 mb-6"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold tracking-widest uppercase mb-6"
                  style={{ color: "var(--text-muted)" }}>
                  Fitness / Oboseală / Formă — 90 zile
                </h2>
                <TrainingLoadChart data={trainingLoad} />
              </div>
            )}

            {/* Weekly Volume */}
            {trainingLoad && Object.keys(trainingLoad.weekly_volume).length > 0 && (
              <div className="rounded-xl p-6 mb-6"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold tracking-widest uppercase mb-6"
                  style={{ color: "var(--text-muted)" }}>
                  Volum Săptămânal
                </h2>
                <WeeklyVolumeChart weeklyData={trainingLoad.weekly_volume} />
              </div>
            )}

            {/* Zones */}
            <div className="rounded-xl p-6"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-semibold tracking-widest uppercase"
                  style={{ color: "var(--text-muted)" }}>
                  Zone de Antrenament
                </h2>
                <div className="flex gap-2">
                  {(["Run", "Ride", "Swim"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSport(s)}
                      className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                      style={{
                        background: selectedSport === s ? "var(--accent)" : "var(--surface-2)",
                        color: selectedSport === s ? "#000" : "var(--text-muted)",
                        border: `1px solid ${selectedSport === s ? "var(--accent)" : "var(--border)"}`,
                      }}
                    >
                      {s === "Run" ? "🏃 Alergare" : s === "Ride" ? "🚴 Ciclism" : "🏊 Înot"}
                    </button>
                  ))}
                </div>
              </div>
              {zones && <ZonesChart data={zones} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

