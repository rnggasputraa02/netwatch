import http from "node:http";
import { devices, expect, start, test } from "./helpers";
import type { Page } from "@playwright/test";

// MOCK: /api/live/snapshot, /api/router/status dan /api/discovery dipalsukan lewat page.route untuk menguji UI, isolasi data, dan alur.
// Tes bertanda "API sungguhan" memanggil endpoint asli (hasil bergantung OS). Tidak ada router/perangkat nyata yang diuji di sini.
const BASE = Date.now();
const iface = { name: "Wi-Fi", ipv4: "192.168.1.23", netmask: "255.255.255.0", cidr: "192.168.1.0/24", mac: "aa:bb:cc:dd:ee:ff" };
const probe = (rtt: number | null, loss: number) => ({ host: "x", method: "icmp", sent: 4, received: loss >= 100 ? 0 : 4, lossPct: loss, rttMinMs: rtt, rttAvgMs: loss >= 100 ? null : rtt, rttMaxMs: rtt, error: null });
const snap = (n: number, over: object = {}) => ({ source: "LIVE", ts: BASE + n * 10_000, platform: "win32", interfaces: [iface], activeInterface: iface, counters: { ts: BASE + n * 10_000, ifaceName: "Wi-Fi", rxBytes: n * 1_250_000, txBytes: n * 125_000, method: "netadapter-powershell", error: null }, gateway: { ip: "192.168.1.1", probe: probe(3, 0) }, internet: { target: "1.1.1.1", probe: probe(20, 0) }, notes: [], ...over });
async function mockLive(page: Page, over: (n: number) => object = () => ({})) { let n = 0; await page.route("**/api/live/snapshot**", (r) => { n++; return r.fulfill({ json: snap(n, over(n)) }); }); }
const rstatus = (n: number, over: object = {}) => ({ source: "LIVE", ts: BASE + n * 10_000, state: "OK", reason: null, method: "upnp-igd", gatewayIp: "192.168.1.1", device: { friendlyName: "HG8145V5", manufacturer: "Huawei Technologies Co., Ltd", modelName: "HG8145V5", modelNumber: "HG8145V5" }, wan: { connectionStatus: "Connected", uptimeSec: 7200, externalIp: "203.0.113.9", rxBytes: n * 2_500_000, txBytes: n * 250_000, maxDownBps: 1_000_000_000, maxUpBps: 300_000_000 }, capabilities: { upnp: true, wanCounters: true, dhcpClients: "NOT_SUPPORTED", snmp: "NOT_PROBED", perDeviceTraffic: "NOT_SUPPORTED" }, ...over });
async function mockRouter(page: Page, make: (n: number) => object) { let n = 0; await page.route("**/api/router/status", (r) => { n++; return r.fulfill({ json: make(n) }); }); }
const LIVE_ON = { nw3_live: JSON.stringify({ enabled: true, target: "1.1.1.1" }) };
const ROUTER_ON = { nw5_cfg: JSON.stringify({ intervalSec: 10, routerEnabled: true, hostnames: true }) };
const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).click();

