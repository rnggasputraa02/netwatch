import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSnapshot, type Deps } from "../../src/lib/live/snapshot.ts";
import { localLinkLost } from "../../src/lib/live/status.ts";
import { liveAlertSamples } from "../../src/lib/live/alert-samples.ts";
import { DiscoveryJob, type DiscDeps } from "../../src/lib/live/discovery.ts";
import { classifyCondition } from "../../src/lib/analytics.ts";
import { DEFAULT_RULES, evaluate } from "../../src/lib/alerts.ts";
import type { Alert, LiveSnapshot, LiveStatus } from "../../src/types/index.ts";

// MOCK: perintah sistem diganti fungsi palsu. Ini menguji LOGIKA v5.1, bukan jaringan/Windows sungguhan.
const IF = { name: "Wi-Fi", ipv4: "192.168.1.23", netmask: "255.255.255.0", cidr: "192.168.1.0/24", mac: "aa:bb:cc:dd:ee:ff" };
const ROUTE_OK = "          0.0.0.0          0.0.0.0      192.168.1.1    192.168.1.23     35\n";
const ROUTE_EMPTY = "IPv4 Route Table\n===========================================================================\nActive Routes:\nNetwork Destination        Netmask          Gateway       Interface  Metric\n===========================================================================\nPersistent Routes:\n  None\n";
const OK = (h: string) => `Reply from ${h}: bytes=32 time=5ms TTL=64\n`.repeat(4);
const GENERAL_FAILURE = "PING: transmit failed. General failure.\n".repeat(4);
const base = (over: Partial<Deps>): Deps => ({ platform: "win32", interfaces: () => [IF], now: () => 1_700_000_000_000, sysRoot: "C:\\Windows", run: async () => ({ stdout: "", code: 0, error: null }), ...over });
const up = base({ run: async (f, a) => (f.toLowerCase().endsWith("route.exe") ? { stdout: ROUTE_OK, code: 0, error: null } : { stdout: OK(a[a.length - 1]), code: 0, error: null }) });
const linkLost = base({ interfaces: () => [], run: async (f) => (f.toLowerCase().endsWith("route.exe") ? { stdout: ROUTE_EMPTY, code: 0, error: null } : { stdout: GENERAL_FAILURE, code: 1, error: null }) });
const routeBroken = base({ run: async (f) => (f.toLowerCase().endsWith("route.exe") ? { stdout: "", code: null, error: "failed" } : { stdout: GENERAL_FAILURE, code: 1, error: null }) });
const gwDown = base({ run: async (f, a) => (f.toLowerCase().endsWith("route.exe") ? { stdout: ROUTE_OK, code: 0, error: null } : { stdout: "Request timed out.\n".repeat(4), code: 1, error: null }) });
const inetDown = base({ run: async (f, a) => (f.toLowerCase().endsWith("route.exe") ? { stdout: ROUTE_OK, code: 0, error: null } : a[a.length - 1] === "192.168.1.1" ? { stdout: OK("192.168.1.1"), code: 0, error: null } : { stdout: "Request timed out.\n".repeat(4), code: 1, error: null }) });

test("localLinkLost: kabel/Wi-Fi terlepas (tanpa rute default) = true; rute tak terbaca atau gateway ada = false", async () => {
  const s1 = await collectSnapshot("1.1.1.1", linkLost);
  assert.equal(s1.gateway.ip, null); assert.ok(s1.notes.includes("gateway_not_found") && s1.notes.includes("no_active_interface")); assert.equal(s1.internet.probe?.lossPct, 100); assert.equal(localLinkLost(s1), true);
  assert.equal(classifyCondition({ gwRtt: null, gwLoss: null, inetRtt: null, inetLoss: 100 }), "UNKNOWN", "klasifikasi kondisi tetap jujur: penyebab tak dapat dipisahkan");
  const s2 = await collectSnapshot("1.1.1.1", routeBroken); assert.ok(s2.notes.includes("route_unavailable")); assert.equal(localLinkLost(s2), false, "penyebab tidak diketahui → tidak boleh alarm palsu");
  assert.equal(localLinkLost(await collectSnapshot("1.1.1.1", up)), false);
  assert.equal(localLinkLost(await collectSnapshot("1.1.1.1", gwDown)), false, "gateway ada tetapi diam bukan 'jaringan lokal hilang'");
});

