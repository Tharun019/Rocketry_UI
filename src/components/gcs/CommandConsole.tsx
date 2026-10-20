import { useEffect, useRef } from "react";
import { Panel, TONE_COLOR } from "./ui";

export type ConsoleEntry = {
  id: number;
  t: string;
  channel: "ROCKET" | "SYS";
  cmd: string;
  ack: "ACK" | "NAK" | "PENDING";
  exec?: "PASS" | "FAIL" | "PENDING";
};

type Props = {
  entries: ConsoleEntry[];
};

const ACK_COLOR = { ACK: TONE_COLOR.ok, NAK: TONE_COLOR.danger, PENDING: TONE_COLOR.warn };
const EXEC_COLOR = { PASS: TONE_COLOR.ok, FAIL: TONE_COLOR.danger, PENDING: "var(--subtle)" };

export function CommandConsole({ entries }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  return (
    <Panel
      title="Command log"
      meta={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
      className="h-full min-h-[300px]"
      bodyClassName="flex flex-col gap-1.5"
    >
      <div className="grid grid-cols-[64px_64px_minmax(0,1fr)_48px_48px] gap-3 px-3 eyebrow">
        <span>Time</span>
        <span>Channel</span>
        <span>Command</span>
        <span className="text-right">Ack</span>
        <span className="text-right">Exec</span>
      </div>
      <div
        ref={ref}
        className="well flex-1 min-h-[180px] max-h-[260px] overflow-auto scroll-quiet py-1 font-mono text-[11.5px]"
      >
        {entries.length === 0 ? (
          <div className="px-3 py-1.5 text-subtle font-sans text-xs">Awaiting commands…</div>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[64px_64px_minmax(0,1fr)_48px_48px] gap-3 items-center px-3 py-1 hover:bg-hover/50"
            >
              <span className="text-subtle">{e.t}</span>
              <span
                className="text-[10.5px]"
                style={{
                  color: e.channel === "ROCKET" ? "var(--rocket)" : "var(--muted-foreground)",
                }}
              >
                {e.channel}
              </span>
              <span className="truncate text-foreground">{e.cmd}</span>
              <span className="text-[10.5px] text-right" style={{ color: ACK_COLOR[e.ack] }}>
                {e.ack === "PENDING" ? "…" : e.ack}
              </span>
              <span
                className="text-[10.5px] text-right"
                style={{ color: EXEC_COLOR[e.exec ?? "PENDING"] }}
              >
                {!e.exec || e.exec === "PENDING" ? "—" : e.exec}
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
