# Rencana perbaikan dependensi (13 vulnerability, hasil `npm audit` Windows)

## STATUS JUJUR
Registry npm **tidak terjangkau** dari sesi ini (diperiksa ulang: `npm view` dan `curl registry.npmjs.org` gagal; cache npm kosong). Akibatnya **tidak ada dependensi yang diubah, `package-lock.json` tidak disentuh, dan tidak ada vulnerability yang dinyatakan diperbaiki.** Sebuah lockfile tidak bisa dibuat sah tanpa registry (butuh versi tersemat + hash integritas); menyunting manual akan merusak `npm ci`. Jumlah vulnerability: **sebelum 13, sesudah 13 (tidak berubah, tidak diverifikasi ulang)**.
Catatan: angka 13 berbeda dari 23 yang dilaporkan sebelumnya; saya tidak dapat menjelaskan selisihnya tanpa `audit.json` dan `package-lock.json` yang dipakai di Windows.

## Temuan (13) — DATA NYATA dari `npm audit --json` Windows (berkas: `docs/audit-windows-2026-11-05.json`; 1 critical, 6 high, 6 moderate; prod 64, dev 395)
| Paket | Jenis | Rentang rentan / advisory ringkas | Perbaikan yang dilaporkan npm | Rencana |
|---|---|---|---|---|
| `next` 14.2.35 (critical) | runtime | 9.3.4-canary.0 … 16.3.0-preview.10: 25 advisory (Image Optimizer, RSC/Server Actions DoS, rewrites, middleware, cache poisoning, SSRF, RCE Image Optimizer & **RCE pada server Windows**, dll.) | `next@16.4.5` **MAJOR** — seluruh seri 14 dan 15 masuk rentang rentan, jadi tidak ada patch 14.x | Tahap 2 (branch terpisah) |
| `postcss` (high) | 8.4.47 top-level + 8.4.31 di dalam `next` | ≤8.5.22 | top-level: naik ke 8.x terbaru (non-major). Salinan di dalam `next`: hilang bersama upgrade `next` | Tahap 1 (top-level), Tahap 2 (nested) |
| `@playwright/test`, `playwright` (high) | dev (tes) | <1.55.1: unduhan browser tanpa verifikasi SSL | `@playwright/test@1.64.1`, **bukan major** | Tahap 1 |
| `@typescript-eslint/{eslint-plugin,parser,type-utils,typescript-estree,utils}` (5 moderate) | dev (lint) | via `minimatch` | `fixAvailable: true` → `npm audit fix` (semver-compatible) | Tahap 1 |
| `minimatch` (moderate) | dev (lint) | ReDoS amplifikasi `>=7.0.0 <11.0.1`; node 10.2.6 (typescript-estree) dan 9.0.9 (di bawah `glob`) | node typescript-estree ikut selesai bila `@typescript-eslint` naik; node di bawah `glob` hanya lewat `eslint-config-next@16.4.5` | Tahap 1 sebagian, Tahap 2 |
| `glob` 10.3.10, `@next/eslint-plugin-next`, `eslint-config-next` (3 high) | dev (lint) | glob CLI command injection (`-c`), bypass AbortSignal | `eslint-config-next@16.4.5` **MAJOR** | Tahap 2 |

Perkiraan hasil Tahap 1 (**belum terbukti**): 13 → sekitar 6 (sisa: `next`, `postcss` nested, `eslint-config-next`, `@next/eslint-plugin-next`, `glob`, `minimatch` di bawah glob). Tidak ada tindakan di sini yang membersihkan `next` sampai Tahap 2.
Mitigasi untuk `next` sebelum Tahap 2 (bukan perbaikan; audit tetap menandai): `images.unoptimized: true` di `next.config.mjs` menutup endpoint Image Optimizer; NetWatch tidak memakai `next/image`, middleware, Server Actions, rewrites; bind `127.0.0.1`. Advisory RSC/Server Function dan "RCE pada server Windows" tidak dapat saya nilai relevansinya dari judulnya saja — karena itu Tahap 2 prioritas tinggi dan server jangan dijangkau dari LAN.