test.describe("v5: dasbor LIVE, bandwidth nyata, isolasi data", () => {
  test("dasbor: blok LIVE terpisah dari SIMULATION; throughput dihitung dari dua counter; kondisi Normal", async ({ page }) => {
    await mockLive(page); await start(page, "/live", { raw: LIVE_ON });
    await expect(page.getByTestId("live-ts")).toBeVisible(); await page.getByRole("button", { name: "Ukur sekarang" }).click(); await nav(page, "Dasbor");
    const ov = page.getByTestId("live-overview"); await expect(ov.getByTestId("pc-throughput")).toContainText("↓ 1.00 Mbps"); await expect(ov.getByTestId("pc-throughput")).toContainText("↑ 100.0 Kbps"); await expect(ov.getByTestId("cond-badge")).toHaveText("Normal");
    await expect(ov.getByTestId("dash-gw")).toContainText("3 ms"); await expect(ov.getByTestId("dash-router")).toHaveText("Nonaktif"); await expect(ov.locator("[data-source=SIMULATION]")).toHaveCount(0);
    await expect(page.getByTestId("sim-section").locator("[data-source=SIMULATION]")).toBeVisible(); await expect(page.getByTestId("sim-section")).not.toContainText("1.00 Mbps");
  });
  test("[mock] DISCONNECTED: blok LIVE kosong tanpa angka, data simulasi tetap di bagian sendiri", async ({ page, monitor }) => {
    monitor.allow(/api\/live\/snapshot/); await page.route("**/api/live/snapshot**", (r) => r.fulfill({ status: 500, json: { error: "probe_failed" } })); await start(page, "/dashboard", { raw: LIVE_ON });
    const ov = page.getByTestId("live-overview"); await expect(ov.locator("[data-source=DISCONNECTED]").first()).toBeVisible(); await expect(ov).toContainText("Data simulasi tidak dipakai"); await expect(ov.getByTestId("pc-throughput")).toHaveCount(0); await expect(ov.getByTestId("cond-badge")).toHaveCount(0);
    await expect(ov).not.toContainText(/\d+(\.\d+)? (ms|Mbps)/); await expect(page.getByText("Total Perangkat")).toBeVisible();
  });
  test("bandwidth: tiga metrik terpisah, router nonaktif tanpa angka, per perangkat NOT SUPPORTED, CSV berlabel LIVE", async ({ page }) => {
    await mockLive(page); await start(page, "/live", { raw: LIVE_ON }); await expect(page.getByTestId("live-ts")).toBeVisible(); await page.getByRole("button", { name: "Ukur sekarang" }).click(); await nav(page, "Bandwidth");
    await expect(page.getByTestId("bw-pc-now")).toContainText("1.00 Mbps"); await expect(page.getByTestId("bw-router")).toContainText("nonaktif"); await expect(page.getByTestId("bw-router")).not.toContainText("Mbps"); await expect(page.getByTestId("bw-device")).toContainText("NOT SUPPORTED");
    await expect(page.getByTestId("bw-device")).not.toContainText(/\d+ Mbps/); const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Ekspor CSV" }).first().click();
    const csv = (await (await (await dl).createReadStream()).toArray()).map(String).join(""); expect(csv.startsWith("\ufeffSumber,Waktu (ISO),Komputer download (Mbps)")).toBe(true); const rows = csv.split("\r\n").slice(1).filter(Boolean); expect(rows.length).toBeGreaterThanOrEqual(2); expect(rows.every((r) => r.startsWith("LIVE,"))).toBe(true);
    expect(rows[rows.length - 1].split(",").slice(4)).toEqual(["", ""]); expect(csv).not.toMatch(/NaN|undefined|null|SIMULATION/);
    await expect(page.getByRole("heading", { name: /^Simulasi/ })).toBeVisible();
  });
  test("[mock] penggunaan bandwidth tinggi: penanda TINGGI dan alert bandwidth_high LIVE bila melewati ambang", async ({ page }) => {
    await mockLive(page, (n) => ({ counters: { ts: BASE + n * 10_000, ifaceName: "Wi-Fi", rxBytes: n * 125_000_000, txBytes: 0, method: "netadapter-powershell", error: null } }));
    await start(page, "/live", { raw: LIVE_ON }); await expect(page.getByTestId("live-ts")).toBeVisible(); await page.getByRole("button", { name: "Ukur sekarang" }).click(); await page.waitForTimeout(600); await page.getByRole("button", { name: "Ukur sekarang" }).click(); await nav(page, "Bandwidth"); // alert butuh 2 pengukuran berturut-turut melewati ambang (v5.1.1)
    await expect(page.getByTestId("bw-pc-now")).toContainText("TINGGI"); await nav(page, "Alert"); const a = page.locator("[data-testid=alert-active][data-source=LIVE]", { hasText: "throughput" }); await expect(a).toHaveCount(1); await expect(a).toContainText("melebihi 80 Mbps");
  });
});

