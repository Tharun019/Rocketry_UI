type Props = {
  states: readonly string[];
  current: string;
  accent: string;
  aliases?: Record<string, string | undefined>;
};

export function StateTimeline({ states, current, accent, aliases }: Props) {
  const idx = states.indexOf(current);
  return (
    <ol className="flex items-start gap-1">
      {states.map((s, i) => {
        const done = i < idx;
        const isCurrent = i === idx;
        const a = aliases?.[s];
        return (
          <li
            key={s}
            className="flex-1 flex flex-col gap-1.5 min-w-0"
            title={a ? `${s} (${a})` : s}
          >
            <div
              className="h-1 w-full rounded-full transition-colors"
              style={{
                background: isCurrent
                  ? accent
                  : done
                    ? `color-mix(in oklch, ${accent} 45%, transparent)`
                    : "var(--color-border)",
              }}
            />
            <span
              className={[
                "text-[10.5px] font-medium truncate leading-tight",
                isCurrent ? "text-foreground" : done ? "text-muted-foreground" : "text-subtle",
              ].join(" ")}
            >
              {s
                .replace(/_/g, " ")
                .toLowerCase()
                .replace(/^\w/, (c) => c.toUpperCase())}
            </span>
            {a ? (
              <span className="readout text-[9.5px] text-subtle truncate -mt-1">{a}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
