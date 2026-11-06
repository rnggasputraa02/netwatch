"use client";
import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { series } from "@/lib/simulation";
type Props = { range: number; now: number; animate: boolean; total?: boolean; height?: number };
export default function TrafficChart({ range, now, animate, total = false, height = 240 }: Props) {
  const data = useMemo(() => {
    const d = series(range, true, 60, now), u = series(range, false, 60, now);
    return d.map((v, i) => ({
      t: new Date(now - range * 1000 + (i * range * 1000) / 59).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: range <= 300 ? "2-digit" : undefined }),
      Download: +v.toFixed(1), Upload: +u[i].toFixed(1), Total: +(v + u[i]).toFixed(1),
    }));
  }, [range, now]);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#1f2b45" strokeDasharray="3 3" />
          <XAxis dataKey="t" stroke="#8a9ab8" fontSize={11} minTickGap={40} label={{ value: "Waktu", position: "insideBottomRight", offset: -2, fill: "#8a9ab8", fontSize: 11 }} />
          <YAxis stroke="#8a9ab8" fontSize={11} width={48} label={{ value: "Mbps", angle: -90, position: "insideLeft", fill: "#8a9ab8", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#111a2e", border: "1px solid #1f2b45", borderRadius: 8 }} formatter={(v: number) => `${v} Mbps`} />
          <Legend />
          <Line type="monotone" dataKey="Download" stroke="#3b9cff" strokeWidth={2} dot={false} isAnimationActive={animate} animationDuration={400} />
          <Line type="monotone" dataKey="Upload" stroke="#22e58b" strokeWidth={2} dot={false} isAnimationActive={animate} animationDuration={400} />
          {total && <Line type="monotone" dataKey="Total" stroke="#ffb84d" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={animate} animationDuration={400} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
