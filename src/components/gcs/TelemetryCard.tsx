import { TONE_COLOR, type Tone } from "./ui";

type Props = {
  label: string;
  value?: string | number;
  unit?: string;
  sub?: string;
  tone?: Tone;
  /** Multi-axis readout (e.g. X/Y/Z) shown instead of a single value. */
  parts?: { k: string; v: string }[];
};

export function TelemetryCard({ label, value, unit, sub, tone, parts }: Props) {
  return (
    <div className="well px-3.5 py-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow truncate">{label}</span>
        {unit ? <span className="text-[11px] text-subtle shrink-0">{unit}</span> : null}
      </div>
      {parts ? (
        <div className="grid grid-cols-3 gap-1.5">
          {parts.map((p) => (
            <div key={p.k} className="min-w-0">
              <div className="text-[10px] font-semibold text-subtle">{p.k}</div>
              <div className="readout text-[15px] leading-tight truncate">{p.v}</div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="readout text-[22px] leading-none truncate"
          style={{ color: tone ? TONE_COLOR[tone] : undefined }}
        >
          {value}
        </div>
      )}
      {sub ? <span className="readout text-[11px] text-subtle truncate">{sub}</span> : null}
    </div>
  );
}
