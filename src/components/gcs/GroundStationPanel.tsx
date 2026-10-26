import { useEffect, useRef } from "react";
import {
  FileDown,
  HardDrive,
  Plug,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  Unplug,
} from "lucide-react";
import { BAUD_RATES, type SerialStatus } from "./serial";
import { CHANNELS, type ChannelId } from "./protocol";
import type { LinkMode, RadioLogEntry, RadioState } from "./link";
import { Button, Panel, Segmented, StatusPill, TONE_COLOR, type Tone } from "./ui";
import { cn } from "@/lib/utils";

export type DataSource = "sim" | "live";

export type BackupInfo = {
  /** Packets kept in this browser for the current live session. */
  saved: number;
  error: string | null;
  /** A previous session found after a reload, not yet restored or discarded. */
  offer: { count: number; onRestore: () => void; onDiscard: () => void } | null;
  onNewSession: () => void;
};

export type FileRecInfo = {
  supported: boolean;
  /** Null while not recording. */
  active: { name: string; rows: number; error: string | null } | null;
  onStart: () => void;
  onStop: () => void;
};

type Props = {
  source: DataSource;
  onSourceChange: (s: DataSource) => void;
  status: SerialStatus;
  error: string | null;
  baud: number;
  onBaudChange: (b: number) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  /** Most recent line from the USB port, shown as-is for wiring checks. */
  lastLine: string | null;
  linkMode: LinkMode;
  onLinkModeChange: (m: LinkMode) => void;
  channel: ChannelId;
  onChannelChange: (c: ChannelId) => void;
  radioState: RadioState;
  radioDetail: string;
  radioLog: RadioLogEntry[];
  onReconfigure: () => void;
  backup: BackupInfo;
  fileRec: FileRecInfo;
};

const STATUS: Record<SerialStatus, { label: string; tone: Tone }> = {
  unsupported: { label: "Not supported", tone: "danger" },
  idle: { label: "Not connected", tone: "neutral" },
  connecting: { label: "Connecting", tone: "warn" },
  open: { label: "Connected", tone: "ok" },
  error: { label: "Error", tone: "danger" },
};

const RADIO: Record<RadioState, { label: string; tone: Tone }> = {
  off: { label: "Radio off", tone: "neutral" },
  configuring: { label: "Configuring", tone: "warn" },
  listening: { label: "Listening", tone: "ok" },
  transmitting: { label: "Transmitting", tone: "accent" },
  error: { label: "Radio error", tone: "danger" },
};

const TAG_COLOR: Record<RadioLogEntry["tag"], string> = {
  RX: TONE_COLOR.ok,
  TX: "var(--rocket)",
  AT: "var(--muted-foreground)",
  SYS: "var(--subtle)",
  ERR: TONE_COLOR.danger,
};

