import { useCallback, useRef, useState } from "react";
import { FIELD_INDEX, type PacketRecord } from "./packets";
import {
  TRACK_MAX,
  liveInitialFrame,
  pushSample,
  type FlightState,
  type RocketFrame,
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
    const count = rec.count ?? 0;
    const prevCount = counts.current[counts.current.length - 1];
    if (prevCount !== undefined && count < prevCount) counts.current = [];
    counts.current = [...counts.current, count].slice(-QUALITY_WINDOW);
    const expected = count - counts.current[0] + 1;
    const linkQuality = Math.min(100, (100 * counts.current.length) / Math.max(1, expected));

    setRocket((r) => frameFromPacket(r, values, rec, updateRate, linkQuality));
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
  const num = (key: string) => Number(values[FIELD_INDEX[key]]);
  const state = values[FIELD_INDEX.FLIGHT_SOFTWARE_STATE] as FlightState;
  const t = num("TIME_STAMPING");
  const altitude = num("ALTITUDE");
  const velocity = num("VELOCITY");
  const pressure = num("PRESSURE") / 100; // Pa → hPa
  const temperature = num("TEMP");
  const battery = num("VOLTAGE");
  const accel: [number, number, number] = [num("ACCEL_X"), num("ACCEL_Y"), num("ACCEL_Z")];
  const gyro: [number, number, number] = [num("GYRO_X"), num("GYRO_Y"), num("GYRO_SPIN_RATE")];

  const fixLat = num("GNSS_LATITUDE");
  const fixLon = num("GNSS_LONGITUDE");
  const gnssSats = num("GNSS_SATS");
  const gpsValid = gnssSats >= MIN_SATS && !(fixLat === 0 && fixLon === 0);
  // Without a fix, hold the last good position so the track does not jump.
  const lat = gpsValid ? fixLat : r.lat;
  const lon = gpsValid ? fixLon : r.lon;

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
    packetCount: num("PACKET_COUNT"),
    gnssTime: num("GNSS_TIME"),
    gnssAlt: num("GNSS_ALTITUDE"),
    gnssSats,
    roll: num("ROLL"),
    pitch: num("PITCH"),
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
      altitude: pushSample(r.charts.altitude, t, altitude),
      velocity: pushSample(r.charts.velocity, t, velocity),
      acceleration: pushSample(r.charts.acceleration, t, accel[2]),
      gyro: pushSample(r.charts.gyro, t, gyro[0]),
      pressure: pushSample(r.charts.pressure, t, pressure),
      temperature: pushSample(r.charts.temperature, t, temperature),
      battery: pushSample(r.charts.battery, t, battery),
    },
  };
}
