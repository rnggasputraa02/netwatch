# Verifikasi di Windows dan HG8145V5 (dijalankan oleh Anda)

Tujuan: mengubah item "belum diverifikasi" menjadi bukti nyata. Semua langkah **read-only**: tidak mengubah konfigurasi router maupun sistem. Pemindaian aktif dan kueri router hanya berjalan bila Anda memintanya dengan opsi.

## A. Pemeriksaan build (sekali)
```powershell
npm ci
npm run typecheck
npm run lint
npm run build
npm test            # unit + shortcuts + E2E (butuh: npm run test:e2e:install)
```
Catat hasilnya. Ini yang belum dapat dijalankan pada sesi pengembangan v5.1.

## B. Pastikan server hanya di localhost (perbaikan F1)
```powershell
npm start
netstat -an | findstr :3000
```
Harus tampil `127.0.0.1:3000 ... LISTENING`. Bila `0.0.0.0:3000`, hentikan dan laporkan.

## C. Uji mandiri otomatis
```powershell
npm run selftest -- --router --discovery passive --redact --out hasil-windows.json
```
Skrip menampilkan interface, IPv4, subnet, gateway, ping (loss, RTT min/avg/maks) ke gateway dan tiga target internet, throughput **komputer ini** (2 pembacaan, 5 dtk), lalu (`--router`) status UPnP dan laju WAN **total router** secara terpisah. Item yang tidak dapat diukur ditulis `NOT_AVAILABLE` beserta alasannya; tidak ada angka pengganti.

Bandingkan manual:
| Keluaran selftest | Bandingkan dengan |
|---|---|
| interface/IPv4/mask/gateway | `ipconfig /all` |
| loss & RTT | `ping <gateway>` dan `ping 1.1.1.1` |
| throughput komputer | Task Manager → Performance → Ethernet/Wi-Fi (saat mengunduh berkas besar) |
| status/WAN router | halaman status router di browser (angka kasar saja; router dapat membulatkan) |

## D. Uji alert putus/pulih (jaringan lokal dan gateway)
```powershell
npm run selftest -- --watch 120
```
Selama 120 dtk: **cabut kabel LAN (atau matikan Wi-Fi) ± 20 dtk, lalu colok kembali.** Hasil yang diharapkan:
1. Saat terputus: kondisi menjadi `UNKNOWN (jaringan lokal terputus: ...)`, muncul `ALERT critical [LIVE] Jaringan lokal (default gateway tidak ada) tidak merespons` dan `... Internet (1.1.1.1) tidak merespons`.
2. Setelah dicolok: `PULIH` untuk keduanya. (Dengan cooldown 60 dtk di aplikasi, alert yang sama tidak dibuat ulang terlalu cepat.)
3. Untuk kasus **gateway masih punya IP tetapi tidak membalas**, atau **hanya internet putus** (mis. cabut kabel WAN/ONT di sisi router), amati kondisi `GATEWAY_DOWN` / `INTERNET_DOWN`.

Di aplikasi (Monitoring Nyata aktif) status sumber tetap `LIVE` selama server NetWatch lokal menjawab; `STALE`/`DISCONNECTED` hanya muncul bila server lokal tidak terjangkau.

## E. Huawei HG8145V5
Jalankan `npm run selftest -- --router` dan catat `state`:
| Hasil | Arti | Tindakan |
|---|---|---|
| `OK` + perangkat melapor HG8145V5 | UPnP aktif dan counter WAN terbaca | Bandingkan laju WAN saat mengunduh dengan halaman status router |
| `UNKNOWN upnp_no_response` | Router tidak menjawab SSDP (UPnP nonaktif, dikunci ISP, atau firewall Windows memblokir balasan UDP) | Periksa dialog Windows Firewall (izinkan Node.js di jaringan **privat**). Mengaktifkan UPnP di router adalah **keputusan Anda**; baca risikonya di `docs/HUAWEI-HG8145V5.md` |
| `NOT_SUPPORTED no_wan_counters` / `counters_rejected` | Router menjawab tetapi tidak menyediakan counter WAN | Fitur tidak didukung firmware ini; catat apa adanya |
| `UNREACHABLE` | Router terdeteksi tetapi pembacaan gagal | Ulangi; bila konsisten, catat |

Kompatibilitas HG8145V5 baru boleh dinyatakan setelah hasil `OK` terbukti **dan** laju WAN cocok dengan halaman status router.

## F. Discovery
`npm run selftest -- --discovery passive` lalu bandingkan dengan `arp -a`. Gunakan `--discovery active` hanya di jaringan milik Anda (1 ping per alamat, maks 254 alamat, subnet privat sendiri).

## Berbagi hasil
Berkas JSON memuat IP/MAC lokal. Gunakan `--redact` dan periksa isinya sebelum dibagikan.

## Baseline Windows yang sudah dilaporkan (v5.1.0, Windows 11, Node v24.21.0)
`npm ci` OK · build produksi OK · Wi-Fi 192.168.100.10/24, gateway 192.168.100.1 · ping gateway 4/4 · ping 1.1.1.1/8.8.8.8/9.9.9.9 OK · discovery pasif menemukan gateway via ARP · watch test: gateway hilang + internet putus terdeteksi, alert pulih otomatis · UPnP `UNKNOWN: upnp_no_response` · throughput komputer 0,00 Mbps (belum dijelaskan) · `npm ci`: 23 vulnerability.
Untuk v5.1.1 ulangi A–E, lalu `docs/THROUGHPUT-TEST.md` dan audit dependensi (`docs/SECURITY-AUDIT-v5.1.1.md`).
