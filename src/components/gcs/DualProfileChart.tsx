import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { Sample } from "./telemetry";

type Props = {
  altitude: Sample[];
  velocity: Sample[];
  altitudeColor: string;
  velocityColor: string;
};

const PAST_COLOR = "oklch(0.62 0.2 25)"; // red
const PRESENT_COLOR = "oklch(0.85 0.17 95)"; // yellow
const FUTURE_COLOR = "oklch(0.75 0.16 150)"; // green

const axisTick = { fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "oklch(0.6 0 0)" };

const FUTURE_STEPS = 40;

type Row = {
  t: number;
  altitude_past?: number;
  altitude_future?: number;
  velocity_past?: number;
  velocity_future?: number;
};

function buildRows(samples: Sample[], key: "altitude" | "velocity", rows: Map<number, Row>) {
  if (samples.length === 0) return;

  samples.forEach((s, i) => {
    const row = rows.get(s.t) ?? { t: s.t };
    row[`${key}_past`] = s.v;
    rows.set(s.t, row);
  });

  const last = samples.at(-1)!;
  const prev = samples.length > 1 ? samples.at(-2)! : last;
  const dt = last.t - prev.t || 0.2;
  const slope = dt !== 0 ? (last.v - prev.v) / dt : 0;

  // connect the future line to the same last point so it doesn't float as a gap
  const lastRow = rows.get(last.t)!;
  lastRow[`${key}_future`] = last.v;

  for (let k = 1; k <= FUTURE_STEPS; k++) {
    const t = last.t + k * dt;
    const v = last.v + slope * dt * k;
    const row = rows.get(t) ?? { t };
    row[`${key}_future`] = v;
    rows.set(t, row);
  }
}

export function DualProfileChart({ altitude, velocity, altitudeColor, velocityColor }: Props) {
  const rows = new Map<number, Row>();
  buildRows(altitude, "altitude", rows);
  buildRows(velocity, "velocity", rows);
  const data = Array.from(rows.values()).sort((a, b) => a.t - b.t);

  const lastAlt = altitude.at(-1);
  const lastVel = velocity.at(-1);

  return (
    <div className="panel px-3 py-3 flex flex-col gap-1.5 h-full">
      <div className="flex items-baseline justify-between">
        <span className="label-mono">Altitude & Velocity Profile</span>
        <div className="flex items-center gap-3">
          <span className="readout text-sm" style={{ color: altitudeColor }}>
            {typeof lastAlt?.v === "number" ? lastAlt.v.toFixed(1) : "—"}
            <span className="text-muted-foreground ml-1 text-[10px]">m</span>
          </span>
          <span className="readout text-sm" style={{ color: velocityColor }}>
            {typeof lastVel?.v === "number" ? lastVel.v.toFixed(1) : "—"}
            <span className="text-muted-foreground ml-1 text-[10px]">m/s</span>
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-[54px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="oklch(0.24 0 0)" strokeWidth={0.5} vertical={false} />
            <XAxis
              dataKey="t"
              tick={axisTick}
              tickFormatter={(v: number) => v.toFixed(0)}
              stroke="oklch(0.3 0 0)"
              tickLine={false}
              label={{
                value: "TIME (s)",
                position: "insideBottom",
                offset: -4,
                fontSize: 9,
                fill: "oklch(0.55 0 0)",
              }}
              minTickGap={24}
            />
            <YAxis
              yAxisId="velocity"
              tick={{ ...axisTick, fill: velocityColor }}
              tickFormatter={(v: number) => v.toFixed(0)}
              stroke="oklch(0.3 0 0)"
              tickLine={false}
              width={34}
              domain={["auto", "auto"]}
              label={{
                value: "VEL (m/s)",
                angle: -90,
                position: "insideLeft",
                fontSize: 9,
                fill: velocityColor,
              }}
            />
            <YAxis
              yAxisId="altitude"
              orientation="right"
              tick={{ ...axisTick, fill: altitudeColor }}
              tickFormatter={(v: number) => v.toFixed(0)}
              stroke="oklch(0.3 0 0)"
              tickLine={false}
              width={34}
              domain={["auto", "auto"]}
              label={{
                value: "ALT (m)",
                angle: 90,
                position: "insideRight",
                fontSize: 9,
                fill: altitudeColor,
              }}
            />

            <Line yAxisId="velocity" type="monotone" dataKey="velocity_past" stroke={PAST_COLOR} strokeWidth={1.5} strokeDasharray="3 2" dot={false} isAnimationActive={false} connectNulls />
            <Line yAxisId="velocity" type="monotone" dataKey="velocity_future" stroke={FUTURE_COLOR} strokeWidth={1.5} strokeDasharray="3 2" dot={false} isAnimationActive={false} connectNulls />

            <Line yAxisId="altitude" type="monotone" dataKey="altitude_past" stroke={PAST_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            <Line yAxisId="altitude" type="monotone" dataKey="altitude_future" stroke={FUTURE_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />

            {lastAlt ? (
              <ReferenceDot yAxisId="altitude" x={lastAlt.t} y={lastAlt.v} r={3} fill={PRESENT_COLOR} stroke="none" />
            ) : null}
            {lastVel ? (
              <ReferenceDot yAxisId="velocity" x={lastVel.t} y={lastVel.v} r={3} fill={PRESENT_COLOR} stroke="none" />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 flex-wrap label-mono text-[8.5px] opacity-80">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: PAST_COLOR }} />
          Past
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRESENT_COLOR }} />
          Now
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: FUTURE_COLOR }} />
          Predicted
        </span>
        <span className="opacity-60">|</span>
        <span>— Altitude</span>
        <span>┄ Velocity</span>
      </div>
    </div>
  );
}
