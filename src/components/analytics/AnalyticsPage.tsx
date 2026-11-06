"use client";
import { useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { bottleneckHints, buildReport, classifyCondition, detectSpikes, incidentsCsv, jitter, reportCsv, summarize, type Report } from "@/lib/analytics";
import { toPoint } from "@/lib/live/status";
import { COND_ID, download, fmtBps, fmtBytes, fmtNum } from "@/lib/format";
import SourceBadge from "@/components/ui/SourceBadge";
import LiveChart from "@/components/charts/LiveChart";
const ic = { size: 16, strokeWidth: 2 };
const RANGES: [number, string][] = [[10 * 60_000, "10 menit"], [60 * 60_000, "1 jam"], [Infinity, "Semua riwayat"]];
function ReportCard({ r, file, id }: { r: Report; file: string; id: string }) {
  return (
    <div className="card" data-testid={id}><div className="flex items-center gap-2 mb-1"><h3 className="font-semibold">{r.label}</h3><SourceBadge kind="LIVE" /><button className="btn ml-auto flex items-center gap-1" disabled={r.samples === 0} onClick={() => download(file, reportCsv(r))}><Download {...ic} />CSV</button></div>
      {r.samples === 0 ? <p className="text-sm text-slate-400">Belum ada data LIVE pada periode ini.</p> : <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-slate-400">Sampel / cakupan</dt><dd>{r.samples} / {r.coveredMin} mnt</dd><dt className="text-slate-400">Ketersediaan</dt><dd data-testid={`${id}-uptime`}>{fmtNum(r.uptimePct, "%")}</dd><dt className="text-slate-400">Insiden</dt><dd>{r.incidents}</dd>
        <dt className="text-slate-400">Latency gateway / internet</dt><dd>{fmtNum(r.gwRttAvg, "ms")} / {fmtNum(r.inRttAvg, "ms")}</dd><dt className="text-slate-400">Packet loss gateway / internet</dt><dd>{fmtNum(r.gwLossAvg, "%")} / {fmtNum(r.inLossAvg, "%")}</dd>
        <dt className="text-slate-400">Komputer: rata-rata ↓/↑</dt><dd>{fmtBps(r.pcRxAvg)} / {fmtBps(r.pcTxAvg)}</dd><dt className="text-slate-400">Komputer: total masuk/keluar</dt><dd>{fmtBytes(r.bytes.pcRx)} / {fmtBytes(r.bytes.pcTx)}</dd>
        <dt className="text-slate-400">Router WAN: rata-rata ↓/↑</dt><dd>{fmtBps(r.rtRxAvg)} / {fmtBps(r.rtTxAvg)}</dd></dl>}</div>
  );
}
export default function AnalyticsPage() {
  const { live, v5, now, animOn } = useApp(); const [rng, setRng] = useState(RANGES[1][0]);
  const pts = useMemo(() => live.hist.filter((p) => rng === Infinity || p.t >= now - rng), [live.hist, rng, now]);
  const gw = summarize(pts.map((p) => p.gwRtt)), inn = summarize(pts.map((p) => p.inetRtt)), gl = summarize(pts.map((p) => p.gwLoss)), il = summarize(pts.map((p) => p.inetLoss));
  const conds = pts.map((p) => classifyCondition(p)); const known = conds.filter((c) => c !== "UNKNOWN"); const stability = known.length ? (known.filter((c) => c === "NORMAL").length / known.length) * 100 : null;
  const hints = bottleneckHints(pts, v5.rtRate ? { rxBps: v5.rtRate.rx, txBps: v5.rtRate.tx, maxDownBps: v5.rtRate.maxDown ?? null, maxUpBps: v5.rtRate.maxUp ?? null } : undefined);
  const bw = v5.bwHist.filter((p) => rng === Infinity || p.t >= now - rng); const idx = detectSpikes(bw.map((p) => p.pcRx)); const cur = live.snap && live.status === "LIVE" ? classifyCondition(toPoint(live.snap)) : "UNKNOWN";
  const day = buildReport(v5.buckets, now - 24 * 3600_000, now, "Laporan harian (24 jam terakhir)", v5.incidents), week = buildReport(v5.buckets, now - 7 * 24 * 3600_000, now, "Laporan mingguan (7 hari terakhir)", v5.incidents);
  const row = (n: string, s: ReturnType<typeof summarize>, l: ReturnType<typeof summarize>, j: number | null) => <tr key={n} className="border-t border-bd"><td className="p-2">{n}</td><td className="p-2">{s?.n ?? 0}</td><td className="p-2">{fmtNum(s?.avg, "ms")}</td><td className="p-2">{fmtNum(s?.min, "ms")} / {fmtNum(s?.max, "ms")}</td><td className="p-2">{fmtNum(s?.p95, "ms")}</td><td className="p-2">{fmtNum(j, "ms")}</td><td className="p-2">{fmtNum(l?.avg, "%")} (maks {fmtNum(l?.max, "%")})</td></tr>;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap"><h1 className="text-lg font-semibold">Analitik & Laporan</h1><SourceBadge kind={live.status} /><span className="ml-auto flex gap-2 flex-wrap">{RANGES.map(([v, l]) => <button key={l} className={rng === v ? "btn-p" : "btn"} onClick={() => setRng(v)}>{l}</button>)}</span></div>
      <p className="text-xs text-slate-400">Semua analisis memakai data LIVE yang tersimpan di browser ini (hanya terkumpul saat NetWatch terbuka dan Monitoring Nyata aktif). Tidak ada data simulasi di halaman ini.</p>
      <div className="card" data-testid="summary"><h2 className="text-xs uppercase text-slate-400 mb-1">Ringkasan kondisi</h2>
        {pts.length < 5 ? <p className="text-sm text-slate-400">Data belum cukup (butuh minimal 5 sampel LIVE pada rentang ini; ada {pts.length}).</p> : (<>
          <p className="text-lg font-bold" data-testid="summary-cond">{live.status === "LIVE" ? COND_ID[cur] : "Tidak diketahui (data lama/terputus)"} <span className="text-sm font-normal text-slate-400">· stabilitas {fmtNum(stability, "%", 0)} sampel normal</span></p>
          {hints.length === 0 ? <p className="text-sm text-slate-400">Tidak ada indikasi hambatan dari data yang tersedia.</p> : <ul className="text-sm list-disc pl-5" data-testid="hints">{hints.map((h) => <li key={h.text}>{h.text}<span className="block text-xs text-slate-400">Bukti: {h.evidence}</span></li>)}</ul>}</>)}</div>
      <div className="card overflow-x-auto"><h2 className="text-xs uppercase text-slate-400 mb-2">Analisis latency dan packet loss</h2><table aria-label="Analisis latency" className="w-full text-sm whitespace-nowrap"><thead><tr>{["Target", "Sampel", "Rata-rata", "Min / Maks", "P95", "Jitter", "Packet loss"].map((h) => <th key={h} scope="col" className="text-left p-2 text-slate-400 font-medium">{h}</th>)}</tr></thead><tbody>{row("Gateway", gw, gl, jitter(pts.map((p) => p.gwRtt)))}{row("Internet", inn, il, jitter(pts.map((p) => p.inetRtt)))}</tbody></table></div>
      <div className="grid gap-4 lg:grid-cols-2"><div className="card"><h3 className="text-xs uppercase text-slate-400 mb-1">Latency</h3>{pts.length < 2 ? <p className="text-sm text-slate-400 py-6 text-center">Belum ada riwayat LIVE.</p> : <LiveChart points={pts} kind="rtt" animate={animOn} />}</div><div className="card"><h3 className="text-xs uppercase text-slate-400 mb-1">Packet loss</h3>{pts.length < 2 ? <p className="text-sm text-slate-400 py-6 text-center">Belum ada riwayat LIVE.</p> : <LiveChart points={pts} kind="loss" animate={animOn} />}</div></div>
      <div className="card" data-testid="spikes"><h2 className="text-xs uppercase text-slate-400 mb-1">Lonjakan trafik (download komputer ini)</h2>{bw.filter((p) => p.pcRx !== null).length < 8 ? <p className="text-sm text-slate-400">Butuh minimal 8 pengukuran throughput.</p> : idx.length === 0 ? <p className="text-sm text-slate-400">Tidak ada lonjakan terdeteksi.</p> : <ul className="text-sm list-disc pl-5">{idx.slice(-5).map((i) => <li key={bw[i].id}>{new Date(bw[i].t).toLocaleTimeString("id-ID")}: {fmtBps(bw[i].pcRx)}</li>)}</ul>}</div>
      <div className="card"><div className="flex items-center gap-2 mb-2"><h2 className="text-xs uppercase text-slate-400">Riwayat perubahan kondisi ({v5.incidents.length})</h2><span className="ml-auto flex gap-2"><button className="btn flex items-center gap-1" disabled={v5.incidents.length === 0} onClick={() => download("gangguan-LIVE.csv", incidentsCsv(v5.incidents))}><Download {...ic} />CSV gangguan</button><button className="btn text-red-400 flex items-center gap-1" disabled={v5.incidents.length === 0} onClick={v5.clearIncidents}><Trash2 {...ic} />Hapus</button></span></div>
        {v5.incidents.length === 0 ? <p className="text-sm text-slate-400" data-testid="no-incidents">Belum ada perubahan kondisi tercatat.</p> : v5.incidents.slice(0, 30).map((i) => <div key={i.id} data-testid="incident-row" className="py-1.5 border-t border-bd first:border-0 text-sm">{new Date(i.t).toLocaleString("id-ID")} · {COND_ID[i.from]} → <b>{COND_ID[i.to]}</b><span className="block text-xs text-slate-400">{i.summary}</span></div>)}</div>
      <h2 className="font-semibold pt-2">Laporan</h2><div className="grid gap-4 lg:grid-cols-2"><ReportCard r={day} file="laporan-harian-LIVE.csv" id="report-day" /><ReportCard r={week} file="laporan-mingguan-LIVE.csv" id="report-week" /></div>
      <p className="text-xs text-slate-400">Laporan dihitung dari agregasi 10 menit (disimpan 14 hari di browser ini). Laporan perangkat ada di halaman Perangkat Terdeteksi, dan laporan bandwidth di halaman Bandwidth.</p>
    </div>
  );
}
