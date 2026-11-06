#!/usr/bin/env node
// NetWatch v5.1 — uji mandiri PERANGKAT NYATA (read-only). Memakai kode produksi yang sama dengan aplikasi.
//   npm run selftest -- [opsi]      (setara: node --experimental-strip-types scripts/selftest.mjs [opsi])
//   --router              kueri UPnP IGD baca-saja ke gateway (tidak mengubah konfigurasi router)
//   --discovery passive|active   pasif = baca tabel ARP; aktif = 1 ping/alamat ke subnet privat sendiri (maks /24)
//   --watch <detik>       pantau tiap 3 dtk dan cetak perubahan kondisi + alert (cabut/colok kabel atau Wi-Fi selama ini berjalan)
//   --redact              samarkan 3 oktet terakhir MAC dan IP eksternal pada laporan
//   --out <berkas.json>   lokasi laporan (bawaan: netwatch-selftest-<waktu>.json)
// Tidak ada angka yang dikarang: yang gagal diukur dicatat NOT_AVAILABLE beserta alasannya.
import { writeFileSync } from "node:fs";
import os from "node:os";
import { collectSnapshot, collectCounters, defaultDeps, detectNetwork, runPing, osInterfaces } from "../src/lib/live/snapshot.ts";
import { INTERNET_TARGETS, localLinkLost, NOTE_TEXT } from "../src/lib/live/status.ts";
import { liveAlertSamples } from "../src/lib/live/alert-samples.ts";
import { classifyCondition, computeRate } from "../src/lib/analytics.ts";
import { DEFAULT_RULES, evaluate } from "../src/lib/alerts.ts";
import { isHG8145V5 } from "../src/lib/live/upnp-core.ts";
import { queryRouter, realUpnpDeps } from "../src/lib/live/upnp.ts";
import { discovery, realDiscDeps } from "../src/lib/server/runtime.ts";

const argv = process.argv.slice(2); const flag = (n) => argv.includes(n); const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const mbps = (bps) => (bps === null || bps === undefined ? "NOT_AVAILABLE" : `${(bps / 1e6).toFixed(2)} Mbit/s`);
const red = (s) => (flag("--redact") ? String(s).replace(/([0-9a-f]{2}[:-][0-9a-f]{2}[:-][0-9a-f]{2})[:-][0-9a-f]{2}[:-][0-9a-f]{2}[:-][0-9a-f]{2}/gi, "$1:xx:xx:xx") : s);
const d = defaultDeps(); const R = { tool: "netwatch-selftest", netwatchVersion: "5.1.1", at: new Date().toISOString(), environment: { platform: process.platform, osRelease: os.release(), arch: os.arch(), node: process.version, isWindows: process.platform === "win32" }, results: {}, notAvailable: [] };
const na = (what, why) => { R.notAvailable.push({ what, why }); console.log(`  NOT_AVAILABLE  ${what}: ${NOTE_TEXT[why] ?? why}`); };
console.log(`\nNetWatch v5.1 self-test  [${R.environment.platform} ${R.environment.osRelease}, node ${R.environment.node}]`);
if (!R.environment.isWindows) console.log("  PERINGATAN: bukan Windows. Hasil ini BUKAN verifikasi Windows.");

console.log("\n[1] Interface, IPv4, subnet, gateway");
const net = await detectNetwork(d); R.results.network = { interfaces: osInterfaces().map((i) => ({ ...i, mac: red(i.mac) })), gatewayIp: net.gatewayIp, activeInterface: net.active ? { ...net.active, mac: red(net.active.mac) } : null };
for (const i of net.interfaces) console.log(`  terdeteksi: ${i.name} ${i.ipv4}/${i.cidr.split("/")[1]}`);
if (net.active) console.log(`  interface=${net.active.name} ipv4=${net.active.ipv4} mask=${net.active.netmask} subnet=${net.active.cidr}`); else na("interface aktif", "no_active_interface");
if (net.gatewayIp) console.log(`  gateway=${net.gatewayIp}`); else na("default gateway", "gateway_not_found");

console.log("\n[2] Ping, latency, packet loss (4 paket per target)");
R.results.ping = {};
if (net.gatewayIp) { const p = await runPing(net.gatewayIp, d); R.results.ping.gateway = p; console.log(`  gateway ${p.host}: sent=${p.sent} recv=${p.received} loss=${p.lossPct ?? "n/a"}% rtt min/avg/max=${p.rttMinMs ?? "n/a"}/${p.rttAvgMs ?? "n/a"}/${p.rttMaxMs ?? "n/a"} ms${p.error ? ` [${p.error}]` : ""}`); }
for (const t of INTERNET_TARGETS) { const p = await runPing(t, d); R.results.ping[t] = p; console.log(`  internet ${t}: recv=${p.received}/${p.sent} loss=${p.lossPct ?? "n/a"}% avg=${p.rttAvgMs ?? "n/a"} ms${p.error ? ` [${p.error}]` : ""}`); }

console.log("\n[3] Throughput KOMPUTER INI (bukan total router) — 2 pembacaan, jeda 5 dtk");
const c1 = await collectCounters(d, net.active); await sleep(5000); const c2 = await collectCounters(d, net.active);
if (c1.error || c2.error) { na("throughput komputer", c1.error ?? c2.error); R.results.pcThroughput = { error: c1.error ?? c2.error }; }
else { const rx = computeRate({ ts: c1.ts, bytes: c1.rxBytes }, { ts: c2.ts, bytes: c2.rxBytes }), tx = computeRate({ ts: c1.ts, bytes: c1.txBytes }, { ts: c2.ts, bytes: c2.txBytes }); R.results.pcThroughput = { method: c1.method, rxBps: rx, txBps: tx }; console.log(`  metode=${c1.method} unduh=${mbps(rx)} unggah=${mbps(tx)}  (bandingkan manual dengan Task Manager > Performance)`); }

