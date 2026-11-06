"use client";
import { useEffect, useRef } from "react";
import { CheckCheck, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
export default function NotificationCenter({ onClose }: { onClose: () => void }) {
  const { notices, markRead, markAllRead, clearNotices } = useApp();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  // Esc menutup panel ini saja; Tab dikunci di dalam panel karena latar belakang menutupi halaman.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key !== "Tab") return;
    const f = Array.from(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (f.length === 0) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1], cur = document.activeElement;
    if (e.shiftKey && (cur === first || cur === box.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <>
      <div className="fixed inset-0 z-40" aria-hidden="true" onMouseDown={onClose} />
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="nc-title" onKeyDown={onKeyDown} className="card fixed right-3 top-16 z-50 w-80 max-w-[94vw] max-h-[70vh] overflow-auto focus:outline-none">
        <div className="flex items-center justify-between mb-2"><h3 id="nc-title" className="font-semibold">Notifikasi</h3>
          <span className="flex gap-1"><button className="btn" title="Tandai semua dibaca" aria-label="Tandai semua dibaca" onClick={markAllRead}><CheckCheck size={16} /></button>
            <button className="btn text-red-400" title="Hapus semua notifikasi" aria-label="Hapus semua notifikasi" onClick={clearNotices}><Trash2 size={16} /></button></span></div>
        {notices.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Belum ada notifikasi.</p> : notices.map((n) => (
          <button key={n.id} data-read={n.read} onClick={() => markRead(n.id)} className="w-full text-left py-2 border-t border-bd text-sm flex gap-2">
            <span aria-hidden="true" className={n.read ? "text-transparent" : "text-sky"}>●</span><span className="sr-only">{n.read ? "Sudah dibaca. " : "Belum dibaca. "}</span><span><b>{n.title}</b><br />{n.body}<br /><small className="text-slate-400">{new Date(n.t).toLocaleString("id-ID")} · simulasi</small></span></button>))}
      </div>
    </>
  );
}
