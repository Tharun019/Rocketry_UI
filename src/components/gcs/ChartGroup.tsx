import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, ZoomIn } from "lucide-react";
import { MiniChart } from "./MiniChart";
import type { Sample } from "./telemetry";
import { Button, Panel, StatusPill } from "./ui";
import { cn } from "@/lib/utils";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  unit?: string;
  data: Sample[];
};

type Props = {
  title: string;
  series: ChartSeries[];
  accent: string;
  columns?: string;
};

const MIN_WINDOW = 10;
const MAX_WINDOW = 120;

export function ChartGroup({ title, series, columns = "grid-cols-2 md:grid-cols-4" }: Props) {
  const [paused, setPaused] = useState(false);
  const [windowSize, setWindowSize] = useState(60);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [clearAt, setClearAt] = useState(0);
  const frozen = useRef<ChartSeries[]>(series);
  const containerRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});

  if (!paused) frozen.current = series;
  const source = paused ? frozen.current : series;

  wheelRef.current = (e: WheelEvent) => {
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    setWindowSize((w) =>
      Math.round(Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, w * Math.exp(dy * 0.0015)))),
    );
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelRef.current(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const visible = useMemo(
    () =>
      source
        .filter((s) => !hidden[s.key])
        .map((s) => ({
          ...s,
          data: s.data.filter((p) => p.t >= clearAt).slice(-windowSize),
        })),
    [source, hidden, clearAt, windowSize],
  );

  const lastT = source[0]?.data.at(-1)?.t ?? 0;

  return (
    <Panel
      title={title}
      meta={
        <span className="inline-flex items-center gap-1">
          <ZoomIn className="h-3 w-3" /> {windowSize} samples · scroll to zoom
        </span>
      }
      actions={
        <>
          {paused ? (
            <StatusPill tone="warn" className="mr-1">
              Frozen
            </StatusPill>
          ) : null}
          <Button onClick={() => setPaused((p) => !p)} active={paused}>
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="ghost" onClick={() => setClearAt(lastT)}>
            <RotateCcw className="h-3 w-3" /> Clear
          </Button>
        </>
      }
      bodyClassName="flex flex-col gap-3"
    >
      <div className="flex flex-wrap gap-1.5">
        {source.map((s) => {
          const on = !hidden[s.key];
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => setHidden((h) => ({ ...h, [s.key]: on }))}
              className={cn(
                "inline-flex items-center gap-1.5 h-6 px-2 rounded-md border text-[11px] font-medium transition-colors",
                on
                  ? "border-border bg-well text-foreground hover:border-border-strong"
                  : "border-transparent text-subtle hover:text-muted-foreground",
              )}
            >
              <span
                className="h-2 w-2 rounded-[2px] border"
                style={{ background: on ? s.color : "transparent", borderColor: s.color }}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      <div
        ref={containerRef}
        className={`grid ${columns} gap-3 auto-rows-[112px]`}
        style={{ touchAction: "none" }}
      >
        {visible.length === 0 ? (
          <div className="col-span-full well h-[112px] flex items-center justify-center text-xs text-subtle">
            No series selected
          </div>
        ) : (
          visible.map((s) => (
            <MiniChart key={s.key} data={s.data} color={s.color} label={s.label} unit={s.unit} />
          ))
        )}
      </div>
    </Panel>
  );
}
