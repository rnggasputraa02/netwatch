import { Bandwidth } from "@/components/dashboard/Bandwidth";
import HistoryChart from "@/components/charts/HistoryChart";
import RealBandwidth from "@/components/dashboard/RealBandwidth";
import SourceBadge from "@/components/ui/SourceBadge";
export default function Page() { return <div className="space-y-6"><RealBandwidth /><h2 className="font-semibold">Simulasi <SourceBadge kind="SIMULATION" /></h2><Bandwidth /><HistoryChart /></div>; }
