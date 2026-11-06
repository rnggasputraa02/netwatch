import type { Device, Scenario, ScenarioKind } from "@/types";
export const DURATION = { min: 5, max: 3600 };
export const SCENARIO_LIMITS: Record<ScenarioKind, { min: number; max: number; def: number; unit: string; label: string }> = {
  outage: { min: 0, max: 0, def: 0, unit: "", label: "Perangkat mati (offline)" },
  latency: { min: 10, max: 2000, def: 300, unit: "ms", label: "Latency tinggi" },
  loss: { min: 1, max: 100, def: 20, unit: "%", label: "Packet loss" },
  congestion: { min: 1, max: 1000, def: 5, unit: "Mbps", label: "Pembatasan bandwidth (kongesti)" },
};
export const MAX_ACTIVE = 5;
export type Created = { ok: true; scenario: Scenario } | { ok: false; error: string };
export function createScenario(i: { kind: ScenarioKind; deviceId: string; deviceName: string; durationSec: number; value: number }, id: string, now: number, list: Scenario[]): Created {
  const L = SCENARIO_LIMITS[i.kind];
  if (!L) return { ok: false, error: "Jenis skenario tidak valid." };
  if (!i.deviceId) return { ok: false, error: "Pilih perangkat target." };
  if (!Number.isFinite(i.durationSec) || i.durationSec < DURATION.min || i.durationSec > DURATION.max) return { ok: false, error: `Durasi harus ${DURATION.min}–${DURATION.max} detik.` };
  if (i.kind !== "outage" && (!Number.isFinite(i.value) || i.value < L.min || i.value > L.max)) return { ok: false, error: `Nilai harus ${L.min}–${L.max} ${L.unit}.` };
  const active = list.filter((s) => s.status === "running" || s.status === "paused");
  if (active.length >= MAX_ACTIVE) return { ok: false, error: `Maksimal ${MAX_ACTIVE} skenario aktif.` };
  if (active.some((s) => s.deviceId === i.deviceId && s.kind === i.kind)) return { ok: false, error: "Skenario sejenis untuk perangkat ini sudah aktif." };
  return { ok: true, scenario: { id, kind: i.kind, deviceId: i.deviceId, deviceName: i.deviceName, durationSec: Math.round(i.durationSec), value: i.kind === "outage" ? 0 : i.value, status: "running", elapsedMs: 0, createdAt: now } };
}
/** Memajukan waktu simulasi; hanya skenario "running" yang bergerak. */
export function advanceScenarios(list: Scenario[], dtMs: number): { list: Scenario[]; completed: Scenario[] } {
  const completed: Scenario[] = [];
  const next = list.map((s) => {
    if (s.status !== "running") return s;
    const e = s.elapsedMs + dtMs;
    if (e >= s.durationSec * 1000) { const c = { ...s, elapsedMs: s.durationSec * 1000, status: "completed" as const }; completed.push(c); return c; }
    return { ...s, elapsedMs: e };
  });
  return { list: next, completed };
}
export function controlScenario(list: Scenario[], id: string, action: "pause" | "resume" | "stop"): Scenario[] {
  return list.map((s) => {
    if (s.id !== id) return s;
    if (action === "pause" && s.status === "running") return { ...s, status: "paused" as const };
    if (action === "resume" && s.status === "paused") return { ...s, status: "running" as const };
    if (action === "stop" && (s.status === "running" || s.status === "paused")) return { ...s, status: "stopped" as const };
    return s;
  });
}
export type Effects = { offline: boolean; extraLatencyMs: number; extraLossPct: number; limitMbps: number | null };
/** Efek hanya dari skenario "running"; skenario paused/completed/stopped tidak berpengaruh. */
export function effectsFor(list: Scenario[], deviceId: string): Effects {
  const fx: Effects = { offline: false, extraLatencyMs: 0, extraLossPct: 0, limitMbps: null };
  let keep = 1;
  for (const s of list) {
    if (s.deviceId !== deviceId || s.status !== "running") continue;
    if (s.kind === "outage") fx.offline = true;
    else if (s.kind === "latency") fx.extraLatencyMs = Math.min(5000, fx.extraLatencyMs + s.value);
    else if (s.kind === "loss") keep *= 1 - s.value / 100;
    else fx.limitMbps = fx.limitMbps === null ? s.value : Math.min(fx.limitMbps, s.value);
  }
  fx.extraLossPct = Math.round((1 - keep) * 1000) / 10;
  return fx;
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export type SimSample = { online: boolean; latencyMs: number | null; lossPct: number | null; utilPct: number | null; effBwMbps: number; limitMbps: number | null };
/** Deterministik terhadap (id perangkat, waktu simulasi, efek): tanpa Math.random, aman untuk tes. Waktu simulasi terpisah dari jam dinding. */
export function simDeviceSample(d: Device, simMs: number, fx: Effects): SimSample {
  const h = hash(d.id); const online = d.online && !fx.offline;
  const eff = fx.limitMbps === null ? d.bw : Math.min(d.bw, fx.limitMbps);
  if (!online) return { online, latencyMs: null, lossPct: null, utilPct: null, effBwMbps: 0, limitMbps: fx.limitMbps };
  const lat = 6 + (h % 25) + 3 * Math.sin(simMs / 15000 + h);
  const capacity = fx.limitMbps ?? 100;
  const demand = d.bw; const util = Math.min(100, (demand / capacity) * 100);
  return { online, latencyMs: Math.round(Math.max(1, lat + fx.extraLatencyMs) * 10) / 10, lossPct: fx.extraLossPct, utilPct: Math.round(util * 10) / 10, effBwMbps: Math.round(eff * 10) / 10, limitMbps: fx.limitMbps };
}
export const describeScenario = (s: Pick<Scenario, "kind" | "value" | "durationSec">): string => {
  const L = SCENARIO_LIMITS[s.kind];
  return s.kind === "outage" ? `${L.label}, ${s.durationSec} dtk` : `${L.label} ${s.kind === "latency" ? "+" : ""}${s.value} ${L.unit}, ${s.durationSec} dtk`;
};
