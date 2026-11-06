import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// LocalStorage tiruan; modul storage dibaca lewat window.localStorage.
const data = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) },
};
const S = await import("../../src/lib/storage/index.ts");
beforeEach(() => data.clear());

const dev = (id: string, extra: object = {}) => ({ id, name: `D${id}`, ip: `10.0.0.${id}`, mac: "02:00:5E:10:00:10", os: "X", type: "Laptop", online: true, bw: 5, seen: 1, ...extra });
const log = (id: string, extra: object = {}) => ({ id, t: 1, type: "Sistem", name: "n", desc: "d", pr: "Rendah", ...extra });

test("loadList membuang hanya entri rusak, bukan seluruh daftar", () => {
  data.set("k", JSON.stringify([dev("1"), { id: "2" }, dev("3", { bw: "x" }), null, 5, dev("4")]));
  assert.deepEqual(S.loadList("k", [], S.isDevice).map((d) => d.id), ["1", "4"]);
});
test("loadList membuang id ganda dan menghormati batas jumlah", () => {
  data.set("k", JSON.stringify([dev("1"), dev("1"), dev("2"), dev("3")]));
  assert.deepEqual(S.loadList("k", [], S.isDevice).map((d) => d.id), ["1", "2", "3"]);
  assert.equal(S.loadList("k", [], S.isDevice, 2).length, 2);
});
test("loadList memakai fallback untuk kosong, JSON rusak, atau bukan array", () => {
  const fb = [dev("9")];
  assert.equal(S.loadList("none", fb, S.isDevice), fb);
  data.set("k", "{bukan json"); assert.equal(S.loadList("k", fb, S.isDevice), fb);
  data.set("k", '{"a":1}'); assert.equal(S.loadList("k", fb, S.isDevice), fb);
});
test("loadList mempertahankan daftar kosong yang valid", () => {
  data.set("k", "[]"); assert.deepEqual(S.loadList("k", [dev("9")], S.isDevice), []);
});
test("isLog menolak jenis atau prioritas di luar enum", () => {
  data.set("k", JSON.stringify([log("1"), log("2", { type: "Aneh" }), log("3", { pr: "Kritis" }), log("4", { t: "x" })]));
  assert.deepEqual(S.loadList("k", [], S.isLog).map((l) => l.id), ["1"]);
});
test("loadSettings: bidang rusak jatuh ke bawaan, bidang valid dipertahankan", () => {
  const def = { interval: 2, paused: false, collapsed: false, animLevel: "subtle", perf: "normal" } as const;
  data.set("nw2_cfg", JSON.stringify({ interval: 0, paused: true, collapsed: "x", animLevel: "full", perf: "turbo" }));
  assert.deepEqual(S.loadSettings(def), { interval: 2, paused: true, collapsed: false, animLevel: "full", perf: "normal" });
  data.set("nw2_cfg", "[]"); assert.deepEqual(S.loadSettings(def), def);
  data.set("nw2_cfg", "rusak"); assert.deepEqual(S.loadSettings(def), def);
});
test("interval tidak valid (0, negatif, NaN, terlalu besar) ditolak agar timer tidak berputar liar", () => {
  for (const interval of [0, -1, 61, null, "2"]) {
    data.set("nw2_cfg", JSON.stringify({ interval })); assert.equal(S.loadSettings({ interval: 2, paused: false, collapsed: false, animLevel: "subtle", perf: "normal" }).interval, 2);
    assert.equal(S.isSettings({ interval, paused: false, collapsed: false, animLevel: "off", perf: "normal" }), false);
  }
});
test("loadHistory membuang titik rusak satu per satu, mengurutkan, dan membatasi 1800 titik", () => {
  const pts = [{ t: 3, down: 1, up: 1 }, { t: 1, down: 1, up: 1 }, { t: 2, down: "x", up: 1 }, { t: NaN, down: 1, up: 1 }, null, { t: 4, down: 1, up: 1 }];
  data.set("nw2_hist", JSON.stringify(pts));
  assert.deepEqual(S.loadHistory().map((p) => p.t), [1, 3, 4]);
  data.set("nw2_hist", JSON.stringify(Array.from({ length: 2500 }, (_, i) => ({ t: i, down: 1, up: 1 }))));
  const h = S.loadHistory(); assert.equal(h.length, S.MAX_HISTORY); assert.equal(h[h.length - 1].t, 2499);
  data.set("nw2_hist", "bukan json"); assert.deepEqual(S.loadHistory(), []);
  data.set("nw2_hist", '{"a":1}'); assert.deepEqual(S.loadHistory(), []);
});
test("save mengembalikan false saat penyimpanan gagal, tanpa melempar", () => {
  const w = (globalThis as unknown as { window: { localStorage: { setItem: () => void } } }).window;
  const orig = w.localStorage.setItem; w.localStorage.setItem = () => { throw new Error("quota"); };
  try { assert.equal(S.save("k", { a: 1 }), false); } finally { w.localStorage.setItem = orig; }
});
