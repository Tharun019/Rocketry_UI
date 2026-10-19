import { useEffect, useRef, useState } from "react";
import type * as CesiumNS from "cesium";
import type { TrackPoint } from "./telemetry";
import type { LaunchSite } from "./site";

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

export type CameraMode = "AUTO" | "FOLLOW" | "TOP" | "ORBIT" | "FREE";

export type Marker3D = {
  key: string;
  label: string;
  point: TrackPoint;
  color: string;
  /** where the label sits relative to the pin (to avoid overlaps) */
  labelSide?: LabelSide;
};
type LabelSide = "above" | "below" | "right";

type Props = {
  track: TrackPoint[];
  markers: Marker3D[];
  site: LaunchSite;
  /** reference ring radius around the site, metres */
  ringM?: number;
  mode: CameraMode;
  onModeChange: (m: CameraMode) => void;
};

type Line = { poly: CesiumNS.Polyline; alt: number; alpha: number };

/** Curtain walls are built as plain primitives in chunks of this many segments. */
const CHUNK = 25;

export function Trajectory3D({ track, markers, site, ringM = 100, mode, onModeChange }: Props) {
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
  const markerEnts = useRef<Map<string, CesiumNS.Entity>>(new Map());
  const siteEnts = useRef<CesiumNS.Entity[]>([]);
  const orbitHeading = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // ---- Create the viewer once -------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let handler: CesiumNS.ScreenSpaceEventHandler | null = null;
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
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 20;

        // Any manual drag / zoom hands the camera to the operator.
        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        const toFree = () => {
          if (modeRef.current !== "FREE") {
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            onModeChange("FREE");
          }
        };
        handler.setInputAction(toFree, Cesium.ScreenSpaceEventType.LEFT_DOWN);
        handler.setInputAction(toFree, Cesium.ScreenSpaceEventType.RIGHT_DOWN);
        handler.setInputAction(toFree, Cesium.ScreenSpaceEventType.MIDDLE_DOWN);
        handler.setInputAction(toFree, Cesium.ScreenSpaceEventType.WHEEL);

        lines.current = viewer.scene.primitives.add(new Cesium.PolylineCollection());
        viewerRef.current = viewer;
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));

    return () => {
      cancelled = true;
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
      markerEnts.current.clear();
      siteEnts.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      // A vertical "curtain" line every 3rd fix, like the replay video.
      if (i % 3 === 0) addLine([b.lon, b.lat, 0, b.lon, b.lat, b.alt], b.alt, 0.8, 1.2);
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

  // ---- Event markers (apogee, drogue, main, landing…) --------------------
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (status !== "ready" || !viewer || !Cesium) return;
    const keep = new Set(markers.map((m) => m.key));
    for (const [k, e] of markerEnts.current) {
      if (!keep.has(k)) {
        viewer.entities.remove(e);
        markerEnts.current.delete(k);
      }
    }
    for (const m of markers) {
      const pos = Cesium.Cartesian3.fromDegrees(m.point.lon, m.point.lat, m.point.alt);
      const existing = markerEnts.current.get(m.key);
      if (existing) {
        existing.position = new Cesium.ConstantPositionProperty(pos);
        if (existing.label)
          existing.label.text = new Cesium.ConstantProperty(
            `${m.label} · ${m.point.alt.toFixed(0)} m`,
          );
        continue;
      }
      markerEnts.current.set(
        m.key,
        viewer.entities.add({
          position: pos,
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromCssColorString(m.color),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: labelOpts(
            Cesium,
            `${m.label} · ${m.point.alt.toFixed(0)} m`,
            m.color,
            m.labelSide,
          ),
        }),
      );
    }
    viewer.scene.requestRender();
  }, [status, markers]);

  // Labels clutter the plan view, so hide them there.
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (status !== "ready" || !viewer || !Cesium) return;
    const show = new Cesium.ConstantProperty(mode !== "TOP");
    for (const e of [...markerEnts.current.values(), ...siteEnts.current])
      if (e.label) e.label.show = show;
    viewer.scene.requestRender();
  }, [status, mode, markers, site.lat, site.lon]);

  // ---- Camera modes -------------------------------------------------------
  const sphereFor = (Cesium: C, footprint = false) => {
    const pts = track.length ? track : [{ t: 0, lat: site.lat, lon: site.lon, alt: 0 }];
    const cart = pts.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, footprint ? 0 : p.alt));
    cart.push(Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0));
    const sphere = Cesium.BoundingSphere.fromPoints(cart);
    sphere.radius = Math.max(sphere.radius * (footprint ? 1.4 : 1.6), footprint ? 250 : 150);
    return sphere;
  };

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (status !== "ready" || !viewer || !Cesium) return;
    const cam = viewer.camera;
    const D = Cesium.Math.toRadians;
    // Plan view uses an orthographic camera so tall walls don't splay outward.
    const ortho = cam.frustum instanceof Cesium.OrthographicFrustum;
    if (mode === "TOP" && !ortho) cam.switchToOrthographicFrustum();
    if (mode !== "TOP" && mode !== "FREE" && ortho) cam.switchToPerspectiveFrustum();
    if (mode === "AUTO") {
      // range 0 → Cesium picks the distance that fits the whole flight on screen
      cam.viewBoundingSphere(sphereFor(Cesium), new Cesium.HeadingPitchRange(D(-25), D(-14), 0));
    } else if (mode === "TOP") {
      cam.viewBoundingSphere(sphereFor(Cesium, true), new Cesium.HeadingPitchRange(0, D(-89.9), 0));
    } else if (mode === "FOLLOW") {
      const last = track.at(-1) ?? { lat: site.lat, lon: site.lon, alt: 0 };
      cam.lookAt(
        Cesium.Cartesian3.fromDegrees(last.lon, last.lat, last.alt),
        new Cesium.HeadingPitchRange(D(-30), D(-15), 500),
      );
    }
    viewer.scene.requestRender();
  }, [status, track, mode, site.lat, site.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Orbit runs on its own animation loop.
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (status !== "ready" || !viewer || !Cesium || mode !== "ORBIT") return;
    let raf = 0;
    const sphere = sphereFor(Cesium);
    const tick = () => {
      orbitHeading.current += 0.004;
      viewer.camera.viewBoundingSphere(
        sphere,
        new Cesium.HeadingPitchRange(orbitHeading.current, Cesium.Math.toRadians(-14), 0),
      );
      viewer.scene.requestRender();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, mode, track, site.lat, site.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0">
      <div ref={host} className="gcs-cesium absolute inset-0" />
      {status !== "ready" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[oklch(0.14_0_0)]">
          <span className="label-mono text-[10px] text-center px-6">
            {status === "loading"
              ? "Loading 3D globe…"
              : "3D view unavailable — run `npm run cesium:copy`, then reload"}
          </span>
        </div>
      ) : null}
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
