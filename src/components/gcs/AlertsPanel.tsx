import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Panel, StatusPill, TONE_COLOR } from "./ui";

export type AlertType =
  | "COMMUNICATION LOST"
  | "LOW BATTERY"
  | "HIGH TEMPERATURE"
  | "GPS INVALID"
  | "PARACHUTE COMMAND FAILED"
  | "TELEMETRY TIMEOUT";

export type ActiveAlert = {
  type: AlertType;
  level: "warn" | "danger";
  source: "ROCKET" | "SYS";
  since: string;
  detail?: string;
};

export type AlertHistoryEntry = {
  id: number;
  type: AlertType;
  source: string;
  time: string;
  action: "RAISED" | "CLEARED";
};

type Props = {
  active: ActiveAlert[];
  history: AlertHistoryEntry[];
};

export function AlertsPanel({ active, history }: Props) {
  const critical = active.some((a) => a.level === "danger");
  return (
    <Panel
      title="Mission alerts"
      meta={`${history.length} logged`}
      actions={
        <StatusPill tone={critical ? "danger" : active.length ? "warn" : "ok"}>
          {active.length ? `${active.length} active` : "Clear"}
        </StatusPill>
      }
      className="h-full min-h-[300px]"
      bodyClassName="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        {active.length === 0 ? (
          <div className="well flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: TONE_COLOR.ok }} />
            No active alerts — all monitored conditions nominal
          </div>
        ) : (
          active.map((a) => {
            const color = a.level === "danger" ? TONE_COLOR.danger : TONE_COLOR.warn;
            return (
              <div
                key={`${a.type}-${a.source}`}
                className="flex items-center gap-2.5 rounded-md border border-l-2 px-3 py-2"
                style={{
                  borderColor: `color-mix(in oklch, ${color} 30%, transparent)`,
                  borderLeftColor: color,
                  background: `color-mix(in oklch, ${color} 7%, transparent)`,
                }}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                <span className="text-xs font-semibold flex-1 truncate" style={{ color }}>
                  {a.type}
                  {a.detail ? (
                    <span className="readout font-normal text-muted-foreground"> · {a.detail}</span>
                  ) : null}
                </span>
                <span className="text-[11px] text-subtle">{a.source}</span>
                <span className="readout text-[11px] text-muted-foreground">{a.since}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex-1 min-h-[90px] flex flex-col gap-1.5">
        <span className="eyebrow">History</span>
        <div className="well flex-1 min-h-[180px] max-h-[260px] overflow-auto scroll-quiet px-3 py-2 font-mono text-[11px] space-y-1">
          {history.length === 0 ? (
            <div className="text-subtle font-sans text-xs">No alerts recorded.</div>
          ) : (
            history
              .slice()
              .reverse()
              .map((h) => (
                <div key={h.id} className="flex items-center gap-3">
                  <span className="text-subtle">{h.time}</span>
                  <span
                    className="w-[60px]"
                    style={{ color: h.action === "RAISED" ? TONE_COLOR.warn : TONE_COLOR.ok }}
                  >
                    {h.action}
                  </span>
                  <span className="flex-1 truncate text-muted-foreground">{h.type}</span>
                  <span className="text-subtle">{h.source}</span>
                </div>
              ))
          )}
        </div>
      </div>
    </Panel>
  );
}
