"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Pause, Play, RefreshCw, Search, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useClock } from "@/hooks/useClock";
import { useShortcuts, type PanelName } from "@/hooks/useShortcuts";
import { NAV } from "./nav";
import GlobalSearch from "./GlobalSearch";
import NotificationCenter from "./NotificationCenter";
import ShortcutHelp from "./ShortcutHelp";
const ic = { size: 18, strokeWidth: 2 };
export default function Shell({ children }: { children: React.ReactNode }) {
  const { ready, cfg, setCfg, notices, refresh, togglePause, toast } = useApp();
  const path = usePathname(); const router = useRouter(); const clock = useClock();
  const [open, setOpen] = useState(false); const [panel, setPanel] = useState<PanelName>(null);
  const panelRef = useRef<PanelName>(null); // nilai panel terbaru secara sinkron (state React bisa terlambat satu render)
  const opener = useRef<HTMLElement | null>(null); const wasOpen = useRef(false);
  useEffect(() => setOpen(false), [path]);
  // Satu panel aktif pada satu waktu; fokus dikembalikan ke elemen pemicu saat panel ditutup.
  const setP = useCallback((next: PanelName) => {
    if (panelRef.current === null && next !== null) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current = next; setPanel(next);
  }, []);
  const show = useCallback((p: Exclude<PanelName, null>) => setP(p), [setP]);
  const hide = useCallback((p?: PanelName) => { if (p === undefined || panelRef.current === p) setP(null); }, [setP]);
  const toggle = useCallback((p: Exclude<PanelName, null>) => setP(panelRef.current === p ? null : p), [setP]);
  useEffect(() => {
    if (panel === null && wasOpen.current) { const el = opener.current; opener.current = null; if (el && el.isConnected) el.focus(); }
    wasOpen.current = panel !== null;
  }, [panel]);
  useShortcuts({
    get panel() { return panelRef.current; }, openSearch: () => show("search"), openHelp: () => show("help"), toggleNotif: () => toggle("notif"), togglePause, refresh, go: (p) => router.push(p),
    escape: () => { if (panelRef.current) hide(); else if (open) setOpen(false); }, // satu langkah: panel aktif, atau drawer jika tidak ada panel
  });
  if (!ready) return <p className="p-6 text-slate-400">Memuat NetWatch…</p>;
  const mini = cfg.collapsed; const unread = notices.filter((n) => !n.read).length;
  return (
    <div className="flex h-screen">
      {open && <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={`${mini ? "md:w-16" : "md:w-52"} w-56 bg-pn border-r border-bd p-2 flex flex-col gap-1 shrink-0 z-30 transition-all max-md:fixed max-md:inset-y-0 ${open ? "max-md:left-0" : "max-md:-left-60 max-md:invisible"}`}>
        <div className="text-neon font-bold p-3 flex items-center justify-between"><span>◉{!mini && " NetWatch"}</span><button className="md:hidden" aria-label="Tutup menu" onClick={() => setOpen(false)}><X {...ic} /></button></div>
        {NAV.map(([href, label, Icon]) => (
          <Link key={href} href={href} title={label} className={`flex items-center gap-3 p-2.5 rounded-lg hover:bg-sky/10 transition-colors ${path === href ? "text-neon bg-sky/10" : "text-slate-400"}`}>
            <Icon {...ic} /><span className={mini ? "md:hidden" : ""}>{label}</span></Link>))}
        <button title="Ciutkan sidebar" className="mt-auto p-2.5 text-slate-400 hidden md:flex items-center gap-3" onClick={() => setCfg({ collapsed: !mini })}>{mini ? <PanelLeftOpen {...ic} /> : <><PanelLeftClose {...ic} />Ciutkan</>}</button>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center gap-2 p-3 bg-pn border-b border-bd flex-wrap">
          <button className="btn md:hidden" aria-label="Buka menu" onClick={() => setOpen(true)}><Menu {...ic} /></button>
          <button className="inp !w-44 sm:!w-60 flex items-center gap-2 text-slate-400 text-left" aria-label="Buka pencarian global" aria-haspopup="dialog" onClick={() => show("search")}><Search size={16} />Cari… <kbd className="ml-auto text-xs hidden sm:inline">Ctrl K</kbd></button>
          <span className="flex-1" />
          <span className="hidden sm:inline text-xs border border-bd rounded-full px-3 py-1" title="Berjalan tanpa internet"><span className="text-neon">●</span> Mode Offline</span>
          <span className="hidden sm:inline text-xs text-slate-400">{clock}</span>
          <button className="btn" title={cfg.paused ? "Lanjutkan simulasi (P)" : "Jeda simulasi (P)"} aria-label="Jeda atau lanjutkan" aria-pressed={cfg.paused} onClick={togglePause}>{cfg.paused ? <Play {...ic} /> : <Pause {...ic} />}</button>
          <button className="btn" title="Segarkan data (R)" aria-label="Segarkan" onClick={refresh}><RefreshCw {...ic} /></button>
          <button className="btn flex items-center gap-1" title="Notifikasi (N)" aria-label={`Notifikasi, ${unread} belum dibaca`} aria-haspopup="dialog" aria-expanded={panel === "notif"} onClick={() => toggle("notif")}><Bell {...ic} /><span data-testid="unread">{unread}</span></button>
          <button className="btn" title="Pintasan keyboard (?)" aria-label="Bantuan pintasan" aria-haspopup="dialog" onClick={() => show("help")}>?</button>
        </header>
        <main className="flex-1 overflow-auto p-4"><div key={path} className="page">{children}</div></main>
      </div>
      {panel === "search" && <GlobalSearch onClose={() => hide("search")} />}{panel === "notif" && <NotificationCenter onClose={() => hide("notif")} />}{panel === "help" && <ShortcutHelp onClose={() => hide("help")} />}
      {toast && <div role="status" className={`fixed right-4 bottom-4 bg-pn border px-4 py-2 rounded-xl z-[60] ${toast.ok ? "border-neon" : "border-red-400"}`}>{toast.m}</div>}
    </div>
  );
}
