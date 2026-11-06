"use client";
import Link from "next/link";
import { useApp } from "@/lib/store";
import SourceBadge from "@/components/ui/SourceBadge";
/** Peta jaringan nyata. Garis hanya untuk hubungan yang DIKETAHUI: komputer→gateway (rute default) dan gateway→internet (jalur terukur ping). Perangkat lain berada dalam kotak subnet tanpa garis karena koneksi fisiknya (switch/AP) tidak diketahui. */
export default function RealMap() {
  const { live, v5 } = useApp(); const { status, snap } = live; const ok = status === "LIVE" || status === "STALE"; const iface = snap?.activeInterface; const gw = snap?.gateway; const others = v5.known.filter((k) => k.role === "unknown");
  const gwUp = gw?.probe && gw.probe.lossPct !== null ? gw.probe.received > 0 : null; const inUp = snap?.internet.probe && snap.internet.probe.lossPct !== null ? snap.internet.probe.received > 0 : null; const col = (v: boolean | null) => (v === null ? "#8a9ab8" : v ? "#22e58b" : "#ff5d6c");
  if (!ok || !snap) return <div className="card text-sm" data-testid="realmap-empty"><SourceBadge kind={status} /> <p className="mt-2 text-slate-400">{status === "OFF" ? "Aktifkan Monitoring Nyata agar peta jaringan nyata dapat dibuat." : "Belum ada data LIVE untuk menggambar peta."} <Link href="/live" className="text-sky underline">Buka Monitoring Nyata</Link>. Simulasi tersedia di tab Simulasi.</p></div>;
  const cols = Math.max(1, Math.min(4, others.length)); const rows = Math.ceil(others.length / cols);
  return (
    <div className="card" data-testid="realmap"><div className="flex items-center gap-2 mb-2"><SourceBadge kind={status} /><span className="text-xs text-slate-400">Hanya hubungan yang diketahui yang digambar.</span></div>
      <div className="overflow-auto"><svg viewBox={`0 0 600 ${230 + Math.max(0, rows) * 38 + 30}`} className="w-full" role="img" aria-label="Peta jaringan nyata">
        <g data-testid="node-internet"><circle cx="300" cy="35" r="20" fill="#111a2e" stroke={col(inUp)} strokeWidth="2" /><text x="300" y="40" textAnchor="middle" fontSize="12" fill="#e6edf7">☁</text><text x="300" y="72" textAnchor="middle" fontSize="11" fill="#e6edf7">Internet</text><text x="300" y="85" textAnchor="middle" fontSize="10" fill="#8a9ab8">{snap.internet.target} · {inUp === null ? "tidak diketahui" : inUp ? "terjangkau" : "tidak terjangkau"}</text></g>
        <line x1="300" y1="55" x2="300" y2="110" stroke={col(inUp)} strokeWidth="2" strokeDasharray={inUp === false ? "5" : undefined} />
        <g data-testid="node-gateway"><circle cx="300" cy="130" r="18" fill="#111a2e" stroke={col(gwUp)} strokeWidth="2" /><text x="300" y="165" textAnchor="middle" fontSize="11" fill="#e6edf7">Gateway/Router</text><text x="300" y="178" textAnchor="middle" fontSize="10" fill="#8a9ab8">{gw?.ip ?? "tidak ditemukan"} · {gwUp === null ? "tidak diketahui" : gwUp ? "merespons" : "tidak merespons"}</text></g>
        <line x1="300" y1="148" x2="300" y2="200" stroke={col(gwUp)} strokeWidth="2" strokeDasharray={gwUp === false ? "5" : undefined} />
        <g data-testid="node-self"><circle cx="300" cy="215" r="14" fill="#3b9cff" /><text x="300" y="245" textAnchor="middle" fontSize="11" fill="#e6edf7">Komputer ini</text><text x="300" y="258" textAnchor="middle" fontSize="10" fill="#8a9ab8">{iface ? `${iface.name} · ${iface.ipv4}` : "interface tidak diketahui"}</text></g>
        <g data-testid="lan-box"><rect x="20" y="272" width="560" height={Math.max(60, rows * 38 + 36)} rx="10" fill="none" stroke="#8a9ab8" strokeDasharray="5 4" /><text x="30" y="290" fontSize="10" fill="#8a9ab8">Subnet {iface?.cidr ?? v5.disc?.status.subnet ?? "?"}: koneksi fisik (switch/AP) ke gateway tidak diketahui, tanpa garis</text>
          {others.length === 0 && <text x="30" y="315" fontSize="11" fill="#8a9ab8">Belum ada perangkat lain terdeteksi. Buka halaman Perangkat Terdeteksi untuk memindai.</text>}
          {others.map((d, i) => { const x = 40 + (i % cols) * (540 / cols), y = 312 + Math.floor(i / cols) * 38; return <g key={d.id} data-testid="node-device"><circle cx={x + 8} cy={y} r="7" fill="#111a2e" stroke={d.online ? "#22e58b" : d.online === false ? "#ff5d6c" : "#8a9ab8"} strokeWidth="2" /><text x={x + 22} y={y + 4} fontSize="11" fill="#e6edf7">{d.hostname ?? d.ip}</text><text x={x + 22} y={y + 16} fontSize="9" fill="#8a9ab8">{d.hostname ? d.ip : d.mac ?? ""}</text></g>; })}</g>
      </svg></div>
      <p className="text-sm mt-2"><span className="text-neon">● Terjangkau/online</span> &nbsp;<span className="text-red-400">● Tidak terjangkau/offline</span> &nbsp;<span className="text-slate-400">● Tidak diketahui</span></p></div>
  );
}
