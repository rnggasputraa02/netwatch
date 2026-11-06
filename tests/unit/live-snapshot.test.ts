import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSnapshot, runPing, type Deps } from "../../src/lib/live/snapshot.ts";
import { runCommand } from "../../src/lib/live/exec.ts";
import { classifyStatus, liveCsv, LIVE_STALE_MS, toPoint } from "../../src/lib/live/status.ts";

// MOCK: seluruh pemanggilan perintah memakai fungsi `run` palsu. Ini menguji logika, BUKAN probe ICMP/route sungguhan.
const iface = { name: "Wi-Fi", ipv4: "192.168.1.23", netmask: "255.255.255.0", cidr: "192.168.1.0/24", mac: "aa:bb:cc:dd:ee:ff" };
const REPLY = (h: string, t: number) => `Reply from ${h}: bytes=32 time=${t}ms TTL=64\n`;
const mk = (over: Partial<Deps> = {}, calls: { f: string; a: readonly string[] }[] = []): Deps => ({
  platform: "win32", interfaces: () => [iface], now: () => 1_700_000_000_000, sysRoot: "C:\\Windows",
  run: async (f, a) => {
    calls.push({ f, a });
    if (f.toLowerCase().endsWith("route.exe")) return { stdout: "          0.0.0.0          0.0.0.0      192.168.1.1    192.168.1.23     35\n", code: 0, error: null };
    const host = a[a.length - 1]; return { stdout: REPLY(host, host === "1.1.1.1" ? 20 : 3).repeat(4), code: 0, error: null };
  }, ...over,
});
test("snapshot Windows: interface aktif, gateway, subnet, dan probe nyata (mock) berlabel LIVE", async () => {
  const s = await collectSnapshot("1.1.1.1", mk());
  assert.equal(s.source, "LIVE"); assert.equal(s.gateway.ip, "192.168.1.1"); assert.equal(s.activeInterface?.cidr, "192.168.1.0/24");
  assert.equal(s.gateway.probe?.rttAvgMs, 3); assert.equal(s.internet.probe?.rttAvgMs, 20); assert.equal(s.internet.probe?.lossPct, 0); assert.deepEqual(s.notes, []);
});
test("perintah dijalankan sebagai argumen tetap (tanpa shell), host divalidasi, dan memakai System32 absolut", async () => {
  const calls: { f: string; a: readonly string[] }[] = []; await collectSnapshot("8.8.8.8", mk({}, calls));
  assert.ok(calls.every((c) => c.f.startsWith("C:\\Windows\\System32\\"))); const ping = calls.find((c) => c.f.endsWith("ping.exe"))!;
  assert.deepEqual(ping.a.slice(0, 4), ["-n", "4", "-w", "1000"]);
  const bad = await runPing("1.1.1.1 & calc", mk()); assert.equal(bad.error, "invalid_host"); assert.equal(bad.received, 0);
});
test("ping tidak tersedia → metrik null + catatan, BUKAN 0 atau data palsu", async () => {
  const d = mk({ run: async (f) => f.toLowerCase().endsWith("route.exe") ? { stdout: "", code: 0, error: null } : { stdout: "", code: null, error: "not_found" } });
  const s = await collectSnapshot("1.1.1.1", d);
  assert.equal(s.internet.probe?.lossPct, null); assert.equal(s.internet.probe?.rttAvgMs, null); assert.ok(s.notes.includes("ping_unavailable")); assert.ok(s.notes.includes("gateway_not_found")); assert.equal(s.gateway.probe, null);
});
test("100% loss: loss=100 dan RTT null (gangguan nyata dibedakan dari 'tidak tersedia')", async () => {
  const d = mk({ run: async (f) => f.toLowerCase().endsWith("route.exe") ? { stdout: "          0.0.0.0          0.0.0.0      192.168.1.1    192.168.1.23     35\n", code: 0, error: null } : { stdout: "Request timed out.\n".repeat(4), code: 1, error: null } });
  const s = await collectSnapshot("1.1.1.1", d); assert.equal(s.gateway.probe?.lossPct, 100); assert.equal(s.gateway.probe?.rttAvgMs, null); assert.equal(s.gateway.probe?.error, null);
});
test("timeout probe dan route tidak bisa dibaca dilaporkan sebagai catatan", async () => {
  const d = mk({ run: async (f) => f.toLowerCase().endsWith("route.exe") ? { stdout: "", code: null, error: "failed" } : { stdout: "", code: null, error: "timeout" } });
  const s = await collectSnapshot("9.9.9.9", d); assert.ok(s.notes.includes("route_unavailable")); assert.ok(s.notes.includes("probe_timeout")); assert.equal(s.internet.probe?.lossPct, null);
});
test("platform tidak didukung dan Linux memakai ip/ping dengan argumen tetap", async () => {
  const s = await collectSnapshot("1.1.1.1", mk({ platform: "darwin" })); assert.ok(s.notes.includes("platform_not_supported"));
  const calls: { f: string; a: readonly string[] }[] = [];
  const l = mk({ platform: "linux", run: async (f, a) => { calls.push({ f, a }); return f === "ip" ? { stdout: "default via 192.168.1.1 dev Wi-Fi metric 5\n", code: 0, error: null } : { stdout: "64 bytes from x: ttl=64 time=2.5 ms\n".repeat(4), code: 0, error: null }; } });
  const r = await collectSnapshot("1.1.1.1", l); assert.equal(r.activeInterface?.name, "Wi-Fi"); assert.deepEqual(calls[0], { f: "ip", a: ["-4", "route", "show", "default"] }); assert.equal(r.gateway.probe?.rttAvgMs, 2.5);
});
test("runCommand (integrasi proses sungguhan memakai node, bukan ping): stdout, ENOENT, timeout", async () => {
  const ok = await runCommand(process.execPath, ["-e", "console.log('halo')"], 5000); assert.equal(ok.error, null); assert.match(ok.stdout, /halo/);
  const nf = await runCommand("perintah-yang-tidak-ada-xyz", [], 2000); assert.equal(nf.error, "not_found");
  const to = await runCommand(process.execPath, ["-e", "setTimeout(()=>{},5000)"], 300); assert.equal(to.error, "timeout");
  const nz = await runCommand(process.execPath, ["-e", "console.log('x');process.exit(3)"], 5000); assert.equal(nz.error, null); assert.equal(nz.code, 3); assert.match(nz.stdout, /x/);
});
test("runCommand tidak menafsirkan metakarakter shell", async () => {
  const r = await runCommand(process.execPath, ["-e", "console.log(process.argv[1])", "a; echo INJECT && b"], 5000); assert.match(r.stdout, /a; echo INJECT && b/);
});
test("classifyStatus: OFF/UNKNOWN/LIVE/STALE/DISCONNECTED", () => {
  const now = 1_000_000;
  assert.equal(classifyStatus({ enabled: false, lastOkTs: now, failing: false, now }), "OFF");
  assert.equal(classifyStatus({ enabled: true, lastOkTs: null, failing: false, now }), "UNKNOWN");
  assert.equal(classifyStatus({ enabled: true, lastOkTs: null, failing: true, now }), "DISCONNECTED");
  assert.equal(classifyStatus({ enabled: true, lastOkTs: now - 1000, failing: false, now }), "LIVE");
  assert.equal(classifyStatus({ enabled: true, lastOkTs: now - LIVE_STALE_MS - 1, failing: false, now }), "STALE");
  assert.equal(classifyStatus({ enabled: true, lastOkTs: now - 5000, failing: true, now }), "STALE");
  assert.equal(classifyStatus({ enabled: true, lastOkTs: now - LIVE_STALE_MS - 1, failing: true, now }), "DISCONNECTED");
});
test("liveCsv: label sumber LIVE, nilai tidak tersedia = sel kosong (bukan 0), BOM untuk Excel", async () => {
  const s = await collectSnapshot("1.1.1.1", mk()); const bad = await collectSnapshot("1.1.1.1", mk({ run: async () => ({ stdout: "", code: null, error: "not_found" }) }));
  const csv = liveCsv([toPoint(s), toPoint(bad)]); const lines = csv.split("\r\n");
  assert.ok(csv.startsWith("\ufeffSumber,")); assert.ok(lines[1].startsWith("LIVE,")); assert.equal(lines[2].split(",").slice(2).join(","), ",,,");
  assert.ok(!/NaN|undefined|null/.test(csv));
});
