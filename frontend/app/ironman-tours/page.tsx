"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getAthleteName, clearTokens, fetchPredictions, fetchFitness, fetchTrainingLoad, Predictions, FitnessMetrics, TrainingLoad } from "@/lib/api";
import NavBar from "@/components/NavBar";

const RACE_DATE = new Date("2026-06-14T07:00:00");
const IRONMAN = { swim: 3800, bike: 180000, run: 42195 };

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(secsPerKm: number): string {
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
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

export default function IronmanToursPage() {
  const router = useRouter();
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [fitness, setFitness] = useState<FitnessMetrics | null>(null);
  const [load, setLoad] = useState<TrainingLoad | null>(null);
  const [loading, setLoading] = useState(true);
  const [athleteName, setAthleteName] = useState("");
  const countdown = useCountdown(RACE_DATE);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/"); return; }
    setAthleteName(getAthleteName());
    Promise.all([fetchPredictions(token), fetchFitness(token), fetchTrainingLoad(token)])
      .then(([p, f, l]) => { setPredictions(p); setFitness(f); setLoad(l); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const ironman = predictions?.triathlon?.["Ironman"];
  const swimPred = predictions?.swim?.["Ironman"];
  const bikePred = predictions?.bike?.["Ironman"];
  const runPred = predictions?.run?.["Marathon"];

  const swimPacePerKm = swimPred ? (swimPred.seconds / IRONMAN.swim) * 1000 : null;
  const bikeSpeedKmh = bikePred?.avg_speed_kmh ?? null;
  const runPacePerKm = runPred ? (runPred.seconds / 42.195) : null;

  // Conservative Ironman pacing: +8% swim, +5% bike, +10% run vs predicted
  const swimConservative = swimPred ? Math.round(swimPred.seconds * 1.08) : null;
  const bikeConservative = bikePred ? Math.round(bikePred.seconds * 1.05) : null;
  const runConservative = runPred ? Math.round(runPred.seconds * 1.10) : null;
  const totalConservative = (swimConservative && bikeConservative && runConservative)
    ? swimConservative + bikeConservative + runConservative + 600 : null;

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
            {/* Forma actuală */}
            {load && tsbLabel && (
              <Section title="Forma ta acum" icon="📊" accent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>FITNESS (CTL)</p>
                    <p className="text-3xl font-black" style={{ color: "var(--accent)" }}>{load.current_ctl.toFixed(0)}</p>
                  </div>
                  <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>OBOSEALĂ (ATL)</p>
                    <p className="text-3xl font-black" style={{ color: "var(--run)" }}>{load.current_atl.toFixed(0)}</p>
                  </div>
                  <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>FORMĂ (TSB)</p>
                    <p className="text-3xl font-black" style={{ color: tsbLabel.color }}>{load.current_tsb.toFixed(0)}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold rounded-lg px-4 py-3"
                  style={{ background: "var(--surface-2)", color: tsbLabel.color }}>
                  {tsbLabel.text}
                </p>
              </Section>
            )}

            {/* Predicție cursă */}
            <Section title="Predicție Ironman Tours" icon="🏁">
              {!ironman ? (
                <p style={{ color: "var(--text-muted)" }}>
                  Adaugă activități din cele 3 discipline pe Strava pentru predicție completă.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6 rounded-xl p-5"
                    style={{ background: "var(--surface-2)" }}>
                    <div>
                      <p className="text-xs font-semibold tracking-widest uppercase mb-1"
                        style={{ color: "var(--text-muted)" }}>TIMP TOTAL ESTIMAT</p>
                      <p className="text-5xl font-black" style={{ color: "var(--accent)" }}>{ironman.total}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>bazat pe cel mai bun efort Strava</p>
                    </div>
                    {totalConservative && (
                      <div className="text-right">
                        <p className="text-xs font-semibold tracking-widest uppercase mb-1"
                          style={{ color: "var(--text-muted)" }}>TARGET REALIST</p>
                        <p className="text-3xl font-black" style={{ color: "var(--bike)" }}>{formatTime(totalConservative)}</p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>cu pacing conservativ</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="rounded-lg p-4" style={{ background: "var(--surface-2)", borderTop: "3px solid var(--swim)" }}>
                      <p className="text-xs mb-2" style={{ color: "var(--swim)" }}>🏊 ÎNOT 3.8km</p>
                      <p className="text-2xl font-black" style={{ color: "var(--text)" }}>{ironman.swim}</p>
                      {swimPred && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{swimPred.pace_per_100m}/100m</p>}
                    </div>
                    <div className="rounded-lg p-4" style={{ background: "var(--surface-2)", borderTop: "3px solid var(--bike)" }}>
                      <p className="text-xs mb-2" style={{ color: "var(--bike)" }}>🚴 CICLISM 180km</p>
                      <p className="text-2xl font-black" style={{ color: "var(--text)" }}>{ironman.bike}</p>
                      {bikePred && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{bikePred.avg_speed_kmh} km/h</p>}
                    </div>
                    <div className="rounded-lg p-4" style={{ background: "var(--surface-2)", borderTop: "3px solid var(--run)" }}>
                      <p className="text-xs mb-2" style={{ color: "var(--run)" }}>🏃 MARATON 42.2km</p>
                      <p className="text-2xl font-black" style={{ color: "var(--text)" }}>{ironman.run}</p>
                      {runPred && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{runPred.pace_per_km}/km</p>}
                    </div>
                  </div>
                  <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                    + {ironman.transitions} tranziții (T1 + T2)
                  </p>
                </>
              )}
            </Section>

            {/* Strategie de pacing */}
            <Section title="Strategie de Pacing" icon="⚡">
              <div className="space-y-0">
                {swimPred && swimConservative && (
                  <MetricRow
                    label="🏊 Înot — pace target"
                    value={formatTime(Math.round(swimConservative / IRONMAN.swim * 100)) + "/100m"}
                    sub={`Total: ${formatTime(swimConservative)} • Ritmul tău aerob, nu sprint`}
                  />
                )}
                {bikePred && bikeConservative && bikeSpeedKmh && (
                  <MetricRow
                    label="🚴 Ciclism — viteză target"
                    value={`${Math.round(bikeSpeedKmh * 0.95)} km/h`}
                    sub={`Total: ${formatTime(bikeConservative)} • ~${fitness?.ftp_watts ? Math.round(fitness.ftp_watts * 0.72) + "W (72% FTP)" : "puls aerob stabil"}`}
                  />
                )}
                {runPred && runConservative && runPacePerKm && (
                  <MetricRow
                    label="🏃 Maraton — pace target"
                    value={formatPace(runPacePerKm * 1.10)}
                    sub={`Total: ${formatTime(runConservative)} • Primii 21km la pace stabil, ultimii 21km crești`}
                  />
                )}
                {fitness?.ftp_watts && (
                  <MetricRow
                    label="FTP tău estimat"
                    value={`${fitness.ftp_watts}W`}
                    sub="Pedalează la max 75% FTP pe ciclism pentru a păstra energie la alergare"
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

            {/* Sfaturi zilele rămase */}
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

            {/* Ziua cursei */}
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

            {/* Nutriție */}
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

            {/* Obiective */}
            <Section title="Obiective de Timp" icon="🏆">
              {ironman ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)", border: "1px solid rgba(232,255,0,0.3)" }}>
                    <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>OBIECTIV A</p>
                    <p className="text-2xl font-black" style={{ color: "var(--accent)" }}>{ironman.total}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Zi perfectă</p>
                  </div>
                  <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>OBIECTIV B</p>
                    <p className="text-2xl font-black" style={{ color: "var(--bike)" }}>
                      {totalConservative ? formatTime(totalConservative) : "—"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Pacing corect</p>
                  </div>
                  <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface-2)" }}>
                    <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>OBIECTIV C</p>
                    <p className="text-2xl font-black" style={{ color: "var(--run)" }}>
                      {totalConservative ? formatTime(Math.round(totalConservative * 1.08)) : "—"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Zi dificilă → finish</p>
                  </div>
                </div>
              ) : (
                <p style={{ color: "var(--text-muted)" }}>
                  Conectează activități Strava din înot, ciclism și alergare pentru a vedea obiective personalizate.
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
