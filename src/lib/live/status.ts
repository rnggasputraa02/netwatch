import type { LiveCfg, LivePoint, LiveSnapshot, LiveStatus } from "@/types";
export const INTERNET_TARGETS = ["1.1.1.1", "8.8.8.8", "9.9.9.9"] as const;
export const LIVE_POLL_MS = 10_000;
export const LIVE_STALE_MS = 35_000;
export const MAX_LIVE_POINTS = 720;
export const DEFAULT_LIVE_CFG: LiveCfg = { enabled: false, target: "1.1.1.1" };
/** Status sumber LIVE. Tidak pernah jatuh ke data simulasi: gagal/kosong = DISCONNECTED/UNKNOWN. */
export function classifyStatus(i: { enabled: boolean; lastOkTs: number | null; failing: boolean; now: number; staleMs?: number }): LiveStatus {
  const stale = i.staleMs ?? LIVE_STALE_MS;
  if (!i.enabled) return "OFF";
  const age = i.lastOkTs === null ? Infinity : i.now - i.lastOkTs;
  if (i.lastOkTs === null) return i.failing ? "DISCONNECTED" : "UNKNOWN";
  if (i.failing) return age > stale ? "DISCONNECTED" : "STALE";
  return age > stale ? "STALE" : "LIVE";
}
/** Jaringan lokal terputus: probe berjalan normal, tetapi komputer tidak punya default gateway / interface IPv4 aktif (mis. kabel atau Wi-Fi terlepas).
 *  Sengaja TIDAK berlaku untuk `route_unavailable`/`platform_not_supported` (penyebab tidak diketahui) agar tidak memicu alarm palsu. */
export const localLinkLost = (s: Pick<LiveSnapshot, "gateway" | "notes">): boolean =>
  s.gateway.ip === null && (s.notes.includes("gateway_not_found") || s.notes.includes("no_active_interface"));
export const toPoint = (s: LiveSnapshot): LivePoint => ({
  id: `p${s.ts}`, t: s.ts, gwRtt: s.gateway.probe?.rttAvgMs ?? null, gwLoss: s.gateway.probe?.lossPct ?? null, inetRtt: s.internet.probe?.rttAvgMs ?? null, inetLoss: s.internet.probe?.lossPct ?? null,
});
const cell = (v: number | null) => (v === null ? "" : String(v)); // nilai tidak tersedia = sel kosong, bukan 0
export function liveCsv(points: LivePoint[]): string {
  const rows = points.map((p) => ["LIVE", new Date(p.t).toISOString(), cell(p.gwRtt), cell(p.gwLoss), cell(p.inetRtt), cell(p.inetLoss)].join(","));
  return "\ufeff" + ["Sumber,Waktu (ISO),Gateway RTT (ms),Gateway loss (%),Internet RTT (ms),Internet loss (%)", ...rows].join("\r\n");
}
/** Alasan counter throughput komputer tidak tersedia (Counters.error). Tidak ada angka ditampilkan pada kondisi ini. */
export const COUNTER_WHY: Record<string, string> = {
  no_active_interface: "Tidak ada interface aktif untuk diukur.", counters_unavailable: "Counter adapter aktif tidak ditemukan (mis. adapter virtual/VPN menjadi rute default).",
  powershell_unavailable: "PowerShell tidak ditemukan, sehingga counter adapter tidak dapat dibaca.", counters_timeout: "Pembacaan counter PowerShell melewati batas waktu atau gagal.",
  platform_not_supported: "Platform ini belum didukung untuk pembacaan counter.",
};
export const NOTE_TEXT: Record<string, string> = {
  ping_unavailable: "Perintah ping tidak ditemukan di sistem ini, sehingga latency dan packet loss tidak dapat diukur.",
  route_unavailable: "Tabel rute tidak dapat dibaca, sehingga default gateway tidak diketahui.",
  gateway_not_found: "Default gateway tidak ditemukan (komputer mungkin tidak terhubung ke jaringan).",
  no_active_interface: "Tidak ada interface IPv4 aktif.", probe_timeout: "Probe melewati batas waktu.",
  platform_not_supported: "Platform ini belum didukung untuk probe nyata (didukung: Windows dan Linux).", invalid_host: "Target probe tidak valid.",
};
