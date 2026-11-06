import { VERSION } from "@/lib/version";
export default function About() {
  return (
    <div className="card max-w-2xl space-y-3 text-sm">
      <h1 className="text-xl font-bold text-neon">Tentang NetWatch</h1>
      <p>NetWatch adalah dasbor pemantauan jaringan dengan dua sumber data yang dipisahkan penuh: <b>SIMULATION</b> (data simulasi untuk belajar dan demonstrasi) dan <b>LIVE</b> (pengukuran nyata, opsional: komputer ini, gateway, internet, perangkat yang ditemukan di subnet lokal, dan counter WAN router lewat UPnP bila didukung). Versi {VERSION}.</p>
      <p><b>Fitur:</b> dasbor, manajemen perangkat (CRUD), bandwidth dan riwayat trafik, topologi, log aktivitas, pusat notifikasi, pencarian global, pintasan keyboard, simulasi gangguan jaringan, alert, monitoring nyata (interface, gateway, latency, packet loss), dan pengaturan animasi/performa.</p>
      <p><b>Teknologi:</b> Next.js (App Router), React, TypeScript, Tailwind CSS, Recharts, Lucide React.</p>
      <p><b>Berjalan lokal:</b> seluruh data disimpan di LocalStorage browser Anda. Tidak ada layanan cloud, login, atau pengiriman data ke server eksternal. Lalu lintas jaringan keluar hanya terjadi bila Anda mengaktifkannya: ping ICMP ke gateway dan satu target tes internet, penemuan UPnP ke gateway, serta pemindaian subnet lokal yang Anda mulai sendiri.</p>
      <p className="text-amber-400"><b>Batasan:</b> data trafik, perangkat, IP, MAC, dan OS di dasbor, perangkat, bandwidth, topologi, dan simulasi adalah simulasi. Tidak ada login/password router, tidak ada SNMP, tidak ada trafik per perangkat, dan daftar klien DHCP router tidak tersedia (NOT SUPPORTED). Bandwidth total router hanya ditampilkan bila router menyediakannya lewat UPnP.</p>
    </div>
  );
}
