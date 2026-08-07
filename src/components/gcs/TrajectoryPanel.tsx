import { MiniChart } from "./MiniChart";
import type { LatLon, Sample } from "./telemetry";

export type TrajectoryMarker = {
  label: string;
  pos: LatLon;
  color: string;
};

type Props = {
  path: LatLon[];
  accent: string;
  label: string;
  markers?: TrajectoryMarker[];
  /** predicted landing zone: center + radius in metres */
  predicted?: { pos: LatLon; radiusM: number };
  /** heading vector arrow drawn on the live position, in degrees + magnitude (m/s) */
  vector?: { headingDeg: number; speed: number };
  profile: Sample[];
  profileColor: string;
};

export function TrajectoryPanel({
  path,
  accent,
  label,
  markers = [],
  predicted,
  vector,
  profile,
  profileColor,
}: Props) {
  if (path.length === 0) return null;

  const pts: LatLon[] = [...path, ...markers.map((m) => m.pos)];
  if (predicted) pts.push(predicted.pos);
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  const padLat = Math.max(0.0006, (maxLat - minLat) * 0.25);
  const padLon = Math.max(0.0006, (maxLon - minLon) * 0.25);
  minLat -= padLat;
  maxLat += padLat;
  minLon -= padLon;
  maxLon += padLon;

  const W = 100;
  const H = 100;
  const proj = (lat: number, lon: number): [number, number] => [
    ((lon - minLon) / (maxLon - minLon)) * W,
    H - ((lat - minLat) / (maxLat - minLat)) * H,
  ];

  const d = path
    .map((p, i) => {
      const [x, y] = proj(p[0], p[1]);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const [lx, ly] = proj(path.at(-1)![0], path.at(-1)![1]);
  const uid = label.replace(/\s+/g, "-");

  // predicted zone radius in viewbox units (approx: 1 deg lat ~ 111_000 m)
  const zoneR = predicted
    ? Math.min(14, Math.max(3, ((predicted.radiusM / 111000) / (maxLat - minLat)) * H))
    : 0;

  const arrow = vector
    ? (() => {
        const rad = ((vector.headingDeg - 90) * Math.PI) / 180;
        const len = Math.min(18, 4 + Math.abs(vector.speed) * 0.12);
        return { x2: lx + Math.cos(rad) * len, y2: ly + Math.sin(rad) * len };
      })()
    : null;

  return (
    <div className="panel p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span className="readout text-[10px] text-muted-foreground">
          {path.at(-1)![0].toFixed(5)}°, {path.at(-1)![1].toFixed(5)}°
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
        <div className="relative h-[300px] rounded-md overflow-hidden border border-border bg-[oklch(0.16_0_0)]">
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <defs>
              <pattern id={`grid-${uid}`} width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M10 0 L0 0 0 10" fill="none" stroke="oklch(0.22 0 0)" strokeWidth="0.2" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill={`url(#grid-${uid})`} />

            {predicted ? (
              <g>
                <circle
                  cx={proj(predicted.pos[0], predicted.pos[1])[0]}
                  cy={proj(predicted.pos[0], predicted.pos[1])[1]}
                  r={zoneR}
                  fill="oklch(0.78 0.16 85 / 0.14)"
                  stroke="oklch(0.78 0.16 85 / 0.6)"
                  strokeWidth="0.3"
                  strokeDasharray="1.5 1.2"
                />
              </g>
            ) : null}

            <path d={d} fill="none" stroke={accent} strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" />

            {markers.map((m) => {
              const [mx, my] = proj(m.pos[0], m.pos[1]);
              return <circle key={m.label} cx={mx} cy={my} r="1.3" fill={m.color} />;
            })}

            {arrow ? (
              <line
                x1={lx}
                y1={ly}
                x2={arrow.x2}
                y2={arrow.y2}
                stroke="oklch(0.9 0 0)"
                strokeWidth="0.5"
                markerEnd={`url(#head-${uid})`}
              />
            ) : null}
            <defs>
              <marker id={`head-${uid}`} markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
                <path d="M0,0 L4,2 L0,4 z" fill="oklch(0.9 0 0)" />
              </marker>
            </defs>

            <circle cx={lx} cy={ly} r="1.6" fill={accent}>
              <animate attributeName="r" values="1.6;2.6;1.6" dur="1.6s" repeatCount="indefinite" />
            </circle>
          </svg>

          <div className="absolute top-1.5 right-2 label-mono text-[9px]" style={{ color: accent }}>
            Live
          </div>
          {vector ? (
            <div className="absolute bottom-1.5 right-2 readout text-[10px] text-muted-foreground">
              V {vector.speed.toFixed(1)} m/s · HDG {vector.headingDeg.toFixed(0)}°
            </div>
          ) : null}
          <div className="absolute bottom-1.5 left-2 flex flex-wrap gap-x-3 gap-y-0.5 pr-24">
            {markers.map((m) => (
              <span key={m.label} className="flex items-center gap-1 label-mono text-[8.5px] opacity-80">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
                {m.label}
              </span>
            ))}
            {predicted ? (
              <span className="flex items-center gap-1 label-mono text-[8.5px] opacity-80">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "oklch(0.78 0.16 85 / 0.6)" }}
                />
                Predicted Zone
              </span>
            ) : null}
          </div>
        </div>

        <div className="h-[300px]">
          <MiniChart data={profile} color={profileColor} label="Altitude Profile" unit="m" />
        </div>
      </div>
    </div>
  );
}
