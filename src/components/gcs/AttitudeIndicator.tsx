import { Panel } from "./ui";

type Props = {
  pitch: number; // deg
  roll: number; // deg
  yaw: number; // deg
  accent: string;
  label: string;
};

const ROLL_TICKS = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
const PITCH_LADDER = [-30, -20, -10, 10, 20, 30];

export function AttitudeIndicator({ pitch, roll, yaw, accent, label }: Props) {
  const p = Math.max(-45, Math.min(45, pitch));
  return (
    <Panel title="Attitude" meta={label} bodyClassName="flex flex-col gap-3">
      <div className="relative aspect-square w-full max-w-[260px] mx-auto rounded-full overflow-hidden border border-border-strong bg-well">
        <div
          className="absolute inset-0"
          style={{ transform: `rotate(${-roll}deg)`, transition: "transform 200ms linear" }}
        >
          {/* sky / ground */}
          <div
            className="absolute -inset-x-1/4"
            style={{
              top: `${50 - p - 100}%`,
              height: "100%",
              background: "linear-gradient(to bottom, oklch(0.26 0.04 245), oklch(0.36 0.06 240))",
            }}
          />
          <div
            className="absolute -inset-x-1/4"
            style={{
              top: `${50 - p}%`,
              height: "100%",
              background: "linear-gradient(to bottom, oklch(0.33 0.04 60), oklch(0.22 0.025 60))",
            }}
          />
          <div className="absolute inset-x-0 h-px bg-foreground/80" style={{ top: `${50 - p}%` }} />
          {/* pitch ladder (1% of height per degree, matching the horizon offset) */}
          {PITCH_LADDER.map((d) => (
            <div
              key={d}
              className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5"
              style={{ top: `${50 - p - d}%` }}
            >
              <span className="readout text-[9px] text-foreground/60 w-4 text-right">
                {Math.abs(d)}
              </span>
              <span
                className="h-px bg-foreground/50"
                style={{ width: Math.abs(d) % 20 === 0 ? 44 : 24 }}
              />
              <span className="readout text-[9px] text-foreground/60 w-4">{Math.abs(d)}</span>
            </div>
          ))}
        </div>

        {/* roll scale */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full pointer-events-none">
          {ROLL_TICKS.map((a) => (
            <line
              key={a}
              x1="50"
              y1="4"
              x2="50"
              y2={a % 30 === 0 ? 10 : 7.5}
              stroke="currentColor"
              strokeWidth={a === 0 ? 1 : 0.6}
              className="text-foreground/70"
              transform={`rotate(${a} 50 50)`}
            />
          ))}
          <path d="M50 11 L47.8 15 L52.2 15 Z" fill={accent} transform={`rotate(${-roll} 50 50)`} />
          {/* fixed aircraft symbol */}
          <path
            d="M28 50 H42 L46 54 M72 50 H58 L54 54"
            fill="none"
            stroke={accent}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="50" r="1.4" fill={accent} />
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ["Pitch", pitch],
          ["Roll", roll],
          ["Yaw", yaw],
        ].map(([k, v]) => (
          <div key={k as string} className="well px-2.5 py-2 text-center">
            <div className="eyebrow">{k}</div>
            <div className="readout text-sm mt-0.5">{(v as number).toFixed(1)}°</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
