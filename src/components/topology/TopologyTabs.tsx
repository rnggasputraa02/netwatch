"use client";
import { useState } from "react";
import { Topology } from "./Topology";
import RealMap from "./RealMap";
export default function TopologyTabs() {
  const [tab, setTab] = useState<"sim" | "live">("sim");
  return (
    <div className="space-y-3"><h1 className="sr-only">Topologi</h1>
      <div role="tablist" aria-label="Jenis topologi" className="flex gap-2">{([["sim", "Simulasi"], ["live", "Jaringan Nyata"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "btn-p" : "btn"} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "sim" ? <Topology /> : <RealMap />}</div>
  );
}
