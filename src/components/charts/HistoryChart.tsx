"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "@/lib/store";
import { Ranges } from "@/components/ui/common";
import { stats } from "@/lib/simulation";
type K = "down" | "up";
function One({ title, data, k, color, animate }: { title: string; data: { t: string; v: number }[]; k: K; color: string; animate: boolean }) {
  const s = data.length ? stats(data.map((d) => d.v)) : null;
  return (
    <div className="card"><h3 className="text-xs uppercase text-slate-400 mb-1">{title} (riwayat, simulasi)</h3>
      <p className="text-xs text-slate-400 mb-2" data-testid={`sum-${k}`}>{s ? `Rata-rata ${s.avg.toFixed(1)} · Min ${s.min.toFixed(1)} · Maks ${s.max.toFixed(1)} Mbps` : "—"}</p>
      <div style={{ width: "100%", height: 200 }}><ResponsiveContainer><LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1f2b45" strokeDasharray="3 3" /><XAxis dataKey="t" stroke="#8a9ab8" fontSize={11} minTickGap={40} /><YAxis stroke="#8a9ab8" fontSize={11} width={44} label={{ value: "Mbps", angle: -90, position: "insideLeft", fill: "#8a9ab8", fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "#111a2e", border: "1px solid #1f2b45", borderRadius: 8 }} formatter={(v: number) => `${v} Mbps`} />
        <Line type="monotone" dataKey="v" name={title} stroke={color} strokeWidth={2} dot={false} isAnimationActive={animate} animationDuration={300} /></LineChart></ResponsiveContainer></div></div>
  );
}
export default function HistoryChart() {
  const { history, now, animOn } = useApp(); const [r, setR] = useState(300);
  const pts = useMemo(() => history.filter((p) => p.t >= now - r * 1000), [history, now, r]);
  const fmt = (t: number) => new Date(t).toLocaleTimeString("id-ID");
  const build = (k: K) => pts.map((p) => ({ t: fmt(p.t), v: p[k] }));
  return (
    <div className="space-y-3"><div className="flex items-center gap-3 flex-wrap"><h2 className="font-semibold">Historical Traffic</h2><Ranges r={r} set={setR} /><span className="text-xs text-slate-400">{pts.length} titik</span></div>
      {pts.length < 2 ? <div className="card text-center text-slate-400 py-8">Belum ada data historis pada rentang ini. Biarkan simulasi berjalan (tidak dijeda) agar titik data terkumpul.</div> : (
        <div className="grid gap-4 lg:grid-cols-2"><One title="Download" data={build("down")} k="down" color="#3b9cff" animate={animOn} /><One title="Upload" data={build("up")} k="up" color="#22e58b" animate={animOn} /></div>)}</div>
  );
}
