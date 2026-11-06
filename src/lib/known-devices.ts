import type { DiscoveryResult, KnownDevice } from "@/types";
import { isPrivateMac, normMac } from "./live/neighbors.ts";
import { sameSubnet } from "./live/discovery-plan.ts";
export const MAX_KNOWN = 300;
export type MergeOut = { known: KnownDevice[]; added: KnownDevice[] };
/** Menggabungkan hasil discovery ke riwayat perangkat. Kunci = MAC (bila ada) atau IP. lastSeen memakai waktu selesai pemindaian, bukan waktu sekarang.
 *  Status offline hanya ditetapkan setelah pemindaian AKTIF yang selesai penuh (ARP pasif tidak membuktikan perangkat offline). */
export function mergeKnown(known: KnownDevice[], r: DiscoveryResult): MergeOut {
  const at = r.status.finishedAt ?? 0; const list = known.map((k) => ({ ...k })); const added: KnownDevice[] = []; const seenIds = new Set<string>();
  const entries = [...r.hosts.map((h) => ({ ip: h.ip, mac: h.mac, hostname: h.hostname, role: (h.ip === r.gatewayIp ? "gateway" : "unknown") as KnownDevice["role"] })),
    ...(r.self ? [{ ip: r.self.ip, mac: r.self.mac, hostname: null as string | null, role: "this-computer" as const }] : [])];
  for (const e of entries) {
    const mac = e.mac ? normMac(e.mac) : null; let k = list.find((x) => (mac && x.mac === mac) || (!mac && !x.mac && x.ip === e.ip) || (!mac && x.ip === e.ip && x.role === e.role));
    if (!k) { k = { id: mac ? `m${mac}` : `i${e.ip}`, ip: e.ip, mac, hostname: e.hostname, firstSeen: at, lastSeen: at, online: true, role: e.role, privateMac: mac ? isPrivateMac(mac) : false }; list.push(k); if (e.role !== "this-computer") added.push(k); }
    else { k.ip = e.ip; k.lastSeen = Math.max(k.lastSeen, at); k.online = true; k.hostname = e.hostname ?? k.hostname; if (e.role !== "unknown") k.role = e.role; if (mac && !k.mac) { k.mac = mac; k.privateMac = isPrivateMac(mac); } }
    seenIds.add(k.id);
  }
  if (r.status.mode === "active" && r.status.state === "done" && !r.status.stopped && r.status.subnet && r.status.reason !== "ping_unavailable")
    for (const k of list) if (!seenIds.has(k.id) && sameSubnet(k.ip, r.status.subnet)) k.online = false;
  list.sort((a, b) => b.lastSeen - a.lastSeen); return { known: list.slice(0, MAX_KNOWN), added };
}
