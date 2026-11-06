import type { ReactNode } from "react";
export const RANGES = [[60, "1 menit"], [300, "5 menit"], [900, "15 menit"], [3600, "1 jam"]] as const;
export const Note = () => <p className="text-amber-400 text-xs mb-3">⚠ Seluruh data trafik dan perangkat adalah SIMULASI, bukan hasil pengukuran jaringan nyata.</p>;
export const Ranges = ({ r, set }: { r: number; set: (n: number) => void }) => <div className="flex gap-2 flex-wrap">{RANGES.map(([v, l]) => <button key={v} className={r === v ? "btn-p" : "btn"} onClick={() => set(v)}>{l}</button>)}</div>;
export const Stat = ({ t, v }: { t: string; v: ReactNode }) => <div className="card"><h3 className="text-xs uppercase text-slate-400">{t}</h3><div className="text-2xl font-bold">{v}</div></div>;
