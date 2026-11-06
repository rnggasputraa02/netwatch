import { readFileSync } from "node:fs";
import { expect, start, test } from "./helpers";

test.describe("integritas fitur v2.1", () => {
  test("dashboard: statistik, status simulasi, dan laporan CSV", async ({ page }) => {
    await start(page, "/dashboard");
    await expect(page.locator(".card", { hasText: "Total Perangkat" })).toContainText("12");
    await expect(page.locator(".card", { hasText: "Online / Offline" })).toContainText("8 / 4");
    await expect(page.getByText("Simulasi dijeda")).toBeVisible();
    await expect(page.getByText(/SIMULASI, bukan hasil pengukuran/)).toBeVisible();
    await page.getByRole("button", { name: "1 jam" }).first().click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Laporan CSV" }).click()]);
    expect(dl.suggestedFilename()).toBe("laporan-netwatch.csv");
    expect(readFileSync(await dl.path(), "utf8")).toContain("Total perangkat,12");
  });
  test("topologi: klik node dan keyboard membuka detail; Esc menutup", async ({ page }) => {
    await start(page, "/topology");
    await page.getByRole("button", { name: /Detail Perangkat 02/ }).click();
    const dlg = page.getByRole("dialog", { name: "Detail node" });
    await expect(dlg).toContainText("Perangkat 02");
    await expect(dlg).toContainText("192.168.1.11");
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    await page.getByRole("button", { name: /Detail Perangkat 03, offline/ }).focus();
    await page.keyboard.press("Enter");
    await expect(dlg).toContainText("Offline");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "＋" }).click();
    await page.getByRole("button", { name: "Reset" }).click();
  });
  test("pencarian global menemukan perangkat, log, dan halaman", async ({ page }) => {
    await start(page, "/dashboard");
    await page.keyboard.press("Control+k");
    const input = page.getByRole("combobox");
    await input.fill("Pengaturan");
    await expect(page.getByRole("option", { name: /Halaman: Pengaturan/ })).toBeVisible();
    await input.fill("192.168.1.15");
    await expect(page.getByRole("option", { name: /Perangkat: Perangkat 06/ })).toBeVisible();
    await input.fill("Peristiwa 12");
    await expect(page.getByRole("option", { name: /Log: Peristiwa 12/ })).toBeVisible();
    await page.getByRole("option", { name: /Log: Peristiwa 12/ }).click();
    await expect(page).toHaveURL(/\/logs$/);
  });
  test("sidebar dapat diciutkan dan statusnya tersimpan", async ({ page }) => {
    await start(page, "/dashboard");
    await page.getByRole("button", { name: "Ciutkan" }).click();
    await page.reload();
    await expect(page.locator("aside")).toHaveClass(/md:w-16/);
  });
  test("tentang: versi sama dengan package.json dan batasan simulasi", async ({ page }) => {
    await start(page, "/about");
    await expect(page.getByRole("main")).toContainText(`Versi ${(JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version}`);
    await expect(page.getByRole("main")).toContainText("simulasi");
  });
});
