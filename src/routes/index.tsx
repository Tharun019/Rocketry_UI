import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header, type MissionEvent, type SystemStatus } from "@/components/gcs/Header";
import { RocketDashboard } from "@/components/gcs/RocketDashboard";
import { AttitudeIndicator } from "@/components/gcs/AttitudeIndicator";
import { PacketMonitor } from "@/components/gcs/PacketMonitor";
import { PacketsView } from "@/components/gcs/PacketsView";
import { simulateDownlink, usePacketLog, useTeamId } from "@/components/gcs/packets";
import { TrajectoryPanel } from "@/components/gcs/TrajectoryPanel";
import {
  AlertsPanel,
  type ActiveAlert,
  type AlertHistoryEntry,
  type AlertType,
} from "@/components/gcs/AlertsPanel";
import { CommandConsole, type ConsoleEntry } from "@/components/gcs/CommandConsole";
import type { CmdStage } from "@/components/gcs/CommandButton";
import { ROCKET_STATES, ROCKET_STATE_ALIASES, useTelemetry } from "@/components/gcs/telemetry";
import { useLaunchSite } from "@/components/gcs/site";
import type { Marker3D } from "@/components/gcs/Trajectory3D";
import { StateTimeline } from "@/components/gcs/StateTimeline";
import { Button, Panel, Segmented, TabBar } from "@/components/gcs/ui";
import { Pause, Play } from "lucide-react";

