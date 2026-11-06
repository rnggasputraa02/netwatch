"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useApp } from "@/lib/store";
import { bwCsv, detectSpikes, summarize } from "@/lib/analytics";
import { COUNTER_WHY } from "@/lib/live/status";
import { download, fmtBps, fmtBytes, fmtDur } from "@/lib/format";
import SourceBadge from "@/components/ui/SourceBadge";
import BwChart from "@/components/charts/BwChart";
const RANGES: [number, string][] = [[10 * 60_000, "10 menit"], [60 * 60_000, "1 jam"], [Infinity, "Semua riwayat"]];
const WHY: Record<string, string> = { upnp_no_response: "Router tidak menjawab UPnP (mungkin dinonaktifkan atau tidak didukung firmware).", gateway_not_found: "Gateway tidak ditemukan.", no_active_interface: "Tidak ada interface aktif.", no_wan_counters: "Router tidak menyediakan counter WAN lewat UPnP.", counters_rejected: "Router menolak permintaan counter.", counters_unreachable: "Counter router tidak dapat dibaca (timeout).", description_unreachable: "Deskripsi UPnP router tidak dapat diambil.", description_invalid: "Deskripsi UPnP router tidak valid.", location_not_gateway: "Balasan UPnP menunjuk host selain gateway (diabaikan demi keamanan)." };
/** Tiga metrik berbeda yang TIDAK boleh dicampur: (1) komputer ini, (2) total router, (3) per perangkat. */
export default function RealBandwidth() {
  const { v5, live, rules, animOn, now } = useApp(); const [rng, setRng] = useState(RANGES[1][0]);
  const pts = useMemo(() => v5.bwHist.filter((p) => rng === Infinity || p.t >= now - rng), [v5.bwHist, rng, now]);
  const sum = (k: "pcRx" | "pcTx" | "rtRx" | "rtTx") => summarize(pts.map((p) => p[k])); const pcRx = sum("pcRx"), pcTx = sum("pcTx"), rtRx = sum("rtRx"), rtTx = sum("rtTx");
  const cErr = live.snap?.counters?.error ?? null; const spikes = detectSpikes(pts.map((p) => p.pcRx)).length; const thr = rules.find((r) => r.kind === "bandwidth"); const cur = v5.pcRate ? ((v5.pcRate.rx ?? 0) + (v5.pcRate.tx ?? 0)) / 1e6 : null; const high = !!thr?.enabled && cur !== null && cur > thr.threshold;
  const tot = v5.buckets.filter((b) => rng === Infinity || b.t + 600_000 > now - rng).reduce((a, b) => ({ rx: a.rx + b.by.pcRx, tx: a.tx + b.by.pcTx }), { rx: 0, tx: 0 }); const r = v5.router; const st = r.status;
  return (
    <section aria-labelledby="rb-h" className="space-y-4" data-testid="real-bandwidth">
      <div className="flex items-center gap-2 flex-wrap"><h2 id="rb-h" className="font-semibold">Bandwidth Nyata</h2><SourceBadge kind={live.status} />
        <span className="ml-auto flex gap-2 flex-wrap">{RANGES.map(([v, l]) => <button key={l} className={rng === v ? "btn-p" : "btn"} onClick={() => setRng(v)}>{l}</button>)}
          <button className="btn flex items-center gap-1" disabled={v5.bwHist.length === 0} onClick={() => download("bandwidth-LIVE.csv", bwCsv(pts))}><Download size={16} />Ekspor CSV</button></span></div>
      <p className="text-xs text-slate-400">Tiga metrik di bawah berbeda dan tidak boleh disamakan. Angka router tidak pernah dihitung dari pengukuran satu komputer.</p>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card" data-testid="bw-pc"><h3 className="text-xs uppercase text-slate-400">1. Throughput koneksi komputer ini</h3>
          {live.status === "OFF" ? <p className="text-sm text-slate-400 mt-1">Aktifkan Monitoring Nyata untuk mengukur.</p> : (<>
            {cErr ? <p className="text-sm mt-1" data-testid="bw-pc-unavailable"><b className="text-amber-400">NOT AVAILABLE</b><br />{COUNTER_WHY[cErr] ?? cErr}<br /><span className="text-xs text-slate-400">Tidak ada angka ditampilkan: ini kegagalan pembacaan counter, bukan &quot;tidak ada transfer&quot;.</span></p> : !v5.pcRate ? <p className="text-sm text-slate-400 mt-1" data-testid="bw-pc-waiting">Menunggu dua pembacaan counter untuk menghitung laju…</p> : <>
            <div className="text-lg font-bold mt-1" data-testid="bw-pc-now">↓ {fmtBps(v5.pcRate?.rx)} · ↑ {fmtBps(v5.pcRate?.tx)} {high && <span className="text-xs text-amber-400 border border-amber-400 rounded-full px-2">TINGGI</span>}</div>
            {v5.pcRate.rx === 0 && v5.pcRate.tx === 0 && <p className="text-xs text-amber-400" data-testid="bw-pc-zero">Tidak ada byte yang berubah pada interval ini. NetWatch sendiri mengirim ping, jadi nilai persis 0 bisa berarti counter adapter tidak diperbarui; bandingkan dengan Task Manager (lihat docs/THROUGHPUT-TEST.md).</p>}</>}
            <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1 mt-1"><dt className="text-slate-400">Rata-rata ↓/↑</dt><dd>{fmtBps(pcRx?.avg)} / {fmtBps(pcTx?.avg)}</dd><dt className="text-slate-400">Maks ↓/↑</dt><dd>{fmtBps(pcRx?.max)} / {fmtBps(pcTx?.max)}</dd><dt className="text-slate-400">Total masuk/keluar</dt><dd>{fmtBytes(tot.rx)} / {fmtBytes(tot.tx)}</dd><dt className="text-slate-400">Lonjakan ↓</dt><dd>{spikes} kejadian</dd></dl>
            <p className="text-xs text-slate-400 mt-1">Hanya trafik interface aktif komputer ini ({live.snap?.counters?.method ?? "metode belum tersedia"}).</p>
            {pts.length > 1 ? <BwChart points={pts} which="pc" animate={animOn} /> : <p className="text-sm text-slate-400 py-4 text-center">Belum ada riwayat.</p>}</>)}</div>
        <div className="card" data-testid="bw-router"><h3 className="text-xs uppercase text-slate-400">2. Total throughput router (WAN, via UPnP)</h3>
          {!r.enabled ? <p className="text-sm text-slate-400 mt-1">Integrasi router nonaktif. <Link className="text-sky underline" href="/router">Aktifkan di halaman Router</Link>.</p> : !st ? <p className="text-sm text-slate-400 mt-1">{r.failing ? "Server NetWatch tidak terjangkau." : "Menunggu…"}</p> : st.state !== "OK" ? <p className="text-sm mt-1" data-testid="bw-router-state"><b className="text-amber-400">{st.state === "NOT_SUPPORTED" ? "NOT SUPPORTED" : st.state}</b><br />{WHY[st.reason ?? ""] ?? st.reason}<br /><span className="text-xs text-slate-400">Tidak ada angka ditampilkan.</span></p> : (<>
            <div className="text-lg font-bold mt-1" data-testid="bw-router-now">↓ {fmtBps(v5.rtRate?.rx)} · ↑ {fmtBps(v5.rtRate?.tx)}</div>
            <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1 mt-1"><dt className="text-slate-400">Rata-rata ↓/↑</dt><dd>{fmtBps(rtRx?.avg)} / {fmtBps(rtTx?.avg)}</dd><dt className="text-slate-400">Maks ↓/↑</dt><dd>{fmtBps(rtRx?.max)} / {fmtBps(rtTx?.max)}</dd><dt className="text-slate-400">Counter router (sejak boot)</dt><dd>{fmtBytes(st.wan?.rxBytes)} / {fmtBytes(st.wan?.txBytes)}</dd><dt className="text-slate-400">Kapasitas link (dilaporkan)</dt><dd>{fmtBps(st.wan?.maxDownBps)} / {fmtBps(st.wan?.maxUpBps)}</dd><dt className="text-slate-400">Uptime WAN</dt><dd>{fmtDur(st.wan?.uptimeSec ?? null)}</dd></dl>
            {pts.some((p) => p.rtRx !== null) ? <BwChart points={pts} which="rt" animate={animOn} /> : <p className="text-sm text-slate-400 py-4 text-center">Menunggu dua pembacaan counter untuk menghitung laju.</p>}</>)}</div>
        <div className="card" data-testid="bw-device"><h3 className="text-xs uppercase text-slate-400">3. Throughput per perangkat</h3><p className="text-lg font-bold mt-1 text-amber-400">NOT SUPPORTED</p>
          <p className="text-sm mt-1">Tidak ada sumber data nyata yang terverifikasi: UPnP IGD tidak menyediakan trafik per klien, komputer ini tidak dapat mengukur trafik perangkat lain, dan SNMP/API router belum diintegrasikan. NetWatch tidak menampilkan angka per perangkat sebagai data nyata.</p></div>
      </div>
    </section>
  );
}
