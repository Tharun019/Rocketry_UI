type Props = {
  pitch: number; // deg
  roll: number; // deg
  yaw: number; // deg
  accent: string;
  label: string;
};

export function AttitudeIndicator({ pitch, roll, yaw, accent, label }: Props) {
  const p = Math.max(-45, Math.min(45, pitch));
  return (
    <div className="panel p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span className="label-mono text-[10px]" style={{ color: accent }}>
          ATTITUDE
        </span>
      </div>
      <div className="relative aspect-square rounded-full overflow-hidden border border-border bg-[oklch(0.16_0_0)]">
        <div
          className="absolute inset-0"
          style={{
            transform: `rotate(${-roll}deg)`,
            transition: "transform 200ms linear",
          }}
        >
          <div
            className="absolute inset-x-0"
            style={{
              top: `${50 - p}%`,
              height: "50%",
              background: "linear-gradient(to bottom, oklch(0.32 0.05 55), oklch(0.24 0.03 55))",
              opacity: 0.5,
            }}
          />
          <div
            className="absolute inset-x-0"
            style={{
              top: `${50 - p + 50}%`,
              height: "50%",
              background: "linear-gradient(to bottom, oklch(0.22 0.02 240), oklch(0.16 0.02 240))",
              opacity: 0.5,
            }}
          />
          <div
            className="absolute inset-x-0 h-px"
            style={{ top: `${50 - p}%`, background: accent }}
          />
        </div>
        {/* fixed crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div className="absolute -translate-x-1/2 -translate-y-1/2 w-16 h-px bg-foreground/80" />
            <div className="absolute -translate-x-1/2 -translate-y-1/2 h-3 w-px bg-foreground/80" />
          </div>
        </div>
        {/* roll ticks */}
        <div className="absolute inset-2 rounded-full border border-border/60 pointer-events-none" />
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div>
          <div className="label-mono text-[9px]">Pitch</div>
          <div className="readout text-xs">{pitch.toFixed(1)}°</div>
        </div>
        <div>
          <div className="label-mono text-[9px]">Roll</div>
          <div className="readout text-xs">{roll.toFixed(1)}°</div>
        </div>
        <div>
          <div className="label-mono text-[9px]">Yaw</div>
          <div className="readout text-xs">{yaw.toFixed(1)}°</div>
        </div>
      </div>
    </div>
  );
}