## Dampak upgrade major Next.js (berdasar kode NetWatch, bukan dugaan umum)
Diperiksa di source: **tidak ada** `next/image`, middleware, Server Actions, rewrites/redirects, `cookies()/headers()/params`. Impor Next hanya `next/link` (6) dan `next/navigation` (3). Route handler memakai `Request` standar + `export const dynamic = "force-dynamic"`; `layout.tsx` memakai `Metadata`. Permukaan yang terpengaruh sangat kecil. Hal yang HARUS dicek (dari pengetahuan umum tentang Next 15/16, verifikasi di catatan rilis resmi):
- **React 19**: App Router Next 15+ membutuhkan React 19 → naikkan `react`, `react-dom`, `@types/react`, `@types/react-dom`; cek kompatibilitas `recharts 2.13` dan `lucide-react 0.453` dengan React 19 (peer dependency).
- **`next lint` dihapus di Next 16** → skrip `lint` harus diganti `eslint .`; `eslint-config-next@16` menuntut ESLint 9 + flat config (`.eslintrc.json` tidak lagi dipakai). Ini mengubah tooling, bukan fitur aplikasi.
- Node minimum naik (Node 22 dan 24 sudah memenuhi).
- Build default Turbopack di Next 16: uji `npm run build`; impor berekstensi `.ts` (`../live/parse.ts`, `allowImportingTsExtensions`) dan `-H 127.0.0.1` pada `next start` harus dipastikan masih bekerja.
- Header keamanan di `next.config.mjs` (v5.1.1) dan `guard()` harus dites ulang; `tests/api/handlers.test.mts` dijalankan manual.
Rekomendasi: **jangan** `npm audit fix --force`. Lakukan bertahap, masing-masing satu commit, di branch terpisah.

## Tahap 1 otomatis
`powershell -ExecutionPolicy Bypass -File scripts\apply-security-stage1.ps1` (cadangan otomatis, berhenti saat gagal, tanpa `--force`). Skrip menjalankan `npm ci`, typecheck, lint, build, unit, shortcuts, E2E, dan audit sesudahnya. **Belum pernah dijalankan** (tidak ada registry di sesi ini).

## Prosedur manual bertahap (di Windows, repo git)
```powershell
git checkout -b security/deps-5.1.2
npm ci; npm audit --json > audit-0.json; node scripts/audit-report.mjs audit-0.json   # baseline
# Tahap 1 — kompatibel (tanpa --force)
npm audit fix --dry-run                      # baca dulu apa yang akan berubah; tolak bila ada "major"
npm audit fix
npm ci; npm run typecheck; npm run lint; npm run build; npm test
npm audit --json > audit-1.json; node scripts/audit-report.mjs audit-1.json
# Tahap 2 — Playwright & PostCSS (satu per satu)
npm install -D @playwright/test@latest-1.x   # ganti dengan versi perbaikan dari audit-report (jangan major)
npx playwright install chromium; npm run test:e2e
npm install -D postcss@^8.5; npm run build
# Tahap 3 — overrides bila masih tersisa (glob/minimatch/postcss di dalam next), contoh package.json:
#   "overrides": { "glob": "^10.5.0", "minimatch": "<versi perbaikan dari audit>" }
npm install; ulangi verifikasi
# Tahap 4 — Next.js major: BRANCH TERPISAH
git checkout -b security/next-major; npm install next@<versi dari fixAvailable> react@19 react-dom@19 eslint-config-next@<sama> ; perbaiki lint (eslint .), ulangi seluruh verifikasi + docs/WINDOWS-VERIFICATION.md
```
Setiap tahap lulus hanya bila: `npm ci`, typecheck, lint, build, unit, shortcuts, E2E, dan audit baru dijalankan dan keluarannya dicatat. Rollback: `git checkout -- package.json package-lock.json && npm ci`.

## Risiko yang tersisa sekarang
Seluruh 13 temuan tetap ada. Yang berdampak pada pengguna akhir hanya `next` (runtime); `postcss` sebagian ikut runtime-build; sisanya hanya alat build/tes/lint (tidak berjalan saat `npm start`). Mitigasi yang sudah ada: bind `127.0.0.1`, tanpa middleware/Server Actions/next/image, `guard()` pada API, header keamanan v5.1.1.
**Yang saya butuhkan untuk menyelesaikannya:** `audit.json` (`npm audit --json`) dan `npm ls next postcss playwright glob minimatch` dari Windows — atau akses registry di sesi berikutnya.
