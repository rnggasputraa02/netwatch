import type { Alert, LiveSnapshot, LiveStatus } from "@/types";
import type { Sample } from "../alerts.ts";
import { localLinkLost } from "./status.ts";
/**
 * Sampel alert LIVE (tautan monitoring, gateway, internet). Fungsi murni: dipakai store dan diuji unit.
 * Aturan: hanya status LIVE yang membuat/memulihkan alert gateway/internet; STALE/UNKNOWN = tidak diketahui (online:null → status alert tidak berubah).
 * Jaringan lokal terputus (tanpa default gateway) dilaporkan sebagai gateway_down, bukan hanya internet_down.
 */
export function liveAlertSamples(i: { enabled: boolean; status: LiveStatus; snap: LiveSnapshot | null; active: Alert[] }): Sample[] {
  const samples: Sample[] = []; if (!i.enabled) return samples; const { status, snap } = i;
  samples.push({ source: "LIVE", subjectId: "link", subject: "Monitoring nyata", online: status === "DISCONNECTED" ? false : status === "LIVE" ? true : null, latencyMs: null, lossPct: null, utilPct: null, offlineKind: "live_disconnected" });
  const mk = (id: string, subject: string, p: LiveSnapshot["internet"]["probe"], kind: "gateway_down" | "internet_down"): Sample => ({ source: "LIVE", subjectId: id, subject, online: p && p.lossPct !== null ? p.received > 0 : null, latencyMs: p?.rttAvgMs ?? null, lossPct: p?.lossPct ?? null, utilPct: null, offlineKind: kind });
  if (status === "LIVE" && snap) {
    if (snap.gateway.ip) samples.push(mk("gateway", `Gateway ${snap.gateway.ip}`, snap.gateway.probe, "gateway_down"));
    else if (localLinkLost(snap)) samples.push({ source: "LIVE", subjectId: "gateway", subject: "Jaringan lokal (default gateway tidak ada)", online: false, latencyMs: null, lossPct: null, utilPct: null, offlineKind: "gateway_down" });
    samples.push(mk("internet", `Internet (${snap.internet.target})`, snap.internet.probe, "internet_down"));
  } else {
    for (const a of i.active) if (a.source === "LIVE" && a.recoveredAt === null && (a.key.endsWith("|gateway_down") || a.key.endsWith("|internet_down"))) { const id = a.key.split("|")[1]; if (!samples.some((s) => s.subjectId === id)) samples.push({ source: "LIVE", subjectId: id, subject: a.subject, online: null, latencyMs: null, lossPct: null, utilPct: null, offlineKind: id === "gateway" ? "gateway_down" : "internet_down" }); }
  }
  return samples;
}
