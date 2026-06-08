"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ZoneData } from "@/lib/api";

const ZONE_COLORS = [
  "#4ecdc4",
  "#45b7d1",
  "#e8ff00",
  "#ff9f43",
  "#ff6b35",
  "#ef4444",
  "#a855f7",
];

export default function ZonesChart({ data }: { data: ZoneData }) {
  const chartData = data.zones.filter((z) => z.time_seconds > 0);

  if (chartData.length === 0) {
    return (
      <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>
        Nu sunt date de zone pentru disciplina selectată.
      </p>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div className="rounded-lg p-3 text-sm"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <p style={{ color: d.fill, fontWeight: 700 }}>{d.payload.zone}</p>
        <p style={{ color: "var(--text)" }}>{d.payload.time_hours}h ({d.value}%)</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
          <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: "#6b6b80", fontSize: 11 }}
            tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="zone" width={120} tick={{ fill: "#6b6b80", fontSize: 11 }}
            tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-right" style={{ color: "var(--text-muted)" }}>
        Total: {data.total_time_hours}h înregistrat
      </p>
    </div>
  );
}
