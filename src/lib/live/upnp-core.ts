import { isIPv4 } from "./parse.ts";
/** Bagian murni dari klien UPnP IGD: parser SSDP/XML/SOAP dan allow-list aksi. Hanya aksi baca (Get*) yang diizinkan. */
export const MAX_XML = 512 * 1024;
export const ALLOWED: Record<string, readonly string[]> = {
  WANCommonInterfaceConfig: ["GetTotalBytesReceived", "GetTotalBytesSent", "GetCommonLinkProperties"],
  WANIPConnection: ["GetStatusInfo", "GetExternalIPAddress"], WANPPPConnection: ["GetStatusInfo", "GetExternalIPAddress"],
};
const SVC = /^urn:schemas-upnp-org:service:(WANCommonInterfaceConfig|WANIPConnection|WANPPPConnection):\d+$/;
export function actionAllowed(serviceType: string, action: string): boolean { const m = serviceType.match(SVC); return !!m && ALLOWED[m[1]].includes(action); }
export const SEARCH_ST = "urn:schemas-upnp-org:device:InternetGatewayDevice:1";
/** Target pencarian SSDP. Router berbeda hanya menjawab sebagian ST; semuanya baca-saja dan hanya balasan dari gateway yang diterima. */
export const SEARCH_TARGETS = [SEARCH_ST, "urn:schemas-upnp-org:device:InternetGatewayDevice:2", "upnp:rootdevice"] as const;
export const msearch = (host = "239.255.255.250:1900", st: string = SEARCH_ST) => `M-SEARCH * HTTP/1.1\r\nHOST: ${host}\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: ${st}\r\n\r\n`;
export function parseSsdp(text: string): { location: string; st: string | null; server: string | null } | null {
  const lines = text.split(/\r?\n/); if (!/^HTTP\/1\.[01] 200|^NOTIFY /i.test(lines[0] ?? "")) return null;
  const h: Record<string, string> = {}; for (const l of lines.slice(1)) { const i = l.indexOf(":"); if (i > 0) h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }
  return h.location ? { location: h.location, st: h.st ?? h.nt ?? null, server: h.server ?? null } : null;
}
const dec = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim().slice(0, 120);
const tag = (xml: string, t: string): string | null => { const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "i")); return m ? dec(m[1]) : null; };
export type Description = { friendlyName: string | null; manufacturer: string | null; modelName: string | null; modelNumber: string | null; urlBase: string | null; services: { type: string; controlUrl: string }[] };
export function parseDescription(xml: string): Description | null {
  if (xml.length > MAX_XML || !/<root[\s>]/i.test(xml)) return null;
  const services = [...xml.matchAll(/<service>([\s\S]*?)<\/service>/gi)].map((m) => ({ type: tag(m[1], "serviceType") ?? "", controlUrl: tag(m[1], "controlURL") ?? "" })).filter((s) => s.type && s.controlUrl);
  const dev = xml.match(/<device>([\s\S]*?)(?:<deviceList>|<serviceList>|<\/device>)/i)?.[1] ?? xml;
  return { friendlyName: tag(dev, "friendlyName"), manufacturer: tag(dev, "manufacturer"), modelName: tag(dev, "modelName"), modelNumber: tag(dev, "modelNumber"), urlBase: tag(xml, "URLBase"), services };
}
/** Menyelesaikan URL kontrol. Hanya http ke gateway itu sendiri yang diterima (mencegah SSRF lewat deskripsi berbahaya). */
export function resolveUrl(location: string, urlBase: string | null, path: string, gatewayIp: string): string | null {
  try {
    if (!isIPv4(gatewayIp)) return null;
    const base = new URL(urlBase && /^http:\/\//i.test(urlBase) ? urlBase : location); const u = new URL(path, base);
    if (u.protocol !== "http:" || u.hostname !== gatewayIp || (u.port !== "" && !(Number(u.port) >= 1 && Number(u.port) <= 65535))) return null; return u.href;
  } catch { return null; }
}
export const soapBody = (serviceType: string, action: string) => `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${serviceType}"/></s:Body></s:Envelope>`;
export function parseSoap(xml: string): { values: Record<string, string>; fault: { code: string | null; description: string | null } | null } {
  const values: Record<string, string> = {}; for (const m of xml.matchAll(/<(New[A-Za-z0-9]+)>([^<]*)<\/\1>/g)) values[m[1]] = dec(m[2]);
  const fault = /<(?:\w+:)?Fault>|<(?:\w+:)?UPnPError/i.test(xml) ? { code: tag(xml, "errorCode"), description: tag(xml, "errorDescription") } : null;
  return { values, fault };
}
export const toInt = (v: string | undefined): number | null => { if (v === undefined || !/^\d+$/.test(v)) return null; const n = Number(v); return Number.isSafeInteger(n) ? n : null; };
export function isHG8145V5(d: { manufacturer: string | null; modelName: string | null; modelNumber: string | null; friendlyName: string | null } | null): boolean {
  return !!d && /huawei/i.test(d.manufacturer ?? "") && /HG8145V5/i.test(`${d.modelName ?? ""} ${d.modelNumber ?? ""} ${d.friendlyName ?? ""}`);
}
