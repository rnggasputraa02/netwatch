// Tes handler API tingkat-route (tanpa server HTTP/browser). Dijalankan manual: `npx tsx --test tests/api/handlers.test.mts`
// (tsx bukan dependensi proyek). Memakai probe SISTEM SUNGGUHAN pada mesin yang menjalankannya → hasil jaringan bergantung mesin;
// yang diperiksa di sini adalah KEAMANAN & BENTUK respons, bukan nilai latency.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as snapshotMod from "../../src/app/api/live/snapshot/route.ts";
import * as discMod from "../../src/app/api/discovery/route.ts";
import * as routerMod from "../../src/app/api/router/status/route.ts";
type Handler = (req: Request) => Promise<Response>;
// tsx memuat .ts tanpa "type":"module" sebagai CJS → ekspor bisa berada di .default
const pick = (m: unknown, k: "GET" | "POST"): Handler => ((m as Record<string, unknown>)[k] ?? ((m as { default?: Record<string, unknown> }).default ?? {})[k]) as Handler;
const snapshotGET = pick(snapshotMod, "GET"), discGET = pick(discMod, "GET"), discPOST = pick(discMod, "POST"), routerGET = pick(routerMod, "GET");

const LOCAL = { host: "localhost:3000" }; const LAN = { host: "192.168.1.23:3000" };
const post = (body: unknown, headers: Record<string, string> = {}, raw?: string) => new Request("http://localhost:3000/api/discovery", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw ?? JSON.stringify(body) });
const ok = { host: "localhost:3000", "x-netwatch": "1" };

test("semua GET menolak Host non-loopback (LAN langsung / DNS rebinding) dengan 403", async () => {
  for (const [name, fn, path] of [["snapshot", snapshotGET, "/api/live/snapshot"], ["discovery", discGET, "/api/discovery"], ["router", routerGET, "/api/router/status"]] as const) {
    for (const h of [LAN, { host: "evil.example.com" }, { host: "localhost.evil.com" }, { host: "127.0.0.1.evil.com:3000" }, {}]) {
      const r = await fn(new Request(`http://x${path}`, { headers: h })); assert.equal(r.status, 403, `${name} ${JSON.stringify(h)}`); assert.equal(r.headers.get("cache-control"), "no-store");
    }
  }
});
test("snapshot: target internet hanya dari daftar tetap; injeksi perintah ditolak 400", async () => {
  for (const t of ["1.1.1.1;calc", "1.1.1.1 & whoami", "$(id)", "evil.com", "10.0.0.1", "", "1.1.1.1%0acalc"]) {
    const r = await snapshotGET(new Request(`http://localhost:3000/api/live/snapshot?internet=${encodeURIComponent(t)}`, { headers: LOCAL })); assert.equal(r.status, 400, JSON.stringify(t)); assert.deepEqual(await r.json(), { error: "invalid_target" });
  }
});
test("snapshot (probe sistem sungguhan pada mesin ini): bentuk respons LIVE, tanpa data karangan", async () => {
  const r = await snapshotGET(new Request("http://localhost:3000/api/live/snapshot?internet=1.1.1.1", { headers: LOCAL })); assert.equal(r.status, 200);
  const s = await r.json(); assert.equal(s.source, "LIVE"); assert.ok(["win32", "linux", "darwin"].includes(s.platform)); assert.ok(Array.isArray(s.notes));
  for (const p of [s.gateway.probe, s.internet.probe]) if (p) { assert.ok(p.lossPct === null || (p.lossPct >= 0 && p.lossPct <= 100)); if (p.received === 0) assert.equal(p.rttAvgMs, null, "tanpa balasan RTT harus null, bukan 0"); }
  console.log(`# info: platform=${s.platform} iface=${s.activeInterface?.name ?? "-"} gw=${s.gateway.ip ?? "-"} gwLoss=${s.gateway.probe?.lossPct ?? "n/a"} inetLoss=${s.internet.probe?.lossPct ?? "n/a"} notes=${s.notes.join(",") || "-"}`);
});
test("discovery POST: wajib X-NetWatch, Origin harus sama, body ketat", async () => {
  assert.equal((await discPOST(post({ action: "stop" }, { host: "localhost:3000" }))).status, 403, "tanpa header CSRF");
  assert.equal((await discPOST(post({ action: "stop" }, { ...ok, origin: "http://evil.example.com" }))).status, 403, "Origin asing");
  assert.equal((await discPOST(post({ action: "stop" }, { ...ok, origin: "not a url" }))).status, 403, "Origin rusak");
  assert.equal((await discPOST(post({ action: "stop" }, { host: "192.168.1.23:3000", "x-netwatch": "1" }))).status, 403, "Host LAN");
  assert.equal((await discPOST(post(null, ok, "{bukan json"))).status, 400);
  for (const b of [null, [], "start", { action: "start" }, { action: "start", mode: "active", hostnames: "yes" }, { action: "start", mode: "full", hostnames: true }, { action: "start", mode: "active", hostnames: true, subnet: "10.0.0.0/8" }, { action: "start", mode: "active", hostnames: true, targets: ["8.8.8.8"] }, { action: "stop", extra: 1 }, { action: "rm -rf" }]) {
    assert.equal((await discPOST(post(b, ok))).status, 400, JSON.stringify(b));
  }
});
test("discovery POST (sah): stop saat idle → stopped:false; passive start → 202, lalu start ulang cepat → 429/409", async () => {
  const s = await discPOST(post({ action: "stop" }, { ...ok, origin: "http://localhost:3000" })); assert.equal(s.status, 200); assert.deepEqual(await s.json(), { stopped: false });
  const a = await discPOST(post({ action: "start", mode: "passive", hostnames: false }, ok)); assert.equal(a.status, 202); const j = await a.json(); assert.equal(j.status.mode, "passive");
  const b = await discPOST(post({ action: "start", mode: "passive", hostnames: false }, ok)); assert.ok([409, 429].includes(b.status), `start ulang ditolak (${b.status})`);
  for (let i = 0; i < 100; i++) { const g = await (await discGET(new Request("http://x/api/discovery", { headers: LOCAL }))).json(); if (g.status.state !== "running") { console.log(`# info: discovery pasif state=${g.status.state} host=${g.hosts.length} subnet=${g.status.subnet ?? "-"} reason=${g.status.reason ?? "-"}`); assert.ok(["done", "error"].includes(g.status.state)); return; } await new Promise((r) => setTimeout(r, 50)); }
  assert.fail("discovery tidak selesai");
});
test("router status: bentuk respons jujur (UNKNOWN/NOT_SUPPORTED/UNREACHABLE/OK), tidak pernah angka karangan", async () => {
  const r = await routerGET(new Request("http://localhost:3000/api/router/status", { headers: LOCAL })); assert.equal(r.status, 200); const s = await r.json();
  assert.ok(["OK", "UNKNOWN", "NOT_SUPPORTED", "UNREACHABLE"].includes(s.state)); assert.equal(s.source, "LIVE"); if (s.state !== "OK") assert.equal(s.wan, null, "bukan OK → tidak ada angka WAN");
  assert.equal(s.capabilities.dhcpClients, "NOT_SUPPORTED"); assert.equal(s.capabilities.perDeviceTraffic, "NOT_SUPPORTED");
  console.log(`# info: router state=${s.state} reason=${s.reason ?? "-"}`);
});
