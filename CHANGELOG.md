# Changelog

- Putaran 4 (Windows): 126/128. Tes router 115 lulus. Gagal: tes 39 (snapshot API sungguhan >30 dtk saat 8 worker) dan tes 42 (balapan waktu: dijeda sebelum alert pertama tercipta). Putaran 5 (--workers=3): 127/128. Tes 39 lulus. Tes 42 gagal; penyebab terbukti dari error-context: simulasi (pickFlip, Math.random) membuat Perangkat 01 offline acak di tengah tes → alert latency kedua tidak terbentuk. Perbaikan tes: Math.random dijaga >= 0.06 agar tidak ada pembalikan acak. Kode aplikasi tidak berubah; belum diverifikasi ulang.

## 5.1.2-prep (hasil uji Windows, 2026-11-05/06)
- **Terbukti di Windows 11 (Node v24.21.0), deps Tahap 1** (`@playwright/test@1.64.1`, `postcss@8.x`; vulnerability 13 → 11): `npm ci`, typecheck, lint, `next build` (18 halaman), unit 97/97 (1 skip khusus Linux), shortcuts 38/38 lulus. **E2E: 124/128** — 4 gagal, diperbaiki di bawah (perbaikan BELUM dijalankan ulang di Windows).
- Lint: tanda kutip tak di-escape di `RealBandwidth.tsx` (kesalahan v5.1.1) diperbaiki.
- Tes unit `counters-csv` kini dilewati bagian `/proc` di non-Linux (gagal di Windows sejak v5.1.0).
- E2E: 3 tes mengharapkan alert LIVE langsung; sejak v5.1.1 alert butuh 2 pengukuran berturut-turut → tes disesuaikan (klik "Ukur sekarang" tambahan). Tes API sungguhan `live-ts`: timeout 7 dtk → 30 dtk (penyebab sebenarnya belum dikonfirmasi).
- **Perbaikan logika**: sampel router kini punya hitungan pembacaan sendiri (`Sample.tick = router.ts`), tidak ikut hitungan snapshot (sebelumnya alert router bisa muncul setelah satu pembacaan router saja).
- **Bug v5.1.1 diperbaiki (ditemukan E2E Windows)**: hitungan histeresis di-reset setiap evaluasi saat monitoring LIVE mati, sehingga alert router (router aktif, LIVE mati) tidak pernah muncul. Sekarang hitungan hanya diputus untuk subjek yang hilang dari sampel (+1 tes unit; total 100).
- E2E putaran 3 di Windows: **127/128** (typecheck, lint, build, unit 99/99 + 1 skip, shortcuts 38/38 lulus; vulnerability 11). Tes simulasi latency lulus kembali (jadi rapuh waktu, bukan regresi). Sisa 1: tes alert router — tes sendiri menonaktifkan/mengaktifkan router di antara dua pembacaan sehingga hitungan sengaja terputus; tes diubah menunggu polling kedua (belum dijalankan ulang).
- E2E putaran 2 di Windows: 125/128. Tes `skenario latency … pulih` (live-sim-v3:100) gagal sekali ("2 alert pulih" ≠ 1) padahal lulus pada putaran 1 dan memakai jalur SIMULATION yang tidak diubah → dicurigai peka-waktu (8 worker paralel); belum dikonfirmasi.
- Catatan: hitungan histeresis disimpan di memori tab; memuat ulang halaman mengulang hitungan dari nol.

## 5.1.2-prep (diperbarui) — analisis `npm audit` Windows (13 temuan)
- Data audit nyata disimpan di `docs/audit-windows-2026-11-05.json`; rencana diperbarui dengan versi perbaikan dari npm (`@playwright/test@1.64.1`, `next@16.4.5`, `eslint-config-next@16.4.5`).
- `scripts/apply-security-stage1.ps1`: Tahap 1 kompatibel, tanpa `--force` (belum dijalankan).
- `next.config.mjs`: `images.unoptimized: true` (mitigasi Image Optimizer; **bukan** perbaikan, audit tetap menandai `next`; belum diuji build).
- Dependensi dan lockfile TIDAK diubah; 13 temuan tetap.

## 5.1.2-prep — rencana keamanan dependensi (TANPA perubahan dependensi)
- Ditambah `docs/DEPENDENCY-UPGRADE-PLAN.md`: analisis 13 temuan, dampak upgrade Next.js ke major berdasarkan pemakaian nyata di source, dan prosedur bertahap + rollback. **Registry tidak terjangkau: tidak ada dependensi yang diubah, tidak ada vulnerability yang diperbaiki.** Versi aplikasi tetap 5.1.1.

