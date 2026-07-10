import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header, type MissionEvent } from "@/components/gcs/Header";
import { RocketDashboard } from "@/components/gcs/RocketDashboard";
import { CansatDashboard } from "@/components/gcs/CansatDashboard";
import { AttitudeIndicator } from "@/components/gcs/AttitudeIndicator";
import { PacketMonitor } from "@/components/gcs/PacketMonitor";
import { CommandConsole, type ConsoleEntry } from "@/components/gcs/CommandConsole";
import { useTelemetry } from "@/components/gcs/telemetry";

export const Route = createFileRoute("/")({
  component: GroundStation,
});

function GroundStation() {
  const { rocket, cansat } = useTelemetry();
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const nextId = useRef(1);
  const [simSpeed, setSimSpeed] = useState<"1x" | "2x" | "5x">("1x");
  const [rfChannel, setRfChannel] = useState("433.920 MHz");

  // synthetic packet counters
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

  // Mission event log — tracks rocket state transitions with timestamps
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const prevRocketState = useRef(rocket.state);
  const prevCansatState = useRef(cansat.state);
  useEffect(() => {
    const stamp = () => new Date().toISOString().slice(11, 19);
    const add = (label: string) =>
      setEvents((e) => [...e, { label, time: stamp() }].slice(-20));

    if (prevRocketState.current !== rocket.state) {
      if (rocket.state === "ASCENT") {
        add("IGNITION");
        add("LIFT-OFF");
      } else if (rocket.state === "PAYLOAD_SEPARATION") add("PAYLOAD RELEASE");
      else if (rocket.state === "DESCENT") add("APOGEE / DESCENT");
      else if (rocket.state === "AEROBRAKE_RELEASE") add("AEROBRAKE RELEASE");
      else if (rocket.state === "IMPACT") add("TOUCHDOWN");
      prevRocketState.current = rocket.state;
    }
    if (prevCansatState.current !== cansat.state) {
      if (cansat.state === "DEPLOYED") add("CANSAT DEPLOYED");
      else if (cansat.state === "POWERED_DESCENT") add("POWERED DESCENT");
      else if (cansat.state === "LANDED") add("CANSAT LANDED");
      prevCansatState.current = cansat.state;
    }
  }, [rocket.state, cansat.state]);


  const pushCommand = (channel: ConsoleEntry["channel"], cmd: string) => {
    const id = nextId.current++;
    const t = new Date().toISOString().slice(11, 19);
    setEntries((e) =>
      [...e, { id, t, channel, cmd, ack: "PENDING" as const }].slice(-80),
    );
    setTimeout(() => {
      setEntries((e) =>
        e.map((x) =>
          x.id === id
            ? { ...x, ack: Math.random() > 0.05 ? "ACK" : "NAK" }
            : x,
        ),
      );
    }, 400 + Math.random() * 500);
  };

  const alert = useMemo(() => {
    if (rocket.linkQuality < 65 || cansat.linkQuality < 60)
      return { level: "danger" as const, message: "LINK QUALITY DEGRADED" };
    if (cansat.battery < 7.0) return { level: "warn" as const, message: "CANSAT BATTERY LOW" };
    if (rocket.state === "IMPACT" && cansat.state === "LANDED")
      return { level: "info" as const, message: "MISSION COMPLETE" };
    return { level: "info" as const, message: "SIMULATION MODE · TELEMETRY NOMINAL" };
  }, [rocket.linkQuality, cansat.linkQuality, cansat.battery, rocket.state, cansat.state]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        rocketRf={{ rssi: rocket.rssi, quality: rocket.linkQuality }}
        cansatRf={{ rssi: cansat.rssi, quality: cansat.linkQuality }}
        missionId="CS-2026-042"
        launchSite="Sriharikota · Pad-B"
        alert={alert}
        events={events}
      />

      <main className="flex-1 p-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="panel p-4">
            <RocketDashboard data={rocket} onCommand={(c) => pushCommand("ROCKET", c)} />
          </div>
          <div className="panel p-4">
            <CansatDashboard data={cansat} onCommand={(c) => pushCommand("CANSAT", c)} />
          </div>
        </div>

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
            pitch={cansat.motorRpm > 0 ? 8 : -2}
            roll={Math.sin(cansat.t / 3) * 12}
            yaw={cansat.t * 4}
          />
          <PacketMonitor tx={packets.tx} rx={packets.rx} loss={packets.loss} />
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

        <CommandConsole entries={entries} />
      </main>

      <footer className="border-t border-border px-5 py-2 flex items-center justify-between text-xs">
        <span className="label-mono text-[10px]">Ground Station v1.0 · Simulated Telemetry</span>
        <span className="label-mono text-[10px]">© CanSat Team 2026</span>
      </footer>
    </div>
  );
}
