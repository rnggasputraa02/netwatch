"use client";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { classifyCondition } from "@/lib/analytics";
import { toPoint } from "@/lib/live/status";
import { COND_ID, fmtAge, fmtBps, fmtNum } from "@/lib/format";
import SourceBadge from "@/components/ui/SourceBadge";
const SEV: Record<string, string> = { critical: "text-red-400", warning: "text-amber-400", info: "text-sky" };
/** Pusat pemantauan LIVE di dasbor. Seluruh isi berasal dari pengukuran nyata; data simulasi ada di bagian terpisah di bawahnya. */
export default function LiveOverview() {
  const { live, v5, alerts, now } = useApp(); const { status, snap } = live; const fresh = status === "LIVE" || status === "STALE";
  const cond = snap && status === "LIVE" ? classifyCondition(toPoint(snap)) : "UNKNOWN";
  const act = alerts.filter((a) => a.source === "LIVE" && a.recoveredAt === null); const by = (s: string) => act.filter((a) => (a.severity ?? "warning") === s).length;
  const p = snap?.gateway.probe, q = snap?.internet.probe; const known = v5.known.filter((k) => k.role !== "this-computer"); const inc = v5.incidents[0];
  return (
    <section aria-labelledby="live-h" data-testid="live-overview" className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap"><h2 id="live-h" className="font-semibold">Monitoring Nyata</h2><SourceBadge kind={status} /><Link href="/live" className="text-xs text-sky underline ml-auto">Kelola</Link></div>
      {status === "OFF" && <p className="card text-sm text-slate-400">Monitoring nyata nonaktif, sehingga tidak ada data LIVE. Aktifkan di halaman Monitoring Nyata. Data di bagian Simulasi di bawah ini bukan pengukuran jaringan.</p>}
      {status === "UNKNOWN" && <p className="card text-sm text-slate-400">Menunggu pengukuran pertama…</p>}
      {status === "DISCONNECTED" && <p className="card text-sm text-red-300">Terputus: pengukuran gagal. Data simulasi tidak dipakai sebagai pengganti.</p>}
      {fresh && snap && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          <div className="card"><h3 className="text-xs uppercase text-slate-400">Kondisi jaringan</h3><div className="text-xl font-bold" data-testid="cond-badge">{status === "STALE" ? "Data lama" : COND_ID[cond]}</div><p className="text-xs text-slate-400">Diukur {fmtAge(snap.ts, now)}</p></div>
          <div className="card"><h3 className="text-xs uppercase text-slate-400">Gateway {snap.gateway.ip ?? "—"}</h3><div data-testid="dash-gw">{fmtNum(p?.rttAvgMs, "ms")} · loss {fmtNum(p?.lossPct, "%")}</div></div>
          <div className="card"><h3 className="text-xs uppercase text-slate-400">Internet {snap.internet.target}</h3><div data-testid="dash-inet">{fmtNum(q?.rttAvgMs, "ms")} · loss {fmtNum(q?.lossPct, "%")}</div></div>
          <div className="card"><h3 className="text-xs uppercase text-slate-400">Throughput komputer ini</h3><div data-testid="pc-throughput">↓ {fmtBps(v5.pcRate?.rx)} · ↑ {fmtBps(v5.pcRate?.tx)}</div><p className="text-xs text-slate-400">Bukan total router.</p></div>
          <div className="card"><h3 className="text-xs uppercase text-slate-400">Router (UPnP)</h3><div data-testid="dash-router">{!v5.router.enabled ? "Nonaktif" : v5.router.status ? v5.router.status.state : "Menunggu…"}</div>{v5.rtRate && <p className="text-xs text-slate-400">WAN ↓ {fmtBps(v5.rtRate.rx)} · ↑ {fmtBps(v5.rtRate.tx)}</p>}</div>
        </div>)}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <div className="card"><h3 className="text-xs uppercase text-slate-400">Perangkat terdeteksi (LIVE)</h3><div className="text-xl font-bold" data-testid="known-count">{known.length === 0 ? "—" : `${known.filter((k) => k.online).length} online / ${known.length}`}</div><p className="text-xs text-slate-400">{known.length === 0 ? <>Belum ada pemindaian. <Link href="/discovery" className="text-sky underline">Pindai</Link></> : "Dari tabel ARP/pemindaian lokal."}</p></div>
        <div className="card"><h3 className="text-xs uppercase text-slate-400">Alert LIVE aktif</h3><div className="text-xl font-bold" data-testid="live-alerts-count">{act.length}</div><p className="text-xs"><span className={SEV.critical}>{by("critical")} kritis</span> · <span className={SEV.warning}>{by("warning")} peringatan</span> · <span className={SEV.info}>{by("info")} info</span></p></div>
        <div className="card"><h3 className="text-xs uppercase text-slate-400">Gangguan terakhir</h3>{inc ? <p className="text-sm" data-testid="last-incident">{new Date(inc.t).toLocaleString("id-ID")}: {COND_ID[inc.to]}<span className="block text-xs text-slate-400">{inc.summary}</span></p> : <p className="text-sm text-slate-400">Belum ada perubahan kondisi tercatat.</p>}</div>
      </div>
    </section>
  );
}
