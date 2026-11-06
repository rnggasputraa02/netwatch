# Laporan Pengujian NetWatch v5.1.0

**Vonis (jujur): v5.1.0 adalah KANDIDAT RILIS, belum layak dinyatakan rilis final.** Alasan utama ada di bagian "Vonis" di bawah. Laporan ini memisahkan empat jenis bukti dan tidak mencampurnya.

## 1. Lingkungan sesi pengujian ini
| Item | Keadaan |
|---|---|
| OS | Linux (sandbox), Node v22.22.2, npm 10.9.7 |
| Registry npm | **Tidak dapat dijangkau** (DNS gagal) dan tidak ada cache npm → paket proyek (`next`, `react`, `eslint`, `@types/*`, dll.) **tidak terpasang** |
| Windows | **Tidak tersedia** |
| Router Huawei HG8145V5 | **Tidak tersedia** |
| `ping` / `ip` di sandbox | Tidak ada → probe LIVE melaporkan `ping_unavailable` / `route_unavailable` (perilaku yang benar: tanpa angka karangan) |
| Tersedia secara global | TypeScript 6.0.3, tsx 4.21, Playwright 1.56 + Chromium |

## 2. Perintah yang diminta
| Perintah | Hasil pada sesi ini | Catatan |
|---|---|---|
| `npm ci` | **GAGAL (lingkungan)** | `npm error Exit handler never called` karena registry tidak terjangkau; `node_modules` hanya kerangka kosong. **Bukan** bukti kerusakan `package-lock.json`, tetapi juga **belum terbukti sehat**. |
| `npm run typecheck` | **TIDAK DAPAT DIJALANKAN penuh** | Tanpa `@types/react`/`next`/`node`. Dilakukan typecheck `strict` **terbatas** (TS 6.0.3) pada modul yang diubah/ditambah (`alert-samples`, `status`, `alerts`, `analytics`, `discovery`, `discovery-plan`, `parse`, `types`, tes baru): **0 error** selain 13 error yang seluruhnya akibat `@types/node` tidak terpasang. Sintaks `store.tsx` diverifikasi lewat transpile. **Typecheck penuh harus dijalankan Anda.** |
| `npm run lint` | **TIDAK DIJALANKAN** | ESLint/`eslint-config-next` tidak terpasang |
| `npm run build` | **TIDAK DIJALANKAN** | Next.js tidak terpasang. Perubahan pada `store.tsx` (satu import + satu pemanggilan fungsi) **belum pernah dikompilasi oleh Next**. |
| `npm run test:unit` | **LULUS 91/91** | 86 tes lama + 5 tes baru (`tests/unit/v51-fixes.test.ts`). Dijalankan ulang setelah semua perubahan. |
| `npm run test:shortcuts` | **LULUS 38/38** | Berjalan di Chromium sungguhan (Playwright). |
| `npm run test:e2e` | **TIDAK DIJALANKAN** | Butuh build Next. 12 berkas spec tidak diubah; **tidak ada bukti E2E untuk v5.1**. |

## 3. Pemisahan jenis bukti
### 3a. Otomatis, dijalankan pada sesi ini
- **Unit 91/91** (parser ping/route/arp/PowerShell dengan fixture Windows Inggris & Indonesia, analitik, migrasi penyimpanan, guard, perencana pemindaian, merge perangkat, klien UPnP).
- **Tes baru v5.1** (5): deteksi jaringan lokal terputus, siklus alert gateway/internet (mulai → STALE tidak memulihkan → pulih), isolasi alert LIVE vs SIMULATION, label `via` discovery. **Uji mutasi dilakukan**: membatalkan tiap perbaikan membuat tes terkait GAGAL (terbukti tes menangkap bug).
- **Tes handler API (6)** `tests/api/handlers.test.mts` (dijalankan dengan tsx, kode route sungguhan): semua GET menolak Host LAN/rebinding (`192.168.x.x`, `evil.com`, `localhost.evil.com`, tanpa Host) → 403; target internet berisi injeksi (`1.1.1.1;calc`, `$(id)`, `%0a`) → 400; POST discovery tanpa `X-NetWatch` / Origin asing / Origin rusak / JSON rusak / field berlebih (`subnet`, `targets`) / aksi tak dikenal → 403/400; start sah → 202 dan start ulang cepat ditolak; respons router tidak pernah berisi angka WAN bila bukan `OK`.
- **Shortcut 38/38** di Chromium sungguhan.

### 3b. Mock (logika benar terhadap keluaran yang ditulis, BUKAN pengukuran nyata)
Seluruh keluaran `ping.exe`, `route.exe`, `arp.exe`, `powershell.exe` pada tes unit adalah teks fixture. Respons router adalah mock; ada satu integrasi **loopback** (server UDP+HTTP palsu), **bukan** router asli.

