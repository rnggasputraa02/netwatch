import os from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Counters, LiveSnapshot, NetIface, ProbeResult } from "@/types";
import { runCommand, type RunResult } from "./exec.ts";
import { cidrOf, inSubnet, isIPv4, parseIpRouteLinux, parsePing, parseRouteWindows, type GatewayCandidate } from "./parse.ts";
import { parseNetAdapterJson, parseProcNetDev } from "./neighbors.ts";
import { INTERNET_TARGETS } from "./status.ts";
export { INTERNET_TARGETS };
export type Deps = { readFile?: (p: string) => Promise<string>; platform: NodeJS.Platform; interfaces: () => NetIface[]; run: (file: string, args: readonly string[], timeoutMs: number) => Promise<RunResult>; now: () => number; sysRoot?: string };
export function osInterfaces(): NetIface[] {
  const out: NetIface[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list ?? []) {
    if (a.family !== "IPv4" || a.internal) continue; const cidr = cidrOf(a.address, a.netmask); if (!cidr) continue;
    out.push({ name, ipv4: a.address, netmask: a.netmask, cidr, mac: a.mac });
  }
  return out;
}
export const defaultDeps = (): Deps => ({ readFile: (p) => readFile(p, "utf8"), platform: process.platform, interfaces: osInterfaces, run: runCommand, now: () => Date.now(), sysRoot: process.env.SystemRoot });
const sys32 = (d: Deps, exe: string) => (d.sysRoot ? path.win32.join(d.sysRoot, "System32", exe) : exe);
/** Ping ICMP sistem. Host WAJIB IPv4 literal (divalidasi); tidak ada input pengguna yang masuk ke perintah. */
export async function runPing(host: string, d: Deps, count = 4, timeoutMs = 1000): Promise<ProbeResult> {
  const base = { host, method: "icmp" as const };
  const fail = (error: string): ProbeResult => ({ ...base, sent: count, received: 0, lossPct: null, rttMinMs: null, rttAvgMs: null, rttMaxMs: null, error });
  if (!isIPv4(host)) return fail("invalid_host");
  let file: string, args: string[];
  if (d.platform === "win32") { file = sys32(d, "ping.exe"); args = ["-n", String(count), "-w", String(timeoutMs), host]; }
  else if (d.platform === "linux") { file = "ping"; args = ["-n", "-c", String(count), "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), host]; }
  else return fail("platform_not_supported");
  const r = await d.run(file, args, count * timeoutMs + 3000);
  if (r.error === "not_found") return fail("ping_unavailable");
  if (r.error === "timeout") return fail("probe_timeout");
  return { ...base, ...parsePing(r.stdout, count), error: null };
}
async function findGateway(d: Deps): Promise<{ list: GatewayCandidate[]; note: string | null }> {
  let r: RunResult;
  if (d.platform === "win32") { r = await d.run(sys32(d, "route.exe"), ["print", "-4"], 5000); if (r.error) return { list: [], note: "route_unavailable" }; return { list: parseRouteWindows(r.stdout), note: null }; }
  if (d.platform === "linux") { r = await d.run("ip", ["-4", "route", "show", "default"], 5000); if (r.error) return { list: [], note: "route_unavailable" }; return { list: parseIpRouteLinux(r.stdout), note: null }; }
  return { list: [], note: "platform_not_supported" };
}
/** Perintah tetap (tanpa input pengguna). `Ts` = waktu baca di dalam PowerShell (epoch ms): start PowerShell memakan 0,3–2 dtk dan bervariasi, jadi waktu sebelum spawn akan membiaskan laju. */
export const NETADAPTER_CMD = "Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes,@{n='Ts';e={[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}} | ConvertTo-Json -Compress";
/** Counter byte komputer ini (bukan router): Linux /proc/net/dev, Windows PowerShell Get-NetAdapterStatistics (perintah tetap, tanpa input pengguna). */
export async function collectCounters(d: Deps, iface: NetIface | null): Promise<Counters> {
  const base = { ts: d.now(), ifaceName: iface?.name ?? null };
  const fail = (error: string): Counters => ({ ...base, rxBytes: null, txBytes: null, method: null, error });
  if (!iface) return fail("no_active_interface");
  const start = d.now();
  try {
    let rows, method: Counters["method"];
    if (d.platform === "linux") { if (!d.readFile) return fail("counters_unavailable"); rows = parseProcNetDev(await d.readFile("/proc/net/dev")); method = "proc-net-dev"; }
    else if (d.platform === "win32") {
      const r = await d.run(sys32(d, "WindowsPowerShell\\v1.0\\powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command", NETADAPTER_CMD], 8000);
      if (r.error === "not_found") return fail("powershell_unavailable"); if (r.error) return fail("counters_timeout"); rows = parseNetAdapterJson(r.stdout); method = "netadapter-powershell";
    } else return fail("platform_not_supported");
    const row = rows.find((x) => x.name.toLowerCase() === iface.name.toLowerCase()); if (!row) return fail("counters_unavailable");
    const end = d.now(); const ts = row.ts !== undefined && row.ts >= start - 1000 && row.ts <= end + 1000 ? row.ts : end; // waktu baca sebenarnya; fallback: waktu selesai
    return { ...base, ts, rxBytes: row.rx, txBytes: row.tx, method, error: null };
  } catch { return fail("counters_unavailable"); }
}
export async function detectNetwork(d: Deps): Promise<{ interfaces: NetIface[]; gatewayIp: string | null; active: NetIface | null }> {
  const interfaces = d.interfaces(); const g = await findGateway(d); const cand = g.list[0] ?? null; let active: NetIface | null = null;
  if (cand) active = interfaces.find((i) => (cand.ifaceIp && i.ipv4 === cand.ifaceIp) || (cand.ifaceName && i.name === cand.ifaceName)) ?? interfaces.find((i) => inSubnet(cand.gateway, i.ipv4, i.netmask)) ?? null;
  return { interfaces, gatewayIp: cand?.gateway ?? null, active };
}
export async function collectSnapshot(internetTarget: string, d: Deps = defaultDeps()): Promise<LiveSnapshot> {
  const notes: string[] = []; const interfaces = d.interfaces();
  if (interfaces.length === 0) notes.push("no_active_interface");
  const g = await findGateway(d); if (g.note) notes.push(g.note);
  const cand = g.list[0] ?? null; if (!cand && !g.note) notes.push("gateway_not_found");
  let active: NetIface | null = null;
  if (cand) active = interfaces.find((i) => (cand.ifaceIp && i.ipv4 === cand.ifaceIp) || (cand.ifaceName && i.name === cand.ifaceName)) ?? interfaces.find((i) => inSubnet(cand.gateway, i.ipv4, i.netmask)) ?? null;
  const gwIp = cand?.gateway ?? null;
  const [gwProbe, inetProbe, counters] = await Promise.all([gwIp ? runPing(gwIp, d) : Promise.resolve(null), runPing(internetTarget, d), collectCounters(d, active)]);
  for (const p of [gwProbe, inetProbe]) if (p?.error && !notes.includes(p.error)) notes.push(p.error);
  return { source: "LIVE", ts: d.now(), counters, platform: d.platform, interfaces, activeInterface: active, gateway: { ip: gwIp, probe: gwProbe }, internet: { target: internetTarget, probe: inetProbe }, notes };
}
// Cache singkat + single-flight: banyak tab/klien tidak memicu banyak ping paralel.
const cache = new Map<string, { at: number; p: Promise<LiveSnapshot> }>();
export function cachedSnapshot(target: string, ttlMs = 4000, d: Deps = defaultDeps()): Promise<LiveSnapshot> {
  const hit = cache.get(target); if (hit && d.now() - hit.at < ttlMs) return hit.p;
  const p = collectSnapshot(target, d); cache.set(target, { at: d.now(), p }); p.catch(() => cache.delete(target)); return p;
}