test.describe("v5: router (UPnP)", () => {
  test("[mock] OK: perangkat terkonfirmasi HG8145V5, counter WAN menghasilkan laju, kapabilitas jujur", async ({ page }) => {
    await mockLive(page); await mockRouter(page, (n) => rstatus(n)); await start(page, "/router", { raw: { ...LIVE_ON, ...ROUTER_ON } });
    await expect(page.getByTestId("router-state")).toHaveText("OK"); await expect(page.getByTestId("router-device")).toContainText("Terkonfirmasi sebagai Huawei HG8145V5"); await expect(page.getByTestId("cap-dhcp")).toHaveText("NOT SUPPORTED"); await expect(page.getByTestId("cap-snmp")).toHaveText("NOT PROBED"); await expect(page.getByTestId("cap-perdev")).toHaveText("NOT SUPPORTED");
    await page.getByLabel("Aktifkan integrasi router (UPnP, baca-saja)").uncheck(); await page.getByLabel("Aktifkan integrasi router (UPnP, baca-saja)").check(); await nav(page, "Perangkat Terdeteksi"); await nav(page, "Bandwidth");
    await expect(page.getByTestId("bw-router")).toContainText("Counter router"); await expect(page.getByTestId("bw-pc")).toBeVisible();
  });
  test("[mock] laju router muncul setelah dua pembacaan (ubah interval memicu pembacaan ulang)", async ({ page }) => {
    await mockRouter(page, (n) => rstatus(n)); await mockLive(page); await start(page, "/live", { raw: { ...LIVE_ON, ...ROUTER_ON } }); await expect(page.getByTestId("live-ts")).toBeVisible();
    await page.getByLabel("Interval pengukuran").selectOption("30"); await page.getByLabel("Interval pengukuran").selectOption("10"); await nav(page, "Bandwidth");
    await expect(page.getByTestId("bw-router-now")).toContainText("2.00 Mbps"); await expect(page.getByTestId("bw-router-now")).toContainText("↑ 200.0 Kbps");
  });
  test("[mock] UNKNOWN/NOT_SUPPORTED/UNREACHABLE tidak menampilkan angka palsu; UNREACHABLE membuat alert LIVE", async ({ page }) => {
    for (const [state, reason] of [["UNKNOWN", "upnp_no_response"], ["NOT_SUPPORTED", "no_wan_counters"]] as const) {
      await page.route("**/api/router/status", (r) => r.fulfill({ json: rstatus(1, { state, reason, device: null, wan: null }) }), { times: 1 });
    }
    await mockLive(page); await page.unroute("**/api/router/status"); await page.route("**/api/router/status", (r) => r.fulfill({ json: rstatus(1, { state: "UNKNOWN", reason: "upnp_no_response", device: null, wan: null, capabilities: { upnp: false, wanCounters: false, dhcpClients: "NOT_SUPPORTED", snmp: "NOT_PROBED", perDeviceTraffic: "NOT_SUPPORTED" } }) }));
    await start(page, "/router", { raw: ROUTER_ON }); await expect(page.getByTestId("router-state")).toHaveText("UNKNOWN"); await expect(page.getByTestId("router-card")).toContainText("UPnP mungkin dinonaktifkan"); await expect(page.getByTestId("router-card")).not.toContainText("Mbps"); await expect(page.getByTestId("cap-wan")).toContainText("UNKNOWN");
    await nav(page, "Bandwidth"); await expect(page.getByTestId("bw-router-state")).toContainText("UNKNOWN"); await expect(page.getByTestId("bw-router")).not.toContainText(/\d+(\.\d+)? Mbps/);
    await page.unroute("**/api/router/status"); let k = 1; await page.route("**/api/router/status", (r) => r.fulfill({ json: rstatus(++k, { state: "UNREACHABLE", reason: "counters_unreachable", wan: null }) })); // ts berbeda tiap pembacaan; alert butuh 2 pembacaan berturut-turut (v5.1.1)
    await page.getByRole("link", { name: "Router", exact: true }).click(); await page.getByLabel("Aktifkan integrasi router (UPnP, baca-saja)").uncheck(); await page.getByLabel("Aktifkan integrasi router (UPnP, baca-saja)").check(); await expect(page.getByTestId("router-state")).toHaveText("UNREACHABLE");
    await nav(page, "Alert"); const a = page.locator("[data-testid=alert-active][data-source=LIVE]", { hasText: "Router (UPnP) tidak dapat diakses" }); await expect(a).toHaveCount(1, { timeout: 25_000 }); await expect(a).toHaveAttribute("data-severity", "warning"); // butuh 2 pembacaan router berturut-turut (v5.1.1): pembacaan kedua datang dari polling 10 dtk; menonaktifkan/mengaktifkan router di antaranya sengaja memutus hitungan
  });
  test("API sungguhan: bentuk respons, tanpa angka bila tidak ada gateway/UPnP; host non-loopback 403", async ({ request, baseURL }) => {
    const r = await request.get("/api/router/status"); expect(r.status()).toBe(200); const j = await r.json(); expect(j.source).toBe("LIVE"); expect(["OK", "NOT_SUPPORTED", "UNREACHABLE", "UNKNOWN"]).toContain(j.state); expect(j.capabilities.dhcpClients).toBe("NOT_SUPPORTED"); expect(j.capabilities.snmp).toBe("NOT_PROBED"); if (j.state !== "OK") expect(j.wan).toBeNull();
    const u = new URL(baseURL!); const status = await new Promise<number>((res, rej) => { const q = http.request({ host: u.hostname, port: u.port, path: "/api/router/status", headers: { Host: "evil.example.com" } }, (resp) => { resp.resume(); res(resp.statusCode ?? 0); }); q.on("error", rej); q.end(); }); expect(status).toBe(403);
  });
});

