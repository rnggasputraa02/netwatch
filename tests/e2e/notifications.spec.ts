import type { Page } from "@playwright/test";
import { expect, notices, start, stored, test, unread } from "./helpers";

const bell = (p: Page) => p.getByRole("button", { name: /^Notifikasi/ });
const panel = (p: Page) => p.getByRole("dialog", { name: "Notifikasi" });

test.describe("pusat notifikasi", () => {
  test("badge menghitung notifikasi belum dibaca; klik item menandai dibaca", async ({ page }) => {
    await start(page, "/dashboard", { notices: notices() });
    await expect(unread(page)).toHaveText("2");
    await bell(page).click();
    await expect(panel(page).getByRole("button", { name: /Notif A/ })).toHaveAttribute("data-read", "false");
    await panel(page).getByRole("button", { name: /Notif A/ }).click();
    await expect(panel(page).getByRole("button", { name: /Notif A/ })).toHaveAttribute("data-read", "true");
    await expect(unread(page)).toHaveText("1");
  });
  test("tandai semua dibaca dan persisten setelah reload", async ({ page }) => {
    await start(page, "/dashboard", { notices: notices() });
    await bell(page).click();
    await panel(page).getByRole("button", { name: "Tandai semua dibaca" }).click();
    await expect(unread(page)).toHaveText("0");
    expect((await stored<{ read: boolean }[]>(page, "nw2_not")).every((n) => n.read)).toBe(true);
    await page.reload();
    await expect(unread(page)).toHaveText("0");
    await bell(page).click();
    await expect(panel(page).getByRole("button", { name: /Belum dibaca/ })).toHaveCount(0);
  });
  test("hapus semua notifikasi menampilkan keadaan kosong dan tersimpan", async ({ page }) => {
    await start(page, "/dashboard", { notices: notices() });
    await bell(page).click();
    await panel(page).getByRole("button", { name: "Hapus semua notifikasi" }).click();
    await expect(panel(page)).toContainText("Belum ada notifikasi.");
    await page.reload();
    expect(await stored<unknown[]>(page, "nw2_not")).toEqual([]);
  });
  test("menyimpan perangkat dua kali berturut-turut tidak menggandakan notifikasi (anti-duplikat 30 dtk)", async ({ page }) => {
    await start(page, "/devices", { notices: [] });
    for (let i = 0; i < 2; i++) {
      await page.getByRole("row", { name: /Perangkat 01/ }).getByRole("button", { name: "Edit" }).click();
      await page.getByRole("dialog", { name: "Edit perangkat" }).getByRole("button", { name: "Simpan" }).click();
      await expect(page.getByRole("dialog", { name: "Edit perangkat" })).toHaveCount(0);
    }
    await expect(unread(page)).toHaveText("1");
    expect(await stored<unknown[]>(page, "nw2_not")).toHaveLength(1);
  });
  test("menghapus perangkat membuat notifikasi baru yang berbeda", async ({ page }) => {
    await start(page, "/devices", { notices: [] });
    await page.getByRole("row", { name: /Perangkat 01/ }).getByRole("button", { name: "Hapus" }).click();
    await page.getByRole("dialog", { name: "Hapus perangkat" }).getByRole("button", { name: "Hapus" }).click();
    await expect(unread(page)).toHaveText("1");
  });
});
