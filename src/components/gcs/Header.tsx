import { useEffect, useState } from "react";
import { Radio, Satellite, AlertTriangle } from "lucide-react";

type RfStatus = { rssi: number; snr: number; quality: number };

export type MissionEvent = { label: string; time: string };

export type SystemStatus = "NOMINAL" | "DEGRADED" | "CRITICAL";

type Props = {
  rocketRf: RfStatus;
  cansatRf: RfStatus;
  missionId: string;
  launchSite: string;
  alert?: { level: "info" | "warn" | "danger"; message: string } | null;
  events: MissionEvent[];
  missionPhase: string;
  systemStatus: SystemStatus;
};

const STATUS_COLOR: Record<SystemStatus, string> = {
  NOMINAL: "var(--ok)",
  DEGRADED: "var(--warn)",
  CRITICAL: "var(--destructive)",
};

export function Header({
  rocketRf,
  cansatRf,
  missionId,
  launchSite,
  alert,
  events,
  missionPhase,
  systemStatus,
}: Props) {
  const [t, setT] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setT(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="border-b border-border bg-[oklch(0.155_0_0)]/80 backdrop-blur">
      <div className="px-5 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md border border-rocket/50 flex items-center justify-center bg-[oklch(0.18_0.02_55)]">
            <Radio className="h-4 w-4" style={{ color: "var(--rocket)" }} />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">Ground Station</div>
            <div className="label-mono text-[10px]">Rocket + CanSat Telemetry</div>
          </div>
        </div>

        <div className="hidden md:block h-8 w-px bg-border" />

        <div className="hidden md:flex flex-col leading-tight">
          <span className="label-mono">Mission Clock (UTC)</span>
          <span className="readout text-lg">{t}</span>
        </div>

        <div className="hidden md:block h-8 w-px bg-border" />

        <div className="flex flex-col leading-tight">
          <span className="label-mono">Mission Phase</span>
          <span className="readout text-sm" style={{ color: "var(--rocket)" }}>
            {missionPhase}
          </span>
        </div>

        <div className="flex flex-col leading-tight">
          <span className="label-mono">System Status</span>
          <span
            className="label-mono text-[10px] px-2 py-0.5 rounded border mt-0.5 w-fit"
            style={{ color: STATUS_COLOR[systemStatus], borderColor: STATUS_COLOR[systemStatus] }}
          >
            {systemStatus}
          </span>
        </div>

        <div className="hidden md:block h-8 w-px bg-border" />

        <div className="hidden md:flex flex-col leading-tight min-w-[220px]">
          <span className="label-mono">Event Log</span>
          {events.length === 0 ? (
            <span className="readout text-[11px] text-muted-foreground">Awaiting ignition…</span>
          ) : (
            <div className="flex flex-col gap-0.5 max-h-[38px] overflow-hidden">
              {events.slice(-2).map((e, i) => (
                <div key={i} className="flex items-center gap-2 leading-tight">
                  <span className="readout text-[11px]" style={{ color: "var(--rocket)" }}>
                    {e.time}
                  </span>
                  <span className="label-mono text-[10px]">{e.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hidden xl:flex flex-col leading-tight">
          <span className="label-mono">Mission ID</span>
          <span className="readout text-sm">{missionId}</span>
        </div>
        <div className="hidden xl:flex flex-col leading-tight">
          <span className="label-mono">Launch Site</span>
          <span className="readout text-sm">{launchSite}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <RfChip label="ROCKET" accent="var(--rocket)" rf={rocketRf} icon={<Radio className="h-3 w-3" />} />
          <RfChip label="CANSAT" accent="var(--cansat)" rf={cansatRf} icon={<Satellite className="h-3 w-3" />} />
        </div>
      </div>

      {alert ? (
        <div
          className="px-5 py-1.5 flex items-center gap-2 border-t border-border"
          style={{
            background:
              alert.level === "danger"
                ? "oklch(0.28 0.1 25 / 0.4)"
                : alert.level === "warn"
                  ? "oklch(0.3 0.09 85 / 0.35)"
                  : "oklch(0.24 0.03 210 / 0.35)",
          }}
        >
          <AlertTriangle
            className="h-3.5 w-3.5"
            style={{
              color:
                alert.level === "danger"
                  ? "var(--destructive)"
                  : alert.level === "warn"
                    ? "var(--warn)"
                    : "var(--cansat)",
            }}
          />
          <span className="label-mono text-[10px]" style={{ letterSpacing: "0.18em" }}>
            {alert.message}
          </span>
        </div>
      ) : null}
    </header>
  );
}

function RfChip({
  label,
  accent,
  rf,
  icon,
}: {
  label: string;
  accent: string;
  rf: RfStatus;
  icon: React.ReactNode;
}) {
  const good = rf.quality > 80;
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border"
      style={{ borderColor: "var(--color-border)", background: "oklch(0.17 0 0)" }}
    >
      <span style={{ color: accent }}>{icon}</span>
      <span className="label-mono text-[10px]" style={{ color: accent }}>
        {label}
      </span>
      <span
        className="h-1.5 w-1.5 rounded-full dot-pulse"
        style={{ background: good ? "var(--ok)" : "var(--warn)" }}
      />
      <span className="readout text-[11px] text-muted-foreground">
        {rf.rssi} dBm · SNR {rf.snr.toFixed(1)} dB · {rf.quality.toFixed(0)}%
      </span>
    </div>
  );
}
