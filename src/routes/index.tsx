import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header, type MissionEvent, type SystemStatus } from "@/components/gcs/Header";
import { RocketDashboard } from "@/components/gcs/RocketDashboard";
import { CansatDashboard } from "@/components/gcs/CansatDashboard";
import { AttitudeIndicator } from "@/components/gcs/AttitudeIndicator";
import { PacketMonitor } from "@/components/gcs/PacketMonitor";
import { TrajectoryPanel } from "@/components/gcs/TrajectoryPanel";
import {
  AlertsPanel,
  type ActiveAlert,
  type AlertHistoryEntry,
  type AlertType,
} from "@/components/gcs/AlertsPanel";
import { CommandConsole, type ConsoleEntry } from "@/components/gcs/CommandConsole";
import type { CmdStage } from "@/components/gcs/CommandButton";
import { useTelemetry } from "@/components/gcs/telemetry";

export const Route = createFileRoute("/")({
  component: GroundStation,
  head: () => ({
    meta: [
      { title: "Mission Ground Station · Rocket + CanSat Telemetry" },
      {
        name: "description",
        content:
          "Live aerospace ground control station: rocket and CanSat telemetry, flight state timelines, trajectory maps, alerts and command console.",
      },
      { property: "og:title", content: "Mission Ground Station · Rocket + CanSat Telemetry" },
      {
        property: "og:description",
        content:
          "Real-time telemetry dashboards, trajectory tracking, mission alerts and command uplink for a CanSat competition flight.",
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
  const { rocket, cansat } = useTelemetry();
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const nextId = useRef(1);
  const [simSpeed, setSimSpeed] = useState<"1x" | "2x" | "5x">("1x");
  const [rfChannel, setRfChannel] = useState("433.920 MHz");

  const [packets, setPackets] = useState({ tx: 0, rx: 0, loss: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      setPackets((p) => ({
        tx: p.tx + 3,
        rx: p.rx + 5,
        loss: p.loss + (Math.random() < 0.1 ? 1 : 0),
      }));
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ---- Mission event log -------------------------------------------------
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const prevRocketState = useRef(rocket.state);
  const prevCansatState = useRef(cansat.state);
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
    if (prevCansatState.current !== cansat.state) {
      if (cansat.state === "EJECTION") add("CANSAT EJECTION");
      else if (cansat.state === "CONTROLLED_DESCENT") add("PROPELLER DEPLOY / CONTROLLED DESCENT");
      else if (cansat.state === "LANDED") add("CANSAT TOUCHDOWN");
      else if (cansat.state === "MISSION_COMPLETE") add("MISSION COMPLETE");
      prevCansatState.current = cansat.state;
    }
  }, [rocket.state, cansat.state]);

  // ---- Command lifecycle -------------------------------------------------
  const pushCommand = (
    channel: ConsoleEntry["channel"],
    cmd: string,
    onStage?: (stage: CmdStage) => void,
  ) => {
    const id = nextId.current++;
    setEntries((e) =>
      [...e, { id, t: stamp(), channel, cmd, ack: "PENDING" as const, exec: "PENDING" as const }].slice(-80),
    );
    onStage?.("SENT");

    const acked = Math.random() > 0.06;
    setTimeout(() => {
      setEntries((e) => e.map((x) => (x.id === id ? { ...x, ack: acked ? "ACK" : "NAK" } : x)));
      onStage?.(acked ? "ACK" : "NAK");
      if (!acked) {
        setEntries((e) => e.map((x) => (x.id === id ? { ...x, exec: "FAIL" } : x)));
        if (cmd.startsWith("DEPLOY")) raiseParachuteFailure();
        return;
      }
      const passed = Math.random() > 0.08;
      setTimeout(() => {
        setEntries((e) => e.map((x) => (x.id === id ? { ...x, exec: passed ? "PASS" : "FAIL" } : x)));
        onStage?.(passed ? "PASS" : "FAIL");
        if (!passed && cmd.startsWith("DEPLOY")) raiseParachuteFailure();
      }, 500 + Math.random() * 500);
    }, 400 + Math.random() * 400);
  };

  // ---- Alerts ------------------------------------------------------------
  const [parachuteFail, setParachuteFail] = useState(false);
  const raiseParachuteFailure = () => {
    setParachuteFail(true);
    setTimeout(() => setParachuteFail(false), 12000);
  };

  const now = Date.now();
  const conditions = useMemo(() => {
    const list: { type: AlertType; level: "warn" | "danger"; source: ActiveAlert["source"]; detail?: string }[] = [];
    const rocketStale = rocket.lastPacketAt > 0 && now - rocket.lastPacketAt > 3000;
    const cansatStale = cansat.lastPacketAt > 0 && now - cansat.lastPacketAt > 3000;
    if (rocket.linkQuality < 62 || rocket.rssi < -100)
      list.push({ type: "COMMUNICATION LOST", level: "danger", source: "ROCKET" });
    if (cansat.linkQuality < 58 || cansat.rssi < -100)
      list.push({ type: "COMMUNICATION LOST", level: "danger", source: "CANSAT" });
    if (rocketStale) list.push({ type: "TELEMETRY TIMEOUT", level: "danger", source: "ROCKET" });
    if (cansatStale) list.push({ type: "TELEMETRY TIMEOUT", level: "danger", source: "CANSAT" });
    if (rocket.battery < 11.2)
      list.push({ type: "LOW BATTERY", level: "warn", source: "ROCKET", detail: `${rocket.battery.toFixed(2)} V` });
    if (cansat.battery < 7.0)
      list.push({ type: "LOW BATTERY", level: "warn", source: "CANSAT", detail: `${cansat.battery.toFixed(2)} V` });
    if (rocket.temperature > 45)
      list.push({ type: "HIGH TEMPERATURE", level: "warn", source: "ROCKET", detail: `${rocket.temperature.toFixed(1)} °C` });
    if (cansat.irTemp > 45)
      list.push({ type: "HIGH TEMPERATURE", level: "warn", source: "CANSAT", detail: `${cansat.irTemp.toFixed(1)} °C` });
    if (!rocket.gpsValid) list.push({ type: "GPS INVALID", level: "warn", source: "ROCKET" });
    if (!cansat.gpsValid) list.push({ type: "GPS INVALID", level: "warn", source: "CANSAT" });
    if (parachuteFail)
      list.push({ type: "PARACHUTE COMMAND FAILED", level: "danger", source: "SYS" });
    return list;
  }, [
    rocket.linkQuality, rocket.rssi, rocket.battery, rocket.temperature, rocket.gpsValid, rocket.lastPacketAt,
    cansat.linkQuality, cansat.rssi, cansat.battery, cansat.irTemp, cansat.gpsValid, cansat.lastPacketAt,
    parachuteFail, now,
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
            ...added.map((a) => ({ id: alertId.current++, type: a.type, source: a.source, time: stamp(), action: "RAISED" as const })),
            ...removed.map((a) => ({ id: alertId.current++, type: a.type, source: a.source, time: stamp(), action: "CLEARED" as const })),
          ].slice(-60),
        );
      }
      return added.length || removed.length ? next : prev;
    });
  }, [conditions]);

  // ---- Derived mission phase / status ------------------------------------
  const missionPhase = useMemo(() => {
    if (cansat.state === "MISSION_COMPLETE") return "MISSION COMPLETE";
    if (cansat.state === "LANDED" && rocket.state === "IMPACT") return "RECOVERY";
    if (cansat.state === "CONTROLLED_DESCENT") return "CANSAT CONTROLLED DESCENT";
    if (cansat.state === "PRIMARY_DESCENT" || cansat.state === "EJECTION") return "CANSAT DESCENT";
    if (rocket.state === "IMPACT") return "ROCKET LANDED";
    if (rocket.state === "DESCENT" || rocket.state === "AEROBRAKE_RELEASE") return "ROCKET DESCENT";
    if (rocket.state === "PAYLOAD_SEPARATION") return "PAYLOAD SEPARATION";
    if (rocket.state === "APOGEE") return "APOGEE";
    if (rocket.state === "ASCENT" || rocket.state === "LIFTOFF") return "ASCENT";
    return "PRE-LAUNCH";
  }, [rocket.state, cansat.state]);

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
    if (cansat.state === "MISSION_COMPLETE")
      return { level: "info" as const, message: "MISSION COMPLETE" };
    return { level: "info" as const, message: "SIMULATION MODE · TELEMETRY NOMINAL" };
  }, [activeAlerts, cansat.state]);

  const heading = (path: [number, number][]) => {
    if (path.length < 2) return 0;
    const a = path.at(-2)!;
    const b = path.at(-1)!;
    return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        rocketRf={{ rssi: rocket.rssi, snr: rocket.snr, quality: rocket.linkQuality }}
        cansatRf={{ rssi: cansat.rssi, snr: cansat.snr, quality: cansat.linkQuality }}
        missionId="CS-2026-042"
        launchSite="Sriharikota · Pad-B"
        alert={alert}
        events={events}
        missionPhase={missionPhase}
        systemStatus={systemStatus}
      />

      <main className="flex-1 p-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="panel p-4">
            <RocketDashboard
              data={rocket}
              onCommand={(c, onStage) => pushCommand("ROCKET", c, onStage)}
            />
          </div>
          <div className="panel p-4">
            <CansatDashboard
              data={cansat}
              onCommand={(c, onStage) => pushCommand("CANSAT", c, onStage)}
            />
          </div>
        </div>

        <TrajectoryPanel
          label="Rocket Flight Path"
          accent="var(--rocket)"
          path={rocket.path}
          profile={rocket.charts.altitude}
          profileColor="oklch(0.76 0.16 55)"
          vector={{ headingDeg: heading(rocket.path), speed: rocket.velocity }}
          markers={[
            ...(rocket.markers.launch ? [{ label: "Launch Point", pos: rocket.markers.launch, color: "oklch(0.78 0.15 155)" }] : []),
            ...(rocket.markers.apogee ? [{ label: "Apogee", pos: rocket.markers.apogee, color: "oklch(0.85 0.15 85)" }] : []),
            ...(rocket.markers.drogue ? [{ label: "Drogue Deploy", pos: rocket.markers.drogue, color: "oklch(0.75 0.16 300)" }] : []),
            ...(rocket.markers.main ? [{ label: "Main / Aerobrake", pos: rocket.markers.main, color: "oklch(0.8 0.14 210)" }] : []),
            ...(rocket.markers.landing ? [{ label: "Landing Point", pos: rocket.markers.landing, color: "oklch(0.7 0.2 25)" }] : []),
          ]}
        />

        <TrajectoryPanel
          label="CanSat Descent Path"
          accent="var(--cansat)"
          path={cansat.path}
          profile={cansat.charts.altitude}
          profileColor="oklch(0.82 0.12 210)"
          vector={{ headingDeg: heading(cansat.path), speed: cansat.velocity }}
          predicted={cansat.markers.predicted ? { pos: cansat.markers.predicted, radiusM: 45 } : undefined}
          markers={[
            ...(cansat.markers.ejection ? [{ label: "Ejection", pos: cansat.markers.ejection, color: "oklch(0.78 0.15 155)" }] : []),
            ...(cansat.markers.propeller ? [{ label: "Propeller Deploy", pos: cansat.markers.propeller, color: "oklch(0.85 0.15 85)" }] : []),
            ...(cansat.markers.landing ? [{ label: "Landing Point", pos: cansat.markers.landing, color: "oklch(0.7 0.2 25)" }] : []),
          ]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <AttitudeIndicator
            label="Rocket"
            accent="var(--rocket)"
            pitch={rocket.gyro[1] * 0.5}
            roll={rocket.gyro[0] * 0.5}
            yaw={rocket.gyro[2] * 0.5}
          />
          <AttitudeIndicator
            label="CanSat"
            accent="var(--cansat)"
            pitch={cansat.propellers === "DEPLOYED" ? 8 : -2}
            roll={Math.sin(cansat.t / 3) * 12}
            yaw={cansat.t * 4}
          />
          <PacketMonitor
            tx={packets.tx}
            rx={packets.rx}
            loss={packets.loss}
            snr={(rocket.snr + cansat.snr) / 2}
            lastPacket={stamp()}
            rateHz={(rocket.updateRate + cansat.updateRate) / 2}
            status={
              linkStatus(rocket.linkQuality, rocket.lastPacketAt) === "LOST" ||
              linkStatus(cansat.linkQuality, cansat.lastPacketAt) === "LOST"
                ? "LOST"
                : linkStatus(rocket.linkQuality, rocket.lastPacketAt) === "DEGRADED" ||
                    linkStatus(cansat.linkQuality, cansat.lastPacketAt) === "DEGRADED"
                  ? "DEGRADED"
                  : "CONNECTED"
            }
          />
          <div className="panel p-3 flex flex-col gap-2">
            <span className="label-mono">RF Config & Playback</span>
            <div className="flex flex-col gap-1.5 text-xs">
              <label className="label-mono text-[10px]">Frequency</label>
              <select
                value={rfChannel}
                onChange={(e) => setRfChannel(e.target.value)}
                className="panel px-2 py-1.5 bg-[oklch(0.16_0_0)] readout text-sm"
              >
                <option>433.920 MHz</option>
                <option>868.100 MHz</option>
                <option>915.000 MHz</option>
                <option>2.4 GHz</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="label-mono text-[10px]">Playback Speed</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["1x", "2x", "5x"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSimSpeed(s)}
                    className="panel px-2 py-1.5 label-mono text-[10px] hover:bg-[oklch(0.21_0_0)]"
                    style={{
                      borderColor: simSpeed === s ? "var(--foreground)" : undefined,
                      color: simSpeed === s ? "var(--foreground)" : undefined,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-auto">
              <button
                onClick={() => pushCommand("SYS", "PLAYBACK_START")}
                className="panel px-2 py-1.5 label-mono text-[10px] hover:bg-[oklch(0.21_0_0)]"
              >
                Start
              </button>
              <button
                onClick={() => pushCommand("SYS", "PLAYBACK_PAUSE")}
                className="panel px-2 py-1.5 label-mono text-[10px] hover:bg-[oklch(0.21_0_0)]"
              >
                Pause
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AlertsPanel active={activeAlerts} history={alertHistory} />
          <CommandConsole entries={entries} />
        </div>
      </main>

      <footer className="border-t border-border px-5 py-2 flex items-center justify-between text-xs">
        <span className="label-mono text-[10px]">Ground Station v1.0 · Simulated Telemetry</span>
        <span className="label-mono text-[10px]">© CanSat Team 2026</span>
      </footer>
    </div>
  );
}
