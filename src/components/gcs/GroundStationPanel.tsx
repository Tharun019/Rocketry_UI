import { Plug, Unplug } from "lucide-react";
import type { SerialStatus } from "./serial";
import { PACKET_FIELDS } from "./packets";
import { Button, Panel, Segmented, StatusPill, TONE_COLOR, type Tone } from "./ui";

export type DataSource = "sim" | "live";

type Props = {
  source: DataSource;
  onSourceChange: (s: DataSource) => void;
  status: SerialStatus;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  /** Most recent line from the receiver, shown as-is for wiring checks. */
  lastLine: string | null;
};

const STATUS: Record<SerialStatus, { label: string; tone: Tone }> = {
  unsupported: { label: "Not supported", tone: "danger" },
  idle: { label: "Not connected", tone: "neutral" },
  connecting: { label: "Connecting", tone: "warn" },
  open: { label: "Connected", tone: "ok" },
  error: { label: "Error", tone: "danger" },
};

export function GroundStationPanel({
  source,
  onSourceChange,
  status,
  error,
  onConnect,
  onDisconnect,
  lastLine,
}: Props) {
  const open = status === "open" || status === "connecting";
  const s = STATUS[status];

  return (
    <Panel
      title="Ground station"
      meta="Data source"
      actions={
        source === "live" ? (
          <StatusPill tone={s.tone} className="h-6 px-2 text-[10.5px]">
            {s.label}
          </StatusPill>
        ) : null
      }
      bodyClassName="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">Telemetry source</span>
        <Segmented
          options={[
            { id: "sim", label: "Simulation" },
            { id: "live", label: "Live · USB" },
          ]}
          value={source}
          onChange={onSourceChange}
          className="w-full [&>button]:flex-1"
        />
      </div>

      {source === "sim" ? (
        <p className="text-xs text-subtle leading-relaxed">
          A simulated flight from the launch site. Switch to Live to read the ground-station Teensy
          over USB.
        </p>
      ) : status === "unsupported" ? (
        <p className="text-xs leading-relaxed" style={{ color: TONE_COLOR.danger }}>
          This browser cannot open USB serial ports. Use Chrome or Edge on a laptop or desktop.
        </p>
      ) : (
        <>
          {open ? (
            <Button size="md" className="w-full" onClick={onDisconnect}>
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          ) : (
            <Button size="md" variant="primary" className="w-full" onClick={onConnect}>
              <Plug className="h-3.5 w-3.5" /> Connect USB
            </Button>
          )}

          {error ? (
            <p className="text-xs" style={{ color: TONE_COLOR.danger }}>
              {error}
            </p>
          ) : null}

          <div className="well px-3 py-2.5 flex flex-col gap-1 min-w-0">
            <span className="eyebrow">Last line received</span>
            <span className="readout text-[11.5px] break-all text-muted-foreground">
              {lastLine ?? "—"}
            </span>
          </div>

          <p className="text-[11px] text-subtle leading-relaxed">
            One packet per line: {PACKET_FIELDS.length} comma-separated fields in the IN-SPACe order
            (empty values allowed). Lines starting with # are ground-station info; RSSI/SNR are read
            from them. Close the Arduino Serial Monitor first: only one program can open the port.
          </p>
        </>
      )}
    </Panel>
  );
}
