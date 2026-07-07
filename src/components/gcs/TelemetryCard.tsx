type Props = {
  label: string;
  value: string | number;
  unit?: string;
  accent?: string;
  sub?: string;
};

export function TelemetryCard({ label, value, unit, sub, accent }: Props) {
  return (
    <div className="panel px-3 py-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {accent ? (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: accent }}
            aria-hidden
          />
        ) : null}
        <span className="label-mono">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="readout text-2xl leading-none">{value}</span>
        {unit ? <span className="label-mono text-[10px]">{unit}</span> : null}
      </div>
      {sub ? <span className="label-mono text-[10px] opacity-70">{sub}</span> : null}
    </div>
  );
}
