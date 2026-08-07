import { Satellite } from "lucide-react";
import { StateTimeline } from "./StateTimeline";
import { TelemetryCard } from "./TelemetryCard";
import { ChartGroup } from "./ChartGroup";
import { ControlledDescentPanel } from "./ControlledDescentPanel";
import { CommandGrid, type CommandSender } from "./CommandButton";
import { CANSAT_STATES, type CansatFrame } from "./telemetry";

const ACCENT = "var(--cansat)";

type Props = {
  data: CansatFrame;
  onCommand: CommandSender;
};

export function CansatDashboard({ data, onCommand }: Props) {
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Satellite className="h-4 w-4" style={{ color: ACCENT }} />
          <h2 className="font-semibold tracking-tight text-lg">CanSat</h2>
          <span className="h-1.5 w-1.5 rounded-full dot-pulse ml-1" style={{ background: ACCENT }} />
        </div>
        <span className="label-mono text-[10px]">Secondary Payload</span>
      </div>

      <StateTimeline states={CANSAT_STATES} current={data.state} accent={ACCENT} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <TelemetryCard label="Altitude" value={data.altitude.toFixed(0)} unit="m" accent={ACCENT} />
        <TelemetryCard label="Velocity" value={data.velocity.toFixed(1)} unit="m/s" accent={ACCENT} />
        <TelemetryCard label="Pressure" value={data.pressure.toFixed(0)} unit="hPa" />
        <TelemetryCard label="Radiation" value={data.radiationCpm.toFixed(0)} unit="CPM" />
        <TelemetryCard label="IR Temp" value={data.irTemp.toFixed(1)} unit="°C" />
        <TelemetryCard label="GPS" value={`${data.lat.toFixed(4)}°`} sub={`${data.lon.toFixed(4)}°`} />
        <TelemetryCard
          label="Battery"
          value={data.battery.toFixed(2)}
          unit="V"
          accent="var(--ok)"
          sub={`${data.current.toFixed(2)} A`}
        />
        <TelemetryCard
          label="Link"
          value={`${data.linkQuality.toFixed(0)}%`}
          accent="var(--ok)"
          sub={`${data.rssi} dBm · SNR ${data.snr.toFixed(1)}`}
        />
      </div>

      <ControlledDescentPanel data={data} accent={ACCENT} />

      <ChartGroup
        title="CanSat Live Charts"
        accent={ACCENT}
        series={[
          { key: "alt", label: "Altitude", unit: "m", color: "oklch(0.82 0.12 210)", data: data.charts.altitude },
          { key: "vel", label: "Velocity", unit: "m/s", color: "oklch(0.82 0.12 210)", data: data.charts.velocity },
          { key: "pres", label: "Pressure", unit: "hPa", color: "oklch(0.74 0.1 210)", data: data.charts.pressure },
          { key: "rad", label: "Radiation", unit: "CPM", color: "oklch(0.78 0.16 85)", data: data.charts.radiation },
          { key: "bcur", label: "Batt Current", unit: "A", color: "oklch(0.78 0.15 155)", data: data.charts.batteryCurrent },
          { key: "bvolt", label: "Batt Voltage", unit: "V", color: "oklch(0.78 0.15 155)", data: data.charts.batteryVoltage },
          { key: "ir", label: "IR Temp", unit: "°C", color: "oklch(0.78 0.11 210)", data: data.charts.irTemp },
        ]}
      />

      <div className="panel p-3 flex flex-col gap-2">
        <span className="label-mono">Commands</span>
        <CommandGrid
          commands={[
            { name: "TELEMETRY_ENABLE" },
            { name: "IMU_CALIBRATE" },
            { name: "DEPLOY_CHUTE" },
            { name: "SERVO_TRIGGER" },
            { name: "COMM_TEST" },
            { name: "SIMULATION_ENABLE" },
            { name: "SIMULATION_ACTIVATE" },
            {
              name: "STOP_TELEMETRY",
              danger: true,
              confirm: true,
              note: "Halts downlink in case of interference",
            },
          ]}
          accent={ACCENT}
          onSend={onCommand}
        />
      </div>
    </section>
  );
}
