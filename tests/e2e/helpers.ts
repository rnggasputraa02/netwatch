import { test as base, expect, type Page } from "@playwright/test";

/** Titik acuan tetap agar data uji deterministik. */
export const T0 = 1_700_000_000_000;

export type Dev = { id: string; name: string; ip: string; mac: string; os: string; type: string; online: boolean; bw: number; seen: number };
export type Cfg = { interval: number; paused: boolean; collapsed: boolean; animLevel: "off" | "subtle" | "full"; perf: "normal" | "saver" };
export type Seed = { devices?: unknown; logs?: unknown; notices?: unknown; history?: unknown; cfg?: Partial<Cfg>; raw?: Record<string, string> };

const pad = (n: number) => String(n).padStart(2, "0");
/** 12 perangkat: Perangkat 01..12; yang offline adalah 03, 06, 09, 12. */
export const devices = (n = 12): Dev[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `d${i + 1}`, name: `Perangkat ${pad(i + 1)}`, ip: `192.168.1.${10 + i}`, mac: `02:00:5E:10:00:${(i + 16).toString(16).toUpperCase().padStart(2, "0")}`,
    os: "Linux", type: i % 2 ? "Router" : "Laptop", online: (i + 1) % 3 !== 0, bw: 10 + i, seen: T0 + i * 1000,
  }));
/** 25 log: jenis dan prioritas bergilir; log #1 memuat tanda kutip dan koma untuk uji CSV. */
export const logs = (n = 25) =>
  Array.from({ length: n }, (_, i) => ({
    id: `l${i + 1}`, t: T0 + i * 60_000, type: (["Sistem", "Perangkat", "Jaringan"] as const)[i % 3], name: `Sumber ${pad(i + 1)}`,
    desc: i === 0 ? 'Kutip "ganda", koma' : `Peristiwa ${pad(i + 1)}`, pr: (["Rendah", "Sedang", "Tinggi"] as const)[i % 3],
  }));
export const notices = () => [
  { id: "n1", t: T0, key: "a", title: "Notif A", body: "isi A", read: false },
  { id: "n2", t: T0 + 1000, key: "b", title: "Notif B", body: "isi B", read: false },
  { id: "n3", t: T0 + 2000, key: "c", title: "Notif C", body: "isi C", read: true },
];
/** Riwayat trafik: n titik, satu per detik, berakhir 1 detik sebelum sekarang. */
export const history = (n = 120) => {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({ t: now - (n - i) * 1000, down: 30 + (i % 10), up: 10 + (i % 5) }));
};

/**
 * Mengisi LocalStorage sebelum aplikasi dimuat. Hanya sekali per tab (sessionStorage) agar muat ulang
 * tidak menimpa data yang disimpan aplikasi. Simulasi dijeda secara bawaan agar tes stabil.
 */
export async function seed(page: Page, s: Seed = {}): Promise<void> {
  const payload = {
    devices: s.devices ?? devices(), logs: s.logs ?? logs(), notices: s.notices ?? [], history: s.history ?? [],
    cfg: { interval: 2, paused: true, collapsed: false, animLevel: "off", perf: "normal", ...s.cfg }, raw: s.raw ?? {},
  };
  await page.addInitScript((p) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    const set = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
    set("nw2_dev", p.devices); set("nw2_log", p.logs); set("nw2_not", p.notices); set("nw2_hist", p.history); set("nw2_cfg", p.cfg);
    for (const [k, v] of Object.entries(p.raw)) localStorage.setItem(k, v);
  }, payload);
}

/** Mengisi data uji lalu membuka rute. Dipanggil di awal tiap tes (satu kali per tes). */
export async function start(page: Page, path: string, s: Seed = {}) {
  await seed(page, s);
  return open(page, path);
}

/** Membuka rute dan menunggu aplikasi siap (bukan layar "Memuat NetWatch…"). */
export async function open(page: Page, path: string) {
  const res = await page.goto(path);
  await expect(page.getByRole("button", { name: "Buka pencarian global" })).toBeVisible();
  return res;
}
export const stored = <T = unknown>(page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null") as T, key);
export const unread = (page: Page) => page.getByTestId("unread");
export const pauseBtn = (page: Page) => page.getByRole("button", { name: "Jeda atau lanjutkan" });

/**
 * Pemantau galat. Tiga kategori dipisahkan: status HTTP >= 400, galat JavaScript/console, dan kegagalan jaringan.
 * Hanya dua pengecualian sempit yang diizinkan, keduanya harus dinyatakan:
 *  - `expect404(path)`: halaman 404 yang memang diharapkan (status HTTP 404 dan satu pesan console "Failed to load resource" untuk URL itu).
 *  - Permintaan prefetch RSC (`_rsc=`) atau chunk JS Next (`/_next/static/chunks/`) yang dibatalkan browser (net::ERR_ABORTED) saat navigasi berpindah halaman; dicatat sebagai `abortedPrefetch`, bukan diabaikan diam-diam.
 */
export class Monitor {
  jsErrors: string[] = []; consoleErrors: string[] = []; netFailures: string[] = []; httpErrors: string[] = []; abortedPrefetch: string[] = [];
  private ok404: string | null = null;
  constructor(page: Page) {
    page.on("pageerror", (e) => this.jsErrors.push(e.message));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      if (this.ok404 && m.location().url.endsWith(this.ok404) && /404/.test(m.text())) return;
      this.consoleErrors.push(`${m.text()} @ ${m.location().url}`);
    });
    page.on("requestfailed", (r) => {
      const err = r.failure()?.errorText ?? "";
      if (err.includes("ERR_ABORTED") && (r.url().includes("_rsc=") || r.url().includes("/_next/static/chunks/") || r.url().includes("/api/live/snapshot") || r.url().includes("/api/router/status") || r.url().includes("/api/discovery") || r.url().includes("/icon.svg"))) this.abortedPrefetch.push(r.url());
      else this.netFailures.push(`${err} ${r.url()}`);
    });
    page.on("response", (r) => { if (r.status() >= 400 && !(this.ok404 && r.url().endsWith(this.ok404) && r.status() === 404)) this.httpErrors.push(`${r.status()} ${r.url()}`); });
  }
  private allowed: RegExp[] = [];
  /** Mengizinkan kegagalan yang DISENGAJA oleh tes (mis. collector putus) pada URL tertentu; kegagalan lain tetap gagal. */
  allow(re: RegExp) { this.allowed.push(re); }
  expect404(path: string) { this.ok404 = path; }
  assertClean() {
    expect.soft(this.jsErrors.filter((x) => !this.allowed.some((r) => r.test(x))), "galat JavaScript").toEqual([]);
    // Next mencatat "Failed to fetch RSC payload" bila prefetch Link terputus oleh page.goto yang disengaja tes; hanya diabaikan bila ada prefetch yang memang dibatalkan.
    const rsc = (x: string) => this.abortedPrefetch.length > 0 && x.startsWith("Failed to fetch RSC payload");
    expect.soft(this.consoleErrors.filter((x) => !rsc(x) && !this.allowed.some((r) => r.test(x))), "console.error").toEqual([]);
    expect.soft(this.httpErrors.filter((x) => !this.allowed.some((r) => r.test(x))), "status HTTP >= 400").toEqual([]);
    expect.soft(this.netFailures.filter((x) => !this.allowed.some((r) => r.test(x))), "kegagalan jaringan").toEqual([]);
  }
}
export const test = base.extend<{ monitor: Monitor }>({
  monitor: [async ({ page }, provide) => { const m = new Monitor(page); await provide(m); m.assertClean(); }, { auto: true }],
});
export { expect };
