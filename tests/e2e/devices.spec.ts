import type { Page } from "@playwright/test";
import { devices, expect, start, stored, test, type Dev } from "./helpers";

const row = (p: Page, name: string) => p.getByRole("row", { name: new RegExp(name) });
const form = (p: Page) => p.getByRole("dialog", { name: /(Tambah|Edit) perangkat/ });
const summary = (p: Page) => p.getByText(/^Menampilkan /);
async function fillForm(p: Page, v: Partial<Record<"Nama" | "IP" | "MAC" | "Sistem operasi", string>> & { Jenis?: string; Status?: string }) {
  const d = form(p);
  for (const k of ["Nama", "IP", "MAC", "Sistem operasi"] as const) if (v[k] !== undefined) await d.getByLabel(k, { exact: true }).fill(v[k] as string);
  if (v.Jenis) await d.getByLabel("Jenis").selectOption(v.Jenis);
  if (v.Status) await d.getByLabel("Status").selectOption(v.Status);
}

test.describe("perangkat: CRUD dan validasi", () => {
  test("tambah perangkat valid tampil di tabel, tersimpan, dan tercatat di log", async ({ page }) => {
    await start(page, "/devices");
    await page.getByRole("button", { name: "Tambah Perangkat" }).click();
    await fillForm(page, { Nama: "Router Baru", IP: "192.168.1.200", MAC: "02:00:5e:10:00:aa", "Sistem operasi": "OpenWrt", Jenis: "Router", Status: "0" });
    await form(page).getByRole("button", { name: "Simpan" }).click();
    await expect(form(page)).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Perangkat berhasil disimpan");
    await page.getByLabel("Cari perangkat").fill("Router Baru");
    await expect(row(page, "Router Baru")).toContainText("Offline");
    await expect(row(page, "Router Baru")).toContainText("02:00:5E:10:00:AA"); // MAC dinormalkan ke huruf besar
    const list = await stored<Dev[]>(page, "nw2_dev");
    expect(list).toHaveLength(13);
    const logs = await stored<{ desc: string; name: string }[]>(page, "nw2_log");
    expect(logs.some((l) => l.name === "Router Baru" && l.desc === "Perangkat disimpan")).toBe(true);
  });

  const INVALID: [string, Record<string, string>, string][] = [
    ["nama terlalu pendek", { Nama: "A", IP: "192.168.1.201" }, "Nama harus 2–40 karakter."],
    ["nama hanya spasi", { Nama: "    ", IP: "192.168.1.201" }, "Nama harus 2–40 karakter."],
    ["nama terlalu panjang", { Nama: "x".repeat(41), IP: "192.168.1.201" }, "Nama harus 2–40 karakter."],
    ["IP di luar rentang", { Nama: "Valid", IP: "999.1.1.1" }, "Format IP tidak valid."],
    ["IP tidak lengkap", { Nama: "Valid", IP: "1.2.3" }, "Format IP tidak valid."],
    ["IP berisi huruf", { Nama: "Valid", IP: "a.b.c.d" }, "Format IP tidak valid."],
    ["MAC salah format", { Nama: "Valid", IP: "192.168.1.201", MAC: "ZZ:00" }, "Format MAC harus AA:BB:CC:DD:EE:FF."],
  ];
  for (const [title, vals, msg] of INVALID) {
    test(`validasi: ${title}`, async ({ page }) => {
      await start(page, "/devices");
      await page.getByRole("button", { name: "Tambah Perangkat" }).click();
      await fillForm(page, vals);
      await form(page).getByRole("button", { name: "Simpan" }).click();
      await expect(form(page).getByRole("alert")).toHaveText(msg);
      await expect(form(page)).toBeVisible();
      expect(await stored<Dev[]>(page, "nw2_dev")).toHaveLength(12);
    });
  }

  test("IP duplikat ditolak saat tambah dan saat edit; IP milik sendiri boleh dipertahankan", async ({ page }) => {
    await start(page, "/devices");
    await page.getByRole("button", { name: "Tambah Perangkat" }).click();
    await fillForm(page, { Nama: "Kembar", IP: devices()[0].ip });
    await form(page).getByRole("button", { name: "Simpan" }).click();
    await expect(form(page).getByRole("alert")).toHaveText("IP address sudah dipakai perangkat lain.");
    await form(page).getByRole("button", { name: "Batal" }).click();

    await row(page, "Perangkat 02").getByRole("button", { name: "Edit" }).click();
    await fillForm(page, { IP: devices()[0].ip });
    await form(page).getByRole("button", { name: "Simpan" }).click();
    await expect(form(page).getByRole("alert")).toHaveText("IP address sudah dipakai perangkat lain.");
    await fillForm(page, { IP: devices()[1].ip, Nama: "Perangkat 02 Baru" }); // IP sendiri
    await form(page).getByRole("button", { name: "Simpan" }).click();
    await expect(form(page)).toHaveCount(0);
    const list = await stored<Dev[]>(page, "nw2_dev");
    expect(list).toHaveLength(12);
    expect(list.find((d) => d.id === "d2")?.name).toBe("Perangkat 02 Baru");
    expect(new Set(list.map((d) => d.ip)).size).toBe(12);
  });

  test("edit menyimpan perubahan dan mempertahankan id", async ({ page }) => {
    await start(page, "/devices");
    await row(page, "Perangkat 01").getByRole("button", { name: "Edit" }).click();
    await fillForm(page, { Nama: "Laptop Edit", Status: "0" });
    await form(page).getByRole("button", { name: "Simpan" }).click();
    await page.getByLabel("Cari perangkat").fill("Laptop Edit");
    await expect(row(page, "Laptop Edit")).toContainText("Offline");
    expect((await stored<Dev[]>(page, "nw2_dev")).find((d) => d.id === "d1")?.name).toBe("Laptop Edit");
  });

  test("hapus meminta konfirmasi; Batal tidak menghapus", async ({ page }) => {
    await start(page, "/devices");
    await row(page, "Perangkat 01").getByRole("button", { name: "Hapus" }).click();
    const dlg = page.getByRole("dialog", { name: "Hapus perangkat" });
    await dlg.getByRole("button", { name: "Batal" }).click();
    await expect(summary(page)).toHaveText("Menampilkan 1–10 dari 12 data");
    await row(page, "Perangkat 01").getByRole("button", { name: "Hapus" }).click();
    await dlg.getByRole("button", { name: "Hapus" }).click();
    await expect(page.getByRole("status")).toHaveText("Perangkat dihapus");
    await expect(summary(page)).toHaveText("Menampilkan 1–10 dari 11 data");
    expect(await stored<Dev[]>(page, "nw2_dev")).toHaveLength(11);
  });

  test("detail perangkat menampilkan data simulasi", async ({ page }) => {
    await start(page, "/devices");
    await row(page, "Perangkat 05").getByRole("button", { name: "Detail" }).click();
    const dlg = page.getByRole("dialog", { name: "Detail perangkat" });
    await expect(dlg).toContainText("192.168.1.14");
    await expect(dlg).toContainText("Semua nilai adalah simulasi");
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
  });
});

