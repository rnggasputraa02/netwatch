// Ringkas keluaran `npm audit --json` (npm v7+): direct vs transitive, tingkat, advisory, dan apakah perbaikan semver-compatible tersedia.
// Pakai:  npm audit --json > audit.json   lalu   node scripts/audit-report.mjs audit.json
// (`npm audit --omit=dev --json` untuk hanya dependensi produksi.) Skrip ini hanya membaca berkas; tidak mengubah apa pun.
import { readFileSync } from "node:fs";
const file = process.argv[2]; if (!file) { console.error("Pemakaian: node scripts/audit-report.mjs audit.json"); process.exit(2); }
let j; try { j = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, "")); } catch (e) { console.error("Berkas bukan JSON valid:", e.message); process.exit(2); }
if (j.error) { console.error("npm audit gagal:", j.error.summary ?? JSON.stringify(j.error)); process.exit(2); }
const v = j.vulnerabilities ?? {}; const order = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
const rows = Object.values(v).sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.name.localeCompare(b.name));
console.log("Ringkasan npm:", JSON.stringify(j.metadata?.vulnerabilities ?? {}));
console.log("severity | paket | direct? | advisory (GHSA/judul) | rentang rentan | perbaikan");
for (const r of rows) {
  const adv = (r.via ?? []).filter((x) => typeof x === "object").map((x) => `${x.url?.split("/").pop() ?? x.source}: ${x.title}`).join("; ") || `via ${(r.via ?? []).join(", ")}`;
  const fx = r.fixAvailable === true ? "semver-compatible (npm audit fix)" : r.fixAvailable && typeof r.fixAvailable === "object" ? `${r.fixAvailable.name}@${r.fixAvailable.version}${r.fixAvailable.isSemVerMajor ? " (MAJOR — perlu analisis dampak)" : ""}` : "TIDAK ADA perbaikan";
  console.log([r.severity, r.name, r.isDirect ? "direct" : "transitive", adv, r.range ?? "?", fx].join(" | "));
}