if (flag("--router")) {
  console.log("\n[4] Router via UPnP IGD (baca-saja; tanpa kredensial; tanpa mengubah konfigurasi)");
  const q = () => queryRouter({ gatewayIp: net.gatewayIp, bindIp: net.active?.ipv4 ?? null }, realUpnpDeps()); const a = await q(); R.results.router = { ...a, wan: a.wan ? { ...a.wan, externalIp: red(a.wan.externalIp ?? "") || null } : null };
  console.log(`  state=${a.state}${a.reason ? ` reason=${a.reason}` : ""}`);
  if (a.device) console.log(`  perangkat melapor: ${a.device.manufacturer ?? "-"} | ${a.device.modelName ?? "-"} | ${a.device.modelNumber ?? "-"}  → HG8145V5 ${isHG8145V5(a.device) ? "TERKONFIRMASI oleh router itu sendiri" : "TIDAK terkonfirmasi"}`);
  if (a.state === "OK") { await sleep(5000); const b = await q(); if (b.state === "OK" && a.wan && b.wan) { const rx = computeRate({ ts: a.ts, bytes: a.wan.rxBytes }, { ts: b.ts, bytes: b.wan.rxBytes }), tx = computeRate({ ts: a.ts, bytes: a.wan.txBytes }, { ts: b.ts, bytes: b.wan.txBytes }); R.results.routerThroughput = { rxBps: rx, txBps: tx }; console.log(`  TOTAL router (semua perangkat): unduh=${mbps(rx)} unggah=${mbps(tx)}  link-rate maks=${mbps(b.wan.maxDownBps)}/${mbps(b.wan.maxUpBps)}`); } else na("laju WAN router", b.reason ?? "second_read_failed"); }
  else na("counter WAN router", a.reason ?? a.state);
} else console.log("\n[4] Router: dilewati (tambahkan --router)");

const dm = val("--discovery");
if (dm === "passive" || dm === "active") {
  console.log(`\n[5] Device Discovery (${dm})`); const r = discovery.start(dm, false, realDiscDeps()); if (!r.ok) na("discovery", r.code); else { while (["running", "stopping"].includes(discovery.status.state)) await sleep(300); const o = discovery.result(); R.results.discovery = { ...o, hosts: o.hosts.map((h) => ({ ...h, mac: h.mac ? red(h.mac) : null })), self: o.self ? { ...o.self, mac: o.self.mac ? red(o.self.mac) : null } : null };
    console.log(`  state=${o.status.state} subnet=${o.status.subnet ?? "-"} ditemukan=${o.hosts.length}${o.status.reason ? ` reason=${o.status.reason}` : ""}`); for (const h of o.hosts) console.log(`   ${h.ip.padEnd(15)} ${red(h.mac ?? "(tanpa MAC)")}  via=${h.via}`); }
} else console.log("\n[5] Discovery: dilewati (tambahkan --discovery passive|active)");

const secs = Number(val("--watch") ?? 0);
if (secs > 0) {
  console.log(`\n[6] WATCH ${secs} dtk — sekarang cabut/colok kabel LAN atau matikan/nyalakan Wi-Fi/router untuk menguji alert`);
  let list = []; let last = null; const tl = []; const end = Date.now() + secs * 1000;
  while (Date.now() < end) {
    const s = await collectSnapshot(INTERNET_TARGETS[0], d); const gw = s.gateway.probe, it = s.internet.probe;
    const cond = classifyCondition({ gwRtt: gw?.rttAvgMs ?? null, gwLoss: gw?.lossPct ?? null, inetRtt: it?.rttAvgMs ?? null, inetLoss: it?.lossPct ?? null });
    const ev = evaluate(liveAlertSamples({ enabled: true, status: "LIVE", snap: s, active: list }), DEFAULT_RULES, list, Date.now(), "LIVE", { cooldownMs: 60_000 }); list = ev.alerts; const t = new Date().toLocaleTimeString();
    const label = localLinkLost(s) ? `${cond} (jaringan lokal terputus: ${s.notes.join(",")})` : cond;
    if (label !== last) { console.log(`  ${t}  kondisi → ${label}`); last = label; tl.push({ t: Date.now(), cond, linkLost: localLinkLost(s) }); }
    for (const a of ev.started) { console.log(`  ${t}  ALERT  ${a.severity}  ${a.message}`); tl.push({ t: Date.now(), alert: "started", kind: a.kind, message: a.message }); }
    for (const a of ev.recovered) { console.log(`  ${t}  PULIH  ${a.message}`); tl.push({ t: Date.now(), alert: "recovered", kind: a.kind, message: a.message }); }
    await sleep(3000);
  }
  R.results.watch = tl;
}
const out = val("--out") ?? `netwatch-selftest-${Date.now()}.json`; writeFileSync(out, JSON.stringify(R, null, 2));
console.log(`\nLaporan: ${out}  (periksa dulu sebelum dibagikan; gunakan --redact untuk menyamarkan MAC/IP eksternal)\nTidak ada konfigurasi router atau sistem yang diubah. ${R.notAvailable.length} item NOT_AVAILABLE.\n`);