export const Route = createFileRoute("/")({
  component: GroundStation,
  head: () => ({
    meta: [
      { title: "Rocket Ground Station · Telemetry" },
      {
        name: "description",
        content:
          "Live rocket ground control station: telemetry, flight state timeline, trajectory map, alerts and command console.",
      },
      { property: "og:title", content: "Rocket Ground Station · Telemetry" },
      {
        property: "og:description",
        content:
          "Real-time rocket telemetry, trajectory tracking, mission alerts and command uplink.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function stamp() {
  return new Date().toISOString().slice(11, 19);
}

function GroundStation() {
  const { site, setSite, resetSite } = useLaunchSite();
  const { rocket } = useTelemetry(site);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const nextId = useRef(1);
  const [simSpeed, setSimSpeed] = useState<"1x" | "2x" | "5x">("1x");
  const [rfChannel, setRfChannel] = useState("433.920 MHz");

  const [tab, setTab] = useState<"flight" | "packets">("flight");

  // ---- Downlink packets --------------------------------------------------
  // Every telemetry frame arrives as one ASCII packet line; it is parsed and
  // logged like a real receiver would, independent of which tab is open.
  const { teamId, setTeamId } = useTeamId();
  const { log: packetLog, stats: packetStats, ingest } = usePacketLog();
  useEffect(() => {
    if (rocket.packetCount === 0) return;
    ingest(simulateDownlink(rocket, teamId), { rssi: rocket.rssi, snr: rocket.snr }, teamId);
  }, [rocket.packetCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Mission event log -------------------------------------------------
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const prevRocketState = useRef(rocket.state);
  useEffect(() => {
    const add = (label: string) => setEvents((e) => [...e, { label, time: stamp() }].slice(-30));

    if (prevRocketState.current !== rocket.state) {
      if (rocket.state === "LIFTOFF") {
        add("IGNITION");
        add("LIFT-OFF");
      } else if (rocket.state === "APOGEE") add("APOGEE");
      else if (rocket.state === "PAYLOAD_SEPARATION") {
        add("DROGUE DEPLOY");
        add("PAYLOAD SEPARATION");
      } else if (rocket.state === "AEROBRAKE_RELEASE") add("MAIN / AEROBRAKE RELEASE");
      else if (rocket.state === "IMPACT") add("TOUCHDOWN");
      prevRocketState.current = rocket.state;
    }
  }, [rocket.state]);

  // ---- Command lifecycle -------------------------------------------------
  const pushCommand = (
    channel: ConsoleEntry["channel"],
    cmd: string,
    onStage?: (stage: CmdStage) => void,
  ) => {
    const id = nextId.current++;
    setEntries((e) =>
      [
        ...e,
        { id, t: stamp(), channel, cmd, ack: "PENDING" as const, exec: "PENDING" as const },
      ].slice(-80),
    );
    onStage?.("SENT");

    const acked = Math.random() > 0.06;
    setTimeout(
      () => {
        setEntries((e) => e.map((x) => (x.id === id ? { ...x, ack: acked ? "ACK" : "NAK" } : x)));
        onStage?.(acked ? "ACK" : "NAK");
        if (!acked) {
          setEntries((e) => e.map((x) => (x.id === id ? { ...x, exec: "FAIL" } : x)));
          if (cmd.startsWith("DEPLOY")) raiseParachuteFailure();
          return;
        }
        const passed = Math.random() > 0.08;
        setTimeout(
          () => {
            setEntries((e) =>
              e.map((x) => (x.id === id ? { ...x, exec: passed ? "PASS" : "FAIL" } : x)),
            );
            onStage?.(passed ? "PASS" : "FAIL");
            if (!passed && cmd.startsWith("DEPLOY")) raiseParachuteFailure();
          },
          500 + Math.random() * 500,
        );
      },
      400 + Math.random() * 400,
    );
  };

  // ---- Alerts ------------------------------------------------------------
  const [parachuteFail, setParachuteFail] = useState(false);
  const raiseParachuteFailure = () => {
    setParachuteFail(true);
    setTimeout(() => setParachuteFail(false), 12000);
  };

  const now = Date.now();
  const conditions = useMemo(() => {
    const list: {
      type: AlertType;
      level: "warn" | "danger";
      source: ActiveAlert["source"];
      detail?: string;
    }[] = [];
    const rocketStale = rocket.lastPacketAt > 0 && now - rocket.lastPacketAt > 3000;
    if (rocket.linkQuality < 62 || rocket.rssi < -100)
      list.push({ type: "COMMUNICATION LOST", level: "danger", source: "ROCKET" });
    if (rocketStale) list.push({ type: "TELEMETRY TIMEOUT", level: "danger", source: "ROCKET" });
    if (rocket.battery < 11.2)
      list.push({
        type: "LOW BATTERY",
        level: "warn",
        source: "ROCKET",
        detail: `${rocket.battery.toFixed(2)} V`,
      });
    if (rocket.temperature > 45)
      list.push({
        type: "HIGH TEMPERATURE",
        level: "warn",
        source: "ROCKET",
        detail: `${rocket.temperature.toFixed(1)} °C`,
      });
    if (!rocket.gpsValid) list.push({ type: "GPS INVALID", level: "warn", source: "ROCKET" });
    if (parachuteFail)
      list.push({ type: "PARACHUTE COMMAND FAILED", level: "danger", source: "SYS" });
    return list;
  }, [
    rocket.linkQuality,
    rocket.rssi,
    rocket.battery,
    rocket.temperature,
    rocket.gpsValid,
    rocket.lastPacketAt,
    parachuteFail,
    now,
  ]);

  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryEntry[]>([]);
  const alertId = useRef(1);
  useEffect(() => {
    setActiveAlerts((prev) => {
      const key = (a: { type: string; source: string }) => `${a.type}|${a.source}`;
      const prevMap = new Map(prev.map((a) => [key(a), a]));
      const next: ActiveAlert[] = conditions.map((c) => {
        const existing = prevMap.get(key(c));
        return existing ? { ...existing, detail: c.detail } : { ...c, since: stamp() };
      });
      const nextKeys = new Set(next.map(key));
      const added = next.filter((a) => !prevMap.has(key(a)));
      const removed = prev.filter((a) => !nextKeys.has(key(a)));
      if (added.length || removed.length) {
        setAlertHistory((h) =>
          [
            ...h,
            ...added.map((a) => ({
              id: alertId.current++,
              type: a.type,
              source: a.source,
              time: stamp(),
              action: "RAISED" as const,
            })),
            ...removed.map((a) => ({
              id: alertId.current++,
              type: a.type,
              source: a.source,
              time: stamp(),
              action: "CLEARED" as const,
            })),
          ].slice(-60),
        );
      }
      return added.length || removed.length ? next : prev;
    });
  }, [conditions]);

  // ---- Derived mission phase / status ------------------------------------
  const missionPhase = useMemo(() => {
    if (rocket.state === "IMPACT") return "ROCKET LANDED";
    if (rocket.state === "DESCENT" || rocket.state === "AEROBRAKE_RELEASE") return "ROCKET DESCENT";
    if (rocket.state === "PAYLOAD_SEPARATION") return "PAYLOAD SEPARATION";
    if (rocket.state === "APOGEE") return "APOGEE";
    if (rocket.state === "ASCENT" || rocket.state === "LIFTOFF") return "ASCENT";
    return "PRE-LAUNCH";
  }, [rocket.state]);

  const systemStatus: SystemStatus = activeAlerts.some((a) => a.level === "danger")
    ? "CRITICAL"
    : activeAlerts.length > 0
      ? "DEGRADED"
      : "NOMINAL";

  const linkStatus = (quality: number, lastPacketAt: number) => {
    if (lastPacketAt > 0 && now - lastPacketAt > 3000) return "LOST" as const;
    if (quality < 70) return "DEGRADED" as const;
    return "CONNECTED" as const;
  };

  const alert = useMemo(() => {
    const danger = activeAlerts.find((a) => a.level === "danger");
    if (danger) return { level: "danger" as const, message: `${danger.type} · ${danger.source}` };
    const warn = activeAlerts[0];
    if (warn) return { level: "warn" as const, message: `${warn.type} · ${warn.source}` };
    if (rocket.state === "IMPACT")
      return { level: "info" as const, message: "ROCKET LANDED · RECOVERY" };
    return { level: "info" as const, message: "SIMULATION MODE · TELEMETRY NOMINAL" };
  }, [activeAlerts, rocket.state]);

  // Apogee = highest recorded fix (firmware APOGEE state can lag the true peak).
  const apogeePoint = useMemo(
    () =>
      rocket.track.reduce<(typeof rocket.track)[number] | null>(
        (best, p) => (!best || p.alt > best.alt ? p : best),
        null,
      ),
    [rocket.track],
  );
  // Flight-state callouts on the 3D path: each state at the fix where it began.
  // Up to apogee they sit in the left column, the descent states in the right one.
  const flightMarkers = useMemo(() => {
    const apogeeIdx = ROCKET_STATES.indexOf("APOGEE");
    return ROCKET_STATES.flatMap((s, i): Marker3D[] => {
      const fix = rocket.stateFixes[s];
      if (!fix) return [];
      const point = s === "APOGEE" && apogeePoint ? apogeePoint : fix;
      const alias = ROCKET_STATE_ALIASES[s];
      return [
        {
          key: s,
          label: s.replace(/_/g, " "),
          sub: `${alias ? `[${alias}] · ` : ""}${point.alt.toFixed(0)} m`,
          point,
          side: i <= apogeeIdx ? "left" : "right",
        },
      ];
    });
  }, [rocket.stateFixes, apogeePoint]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        rocketRf={{ rssi: rocket.rssi, snr: rocket.snr, quality: rocket.linkQuality }}
        alert={alert}
        events={events}
        missionPhase={missionPhase}
        systemStatus={systemStatus}
      />

      <main className="flex-1 w-full mx-auto max-w-[1920px] px-6 py-5 flex flex-col gap-4">
        <TabBar
          tabs={[
            { id: "flight", label: "Flight" },
            {
              id: "packets",
              label: "Packets",
              badge: packetStats.received.toLocaleString(),
            },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "packets" ? (
          <PacketsView
            log={packetLog}
            stats={packetStats}
            teamId={teamId}
            onTeamIdChange={setTeamId}
          />
        ) : null}

        {/* Kept mounted while hidden so the 3D view and charts keep their state. */}
        <div className={tab === "flight" ? "flex flex-col gap-4" : "hidden"}>
          <RocketDashboard
            data={rocket}
            onCommand={(c, onStage) => pushCommand("ROCKET", c, onStage)}
          />

          <TrajectoryPanel
            label="Flight path"
            accent="var(--rocket)"
            track={rocket.track}
            markers={flightMarkers}
            site={site}
            onSiteChange={setSite}
            onSiteReset={resetSite}
            velocityNow={rocket.velocity}
            altitude={rocket.charts.altitude}
            velocity={rocket.charts.velocity}
            altitudeColor="var(--rocket)"
            velocityColor="oklch(0.9 0 0)"
            timeline={
              <StateTimeline
                states={ROCKET_STATES}
                current={rocket.state}
                accent="var(--rocket)"
                aliases={ROCKET_STATE_ALIASES}
              />
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_minmax(0,1fr)] gap-4">
            <AttitudeIndicator
              label="Rocket"
              accent="var(--rocket)"
              pitch={rocket.pitch}
              roll={rocket.roll}
              yaw={rocket.yaw}
            />
            <PacketMonitor
              tx={entries.length}
              rx={packetStats.valid}
              loss={packetStats.missed}
              snr={rocket.snr}
              lastPacket={
                packetStats.lastRxAt
                  ? new Date(packetStats.lastRxAt).toISOString().slice(11, 19)
                  : "—"
              }
              rateHz={rocket.updateRate}
              status={linkStatus(rocket.linkQuality, rocket.lastPacketAt)}
            />
            <Panel
              title="Radio & playback"
              meta="Ground station"
              className="md:col-span-2 xl:col-span-1"
              bodyClassName="flex flex-col gap-4"
            >
              <label className="flex flex-col gap-1.5">
                <span className="eyebrow">Frequency</span>
                <select
                  value={rfChannel}
                  onChange={(e) => setRfChannel(e.target.value)}
                  className="h-9 rounded-md border border-border bg-well px-2.5 readout text-[13px] focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-ring/40"
                >
                  <option>433.920 MHz</option>
                  <option>868.100 MHz</option>
                  <option>915.000 MHz</option>
                  <option>2.4 GHz</option>
                </select>
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">Playback speed</span>
                <Segmented
                  options={[
                    { id: "1x", label: "1×" },
                    { id: "2x", label: "2×" },
                    { id: "5x", label: "5×" },
                  ]}
                  value={simSpeed}
                  onChange={setSimSpeed}
                  className="w-full [&>button]:flex-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-auto">
                <Button size="md" onClick={() => pushCommand("SYS", "PLAYBACK_START")}>
                  <Play className="h-3.5 w-3.5" /> Start
                </Button>
                <Button size="md" onClick={() => pushCommand("SYS", "PLAYBACK_PAUSE")}>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </Button>
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AlertsPanel active={activeAlerts} history={alertHistory} />
            <CommandConsole entries={entries} />
          </div>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1920px] px-6 h-10 flex items-center justify-between text-[11px] text-subtle">
          <span>Rocket Ground Station v1.0 · Simulated telemetry</span>
          <span>© CanSat Team 2026</span>
        </div>
      </footer>
    </div>
  );
}
