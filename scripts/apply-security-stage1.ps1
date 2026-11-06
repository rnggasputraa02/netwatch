# v2: `npm audit` / `npm audit fix` keluar dengan kode 1 selama masih ada vulnerability — itu BUKAN kegagalan; sebelumnya skrip salah berhenti di sini.
# Pemakaian ulang setelah instalasi sudah berhasil: powershell -ExecutionPolicy Bypass -File scripts\apply-security-stage1.ps1 -VerifyOnly
param([switch]$VerifyOnly)
# Tahap 1 perbaikan dependensi (kompatibel, TANPA --force, TANPA Next major). Jalankan di folder netwatch, butuh akses registry.
# Aman: membuat cadangan package.json/package-lock.json; berhenti di galat pertama; rollback = salin balik cadangan lalu `npm ci`.
$ErrorActionPreference = "Stop"
function Step($name, [scriptblock]$cmd) { Write-Host "== $name"; & $cmd; if ($LASTEXITCODE -ne 0) { throw "GAGAL: $name (exit $LASTEXITCODE). Rollback: Copy-Item package.json.bak package.json -Force; Copy-Item package-lock.json.bak package-lock.json -Force; npm ci" } }
if (-not $VerifyOnly) {
Copy-Item package.json package.json.bak -Force; Copy-Item package-lock.json package-lock.json.bak -Force
Step "npm ci (baseline)" { npm ci }
npm audit --json | Out-File -Encoding utf8 audit-before.json      # exit 1 saat ada vulnerability: wajar
Step "Playwright -> 1.64.1 (non-major, versi dari audit)" { npm install -D --save-exact "@playwright/test@1.64.1" }
Step "PostCSS top-level -> 8.x terbaru" { npm install -D "postcss@8" }
npm audit fix          # tanpa --force; exit 1 dibiarkan (sisa vulnerability), perubahan dicek lewat git diff/lockfile
}
Step "npm ci (lockfile baru)" { npm ci }
Step "typecheck" { npm run typecheck }
Step "lint" { npm run lint }
Step "build" { npm run build }
Step "unit" { npm run test:unit }
Step "playwright install chromium" { npx playwright install chromium }
Step "shortcuts" { npm run test:shortcuts }
Step "E2E" { npm run test:e2e }
npm audit --json | Out-File -Encoding utf8 audit-after.json
node scripts/audit-report.mjs audit-after.json
Write-Host "Selesai. Kirim audit-after.json dan hasil tiap langkah. Perkiraan sisa: next, postcss (salinan di dalam next), eslint-config-next, @next/eslint-plugin-next, glob, minimatch (milik glob) = Next major (tahap 2)."