type H = { ip: string; mac: string | null; hostname?: string | null; responded?: boolean };
async function mockDisc(page: Page, scans: H[][], captured: { bodies: unknown[]; headers: (string | undefined)[] } = { bodies: [], headers: [] }) {
  let scan = 0; let mode: "passive" | "active" = "active"; let running = false;
  const status = (state: string) => ({ state, mode, startedAt: 1, finishedAt: state === "done" ? 1000 * scan : null, total: mode === "active" ? 253 : 0, probed: state === "done" ? 253 : 10, found: scans[scan - 1]?.length ?? 0, subnet: "192.168.1.0/24", reason: null, stopped: false });
  const result = (state: string) => ({ status: status(state), hosts: state === "done" ? (scans[scan - 1] ?? []).map((h) => ({ ip: h.ip, mac: h.mac, hostname: h.hostname ?? null, responded: h.responded ?? true, via: (h.responded ?? true) ? "ping+arp" : "arp" })) : [], self: { ip: "192.168.1.23", mac: "aa:bb:cc:dd:ee:ff", name: "Wi-Fi" }, gatewayIp: "192.168.1.1" });
  await page.route("**/api/discovery", async (r) => {
    const req = r.request();
    if (req.method() === "POST") { captured.bodies.push(req.postDataJSON()); captured.headers.push(req.headers()["x-netwatch"]); const b = req.postDataJSON() as { action: string; mode?: "passive" | "active" }; if (b.action === "start") { scan++; mode = b.mode ?? "active"; running = true; return r.fulfill({ status: 202, json: result("running") }); } running = false; return r.fulfill({ json: { stopped: true } }); }
    if (running) { running = false; return r.fulfill({ json: result("running") }); }
    return r.fulfill({ json: scan === 0 ? { status: { ...status("idle"), mode: null }, hosts: [], self: null, gatewayIp: null } : result("done") });
  });
}
test.describe("v5: device discovery", () => {
  const A: H[] = [{ ip: "192.168.1.1", mac: "a4:99:47:12:34:56", hostname: "router.lan" }, { ip: "192.168.1.40", mac: "3a:11:22:33:44:55" }, { ip: "192.168.1.77", mac: "b8:00:00:00:00:77", responded: false }];
  test("[mock] pemindaian aktif: permintaan aman (header CSRF, body ketat), hasil, jenis hanya dengan bukti, ping-diblokir tetap tampil", async ({ page }) => {
    const cap = { bodies: [] as unknown[], headers: [] as (string | undefined)[] }; await mockDisc(page, [A], cap); await start(page, "/discovery");
    await expect(page.getByTestId("disc-status")).toContainText("Belum ada pemindaian"); await expect(page.getByTestId("known-empty")).toBeVisible(); await expect(page.getByText("memblokir ping bisa tetap aktif")).toBeVisible();
    await page.getByRole("button", { name: "Pindai subnet lokal (aktif)" }).click(); await expect(page.getByTestId("disc-state")).toHaveText("done", { timeout: 10000 });
    expect(cap.bodies[0]).toEqual({ action: "start", mode: "active", hostnames: true }); expect(cap.headers[0]).toBe("1"); await expect(page.getByTestId("disc-row")).toHaveCount(3);
    await expect(page.getByTestId("disc-row").first()).toContainText("Gateway (rute default)"); await expect(page.getByTestId("disc-row").nth(1)).toContainText("Tidak diketahui"); await expect(page.getByTestId("disc-row").nth(2)).toContainText("Hanya tabel ARP"); await expect(page.getByTestId("disc-row").first()).toContainText("router.lan");
    await expect(page.getByTestId("known-row")).toHaveCount(4); await expect(page.getByTestId("known-row").filter({ hasText: "Komputer ini" })).toHaveCount(1); await expect(page.getByTestId("known-row").filter({ hasText: "3a:11:22:33:44:55" })).toContainText("ⓟ");
    await page.reload(); await expect(page.getByTestId("known-row")).toHaveCount(4); // riwayat tersimpan
    const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Ekspor CSV" }).click(); const csv = (await (await (await dl).createReadStream()).toArray()).map(String).join(""); expect(csv).toContain("Sumber,IP,MAC,Hostname,Jenis,Status"); expect(csv.split("\r\n").slice(1).every((l) => l.startsWith("LIVE,"))).toBe(true);
  });
  test("[mock] perangkat baru memicu alert info setelah baseline; pemindaian pertama tidak memicu; Akui menutup alert", async ({ page }) => {
    await mockDisc(page, [A, [...A, { ip: "192.168.1.90", mac: "b8:11:11:11:11:90", hostname: "tv-ruang" }]]); await start(page, "/discovery");
    await page.getByRole("button", { name: "Baca tabel ARP (pasif)" }).click(); await expect(page.getByTestId("disc-state")).toHaveText("done", { timeout: 10000 }); await nav(page, "Alert"); await expect(page.getByRole("heading", { name: "Alert", exact: true })).toBeVisible(); await expect(page.locator("[data-testid=alert-active]", { hasText: "Perangkat baru" })).toHaveCount(0);
    await nav(page, "Perangkat Terdeteksi"); await page.getByRole("button", { name: "Pindai subnet lokal (aktif)" }).click(); await expect(page.getByTestId("known-row")).toHaveCount(5, { timeout: 10000 }); await nav(page, "Alert");
    const a = page.locator("[data-testid=alert-active][data-source=LIVE]", { hasText: "Perangkat baru terdeteksi: 192.168.1.90" }); await expect(a).toHaveCount(1); await expect(a).toHaveAttribute("data-severity", "info"); await expect(a).toContainText("tv-ruang");
    await a.getByRole("button", { name: "Akui" }).click(); await expect(a).toHaveCount(0); await expect(page.locator("[data-testid=alert-past]", { hasText: "192.168.1.90" })).toHaveCount(1);
  });
  test("[mock] tombol Berhenti hanya aktif saat berjalan dan mengirim aksi stop", async ({ page }) => {
    const cap = { bodies: [] as unknown[], headers: [] as (string | undefined)[] }; await mockDisc(page, [A], cap); await start(page, "/discovery"); await expect(page.getByRole("button", { name: "Berhenti" })).toBeDisabled();
    await page.route("**/api/discovery", async (r) => { if (r.request().method() === "GET") return r.fulfill({ json: { status: { state: "running", mode: "active", startedAt: 1, finishedAt: null, total: 253, probed: 40, found: 2, subnet: "192.168.1.0/24", reason: null, stopped: false }, hosts: [], self: null, gatewayIp: null } }); cap.bodies.push(r.request().postDataJSON()); return r.fulfill({ json: { stopped: true } }); });
    await page.getByRole("button", { name: "Pindai subnet lokal (aktif)" }).click().catch(() => undefined); await page.reload(); await expect(page.getByRole("button", { name: "Berhenti" })).toBeEnabled(); await expect(page.getByLabel("Kemajuan pemindaian")).toHaveAttribute("value", "40");
    await page.getByRole("button", { name: "Berhenti" }).click(); await expect.poll(() => cap.bodies.some((b) => (b as { action: string }).action === "stop")).toBe(true);
  });
  test("API sungguhan: CSRF, host, validasi body, dan bentuk status", async ({ request, baseURL }) => {
    expect((await request.post("/api/discovery", { data: { action: "stop" } })).status()).toBe(403);
    const H = { "X-NetWatch": "1" }; expect((await request.post("/api/discovery", { headers: { ...H, Origin: "http://evil.example" }, data: { action: "stop" } })).status()).toBe(403);
    for (const bad of [{ action: "start", mode: "full", hostnames: true }, { action: "start", mode: "active" }, { action: "start", mode: "active", hostnames: true, targets: ["8.8.8.8"] }, { action: "stop", x: 1 }, { action: "format" }, "teks"]) expect((await request.post("/api/discovery", { headers: H, data: bad as object })).status(), JSON.stringify(bad)).toBe(400);
    const g = await request.get("/api/discovery"); expect(g.status()).toBe(200); const j = await g.json(); expect(["idle", "running", "stopping", "done", "error"]).toContain(j.status.state); expect(Array.isArray(j.hosts)).toBe(true);
    const u = new URL(baseURL!); const code = await new Promise<number>((res, rej) => { const q = http.request({ host: u.hostname, port: u.port, path: "/api/discovery", headers: { Host: "evil.example.com" } }, (resp) => { resp.resume(); res(resp.statusCode ?? 0); }); q.on("error", rej); q.end(); }); expect(code).toBe(403);
    const s = await request.post("/api/discovery", { headers: H, data: { action: "start", mode: "passive", hostnames: false } }); expect([202, 409, 429]).toContain(s.status());
    await expect.poll(async () => (await (await request.get("/api/discovery")).json()).status.state, { timeout: 15000 }).not.toBe("running");
  });
});

