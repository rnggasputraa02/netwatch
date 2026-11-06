# Status fitur NetWatch v5.1.1 (apa yang benar-benar terbukti berfungsi)

Legenda bukti: **A** = tes otomatis lulus pada sesi v5.1 (Linux; termasuk mock) · **B** = dilaporkan lulus pada v5.0, tidak dijalankan ulang · **W** = terbukti di Windows asli · **H** = terbukti di HG8145V5 asli.
Saat ini **W: tidak ada. H: tidak ada.** Tanda ✔ berarti "bukti yang tertera ada", bukan "terverifikasi di perangkat nyata".

| Fitur | Bukti | Catatan |
|---|---|---|
| **v5.1.1** Alert LIVE dengan histeresis (2 gagal → alert, 2 normal → pulih); insiden butuh 2 snapshot | A (unit, logika murni) | Tidak diuji di Windows/UI; ambang belum disetel dengan data nyata |
| **v5.1.1** Timestamp counter diambil di PowerShell; UI membedakan NOT AVAILABLE / menunggu / angka | A (mock) | Akurasi vs Task Manager **belum terbukti** (`docs/THROUGHPUT-TEST.md`) |
| **v5.1.1** SSDP 3 ST + timeout 3 dtk | A (unit M-SEARCH) | Efek pada HG8145V5 belum diuji |
| **v5.1.1** Header keamanan Next | — (tidak diuji; build belum dijalankan) | Perlu `npm run build` + cek header di Windows |
| Baseline Windows 11 (npm ci, build, Wi-Fi, gateway, ping, ARP discovery, watch test, alert pulih) | W (dilaporkan pengguna, v5.1.0) | Bukan dijalankan ulang untuk v5.1.1 |
| Deteksi interface, IPv4, subnet, gateway (Windows `route print`, Linux `ip route`) | A (fixture) | Pengukuran nyata Windows belum ada. Sandbox tanpa `ip` → `route_unavailable` dengan benar |
| Ping, latency (min/avg/maks), packet loss; parser Inggris & Indonesia; 100% loss ≠ "tidak tersedia" | A (fixture) | `ping.exe` nyata belum diuji |
| Throughput **komputer ini** (counter adapter; wrap 32-bit; reset/jeda >5 mnt → `—`) | A (logika) | PowerShell `Get-NetAdapterStatistics` nyata belum diuji |
| Total bandwidth **router** (UPnP WAN) terpisah dari komputer | A (mock + loopback) | HG8145V5 nyata belum diuji |
| UPnP baca-saja: allow-list `Get*`, anti-SSRF, tanpa redirect, batas ukuran | A | Aksi pengubah ditolak (diuji) |
| Status router jujur: OK / UNKNOWN / NOT_SUPPORTED / UNREACHABLE dengan alasan | A + handler API | — |
| Device Discovery pasif (ARP) dan aktif terbatas (subnet privat sendiri, maks /24, rate-limit, stop) | A (mock) | LAN nyata belum diuji; label `via` diperbaiki di v5.1 |
| Alert gateway/internet putus & pulih, STALE tidak mengubah status, cooldown anti-flapping | A | **Baru v5.1**: alert jaringan lokal terputus |
| Isolasi LIVE vs SIMULATION (alert, scope evaluasi, modul LIVE tanpa impor simulasi, `—` bukan 0) | A (logika) + B (UI) | — |
| Keamanan API: Host loopback, CSRF `X-NetWatch`, Origin, body ketat, anti-injeksi, tanpa shell | A (handler nyata) | **Baru v5.1**: server hanya bind `127.0.0.1` (belum diverifikasi di Windows) |
| Analitik, laporan, CSV, retensi 14 hari, migrasi skema, validasi LocalStorage | A (unit) | — |
| Pintasan keyboard | A (Chromium nyata, 38 tes) | — |
| UI: Dasbor, Perangkat, Bandwidth, Topologi, Log, Live, Discovery, Router, Analitik, Simulasi, Alert, Pengaturan, Notifikasi, tampilan ponsel | B | Tidak dijalankan ulang (butuh build Next) |
| Simulasi (skenario, alert simulasi, CRUD perangkat simulasi) | B | Tidak diubah di v5.1 |
| `npm run selftest` (alat verifikasi perangkat nyata) | A (sandbox) | **Baru v5.1** |

## Secara desain NOT SUPPORTED / NOT PROBED (bukan bug)
Daftar klien DHCP/Wi-Fi router (butuh login; NetWatch tidak meminta/menyimpan password) · SNMP (butuh kredensial; tidak ditebak) · trafik per perangkat (tidak ada sumber terverifikasi) · konfigurasi router (tidak pernah diubah).
