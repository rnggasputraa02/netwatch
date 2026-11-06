"use client";
import { useState } from "react";
import { series, stats } from "@/lib/simulation";
import { useApp } from "@/lib/store";
import TrafficChart from "@/components/charts/TrafficChart";
import { Note, Ranges } from "@/components/ui/common";
export function Bandwidth() {
  const { now, animOn } = useApp(); const [r, setR] = useState(60);
  const d = stats(series(r, true, 60, now)), u = stats(series(r, false, 60, now)); const f = (s: typeof d) => `${s.avg.toFixed(1)} / ${s.max.toFixed(1)} / ${s.min.toFixed(1)} Mbps`;
  return (
    <div className="space-y-4"><Note /><div className="flex gap-2 items-center flex-wrap"><Ranges r={r} set={setR} /><span className="text-xs text-slate-400">Aktivitas: {d.max > 50 ? "Tinggi" : d.max > 35 ? "Sedang" : "Rendah"}</span></div>
      <div className="card"><TrafficChart range={r} now={now} animate={animOn} total height={300} /></div>
      <div className="grid gap-4 md:grid-cols-2"><div className="card"><h3 className="text-xs uppercase text-slate-400">Download (rata-rata / tertinggi / terendah)</h3>{f(d)}</div><div className="card"><h3 className="text-xs uppercase text-slate-400">Upload (rata-rata / tertinggi / terendah)</h3>{f(u)}</div></div></div>
  );
}
