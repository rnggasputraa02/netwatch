"use client";
import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LivePoint } from "@/types";
export default function LiveChart({ points, kind, animate }: { points: LivePoint[]; kind: "rtt" | "loss"; animate: boolean }) {
  const data = useMemo(() => points.slice(-120).map((p) => ({ t: new Date(p.t).toLocaleTimeString("id-ID"), Gateway: kind === "rtt" ? p.gwRtt : p.gwLoss, Internet: kind === "rtt" ? p.inetRtt : p.inetLoss })), [points, kind]);
  const unit = kind === "rtt" ? "ms" : "%";
  return (
    <div style={{ width: "100%", height: 200 }} role="img" aria-label={kind === "rtt" ? "Grafik latency nyata" : "Grafik packet loss nyata"}>
      <ResponsiveContainer><LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1f2b45" strokeDasharray="3 3" /><XAxis dataKey="t" stroke="#8a9ab8" fontSize={11} minTickGap={40} />
        <YAxis stroke="#8a9ab8" fontSize={11} width={44} label={{ value: unit, angle: -90, position: "insideLeft", fill: "#8a9ab8", fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "#111a2e", border: "1px solid #1f2b45", borderRadius: 8 }} formatter={(v) => (typeof v === "number" ? `${v} ${unit}` : "tidak tersedia")} /><Legend />
        <Line type="monotone" dataKey="Gateway" stroke="#22e58b" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={animate} animationDuration={300} />
        <Line type="monotone" dataKey="Internet" stroke="#3b9cff" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={animate} animationDuration={300} /></LineChart></ResponsiveContainer>
    </div>
  );
}
