import type { ProbeResult } from "@/types";
/** Parser murni (tanpa I/O) untuk keluaran perintah sistem. Bebas dari bahasa OS: hanya memakai angka/pola TTL. */
export const isIPv4 = (s: string): boolean => /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s);
export const ipToInt = (ip: string): number => ip.split(".").reduce((a, x) => a * 256 + Number(x), 0);
export function prefixFromMask(mask: string): number | null {
  if (!isIPv4(mask)) return null;
  const bits = ipToInt(mask).toString(2).padStart(32, "0");
  return /^1*0*$/.test(bits) ? bits.indexOf("0") === -1 ? 32 : bits.indexOf("0") : null;
}
export function cidrOf(ip: string, mask: string): string | null {
  const p = prefixFromMask(mask); if (p === null || !isIPv4(ip)) return null;
  const m = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0; const n = (ipToInt(ip) & m) >>> 0;
  return `${[n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".")}/${p}`;
}
export function inSubnet(ip: string, ifaceIp: string, mask: string): boolean { const c = cidrOf(ifaceIp, mask); return !!c && cidrOf(ip, mask) === c; }
export const isLoopbackHost = (hostHeader: string): boolean => {
  const h = hostHeader.trim().toLowerCase().replace(/:\d+$/, "");
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
};
type Counts = Pick<ProbeResult, "sent" | "received" | "lossPct" | "rttMinMs" | "rttAvgMs" | "rttMaxMs">;
/** Menghitung balasan dari baris ber-TTL dan RTT dari "time=/waktu=" (<1ms dicatat 1 ms sebagai batas atas). */
export function parsePing(stdout: string, sent: number): Counts {
  const lines = stdout.split(/\r?\n/); let received = 0; const rtts: number[] = [];
  for (const l of lines) {
    if (!/ttl[=:]/i.test(l)) continue; received++;
    const m = l.match(/(?:time|waktu|zeit|tiempo|temps)\s*([=<])\s*([\d.,]+)\s*ms/i);
    if (m) { const v = Number(m[2].replace(",", ".")); if (Number.isFinite(v)) rtts.push(m[1] === "<" ? Math.max(v, 1) : v); }
  }
  received = Math.min(received, sent);
  const lossPct = sent > 0 ? Math.round(((sent - received) / sent) * 1000) / 10 : null;
  const ok = received > 0 && rtts.length > 0;
  return { sent, received, lossPct, rttMinMs: ok ? Math.min(...rtts) : null, rttAvgMs: ok ? Math.round((rtts.reduce((a, b) => a + b, 0) / rtts.length) * 10) / 10 : null, rttMaxMs: ok ? Math.max(...rtts) : null };
}
export type GatewayCandidate = { gateway: string; ifaceIp: string | null; ifaceName: string | null; metric: number };
/** `route print -4` (Windows): kolom Network Destination, Netmask, Gateway, Interface, Metric. */
export function parseRouteWindows(stdout: string): GatewayCandidate[] {
  const out: GatewayCandidate[] = [];
  for (const l of stdout.split(/\r?\n/)) {
    const m = l.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\S+)\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\d+)\s*$/);
    if (m && isIPv4(m[1]) && isIPv4(m[2])) out.push({ gateway: m[1], ifaceIp: m[2], ifaceName: null, metric: Number(m[3]) });
  }
  return out.sort((a, b) => a.metric - b.metric);
}
/** `ip -4 route show default` (Linux). */
export function parseIpRouteLinux(stdout: string): GatewayCandidate[] {
  const out: GatewayCandidate[] = [];
  for (const l of stdout.split(/\r?\n/)) {
    const m = l.match(/^default\s+via\s+(\S+)\s+dev\s+(\S+)(?:.*?\smetric\s+(\d+))?/);
    if (m && isIPv4(m[1])) out.push({ gateway: m[1], ifaceIp: null, ifaceName: m[2], metric: m[3] ? Number(m[3]) : 0 });
  }
  return out.sort((a, b) => a.metric - b.metric);
}
