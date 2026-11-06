import type { Alert, AlertKind, AlertRule, DataSource, RuleKind, Severity } from "@/types";
export const DEFAULT_RULES: AlertRule[] = [
  { kind: "offline", enabled: true, threshold: 0 }, { kind: "latency", enabled: true, threshold: 150 },
  { kind: "loss", enabled: true, threshold: 5 }, { kind: "utilization", enabled: true, threshold: 90 }, { kind: "bandwidth", enabled: true, threshold: 80 },
];
export const RULE_RANGE: Record<RuleKind, { min: number; max: number; unit: string; label: string }> = {
  offline: { min: 0, max: 0, unit: "", label: "Perangkat/koneksi tidak merespons" }, latency: { min: 1, max: 10000, unit: "ms", label: "Latency melebihi" },
  loss: { min: 0, max: 100, unit: "%", label: "Packet loss melebihi" }, utilization: { min: 1, max: 100, unit: "%", label: "Utilisasi bandwidth melebihi" },
  bandwidth: { min: 1, max: 100000, unit: "Mbps", label: "Throughput melebihi" },
};
export function validateRuleValue(kind: RuleKind, v: number): string | null {
  const r = RULE_RANGE[kind]; if (kind === "offline") return null;
  return Number.isFinite(v) && v >= r.min && v <= r.max ? null : `Ambang ${r.label.toLowerCase()} harus ${r.min}–${r.max} ${r.unit}.`;
}
export type Sample = { source: DataSource; subjectId: string; subject: string; online: boolean | null; latencyMs: number | null; lossPct: number | null; utilPct: number | null; bwMbps?: number | null; offlineKind?: AlertKind; /** identitas pengukuran sampel ini (mis. ts pembacaan router); bila kosong dipakai tick snapshot */ tick?: number | string };
const tag = (s: DataSource) => (s === "LIVE" ? "[LIVE]" : "[SIMULASI]");
const kindOf = (r: RuleKind, s: Sample): AlertKind => (r === "offline" ? s.offlineKind ?? "offline" : r === "bandwidth" ? "bandwidth_high" : r);
function breached(kind: RuleKind, s: Sample, thr: number): boolean | null {
  if (kind === "offline") return s.online === null ? null : s.online === false;
  if (s.online === false) return false; // perangkat mati: alert lain dipulihkan, yang aktif hanya "offline"
  const v = kind === "latency" ? s.latencyMs : kind === "loss" ? s.lossPct : kind === "bandwidth" ? s.bwMbps ?? null : s.utilPct;
  return v === null ? null : v > thr;
}
export function severityOf(kind: AlertKind, s: Sample): Severity {
  if (kind === "gateway_down" || kind === "internet_down") return "critical";
  if (kind === "new_device") return "info";
  if (kind === "latency") return (s.latencyMs ?? 0) >= 500 ? "critical" : "warning";
  if (kind === "loss") return (s.lossPct ?? 0) >= 20 ? "critical" : "warning";
  if (kind === "utilization") return (s.utilPct ?? 0) >= 98 ? "critical" : "warning";
  return "warning";
}
const msg = (kind: RuleKind, s: Sample, thr: number): string => {
  const base = `${tag(s.source)} ${s.subject}`;
  if (kind === "offline") return `${base} ${s.offlineKind === "router_unreachable" ? "tidak dapat diakses" : "tidak merespons"}`;
  const v = kind === "latency" ? `${s.latencyMs?.toFixed(0)} ms` : kind === "loss" ? `${s.lossPct?.toFixed(1)}%` : kind === "bandwidth" ? `${s.bwMbps?.toFixed(1)} Mbps` : `${s.utilPct?.toFixed(0)}%`;
  const what = kind === "latency" ? "latency" : kind === "loss" ? "packet loss" : kind === "bandwidth" ? "throughput" : "utilisasi";
  return `${base}: ${what} ${v} melebihi ${thr}${RULE_RANGE[kind].unit ? " " + RULE_RANGE[kind].unit : ""}`;
};
const MAX_ALERTS = 150;
/** `samples` harus lengkap untuk `scope`: alert aktif milik subjek yang tak ada lagi di sampel otomatis dipulihkan. Nilai null = tidak diketahui = tidak mengubah status.
 *  `cooldownMs`: alert dengan kunci sama yang baru pulih tidak dibuat ulang dalam jeda ini (anti-flapping). */
