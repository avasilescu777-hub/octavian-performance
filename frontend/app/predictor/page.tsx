"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getAthleteName, clearTokens, fetchPredictions, Predictions } from "@/lib/api";
import NavBar from "@/components/NavBar";

const TRIATHLON_DISTANCES = [
  "Sprint",
  "Olympic",
  "70.3 (Half Ironman)",
  "Ironman",
];

const RUN_DISTANCES = ["5K", "10K", "Half Marathon", "Marathon"];

function PredictionCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-1"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
        {title}
      </p>
      <p className="text-2xl font-black" style={{ color: "var(--accent)" }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}

function TriathlonCard({ name, data }: { name: string; data: { total: string; swim: string; bike: string; run: string; transitions: string } }) {
  const disciplineColors = {
    swim: "var(--swim)",
    bike: "var(--bike)",
    run: "var(--run)",
  };

  return (
    <div className="rounded-xl p-6 col-span-1"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-black text-lg" style={{ color: "var(--text)" }}>{name}</h3>
        <span className="text-2xl font-black" style={{ color: "var(--accent)" }}>{data.total}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {(["swim", "bike", "run"] as const).map((d) => (
          <div key={d} className="rounded-lg p-3 flex flex-col items-center"
            style={{ background: "var(--surface-2)" }}>
            <span style={{ color: disciplineColors[d] }} className="text-lg mb-1">
              {d === "swim" ? "🏊" : d === "bike" ? "🚴" : "🏃"}
            </span>
            <p className="font-bold text-sm">{data[d]}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-center" style={{ color: "var(--text-muted)" }}>
        + {data.transitions} tranziții
      </div>
    </div>
  );
}

export default function PredictorPage() {
  const router = useRouter();
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [athleteName, setAthleteName] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
      return;
    }
    setAthleteName(getAthleteName());
    fetchPredictions(token)
      .then(setPredictions)
      .catch(() => setError("Nu s-au putut calcula predicțiile."))
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = () => {
    clearTokens();
    router.replace("/");
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar athleteName={athleteName} onLogout={handleLogout} />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase mb-1"
            style={{ color: "var(--text-muted)" }}>
            bazat pe activitățile tale Strava
          </p>
          <h1 className="text-4xl font-black" style={{ color: "var(--text)" }}>
            PREDICȚII DE CURSĂ
          </h1>
          <div className="h-0.5 w-24 mt-2 rounded-full" style={{ background: "var(--accent)" }} />
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            <p style={{ color: "var(--text-muted)" }}>Se calculează predicțiile...</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl p-4 mb-6" style={{ background: "#2a1010", border: "1px solid #ef4444" }}>
            <p style={{ color: "#ef4444" }}>{error}</p>
          </div>
        )}

        {!loading && !error && predictions && (
          <>
            {/* Alergare */}
            <section className="mb-10">
              <h2 className="text-sm font-semibold tracking-widest uppercase mb-4 flex items-center gap-2"
                style={{ color: "var(--text-muted)" }}>
                <span style={{ color: "var(--run)" }}>🏃</span> Alergare
              </h2>
              {Object.keys(predictions.run).length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>
                  Nu sunt suficiente activități de alergare pentru predicții.
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {RUN_DISTANCES.map((d) => predictions.run[d] && (
                    <PredictionCard
                      key={d}
                      title={d}
                      value={predictions.run[d].time}
                      sub={`Pace: ${predictions.run[d].pace_per_km}/km`}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Triatlonuri */}
            <section className="mb-10">
              <h2 className="text-sm font-semibold tracking-widest uppercase mb-4"
                style={{ color: "var(--text-muted)" }}>
                🏊 🚴 🏃 Triatlonuri
              </h2>
              {Object.keys(predictions.triathlon).length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>
                  Adaugă activități din toate cele 3 discipline pentru predicții de triatlonuri.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {TRIATHLON_DISTANCES.map((d) => predictions.triathlon[d] && (
                    <TriathlonCard key={d} name={d} data={predictions.triathlon[d]} />
                  ))}
                </div>
              )}
            </section>

            {/* Disclaimer */}
            <div className="rounded-xl p-4 mt-6"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text)" }}>Metodologie:</strong>{" "}
                Alergare: formula Riegel (t₂ = t₁ × (d₂/d₁)^1.06) aplicată pe cel mai bun efort.
                Triatlonuri: combinare predicții individuale + 1-10 min tranziții.
                CSS (Critical Swim Speed): calculat din best 400m și 200m la înot.
                Aceste predicții sunt estimări pe baza antrenamentului actual — performanța reală variază.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
