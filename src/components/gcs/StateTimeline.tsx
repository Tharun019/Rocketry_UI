type Props = {
  states: readonly string[];
  current: string;
  accent: string;
  aliases?: Record<string, string | undefined>;
};

export function StateTimeline({ states, current, accent, aliases }: Props) {
  const idx = states.indexOf(current);
  const alias = aliases?.[current];
  return (
    <div className="panel px-3 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <span className="label-mono">Flight State</span>
        <span className="readout text-xs" style={{ color: accent }}>
          {current}
          {alias ? <span className="opacity-60"> [{alias}]</span> : null}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {states.map((s, i) => {
          const active = i <= idx;
          const isCurrent = i === idx;
          const a = aliases?.[s];
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
                className="label-mono text-[8px] truncate w-full text-center"
                style={{ color: isCurrent ? accent : undefined, opacity: isCurrent ? 1 : 0.6 }}
                title={a ? `${s} (${a})` : s}
              >
                {s.replace(/_/g, " ")}
              </span>
              {a ? (
                <span
                  className="label-mono text-[7.5px] truncate w-full text-center opacity-45"
                  title={a}
                >
                  [{a}]
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
