import dns from "node:dns/promises";
import { readFile } from "node:fs/promises";
import type { RouterStatus } from "@/types";
import { DiscoveryJob, type DiscDeps } from "../live/discovery.ts";
import { parseArpWindows, parseProcNetArp } from "../live/neighbors.ts";
import { defaultDeps, detectNetwork, runPing } from "../live/snapshot.ts";
import { queryRouter, realUpnpDeps } from "../live/upnp.ts";
import path from "node:path";
const g = globalThis as unknown as { __nwDisc?: DiscoveryJob; __nwRouter?: { at: number; p: Promise<RouterStatus> } };
export const discovery = (g.__nwDisc ??= new DiscoveryJob()); // bertahan saat HMR; satu pekerjaan per proses
export function realDiscDeps(): DiscDeps {
  const d = defaultDeps();
  return {
    now: d.now, network: async () => { const n = await detectNetwork(d); return { iface: n.active ?? n.interfaces[0] ?? null, gatewayIp: n.gatewayIp }; },
    ping: async (ip) => { const p = await runPing(ip, d, 1, 800); return p.error === "ping_unavailable" ? null : p.received > 0; },
    neighbors: async () => {
      if (d.platform === "linux") return parseProcNetArp(await readFile("/proc/net/arp", "utf8"));
      if (d.platform === "win32") { const r = await d.run(path.win32.join(d.sysRoot ?? "C:\\Windows", "System32", "arp.exe"), ["-a"], 5000); return r.error ? [] : parseArpWindows(r.stdout); }
      return [];
    },
    reverse: async (ip) => { const r = await Promise.race([dns.reverse(ip), new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 1000))]); return r[0] ? r[0].slice(0, 120) : null; },
  };
}
/** Status router di-cache 5 detik dan single-flight (tab/klien ganda tidak memicu banyak SSDP). */
export function routerStatus(): Promise<RouterStatus> {
  const hit = g.__nwRouter; if (hit && Date.now() - hit.at < 5000) return hit.p;
  const d = defaultDeps(); const p = detectNetwork(d).then((n) => queryRouter({ gatewayIp: n.gatewayIp, bindIp: n.active?.ipv4 ?? null }, realUpnpDeps()));
  g.__nwRouter = { at: Date.now(), p }; p.catch(() => { g.__nwRouter = undefined; }); return p;
}
