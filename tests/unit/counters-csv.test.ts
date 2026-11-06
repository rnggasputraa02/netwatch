import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { collectCounters, collectSnapshot, defaultDeps, NETADAPTER_CMD, type Deps } from "../../src/lib/live/snapshot.ts";
import { parseProcNetDev } from "../../src/lib/live/neighbors.ts";
import { bwCsv, devicesCsv, incidentsCsv } from "../../src/lib/analytics.ts";
import type { KnownDevice } from "../../src/types/index.ts";
const IF = { name: "Wi-Fi", ipv4: "192.168.1.23", netmask: "255.255.255.0", cidr: "192.168.1.0/24", mac: "aa:bb:cc:dd:ee:ff" };
const base = (o: Partial<Deps> = {}): Deps => ({ platform: "win32", interfaces: () => [IF], now: () => 5, sysRoot: "C:\\Windows", run: async () => ({ stdout: "", code: 0, error: null }), ...o });
// MOCK: keluaran PowerShell dipalsukan; tidak membuktikan perilaku Get-NetAdapterStatistics pada Windows sungguhan.
test("collectCounters Windows [mock]: perintah tetap tanpa input pengguna, adapter dipilih menurut nama (tanpa peduli huruf besar/kecil)", async () => {
  const calls: { f: string; a: readonly string[] }[] = [];
  const c = await collectCounters(base({ run: async (f, a) => { calls.push({ f, a }); return { stdout: '[{"Name":"Ethernet","ReceivedBytes":1,"SentBytes":2},{"Name":"wi-fi","ReceivedBytes":123456,"SentBytes":654321}]', code: 0, error: null }; } }), IF);
  assert.deepEqual([c.rxBytes, c.txBytes, c.method, c.error, c.ifaceName], [123456, 654321, "netadapter-powershell", null, "Wi-Fi"]);
  assert.equal(calls[0].f, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"); assert.deepEqual(calls[0].a.slice(0, 3), ["-NoProfile", "-NonInteractive", "-Command"]); assert.equal(calls[0].a[3], NETADAPTER_CMD, "perintah = konstanta kode"); assert.ok(!/Wi-Fi|Ethernet/.test(calls[0].a[3]), "perintah tidak memuat nama interface/input pengguna");
});
test("collectCounters: gagal → null + alasan (bukan 0) untuk PowerShell hilang, timeout, adapter tak ada, tanpa interface, platform lain", async () => {
  const f = async (run: Deps["run"], iface = IF as typeof IF | null, platform: NodeJS.Platform = "win32") => collectCounters(base({ run, platform }), iface);
  assert.equal((await f(async () => ({ stdout: "", code: null, error: "not_found" }))).error, "powershell_unavailable"); assert.equal((await f(async () => ({ stdout: "", code: null, error: "timeout" }))).error, "counters_timeout");
  const none = await f(async () => ({ stdout: '{"Name":"Lain","ReceivedBytes":1,"SentBytes":1}', code: 0, error: null })); assert.deepEqual([none.rxBytes, none.txBytes, none.error], [null, null, "counters_unavailable"]);
  assert.equal((await f(async () => ({ stdout: "", code: 0, error: null }), null)).error, "no_active_interface"); assert.equal((await f(async () => ({ stdout: "", code: 0, error: null }), IF, "darwin")).error, "platform_not_supported"); assert.equal((await f(async () => ({ stdout: "bukan json", code: 0, error: null }))).error, "counters_unavailable");
});
test("collectCounters Linux [mock readFile] dan INTEGRASI berkas /proc/net/dev sungguhan", async () => {
  const c = await collectCounters(base({ platform: "linux", readFile: async () => "h\nh\n  Wi-Fi: 10 1 0 0 0 0 0 0 20 2 0 0 0 0 0 0\n" }), IF); assert.deepEqual([c.rxBytes, c.txBytes, c.method], [10, 20, "proc-net-dev"]);
  if (!existsSync("/proc/net/dev")) return; // bagian integrasi hanya di Linux (di Windows tidak ada /proc)
  const real = parseProcNetDev(readFileSync("/proc/net/dev", "utf8")).find((r) => r.name !== "lo"); if (!real) return;
  const r = await collectCounters(defaultDeps(), { ...IF, name: real.name }); assert.equal(r.error, null); assert.ok(Number.isSafeInteger(r.rxBytes) && (r.rxBytes as number) >= 0);
});
test("collectSnapshot menyertakan counters tanpa menambah catatan bila counter gagal", async () => {
  const s = await collectSnapshot("1.1.1.1", base({ run: async (f) => (f.toLowerCase().endsWith("route.exe") ? { stdout: "          0.0.0.0          0.0.0.0      192.168.1.1    192.168.1.23     35\n", code: 0, error: null } : f.toLowerCase().endsWith("ping.exe") ? { stdout: "Reply from x: bytes=32 time=5ms TTL=64\n".repeat(4), code: 0, error: null } : { stdout: "", code: null, error: "not_found" }) }));
  assert.equal(s.counters?.error, "powershell_unavailable"); assert.equal(s.counters?.rxBytes, null); assert.deepEqual(s.notes, []);
});
const D = (o: Partial<KnownDevice> = {}): KnownDevice => ({ id: "m1", ip: "192.168.1.40", mac: "3a:11:22:33:44:55", hostname: 'hp "andi"', firstSeen: 1000, lastSeen: 2000, online: true, role: "unknown", privateMac: true, ...o });
test("CSV bandwidth/perangkat/gangguan: label LIVE, BOM, kutip di-escape, null = sel kosong, tanpa NaN", () => {
  const bw = bwCsv([{ id: "b1", t: 1000, pcRx: 1_500_000, pcTx: null, rtRx: null, rtTx: null }]).split("\r\n"); assert.ok(bw[0].startsWith("\ufeffSumber,Waktu (ISO),Komputer download (Mbps)")); assert.equal(bw[1], "LIVE,1970-01-01T00:00:01.000Z,1.5,,,");
  const dv = devicesCsv([D(), D({ id: "m2", online: null, mac: null, hostname: null, role: "gateway" })]).split("\r\n"); assert.match(dv[1], /^LIVE,192\.168\.1\.40,3a:11:22:33:44:55,"hp ""andi""","Tidak diketahui",online,/); assert.match(dv[2], /,"Gateway \(rute default\)",tidak diketahui,/);
  const ic = incidentsCsv([{ id: "i", t: 5, from: "NORMAL", to: "INTERNET_DOWN", summary: 'ISP, "putus"' }]).split("\r\n"); assert.equal(ic[1], 'LIVE,1970-01-01T00:00:00.005Z,NORMAL,INTERNET_DOWN,"ISP, ""putus"""'); assert.ok(!/NaN|undefined|null/.test(bwCsv([]) + devicesCsv([]) + incidentsCsv([])));
});
