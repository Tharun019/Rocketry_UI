import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, ZoomIn } from "lucide-react";
import { MiniChart } from "./MiniChart";
import type { Sample } from "./telemetry";

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

export function ChartGroup({ title, series, accent, columns = "grid-cols-2 md:grid-cols-4" }: Props) {
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
    <div className="panel p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="label-mono">{title}</span>
          <span className="label-mono text-[9px] opacity-50 flex items-center gap-1">
            <ZoomIn className="h-3 w-3" /> {windowSize} samples · scroll to zoom
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPaused((p) => !p)}
            className="panel px-2 py-1 label-mono text-[10px] flex items-center gap-1 hover:bg-[oklch(0.21_0_0)]"
            style={{ color: paused ? "var(--warn)" : undefined }}
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => setClearAt(lastT)}
            className="panel px-2 py-1 label-mono text-[10px] flex items-center gap-1 hover:bg-[oklch(0.21_0_0)]"
          >
            <RotateCcw className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {source.map((s) => {
          const on = !hidden[s.key];
          return (
            <button
              key={s.key}
              onClick={() => setHidden((h) => ({ ...h, [s.key]: on }))}
              className="flex items-center gap-1.5 label-mono text-[9px]"
              style={{ opacity: on ? 1 : 0.4 }}
            >
              <span
                className="h-2.5 w-2.5 rounded-[3px] border"
                style={{
                  background: on ? s.color : "transparent",
                  borderColor: s.color,
                }}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      <div ref={containerRef} className={`grid ${columns} gap-2 auto-rows-[110px]`} style={{ touchAction: "none" }}>
        {visible.length === 0 ? (
          <div className="col-span-full h-[110px] flex items-center justify-center label-mono text-[10px] opacity-50">
            No series selected
          </div>
        ) : (
          visible.map((s) => (
            <MiniChart key={s.key} data={s.data} color={s.color} label={s.label} unit={s.unit} />
          ))
        )}
      </div>

      {paused ? (
        <span className="label-mono text-[9px]" style={{ color: accent }}>
          Feed paused — display frozen
        </span>
      ) : null}
    </div>
  );
}
