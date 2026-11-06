import { devices, expect, logs, start, stored, test, type Dev } from "./helpers";

test.describe("regresi v2.2.1", () => {
  test("tabel log punya header kolom yang dapat diakses", async ({ page }) => {
    await start(page, "/logs", { logs: logs(5) });
    for (const h of ["Waktu", "Jenis", "Perangkat", "Deskripsi", "Prioritas"]) await expect(page.getByRole("columnheader", { name: h })).toBeVisible();
    await expect(page.getByRole("table", { name: "Log aktivitas simulasi" })).toBeVisible();
  });
  test("header kolom perangkat dikenali sebagai columnheader dengan aria-sort", async ({ page }) => {
    await start(page, "/devices");
    await expect(page.getByRole("columnheader", { name: /^Nama/ })).toHaveAttribute("aria-sort", "ascending");
    await expect(page.getByRole("columnheader", { name: /^IP/ })).toHaveAttribute("aria-sort", "none");
  });
  test("urutan IP numerik: .2 sebelum .10", async ({ page }) => {
    const d: Dev[] = devices(3).map((x, i) => ({ ...x, ip: ["192.168.1.10", "192.168.1.2", "192.168.1.100"][i], name: `Z${i}` }));
    await start(page, "/devices", { devices: d });
    await page.getByRole("button", { name: /^IP/ }).click();
    const cells = page.locator("tbody tr td:nth-child(2)");
    await expect(cells).toHaveText(["192.168.1.2", "192.168.1.10", "192.168.1.100"]);
  });
  test("menaikkan jumlah perangkat setelah ada yang dihapus tidak menggandakan id atau IP", async ({ page }) => {
    const d = devices(8).filter((x) => x.id !== devices(8)[2].id);
    await start(page, "/settings", { devices: d });
    await page.locator('input[type="range"]').fill("14");
    await expect(page.getByText("Jumlah perangkat simulasi: 14")).toBeVisible();
    const s = (await stored<Dev[]>(page, "nw2_dev")) ?? [];
    expect(s).toHaveLength(14);
    expect(new Set(s.map((x) => x.id)).size).toBe(14);
    expect(new Set(s.map((x) => x.ip)).size).toBe(14);
  });
  test("dasbor menampilkan jumlah perangkat bermasalah (offline) sebagai simulasi", async ({ page }) => {
    const d = devices(6).map((x, i) => ({ ...x, online: i >= 2 }));
    await start(page, "/dashboard", { devices: d });
    await expect(page.getByText("Perangkat Bermasalah (offline, simulasi)")).toBeVisible();
  });
});
