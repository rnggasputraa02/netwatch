"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "@/lib/store";
import { NAV } from "./nav";
type Item = { cat: string; label: string; sub?: string; go: () => void };
export default function GlobalSearch({ onClose }: { onClose: () => void }) {
  const { devices, logs, setFocus, setQuery } = useApp(); const router = useRouter();
  const [q, setQ] = useState(""); const [act, setAct] = useState(0);
  const items = useMemo<Item[]>(() => {
    const s = q.trim().toLowerCase(); const m = (t: string) => !s || t.toLowerCase().includes(s); const out: Item[] = [];
    NAV.filter(([, l]) => m(l)).forEach(([h, l]) => out.push({ cat: "Halaman", label: l, go: () => router.push(h) }));
    if (s) {
      devices.filter((d) => m(`${d.name} ${d.ip} ${d.mac} ${d.type}`)).slice(0, 6).forEach((d) => out.push({ cat: "Perangkat", label: d.name, sub: `${d.ip} · ${d.type}`, go: () => { setQuery(""); setFocus({ kind: "device", value: d.id }); router.push("/devices"); } }));
      logs.filter((l) => m(`${l.name} ${l.desc}`)).slice(0, 6).forEach((l) => out.push({ cat: "Log", label: l.desc, sub: `${l.name} · ${new Date(l.t).toLocaleString("id-ID")}`, go: () => { setFocus({ kind: "log", value: l.desc }); router.push("/logs"); } }));
    }
    return out;
  }, [q, devices, logs, router, setFocus, setQuery]);
  const cur = Math.min(act, Math.max(0, items.length - 1));
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`#gs-opt-${cur}`)?.scrollIntoView({ block: "nearest" }); }, [cur]);
  const pick = (i: Item | undefined) => { if (i) { i.go(); onClose(); } };
  // Esc menutup panel ini saja (preventDefault agar pendengar global tidak memprosesnya lagi); Tab tetap di kolom cari.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAct(Math.min(cur + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAct(Math.max(cur - 1, 0)); }
    else if (e.key === "Home" && items.length) { e.preventDefault(); setAct(0); }
    else if (e.key === "End" && items.length) { e.preventDefault(); setAct(items.length - 1); }
    else if (e.key === "Enter") { if (!e.nativeEvent.isComposing) { e.preventDefault(); pick(items[cur]); } }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") e.preventDefault();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-20 px-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Pencarian global" className="card w-full max-w-lg">
        <div className="flex items-center gap-2"><Search size={18} className="text-slate-400" aria-hidden="true" />
          <input autoFocus className="inp" placeholder="Cari perangkat, log, atau halaman…" aria-label="Cari perangkat, log, atau halaman" role="combobox" aria-expanded={items.length > 0} aria-controls="gs-list" aria-autocomplete="list"
            aria-activedescendant={items.length ? `gs-opt-${cur}` : undefined} value={q} onChange={(e) => { setQ(e.target.value); setAct(0); }} onKeyDown={onKeyDown} /></div>
        <p role="status" className="sr-only">{items.length === 0 ? "Tidak ada hasil" : `${items.length} hasil`}</p>
        <div ref={list} id="gs-list" role="listbox" aria-label="Hasil pencarian" className="mt-2 max-h-80 overflow-auto">
          {items.length === 0 ? <p className="text-center text-slate-400 text-sm py-6">Tidak ada hasil untuk &quot;{q}&quot;.</p> : items.map((it, i) => (
            <div key={`${it.cat}${i}`}>{(i === 0 || items[i - 1].cat !== it.cat) && <p aria-hidden="true" className="text-xs uppercase text-slate-400 mt-2 mb-1">{it.cat}</p>}
              <div id={`gs-opt-${i}`} role="option" aria-selected={i === cur} aria-label={`${it.cat}: ${it.label}${it.sub ? `, ${it.sub}` : ""}`} className={`w-full text-left px-2 py-1.5 rounded-lg text-sm cursor-pointer ${i === cur ? "bg-sky/20" : "hover:bg-sky/10"}`} onMouseEnter={() => setAct(i)} onClick={() => pick(it)}>{it.label}{it.sub && <span className="block text-xs text-slate-400">{it.sub}</span>}</div></div>))}
        </div>
      </div>
    </div>
  );
}
