"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AlertKind, Bucket, BwPoint, Condition, DiscoveryResult, Incident, KnownDevice, LiveSnapshot, LiveStatus, NwCfg, RouterStatus, Severity } from "@/types";
import type { Sample } from "@/lib/alerts";
import { addSample, classifyCondition, computeRate, describeTransition, MAX_BUCKETS } from "@/lib/analytics";
import { mergeKnown, MAX_KNOWN } from "@/lib/known-devices";
import { toPoint } from "@/lib/live/status";
import { loadList, save } from "@/lib/storage";
import { isBucket, isBwPoint, isDiscoveryResult, isIncident, isKnownDevice, isRouterStatus, loadTail } from "@/lib/storage/v3";
export const MAX_BW = 720, MAX_INC = 200;
export type Rate = { ts: number; rx: number | null; tx: number | null; maxDown?: number | null; maxUp?: number | null };
type Params = {
  ready: boolean; nwCfg: NwCfg; liveStatus: LiveStatus; notify: (m: string, ok?: boolean) => void;
  addLog: (type: "Sistem" | "Perangkat" | "Jaringan", name: string, desc: string, pr?: "Rendah" | "Sedang" | "Tinggi", src?: "SIMULATION" | "LIVE") => void;
  pushAlert: (e: { key: string; kind: AlertKind; subject: string; message: string; severity: Severity }) => void; pollTick: number;
};
const mbps = (r: Rate | null) => (r && (r.rx !== null || r.tx !== null) ? ((r.rx ?? 0) + (r.tx ?? 0)) / 1e6 : null);
/** Seluruh logika v5 (bandwidth komputer/router, insiden, agregasi, discovery, status router). Data LIVE saja; tidak pernah bercampur dengan simulasi. */
export function useV5(p: Params) {
  const { ready, nwCfg, liveStatus, notify, addLog, pushAlert, pollTick } = p; const intervalMs = nwCfg.intervalSec * 1000;
  const [loaded, setLoaded] = useState(false);
  const [bwHist, setBwHist] = useState<BwPoint[]>([]); const [buckets, setBuckets] = useState<Bucket[]>([]); const [incidents, setIncidents] = useState<Incident[]>([]); const [known, setKnown] = useState<KnownDevice[]>([]);
  const [disc, setDisc] = useState<DiscoveryResult | null>(null); const [router, setRouter] = useState<RouterStatus | null>(null); const [routerFail, setRouterFail] = useState(false); const [routerOk, setRouterOk] = useState<number | null>(null);
  const [pcRate, setPcRate] = useState<Rate | null>(null); const [rtRate, setRtRate] = useState<Rate | null>(null);
  const prevC = useRef<{ ts: number; rx: number | null; tx: number | null } | null>(null); const prevR = useRef<{ ts: number; rx: number | null; tx: number | null } | null>(null);
  const rtRef = useRef<Rate | null>(null); const lastCond = useRef<Condition | null>(null); const pendCond = useRef<{ c: Condition; n: number } | null>(null); const lastTs = useRef(0); const merged = useRef<number | null>(null); const knownRef = useRef<KnownDevice[]>([]); knownRef.current = known;
  useEffect(() => { if (!ready) return; setBwHist(loadList("nw5_bw", [], isBwPoint, MAX_BW)); setBuckets(loadTail("nw5_buckets", isBucket, MAX_BUCKETS)); setIncidents(loadList("nw5_incidents", [], isIncident, MAX_INC)); setKnown(loadList("nw5_known", [], isKnownDevice, MAX_KNOWN)); setLoaded(true); }, [ready]);
  useEffect(() => { if (loaded) { save("nw5_bw", bwHist); save("nw5_buckets", buckets); save("nw5_incidents", incidents); save("nw5_known", known); } }, [loaded, bwHist, buckets, incidents, known]);
  /** Dipanggil untuk setiap snapshot LIVE baru dari polling. */
  const onSnapshot = useCallback((s: LiveSnapshot) => {
    if (s.ts === lastTs.current) return; lastTs.current = s.ts; const c = s.counters; let rx: number | null = null, tx: number | null = null, dt: number | null = null;
    if (c) { const pv = prevC.current; rx = computeRate(pv ? { ts: pv.ts, bytes: pv.rx } : null, { ts: c.ts, bytes: c.rxBytes }); tx = computeRate(pv ? { ts: pv.ts, bytes: pv.tx } : null, { ts: c.ts, bytes: c.txBytes }); if (pv) dt = (c.ts - pv.ts) / 1000; prevC.current = { ts: c.ts, rx: c.rxBytes, tx: c.txBytes }; }
    setPcRate(rx === null && tx === null ? null : { ts: c?.ts ?? s.ts, rx, tx });
    const rr = rtRef.current && s.ts - rtRef.current.ts <= 3 * intervalMs ? rtRef.current : null; const pt = toPoint(s); const cond = classifyCondition(pt);
    setBwHist((h) => [...h, { id: `b${s.ts}`, t: s.ts, pcRx: rx, pcTx: tx, rtRx: rr?.rx ?? null, rtTx: rr?.tx ?? null }].slice(-MAX_BW));
    setBuckets((b) => addSample(b, { t: s.ts, cond, gwRtt: pt.gwRtt, gwLoss: pt.gwLoss, inRtt: pt.inetRtt, inLoss: pt.inetLoss, pcRx: rx, pcTx: tx, rtRx: rr?.rx ?? null, rtTx: rr?.tx ?? null, dtSec: dt !== null && dt <= 300 ? dt : null }));
    if (cond !== "UNKNOWN") {
      const pv = lastCond.current; // kondisi baru harus bertahan 2 snapshot berturut-turut sebelum dicatat sebagai insiden (satu ping hilang tidak membuat insiden palsu)
      if (pv !== null && pv !== cond) { const pd = pendCond.current; pendCond.current = pd && pd.c === cond ? { c: cond, n: pd.n + 1 } : { c: cond, n: 1 }; if (pendCond.current.n < 2) return; } else pendCond.current = null;
      if (pv !== null && pv !== cond) { pendCond.current = null; const inc: Incident = { id: `i${s.ts}`, t: s.ts, from: pv, to: cond, summary: describeTransition(cond) }; setIncidents((l) => [inc, ...l].slice(0, MAX_INC)); addLog("Jaringan", "Kondisi jaringan", `[Insiden] ${pv} → ${cond}: ${inc.summary}`, cond === "NORMAL" ? "Rendah" : cond === "DEGRADED" ? "Sedang" : "Tinggi", "LIVE"); }
      lastCond.current = cond;
    }
  }, [intervalMs, addLog]);
  useEffect(() => { // polling router (UPnP): hanya bila diaktifkan; satu interval, dibatalkan saat dimatikan
    if (!ready || !nwCfg.routerEnabled) { setRouter(null); setRouterFail(false); setRouterOk(null); setRtRate(null); rtRef.current = null; prevR.current = null; return; }
    let stop = false; let ctl: AbortController | null = null;
    const poll = async () => {
      if (document.hidden) return; const c = new AbortController(); ctl = c; const to = window.setTimeout(() => c.abort(), 12000);
      try {
        const res = await fetch("/api/router/status", { cache: "no-store", signal: c.signal }); if (!res.ok) throw new Error(String(res.status)); const j: unknown = await res.json(); if (!isRouterStatus(j)) throw new Error("bad"); if (stop) return;
        setRouter(j); setRouterFail(false); setRouterOk(j.ts);
        if (j.state === "OK" && j.wan) { const pv = prevR.current; if (!pv || j.ts !== pv.ts) { const rx = computeRate(pv ? { ts: pv.ts, bytes: pv.rx } : null, { ts: j.ts, bytes: j.wan.rxBytes }), tx = computeRate(pv ? { ts: pv.ts, bytes: pv.tx } : null, { ts: j.ts, bytes: j.wan.txBytes }); prevR.current = { ts: j.ts, rx: j.wan.rxBytes, tx: j.wan.txBytes }; const r: Rate = { ts: j.ts, rx, tx, maxDown: j.wan.maxDownBps, maxUp: j.wan.maxUpBps }; rtRef.current = r; setRtRate(r); } }
        else { rtRef.current = null; setRtRate(null); prevR.current = null; }
      } catch { if (!stop) setRouterFail(true); } finally { window.clearTimeout(to); }
    };
    void poll(); const iv = window.setInterval(() => void poll(), intervalMs);
    return () => { stop = true; ctl?.abort(); window.clearInterval(iv); };
  }, [ready, nwCfg.routerEnabled, intervalMs, pollTick]);
  // ---------- discovery ----------
  const call = useCallback(async (method: "GET" | "POST", body?: unknown) => fetch("/api/discovery", { method, cache: "no-store", headers: method === "POST" ? { "X-NetWatch": "1", "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }), []);
  const refreshDiscovery = useCallback(async () => { try { const r = await call("GET"); if (r.ok) { const j: unknown = await r.json(); if (isDiscoveryResult(j)) setDisc(j); } } catch { /* server tidak terjangkau: biarkan status terakhir */ } }, [call]);
  const startDiscovery = useCallback(async (mode: "passive" | "active") => {
    try { const r = await call("POST", { action: "start", mode, hostnames: nwCfg.hostnames }); const j: unknown = await r.json();
      if (r.ok && isDiscoveryResult(j)) { setDisc(j); return; } const e = (j as { error?: string }).error; notify(e === "already_running" ? "Pemindaian sedang berjalan" : e === "rate_limited" ? "Tunggu beberapa detik sebelum memindai lagi" : "Pemindaian tidak dapat dimulai", false);
    } catch { notify("Server NetWatch tidak terjangkau", false); }
  }, [call, nwCfg.hostnames, notify]);
  const stopDiscovery = useCallback(async () => { try { await call("POST", { action: "stop" }); await refreshDiscovery(); } catch { notify("Server NetWatch tidak terjangkau", false); } }, [call, refreshDiscovery, notify]);
  const running = disc?.status.state === "running" || disc?.status.state === "stopping";
  useEffect(() => { if (!running) return; const t = window.setInterval(() => void refreshDiscovery(), 1000); return () => window.clearInterval(t); }, [running, refreshDiscovery]);
  useEffect(() => { // gabungkan hasil selesai ke riwayat perangkat; "perangkat baru" hanya bila riwayat sebelumnya tidak kosong (baseline)
    if (!loaded || !disc || disc.status.state !== "done" || disc.status.finishedAt === null || merged.current === disc.status.finishedAt) return; merged.current = disc.status.finishedAt;
    const hadBaseline = knownRef.current.length > 0; const m = mergeKnown(knownRef.current, disc); knownRef.current = m.known; setKnown(m.known);
    if (hadBaseline) for (const d of m.added) pushAlert({ key: `LIVE|dev:${d.id}|new_device`, kind: "new_device", subject: d.hostname ?? d.ip, severity: "info", message: `[LIVE] Perangkat baru terdeteksi: ${d.ip}${d.mac ? ` (${d.mac})` : ""}${d.hostname ? ` ${d.hostname}` : ""}` });
  }, [loaded, disc, pushAlert]);
  // ---------- sampel alert LIVE tambahan (router, throughput) ----------
  const extraSamples = useMemo<Sample[]>(() => {
    const out: Sample[] = [];
    if (nwCfg.routerEnabled && router && !routerFail) out.push({ source: "LIVE", subjectId: "router", subject: "Router (UPnP)", online: router.state === "OK" ? true : router.state === "UNREACHABLE" ? false : null, latencyMs: null, lossPct: null, utilPct: null, bwMbps: null, offlineKind: "router_unreachable", tick: router.ts });
    if (nwCfg.routerEnabled && router?.state === "OK" && rtRate) out.push({ source: "LIVE", subjectId: "router-wan", subject: "Trafik WAN router", online: true, latencyMs: null, lossPct: null, utilPct: null, bwMbps: mbps(rtRate), tick: router.ts });
    if (liveStatus === "LIVE" && pcRate) out.push({ source: "LIVE", subjectId: "pc-link", subject: "Komputer ini", online: true, latencyMs: null, lossPct: null, utilPct: null, bwMbps: mbps(pcRate) });
    return out;
  }, [nwCfg.routerEnabled, router, routerFail, rtRate, pcRate, liveStatus]);
  const reset = useCallback(() => { setBwHist([]); setBuckets([]); setIncidents([]); setKnown([]); knownRef.current = []; setDisc(null); merged.current = null; setPcRate(null); setRtRate(null); prevC.current = null; prevR.current = null; rtRef.current = null; lastCond.current = null; pendCond.current = null; lastTs.current = 0; }, []);
  return {
    bwHist, buckets, incidents, known, disc, pcRate, rtRate, extraSamples, onSnapshot, startDiscovery, stopDiscovery, refreshDiscovery, reset,
    router: { enabled: nwCfg.routerEnabled, status: router, failing: routerFail, lastOkTs: routerOk },
    clearKnown: () => { setKnown([]); knownRef.current = []; merged.current = null; notify("Riwayat perangkat dihapus"); },
    clearBw: () => { setBwHist([]); setBuckets([]); notify("Riwayat bandwidth dan laporan dihapus"); }, clearIncidents: () => setIncidents([]),
  };
}
export type V5 = ReturnType<typeof useV5>;
