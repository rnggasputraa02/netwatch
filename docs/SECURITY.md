# Keamanan NetWatch v5.1.1

> Ringkasan perubahan v5.1.1 dan status audit dependensi: [`SECURITY-AUDIT-v5.1.1.md`](SECURITY-AUDIT-v5.1.1.md). Baru: header keamanan (X-Frame-Options, CSP framing, nosniff, Referrer-Policy, CORP) dan `guard()` pada `/api/live/snapshot`. Audit `npm audit` (23 temuan) **belum dapat dijalankan** dan belum dianalisis.

## Model ancaman
NetWatch dijalankan oleh satu pengguna di komputernya sendiri. Server Next.js dapat menjalankan probe jaringan lokal; karena itu server **hanya boleh dijangkau dari localhost**. NetWatch tidak memiliki login.

## Kontrol yang diterapkan
| Risiko | Kontrol | Diuji oleh |
|---|---|---|
| Akses dari LAN/internet | **(v5.1)** `npm start` dan `npm run dev` mengikat server ke `127.0.0.1` (`-H 127.0.0.1`). Sebelumnya default Next.js 14 adalah `0.0.0.0`: penyerang di LAN dapat memalsukan `Host: localhost` dengan `curl`, sehingga cek Host saja **tidak cukup** | konfigurasi; verifikasi manual `netstat -an \| findstr :3000` di Windows (belum dilakukan) |
| DNS rebinding (browser) | Semua endpoint `/api/*` menolak `Host` selain `localhost`, `127.0.0.1`, `[::1]` (403) | unit `guard`, tes handler API v5.1, E2E v5.0 (Host palsu) |
| CSRF pada endpoint yang mengubah state (`POST /api/discovery`) | Wajib header `X-NetWatch: 1` (memicu preflight CORS); `Origin` bila ada harus sama dengan `Host` | unit `guard`, E2E |
| Injeksi perintah | `execFile` tanpa shell; perintah/argumen dibuat kode; nilai variabel hanya IPv4 yang lolos regex ketat; target internet hanya dari daftar tetap; di Windows jalur absolut `%SystemRoot%\System32\...`; perintah PowerShell berupa string tetap tanpa variabel | unit parser/snapshot, E2E (`1.1.1.1;calc` → 400) |
| Pemindaian di luar jaringan lokal / terlalu agresif | Hanya subnet privat milik interface sendiri, maks /24 (254 alamat), 8 paralel, jeda antar paket, 1 ping per alamat, satu pekerjaan sekaligus, jeda minimum antar pemindaian, tombol Berhenti; tanpa pemindaian port | unit `planTargets`, `DiscoveryJob` |
| SSRF lewat deskripsi UPnP | URL kontrol harus `http` ke IP gateway sendiri; balasan SSDP dari host lain diabaikan; tanpa redirect; ukuran respons dibatasi | unit `resolveUrl`, integrasi loopback |
| Mengubah konfigurasi router | Allow-list aksi UPnP hanya `Get*` pada layanan WAN tertentu; `AddPortMapping`, `DeletePortMapping`, dll. ditolak | unit `actionAllowed`, `queryRouter` |
| Kredensial bocor | Tidak ada kredensial router yang diminta/disimpan; tidak ada secret di source, LocalStorage, log, atau ZIP | pemindaian ZIP |
| Data simulasi dianggap nyata | Badge sumber di seluruh UI/alert/CSV; LIVE tidak pernah diisi data simulasi; nilai tak tersedia = `—`/sel kosong | E2E isolasi data |
| Satu sumber rusak menjatuhkan aplikasi | Setiap sumber (snapshot, router, discovery) dipolling terpisah dengan timeout dan penanganan galat; data LocalStorage rusak dibuang per entri | E2E (DISCONNECTED, data rusak) |
| Skema data berubah | `nw_schema` + migrasi non-destruktif; versi lebih baru tidak disentuh | unit + E2E migrasi |

## Privasi
- Pencarian hostname memakai reverse DNS ke resolver jaringan Anda (dapat dimatikan di halaman Perangkat Terdeteksi).
- IP eksternal router (bila UPnP menyediakannya) hanya ditampilkan di layar lokal.
- Seluruh riwayat tersimpan di LocalStorage browser ini; tidak ada pengiriman ke server eksternal. Target tes internet (1.1.1.1/8.8.8.8/9.9.9.9) menerima ping ICMP hanya saat Monitoring Nyata aktif.

## Batasan yang diketahui
- Tanpa autentikasi: jangan membuka server ke LAN (`-H 0.0.0.0`) atau lewat reverse proxy publik. Cek Host adalah pertahanan terhadap browser, **bukan** terhadap klien LAN yang memalsukan header; pertahanan utamanya adalah bind `127.0.0.1`.
- Bila Anda menjalankan `next start` langsung tanpa `-H 127.0.0.1`, server kembali mendengarkan semua antarmuka.
- Pemeriksaan keamanan ini adalah tes otomatis dan tinjauan kode; bukan audit keamanan independen atau uji penetrasi. Tes handler API v5.1 (`tests/api/handlers.test.mts`) memeriksa guard dan validasi input pada kode route sungguhan, tetapi tidak menguji server HTTP/Windows.