const live = (n: number, t0: number, over: Partial<{ gwRtt: number | null; gwLoss: number | null; inetRtt: number | null; inetLoss: number | null }> = {}) => ({ id: `p${t0}${n}`, t: t0 + n * 10_000, gwRtt: 3, gwLoss: 0, inetRtt: 20, inetLoss: 0, ...over });
test.describe("v5: analitik, laporan, topologi nyata, migrasi", () => {
  test("analitik: statistik, indikasi hambatan berbasis bukti, insiden, dan laporan dari agregasi", async ({ page }) => {
    const t0 = Date.now() - 20 * 10_000; const pts = Array.from({ length: 20 }, (_, i) => (i < 8 ? live(i, t0) : live(i, t0, { inetRtt: 400, inetLoss: 8 })));
    const inc = [{ id: "i1", t: t0 + 80_000, from: "NORMAL", to: "DEGRADED", summary: "Kualitas menurun: latency atau packet loss di atas ambang." }];
    const bucket = { t: Math.floor(Date.now() / 600_000) * 600_000, n: 4, c: [3, 1, 0, 0, 0], gwRtt: { s: 12, n: 4, m: 4 }, inRtt: { s: 80, n: 4, m: 30 }, gwLoss: { s: 0, n: 4, m: 0 }, inLoss: { s: 0, n: 4, m: 0 }, pcRx: { s: 8e6, n: 4, m: 3e6 }, pcTx: { s: 1e6, n: 4, m: 5e5 }, rtRx: { s: 0, n: 0, m: 0 }, rtTx: { s: 0, n: 0, m: 0 }, by: { pcRx: 5_000_000, pcTx: 625_000, rtRx: 0, rtTx: 0 } };
    await start(page, "/analytics", { raw: { nw3_live_hist: JSON.stringify(pts), nw5_incidents: JSON.stringify(inc), nw5_buckets: JSON.stringify([bucket]) } });
    await expect(page.getByTestId("hints")).toContainText("setelah router"); await expect(page.getByTestId("hints")).toContainText("Bukti:"); await expect(page.getByTestId("summary-cond")).toContainText("Tidak diketahui (data lama/terputus)");
    await expect(page.getByRole("table", { name: "Analisis latency" })).toContainText("Gateway"); await expect(page.getByTestId("incident-row")).toHaveCount(1);
    await expect(page.getByTestId("report-day-uptime")).toHaveText("100 %"); await expect(page.getByTestId("report-day")).toContainText("Router WAN: rata-rata ↓/↑"); await expect(page.getByTestId("report-day")).toContainText("— / —");
    const dl = page.waitForEvent("download"); await page.getByTestId("report-day").getByRole("button", { name: "CSV" }).click(); const csv = (await (await (await dl).createReadStream()).toArray()).map(String).join(""); expect(csv.startsWith("\ufeffSumber,Laporan,Metrik,Nilai,Satuan")).toBe(true); expect(csv).toContain("Router (UPnP): download rata-rata\",\"\""); expect(csv).not.toMatch(/NaN|undefined|null|SIMULATION/);
    const dl2 = page.waitForEvent("download"); await page.getByRole("button", { name: "CSV gangguan" }).click(); expect((await (await (await dl2).createReadStream()).toArray()).map(String).join("")).toContain("Sumber,Waktu (ISO),Dari,Ke,Ringkasan");
  });
  test("analitik: data belum cukup → pesan jelas, bukan angka; tanpa riwayat → laporan kosong", async ({ page }) => {
    await start(page, "/analytics"); await expect(page.getByTestId("summary")).toContainText("Data belum cukup"); await expect(page.getByTestId("no-incidents")).toBeVisible(); await expect(page.getByTestId("report-day")).toContainText("Belum ada data LIVE");
  });
  test("topologi nyata: tab terpisah, OFF = kosong; LIVE = internet/gateway/komputer + perangkat dalam kotak subnet tanpa garis tebakan", async ({ page }) => {
    await start(page, "/topology"); await expect(page.locator("svg g.cursor-pointer").first()).toBeVisible(); await page.getByRole("tab", { name: "Jaringan Nyata" }).click(); await expect(page.getByTestId("realmap-empty")).toContainText("Aktifkan Monitoring Nyata");
    await mockLive(page); const known = [{ id: "m1", ip: "192.168.1.1", mac: "a4:99:47:12:34:56", hostname: null, firstSeen: 1, lastSeen: 2, online: true, role: "gateway", privateMac: false }, { id: "m2", ip: "192.168.1.40", mac: "3a:11:22:33:44:55", hostname: "hp-andi", firstSeen: 1, lastSeen: 2, online: true, role: "unknown", privateMac: true }, { id: "m3", ip: "192.168.1.77", mac: "b8:00:00:00:00:77", hostname: null, firstSeen: 1, lastSeen: 2, online: false, role: "unknown", privateMac: false }];
    await page.goto("/live"); await page.evaluate((k) => { localStorage.setItem("nw5_known", JSON.stringify(k)); localStorage.setItem("nw3_live", JSON.stringify({ enabled: true, target: "1.1.1.1" })); }, known); await page.reload();
    await nav(page, "Topologi"); await page.getByRole("tab", { name: "Jaringan Nyata" }).click(); const m = page.getByTestId("realmap"); await expect(m).toBeVisible(); for (const id of ["node-internet", "node-gateway", "node-self"]) await expect(m.getByTestId(id)).toBeVisible();
    await expect(m.getByTestId("node-device")).toHaveCount(2); await expect(m.locator("svg line")).toHaveCount(2); await expect(m.getByTestId("lan-box")).toContainText("tidak diketahui, tanpa garis"); await expect(m).toContainText("hp-andi");
    await page.getByRole("tab", { name: "Simulasi" }).click(); await expect(page.locator("svg g.cursor-pointer").first()).toBeVisible();
  });
  test("migrasi skema: data v3 dipertahankan, severity ditambahkan, schema=5; versi masa depan tidak disentuh", async ({ page }) => {
    const old = [{ id: "a1", key: "LIVE|gateway|gateway_down", source: "LIVE", kind: "gateway_down", subject: "Gateway", message: "[LIVE] Gateway tidak merespons", startedAt: 1, recoveredAt: 2, ack: false }];
    await start(page, "/alerts", { raw: { nw3_alerts: JSON.stringify(old) } }); await expect(page.getByTestId("alert-past")).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem("nw_schema"))).toBe("5"); expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nw3_alerts") ?? "[]").find((a: { id: string }) => a.id === "a1").severity)).toBe("critical");
  });
  test("skema dari versi lebih baru: data tidak diubah dan pengguna diberi peringatan", async ({ page }) => {
    await start(page, "/dashboard", { raw: { nw_schema: "9" } }); await expect(page.getByRole("status").filter({ hasText: "versi NetWatch yang lebih baru" })).toBeVisible(); expect(await page.evaluate(() => localStorage.getItem("nw_schema"))).toBe("9");
  });
  test("pengaturan v5 tersimpan (interval, router, hostname) dan Reset Semua Data mengembalikannya serta menghapus riwayat LIVE", async ({ page }) => {
    await mockLive(page); await mockRouter(page, (n) => rstatus(n)); await start(page, "/live", { raw: LIVE_ON }); await page.getByLabel("Interval pengukuran").selectOption("30");
    await page.goto("/router"); await page.getByLabel("Aktifkan integrasi router (UPnP, baca-saja)").check(); await page.goto("/discovery"); await page.getByLabel("Cari hostname (reverse DNS)").uncheck();
    const cfg = () => page.evaluate(() => JSON.parse(localStorage.getItem("nw5_cfg") ?? "{}")); await expect.poll(cfg).toEqual({ intervalSec: 30, routerEnabled: true, hostnames: false });
    await page.goto("/settings"); await page.getByRole("button", { name: "Reset Semua Data" }).click(); await page.locator("dialog button", { hasText: "Reset" }).last().click(); await expect.poll(cfg).toEqual({ intervalSec: 10, routerEnabled: false, hostnames: true });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nw5_known") ?? "[]").length + JSON.parse(localStorage.getItem("nw5_bw") ?? "[]").length + JSON.parse(localStorage.getItem("nw3_live_hist") ?? "[]").length)).toBe(0);
  });
  test("data rusak pada kunci v5 diabaikan tanpa crash", async ({ page }) => {
    await start(page, "/analytics", { raw: { nw5_cfg: "{x", nw5_known: "[[", nw5_bw: JSON.stringify([1, { id: "x", t: "bad" }]), nw5_buckets: "7", nw5_incidents: "null" } }); await expect(page.getByRole("heading", { name: "Analitik & Laporan" })).toBeVisible(); await expect(page.getByTestId("summary")).toContainText("Data belum cukup");
  });
  test("halaman baru: heading h1, tabel punya header, navigasi sidebar", async ({ page }) => {
    await start(page, "/dashboard"); for (const [link, h] of [["Perangkat Terdeteksi", "Perangkat Terdeteksi"], ["Router", "Integrasi Router (Huawei HG8145V5)"], ["Analitik & Laporan", "Analitik & Laporan"]] as const) { await nav(page, link); await expect(page.getByRole("heading", { level: 1, name: h })).toBeVisible(); }
    await expect(page.getByRole("columnheader").first()).toBeVisible(); void devices;
  });
});
