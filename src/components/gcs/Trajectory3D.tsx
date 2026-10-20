import { useEffect, useMemo, useRef, useState } from "react";
import type * as CesiumNS from "cesium";
import type { TrackPoint } from "./telemetry";
import { distanceBearing, offsetToLatLon, type LaunchSite } from "./site";

type C = typeof CesiumNS;
declare global {
  interface Window {
    Cesium?: C;
    CESIUM_BASE_URL?: string;
  }
}

/** Cesium is served from /public/cesium (copied from node_modules by `npm run cesium:copy`). */
let cesiumPromise: Promise<C> | null = null;
function loadCesium(): Promise<C> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (cesiumPromise) return cesiumPromise;
  window.CESIUM_BASE_URL = "/cesium/";
  cesiumPromise = new Promise<C>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/cesium/Widgets/widgets.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "/cesium/Cesium.js";
    s.async = true;
    s.onload = () => (window.Cesium ? resolve(window.Cesium) : reject(new Error("Cesium missing")));
    s.onerror = () => {
      cesiumPromise = null;
      reject(new Error("Could not load /cesium/Cesium.js"));
    };
    document.head.appendChild(s);
  });
  return cesiumPromise;
}

// Low → high altitude: deep blue → teal → green → yellow (perceptually ordered).
const STOPS: [number, [number, number, number]][] = [
  [0, [44, 62, 145]],
  [0.35, [31, 161, 135]],
  [0.7, [122, 209, 81]],
  [1, [253, 231, 37]],
];
export function altitudeRgb(f: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, f));
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    const [p0, c0] = STOPS[i - 1];
    if (x <= p1) {
      const k = (x - p0) / (p1 - p0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [
        number,
        number,
        number,
      ];
    }
  }
  return STOPS.at(-1)![1];
}

export type CameraMode = "AUTO" | "FOLLOW";

/** Altitude reference line drawn in red (m AGL). */
export const REF_ALT_M = 1000;
export const REF_COLOR = "#ff3b3b";

/** Wheel zoom limits: camera distance from the trajectory focus point, metres. */
const MIN_RANGE = 40;
const MAX_RANGE = 400_000;

/** A labelled point on the flight (e.g. a flight state), drawn as a diagram callout. */
export type Marker3D = {
  key: string;
  label: string;
  /** smaller second line under the label */
  sub?: string;
  point: TrackPoint;
  /** which column the callout label sits in */
  side: "left" | "right";
};
type LabelSide = "above" | "below" | "right";

/** A callout after projecting to the screen: point (px, py) and label anchor (lx, ly). */
type PlacedCallout = {
  key: string;
  label: string;
  sub?: string;
  side: "left" | "right";
  px: number;
  py: number;
  lx: number;
  ly: number;
};

const LEADER_PX = 120; // horizontal reach from the trajectory to the label column
const LABEL_GAP_PX = 32; // minimum vertical spacing between labels in a column
const LABEL_MIN_W = 170; // room kept for a label between column and view edge

/** Diagram-style layout: two label columns (left/right), spread so labels never overlap. */
function layoutCallouts(
  pts: { m: Marker3D; x: number; y: number }[],
  w: number,
  h: number,
): PlacedCallout[] {
  const top = 48; // clear of the camera buttons
  const bottom = h - 84; // clear of the readout strip
  const out: PlacedCallout[] = [];
  for (const side of ["left", "right"] as const) {
    const group = pts.filter((p) => p.m.side === side).sort((a, b) => a.y - b.y);
    if (!group.length) continue;
    const lx =
      side === "left"
        ? Math.max(LABEL_MIN_W, Math.min(...group.map((p) => p.x)) - LEADER_PX)
        : Math.min(w - LABEL_MIN_W, Math.max(...group.map((p) => p.x)) + LEADER_PX);
    const ys = group.map((p) => Math.min(bottom, Math.max(top, p.y)));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + LABEL_GAP_PX);
    for (let i = ys.length - 1; i >= 0; i--) {
      const limit = i === ys.length - 1 ? bottom : ys[i + 1] - LABEL_GAP_PX;
      ys[i] = Math.min(ys[i], limit);
    }
    group.forEach((p, i) =>
      out.push({
        key: p.m.key,
        label: p.m.label,
        sub: p.m.sub,
        side,
        px: p.x,
        py: p.y,
        lx,
        ly: ys[i],
      }),
    );
  }
  return out;
}

