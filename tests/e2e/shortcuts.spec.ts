import { expect, pauseBtn, start, test, unread } from "./helpers";

const search = (p: import("@playwright/test").Page) => p.getByRole("dialog", { name: "Pencarian global" });
const notif = (p: import("@playwright/test").Page) => p.getByRole("dialog", { name: "Notifikasi" });
const help = (p: import("@playwright/test").Page) => p.getByRole("dialog", { name: "Pintasan Keyboard" });

test.describe("pintasan keyboard", () => {
  test("/ dan Ctrl+K membuka pencarian; Esc menutup dan fokus kembali ke pemicu", async ({ page }) => {
    await start(page, "/dashboard");
    await page.keyboard.press("/");
    await expect(search(page)).toBeVisible();
    await expect(page.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(search(page)).toHaveCount(0);
    await page.keyboard.press("Control+k");
    await expect(search(page)).toBeVisible();
    await page.keyboard.press("Control+k"); // sudah terbuka: tidak membuka kedua kalinya
    await expect(search(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(search(page)).toHaveCount(0);

    const trigger = page.getByRole("button", { name: "Buka pencarian global" });
    await trigger.click();
    await expect(search(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  test("N, ? , Esc: satu tekanan satu efek, dan Esc hanya menutup panel aktif", async ({ page }) => {
    await start(page, "/dashboard", { cfg: { paused: false } });
    await page.keyboard.press("n");
    await expect(notif(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(notif(page)).toHaveCount(0);
    await page.keyboard.press("?");
    await expect(help(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("P menjeda tepat satu kali per tekanan; R menyegarkan", async ({ page }) => {
    await start(page, "/dashboard", { cfg: { paused: false } });
    await expect(pauseBtn(page)).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("p");
    await expect(pauseBtn(page)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("p");
    await expect(pauseBtn(page)).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("r");
    await expect(page.getByRole("status")).toHaveText("Data disegarkan");
  });

  test("G lalu D/P/B/T/L/S/A berpindah halaman", async ({ page }) => {
    await start(page, "/about");
    for (const [k, path] of [["d", "dashboard"], ["p", "devices"], ["b", "bandwidth"], ["t", "topology"], ["l", "logs"], ["s", "settings"], ["a", "about"]] as const) {
      await page.keyboard.press("g"); await page.keyboard.press(k);
      await expect(page).toHaveURL(new RegExp(`/${path}$`));
    }
  });

  test("tidak aktif saat mengetik di input", async ({ page }) => {
    await start(page, "/devices");
    const box = page.getByLabel("Cari perangkat");
    await box.click();
    await page.keyboard.type("nprg/?gd");
    await expect(box).toHaveValue("nprg/?gd");
    await expect(page).toHaveURL(/\/devices$/);
    await expect(pauseBtn(page)).toHaveAttribute("aria-pressed", "true"); // tetap dijeda sesuai seed
    for (const d of [search(page), notif(page), help(page)]) await expect(d).toHaveCount(0);
    await page.keyboard.press("Escape"); // Esc di input tanpa panel tidak menghapus isian
    await expect(box).toHaveValue("nprg/?gd");
  });

  test("tidak aktif saat memilih opsi di <select>", async ({ page }) => {
    await start(page, "/devices");
    await page.getByLabel("Filter status").focus();
    await page.keyboard.press("n"); await page.keyboard.press("p"); await page.keyboard.press("r");
    await expect(pauseBtn(page)).toHaveAttribute("aria-pressed", "true");
    for (const d of [search(page), notif(page), help(page)]) await expect(d).toHaveCount(0);
  });

  test("tidak mengganggu dialog formulir yang terbuka", async ({ page }) => {
    await start(page, "/devices");
    await page.getByRole("button", { name: "Tambah Perangkat" }).click();
    const dlg = page.getByRole("dialog", { name: "Tambah perangkat" });
    await expect(dlg).toBeVisible();
    for (const k of ["n", "p", "r", "?", "/", "Control+k"]) await page.keyboard.press(k);
    await expect(pauseBtn(page)).toHaveAttribute("aria-pressed", "true");
    for (const d of [search(page), notif(page), help(page)]) await expect(d).toHaveCount(0);
    await expect(dlg).toBeVisible();
    await page.keyboard.press("Escape"); // Esc menutup dialog native
    await expect(dlg).toHaveCount(0);
    await page.keyboard.press("n"); // pintasan aktif lagi
    await expect(notif(page)).toBeVisible();
  });

  test("saat satu panel terbuka, panel lain tidak ikut terbuka", async ({ page }) => {
    await start(page, "/dashboard");
    await page.keyboard.press("n");
    await expect(notif(page)).toBeVisible();
    for (const k of ["Control+k", "/", "?", "p"]) await page.keyboard.press(k);
    await expect(search(page)).toHaveCount(0);
    await expect(help(page)).toHaveCount(0);
    await expect(notif(page)).toBeVisible();
    await expect(pauseBtn(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("navigasi keyboard di hasil pencarian: panah, Home/End, Enter", async ({ page }) => {
    await start(page, "/dashboard");
    await page.keyboard.press("/");
    const input = page.getByRole("combobox");
    await input.fill("Perangkat 0");
    const opts = page.getByRole("option");
    await expect(opts).toHaveCount(6); // dibatasi 6 perangkat
    await expect(opts.nth(0)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    await expect(opts.nth(2)).toHaveAttribute("aria-selected", "true");
    await expect(input).toHaveAttribute("aria-activedescendant", "gs-opt-2");
    await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp");
    await expect(opts.nth(0)).toHaveAttribute("aria-selected", "true"); // tidak lewat batas atas
    await page.keyboard.press("End");
    await expect(opts.nth(5)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/devices$/);
    await expect(page.getByRole("dialog", { name: "Detail perangkat" })).toContainText("Perangkat 03");
  });

  test("Enter pada halaman hasil membuka halaman; tanpa hasil menampilkan pesan", async ({ page }) => {
    await start(page, "/dashboard");
    await page.keyboard.press("/");
    await page.getByRole("combobox").fill("log akt");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/logs$/);
    await page.keyboard.press("/");
    await page.getByRole("combobox", { name: /Cari perangkat, log/ }).fill("zzzzzz");
    await expect(search(page)).toContainText("Tidak ada hasil untuk");
  });

  test("klik di luar menutup pencarian; klik di dalam tidak", async ({ page }) => {
    await start(page, "/dashboard");
    await page.keyboard.press("/");
    await page.getByRole("combobox").click();
    await search(page).click({ position: { x: 5, y: 5 } });
    await expect(search(page)).toBeVisible();
    await page.mouse.click(5, 400);
    await expect(search(page)).toHaveCount(0);
  });

  test("klik di luar menutup notifikasi; klik di dalam tidak", async ({ page }) => {
    await start(page, "/dashboard", { notices: [{ id: "n1", t: 1, key: "a", title: "A", body: "b", read: false }] });
    await page.keyboard.press("n");
    await notif(page).getByRole("heading", { name: "Notifikasi" }).click();
    await expect(notif(page)).toBeVisible();
    await notif(page).getByRole("button", { name: /Belum dibaca/ }).click(); // klik item tidak menutup
    await expect(notif(page)).toBeVisible();
    await page.mouse.click(5, 400);
    await expect(notif(page)).toHaveCount(0);
  });

  test("Tab dikunci di dalam panel notifikasi", async ({ page }) => {
    await start(page, "/dashboard", { notices: [{ id: "n1", t: 1, key: "a", title: "A", body: "b", read: false }] });
    await page.keyboard.press("n");
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
  });

  test("tombol ikon memiliki nama aksesibel", async ({ page }) => {
    await start(page, "/dashboard");
    const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll("button, a[href]")).filter((el) => {
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim() || el.getAttribute("title");
      return !name;
    }).length);
    expect(unnamed).toBe(0);
  });

  test("badge notifikasi tidak berubah oleh pintasan", async ({ page }) => {
    await start(page, "/dashboard");
    await page.keyboard.press("n"); await page.keyboard.press("Escape");
    await expect(unread(page)).toHaveText("0");
  });
});
