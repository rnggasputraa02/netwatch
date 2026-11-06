import type { Alert, AlertRule, LiveCfg, LivePoint, Scenario } from "@/types";
import { DEFAULT_RULES, validateRuleValue } from "../alerts.ts";
import { DEFAULT_LIVE_CFG, INTERNET_TARGETS } from "../live/status.ts";
const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nul = (v: unknown) => v === null || fin(v);
export const isScenario = (v: unknown): v is Scenario => rec(v) && typeof v.id === "string" && typeof v.deviceId === "string" && typeof v.deviceName === "string" && ["outage", "latency", "loss", "congestion"].includes(String(v.kind)) && ["running", "paused", "completed", "stopped"].includes(String(v.status)) && fin(v.durationSec) && fin(v.value) && fin(v.elapsedMs) && fin(v.createdAt);
export const isAlert = (v: unknown): v is Alert => rec(v) && typeof v.id === "string" && typeof v.key === "string" && (v.source === "SIMULATION" || v.source === "LIVE") && typeof v.kind === "string" && typeof v.subject === "string" && typeof v.message === "string" && fin(v.startedAt) && nul(v.recoveredAt) && typeof v.ack === "boolean";
export const isLivePoint = (v: unknown): v is LivePoint => rec(v) && typeof v.id === "string" && fin(v.t) && nul(v.gwRtt) && nul(v.gwLoss) && nul(v.inetRtt) && nul(v.inetLoss);
export function parseRules(raw: unknown): AlertRule[] {
  if (!Array.isArray(raw)) return DEFAULT_RULES;
  return DEFAULT_RULES.map((d) => { const f = raw.find((r) => rec(r) && r.kind === d.kind); return f && rec(f) && typeof f.enabled === "boolean" && fin(f.threshold) && validateRuleValue(d.kind, f.threshold) === null ? { kind: d.kind, enabled: f.enabled, threshold: f.threshold } : d; });
}
export function parseLiveCfg(raw: unknown): LiveCfg {
  if (!rec(raw)) return DEFAULT_LIVE_CFG;
  return { enabled: raw.enabled === true, target: typeof raw.target === "string" && (INTERNET_TARGETS as readonly string[]).includes(raw.target) ? raw.target : DEFAULT_LIVE_CFG.target };
}
export function readJson(key: string): unknown { try { const r = window.localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; } }
export const isSnapshot = (v: unknown): v is import("@/types").LiveSnapshot => rec(v) && v.source === "LIVE" && fin(v.ts) && Array.isArray(v.interfaces) && rec(v.gateway) && rec(v.internet) && Array.isArray(v.notes);
// ===== v5 =====
import type { Bucket, Incident, KnownDevice, NwCfg, BwPoint } from "@/types";
const str = (v: unknown): v is string => typeof v === "string";
export const isKnownDevice = (v: unknown): v is KnownDevice => rec(v) && str(v.id) && str(v.ip) && (v.mac === null || str(v.mac)) && (v.hostname === null || str(v.hostname)) && fin(v.firstSeen) && fin(v.lastSeen) && (v.online === null || typeof v.online === "boolean") && ["gateway", "this-computer", "unknown"].includes(String(v.role)) && typeof v.privateMac === "boolean";
export const isBwPoint = (v: unknown): v is BwPoint => rec(v) && str(v.id) && fin(v.t) && nul(v.pcRx) && nul(v.pcTx) && nul(v.rtRx) && nul(v.rtTx);
export const isIncident = (v: unknown): v is Incident => rec(v) && str(v.id) && fin(v.t) && str(v.from) && str(v.to) && str(v.summary);
const isAcc = (v: unknown) => rec(v) && fin(v.s) && fin(v.n) && fin(v.m);
export const isBucket = (v: unknown): v is Bucket => rec(v) && fin(v.t) && fin(v.n) && Array.isArray(v.c) && v.c.length === 5 && v.c.every(fin) && ["gwRtt", "inRtt", "gwLoss", "inLoss", "pcRx", "pcTx", "rtRx", "rtTx"].every((k) => isAcc(v[k])) && rec(v.by) && ["pcRx", "pcTx", "rtRx", "rtTx"].every((k) => fin((v.by as Record<string, unknown>)[k]));
export const DEFAULT_NW_CFG: NwCfg = { intervalSec: 10, routerEnabled: false, hostnames: true };
export function parseNwCfg(raw: unknown): NwCfg {
  if (!rec(raw)) return DEFAULT_NW_CFG;
  return { intervalSec: raw.intervalSec === 30 || raw.intervalSec === 60 ? raw.intervalSec : 10, routerEnabled: raw.routerEnabled === true, hostnames: raw.hostnames !== false };
}
export const isRouterStatus = (v: unknown): v is import("@/types").RouterStatus => rec(v) && v.source === "LIVE" && fin(v.ts) && ["OK", "NOT_SUPPORTED", "UNREACHABLE", "UNKNOWN"].includes(String(v.state)) && rec(v.capabilities);
export const isDiscoveryResult = (v: unknown): v is import("@/types").DiscoveryResult => rec(v) && rec(v.status) && Array.isArray(v.hosts) && ["idle", "running", "stopping", "done", "error"].includes(String((v.status as Record<string, unknown>).state));
/** Membaca larik tanpa id (mis. bucket); entri rusak dibuang, hanya `max` terbaru dipertahankan. */
export function loadTail<T>(key: string, guard: (v: unknown) => v is T, max: number): T[] { const j = readJson(key); return Array.isArray(j) ? j.filter(guard).slice(-max) : []; }
