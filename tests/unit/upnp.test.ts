import { test } from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { actionAllowed, isHG8145V5, parseDescription, parseSoap, parseSsdp, resolveUrl, soapBody } from "../../src/lib/live/upnp-core.ts";
import { queryRouter, realHttp, ssdpDiscover, type UpnpDeps } from "../../src/lib/live/upnp.ts";
// FIXTURE: XML IGD ditulis mengikuti standar UPnP; BUKAN rekaman dari Huawei HG8145V5 sungguhan (firmware/endpoint sebenarnya belum diverifikasi).
const SVC = (t: string, c: string) => `<service><serviceType>urn:schemas-upnp-org:service:${t}:1</serviceType><serviceId>urn:upnp-org:serviceId:${t}</serviceId><controlURL>${c}</controlURL><eventSubURL>/e</eventSubURL><SCPDURL>/s.xml</SCPDURL></service>`;
const DESC = (extra = "") => `<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><URLBase>http://GW:49152/</URLBase><device><deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:1</deviceType><friendlyName>HG8145V5 &amp; co</friendlyName><manufacturer>Huawei Technologies Co., Ltd</manufacturer><modelName>HG8145V5</modelName><modelNumber>HG8145V5</modelNumber><deviceList><device><deviceType>urn:schemas-upnp-org:device:WANDevice:1</deviceType><serviceList>${SVC("WANCommonInterfaceConfig", "/ctl/common")}</serviceList><deviceList><device><serviceList>${SVC("WANIPConnection", "/ctl/conn")}${extra}</serviceList></device></deviceList></device></deviceList></device></root>`;
test("parseSsdp/parseDescription/parseSoap: header, entitas XML, layanan, fault", () => {
  assert.equal(parseSsdp("HTTP/1.1 404 Not Found\r\n\r\n"), null); assert.equal(parseSsdp("HTTP/1.1 200 OK\r\nST: x\r\n\r\n"), null);
  assert.deepEqual(parseSsdp("HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.1:49152/d.xml\r\nST: urn:x\r\nSERVER: Linux UPnP/1.0\r\n\r\n"), { location: "http://192.168.1.1:49152/d.xml", st: "urn:x", server: "Linux UPnP/1.0" });
  const d = parseDescription(DESC())!; assert.equal(d.friendlyName, "HG8145V5 & co"); assert.equal(d.manufacturer, "Huawei Technologies Co., Ltd"); assert.equal(d.services.length, 2); assert.equal(d.services[0].controlUrl, "/ctl/common"); assert.ok(isHG8145V5(d));
  assert.equal(parseDescription("<html>bukan upnp</html>"), null); assert.equal(isHG8145V5({ manufacturer: "Huawei", modelName: "HG8245H", modelNumber: null, friendlyName: null }), false); assert.equal(isHG8145V5(null), false);
  assert.deepEqual(parseSoap("<s:Envelope><s:Body><u:R><NewTotalBytesReceived>123</NewTotalBytesReceived></u:R></s:Body></s:Envelope>"), { values: { NewTotalBytesReceived: "123" }, fault: null });
  assert.equal(parseSoap("<s:Fault><detail><UPnPError><errorCode>401</errorCode><errorDescription>Invalid Action</errorDescription></UPnPError></detail></s:Fault>").fault?.code, "401");
});
test("resolveUrl (anti-SSRF): hanya http ke gateway sendiri; host/port/skema lain ditolak", () => {
  const L = "http://192.168.1.1:49152/d.xml";
  assert.equal(resolveUrl(L, null, "/ctl/x", "192.168.1.1"), "http://192.168.1.1:49152/ctl/x"); assert.equal(resolveUrl(L, "http://192.168.1.1:80/", "ctl/x", "192.168.1.1"), "http://192.168.1.1/ctl/x");
  for (const bad of ["http://169.254.169.254/latest", "http://192.168.1.2/ctl", "https://192.168.1.1/ctl", "http://evil.example/ctl", "ftp://192.168.1.1/x", "http://192.168.1.1:99999/x", "//10.0.0.5/x"]) assert.equal(resolveUrl(L, null, bad, "192.168.1.1"), null, bad);
  assert.equal(resolveUrl("http://10.0.0.9/d.xml", null, "/c", "192.168.1.1"), null); assert.equal(resolveUrl(L, null, "/c", "gateway.local"), null);
});
test("actionAllowed: hanya aksi baca; aksi pengubah dan layanan lain ditolak", () => {
  const C = "urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1", I = "urn:schemas-upnp-org:service:WANIPConnection:1";
  assert.ok(actionAllowed(C, "GetTotalBytesReceived") && actionAllowed(I, "GetExternalIPAddress"));
  for (const [s, a] of [[I, "AddPortMapping"], [I, "DeletePortMapping"], [I, "ForceTermination"], [I, "RequestConnection"], [C, "SetEnabledForInternet"], ["urn:schemas-upnp-org:service:Layer3Forwarding:1", "GetDefaultConnectionService"], ["urn:evil:service:WANIPConnection:1", "GetStatusInfo"]]) assert.equal(actionAllowed(s, a), false, a);
  assert.match(soapBody(C, "GetTotalBytesSent"), /<u:GetTotalBytesSent xmlns:u="urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1"\/>/);
});
const GW = "192.168.1.1";
const fake = (over: Partial<UpnpDeps> = {}, calls: string[] = []): UpnpDeps => ({
  now: () => 1000, ssdp: async () => ({ location: `http://${GW}:49152/d.xml`, server: null }),
  http: async (url, init) => {
    if (!init) { calls.push("GET " + url); return { status: 200, text: DESC().replace("GW", GW) }; }
    const a = init.headers?.SOAPAction?.split("#")[1]?.replace('"', "") ?? ""; calls.push("SOAP " + a);
    const v: Record<string, string> = { GetTotalBytesReceived: "<NewTotalBytesReceived>4294967000</NewTotalBytesReceived>", GetTotalBytesSent: "<NewTotalBytesSent>2000</NewTotalBytesSent>", GetCommonLinkProperties: "<NewLayer1UpstreamMaxBitRate>300000000</NewLayer1UpstreamMaxBitRate><NewLayer1DownstreamMaxBitRate>1000000000</NewLayer1DownstreamMaxBitRate>", GetStatusInfo: "<NewConnectionStatus>Connected</NewConnectionStatus><NewUptime>3600</NewUptime>", GetExternalIPAddress: "<NewExternalIPAddress>203.0.113.9</NewExternalIPAddress>" };
    return { status: 200, text: `<s:Envelope><s:Body>${v[a] ?? ""}</s:Body></s:Envelope>` };
  }, ...over,
});
test("queryRouter [mock]: OK membaca counter WAN, link rate, status, IP eksternal; hanya aksi Get* dipanggil", async () => {
  const calls: string[] = []; const r = await queryRouter({ gatewayIp: GW, bindIp: "192.168.1.23" }, fake({}, calls));
  assert.equal(r.state, "OK"); assert.equal(r.wan?.rxBytes, 4294967000); assert.equal(r.wan?.txBytes, 2000); assert.equal(r.wan?.maxDownBps, 1e9); assert.equal(r.wan?.connectionStatus, "Connected"); assert.equal(r.wan?.externalIp, "203.0.113.9");
  assert.equal(r.capabilities.dhcpClients, "NOT_SUPPORTED"); assert.equal(r.capabilities.perDeviceTraffic, "NOT_SUPPORTED"); assert.equal(r.capabilities.snmp, "NOT_PROBED"); assert.equal(r.device?.manufacturer, "Huawei Technologies Co., Ltd");
  assert.ok(calls.filter((c) => c.startsWith("SOAP")).every((c) => /SOAP Get/.test(c))); assert.ok(calls.every((c) => !/AddPortMapping|Delete|Set/.test(c))); assert.ok(calls[0].startsWith("GET http://192.168.1.1:"));
});
test("queryRouter [mock]: UNKNOWN bila tanpa gateway/interface/balasan; NOT_SUPPORTED bila tanpa layanan WAN, lokasi bukan gateway, atau aksi ditolak; UNREACHABLE bila HTTP gagal", async () => {
  assert.equal((await queryRouter({ gatewayIp: null, bindIp: "x" }, fake())).reason, "gateway_not_found"); assert.equal((await queryRouter({ gatewayIp: GW, bindIp: null }, fake())).reason, "no_active_interface");
  const none = await queryRouter({ gatewayIp: GW, bindIp: "a" }, fake({ ssdp: async () => null })); assert.deepEqual([none.state, none.reason, none.wan], ["UNKNOWN", "upnp_no_response", null]);
  assert.equal((await queryRouter({ gatewayIp: GW, bindIp: "a" }, fake({ ssdp: async () => ({ location: "http://169.254.169.254/x", server: null }) }))).reason, "location_not_gateway");
  const noWan = await queryRouter({ gatewayIp: GW, bindIp: "a" }, fake({ http: async () => ({ status: 200, text: DESC().replace("GW", GW).replace(/<service><serviceType>urn:schemas-upnp-org:service:WANCommonInterfaceConfig[\s\S]*?<\/service>/, "") }) })); assert.deepEqual([noWan.state, noWan.reason], ["NOT_SUPPORTED", "no_wan_counters"]);
  const rej = await queryRouter({ gatewayIp: GW, bindIp: "a" }, fake({ http: async (u, i) => (i ? { status: 500, text: "<s:Fault><UPnPError><errorCode>401</errorCode></UPnPError></s:Fault>" } : { status: 200, text: DESC().replace("GW", GW) }) })); assert.deepEqual([rej.state, rej.reason], ["NOT_SUPPORTED", "counters_rejected"]); assert.equal(rej.wan, null);
  const down = await queryRouter({ gatewayIp: GW, bindIp: "a" }, fake({ http: async () => { throw new Error("ECONNREFUSED"); } })); assert.deepEqual([down.state, down.reason], ["UNREACHABLE", "description_unreachable"]);
  const ctl = await queryRouter({ gatewayIp: GW, bindIp: "a" }, fake({ http: async (u, i) => { if (i) throw new Error("timeout"); return { status: 200, text: DESC().replace("GW", GW) }; } })); assert.deepEqual([ctl.state, ctl.reason], ["UNREACHABLE", "counters_unreachable"]);
  const bad = await queryRouter({ gatewayIp: GW, bindIp: "a" }, fake({ http: async () => ({ status: 200, text: "<html/>" }) })); assert.equal(bad.reason, "description_invalid");
});
test("INTEGRASI loopback (server UPnP palsu: UDP + HTTP sungguhan, BUKAN router asli)", async () => {
  const actions: string[] = [];
  const srv = http.createServer((req, res) => {
    if (req.method === "GET") { res.end(DESC().replace("http://GW:49152/", "").replace("<URLBase></URLBase>", "")); return; }
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => { const a = String(req.headers.soapaction).split("#")[1].replace('"', ""); actions.push(a); const v: Record<string, string> = { GetTotalBytesReceived: "<NewTotalBytesReceived>1000</NewTotalBytesReceived>", GetTotalBytesSent: "<NewTotalBytesSent>500</NewTotalBytesSent>" }; res.setHeader("Content-Type", "text/xml"); res.end(`<s:Envelope><s:Body>${v[a] ?? ""}</s:Body></s:Envelope>`); });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r)); const hp = (srv.address() as AddressInfo).port;
  const udp = dgram.createSocket("udp4"); await new Promise<void>((r) => udp.bind(0, "127.0.0.1", r)); const up = (udp.address() as AddressInfo).port;
  udp.on("message", (m, ri) => { if (m.toString().startsWith("M-SEARCH")) udp.send(`HTTP/1.1 200 OK\r\nLOCATION: http://127.0.0.1:${hp}/d.xml\r\nST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n`, ri.port, ri.address); });
  try {
    const d: UpnpDeps = { now: Date.now, http: realHttp, ssdp: (a) => ssdpDiscover({ ...a, targets: [{ host: "127.0.0.1", port: up }], timeoutMs: 2000 }) };
    const r = await queryRouter({ gatewayIp: "127.0.0.1", bindIp: "127.0.0.1" }, d); assert.equal(r.state, "OK"); assert.equal(r.wan?.rxBytes, 1000); assert.equal(r.wan?.txBytes, 500); assert.deepEqual(actions.sort(), ["GetCommonLinkProperties", "GetExternalIPAddress", "GetStatusInfo", "GetTotalBytesReceived", "GetTotalBytesSent"]);
    const wrongGw = await ssdpDiscover({ bindIp: "127.0.0.1", gatewayIp: "10.9.9.9", targets: [{ host: "127.0.0.1", port: up }], timeoutMs: 400 }); assert.equal(wrongGw, null); // balasan dari host selain gateway diabaikan
  } finally { udp.close(); srv.close(); }
});
