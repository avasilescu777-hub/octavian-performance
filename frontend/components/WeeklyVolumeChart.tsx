"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

interface WeekData {
  distance_km: number;
  time_h: number;
  sessions: number;
}

interface Props {
  weeklyData: Record<string, Record<string, WeekData>>;
}

const SPORT_COLORS: Record<string, string> = {
  run: "#ff6b35",
  ride: "#4ecdc4",
  swim: "#45b7d1",
  other: "#6b6b80",
};

const SPORT_LABELS: Record<string, string> = {
  run: "Alergare",
  ride: "Ciclism",
  swim: "Înot",
  other: "Altele",
};

export default function WeeklyVolumeChart({ weeklyData }: Props) {
  const weeks = Object.keys(weeklyData).sort().slice(-12);
  const sports = Array.from(new Set(weeks.flatMap((w) => Object.keys(weeklyData[w]))));

  const chartData = weeks.map((week) => {
    const entry: Record<string, any> = { week: week.split("/")[0].slice(5) };
    for (const sport of sports) {
      entry[sport] = weeklyData[week]?.[sport]?.distance_km ?? 0;
    }
    return entry;
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg p-3 text-sm"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <p className="font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Săpt. {label}</p>
        {payload.map((p: any) => p.value > 0 && (
          <p key={p.dataKey} style={{ color: p.fill }}>
            {SPORT_LABELS[p.dataKey] || p.dataKey}: <strong>{p.value} km</strong>
          </p>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="week" tick={{ fill: "#6b6b80", fontSize: 11 }}
          tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#6b6b80", fontSize: 11 }} tickLine={false} axisLine={false}
          unit="km" />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#6b6b80" }}
          formatter={(val) => SPORT_LABELS[val] || val} />
        {sports.map((sport) => (
          <Bar key={sport} dataKey={sport} stackId="a"
            fill={SPORT_COLORS[sport] || "#6b6b80"} radius={[2, 2, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
