import { useEffect, useRef } from "react";

export type ConsoleEntry = {
  id: number;
  t: string;
  channel: "ROCKET" | "CANSAT" | "SYS";
  cmd: string;
  ack: "ACK" | "NAK" | "PENDING";
};

type Props = {
  entries: ConsoleEntry[];
};

export function CommandConsole({ entries }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  return (
    <div className="panel p-3 flex flex-col gap-2 h-full min-h-[220px]">
      <div className="flex items-center justify-between">
        <span className="label-mono">Command Console</span>
        <span className="label-mono text-[10px] opacity-60">{entries.length} entries</span>
      </div>
      <div
        ref={ref}
        className="flex-1 overflow-auto rounded-md bg-[oklch(0.14_0_0)] border border-border p-2 font-mono text-[11px] space-y-0.5"
      >
        {entries.length === 0 ? (
          <div className="text-muted-foreground text-[11px]">Awaiting commands…</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <span className="text-muted-foreground">{e.t}</span>
              <span
                className="text-[10px] px-1.5 py-px rounded border"
                style={{
                  color:
                    e.channel === "ROCKET"
                      ? "var(--rocket)"
                      : e.channel === "CANSAT"
                        ? "var(--cansat)"
                        : "var(--muted-foreground)",
                  borderColor:
                    e.channel === "ROCKET"
                      ? "var(--rocket-dim)"
                      : e.channel === "CANSAT"
                        ? "var(--cansat-dim)"
                        : "var(--border)",
                }}
              >
                {e.channel}
              </span>
              <span className="flex-1 truncate">{e.cmd}</span>
              <span
                className="text-[10px]"
                style={{
                  color:
                    e.ack === "ACK"
                      ? "var(--ok)"
                      : e.ack === "NAK"
                        ? "var(--destructive)"
                        : "var(--warn)",
                }}
              >
                {e.ack}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