type Props = {
  track: TrackPoint[];
  markers: Marker3D[];
  site: LaunchSite;
  /** reference ring radius around the site, metres */
  ringM?: number;
  mode: CameraMode;
  /** true once the operator has rotated/zoomed; the camera then keeps their view */
  adjusted: boolean;
  onAdjust: () => void;
};

type Line = { poly: CesiumNS.Polyline; alt: number; alpha: number };

/** Curtain walls are built as plain primitives in chunks of this many segments. */
const CHUNK = 25;

/** Spacing of the vertical curtain lines, seconds of flight time. */
const CURTAIN_EVERY_S = 1;

export function Trajectory3D({
  track,
  markers,
  site,
  ringM = 100,
  mode,
  adjusted,
  onAdjust,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumNS.Viewer | null>(null);
  const chunks = useRef<CesiumNS.Primitive[]>([]);
  const tail = useRef<CesiumNS.Primitive | null>(null);
  const committed = useRef(1); // segments [1, committed) are baked into `chunks`
  const lines = useRef<CesiumNS.PolylineCollection | null>(null);
  const lineMeta = useRef<Line[]>([]);
  const drawn = useRef(0);
  const firstT = useRef<number | null>(null);
  const colorMax = useRef(100);
  const head = useRef<CesiumNS.Entity | null>(null);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const [callouts, setCallouts] = useState<PlacedCallout[]>([]);
  const siteEnts = useRef<CesiumNS.Entity[]>([]);
  const refEnts = useRef<CesiumNS.Entity[]>([]);
  /** Point the camera orbits and zooms around (trajectory centre, or the rocket in FOLLOW). */
  const target = useRef<CesiumNS.Cartesian3 | null>(null);
  const onAdjustRef = useRef(onAdjust);
  onAdjustRef.current = onAdjust;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // ---- Create the viewer once -------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let handler: CesiumNS.ScreenSpaceEventHandler | null = null;
    let removeWheel: (() => void) | null = null;
    loadCesium()
      .then((Cesium) => {
        if (cancelled || !host.current) return;
        const offline = Cesium.ImageryLayer.fromProviderAsync(
          Cesium.TileMapServiceImageryProvider.fromUrl(
            Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
          ),
        );
        const viewer = new Cesium.Viewer(host.current, {
          baseLayer: offline, // low-res, bundled: works with no internet
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
          fullscreenButton: false,
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
        });
        // High-res satellite imagery when online (Esri World Imagery, no key needed).
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            maximumLevel: 19,
            credit: new Cesium.Credit(
              "Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
            ),
          }),
        );
        viewer.scene.globe.depthTestAgainstTerrain = false;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
        viewer.scene.fog.enabled = true;

        // The camera always stays locked onto the trajectory (lookAt), so dragging orbits
        // around it. Cesium's own zoom heads toward the cursor and translate pans away,
        // so both are off; the wheel is handled below instead.
        const ctrl = viewer.scene.screenSpaceCameraController;
        ctrl.enableZoom = false;
        ctrl.enableTranslate = false;
        ctrl.enableLook = false;

        // Any manual drag keeps the operator's view instead of auto-framing.
        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        const adjust = () => onAdjustRef.current();
        handler.setInputAction(adjust, Cesium.ScreenSpaceEventType.LEFT_DOWN);
        handler.setInputAction(adjust, Cesium.ScreenSpaceEventType.MIDDLE_DOWN);

        // Wheel zoom goes straight in/out along the line to the focus point, so the
        // trajectory stays centred wherever the cursor is.
        const canvas = viewer.scene.canvas;
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const cam = viewer.camera;
          const focus = target.current;
          if (!focus || Cesium.Matrix4.equals(cam.transform, Cesium.Matrix4.IDENTITY)) return;
          const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
          const offset = Cesium.Cartesian3.clone(cam.position);
          const range = Cesium.Cartesian3.magnitude(offset);
          if (!range) return;
          const next = Math.min(MAX_RANGE, Math.max(MIN_RANGE, range * Math.exp(dy * 0.0015)));
          Cesium.Cartesian3.multiplyByScalar(offset, next / range, offset);
          cam.lookAt(focus, offset);
          onAdjustRef.current();
          viewer.scene.requestRender();
        };
        canvas.addEventListener("wheel", onWheel, { passive: false });
        removeWheel = () => canvas.removeEventListener("wheel", onWheel);

        // Re-project the state callouts after every frame so they stick to the
        // trajectory while the camera moves.
        let lastLayout = "";
        viewer.scene.postRender.addEventListener(() => {
          const el = host.current;
          if (!el) return;
          const pts = markersRef.current.flatMap((m) => {
            const c = Cesium.SceneTransforms.worldToWindowCoordinates(
              viewer.scene,
              Cesium.Cartesian3.fromDegrees(m.point.lon, m.point.lat, m.point.alt),
            );
            return c ? [{ m, x: c.x, y: c.y }] : [];
          });
          const placed = layoutCallouts(pts, el.clientWidth, el.clientHeight);
          const key = placed
            .map((p) => `${p.key}${p.sub}${p.px | 0},${p.py | 0},${p.lx | 0},${p.ly | 0}`)
            .join("|");
          if (key !== lastLayout) {
            lastLayout = key;
            setCallouts(placed);
          }
        });

        lines.current = viewer.scene.primitives.add(new Cesium.PolylineCollection());
        viewerRef.current = viewer;
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));

    return () => {
      cancelled = true;
      removeWheel?.();
      handler?.destroy();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      chunks.current = [];
      tail.current = null;
      committed.current = 1;
      lines.current = null;
      lineMeta.current = [];
      drawn.current = 0;
      firstT.current = null;
      head.current = null;
      siteEnts.current = [];
      refEnts.current = [];
      target.current = null;
    };
  }, []);

  // ---- Launch site pin + reference ring ---------------------------------
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (status !== "ready" || !viewer || !Cesium) return;
    siteEnts.current.forEach((e) => viewer.entities.remove(e));
    const pos = Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0);
    siteEnts.current = [
      viewer.entities.add({
        position: pos,
        ellipse: {
          semiMajorAxis: ringM,
          semiMinorAxis: ringM,
          height: 0,
          material: Cesium.Color.fromCssColorString("#ffb35c").withAlpha(0.08),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#ffb35c").withAlpha(0.7),
        },
      }),
      viewer.entities.add({
        position: pos,
        point: {
          pixelSize: 9,
          color: Cesium.Color.fromCssColorString("#ffb35c"),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
        },
        label: labelOpts(Cesium, `LAUNCH SITE · ${ringM} m RING`, "#ffb35c", "below"),
      }),
    ];
    viewer.scene.requestRender();
  }, [status, site.lat, site.lon, ringM]);

  // ---- 1000 m altitude reference ring (red) -----------------------------
  // Sized to enclose the flight's ground footprint; only rebuilt when that grows.
  const refRadius = useMemo(() => {
    const far = track.reduce((m, p) => Math.max(m, distanceBearing(site, p).dist), 0);
    return Math.max(200, Math.ceil((far * 1.3) / 100) * 100);
  }, [track, site]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (status !== "ready" || !viewer || !Cesium) return;
    refEnts.current.forEach((e) => viewer.entities.remove(e));
    const ring: number[] = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * 2 * Math.PI;
      const p = offsetToLatLon(site, Math.sin(a) * refRadius, Math.cos(a) * refRadius);
      ring.push(p.lon, p.lat, REF_ALT_M);
    }
    const tag = offsetToLatLon(site, refRadius, 0);
    const red = Cesium.Color.fromCssColorString(REF_COLOR);
    refEnts.current = [
      viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(ring),
          width: 2.5,
          arcType: Cesium.ArcType.NONE,
          material: red,
        },
      }),
      // Dashed spoke from the launch axis to the ring so the level reads against the track.
      viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            site.lon,
            site.lat,
            REF_ALT_M,
            tag.lon,
            tag.lat,
            REF_ALT_M,
          ]),
          width: 1.5,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineDashMaterialProperty({ color: red.withAlpha(0.8) }),
        },
      }),
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(tag.lon, tag.lat, REF_ALT_M),
        label: labelOpts(Cesium, `${REF_ALT_M} m AGL`, REF_COLOR, "right"),
      }),
    ];
    viewer.scene.requestRender();
  }, [status, site.lat, site.lon, refRadius]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Curtain: walls (chunked primitives) + edge/vertical lines ----------
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    const coll = lines.current;
    if (status !== "ready" || !viewer || !Cesium || !coll) return;
    const prims = viewer.scene.primitives;

    const col = (alt: number, alpha: number) => {
      const [r, g, b] = altitudeRgb(alt / colorMax.current);
      return Cesium.Color.fromBytes(r, g, b, Math.round(alpha * 255));
    };
    const clearWalls = () => {
      chunks.current.forEach((c) => prims.remove(c));
      chunks.current = [];
      if (tail.current) prims.remove(tail.current);
      tail.current = null;
      committed.current = 1;
    };
    const wallPrimitive = (from: number, to: number) => {
      const instances: CesiumNS.GeometryInstance[] = [];
      for (let i = from; i < to; i++) {
        const a = track[i - 1];
        const b = track[i];
        if (Math.abs(a.lat - b.lat) + Math.abs(a.lon - b.lon) < 1e-8) continue; // no width → skip
        instances.push(
          new Cesium.GeometryInstance({
            geometry: new Cesium.WallGeometry({
              positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                a.lon,
                a.lat,
                a.alt,
                b.lon,
                b.lat,
                b.alt,
              ]),
              minimumHeights: [0, 0],
              vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                col((a.alt + b.alt) / 2, 0.22),
              ),
            },
          }),
        );
      }
      if (!instances.length) return null;
      return prims.add(
        new Cesium.Primitive({
          geometryInstances: instances,
          appearance: new Cesium.PerInstanceColorAppearance({ translucent: true, flat: true }),
          asynchronous: false, // build now: no worker round-trip, shows immediately
        }),
      ) as CesiumNS.Primitive;
    };

    // New flight (sim restart / new log): wipe everything.
    if (
      !track.length ||
      (firstT.current !== null && track[0].t !== firstT.current) ||
      drawn.current > track.length
    ) {
      clearWalls();
      coll.removeAll();
      lineMeta.current = [];
      drawn.current = 0;
      colorMax.current = 100;
    }
    firstT.current = track[0]?.t ?? null;

    const maxAlt = track.reduce((m, p) => Math.max(m, p.alt), 0);
    const rescale = maxAlt > colorMax.current * 1.1;
    if (rescale) {
      colorMax.current = maxAlt;
      clearWalls();
      for (const l of lineMeta.current) l.poly.material.uniforms.color = col(l.alt, l.alpha);
    }

    // Lines for new fixes
    const addLine = (pos: number[], alt: number, alpha: number, width: number) => {
      const poly = coll.add({
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(pos),
        width,
        material: Cesium.Material.fromType("Color", { color: col(alt, alpha) }),
      });
      lineMeta.current.push({ poly, alt, alpha });
    };
    for (let i = Math.max(1, drawn.current); i < track.length; i++) {
      const a = track[i - 1];
      const b = track[i];
      addLine([a.lon, a.lat, a.alt, b.lon, b.lat, b.alt], (a.alt + b.alt) / 2, 1, 2.5);
      // One vertical "curtain" line per second of flight (first fix in each new second).
      if (Math.floor(b.t / CURTAIN_EVERY_S) !== Math.floor(a.t / CURTAIN_EVERY_S))
        addLine([b.lon, b.lat, 0, b.lon, b.lat, b.alt], b.alt, 0.8, 1.2);
    }
    drawn.current = track.length;

    // Walls: bake full chunks, rebuild only the short live tail.
    while (track.length - committed.current > CHUNK) {
      const c = wallPrimitive(committed.current, committed.current + CHUNK);
      if (c) chunks.current.push(c);
      committed.current += CHUNK;
    }
    if (tail.current) prims.remove(tail.current);
    tail.current = wallPrimitive(committed.current, track.length);

    // Live vehicle position
    const last = track.at(-1);
    if (last) {
      const p = Cesium.Cartesian3.fromDegrees(last.lon, last.lat, last.alt);
      if (!head.current) {
        head.current = viewer.entities.add({
          position: p,
          point: {
            pixelSize: 12,
            color: Cesium.Color.fromCssColorString("#ff8a3d"),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      } else {
        head.current.position = new Cesium.ConstantPositionProperty(p);
      }
    }
    viewer.scene.requestRender();
  }, [status, track]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- State callouts: drawn as an HTML/SVG overlay (see postRender above) ----
  useEffect(() => {
    viewerRef.current?.scene.requestRender();
  }, [status, markers]);

  // ---- Camera -------------------------------------------------------------
  // The camera is always locked onto a focus point with lookAt: the centre of the
  // whole flight (AUTO) or the live rocket position (FOLLOW). Until the operator
  // drags or zooms, it auto-frames; afterwards their angle and distance are kept
  // while the focus point keeps tracking the flight.
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (status !== "ready" || !viewer || !Cesium) return;
    const cam = viewer.camera;
    const D = Cesium.Math.toRadians;

    let focus: CesiumNS.Cartesian3;
    let fit: CesiumNS.HeadingPitchRange;
    if (mode === "FOLLOW") {
      const last = track.at(-1) ?? { lat: site.lat, lon: site.lon, alt: 0 };
      focus = Cesium.Cartesian3.fromDegrees(last.lon, last.lat, last.alt);
      fit = new Cesium.HeadingPitchRange(D(-30), D(-15), 500);
    } else {
      const pts = track.length ? track : [{ lat: site.lat, lon: site.lon, alt: 0 }];
      const cart = pts.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt));
      cart.push(Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0));
      // Keep the 1000 m reference line in frame too.
      cart.push(Cesium.Cartesian3.fromDegrees(site.lon, site.lat, REF_ALT_M));
      const sphere = Cesium.BoundingSphere.fromPoints(cart);
      const radius = Math.max(sphere.radius * 1.6, 150);
      const f = cam.frustum as CesiumNS.PerspectiveFrustum;
      const fov = Math.min(f.fov ?? Math.PI / 3, f.fovy ?? Math.PI / 3);
      focus = sphere.center;
      fit = new Cesium.HeadingPitchRange(D(-25), D(-14), radius / Math.sin(fov / 2));
    }

    const locked = !Cesium.Matrix4.equals(cam.transform, Cesium.Matrix4.IDENTITY);
    if (adjusted && locked) {
      // Keep the operator's offset (in the focus point's local frame).
      cam.lookAt(focus, Cesium.Cartesian3.clone(cam.position));
    } else {
      cam.lookAt(focus, fit);
    }
    target.current = focus;
    viewer.scene.requestRender();
  }, [status, track, mode, adjusted, site.lat, site.lon]);

  return (
    <div className="absolute inset-0">
      <div ref={host} className="gcs-cesium absolute inset-0" />
      {status === "ready" ? <CalloutOverlay callouts={callouts} /> : null}
      {status !== "ready" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-well">
          <span className="text-xs text-subtle text-center px-6">
            {status === "loading"
              ? "Loading 3D globe…"
              : "3D view unavailable — run `npm run cesium:copy`, then reload"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Parts-diagram style labels: black bold text, a black leader line, and a black dot
 * on the exact trajectory point. Lines and dots get a thin white halo so they stay
 * visible over dark satellite imagery.
 */
function CalloutOverlay({ callouts }: { callouts: PlacedCallout[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <svg className="absolute inset-0 h-full w-full">
        {callouts.map((c) => (
          <g key={c.key}>
            <line
              x1={c.lx}
              y1={c.ly}
              x2={c.px}
              y2={c.py}
              stroke="white"
              strokeOpacity={0.7}
              strokeWidth={3.5}
            />
            <line x1={c.lx} y1={c.ly} x2={c.px} y2={c.py} stroke="black" strokeWidth={1.5} />
            <circle cx={c.px} cy={c.py} r={4} fill="black" stroke="white" strokeWidth={1.5} />
          </g>
        ))}
      </svg>
      {callouts.map((c) => (
        <div
          key={c.key}
          className="absolute rounded-sm bg-white/90 px-1.5 py-0.5 leading-tight text-black shadow-sm whitespace-nowrap"
          style={{
            left: c.lx,
            top: c.ly,
            transform: c.side === "left" ? "translate(-100%, -50%)" : "translate(0, -50%)",
            textAlign: c.side === "left" ? "right" : "left",
          }}
        >
          <div className="text-[11px] font-bold tracking-wide">{c.label}</div>
          {c.sub ? <div className="text-[9px] font-semibold">{c.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

function labelOpts(
  Cesium: C,
  text: string,
  color: string,
  side: LabelSide = "above",
): CesiumNS.LabelGraphics.ConstructorOptions {
  const right = side === "right";
  return {
    text,
    font: "600 11px ui-monospace, SFMono-Regular, Menlo, monospace",
    fillColor: Cesium.Color.fromCssColorString(color),
    showBackground: true,
    backgroundColor: Cesium.Color.fromCssColorString("#0b0d10").withAlpha(0.78),
    backgroundPadding: new Cesium.Cartesian2(6, 4),
    pixelOffset: right
      ? new Cesium.Cartesian2(14, 0)
      : new Cesium.Cartesian2(0, side === "below" ? 14 : -14),
    horizontalOrigin: right ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.CENTER,
    verticalOrigin: right
      ? Cesium.VerticalOrigin.CENTER
      : side === "below"
        ? Cesium.VerticalOrigin.TOP
        : Cesium.VerticalOrigin.BOTTOM,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}
