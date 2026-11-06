import type { Device, HistoryPoint, LogEntry, Notice, Settings } from "@/types";
/** Membaca LocalStorage dengan validasi; data kosong, rusak, atau tidak valid memakai fallback. */
export function load<T>(key: string, fallback: T, guard: (v: unknown) => v is T): T {
  try { const raw = window.localStorage.getItem(key); if (!raw) return fallback; const v: unknown = JSON.parse(raw); return guard(v) ? v : fallback; } catch { return fallback; }
}
export function save<T>(key: string, value: T): boolean {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
export const isDevices = (v: unknown): v is Device[] => Array.isArray(v) && v.every((d) => rec(d) && typeof d.id === "string" && typeof d.name === "string" && typeof d.ip === "string" && typeof d.mac === "string" && typeof d.os === "string" && typeof d.online === "boolean" && typeof d.bw === "number" && typeof d.seen === "number");
export const isLogs = (v: unknown): v is LogEntry[] => Array.isArray(v) && v.every((l) => rec(l) && typeof l.id === "string" && typeof l.t === "number" && typeof l.desc === "string");
export const isSettings = (v: unknown): v is Settings => rec(v) && fin(v.interval) && v.interval >= 1 && v.interval <= 60 && typeof v.paused === "boolean" && (v.animLevel === "off" || v.animLevel === "subtle" || v.animLevel === "full") && (v.perf === "normal" || v.perf === "saver") && typeof v.collapsed === "boolean";
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const isDevice = (d: unknown): d is Device => rec(d) && typeof d.id === "string" && d.id !== "" && typeof d.name === "string" && typeof d.ip === "string" && typeof d.mac === "string" && typeof d.os === "string" && typeof d.type === "string" && typeof d.online === "boolean" && fin(d.bw) && fin(d.seen);
export const isLog = (l: unknown): l is LogEntry => rec(l) && typeof l.id === "string" && fin(l.t) && typeof l.name === "string" && typeof l.desc === "string" && (l.type === "Sistem" || l.type === "Perangkat" || l.type === "Jaringan") && (l.pr === "Rendah" || l.pr === "Sedang" || l.pr === "Tinggi");
export const isNotice = (n: unknown): n is Notice => rec(n) && typeof n.id === "string" && fin(n.t) && typeof n.key === "string" && typeof n.title === "string" && typeof n.body === "string" && typeof n.read === "boolean";
/** Membaca daftar dari LocalStorage; entri rusak dibuang satu per satu (bukan seluruh daftar), id ganda dibuang, dan jumlah dibatasi. */
export function loadList<T extends { id: string }>(key: string, fallback: T[], guard: (v: unknown) => v is T, max = Infinity): T[] {
  try {
    const raw = window.localStorage.getItem(key); if (raw === null) return fallback;
    const v: unknown = JSON.parse(raw); if (!Array.isArray(v)) return fallback;
    const seen = new Set<string>();
    return v.filter((x): x is T => guard(x) && !seen.has(x.id) && !!seen.add(x.id)).slice(0, max);
  } catch { return fallback; }
}
/** Pengaturan: tiap bidang divalidasi sendiri; bidang rusak memakai nilai bawaan, bidang valid tetap dipakai. */
export function loadSettings(def: Settings): Settings {
  try {
    const raw = window.localStorage.getItem("nw2_cfg"); if (!raw) return def;
    const v: unknown = JSON.parse(raw); if (!rec(v)) return def;
    return {
      interval: fin(v.interval) && v.interval >= 1 && v.interval <= 60 ? v.interval : def.interval,
      paused: typeof v.paused === "boolean" ? v.paused : def.paused,
      collapsed: typeof v.collapsed === "boolean" ? v.collapsed : def.collapsed,
      animLevel: v.animLevel === "off" || v.animLevel === "subtle" || v.animLevel === "full" ? v.animLevel : def.animLevel,
      perf: v.perf === "normal" || v.perf === "saver" ? v.perf : def.perf,
    };
  } catch { return def; }
}
export function storageBytes(): number { try { return ["nw2_dev", "nw2_log", "nw2_cfg", "nw2_not", "nw2_hist", "nw3_scn", "nw3_alerts", "nw3_rules", "nw3_live", "nw3_live_hist"].reduce((s, k) => s + (window.localStorage.getItem(k)?.length ?? 0), 0); } catch { return 0; } }
export const MAX_HISTORY = 1800;
export const isNotices = (v: unknown): v is Notice[] => Array.isArray(v) && v.every((n) => rec(n) && typeof n.id === "string" && typeof n.t === "number" && typeof n.key === "string" && typeof n.title === "string" && typeof n.body === "string" && typeof n.read === "boolean");
/** Riwayat trafik: titik rusak dibuang satu per satu, jumlah dibatasi agar LocalStorage tidak penuh. */
export function loadHistory(): HistoryPoint[] {
  try {
    const raw = window.localStorage.getItem("nw2_hist"); if (!raw) return [];
    const v: unknown = JSON.parse(raw); if (!Array.isArray(v)) return [];
    return v.filter((p): p is HistoryPoint => rec(p) && Number.isFinite(p.t) && Number.isFinite(p.down) && Number.isFinite(p.up)).sort((a, b) => a.t - b.t).slice(-MAX_HISTORY);
  } catch { return []; }
}
