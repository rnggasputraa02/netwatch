"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { series, stats } from "@/lib/simulation";
import { useApp } from "@/lib/store";
import TrafficChart from "@/components/charts/TrafficChart";
import { Note, Ranges, Stat } from "@/components/ui/common";
import SourcePanel from "./SourcePanel";
import LiveOverview from "./LiveOverview";
import SourceBadge from "@/components/ui/SourceBadge";
export function Dashboard() {
  const { devices, logs, now, cfg, animOn, alerts } = useApp(); const [r, setR] = useState(60);
  const on = devices.filter((d) => d.online).length; const d = series(r, true, 60, now), u = series(r, false, 60, now); const cur = d[59] + u[59]; const avg = stats(d).avg + stats(u).avg;
  function report() {
    const rows = [["Metrik", "Nilai"], ["Total perangkat", devices.length], ["Online", on], ["Offline", devices.length - on], ["Bandwidth saat ini (Mbps, simulasi)", cur.toFixed(1)], ["Rata-rata (Mbps, simulasi)", avg.toFixed(1)]];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + rows.map((x, i) => [...x, i === 0 ? "Sumber" : "SIMULATION"].join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" })); a.download = "laporan-netwatch.csv"; a.click();
  }
  return (
    <div className="space-y-4"><LiveOverview /><h2 className="font-semibold pt-2">Simulasi <SourceBadge kind="SIMULATION" /></h2><Note /><SourcePanel />
      <div className="flex gap-2 items-center flex-wrap"><Ranges r={r} set={setR} /><span className={`pill text-xs border rounded-full px-3 py-1 ${cfg.paused ? "border-amber-400 text-amber-400" : "border-neon text-neon"}`}>{cfg.paused ? "Simulasi dijeda" : "Simulasi aktif"}</span>
        <button className="btn flex items-center gap-1" onClick={report}><Download size={16} />Laporan CSV</button></div>
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        <Stat t="Total Perangkat" v={devices.length} /><Stat t="Online / Offline" v={<><span className="text-neon">{on}</span> / <span className="text-red-400">{devices.length - on}</span></>} />
        <Stat t="Perangkat Bermasalah (offline, simulasi)" v={<span className={devices.length - on > 0 ? "text-amber-400" : "text-neon"}>{devices.length - on}</span>} /><Stat t="Traffic Masuk (simulasi)" v={`${d[59].toFixed(1)} Mbps`} /><Stat t="Traffic Keluar (simulasi)" v={`${u[59].toFixed(1)} Mbps`} /><Stat t="Alert Aktif (simulasi)" v={alerts.filter((a) => a.source === "SIMULATION" && a.recoveredAt === null).length} /><Stat t="Bandwidth Total" v={`${cur.toFixed(1)} Mbps`} /><Stat t="Rata-rata" v={`${avg.toFixed(1)} Mbps`} /><Stat t="Penggunaan Jaringan" v={`${Math.min(100, cur).toFixed(0)}%`} /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><h3 className="text-xs uppercase text-slate-400 mb-2">Aktivitas Jaringan</h3><TrafficChart range={r} now={now} animate={animOn} total /></div>
        <div className="card"><h3 className="text-xs uppercase text-slate-400 mb-2">Perangkat Terbaru</h3>{devices.length === 0 ? <p className="text-slate-400">Belum ada perangkat.</p> : devices.slice(-5).reverse().map((x) => <div key={x.id} className="py-1 border-b border-bd text-sm">{x.name} · {x.ip} <span className={x.online ? "text-neon" : "text-red-400"}>●</span></div>)}
          <h3 className="text-xs uppercase text-slate-400 mt-4 mb-2">Aktivitas Terbaru</h3>{logs.slice(0, 4).map((l) => <div key={l.id} className="text-sm py-0.5">{new Date(l.t).toLocaleTimeString("id-ID")} — {l.desc}</div>)}{logs.length === 0 && <p className="text-slate-400 text-sm">Belum ada log.</p>}</div></div>
      <p className="text-xs text-slate-400">Pembaruan terakhir: {new Date(now).toLocaleTimeString("id-ID")}</p></div>
  );
}
