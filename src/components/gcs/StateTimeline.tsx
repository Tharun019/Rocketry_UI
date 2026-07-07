type Props = {
  states: readonly string[];
  current: string;
  accent: string;
};

export function StateTimeline({ states, current, accent }: Props) {
  const idx = states.indexOf(current);
  return (
    <div className="panel px-3 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <span className="label-mono">Flight State</span>
        <span className="readout text-xs" style={{ color: accent }}>
          {current}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {states.map((s, i) => {
          const active = i <= idx;
          const isCurrent = i === idx;
          return (
            <div key={s} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div
                className="h-1 w-full rounded-full transition-colors"
                style={{
                  background: active ? accent : "var(--color-border)",
                  opacity: active ? (isCurrent ? 1 : 0.7) : 1,
                }}
              />
              <span
                className="label-mono text-[8.5px] truncate w-full text-center"
                style={{ color: isCurrent ? accent : undefined, opacity: isCurrent ? 1 : 0.6 }}
                title={s}
              >
                {s.replace(/_/g, " ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
