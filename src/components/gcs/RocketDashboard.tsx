import { Rocket } from "lucide-react";
import { StateTimeline } from "./StateTimeline";
import { TelemetryCard } from "./TelemetryCard";
import { ChartGroup } from "./ChartGroup";
import { CommandGrid, type CommandSender } from "./CommandButton";
import { ROCKET_STATES, ROCKET_STATE_ALIASES, type RocketFrame } from "./telemetry";

const ACCENT = "var(--rocket)";

type Props = {
  data: RocketFrame;
  onCommand: CommandSender;
};

export function RocketDashboard({ data, onCommand }: Props) {
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4" style={{ color: ACCENT }} />
          <h2 className="font-semibold tracking-tight text-lg">Rocket</h2>
          <span className="h-1.5 w-1.5 rounded-full dot-pulse ml-1" style={{ background: ACCENT }} />
        </div>
        <span className="label-mono text-[10px]">Primary Vehicle</span>
      </div>

      <StateTimeline
        states={ROCKET_STATES}
        current={data.state}
        accent={ACCENT}
        aliases={ROCKET_STATE_ALIASES}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <TelemetryCard label="Altitude" value={data.altitude.toFixed(0)} unit="m" accent={ACCENT} />
        <TelemetryCard label="Velocity" value={data.velocity.toFixed(1)} unit="m/s" accent={ACCENT} />
        <TelemetryCard label="Pressure" value={data.pressure.toFixed(0)} unit="hPa" />
        <TelemetryCard label="Temp" value={data.temperature.toFixed(1)} unit="°C" />
        <TelemetryCard label="GPS" value={`${data.lat.toFixed(4)}°`} sub={`${data.lon.toFixed(4)}°`} />
        <TelemetryCard
          label="Accel XYZ"
          value={data.accel.map((v) => v.toFixed(1)).join(" ")}
          unit="m/s²"
        />
        <TelemetryCard label="Gyro XYZ" value={data.gyro.map((v) => v.toFixed(0)).join(" ")} unit="°/s" />
        <TelemetryCard label="Battery" value={data.battery.toFixed(2)} unit="V" accent="var(--ok)" />
        <TelemetryCard label="RSSI" value={data.rssi} unit="dBm" sub={`SNR ${data.snr.toFixed(1)} dB`} />
        <TelemetryCard label="Link" value={`${data.linkQuality.toFixed(0)}%`} accent="var(--ok)" />
        <TelemetryCard label="IMU" value="OK" accent="var(--ok)" />
        <TelemetryCard label="Baro" value="OK" accent="var(--ok)" />
      </div>

      <ChartGroup
        title="Rocket Live Charts"
        accent={ACCENT}
        series={[
          { key: "alt", label: "Altitude", unit: "m", color: "oklch(0.76 0.16 55)", data: data.charts.altitude },
          { key: "vel", label: "Velocity", unit: "m/s", color: "oklch(0.76 0.16 55)", data: data.charts.velocity },
          { key: "acc", label: "Accel Z", unit: "m/s²", color: "oklch(0.72 0.16 55)", data: data.charts.acceleration },
          { key: "gyro", label: "Gyro X", unit: "°/s", color: "oklch(0.72 0.16 55)", data: data.charts.gyro },
          { key: "pres", label: "Pressure", unit: "hPa", color: "oklch(0.7 0.1 55)", data: data.charts.pressure },
          { key: "temp", label: "Temp", unit: "°C", color: "oklch(0.7 0.1 55)", data: data.charts.temperature },
          { key: "batt", label: "Battery", unit: "V", color: "oklch(0.78 0.15 155)", data: data.charts.battery },
        ]}
      />

      <div className="panel p-3 flex flex-col gap-2">
        <span className="label-mono">Commands</span>
        <CommandGrid
          commands={[
            { name: "TELEMETRY_ENABLE" },
            { name: "IMU_CALIBRATE" },
            { name: "LORA_LINK_ON" },
            { name: "LORA_LINK_OFF" },
            { name: "PAYLOAD_DEMONSTRATION" },
            {
              name: "DEPLOY_PRIMARY_PARACHUTE",
              danger: true,
              confirm: true,
              note: "Servo motor · valid 960–965 m",
            },
            {
              name: "DEPLOY_DROGUE_PARACHUTE",
              danger: true,
              confirm: true,
              note: "Spring release · valid at 600 m",
            },
          ]}
          accent={ACCENT}
          onSend={onCommand}
        />
      </div>
    </section>
  );
}
