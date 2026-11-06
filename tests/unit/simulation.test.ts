import { test } from "node:test";
import assert from "node:assert/strict";
import { historyPoint, pickFlip, seedDevices, series, stats, stepBandwidth, traffic } from "../../src/lib/simulation/index.ts";

test("seedDevices menghasilkan id, IP, dan MAC unik untuk 3–20 perangkat", () => {
  for (const n of [3, 8, 12, 20]) {
    const d = seedDevices(n);
    assert.equal(d.length, n);
    for (const k of ["id", "ip", "mac"] as const) assert.equal(new Set(d.map((x) => x[k])).size, n, `${k} unik untuk n=${n}`);
  }
});
test("traffic deterministik dan selalu >= 2 Mbps", () => {
  assert.equal(traffic(1000, true), traffic(1000, true));
  for (let t = 0; t < 5000; t += 37) { assert.ok(traffic(t, true) >= 2); assert.ok(traffic(t, false) >= 2); }
});
test("historyPoint memuat t, down, up berhingga", () => {
  const p = historyPoint(1_700_000_000_000);
  assert.equal(p.t, 1_700_000_000_000); assert.ok(Number.isFinite(p.down) && Number.isFinite(p.up));
});
test("series menghasilkan n titik dan stats konsisten", () => {
  const s = series(300, true, 50, 1_700_000_000_000); assert.equal(s.length, 50);
  const st = stats(s); assert.ok(st.min <= st.avg && st.avg <= st.max);
});
test("stepBandwidth: perangkat offline tidak berubah; bandwidth tetap di 1–90", () => {
  const list = seedDevices(8); let cur = list;
  for (let i = 0; i < 500; i++) cur = stepBandwidth(cur, 1_700_000_000_000 + i * 2000);
  cur.forEach((d, i) => { if (!list[i].online) assert.deepEqual(d, list[i]); else assert.ok(d.bw >= 1 && d.bw <= 90); });
});
test("pickFlip hanya memilih perangkat saat r1 < 0.06 dan daftar tidak kosong", () => {
  const list = seedDevices(5);
  assert.equal(pickFlip(list, 0.5, 0.2), null); assert.equal(pickFlip([], 0.01, 0.2), null);
  assert.equal(pickFlip(list, 0.01, 0.99)?.id, list[4].id); assert.equal(pickFlip(list, 0.01, 0)?.id, list[0].id);
});
