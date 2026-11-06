"use client";
import Modal from "@/components/ui/Modal";
import { SHORTCUTS } from "@/hooks/useShortcuts";
export default function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (<Modal onClose={onClose} label="Pintasan Keyboard"><h3 className="font-semibold mb-2">Pintasan Keyboard</h3>
    <table className="w-full text-sm"><tbody>{SHORTCUTS.map(([k, d]) => <tr key={k} className="border-t border-bd"><td className="py-1 pr-3 font-mono text-neon">{k}</td><td>{d}</td></tr>)}</tbody></table>
    <p className="text-xs text-slate-400 mt-2">Pintasan nonaktif saat mengetik di kolom isian, memilih opsi, atau saat panel terbuka (kecuali Esc). Tidak ada pintasan untuk menghapus data.</p>
    <div className="flex justify-end mt-3"><button className="btn" autoFocus onClick={onClose}>Tutup</button></div></Modal>);
}
