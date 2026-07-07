import { Satellite } from "lucide-react";
import { StateTimeline } from "./StateTimeline";
import { TelemetryCard } from "./TelemetryCard";
import { MiniChart } from "./MiniChart";
import { MapPanel } from "./MapPanel";
import { CommandGrid } from "./CommandButton";
import { MotorPanel } from "./MotorPanel";
import { CANSAT_STATES, type CansatFrame } from "./telemetry";

const ACCENT = "var(--cansat)";

type Props = {
  data: CansatFrame;
  onCommand: (cmd: string) => void;
};

export function CansatDashboard({ data, onCommand }: Props) {
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Satellite className="h-4 w-4" style={{ color: ACCENT }} />
          <h2 className="font-semibold tracking-tight text-lg">CanSat</h2>
          <span
            className="h-1.5 w-1.5 rounded-full dot-pulse ml-1"
            style={{ background: ACCENT }}
          />
        </div>
        <span className="label-mono text-[10px]">Secondary Payload</span>
      </div>

      <StateTimeline states={CANSAT_STATES} current={data.state} accent={ACCENT} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <TelemetryCard label="Altitude" value={data.altitude.toFixed(0)} unit="m" accent={ACCENT} />
        <TelemetryCard label="Velocity" value={data.velocity.toFixed(1)} unit="m/s" accent={ACCENT} />
        <TelemetryCard label="Pressure" value={data.pressure.toFixed(0)} unit="hPa" />
        <TelemetryCard label="Humidity" value={data.humidity.toFixed(0)} unit="%" />
        <TelemetryCard label="IAQ" value={data.iaq.toFixed(0)} sub="Index" />
        <TelemetryCard label="Gas Res" value={data.gasResistance.toFixed(0)} unit="kΩ" />
        <TelemetryCard label="Radiation" value={data.radiationCpm.toFixed(0)} unit="CPM" />
        <TelemetryCard
          label="Dose Rate"
          value={data.doseRate.toFixed(3)}
          unit="µSv/h"
          accent="var(--warn)"
        />
        <TelemetryCard label="IR Temp" value={data.irTemp.toFixed(1)} unit="°C" />
        <TelemetryCard
          label="GPS"
          value={`${data.lat.toFixed(4)}°`}
          sub={`${data.lon.toFixed(4)}°`}
        />
        <TelemetryCard
          label="Battery"
          value={data.battery.toFixed(2)}
          unit="V"
          accent="var(--ok)"
          sub={`${data.current.toFixed(2)} A`}
        />
        <TelemetryCard label="Link" value={`${data.linkQuality.toFixed(0)}%`} accent="var(--ok)" sub={`${data.rssi} dBm`} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 h-[100px]">
        <MiniChart data={data.charts.altitude} color="oklch(0.82 0.12 210)" label="Altitude" unit="m" />
        <MiniChart data={data.charts.humidity} color="oklch(0.82 0.12 210)" label="Humidity" unit="%" />
        <MiniChart data={data.charts.iaq} color="oklch(0.78 0.11 210)" label="IAQ" />
        <MiniChart data={data.charts.radiation} color="oklch(0.78 0.16 85)" label="Radiation" unit="CPM" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 h-[100px]">
        <MiniChart
          data={data.charts.batteryCurrent}
          color="oklch(0.78 0.15 155)"
          label="Batt Current"
          unit="A"
        />
        <MiniChart data={data.charts.motorRpm} color="oklch(0.82 0.12 210)" label="Motor RPM" />
        <MiniChart
          data={data.charts.motorCurrent}
          color="oklch(0.78 0.12 210)"
          label="Motor Current"
          unit="A"
        />
        <MiniChart data={data.charts.irTemp} color="oklch(0.78 0.11 210)" label="IR Temp" unit="°C" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-h-[220px]">
        <div className="md:col-span-1">
          <MapPanel path={data.path} accent={ACCENT} label="Descent Path" />
        </div>
        <MotorPanel onCommand={onCommand} />
        <div className="panel p-3 flex flex-col gap-2">
          <span className="label-mono">Commands</span>
          <CommandGrid
            commands={[
              "TELEMETRY_ENABLE",
              "IMU_CALIBRATE",
              "DEPLOY_CHUTE",
              "SERVO_TRIGGER",
              "COMM_TEST",
              "SIMULATION_ENABLE",
              "SIMULATION_ACTIVATE",
              "DISABLE_ACTIVE_SYSTEMS",
            ]}
            accent={ACCENT}
            onSend={onCommand}
          />
        </div>
      </div>
    </section>
  );
}
