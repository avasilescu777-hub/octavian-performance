"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getToken, getAthleteName, clearTokens,
  fetchPredictions, fetchFitness, fetchTrainingLoad, fetchIronmanCoach, fetchRaceCalibration, fetchLabProfile, fetchWeather,
  Predictions, FitnessMetrics, TrainingLoad, IronmanCoachAnalysis, RaceCalibration, LabProfile, WeatherForecast
} from "@/lib/api";
import NavBar from "@/components/NavBar";

const RACE_DATE = new Date("2026-06-14T07:00:00");

function fmt(seconds: number): string {
  const s = Math.round(Math.abs(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(target.getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => setDiff(target.getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  const total = Math.max(0, Math.floor(diff / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

interface SectionProps { title: string; icon: string; children: React.ReactNode; accent?: boolean }
function Section({ title, icon, children, accent }: SectionProps) {
  return (
    <div className="rounded-xl p-6 mb-5"
      style={{
        background: accent ? "rgba(232,255,0,0.04)" : "var(--surface)",
        border: `1px solid ${accent ? "rgba(232,255,0,0.25)" : "var(--border)"}`,
      }}>
      <h2 className="text-sm font-bold tracking-widest uppercase mb-5 flex items-center gap-2"
        style={{ color: accent ? "var(--accent)" : "var(--text-muted)" }}>
        <span>{icon}</span>{title}
      </h2>
      {children}
    </div>
  );
}

function Tip({ color, title, text }: { color: string; title: string; text: string }) {
  return (
    <div className="rounded-lg p-4 flex gap-3"
      style={{ background: "var(--surface-2)", borderLeft: `3px solid ${color}` }}>
      <div>
        <p className="font-bold text-sm mb-1" style={{ color }}>{title}</p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{text}</p>
      </div>
    </div>
  );
}

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3"
      style={{ borderBottom: "1px solid var(--border)" }}>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</p>
      <div className="text-right">
        <p className="font-bold" style={{ color: "var(--text)" }}>{value}</p>
        {sub && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{sub}</p>}
      </div>
    </div>
  );
}

function ProbBar({ label, pct }: { label: string; pct: number }) {
  const color = pct >= 60 ? "var(--accent)" : pct >= 30 ? "var(--bike)" : "var(--run)";
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: "var(--text-muted)" }}>{label}</span>
        <span style={{ color }} className="font-bold">{pct}%</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: "var(--surface-2)" }}>
        <div className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function ScenarioCard({
  label, sublabel, data, color, highlight
}: {
  label: string; sublabel: string;
  data?: { swim: string; swim_pace: string; bike: string; bike_speed: string; run: string; run_pace: string; total: string; T1: string; T2: string };
  color: string; highlight?: boolean;
}) {
  if (!data) return null;
  return (
    <div className="rounded-xl p-5"
      style={{
        background: highlight ? "rgba(232,255,0,0.06)" : "var(--surface-2)",
        border: `1px solid ${highlight ? "rgba(232,255,0,0.3)" : "var(--border)"}`,
      }}>
      <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color }}>{label}</p>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{sublabel}</p>
      <p className="text-4xl font-black mb-4" style={{ color: highlight ? "var(--accent)" : "var(--text)" }}>
        {data.total}
      </p>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span style={{ color: "var(--swim)" }}>🏊 Înot</span><span style={{ color: "var(--text)" }}>{data.swim} <span style={{ color: "var(--text-muted)" }}>({data.swim_pace}/100m)</span></span></div>
        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>T1</span><span style={{ color: "var(--text-muted)" }}>{data.T1}</span></div>
        <div className="flex justify-between"><span style={{ color: "var(--bike)" }}>🚴 Ciclism</span><span style={{ color: "var(--text)" }}>{data.bike} <span style={{ color: "var(--text-muted)" }}>({data.bike_speed})</span></span></div>
        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>T2</span><span style={{ color: "var(--text-muted)" }}>{data.T2}</span></div>
        <div className="flex justify-between"><span style={{ color: "var(--run)" }}>🏃 Maraton</span><span style={{ color: "var(--text)" }}>{data.run} <span style={{ color: "var(--text-muted)" }}>({data.run_pace}/km)</span></span></div>
      </div>
    </div>
  );
}

