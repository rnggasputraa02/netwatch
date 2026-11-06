import type { Page } from "@playwright/test";
import { expect, history, pauseBtn, start, stored, test } from "./helpers";

const count = async (p: Page) => Number(((await p.getByText(/^\d+ titik$/).textContent()) ?? "").replace(/\D/g, ""));
const histLen = async (p: Page) => (await stored<unknown[]>(p, "nw2_hist")).length;
const histRange = (p: Page) => p.getByRole("heading", { name: "Historical Traffic" }).locator("xpath=..");

test.describe("bandwidth dan Historical Traffic", () => {
  test("menampilkan grafik live, ringkasan, dan Historical Traffic dari data tersimpan", async ({ page }) => {
    await start(page, "/bandwidth", { history: history(120) });
    await expect(page.getByText("Download (rata-rata / tertinggi / terendah)")).toBeVisible();
    await expect(page.getByText("Upload (rata-rata / tertinggi / terendah)")).toBeVisible();
    await expect(page.getByText("120 titik")).toBeVisible();
    await expect(page.getByTestId("sum-down")).toContainText("Rata-rata");
    await expect(page.getByTestId("sum-up")).toContainText("Maks");
  });
  test("rentang 1 menit menyaring titik historis", async ({ page }) => {
    await start(page, "/bandwidth", { history: history(120) });
    await histRange(page).getByRole("button", { name: "1 menit" }).click();
    await expect.poll(() => count(page)).toBeLessThanOrEqual(61);
    expect(await count(page)).toBeGreaterThan(30);
  });
  test("tanpa data historis menampilkan pesan kosong", async ({ page }) => {
    await start(page, "/bandwidth", { history: [] });
    await expect(page.getByText(/Belum ada data historis/)).toBeVisible();
    await expect(page.getByText("0 titik")).toBeVisible();
  });
  test("Hapus Riwayat Trafik mengosongkan penyimpanan", async ({ page }) => {
    await start(page, "/settings", { history: history(50) });
    await page.getByRole("button", { name: "Hapus Riwayat Trafik" }).click();
    await expect(page.getByRole("status")).toHaveText("Riwayat trafik dihapus");
    expect(await stored(page, "nw2_hist")).toEqual([]);
  });
  test("riwayat bertambah saat berjalan dan bertahan setelah reload", async ({ page }) => {
    await start(page, "/bandwidth", { history: history(120), cfg: { paused: false, interval: 1 } });
    await expect.poll(() => histLen(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(123);
    await pauseBtn(page).click();
    await page.waitForTimeout(400); // beri waktu agar efek penyimpanan terakhir selesai
    const saved = await histLen(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Historical Traffic" })).toBeVisible();
    expect(await histLen(page)).toBe(saved);
    expect(await count(page)).toBe(saved);
  });
  test("pause menghentikan penambahan titik dan aktivitas simulasi; resume melanjutkan", async ({ page }) => {
    await start(page, "/bandwidth", { history: history(120), cfg: { paused: false, interval: 1 } });
    await expect.poll(() => histLen(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(122);
    await pauseBtn(page).click();
    await expect(pauseBtn(page)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(400);
    const n1 = await histLen(page);
    const dev1 = JSON.stringify(await stored(page, "nw2_dev"));
    const log1 = JSON.stringify(await stored(page, "nw2_log"));
    await page.waitForTimeout(3500);
    expect(await histLen(page)).toBe(n1);
    expect(JSON.stringify(await stored(page, "nw2_dev"))).toBe(dev1);
    expect(JSON.stringify(await stored(page, "nw2_log"))).toBe(log1);
    await pauseBtn(page).click();
    await expect.poll(() => histLen(page), { timeout: 10_000 }).toBeGreaterThan(n1);
  });
  test("riwayat dibatasi 1800 titik", async ({ page }) => {
    const pts = Array.from({ length: 1800 }, (_, i) => ({ t: Date.now() - (1800 - i) * 1000, down: 30, up: 10 }));
    await start(page, "/dashboard", { history: pts, cfg: { paused: false, interval: 1 } });
    await expect.poll(async () => (await stored<{ t: number }[]>(page, "nw2_hist")).at(-1)?.t ?? 0, { timeout: 15_000 }).toBeGreaterThan(pts[1799].t);
    expect(await histLen(page)).toBe(1800);
  });
  test("interval tidak berlipat setelah pindah halaman dan pause/resume berulang", async ({ page }) => {
    await start(page, "/dashboard", { cfg: { paused: false, interval: 1 } });
    for (const name of ["Perangkat", "Bandwidth", "Dasbor", "Perangkat", "Dasbor"]) await page.getByRole("link", { name, exact: true }).click();
    for (let i = 0; i < 3; i++) { await page.keyboard.press("p"); await page.keyboard.press("p"); }
    await expect(pauseBtn(page)).toHaveAttribute("aria-pressed", "false");
    const before = await histLen(page);
    await page.waitForTimeout(4000);
    const grown = (await histLen(page)) - before;
    expect(grown).toBeGreaterThanOrEqual(2);
    expect(grown).toBeLessThanOrEqual(6); // ~4 titik pada interval 1 detik; interval ganda akan menghasilkan ~8+
  });
});
