"use client";
import { useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { useApp } from "@/lib/store";
import { DURATION, SCENARIO_LIMITS } from "@/lib/simulation/scenario";
import type { ScenarioKind } from "@/types";
import SourceBadge from "@/components/ui/SourceBadge";
const ic = { size: 16, strokeWidth: 2 };
const STATUS_ID: Record<string, string> = { running: "Berjalan", paused: "Dijeda", completed: "Selesai", stopped: "Dihentikan" };
const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export default function SimulationPage() {
  const { devices, scenarios, simMs, startScenario, controlScenario, clearFinishedScenarios, cfg, logs } = useApp();
  const [deviceId, setDeviceId] = useState(""); const [kind, setKind] = useState<ScenarioKind>("latency"); const [dur, setDur] = useState("30"); const [val, setVal] = useState("300"); const [err, setErr] = useState("");
  const L = SCENARIO_LIMITS[kind]; const active = scenarios.filter((s) => s.status === "running" || s.status === "paused"); const done = scenarios.filter((s) => s.status === "completed" || s.status === "stopped");
  function onKind(k: ScenarioKind) { setKind(k); setVal(String(SCENARIO_LIMITS[k].def)); setErr(""); }
  function submit(e: React.FormEvent) {
    e.preventDefault(); const r = startScenario({ kind, deviceId: deviceId || devices[0]?.id || "", durationSec: Number(dur), value: kind === "outage" ? 0 : Number(val) }); setErr(r ?? "");
  }
  const events = logs.filter((l) => l.desc.includes("[Skenario]")).slice(0, 8);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap"><h1 className="text-lg font-semibold">Simulasi Lanjutan</h1><SourceBadge kind="SIMULATION" />
        <span className="text-xs border border-bd rounded-full px-3 py-1" data-testid="sim-clock">Waktu simulasi {mmss(simMs)}{cfg.paused ? " (dijeda)" : ""}</span></div>
      <p className="text-amber-400 text-xs">Skenario hanya mengubah data simulasi di aplikasi ini. Tidak mengirim paket, tidak memutus koneksi, dan tidak mengubah jaringan sungguhan.</p>
      <form onSubmit={submit} className="card grid gap-3 md:grid-cols-5 items-end" aria-label="Skenario baru">
        <label className="text-sm">Perangkat target<select aria-label="Perangkat target" className="inp mt-1" value={deviceId || devices[0]?.id || ""} onChange={(e) => setDeviceId(e.target.value)}>{devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.ip})</option>)}</select></label>
        <label className="text-sm">Jenis gangguan<select aria-label="Jenis gangguan" className="inp mt-1" value={kind} onChange={(e) => onKind(e.target.value as ScenarioKind)}>{(Object.keys(SCENARIO_LIMITS) as ScenarioKind[]).map((k) => <option key={k} value={k}>{SCENARIO_LIMITS[k].label}</option>)}</select></label>
        <label className="text-sm">Durasi (detik)<input aria-label="Durasi (detik)" className="inp mt-1" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} placeholder={`${DURATION.min}–${DURATION.max}`} /></label>
        {kind !== "outage" ? <label className="text-sm">Nilai ({L.unit})<input aria-label={`Nilai (${L.unit})`} className="inp mt-1" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={`${L.min}–${L.max}`} /></label> : <span />}
        <button className="btn-p" disabled={devices.length === 0}>Mulai skenario</button>
        <p role="alert" className="text-red-400 text-xs min-h-4 md:col-span-5">{err}</p>
        {cfg.paused && <p className="text-amber-400 text-xs md:col-span-5">Simulasi sedang dijeda; waktu simulasi dan skenario berhenti sampai dilanjutkan.</p>}
      </form>
      <div className="card"><h2 className="text-xs uppercase text-slate-400 mb-2">Skenario aktif</h2>
        {active.length === 0 ? <p className="text-sm text-slate-400">Tidak ada skenario aktif.</p> : active.map((s) => (
          <div key={s.id} data-testid="scenario-row" data-status={s.status} className="py-2 border-t border-bd first:border-0 text-sm flex flex-wrap items-center gap-3">
            <span className="min-w-48"><b>{s.deviceName}</b> · {SCENARIO_LIMITS[s.kind].label}{s.kind !== "outage" ? ` ${s.value} ${SCENARIO_LIMITS[s.kind].unit}` : ""}</span>
            <span className={s.status === "running" ? "text-neon" : "text-amber-400"}>{STATUS_ID[s.status]}</span>
            <progress aria-label="Kemajuan skenario" className="w-32" max={s.durationSec * 1000} value={s.elapsedMs} /><span className="text-xs text-slate-400">{Math.floor(s.elapsedMs / 1000)}/{s.durationSec} dtk</span>
            <span className="flex gap-1 ml-auto">
              {s.status === "running" ? <button className="btn flex items-center gap-1" onClick={() => controlScenario(s.id, "pause")}><Pause {...ic} />Jeda</button> : <button className="btn flex items-center gap-1" onClick={() => controlScenario(s.id, "resume")}><Play {...ic} />Lanjutkan</button>}
              <button className="btn text-red-400 flex items-center gap-1" onClick={() => controlScenario(s.id, "stop")}><Square {...ic} />Hentikan</button></span>
          </div>))}</div>
      <div className="card"><div className="flex items-center justify-between mb-2"><h2 className="text-xs uppercase text-slate-400">Riwayat skenario</h2><button className="btn" disabled={done.length === 0} onClick={clearFinishedScenarios}>Bersihkan riwayat</button></div>
        {done.length === 0 ? <p className="text-sm text-slate-400">Belum ada skenario selesai.</p> : done.slice(0, 10).map((s) => <div key={s.id} data-testid="scenario-done" className="text-sm py-1 border-t border-bd first:border-0">{s.deviceName} · {SCENARIO_LIMITS[s.kind].label} · {STATUS_ID[s.status]} ({Math.floor(s.elapsedMs / 1000)}/{s.durationSec} dtk)</div>)}</div>
      <div className="card"><h2 className="text-xs uppercase text-slate-400 mb-2">Kejadian skenario terbaru</h2>
        {events.length === 0 ? <p className="text-sm text-slate-400">Belum ada kejadian.</p> : events.map((l) => <div key={l.id} className="text-sm py-0.5">{new Date(l.t).toLocaleTimeString("id-ID")} — {l.name}: {l.desc}</div>)}</div>
    </div>
  );
}
