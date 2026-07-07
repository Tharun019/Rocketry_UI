type Props = {
  tx: number;
  rx: number;
  loss: number;
};

export function PacketMonitor({ tx, rx, loss }: Props) {
  const total = tx + rx;
  const lossPct = total > 0 ? (loss / total) * 100 : 0;
  return (
    <div className="panel p-3 flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <span className="label-mono">Packet Monitor</span>
        <span className="label-mono text-[10px] opacity-60">RF Link</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="TX" value={tx} color="var(--rocket)" />
        <Stat label="RX" value={rx} color="var(--cansat)" />
        <Stat label="LOSS" value={`${lossPct.toFixed(2)}%`} color="var(--warn)" />
      </div>
      <div className="mt-1">
        <div className="label-mono text-[10px] mb-1">Link integrity</div>
        <div className="h-1.5 rounded-full bg-[oklch(0.2_0_0)] overflow-hidden">
          <div
            className="h-full"
            style={{
              width: `${Math.max(0, 100 - lossPct * 4)}%`,
              background: "linear-gradient(to right, var(--ok), var(--rocket))",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-md border border-border bg-[oklch(0.16_0_0)] p-2">
      <div className="label-mono text-[9px]" style={{ color }}>
        {label}
      </div>
      <div className="readout text-lg">{value}</div>
    </div>
  );
}
