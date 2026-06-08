interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  description?: string;
  color?: string;
}

export default function StatCard({ label, value, unit, description, color = "var(--accent)" }: StatCardProps) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-1"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <p className="text-3xl font-black" style={{ color }}>{value}</p>
        {unit && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{unit}</p>}
      </div>
      {description && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>}
    </div>
  );
}
