"use client";
import { useEffect, useRef } from "react";
import { createKeyHandler, type ShortcutHandlers } from "@/lib/shortcuts-core";
export type { PanelName, ShortcutHandlers } from "@/lib/shortcuts-core";
export const SHORTCUTS: readonly (readonly [string, string])[] = [
  ["Ctrl+K atau /", "Buka pencarian global"], ["?", "Bantuan pintasan"], ["G lalu D", "Dasbor"], ["G lalu P", "Perangkat"], ["G lalu B", "Bandwidth"],
  ["G lalu T", "Topologi"], ["G lalu L", "Log Aktivitas"], ["G lalu S", "Pengaturan"], ["G lalu A", "Tentang"], ["N", "Pusat notifikasi"],
  ["P", "Jeda atau lanjutkan simulasi"], ["R", "Segarkan data"], ["Esc", "Tutup panel"],
];
/**
 * Pintasan global. Nonaktif saat mengetik/memilih opsi di kontrol formulir dan saat ada dialog atau panel terbuka
 * (kecuali Esc untuk menutup panel). Satu listener keydown, dibersihkan saat unmount.
 */
export function useShortcuts(h: ShortcutHandlers) {
  const ref = useRef(h);
  useEffect(() => { ref.current = h; });
  useEffect(() => {
    const onKey = createKeyHandler(() => ref.current);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
