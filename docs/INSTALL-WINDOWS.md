# Instalasi di Windows

Prasyarat: Windows 10/11, Node.js ≥ 22.6 (baseline diuji di v24.21.0), PowerShell bawaan. Tanpa hak administrator.
```powershell
cd netwatch
npm ci
npm run build
npm start          # mengikat ke 127.0.0.1:3000
```
Buka `http://localhost:3000`. Jangan memakai `next start` langsung tanpa `-H 127.0.0.1` dan jangan membuka ke LAN (tidak ada autentikasi).
Verifikasi: `netstat -an | findstr :3000` harus `127.0.0.1:3000`. Windows Firewall dapat menanyakan izin untuk Node.js (diperlukan balasan SSDP): izinkan hanya jaringan **privat**.
Setelah itu: `npm run typecheck`, `npm run lint`, `npm test` (E2E: `npm run test:e2e:install` dulu), lalu ikuti `docs/WINDOWS-VERIFICATION.md` dan `docs/THROUGHPUT-TEST.md`.
Audit dependensi: `npm audit --json > audit.json` lalu `node scripts/audit-report.mjs audit.json`.
