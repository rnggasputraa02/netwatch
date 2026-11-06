"use client";
import { useEffect, useRef } from "react";
/** Dialog native (showModal): fokus terkunci di dalam dialog dan dikembalikan ke pemicu saat ditutup; Esc menutup. */
export default function Modal({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={label} className="bg-pn text-slate-200 border border-bd rounded-2xl w-[380px] max-w-[92vw] p-5 backdrop:bg-black/60">
      {children}
    </dialog>
  );
}
