export const CURRENT_SCHEMA = 5;
export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const SEV: Record<string, "info" | "warning" | "critical"> = { gateway_down: "critical", internet_down: "critical", new_device: "info" };
export type MigrationResult = { from: number; to: number; applied: string[]; futureVersion: boolean };
/** Migrasi skema LocalStorage. Tidak pernah menghapus data pengguna; JSON rusak dibiarkan apa adanya. Versi lebih baru dari aplikasi: tidak diubah. */
export function runMigrations(kv: KV): MigrationResult {
  const raw = kv.getItem("nw_schema"); const declared = raw === null ? NaN : Number(raw);
  const from = Number.isInteger(declared) && declared >= 0 ? declared : kv.getItem("nw3_alerts") !== null || kv.getItem("nw3_live") !== null ? 3 : kv.getItem("nw2_dev") !== null ? 2 : 0;
  if (from > CURRENT_SCHEMA) return { from, to: from, applied: [], futureVersion: true };
  const applied: string[] = [];
  if (from < 5) {
    const a = kv.getItem("nw3_alerts");
    if (a !== null) { try { const j: unknown = JSON.parse(a); if (Array.isArray(j)) { let ch = false; const out = j.map((x) => { if (typeof x === "object" && x !== null && !("severity" in x)) { ch = true; const k = String((x as { kind?: unknown }).kind); return { ...x, severity: SEV[k] ?? "warning" }; } return x; }); if (ch) { kv.setItem("nw3_alerts", JSON.stringify(out)); applied.push("alerts-severity"); } } } catch { /* biarkan */ } }
  }
  if (from !== CURRENT_SCHEMA) kv.setItem("nw_schema", String(CURRENT_SCHEMA));
  return { from, to: CURRENT_SCHEMA, applied, futureVersion: false };
}
