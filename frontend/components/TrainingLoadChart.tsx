"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TrainingLoad } from "@/lib/api";

interface Props { data: TrainingLoad }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg p-3 text-sm"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <p className="font-semibold mb-2" style={{ color: "var(--text-muted)" }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export default function TrainingLoadChart({ data }: Props) {
  const chartData = data.dates.map((d, i) => ({
    date: d.slice(5),
    CTL: data.ctl[i],
    ATL: data.atl[i],
    TSB: data.tsb[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="date" tick={{ fill: "#6b6b80", fontSize: 11 }}
          tickLine={false} axisLine={false} interval={14} />
        <YAxis tick={{ fill: "#6b6b80", fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#6b6b80" }} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
        <Line type="monotone" dataKey="CTL" stroke="#e8ff00" strokeWidth={2} dot={false} name="CTL (Fitness)" />
        <Line type="monotone" dataKey="ATL" stroke="#ff6b35" strokeWidth={2} dot={false} name="ATL (Oboseală)" />
        <Line type="monotone" dataKey="TSB" stroke="#4ecdc4" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="TSB (Formă)" />
      </LineChart>
    </ResponsiveContainer>
  );
}
