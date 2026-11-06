# Laporan pengujian v5.1.1

Laporan dipisah menurut lingkungan. "Lulus" hanya ditulis bila perintah benar-benar dijalankan dan keluarannya diamati.

## A. Linux/sandbox (sesi pembuatan v5.1.1; Node v22.23.4; tanpa node_modules)
| Pemeriksaan | Hasil | Keterangan |
|---|---|---|
| `npm run test:unit` (Node test runner, strip-types) | **LULUS 98/98** | baseline v5.1.0: 91/91; +7 tes baru `tests/unit/v511-fixes.test.ts` |
| `npm run test:shortcuts` (Chromium nyata) | **LULUS 38/38** | |
| `tsc --noEmit` | **TIDAK VALID sebagai typecheck penuh** | tanpa node_modules (react/next/@types) tsc menghasilkan ratusan galat modul-tak-ditemukan. Perbandingan baseline v5.1.0 vs v5.1.1 pada galat selain TS2307/TS7016/TS7026/TS2875: selisih hanya 2 baris `@types/node` untuk berkas tes baru (sama dengan berkas tes lain). Ini bukti lemah; typecheck penuh tetap wajib dijalankan. |
| `npm ci`, `npm audit`, `npm run lint`, `npm run build`, `npm run test:e2e` | **TIDAK DIJALANKAN** | registry npm tidak terjangkau; jaringan Bash dimatikan untuk instalasi paket |
| `scripts/audit-report.mjs` | berjalan pada fixture sintetis | bukan hasil audit nyata |
| `tests/api/handlers.test.mts` | **TIDAK DIJALANKAN** | butuh `tsx` (tidak terpasang); jalur `/api/live/snapshot` berubah ke `guard()` sehingga wajib dijalankan ulang |

## B. Windows
Baseline berikut **dilaporkan pengguna untuk v5.1.0** (Windows 11, Node v24.21.0), bukan dijalankan ulang untuk v5.1.1: `npm ci` berhasil; build produksi berhasil; Wi-Fi 192.168.100.10/24, gateway 192.168.100.1; ping gateway 4/4 (0% loss); ping 1.1.1.1/8.8.8.8/9.9.9.9 berhasil; discovery pasif menemukan gateway via ARP; watch test mendeteksi gateway hilang + internet putus dan alert pulih saat NORMAL; UPnP `UNKNOWN: upnp_no_response`; throughput komputer 0,00 Mbps; `npm ci` melaporkan 23 vulnerability (16 moderate, 6 high, 1 critical).
**Windows v5.1.1: belum ada pengujian.** Daftar yang harus dijalankan: `docs/WINDOWS-VERIFICATION.md`, `docs/THROUGHPUT-TEST.md`.

### Windows — hasil nyata (dilaporkan pengguna, Windows 11, Node v24.21.0, deps Tahap 1)
typecheck lulus · lint lulus (setelah perbaikan) · build lulus · unit 97 lulus/0 gagal/1 skip · shortcuts 38/38 · **E2E 124/128 lulus** (4 gagal: lihat CHANGELOG 5.1.2-prep; perbaikan belum dijalankan ulang) · `npm audit`: 11 (6 moderate, 4 high, 1 critical) — sisa menunggu upgrade Next 16.

## C. Dengan mock
Seluruh 98 tes unit memakai fixture/mock untuk keluaran `ping`/`route`/`arp`/PowerShell/UPnP; sebagian memakai berkas `/proc/net/dev` Linux sungguhan dan server UPnP palsu di loopback. Tes baru: histeresis alert (5 skenario), timestamp counter PowerShell (mock), `computeRate` (0 vs null), M-SEARCH multi-ST. Mock **tidak** membuktikan perilaku Windows/router nyata.

## D. Perangkat nyata
Tidak ada pengujian pada HG8145V5 atau perangkat lain di sesi ini. Satu-satunya data router nyata: hasil baseline `upnp_no_response` di atas.

## E. Yang diubah tetapi tidak dapat diuji end-to-end
Tampilan kartu throughput (`RealBandwidth.tsx`), debounce insiden (`store-v5.ts`), wiring histeresis di `store.tsx`, header `next.config.mjs`. Hanya logika murni yang diuji unit; kompilasi TypeScript/JSX penuh, lint, build, dan E2E belum dijalankan. **Karena itu v5.1.1 TIDAK boleh disebut FINAL.**
