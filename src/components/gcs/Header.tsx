import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Info, Rocket } from "lucide-react";
import { StatusPill, type Tone } from "./ui";

type RfStatus = { rssi: number | null; snr: number | null; quality: number };

export type MissionEvent = { label: string; time: string };

export type SystemStatus = "NOMINAL" | "DEGRADED" | "CRITICAL";

type Props = {
  rocketRf: RfStatus;
  alert?: { level: "info" | "warn" | "danger"; message: string } | null;
  events: MissionEvent[];
  missionPhase: string;
  systemStatus: SystemStatus;
};

const STATUS_TONE: Record<SystemStatus, Tone> = {
  NOMINAL: "ok",
  DEGRADED: "warn",
  CRITICAL: "danger",
};

const ALERT_STYLE = {
  danger: { color: "var(--destructive)", bg: "oklch(0.65 0.2 25 / 0.12)" },
  warn: { color: "var(--warn)", bg: "oklch(0.8 0.14 80 / 0.1)" },
  info: { color: "var(--muted-foreground)", bg: "oklch(0.6 0.01 255 / 0.06)" },
};

export function Header({ rocketRf, alert, events, missionPhase, systemStatus }: Props) {
  const [t, setT] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setT(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  const linkGood = rocketRf.quality >= 80;
  const a = alert ? ALERT_STYLE[alert.level] : null;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto max-w-[1920px] px-6 h-16 flex items-center gap-7">
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-9 w-9 rounded-lg border border-border-strong bg-panel-2 flex items-center justify-center">
            <Rocket className="h-4 w-4" style={{ color: "var(--rocket)" }} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Rocket Ground Station</div>
            <div className="text-xs text-subtle">Mission control · telemetry &amp; uplink</div>
          </div>
        </div>

        <Divider />

        <HeaderField label="Mission clock">
          <span className="readout text-[15px]">{t}</span>
          <span className="ml-1.5 text-[11px] text-subtle">UTC</span>
        </HeaderField>

        <HeaderField label="Mission phase">
          <span className="text-[13px] font-semibold tracking-wide">{missionPhase}</span>
        </HeaderField>

        <HeaderField label="System">
          <StatusPill tone={STATUS_TONE[systemStatus]}>{systemStatus}</StatusPill>
        </HeaderField>

        <div className="hidden xl:block">
          <Divider />
        </div>

        <div className="hidden xl:flex flex-col gap-1 min-w-[240px]">
          <span className="eyebrow">Latest events</span>
          {events.length === 0 ? (
            <span className="text-xs text-subtle">Awaiting ignition…</span>
          ) : (
            <div className="flex flex-col gap-0.5">
              {events
                .slice(-2)
                .reverse()
                .map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs leading-tight">
                    <span className="readout text-subtle">{e.time}</span>
                    <span
                      className={i === 0 ? "text-foreground font-medium" : "text-muted-foreground"}
                    >
                      {e.label}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="ml-auto hidden md:flex flex-col items-end gap-1">
          <span className="eyebrow">Rocket downlink</span>
          <div className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: linkGood ? "var(--ok)" : "var(--warn)" }}
            />
            <span className="readout text-muted-foreground">
              {rocketRf.rssi ?? "—"} dBm · SNR {rocketRf.snr?.toFixed(1) ?? "—"} dB ·{" "}
              <span className="text-foreground">{rocketRf.quality.toFixed(0)}%</span>
            </span>
          </div>
        </div>
      </div>

      {alert && a ? (
        <div className="border-t border-border" style={{ background: a.bg }}>
          <div className="mx-auto max-w-[1920px] px-6 h-8 flex items-center gap-2">
            {alert.level === "info" ? (
              <Info className="h-3.5 w-3.5" style={{ color: a.color }} />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" style={{ color: a.color }} />
            )}
            <span className="text-xs font-semibold tracking-wide" style={{ color: a.color }}>
              {alert.message}
            </span>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function Divider() {
  return <div className="hidden md:block h-8 w-px bg-border shrink-0" />;
}

function HeaderField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="hidden sm:flex flex-col gap-1 shrink-0">
      <span className="eyebrow">{label}</span>
      <div className="flex items-baseline leading-none h-6 items-center">{children}</div>
    </div>
  );
}
