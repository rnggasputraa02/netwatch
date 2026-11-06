"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Alert, AlertRule, AnimLevel, DataSource, Device, Focus, HistoryPoint, LiveCfg, LivePoint, LiveSnapshot, LiveStatus, LogEntry, Notice, RuleKind, Scenario, ScenarioKind, Settings } from "@/types";
import { DEFAULT_RULES, evaluate, LIVE_HYSTERESIS, validateRuleValue, type Hysteresis, type Sample } from "@/lib/alerts";
import { advanceScenarios, controlScenario as ctrlScenario, createScenario, describeScenario, effectsFor, simDeviceSample } from "@/lib/simulation/scenario";
import { isAlert, isLivePoint, isScenario, isSnapshot, parseLiveCfg, parseRules, readJson } from "@/lib/storage/v3";
import { liveAlertSamples } from "@/lib/live/alert-samples";
import { classifyStatus, DEFAULT_LIVE_CFG, INTERNET_TARGETS, LIVE_STALE_MS, MAX_LIVE_POINTS, toPoint } from "@/lib/live/status";
import { useV5, type V5 } from "@/lib/store-v5";
import { DEFAULT_NW_CFG, parseNwCfg } from "@/lib/storage/v3";
import { runMigrations } from "@/lib/storage/migrate";
import { pushEvent } from "@/lib/alerts";
import type { NwCfg, Severity, AlertKind } from "@/types";
import { isDevice, isLog, isNotice, loadHistory, loadList, loadSettings, MAX_HISTORY, save } from "@/lib/storage";
import { growDevices, historyPoint, pickFlip, seedDevices, stepBandwidth } from "@/lib/simulation";
export { VERSION } from "@/lib/version";
const DEF: Settings = { interval: 2, paused: false, collapsed: false, animLevel: "subtle", perf: "normal" };
type Toast = { m: string; ok: boolean } | null;
type Ctx = {
  ready: boolean; devices: Device[]; logs: LogEntry[]; cfg: Settings; now: number; query: string; toast: Toast; anim: AnimLevel; animOn: boolean;
  notices: Notice[]; history: HistoryPoint[]; focus: Focus;
  setQuery: (q: string) => void; setCfg: (patch: Partial<Settings>) => void; setLogs: (l: LogEntry[]) => void; setFocus: (f: Focus) => void;
  saveDevice: (d: Device) => void; deleteDevice: (d: Device) => void; setDeviceCount: (n: number) => void;
  markRead: (id: string) => void; markAllRead: () => void; clearNotices: () => void; clearHistory: () => void;
  notify: (m: string, ok?: boolean) => void; refresh: () => void; resetAll: () => void; togglePause: () => void;
  // v3: simulasi lanjutan
  scenarios: Scenario[]; simMs: number;
  startScenario: (i: { kind: ScenarioKind; deviceId: string; durationSec: number; value: number }) => string | null;
  controlScenario: (id: string, a: "pause" | "resume" | "stop") => void; clearFinishedScenarios: () => void;
  // v3: alert
  alerts: Alert[]; rules: AlertRule[]; setRule: (k: RuleKind, p: { enabled?: boolean; threshold?: number }) => string | null;
  ackAlert: (id: string) => void; ackAllAlerts: () => void; clearAlertHistory: () => void;
  // v3: monitoring nyata (terisolasi dari simulasi)
  live: { cfg: LiveCfg; status: LiveStatus; snap: LiveSnapshot | null; hist: LivePoint[]; lastOkTs: number | null };
  setLiveEnabled: (b: boolean) => void; setLiveTarget: (t: string) => boolean; pollLive: () => void; clearLiveHistory: () => void;
  // v5
  nw: NwCfg; setNw: (p: Partial<NwCfg>) => void; v5: V5;
};
const C = createContext<Ctx | null>(null);
export const useApp = (): Ctx => { const c = useContext(C); if (!c) throw new Error("useApp harus di dalam AppProvider"); return c; };
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]); const [logs, setLogsState] = useState<LogEntry[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]); const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [cfg, setCfgState] = useState<Settings>(DEF); const [now, setNow] = useState(0); const [query, setQuery] = useState("");
  const [toast, setToast] = useState<Toast>(null); const [reduced, setReduced] = useState(false); const [focus, setFocus] = useState<Focus>(null);
  const ref = useRef<Device[]>([]); ref.current = devices;
  const [scenarios, setScenarios] = useState<Scenario[]>([]); const scnRef = useRef<Scenario[]>([]); scnRef.current = scenarios; const [simMs, setSimMs] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]); const alertsRef = useRef<Alert[]>([]); alertsRef.current = alerts; const [rules, setRules] = useState<AlertRule[]>(DEFAULT_RULES);
  const [liveCfg, setLiveCfg] = useState<LiveCfg>(DEFAULT_LIVE_CFG); const [snap, setSnap] = useState<LiveSnapshot | null>(null); const [lastOkTs, setLastOkTs] = useState<number | null>(null);
  const [failing, setFailing] = useState(false); const [liveNow, setLiveNow] = useState(0); const [liveHist, setLiveHist] = useState<LivePoint[]>([]); const [pollTick, setPollTick] = useState(0);
  const liveStreaks = useRef<Hysteresis["streaks"]>({}); // hitungan pengukuran berturut-turut (anti alarm palsu) untuk alert LIVE
  const baselined = useRef(false); const [nwCfg, setNwCfg] = useState<NwCfg>(DEFAULT_NW_CFG);
  const pausedRef = useRef(false); // nilai terbaru secara sinkron agar dua toggle beruntun tidak saling menimpa
  const toastTimer = useRef<number | undefined>(undefined);
  const notify = useCallback((m: string, ok = true) => { setToast({ m, ok }); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2200); }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const addNotice = useCallback((key: string, title: string, body: string) => setNotices((p) => {
    const t = Date.now(); if (p.some((n) => n.key === key && t - n.t < 30000)) return p; // cegah duplikat beruntun
    return [{ id: `n${t}${Math.random().toString(36).slice(2, 6)}`, t, key, title, body, read: false }, ...p].slice(0, 100);
  }), []);
  const addLog = useCallback((type: LogEntry["type"], name: string, desc: string, pr: LogEntry["pr"] = "Rendah", src: DataSource = "SIMULATION") => {
    setLogsState((p) => [{ src, id: `l${Date.now()}${Math.random().toString(36).slice(2, 6)}`, t: Date.now(), type, name, desc, pr }, ...p].slice(0, 500));
    if (type !== "Sistem" || pr !== "Rendah") addNotice(`${type}|${name}|${desc}`, name, desc);
  }, [addNotice]);
  useEffect(() => {
    const mig = runMigrations(window.localStorage); if (mig.futureVersion) window.setTimeout(() => notify("Data tersimpan berasal dari versi NetWatch yang lebih baru; sebagian data mungkin tidak terbaca.", false), 500);
    setNwCfg(parseNwCfg(readJson("nw5_cfg")));
    setDevices(loadList("nw2_dev", seedDevices(), isDevice, 50)); setLogsState(loadList("nw2_log", [], isLog, 500)); setNotices(loadList("nw2_not", [], isNotice, 100));
    setScenarios(loadList("nw3_scn", [], isScenario, 50)); setAlerts(loadList("nw3_alerts", [], isAlert, 150)); setRules(parseRules(readJson("nw3_rules")));
    setLiveCfg(parseLiveCfg(readJson("nw3_live"))); setLiveHist(loadList("nw3_live_hist", [], isLivePoint, MAX_LIVE_POINTS));
    setHistory(loadHistory()); const loaded = loadSettings(DEF); pausedRef.current = loaded.paused; setCfgState(loaded);
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); setNow(Date.now()); setReady(true);
  }, [notify]);
  useEffect(() => { if (ready) { save("nw2_dev", devices); save("nw2_log", logs); save("nw2_cfg", cfg); save("nw2_not", notices); } }, [ready, devices, logs, cfg, notices]);
  useEffect(() => { if (ready) save("nw2_hist", history); }, [ready, history]);
  useEffect(() => { if (ready) { save("nw3_scn", scenarios); save("nw3_alerts", alerts); save("nw3_rules", rules); save("nw3_live", liveCfg); save("nw3_live_hist", liveHist); save("nw5_cfg", nwCfg); } }, [ready, scenarios, alerts, rules, liveCfg, liveHist, nwCfg]);
  const anim: AnimLevel = reduced || cfg.perf === "saver" ? "off" : cfg.animLevel;
  useEffect(() => { document.documentElement.dataset.anim = anim; document.documentElement.dataset.perf = cfg.perf; }, [anim, cfg.perf]);
  useEffect(() => { // satu interval; dibersihkan saat jeda, ganti interval, atau unmount
    if (!ready || cfg.paused) return;
    const t = window.setInterval(() => {
      const n = Date.now(); setNow(n);
      const dt = cfg.interval * 1000 * (cfg.perf === "saver" ? 2 : 1); setSimMs((s) => s + dt); // waktu simulasi: hanya maju saat tick berjalan
      const adv = advanceScenarios(scnRef.current, dt);
      if (adv.list.some((s, i) => s !== scnRef.current[i])) { scnRef.current = adv.list; setScenarios(adv.list); }
      adv.completed.forEach((s) => addLog("Jaringan", s.deviceName, `[Skenario] ${describeScenario(s)} selesai, kondisi dipulihkan (simulasi)`));
      setDevices((p) => stepBandwidth(p, n)); setHistory((p) => [...p, historyPoint(n)].slice(-MAX_HISTORY));
      const f = pickFlip(ref.current, Math.random(), Math.random());
      if (f) {
        setDevices((p) => p.map((x) => x.id === f.id ? { ...x, online: !x.online, seen: n } : x));
        addLog("Jaringan", f.name, f.online ? "Perangkat offline (simulasi)" : "Perangkat kembali online (simulasi)", f.online ? "Tinggi" : "Rendah");
      }
    }, cfg.interval * 1000 * (cfg.perf === "saver" ? 2 : 1));
    return () => window.clearInterval(t);
  }, [ready, cfg.paused, cfg.interval, cfg.perf, addLog]);
  const liveStatus: LiveStatus = classifyStatus({ enabled: liveCfg.enabled, lastOkTs, failing, now: liveNow || Date.now(), staleMs: Math.max(LIVE_STALE_MS, 3 * nwCfg.intervalSec * 1000) });
  const pushAlert = useCallback((e: { key: string; kind: AlertKind; subject: string; message: string; severity: Severity }) => {
    const r = pushEvent(alertsRef.current, { ...e, source: "LIVE" }, Date.now()); if (r.created) { alertsRef.current = r.alerts; setAlerts(r.alerts); addLog("Jaringan", e.subject, `ALERT ${e.message}`, "Rendah", "LIVE"); }
  }, [addLog]);
  const v5 = useV5({ ready, nwCfg, liveStatus, notify, addLog, pushAlert, pollTick }); const onSnapRef = useRef(v5.onSnapshot); onSnapRef.current = v5.onSnapshot;
  useEffect(() => { // alert SIMULATION: dari perangkat simulasi + skenario; evaluasi pertama setelah dimuat tidak memicu notifikasi (baseline)
    if (!ready) return;
    const samples: Sample[] = devices.map((d) => { const x = simDeviceSample(d, simMs, effectsFor(scenarios, d.id)); return { source: "SIMULATION", subjectId: d.id, subject: d.name, online: x.online, latencyMs: x.latencyMs, lossPct: x.lossPct, utilPct: x.utilPct }; });
    const r = evaluate(samples, rules, alertsRef.current, Date.now(), "SIMULATION");
    if (r.changed) { alertsRef.current = r.alerts; setAlerts(r.alerts); if (baselined.current) { r.started.forEach((a) => addLog("Jaringan", a.subject, `ALERT ${a.message}`, "Tinggi")); r.recovered.forEach((a) => addLog("Jaringan", a.subject, `PULIH ${a.message}`)); } }
    baselined.current = true;
  }, [ready, devices, scenarios, simMs, rules, addLog]);
  useEffect(() => { // alert LIVE: hanya dari snapshot LIVE; STALE/UNKNOWN = tidak diketahui (tidak membuat/memulihkan)
    if (!ready) return;
    const samples: Sample[] = liveAlertSamples({ enabled: liveCfg.enabled, status: liveStatus, snap, active: alertsRef.current });
    samples.push(...v5.extraSamples);
    const r = evaluate(samples, rules, alertsRef.current, Date.now(), "LIVE", { cooldownMs: 60_000, hysteresis: { ...LIVE_HYSTERESIS, tick: snap?.ts ?? 0, streaks: liveStreaks.current } });
    if (r.changed) { alertsRef.current = r.alerts; setAlerts(r.alerts); r.started.forEach((a) => addLog("Jaringan", a.subject, `ALERT ${a.message}`, "Tinggi", "LIVE")); r.recovered.forEach((a) => addLog("Jaringan", a.subject, `PULIH ${a.message}`, "Rendah", "LIVE")); }
  }, [ready, liveCfg.enabled, liveStatus, snap, rules, addLog, v5.extraSamples]);
  useEffect(() => { // polling LIVE: satu interval, dibatalkan saat dimatikan/unmount; tidak pernah menggantinya dengan data simulasi
    if (!ready || !liveCfg.enabled) return;
    let stop = false; let ctl: AbortController | null = null;
    const poll = async () => {
      if (document.hidden) return;
      const c = new AbortController(); ctl = c; const to = window.setTimeout(() => c.abort(), 9000);
      try {
        const res = await fetch(`/api/live/snapshot?internet=${encodeURIComponent(liveCfg.target)}`, { cache: "no-store", signal: c.signal });
        if (!res.ok) throw new Error(String(res.status)); const s: unknown = await res.json(); if (!isSnapshot(s)) throw new Error("bad_snapshot"); if (stop) return;
        setSnap(s); setLastOkTs(s.ts); setFailing(false); setLiveHist((p) => (p.length && p[p.length - 1].t === s.ts ? p : [...p, toPoint(s)].slice(-MAX_LIVE_POINTS))); onSnapRef.current(s);
      } catch { if (!stop) setFailing(true); } finally { window.clearTimeout(to); if (!stop) setLiveNow(Date.now()); }
    };
    void poll(); const iv = window.setInterval(() => void poll(), nwCfg.intervalSec * 1000); const clock = window.setInterval(() => setLiveNow(Date.now()), 5000);
    return () => { stop = true; ctl?.abort(); window.clearInterval(iv); window.clearInterval(clock); };
  }, [ready, liveCfg.enabled, liveCfg.target, pollTick, nwCfg.intervalSec]);
  const resetLiveRuntime = () => { setSnap(null); setLastOkTs(null); setFailing(false); setLiveNow(Date.now()); };
  const commitScn = (next: Scenario[]) => { scnRef.current = next; setScenarios(next); };
  const v: Ctx = {
    ready, devices, logs, cfg, now, query, toast, anim, animOn: anim !== "off", notices, history, focus, setQuery, setFocus, notify,
    setCfg: (patch) => { if (patch.paused !== undefined) pausedRef.current = patch.paused; setCfgState((c) => ({ ...c, ...patch })); },
    togglePause: () => { const next = !pausedRef.current; pausedRef.current = next; setCfgState((c) => ({ ...c, paused: next })); notify(next ? "Simulasi dijeda" : "Simulasi dilanjutkan"); }, setLogs: setLogsState,
    saveDevice: (d) => { setDevices((p) => p.some((x) => x.id === d.id) ? p.map((x) => x.id === d.id ? d : x) : [...p, d]); addLog("Perangkat", d.name, "Perangkat disimpan"); notify("Perangkat berhasil disimpan"); },
    deleteDevice: (d) => { setDevices((p) => p.filter((x) => x.id !== d.id)); addLog("Perangkat", d.name, "Perangkat dihapus", "Sedang"); notify("Perangkat dihapus"); },
    setDeviceCount: (n) => setDevices((p) => growDevices(p, n)),
    markRead: (id) => setNotices((p) => p.map((n) => n.id === id ? { ...n, read: true } : n)),
    markAllRead: () => setNotices((p) => p.map((n) => ({ ...n, read: true }))), clearNotices: () => setNotices([]),
    clearHistory: () => { setHistory([]); notify("Riwayat trafik dihapus"); },
    scenarios, simMs,
    startScenario: (i) => {
      if (pausedRef.current) return "Simulasi sedang dijeda. Lanjutkan simulasi sebelum memulai skenario.";
      const dv = ref.current.find((d) => d.id === i.deviceId); if (!dv) return "Perangkat tidak ditemukan.";
      const r = createScenario({ ...i, deviceName: dv.name }, `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`, Date.now(), scnRef.current); if (!r.ok) return r.error;
      commitScn([r.scenario, ...scnRef.current].slice(0, 50)); addLog("Jaringan", dv.name, `[Skenario] ${describeScenario(r.scenario)} dimulai (simulasi)`, "Sedang"); return null;
    },
    controlScenario: (id, a) => {
      const s = scnRef.current.find((x) => x.id === id); if (!s) return; commitScn(ctrlScenario(scnRef.current, id, a));
      addLog("Jaringan", s.deviceName, `[Skenario] ${describeScenario(s)} ${a === "pause" ? "dijeda" : a === "resume" ? "dilanjutkan" : "dihentikan, kondisi dipulihkan"} (simulasi)`);
    },
    clearFinishedScenarios: () => commitScn(scnRef.current.filter((s) => s.status === "running" || s.status === "paused")),
    alerts, rules,
    setRule: (k, p) => { if (p.threshold !== undefined) { const e = validateRuleValue(k, p.threshold); if (e) return e; } setRules((r) => r.map((x) => (x.kind === k ? { ...x, ...p } : x))); return null; },
    ackAlert: (id) => setAlerts((p) => p.map((a) => (a.id === id ? { ...a, ack: true, recoveredAt: a.kind === "new_device" ? Date.now() : a.recoveredAt } : a))),
    ackAllAlerts: () => setAlerts((p) => p.map((a) => (a.recoveredAt === null ? { ...a, ack: true, recoveredAt: a.kind === "new_device" ? Date.now() : null } : a))),
    clearAlertHistory: () => setAlerts((p) => p.filter((a) => a.recoveredAt === null)),
    nw: nwCfg, setNw: (pt) => { setNwCfg((c) => ({ ...c, ...pt })); setPollTick((n) => n + 1); }, v5,
    live: { cfg: liveCfg, status: liveStatus, snap, hist: liveHist, lastOkTs },
    setLiveEnabled: (b) => { resetLiveRuntime(); setLiveCfg((c) => ({ ...c, enabled: b })); notify(b ? "Monitoring nyata diaktifkan" : "Monitoring nyata dinonaktifkan"); },
    setLiveTarget: (t) => { if (!(INTERNET_TARGETS as readonly string[]).includes(t)) return false; resetLiveRuntime(); setLiveCfg((c) => ({ ...c, target: t })); return true; },
    pollLive: () => setPollTick((n) => n + 1),
    clearLiveHistory: () => { setLiveHist([]); notify("Riwayat monitoring nyata dihapus"); },
    refresh: () => { setNow(Date.now()); notify("Data disegarkan"); },
    resetAll: () => { setDevices(seedDevices()); setLogsState([]); setNotices([]); setHistory([]); commitScn([]); alertsRef.current = []; setAlerts([]); setRules(DEFAULT_RULES); setLiveCfg(DEFAULT_LIVE_CFG); setNwCfg(DEFAULT_NW_CFG); v5.reset(); resetLiveRuntime(); setLiveHist([]); setSimMs(0); pausedRef.current = DEF.paused; setCfgState(DEF); setNow(Date.now()); notify("Semua data direset"); },
  };
  return <C.Provider value={v}>{children}</C.Provider>;
}
