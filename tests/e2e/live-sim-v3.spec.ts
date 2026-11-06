import http from "node:http";
import { devices, expect, logs, start, test } from "./helpers";
import type { Page } from "@playwright/test";

// MOCK: respons /api/live/snapshot dipalsukan lewat page.route. Tes ini memverifikasi UI dan logika sumber data,
// BUKAN pengukuran ICMP/route sungguhan. Tes dengan API sungguhan diberi label "API sungguhan".
const probe = (rtt: number | null, loss: number, over: object = {}) => ({ host: "x", method: "icmp", sent: 4, received: loss >= 100 ? 0 : 4, lossPct: loss, rttMinMs: rtt, rttAvgMs: loss >= 100 ? null : rtt, rttMaxMs: rtt, error: null, ...over });
const iface = { name: "Wi-Fi", ipv4: "192.168.1.23", netmask: "255.255.255.0", cidr: "192.168.1.0/24", mac: "aa:bb:cc:dd:ee:ff" };
const snap = (over: object = {}) => ({ source: "LIVE", ts: Date.now(), platform: "win32", interfaces: [iface], activeInterface: iface, gateway: { ip: "192.168.1.1", probe: probe(3, 0) }, internet: { target: "1.1.1.1", probe: probe(20, 0) }, notes: [], ...over });
async function mockLive(page: Page, make: () => object | null) {
  await page.route("**/api/live/snapshot**", (r) => { const b = make(); return b ? r.fulfill({ json: b }) : r.fulfill({ status: 500, json: { error: "probe_failed" } }); });
}
const LIVE_ON = { nw3_live: JSON.stringify({ enabled: true, target: "1.1.1.1" }) };
const RUN = { paused: false, interval: 1 } as const;

