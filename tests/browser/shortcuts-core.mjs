// Menguji src/lib/shortcuts-core.ts di Chromium asli tanpa server Next.js.
// Jalankan: npm run test:shortcuts   (butuh browser Playwright: npm run test:e2e:install)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const coreJs = ts.transpileModule(readFileSync(resolve(root, "src/lib/shortcuts-core.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;

const HTML = `<!doctype html><meta charset="utf-8"><body>
<button id="btn">tombol</button><input id="inp"><textarea id="ta"></textarea>
<select id="sel"><option>a</option><option>b</option></select>
<input id="chk" type="checkbox"><input id="rad" type="radio"><input id="rng" type="range"><input id="sub" type="submit" value="ok">
<div id="ce" contenteditable="true" tabindex="0">teks</div><div id="ce-child" contenteditable="true"><span id="ce-span" tabindex="0">x</span></div>
<div id="cb" role="combobox" tabindex="0">cb</div><div id="lb" role="listbox" tabindex="0">lb</div><div id="sl" role="slider" tabindex="0">sl</div>
<input id="esc-input">
<div id="hidden-dlg" role="dialog" hidden>tersembunyi</div>
<dialog id="nat">native</dialog>
<div id="div-dlg" role="dialog" style="display:none">panel</div>
<script type="module">
import { createKeyHandler } from "/core.js";
window.calls = []; window.state = { panel: null }; window.t = 1000;
const rec = (n) => (...a) => window.calls.push([n, ...a].join(":"));
const h = () => ({ get panel() { return window.state.panel; }, openSearch: rec("search"), openHelp: rec("help"), toggleNotif: rec("notif"), togglePause: rec("pause"), refresh: rec("refresh"), go: rec("go"), escape: rec("escape") });
const handler = createKeyHandler(h, () => window.t);
window.addEventListener("keydown", handler);
window.installDuplicate = () => window.addEventListener("keydown", (e) => handler(e));
document.getElementById("esc-input").addEventListener("keydown", (e) => { if (e.key === "Escape") e.preventDefault(); });
window.ready = true;
</script></body>`;

