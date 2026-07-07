import { Rocket } from "lucide-react";
import { StateTimeline } from "./StateTimeline";
import { TelemetryCard } from "./TelemetryCard";
import { MiniChart } from "./MiniChart";
import { MapPanel } from "./MapPanel";
import { CommandGrid } from "./CommandButton";
import { ROCKET_STATES, type RocketFrame } from "./telemetry";

const ACCENT = "var(--rocket)";

type Props = {
  data: RocketFrame;
  onCommand: (cmd: string) => void;
};

export function RocketDashboard({ data, onCommand }: Props) {
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4" style={{ color: ACCENT }} />
          <h2 className="font-semibold tracking-tight text-lg">Rocket</h2>
          <span
            className="h-1.5 w-1.5 rounded-full dot-pulse ml-1"
            style={{ background: ACCENT }}
          />
        </div>
        <span className="label-mono text-[10px]">Primary Vehicle</span>
      </div>

      <StateTimeline states={ROCKET_STATES} current={data.state} accent={ACCENT} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <TelemetryCard label="Altitude" value={data.altitude.toFixed(0)} unit="m" accent={ACCENT} />
        <TelemetryCard label="Velocity" value={data.velocity.toFixed(1)} unit="m/s" accent={ACCENT} />
        <TelemetryCard label="Pressure" value={data.pressure.toFixed(0)} unit="hPa" />
        <TelemetryCard label="Temp" value={data.temperature.toFixed(1)} unit="°C" />
        <TelemetryCard
          label="GPS"
          value={`${data.lat.toFixed(4)}°`}
          sub={`${data.lon.toFixed(4)}°`}
        />
        <TelemetryCard
          label="Accel XYZ"
          value={data.accel.map((v) => v.toFixed(1)).join(" ")}
          unit="m/s²"
        />
        <TelemetryCard
          label="Gyro XYZ"
          value={data.gyro.map((v) => v.toFixed(0)).join(" ")}
          unit="°/s"
        />
        <TelemetryCard label="Battery" value={data.battery.toFixed(2)} unit="V" accent="var(--ok)" />
        <TelemetryCard label="RSSI" value={data.rssi} unit="dBm" />
        <TelemetryCard label="Link" value={`${data.linkQuality.toFixed(0)}%`} accent="var(--ok)" />
        <TelemetryCard label="IMU" value="OK" accent="var(--ok)" />
        <TelemetryCard label="Baro" value="OK" accent="var(--ok)" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 h-[100px]">
        <MiniChart data={data.charts.altitude} color="oklch(0.76 0.16 55)" label="Altitude" unit="m" />
        <MiniChart data={data.charts.velocity} color="oklch(0.76 0.16 55)" label="Velocity" unit="m/s" />
        <MiniChart
          data={data.charts.acceleration}
          color="oklch(0.72 0.16 55)"
          label="Accel Z"
          unit="m/s²"
        />
        <MiniChart data={data.charts.gyro} color="oklch(0.72 0.16 55)" label="Gyro X" unit="°/s" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 h-[100px]">
        <MiniChart data={data.charts.pressure} color="oklch(0.7 0.1 55)" label="Pressure" unit="hPa" />
        <MiniChart data={data.charts.temperature} color="oklch(0.7 0.1 55)" label="Temp" unit="°C" />
        <MiniChart data={data.charts.battery} color="oklch(0.78 0.15 155)" label="Battery" unit="V" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-[220px]">
        <MapPanel path={data.path} accent={ACCENT} label="Flight Path" />
        <div className="panel p-3 flex flex-col gap-2">
          <span className="label-mono">Commands</span>
          <CommandGrid
            commands={["TELEMETRY_ENABLE", "ZERO_ALTITUDE", "ZERO_ACCEL", "COMM_TEST"]}
            accent={ACCENT}
            onSend={onCommand}
          />
        </div>
      </div>
    </section>
  );
}
