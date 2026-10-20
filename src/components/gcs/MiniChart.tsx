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
    <div className="well px-3 pt-2.5 pb-1.5 flex flex-col gap-1 h-full min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow truncate">{label}</span>
        <span className="readout text-[13px] shrink-0">
          {display}
          {unit ? <span className="text-subtle ml-1 text-[10px] font-sans">{unit}</span> : null}
        </span>
      </div>
      <div className="flex-1 min-h-[54px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
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
