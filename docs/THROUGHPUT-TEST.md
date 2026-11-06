# Panduan uji throughput (Windows)

Tiga metrik **berbeda** dan tidak boleh disamakan:
1. **Throughput komputer ini** — byte adapter aktif komputer (`Get-NetAdapterStatistics`). Tersedia.
2. **Total throughput router** — counter WAN via UPnP IGD. Tersedia **hanya bila router menjawab UPnP** (HG8145V5: belum terbukti; hasil uji Windows: `UNKNOWN: upnp_no_response`).
3. **Throughput per perangkat** — **NOT SUPPORTED** (tidak ada sumber data terverifikasi).

## Cara membaca hasil di kartu "1. Throughput koneksi komputer ini"
| Tampilan | Arti |
|---|---|
| `NOT AVAILABLE` + alasan | pembacaan counter gagal (PowerShell hilang/timeout, adapter tidak cocok). Bukan "tidak ada transfer". |
| "Menunggu dua pembacaan counter…" | laju butuh dua titik; normal pada 1 sampel pertama atau setelah jeda >5 menit. |
| `↓ 0.0 Kbps · ↑ 0.0 Kbps` + petunjuk kuning | tidak ada byte berubah. NetWatch mengirim ping tiap interval, jadi 0 persis patut dicurigai (counter tidak diperbarui) — lakukan uji di bawah. |
| angka kecil (mis. 2–20 Kbps) saat idle | normal: ping + lalu lintas latar belakang. |

## Prosedur uji (±10 menit)
1. Jalankan NetWatch, aktifkan **Monitoring Nyata**, buka halaman **Bandwidth**; interval polling terkecil yang tersedia adalah 10 dtk, jadi bandingkan pada unduhan yang stabil ≥ 1 menit (bukan lonjakan singkat).
2. Buka **Task Manager → Performance → Wi-Fi/Ethernet** (adapter yang sama dengan `Interface aktif` di halaman Live). Catat Send/Receive.
3. **Idle 1 menit**: catat kedua angka.
4. **Unduh nyata**: unduh berkas besar (≥500 MB) dari server cepat. Catat angka Task Manager dan NetWatch (↓) beberapa kali selama unduhan.
5. **Unggah nyata**: unggah berkas besar ke layanan cloud. Bandingkan ↑.
6. (Opsional) `Get-NetAdapterStatistics -Name "Wi-Fi"` dua kali berjarak 10 dtk; laju = Δbyte × 8 / Δdetik.
7. Kriteria lulus yang disarankan: selisih NetWatch vs Task Manager ≤ ±15% pada unduhan stabil (Task Manager menampilkan Mbps pembulatan dan jendela waktu berbeda), dan ↓ jelas naik saat unduh / ↑ saat unggah.
8. Uji kegagalan: nonaktifkan adapter lain/VPN, atau jalankan di PC tanpa PowerShell → harus muncul `NOT AVAILABLE`, bukan 0.

Catat hasil di `docs/WINDOWS-VERIFICATION.md` (bagian hasil). **Sampai tabel ini diisi dengan data nyata, akurasi throughput belum terbukti.**
Catatan: baseline Windows 11 sebelumnya melaporkan 0,00 Mbps; penyebab (idle sungguhan vs counter) tidak dapat dipastikan dari data tersebut. v5.1.1 memperbaiki bias timestamp dan memperjelas tampilan, tetapi belum terbukti memperbaiki kasus itu.
