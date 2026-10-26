import { useCallback, useRef, useState } from "react";
import { FIELD_INDEX, type PacketRecord } from "./packets";
import {
  ROCKET_STATES,
  TRACK_MAX,
  liveInitialFrame,
  pushSample,
  type FlightState,
  type RocketFrame,
  type Sample,
  type TrackPoint,
} from "./telemetry";
import type { LaunchSite } from "./site";

/** States before lift-off: the rocket is still on the pad, so nothing goes on the track. */
const PAD_STATES = new Set<FlightState>(["BOOT", "TEST_MODE", "LAUNCH_PAD", "IMU_CALIBRATE"]);
/** Receive rate is measured over this window. */
const RATE_WINDOW_MS = 5000;
/** Link quality = share of the last this-many packets (by on-board counter) that arrived. */
const QUALITY_WINDOW = 50;
/** Fewer satellites than this is not a usable fix. */
const MIN_SATS = 4;

/**
 * Telemetry built from decoded packets received over USB. Feed it every logged
 * record; malformed lines are ignored here (they still show in the Packets tab).
 */
export function useLiveTelemetry(site: LaunchSite) {
  const [rocket, setRocket] = useState<RocketFrame>(() => liveInitialFrame(site));
  const rxTimes = useRef<number[]>([]);
  const counts = useRef<number[]>([]);

  const apply = useCallback((rec: PacketRecord) => {
    const values = rec.values;
    if (!values) return;

    rxTimes.current = [...rxTimes.current.filter((t) => rec.rxAt - t < RATE_WINDOW_MS), rec.rxAt];
    const times = rxTimes.current;
    const span = (times[times.length - 1] - times[0]) / 1000;
    const updateRate = times.length > 1 && span > 0 ? (times.length - 1) / span : 0;

    // A counter that goes backwards means the flight computer restarted.
    // Without a counter in this packet, link quality keeps its last value.
    let linkQuality: number | null = null;
    if (rec.count !== null) {
      const count = rec.count;
      const prevCount = counts.current[counts.current.length - 1];
      if (prevCount !== undefined && count < prevCount) counts.current = [];
      counts.current = [...counts.current, count].slice(-QUALITY_WINDOW);
      const expected = count - counts.current[0] + 1;
      linkQuality = Math.min(100, (100 * counts.current.length) / Math.max(1, expected));
    }

    setRocket((r) => frameFromPacket(r, values, rec, updateRate, linkQuality ?? r.linkQuality));
  }, []);

  const reset = useCallback(() => {
    rxTimes.current = [];
    counts.current = [];
    setRocket(liveInitialFrame(site));
  }, [site]);

  return { rocket, apply, reset };
}

function frameFromPacket(
  r: RocketFrame,
  values: string[],
  rec: PacketRecord,
  updateRate: number,
  linkQuality: number,
): RocketFrame {
  // An empty field is "no reading": keep showing the last value instead of 0.
  const num = (key: string) => {
    const v = values[FIELD_INDEX[key]];
    return v === "" || v === undefined ? NaN : Number(v);
  };
  const or = (v: number, prev: number) => (Number.isFinite(v) ? v : prev);
  const parsedState = values[FIELD_INDEX.FLIGHT_SOFTWARE_STATE];
  // The parser has already turned any known spelling into the UI name; anything else keeps the last state.
  const state = (ROCKET_STATES as string[]).includes(parsedState)
    ? (parsedState as FlightState)
    : r.state;
  const t = or(num("TIME_STAMPING"), r.t);
  const altitude = or(num("ALTITUDE"), r.altitude);
  const velocity = or(num("VELOCITY"), r.velocity);
  const pressure = or(num("PRESSURE") / 100, r.pressure); // Pa → hPa
  const temperature = or(num("TEMP"), r.temperature);
  const battery = or(num("VOLTAGE"), r.battery);
  const accel: [number, number, number] = [
    or(num("ACCEL_X"), r.accel[0]),
    or(num("ACCEL_Y"), r.accel[1]),
    or(num("ACCEL_Z"), r.accel[2]),
  ];
  const gyro: [number, number, number] = [
    or(num("GYRO_X"), r.gyro[0]),
    or(num("GYRO_Y"), r.gyro[1]),
    or(num("GYRO_SPIN_RATE"), r.gyro[2]),
  ];

  const fixLat = num("GNSS_LATITUDE");
  const fixLon = num("GNSS_LONGITUDE");
  const gnssSats = or(num("GNSS_SATS"), 0);
  const gpsValid =
    gnssSats >= MIN_SATS &&
    Number.isFinite(fixLat) &&
    Number.isFinite(fixLon) &&
    !(fixLat === 0 && fixLon === 0);
  // Without a fix, hold the last good position so the track does not jump.
  const lat = gpsValid ? fixLat : r.lat;
  const lon = gpsValid ? fixLon : r.lon;
  // Charts only get a point when that reading actually arrived.
  const push = (series: Sample[], v: number) =>
    Number.isFinite(v) ? pushSample(series, t, v) : series;

  const point: TrackPoint = { t, lat, lon, alt: altitude };
  const flying = !PAD_STATES.has(state) && !(state === "IMPACT" && r.state === "IMPACT");
  // The track starts on the ground at the last position seen on the pad.
  const prior = r.track.length ? r.track : [{ t, lat: r.lat, lon: r.lon, alt: 0 }];
  const track =
    flying && gpsValid
      ? prior.length >= TRACK_MAX
        ? [...prior.slice(1), point]
        : [...prior, point]
      : r.track;

  // First fix in each state marks where that state began on the 3D path.
  const stateFixes = r.stateFixes[state] ? r.stateFixes : { ...r.stateFixes, [state]: point };
  const markers = { ...r.markers };
  if (state !== r.state) {
    if (state === "LIFTOFF") markers.launch = point;
    if (state === "APOGEE") markers.apogee = point;
    if (state === "PAYLOAD_SEPARATION") markers.drogue = point;
    if (state === "IMPACT") markers.landing = point;
  }

  return {
    ...r,
    state,
    t,
    altitude,
    velocity,
    pressure,
    temperature,
    accel,
    gyro,
    battery,
    rssi: rec.rssi,
    snr: rec.snr,
    linkQuality,
    lastPacketAt: rec.rxAt,
    updateRate,
    gpsValid,
    packetCount: or(num("PACKET_COUNT"), r.packetCount),
    gnssTime: or(num("GNSS_TIME"), r.gnssTime),
    gnssAlt: or(num("GNSS_ALTITUDE"), r.gnssAlt),
    gnssSats,
    roll: or(num("ROLL"), r.roll),
    pitch: or(num("PITCH"), r.pitch),
    lat,
    lon,
    path: gpsValid
      ? r.path.length > 160
        ? [...r.path.slice(1), [lat, lon]]
        : [...r.path, [lat, lon]]
      : r.path,
    track,
    markers,
    stateFixes,
    charts: {
      altitude: push(r.charts.altitude, num("ALTITUDE")),
      velocity: push(r.charts.velocity, num("VELOCITY")),
      acceleration: push(r.charts.acceleration, num("ACCEL_Z")),
      gyro: push(r.charts.gyro, num("GYRO_X")),
      pressure: push(r.charts.pressure, num("PRESSURE") / 100),
      temperature: push(r.charts.temperature, num("TEMP")),
      battery: push(r.charts.battery, num("VOLTAGE")),
    },
  };
}
