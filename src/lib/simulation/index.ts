import type { Device, HistoryPoint } from "@/types";
const base: [string, string, string, string, boolean, number][] = [
  ["Laptop Utama", "192.168.1.2", "Laptop", "Windows 11", true, 18], ["Router Utama", "192.168.1.1", "Router", "RouterOS", true, 42],
  ["Switch Lab", "192.168.1.3", "Switch", "Firmware 2.1", true, 27], ["Access Point", "192.168.1.4", "Access Point", "OpenWrt", true, 35],
  ["Printer Kantor", "192.168.1.20", "Printer", "Firmware 1.8", false, 0], ["Ponsel Andi", "192.168.1.31", "Ponsel", "Android 14", true, 9],
  ["Kamera CCTV", "192.168.1.50", "Kamera", "Linux Embedded", true, 14], ["Server NAS", "192.168.1.60", "Server", "Ubuntu Server", true, 22],
];
const mac = (i: number) => `02:00:5E:10:00:${(i + 16).toString(16).toUpperCase().padStart(2, "0")}`;
export function seedDevices(count = 8): Device[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const b = base[i];
    return b ? { id: `d${i + 1}`, name: b[0], ip: b[1], mac: mac(i), os: b[3], type: b[2], online: b[4], bw: b[5], seen: now - i * 90000 }
      : { id: `d${i + 1}`, name: `Perangkat Sim ${i + 1}`, ip: `192.168.1.${70 + i}`, mac: mac(i), os: "Android 14", type: "Ponsel", online: true, bw: 8, seen: now };
  });
}
/** Pola trafik halus dan deterministik (simulasi); upload dan download berpola berbeda. */
export function traffic(tSec: number, down: boolean): number {
  const s = tSec / 60, k = down ? 1 : 0;
  return Math.max(2, (down ? 38 : 14) + (down ? 16 : 6) * Math.sin(s / 3.1 + k) + (down ? 7 : 3) * Math.sin(s * 1.7 + 2 * k) + 1.5 * Math.sin(tSec * 0.9 + k));
}
export function series(rangeSec: number, down: boolean, n: number, nowMs: number): number[] {
  const now = nowMs / 1000;
  return Array.from({ length: n }, (_, i) => traffic(now - rangeSec + (i * rangeSec) / (n - 1), down));
}
export const stats = (a: number[]) => ({ avg: a.reduce((x, y) => x + y, 0) / a.length, max: Math.max(...a), min: Math.min(...a) });
/** Mesin simulasi: fungsi murni tanpa ketergantungan UI. */
export function stepBandwidth(list: Device[], n: number): Device[] {
  return list.map((d) => d.online ? { ...d, bw: Math.max(1, Math.min(90, d.bw + Math.sin(n / 9000 + d.name.length) * 1.2)), seen: n } : d);
}
export function pickFlip(list: Device[], r1: number, r2: number): Device | null {
  return r1 < 0.06 && list.length ? list[Math.floor(r2 * list.length)] : null;
}
export function historyPoint(n: number): HistoryPoint {
  return { t: n, down: +traffic(n / 1000, true).toFixed(2), up: +traffic(n / 1000, false).toFixed(2) };
}
/** Menambah/memangkas perangkat hingga n tanpa bentrok id atau IP dengan perangkat yang sudah ada (termasuk buatan pengguna). */
export function growDevices(list: Device[], n: number): Device[] {
  if (n <= list.length) return list.slice(0, n);
  const ids = new Set(list.map((d) => d.id)), ips = new Set(list.map((d) => d.ip)); const out = [...list];
  const pool = seedDevices(20).filter((d) => !ids.has(d.id) && !ips.has(d.ip));
  for (const d of pool) { if (out.length >= n) break; out.push(d); ids.add(d.id); ips.add(d.ip); }
  let k = 1, h = 70;
  while (out.length < n) {
    while (ids.has(`d${k}`)) k++;
    while (ips.has(`192.168.1.${h}`) && h < 254) h++;
    out.push({ id: `d${k}`, name: `Perangkat Sim ${k}`, ip: `192.168.1.${h}`, mac: mac(k - 1), os: "Android 14", type: "Ponsel", online: true, bw: 8, seen: Date.now() });
    ids.add(`d${k}`); ips.add(`192.168.1.${h}`);
  }
  return out;
}
const ipNum = (s: string) => s.split(".").reduce((a, x) => a * 256 + Number(x), 0);
/** Pembanding kolom perangkat: IP diurutkan numerik, teks secara natural (Perangkat 2 < Perangkat 12). */
export function compareDevices(a: Device, b: Device, k: keyof Device): number {
  if (k === "ip") return ipNum(a.ip) - ipNum(b.ip);
  const x = a[k], y = b[k];
  if (typeof x === "string" && typeof y === "string") return x.localeCompare(y, "id", { numeric: true, sensitivity: "base" });
  return Number(x) - Number(y);
}