let pass = 0, fail = 0; const failures = [];
async function check(name, fn) { try { await fn(); pass++; console.log("ok   -", name); } catch (e) { fail++; failures.push(name); console.log("FAIL -", name, "\n      ", e.message); } }
const eq = (a, b, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} diharapkan ${JSON.stringify(b)}, didapat ${JSON.stringify(a)}`); };

// E2E_CHROMIUM_PATH: Chromium yang sudah terpasang (lihat README); Chromium baru butuh headless baru.
const browser = await chromium.launch(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH, headless: false, args: ["--headless=new", "--no-sandbox"] } : {});
try {
  const page = await (await browser.newContext()).newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://harness.test/**", (r) => { const u = new URL(r.request().url()); r.fulfill(u.pathname === "/core.js" ? { contentType: "text/javascript", body: coreJs } : { contentType: "text/html", body: HTML }); });
  const reset = async () => { await page.goto("http://harness.test/"); await page.waitForFunction(() => window.ready); await page.evaluate(() => { document.activeElement && document.activeElement.blur(); }); };
  const calls = () => page.evaluate(() => window.calls);
  const press = async (...keys) => { for (const k of keys) await page.keyboard.press(k); };
  const focus = (sel) => page.focus(sel);

  await check("tombol tunggal: / ? N P R masing-masing satu kali", async () => {
    await reset(); await press("/", "?", "n", "p", "r"); eq(await calls(), ["search", "help", "notif", "pause", "refresh"]);
  });
  await check("huruf kapital (Caps Lock, tanpa Shift) tetap bekerja; Shift+huruf diabaikan", async () => {
    await reset(); await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "N" })); window.dispatchEvent(new KeyboardEvent("keydown", { key: "P", shiftKey: true })); });
    eq(await calls(), ["notif"]);
  });
  await check("G lalu D/P/B/T/L/S/A menuju rute yang benar", async () => {
    await reset(); for (const k of "dpbtlsa") await press("g", k);
    eq(await calls(), ["/dashboard", "/devices", "/bandwidth", "/topology", "/logs", "/settings", "/about"].map((p) => "go:" + p));
  });
  await check("G lalu tombol tak dikenal membatalkan urutan dan tidak memicu aksi", async () => {
    await reset(); await press("g", "x", "d"); eq(await calls(), []);
  });
  await check("G lalu N tidak membuka notifikasi (urutan G dikonsumsi)", async () => {
    await reset(); await press("g", "n"); eq(await calls(), []);
  });
  await check("urutan G kedaluwarsa setelah 1200 ms", async () => {
    await reset(); await press("g"); await page.evaluate(() => { window.t += 1500; }); await press("d"); eq(await calls(), []);
  });
  await check("menekan Shift setelah G (untuk mengetik ?) tidak membatalkan urutan G", async () => {
    await reset(); await press("g"); await page.keyboard.down("Shift"); await page.keyboard.up("Shift"); await press("d"); eq(await calls(), ["go:/dashboard"]);
  });
  await check("tombol ditahan (repeat) hanya memicu sekali", async () => {
    await reset(); await page.keyboard.down("p"); await page.keyboard.down("p"); await page.keyboard.down("p"); await page.keyboard.up("p"); eq(await calls(), ["pause"]);
  });
  await check("Ctrl/Cmd/Alt + huruf tidak memicu pintasan dan tidak di-preventDefault (Ctrl+R, Ctrl+N tetap milik browser)", async () => {
    await reset();
    const prevented = await page.evaluate(() => ["r", "n", "p", "g", "/"].flatMap((key) => [{ ctrlKey: true }, { metaKey: true }, { altKey: true }].map((m) => { const e = new KeyboardEvent("keydown", { key, cancelable: true, ...m }); window.dispatchEvent(e); return e.defaultPrevented; })));
    eq(prevented.some(Boolean), false); eq(await calls(), []);
  });

  for (const sel of ["#inp", "#ta", "#sel", "#chk", "#rad", "#rng", "#ce", "#ce-span", "#cb", "#lb", "#sl"]) {
    await check(`fokus di ${sel}: semua pintasan global diabaikan`, async () => {
      await reset(); await focus(sel);
      await page.evaluate((s) => { for (const key of ["n", "p", "r", "/", "?", "g", "d"]) document.querySelector(s).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true })); }, sel);
      eq(await calls(), []);
    });
  }
  await check("mengetik nyata di input tidak memicu apa pun", async () => {
    await reset(); await focus("#inp"); await page.keyboard.type("nprg/d?"); eq(await calls(), []); eq(await page.inputValue("#inp"), "nprg/d?");
  });
  await check("memilih opsi di <select> dengan huruf tidak memicu pintasan", async () => {
    await reset(); await focus("#sel"); await press("n", "p", "r"); eq(await calls(), []);
  });
  await check("fokus di tombol atau input submit: pintasan tetap aktif", async () => {
    await reset(); await focus("#btn"); await press("n"); await focus("#sub"); await press("r"); eq(await calls(), ["notif", "refresh"]);
  });

  await check("dialog native terbuka: pintasan global dan Ctrl+K diabaikan", async () => {
    await reset(); await page.evaluate(() => document.getElementById("nat").showModal());
    const prevented = await page.evaluate(() => { const e = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    await page.evaluate(() => { for (const key of ["n", "p", "r", "/", "?"]) window.dispatchEvent(new KeyboardEvent("keydown", { key })); });
    eq(prevented, false); eq(await calls(), []);
  });
  await check("div role=dialog yang terlihat memblokir pintasan; yang display:none atau hidden tidak", async () => {
    await reset(); await page.evaluate(() => { document.getElementById("div-dlg").style.display = "block"; });
    await press("n", "p", "r", "/"); eq(await calls(), []);
    await page.evaluate(() => { document.getElementById("div-dlg").style.display = "none"; }); await press("n"); eq(await calls(), ["notif"]);
  });
  await check("elemen aria-modal=true memblokir pintasan", async () => {
    await reset(); await page.evaluate(() => { const d = document.createElement("div"); d.setAttribute("aria-modal", "true"); d.textContent = "x"; document.body.append(d); });
    await press("n", "r"); eq(await calls(), []);
  });
  await check("panel aktif menurut state: pintasan nonaktif, Esc tetap menutup satu kali", async () => {
    await reset(); await page.evaluate(() => { window.state.panel = "notif"; }); await press("n", "p", "r", "/", "?", "g", "d"); eq(await calls(), []);
    await press("Escape"); eq(await calls(), ["escape"]);
  });
  await check("Esc dipanggil juga saat fokus di input (untuk menutup panel), tetapi sekali per tekanan", async () => {
    await reset(); await focus("#inp"); await press("Escape"); eq(await calls(), ["escape"]);
  });
  await check("Esc yang sudah ditangani panel (preventDefault) tidak diproses lagi oleh pendengar global", async () => {
    await reset(); await focus("#esc-input"); await press("Escape"); eq(await calls(), []);
  });
  await check("Esc tidak memicu pintasan lain", async () => {
    await reset(); await press("g", "Escape", "d"); eq(await calls(), ["escape"]);
  });

  await check("Ctrl+K dan Cmd+K membuka pencarian dan di-preventDefault", async () => {
    await reset();
    const r = await page.evaluate(() => ["ctrlKey", "metaKey"].map((m) => { const e = new KeyboardEvent("keydown", { key: "k", cancelable: true, [m]: true }); window.dispatchEvent(e); return e.defaultPrevented; }));
    eq(r, [true, true]); eq(await calls(), ["search", "search"]);
  });
  await check("Ctrl+K tetap bekerja saat fokus di input halaman (tanpa dialog)", async () => {
    await reset(); await focus("#inp"); await press("Control+k"); eq(await calls(), ["search"]);
  });
  await check("Ctrl+Shift+K dan Ctrl+Alt+K tidak membuka pencarian", async () => {
    await reset(); await press("Control+Shift+K", "Control+Alt+k"); eq(await calls(), []);
  });
  await check("Ctrl+K saat panel pencarian sudah terbuka: tidak membuka lagi, tidak jatuh ke browser", async () => {
    await reset(); await page.evaluate(() => { window.state.panel = "search"; });
    const prevented = await page.evaluate(() => { const e = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    eq(prevented, true); eq(await calls(), []);
  });
  await check("Ctrl+K saat panel lain (notifikasi/bantuan) terbuka: tidak membuka pencarian", async () => {
    await reset(); await page.evaluate(() => { window.state.panel = "notif"; document.getElementById("nat").showModal(); });
    await press("Control+k"); eq(await calls(), []);
  });
  await check("kombinasi IME (isComposing) diabaikan", async () => {
    await reset(); await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", isComposing: true }))); eq(await calls(), []);
  });
  await check("pendengar terpasang dua kali tetap memproses satu event hanya sekali", async () => {
    await reset(); await page.evaluate(() => window.installDuplicate()); await press("n", "Escape"); eq(await calls(), ["notif", "escape"]);
  });
  await check("tidak ada error JavaScript di halaman uji", async () => { eq(errors, []); });
} finally { await browser.close(); }
console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail) { console.log("Gagal:", failures.join("; ")); process.exit(1); }