test.describe("v3: monitoring nyata terisolasi dari simulasi", () => {
  test("default nonaktif: badge OFF, tidak ada request ke /api/live/snapshot", async ({ page }) => {
    const reqs: string[] = []; page.on("request", (r) => { if (r.url().includes("/api/live/")) reqs.push(r.url()); });
    await start(page, "/live"); await expect(page.locator("main [data-source=OFF]").first()).toBeVisible(); await expect(page.getByTestId("live-message")).toContainText("nonaktif");
    await page.waitForTimeout(1500); expect(reqs).toEqual([]);
    await page.goto("/dashboard"); await expect(page.getByTestId("live-section")).toContainText("Nonaktif");
  });
  test("[mock] LIVE: interface, subnet, gateway, RTT, loss tampil; bagian simulasi tetap berlabel SIMULATION", async ({ page }) => {
    await mockLive(page, () => snap()); await start(page, "/live", { raw: LIVE_ON });
    await expect(page.locator("main [data-source=LIVE]").first()).toBeVisible();
    await expect(page.getByTestId("iface-card")).toContainText("192.168.1.0/24"); await expect(page.getByTestId("probe-gateway")).toContainText("192.168.1.1");
    await expect(page.getByTestId("probe-gateway").getByTestId("rtt-avg")).toHaveText("3 ms"); await expect(page.getByTestId("probe-internet").getByTestId("loss")).toHaveText("0 %");
    await page.goto("/dashboard"); await expect(page.getByTestId("live-gw")).toContainText("3 ms"); await expect(page.getByTestId("live-section").locator("[data-source=LIVE]")).toBeVisible();
    await expect(page.getByTestId("sim-section").locator("[data-source=SIMULATION]")).toBeVisible();
    await expect(page.getByTestId("sim-section")).not.toContainText("3 ms");
  });
  test("[mock] DISCONNECTED: tidak ada angka palsu dan simulasi tidak dipakai sebagai pengganti", async ({ page, monitor }) => {
    monitor.allow(/api\/live\/snapshot/); await mockLive(page, () => null); await start(page, "/live", { raw: LIVE_ON });
    await expect(page.locator("main [data-source=DISCONNECTED]").first()).toBeVisible(); await expect(page.getByTestId("live-message")).toContainText("TIDAK dipakai");
    await expect(page.getByTestId("probe-gateway")).toHaveCount(0);
    await page.goto("/dashboard"); await expect(page.getByTestId("live-section")).toContainText("Terputus"); await expect(page.getByTestId("live-gw")).toHaveCount(0);
    await expect(page.getByTestId("live-section")).not.toContainText(/\d+(\.\d+)? ms/);
    await expect(page.getByText("Total Perangkat")).toBeVisible(); // data simulasi tetap ada, di bagian sendiri
  });
  test("[mock] STALE: data lama diberi penanda", async ({ page }) => {
    await mockLive(page, () => snap({ ts: Date.now() - 120_000 })); await start(page, "/live", { raw: LIVE_ON });
    await expect(page.locator("main [data-source=STALE]").first()).toBeVisible(); await expect(page.getByTestId("live-message")).toContainText("Data lama");
  });
  test("[mock] ping tidak tersedia: nilai '—' + alasan, bukan 0", async ({ page }) => {
    const miss = probe(null, 0, { received: 0, sent: 4, lossPct: null, rttAvgMs: null, rttMinMs: null, rttMaxMs: null, error: "ping_unavailable" });
    await mockLive(page, () => snap({ gateway: { ip: null, probe: null }, internet: { target: "1.1.1.1", probe: miss }, notes: ["ping_unavailable", "gateway_not_found"] }));
    await start(page, "/live", { raw: LIVE_ON }); await expect(page.getByTestId("probe-internet")).toContainText("Tidak tersedia"); await expect(page.getByTestId("probe-internet").getByTestId("rtt-avg")).toHaveCount(0);
    await expect(page.getByTestId("probe-gateway")).toContainText("tidak ditemukan"); await expect(page.getByTestId("live-notes")).toContainText("ping tidak ditemukan");
    await page.goto("/dashboard"); await expect(page.getByTestId("live-inet")).toHaveCount(1); await expect(page.getByTestId("live-inet")).toContainText("— · loss —");
  });
  test("[mock] alert LIVE muncul saat gateway 100% loss, terpisah dari simulasi, dan pulih; log & CSV berlabel LIVE", async ({ page }) => {
    let bad = true; await mockLive(page, () => snap({ gateway: { ip: "192.168.1.1", probe: bad ? probe(null, 100) : probe(3, 0) } }));
    await start(page, "/alerts", { raw: LIVE_ON, cfg: { paused: true } });
    // v5.1.1: alert butuh 2 pengukuran berturut-turut (anti alarm palsu) → satu pengukuran gagal BELUM membuat alert
    const live = page.locator('[data-testid=alert-active][data-source=LIVE]'); await page.waitForTimeout(1500); await expect(live).toHaveCount(0);
    await page.goto("/live"); await page.getByRole("button", { name: "Ukur sekarang" }).click(); await page.waitForTimeout(500); await page.goto("/alerts");
    await expect(live).toHaveCount(1); await expect(live).toContainText("Gateway 192.168.1.1 tidak merespons"); await expect(live).toContainText("[LIVE]");
    await expect(page.locator('[data-testid=alert-active][data-source=SIMULATION]').first()).toContainText("[SIMULASI]"); // alert simulasi (perangkat offline) terpisah
    bad = false; await page.goto("/live"); for (let i = 0; i < 2; i++) { await page.getByRole("button", { name: "Ukur sekarang" }).click(); await page.waitForTimeout(600); } await page.goto("/alerts"); // pulih butuh 2 pengukuran normal berturut-turut
    await expect(page.locator('[data-testid=alert-past][data-source=LIVE]')).toHaveCount(1, { timeout: 15000 }); await expect(live).toHaveCount(0);
    await page.goto("/logs"); const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Ekspor CSV" }).click();
    const csv = (await (await (await dl).createReadStream()).toArray()).map(String).join(""); expect(csv).toContain("Prioritas,Sumber"); expect(csv).toMatch(/ALERT \[LIVE\] Gateway[^\n]*"LIVE"/); expect(csv).toMatch(/"SIMULATION"/);
  });
  test("[mock] ekspor CSV riwayat LIVE: label sumber, BOM, sel kosong untuk nilai tidak tersedia", async ({ page }) => {
    let n = 0, bad = false; await mockLive(page, () => snap({ ts: Date.now() + ++n, internet: { target: "1.1.1.1", probe: bad ? probe(null, 100) : probe(20, 0) } }));
    await start(page, "/live", { raw: LIVE_ON }); const loss = page.getByTestId("probe-internet").getByTestId("loss");
    await expect(loss).toHaveText("0 %"); bad = true; await page.getByRole("button", { name: "Ukur sekarang" }).click(); await expect(loss).toHaveText("100 %");
    bad = false; await page.getByRole("button", { name: "Ukur sekarang" }).click(); await expect(loss).toHaveText("0 %");
    await expect(page.getByRole("button", { name: "Ekspor CSV (LIVE)" })).toBeEnabled(); const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Ekspor CSV (LIVE)" }).click();
    const csv = (await (await (await dl).createReadStream()).toArray()).map(String).join(""); expect(csv.startsWith("\ufeffSumber,Waktu (ISO)")).toBe(true);
    const rows = csv.split("\r\n").slice(1).filter(Boolean); expect(rows.length).toBeGreaterThanOrEqual(3); expect(rows.every((r) => r.startsWith("LIVE,"))).toBe(true); expect(csv).not.toMatch(/SIMULATION|NaN|undefined|null/);
    expect(rows.filter((r) => r.endsWith(",,100")).length).toBe(1); // RTT internet kosong (bukan 0), loss 100, tepat satu titik
  });
  test("API sungguhan: bentuk respons LIVE, target dibatasi, host non-loopback ditolak", async ({ request, baseURL }) => {
    const r = await request.get("/api/live/snapshot"); expect(r.status()).toBe(200); const j = await r.json();
    expect(j.source).toBe("LIVE"); expect(Array.isArray(j.interfaces)).toBe(true); expect(j.internet.target).toBe("1.1.1.1"); expect(Array.isArray(j.notes)).toBe(true); expect(r.headers()["cache-control"]).toContain("no-store");
    for (const bad of ["evil.com", "1.1.1.1;calc", "1.1.1.1%20%26%26%20dir", "8.8.8.8%0Acalc", "127.0.0.1"]) expect((await request.get(`/api/live/snapshot?internet=${bad}`)).status(), bad).toBe(400);
    expect((await request.get("/api/live/snapshot?internet=8.8.8.8")).status()).toBe(200);
    const u = new URL(baseURL!); const status = await new Promise<number>((res, rej) => { const q = http.request({ host: u.hostname, port: u.port, path: "/api/live/snapshot", headers: { Host: "evil.example.com" } }, (resp) => { resp.resume(); res(resp.statusCode ?? 0); }); q.on("error", rej); q.end(); });
    expect(status).toBe(403);
  });
  test("API sungguhan di UI: mengaktifkan monitoring menghasilkan LIVE (nilai bergantung pada OS; ping mungkin tidak tersedia)", async ({ page }) => {
    test.setTimeout(120_000); // perintah Windows sungguhan (ping, route, arp, PowerShell) lambat saat 8 worker berjalan bersamaan
    await start(page, "/live"); await page.getByLabel("Aktifkan monitoring nyata").check();
    await expect(page.locator("main [data-source=LIVE]").first()).toBeVisible({ timeout: 60000 }); await expect(page.getByTestId("live-ts")).toBeVisible({ timeout: 90000 }); // snapshot Windows sungguhan (ping x2 + route + arp + PowerShell) dapat >7 dtk
  });
  test("pengaturan LIVE tersimpan, target hanya dari daftar, dan Reset menonaktifkannya", async ({ page }) => {
    await mockLive(page, () => snap()); await start(page, "/live"); await page.getByLabel("Aktifkan monitoring nyata").check(); await page.getByLabel("Target tes internet").selectOption("9.9.9.9");
    await page.reload(); await expect(page.getByLabel("Aktifkan monitoring nyata")).toBeChecked(); await expect(page.getByLabel("Target tes internet")).toHaveValue("9.9.9.9");
    await page.goto("/settings"); await page.getByRole("button", { name: "Reset Semua Data" }).click(); await page.locator("dialog button", { hasText: "Reset" }).last().click();
    await page.goto("/live"); await expect(page.getByLabel("Aktifkan monitoring nyata")).not.toBeChecked();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nw3_live") ?? "{}").enabled)).toBe(false);
  });
  test("localStorage LIVE rusak diabaikan tanpa crash", async ({ page }) => {
    await start(page, "/live", { raw: { nw3_live: "{rusak", nw3_live_hist: JSON.stringify([1, { id: "x", t: "bad" }]), nw3_alerts: "[[", nw3_scn: "{}", nw3_rules: "7" } });
    await expect(page.getByRole("heading", { name: "Monitoring Nyata" })).toBeVisible(); await expect(page.locator("main [data-source=OFF]").first()).toBeVisible();
  });
});

