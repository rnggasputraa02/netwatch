const STYLE: Record<string, string> = {
  SIMULATION: "border-amber-400 text-amber-400", LIVE: "border-neon text-neon", STALE: "border-orange-400 text-orange-400",
  DISCONNECTED: "border-red-400 text-red-400", UNKNOWN: "border-slate-400 text-slate-300", OFF: "border-slate-500 text-slate-400",
};
/** Penanda sumber data. Teks selalu ditampilkan (tidak mengandalkan warna saja). */
export default function SourceBadge({ kind }: { kind: string }) {
  return <span data-source={kind} className={`inline-block border rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${STYLE[kind] ?? STYLE.UNKNOWN}`}>{kind}</span>;
}
