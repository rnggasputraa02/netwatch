/**
 * Logika pintasan keyboard global tanpa ketergantungan React, sehingga dapat diuji langsung di browser.
 * Tidak ada pintasan yang menghapus data.
 */
export type PanelName = "search" | "notif" | "help" | null;

export type ShortcutHandlers = {
  /** Panel yang sedang terbuka menurut state aplikasi (satu panel pada satu waktu). */
  panel: PanelName;
  openSearch: () => void;
  openHelp: () => void;
  toggleNotif: () => void;
  togglePause: () => void;
  refresh: () => void;
  go: (path: string) => void;
  escape: () => void;
};

export const GO: Record<string, string> = { d: "/dashboard", p: "/devices", b: "/bandwidth", t: "/topology", l: "/logs", s: "/settings", a: "/about" };
export const G_TIMEOUT_MS = 1200;

const NON_TEXT_INPUTS = new Set(["button", "submit", "reset", "image"]);
const CONTROL_ROLES = new Set(["textbox", "searchbox", "combobox", "listbox", "option", "slider", "spinbutton", "menuitem", "menuitemcheckbox", "menuitemradio", "radio", "checkbox", "switch"]);
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"]);
const DIALOG_SELECTOR = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/** True bila fokus ada pada kontrol yang memakai tombol huruf/panah sendiri (input, textarea, select, contenteditable, slider, dst). */
export function isFormControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT" || tag === "OPTION") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUTS.has((target as HTMLInputElement).type);
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')) return true;
  const role = target.getAttribute("role");
  return role !== null && CONTROL_ROLES.has(role);
}

/** Dialog aktif: <dialog open> native maupun elemen role="dialog" / alertdialog / aria-modal yang terlihat. */
export function hasOpenDialog(doc: Document = document): boolean {
  return Array.from(doc.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)).some((el) => {
    if (el.matches("dialog[open]")) return true;
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
    return el.getClientRects().length > 0;
  });
}

/** Membuat handler keydown. Satu handler per aplikasi; event yang sama tidak diproses dua kali. */
export function createKeyHandler(getHandlers: () => ShortcutHandlers, now: () => number = Date.now) {
  let pendingG = 0;
  const seen = new WeakSet<Event>();
  return (e: KeyboardEvent): void => {
    if (seen.has(e)) return;
    seen.add(e);
    if (e.isComposing || e.key === "Process" || e.key === "Dead") return;
    if (MODIFIER_KEYS.has(e.key)) return; // menekan Shift untuk "?" tidak boleh membatalkan urutan G
    const h = getHandlers();
    const key = e.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;

    // Escape: ditangani panel lebih dulu (preventDefault). Di sini hanya menutup satu panel aktif.
    if (key === "Escape") {
      pendingG = 0;
      if (!e.defaultPrevented) h.escape();
      return;
    }
    if (e.defaultPrevented) { pendingG = 0; return; }

    const dialogOpen = hasOpenDialog();

    // Ctrl/Cmd+K: buka pencarian hanya jika tidak ada dialog lain; tidak menimpa shortcut browser lain.
    if (e.ctrlKey || e.metaKey) {
      pendingG = 0;
      if (lower === "k" && !e.shiftKey && !e.altKey) {
        if (h.panel === "search") { e.preventDefault(); return; } // sudah terbuka; fokus tetap di kolom cari
        if (dialogOpen) return;
        e.preventDefault();
        h.openSearch();
      }
      return;
    }

    if (e.altKey || isFormControl(e.target) || dialogOpen || h.panel !== null) { pendingG = 0; return; }
    if (e.repeat) return; // tombol ditahan tidak boleh men-toggle berulang

    if (pendingG && now() - pendingG < G_TIMEOUT_MS) {
      pendingG = 0;
      const path = GO[lower];
      if (path && !e.shiftKey) { e.preventDefault(); h.go(path); }
      return;
    }
    pendingG = 0;

    if (key === "/") { e.preventDefault(); h.openSearch(); return; }
    if (key === "?") { e.preventDefault(); h.openHelp(); return; }
    if (e.shiftKey || key.length !== 1) return;
    if (lower === "g") pendingG = now();
    else if (lower === "n") h.toggleNotif();
    else if (lower === "p") h.togglePause();
    else if (lower === "r") h.refresh();
  };
}
