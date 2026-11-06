import type { DiscoveredHost, DiscoveryResult, DiscoveryStatus, NetIface, Neighbor } from "@/types";
import { planTargets, runLimited, sameSubnet } from "./discovery-plan.ts";
export type DiscDeps = {
  network: () => Promise<{ iface: NetIface | null; gatewayIp: string | null }>; ping: (ip: string) => Promise<boolean | null>; neighbors: () => Promise<Neighbor[]>;
  reverse: (ip: string) => Promise<string | null>; now: () => number; concurrency?: number; delayMs?: number; minGapMs?: number;
};
const idle = (): DiscoveryStatus => ({ state: "idle", mode: null, startedAt: null, finishedAt: null, total: 0, probed: 0, found: 0, subnet: null, reason: null, stopped: false });
/** Satu pekerjaan discovery pada satu waktu. Pasif = baca tabel ARP; aktif = ping terbatas ke subnet lokal (maks 254 host, konkurensi rendah) lalu baca ARP. */
export class DiscoveryJob {
  status: DiscoveryStatus = idle(); hosts: DiscoveredHost[] = []; self: DiscoveryResult["self"] = null; gatewayIp: string | null = null; private stopFlag = false; private lastStart = 0;
  result(): DiscoveryResult { return { status: { ...this.status }, hosts: this.hosts, self: this.self, gatewayIp: this.gatewayIp }; }
  stop(): boolean { if (this.status.state !== "running") return false; this.stopFlag = true; this.status.state = "stopping"; return true; }
  start(mode: "passive" | "active", hostnames: boolean, d: DiscDeps): { ok: true } | { ok: false; code: "already_running" | "rate_limited" } {
    if (this.status.state === "running" || this.status.state === "stopping") return { ok: false, code: "already_running" };
    if (d.now() - this.lastStart < (d.minGapMs ?? 3000)) return { ok: false, code: "rate_limited" };
    this.lastStart = d.now(); this.stopFlag = false; this.hosts = []; this.self = null; this.status = { ...idle(), state: "running", mode, startedAt: d.now() };
    void this.run(mode, hostnames, d).catch(() => { this.status.state = "error"; this.status.reason = "internal_error"; this.status.finishedAt = d.now(); }); return { ok: true };
  }
  private async run(mode: "passive" | "active", hostnames: boolean, d: DiscDeps) {
    const fail = (reason: string) => { this.status.state = "error"; this.status.reason = reason; this.status.finishedAt = d.now(); };
    const net = await d.network(); this.gatewayIp = net.gatewayIp; if (!net.iface) return fail("no_active_interface");
    const plan = planTargets(net.iface); if (!plan.ok) return fail(plan.reason);
    this.status.subnet = plan.subnet; this.self = { ip: net.iface.ipv4, mac: net.iface.mac && net.iface.mac !== "00:00:00:00:00:00" ? net.iface.mac.toLowerCase() : null, name: net.iface.name };
    const responded = new Set<string>(); let pingMissing = false;
    if (mode === "active") {
      this.status.total = plan.targets.length;
      await runLimited(plan.targets, d.concurrency ?? 8, d.delayMs ?? 30, async (ip) => { const ok = await d.ping(ip); if (ok === null) pingMissing = true; else if (ok) responded.add(ip); this.status.probed++; this.status.found = responded.size; }, () => this.stopFlag || pingMissing);
      if (pingMissing) this.status.reason = "ping_unavailable"; else if (plan.narrowed) this.status.reason = "subnet_narrowed_to_24";
    }
    const arp = (await d.neighbors().catch(() => [])).filter((n) => sameSubnet(n.ip, plan.subnet) && n.ip !== net.iface?.ipv4);
    const macOf = new Map(arp.map((n) => [n.ip, n.mac])); const ips = new Set<string>([...arp.map((n) => n.ip), ...responded]);
    const hosts: DiscoveredHost[] = [...ips].sort((a, b) => a.split(".").reduce((x, y) => x * 256 + +y, 0) - b.split(".").reduce((x, y) => x * 256 + +y, 0)).map((ip) => ({ ip, mac: macOf.get(ip) ?? null, hostname: null, responded: responded.has(ip), via: responded.has(ip) ? (macOf.has(ip) ? "ping+arp" : "ping") : "arp" }));
    if (hostnames && !this.stopFlag) await runLimited(hosts.slice(0, 64), 4, 0, async (h) => { h.hostname = await d.reverse(h.ip).catch(() => null); }, () => false);
    this.hosts = hosts; this.status.found = hosts.length; this.status.stopped = this.stopFlag; this.status.state = "done"; this.status.finishedAt = d.now();
  }
}
