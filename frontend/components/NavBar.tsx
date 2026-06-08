"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavBarProps {
  athleteName: string;
  onLogout: () => void;
}

export default function NavBar({ athleteName, onLogout }: NavBarProps) {
  const path = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b"
      style={{ background: "rgba(10, 10, 15, 0.9)", borderColor: "var(--border)", backdropFilter: "blur(12px)" }}>
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/octavian" className="font-black text-lg tracking-tight" style={{ color: "var(--text)", textDecoration: "none" }}>
            OCTAVIAN
            <span className="ml-1.5 text-xs font-semibold" style={{ color: "var(--accent)" }}>PERF</span>
          </Link>
          <div className="hidden md:flex gap-1">
            <NavLink href="/octavian" active={path === "/octavian"}>Dashboard</NavLink>
            <NavLink href="/predictor" active={path === "/predictor"}>Predicții</NavLink>
            <Link href="/ironman-tours"
              className="px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5"
              style={{
                color: path === "/ironman-tours" ? "#000" : "var(--accent)",
                background: path === "/ironman-tours" ? "var(--accent)" : "rgba(232,255,0,0.12)",
                border: "1px solid rgba(232,255,0,0.3)",
                textDecoration: "none",
              }}>
              🏁 Ironman Tours
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {athleteName && (
            <span className="text-sm hidden md:block" style={{ color: "var(--text-muted)" }}>
              {athleteName}
            </span>
          )}
          <button onClick={onLogout} className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            Deconectare
          </button>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href}
      className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
      style={{
        color: active ? "var(--accent)" : "var(--text-muted)",
        background: active ? "rgba(232, 255, 0, 0.08)" : "transparent",
        textDecoration: "none",
      }}>
      {children}
    </Link>
  );
}
