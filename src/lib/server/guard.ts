import { isLoopbackHost } from "../live/parse.ts";
/** Penjaga akses endpoint lokal: Host harus loopback; permintaan yang mengubah state wajib memakai header kustom X-NetWatch (memicu preflight CORS) dan Origin (bila ada) sama dengan Host. */
export function guard(req: Request, opts: { mutating: boolean }): Response | null {
  const h = { "Cache-Control": "no-store" }; const host = req.headers.get("host") ?? "";
  if (!isLoopbackHost(host)) return Response.json({ error: "forbidden_non_loopback" }, { status: 403, headers: h });
  if (opts.mutating) {
    if (req.headers.get("x-netwatch") !== "1") return Response.json({ error: "missing_csrf_header" }, { status: 403, headers: h });
    const o = req.headers.get("origin"); if (o) { try { if (new URL(o).host.toLowerCase() !== host.toLowerCase()) return Response.json({ error: "cross_origin" }, { status: 403, headers: h }); } catch { return Response.json({ error: "cross_origin" }, { status: 403, headers: h }); } }
  }
  return null;
}
