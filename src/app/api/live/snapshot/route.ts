import { guard } from "@/lib/server/guard";
import { cachedSnapshot, INTERNET_TARGETS } from "@/lib/live/snapshot";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
/** Hanya untuk akses lokal (Host harus localhost/127.0.0.1/[::1]); target tes internet hanya dari daftar tetap. */
export async function GET(req: Request) {
  const denied = guard(req, { mutating: false }); if (denied) return denied;
  const t = new URL(req.url).searchParams.get("internet") ?? INTERNET_TARGETS[0];
  if (!(INTERNET_TARGETS as readonly string[]).includes(t)) return Response.json({ error: "invalid_target" }, { status: 400, headers });
  try { return Response.json(await cachedSnapshot(t), { headers }); } catch { return Response.json({ error: "probe_failed" }, { status: 500, headers }); }
}
