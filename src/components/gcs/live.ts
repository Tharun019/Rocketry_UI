import { useCallback, useRef, useState } from "react";
import {
  FIELD_INDEX,
  parseAccel,
  parseGnssTime,
  parseOptional,
  type GroundLink,
  type PacketRecord,
} from "./packets";
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
  const lastAlt = useRef<{ t: number; alt: number } | null>(null);

  const apply = useCallback((rec: PacketRecord) => {
    const values = rec.values;
    if (!values) return;

    // Vertical speed from successive altitude readings, used when the packet has no VS=.
    const t = Number(values[FIELD_INDEX.TIME_STAMPING]);
    const altRaw = values[FIELD_INDEX.ALTITUDE];
    const alt = altRaw === "" ? NaN : Number(altRaw);
    let climb = NaN;
    if (Number.isFinite(t) && Number.isFinite(alt)) {
      const prev = lastAlt.current;
      if (prev && t > prev.t) climb = (alt - prev.alt) / (t - prev.t);
      lastAlt.current = { t, alt };
    }

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

    setRocket((r) => frameFromPacket(r, values, rec, updateRate, linkQuality, climb));
  }, []);

  /** RSSI/SNR arrive on the ground station's line after the packet. */
  const applyLink = useCallback((link: GroundLink) => {
    setRocket((r) => ({ ...r, rssi: link.rssi, snr: link.snr }));
  }, []);

  const reset = useCallback(() => {
    rxTimes.current = [];
    counts.current = [];
    lastAlt.current = null;
    setRocket(liveInitialFrame(site));
  }, [site]);

  return { rocket, apply, applyLink, reset };
}

function frameFromPacket(
  r: RocketFrame,
  values: string[],
  rec: PacketRecord,
  updateRate: number,
  linkQuality: number,
  /** Altitude change per second since the previous reading; NaN when unknown. */
  climb: number,
): RocketFrame {
  // Empty field -> NaN; `keep` holds the previous value so a missing reading
  // does not drop a card or chart to zero.
  const num = (key: string) => {
    const v = values[FIELD_INDEX[key]];
    return v === undefined || v === "" ? NaN : Number(v);
  };
  const keep = (v: number, prev: number) => (Number.isFinite(v) ? v : prev);
  const opt = parseOptional(values[FIELD_INDEX.OPTIONAL_DATA]);
  const state = values[FIELD_INDEX.FLIGHT_SOFTWARE_STATE] as FlightState;
  const t = num("TIME_STAMPING");
  const altitude = keep(num("ALTITUDE"), r.altitude);
  const velocity = keep(opt.VS !== undefined && opt.VS !== "" ? Number(opt.VS) : climb, r.velocity);
  const pressure = keep(num("PRESSURE") / 100, r.pressure); // Pa → hPa
  const temperature = keep(num("TEMP"), r.temperature);
  const battery = keep(num("VOLTAGE"), r.battery);
  const a = parseAccel(values[FIELD_INDEX.ACCELEROMETER_DATA]);
  const accel: [number, number, number] = [
    keep(a[0], r.accel[0]),
    keep(a[1], r.accel[1]),
    keep(a[2], r.accel[2]),
  ];
  // The rocket sends only the spin rate (about its long axis); X/Y are not measured.
  const gyro: [number, number, number] = [NaN, NaN, keep(num("GYRO_SPIN_RATE"), r.gyro[2])];

  const fixLat = num("GNSS_LATITUDE");
  const fixLon = num("GNSS_LONGITUDE");
  const gnssSats = keep(num("GNSS_SATS"), 0);
  const gpsValid =
    Number.isFinite(fixLat) &&
    Number.isFinite(fixLon) &&
    gnssSats >= MIN_SATS &&
    !(fixLat === 0 && fixLon === 0);
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
    rssi: rec.rssi ?? r.rssi,
    snr: rec.snr ?? r.snr,
    linkQuality,
    lastPacketAt: rec.rxAt,
    updateRate,
    gpsValid,
    packetCount: num("PACKET_COUNT"),
    gnssTime: keep(parseGnssTime(values[FIELD_INDEX.GNSS_TIME]), r.gnssTime),
    gnssAlt: keep(num("GNSS_ALTITUDE"), r.gnssAlt),
    gnssSats,
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
      gyro: pushSample(r.charts.gyro, t, gyro[2]),
      pressure: pushSample(r.charts.pressure, t, pressure),
      temperature: pushSample(r.charts.temperature, t, temperature),
      battery: pushSample(r.charts.battery, t, battery),
    },
  };
}
