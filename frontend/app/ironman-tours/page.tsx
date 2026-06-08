"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getToken, getAthleteName, clearTokens,
  fetchPredictions, fetchFitness, fetchTrainingLoad, fetchIronmanCoach,
  Predictions, FitnessMetrics, TrainingLoad, IronmanCoachAnalysis
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
  const [loading, setLoading] = useState(true);
  const [athleteName, setAthleteName] = useState("");
  const countdown = useCountdown(RACE_DATE);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/"); return; }
    setAthleteName(getAthleteName());
    Promise.all([
      fetchPredictions(token),
      fetchFitness(token),
      fetchTrainingLoad(token),
      fetchIronmanCoach(token),
    ])
      .then(([p, f, l, c]) => { setPredictions(p); setFitness(f); setLoad(l); setCoach(c); })
      .catch(() => {})
      .finally(() => setLoading(false));
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
                        <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                          <p className="text-xs font-bold" style={{ color: "var(--swim)" }}>Predicție Ironman:</p>
                          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                            Realist: <strong style={{ color: "var(--text)" }}>{coach.swim.realistic?.time}</strong> ({coach.swim.realistic?.pace_100m}/100m)
                          </p>
                        </div>
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
                        <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                          <p className="text-xs font-bold" style={{ color: "var(--bike)" }}>Predicție Ironman:</p>
                          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                            Realist: <strong style={{ color: "var(--text)" }}>{coach.bike.realistic?.time}</strong> ({coach.bike.realistic?.avg_speed_kmh} km/h)
                          </p>
                        </div>
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
                        <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                          <p className="text-xs font-bold" style={{ color: "var(--run)" }}>Predicție maraton IM:</p>
                          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                            Realist: <strong style={{ color: "var(--text)" }}>{coach.run.realistic?.time}</strong> ({coach.run.realistic?.pace_per_km}/km)
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Factor oboseală: +18%</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{coach.run.note || "Date insuficiente"}</p>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* ── DATE STRAVA ANALIZATE ──────────────────────────────────────── */}
            {predictions?.activity_summary && (
              <Section title="Date Strava analizate" icon="📂">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {[
                    { label: "🏊 Sesiuni înot", val: predictions.activity_summary.swims, sub: `Cel mai lung: ${predictions.activity_summary.longest_swim_km} km` },
                    { label: "🚴 Ieșiri ciclism", val: predictions.activity_summary.rides, sub: `Cea mai lungă: ${predictions.activity_summary.longest_ride_km} km` },
                    { label: "🏃 Alergări", val: predictions.activity_summary.runs, sub: `Cea mai lungă: ${predictions.activity_summary.longest_run_km} km` },
                  ].map(({ label, val, sub }) => (
                    <div key={label} className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
                      <p className="text-2xl font-black" style={{ color: "var(--accent)" }}>{val}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{sub}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                  Total {predictions.activity_summary.total_activities} activități analizate · ultimele 6 luni
                </p>
              </Section>
            )}

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
