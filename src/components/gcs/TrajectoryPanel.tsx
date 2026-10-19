import { useMemo, useState } from "react";
import { DualProfileChart } from "./DualProfileChart";
import { Trajectory3D, altitudeRgb, type CameraMode, type Marker3D } from "./Trajectory3D";
import { DEFAULT_SITE, distanceBearing, type LaunchSite } from "./site";
import type { Sample, TrackPoint } from "./telemetry";

type Props = {
  label: string;
  accent: string;
  track: TrackPoint[];
  markers: Marker3D[];
  site: LaunchSite;
  onSiteChange: (s: LaunchSite) => void;
  onSiteReset: () => void;
  velocityNow: number;
  altitude: Sample[];
  velocity: Sample[];
  altitudeColor: string;
  velocityColor: string;
};

const MODES: { id: CameraMode; label: string }[] = [
  { id: "AUTO", label: "Auto" },
  { id: "FOLLOW", label: "Follow" },
  { id: "TOP", label: "Top" },
  { id: "ORBIT", label: "Orbit" },
];

export function TrajectoryPanel({
  label,
  accent,
  track,
  markers,
  site,
  onSiteChange,
  onSiteReset,
  velocityNow,
  altitude,
  velocity,
  altitudeColor,
  velocityColor,
}: Props) {
  const [mode, setMode] = useState<CameraMode>("AUTO");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ lat: "", lon: "" });

  const last = track.at(-1) ?? { t: 0, lat: site.lat, lon: site.lon, alt: 0 };
  const { dist, bearing } = distanceBearing(site, last);
  const maxAlt = useMemo(() => track.reduce((m, p) => Math.max(m, p.alt), 0), [track]);
  const heading = useMemo(() => {
    if (track.length < 2) return 0;
    return distanceBearing(track.at(-2)!, track.at(-1)!).bearing;
  }, [track]);

  const openEditor = () => {
    setDraft({ lat: site.lat.toFixed(6), lon: site.lon.toFixed(6) });
    setEditing(true);
  };
  const apply = () => {
    const lat = Number(draft.lat);
    const lon = Number(draft.lon);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      onSiteChange({ lat, lon });
      setEditing(false);
    }
  };
  const isDefault = site.lat === DEFAULT_SITE.lat && site.lon === DEFAULT_SITE.lon;

  const legend = [0, 0.25, 0.5, 0.75, 1].map((f) => `rgb(${altitudeRgb(f).join(",")}) ${f * 100}%`);

  return (
    <div className="panel p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="label-mono">{label}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="label-mono text-[10px]">Site</span>
          <span className="readout text-[11px]">
            {site.lat.toFixed(6)}°N, {site.lon.toFixed(6)}°E
          </span>
          {!isDefault ? (
            <span
              className="label-mono text-[9px] px-1.5 py-0.5 rounded border"
              style={{ color: "var(--warn)", borderColor: "var(--warn)" }}
            >
              Adjusted
            </span>
          ) : null}
          <button
            onClick={editing ? () => setEditing(false) : openEditor}
            className="panel px-2 py-1 label-mono text-[10px] hover:bg-[oklch(0.21_0_0)]"
          >
            {editing ? "Cancel" : "Adjust"}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="panel p-2 flex items-end gap-2 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="label-mono text-[9px]">Latitude °N</span>
            <input
              value={draft.lat}
              onChange={(e) => setDraft((d) => ({ ...d, lat: e.target.value }))}
              inputMode="decimal"
              className="panel px-2 py-1 readout text-sm w-36 bg-[oklch(0.16_0_0)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-mono text-[9px]">Longitude °E</span>
            <input
              value={draft.lon}
              onChange={(e) => setDraft((d) => ({ ...d, lon: e.target.value }))}
              inputMode="decimal"
              className="panel px-2 py-1 readout text-sm w-36 bg-[oklch(0.16_0_0)]"
            />
          </label>
          <button
            onClick={apply}
            className="panel px-3 py-1.5 label-mono text-[10px]"
            style={{ borderColor: accent, color: accent }}
          >
            Apply
          </button>
          <button
            onClick={() => {
              onSiteReset();
              setEditing(false);
            }}
            className="panel px-3 py-1.5 label-mono text-[10px] hover:bg-[oklch(0.21_0_0)]"
          >
            Reset to competition default
          </button>
          <span className="label-mono text-[9px] opacity-70">
            Saved in this browser · restarts the simulation
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-3">
        <div className="relative h-[440px] rounded-md overflow-hidden border border-border bg-[oklch(0.14_0_0)]">
          <Trajectory3D
            track={track}
            markers={markers}
            site={site}
            mode={mode}
            onModeChange={setMode}
          />

          {/* Camera controls */}
          <div className="absolute top-2 left-2 flex gap-1 z-10">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className="px-2 py-1 rounded label-mono text-[9.5px] border backdrop-blur bg-[oklch(0.12_0_0/0.7)]"
                style={{
                  borderColor: mode === m.id ? accent : "oklch(0.35 0 0)",
                  color: mode === m.id ? accent : undefined,
                }}
              >
                {m.label}
              </button>
            ))}
            {mode === "FREE" ? (
              <span className="px-2 py-1 label-mono text-[9.5px] opacity-70">Manual</span>
            ) : null}
          </div>

          <div className="absolute top-2 right-2 flex gap-1 z-10">
            <button
              onClick={() => downloadKml(track, markers, site)}
              disabled={track.length < 2}
              className="px-2 py-1 rounded label-mono text-[9.5px] border border-[oklch(0.35_0_0)] backdrop-blur bg-[oklch(0.12_0_0/0.7)] disabled:opacity-40"
            >
              Export KML
            </button>
            <span
              className="px-2 py-1 label-mono text-[9.5px] flex items-center gap-1.5"
              style={{ color: accent }}
            >
              <span className="h-1.5 w-1.5 rounded-full dot-pulse" style={{ background: accent }} />
              Live
            </span>
          </div>

          {/* Readouts */}
          <div className="absolute bottom-7 left-2 z-10 grid grid-cols-4 gap-px rounded overflow-hidden border border-[oklch(0.3_0_0)] bg-[oklch(0.3_0_0)] pointer-events-none">
            {[
              ["ALT AGL", `${last.alt.toFixed(0)} m`],
              ["MAX ALT", `${maxAlt.toFixed(0)} m`],
              ["FROM SITE", `${dist.toFixed(0)} m @ ${bearing.toFixed(0)}°`],
              ["V · HDG", `${velocityNow.toFixed(1)} m/s · ${heading.toFixed(0)}°`],
            ].map(([k, v]) => (
              <div key={k} className="px-2 py-1 bg-[oklch(0.12_0_0/0.82)]">
                <div className="label-mono text-[8.5px] opacity-70">{k}</div>
                <div className="readout text-[11px]">{v}</div>
              </div>
            ))}
          </div>

          {/* Altitude colour legend */}
          <div className="absolute bottom-7 right-2 z-10 flex flex-col items-end gap-1 pointer-events-none">
            <span className="label-mono text-[8.5px] opacity-70">Altitude</span>
            <div
              className="h-1.5 w-28 rounded"
              style={{ background: `linear-gradient(90deg, ${legend.join(",")})` }}
            />
            <div className="w-28 flex justify-between readout text-[9px] opacity-80">
              <span>0</span>
              <span>{Math.max(100, maxAlt).toFixed(0)} m</span>
            </div>
          </div>
        </div>

        <div className="h-[440px]">
          <DualProfileChart
            altitude={altitude}
            velocity={velocity}
            altitudeColor={altitudeColor}
            velocityColor={velocityColor}
          />
        </div>
      </div>
    </div>
  );
}