export function GroundStationPanel(p: Props) {
  const open = p.status === "open" || p.status === "connecting";
  const s = STATUS[p.status];
  const r = RADIO[p.radioState];

  return (
    <Panel
      title="Ground station"
      meta="Data source"
      actions={
        p.source === "live" ? (
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
          value={p.source}
          onChange={p.onSourceChange}
          className="w-full [&>button]:flex-1"
        />
      </div>

      {p.backup.offer ? (
        <div
          className="rounded-md border px-3 py-2.5 flex flex-col gap-2"
          style={{
            borderColor: `color-mix(in oklch, ${TONE_COLOR.warn} 40%, transparent)`,
            background: `color-mix(in oklch, ${TONE_COLOR.warn} 8%, transparent)`,
          }}
        >
          <span className="text-xs">
            <b>{p.backup.offer.count.toLocaleString()} packets</b> from an earlier live session are
            saved in this browser. New packets are added after them automatically.
          </span>
          <div className="flex gap-2">
            <Button variant="primary" onClick={p.backup.offer.onRestore}>
              <RotateCcw className="h-3.5 w-3.5" /> Restore now
            </Button>
            <Button variant="danger" onClick={p.backup.offer.onDiscard}>
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </Button>
          </div>
        </div>
      ) : null}

      {p.source === "sim" ? (
        <p className="text-xs text-subtle leading-relaxed">
          A simulated flight from the launch site. Switch to Live to read the ground-station Teensy
          over USB.
        </p>
      ) : p.status === "unsupported" ? (
        <p className="text-xs leading-relaxed" style={{ color: TONE_COLOR.danger }}>
          This browser cannot open USB serial ports. Use Chrome or Edge on a laptop or desktop.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className={cn("flex flex-col gap-1.5", open && "opacity-50 pointer-events-none")}>
              <span className="eyebrow">Receiver</span>
              <Segmented
                options={[
                  { id: "rak", label: "RAK bridge" },
                  { id: "plain", label: "Plain lines" },
                ]}
                value={p.linkMode}
                onChange={p.onLinkModeChange}
                className="w-full [&>button]:flex-1 [&>button]:px-1.5"
              />
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Channel</span>
              <select
                value={p.channel}
                disabled={p.linkMode !== "rak"}
                onChange={(e) => p.onChannelChange(e.target.value as ChannelId)}
                className="h-[30px] rounded-md border border-border bg-well px-2 readout text-[12px] disabled:opacity-50 focus:outline-none focus:border-border-strong"
              >
                {CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Baud rate</span>
              <select
                value={p.baud}
                disabled={open}
                onChange={(e) => p.onBaudChange(Number(e.target.value))}
                className="h-9 rounded-md border border-border bg-well px-2.5 readout text-[13px] disabled:opacity-50 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-ring/40"
              >
                {BAUD_RATES.map((b) => (
                  <option key={b} value={b}>
                    {b.toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            {open ? (
              <Button size="md" onClick={p.onDisconnect}>
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </Button>
            ) : (
              <Button size="md" variant="primary" onClick={p.onConnect}>
                <Plug className="h-3.5 w-3.5" /> Connect USB
              </Button>
            )}
          </div>

          {p.error ? (
            <p className="text-xs" style={{ color: TONE_COLOR.danger }}>
              {p.error}
            </p>
          ) : null}

          {p.status === "open" ? (
            <div className="flex items-center gap-2 min-w-0">
              <StatusPill tone={r.tone} dot className="shrink-0">
                {r.label}
              </StatusPill>
              <span
                className="readout text-[11px] text-muted-foreground truncate flex-1"
                title={p.radioDetail}
              >
                {p.radioDetail}
              </span>
              {p.linkMode === "rak" ? (
                <Button
                  variant="ghost"
                  title="Send the radio setup again"
                  disabled={p.radioState === "configuring" || p.radioState === "transmitting"}
                  onClick={p.onReconfigure}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="well px-3 py-2.5 flex flex-col gap-1 min-w-0">
            <span className="eyebrow">Last line from USB</span>
            <span className="readout text-[11.5px] break-all text-muted-foreground">
              {p.lastLine ?? "—"}
            </span>
          </div>

          <RadioLog entries={p.radioLog} />

          <p className="text-[11px] text-subtle leading-relaxed">
            {p.linkMode === "rak"
              ? "RAK bridge: the Teensy passes the RAK3272S through. On connect the UI sets P2P mode (SF9, 125 kHz, 4/5, sync 0x54) and decodes +EVT:RXP2P packets."
              : "Plain lines: one packet per line, the 16-column rulebook line or the 23-column line, optionally followed by RSSI and SNR."}
          </p>
        </>
      )}

      {p.source === "live" ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="eyebrow">Safety copy</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">
              {p.backup.error ? (
                <span style={{ color: TONE_COLOR.danger }}>
                  Browser backup failing: {p.backup.error}
                </span>
              ) : (
                <>
                  {p.backup.saved.toLocaleString()} lines saved in this browser · survives a refresh
                </>
              )}
            </span>
            <Button
              variant="ghost"
              title="Clear the log and start a new session"
              onClick={p.backup.onNewSession}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {p.fileRec.active ? (
            <div className="flex items-center gap-2 text-xs">
              <FileDown className="h-3.5 w-3.5 shrink-0" style={{ color: TONE_COLOR.ok }} />
              <span className="flex-1 truncate">
                Writing <span className="readout">{p.fileRec.active.name}</span> ·{" "}
                {p.fileRec.active.rows.toLocaleString()} rows
                {p.fileRec.active.error ? (
                  <span style={{ color: TONE_COLOR.danger }}> · {p.fileRec.active.error}</span>
                ) : null}
              </span>
              <Button onClick={p.fileRec.onStop}>
                <Square className="h-3 w-3" /> Stop
              </Button>
            </div>
          ) : (
            <Button
              disabled={!p.fileRec.supported}
              onClick={p.fileRec.onStart}
              className="self-start"
            >
              <FileDown className="h-3.5 w-3.5" /> Record flight CSV to a file
            </Button>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

function RadioLog({ entries }: { entries: RadioLogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = entries[entries.length - 1]?.id;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [last]);
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="eyebrow">Radio log</span>
      <div
        ref={ref}
        className="well max-h-[150px] min-h-[64px] overflow-auto scroll-quiet px-3 py-1.5 font-mono text-[10.5px] space-y-0.5"
      >
        {entries.length === 0 ? (
          <div className="text-subtle font-sans text-xs">Nothing yet.</div>
        ) : (
          entries.slice(-120).map((e) => (
            <div key={e.id} className="flex gap-2 min-w-0">
              <span className="text-subtle shrink-0">
                {new Date(e.at).toISOString().slice(11, 19)}
              </span>
              <span className="w-[26px] shrink-0" style={{ color: TAG_COLOR[e.tag] }}>
                {e.tag}
              </span>
              <span className="text-muted-foreground break-all">{e.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
