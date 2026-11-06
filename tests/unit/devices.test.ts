import { test } from "node:test";
import assert from "node:assert/strict";
import { compareDevices, growDevices, seedDevices } from "../../src/lib/simulation/index.ts";

test("growDevices tidak menghasilkan id atau IP ganda setelah perangkat di tengah dihapus", () => {
  const list = seedDevices(8).filter((d) => d.id !== "d3"); // 7 perangkat, id d8 masih ada
  const grown = growDevices(list, 12);
  assert.equal(grown.length, 12);
  assert.equal(new Set(grown.map((d) => d.id)).size, 12);
  assert.equal(new Set(grown.map((d) => d.ip)).size, 12);
});
test("growDevices menghindari IP milik perangkat buatan pengguna", () => {
  const list = seedDevices(8); list.push({ ...list[0], id: "dx1", ip: "192.168.1.70", name: "Milik pengguna" });
  const grown = growDevices(list, 20);
  assert.equal(new Set(grown.map((d) => d.ip)).size, grown.length);
  assert.equal(new Set(grown.map((d) => d.id)).size, grown.length);
});
test("growDevices memangkas bila n lebih kecil dan tidak mengubah daftar asal", () => {
  const list = seedDevices(8); const shrunk = growDevices(list, 3);
  assert.equal(shrunk.length, 3); assert.equal(list.length, 8);
});
test("compareDevices mengurutkan IP secara numerik dan nama secara natural", () => {
  const base = seedDevices(2); const mk = (ip: string, name: string) => ({ ...base[0], ip, name });
  assert.ok(compareDevices(mk("192.168.1.2", "a"), mk("192.168.1.10", "a"), "ip") < 0);
  assert.ok(compareDevices(mk("1.1.1.1", "Perangkat 2"), mk("1.1.1.1", "Perangkat 12"), "name") < 0);
  assert.equal(compareDevices(mk("1.1.1.1", "A"), mk("1.1.1.1", "a"), "name"), 0);
});
test("compareDevices menangani kolom boolean dan angka", () => {
  const [a, b] = seedDevices(2); assert.equal(Math.sign(compareDevices({ ...a, online: false }, { ...b, online: true }, "online")), -1);
  assert.equal(Math.sign(compareDevices({ ...a, bw: 5 }, { ...b, bw: 9 }, "bw")), -1);
});
