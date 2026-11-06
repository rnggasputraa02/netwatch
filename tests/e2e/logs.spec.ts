import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, start, stored, test } from "./helpers";

const summary = (p: Page) => p.getByText(/^Menampilkan /);
async function exportCsv(p: Page) {
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Ekspor CSV" }).click()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), text: readFileSync(path, "utf8") };
}

test.describe("log aktivitas", () => {
  test("pagination, filter jenis/prioritas, pencarian, dan tanggal", async ({ page }) => {
    await start(page, "/logs");
    await expect(summary(page)).toHaveText("Menampilkan 1–10 dari 25 data");
    await page.getByLabel("Jenis", { exact: true }).selectOption("Jaringan");
    await expect(summary(page)).toHaveText("Menampilkan 1–8 dari 8 data");
    await page.getByLabel("Cari log").fill("Peristiwa 03");
    await expect(summary(page)).toHaveText("Menampilkan 1–1 dari 1 data");
    await page.getByLabel("Cari log").fill("");
    await page.getByLabel("Jenis", { exact: true }).selectOption("all");
    await page.getByLabel("Prioritas").selectOption("Tinggi");
    await expect(summary(page)).toHaveText("Menampilkan 1–8 dari 8 data");
    await page.getByLabel("Prioritas").selectOption("all");
    await page.getByLabel("Tanggal").fill("2023-11-15"); // semua log seed jatuh pada tanggal ini (WIB)
    await expect(summary(page)).toHaveText("Menampilkan 1–10 dari 25 data");
    await page.getByLabel("Tanggal").fill("2023-11-16");
    await expect(page.getByText("Belum ada log aktivitas.")).toBeVisible();
  });
  test("ekspor CSV memuat semua baris terfilter, BOM UTF-8, dan escape tanda kutip", async ({ page }) => {
    await start(page, "/logs");
    const all = await exportCsv(page);
    expect(all.name).toBe("log-netwatch.csv");
    expect(all.text.charCodeAt(0)).toBe(0xfeff);
    const lines = all.text.slice(1).split("\r\n");
    expect(lines[0]).toBe("Waktu,Jenis,Perangkat,Deskripsi,Prioritas,Sumber"); // v3: kolom Sumber (log lama tanpa label dianggap SIMULATION)
    expect(lines.slice(1).every((l) => l.endsWith(',"SIMULATION"'))).toBe(true);
    expect(lines).toHaveLength(26); // header + 25 baris (bukan hanya halaman aktif)
    expect(all.text).toContain('"Kutip ""ganda"", koma"');
    await page.getByLabel("Jenis", { exact: true }).selectOption("Jaringan");
    const filtered = await exportCsv(page);
    expect(filtered.text.slice(1).split("\r\n")).toHaveLength(9);
  });
  test("hapus satu log dan bersihkan semua dengan konfirmasi", async ({ page }) => {
    await start(page, "/logs");
    await page.getByRole("button", { name: "Hapus log" }).first().click();
    const dlg = page.getByRole("dialog", { name: "Konfirmasi hapus log" });
    await dlg.getByRole("button", { name: "Batal" }).click();
    await expect(summary(page)).toHaveText("Menampilkan 1–10 dari 25 data");
    await page.getByRole("button", { name: "Hapus log" }).first().click();
    await dlg.getByRole("button", { name: "Ya" }).click();
    await expect(summary(page)).toHaveText("Menampilkan 1–10 dari 24 data");
    await page.getByRole("button", { name: "Bersihkan Semua" }).click();
    await dlg.getByRole("button", { name: "Ya" }).click();
    await expect(page.getByText("Belum ada log aktivitas.")).toBeVisible();
    expect(await stored(page, "nw2_log")).toEqual([]);
  });
  test("pencarian global ke log membuka halaman log dengan filter terisi", async ({ page }) => {
    await start(page, "/dashboard");
    await page.keyboard.press("/");
    await page.getByRole("combobox").fill("Peristiwa 07");
    await page.getByRole("option", { name: /Log: Peristiwa 07/ }).click();
    await expect(page).toHaveURL(/\/logs$/);
    await expect(page.getByLabel("Cari log")).toHaveValue("Peristiwa 07");
    await expect(summary(page)).toHaveText("Menampilkan 1–1 dari 1 data");
  });
});
