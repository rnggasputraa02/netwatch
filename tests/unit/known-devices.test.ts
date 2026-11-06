import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeKnown } from "../../src/lib/known-devices.ts";
import type { DiscoveryResult } from "../../src/types/index.ts";
const R = (hosts: { ip: string; mac: string | null; hostname?: string | null }[], over: Partial<DiscoveryResult["status"]> = {}): DiscoveryResult => ({
  status: { state: "done", mode: "active", startedAt: 1, finishedAt: 1000, total: 253, probed: 253, found: hosts.length, subnet: "192.168.1.0/24", reason: null, stopped: false, ...over },
  hosts: hosts.map((h) => ({ ip: h.ip, mac: h.mac, hostname: h.hostname ?? null, responded: true, via: "ping+arp" as const })), self: { ip: "192.168.1.23", mac: "aa:bb:cc:dd:ee:ff", name: "Wi-Fi" }, gatewayIp: "192.168.1.1",
});
test("mergeKnown: perangkat baru ditambahkan, gateway/komputer ini diberi peran, perangkat sendiri tidak dihitung 'baru'", () => {
  const m = mergeKnown([], R([{ ip: "192.168.1.1", mac: "a4:99:47:12:34:56" }, { ip: "192.168.1.40", mac: "3A:11:22:33:44:55" }]));
  assert.equal(m.known.length, 3); assert.deepEqual(m.added.map((a) => a.ip).sort(), ["192.168.1.1", "192.168.1.40"]); assert.equal(m.known.find((k) => k.ip === "192.168.1.1")!.role, "gateway"); assert.equal(m.known.find((k) => k.ip === "192.168.1.23")!.role, "this-computer");
  assert.equal(m.known.find((k) => k.ip === "192.168.1.40")!.privateMac, true); assert.equal(m.known.find((k) => k.ip === "192.168.1.40")!.mac, "3a:11:22:33:44:55");
});
test("mergeKnown: perangkat yang sama (MAC sama) pindah IP tidak dianggap baru; lastSeen = waktu pemindaian; hostname lama dipertahankan", () => {
  const a = mergeKnown([], R([{ ip: "192.168.1.40", mac: "3a:11:22:33:44:55", hostname: "hp-andi" }])); const b = mergeKnown(a.known, { ...R([{ ip: "192.168.1.88", mac: "3a:11:22:33:44:55" }]), status: { ...R([]).status, finishedAt: 5000 } });
  assert.equal(b.added.length, 0); const k = b.known.find((x) => x.mac === "3a:11:22:33:44:55")!; assert.deepEqual([k.ip, k.hostname, k.firstSeen, k.lastSeen], ["192.168.1.88", "hp-andi", 1000, 5000]);
});
test("mergeKnown: offline hanya setelah pemindaian aktif selesai penuh; pasif/dihentikan/ping tidak tersedia tidak menandai offline", () => {
  const base = mergeKnown([], R([{ ip: "192.168.1.40", mac: "3a:11:22:33:44:55" }, { ip: "192.168.1.50", mac: "b8:00:00:00:00:50" }])).known;
  const next = (over: Partial<DiscoveryResult["status"]>) => mergeKnown(base, R([{ ip: "192.168.1.40", mac: "3a:11:22:33:44:55" }], over)).known.find((k) => k.ip === "192.168.1.50")!.online;
  assert.equal(next({}), false); assert.equal(next({ mode: "passive" }), true); assert.equal(next({ stopped: true }), true); assert.equal(next({ reason: "ping_unavailable" }), true);
  const other = mergeKnown([{ ...base[0], ip: "10.9.9.9", mac: "c0:00:00:00:00:01", id: "mc0", online: true }], R([])).known.find((k) => k.id === "mc0")!; assert.equal(other.online, true, "di luar subnet pemindaian tidak disentuh");
});
test("mergeKnown: tanpa MAC dicocokkan lewat IP; batas jumlah riwayat", () => {
  const a = mergeKnown([], R([{ ip: "192.168.1.60", mac: null }])); assert.equal(mergeKnown(a.known, R([{ ip: "192.168.1.60", mac: null }])).added.length, 0);
  const many = Array.from({ length: 320 }, (_, i) => ({ ip: `10.0.${i >> 8}.${i & 255}`, mac: `02:00:00:00:${(i >> 8).toString(16).padStart(2, "0")}:${(i & 255).toString(16).padStart(2, "0")}` })); assert.equal(mergeKnown([], R(many, { subnet: "10.0.0.0/16" })).known.length, 300);
});
