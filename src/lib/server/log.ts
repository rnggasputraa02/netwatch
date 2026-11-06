/** Log server terstruktur. Jangan pernah memasukkan kredensial/secret ke `data`. */
export function log(level: "info" | "warn" | "error", event: string, data: Record<string, string | number | boolean | null> = {}): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...data }); (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`[netwatch] ${line}`);
}
