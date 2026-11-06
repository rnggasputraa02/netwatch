import { expect, open, seed, test } from "./helpers";

const ROUTES: [string, RegExp][] = [
  ["/dashboard", /Total Perangkat/], ["/devices", /Tambah Perangkat/], ["/bandwidth", /Historical Traffic/], ["/topology", /Visualisasi simulasi/],
  ["/logs", /Ekspor CSV/], ["/settings", /Interval pembaruan/], ["/about", /Tentang NetWatch/],
];

test.describe("route utama", () => {
  test.beforeEach(({ page }) => seed(page));
  for (const [path, marker] of ROUTES) {
    test(`${path} berstatus 200 dan menampilkan konten`, async ({ page }) => {
      const res = await open(page, path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("main")).toContainText(marker);
    });
  }
  test("/ mengarah ke /dashboard", async ({ page }) => {
    await open(page, "/");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
  test("halaman 404: status HTTP 404, pesan, dan tautan kembali", async ({ page, monitor }) => {
    monitor.expect404("/tidak-ada-halaman-ini");
    const res = await page.goto("/tidak-ada-halaman-ini");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await page.getByRole("link", { name: "Kembali ke Dasbor" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
  test("navigasi sidebar ke semua halaman tanpa galat", async ({ page }) => {
    await open(page, "/dashboard");
    for (const label of ["Perangkat", "Bandwidth", "Topologi", "Log Aktivitas", "Pengaturan", "Tentang", "Dasbor"]) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveClass(/text-neon/);
    }
  });
});
