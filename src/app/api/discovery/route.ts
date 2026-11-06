import { guard } from "@/lib/server/guard";
import { log } from "@/lib/server/log";
import { discovery, realDiscDeps } from "@/lib/server/runtime";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
const H = { "Cache-Control": "no-store" };
export async function GET(req: Request) { const d = guard(req, { mutating: false }); return d ?? Response.json(discovery.result(), { headers: H }); }
/** Body ketat: {action:"start", mode:"passive"|"active", hostnames:boolean} atau {action:"stop"}. Field lain ditolak. */
export async function POST(req: Request) {
  const denied = guard(req, { mutating: true }); if (denied) return denied;
  let b: unknown; try { b = await req.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400, headers: H }); }
  const o = b as Record<string, unknown> | null; if (!o || typeof o !== "object") return Response.json({ error: "invalid_body" }, { status: 400, headers: H });
  if (o.action === "stop" && Object.keys(o).length === 1) return Response.json({ stopped: discovery.stop() }, { headers: H });
  if (o.action === "start" && (o.mode === "passive" || o.mode === "active") && typeof o.hostnames === "boolean" && Object.keys(o).length === 3) {
    const r = discovery.start(o.mode, o.hostnames, realDiscDeps()); if (!r.ok) return Response.json({ error: r.code }, { status: r.code === "rate_limited" ? 429 : 409, headers: H });
    log("info", "discovery_started", { mode: o.mode }); return Response.json(discovery.result(), { status: 202, headers: H });
  }
  return Response.json({ error: "invalid_body" }, { status: 400, headers: H });
}
