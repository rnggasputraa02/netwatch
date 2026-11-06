"use client";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { INTERNET_TARGETS, liveCsv, LIVE_STALE_MS, NOTE_TEXT } from "@/lib/live/status";
import { fmtAge } from "@/lib/format";
import SourceBadge from "@/components/ui/SourceBadge";
import ProbeCard from "./ProbeCard";
import LiveChart from "@/components/charts/LiveChart";
const ic = { size: 16, strokeWidth: 2 };
const MSG: Record<string, string> = {
  OFF: "Monitoring nyata nonaktif. Tidak ada pengukuran yang dijalankan dan tidak ada data yang ditampilkan.",
  UNKNOWN: "Menunggu pengukuran pertama… (biasanya beberapa detik).",
  DISCONNECTED: "Terputus: server NetWatch tidak dapat menghasilkan pengukuran. Data simulasi TIDAK dipakai sebagai pengganti.",
  STALE: "Data lama: pengukuran terakhir sudah melewati batas waktu. Nilai di bawah bukan kondisi terkini.",
};
export default function LivePage() {
  const { live, setLiveEnabled, setLiveTarget, pollLive, clearLiveHistory, notify, animOn, now, nw, setNw } = useApp();
  const { cfg, status, snap, hist, lastOkTs } = live;
  function exportCsv() {
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([liveCsv(hist)], { type: "text/csv;charset=utf-8" })); a.download = "monitoring-nyata-LIVE.csv"; a.click(); notify("Riwayat LIVE diekspor"); } catch { notify("Ekspor gagal", false); }
  }
  const showData = snap && (status === "LIVE" || status === "STALE");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap"><h1 className="text-lg font-semibold">Monitoring Nyata</h1><SourceBadge kind={status} /></div>
      <div className="card text-sm space-y-1">
        <p><b>Yang diukur:</b> komputer ini → default gateway → internet, dengan ping ICMP sistem (latency dan packet loss) serta pembacaan interface, IPv4, subnet, dan gateway dari sistem operasi.</p>
        <p className="text-slate-400"><b>Yang tidak dilakukan:</b> tidak membaca router (tanpa password), tidak memindai jaringan, tidak mendaftar perangkat Wi-Fi lain, tidak mengukur bandwidth total router. Data ini terpisah penuh dari data simulasi.</p>
      </div>
      <div className="flex gap-3 flex-wrap items-center">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setLiveEnabled(e.target.checked)} />Aktifkan monitoring nyata</label>
        <label className="flex items-center gap-2 text-sm">Target tes internet
          <select aria-label="Target tes internet" className="inp !w-auto" value={cfg.target} onChange={(e) => { if (!setLiveTarget(e.target.value)) notify("Target tidak diizinkan", false); }}>{INTERNET_TARGETS.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm">Interval pengukuran<select aria-label="Interval pengukuran" className="inp !w-auto" value={nw.intervalSec} onChange={(e) => setNw({ intervalSec: Number(e.target.value) as 10 | 30 | 60 })}>{[10, 30, 60].map((v) => <option key={v} value={v}>{v} detik</option>)}</select></label>
        <button className="btn flex items-center gap-1" disabled={!cfg.enabled} onClick={pollLive}><RefreshCw {...ic} />Ukur sekarang</button>
        <button className="btn flex items-center gap-1" disabled={hist.length === 0} onClick={exportCsv}><Download {...ic} />Ekspor CSV (LIVE)</button>
        <button className="btn text-red-400 flex items-center gap-1" disabled={hist.length === 0} onClick={clearLiveHistory}><Trash2 {...ic} />Hapus riwayat</button>
      </div>
      {status !== "LIVE" && <p role="status" data-testid="live-message" className={`card text-sm ${status === "DISCONNECTED" ? "border-red-400 text-red-300" : "text-amber-300"}`}>{MSG[status]}</p>}
      {showData && snap && (<>
        <p className="text-xs text-slate-400" data-testid="live-ts">Diukur: {new Date(snap.ts).toLocaleTimeString("id-ID")} ({fmtAge(snap.ts, now)}) · batas data lama {LIVE_STALE_MS / 1000} dtk · platform {snap.platform}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card" data-testid="iface-card"><h3 className="text-xs uppercase text-slate-400">Interface aktif</h3>
            {snap.activeInterface ? <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1 mt-1"><dt className="text-slate-400">Nama</dt><dd>{snap.activeInterface.name}</dd><dt className="text-slate-400">IPv4</dt><dd className="font-mono">{snap.activeInterface.ipv4}</dd><dt className="text-slate-400">Subnet</dt><dd className="font-mono">{snap.activeInterface.cidr}</dd><dt className="text-slate-400">Netmask</dt><dd className="font-mono">{snap.activeInterface.netmask}</dd></dl> : <p className="text-sm text-slate-400 mt-1">Tidak dapat ditentukan (gateway tidak ditemukan).</p>}</div>
          <ProbeCard title="Gateway" host={snap.gateway.ip} probe={snap.gateway.probe} absent="Default gateway tidak ditemukan, sehingga tidak diukur." />
          <ProbeCard title="Internet" host={snap.internet.target} probe={snap.internet.probe} />
        </div>
        {snap.notes.length > 0 && <ul className="card text-sm text-amber-300 list-disc pl-6" data-testid="live-notes">{snap.notes.map((n) => <li key={n}>{NOTE_TEXT[n] ?? n}</li>)}</ul>}
        <div className="card overflow-x-auto"><h3 className="text-xs uppercase text-slate-400 mb-2">Interface IPv4 pada komputer ini</h3>
          {snap.interfaces.length === 0 ? <p className="text-sm text-slate-400">Tidak ada interface IPv4 aktif.</p> : <table aria-label="Interface jaringan" className="w-full text-sm whitespace-nowrap"><thead><tr>{["Nama", "IPv4", "Subnet", "MAC"].map((h) => <th key={h} scope="col" className="text-left p-2 text-slate-400 font-medium">{h}</th>)}</tr></thead><tbody>{snap.interfaces.map((i) => <tr key={i.name + i.ipv4} className="border-t border-bd"><td className="p-2">{i.name}</td><td className="p-2 font-mono">{i.ipv4}</td><td className="p-2 font-mono">{i.cidr}</td><td className="p-2 font-mono">{i.mac}</td></tr>)}</tbody></table>}</div>
      </>)}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><h3 className="text-xs uppercase text-slate-400 mb-1">Latency nyata <SourceBadge kind="LIVE" /></h3>{hist.length < 2 ? <p className="text-sm text-slate-400 py-6 text-center">Belum ada riwayat LIVE.</p> : <LiveChart points={hist} kind="rtt" animate={animOn} />}</div>
        <div className="card"><h3 className="text-xs uppercase text-slate-400 mb-1">Packet loss nyata <SourceBadge kind="LIVE" /></h3>{hist.length < 2 ? <p className="text-sm text-slate-400 py-6 text-center">Belum ada riwayat LIVE.</p> : <LiveChart points={hist} kind="loss" animate={animOn} />}</div>
      </div>
      <p className="text-xs text-slate-400">{hist.length} titik riwayat LIVE tersimpan di browser ini (maks 720; terpisah dari riwayat simulasi). Pengukuran terakhir berhasil: {fmtAge(lastOkTs, now)}.</p>
    </div>
  );
}
