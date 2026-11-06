import { test } from "node:test";
import assert from "node:assert/strict";
import { guard } from "../../src/lib/server/guard.ts";
import { CURRENT_SCHEMA, runMigrations } from "../../src/lib/storage/migrate.ts";
import { DEFAULT_RULES, evaluate, pushEvent, severityOf, type Sample } from "../../src/lib/alerts.ts";
import type { Alert } from "../../src/types/index.ts";
const req = (host: string, headers: Record<string, string> = {}) => ({ headers: new Headers({ host, ...headers }) }) as unknown as Request;
test("guard: host non-loopback ditolak; POST wajib header X-NetWatch dan Origin sama dengan Host", async () => {
  assert.equal(guard(req("localhost:3000"), { mutating: false }), null); assert.equal(guard(req("127.0.0.1:3000"), { mutating: false }), null);
  for (const h of ["192.168.1.5:3000", "evil.com", "localhost.evil.com"]) assert.equal(guard(req(h), { mutating: false })?.status, 403);
  assert.equal(guard(req("localhost:3000"), { mutating: true })?.status, 403); assert.equal(guard(req("localhost:3000", { "x-netwatch": "1" }), { mutating: true }), null);
  assert.equal(guard(req("localhost:3000", { "x-netwatch": "1", origin: "http://evil.com" }), { mutating: true })?.status, 403); assert.equal(guard(req("localhost:3000", { "x-netwatch": "1", origin: "http://localhost:3000" }), { mutating: true }), null);
  assert.equal(guard(req("localhost:3000", { "x-netwatch": "1", origin: "bukan-url" }), { mutating: true })?.status, 403); assert.equal((await guard(req("evil.com"), { mutating: false })!.json()).error, "forbidden_non_loopback");
});
const mem = (init: Record<string, string> = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
test("migrasi v3→v5: severity ditambahkan tanpa menghapus data; idempoten; JSON rusak dan versi masa depan tidak disentuh", () => {
  const a = [{ id: "1", kind: "gateway_down", source: "LIVE" }, { id: "2", kind: "latency", source: "SIMULATION" }, { id: "3", kind: "loss", severity: "critical" }]; const kv = mem({ nw3_alerts: JSON.stringify(a), nw2_dev: "[]", nw3_live: "{}" });
  const r = runMigrations(kv); assert.deepEqual([r.from, r.to, r.applied], [3, CURRENT_SCHEMA, ["alerts-severity"]]); const out = JSON.parse(kv.m.get("nw3_alerts")!); assert.deepEqual(out.map((x: { severity: string }) => x.severity), ["critical", "warning", "critical"]); assert.equal(kv.m.get("nw2_dev"), "[]"); assert.equal(kv.m.get("nw_schema"), "5");
  assert.deepEqual(runMigrations(kv).applied, []);
  const bad = mem({ nw3_alerts: "{rusak", nw_schema: "3" }); runMigrations(bad); assert.equal(bad.m.get("nw3_alerts"), "{rusak");
  const fut = mem({ nw_schema: "9", nw3_alerts: "[{\"id\":\"1\"}]" }); const f = runMigrations(fut); assert.equal(f.futureVersion, true); assert.equal(fut.m.get("nw_schema"), "9"); assert.equal(fut.m.get("nw3_alerts"), '[{"id":"1"}]');
  assert.equal(runMigrations(mem()).from, 0); assert.equal(runMigrations(mem({ nw2_dev: "[]" })).from, 2);
});
const S = (o: Partial<Sample> = {}): Sample => ({ source: "LIVE", subjectId: "gateway", subject: "Gateway 192.168.1.1", online: true, latencyMs: 5, lossPct: 0, utilPct: null, bwMbps: null, offlineKind: "gateway_down", ...o });
test("alert v5: severity, cooldown anti-flapping, bandwidth, router tidak dapat diakses, dedup", () => {
  let r = evaluate([S({ online: false, offlineKind: "gateway_down" })], DEFAULT_RULES, [], 1000, "LIVE", { cooldownMs: 60_000 }); assert.equal(r.started[0].severity, "critical"); assert.equal(r.started[0].kind, "gateway_down");
  r = evaluate([S()], DEFAULT_RULES, r.alerts, 2000, "LIVE", { cooldownMs: 60_000 }); assert.equal(r.recovered.length, 1);
  r = evaluate([S({ online: false, offlineKind: "gateway_down" })], DEFAULT_RULES, r.alerts, 5000, "LIVE", { cooldownMs: 60_000 }); assert.equal(r.started.length, 0, "dalam cooldown");
  r = evaluate([S({ online: false, offlineKind: "gateway_down" })], DEFAULT_RULES, r.alerts, 70_000, "LIVE", { cooldownMs: 60_000 }); assert.equal(r.started.length, 1, "setelah cooldown");
  r = evaluate([S({ online: false, offlineKind: "gateway_down" })], DEFAULT_RULES, r.alerts, 71_000, "LIVE", { cooldownMs: 60_000 }); assert.equal(r.started.length, 0, "dedup");
  const bw = evaluate([S({ subjectId: "pc", subject: "Komputer ini", bwMbps: 95.5, latencyMs: null, lossPct: null })], DEFAULT_RULES, [], 1, "LIVE"); assert.equal(bw.started[0].kind, "bandwidth_high"); assert.match(bw.started[0].message, /throughput 95\.5 Mbps melebihi 80 Mbps/);
  assert.equal(evaluate([S({ subjectId: "pc", bwMbps: null, latencyMs: null, lossPct: null })], DEFAULT_RULES, [], 1, "LIVE").started.length, 0, "null = tidak diketahui");
  const rt = evaluate([S({ subjectId: "router", subject: "Router", online: false, offlineKind: "router_unreachable", latencyMs: null, lossPct: null })], DEFAULT_RULES, [], 1, "LIVE"); assert.match(rt.started[0].message, /Router tidak dapat diakses/);
  assert.equal(severityOf("latency", S({ latencyMs: 800 })), "critical"); assert.equal(severityOf("loss", S({ lossPct: 7 })), "warning"); assert.equal(severityOf("loss", S({ lossPct: 30 })), "critical");
});
test("pushEvent: perangkat baru aktif sampai diakui, tidak digandakan, dan tidak dipulihkan otomatis oleh evaluate", () => {
  const ev = { key: "LIVE|dev|aa:bb|new_device", source: "LIVE" as const, kind: "new_device" as const, subject: "192.168.1.50", message: "[LIVE] Perangkat baru terdeteksi: 192.168.1.50", severity: "info" as const };
  const a = pushEvent([], ev, 1); assert.ok(a.created); assert.equal(pushEvent(a.alerts, ev, 2).created, null);
  const r = evaluate([S()], DEFAULT_RULES, a.alerts as Alert[], 3, "LIVE"); assert.equal(r.alerts.find((x) => x.kind === "new_device")?.recoveredAt, null);
});