### 3c. Perangkat nyata
| Target | Status |
|---|---|
| **Windows asli** | **TIDAK ADA BUKTI.** Satu-satunya pengukuran nyata adalah di sandbox Linux: tanpa `ping`/`ip`, hasilnya `NOT_AVAILABLE` dengan alasan (itu bukti penanganan kegagalan, bukan bukti pengukuran). |
| **Huawei HG8145V5** | **TIDAK ADA BUKTI.** Kompatibilitas **tidak diklaim**. |
| Jaringan lokal dengan banyak perangkat | Tidak diuji. Discovery menolak antarmuka sandbox (`192.0.2.2`, bukan subnet privat) dengan alasan `not_private_subnet` — sesuai desain. |

### 3d. Dilaporkan lulus pada v5.0, TIDAK dijalankan ulang untuk v5.1
Dokumen v5.0 menyebut typecheck, lint, build produksi, dan 12 spec E2E lulus pada lingkungan pengembangan sebelumnya. **Itu bukan bukti untuk v5.1**: kode berubah dan tidak dibangun ulang di sini.

## 4. Temuan dan perbaikan (v5.0 → v5.1)
| # | Temuan | Dampak | Perbaikan | Bukti |
|---|---|---|---|---|
| F1 | **Keamanan**: `npm start`/`npm run dev` mendengarkan `0.0.0.0` (default Next 14), padahal model ancaman menyatakan hanya localhost. Pemeriksaan header `Host` hanya menahan DNS rebinding di browser; perangkat lain di LAN dapat memalsukan `Host: localhost` dengan `curl` lalu memanggil `/api/*` (memulai pemindaian, membaca status router). E2E memakai `-H 127.0.0.1` sehingga tidak menangkap ini. | Tinggi (bagi pengguna di jaringan bersama) | Skrip `dev` dan `start` kini `-H 127.0.0.1` | Perubahan konfigurasi; **perlu diverifikasi pada Windows** (`netstat -an \| findstr :3000` harus menunjukkan `127.0.0.1:3000`, bukan `0.0.0.0`) |
| F2 | **Akurasi alert**: kabel/Wi-Fi terlepas → tidak ada default gateway → kondisi `UNKNOWN`, tidak ada alert gateway; hanya `internet_down` yang muncul, sehingga penyebab lokal tersamar. | Sedang | `localLinkLost()` + `liveAlertSamples()`: alert `gateway_down` "Jaringan lokal (default gateway tidak ada)" hanya bila `gateway_not_found`/`no_active_interface`; **tidak** bila `route_unavailable` (penyebab tak diketahui → tidak ada alarm palsu). Pulih otomatis saat gateway kembali. | 3 tes baru + uji mutasi |
| F3 | Discovery memberi label `via: "ping+arp"` pada host yang membalas ping tetapi tidak ada di ARP (tanpa MAC) | Rendah (label data) | Label baru `"ping"` | tes baru + uji mutasi |
| F4 | Dokumen v5.0 menyatakan cabut kabel → status `STALE/DISCONNECTED`. Kenyataannya status sumber tetap `LIVE` (server lokal masih menjawab); yang berubah adalah kondisi dan alert. | Dokumentasi | README/dokumen dikoreksi | — |
| T1 | Tidak ada cara memverifikasi di mesin nyata tanpa menjalankan seluruh aplikasi | Pengujian | `npm run selftest` (read-only; memakai kode produksi yang sama) | dijalankan di sandbox: semua `NOT_AVAILABLE` dengan alasan, tanpa angka karangan |

Perilaku yang **sengaja tidak diubah**: `classifyCondition` tetap mengembalikan `UNKNOWN` bila gateway tak terukur dan internet 100% loss (penyebab memang tak dapat dipisahkan dari data itu); jaringan lokal terputus tidak masuk timeline "Insiden" (hanya alert + log). Lihat `docs/LIMITATIONS.md`.

## 5. Vonis
**Belum layak menjadi rilis final.** Yang menghalangi:
1. `typecheck`, `lint`, `build`, dan seluruh E2E **belum lulus pada v5.1** (tidak dapat dijalankan di sini). Ada kode TSX yang berubah dan belum dikompilasi Next.
2. **Nol bukti Windows asli** untuk monitoring LIVE: ping, route, arp, PowerShell, counter adapter.
3. **Nol bukti HG8145V5 asli**: UPnP, counter WAN, firmware.
4. Perbaikan keamanan F1 belum diverifikasi di Windows.

**Kriteria untuk menaikkan menjadi final** (semuanya di mesin Anda): `npm ci && npm run typecheck && npm run lint && npm run build && npm test` hijau; `npm run selftest -- --router --discovery passive --watch 90` pada Windows menghasilkan laporan yang sesuai dengan `ipconfig`/`ping`/Task Manager; alert gateway/internet terbukti muncul dan pulih saat kabel dicabut/dicolok; status UPnP HG8145V5 dicatat apa adanya (OK / UNKNOWN / NOT_SUPPORTED). Panduan: `docs/WINDOWS-VERIFICATION.md`.
