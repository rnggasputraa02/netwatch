import { guard } from "@/lib/server/guard";
import { log } from "@/lib/server/log";
import { routerStatus } from "@/lib/server/runtime";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
/** Status router via UPnP IGD (baca-saja). Tanpa kredensial; bila router tidak mendukung/menonaktifkan UPnP hasilnya UNKNOWN/NOT_SUPPORTED, bukan angka. */
export async function GET(req: Request) {
  const denied = guard(req, { mutating: false }); if (denied) return denied;
  try { return Response.json(await routerStatus(), { headers: { "Cache-Control": "no-store" } }); } catch { log("error", "router_status_failed"); return Response.json({ error: "router_query_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}
