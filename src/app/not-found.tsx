import Link from "next/link";
export default function NotFound() {
  return (<div className="card max-w-md mx-auto mt-16 text-center"><h1 className="text-4xl font-bold text-neon">404</h1><p className="my-2 text-slate-400">Halaman tidak ditemukan.</p><Link href="/dashboard" className="btn-p inline-block">Kembali ke Dasbor</Link></div>);
}
