import { useMemo, useState, type ReactNode } from "react";
import { Download, MapPin } from "lucide-react";
import { Button, Panel, Segmented, StatusPill } from "./ui";
import { DualProfileChart } from "./DualProfileChart";
import {
  REF_ALT_M,
  REF_COLOR,
  Trajectory3D,
  altitudeRgb,
  type CameraMode,
  type Marker3D,
} from "./Trajectory3D";
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
  /** Optional strip rendered above the 3D view (e.g. the flight-state timeline). */
  timeline?: ReactNode;
};

const MODES: { id: CameraMode; label: string }[] = [
  { id: "AUTO", label: "Auto" },
  { id: "FOLLOW", label: "Follow" },
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
  timeline,
}: Props) {
  const [mode, setMode] = useState<CameraMode>("AUTO");
  const [adjusted, setAdjusted] = useState(false);
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

  const overlay =
    "rounded-md border border-white/10 bg-[oklch(0.14_0.006_255/0.82)] backdrop-blur-sm";

  return (
    <Panel
      title={label}
      meta={
        <span className="readout">
          Site {site.lat.toFixed(6)}° N, {site.lon.toFixed(6)}° E
        </span>
      }
      actions={
        <>
          {!isDefault ? <StatusPill tone="warn">Adjusted site</StatusPill> : null}
          <Button onClick={editing ? () => setEditing(false) : openEditor} active={editing}>
            <MapPin className="h-3 w-3" />
            {editing ? "Cancel" : "Launch site"}
          </Button>
          <Button onClick={() => downloadKml(track, markers, site)} disabled={track.length < 2}>
            <Download className="h-3 w-3" /> Export KML
          </Button>
        </>
      }
      bodyClassName="flex flex-col gap-3"
    >
      {editing ? (
        <div className="well p-3 flex items-end gap-3 flex-wrap">
          <SiteInput
            label="Latitude (° N)"
            value={draft.lat}
            onChange={(v) => setDraft((d) => ({ ...d, lat: v }))}
          />
          <SiteInput
            label="Longitude (° E)"
            value={draft.lon}
            onChange={(v) => setDraft((d) => ({ ...d, lon: v }))}
          />
          <Button size="md" variant="primary" onClick={apply}>
            Apply
          </Button>
          <Button
            size="md"
            variant="ghost"
            onClick={() => {
              onSiteReset();
              setEditing(false);
            }}
          >
            Reset to competition default
          </Button>
          <span className="text-[11px] text-subtle ml-auto">
            Saved in this browser · restarts the simulation
          </span>
        </div>
      ) : null}

      {timeline}

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-3">
        <div className="relative h-[460px] rounded-md overflow-hidden border border-border bg-well">
          <Trajectory3D
            track={track}
            markers={markers}
            site={site}
            mode={mode}
            adjusted={adjusted}
            onAdjust={() => setAdjusted(true)}
          />

          {/* Camera controls */}
          <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
            <Segmented
              options={MODES}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setAdjusted(false);
              }}
              className="bg-[oklch(0.14_0.006_255/0.82)] backdrop-blur-sm border-white/10"
            />
            {adjusted ? (
              <span
                className={`${overlay} px-2 h-7 inline-flex items-center text-[11px] text-muted-foreground`}
              >
                Manual view · pick a mode to reframe
              </span>
            ) : null}
          </div>

          <div className="absolute top-3 right-3 z-10">
            <span
              className={`${overlay} px-2 h-7 inline-flex items-center gap-1.5 text-[11px] font-semibold`}
              style={{ color: accent }}
            >
              <span className="h-1.5 w-1.5 rounded-full dot-pulse" style={{ background: accent }} />
              LIVE
            </span>
          </div>

          {/* Readouts */}
          <div
            className={`absolute bottom-8 left-3 z-10 grid grid-cols-5 divide-x divide-white/10 pointer-events-none ${overlay}`}
          >
            {[
              ["Alt AGL", `${last.alt.toFixed(0)} m`],
              ["Max alt", `${maxAlt.toFixed(0)} m`],
              ["From site", `${dist.toFixed(0)} m · ${bearing.toFixed(0)}°`],
              ["Vel · Hdg", `${velocityNow.toFixed(1)} m/s · ${heading.toFixed(0)}°`],
            ].map(([k, v]) => (
              <div key={k} className="px-2.5 py-1.5">
                <div className="eyebrow text-[10px]">{k}</div>
                <div className="readout text-xs mt-0.5">{v}</div>
              </div>
            ))}
            <div className="px-2.5 py-1.5">
              <div className="eyebrow text-[10px]" style={{ color: REF_COLOR }}>
                vs {REF_ALT_M} m
              </div>
              <div className="readout text-xs mt-0.5" style={{ color: REF_COLOR }}>
                {last.alt - REF_ALT_M >= 0 ? "+" : "−"}
                {Math.abs(last.alt - REF_ALT_M).toFixed(0)} m
              </div>
            </div>
          </div>

          {/* Altitude colour legend */}
          <div
            className={`absolute bottom-8 right-3 z-10 flex flex-col gap-1 px-2.5 py-1.5 pointer-events-none ${overlay}`}
          >
            <span className="eyebrow text-[10px]">Altitude</span>
            <div
              className="h-1.5 w-28 rounded-full"
              style={{ background: `linear-gradient(90deg, ${legend.join(",")})` }}
            />
            <div className="w-28 flex justify-between readout text-[10px] text-muted-foreground">
              <span>0</span>
              <span>{Math.max(100, maxAlt).toFixed(0)} m</span>
            </div>
          </div>
        </div>

        <div className="h-[460px]">
          <DualProfileChart
            altitude={altitude}
            velocity={velocity}
            altitudeColor={altitudeColor}
            velocityColor={velocityColor}
          />
        </div>
      </div>
    </Panel>
  );
}

function SiteInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="h-9 w-40 rounded-md border border-border bg-panel px-2.5 readout text-[13px] focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-ring/40"
      />
    </label>
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
