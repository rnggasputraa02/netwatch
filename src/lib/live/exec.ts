import { execFile } from "node:child_process";
export type RunResult = { stdout: string; code: number | null; error: "not_found" | "timeout" | "failed" | null };
/**
 * Menjalankan perintah tetap TANPA shell (execFile). Perintah dan argumen dibuat oleh kode, bukan oleh input pengguna.
 */
export function runCommand(file: string, args: readonly string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(file, [...args], { timeout: timeoutMs, windowsHide: true, maxBuffer: 256 * 1024, encoding: "utf8", shell: false }, (err, stdout) => {
      if (!err) return resolve({ stdout, code: 0, error: null });
      const e = err as NodeJS.ErrnoException & { killed?: boolean; code?: number | string };
      if (e.code === "ENOENT") return resolve({ stdout: "", code: null, error: "not_found" });
      if (e.killed) return resolve({ stdout: String(stdout ?? ""), code: null, error: "timeout" });
      resolve({ stdout: String(stdout ?? ""), code: typeof e.code === "number" ? e.code : null, error: null }); // ping keluar non-nol saat ada paket hilang
    });
  });
}