// ---- KML export (opens in Google Earth with the extruded "curtain") -------

function esc(s: string) {
  return s.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!,
  );
}

function downloadKml(track: TrackPoint[], markers: Marker3D[], site: LaunchSite) {
  const coords = track
    .map((p) => `${p.lon.toFixed(7)},${p.lat.toFixed(7)},${p.alt.toFixed(1)}`)
    .join("\n");
  const pm = (name: string, p: { lat: number; lon: number; alt: number }) => `
    <Placemark><name>${esc(name)}</name>
      <Point><altitudeMode>relativeToGround</altitudeMode>
        <coordinates>${p.lon.toFixed(7)},${p.lat.toFixed(7)},${p.alt.toFixed(1)}</coordinates></Point>
    </Placemark>`;
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Rocket flight ${new Date().toISOString()}</name>
  <Style id="track">
    <LineStyle><color>ff3dcffd</color><width>3</width></LineStyle>
    <PolyStyle><color>553dcffd</color></PolyStyle>
  </Style>
  <Placemark><name>Flight path</name><styleUrl>#track</styleUrl>
    <LineString><extrude>1</extrude><tessellate>1</tessellate>
      <altitudeMode>relativeToGround</altitudeMode>
      <coordinates>
${coords}
      </coordinates>
    </LineString>
  </Placemark>
  ${pm("Launch site", { ...site, alt: 0 })}
  ${markers.map((m) => pm(m.label, m.point)).join("")}
</Document>
</kml>`;
  const url = URL.createObjectURL(
    new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `rocket-flight-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.kml`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
