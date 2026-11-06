import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES, evaluate, LIVE_HYSTERESIS, type Hysteresis, type Sample } from "../../src/lib/alerts.ts";
import { collectCounters, NETADAPTER_CMD, type Deps } from "../../src/lib/live/snapshot.ts";
import { parseNetAdapterJson } from "../../src/lib/live/neighbors.ts";
import { computeRate } from "../../src/lib/analytics.ts";
import { msearch, SEARCH_ST, SEARCH_TARGETS } from "../../src/lib/live/upnp-core.ts";
import type { Alert } from "../../src/types/index.ts";

const S = (o: Partial<Sample> = {}): Sample => ({ source: "LIVE", subjectId: "gateway", subject: "Gateway 192.168.1.1", online: true, latencyMs: 5, lossPct: 0, utilPct: null, bwMbps: null, offlineKind: "gateway_down", ...o });
const mkH = () => ({ streaks: {} as Hysteresis["streaks"] });
const step = (h: ReturnType<typeof mkH>, tick: number, s: Sample, list: Alert[]) => evaluate([s], DEFAULT_RULES, list, tick, "LIVE", { hysteresis: { ...LIVE_HYSTERESIS, tick, streaks: h.streaks } });

test("v5.1.1 alert: satu pengukuran gagal/loss sesaat TIDAK membuat alert (mis. loss 25% sesaat)", () => {
  const h = mkH(); let r = step(h, 1, S({ lossPct: 25 }), []); assert.equal(r.alerts.length, 0, "loss 25% satu kali = belum alert");
  r = step(h, 2, S(), r.alerts); assert.equal(r.alerts.length, 0);
  r = step(h, 3, S({ online: false, lossPct: 100 }), r.alerts); assert.equal(r.alerts.length, 0, "satu kegagalan = belum alert");
  r = step(h, 4, S(), r.alerts); assert.equal(r.alerts.length, 0, "berselang normal mereset hitungan");
});
test("v5.1.1 alert: gagal 2x berturut-turut → alert; evaluasi ulang pada tick sama tidak menambah hitungan", () => {
  const h = mkH(); const down = S({ online: false, lossPct: 100 });
  let r = step(h, 1, down, []); r = step(h, 1, down, r.alerts); r = step(h, 1, down, r.alerts); assert.equal(r.alerts.length, 0, "tick sama dihitung sekali");
  r = step(h, 2, down, r.alerts); assert.equal(r.started.length, 1); assert.equal(r.alerts[0].kind, "gateway_down");
});
test("v5.1.1 alert: recovery butuh 2 pengukuran normal berturut-turut; null (tidak diketahui) tidak memulihkan dan tidak mereset", () => {
  const h = mkH(); const down = S({ online: false, lossPct: 100 }); let r = step(h, 1, down, []); r = step(h, 2, down, r.alerts); assert.equal(r.alerts.filter((a) => a.recoveredAt === null).length, 1);
  r = step(h, 3, S(), r.alerts); assert.equal(r.recovered.length, 0, "satu pengukuran baik belum cukup");
  r = step(h, 4, S({ online: null, lossPct: null, latencyMs: null }), r.alerts); assert.equal(r.recovered.length, 0, "UNKNOWN tidak memulihkan");
  r = step(h, 5, S(), r.alerts); assert.equal(r.recovered.length, 1, "pengukuran baik kedua memulihkan"); assert.ok(r.alerts[0].recoveredAt !== null);
});
test("v5.1.1 alert: tanpa opsi hysteresis perilaku lama tetap (SIMULATION tidak terpengaruh)", () => {
  const r = evaluate([S({ online: false })], DEFAULT_RULES, [], 1, "LIVE"); assert.equal(r.started.length, 1);
});
const IF = { name: "Wi-Fi", ipv4: "192.168.1.23", netmask: "255.255.255.0", cidr: "192.168.1.0/24", mac: "aa:bb:cc:dd:ee:ff" };
test("v5.1.1 counters [mock]: memakai timestamp baca dari PowerShell; di luar rentang → waktu selesai; tidak ada Ts → waktu selesai", async () => {
  let t = 10_000; const run = (out: string): Deps["run"] => async () => { t = 12_000; return { stdout: out, code: 0, error: null }; };
  const mk = (out: string): Deps => ({ platform: "win32", interfaces: () => [IF], now: () => t, sysRoot: "C:\\Windows", run: run(out) });
  t = 10_000; assert.equal((await collectCounters(mk('[{"Name":"Wi-Fi","ReceivedBytes":5,"SentBytes":6,"Ts":11500}]'), IF)).ts, 11500);
  t = 10_000; assert.equal((await collectCounters(mk('[{"Name":"Wi-Fi","ReceivedBytes":5,"SentBytes":6,"Ts":99999999}]'), IF)).ts, 12_000);
  t = 10_000; assert.equal((await collectCounters(mk('{"Name":"Wi-Fi","ReceivedBytes":5,"SentBytes":6}'), IF)).ts, 12_000);
  assert.match(NETADAPTER_CMD, /^Get-NetAdapterStatistics/); assert.ok(!/\b(Set|Remove|Disable|Enable|Restart|New)-/.test(NETADAPTER_CMD), "hanya baca");
});
test("v5.1.1 counters: parse menolak nilai non-numerik; 0 byte berubah = laju 0 (bukan null); counter tak tersedia = null", () => {
  assert.deepEqual(parseNetAdapterJson('[{"Name":"A","ReceivedBytes":"x","SentBytes":2}]'), []);
  assert.equal(computeRate({ ts: 0, bytes: 1000 }, { ts: 10_000, bytes: 1000 }), 0);
  assert.equal(computeRate({ ts: 0, bytes: 1000 }, { ts: 10_000, bytes: null }), null); assert.equal(computeRate(null, { ts: 1, bytes: 5 }), null);
  assert.equal(computeRate({ ts: 0, bytes: 0 }, { ts: 10_000, bytes: 1_250_000 }), 1_000_000, "1,25 MB / 10 dtk = 1 Mbps");
});
test("v5.1.1 SSDP: M-SEARCH baca-saja dengan beberapa ST; ST default tetap IGD:1", () => {
  assert.equal(SEARCH_TARGETS[0], SEARCH_ST); assert.match(msearch(), /ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n/);
  for (const st of SEARCH_TARGETS) { const m = msearch("192.168.1.1:1900", st); assert.match(m, /^M-SEARCH \* HTTP\/1\.1\r\n/); assert.ok(m.includes(`ST: ${st}\r\n`)); }
});
test("v5.1.1 alert: sampel dengan tick sendiri (router) dihitung per pembacaannya, bukan per snapshot", () => {
  const h = mkH(); const r = (tick: number) => S({ subjectId: "router", subject: "Router (UPnP)", online: false, lossPct: null, latencyMs: null, offlineKind: "router_unreachable", tick });
  let x = step(h, 1, r(100), []); x = step(h, 2, r(100), x.alerts); x = step(h, 3, r(100), x.alerts); assert.equal(x.alerts.length, 0, "ts router sama = satu pembacaan");
  x = step(h, 4, r(200), x.alerts); assert.equal(x.started.length, 1, "pembacaan router kedua → alert");
});
test("v5.1.1 alert: hitungan berturut-turut diputus bila subjek hilang dari sampel; subjek lain tidak ikut ter-reset (router aktif, LIVE mati)", () => {
  const h = mkH(); const router = (tick: number) => S({ subjectId: "router", subject: "Router (UPnP)", online: false, lossPct: null, latencyMs: null, offlineKind: "router_unreachable", tick });
  const run = (samples: Sample[], t: number, list: Alert[]) => evaluate(samples, DEFAULT_RULES, list, t, "LIVE", { hysteresis: { ...LIVE_HYSTERESIS, tick: t, streaks: h.streaks } });
  let x = run([router(1)], 1, []); x = run([router(2)], 2, x.alerts); assert.equal(x.started.length, 1, "router saja (tanpa gateway/internet) tetap dapat membuat alert");
  const h2 = mkH(); const run2 = (samples: Sample[], t: number, list: Alert[]) => evaluate(samples, DEFAULT_RULES, list, t, "LIVE", { hysteresis: { ...LIVE_HYSTERESIS, tick: t, streaks: h2.streaks } });
  let y = run2([router(1)], 1, []); y = run2([], 2, y.alerts); y = run2([router(3)], 3, y.alerts); assert.equal(y.started.length, 0, "jeda (subjek hilang) memutus hitungan");
});
