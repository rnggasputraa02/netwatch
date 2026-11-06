"use client";
import { useState } from "react";
import { useApp } from "@/lib/store";
import Modal from "@/components/ui/Modal";
import type { Device } from "@/types";
export function Topology() {
  const { devices } = useApp(); const [sel, setSel] = useState<Device | null>(null); const [z, setZ] = useState(1); const n = devices.slice(1);
  return (
    <div className="card"><p className="text-amber-400 text-xs mb-2">⚠ Visualisasi simulasi, bukan topologi jaringan nyata. Klik node untuk detail.</p>
      <div className="flex gap-2 mb-2"><button className="btn" onClick={() => setZ(Math.min(2, z + 0.25))}>＋</button><button className="btn" onClick={() => setZ(Math.max(0.5, z - 0.25))}>－</button><button className="btn" onClick={() => setZ(1)}>Reset</button></div>
      <div className="overflow-auto"><svg viewBox="0 0 600 340" style={{ width: `${z * 100}%` }} role="img" aria-label="Topologi simulasi">
        {n.map((d, i) => { const a = (i / n.length) * 6.283 - 1.57, x = 300 + Math.cos(a) * 235, y = 170 + Math.sin(a) * 135, c = d.online ? "#22e58b" : "#ff5d6c";
          return <g key={d.id} className="cursor-pointer" role="button" tabIndex={0} aria-label={`Detail ${d.name}, ${d.online ? "online" : "offline"}`} onClick={() => setSel(d)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(d); } }}><line x1="300" y1="170" x2={x} y2={y} stroke={c} strokeWidth="2" strokeDasharray={d.online ? undefined : "5"} /><circle cx={x} cy={y} r="14" fill="#111a2e" stroke={c} strokeWidth="2" />
            <text x={x} y={y + 28} textAnchor="middle" fontSize="11" fill="#e6edf7">{d.name}</text><text x={x} y={y + 40} textAnchor="middle" fontSize="10" fill="#8a9ab8">{d.ip}</text></g>; })}
        <circle cx="300" cy="170" r="20" fill="#3b9cff" /><text x="300" y="212" textAnchor="middle" fontSize="11" fill="#e6edf7">{devices[0]?.name ?? "Laptop"}</text></svg></div>
      <p className="text-sm mt-2"><span className="text-neon">● Online</span> &nbsp;<span className="text-red-400">● Offline</span> &nbsp;<span className="text-sky">● Laptop utama</span></p>
      {sel && <Modal label="Detail node" onClose={() => setSel(null)}><h3 className="font-semibold mb-2">{sel.name}</h3><p className="text-sm">IP {sel.ip}<br />MAC {sel.mac}<br />OS {sel.os}<br />Status {sel.online ? "Online" : "Offline"} · {sel.bw.toFixed(1)} Mbps (simulasi)</p><div className="flex justify-end mt-3"><button className="btn" onClick={() => setSel(null)}>Tutup</button></div></Modal>}</div>
  );
}
