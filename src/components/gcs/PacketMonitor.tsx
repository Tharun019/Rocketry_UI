import { Panel, Stat, StatusPill, TONE_COLOR, type Tone } from "./ui";

type LinkStatus = "CONNECTED" | "DEGRADED" | "LOST";

type Props = {
  tx: number;
  rx: number;
  loss: number;
  snr: number | null;
  lastPacket: string;
  rateHz: number;
  status: LinkStatus;
};

const STATUS_TONE: Record<LinkStatus, Tone> = {
  CONNECTED: "ok",
  DEGRADED: "warn",
  LOST: "danger",
};

export function PacketMonitor({ tx, rx, loss, snr, lastPacket, rateHz, status }: Props) {
  // Loss = downlink packets the on-board counter says were sent but never arrived.
  const sent = rx + loss;
  const lossPct = sent > 0 ? (loss / sent) * 100 : 0;
  const integrity = Math.max(0, 100 - lossPct * 4);
  const integrityTone: Tone = integrity >= 90 ? "ok" : integrity >= 75 ? "warn" : "danger";

  return (
    <Panel
      title="Packet monitor"
      meta="LoRa downlink"
      actions={<StatusPill tone={STATUS_TONE[status]}>{status}</StatusPill>}
      className="h-full"
      bodyClassName="flex flex-col gap-3"
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat label="TX cmds" value={tx.toLocaleString()} size="lg" />
        <Stat label="RX" value={rx.toLocaleString()} size="lg" />
        <Stat
          label="Loss"
          value={lossPct.toFixed(2)}
          unit="%"
          size="lg"
          color={lossPct > 2 ? TONE_COLOR.warn : undefined}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="SNR" value={snr?.toFixed(1) ?? "—"} unit="dB" />
        <Stat label="Rate" value={rateHz.toFixed(1)} unit="Hz" />
        <Stat label="Last packet" value={lastPacket} />
      </div>
      <div className="mt-auto">
        <div className="flex items-center justify-between mb-1.5">
          <span className="eyebrow">Link integrity</span>
          <span className="readout text-xs" style={{ color: TONE_COLOR[integrityTone] }}>
            {integrity.toFixed(1)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-well border border-border overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${integrity}%`, background: TONE_COLOR[integrityTone] }}
          />
        </div>
      </div>
    </Panel>
  );
}
