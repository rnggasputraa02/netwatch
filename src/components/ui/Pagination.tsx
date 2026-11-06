"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
type Props = { total: number; page: number; size: number; onPage: (p: number) => void; onSize: (s: number) => void };
export default function Pagination({ total, page, size, onPage, onSize }: Props) {
  const pages = Math.max(1, Math.ceil(total / size)); const cur = Math.min(page, pages);
  const from = total === 0 ? 0 : (cur - 1) * size + 1, to = Math.min(total, cur * size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-slate-400">
      <span>Menampilkan {from}–{to} dari {total} data</span>
      <div className="flex items-center gap-2">
        <select aria-label="Data per halaman" className="inp !w-auto" value={size} onChange={(e) => onSize(Number(e.target.value))}>{[5, 10, 25, 50].map((s) => <option key={s} value={s}>{s} / hal</option>)}</select>
        <button className="btn" aria-label="Sebelumnya" disabled={cur <= 1} onClick={() => onPage(cur - 1)}><ChevronLeft size={16} strokeWidth={2} /></button>
        <span className="text-slate-200">{cur} / {pages}</span>
        <button className="btn" aria-label="Berikutnya" disabled={cur >= pages} onClick={() => onPage(cur + 1)}><ChevronRight size={16} strokeWidth={2} /></button>
      </div>
    </div>
  );
}
