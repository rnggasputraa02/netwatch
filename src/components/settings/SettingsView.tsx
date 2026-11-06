"use client";
import { useEffect, useState } from "react";
import { storageBytes } from "@/lib/storage";
import { useApp } from "@/lib/store";
import { VERSION } from "@/lib/version";
import Modal from "@/components/ui/Modal";
import type { AnimLevel } from "@/types";
export function SettingsView() {
  const { cfg, setCfg, devices, history, setDeviceCount, resetAll, clearHistory, notify } = useApp(); const [ask, setAsk] = useState(false); const [bytes, setBytes] = useState(0);
  useEffect(() => setBytes(storageBytes()), [devices, cfg, history]);
  return (
    <div className="card max-w-md space-y-3">
      <label className="block text-sm">Interval pembaruan<select className="inp mt-1" value={cfg.interval} onChange={(e) => { setCfg({ interval: Number(e.target.value) }); notify("Interval diperbarui"); }}>{[1, 2, 5, 10].map((v) => <option key={v} value={v}>{v} detik</option>)}</select></label>
      <label className="block text-sm">Jumlah perangkat simulasi: {devices.length}<input type="range" min={3} max={20} value={devices.length} className="w-full" onChange={(e) => setDeviceCount(Number(e.target.value))} /></label>
      <label className="block text-sm">Animasi<select className="inp mt-1" value={cfg.animLevel} onChange={(e) => setCfg({ animLevel: e.target.value as AnimLevel })}><option value="off">Off</option><option value="subtle">Subtle</option><option value="full">Full</option></select></label>
      <label className="block text-sm">Performa<select className="inp mt-1" value={cfg.perf} onChange={(e) => setCfg({ perf: e.target.value as "normal" | "saver" })}><option value="normal">Normal</option><option value="saver">Hemat tampilan (update 2x lebih jarang, tanpa animasi)</option></select></label>
      <p className="text-xs text-slate-400">Animasi otomatis nonaktif jika sistem meminta reduced motion atau mode hemat aktif.</p>
      <p className="text-xs text-slate-400">NetWatch v{VERSION} · Penyimpanan lokal: {(bytes / 1024).toFixed(1)} KB · {history.length} titik riwayat · Data seluruhnya simulasi.</p>
      <div className="flex gap-2"><button className="btn" onClick={clearHistory}>Hapus Riwayat Trafik</button><button className="btn text-red-400" onClick={() => setAsk(true)}>Reset Semua Data</button></div>
      {ask && <Modal label="Konfirmasi reset data" onClose={() => setAsk(false)}><h3 className="font-semibold mb-3">Reset semua data?</h3><p className="text-sm mb-3">Perangkat, log, notifikasi, riwayat, dan pengaturan kembali ke awal.</p><div className="flex justify-end gap-2"><button className="btn" onClick={() => setAsk(false)}>Batal</button><button className="btn-p" onClick={() => { resetAll(); setAsk(false); }}>Reset</button></div></Modal>}
    </div>
  );
}
