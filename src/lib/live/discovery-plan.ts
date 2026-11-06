import { ipToInt, isIPv4, prefixFromMask } from "./parse.ts";
export const isPrivateIPv4 = (ip: string): boolean => { if (!isIPv4(ip)) return false; const n = ipToInt(ip); return n >>> 24 === 10 || n >>> 20 === 0xac1 || n >>> 16 === 0xc0a8; };
const toIp = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
export type Plan = { ok: true; subnet: string; targets: string[]; narrowed: boolean; capped: boolean } | { ok: false; reason: string };
/** Daftar target pemindaian aktif: hanya subnet privat milik interface sendiri, maksimal /24 (254 host), tanpa IP sendiri/network/broadcast. */
export function planTargets(iface: { ipv4: string; netmask: string }, max = 254): Plan {
  const p0 = prefixFromMask(iface.netmask); if (p0 === null || !isIPv4(iface.ipv4)) return { ok: false, reason: "mask_invalid" };
  if (!isPrivateIPv4(iface.ipv4)) return { ok: false, reason: "not_private_subnet" };
  if (p0 >= 31) return { ok: false, reason: "subnet_too_small" };
  const p = Math.max(p0, 24); const mask = (0xffffffff << (32 - p)) >>> 0; const net = (ipToInt(iface.ipv4) & mask) >>> 0; const bc = (net | (~mask >>> 0)) >>> 0;
  const all: string[] = []; for (let n = net + 1; n < bc; n++) if (toIp(n) !== iface.ipv4) all.push(toIp(n));
  const cap = Math.min(max, 254);
  return { ok: true, subnet: `${toIp(net)}/${p}`, targets: all.slice(0, cap), narrowed: p !== p0, capped: all.length > cap };
}
export const sameSubnet = (ip: string, subnetCidr: string): boolean => { const [n, p] = subnetCidr.split("/"); const m = (0xffffffff << (32 - Number(p))) >>> 0; return isIPv4(ip) && (ipToInt(ip) & m) >>> 0 === ipToInt(n); };
/** Menjalankan fn pada semua item dengan batas konkurensi dan jeda antar peluncuran (pembatas kecepatan); berhenti bila shouldStop() true. */
export async function runLimited<T>(items: T[], limit: number, delayMs: number, fn: (x: T) => Promise<void>, shouldStop: () => boolean): Promise<number> {
  let i = 0, done = 0;
  const worker = async () => { while (!shouldStop()) { const idx = i++; if (idx >= items.length) return; if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs)); if (shouldStop()) return; await fn(items[idx]); done++; } };
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker)); return done;
}
