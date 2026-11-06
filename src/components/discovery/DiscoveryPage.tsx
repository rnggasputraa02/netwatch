"use client";
import { useEffect } from "react";
import { Download, Play, ScanSearch, Square, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { devicesCsv } from "@/lib/analytics";
import { download } from "@/lib/format";
import SourceBadge from "@/components/ui/SourceBadge";
const ic = { size: 16, strokeWidth: 2 };
const REASON: Record<string, string> = { ping_unavailable: "Perintah ping tidak tersedia: hasil hanya dari tabel ARP (pasif).", subnet_narrowed_to_24: "Subnet lebih besar dari /24 dipersempit ke /24 milik komputer ini.", no_active_interface: "Tidak ada interface aktif.", not_private_subnet: "Subnet bukan jaringan privat: pemindaian ditolak.", subnet_too_small: "Subnet terlalu kecil.", mask_invalid: "Netmask tidak valid.", internal_error: "Terjadi kesalahan internal." };
const fmt = (t: number) => new Date(t).toLocaleString("id-ID"); const role = (r: string) => (r === "gateway" ? "Gateway (rute default)" : r === "this-computer" ? "Komputer ini" : "Tidak diketahui");
export default function DiscoveryPage() {
  const { v5, nw, setNw } = useApp(); const d = v5.disc; const run = d?.status.state === "running" || d?.status.state === "stopping";
  useEffect(() => { void v5.refreshDiscovery(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- hanya saat halaman dibuka
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap"><h1 className="text-lg font-semibold">Perangkat Terdeteksi</h1><SourceBadge kind="LIVE" /></div>
      <div className="card text-sm space-y-1">
        <p><b>Cara kerja (aman dan tidak agresif):</b> mode <b>pasif</b> hanya membaca tabel ARP komputer ini. Mode <b>aktif</b> mengirim 1 ping per alamat ke subnet lokal Anda saja (maks 254 alamat, 8 paralel, jeda antar paket), lalu membaca tabel ARP. Tidak ada pemindaian port dan tidak ada akses ke perangkat.</p>
        <p className="text-amber-300">Perangkat yang memblokir ping bisa tetap aktif: ia hanya terlihat bila ada di tabel ARP. Perangkat yang tidak muncul belum tentu offline. Status offline hanya ditetapkan setelah pemindaian aktif yang selesai penuh.</p>
        <p className="text-slate-400">Jenis perangkat hanya ditampilkan bila ada bukti: gateway = rute default; komputer ini = interface lokal. Selebihnya &quot;Tidak diketahui&quot;. MAC privat/acak (locally administered) sering dipakai ponsel modern, tetapi itu bukan bukti jenis perangkat. Pencarian hostname memakai reverse DNS ke resolver jaringan Anda.</p>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <button className="btn-p flex items-center gap-1" disabled={run} onClick={() => void v5.startDiscovery("passive")}><ScanSearch {...ic} />Baca tabel ARP (pasif)</button>
        <button className="btn flex items-center gap-1" disabled={run} onClick={() => void v5.startDiscovery("active")}><Play {...ic} />Pindai subnet lokal (aktif)</button>
        <button className="btn text-red-400 flex items-center gap-1" disabled={!run} onClick={() => void v5.stopDiscovery()}><Square {...ic} />Berhenti</button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nw.hostnames} onChange={(e) => setNw({ hostnames: e.target.checked })} />Cari hostname (reverse DNS)</label>
      </div>
      <div className="card text-sm" data-testid="disc-status" role="status">
        {!d || d.status.state === "idle" ? "Belum ada pemindaian pada sesi server ini." : (<>
          Status: <b data-testid="disc-state">{d.status.state}</b>{d.status.mode ? ` (${d.status.mode})` : ""}{d.status.subnet ? ` · subnet ${d.status.subnet}` : ""}{d.status.stopped ? " · dihentikan pengguna" : ""}
          {d.status.mode === "active" && d.status.total > 0 && <> · <progress aria-label="Kemajuan pemindaian" className="w-40 align-middle" max={d.status.total} value={d.status.probed} /> {d.status.probed}/{d.status.total}</>}
          {d.status.reason && <p className="text-amber-300">{REASON[d.status.reason] ?? d.status.reason}</p>}
          {d.status.finishedAt && <p className="text-xs text-slate-400">Selesai {fmt(d.status.finishedAt)} · {d.status.found} perangkat</p>}</>)}
      </div>
      <div className="card overflow-x-auto"><h2 className="text-xs uppercase text-slate-400 mb-2">Hasil pemindaian terakhir</h2>
        {!d || (d.hosts.length === 0 && !d.self) ? <p className="text-sm text-slate-400">Belum ada hasil.</p> : <table aria-label="Hasil pemindaian" className="w-full text-sm whitespace-nowrap"><thead><tr>{["IPv4", "MAC", "Hostname", "Jenis", "Bukti"].map((h) => <th key={h} scope="col" className="text-left p-2 text-slate-400 font-medium">{h}</th>)}</tr></thead><tbody>
          {d.self && <tr className="border-t border-bd"><td className="p-2 font-mono">{d.self.ip}</td><td className="p-2 font-mono">{d.self.mac ?? "—"}</td><td className="p-2">—</td><td className="p-2">Komputer ini</td><td className="p-2">Interface lokal</td></tr>}
          {d.hosts.map((h) => <tr key={h.ip} className="border-t border-bd" data-testid="disc-row"><td className="p-2 font-mono">{h.ip}</td><td className="p-2 font-mono">{h.mac ?? "—"}</td><td className="p-2">{h.hostname ?? "—"}</td><td className="p-2">{role(h.ip === d.gatewayIp ? "gateway" : "unknown")}</td><td className="p-2">{h.responded ? "Merespons ping + ARP" : "Hanya tabel ARP"}</td></tr>)}</tbody></table>}</div>
      <div className="card overflow-x-auto"><div className="flex items-center gap-2 mb-2"><h2 className="text-xs uppercase text-slate-400">Riwayat perangkat yang pernah terdeteksi ({v5.known.length})</h2><span className="ml-auto flex gap-2">
        <button className="btn flex items-center gap-1" disabled={v5.known.length === 0} onClick={() => download("perangkat-LIVE.csv", devicesCsv(v5.known))}><Download {...ic} />Ekspor CSV</button>
        <button className="btn text-red-400 flex items-center gap-1" disabled={v5.known.length === 0} onClick={v5.clearKnown}><Trash2 {...ic} />Hapus riwayat</button></span></div>
        {v5.known.length === 0 ? <p className="text-sm text-slate-400" data-testid="known-empty">Belum ada perangkat tercatat.</p> : <table aria-label="Riwayat perangkat" className="w-full text-sm whitespace-nowrap"><thead><tr>{["IPv4", "MAC", "Hostname", "Jenis", "Status", "Pertama terlihat", "Terakhir terlihat"].map((h) => <th key={h} scope="col" className="text-left p-2 text-slate-400 font-medium">{h}</th>)}</tr></thead><tbody>
          {v5.known.map((k) => <tr key={k.id} className="border-t border-bd" data-testid="known-row"><td className="p-2 font-mono">{k.ip}</td><td className="p-2 font-mono">{k.mac ?? "—"}{k.privateMac && <span title="Locally administered (privat/acak)"> ⓟ</span>}</td><td className="p-2">{k.hostname ?? "—"}</td><td className="p-2">{role(k.role)}</td><td className={`p-2 ${k.online ? "text-neon" : k.online === false ? "text-red-400" : "text-slate-400"}`}>● {k.online === null ? "Tidak diketahui" : k.online ? "Online" : "Offline"}</td><td className="p-2">{fmt(k.firstSeen)}</td><td className="p-2">{fmt(k.lastSeen)}</td></tr>)}</tbody></table>}</div>
    </div>
  );
}
