"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken, getStravaLoginUrl } from "@/lib/api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (getToken()) {
      router.replace("/octavian");
    }
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "var(--background)" }}>

      <div className="flex flex-col items-center gap-8 max-w-md text-center">
        {/* Logo / Name */}
        <div>
          <p className="text-sm font-semibold tracking-[0.3em] uppercase mb-2"
            style={{ color: "var(--text-muted)" }}>
            training intelligence
          </p>
          <h1 className="text-6xl font-black tracking-tight leading-none"
            style={{ color: "var(--text)" }}>
            OCTAVIAN
          </h1>
          <div className="h-1 w-full mt-2 rounded-full"
            style={{ background: "var(--accent)" }} />
        </div>

        {/* Tagline */}
        <p className="text-lg" style={{ color: "var(--text-muted)" }}>
          Analize avansate de antrenament triatlonist
          și predicții de cursă personalizate.
        </p>

        {/* Sport icons */}
        <div className="flex gap-8 text-4xl">
          <span title="Înot">🏊</span>
          <span title="Ciclism">🚴</span>
          <span title="Alergare">🏃</span>
        </div>

        {/* Strava Connect */}
        <a
          href={getStravaLoginUrl()}
          className="flex items-center gap-3 px-8 py-4 rounded-full font-bold text-base transition-all hover:scale-105 active:scale-95"
          style={{
            background: "#FC4C02",
            color: "white",
            textDecoration: "none",
            boxShadow: "0 0 30px rgba(252, 76, 2, 0.3)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          Conectează Strava
        </a>

        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Datele rămân private — aplicația nu stochează activitățile tale.
        </p>
      </div>
    </main>
  );
}
