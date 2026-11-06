export type Device = { id: string; name: string; ip: string; mac: string; os: string; type: string; online: boolean; bw: number; seen: number };
export type LogEntry = { src?: "SIMULATION" | "LIVE"; id: string; t: number; type: "Sistem" | "Perangkat" | "Jaringan"; name: string; desc: string; pr: "Rendah" | "Sedang" | "Tinggi" };
export type AnimLevel = "off" | "subtle" | "full";
export type Settings = { interval: number; paused: boolean; collapsed: boolean; animLevel: AnimLevel; perf: "normal" | "saver" };
export type HistoryPoint = { t: number; down: number; up: number };
export type Notice = { id: string; t: number; key: string; title: string; body: string; read: boolean };
export type Focus = { kind: "device" | "log"; value: string } | null;

// ===== v3.0: sumber data, monitoring nyata, simulasi lanjutan, alert =====
export type DataSource = "SIMULATION" | "LIVE";
export type LiveStatus = "OFF" | "UNKNOWN" | "LIVE" | "STALE" | "DISCONNECTED";
export type ProbeResult = { host: string; method: "icmp"; sent: number; received: number; lossPct: number | null; rttMinMs: number | null; rttAvgMs: number | null; rttMaxMs: number | null; error: string | null };
export type NetIface = { name: string; ipv4: string; netmask: string; cidr: string; mac: string };
export type LiveSnapshot = {
  counters?: Counters;
  source: "LIVE"; ts: number; platform: string; interfaces: NetIface[]; activeInterface: NetIface | null;
  gateway: { ip: string | null; probe: ProbeResult | null }; internet: { target: string; probe: ProbeResult | null }; notes: string[];
};
export type LivePoint = { id: string; t: number; gwRtt: number | null; gwLoss: number | null; inetRtt: number | null; inetLoss: number | null };
export type LiveCfg = { enabled: boolean; target: string };
export type AlertKind = "offline" | "latency" | "loss" | "utilization" | "gateway_down" | "internet_down" | "live_disconnected" | "router_unreachable" | "bandwidth_high" | "new_device";
export type RuleKind = "offline" | "latency" | "loss" | "utilization" | "bandwidth";
export type AlertRule = { kind: RuleKind; enabled: boolean; threshold: number };
export type Alert = { severity?: "info" | "warning" | "critical"; id: string; key: string; source: DataSource; kind: AlertKind; subject: string; message: string; startedAt: number; recoveredAt: number | null; ack: boolean };
export type ScenarioKind = "outage" | "latency" | "loss" | "congestion";
export type ScenarioStatus = "running" | "paused" | "completed" | "stopped";
export type Scenario = { id: string; kind: ScenarioKind; deviceId: string; deviceName: string; durationSec: number; value: number; status: ScenarioStatus; elapsedMs: number; createdAt: number };

// ===== v5.0 =====
export type Severity = "info" | "warning" | "critical";
export type Counters = { ts: number; ifaceName: string | null; rxBytes: number | null; txBytes: number | null; method: "proc-net-dev" | "netadapter-powershell" | null; error: string | null };
export type RouterState = "OK" | "NOT_SUPPORTED" | "UNREACHABLE" | "UNKNOWN";
export type RouterDevice = { friendlyName: string | null; manufacturer: string | null; modelName: string | null; modelNumber: string | null };
export type RouterWan = { connectionStatus: string | null; uptimeSec: number | null; externalIp: string | null; rxBytes: number | null; txBytes: number | null; maxDownBps: number | null; maxUpBps: number | null };
export type RouterStatus = {
  source: "LIVE"; ts: number; state: RouterState; reason: string | null; method: "upnp-igd"; gatewayIp: string | null; device: RouterDevice | null; wan: RouterWan | null;
  capabilities: { upnp: boolean; wanCounters: boolean; dhcpClients: "NOT_SUPPORTED"; snmp: "NOT_PROBED"; perDeviceTraffic: "NOT_SUPPORTED" };
};
export type Neighbor = { ip: string; mac: string };
export type DiscoveredHost = { ip: string; mac: string | null; hostname: string | null; responded: boolean; via: "arp" | "ping" | "ping+arp" };
export type DiscoveryStatus = { state: "idle" | "running" | "stopping" | "done" | "error"; mode: "passive" | "active" | null; startedAt: number | null; finishedAt: number | null; total: number; probed: number; found: number; subnet: string | null; reason: string | null; stopped: boolean };
export type DiscoveryResult = { status: DiscoveryStatus; hosts: DiscoveredHost[]; self: { ip: string; mac: string | null; name: string } | null; gatewayIp: string | null };
export type KnownDevice = { id: string; ip: string; mac: string | null; hostname: string | null; firstSeen: number; lastSeen: number; online: boolean | null; role: "gateway" | "this-computer" | "unknown"; privateMac: boolean };
export type BwPoint = { id: string; t: number; pcRx: number | null; pcTx: number | null; rtRx: number | null; rtTx: number | null };
export type Condition = "NORMAL" | "DEGRADED" | "GATEWAY_DOWN" | "INTERNET_DOWN" | "UNKNOWN";
export type Incident = { id: string; t: number; from: Condition; to: Condition; summary: string };
export type Acc = { s: number; n: number; m: number };
export type Bucket = { t: number; n: number; c: [number, number, number, number, number]; gwRtt: Acc; inRtt: Acc; gwLoss: Acc; inLoss: Acc; pcRx: Acc; pcTx: Acc; rtRx: Acc; rtTx: Acc; by: { pcRx: number; pcTx: number; rtRx: number; rtTx: number } };
export type NwCfg = { intervalSec: 10 | 30 | 60; routerEnabled: boolean; hostnames: boolean };
