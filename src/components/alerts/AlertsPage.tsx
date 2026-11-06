"use client";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { RULE_RANGE } from "@/lib/alerts";
import type { RuleKind } from "@/types";
import SourceBadge from "@/components/ui/SourceBadge";
const when = (t: number) => new Date(t).toLocaleString("id-ID");
export default function AlertsPage() {
  const { alerts, rules, setRule, ackAlert, ackAllAlerts, clearAlertHistory } = useApp();
  const [draft, setDraft] = useState<Partial<Record<RuleKind, string>>>({}); const [err, setErr] = useState("");
  const active = alerts.filter((a) => a.recoveredAt === null); const past = alerts.filter((a) => a.recoveredAt !== null);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Alert</h1>
      <p className="text-xs text-slate-400">Alert simulasi (SIMULATION) dan alert pengukuran nyata (LIVE) dipisahkan dan diberi label dan tingkat keparahan. Alert LIVE memakai cooldown 60 detik setelah pulih untuk mencegah flapping. Notifikasi hanya tampil di dalam aplikasi; tidak ada pengiriman email atau pesan eksternal.</p>
      <div className="card"><h2 className="text-xs uppercase text-slate-400 mb-2">Aturan</h2>
        {rules.map((r) => { const R = RULE_RANGE[r.kind]; return (
          <div key={r.kind} className="flex items-center gap-3 py-1.5 border-t border-bd first:border-0 flex-wrap" data-testid={`rule-${r.kind}`}>
            <label className="flex items-center gap-2 text-sm min-w-64"><input type="checkbox" checked={r.enabled} onChange={(e) => setRule(r.kind, { enabled: e.target.checked })} />{R.label}</label>
            {r.kind !== "offline" && <><input aria-label={`Ambang ${R.label}`} className="inp !w-24" inputMode="decimal" value={draft[r.kind] ?? String(r.threshold)} onChange={(e) => setDraft({ ...draft, [r.kind]: e.target.value })} /><span className="text-xs text-slate-400">{R.unit}</span>
              <button className="btn" onClick={() => { const e = setRule(r.kind, { threshold: Number(draft[r.kind] ?? r.threshold) }); setErr(e ?? ""); if (!e) setDraft({ ...draft, [r.kind]: undefined }); }}>Simpan</button></>}
          </div>); })}
        <p role="alert" className="text-red-400 text-xs min-h-4 mt-1">{err}</p></div>
      <div className="card"><div className="flex items-center justify-between mb-2"><h2 className="text-xs uppercase text-slate-400">Alert aktif ({active.length})</h2><button className="btn" disabled={active.every((a) => a.ack)} onClick={ackAllAlerts}>Akui semua</button></div>
        {active.length === 0 ? <p className="text-sm text-slate-400" data-testid="no-alerts">Tidak ada alert aktif.</p> : active.map((a) => (
          <div key={a.id} data-testid="alert-active" data-source={a.source} data-severity={a.severity ?? "warning"} className="py-2 border-t border-bd first:border-0 text-sm flex flex-wrap items-center gap-2"><SourceBadge kind={a.source} /><span className={`text-[11px] font-semibold uppercase border rounded-full px-2 py-0.5 ${(a.severity ?? "warning") === "critical" ? "border-red-400 text-red-400" : (a.severity ?? "warning") === "info" ? "border-sky text-sky" : "border-amber-400 text-amber-400"}`}>{({ critical: "kritis", warning: "peringatan", info: "info" } as const)[a.severity ?? "warning"]}</span><span>{a.message}</span><span className="text-xs text-slate-400">sejak {when(a.startedAt)}</span>
            {a.ack ? <span className="text-xs text-slate-400 ml-auto">diakui</span> : <button className="btn ml-auto" onClick={() => ackAlert(a.id)}>Akui</button>}</div>))}</div>
      <div className="card"><div className="flex items-center justify-between mb-2"><h2 className="text-xs uppercase text-slate-400">Riwayat pulih ({past.length})</h2><button className="btn" disabled={past.length === 0} onClick={clearAlertHistory}>Hapus riwayat</button></div>
        {past.length === 0 ? <p className="text-sm text-slate-400">Belum ada alert yang pulih.</p> : past.slice(0, 30).map((a) => <div key={a.id} data-testid="alert-past" data-source={a.source} className="py-1.5 border-t border-bd first:border-0 text-sm flex flex-wrap gap-2"><SourceBadge kind={a.source} /><span>{a.message}</span><span className="text-xs text-slate-400">{when(a.startedAt)} → pulih {when(a.recoveredAt as number)}</span></div>)}</div>
    </div>
  );
}
