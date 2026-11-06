import type { Neighbor } from "@/types";
import { ipToInt, isIPv4 } from "./parse.ts";
export const normMac = (m: string) => m.toLowerCase().replace(/-/g, ":");
const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
/** MAC dengan bit "locally administered" menandakan alamat privat/acak (mis. fitur privasi ponsel); bukan bukti jenis perangkat. */
export const isPrivateMac = (mac: string) => (parseInt(mac.slice(0, 2), 16) & 2) !== 0;
export function usableNeighbor(n: Neighbor): boolean {
  if (!isIPv4(n.ip) || !MAC.test(n.mac)) return false; const mac = normMac(n.mac); const first = ipToInt(n.ip) >>> 24;
  return mac !== "ff:ff:ff:ff:ff:ff" && mac !== "00:00:00:00:00:00" && !mac.startsWith("01:00:5e") && !mac.startsWith("33:33") && first < 224 && n.ip !== "255.255.255.255" && first !== 127;
}
/** `arp -a` Windows (kolom numerik; tipe "dynamic/dinamis" tidak diandalkan). */
export function parseArpWindows(out: string): Neighbor[] {
  const r: Neighbor[] = [];
  for (const l of out.split(/\r?\n/)) { const m = l.match(/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})\s+\S+/i); if (m) { const n = { ip: m[1], mac: normMac(m[2]) }; if (usableNeighbor(n)) r.push(n); } }
  return r;
}
/** /proc/net/arp (Linux). Entri flags 0x0 (tidak lengkap) dibuang. */
export function parseProcNetArp(text: string): Neighbor[] {
  const r: Neighbor[] = [];
  for (const l of text.split(/\r?\n/).slice(1)) { const c = l.trim().split(/\s+/); if (c.length < 6 || c[2] === "0x0") continue; const n = { ip: c[0], mac: normMac(c[3]) }; if (usableNeighbor(n)) r.push(n); }
  return r;
}
export type CounterRow = { name: string; rx: number; tx: number; ts?: number };
export function parseProcNetDev(text: string): CounterRow[] {
  const r: CounterRow[] = [];
  for (const l of text.split(/\r?\n/).slice(2)) { const m = l.match(/^\s*([^:\s]+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/); if (m) r.push({ name: m[1], rx: Number(m[2]), tx: Number(m[3]) }); }
  return r;
}
/** Keluaran `Get-NetAdapterStatistics | ConvertTo-Json`: objek tunggal atau larik. */
export function parseNetAdapterJson(text: string): CounterRow[] {
  try {
    const j: unknown = JSON.parse(text.replace(/^\uFEFF/, "")); const arr = Array.isArray(j) ? j : [j]; const r: CounterRow[] = [];
    for (const o of arr) { if (typeof o === "object" && o !== null) { const x = o as Record<string, unknown>; if (typeof x.Name === "string" && typeof x.ReceivedBytes === "number" && typeof x.SentBytes === "number" && Number.isFinite(x.ReceivedBytes) && Number.isFinite(x.SentBytes)) r.push({ name: x.Name, rx: x.ReceivedBytes, tx: x.SentBytes, ...(typeof x.Ts === "number" && Number.isFinite(x.Ts) ? { ts: x.Ts } : {}) }); } }
    return r;
  } catch { return []; }
}
