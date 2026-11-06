# Arsitektur NetWatch v5.1.1

NetWatch adalah satu aplikasi Next.js 14 (App Router) yang berjalan di komputer pengguna. Tidak ada database server dan tidak ada layanan latar belakang: server hanya menjalankan probe saat diminta browser.

```
Browser (React, LocalStorage)  ──HTTP, hanya localhost──▶  Next.js route handlers (Node.js)  ──▶  OS / jaringan
  store.tsx / store-v5.ts            /api/live/snapshot            ping.exe, route.exe, arp.exe, PowerShell
  polling tiap N detik               /api/router/status            UDP SSDP + HTTP SOAP ke gateway (UPnP IGD)
                                     /api/discovery (GET/POST)     ARP + ping subnet sendiri
```

## Frontend (`src/app`, `src/components`, `src/hooks`)
13 halaman: Dashboard, Live, Simulation, Devices, Discovery, Router, Bandwidth, Analytics, Alerts, Logs, Topology, Settings, About. Status global ada di `src/lib/store.tsx` (simulasi, alert, konfigurasi, polling LIVE) dan `src/lib/store-v5.ts` (bandwidth komputer/router, insiden, discovery, status router). Grafik: Recharts.

## Backend / API (`src/app/api`, `src/lib/server`)
| Endpoint | Metode | Fungsi |
|---|---|---|
| `/api/live/snapshot?internet=<ip tetap>` | GET | satu snapshot: interface, gateway, ping gateway + internet, counter adapter komputer; cache 4 dtk + single-flight |
| `/api/router/status` | GET | status router via UPnP IGD baca-saja; cache 5 dtk + single-flight |
| `/api/discovery` | GET, POST | hasil/mulai/berhenti pemindaian (POST butuh `X-NetWatch: 1`) |
Semua melewati `guard()` (Host loopback; POST: header kustom + Origin). Detail di `docs/SECURITY.md`.

## Monitoring engine (`src/lib/live`, `src/lib/alerts.ts`, `src/lib/analytics.ts`)
- `snapshot.ts`: kumpulkan data (ping, gateway, counter). `parse.ts`/`neighbors.ts`: parser murni (fixture-tested).
- `status.ts`: status sumber `OFF/UNKNOWN/LIVE/STALE/DISCONNECTED`; `NOTE_TEXT`, `COUNTER_WHY` (alasan kegagalan).
- `analytics.ts`: `classifyCondition` (NORMAL/DEGRADED/GATEWAY_DOWN/INTERNET_DOWN/UNKNOWN), `computeRate`, agregasi per 10 menit, insiden.
- `alerts.ts`: `evaluate()` murni. **v5.1.1**: histeresis (2 gagal berturut-turut untuk memulai, 2 normal berturut-turut untuk memulihkan), cooldown 60 dtk, `null` = tidak diketahui = status tidak berubah.
- Jitter: `jitter()` = rata-rata selisih mutlak RTT antar sampel berurutan (bukan jitter per paket); ditampilkan di halaman Analytics. Interval polling dapat dipilih 10/30/60 dtk, sehingga dengan histeresis 2 sampel alert muncul/pulih setelah ≈20/60/120 dtk.

## Windows collector
Perintah tetap tanpa shell (`execFile`), jalur absolut `%SystemRoot%\System32\...`: `ping.exe -n 4 -w 1000 <ipv4>`, `route.exe print -4`, `arp.exe -a`, dan `powershell.exe -NoProfile -NonInteractive -Command <NETADAPTER_CMD>` (`Get-NetAdapterStatistics`, baca-saja; timestamp `Ts` diambil dalam PowerShell). Adapter aktif = interface pemilik default gateway metrik terendah. Linux: `ping`, `ip route`, `/proc/net/arp`, `/proc/net/dev`.

## Integrasi router (`upnp.ts`, `upnp-core.ts`)
SSDP M-SEARCH (3 ST) → hanya balasan dari IP gateway → ambil deskripsi XML (URL harus ke gateway, tanpa redirect, ukuran dibatasi) → SOAP hanya aksi `Get*` yang di-allow-list → status `OK/UNKNOWN/NOT_SUPPORTED/UNREACHABLE` + alasan. Tanpa kredensial, tanpa menebak endpoint.

## Penyimpanan
Tidak ada database. Riwayat disimpan di **LocalStorage browser** (`nw_*`, `nw5_*`) dengan validasi per entri, batas jumlah, retensi, dan versi skema (`nw_schema`, migrasi non-destruktif). Konsekuensi: data per browser/profil, hilang bila situs dibersihkan, dan **pemantauan hanya berjalan selama tab terbuka**.

## Aliran data LIVE vs SIMULATION
- SIMULATION: `src/lib/simulation/*` menghasilkan perangkat/trafik buatan → alert `source: "SIMULATION"` → label `[SIMULASI]`.
- LIVE: `/api/*` → `LiveSnapshot` → `store`/`store-v5` → alert `source: "LIVE"` (`[LIVE]`), riwayat `nw5_*`.
- Modul LIVE tidak mengimpor modul simulasi; `evaluate(..., scope)` hanya memulihkan alert milik scope-nya; nilai tak tersedia = `—`/sel kosong, tidak pernah 0 atau data simulasi (diuji unit; isolasi UI diuji E2E pada v5.0 — belum dijalankan ulang pada v5.1.1).
