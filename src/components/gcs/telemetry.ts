import { useEffect, useRef, useState } from "react";
import { offsetToLatLon, type LaunchSite } from "./site";

export type FlightState =
  | "BOOT"
  | "TEST_MODE"
  | "LAUNCH_PAD"
  | "IMU_CALIBRATE"
  | "LIFTOFF"
  | "ASCENT"
  | "APOGEE"
  | "PAYLOAD_SEPARATION"
  | "DESCENT"
  | "IMPACT";

export const ROCKET_STATES: FlightState[] = [
  "BOOT",
  "TEST_MODE",
  "LAUNCH_PAD",
  "IMU_CALIBRATE",
  "LIFTOFF",
  "ASCENT",
  "APOGEE",
  "PAYLOAD_SEPARATION",
  "DESCENT",
  "IMPACT",
];

/** Doc-equivalent naming shown in brackets alongside the firmware state name. */
export const ROCKET_STATE_ALIASES: Partial<Record<FlightState, string>> = {
  TEST_MODE: "PRE-LAUNCH",
  LIFTOFF: "LAUNCH",
  PAYLOAD_SEPARATION: "DROGUE",
  IMPACT: "LANDED",
};

export type Sample = { t: number; v: number };
export type LatLon = [number, number];

/** One GPS fix with altitude above ground level (m). */
export type TrackPoint = { t: number; lat: number; lon: number; alt: number };

export type RocketMarkers = {
  launch?: TrackPoint;
  apogee?: TrackPoint;
  drogue?: TrackPoint;
  landing?: TrackPoint;
};

/** Simulated wind: blows TOWARD this bearing (deg from north) at this speed. */
const WIND = { toBearing: 65, speed: 6 };
/** Launch rail tilt off vertical (deg). */
const RAIL_TILT = 4;
const TRACK_MAX = 20000; // ~66 min at 5 Hz
/** Launch site height above mean sea level (m), used for the simulated GNSS altitude. */
const SITE_MSL = 100;

export type RocketFrame = {
  state: FlightState;
  t: number;
  altitude: number;
  velocity: number;
  pressure: number;
  temperature: number;
  accel: [number, number, number];
  gyro: [number, number, number];
  battery: number;
  rssi: number;
  snr: number;
  linkQuality: number;
  lastPacketAt: number;
  updateRate: number;
  gpsValid: boolean;
  /** On-board packet counter; a jump of more than 1 means packets were lost in the air. */
  packetCount: number;
  /** GNSS receiver time, UTC seconds of day. */
  gnssTime: number;
  /** GNSS altitude above mean sea level (m). */
  gnssAlt: number;
  gnssSats: number;
  /** Attitude (deg). */
  roll: number;
  pitch: number;
  yaw: number;
  lat: number;
  lon: number;
  path: LatLon[];
  /** Full 3D flight track (lat, lon, AGL altitude) for the trajectory view. */
  track: TrackPoint[];
  /** Ground offset from the launch site, metres. */
  east: number;
  north: number;
  markers: RocketMarkers;
  /** First fix recorded in each flight state (where that state began on the track). */
  stateFixes: Partial<Record<FlightState, TrackPoint>>;
  charts: {
    altitude: Sample[];
    velocity: Sample[];
    acceleration: Sample[];
    gyro: Sample[];
    pressure: Sample[];
    temperature: Sample[];
    battery: Sample[];
  };
};

const MAX = 120;

function push(arr: Sample[], t: number, v: number): Sample[] {
  const next = arr.length >= MAX ? arr.slice(1) : arr.slice();
  next.push({ t, v });
  return next;
}

function initialFrame(site: LaunchSite): RocketFrame {
  const pad: TrackPoint = { t: 0, lat: site.lat, lon: site.lon, alt: 0 };
  return {
    state: "LAUNCH_PAD",
    t: 0,
    altitude: 0,
    velocity: 0,
    pressure: 1013,
    temperature: 24,
    accel: [0, 0, 9.81],
    gyro: [0, 0, 0],
    battery: 12.4,
    rssi: -62,
    snr: 9.5,
    linkQuality: 98,
    lastPacketAt: 0,
    updateRate: 5,
    gpsValid: true,
    packetCount: 0,
    gnssTime: 0,
    gnssAlt: SITE_MSL,
    gnssSats: 10,
    roll: 0,
    pitch: 0,
    yaw: 0,
    lat: site.lat,
    lon: site.lon,
    path: [[site.lat, site.lon]],
    track: [pad],
    east: 0,
    north: 0,
    markers: { launch: pad },
    stateFixes: { LAUNCH_PAD: pad },
    charts: {
      altitude: [],
      velocity: [],
      acceleration: [],
      gyro: [],
      pressure: [],
      temperature: [],
      battery: [],
    },
  };
}

