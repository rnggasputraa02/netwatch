"use client";
import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BwPoint } from "@/types";
/** Throughput (Mbps). null = tidak tersedia → garis terputus, bukan nol. `which` memisahkan metrik komputer dan router. */
export default function BwChart({ points, which, animate }: { points: BwPoint[]; which: "pc" | "rt"; animate: boolean }) {
  const data = useMemo(() => points.slice(-120).map((p) => ({ t: new Date(p.t).toLocaleTimeString("id-ID"), Download: which === "pc" ? (p.pcRx === null ? null : +(p.pcRx / 1e6).toFixed(3)) : (p.rtRx === null ? null : +(p.rtRx / 1e6).toFixed(3)), Upload: which === "pc" ? (p.pcTx === null ? null : +(p.pcTx / 1e6).toFixed(3)) : (p.rtTx === null ? null : +(p.rtTx / 1e6).toFixed(3)) })), [points, which]);
  return (
    <div style={{ width: "100%", height: 200 }} role="img" aria-label={which === "pc" ? "Grafik throughput komputer ini" : "Grafik throughput WAN router"}>
      <ResponsiveContainer><LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1f2b45" strokeDasharray="3 3" /><XAxis dataKey="t" stroke="#8a9ab8" fontSize={11} minTickGap={40} /><YAxis stroke="#8a9ab8" fontSize={11} width={44} label={{ value: "Mbps", angle: -90, position: "insideLeft", fill: "#8a9ab8", fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "#111a2e", border: "1px solid #1f2b45", borderRadius: 8 }} formatter={(v) => (typeof v === "number" ? `${v} Mbps` : "tidak tersedia")} /><Legend />
        <Line type="monotone" dataKey="Download" stroke="#3b9cff" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={animate} animationDuration={300} />
        <Line type="monotone" dataKey="Upload" stroke="#22e58b" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={animate} animationDuration={300} /></LineChart></ResponsiveContainer>
    </div>
  );
}