test.describe("perangkat: pencarian, filter, urutan, pagination", () => {
  test("pagination 10 per halaman dengan tombol navigasi", async ({ page }) => {
    await start(page, "/devices");
    await expect(summary(page)).toHaveText("Menampilkan 1–10 dari 12 data");
    await expect(page.getByRole("button", { name: "Sebelumnya" })).toBeDisabled();
    await page.getByRole("button", { name: "Berikutnya" }).click();
    await expect(summary(page)).toHaveText("Menampilkan 11–12 dari 12 data");
    await expect(page.getByRole("button", { name: "Berikutnya" })).toBeDisabled();
    await page.getByRole("button", { name: "Sebelumnya" }).click();
    await expect(summary(page)).toHaveText("Menampilkan 1–10 dari 12 data");
  });
  test("ukuran halaman 5 menghasilkan 3 halaman", async ({ page }) => {
    await start(page, "/devices");
    await page.getByLabel("Data per halaman").selectOption("5");
    await expect(summary(page)).toHaveText("Menampilkan 1–5 dari 12 data");
    await expect(page.getByText("1 / 3")).toBeVisible();
    await page.getByRole("button", { name: "Berikutnya" }).click(); await page.getByRole("button", { name: "Berikutnya" }).click();
    await expect(summary(page)).toHaveText("Menampilkan 11–12 dari 12 data");
  });
  test("pencarian mengembalikan ke halaman 1 dan menampilkan pesan kosong", async ({ page }) => {
    await start(page, "/devices");
    await page.getByRole("button", { name: "Berikutnya" }).click();
    await page.getByLabel("Cari perangkat").fill("Perangkat 12");
    await expect(summary(page)).toHaveText("Menampilkan 1–1 dari 1 data");
    await page.getByLabel("Cari perangkat").fill("tidak-ada-yang-cocok");
    await expect(page.getByText("Tidak ada perangkat yang cocok.")).toBeVisible();
    await expect(summary(page)).toHaveText("Menampilkan 0–0 dari 0 data");
  });
  test("filter status Offline dan Online", async ({ page }) => {
    await start(page, "/devices");
    await page.getByLabel("Filter status").selectOption("off");
    await expect(summary(page)).toHaveText("Menampilkan 1–4 dari 4 data");
    await page.getByLabel("Filter status").selectOption("on");
    await expect(summary(page)).toHaveText("Menampilkan 1–8 dari 8 data");
  });
  test("urutan kolom Nama naik lalu turun, dapat dioperasikan dengan keyboard", async ({ page }) => {
    await start(page, "/devices");
    const head = page.getByRole("columnheader", { name: /Nama/ });
    await expect(head).toHaveAttribute("aria-sort", "ascending");
    await head.getByRole("button").focus();
    await page.keyboard.press("Enter");
    await expect(head).toHaveAttribute("aria-sort", "descending");
    await expect(page.getByRole("row").nth(1)).toContainText("Perangkat 12");
  });
});
