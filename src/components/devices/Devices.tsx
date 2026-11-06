"use client";
import { useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import type { Device } from "@/types";
import { compareDevices } from "@/lib/simulation";
import { effectsFor, simDeviceSample } from "@/lib/simulation/scenario";
import { fmtNum } from "@/lib/format";
import { usePagination } from "@/hooks/usePagination";
import { useApp } from "@/lib/store";
import Modal from "@/components/ui/Modal";
import Pagination from "@/components/ui/Pagination";
type Mode = { kind: "form"; d?: Device } | { kind: "view" | "del"; d: Device } | null;
const TYPES = ["Laptop", "Router", "Switch", "Access Point", "Printer", "Ponsel", "Kamera", "Server"];
const validIp = (s: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && s.split(".").every((x) => Number(x) <= 255);
const validMac = (s: string) => /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(s);
const ic = { size: 16, strokeWidth: 2 };
export default function Devices() {
  const { devices, query, setQuery, saveDevice, deleteDevice, focus, setFocus, simMs, scenarios, logs } = useApp();
  const [status, setStatus] = useState<"all" | "on" | "off">("all");
  const [sort, setSort] = useState<{ k: keyof Device; o: 1 | -1 }>({ k: "name", o: 1 });
  const [mode, setMode] = useState<Mode>(null); const [err, setErr] = useState("");
  useEffect(() => { if (focus?.kind === "device") { const d = devices.find((x) => x.id === focus.value); if (d) setMode({ kind: "view", d }); setFocus(null); } }, [focus, devices, setFocus]);
  const rows = useMemo(() => devices.filter((d) => (status === "all" || (status === "on") === d.online) && `${d.name}${d.ip}${d.type}${d.mac}${d.os}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => compareDevices(a, b, sort.k) * sort.o), [devices, status, query, sort]);
  const pg = usePagination(rows, `${status}|${query}|${sort.k}|${sort.o}`); const shown = pg.items;
  const cols: [keyof Device, string][] = [["name", "Nama"], ["ip", "IP (simulasi)"], ["mac", "MAC (simulasi)"], ["type", "Jenis"], ["os", "OS (simulasi)"], ["online", "Status"], ["bw", "Bandwidth"], ["seen", "Terakhir aktif"]];
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const old = mode && mode.kind === "form" ? mode.d : undefined;
    const name = String(f.get("name")).trim(), ip = String(f.get("ip")).trim(), mac = String(f.get("mac")).trim().toUpperCase(), os = String(f.get("os")).trim();
    if (name.length < 2 || name.length > 40) return setErr("Nama harus 2–40 karakter.");
    if (!validIp(ip)) return setErr("Format IP tidak valid.");
    if (devices.some((d) => d.ip === ip && d.id !== old?.id)) return setErr("IP address sudah dipakai perangkat lain.");
    if (!validMac(mac)) return setErr("Format MAC harus AA:BB:CC:DD:EE:FF.");
    saveDevice({ id: old?.id ?? `d${Date.now()}`, name, ip, mac, os: os || "Tidak diketahui", type: String(f.get("type")), online: f.get("online") === "1", bw: old?.bw ?? 10, seen: Date.now() });
    setErr(""); setMode(null);
  }
  return (
    <div>
      <p className="text-amber-400 text-xs mb-3">⚠ Seluruh data perangkat (IP, MAC, OS, bandwidth) adalah simulasi.</p>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input aria-label="Cari perangkat" className="inp !w-52" placeholder="Cari perangkat…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Filter status" className="inp !w-auto" value={status} onChange={(e) => setStatus(e.target.value as "all" | "on" | "off")}><option value="all">Semua status</option><option value="on">Online</option><option value="off">Offline</option></select>
        <button className="btn-p flex items-center gap-1" onClick={() => setMode({ kind: "form" })}><Plus {...ic} />Tambah Perangkat</button>
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <p className="text-center text-slate-400 p-6">Tidak ada perangkat yang cocok.</p> : (
          <table aria-label="Daftar perangkat simulasi" className="w-full text-sm whitespace-nowrap">
            <thead><tr>{cols.map(([k, l]) => <th key={k} scope="col" className="text-left p-2 text-slate-400" aria-sort={sort.k === k ? (sort.o > 0 ? "ascending" : "descending") : "none"}><button type="button" className="cursor-pointer" onClick={() => setSort({ k, o: sort.k === k ? (-sort.o as 1 | -1) : 1 })}>{l}{sort.k === k ? (sort.o > 0 ? " ▲" : " ▼") : ""}</button></th>)}<th scope="col" className="p-2 text-left">Aksi</th></tr></thead>
            <tbody>{shown.map((d) => (
              <tr key={d.id} className="border-t border-bd"><td className="p-2">{d.name}</td><td className="p-2">{d.ip}</td><td className="p-2">{d.mac}</td><td className="p-2">{d.type}</td><td className="p-2">{d.os}</td>
                <td className={`p-2 ${d.online ? "text-neon" : "text-red-400"}`}>● {d.online ? "Online" : "Offline"}</td><td className="p-2">{d.online ? d.bw.toFixed(1) : 0} Mbps</td><td className="p-2">{new Date(d.seen).toLocaleTimeString("id-ID")}</td>
                <td className="p-2 flex gap-1"><button className="btn" title="Detail" aria-label="Detail" onClick={() => setMode({ kind: "view", d })}><Eye {...ic} /></button>
                  <button className="btn" title="Edit" aria-label="Edit" onClick={() => setMode({ kind: "form", d })}><Pencil {...ic} /></button>
                  <button className="btn text-red-400" title="Hapus" aria-label="Hapus" onClick={() => setMode({ kind: "del", d })}><Trash2 {...ic} /></button></td></tr>))}</tbody></table>)}
        <Pagination total={rows.length} page={pg.page} size={pg.size} onPage={pg.setPage} onSize={pg.setSize} />
      </div>
      {mode?.kind === "form" && (
        <Modal label={mode.d ? "Edit perangkat" : "Tambah perangkat"} onClose={() => { setMode(null); setErr(""); }}>
          <form onSubmit={submit} className="space-y-2"><h3 className="font-semibold">{mode.d ? "Edit" : "Tambah"} Perangkat (simulasi)</h3>
            <input name="name" aria-label="Nama" className="inp" placeholder="Nama" defaultValue={mode.d?.name} /><input name="ip" aria-label="IP" className="inp" placeholder="IP (simulasi)" defaultValue={mode.d?.ip} />
            <input name="mac" aria-label="MAC" className="inp" placeholder="MAC AA:BB:CC:DD:EE:FF" defaultValue={mode.d?.mac ?? "02:00:5E:10:00:99"} /><input name="os" aria-label="Sistem operasi" className="inp" placeholder="Sistem operasi" defaultValue={mode.d?.os} />
            <select name="type" aria-label="Jenis" className="inp" defaultValue={mode.d?.type}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            <select name="online" aria-label="Status" className="inp" defaultValue={mode.d?.online === false ? "0" : "1"}><option value="1">Online</option><option value="0">Offline</option></select>
            <p role="alert" className="text-red-400 text-xs min-h-4">{err}</p><div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setMode(null)}>Batal</button><button className="btn-p">Simpan</button></div></form></Modal>)}
      {mode?.kind === "view" && (<Modal label="Detail perangkat" onClose={() => setMode(null)}><h3 className="font-semibold mb-2">{mode.d.name}</h3>
        <p className="text-sm">IP: {mode.d.ip}<br />MAC: {mode.d.mac}<br />OS: {mode.d.os}<br />Jenis: {mode.d.type}<br />Status: {mode.d.online ? "Online" : "Offline"}<br />Bandwidth: {mode.d.bw.toFixed(1)} Mbps<br />Terakhir aktif: {new Date(mode.d.seen).toLocaleString("id-ID")}<br /><i className="text-amber-400">Semua nilai adalah simulasi.</i></p>{(() => { const x = simDeviceSample(mode.d, simMs, effectsFor(scenarios, mode.d.id)); const ev = logs.filter((l) => l.name === mode.d.name).slice(0, 5); return (<div className="text-sm mt-2" data-testid="device-sim-metrics"><h4 className="font-semibold">Metrik simulasi</h4>Latency: {fmtNum(x.latencyMs, "ms")}<br />Packet loss: {fmtNum(x.lossPct, "%")}<br />Utilisasi: {fmtNum(x.utilPct, "%")}<br />Batas bandwidth: {x.limitMbps === null ? "tidak dibatasi" : `${x.limitMbps} Mbps`}<h4 className="font-semibold mt-2">Kejadian terbaru</h4>{ev.length === 0 ? <span className="text-slate-400">Belum ada.</span> : ev.map((l) => <div key={l.id} className="text-xs">{new Date(l.t).toLocaleTimeString("id-ID")} — {l.desc}</div>)}</div>); })()}
        <div className="flex justify-end mt-3"><button className="btn" onClick={() => setMode(null)}>Tutup</button></div></Modal>)}
      {mode?.kind === "del" && (<Modal label="Hapus perangkat" onClose={() => setMode(null)}><h3 className="font-semibold mb-2">Hapus perangkat?</h3><p className="text-sm">{mode.d.name} akan dihapus.</p>
        <div className="flex justify-end gap-2 mt-3"><button className="btn" onClick={() => setMode(null)}>Batal</button><button className="btn-p" onClick={() => { deleteDevice(mode.d); setMode(null); }}>Hapus</button></div></Modal>)}
    </div>
  );
}
