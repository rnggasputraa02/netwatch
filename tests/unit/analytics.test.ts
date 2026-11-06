import { test } from "node:test";
import assert from "node:assert/strict";
import { addSample, bottleneckHints, buildReport, BUCKET_MS, classifyCondition, computeRate, conditionTransitions, detectSpikes, jitter, MAX_BUCKETS, reportCsv, segments, summarize } from "../../src/lib/analytics.ts";
import type { LivePoint } from "../../src/types/index.ts";
const P = (t: number, gwRtt: number | null, gwLoss: number | null, inetRtt: number | null, inetLoss: number | null): LivePoint => ({ id: "p" + t, t, gwRtt, gwLoss, inetRtt, inetLoss });
test("summarize/jitter: abaikan null, tanpa NaN, p95 benar", () => {
  assert.equal(summarize([null, undefined]), null); const s = summarize([10, 20, null, 30, 40])!; assert.equal(s.n, 4); assert.equal(s.avg, 25); assert.equal(s.min, 10); assert.equal(s.max, 40);
  assert.equal(summarize(Array.from({ length: 100 }, (_, i) => i + 1))!.p95, 95); assert.equal(jitter([10, 20, 10]), 10); assert.equal(jitter([5]), null); assert.equal(jitter([5, null, 5]), 0);
});
test("computeRate: bit/detik, null bila data kosong, jeda terlalu panjang, atau counter reset", () => {
  assert.equal(computeRate({ ts: 0, bytes: 0 }, { ts: 10_000, bytes: 1_250_000 }), 1_000_000);
  assert.equal(computeRate(null, { ts: 1, bytes: 1 }), null); assert.equal(computeRate({ ts: 0, bytes: null }, { ts: 1000, bytes: 5 }), null);
  assert.equal(computeRate({ ts: 0, bytes: 1 }, { ts: 0, bytes: 5 }), null); assert.equal(computeRate({ ts: 0, bytes: 1 }, { ts: 6 * 60_000, bytes: 500 }), null);
  assert.equal(computeRate({ ts: 0, bytes: 5_000 }, { ts: 1000, bytes: 100 }), null); // reset (bukan wrap)
  const W = 2 ** 32; assert.equal(computeRate({ ts: 0, bytes: W - 1000 }, { ts: 1000, bytes: 1000 }), 16_000); // wrap 32-bit
  assert.equal(computeRate({ ts: 0, bytes: 10 }, { ts: 1000, bytes: 10 }), 0);
});
test("classifyCondition: normal, degraded, gateway down, internet down (hanya bila gateway terukur), unknown", () => {
  assert.equal(classifyCondition(P(1, 3, 0, 20, 0)), "NORMAL"); assert.equal(classifyCondition(P(1, 3, 0, 300, 0)), "DEGRADED"); assert.equal(classifyCondition(P(1, 3, 10, 20, 0)), "DEGRADED");
  assert.equal(classifyCondition(P(1, null, 100, 20, 0)), "GATEWAY_DOWN"); assert.equal(classifyCondition(P(1, 3, 0, null, 100)), "INTERNET_DOWN");
  assert.equal(classifyCondition(P(1, null, null, null, 100)), "UNKNOWN"); assert.equal(classifyCondition(P(1, null, null, null, null)), "UNKNOWN");
});
test("conditionTransitions: UNKNOWN tidak dianggap perubahan; segmen terbentuk", () => {
  const pts = [P(1, 3, 0, 20, 0), P(2, null, null, null, null), P(3, 3, 0, null, 100), P(4, 3, 0, null, 100), P(5, 3, 0, 20, 0)];
  const tr = conditionTransitions(pts); assert.deepEqual(tr.map((x) => [x.from, x.to]), [["NORMAL", "INTERNET_DOWN"], ["INTERNET_DOWN", "NORMAL"]]); assert.match(tr[0].summary, /WAN\/ISP/);
  assert.deepEqual(segments(pts).map((s) => s.cond), ["NORMAL", "UNKNOWN", "INTERNET_DOWN", "NORMAL"]);
});
test("detectSpikes: butuh cukup sampel, mengabaikan fluktuasi kecil, menemukan lonjakan", () => {
  assert.deepEqual(detectSpikes([1e6, 9e7]), []); const base = Array.from({ length: 20 }, (_, i) => 2e6 + (i % 3) * 1e5);
  assert.deepEqual(detectSpikes(base), []); const s = [...base]; s[10] = 80e6; assert.deepEqual(detectSpikes(s), [10]); assert.deepEqual(detectSpikes(Array.from({ length: 20 }, () => 1000)), []);
});
test("bottleneckHints: berbasis bukti; kosong bila data < 5 sampel", () => {
  assert.deepEqual(bottleneckHints([P(1, 3, 0, 20, 0)]), []);
  const gw = Array.from({ length: 10 }, (_, i) => P(i, 200, 5, 30, 0)); assert.match(bottleneckHints(gw)[0].text, /jaringan lokal/);
  const wan = Array.from({ length: 10 }, (_, i) => P(i, 3, 0, 400, 5)); assert.match(bottleneckHints(wan)[0].text, /setelah router/); assert.match(bottleneckHints(wan)[0].evidence, /internet/);
  const ok = Array.from({ length: 10 }, (_, i) => P(i, 3, 0, 20, 0)); assert.equal(bottleneckHints(ok).length, 0);
  assert.match(bottleneckHints(ok, { rxBps: 90e6, txBps: 1e6, maxDownBps: 100e6, maxUpBps: 50e6 })[0].evidence, /counter UPnP router/);
});
const S = (t: number, over: object = {}) => ({ t, cond: "NORMAL" as const, gwRtt: 4, gwLoss: 0, inRtt: 20, inLoss: 0, pcRx: 8e6, pcTx: 1e6, rtRx: null, rtTx: null, dtSec: 10, ...over });
test("addSample/buildReport: agregasi 10 menit, total byte, router null tetap null, batas retensi", () => {
  let b = addSample([], S(0)); b = addSample(b, S(10_000, { gwRtt: 6, cond: "GATEWAY_DOWN" })); assert.equal(b.length, 1); assert.equal(b[0].n, 2); assert.equal(b[0].c[2], 1);
  b = addSample(b, S(BUCKET_MS + 1)); assert.equal(b.length, 2); const r = buildReport(b, 0, 2 * BUCKET_MS, "tes");
  assert.equal(r.samples, 3); assert.equal(r.gwRttAvg, (4 + 6 + 4) / 3); assert.equal(r.gwRttMax, 6); assert.equal(r.uptimePct, (2 / 3) * 100); assert.equal(r.pcRxAvg, 8e6);
  assert.equal(r.bytes.pcRx, Math.round((8e6 * 10) / 8) * 3); assert.equal(r.rtRxAvg, null); assert.equal(r.bytes.rtRx, 0);
  let many: ReturnType<typeof addSample> = []; for (let i = 0; i < MAX_BUCKETS + 5; i++) many = addSample(many, S(i * BUCKET_MS)); assert.equal(many.length, MAX_BUCKETS);
  assert.equal(buildReport([], 0, 1, "kosong").uptimePct, null);
});
test("reportCsv: label LIVE, BOM, tanpa NaN/null/undefined, router tanpa data = sel kosong", () => {
  const csv = reportCsv(buildReport(addSample([], S(0)), 0, BUCKET_MS, "Harian")); assert.ok(csv.startsWith("\ufeffSumber,Laporan,Metrik,Nilai,Satuan")); assert.ok(csv.split("\r\n").slice(1).every((l) => l.startsWith('"LIVE"') === false && l.startsWith("LIVE,")));
  assert.ok(!/NaN|undefined|null/.test(csv)); assert.match(csv, /Router \(UPnP\): download rata-rata","",/); assert.match(csv, /Komputer: download rata-rata","8"/);
});