export default function IronmanToursPage() {
  const router = useRouter();
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [fitness, setFitness] = useState<FitnessMetrics | null>(null);
  const [load, setLoad] = useState<TrainingLoad | null>(null);
  const [coach, setCoach] = useState<IronmanCoachAnalysis | null>(null);
  const [calib, setCalib] = useState<RaceCalibration | null>(null);
  const [lab, setLab] = useState<LabProfile | null>(null);
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [athleteName, setAthleteName] = useState("");
  const countdown = useCountdown(RACE_DATE);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/"); return; }
    setAthleteName(getAthleteName());
    Promise.allSettled([
      fetchPredictions(token),
      fetchFitness(token),
      fetchTrainingLoad(token),
      fetchIronmanCoach(token),
      fetchRaceCalibration(token),
      fetchLabProfile(token),
      fetchWeather(token),
    ]).then(([p, f, l, c, rc, lb, wx]) => {
      if (p.status === "fulfilled") setPredictions(p.value);
      if (f.status === "fulfilled") setFitness(f.value);
      if (l.status === "fulfilled") setLoad(l.value);
      if (c.status === "fulfilled") setCoach(c.value);
      if (rc.status === "fulfilled") setCalib(rc.value);
      if (lb.status === "fulfilled") setLab(lb.value);
      if (wx.status === "fulfilled") setWeather(wx.value);
    }).finally(() => setLoading(false));
  }, [router]);

  const hasCoach = coach && Object.keys(coach.scenarios || {}).length > 0;

  const tsbStatus = load?.current_tsb ?? null;
  const tsbLabel = tsbStatus !== null
    ? tsbStatus > 10 ? { text: "Odihnit — formă excelentă pentru cursă", color: "#4ecdc4" }
      : tsbStatus > -5 ? { text: "Formă bună — ușor obosit, recuperare normală", color: "#e8ff00" }
      : { text: "Obosit — priorizează odihna în zilele rămase", color: "#ff6b35" }
    : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar athleteName={athleteName} onLogout={() => { clearTokens(); router.replace("/"); }} />

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-1"
            style={{ color: "var(--text-muted)" }}>14 iunie 2026</p>
          <h1 className="text-4xl font-black leading-tight" style={{ color: "var(--text)" }}>
            IRONMAN<br />
            <span style={{ color: "var(--accent)" }}>TOURS</span>
          </h1>
          <div className="h-0.5 w-24 mt-3 rounded-full" style={{ background: "var(--accent)" }} />
        </div>

        {/* Countdown */}
        <div className="rounded-xl p-6 mb-5 text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-4"
            style={{ color: "var(--text-muted)" }}>Timp rămas până la START</p>
          <div className="flex justify-center gap-6">
            {[
              { v: countdown.days, l: "zile" },
              { v: countdown.hours, l: "ore" },
              { v: countdown.minutes, l: "min" },
              { v: countdown.seconds, l: "sec" },
            ].map(({ v, l }) => (
              <div key={l} className="flex flex-col items-center">
                <span className="text-5xl font-black tabular-nums" style={{ color: "var(--accent)" }}>
                  {String(v).padStart(2, "0")}
                </span>
                <span className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            <p style={{ color: "var(--text-muted)" }}>Se calculează strategia de cursă...</p>
          </div>
        )}

        {!loading && (
          <>
            {/* ── METEO ZIUA CURSEI ────────────────────────────────────────── */}
            {weather && (
              <div className="rounded-xl p-4 mb-5"
                style={{ background: "var(--surface)", border: `2px solid ${weather.temp_max >= 30 ? "rgba(255,107,53,0.5)" : "var(--border)"}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--accent)" }}>
                      PROGNOZĂ METEO — 14 IUNIE 2026
                    </p>
                    <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{weather.condition} · {weather.location}</p>
                  </div>
                  <p className="text-xs text-right" style={{ color: "var(--text-muted)" }}>{weather.source}</p>
                </div>

                {/* Alert caniculă */}
                {weather.alert && (
                  <div className="rounded-lg px-4 py-2 mb-3 text-sm font-bold"
                    style={{ background: "rgba(255,107,53,0.15)", color: "#ff6b35", border: "1px solid rgba(255,107,53,0.3)" }}>
                    {weather.alert}
                  </div>
                )}

                {/* Metrici principale */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Temp. max", value: `${weather.temp_max}°C`, color: weather.temp_max >= 30 ? "#ff6b35" : "var(--accent)", icon: "🌡️" },
                    { label: "Temp. min", value: `${weather.temp_min}°C`, color: "var(--text)", icon: "🌅" },
                    { label: "Vânt max", value: `${weather.wind_kmh} km/h ${weather.wind_dir}`, color: weather.wind_kmh >= 20 ? "#ff6b35" : "var(--text)", icon: "💨" },
                    { label: "Rafale", value: `${weather.gusts_kmh} km/h`, color: weather.gusts_kmh >= 30 ? "#ff6b35" : "var(--text)", icon: "🌬️" },
                  ].map(({ label, value, color, icon }) => (
                    <div key={label} className="rounded-lg p-3 text-center" style={{ background: "var(--surface-2)" }}>
                      <p className="text-lg mb-0.5">{icon}</p>
                      <p className="text-sm font-black" style={{ color }}>{value}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
                    </div>
                  ))}
                </div>

                {/* Impact pe performanță */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs font-bold mb-1" style={{ color: "var(--bike)" }}>
                      🚴 Impact ciclism
                      {weather.bike_speed_penalty_kmh > 0
                        ? <span style={{ color: "#ff6b35" }}> −{weather.bike_speed_penalty_kmh} km/h</span>
                        : <span style={{ color: "#4ecdc4" }}> neglijabil</span>}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{weather.bike_impact_note}</p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs font-bold mb-1" style={{ color: "var(--run)" }}>
                      🏃 Impact alergare
                      {weather.run_heat_penalty_pct > 0
                        ? <span style={{ color: "#ff6b35" }}> −{weather.run_heat_penalty_pct}% viteză</span>
                        : <span style={{ color: "#4ecdc4" }}> neglijabil</span>}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{weather.run_impact_note}</p>
                  </div>
                </div>

                {/* Predicție ajustată meteo */}
                {lab && (weather.bike_speed_penalty_kmh > 0 || weather.run_heat_penalty_pct > 0) && (() => {
                  const r = lab.scenarios.realistic;
                  if (!r) return null;
                  const bikeKmh = parseFloat(r.bike_speed) - weather.bike_speed_penalty_kmh;
                  const bikeS = 180000 / (bikeKmh / 3.6);
                  const runPaceS = parseFloat(r.run_pace.replace(":", "")) * 60 / 100 * (1 + weather.run_heat_penalty_pct / 100);
                  // run_pace is mm:ss format, parse properly
                  const [rm, rs] = r.run_pace.split(":").map(Number);
                  const runPaceSKm = (rm * 60 + rs) * (1 + weather.run_heat_penalty_pct / 100);
                  const runS = 42195 * runPaceSKm / 1000;
                  const swimS = r.total_s - (parseFloat(r.bike.split(":")[0]) * 3600 + parseFloat(r.bike.split(":")[1] || "0") * 60) - (parseFloat(r.run.split(":")[0]) * 3600 + parseFloat(r.run.split(":")[1] || "0") * 60) - 780;
                  const totalS = Math.max(swimS, 0) + 480 + bikeS + 300 + runS;
                  const fmtT = (s: number) => { const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return `${h}:${String(m).padStart(2,"0")}`; };
                  return (
                    <div className="mt-3 rounded-lg p-3" style={{ background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.25)" }}>
                      <p className="text-xs font-bold mb-2" style={{ color: "#ff6b35" }}>🌡️ Predicție ajustată pentru condițiile meteo (scenariu realist)</p>
                      <div className="flex gap-6 flex-wrap text-xs">
                        <span style={{ color: "var(--bike)" }}>🚴 {fmtT(bikeS)} · {bikeKmh.toFixed(1)} km/h</span>
                        <span style={{ color: "var(--run)" }}>🏃 {fmtT(runS)} · {fmtT(runPaceSKm)}/km</span>
                        <span className="font-black" style={{ color: "#ff6b35" }}>TOTAL: {fmtT(totalS)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── TEST LAB — PREDICȚIE PRIMARĂ ─────────────────────────────── */}
            {lab && (
              <>
                {/* Poze lab */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
                  {["/lab/bike1.jpg","/lab/bike2.jpg","/lab/run1.jpg","/lab/run2.jpg"].map((src, i) => (
                    <div key={i} className="rounded-xl overflow-hidden aspect-square bg-neutral-900"
                      style={{ border: "1px solid var(--border)" }}>
                      <img src={src} alt={`Lab test ${i+1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  ))}
                </div>

                {/* Header lab */}
                <div className="rounded-xl p-5 mb-5"
                  style={{ background: "var(--surface)", border: "1px solid rgba(232,255,0,0.2)" }}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "var(--accent)" }}>
                        TEST METABOLIC OFICIAL
                      </p>
                      <p className="text-lg font-black mt-0.5" style={{ color: "var(--text)" }}>
                        Unstoppable Performance Lab
                      </p>
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{lab.lab_date} · COSMED · Bicicletă + Bandă</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Transpirație</p>
                      <p className="font-black" style={{ color: "var(--accent)" }}>{lab.electrolytes.sweat_rate_L_per_h} L/h</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Na: {lab.electrolytes.sodium_mg_per_L} mg/L · K: {lab.electrolytes.potassium_mg_per_L} mg/L
                      </p>
                    </div>
                  </div>

                  {/* Zone bike + run */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Bike zones */}
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "var(--bike)" }}>🚴 Zone Ciclism</p>
                      <div className="space-y-1">
                        {lab.bike_zones.filter(z => z.hr_min).map(z => (
                          <div key={z.zone} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                            style={{ background: z.zone === "Z1" ? "rgba(232,255,0,0.08)" : "var(--surface-2)",
                                     border: z.zone === "Z1" ? "1px solid rgba(232,255,0,0.2)" : "none" }}>
                            <span className="font-bold w-6" style={{ color: z.zone === "Z1" ? "var(--accent)" : "var(--text-muted)" }}>{z.zone}</span>
                            <span style={{ color: "var(--text)" }}>{z.hr_min}–{z.hr_max} bpm</span>
                            <span style={{ color: "var(--bike)" }}>{z.watts_min}–{z.watts_max}W</span>
                            <span style={{ color: "var(--text-muted)" }}>{z.kcal_intake} kcal/h</span>
                            <span className="hidden md:inline" style={{ color: "var(--text-muted)" }}>{z.duration}</span>
                            {z.zone === "Z1" && <span className="font-bold" style={{ color: "var(--accent)" }}>← IM</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Run zones */}
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "var(--run)" }}>🏃 Zone Alergare</p>
                      <div className="space-y-1">
                        {lab.run_zones.filter(z => z.hr_min).map(z => (
                          <div key={z.zone} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                            style={{ background: z.zone === "Z1" ? "rgba(232,255,0,0.08)" : "var(--surface-2)",
                                     border: z.zone === "Z1" ? "1px solid rgba(232,255,0,0.2)" : "none" }}>
                            <span className="font-bold w-6" style={{ color: z.zone === "Z1" ? "var(--accent)" : "var(--text-muted)" }}>{z.zone}</span>
                            <span style={{ color: "var(--text)" }}>{z.hr_min}–{z.hr_max} bpm</span>
                            <span style={{ color: "var(--run)" }}>{z.pace}/km</span>
                            <span style={{ color: "var(--text-muted)" }}>{z.kcal_intake} kcal/h</span>
                            <span className="hidden md:inline" style={{ color: "var(--text-muted)" }}>{z.duration}</span>
                            {z.zone === "Z1" && <span className="font-bold" style={{ color: "var(--accent)" }}>← IM</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Predicție lab — 3 scenarii */}
                <div className="rounded-xl p-6 mb-5"
                  style={{ background: "rgba(232,255,0,0.04)", border: "2px solid rgba(232,255,0,0.3)" }}>
                  <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: "var(--accent)" }}>
                    PREDICȚIE IRONMAN TOURS — BAZATĂ PE TEST LAB
                  </p>
                  <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>{lab.methodology}</p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {(["conservative","realistic","aggressive"] as const).map((key) => {
                      const s = lab.scenarios[key];
                      if (!s) return null;
                      const labels = { conservative: "C — Zi dificilă", realistic: "B — Realist", aggressive: "A — Zi perfectă" };
                      const colors = { conservative: "var(--run)", realistic: "var(--bike)", aggressive: "var(--accent)" };
                      const isMain = key === "realistic";
                      return (
                        <div key={key} className="rounded-xl p-4"
                          style={{ background: isMain ? "rgba(232,255,0,0.07)" : "var(--surface-2)",
                                   border: `1px solid ${isMain ? "rgba(232,255,0,0.3)" : "var(--border)"}` }}>
                          <p className="text-xs font-bold mb-1" style={{ color: colors[key] }}>{labels[key]}</p>
                          <p className="text-3xl font-black mb-3" style={{ color: isMain ? "var(--accent)" : "var(--text)" }}>{s.total}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between"><span style={{ color: "var(--swim)" }}>🏊 Înot</span><span style={{ color: "var(--text)" }}>{s.swim}</span></div>
                            <div className="flex justify-between"><span style={{ color: "var(--bike)" }}>🚴 Ciclism</span><span style={{ color: "var(--text)" }}>{s.bike} <span style={{ color: "var(--text-muted)" }}>· {s.bike_speed} · {s.bike_watts}</span></span></div>
                            <div className="flex justify-between"><span style={{ color: "var(--run)" }}>🏃 Maraton</span><span style={{ color: "var(--text)" }}>{s.run} <span style={{ color: "var(--text-muted)" }}>· {s.run_pace}/km</span></span></div>
                            <div className="mt-2 pt-2 text-xs italic" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
                              Bike: {s.bike_hr} · Run: {s.run_label}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                    Înotul folosește media din Strava · Ciclismul și alergarea din zonele testate azi în laborator
                  </p>
                </div>

                {/* Nutriție personalizată */}
                <Section title="Plan Nutriție Personalizat — Lab 9 Iunie" icon="🧪">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {[
                      { label: "🏊 Pre-cursă + Înot", items: [...lab.nutrition.pre_race, ...lab.nutrition.T1], color: "var(--swim)" },
                      { label: "🚴 Ciclism 180km", items: lab.nutrition.bike, color: "var(--bike)" },
                      { label: "🏃 Alergare 42km", items: [...lab.nutrition.run, ...lab.nutrition.T2], color: "var(--run)" },
                    ].map(({ label, items, color }) => (
                      <div key={label} className="rounded-lg p-4" style={{ background: "var(--surface-2)" }}>
                        <p className="font-bold text-sm mb-3" style={{ color }}>{label}</p>
                        <ul className="space-y-1.5">
                          {items.map((item, i) => (
                            <li key={i} className="text-xs flex gap-2" style={{ color: "var(--text-muted)" }}>
                              <span style={{ color }}>›</span>{item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid rgba(232,255,0,0.15)" }}>
                    <p className="text-xs font-bold mb-2" style={{ color: "var(--accent)" }}>💧 Hidratare personalizată</p>
                    {lab.nutrition.hydration.map((h, i) => (
                      <p key={i} className="text-xs" style={{ color: "var(--text-muted)" }}>› {h}</p>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {/* ── PREDICȚIE IRONMAN — CARD PRINCIPAL ────────────────────────── */}
            {(() => {
              const r = coach?.scenarios?.realistic;
              const im = predictions?.triathlon?.["Ironman"];
              if (!r && !im) return null;
              const swim     = r?.swim     ?? im?.swim     ?? "—";
              const swimPace = r?.swim_pace ?? im?.swim_pace_100m ?? null;
              const bike     = r?.bike     ?? im?.bike     ?? "—";
              const bikeSpd  = r?.bike_speed ?? (im?.bike_speed_kmh ? `${im.bike_speed_kmh} km/h` : null);
              const run      = r?.run      ?? im?.run      ?? "—";
              const runPace  = r?.run_pace  ?? im?.run_pace_km ?? null;
              const total    = r?.total    ?? im?.total    ?? "—";
              const t1       = r?.T1 ?? "8:00";
              const t2       = r?.T2 ?? "5:00";
              return (
                <div className="rounded-xl p-6 mb-5"
                  style={{ background: "var(--surface)", border: "2px solid rgba(232,255,0,0.3)" }}>
                  <p className="text-xs font-bold tracking-widest uppercase mb-4"
                    style={{ color: "var(--text-muted)" }}>Predicție Ironman Tours · Scenariu realist</p>

                  {/* Total */}
                  <div className="text-center mb-6">
                    <p className="text-xs font-semibold tracking-widest uppercase mb-1"
                      style={{ color: "var(--text-muted)" }}>TIMP TOTAL ESTIMAT</p>
                    <p className="text-6xl font-black" style={{ color: "var(--accent)" }}>{total}</p>
                  </div>

                  {/* Split-uri */}
                  <div className="space-y-0">
                    {[
                      { emoji: "🏊", label: "Înot 3.8 km", time: swim, sub: swimPace ? `${swimPace}/100m · +6% apă liberă` : null, color: "var(--swim)" },
                      { emoji: "↔", label: "T1", time: t1, sub: null, color: "var(--text-muted)" },
                      { emoji: "🚴", label: "Ciclism 180 km", time: bike, sub: bikeSpd ?? null, color: "var(--bike)" },
                      { emoji: "↔", label: "T2", time: t2, sub: null, color: "var(--text-muted)" },
                      { emoji: "🏃", label: "Maraton 42.2 km", time: run, sub: runPace ? `${runPace}/km · +18% factor oboseală` : null, color: "var(--run)" },
                    ].map(({ emoji, label, time, sub, color }) => (
                      <div key={label} className="flex items-center justify-between py-3"
                        style={{ borderBottom: "1px solid var(--border)" }}>
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-center" style={{ color }}>{emoji}</span>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{label}</p>
                            {sub && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{sub}</p>}
                          </div>
                        </div>
                        <p className="text-xl font-black tabular-nums" style={{ color }}>{time}</p>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-center mt-4" style={{ color: "var(--text-muted)" }}>
                    bazat pe antrenamentele tale reale din Strava · ultimele 6 luni
                  </p>
                </div>
              );
            })()}

            {/* ── CALIBRARE DIN CURSA 6 SEPT 2025 ─────────────────────────── */}
            {calib && calib.available && (
              <Section title="Calibrare din Cursa 6 Sept 2025" icon="📐" accent>
                {/* Comparativ antrenament vs cursă */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {(["swim","bike","run"] as const).map((sport) => {
                    const labels = { swim: "🏊 Înot", bike: "🚴 Ciclism", run: "🏃 Alergare" };
                    const colors = { swim: "var(--swim)", bike: "var(--bike)", run: "var(--run)" };
                    const trainVal = sport === "swim" ? calib.pre_race_training?.swim_pace_100m
                      : sport === "bike" ? calib.pre_race_training?.bike_speed_kmh?.toString()
                      : calib.pre_race_training?.run_pace_km;
                    const raceVal = sport === "swim" ? calib.race_day?.swim_pace_100m
                      : sport === "bike" ? calib.race_day?.bike_speed_kmh?.toString()
                      : calib.race_day?.run_pace_km;
                    const raceDist = sport === "swim" ? (calib.race_day?.swim_distance_m ? `${calib.race_day.swim_distance_m}m` : null)
                      : sport === "bike" ? (calib.race_day?.bike_distance_km ? `${calib.race_day.bike_distance_km}km` : null)
                      : (calib.race_day?.run_distance_km ? `${calib.race_day.run_distance_km}km` : null);
                    const imprPct = sport === "swim" ? calib.improvement?.swim_pct
                      : sport === "bike" ? calib.improvement?.bike_pct
                      : calib.improvement?.run_pct;
                    const unit = sport === "bike" ? " km/h" : sport === "swim" ? "/100m" : "/km";
                    if (!trainVal && !raceVal) return null;
                    return (
                      <div key={sport} className="rounded-lg p-4" style={{ background: "var(--surface-2)", borderTop: `3px solid ${colors[sport]}` }}>
                        <p className="text-xs font-bold mb-3" style={{ color: colors[sport] }}>{labels[sport]}</p>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span style={{ color: "var(--text-muted)" }}>Antrenament</span>
                            <span style={{ color: "var(--text)" }}>{trainVal ?? "—"}{unit}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--text-muted)" }}>Cursă{raceDist ? ` (${raceDist})` : ""}</span>
                            <span style={{ color: colors[sport] }}>{raceVal ?? "—"}{unit}</span>
                          </div>
                          {imprPct !== undefined && imprPct !== null && (
                            <div className="mt-2 pt-2 text-center" style={{ borderTop: "1px solid var(--border)" }}>
                              <span className="text-base font-black" style={{ color: imprPct > 0 ? "#4ecdc4" : "#ff6b35" }}>
                                {imprPct > 0 ? "+" : ""}{imprPct.toFixed(1)}%
                              </span>
                              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                {imprPct > 0 ? "mai bun în cursă" : "mai slab în cursă"}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Paces actuale → calibrate */}
                {calib.calibrated_paces && (
                  <div className="rounded-lg p-4 mb-5" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "var(--text-muted)" }}>
                      Ritmuri actuale → calibrate cu factorul din 2025
                    </p>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      {[
                        { label: "🏊 Înot", cur: calib.current_training?.swim_pace_100m, cal: calib.calibrated_paces?.swim_pace_100m, unit: "/100m", color: "var(--swim)" },
                        { label: "🚴 Ciclism", cur: calib.current_training?.bike_speed_kmh?.toString(), cal: calib.calibrated_paces?.bike_speed_kmh?.toString(), unit: " km/h", color: "var(--bike)" },
                        { label: "🏃 Alergare", cur: calib.current_training?.run_pace_km, cal: calib.calibrated_paces?.run_pace_km, unit: "/km", color: "var(--run)" },
                      ].map(({ label, cur, cal, unit, color }) => (
                        <div key={label} className="text-center">
                          <p className="font-bold mb-2" style={{ color }}>{label}</p>
                          <p style={{ color: "var(--text-muted)" }}>Acum: <span style={{ color: "var(--text)" }}>{cur ?? "—"}{unit}</span></p>
                          <p style={{ color: "var(--text-muted)" }}>Cursă: <span style={{ color: "var(--accent)" }}>{cal ?? "—"}{unit}</span></p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Predicție calibrată Ironman */}
                {calib.ironman_calibrated && (
                  <div className="rounded-xl p-5 text-center"
                    style={{ background: "rgba(232,255,0,0.06)", border: "1px solid rgba(232,255,0,0.3)" }}>
                    <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                      PREDICȚIE IRONMAN TOURS — CALIBRATĂ (+{calib.improvement?.avg_pct?.toFixed(1)}% factor cursă 2025)
                    </p>
                    <p className="text-5xl font-black mb-4" style={{ color: "var(--accent)" }}>
                      {calib.ironman_calibrated.total}
                    </p>
                    <div className="flex justify-center gap-6 text-sm">
                      <div><span style={{ color: "var(--swim)" }}>🏊</span> <span style={{ color: "var(--text)" }}>{calib.ironman_calibrated.swim}</span> <span style={{ color: "var(--text-muted)" }}>({calib.ironman_calibrated.swim_pace}/100m)</span></div>
                      <div><span style={{ color: "var(--bike)" }}>🚴</span> <span style={{ color: "var(--text)" }}>{calib.ironman_calibrated.bike}</span> <span style={{ color: "var(--text-muted)" }}>({calib.ironman_calibrated.bike_speed})</span></div>
                      <div><span style={{ color: "var(--run)" }}>🏃</span> <span style={{ color: "var(--text)" }}>{calib.ironman_calibrated.run}</span> <span style={{ color: "var(--text-muted)" }}>({calib.ironman_calibrated.run_pace}/km)</span></div>
                    </div>
                    {calib.ironman_standard && (
                      <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                        Față de predicția din antrenamente: <strong style={{ color: "var(--text)" }}>{calib.ironman_standard.total}</strong>
                        {" "}→ factorul de cursă îmbunătățește cu{" "}
                        <strong style={{ color: "#4ecdc4" }}>
                          {fmt(calib.ironman_standard.total_s - calib.ironman_calibrated.total_s)}
                        </strong>
                      </p>
                    )}
                  </div>
                )}

                {!calib.ironman_calibrated && (
                  <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>
                    {calib.note || `${calib.race_activities_found ?? 0} activități găsite pe ${calib.race_date}. Verifică că probele sunt înregistrate în Strava.`}
                  </p>
                )}
              </Section>
            )}

            {/* ── COACH: 3 SCENARII ─────────────────────────────────────────── */}
            {hasCoach && (
              <Section title="Analiză Coach — 3 Scenarii" icon="🎯" accent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <ScenarioCard
                    label="Scenariu C — Conservative" sublabel="Zi dificilă · finish garantat"
                    data={coach.scenarios.conservative} color="var(--run)"
                  />
                  <ScenarioCard
                    label="Scenariu B — Realistic" sublabel="Cel mai probabil · forma actuală"
                    data={coach.scenarios.realistic} color="var(--bike)" highlight
                  />
                  <ScenarioCard
                    label="Scenariu A — Aggressive" sublabel="Zi perfectă · totul merge"
                    data={coach.scenarios.aggressive} color="var(--accent)"
                  />
                </div>

                {/* Probabilități */}
                {coach.probabilities && (
                  <div className="rounded-lg p-4 mb-4" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs font-bold tracking-widest uppercase mb-4"
                      style={{ color: "var(--text-muted)" }}>Probabilități estimare</p>
                    {coach.probabilities.sub_12h_pct !== undefined && (
                      <ProbBar label="Sub 12 ore" pct={coach.probabilities.sub_12h_pct} />
                    )}
                    {coach.probabilities.sub_11h30_pct !== undefined && (
                      <ProbBar label="Sub 11:30" pct={coach.probabilities.sub_11h30_pct} />
                    )}
                    {coach.probabilities.sub_11h_pct !== undefined && (
                      <ProbBar label="Sub 11 ore" pct={coach.probabilities.sub_11h_pct} />
                    )}
                  </div>
                )}

                {/* Pacing tips */}
                {coach.pacing?.tips?.length > 0 && (
                  <div className="space-y-2">
                    {coach.pacing.tips.map((tip, i) => (
                      <div key={i} className="rounded-lg p-3 flex gap-2"
                        style={{ background: "var(--surface-2)" }}>
                        <span style={{ color: "var(--accent)" }}>›</span>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{tip}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {/* ── FORMA ACTUALĂ ──────────────────────────────────────────────── */}
            {(load || coach?.load) && (
              <Section title="Forma ta acum" icon="📊">
                {(() => {
                  const ctl = coach?.load?.current_ctl ?? load?.current_ctl;
                  const atl = coach?.load?.current_atl ?? load?.current_atl;
                  const tsb = coach?.load?.current_tsb ?? load?.current_tsb;
                  const freshness = coach?.load?.freshness;
                  const consistency = coach?.load?.consistency_pct;
                  const label = tsb !== undefined && tsb !== null
                    ? tsb > 10 ? { text: freshness || "Odihnit — formă excelentă", color: "#4ecdc4" }
                      : tsb > -5 ? { text: freshness || "Formă bună", color: "#e8ff00" }
                      : { text: freshness || "Obosit — priorizează odihna", color: "#ff6b35" }
                    : null;
                  return (
                    <>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>FITNESS (CTL)</p>
                          <p className="text-3xl font-black" style={{ color: "var(--accent)" }}>{ctl?.toFixed(0) ?? "—"}</p>
                        </div>
                        <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>OBOSEALĂ (ATL)</p>
                          <p className="text-3xl font-black" style={{ color: "var(--run)" }}>{atl?.toFixed(0) ?? "—"}</p>
                        </div>
                        <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>FORMĂ (TSB)</p>
                          <p className="text-3xl font-black" style={{ color: label?.color ?? "var(--text)" }}>{tsb?.toFixed(0) ?? "—"}</p>
                        </div>
                      </div>
                      {label && (
                        <p className="text-sm font-semibold rounded-lg px-4 py-3"
                          style={{ background: "var(--surface-2)", color: label.color }}>
                          {label.text}
                        </p>
                      )}
                      {consistency !== undefined && (
                        <p className="text-xs mt-3 text-center" style={{ color: "var(--text-muted)" }}>
                          Consistență ultimele 12 săptămâni: <strong style={{ color: "var(--text)" }}>{consistency}%</strong> din zile cu activitate
                        </p>
                      )}
                    </>
                  );
                })()}
              </Section>
            )}

            {/* ── ANALIZA PE SPORTURI ──────────────────────────────────────── */}
            {coach && (
              <Section title="Analiza Detaliată pe Discipline" icon="📈">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                  {/* Swim */}
                  <div className="rounded-lg p-4" style={{ background: "var(--surface-2)", borderTop: "3px solid var(--swim)" }}>
                    <p className="text-sm font-bold mb-3" style={{ color: "var(--swim)" }}>🏊 ÎNOT</p>
                    {coach.swim.available ? (
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Sesiuni 6 luni</span><span style={{ color: "var(--text)" }}>{coach.swim.sessions_6m}</span></div>
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Volum total</span><span style={{ color: "var(--text)" }}>{coach.swim.total_distance_km} km</span></div>
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Pace medie</span><span style={{ color: "var(--text)" }}>{coach.swim.avg_pace_100m}/100m</span></div>
                        {coach.swim.css_pace_100m && (
                          <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>CSS estimat</span><span style={{ color: "var(--swim)" }}>{coach.swim.css_pace_100m}/100m</span></div>
                        )}
                        {coach.swim.recent_6w_pace_100m && (
                          <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Ultimele 6 săpt</span><span style={{ color: "var(--text)" }}>{coach.swim.recent_6w_pace_100m}/100m</span></div>
                        )}
                        {coach.swim.trend && (
                          <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Trend</span><span style={{ color: "var(--swim)" }}>{coach.swim.trend}</span></div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{coach.swim.note || "Date insuficiente"}</p>
                    )}
                  </div>

                  {/* Bike */}
                  <div className="rounded-lg p-4" style={{ background: "var(--surface-2)", borderTop: "3px solid var(--bike)" }}>
                    <p className="text-sm font-bold mb-3" style={{ color: "var(--bike)" }}>🚴 CICLISM</p>
                    {coach.bike.available ? (
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Ieșiri 6 luni</span><span style={{ color: "var(--text)" }}>{coach.bike.rides_6m}</span></div>
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Ieșiri &gt;4h</span><span style={{ color: "var(--text)" }}>{coach.bike.long_rides_4h_plus}</span></div>
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Viteză medie</span><span style={{ color: "var(--text)" }}>{coach.bike.avg_speed_kmh_all} km/h</span></div>
                        {coach.bike.avg_speed_kmh_long_rides && (
                          <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Viteză ieșiri lungi</span><span style={{ color: "var(--bike)" }}>{coach.bike.avg_speed_kmh_long_rides} km/h</span></div>
                        )}
                        {coach.bike.ftp?.ftp_watts && (
                          <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>FTP estimat</span><span style={{ color: "var(--bike)" }}>{coach.bike.ftp.ftp_watts}W</span></div>
                        )}
                        {coach.bike.ftp?.target_im_watts_realistic && (
                          <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Putere IM realistă</span><span style={{ color: "var(--bike)" }}>{coach.bike.ftp.target_im_watts_realistic}W</span></div>
                        )}
                        {coach.bike.aerobic_decoupling && (
                          <p className="text-xs mt-2 italic leading-tight" style={{ color: "var(--text-muted)" }}>{coach.bike.aerobic_decoupling}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{coach.bike.note || "Date insuficiente"}</p>
                    )}
                  </div>

                  {/* Run */}
                  <div className="rounded-lg p-4" style={{ background: "var(--surface-2)", borderTop: "3px solid var(--run)" }}>
                    <p className="text-sm font-bold mb-3" style={{ color: "var(--run)" }}>🏃 ALERGARE</p>
                    {coach.run.available ? (
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Alergări 6 luni</span><span style={{ color: "var(--text)" }}>{coach.run.runs_6m}</span></div>
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Lungi &gt;25km</span><span style={{ color: "var(--text)" }}>{coach.run.long_runs_25km_plus}</span></div>
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Volum total</span><span style={{ color: "var(--text)" }}>{coach.run.total_run_km} km</span></div>
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Pace medie flat</span><span style={{ color: "var(--text)" }}>{coach.run.avg_pace_km}/km</span></div>
                        {coach.run.long_run_pace_km && (
                          <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Pace ieșiri lungi</span><span style={{ color: "var(--run)" }}>{coach.run.long_run_pace_km}/km</span></div>
                        )}
                        {coach.run.brick_pace_km && (
                          <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Pace brick</span><span style={{ color: "var(--accent)" }}>{coach.run.brick_pace_km}/km</span></div>
                        )}
                        {coach.run.vo2max_estimate && (
                          <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>VO2max estimat</span><span style={{ color: "var(--text)" }}>{coach.run.vo2max_estimate} ml/kg/min</span></div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{coach.run.note || "Date insuficiente"}</p>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* ── DATE STRAVA ANALIZATE ──────────────────────────────────────── */}
            {(() => {
              const s = predictions?.activity_summary;
              const sw = coach?.swim?.available ? coach.swim : null;
              const bk = coach?.bike?.available ? coach.bike : null;
              const rn = coach?.run?.available  ? coach.run  : null;
              if (!sw && !bk && !rn && !s) return null;

              const swimCount   = sw?.sessions_6m  ?? s?.swims   ?? 0;
              const bikeCount   = bk?.rides_6m      ?? s?.rides   ?? 0;
              const runCount    = rn?.runs_6m        ?? s?.runs    ?? 0;
              const swimLongest = sw?.longest_m ? `${(sw.longest_m / 1000).toFixed(2)} km` : s?.longest_swim_km ? `${s.longest_swim_km} km` : "—";
              const bikeLongest = bk?.longest_ride_km ? `${bk.longest_ride_km} km` : s?.longest_ride_km ? `${s.longest_ride_km} km` : "—";
              const runLongest  = rn?.longest_run_km  ? `${rn.longest_run_km} km`  : s?.longest_run_km  ? `${s.longest_run_km} km`  : "—";
              const total = s?.total_activities ?? (swimCount + bikeCount + runCount);

              return (
                <Section title="Date Strava analizate" icon="📂">
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {[
                      { label: "🏊 Sesiuni înot",   val: swimCount, sub: `Cel mai lung: ${swimLongest}` },
                      { label: "🚴 Ieșiri ciclism",  val: bikeCount, sub: `Cea mai lungă: ${bikeLongest}` },
                      { label: "🏃 Alergări",        val: runCount,  sub: `Cea mai lungă: ${runLongest}` },
                    ].map(({ label, val, sub }) => (
                      <div key={label} className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                        <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
                        <p className="text-2xl font-black" style={{ color: "var(--accent)" }}>{val}</p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{sub}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                    {total} activități analizate · ultimele 6 luni
                  </p>
                </Section>
              );
            })()}

            {/* ── STRATEGIE PACING ──────────────────────────────────────────── */}
            <Section title="Strategie de Pacing" icon="⚡">
              <div className="space-y-0">
                {coach?.scenarios?.realistic && (
                  <>
                    <MetricRow
                      label="🏊 Înot — pace target"
                      value={`${coach.scenarios.realistic.swim_pace}/100m`}
                      sub={`Total: ${coach.scenarios.realistic.swim} · ritm aerob, nu sprint`}
                    />
                    <MetricRow
                      label="🚴 Ciclism — viteză target"
                      value={coach.scenarios.realistic.bike_speed}
                      sub={`Total: ${coach.scenarios.realistic.bike} · ${coach.bike?.ftp?.target_im_watts_realistic ? `~${coach.bike.ftp.target_im_watts_realistic}W (73% FTP)` : "puls aerob stabil"}`}
                    />
                    <MetricRow
                      label="🏃 Maraton — pace target"
                      value={`${coach.scenarios.realistic.run_pace}/km`}
                      sub={`Total: ${coach.scenarios.realistic.run} · primii 10km conservator`}
                    />
                  </>
                )}
                {fitness?.ftp_watts && (
                  <MetricRow
                    label="FTP (power meter)"
                    value={`${fitness.ftp_watts}W`}
                    sub="Max 75% FTP pe ciclism pentru energie la alergare"
                  />
                )}
                {fitness?.vo2max && (
                  <MetricRow
                    label="VO2max estimat"
                    value={`${fitness.vo2max} ml/kg/min`}
                    sub="Menține pulsul sub 80% HRmax pe înot și ciclism"
                  />
                )}
              </div>
            </Section>

            {/* ── ZILELE RĂMASE ──────────────────────────────────────────────── */}
            <Section title="Zilele Rămase — Ce faci acum" icon="📅">
              <div className="space-y-3">
                <Tip color="var(--accent)" title="Azi — Luni 9 iunie"
                  text="Antrenament scurt de activare: 20 min bike easy + 15 min alergare ușoară. Fără intensitate. Verifică echipamentul: bicicletă, combinezon, pantofi." />
                <Tip color="var(--accent)" title="Marți–Miercuri"
                  text="Odihnă activă sau înot ușor 1.5–2km. Testează nutriția pe care o vei folosi la cursă — nu introduce nimic nou. Hidratare consistentă." />
                <Tip color="var(--bike)" title="Joi"
                  text="30 min bike cu 3×1min la intensitate cursă. Confirmare că bicicleta e setată corect, roțile pomplate, schimbătoarele funcționale." />
                <Tip color="var(--swim)" title="Vineri"
                  text="Înot ușor 1km pentru a te simți confortabil în apă. Prepară toate bagajele pentru cursă. Culcare devreme (22:00 cel târziu)." />
                <Tip color="var(--run)" title="Sâmbătă — Ziua înainte"
                  text="Fără antrenament. Tur de recogniție pe traseu dacă e posibil. Carbohidrați la masa de prânz și seara. Pregătește geanta T1 și T2. Somn 9+ ore." />
              </div>
            </Section>

            {/* ── ZIUA CURSEI ────────────────────────────────────────────────── */}
            <Section title="Ziua Cursei — Strategie" icon="🎯" accent>
              <div className="space-y-3">
                <Tip color="var(--text-muted)" title="Dimineața (−2h față de start)"
                  text="Micul dejun cu 2–3h înainte: ovăz, banane, pâine cu miere. 500–750ml apă. Nu mânca altceva decât ai testat în antrenamente." />
                <Tip color="var(--swim)" title="ÎNOT — Execuție"
                  text="Pornești în spatele valului de start pentru a evita aglomerația. Ritm aerob confortabil, nu sprint. Respirație controlată, stroke eficient. Nu conta pe split — contează energia conservată." />
                <Tip color="var(--bike)" title="CICLISM — Execuție"
                  text="Primele 20km mai lent decât simți că poți. Mănâncă la fiecare 20–25km (gel + solidă alternativ). Bea 500–750ml/oră. Evită vântul și drafting-ul. Dacă ai senzor putere: 70–75% FTP maxim." />
                <Tip color="var(--run)" title="MARATON — Execuție"
                  text="Primii 10km la pace conservativ — va părea ușor, asta e bine. Km 10–30: pace target constant. Km 30–42: tot ce a rămas în rezervă. Aleargă cu stomacul: cola + apă la ultimele stații." />
                <Tip color="var(--accent)" title="Mental — Regula 3 faze"
                  text="Ironman se câștigă mental la km 25–35 de alergare. Împarte cursa în 3 blocuri mentale: înot = încălzire, bike = croazieră, run = cursa adevărată. Când e greu, numără 100 de pași." />
              </div>
            </Section>

            {/* ── NUTRIȚIE ───────────────────────────────────────────────────── */}
            <Section title="Plan de Nutriție" icon="🍌">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    sport: "Înot", color: "var(--swim)", emoji: "🏊",
                    items: ["Fără nutriție în apă", "Apă la ieșire din apă (T1)", "Max 200–300 calorii înainte de start"]
                  },
                  {
                    sport: "Ciclism", color: "var(--bike)", emoji: "🚴",
                    items: ["~300–400 kcal/oră", "Gel la 30 min, bar la 60 min, gel la 90 min...", "500–750ml lichid/oră", "Electroliți (sodiu) la fiecare oră", "Evită nutriție solidă după km 120"]
                  },
                  {
                    sport: "Alergare", color: "var(--run)", emoji: "🏃",
                    items: ["~200–250 kcal/oră", "Gel la km 5, 10, 18, 25, 32", "Apă la fiecare stație", "Cola + sare după km 30", "Nu forța dacă stomacul protestează"]
                  }
                ].map(({ sport, color, emoji, items }) => (
                  <div key={sport} className="rounded-lg p-4" style={{ background: "var(--surface-2)" }}>
                    <p className="font-bold text-sm mb-3" style={{ color }}>{emoji} {sport}</p>
                    <ul className="space-y-1.5">
                      {items.map((item, i) => (
                        <li key={i} className="text-xs flex gap-2" style={{ color: "var(--text-muted)" }}>
                          <span style={{ color }}>›</span> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>

            {/* ── OBIECTIVE ──────────────────────────────────────────────────── */}
            <Section title="Obiective de Timp" icon="🏆">
              {hasCoach ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)", border: "1px solid rgba(232,255,0,0.3)" }}>
                    <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>OBIECTIV A — Zi perfectă</p>
                    <p className="text-2xl font-black" style={{ color: "var(--accent)" }}>{coach.scenarios.aggressive?.total ?? "—"}</p>
                  </div>
                  <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>OBIECTIV B — Realist</p>
                    <p className="text-2xl font-black" style={{ color: "var(--bike)" }}>{coach.scenarios.realistic?.total ?? "—"}</p>
                  </div>
                  <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>OBIECTIV C — Conservative</p>
                    <p className="text-2xl font-black" style={{ color: "var(--run)" }}>{coach.scenarios.conservative?.total ?? "—"}</p>
                  </div>
                </div>
              ) : (
                <p style={{ color: "var(--text-muted)" }}>
                  Conectează activități Strava din înot, ciclism și alergare pentru obiective personalizate.
                </p>
              )}
              <p className="text-xs mt-4 text-center" style={{ color: "var(--text-muted)" }}>
                Indiferent de scenariu: FINISH = victorie. Ironman Tours te așteaptă.
              </p>
            </Section>

          </>
        )}
      </main>
    </div>
  );
}