/** Simulated telemetry. Restarts whenever the launch site changes. */
export function useTelemetry(site: LaunchSite) {
  const t0 = useRef(Date.now());
  const [rocket, setRocket] = useState<RocketFrame>(() => initialFrame(site));

  useEffect(() => {
    t0.current = Date.now();
    setRocket(initialFrame(site));
    const id = setInterval(() => {
      const t = (Date.now() - t0.current) / 1000;
      const now = Date.now();

      setRocket((r) => {
        let state = r.state;
        if (t > 2 && state === "LAUNCH_PAD") state = "IMU_CALIBRATE";
        if (t > 5 && state === "IMU_CALIBRATE") state = "LIFTOFF";
        if (t > 8 && state === "LIFTOFF") state = "ASCENT";
        if (t > 25 && state === "ASCENT") state = "APOGEE";
        if (t > 28 && state === "APOGEE") state = "PAYLOAD_SEPARATION";
        if (t > 33 && state === "PAYLOAD_SEPARATION") state = "DESCENT";
        if (t > 90 && state === "DESCENT") state = "IMPACT";

        const onPad = state === "LAUNCH_PAD" || state === "IMU_CALIBRATE";
        let alt = r.altitude;
        let vel = r.velocity;
        if (state === "LIFTOFF" || state === "ASCENT") {
          vel = Math.min(180, vel + 6 + Math.random() * 2);
          alt += vel * 0.2;
        } else if (state === "APOGEE" || state === "PAYLOAD_SEPARATION") {
          vel += (0 - vel) * 0.15;
          alt += vel * 0.2;
        } else if (state === "DESCENT") {
          vel = Math.max(-40, vel - 2 - Math.random());
          alt = Math.max(0, alt + vel * 0.2);
        } else if (state === "IMPACT") {
          vel = 0;
          alt = 0;
        }

        const accel: [number, number, number] = [
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 1.5,
          state === "ASCENT" || state === "LIFTOFF"
            ? 30 + Math.random() * 8
            : 9.81 + (Math.random() - 0.5) * 2,
        ];
        const gyro: [number, number, number] = [
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 15,
        ];

        // Horizontal motion: weathercock slightly upwind on ascent, drift downwind on descent.
        const windRad = (WIND.toBearing * Math.PI) / 180;
        let east = r.east;
        let north = r.north;
        if (state === "LIFTOFF" || state === "ASCENT") {
          const h = Math.abs(vel) * Math.sin((RAIL_TILT * Math.PI) / 180) * 0.2;
          east -= Math.sin(windRad) * h;
          north -= Math.cos(windRad) * h;
        } else if (!onPad && state !== "IMPACT" && alt > 0) {
          const gust = WIND.speed * (0.8 + Math.random() * 0.4) * 0.2;
          east += Math.sin(windRad) * gust;
          north += Math.cos(windRad) * gust;
        }
        const fix = offsetToLatLon(site, east, north);
        const lat = fix.lat + (Math.random() - 0.5) * 0.00001;
        const lon = fix.lon + (Math.random() - 0.5) * 0.00001;
        const path: LatLon[] =
          r.path.length > 160 ? [...r.path.slice(1), [lat, lon]] : [...r.path, [lat, lon]];

        const point: TrackPoint = { t, lat, lon, alt };
        const flying = !onPad && !(state === "IMPACT" && r.state === "IMPACT");
        const track = flying
          ? r.track.length >= TRACK_MAX
            ? [...r.track.slice(1), point]
            : [...r.track, point]
          : r.track;

        const markers = { ...r.markers };
        const stateFixes = state !== r.state ? { ...r.stateFixes, [state]: point } : r.stateFixes;
        if (state !== r.state) {
          if (state === "APOGEE") markers.apogee = point;
          if (state === "PAYLOAD_SEPARATION") markers.drogue = point;
          if (state === "IMPACT") markers.landing = point;
        }

        const battery = Math.max(10.8, r.battery - 0.0008);
        const gpsValid = Math.random() > 0.02;
        // ~1.5% of packets never reach the ground station.
        const packetCount = r.packetCount + (Math.random() < 0.015 ? 2 : 1);

        return {
          ...r,
          state,
          t,
          altitude: alt,
          velocity: vel,
          pressure: Math.max(200, 1013 - alt * 0.11 + (Math.random() - 0.5)),
          temperature: 24 - alt * 0.006 + (Math.random() - 0.5) * 0.4,
          accel,
          gyro,
          battery,
          rssi: -55 - Math.round(Math.random() * 20),
          snr: Math.max(-4, Math.min(12, r.snr + (Math.random() - 0.5) * 1.2)),
          linkQuality: Math.max(60, Math.min(100, r.linkQuality + (Math.random() - 0.5) * 4)),
          lastPacketAt: now,
          updateRate: 4.6 + Math.random() * 0.8,
          gpsValid,
          packetCount,
          gnssTime: Math.floor((now % 86_400_000) / 1000),
          gnssAlt: SITE_MSL + alt + (Math.random() - 0.5) * 3,
          gnssSats: gpsValid ? 8 + Math.round(Math.random() * 4) : 3,
          roll: gyro[0] * 0.5,
          pitch: gyro[1] * 0.5,
          yaw: gyro[2] * 0.5,
          lat,
          lon,
          path,
          track,
          east,
          north,
          markers,
          stateFixes,
          charts: {
            altitude: push(r.charts.altitude, t, alt),
            velocity: push(r.charts.velocity, t, vel),
            acceleration: push(r.charts.acceleration, t, accel[2]),
            gyro: push(r.charts.gyro, t, gyro[0]),
            pressure: push(r.charts.pressure, t, 1013 - alt * 0.11),
            temperature: push(r.charts.temperature, t, 24 - alt * 0.006),
            battery: push(r.charts.battery, t, battery),
          },
        };
      });
    }, 200);
    return () => clearInterval(id);
  }, [site.lat, site.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  return { rocket };
}
