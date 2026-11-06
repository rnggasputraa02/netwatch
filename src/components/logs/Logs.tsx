"use client";
import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import type { LogEntry } from "@/types";
import { usePagination } from "@/hooks/usePagination";
import { useApp } from "@/lib/store";
import Modal from "@/components/ui/Modal";
import Pagination from "@/components/ui/Pagination";
const ic = { size: 16, strokeWidth: 2 };
export default function Logs() {
  const { logs, setLogs, notify, focus, setFocus } = useApp();
  const [q, setQ] = useState(""); const [type, setType] = useState("all"); const [pr, setPr] = useState("all"); const [date, setDate] = useState("");
  const [ask, setAsk] = useState<"all" | LogEntry | null>(null);
  useEffect(() => { if (focus?.kind === "log") { setQ(focus.value); setFocus(null); } }, [focus, setFocus]);
  const rows = logs.filter((l) => (type === "all" || l.type === type) && (pr === "all" || l.pr === pr) && (!date || new Date(l.t).toLocaleDateString("sv-SE") === date) && `${l.name}${l.desc}`.toLowerCase().includes(q.toLowerCase()));
  const pg = usePagination(rows, `${q}|${type}|${pr}|${date}`);
  function exportCsv() {
    try {
      const esc = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
      const csv = "\ufeff" + ["Waktu,Jenis,Perangkat,Deskripsi,Prioritas,Sumber", ...rows.map((l) => [new Date(l.t).toLocaleString("id-ID"), l.type, l.name, l.desc, l.pr, l.src ?? "SIMULATION"].map(esc).join(","))].join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "log-netwatch.csv"; a.click(); notify("Log berhasil diekspor");
    } catch { notify("Ekspor gagal", false); }
  }
  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-3">
        <input aria-label="Cari log" className="inp !w-44" placeholder="Cari log…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Jenis" className="inp !w-auto" value={type} onChange={(e) => setType(e.target.value)}><option value="all">Semua jenis</option><option>Sistem</option><option>Perangkat</option><option>Jaringan</option></select>
        <select aria-label="Prioritas" className="inp !w-auto" value={pr} onChange={(e) => setPr(e.target.value)}><option value="all">Semua prioritas</option><option>Rendah</option><option>Sedang</option><option>Tinggi</option></select>
        <input aria-label="Tanggal" type="date" className="inp !w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn flex items-center gap-1" onClick={exportCsv}><Download {...ic} />Ekspor CSV</button>
        <button className="btn text-red-400" onClick={() => setAsk("all")}>Bersihkan Semua</button>
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <p className="text-center text-slate-400 p-6">Belum ada log aktivitas.</p> : (
          <table aria-label="Log aktivitas simulasi" className="w-full text-sm whitespace-nowrap"><thead><tr>{["Waktu", "Jenis", "Perangkat", "Deskripsi", "Prioritas", "Sumber"].map((h) => <th key={h} scope="col" className="text-left p-2 text-slate-400 font-medium">{h}</th>)}<th scope="col" className="text-left p-2 text-slate-400 font-medium">Aksi</th></tr></thead><tbody>{pg.items.map((l) => (
            <tr key={l.id} className="border-b border-bd"><td className="p-2">{new Date(l.t).toLocaleString("id-ID")}</td><td className="p-2">{l.type}</td><td className="p-2">{l.name}</td><td className="p-2">{l.desc}</td><td className="p-2">{l.pr}</td><td className="p-2">{l.src ?? "SIMULATION"}</td>
              <td className="p-2"><button className="btn text-red-400" title="Hapus" aria-label="Hapus log" onClick={() => setAsk(l)}><Trash2 {...ic} /></button></td></tr>))}</tbody></table>)}
        <Pagination total={rows.length} page={pg.page} size={pg.size} onPage={pg.setPage} onSize={pg.setSize} />
      </div>
      {ask && (<Modal label="Konfirmasi hapus log" onClose={() => setAsk(null)}><h3 className="font-semibold mb-3">{ask === "all" ? "Bersihkan semua log?" : "Hapus log ini?"}</h3>
        <div className="flex justify-end gap-2"><button className="btn" onClick={() => setAsk(null)}>Batal</button><button className="btn-p" onClick={() => { setLogs(ask === "all" ? [] : logs.filter((l) => l.id !== ask.id)); notify("Log dihapus"); setAsk(null); }}>Ya</button></div></Modal>)}
    </div>
  );
}