test.describe("v3: simulasi lanjutan", () => {
  test("skenario latency: mulai → alert SIMULATION → pause/resume → selesai & pulih, tercatat di log", async ({ page }) => {
    // Simulasi membalik online/offline perangkat secara acak (pickFlip: r1 < 0.06 tiap tick). Agar tes deterministik, r1 dijaga >= 0.06 (tanpa pembalikan); sisa nilai acak tetap acak untuk id.
    await page.addInitScript(() => { const o = Math.random.bind(Math); Math.random = () => 0.06 + o() * 0.94; });
    await start(page, "/simulation", { cfg: RUN });
    await page.getByLabel("Durasi (detik)").fill("1"); await page.getByRole("button", { name: "Mulai skenario" }).click(); await expect(page.getByRole("alert").first()).toContainText("Durasi harus 5–3600");
    await page.getByLabel("Durasi (detik)").fill("8"); await page.getByLabel("Nilai (ms)").fill("5"); await page.getByRole("button", { name: "Mulai skenario" }).click(); await expect(page.getByRole("alert").first()).toContainText("Nilai harus 10–2000");
    await page.getByLabel("Nilai (ms)").fill("300"); await page.getByRole("button", { name: "Mulai skenario" }).click();
    const row = page.getByTestId("scenario-row"); await expect(row).toHaveCount(1); await expect(row).toHaveAttribute("data-status", "running");
    await page.getByRole("button", { name: "Mulai skenario" }).click(); await expect(page.getByRole("alert").first()).toContainText("sudah aktif"); // duplikat ditolak
    await page.waitForTimeout(2500); // beri waktu agar alert pertama tercipta sebelum dijeda
    await row.getByRole("button", { name: "Jeda" }).click(); await expect(row).toHaveAttribute("data-status", "paused");
    const p1 = await row.locator("progress").evaluate((e: HTMLProgressElement) => e.value); await page.waitForTimeout(2500); expect(await row.locator("progress").evaluate((e: HTMLProgressElement) => e.value)).toBe(p1);
    await row.getByRole("button", { name: "Lanjutkan" }).click(); await expect(row).toHaveAttribute("data-status", "running");
    await expect(page.getByTestId("scenario-done")).toHaveCount(1, { timeout: 20000 }); await expect(page.getByTestId("scenario-done")).toContainText("Selesai"); await expect(row).toHaveCount(0);
    await page.goto("/alerts"); // Jeda menangguhkan efek skenario (alert pulih), lanjut membuat kejadian baru, selesai memulihkannya: tepat dua alert pulih.
    const past = page.locator('[data-testid=alert-past][data-source=SIMULATION]', { hasText: "Perangkat 01" }); await expect(past).toHaveCount(2); await expect(past.first()).toContainText("latency"); await expect(past.last()).toContainText("latency");
    await page.goto("/logs"); await page.getByPlaceholder("Cari log…").fill("[Skenario]"); await expect(page.locator("tbody tr").first()).toContainText("[Skenario]");
    for (const t of ["dimulai", "dijeda", "dilanjutkan", "selesai"]) await page.getByPlaceholder("Cari log…").fill(`[Skenario] `).then(() => expect(page.locator("tbody")).toContainText(t));
  });
  test("outage: perangkat offline & metrik detail '—'; Hentikan memulihkan state; alert latency tidak aktif saat offline", async ({ page }) => {
    await start(page, "/simulation", { cfg: RUN }); await page.getByLabel("Jenis gangguan").selectOption("outage"); await page.getByLabel("Durasi (detik)").fill("600"); await page.getByRole("button", { name: "Mulai skenario" }).click();
    await page.goto("/alerts"); const a = page.locator('[data-testid=alert-active][data-source=SIMULATION]', { hasText: "Perangkat 01" }); await expect(a).toContainText("tidak merespons");
    await page.goto("/devices"); await page.getByRole("row", { name: /Perangkat 01/ }).getByLabel("Detail").click(); await expect(page.getByTestId("device-sim-metrics")).toContainText("Latency: —"); await page.keyboard.press("Escape");
    await page.goto("/simulation"); await page.getByTestId("scenario-row").getByRole("button", { name: "Hentikan" }).click(); await expect(page.getByTestId("scenario-row")).toHaveCount(0); await expect(page.getByTestId("scenario-done")).toContainText("Dihentikan");
    await page.goto("/alerts"); await expect(a).toHaveCount(0);
    await page.goto("/devices"); await page.getByRole("row", { name: /Perangkat 01/ }).getByLabel("Detail").click(); await expect(page.getByTestId("device-sim-metrics")).not.toContainText("Latency: —");
  });
  test("pause global menghentikan waktu simulasi dan menolak skenario baru; resume melanjutkan", async ({ page }) => {
    await start(page, "/simulation", { cfg: RUN }); const clk = page.getByTestId("sim-clock");
    await page.getByRole("button", { name: "Jeda atau lanjutkan" }).click(); await expect(clk).toContainText("dijeda"); const t = await clk.innerText(); await page.waitForTimeout(2500); expect(await clk.innerText()).toBe(t);
    await page.getByLabel("Durasi (detik)").fill("30"); await page.getByRole("button", { name: "Mulai skenario" }).click(); await expect(page.getByRole("alert").first()).toContainText("dijeda"); await expect(page.getByTestId("scenario-row")).toHaveCount(0);
    await page.getByRole("button", { name: "Jeda atau lanjutkan" }).click(); await expect(clk).not.toContainText("dijeda"); await expect.poll(() => clk.innerText(), { timeout: 8000 }).not.toBe(t);
  });
  test("skenario persisten setelah reload; dan skenario tidak mengubah bagian LIVE", async ({ page }) => {
    await mockLive(page, () => snap()); await start(page, "/simulation", { cfg: RUN, raw: LIVE_ON }); await page.getByLabel("Jenis gangguan").selectOption("congestion"); await page.getByLabel("Durasi (detik)").fill("900");
    await page.getByRole("button", { name: "Mulai skenario" }).click(); await expect(page.getByTestId("scenario-row")).toHaveCount(1); await page.getByTestId("scenario-row").getByRole("button", { name: "Jeda" }).click();
    await page.reload(); await expect(page.getByTestId("scenario-row")).toHaveAttribute("data-status", "paused");
    await page.goto("/dashboard"); await expect(page.getByTestId("live-gw")).toContainText("3 ms · loss 0 %");
  });
  test("dasbor: KPI simulasi berlabel, panel sumber, dan laporan CSV memuat kolom Sumber", async ({ page }) => {
    await start(page, "/dashboard"); for (const t of ["Traffic Masuk (simulasi)", "Traffic Keluar (simulasi)", "Alert Aktif (simulasi)", "Perangkat Bermasalah (offline, simulasi)"]) await expect(page.getByText(t)).toBeVisible();
    const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Laporan CSV" }).click(); const csv = (await (await (await dl).createReadStream()).toArray()).map(String).join(""); expect(csv).toContain("Metrik,Nilai,Sumber"); expect(csv).toContain(",SIMULATION");
  });
  test("halaman baru: judul h1 dan navigasi sidebar", async ({ page }) => {
    await start(page, "/dashboard"); for (const [name, h] of [["Monitoring Nyata", "Monitoring Nyata"], ["Simulasi", "Simulasi Lanjutan"], ["Alert", "Alert"]] as const) { await page.getByRole("link", { name, exact: true }).click(); await expect(page.getByRole("heading", { level: 1, name: h })).toBeVisible(); }
  });
});
