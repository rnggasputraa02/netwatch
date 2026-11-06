import type { Page } from "@playwright/test";
import { devices, expect, history, start, stored, test } from "./helpers";

const field = (p: Page, label: RegExp) => p.locator("label", { hasText: label }).locator("select");
const html = (p: Page) => p.locator("html");
const histLen = async (p: Page) => (await stored<unknown[]>(p, "nw2_hist")).length;

test.describe("pengaturan: animasi dan mode hemat", () => {
  test("Off, Subtle, dan Full mengubah data-anim dan tersimpan setelah reload", async ({ page }) => {
    await start(page, "/settings", { cfg: { animLevel: "subtle" } });
    for (const v of ["off", "full", "subtle"]) {
      await field(page, /^Animasi/).selectOption(v);
      await expect(html(page)).toHaveAttribute("data-anim", v);
    }
    await field(page, /^Animasi/).selectOption("full");
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-anim", "full");
    await expect(field(page, /^Animasi/)).toHaveValue("full");
  });
  test("mode hemat mematikan animasi walau Full dipilih", async ({ page }) => {
    await start(page, "/settings", { cfg: { animLevel: "full", perf: "normal" } });
    await expect(html(page)).toHaveAttribute("data-anim", "full");
    await field(page, /^Performa/).selectOption("saver");
    await expect(html(page)).toHaveAttribute("data-anim", "off");
    await expect(html(page)).toHaveAttribute("data-perf", "saver");
    await field(page, /^Performa/).selectOption("normal");
    await expect(html(page)).toHaveAttribute("data-anim", "full");
  });
  test("prefers-reduced-motion mematikan animasi", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await start(page, "/settings", { cfg: { animLevel: "full" } });
    await expect(html(page)).toHaveAttribute("data-anim", "off");
    const dur = await page.evaluate(() => getComputedStyle(document.querySelector("main")!.firstElementChild!).animationName);
    expect(dur).toBe("none");
  });
  test("mode hemat memperlambat pembaruan (interval efektif 2x)", async ({ page }) => {
    await start(page, "/dashboard", { history: [], cfg: { paused: false, interval: 1, perf: "saver" } });
    await expect.poll(() => histLen(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const a = await histLen(page);
    await page.waitForTimeout(6000);
    const grown = (await histLen(page)) - a;
    expect(grown).toBeGreaterThanOrEqual(2);
    expect(grown).toBeLessThanOrEqual(4); // ~3 titik; tanpa mode hemat ~6
  });
  test("interval pembaruan tersimpan", async ({ page }) => {
    await start(page, "/settings");
    await field(page, /^Interval/).selectOption("5");
    await expect(page.getByRole("status")).toHaveText("Interval diperbarui");
    expect((await stored<{ interval: number }>(page, "nw2_cfg")).interval).toBe(5);
  });
  test("jumlah perangkat simulasi dapat diubah", async ({ page }) => {
    await start(page, "/settings");
    await page.locator('input[type="range"]').fill("15");
    await expect(page.getByText("Jumlah perangkat simulasi: 15")).toBeVisible();
    expect(await stored<unknown[]>(page, "nw2_dev")).toHaveLength(15);
  });
});

test.describe("LocalStorage rusak", () => {
  test("semua kunci berisi JSON rusak: aplikasi memakai data awal tanpa galat", async ({ page }) => {
    const bad = "{bukan json";
    await start(page, "/dashboard", { raw: { nw2_dev: bad, nw2_log: bad, nw2_not: bad, nw2_cfg: bad, nw2_hist: bad } });
    await expect(page.locator(".card", { hasText: "Total Perangkat" })).toContainText("8");
    await page.getByRole("link", { name: "Perangkat", exact: true }).click();
    await expect(page.getByText(/^Menampilkan /)).toHaveText("Menampilkan 1–8 dari 8 data");
  });
  test("tipe data salah (bukan array / bukan objek) memakai nilai awal", async ({ page }) => {
    await start(page, "/dashboard", { raw: { nw2_dev: '{"a":1}', nw2_log: '"x"', nw2_not: "42", nw2_cfg: "[]", nw2_hist: "null" } });
    await expect(page.locator(".card", { hasText: "Total Perangkat" })).toContainText("8");
  });
  test("satu entri perangkat rusak tidak membuang perangkat valid lainnya", async ({ page }) => {
    await start(page, "/devices", { raw: { nw2_dev: JSON.stringify([...devices(3), { id: "x" }, 5, null, { ...devices(1)[0], id: "d1" }]) } });
    await expect(page.getByText(/^Menampilkan /)).toHaveText("Menampilkan 1–3 dari 3 data"); // id ganda "d1" juga dibuang
  });
  test("satu titik riwayat rusak tidak membuang titik valid", async ({ page }) => {
    const now = Date.now();
    const pts = Array.from({ length: 30 }, (_, i) => ({ t: now - (i + 1) * 1000, down: 20, up: 5 }));
    await start(page, "/bandwidth", { raw: { nw2_hist: JSON.stringify([...pts, { t: "x" }, null, { t: now, down: "a", up: 1 }]) } });
    await expect(page.getByText("30 titik")).toBeVisible();
  });
  test("interval tidak valid (0) diganti nilai bawaan, bidang lain tetap dipakai, dan timer tidak berputar liar", async ({ page }) => {
    await start(page, "/settings", { raw: { nw2_cfg: JSON.stringify({ interval: 0, paused: false, collapsed: false, animLevel: "full", perf: "normal" }) } });
    await expect(field(page, /^Interval/)).toHaveValue("2");
    await expect(field(page, /^Animasi/)).toHaveValue("full");
    await page.waitForTimeout(3000);
    expect(await histLen(page)).toBeLessThan(10);
  });
});

test.describe("reset data", () => {
  test("Batal tidak mengubah apa pun; Reset mengembalikan data awal", async ({ page }) => {
    await start(page, "/settings", { history: history(40), cfg: { animLevel: "full", interval: 5 } });
    await page.getByRole("button", { name: "Reset Semua Data" }).click();
    const dlg = page.getByRole("dialog", { name: "Konfirmasi reset data" });
    await dlg.getByRole("button", { name: "Batal" }).click();
    expect(await stored<unknown[]>(page, "nw2_dev")).toHaveLength(12);
    await page.getByRole("button", { name: "Reset Semua Data" }).click();
    await dlg.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByRole("status")).toHaveText("Semua data direset");
    await expect(page.getByText("Jumlah perangkat simulasi: 8")).toBeVisible();
    await expect(field(page, /^Animasi/)).toHaveValue("subtle");
    await expect(field(page, /^Interval/)).toHaveValue("2");
    // Setelah reset simulasi aktif lagi (pengaturan awal), jadi satu titik/log baru boleh muncul; data lama harus hilang.
    expect((await stored<unknown[]>(page, "nw2_log")).length).toBeLessThanOrEqual(1);
    expect(await histLen(page)).toBeLessThanOrEqual(1);
  });
});
