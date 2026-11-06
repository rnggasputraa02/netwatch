import { test } from "node:test";
import assert from "node:assert/strict";
import { planTargets, runLimited, sameSubnet } from "../../src/lib/live/discovery-plan.ts";
import { DiscoveryJob, type DiscDeps } from "../../src/lib/live/discovery.ts";
const IF = { name: "Wi-Fi", ipv4: "192.168.1.23", netmask: "255.255.255.0", cidr: "192.168.1.0/24", mac: "aa:bb:cc:dd:ee:ff" };
test("planTargets: hanya subnet privat milik sendiri, maks /24, tanpa IP sendiri/network/broadcast", () => {
  const p = planTargets(IF); assert.ok(p.ok); if (!p.ok) return; assert.equal(p.subnet, "192.168.1.0/24"); assert.equal(p.targets.length, 253); assert.ok(!p.targets.includes("192.168.1.23") && !p.targets.includes("192.168.1.0") && !p.targets.includes("192.168.1.255")); assert.equal(p.narrowed, false);
  const w = planTargets({ ipv4: "10.5.7.9", netmask: "255.255.0.0" }); assert.ok(w.ok); if (w.ok) { assert.equal(w.subnet, "10.5.7.0/24"); assert.equal(w.narrowed, true); assert.ok(w.targets.every((t) => t.startsWith("10.5.7."))); }
  const s = planTargets({ ipv4: "192.168.1.5", netmask: "255.255.255.248" }); assert.ok(s.ok); if (s.ok) assert.equal(s.targets.length, 5);
  for (const bad of [{ ipv4: "8.8.8.8", netmask: "255.255.255.0" }, { ipv4: "100.64.1.1", netmask: "255.255.255.0" }, { ipv4: "172.32.0.1", netmask: "255.255.0.0" }]) assert.deepEqual(planTargets(bad), { ok: false, reason: "not_private_subnet" });
  assert.equal((planTargets({ ipv4: "192.168.1.5", netmask: "255.255.255.254" }) as { reason: string }).reason, "subnet_too_small"); assert.equal((planTargets({ ipv4: "192.168.1.5", netmask: "255.0.255.0" }) as { reason: string }).reason, "mask_invalid");
  const c = planTargets(IF, 20); assert.ok(c.ok && c.targets.length === 20 && c.capped); assert.ok(planTargets({ ipv4: "172.16.5.5", netmask: "255.255.255.0" }).ok);
  assert.ok(sameSubnet("192.168.1.9", "192.168.1.0/24")); assert.ok(!sameSubnet("192.168.2.9", "192.168.1.0/24"));
});
test("runLimited: batas konkurensi, jeda, dan berhenti saat diminta", async () => {
  let active = 0, peak = 0; const n = await runLimited(Array.from({ length: 20 }, (_, i) => i), 3, 1, async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; }, () => false); assert.equal(n, 20); assert.ok(peak <= 3);
  let seen = 0, stop = false; await runLimited(Array.from({ length: 100 }, (_, i) => i), 2, 0, async () => { if (++seen === 5) stop = true; }, () => stop); assert.ok(seen >= 5 && seen < 20);
});
const deps = (o: Partial<DiscDeps> = {}, pinged: string[] = []): DiscDeps => ({
  network: async () => ({ iface: IF, gatewayIp: "192.168.1.1" }), now: () => Date.now(), concurrency: 8, delayMs: 0, minGapMs: 0,
  ping: async (ip) => { pinged.push(ip); return ip === "192.168.1.1" || ip === "192.168.1.40"; },
  neighbors: async () => [{ ip: "192.168.1.1", mac: "a4:99:47:12:34:56" }, { ip: "192.168.1.40", mac: "3a:11:22:33:44:55" }, { ip: "192.168.1.77", mac: "b8:00:00:00:00:77" }, { ip: "192.168.9.9", mac: "aa:aa:aa:aa:aa:aa" }, { ip: "192.168.1.23", mac: "aa:bb:cc:dd:ee:ff" }],
  reverse: async (ip) => (ip === "192.168.1.1" ? "router.lan" : null), ...o,
});
const wait = async (j: DiscoveryJob) => { for (let i = 0; i < 200 && (j.status.state === "running" || j.status.state === "stopping"); i++) await new Promise((r) => setTimeout(r, 10)); };
test("discovery pasif: hanya ARP pada subnet lokal, tidak ada ping, tanpa IP sendiri/luar subnet", async () => {
  const pinged: string[] = []; const j = new DiscoveryJob(); assert.ok(j.start("passive", true, deps({}, pinged)).ok); await wait(j);
  assert.equal(j.status.state, "done"); assert.equal(pinged.length, 0); assert.deepEqual(j.hosts.map((h) => h.ip), ["192.168.1.1", "192.168.1.40", "192.168.1.77"]); assert.ok(j.hosts.every((h) => h.via === "arp" && !h.responded));
  assert.equal(j.hosts[0].hostname, "router.lan"); assert.equal(j.hosts[1].hostname, null); assert.equal(j.self?.ip, "192.168.1.23"); assert.equal(j.gatewayIp, "192.168.1.1");
});
test("discovery aktif: ping hanya ke target subnet (253), konkurensi dibatasi; non-responder yang ada di ARP tetap tampil (ping diblokir)", async () => {
  const pinged: string[] = []; let active = 0, peak = 0; const j = new DiscoveryJob();
  j.start("active", false, deps({ ping: async (ip) => { pinged.push(ip); active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 2)); active--; return ip === "192.168.1.1" || ip === "192.168.1.40"; } })); await wait(j);
  assert.equal(j.status.state, "done"); assert.equal(pinged.length, 253); assert.ok(pinged.every((p) => p.startsWith("192.168.1.") && p !== "192.168.1.23")); assert.ok(peak <= 8); assert.equal(j.status.probed, 253);
  const h77 = j.hosts.find((h) => h.ip === "192.168.1.77")!; assert.equal(h77.responded, false); assert.equal(h77.via, "arp"); assert.equal(j.hosts.find((h) => h.ip === "192.168.1.40")!.via, "ping+arp"); assert.equal(j.hosts.every((h) => h.hostname === null), true);
});
test("discovery: ping tidak tersedia → lanjut pasif dengan alasan; tidak ada interface/subnet publik → error; satu job pada satu waktu; rate limit; stop", async () => {
  let j = new DiscoveryJob(); j.start("active", false, deps({ ping: async () => null })); await wait(j); assert.equal(j.status.reason, "ping_unavailable"); assert.equal(j.status.state, "done"); assert.ok(j.hosts.length >= 3);
  j = new DiscoveryJob(); j.start("passive", false, deps({ network: async () => ({ iface: null, gatewayIp: null }) })); await wait(j); assert.deepEqual([j.status.state, j.status.reason], ["error", "no_active_interface"]);
  j = new DiscoveryJob(); j.start("active", false, deps({ network: async () => ({ iface: { ...IF, ipv4: "8.8.8.8" }, gatewayIp: null }) })); await wait(j); assert.equal(j.status.reason, "not_private_subnet");
  j = new DiscoveryJob(); const slow = deps({ ping: async () => { await new Promise((r) => setTimeout(r, 20)); return false; }, delayMs: 5 }); assert.ok(j.start("active", false, slow).ok);
  assert.deepEqual(j.start("passive", false, slow), { ok: false, code: "already_running" }); assert.ok(j.stop()); await wait(j); assert.equal(j.status.stopped, true); assert.ok(j.status.probed < 253); assert.equal(j.status.state, "done");
  assert.deepEqual(new DiscoveryJob().stop(), false); const rl = new DiscoveryJob(); const d = deps({ minGapMs: 60_000 }); assert.ok(rl.start("passive", false, d).ok); await wait(rl); assert.deepEqual(rl.start("passive", false, d), { ok: false, code: "rate_limited" });
});