## 5.1.1 — kandidat final (BELUM final; lihat docs/TEST-REPORT-v5.1.1.md)
### Akurasi monitoring & alert
- **Anti alarm palsu (hysteresis)** untuk alert LIVE: alert baru muncul setelah **2 pengukuran berturut-turut** melanggar ambang, dan dipulihkan setelah **2 pengukuran berturut-turut** normal (`LIVE_HYSTERESIS`). Penyebab packet loss 25% sesaat yang tercatat pada uji Windows: satu dari 4 ping hilang → sebelumnya langsung memicu alert `loss`. Evaluasi ulang pada snapshot yang sama tidak menambah hitungan. Nilai `null` (UNKNOWN/STALE) tidak memulihkan dan tidak mereset hitungan. SIMULATION tidak berubah.
- **Insiden/kondisi jaringan** kini dicatat hanya bila kondisi baru bertahan 2 snapshot berturut-turut (satu ping hilang tidak lagi membuat insiden `NORMAL → DEGRADED → NORMAL`).
- Perilaku yang sengaja TIDAK diubah: saat gateway mati, alert `gateway_down` dan `internet_down` muncul bersamaan (sudah diuji sejak v5.1; internet-saja-putus hanya memunculkan `internet_down`).
### Throughput komputer
- Timestamp pembacaan counter Windows kini diambil **di dalam PowerShell** (`Ts`, epoch ms) alih-alih sebelum proses PowerShell dijalankan (start PowerShell 0,3–2 dtk dan bervariasi → laju bias). Fallback: waktu selesai perintah.
- UI Bandwidth membedakan tiga keadaan: **NOT AVAILABLE** (counter gagal dibaca, dengan alasan), **menunggu dua pembacaan**, dan angka nyata. Laju persis 0 menampilkan petunjuk bahwa counter mungkin tidak diperbarui (NetWatch sendiri mengirim ping).
- Panduan uji: `docs/THROUGHPUT-TEST.md` (unduh/unggah nyata + perbandingan Task Manager).
### Router (UPnP)
- SSDP M-SEARCH kini mengirim 3 target pencarian (IGD:1, IGD:2, `upnp:rootdevice`) ke multicast dan unicast gateway, batas waktu 2 → 3 dtk. Tetap baca-saja; hanya balasan dari IP gateway yang diterima. **Tidak ada klaim kompatibilitas HG8145V5.**
### Keamanan
- Header respons: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`, CSP terbatas (`frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`), `X-Powered-By` dimatikan.
- `/api/live/snapshot` memakai `guard()` yang sama dengan endpoint lain.
- **Audit 23 vulnerability dependensi: BELUM dapat dilakukan** (butuh registry). Lihat `docs/SECURITY-AUDIT-v5.1.1.md`. `package.json` dependensi tidak diubah.
### Tes
- +7 tes unit (total 98). Tes lama disesuaikan satu asersi (perintah PowerShell kini konstanta `NETADAPTER_CMD`).
### Tidak berubah
Seluruh fitur v5.1.0 dipertahankan; tidak ada fitur besar baru; tidak ada fitur per-perangkat bandwidth.


## 5.1.0 — kandidat rilis (belum final; lihat docs/TEST-REPORT-v5.1.md)
### Keamanan
- `npm start` dan `npm run dev` kini mengikat server ke `127.0.0.1` (sebelumnya default Next.js `0.0.0.0`, sehingga perangkat LAN dapat memalsukan header `Host`).
### Perbaikan
- Alert `gateway_down` saat jaringan lokal terputus (tanpa default gateway / interface aktif), pulih otomatis; tanpa alarm palsu saat `route_unavailable`.
- Label `via` pada Device Discovery: `ping` (membalas ping, tanpa entri ARP) dibedakan dari `ping+arp`.
- Logika sampel alert LIVE diekstrak ke fungsi murni `liveAlertSamples` (perilaku sama; kini teruji unit).
- Dokumentasi: perilaku status saat kabel dicabut dikoreksi (status sumber tetap LIVE).
### Alat & tes
- `npm run selftest`: uji mandiri read-only pada perangkat nyata (interface, ping, throughput komputer, UPnP router, discovery, `--watch` untuk uji alert) → laporan JSON.
- +5 tes unit (total 91), +6 tes handler API (`tests/api/handlers.test.mts`, manual via tsx).
### Tidak berubah
Seluruh fitur v5.0 dipertahankan; tidak ada fitur besar baru.

## 5.0.0
Lihat README (bagian "Perubahan v5.0").
