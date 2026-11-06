import { test } from "node:test";
import assert from "node:assert/strict";
import { cidrOf, inSubnet, ipToInt, isIPv4, isLoopbackHost, parseIpRouteLinux, parsePing, parseRouteWindows, prefixFromMask } from "../../src/lib/live/parse.ts";

// FIXTURE: keluaran ping/route ditulis berdasarkan format Windows/Linux yang umum; BUKAN rekaman dari mesin Windows sungguhan.
const PING_EN = `Pinging 1.1.1.1 with 32 bytes of data:
Reply from 1.1.1.1: bytes=32 time=12ms TTL=57
Reply from 1.1.1.1: bytes=32 time=14ms TTL=57
Request timed out.
Reply from 1.1.1.1: bytes=32 time<1ms TTL=57

Ping statistics for 1.1.1.1:
    Packets: Sent = 4, Received = 3, Lost = 1 (25% loss),`;
const PING_ID = `Pinging 192.168.1.1 with 32 bytes of data:
Balasan dari 192.168.1.1: bytes=32 waktu=3ms TTL=64
Balasan dari 192.168.1.1: bytes=32 waktu=5ms TTL=64
Balasan dari 192.168.1.1: bytes=32 waktu=4ms TTL=64
Balasan dari 192.168.1.1: bytes=32 waktu=4ms TTL=64`;
const PING_LINUX = `64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=9.51 ms
64 bytes from 8.8.8.8: icmp_seq=2 ttl=117 time=10.2 ms`;
const UNREACH = `Reply from 192.168.1.23: Destination host unreachable.
Reply from 192.168.1.23: Destination host unreachable.
Request timed out.
Request timed out.`;

test("parsePing: Inggris, packet loss dihitung dari balasan ber-TTL, <1ms dicatat 1", () => {
  const r = parsePing(PING_EN, 4);
  assert.equal(r.received, 3); assert.equal(r.lossPct, 25); assert.equal(r.rttMinMs, 1); assert.equal(r.rttMaxMs, 14); assert.equal(r.rttAvgMs, 9);
});
test("parsePing: Windows berbahasa Indonesia (waktu=) dan Linux (time= x.y ms)", () => {
  const a = parsePing(PING_ID, 4); assert.equal(a.lossPct, 0); assert.equal(a.rttAvgMs, 4);
  const b = parsePing(PING_LINUX, 2); assert.equal(b.received, 2); assert.equal(b.rttMinMs, 9.51);
});
test("parsePing: 100% hilang → RTT null (bukan 0); 'Destination host unreachable' bukan balasan", () => {
  const r = parsePing(UNREACH, 4);
  assert.equal(r.received, 0); assert.equal(r.lossPct, 100); assert.equal(r.rttAvgMs, null); assert.equal(r.rttMinMs, null);
});
test("parsePing: keluaran kosong tidak menghasilkan NaN", () => {
  const r = parsePing("", 4); assert.equal(r.lossPct, 100); assert.equal(r.rttAvgMs, null);
  assert.equal(parsePing("", 0).lossPct, null);
});
const ROUTE_WIN = `IPv4 Route Table
===========================================================================
Active Routes:
Network Destination        Netmask          Gateway       Interface  Metric
          0.0.0.0          0.0.0.0      192.168.1.1    192.168.1.23     35
          0.0.0.0          0.0.0.0       10.0.0.1       10.0.0.7     25
        127.0.0.0        255.0.0.0         On-link         127.0.0.1    331
===========================================================================
Persistent Routes:
  Network Address          Netmask  Gateway Address  Metric
          0.0.0.0          0.0.0.0      192.168.1.1  Default`;
test("parseRouteWindows: memilih rute default berdasarkan metrik terendah; mengabaikan On-link dan rute persisten", () => {
  const c = parseRouteWindows(ROUTE_WIN);
  assert.deepEqual(c.map((x) => x.gateway), ["10.0.0.1", "192.168.1.1"]); assert.equal(c[0].ifaceIp, "10.0.0.7");
});
test("parseIpRouteLinux: default via", () => {
  const c = parseIpRouteLinux("default via 192.168.0.1 dev wlan0 proto dhcp metric 600\ndefault via 10.1.1.1 dev eth0 metric 100\n");
  assert.equal(c[0].gateway, "10.1.1.1"); assert.equal(c[0].ifaceName, "eth0"); assert.equal(parseIpRouteLinux("").length, 0);
});
test("subnet: mask → prefix, CIDR, keanggotaan; mask tidak kontigu ditolak", () => {
  assert.equal(prefixFromMask("255.255.255.0"), 24); assert.equal(prefixFromMask("255.255.0.0"), 16); assert.equal(prefixFromMask("255.255.255.255"), 32);
  assert.equal(prefixFromMask("255.0.255.0"), null); assert.equal(prefixFromMask("abc"), null);
  assert.equal(cidrOf("192.168.1.23", "255.255.255.0"), "192.168.1.0/24"); assert.equal(cidrOf("10.20.30.40", "255.255.0.0"), "10.20.0.0/16");
  assert.ok(inSubnet("192.168.1.1", "192.168.1.23", "255.255.255.0")); assert.ok(!inSubnet("192.168.2.1", "192.168.1.23", "255.255.255.0"));
  assert.equal(ipToInt("0.0.0.1"), 1);
});
test("isIPv4 menolak injeksi perintah dan format salah", () => {
  for (const ok of ["1.1.1.1", "192.168.0.254", "0.0.0.0"]) assert.ok(isIPv4(ok));
  for (const bad of ["1.1.1", "256.1.1.1", "1.1.1.1; calc", "1.1.1.1 && dir", "$(id)", "-n 1000", "01.1.1.1", "", " 1.1.1.1", "1.1.1.1\n8.8.8.8"]) assert.ok(!isIPv4(bad), bad);
});
test("isLoopbackHost: hanya localhost/127.0.0.1/[::1] (mencegah DNS rebinding dan akses LAN)", () => {
  for (const ok of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST"]) assert.ok(isLoopbackHost(ok), ok);
  for (const bad of ["192.168.1.5:3000", "evil.com", "localhost.evil.com:3000", "0.0.0.0:3000", ""]) assert.ok(!isLoopbackHost(bad), bad);
});
