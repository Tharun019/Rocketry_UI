import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import type { Sample } from "./telemetry";

type Props = {
  data: Sample[];
  color: string;
  label: string;
  unit?: string;
  value?: string;
};

export function MiniChart({ data, color, label, unit, value }: Props) {
  const last = data.at(-1)?.v;
  const display = value ?? (typeof last === "number" ? last.toFixed(1) : "—");
  const id = `grad-${label.replace(/\s+/g, "-")}`;

  return (
    <div className="panel px-3 py-3 flex flex-col gap-1.5 h-full">
      <div className="flex items-baseline justify-between">
        <span className="label-mono">{label}</span>
        <span className="readout text-sm">
          {display}
          {unit ? <span className="text-muted-foreground ml-1 text-[10px]">{unit}</span> : null}
        </span>
      </div>
      <div className="flex-1 min-h-[54px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${id})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
