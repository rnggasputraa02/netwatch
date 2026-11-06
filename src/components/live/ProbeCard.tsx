import type { ProbeResult } from "@/types";
import { NOTE_TEXT } from "@/lib/live/status";
import { fmtNum } from "@/lib/format";
export default function ProbeCard({ title, host, probe, absent }: { title: string; host: string | null; probe: ProbeResult | null; absent?: string }) {
  return (
    <div className="card" data-testid={`probe-${title.toLowerCase()}`}>
      <h3 className="text-xs uppercase text-slate-400">{title}</h3>
      <div className="font-mono text-sm mb-2">{host ?? "—"}</div>
      {!probe ? <p className="text-sm text-slate-400">{absent ?? "Tidak diukur."}</p> : probe.error ? <p className="text-sm text-amber-400">Tidak tersedia: {NOTE_TEXT[probe.error] ?? probe.error}</p> : (
        <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-slate-400">RTT rata-rata</dt><dd data-testid="rtt-avg">{fmtNum(probe.rttAvgMs, "ms")}</dd>
          <dt className="text-slate-400">RTT min / maks</dt><dd>{fmtNum(probe.rttMinMs, "ms")} / {fmtNum(probe.rttMaxMs, "ms")}</dd>
          <dt className="text-slate-400">Packet loss</dt><dd data-testid="loss">{fmtNum(probe.lossPct, "%")}</dd>
          <dt className="text-slate-400">Paket</dt><dd>{probe.received}/{probe.sent} diterima</dd>
        </dl>)}
    </div>
  );
}
