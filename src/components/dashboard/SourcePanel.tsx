"use client";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { fmtAge, fmtNum } from "@/lib/format";
import SourceBadge from "@/components/ui/SourceBadge";
/** Dua sumber data ditampilkan terpisah dan berlabel; tidak pernah digabung. */
export default function SourcePanel() {
  const { cfg, devices, now, live } = useApp(); const { status, snap } = live;
  const p = snap?.gateway.probe, q = snap?.internet.probe;
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="source-panel">
      <div className="card" data-testid="sim-section"><div className="flex items-center gap-2 mb-1"><SourceBadge kind="SIMULATION" /><span className="text-sm">{cfg.paused ? "Dijeda" : "Aktif"}</span></div>
        <p className="text-xs text-slate-400">{devices.length} perangkat dan trafik simulasi · diperbarui {new Date(now).toLocaleTimeString("id-ID")}. Bukan pengukuran jaringan nyata.</p></div>
      <div className="card" data-testid="live-section"><div className="flex items-center gap-2 mb-1"><SourceBadge kind={status} /><span className="text-sm">Monitoring nyata (komputer ini)</span><Link href="/live" className="text-xs text-sky ml-auto underline">Kelola</Link></div>
        {status === "OFF" && <p className="text-xs text-slate-400">Nonaktif. Aktifkan di halaman Monitoring Nyata untuk mengukur gateway dan internet.</p>}
        {status === "UNKNOWN" && <p className="text-xs text-slate-400">Menunggu pengukuran pertama…</p>}
        {status === "DISCONNECTED" && <p className="text-xs text-red-300">Terputus. Tidak ada data simulasi yang dipakai sebagai pengganti.</p>}
        {(status === "LIVE" || status === "STALE") && snap && (<>
          <dl className="grid grid-cols-2 gap-x-3 text-sm"><dt className="text-slate-400">Gateway ({snap.gateway.ip ?? "—"})</dt><dd data-testid="live-gw">{fmtNum(p?.rttAvgMs, "ms")} · loss {fmtNum(p?.lossPct, "%")}</dd>
            <dt className="text-slate-400">Internet ({snap.internet.target})</dt><dd data-testid="live-inet">{fmtNum(q?.rttAvgMs, "ms")} · loss {fmtNum(q?.lossPct, "%")}</dd></dl>
          <p className="text-xs text-slate-400 mt-1">Diukur {fmtAge(snap.ts, now)}{status === "STALE" ? " — data lama" : ""}</p></>)}
      </div>
    </div>
  );
}
