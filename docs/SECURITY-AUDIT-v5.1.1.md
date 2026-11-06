# Laporan audit keamanan v5.1.1

Jenis: tinjauan kode + tes otomatis. **Bukan** audit independen/uji penetrasi.

## 1. Audit kerentanan dependensi (23: 16 moderate, 6 high, 1 critical) — STATUS: BELUM DAPAT DIAUDIT
`npm audit` memerlukan registry npm, yang tidak terjangkau dari sesi pembuatan v5.1.1. Karena itu:
- Paket rentan dan advisory-nya **tidak dapat diidentifikasi dengan bukti**; saya tidak menebaknya.
- Tidak ada vulnerability yang dinyatakan "diperbaiki". `package.json` (dependensi) tidak diubah; `package-lock.json` hanya berubah pada nomor versi proyek.
- Angka yang tersisa tetap **23 (16 moderate / 6 high / 1 critical)** sampai Anda menjalankan audit.

Fakta dari `package-lock.json` (bukan klaim kerentanan): dependensi **produksi** hanya `next 14.2.35`, `react/react-dom 18.3.1`, `recharts 2.13.3` (+ `lucide-react`) dan turunannya; `eslint`, `eslint-config-next`, `@playwright/test 1.48.2`, `tailwindcss`, `typescript` adalah **devDependencies** (tidak ikut berjalan saat `npm start`; `@playwright/test`/`playwright` bertanda `devOptional` di lockfile karena `next` mendeklarasikannya sebagai peer opsional — secara praktis hanya alat tes; konfirmasi dengan `npm ls playwright --omit=dev`). Sebagian besar temuan pada proyek seperti ini lazimnya ada di rantai tooling (eslint/glob/minimatch/…), tetapi ini dugaan, bukan hasil audit.

### Prosedur (di mesin Windows Anda)
```powershell
npm ci
npm audit --json > audit.json
node scripts/audit-report.mjs audit.json          # direct vs transitive, advisory, perbaikan semver-compatible atau MAJOR
npm audit --omit=dev --json > audit-prod.json     # hanya dependensi yang berjalan di produksi
node scripts/audit-report.mjs audit-prod.json
npm ls <paket>                                    # jalur dependensi untuk tiap temuan
```
Aturan perbaikan: pakai `npm audit fix` (tanpa `--force`) hanya untuk yang berlabel "semver-compatible"; untuk "MAJOR" (mis. `next`, `eslint-config-next`, `@playwright/test`) analisis dampak dulu, naikkan satu per satu, lalu `npm ci && npm run typecheck && npm run lint && npm run build && npm test`. Jangan menghapus dependensi yang masih dipakai. Kirim `audit.json` bila ingin saya lanjutkan analisis dan perbaikan.

## 2. Tinjauan kode aplikasi
| Area | Temuan | Tindakan v5.1.1 |
|---|---|---|
| Bind localhost | `dev`/`start` memakai `-H 127.0.0.1` | tetap; verifikasi `netstat` di Windows (belum diverifikasi ulang di sini) |
| Host validation | `isLoopbackHost` pada semua `/api/*` | `/api/live/snapshot` kini memakai `guard()` yang sama |
| CSRF/Origin | POST butuh `X-NetWatch: 1`; Origin bila ada harus sama dengan Host | tidak berubah; diuji tes handler |
| Eksekusi perintah | `execFile`, `shell:false`, argumen dari kode; host ping divalidasi IPv4; target internet allow-list; perintah PowerShell konstanta (`NETADAPTER_CMD`, diuji tidak memuat input pengguna dan hanya read) | konstanta diekspor dan diuji |
| Clickjacking / sniffing | tidak ada header | **ditambah**: `X-Frame-Options`, CSP `frame-ancestors 'none'` (+base-uri/form-action/object-src), `nosniff`, `Referrer-Policy`, CORP; `X-Powered-By` off |
| CSP penuh (script-src) | tidak diterapkan | **tidak** diterapkan: Next.js 14 butuh inline script untuk hidrasi tanpa nonce, dan tidak dapat diuji di browser pada sesi ini |
| UPnP/SSRF | URL hanya ke IP gateway, tanpa redirect, ukuran dibatasi, hanya `Get*` | SSDP kini 3 ST; batasan balasan hanya-dari-gateway dipertahankan |
| Klien LAN memalsukan Host | bind 127.0.0.1 adalah pertahanan utama | tidak berubah |
| Secrets | tidak ada kredensial dalam kode/log | tidak berubah |

## 3. Risiko tersisa
Tanpa autentikasi (aman hanya jika terikat localhost); malware/proses lain di komputer yang sama dapat memanggil API (di luar model ancaman); 23 temuan dependensi belum dianalisis; CSP penuh belum ada.
