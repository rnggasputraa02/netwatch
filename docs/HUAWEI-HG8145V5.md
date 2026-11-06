# Panduan integrasi Huawei HG8145V5

Status (v5.1): **dirancang dan diuji dengan mock dan server UPnP palsu di loopback; belum diverifikasi pada perangkat HG8145V5 sungguhan — kompatibilitas TIDAK diklaim.** Dukungan nyata bergantung firmware dan konfigurasi dari ISP Anda; NetWatch tidak mengasumsikan fitur apa pun aktif.

## Hasil audit kemampuan (apa yang bisa dan tidak bisa dilakukan)

| Kemampuan | Metode | Status di NetWatch | Alasan |
|---|---|---|---|
| Informasi perangkat (merek/model) | UPnP IGD (deskripsi XML dari balasan SSDP router) | Diimplementasikan, baca-saja | Standar terbuka; tanpa kredensial. Model hanya "terkonfirmasi HG8145V5" bila router sendiri melaporkannya. |
| Counter trafik WAN (total router) | UPnP `WANCommonInterfaceConfig` (`GetTotalBytesReceived/Sent`, `GetCommonLinkProperties`) | Diimplementasikan, baca-saja | Hanya bila UPnP aktif dan layanan itu ada. Bila tidak: UNKNOWN / NOT SUPPORTED. |
| Status koneksi WAN, uptime, IP eksternal | UPnP `WANIPConnection` / `WANPPPConnection` (`GetStatusInfo`, `GetExternalIPAddress`) | Diimplementasikan, baca-saja | Sama seperti di atas. |
| Daftar klien DHCP / perangkat Wi-Fi | Antarmuka web router (butuh login) | **NOT SUPPORTED** | Tidak ada protokol resmi tanpa kredensial; NetWatch tidak meminta, menyimpan, atau menebak password router, dan tidak menyalin endpoint web yang tidak terdokumentasi. Alternatif: halaman *Perangkat Terdeteksi* (ARP lokal). |
| SNMP | SNMP v2c/v3 | **NOT PROBED / belum diimplementasikan** | Butuh community/kredensial dari Anda; mencoba "public" berarti menebak kredensial. Pada perangkat ISP, SNMP sering dikelola ISP, bukan pengguna. |
| Trafik per perangkat | tidak ada sumber terverifikasi | **NOT SUPPORTED** | UPnP IGD tidak menyediakannya; komputer ini tidak dapat mengukur trafik perangkat lain. |
| Konfigurasi router | – | **Tidak pernah dilakukan** | Hanya aksi `Get*` yang ada di allow-list kode; aksi pengubah (mis. `AddPortMapping`) ditolak dan diuji. |

## Hasil nyata yang ada (v5.1.0, Windows 11)
Hasil uji pengguna pada router nyata: **`UNKNOWN: upnp_no_response`** — router tidak menjawab SSDP dalam batas waktu. Ini **bukan** bukti HG8145V5 tidak mendukung UPnP (UPnP bisa nonaktif/dikunci ISP, atau firmware hanya menjawab ST tertentu, atau firewall menahan balasan) dan **bukan** bukti dukungan. v5.1.1 menambah ST pencarian (IGD:1, IGD:2, rootdevice) dan timeout 3 dtk; efeknya belum diuji. Status yang benar untuk saat ini: **UNKNOWN**, kompatibilitas **tidak diklaim**. Bukti lebih lanjut: `npm run selftest -- --router` dan tangkapan paket (Wireshark, filter `udp.port==1900`) pada Windows.

## Langkah penggunaan
1. Komputer terhubung ke jaringan router. Buka NetWatch lewat `http://localhost:3000`.
2. Menu **Router** → centang *Aktifkan integrasi router (UPnP, baca-saja)*.
3. NetWatch mengirim penemuan UPnP (SSDP) ke jaringan lokal dan ke gateway (port 1900). Hanya balasan dari IP gateway yang diterima. Alamat kontrol hanya diambil dari balasan itu dan harus menunjuk ke gateway sendiri.
4. Hasil:
   - **OK**: counter WAN terbaca; laju dihitung dari dua pembacaan berurutan (penanganan wrap 32-bit dan reset counter). Muncul di *Bandwidth → Total throughput router*.
   - **UNKNOWN (`upnp_no_response`)**: router tidak menjawab. UPnP mungkin nonaktif atau tidak didukung; NetWatch tidak dapat membedakannya.
   - **NOT SUPPORTED**: router menjawab tetapi tidak menyediakan counter WAN / menolak aksi.
   - **UNREACHABLE**: router terdeteksi tetapi pembacaan gagal (timeout/galat jaringan); membuat alert "Router tidak dapat diakses".

## Bila hasilnya UNKNOWN: mengaktifkan UPnP (keputusan Anda)
Letak dan nama menu UPnP berbeda antar firmware dan ISP, serta sering dikunci ISP; periksa dokumentasi ISP/Huawei untuk unit Anda. NetWatch **tidak** mengubah pengaturan router.

**Risiko UPnP:** aplikasi mana pun di LAN dapat meminta router membuka port ke internet secara otomatis, dan UPnP pernah menjadi sasaran serangan. Aktifkan hanya bila Anda memahami risikonya, dan matikan lagi bila tidak diperlukan. NetWatch hanya membaca counter dan tidak pernah membuka port.

## Windows Firewall
Balasan SSDP berupa UDP masuk. Windows dapat menampilkan dialog izin untuk Node.js: izinkan hanya pada **jaringan privat**. Bila ditolak, hasil biasanya UNKNOWN (`upnp_no_response`).

## Verifikasi manual yang perlu dilakukan di Windows dengan HG8145V5
Cara tercepat (read-only, tanpa mengubah router): `npm run selftest -- --router` — lihat `docs/WINDOWS-VERIFICATION.md` bagian E untuk membaca hasilnya. Hasil `UNKNOWN`/`NOT_SUPPORTED` adalah hasil yang sah dan dicatat apa adanya.
- [ ] Router menjawab penemuan UPnP (status OK atau UNKNOWN yang konsisten dengan pengaturan router).
- [ ] Model yang dilaporkan sesuai; teks "Terkonfirmasi sebagai Huawei HG8145V5" muncul hanya bila memang demikian.
- [ ] Counter WAN naik saat Anda mengunduh berkas; laju kira-kira sesuai dengan halaman status router.
- [ ] Tidak ada perubahan konfigurasi router setelah NetWatch dijalankan (periksa daftar pemetaan port).
