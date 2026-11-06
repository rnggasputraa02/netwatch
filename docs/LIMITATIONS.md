# Keterbatasan yang masih tersisa (v5.1.1)

## Belum terverifikasi (blokir rilis final)
1. `npm ci`, typecheck penuh, lint, build produksi, dan seluruh E2E belum lulus pada v5.1 (registry npm tidak terjangkau pada sesi pengembangan).
2. Seluruh probe pada **Windows asli**: `ping.exe`, `route.exe`, `arp.exe`, PowerShell, counter adapter; perilaku Windows Firewall untuk balasan SSDP; nama adapter non-ASCII/terlokalisasi pada pencocokan counter.
3. **Huawei HG8145V5**: apakah UPnP aktif/terkunci ISP, apakah counter WAN tersedia, versi firmware. **Kompatibilitas tidak diklaim.**
4. Discovery pada LAN dengan banyak perangkat; perilaku IDS/router terhadap pemindaian aktif.
6. **Audit dependensi**: 23 temuan (16 moderate/6 high/1 critical) belum dianalisis maupun diperbaiki — lihat `docs/SECURITY-AUDIT-v5.1.1.md`.
7. **Akurasi throughput komputer** terhadap Task Manager belum terbukti (lihat `docs/THROUGHPUT-TEST.md`); baseline Windows menunjukkan 0,00 Mbps tanpa kejelasan apakah idle atau counter bermasalah.
5. Tampilan tablet/ponsel secara visual; browser selain Chromium; pembaca layar; audit aksesibilitas formal; `npm audit`.

## Batasan perilaku
- **Histeresis alert (v5.1.1)**: alert LIVE muncul/pulih setelah 2 pengukuran berturut-turut; dengan interval 10/30/60 dtk keterlambatan deteksi ≈ 20/60/120 dtk. Ini kompromi sengaja demi mengurangi alarm palsu; ambang belum disetel dengan data nyata.
- Saat gateway mati, `gateway_down` dan `internet_down` aktif bersamaan (internet tidak dapat diuji tanpa gateway); `internet_down` sendirian berarti gateway masih merespons.
- Jitter = rata-rata selisih RTT antar sampel (bukan jitter per paket); packet loss berbasis 4 ping per sampel (resolusi 25%).
- Bandwidth per perangkat: **NOT SUPPORTED**. Bandwidth router: bergantung UPnP; HG8145V5 belum terbukti.
- Jaringan lokal terputus (kabel/Wi-Fi) menghasilkan **alert + log**, tetapi kondisi tercatat `UNKNOWN` dan **tidak** masuk timeline "Insiden", karena data tidak memisahkan penyebabnya. Disengaja agar jujur.
- Pemantauan **hanya berjalan selama tab NetWatch terbuka**; tidak ada kolektor latar belakang di sisi server, dan tidak ada notifikasi di luar aplikasi.
- Jika tidak ada rute default terdeteksi, discovery memakai interface IPv4 pertama; selalu dibatasi ke subnet privat milik interface itu (maks /24). Pada komputer dengan banyak adapter (VM/VPN), periksa subnet yang ditampilkan sebelum memindai aktif.
- Pemilihan gateway memakai metrik terendah pada `route print`; konfigurasi multi-gateway tidak dikelola khusus.
- Throughput komputer memanggil PowerShell setiap pengukuran (± 1 dtk); adapter yang namanya tidak cocok menghasilkan `—`.
- Laju router memerlukan dua pembacaan counter; nilai pertama `—`. Counter 32-bit router yang wrap ditangani heuristik (hanya bila nilai sebelumnya mendekati 2³²).
- Perangkat yang memblokir ping hanya muncul bila ada di tabel ARP; entri ARP lama dapat menampilkan perangkat yang sudah tidak ada (mode pasif).
- Tidak ada: daftar klien DHCP, SNMP, trafik per perangkat, IPv6, macOS, identifikasi vendor/jenis perangkat dari MAC.
- Tidak ada autentikasi aplikasi; jangan dibuka ke LAN/internet (`-H 0.0.0.0`) atau lewat reverse proxy.
- `tests/api/handlers.test.mts` dijalankan manual dengan `tsx` (bukan dependensi proyek; menambahkannya memerlukan regenerasi `package-lock.json` dengan akses registry).
