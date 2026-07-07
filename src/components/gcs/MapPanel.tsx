type Props = {
  path: [number, number][];
  accent: string;
  label: string;
  markers?: { label: string; pos: [number, number]; color?: string }[];
};

export function MapPanel({ path, accent, label, markers = [] }: Props) {
  if (path.length === 0) return null;

  const lats = path.map((p) => p[0]);
  const lons = path.map((p) => p[1]);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  const padLat = Math.max(0.0005, (maxLat - minLat) * 0.2);
  const padLon = Math.max(0.0005, (maxLon - minLon) * 0.2);
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

  const [cx, cy] = proj(path[0][0], path[0][1]);
  const [lx, ly] = proj(path.at(-1)![0], path.at(-1)![1]);

  return (
    <div className="panel p-3 flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span className="readout text-[10px] text-muted-foreground">
          {path.at(-1)![0].toFixed(5)}°, {path.at(-1)![1].toFixed(5)}°
        </span>
      </div>
      <div className="relative flex-1 rounded-md overflow-hidden border border-border bg-[oklch(0.16_0_0)]">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <pattern id={`grid-${label}`} width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M10 0 L0 0 0 10" fill="none" stroke="oklch(0.22 0 0)" strokeWidth="0.2" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill={`url(#grid-${label})`} />
          <path d={d} fill="none" stroke={accent} strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={cx} cy={cy} r="1.2" fill="oklch(0.78 0.15 155)" />
          <circle cx={lx} cy={ly} r="1.6" fill={accent}>
            <animate attributeName="r" values="1.6;2.6;1.6" dur="1.6s" repeatCount="indefinite" />
          </circle>
          {markers.map((m) => {
            const [mx, my] = proj(m.pos[0], m.pos[1]);
            return (
              <g key={m.label}>
                <circle cx={mx} cy={my} r="1.2" fill={m.color ?? "oklch(0.78 0.16 85)"} />
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-1.5 left-2 label-mono text-[9px] opacity-70">Launch</div>
        <div className="absolute top-1.5 right-2 label-mono text-[9px]" style={{ color: accent }}>
          Live
        </div>
      </div>
    </div>
  );
}
