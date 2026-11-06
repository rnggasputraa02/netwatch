# NetWatch v5.1.1 — Platform Monitoring Jaringan (Windows)

> **Status rilis: v5.1.1 = KANDIDAT RILIS (final candidate), BUKAN final.** Pada sesi pembuatan v5.1.1, `npm ci`/`npm audit`/typecheck penuh/lint/build/E2E **tidak dapat dijalankan** (registry npm tidak terjangkau) dan tidak ada verifikasi ulang di Windows asli maupun **Huawei HG8145V5**. Baseline Windows 11 yang terbukti ada di [`docs/WINDOWS-VERIFICATION.md`](docs/WINDOWS-VERIFICATION.md). Rincian: [`docs/TEST-REPORT-v5.1.1.md`](docs/TEST-REPORT-v5.1.1.md) · [`docs/FEATURE-STATUS.md`](docs/FEATURE-STATUS.md) · [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) · [`docs/SECURITY-AUDIT-v5.1.1.md`](docs/SECURITY-AUDIT-v5.1.1.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/THROUGHPUT-TEST.md`](docs/THROUGHPUT-TEST.md)

NetWatch memantau **komputer Anda, gateway, koneksi internet, dan perangkat lain di subnet lokal**, sejauh sumber datanya benar-benar tersedia, dan memiliki mode **simulasi** terpisah untuk belajar. Dua sumber data **tidak pernah bercampur** dan selalu berlabel:

| Label | Arti |
|---|---|
| `SIMULATION` | data buatan aplikasi (perangkat, trafik, skenario gangguan); **bukan** pengukuran jaringan |
| `LIVE` | pengukuran nyata dari komputer ini / router (UPnP) / tabel ARP lokal |
| `STALE` · `UNKNOWN` · `DISCONNECTED` · `OFF` | status sumber LIVE: data lama · menunggu · gagal diukur · nonaktif. **Tidak pernah diganti data simulasi**; nilai tak tersedia ditampilkan `—` (CSV: sel kosong), bukan `0` |

Dokumen lain: [`docs/HUAWEI-HG8145V5.md`](docs/HUAWEI-HG8145V5.md) (audit dan panduan router) · [`docs/SECURITY.md`](docs/SECURITY.md) (model ancaman) · [`CHANGELOG.md`](CHANGELOG.md).

## Fitur (v5.0, dipertahankan penuh di v5.1)
- **Dasbor**: blok *Monitoring Nyata* (kondisi jaringan, gateway, internet, throughput komputer, status router, perangkat terdeteksi, alert LIVE per tingkat, gangguan terakhir) dan, terpisah di bawahnya, blok *Simulasi*.
- **Perangkat Terdeteksi** (`/discovery`): mode **pasif** (baca tabel ARP) dan **aktif terbatas** (1 ping per alamat ke subnet lokal Anda saja, maks 254 alamat, 8 paralel, bisa dihentikan). IPv4, MAC, hostname (reverse DNS, opsional), status, waktu terlihat; riwayat tersimpan; CSV. Jenis perangkat hanya "Gateway" (rute default) dan "Komputer ini"; selebihnya "Tidak diketahui". Perangkat yang memblokir ping tetap tampil bila ada di ARP.
- **Router** (`/router`): UPnP IGD baca-saja untuk Huawei HG8145V5 atau router lain. Tanpa password, tanpa tebakan endpoint. Daftar klien DHCP, SNMP, dan trafik per perangkat: **NOT SUPPORTED / NOT PROBED** (alasan di halaman dan dokumen).
- **Bandwidth** (`/bandwidth`): tiga metrik terpisah: (1) throughput koneksi komputer ini, (2) total throughput WAN router (UPnP), (3) per perangkat (NOT SUPPORTED). Rata-rata/maks, total byte, lonjakan, penanda TINGGI, CSV.
- **Analitik & Laporan** (`/analytics`): latency (rata-rata/min/maks/P95/jitter), packet loss, stabilitas, indikasi hambatan **beserta buktinya**, lonjakan, riwayat perubahan kondisi, laporan harian dan mingguan (agregasi 10 menit, 14 hari), CSV gangguan.
- **Alert**: tingkat keparahan (kritis/peringatan/info), cooldown 60 dtk untuk LIVE, deduplikasi, status aktif/pulih, ambang yang dapat diubah, jenis baru (perangkat baru, router tidak dapat diakses, bandwidth tinggi, gateway/internet terputus). Alert LIVE dan SIMULATION terpisah.
- **Topologi**: tab *Simulasi* dan *Jaringan Nyata*. Peta nyata hanya menggambar hubungan yang diketahui (komputer→gateway, gateway→internet); perangkat lain berada dalam kotak subnet **tanpa garis** karena koneksi fisiknya tidak diketahui.
- **Otomatisasi**: pengukuran berkala (10/30/60 dtk) tanpa menekan tombol; riwayat dan laporan tersimpan. *Berjalan selama tab NetWatch terbuka* (lihat Batasan).
- **Keandalan**: tiap sumber (snapshot, router, discovery) dipolling terpisah dengan timeout; kegagalan satu sumber tidak mengganggu yang lain; migrasi skema (`nw_schema`=5) non-destruktif; log server terstruktur.
- Semua fitur v3.0 dipertahankan (simulasi lanjutan, alert simulasi, Monitoring Nyata dasar, CRUD perangkat simulasi, dll.).

## Instalasi di Windows
1. Pasang **Node.js 22 LTS** (≥ 22.6): <https://nodejs.org>. Cek: `node -v`.
2. Ekstrak `netwatch-v5.1-final.zip` (nama berkas; status rilis lihat banner di atas), buka **PowerShell** di folder `netwatch`:
```powershell
npm ci
npm run build
npm start          # http://localhost:3000   (atau: npm run dev untuk pengembangan)
```
`npm start` dan `npm run dev` **hanya mengikat `127.0.0.1`** (v5.1). Jangan menjalankan `next start` tanpa `-H 127.0.0.1`.
3. Buka `http://localhost:3000` (**bukan** alamat IP LAN: ditolak 403 demi keamanan).
4. **Monitoring Nyata** → centang *Aktifkan monitoring nyata*. Bagian lain (router, pemindaian) diaktifkan pada halamannya masing-masing dan bersifat opt-in.
5. Windows Firewall dapat menanyakan izin untuk Node.js (balasan UDP penemuan router). Izinkan hanya pada **jaringan privat**.

Windows memakai `ping.exe`, `route.exe`, `arp.exe`, dan `powershell.exe` bawaan dari `%SystemRoot%\System32` (jalur absolut); tidak ada instalasi tambahan. Untuk melihat kecepatan trafik komputer, PowerShell dipakai sekali per pengukuran (±1 dtk).

## Cara kerja sumber LIVE
| Data | Sumber di Windows | Sumber di Linux |
|---|---|---|
| Interface, IPv4, subnet | API Node `os.networkInterfaces()` | sama |
| Default gateway | `route.exe print -4` (metrik terendah) | `ip -4 route show default` |
| Latency, packet loss | `ping.exe -n 4 -w 1000 <IP>` (gateway dan 1 target internet dari daftar tetap: 1.1.1.1/8.8.8.8/9.9.9.9) | `ping -n -c 4 -W 1 <IP>` |
| Throughput komputer | `Get-NetAdapterStatistics` (perintah tetap) → laju dari dua pembacaan | `/proc/net/dev` |
| Perangkat sekitar | `arp.exe -a` (+ ping terbatas bila dipilih) | `/proc/net/arp` |
| Router | UPnP IGD (SSDP UDP 1900 + SOAP `Get*`) | sama |
Parser tidak bergantung bahasa OS (pola `TTL=`, `time=`/`waktu=`, kolom numerik). Counter 32-bit yang wrap ditangani; counter reset atau jeda > 5 menit menghasilkan `—`, bukan angka.

## Keamanan (ringkas; lengkap di docs/SECURITY.md)
Hanya localhost (403 bagi Host lain) · `POST` wajib header `X-NetWatch` dan Origin sama · `execFile` tanpa shell, argumen dibuat kode, IPv4 divalidasi ketat, target internet dari daftar tetap · pemindaian hanya subnet privat sendiri (maks /24), terbatas dan dapat dihentikan · UPnP: hanya `Get*`, hanya ke IP gateway, tanpa redirect · tidak ada password/kredensial router di mana pun. **Jangan** membuka server ke LAN/internet (`-H 0.0.0.0`) tanpa autentikasi Anda sendiri.

## Penyimpanan dan retensi (LocalStorage, per browser)
`nw_schema` (versi skema) · `nw5_cfg` (interval, router, hostname) · `nw5_known` (perangkat, maks 300) · `nw5_bw` (throughput, 720 titik) · `nw5_buckets` (agregasi 10 menit, 14 hari) · `nw5_incidents` (maks 200) · `nw3_*` (LIVE dasar, alert, aturan, skenario) · `nw2_*` (simulasi, kompatibel). Data rusak dibuang per entri; skema dari versi lebih baru tidak diubah (pengguna diberi peringatan). Hapus: tombol *Hapus riwayat* di tiap halaman, atau *Pengaturan → Reset Semua Data* (juga menonaktifkan semua fitur LIVE). Riwayat hanya terkumpul saat NetWatch terbuka dan pengukuran aktif. CSV: UTF-8 BOM, kolom `Sumber`.

## Pengujian
| Perintah | Isi |
|---|---|
| `npm run typecheck` · `npm run lint` | TypeScript strict · ESLint (`next/core-web-vitals`) |
| `npm run test:unit` | 91 tes unit/integrasi (Node 22.6+) |
| `npx tsx --test tests/api/handlers.test.mts` | 6 tes handler API (guard, CSRF, injeksi; manual, butuh `tsx`) |
| `npm run selftest -- [--router] [--discovery passive\|active] [--watch 90] [--redact]` | uji mandiri **perangkat nyata**, read-only; hasil JSON (lihat `docs/WINDOWS-VERIFICATION.md`) |
| `npm run test:shortcuts` | logika pintasan di Chromium |
| `npm run test:e2e` | E2E (12 berkas spec) terhadap build produksi |
| `npm test` | unit + shortcuts + E2E |
Browser Playwright: `npm run test:e2e:install` (butuh akses cdn.playwright.dev). Bila diblokir tetapi Chromium ada: `$env:E2E_CHROMIUM_PATH="C:\jalur\chrome.exe"`. `E2E_SKIP_BUILD=1` memakai `.next` yang ada; `E2E_PORT` mengubah port.

### Jenis bukti pengujian (jangan disamakan) — status v5.1
| Kategori | Cakupan |
|---|---|
| **Lulus pada sesi v5.1 (Linux)** | unit 91/91 (parser, analitik, migrasi, guard, perencana pemindaian, merge perangkat, klien UPnP, tes baru v5.1 + uji mutasi); shortcut 38/38 di Chromium nyata; 6 tes handler API (kode route sungguhan: 403/400/CSRF/injeksi) |
| **Mock** | seluruh keluaran `ping`/`route`/`arp`/PowerShell (fixture), respons router UPnP (mock dan server UDP+HTTP palsu di loopback) |
| **Dilaporkan lulus di v5.0, TIDAK dijalankan ulang di v5.1** | typecheck penuh, lint, build produksi, 12 spec E2E, UI |
| **Lulus pada Windows sungguhan** | **tidak ada** |
| **Lulus pada HG8145V5 sungguhan** | **tidak ada** |

### Verifikasi manual di Windows (disarankan sebelum diandalkan)
1. `ipconfig /all` → bandingkan IPv4/subnet/gateway dengan halaman Monitoring Nyata.
2. `ping <gateway>` dan `ping 1.1.1.1` → bandingkan RTT dan loss.
3. Unduh berkas besar → throughput komputer naik; bandingkan dengan Task Manager.
4. `arp -a` → bandingkan dengan hasil pemindaian pasif; jalankan pemindaian aktif dan periksa tidak ada lonjakan aneh.
5. Cabut kabel/Wi-Fi → kondisi `UNKNOWN`, alert kritis "Jaringan lokal (default gateway tidak ada)" dan "Internet ... tidak merespons" muncul (bukan nilai 0), lalu pulih saat dicolok. Status sumber tetap `LIVE` selama server NetWatch lokal menjawab; `STALE`/`DISCONNECTED` hanya bila server lokal tidak terjangkau. Atau jalankan `npm run selftest -- --watch 120`.
6. Aktifkan integrasi router dan ikuti `docs/HUAWEI-HG8145V5.md`.

## Rute
`/dashboard` · `/devices` · `/bandwidth` · `/topology` · `/logs` · `/live` · `/discovery` · `/router` · `/analytics` · `/simulation` · `/alerts` · `/settings` · `/about` · `GET /api/live/snapshot` · `GET /api/router/status` · `GET|POST /api/discovery` · 404.

## Troubleshooting Windows
- **Selalu `DISCONNECTED`/403**: buka lewat `http://localhost:3000` (atau `http://127.0.0.1:3000`), bukan IP LAN (server memang hanya mengikat 127.0.0.1); pastikan `npm start` berjalan.
- **"ping tidak ditemukan"**: pastikan `%SystemRoot%\System32\ping.exe` ada dan tidak diblokir kebijakan.
- **Throughput komputer `—`**: PowerShell tidak tersedia/diblokir, atau nama adapter tidak cocok; lihat catatan di halaman.
- **Loss 100% padahal terhubung**: firewall/router memblokir ICMP; pilih target internet lain.
- **Router UNKNOWN**: UPnP nonaktif/ditolak firewall; lihat docs/HUAWEI-HG8145V5.md.
- **Pemindaian hanya menampilkan sedikit perangkat**: perangkat yang memblokir ping hanya tampil bila ada di ARP; coba mode pasif setelah pemindaian aktif.
- **Port 3000 terpakai**: `npx next start -p 3001`.
- **`npm ci` menolak Node lama**: pakai Node 22.6+.
- **Data aneh**: Pengaturan → Reset Semua Data.

## Audit v3.0 → v5.0 (temuan awal)
Baseline v3.0 lulus (typecheck, lint, 49 tes unit, 108 E2E). Temuan yang ditangani: interval pengukuran tetap 10 dtk dan ambang STALE tetap; riwayat LIVE hanya 720 titik (tanpa agregasi untuk laporan); alert tanpa tingkat keparahan/cooldown; tanpa versi skema; tanpa sumber untuk throughput, perangkat, dan router.

## Batasan yang diketahui
Daftar lengkap dan terkini: [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md). Ringkasan v5.0:
- **Belum ada** (didokumentasikan, bukan disembunyikan): daftar klien DHCP router, SNMP, trafik per perangkat, kolektor latar belakang di sisi server (riwayat hanya terkumpul saat tab terbuka), notifikasi di luar aplikasi, IPv6, macOS, identifikasi vendor/jenis perangkat dari MAC.
- Topologi nyata tidak mengetahui switch/AP; tidak ada garis untuk hubungan yang tidak diketahui.
- Laju router memakai dua pembacaan counter (jeda ≥ 1 interval); laju pertama setelah diaktifkan `—`.
- Hanya Chromium yang diuji otomatis; tidak ada audit aksesibilitas formal; `npm audit` tidak dijalankan.
- Pemindaian aktif memicu entri ARP dan lalu lintas ICMP ringan; beberapa IDS/router dapat mencatatnya.

## Perubahan v5.1 (ringkas; rinci di CHANGELOG.md)
Bind `127.0.0.1` (keamanan) · alert jaringan lokal terputus · label `via` discovery · `npm run selftest` · dokumen status/uji/keterbatasan yang jujur. Tidak ada fitur besar baru.

## Perubahan v5.0 (ringkas)
Perangkat Terdeteksi, integrasi router UPnP, bandwidth tiga metrik, analitik dan laporan, alert dengan severity/cooldown/jenis baru, topologi nyata, dasbor LIVE, pengukuran berkala dengan interval, agregasi retensi 14 hari, migrasi skema, guard keamanan endpoint, log server terstruktur, dan dokumentasi HG8145V5/keamanan.

## Pintasan keyboard
| Tombol | Aksi |
|---|---|
| `Ctrl+K` / `Cmd+K` atau `/` | Pencarian global |
| `?` | Bantuan pintasan |
| `G` lalu `D` `P` `B` `T` `L` `S` `A` | Dasbor, Perangkat, Bandwidth, Topologi, Log, Pengaturan, Tentang |
| `N` | Pusat notifikasi (buka/tutup) |
| `P` | Jeda/lanjutkan simulasi |
| `R` | Segarkan data |
| `Esc` | Tutup panel aktif (atau drawer menu di ponsel) |

Aturan: pintasan **tidak** berjalan saat fokus ada di input, textarea, select, checkbox/radio/slider, elemen `contenteditable`, atau elemen ARIA sejenis (`textbox`, `combobox`, `listbox`, dst.); saat ada dialog terbuka (`<dialog open>`, `role="dialog"`/`alertdialog`, `aria-modal`); atau saat salah satu panel (pencarian, notifikasi, bantuan) terbuka. Pengecualian: `Esc`, yang menutup **satu** panel aktif. Hanya satu panel terbuka pada satu waktu. `Ctrl+K` tidak membuka pencarian bila dialog lain terbuka dan tidak mencegah shortcut browser lain (`Ctrl/Alt+huruf` lain tidak disentuh). Tombol yang ditahan tidak memicu berulang; urutan `G` kedaluwarsa setelah 1,2 detik. Tidak ada pintasan yang menghapus data.

## Riwayat: v2.2.1
- Lockfile disinkronkan (`npm ci` sebelumnya gagal karena `@playwright/test` tidak ada di `package-lock.json`); versi konsisten 2.2.1; Next.js dinaikkan ke patch 14.2.35 (14.2.15 ditandai npm memiliki kerentanan keamanan). `engines.node` diselaraskan dengan kebutuhan tes (>=22.6).
- Bug: menaikkan jumlah perangkat di Pengaturan setelah ada perangkat yang dihapus bisa menghasilkan **id dan IP ganda** (kini `growDevices` memilih id/IP bebas).
- Bug: urutan kolom IP bersifat leksikal (`.10` sebelum `.2`) dan nama peka huruf besar/kecil; kini IP numerik dan nama natural (`compareDevices`).
- Aksesibilitas: header tabel perangkat tidak dikenali sebagai `columnheader` (tanpa `scope="col"`); tabel log tidak punya header sama sekali. Keduanya diperbaiki dan diberi nama tabel.
- Dasbor: kartu "Perangkat Bermasalah (offline, simulasi)".
- Tes: +5 unit, +5 e2e regresi (`regression-v221.spec.ts`); tes versi `/about` membaca `package.json`; `shortcuts-core.mjs` dan konfigurasi Playwright mendukung `E2E_CHROMIUM_PATH`.

## Riwayat: v2.2
- Pintasan ditulis ulang (`src/lib/shortcuts-core.ts`, tanpa ketergantungan React, dapat diuji) dan `Shell` memakai satu state panel; `Esc` tidak lagi menutup beberapa panel sekaligus, termasuk bantuan.
- `togglePause` tidak lagi memakai nilai `paused` yang basi (dua tekanan `P` beruntun kini selalu dua kali toggle).
- Aksesibilitas panel: ARIA combobox/listbox di pencarian, kunci Tab dan pemulihan fokus di panel, klik-luar memakai `mousedown` (seret dari dalam ke luar tidak menutup), indikator fokus keyboard, label pada form/ikon, header tabel dapat diurutkan dengan keyboard, node topologi dapat difokuskan, drawer tertutup tidak dapat difokuskan.
- LocalStorage: entri perangkat/log/notifikasi/riwayat yang rusak dibuang satu per satu (bukan seluruh daftar); id ganda dibuang; pengaturan divalidasi per bidang. `interval` ≤ 0 sebelumnya diterima dan bisa membuat timer berputar liar; kini ditolak (rentang 1–60 dtk). Kunci penyimpanan tidak berubah (`nw2_*`), tidak ada migrasi.
- Timer toast dibersihkan; favicon ditambahkan (sebelumnya 404 di setiap halaman).

## Struktur
`src/app` (route) · `src/components/{layout,charts,dashboard,devices,logs,topology,settings,ui}` · `src/hooks` · `src/lib/shortcuts-core.ts` · `src/lib/simulation` · `src/lib/storage` · `src/lib/store.tsx` · `src/types` · `tests/{unit,browser,e2e}`.

## Troubleshooting
Data aneh: Pengaturan → Reset Semua Data. Port terpakai: `npx next dev -p 3001`. Data rusak di LocalStorage otomatis dibuang/diganti nilai awal.

## Batasan dan hal yang belum diuji
- Data hanya simulasi; riwayat dibatasi 1800 titik dan hanya terisi saat simulasi berjalan dan tab terbuka.
- Pengujian otomatis hanya di Chromium (desktop dan viewport 375 px). Firefox, Safari, dan perangkat sungguhan belum diuji.
- Tidak ada uji visual/regresi tampilan dan tidak ada audit aksesibilitas formal (WCAG); perbaikan ARIA/fokus adalah dasar, bukan klaim kepatuhan. Pembaca layar belum diuji.
- `npm audit` tidak dijalankan; Next.js 14.2.x sudah tidak menjadi cabang terbaru, pertimbangkan migrasi mayor di masa depan.
- Error boundary (`error.tsx`) belum punya tes otomatis.
- Skenario banyak tab pada origin yang sama (LocalStorage dipakai bersama) tidak dibahas.
- Tes timing (interval, pause) memakai toleransi dan dapat sensitif pada mesin yang sangat lambat.
