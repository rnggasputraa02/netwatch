import type { Page } from "@playwright/test";
import { expect, start, test } from "./helpers";

test.use({ viewport: { width: 375, height: 812 } });

const ROUTES = ["/dashboard", "/devices", "/bandwidth", "/topology", "/logs", "/settings", "/about"];
const overflow = (p: Page) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth, body: document.body.scrollWidth - window.innerWidth }));
const asideX = (p: Page) => p.locator("aside").evaluate((el) => el.getBoundingClientRect().right);

test.describe("tampilan mobile 375 px", () => {
  for (const path of ROUTES) {
    test(`${path}: tanpa scroll horizontal pada halaman`, async ({ page }) => {
      await start(page, path, { history: Array.from({ length: 60 }, (_, i) => ({ t: Date.now() - (60 - i) * 1000, down: 30, up: 10 })) });
      await page.waitForTimeout(500); // beri waktu grafik menyesuaikan lebar
      const o = await overflow(page);
      expect(o.doc, "documentElement.scrollWidth - innerWidth").toBeLessThanOrEqual(0);
      expect(o.body, "body.scrollWidth - innerWidth").toBeLessThanOrEqual(0);
    });
  }
  test("panel pencarian dan notifikasi muat di layar 375 px", async ({ page }) => {
    await start(page, "/dashboard");
    await page.getByRole("button", { name: "Buka pencarian global" }).click();
    const box = await page.getByRole("dialog", { name: "Pencarian global" }).boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 375).toBe(true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Notifikasi/ }).click();
    const nb = await page.getByRole("dialog", { name: "Notifikasi" }).boundingBox();
    expect(nb && nb.x >= 0 && nb.x + nb.width <= 375).toBe(true);
  });
  test("drawer: buka lewat tombol menu, tutup lewat tombol, Esc, dan klik latar", async ({ page }) => {
    await start(page, "/dashboard");
    await expect.poll(() => asideX(page)).toBeLessThanOrEqual(0); // tertutup di luar layar
    await page.getByRole("button", { name: "Buka menu" }).click();
    await expect.poll(() => asideX(page)).toBeGreaterThan(100);
    await page.getByRole("button", { name: "Tutup menu" }).click();
    await expect.poll(() => asideX(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Buka menu" }).click();
    await expect.poll(() => asideX(page)).toBeGreaterThan(100);
    await page.keyboard.press("Escape");
    await expect.poll(() => asideX(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Buka menu" }).click();
    await page.mouse.click(360, 400); // latar gelap di kanan drawer
    await expect.poll(() => asideX(page)).toBeLessThanOrEqual(0);
  });
  test("memilih menu di drawer berpindah halaman dan menutup drawer", async ({ page }) => {
    await start(page, "/dashboard");
    await page.getByRole("button", { name: "Buka menu" }).click();
    await page.getByRole("link", { name: "Perangkat", exact: true }).click();
    await expect(page).toHaveURL(/\/devices$/);
    await expect.poll(() => asideX(page)).toBeLessThanOrEqual(0);
  });
});
