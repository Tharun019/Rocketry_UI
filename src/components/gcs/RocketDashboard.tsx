import { TelemetryCard } from "./TelemetryCard";
import { ChartGroup } from "./ChartGroup";
import { CommandGrid, type CommandSender } from "./CommandButton";
import type { RocketFrame } from "./telemetry";
import { Panel } from "./ui";

const ACCENT = "var(--rocket)";
const SERIES = "oklch(0.74 0.15 55)";

type Props = {
  data: RocketFrame;
  onCommand: CommandSender;
};

export function RocketDashboard({ data, onCommand }: Props) {
  const xyz = (v: [number, number, number], d: number) =>
    v.map((n, i) => ({ k: "XYZ"[i], v: n.toFixed(d) }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
      <div className="flex flex-col gap-4 min-w-0">
        <Panel
          title="Telemetry"
          meta={`T+${data.t.toFixed(1)} s · ${data.updateRate.toFixed(1)} Hz`}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <TelemetryCard label="Altitude" value={data.altitude.toFixed(0)} unit="m AGL" />
            <TelemetryCard label="Velocity" value={data.velocity.toFixed(1)} unit="m/s" />
            <TelemetryCard label="Pressure" value={data.pressure.toFixed(0)} unit="hPa" />
            <TelemetryCard label="Temperature" value={data.temperature.toFixed(1)} unit="°C" />
            <TelemetryCard
              label="GPS"
              value={`${data.lat.toFixed(5)}° N`}
              sub={`${data.lon.toFixed(5)}° E`}
              tone={data.gpsValid ? undefined : "warn"}
            />
            <TelemetryCard label="Acceleration" unit="m/s²" parts={xyz(data.accel, 1)} />
            <TelemetryCard label="Angular rate" unit="°/s" parts={xyz(data.gyro, 0)} />
            <TelemetryCard
              label="Battery"
              value={data.battery.toFixed(2)}
              unit="V"
              tone={data.battery < 11.2 ? "warn" : "ok"}
            />
            <TelemetryCard
              label="RSSI"
              value={data.rssi ?? "—"}
              unit="dBm"
              sub={`SNR ${data.snr?.toFixed(1) ?? "—"} dB`}
            />
            <TelemetryCard
              label="Link quality"
              value={`${data.linkQuality.toFixed(0)}%`}
              tone={data.linkQuality >= 80 ? "ok" : data.linkQuality >= 70 ? "warn" : "danger"}
            />
          </div>
        </Panel>

        <ChartGroup
          title="Live charts"
          accent={ACCENT}
          series={[
            { key: "alt", label: "Altitude", unit: "m", color: SERIES, data: data.charts.altitude },
            {
              key: "vel",
              label: "Velocity",
              unit: "m/s",
              color: SERIES,
              data: data.charts.velocity,
            },
            {
              key: "acc",
              label: "Accel Z",
              unit: "m/s²",
              color: SERIES,
              data: data.charts.acceleration,
            },
            { key: "gyro", label: "Gyro X", unit: "°/s", color: SERIES, data: data.charts.gyro },
            {
              key: "pres",
              label: "Pressure",
              unit: "hPa",
              color: SERIES,
              data: data.charts.pressure,
            },
            {
              key: "temp",
              label: "Temperature",
              unit: "°C",
              color: SERIES,
              data: data.charts.temperature,
            },
            {
              key: "batt",
              label: "Battery",
              unit: "V",
              color: "oklch(0.75 0.14 155)",
              data: data.charts.battery,
            },
          ]}
        />
      </div>

      <Panel title="Commands" meta="Uplink" className="h-fit xl:sticky xl:top-[88px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Flight computer</span>
            <CommandGrid
              columns="grid-cols-2 xl:grid-cols-1"
              commands={[
                { name: "IMU_CALIBRATE" },
                { name: "LORA_LINK_ON" },
                { name: "LORA_LINK_OFF" },
              ]}
              accent={ACCENT}
              onSend={onCommand}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Recovery · requires confirmation</span>
            <CommandGrid
              columns="grid-cols-2 xl:grid-cols-1"
              commands={[
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
        </div>
      </Panel>
    </div>
  );
}