// Siklus alert penuh: sampel → evaluate (aturan bawaan, cooldown 60 dtk seperti store) → pulih.
const run = (list: Alert[], snap: LiveSnapshot | null, status: LiveStatus, now: number) => { const r = evaluate(liveAlertSamples({ enabled: true, status, snap, active: list }), DEFAULT_RULES, list, now, "LIVE", { cooldownMs: 60_000 }); return r; };
const kinds = (l: Alert[]) => l.filter((a) => a.recoveredAt === null).map((a) => a.kind).sort();
test("alert: jaringan lokal terputus → gateway_down + internet_down (critical, [LIVE]); pulih saat gateway kembali", async () => {
  const T = 1_000_000; let list: Alert[] = [];
  let r = run(list, await collectSnapshot("1.1.1.1", up), "LIVE", T); list = r.alerts; assert.deepEqual(kinds(list), [], "normal: tanpa alert");
  r = run(list, await collectSnapshot("1.1.1.1", linkLost), "LIVE", T + 120_000); list = r.alerts;
  assert.deepEqual(kinds(list), ["gateway_down", "internet_down"]); assert.ok(list.every((a) => a.source === "LIVE" && a.message.startsWith("[LIVE]") && a.severity === "critical"));
  r = run(list, null, "STALE", T + 240_000); list = r.alerts; assert.deepEqual(kinds(list), ["gateway_down", "internet_down"], "STALE = tidak diketahui: tidak memulihkan");
  r = run(list, await collectSnapshot("1.1.1.1", up), "LIVE", T + 360_000); list = r.alerts;
  assert.deepEqual(kinds(list), [], "koneksi pulih → semua alert dipulihkan"); assert.equal(r.recovered.length, 2); assert.ok(list.every((a) => a.recoveredAt !== null));
});
test("alert: gateway diam (rute ada) → gateway_down; hanya internet putus → internet_down saja; kondisi sesuai", async () => {
  const T = 5_000_000; const g = await collectSnapshot("1.1.1.1", gwDown); let r = run([], g, "LIVE", T);
  assert.deepEqual(kinds(r.alerts), ["gateway_down", "internet_down"]); assert.equal(r.alerts.find((a) => a.kind === "gateway_down")!.subject, "Gateway 192.168.1.1");
  assert.equal(classifyCondition({ gwRtt: null, gwLoss: g.gateway.probe!.lossPct, inetRtt: null, inetLoss: g.internet.probe!.lossPct }), "GATEWAY_DOWN");
  const i = await collectSnapshot("1.1.1.1", inetDown); r = run([], i, "LIVE", T); assert.deepEqual(kinds(r.alerts), ["internet_down"]);
  assert.equal(classifyCondition({ gwRtt: i.gateway.probe!.rttAvgMs, gwLoss: i.gateway.probe!.lossPct, inetRtt: null, inetLoss: i.internet.probe!.lossPct }), "INTERNET_DOWN");
  const back = run(r.alerts, await collectSnapshot("1.1.1.1", up), "LIVE", T + 120_000); assert.deepEqual(kinds(back.alerts), []);
});
test("isolasi: evaluasi LIVE tidak menyentuh alert SIMULATION; LIVE nonaktif tidak menghasilkan sampel", async () => {
  const sim: Alert = { id: "s1", key: "SIMULATION|d1|offline", source: "SIMULATION", kind: "offline", subject: "Router (simulasi)", message: "[SIMULASI] x", startedAt: 1, recoveredAt: null, ack: false };
  const r = run([sim], await collectSnapshot("1.1.1.1", up), "LIVE", 9_000_000); assert.equal(r.alerts.find((a) => a.id === "s1")!.recoveredAt, null);
  assert.deepEqual(liveAlertSamples({ enabled: false, status: "OFF", snap: null, active: [sim] }), []);
});

test("discovery: label 'via' jujur — hanya-ARP, ping+ARP, dan ping tanpa entri ARP", async () => {
  const d: DiscDeps = { network: async () => ({ iface: IF, gatewayIp: "192.168.1.1" }), now: () => Date.now(), concurrency: 8, delayMs: 0, minGapMs: 0,
    ping: async (ip) => ip === "192.168.1.1" || ip === "192.168.1.50", neighbors: async () => [{ ip: "192.168.1.1", mac: "a4:99:47:12:34:56" }, { ip: "192.168.1.77", mac: "b8:00:00:00:00:77" }], reverse: async () => null };
  const j = new DiscoveryJob(); assert.ok(j.start("active", false, d).ok); for (let i = 0; i < 300 && j.status.state === "running"; i++) await new Promise((r) => setTimeout(r, 10));
  const via = (ip: string) => j.hosts.find((h) => h.ip === ip)?.via;
  assert.equal(via("192.168.1.1"), "ping+arp"); assert.equal(via("192.168.1.77"), "arp"); assert.equal(via("192.168.1.50"), "ping");
  assert.equal(j.hosts.find((h) => h.ip === "192.168.1.50")!.mac, null, "tanpa entri ARP, MAC tidak dikarang");
});
