import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceScenarios, controlScenario, createScenario, effectsFor, MAX_ACTIVE, simDeviceSample } from "../../src/lib/simulation/scenario.ts";
import { seedDevices } from "../../src/lib/simulation/index.ts";
import { DEFAULT_RULES, evaluate, validateRuleValue, type Sample } from "../../src/lib/alerts.ts";
import { parseLiveCfg, parseRules } from "../../src/lib/storage/v3.ts";
import type { Alert, Scenario } from "../../src/types/index.ts";

const dev = seedDevices(8); const A = dev[1]; // Router Utama, online
const mk = (kind: "outage" | "latency" | "loss" | "congestion", value: number, over: Partial<Parameters<typeof createScenario>[0]> = {}, list: Scenario[] = []) =>
  createScenario({ kind, deviceId: A.id, deviceName: A.name, durationSec: 30, value, ...over }, "s" + list.length, 0, list);
const must = (r: ReturnType<typeof createScenario>) => { assert.ok(r.ok, r.ok ? "" : r.error); return (r as { ok: true; scenario: Scenario }).scenario; };

test("createScenario memvalidasi durasi, nilai, target, duplikat, dan batas aktif", () => {
  assert.equal(mk("latency", 300, { durationSec: 1 }).ok, false); assert.equal(mk("latency", 300, { durationSec: 99999 }).ok, false);
  assert.equal(mk("latency", 5).ok, false); assert.equal(mk("loss", 101).ok, false); assert.equal(mk("loss", Number.NaN).ok, false); assert.equal(mk("latency", 300, { deviceId: "" }).ok, false);
  const s = must(mk("latency", 300)); assert.equal(s.status, "running"); assert.equal(mk("latency", 400, {}, [s]).ok, false); // duplikat
  assert.equal(mk("outage", 0).ok, true);
  const many = Array.from({ length: MAX_ACTIVE }, (_, i) => ({ ...s, id: "x" + i, deviceId: "dev" + i }));
  assert.equal(mk("loss", 10, {}, many).ok, false);
});
test("efek skenario hanya saat running; pause menangguhkan, stop/selesai menghapus efek", () => {
  let list = [must(mk("latency", 300))]; assert.equal(effectsFor(list, A.id).extraLatencyMs, 300);
  list = controlScenario(list, "s0", "pause"); assert.equal(effectsFor(list, A.id).extraLatencyMs, 0);
  list = controlScenario(list, "s0", "resume"); assert.equal(effectsFor(list, A.id).extraLatencyMs, 300);
  list = controlScenario(list, "s0", "stop"); assert.equal(list[0].status, "stopped"); assert.equal(effectsFor(list, A.id).extraLatencyMs, 0);
  assert.equal(controlScenario(list, "s0", "resume")[0].status, "stopped"); // transisi tidak valid diabaikan
});
test("advanceScenarios: hanya running yang maju; selesai tepat di durasi dan melaporkan completed sekali", () => {
  let list = [must(mk("loss", 20, { durationSec: 10 }))];
  let r = advanceScenarios(list, 4000); assert.equal(r.list[0].elapsedMs, 4000); assert.equal(r.completed.length, 0);
  list = controlScenario(r.list, "s0", "pause"); r = advanceScenarios(list, 4000); assert.equal(r.list[0].elapsedMs, 4000); // paused: tidak maju
  list = controlScenario(r.list, "s0", "resume"); r = advanceScenarios(list, 9000);
  assert.equal(r.list[0].status, "completed"); assert.equal(r.list[0].elapsedMs, 10000); assert.equal(r.completed.length, 1);
  assert.equal(advanceScenarios(r.list, 5000).completed.length, 0); assert.equal(effectsFor(r.list, A.id).extraLossPct, 0);
});
test("efek majemuk: loss digabung, latency dijumlahkan dan dibatasi, bandwidth limit mengambil yang terkecil", () => {
  const s1 = must(mk("loss", 50)); const s2 = { ...s1, id: "b", value: 50 }; const s3 = { ...s1, id: "c", kind: "congestion" as const, value: 8 }; const s4 = { ...s3, id: "d", value: 3 };
  const fx = effectsFor([s1, s2, s3, s4], A.id); assert.equal(fx.extraLossPct, 75); assert.equal(fx.limitMbps, 3);
  const l = effectsFor([{ ...s1, kind: "latency", value: 2000 }, { ...s1, id: "z", kind: "latency", value: 2000 }, { ...s1, id: "y", kind: "latency", value: 2000 }], A.id); assert.equal(l.extraLatencyMs, 5000);
});
test("simDeviceSample deterministik; outage → offline & metrik null; congestion → utilisasi 100%", () => {
  const none = effectsFor([], A.id); const a = simDeviceSample(A, 12345, none), b = simDeviceSample(A, 12345, none);
  assert.deepEqual(a, b); assert.ok(a.online && a.latencyMs! > 0 && a.lossPct === 0);
  const out = simDeviceSample(A, 12345, effectsFor([must(mk("outage", 0))], A.id)); assert.equal(out.online, false); assert.equal(out.latencyMs, null); assert.equal(out.lossPct, null); assert.equal(out.utilPct, null);
  const c = simDeviceSample(A, 1, effectsFor([must(mk("congestion", 5))], A.id)); assert.equal(c.utilPct, 100); assert.equal(c.effBwMbps, 5);
  const high = simDeviceSample(A, 1, effectsFor([must(mk("latency", 500))], A.id)); assert.ok(high.latencyMs! > 500);
  const off = simDeviceSample({ ...A, online: false }, 1, none); assert.equal(off.online, false);
});
const S = (over: Partial<Sample> = {}): Sample => ({ source: "SIMULATION", subjectId: "r1", subject: "Router", online: true, latencyMs: 20, lossPct: 0, utilPct: 40, ...over });
test("alert: dibuat sekali (tanpa duplikat), dipulihkan saat normal, tercatat waktu mulai/pulih", () => {
  let r = evaluate([S({ latencyMs: 400 })], DEFAULT_RULES, [], 1000, "SIMULATION"); assert.equal(r.started.length, 1); assert.equal(r.alerts[0].kind, "latency"); assert.match(r.alerts[0].message, /\[SIMULASI\]/);
  r = evaluate([S({ latencyMs: 500 })], DEFAULT_RULES, r.alerts, 2000, "SIMULATION"); assert.equal(r.started.length, 0); assert.equal(r.alerts.length, 1); assert.equal(r.changed, false);
  r = evaluate([S({ latencyMs: 20 })], DEFAULT_RULES, r.alerts, 3000, "SIMULATION"); assert.equal(r.recovered.length, 1); assert.equal(r.alerts[0].recoveredAt, 3000); assert.equal(r.alerts[0].startedAt, 1000);
  r = evaluate([S({ latencyMs: 400 })], DEFAULT_RULES, r.alerts, 4000, "SIMULATION"); assert.equal(r.started.length, 1); assert.equal(r.alerts.filter((a) => a.recoveredAt === null).length, 1); // kejadian baru, bukan duplikat
});
test("alert: nilai null (tidak diketahui) tidak membuat maupun memulihkan; offline memulihkan alert lain", () => {
  let r = evaluate([S({ lossPct: 30 })], DEFAULT_RULES, [], 1, "SIMULATION"); assert.equal(r.alerts[0].kind, "loss");
  r = evaluate([S({ lossPct: null })], DEFAULT_RULES, r.alerts, 2, "SIMULATION"); assert.equal(r.recovered.length, 0);
  r = evaluate([S({ online: null, lossPct: null, latencyMs: null, utilPct: null })], DEFAULT_RULES, r.alerts, 3, "SIMULATION"); assert.equal(r.started.length, 0);
  r = evaluate([S({ online: false, latencyMs: null, lossPct: null, utilPct: null })], DEFAULT_RULES, r.alerts, 4, "SIMULATION");
  assert.deepEqual(r.alerts.filter((a) => a.recoveredAt === null).map((a) => a.kind), ["offline"]); assert.equal(r.recovered.length, 1);
});
test("alert: aturan nonaktif memulihkan; subjek yang hilang (perangkat dihapus) dipulihkan; sumber LIVE dan SIMULATION terpisah", () => {
  let r = evaluate([S({ utilPct: 99 })], DEFAULT_RULES, [], 1, "SIMULATION");
  const off = DEFAULT_RULES.map((x) => (x.kind === "utilization" ? { ...x, enabled: false } : x)); let r2 = evaluate([S({ utilPct: 99 })], off, r.alerts, 2, "SIMULATION"); assert.equal(r2.recovered.length, 1);
  r2 = evaluate([], DEFAULT_RULES, r.alerts, 3, "SIMULATION"); assert.equal(r2.recovered.length, 1);
  const live = evaluate([S({ source: "LIVE", subjectId: "gateway", subject: "Gateway", online: false, offlineKind: "gateway_down" })], DEFAULT_RULES, r.alerts, 4, "LIVE");
  assert.equal(live.started[0].kind, "gateway_down"); assert.match(live.started[0].message, /\[LIVE\]/); assert.equal(live.alerts.filter((a) => a.source === "SIMULATION" && a.recoveredAt === null).length, 1); // evaluasi LIVE tidak menyentuh alert simulasi
});
test("validateRuleValue dan parseRules/parseLiveCfg menolak nilai rusak dan memakai default", () => {
  assert.ok(validateRuleValue("latency", 0)); assert.ok(validateRuleValue("loss", 101)); assert.ok(validateRuleValue("latency", Number.NaN)); assert.equal(validateRuleValue("latency", 100), null);
  assert.deepEqual(parseRules("rusak"), DEFAULT_RULES); const p = parseRules([{ kind: "latency", enabled: false, threshold: 99 }, { kind: "loss", enabled: true, threshold: 999 }]);
  assert.deepEqual(p.find((x) => x.kind === "latency"), { kind: "latency", enabled: false, threshold: 99 }); assert.equal(p.find((x) => x.kind === "loss")!.threshold, 5);
  assert.deepEqual(parseLiveCfg(null), { enabled: false, target: "1.1.1.1" }); assert.deepEqual(parseLiveCfg({ enabled: true, target: "evil.com" }), { enabled: true, target: "1.1.1.1" });
});
test("tipe Alert menyimpan sumber, waktu mulai/pulih, dan ack", () => { const a: Alert = { id: "1", key: "k", source: "LIVE", kind: "gateway_down", subject: "g", message: "m", startedAt: 1, recoveredAt: null, ack: false }; assert.equal(a.source, "LIVE"); });
