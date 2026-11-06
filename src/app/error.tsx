"use client";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (<div className="card max-w-md mx-auto mt-16 text-center"><h1 className="text-xl font-bold text-red-400">Terjadi kesalahan</h1><p className="my-2 text-slate-400">Coba muat ulang halaman ini.</p><button className="btn-p" onClick={reset}>Coba lagi</button></div>);
}
