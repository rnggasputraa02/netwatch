import type { Acc, Bucket, Condition, Incident, LivePoint } from "@/types";
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export type Summary = { n: number; avg: number; min: number; max: number; p95: number; stdev: number };
export function summarize(vals: (number | null | undefined)[]): Summary | null {
  const a = vals.filter(num); if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y); const avg = a.reduce((x, y) => x + y, 0) / a.length;
  return { n: a.length, avg, min: s[0], max: s[s.length - 1], p95: s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)], stdev: Math.sqrt(a.reduce((x, y) => x + (y - avg) ** 2, 0) / a.length) };
}
/** Jitter = rata-rata selisih mutlak antar sampel berurutan (nilai null dilewati). */
export function jitter(vals: (number | null)[]): number | null {
  const a = vals.filter(num); if (a.length < 2) return null;
  let s = 0; for (let i = 1; i < a.length; i++) s += Math.abs(a[i] - a[i - 1]); return s / (a.length - 1);
}
export const MAX_GAP_MS = 5 * 60_000;
/** Laju (bit/detik) dari dua pembacaan counter byte. Null bila tidak dapat dipercaya: data kosong, jeda terlalu panjang, atau counter reset. Wrap 32-bit hanya diasumsikan bila nilai sebelumnya mendekati 2^32. */
export function computeRate(prev: { ts: number; bytes: number | null } | null, cur: { ts: number; bytes: number | null }): number | null {
  if (!prev || prev.bytes === null || cur.bytes === null) return null;
  const dt = (cur.ts - prev.ts) / 1000; if (!(dt > 0) || cur.ts - prev.ts > MAX_GAP_MS) return null;
  let d = cur.bytes - prev.bytes;
  if (d < 0) { const W = 2 ** 32; if (prev.bytes >= W * 0.75 && prev.bytes <= W && cur.bytes < W * 0.25) d = cur.bytes + W - prev.bytes; else return null; }
  return (d * 8) / dt;
}
export const THRESH = { rttMs: 150, lossPct: 5 };
export function classifyCondition(p: Pick<LivePoint, "gwRtt" | "gwLoss" | "inetRtt" | "inetLoss">, th = THRESH): Condition {
  if (p.gwLoss === null && p.inetLoss === null) return "UNKNOWN";
  if (p.gwLoss !== null && p.gwLoss >= 100) return "GATEWAY_DOWN";
  if (p.inetLoss !== null && p.inetLoss >= 100) return p.gwLoss !== null ? "INTERNET_DOWN" : "UNKNOWN"; // tanpa gateway terukur, penyebab tak dapat dipisahkan
  const bad = (loss: number | null, rtt: number | null) => (loss !== null && loss >= th.lossPct) || (rtt !== null && rtt > th.rttMs);
  return bad(p.gwLoss, p.gwRtt) || bad(p.inetLoss, p.inetRtt) ? "DEGRADED" : "NORMAL";
}
export const describeTransition = (to: Condition): string => ({
  NORMAL: "Koneksi kembali normal.", DEGRADED: "Kualitas menurun: latency atau packet loss di atas ambang.",
  GATEWAY_DOWN: "Gateway tidak merespons (packet loss 100%).", INTERNET_DOWN: "Internet tidak tercapai sementara gateway masih merespons: indikasi masalah di sisi WAN/ISP, bukan jaringan lokal.", UNKNOWN: "Kondisi tidak diketahui.",
}[to]);
/** Perubahan kondisi antar sampel yang kondisinya diketahui (UNKNOWN tidak dianggap perubahan). */
export function conditionTransitions(points: LivePoint[], last: Condition | null = null): Incident[] {
  const out: Incident[] = []; let prev = last;
  for (const p of points) {
    const c = classifyCondition(p); if (c === "UNKNOWN") continue;
    if (prev !== null && c !== prev) out.push({ id: `i${p.t}`, t: p.t, from: prev, to: c, summary: describeTransition(c) });
    prev = c;
  }
  return out;
}
export type Segment = { cond: Condition; start: number; end: number };
export function segments(points: LivePoint[]): Segment[] {
  const out: Segment[] = [];
  for (const p of points) { const c = classifyCondition(p); const l = out[out.length - 1]; if (l && l.cond === c) l.end = p.t; else out.push({ cond: c, start: p.t, end: p.t }); }
  return out;
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Lonjakan trafik: nilai jauh di atas median (median + 5×MAD), ≥ 2× median, dan ≥ minAbs bps. Butuh ≥ 8 sampel. */
export function detectSpikes(series: (number | null)[], minAbs = 1_000_000): number[] {
  const v = series.filter(num); if (v.length < 8) return [];
  const m = median(v); const mad = median(v.map((x) => Math.abs(x - m))) || m * 0.1;
  const thr = Math.max(m + 5 * mad, m * 2, minAbs); const idx: number[] = [];
  series.forEach((x, i) => { if (num(x) && x > thr) idx.push(i); }); return idx;
}
export type Hint = { text: string; evidence: string };
export function bottleneckHints(points: LivePoint[], router?: { rxBps: number | null; txBps: number | null; maxDownBps: number | null; maxUpBps: number | null }): Hint[] {
  const recent = points.slice(-30); if (recent.length < 5) return [];
  const gw = summarize(recent.map((p) => p.gwRtt)), gl = summarize(recent.map((p) => p.gwLoss)), ir = summarize(recent.map((p) => p.inetRtt)), il = summarize(recent.map((p) => p.inetLoss));
  const h: Hint[] = []; const f = (x: Summary | null, u: string) => (x ? `${x.avg.toFixed(1)} ${u}` : "—");
  const gwBad = (gw && gw.avg > 100) || (gl && gl.avg >= 2); const inBad = (ir && ir.avg > 150) || (il && il.avg >= 2);
  if (gwBad) h.push({ text: "Latency/loss ke gateway tinggi: kemungkinan masalah di jaringan lokal (Wi-Fi/kabel/router).", evidence: `gateway rata-rata ${f(gw, "ms")}, loss ${f(gl, "%")} (${recent.length} sampel)` });
  else if (inBad) h.push({ text: "Gateway normal tetapi internet bermasalah: indikasi hambatan setelah router (WAN/ISP/rute ke target).", evidence: `gateway ${f(gw, "ms")}; internet ${f(ir, "ms")}, loss ${f(il, "%")}` });
  if (router?.maxDownBps && router.rxBps !== null && router.rxBps / router.maxDownBps > 0.8) h.push({ text: "Trafik download WAN router mendekati kapasitas link yang dilaporkan router.", evidence: `${(router.rxBps / 1e6).toFixed(1)} Mbps dari ${(router.maxDownBps / 1e6).toFixed(0)} Mbps (counter UPnP router)` });
  if (router?.maxUpBps && router.txBps !== null && router.txBps / router.maxUpBps > 0.8) h.push({ text: "Trafik upload WAN router mendekati kapasitas link yang dilaporkan router.", evidence: `${(router.txBps / 1e6).toFixed(1)} Mbps dari ${(router.maxUpBps / 1e6).toFixed(0)} Mbps (counter UPnP router)` });
  return h;
}
// ---------- agregasi jangka panjang (bucket 10 menit) ----------
export const BUCKET_MS = 600_000; export const MAX_BUCKETS = 2016; // 14 hari
const acc = (): Acc => ({ s: 0, n: 0, m: 0 }); const r1 = (x: number) => Math.round(x * 10) / 10;
const put = (a: Acc, v: number | null) => { if (v !== null && Number.isFinite(v)) { a.s = r1(a.s + v); a.n++; a.m = Math.max(a.m, v); } };
export type SampleIn = { t: number; cond: Condition; gwRtt: number | null; gwLoss: number | null; inRtt: number | null; inLoss: number | null; pcRx: number | null; pcTx: number | null; rtRx: number | null; rtTx: number | null; dtSec: number | null };
export function addSample(list: Bucket[], s: SampleIn): Bucket[] {
  const t0 = Math.floor(s.t / BUCKET_MS) * BUCKET_MS; const out = list.slice(); let b = out[out.length - 1];
  if (!b || b.t !== t0) { if (b && b.t > t0) return list; b = { t: t0, n: 0, c: [0, 0, 0, 0, 0], gwRtt: acc(), inRtt: acc(), gwLoss: acc(), inLoss: acc(), pcRx: acc(), pcTx: acc(), rtRx: acc(), rtTx: acc(), by: { pcRx: 0, pcTx: 0, rtRx: 0, rtTx: 0 } }; out.push(b); } else { b = { ...b, c: [...b.c] as Bucket["c"], by: { ...b.by }, gwRtt: { ...b.gwRtt }, inRtt: { ...b.inRtt }, gwLoss: { ...b.gwLoss }, inLoss: { ...b.inLoss }, pcRx: { ...b.pcRx }, pcTx: { ...b.pcTx }, rtRx: { ...b.rtRx }, rtTx: { ...b.rtTx } }; out[out.length - 1] = b; }
  b.n++; b.c[["NORMAL", "DEGRADED", "GATEWAY_DOWN", "INTERNET_DOWN", "UNKNOWN"].indexOf(s.cond)]++;
  put(b.gwRtt, s.gwRtt); put(b.inRtt, s.inRtt); put(b.gwLoss, s.gwLoss); put(b.inLoss, s.inLoss); put(b.pcRx, s.pcRx); put(b.pcTx, s.pcTx); put(b.rtRx, s.rtRx); put(b.rtTx, s.rtTx);
  if (s.dtSec !== null && s.dtSec > 0) for (const k of ["pcRx", "pcTx", "rtRx", "rtTx"] as const) { const v = s[k]; if (v !== null) b.by[k] = Math.round(b.by[k] + (v * s.dtSec) / 8); }
  return out.slice(-MAX_BUCKETS);
}
export type Report = {
  label: string; from: number; to: number; samples: number; coveredMin: number; uptimePct: number | null; counts: Record<Condition, number>;
  gwRttAvg: number | null; gwRttMax: number | null; inRttAvg: number | null; inRttMax: number | null; gwLossAvg: number | null; inLossAvg: number | null;
  pcRxAvg: number | null; pcRxMax: number | null; pcTxAvg: number | null; pcTxMax: number | null; rtRxAvg: number | null; rtRxMax: number | null; rtTxAvg: number | null; rtTxMax: number | null;
  bytes: { pcRx: number; pcTx: number; rtRx: number; rtTx: number }; incidents: number;
};
const merge = (bs: Bucket[], k: "gwRtt" | "inRtt" | "gwLoss" | "inLoss" | "pcRx" | "pcTx" | "rtRx" | "rtTx") => { let s = 0, n = 0, m = 0; for (const b of bs) { s += b[k].s; n += b[k].n; m = Math.max(m, b[k].m); } return { avg: n ? s / n : null, max: n ? m : null }; };
export function buildReport(buckets: Bucket[], from: number, to: number, label: string, incidents: Incident[] = []): Report {
  const bs = buckets.filter((b) => b.t + BUCKET_MS > from && b.t <= to); const c = [0, 0, 0, 0, 0]; let n = 0; const by = { pcRx: 0, pcTx: 0, rtRx: 0, rtTx: 0 };
  for (const b of bs) { n += b.n; b.c.forEach((x, i) => (c[i] += x)); for (const k of ["pcRx", "pcTx", "rtRx", "rtTx"] as const) by[k] += b.by[k]; }
  const known = c[0] + c[1] + c[2] + c[3]; const g = (k: Parameters<typeof merge>[1]) => merge(bs, k);
  return { label, from, to, samples: n, coveredMin: bs.length * (BUCKET_MS / 60000), uptimePct: known ? ((c[0] + c[1]) / known) * 100 : null,
    counts: { NORMAL: c[0], DEGRADED: c[1], GATEWAY_DOWN: c[2], INTERNET_DOWN: c[3], UNKNOWN: c[4] },
    gwRttAvg: g("gwRtt").avg, gwRttMax: g("gwRtt").max, inRttAvg: g("inRtt").avg, inRttMax: g("inRtt").max, gwLossAvg: g("gwLoss").avg, inLossAvg: g("inLoss").avg,
    pcRxAvg: g("pcRx").avg, pcRxMax: g("pcRx").max, pcTxAvg: g("pcTx").avg, pcTxMax: g("pcTx").max, rtRxAvg: g("rtRx").avg, rtRxMax: g("rtRx").max, rtTxAvg: g("rtTx").avg, rtTxMax: g("rtTx").max,
    bytes: by, incidents: incidents.filter((i) => i.t >= from && i.t <= to && i.to !== "NORMAL").length };
}
const cell = (v: number | null, d = 1) => (v === null ? "" : String(Math.round(v * 10 ** d) / 10 ** d));
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
/** CSV laporan: kolom Sumber=LIVE; nilai tidak tersedia = sel kosong (bukan 0). Throughput komputer dan router dipisah. */
export function reportCsv(r: Report): string {
  const rows: [string, string, string][] = [
    ["Periode mulai", new Date(r.from).toISOString(), ""], ["Periode akhir", new Date(r.to).toISOString(), ""], ["Sampel", String(r.samples), "sampel"], ["Cakupan data", String(r.coveredMin), "menit"],
    ["Ketersediaan (gateway/internet terjangkau)", cell(r.uptimePct), "%"], ["Insiden", String(r.incidents), "kejadian"],
    ["Latency gateway rata-rata", cell(r.gwRttAvg), "ms"], ["Latency gateway maks (rata-rata sampel)", cell(r.gwRttMax), "ms"], ["Latency internet rata-rata", cell(r.inRttAvg), "ms"], ["Latency internet maks", cell(r.inRttMax), "ms"],
    ["Packet loss gateway rata-rata", cell(r.gwLossAvg), "%"], ["Packet loss internet rata-rata", cell(r.inLossAvg), "%"],
    ["Komputer: download rata-rata", cell(r.pcRxAvg === null ? null : r.pcRxAvg / 1e6, 2), "Mbps"], ["Komputer: download maks", cell(r.pcRxMax === null ? null : r.pcRxMax / 1e6, 2), "Mbps"],
    ["Komputer: upload rata-rata", cell(r.pcTxAvg === null ? null : r.pcTxAvg / 1e6, 2), "Mbps"], ["Komputer: upload maks", cell(r.pcTxMax === null ? null : r.pcTxMax / 1e6, 2), "Mbps"],
    ["Komputer: total masuk", cell(r.bytes.pcRx / 1e6, 1), "MB"], ["Komputer: total keluar", cell(r.bytes.pcTx / 1e6, 1), "MB"],
    ["Router (UPnP): download rata-rata", cell(r.rtRxAvg === null ? null : r.rtRxAvg / 1e6, 2), "Mbps"], ["Router (UPnP): upload rata-rata", cell(r.rtTxAvg === null ? null : r.rtTxAvg / 1e6, 2), "Mbps"],
    ["Router (UPnP): total masuk", r.rtRxAvg === null ? "" : cell(r.bytes.rtRx / 1e6, 1), "MB"], ["Router (UPnP): total keluar", r.rtTxAvg === null ? "" : cell(r.bytes.rtTx / 1e6, 1), "MB"],
  ];
  return "\ufeff" + ["Sumber,Laporan,Metrik,Nilai,Satuan", ...rows.map(([m, v, u]) => ["LIVE", q(r.label), q(m), q(v), q(u)].join(","))].join("\r\n");
}
// ---------- CSV pendukung (semua berlabel sumber; nilai tidak tersedia = sel kosong) ----------
import type { BwPoint, KnownDevice } from "@/types";
const iso = (t: number) => new Date(t).toISOString();
const mb = (v: number | null) => (v === null ? "" : String(Math.round((v / 1e6) * 100) / 100));
export function bwCsv(points: BwPoint[]): string {
  return "\ufeff" + ["Sumber,Waktu (ISO),Komputer download (Mbps),Komputer upload (Mbps),Router WAN download (Mbps),Router WAN upload (Mbps)", ...points.map((p) => ["LIVE", iso(p.t), mb(p.pcRx), mb(p.pcTx), mb(p.rtRx), mb(p.rtTx)].join(","))].join("\r\n");
}
export function devicesCsv(list: KnownDevice[]): string {
  const role = (r: KnownDevice["role"]) => (r === "gateway" ? "Gateway (rute default)" : r === "this-computer" ? "Komputer ini" : "Tidak diketahui");
  return "\ufeff" + ["Sumber,IP,MAC,Hostname,Jenis,Status,Pertama terlihat,Terakhir terlihat,MAC privat", ...list.map((d) => ["LIVE", d.ip, d.mac ?? "", q(d.hostname ?? ""), q(role(d.role)), d.online === null ? "tidak diketahui" : d.online ? "online" : "offline", iso(d.firstSeen), iso(d.lastSeen), d.privateMac ? "ya" : "tidak"].join(","))].join("\r\n");
}
export function incidentsCsv(list: Incident[]): string {
  return "\ufeff" + ["Sumber,Waktu (ISO),Dari,Ke,Ringkasan", ...list.map((i) => ["LIVE", iso(i.t), i.from, i.to, q(i.summary)].join(","))].join("\r\n");
}
