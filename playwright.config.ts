import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  reporter: [["list"]],
  timeout: 45_000,
  expect: { timeout: 7_000 },
  use: { baseURL: BASE, locale: "id-ID", timezoneId: "Asia/Jakarta", trace: "retain-on-failure" },
  // E2E_CHROMIUM_PATH: pakai Chromium yang sudah terpasang bila `playwright install` tidak bisa mengunduh.
  // Chromium baru hanya mendukung headless baru, sedangkan Playwright 1.48 meminta mode lama, maka dipaksa lewat args.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH, headless: false, args: ["--headless=new", "--no-sandbox"] } : {} } }],
  // Menguji build produksi. Gunakan E2E_SKIP_BUILD=1 bila .next sudah dibangun.
  webServer: {
    command: `${process.env.E2E_SKIP_BUILD ? "" : "npm run build && "}npx next start -p ${PORT} -H 127.0.0.1`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
