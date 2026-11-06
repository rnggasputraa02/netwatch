import dgram from "node:dgram";
import type { RouterStatus } from "@/types";
import { actionAllowed, isHG8145V5, MAX_XML, msearch, parseDescription, SEARCH_TARGETS, parseSoap, parseSsdp, resolveUrl, soapBody, toInt } from "./upnp-core.ts";
import { isIPv4 } from "./parse.ts";
export type HttpRes = { status: number; text: string };
export type UpnpDeps = {
  ssdp: (a: { bindIp: string; gatewayIp: string }) => Promise<{ location: string; server: string | null } | null>;
  http: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<HttpRes>; now: () => number;
};
export async function ssdpDiscover(o: { bindIp: string; gatewayIp: string; targets: { host: string; port: number }[]; timeoutMs: number }): Promise<{ location: string; server: string | null } | null> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: false }); let done = false;
    const end = (v: { location: string; server: string | null } | null) => { if (done) return; done = true; clearTimeout(t); try { sock.close(); } catch { /* sudah tertutup */ } resolve(v); };
    const t = setTimeout(() => end(null), o.timeoutMs);
    sock.on("error", () => end(null));
    sock.on("message", (m, r) => { if (r.address !== o.gatewayIp) return; const p = parseSsdp(m.toString("utf8", 0, 4096)); if (p) end({ location: p.location, server: p.server }); }); // hanya balasan dari gateway
    sock.bind(0, o.bindIp, () => { try { sock.setMulticastInterface(o.bindIp); } catch { /* opsional */ } for (const g of o.targets) for (const st of SEARCH_TARGETS) sock.send(msearch(`${g.host}:${g.port}`, st), g.port, g.host, () => undefined); });
  });
}
export const realHttp: UpnpDeps["http"] = async (url, init) => {
  const res = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(3000), cache: "no-store" });
  const buf = await res.arrayBuffer(); if (buf.byteLength > MAX_XML) throw new Error("too_large");
  return { status: res.status, text: new TextDecoder().decode(buf) };
};
export const realUpnpDeps = (): UpnpDeps => ({ ssdp: (a) => ssdpDiscover({ ...a, targets: [{ host: "239.255.255.250", port: 1900 }, { host: a.gatewayIp, port: 1900 }], timeoutMs: 3000 }), http: realHttp, now: () => Date.now() });
const CAPS: RouterStatus["capabilities"] = { upnp: false, wanCounters: false, dhcpClients: "NOT_SUPPORTED", snmp: "NOT_PROBED", perDeviceTraffic: "NOT_SUPPORTED" };
async function act(d: UpnpDeps, url: string, svc: string, action: string): Promise<Record<string, string>> {
  if (!actionAllowed(svc, action)) throw new Error("action_not_allowed"); // hanya Get* yang diizinkan
  const r = await d.http(url, { method: "POST", headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPAction: `"${svc}#${action}"` }, body: soapBody(svc, action) });
  const p = parseSoap(r.text); if (p.fault || r.status >= 400) throw Object.assign(new Error("action_rejected"), { status: r.status }); return p.values;
}
/** Kueri router lewat UPnP IGD standar (baca-saja). Tidak menebak endpoint: URL hanya dari balasan SSDP gateway, dan harus menunjuk ke gateway itu sendiri. */
export async function queryRouter(o: { gatewayIp: string | null; bindIp: string | null }, d: UpnpDeps): Promise<RouterStatus> {
  const mk = (state: RouterStatus["state"], reason: string | null, extra: Partial<RouterStatus> = {}): RouterStatus => ({ source: "LIVE", ts: d.now(), state, reason, method: "upnp-igd", gatewayIp: o.gatewayIp, device: null, wan: null, capabilities: { ...CAPS }, ...extra });
  if (!o.gatewayIp || !isIPv4(o.gatewayIp)) return mk("UNKNOWN", "gateway_not_found"); if (!o.bindIp) return mk("UNKNOWN", "no_active_interface");
  const found = await d.ssdp({ bindIp: o.bindIp, gatewayIp: o.gatewayIp }).catch(() => null); if (!found) return mk("UNKNOWN", "upnp_no_response");
  const loc = resolveUrl(found.location, null, found.location, o.gatewayIp); if (!loc) return mk("NOT_SUPPORTED", "location_not_gateway");
  let desc; try { const r = await d.http(loc); if (r.status !== 200) return mk("UNREACHABLE", "description_unreachable", { capabilities: { ...CAPS, upnp: true } }); desc = parseDescription(r.text); } catch { return mk("UNREACHABLE", "description_unreachable", { capabilities: { ...CAPS, upnp: true } }); }
  if (!desc) return mk("NOT_SUPPORTED", "description_invalid");
  const device = { friendlyName: desc.friendlyName, manufacturer: desc.manufacturer, modelName: desc.modelName, modelNumber: desc.modelNumber };
  const find = (re: RegExp) => desc.services.find((s) => re.test(s.type)); const common = find(/WANCommonInterfaceConfig/); const conn = find(/WANIPConnection|WANPPPConnection/);
  const url = (s?: { controlUrl: string }) => (s ? resolveUrl(loc, desc.urlBase, s.controlUrl, o.gatewayIp as string) : null); const cu = url(common);
  if (!common || !cu) return mk("NOT_SUPPORTED", "no_wan_counters", { device, capabilities: { ...CAPS, upnp: true } });
  const caps = { ...CAPS, upnp: true, wanCounters: true }; let rx: number | null, tx: number | null;
  try { rx = toInt((await act(d, cu, common.type, "GetTotalBytesReceived")).NewTotalBytesReceived); tx = toInt((await act(d, cu, common.type, "GetTotalBytesSent")).NewTotalBytesSent); }
  catch (e) { const rejected = (e as Error).message === "action_rejected"; return mk(rejected ? "NOT_SUPPORTED" : "UNREACHABLE", rejected ? "counters_rejected" : "counters_unreachable", { device, capabilities: { ...caps, wanCounters: false } }); }
  const opt = async (svc: typeof common | undefined, u: string | null, action: string) => { if (!svc || !u) return {} as Record<string, string>; try { return await act(d, u, svc.type, action); } catch { return {} as Record<string, string>; } };
  const link = await opt(common, cu, "GetCommonLinkProperties"); const cc = url(conn); const st = await opt(conn, cc, "GetStatusInfo"); const ext = await opt(conn, cc, "GetExternalIPAddress");
  const ip = ext.NewExternalIPAddress; const bps = (v?: string) => toInt(v);
  return mk("OK", null, { device, capabilities: caps, wan: { connectionStatus: st.NewConnectionStatus ?? null, uptimeSec: toInt(st.NewUptime), externalIp: ip && isIPv4(ip) ? ip : null, rxBytes: rx, txBytes: tx, maxDownBps: bps(link.NewLayer1DownstreamMaxBitRate), maxUpBps: bps(link.NewLayer1UpstreamMaxBitRate) } });
}
export { isHG8145V5 };
