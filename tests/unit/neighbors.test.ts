import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { isPrivateMac, parseArpWindows, parseNetAdapterJson, parseProcNetArp, parseProcNetDev, usableNeighbor } from "../../src/lib/live/neighbors.ts";
// FIXTURE tertulis (format `arp -a` Windows), bukan rekaman mesin Windows.
const ARP_WIN = `Interface: 192.168.1.23 --- 0x7
  Internet Address      Physical Address      Type
  192.168.1.1           a4-99-47-12-34-56     dynamic
  192.168.1.40          3a-11-22-33-44-55     dinamis
  192.168.1.255         ff-ff-ff-ff-ff-ff     static
  224.0.0.22            01-00-5e-00-00-16     static
  239.255.255.250       01-00-5e-7f-ff-fa     static
  255.255.255.255       ff-ff-ff-ff-ff-ff     static`;
test("parseArpWindows: Inggris/Indonesia, membuang broadcast/multicast, MAC dinormalkan", () => {
  const r = parseArpWindows(ARP_WIN); assert.deepEqual(r, [{ ip: "192.168.1.1", mac: "a4:99:47:12:34:56" }, { ip: "192.168.1.40", mac: "3a:11:22:33:44:55" }]);
});
test("parseProcNetArp: entri tidak lengkap (0x0) dibuang", () => {
  const t = "IP address       HW type     Flags       HW address            Mask     Device\n192.168.1.5 0x1 0x2 aa:bb:cc:dd:ee:01 * wlan0\n192.168.1.6 0x1 0x0 00:00:00:00:00:00 * wlan0\n";
  assert.deepEqual(parseProcNetArp(t), [{ ip: "192.168.1.5", mac: "aa:bb:cc:dd:ee:01" }]);
});
test("usableNeighbor dan isPrivateMac (locally administered bit)", () => {
  assert.ok(!usableNeighbor({ ip: "127.0.0.1", mac: "aa:bb:cc:dd:ee:ff" })); assert.ok(!usableNeighbor({ ip: "1.1.1", mac: "aa:bb:cc:dd:ee:ff" })); assert.ok(!usableNeighbor({ ip: "10.0.0.1", mac: "zz" }));
  assert.ok(isPrivateMac("3a:11:22:33:44:55")); assert.ok(isPrivateMac("02:00:00:00:00:01")); assert.ok(!isPrivateMac("a4:99:47:12:34:56"));
});
test("parseProcNetDev dan parseNetAdapterJson (objek tunggal, larik, rusak)", () => {
  const dev = "Inter-|   Receive                                                |  Transmit\n face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n  eth0: 1000 10 0 0 0 0 0 0 2000 20 0 0 0 0 0 0\n    lo: 5 1 0 0 0 0 0 0 5 1 0 0 0 0 0 0\n";
  assert.deepEqual(parseProcNetDev(dev), [{ name: "eth0", rx: 1000, tx: 2000 }, { name: "lo", rx: 5, tx: 5 }]);
  assert.deepEqual(parseNetAdapterJson('{"Name":"Wi-Fi","ReceivedBytes":12,"SentBytes":34}'), [{ name: "Wi-Fi", rx: 12, tx: 34 }]);
  assert.equal(parseNetAdapterJson('\uFEFF[{"Name":"A","ReceivedBytes":1,"SentBytes":2},{"Name":"B","ReceivedBytes":"x"}]').length, 1); assert.deepEqual(parseNetAdapterJson("bukan json"), []);
});
test("INTEGRASI Linux (berkas sistem sungguhan): /proc/net/dev dan /proc/net/arp terbaca tanpa error", { skip: !existsSync("/proc/net/dev") }, () => {
  const d = parseProcNetDev(readFileSync("/proc/net/dev", "utf8")); assert.ok(d.length >= 1); assert.ok(d.every((x) => Number.isSafeInteger(x.rx) && Number.isSafeInteger(x.tx)));
  const a = parseProcNetArp(readFileSync("/proc/net/arp", "utf8")); assert.ok(Array.isArray(a));
});