/** Histeresis anti-alarm-palsu. `tick` = identitas pengukuran (mis. timestamp snapshot): evaluasi ulang pada tick yang sama TIDAK menambah hitungan.
 *  Alert baru dibuat setelah `startN` pengukuran berturut-turut melanggar; alert dipulihkan setelah `clearN` pengukuran berturut-turut normal. Nilai null (tidak diketahui) tidak mengubah hitungan. */
export type Hysteresis = { startN: number; clearN: number; tick: number | string; streaks: Record<string, { b: number; c: number; tick: number | string | null }> };
export const LIVE_HYSTERESIS = { startN: 2, clearN: 2 } as const;
export function evaluate(samples: Sample[], rules: AlertRule[], existing: Alert[], now: number, scope: DataSource, opts: { cooldownMs?: number; hysteresis?: Hysteresis } = {}) {
  const started: Alert[] = [], recovered: Alert[] = []; let list = existing.slice(); const cool = opts.cooldownMs ?? 0;
  const recover = (a: Alert) => { const r = { ...a, recoveredAt: now }; list = list.map((x) => (x === a ? r : x)); recovered.push(r); };
  const seen = new Set(samples.map((s) => `${s.source}|${s.subjectId}|`));
  for (const a of existing) if (a.source === scope && a.recoveredAt === null && a.kind !== "new_device" && !seen.has(a.key.split("|").slice(0, 2).join("|") + "|")) recover(a);
  if (opts.hysteresis) for (const k of Object.keys(opts.hysteresis.streaks)) if (!seen.has(k.split("|").slice(0, 2).join("|") + "|")) delete opts.hysteresis.streaks[k]; // subjek tak ada lagi → hitungan berturut-turut diputus
  for (const s of samples) for (const r of rules) {
    const kind = kindOf(r.kind, s); const key = `${s.source}|${s.subjectId}|${kind}`;
    const active = list.find((a) => a.key === key && a.recoveredAt === null);
    const b = r.enabled ? breached(r.kind, s, r.threshold) : false;
    const hy = opts.hysteresis; let startOk = true, clearOk = true;
    if (hy) {
      const st = (hy.streaks[key] ??= { b: 0, c: 0, tick: null });
      const tk = s.tick ?? hy.tick; if (st.tick !== tk) { if (b === true) { st.b++; st.c = 0; } else if (b === false) { st.c++; st.b = 0; } st.tick = tk; }
      startOk = st.b >= hy.startN; clearOk = st.c >= hy.clearN;
    }
    if (b === true && !active) {
      if (!startOk) continue;
      if (cool > 0 && list.some((a) => a.key === key && a.recoveredAt !== null && now - a.recoveredAt < cool)) continue;
      const a: Alert = { id: `a${now}${list.length}${started.length}`, key, source: s.source, kind, subject: s.subject, message: msg(r.kind, s, r.threshold), severity: severityOf(kind, s), startedAt: now, recoveredAt: null, ack: false }; started.push(a); list = [a, ...list];
    } else if (b === false && active && clearOk) recover(active);
  }
  const act = list.filter((a) => a.recoveredAt === null); const old = list.filter((a) => a.recoveredAt !== null).slice(0, Math.max(0, MAX_ALERTS - act.length));
  const alerts = [...act, ...old].sort((a, b) => b.startedAt - a.startedAt);
  return { alerts, started, recovered, changed: started.length > 0 || recovered.length > 0 };
}
/** Alert kejadian (mis. perangkat baru): aktif sampai diakui; tidak dievaluasi ulang. */
export function pushEvent(existing: Alert[], e: { key: string; source: DataSource; kind: AlertKind; subject: string; message: string; severity: Severity }, now: number): { alerts: Alert[]; created: Alert | null } {
  if (existing.some((a) => a.key === e.key && a.recoveredAt === null)) return { alerts: existing, created: null };
  const a: Alert = { ...e, id: `e${now}${existing.length}`, startedAt: now, recoveredAt: null, ack: false };
  return { alerts: [a, ...existing].slice(0, MAX_ALERTS), created: a };
}
