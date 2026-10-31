import { useCallback, useEffect, useRef, useState } from "react";
import { ROCKET_STATES, type RocketFrame } from "./telemetry";

/**
 * Downlink packet format (IN-SPACe Model Rocketry telemetry, section 6.3), exactly as
 * the rocket firmware (Rocket_TX_Teensy41) sends it and the ground Teensy
 * (Ground_RX_Teensy41) prints it over USB: 16 comma-separated fields, e.g.
 *
 *   2026-IN-SPACe-ROCKETRY-020,125.3,126,1023.4,89234,24.6,7.42,10:31:05,13.0321,77.5891,
 *   941.2,9,-3.1;0.4;48.2,12.5,ASCENT,VS=85.2;MX=1023;SV=C;I=410
 *
 * Measured values may be empty (e.g. no GNSS fix yet). The ground station also prints
 * info lines starting with '#' (e.g. "#RSSI=-71,SNR=8.5"); those are not packets.
 */
export type PacketField = {
  key: string;
  label: string;
  unit?: string;
  /** Decimal places, from the spec's resolution column. Omitted for text fields. */
  dp?: number;
  /** Spec table row this column belongs to. */
  spec?: number;
  /** Must be present in every packet (the rest may be empty). */
  required?: boolean;
};

export const PACKET_FIELDS: PacketField[] = [
  { key: "TEAM_ID", label: "Team ID", spec: 1, required: true },
  { key: "TIME_STAMPING", label: "Time since power-on", unit: "s", dp: 1, spec: 2, required: true },
  { key: "PACKET_COUNT", label: "Packet count", dp: 0, spec: 3, required: true },
  { key: "ALTITUDE", label: "Altitude (AGL)", unit: "m", dp: 1, spec: 4 },
  { key: "PRESSURE", label: "Pressure", unit: "Pa", dp: 0, spec: 5 },
  { key: "TEMP", label: "Temperature", unit: "°C", dp: 1, spec: 6 },
  { key: "VOLTAGE", label: "Bus voltage", unit: "V", dp: 2, spec: 7 },
  { key: "GNSS_TIME", label: "GNSS time (UTC)", spec: 8 },
  { key: "GNSS_LATITUDE", label: "GNSS latitude", unit: "°", dp: 4, spec: 9 },
  { key: "GNSS_LONGITUDE", label: "GNSS longitude", unit: "°", dp: 4, spec: 10 },
  { key: "GNSS_ALTITUDE", label: "GNSS altitude (MSL)", unit: "m", dp: 1, spec: 11 },
  { key: "GNSS_SATS", label: "GNSS satellites", dp: 0, spec: 12 },
  { key: "ACCELEROMETER_DATA", label: "Acceleration X;Y;Z", unit: "m/s²", spec: 13 },
  { key: "GYRO_SPIN_RATE", label: "Gyro spin rate", unit: "°/s", dp: 1, spec: 14 },
  { key: "FLIGHT_SOFTWARE_STATE", label: "Flight software state", spec: 15, required: true },
  { key: "OPTIONAL_DATA", label: "Optional data", spec: 16 },
];

/** Measured by the ground station, appended to every CSV row after the packet fields. */
export const GROUND_FIELDS: PacketField[] = [
  { key: "GS_RSSI", label: "RSSI", unit: "dBm", dp: 0 },
  { key: "GS_SNR", label: "SNR", unit: "dB", dp: 1 },
  { key: "GS_RECEIVED_UTC", label: "Received (UTC)" },
];

export const FIELD_INDEX = Object.fromEntries(PACKET_FIELDS.map((f, i) => [f.key, i]));

/** UTC seconds of day -> "hh:mm:ss". */
export function formatGnssTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec)) % 86400;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** "hh:mm:ss" (or plain seconds) -> UTC seconds of day; NaN when empty or invalid. */
export function parseGnssTime(v: string | undefined): number {
  if (!v) return NaN;
  const m = /^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(v);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return Number.isFinite(Number(v)) ? Number(v) : NaN;
}

/** "ax;ay;az" -> numbers (NaN for missing parts). */
export function parseAccel(v: string | undefined): [number, number, number] {
  const parts = (v ?? "").split(";");
  const n = (i: number) =>
    parts[i] !== undefined && parts[i].trim() !== "" ? Number(parts[i]) : NaN;
  return [n(0), n(1), n(2)];
}

/** OPTIONAL_DATA "KEY=val;KEY=val" -> map. */
export function parseOptional(v: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of (v ?? "").split(";")) {
    const i = kv.indexOf("=");
    if (i > 0) out[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return out;
}

/** Encode a frame as the flight computer would transmit it (simulator). */
export function encodePacket(f: RocketFrame, teamId: string): string {
  const fx = (v: number, dp: number) => (Number.isFinite(v) ? v.toFixed(dp) : "");
  const servo = ROCKET_STATES.indexOf(f.state) < ROCKET_STATES.indexOf("APOGEE") ? "C" : "O";
  return [
    teamId,
    fx(f.t, 1),
    String(f.packetCount),
    fx(f.altitude, 1),
    fx(f.pressure * 100, 0),
    fx(f.temperature, 1),
    fx(f.battery, 2),
    formatGnssTime(f.gnssTime),
    fx(f.lat, 4),
    fx(f.lon, 4),
    fx(f.gnssAlt, 1),
    String(f.gnssSats),
    f.accel.map((a) => fx(a, 1)).join(";"),
    fx(f.gyro[2], 1),
    f.state,
    `VS=${fx(f.velocity, 1)};SV=${servo}`,
  ].join(",");
}

/** Simulator only: what the radio hands over, including the occasional corrupted line. */
export function simulateDownlink(f: RocketFrame, teamId: string): string {
  const line = encodePacket(f, teamId);
  return Math.random() < 0.005 ? line.slice(0, Math.floor(line.length * Math.random())) : line;
}

export type IssueKind = "MALFORMED" | "GAP" | "DUPLICATE" | "RESET" | "TEAM_ID";
export type PacketIssue = { kind: IssueKind; detail: string };

/**
 * What the LoRa link gate was doing when a packet arrived. The rocket always transmits;
 * LORA_LINK_ON / LORA_LINK_OFF only decide how received packets are shown and recorded.
 */
export type LinkState = "STANDBY" | "ON" | "OFF";

export type PacketRecord = {
  /** Ground-side receive index, 1-based (position in the log). */
  seq: number;
  link: LinkState;
  rxAt: number;
  raw: string;
  /** Field values exactly as received; null when the line could not be parsed. */
  values: string[] | null;
  count: number | null;
  issues: PacketIssue[];
  /** Measured by the ground receiver; null when the receiver did not report it. */
  rssi: number | null;
  snr: number | null;
};

export type GroundLink = { rssi: number | null; snr: number | null };

/** Counts cover packets shown in the Packets tab; STANDBY packets are only in `rows`. */
export type PacketStats = {
  received: number;
  valid: number;
  malformed: number;
  /** Packets the counter says were sent but never arrived. */
  missed: number;
  duplicates: number;
  resets: number;
  teamMismatch: number;
  lastRxAt: number;
  /** Valid packets per link state, i.e. the data rows of each CSV. */
  rows: Record<LinkState, number>;
};

const EMPTY_STATS: PacketStats = {
  received: 0,
  valid: 0,
  malformed: 0,
  missed: 0,
  duplicates: 0,
  resets: 0,
  teamMismatch: 0,
  lastRxAt: 0,
  rows: { STANDBY: 0, ON: 0, OFF: 0 },
};

/** Ground-station info line "#RSSI=-71,SNR=8.5" -> figures; null for any other line. */
export function parseLinkLine(line: string): GroundLink | null {
  const m = /^#RSSI=(-?\d+(?:\.\d+)?),SNR=(-?\d+(?:\.\d+)?)/.exec(line.trim());
  return m ? { rssi: Number(m[1]), snr: Number(m[2]) } : null;
}

/**
 * Split and check one packet line. Tolerant on purpose: empty measured values are
 * allowed (no GNSS fix, sensor missing), a trailing "*HH" checksum is dropped, and
 * the state may be a name or its number (0 = BOOT ... 9 = IMPACT).
 */
export function parsePacket(raw: string): { values: string[] } | { error: string } {
  let line = raw.replace(/[\r\n]+$/, "").trim();
  const star = line.lastIndexOf("*");
  if (star > 0 && /^\*[0-9A-Fa-f]{2}$/.test(line.slice(star))) line = line.slice(0, star);
  const values = line.split(",").map((v) => v.trim());
  if (values.length !== PACKET_FIELDS.length)
    return { error: `Expected ${PACKET_FIELDS.length} fields, got ${values.length}` };

  for (let i = 0; i < PACKET_FIELDS.length; i++) {
    const f = PACKET_FIELDS[i];
    const v = values[i];
    if (v === "") {
      if (f.required) return { error: `${f.key} is empty` };
      continue;
    }
    if (f.dp !== undefined && !Number.isFinite(Number(v)))
      return { error: `${f.key} is not a number: "${v}"` };
  }
  if (
    values[FIELD_INDEX.GNSS_TIME] !== "" &&
    !Number.isFinite(parseGnssTime(values[FIELD_INDEX.GNSS_TIME]))
  )
    return { error: `GNSS_TIME is not hh:mm:ss: "${values[FIELD_INDEX.GNSS_TIME]}"` };
  // An accel field with only separators (";;") means "no reading": treat as empty.
  if (/^[;\s]*$/.test(values[FIELD_INDEX.ACCELEROMETER_DATA]))
    values[FIELD_INDEX.ACCELEROMETER_DATA] = "";
  const acc = values[FIELD_INDEX.ACCELEROMETER_DATA];
  if (acc !== "" && parseAccel(acc).some((a) => !Number.isFinite(a)))
    return { error: `ACCELEROMETER_DATA is not ax;ay;az: "${acc}"` };

  const si = FIELD_INDEX.FLIGHT_SOFTWARE_STATE;
  const state = values[si].toUpperCase();
  if (/^\d+$/.test(state) && ROCKET_STATES[Number(state)])
    values[si] = ROCKET_STATES[Number(state)];
  else if ((ROCKET_STATES as string[]).includes(state)) values[si] = state;
  else return { error: `Unknown flight software state "${values[si]}"` };
  return { values };
}

export function fieldValue(r: PacketRecord, key: string): string | undefined {
  return r.values?.[FIELD_INDEX[key]];
}

/**
 * Every packet received this session, kept for the whole mission.
 * The log lives in a ref (it can grow to tens of thousands of lines); `stats`
 * changes on every packet and drives re-renders.
 */
export function usePacketLog() {
  const log = useRef<PacketRecord[]>([]);
  const lastCount = useRef<number | null>(null);
  const statsRef = useRef<PacketStats>(EMPTY_STATS);
  const [stats, setStats] = useState<PacketStats>(EMPTY_STATS);

  /**
   * Log one received packet line. Pass `link` when RSSI/SNR are already known (the
   * simulator); live figures arrive on the next "#RSSI" line, see `attachLink`.
   */
  const ingest = useCallback(
    (
      raw: string,
      link: GroundLink | null,
      expectedTeamId: string,
      linkState: LinkState = "ON",
    ): PacketRecord => {
      const rxAt = Date.now();
      const split = { rssi: link?.rssi ?? null, snr: link?.snr ?? null };
      const parsed = parsePacket(raw);
      const prevStats = statsRef.current;
      const s = { ...prevStats, received: prevStats.received + 1, lastRxAt: rxAt };
      const issues: PacketIssue[] = [];
      let values: string[] | null = null;
      let count: number | null = null;

      if ("error" in parsed) {
        s.malformed++;
        issues.push({ kind: "MALFORMED", detail: parsed.error });
      } else {
        values = parsed.values;
        count = Number(values[FIELD_INDEX.PACKET_COUNT]);
        s.valid++;
        const prev = lastCount.current;
        if (prev !== null) {
          if (count > prev + 1) {
            const n = count - prev - 1;
            s.missed += n;
            issues.push({
              kind: "GAP",
              detail:
                n === 1
                  ? `Packet #${prev + 1} missed`
                  : `${n} packets missed (#${prev + 1}–#${count - 1})`,
            });
          } else if (count === prev) {
            s.duplicates++;
            issues.push({ kind: "DUPLICATE", detail: `Packet #${count} received twice` });
          } else if (count < prev) {
            s.resets++;
            issues.push({ kind: "RESET", detail: `Counter went back from #${prev} to #${count}` });
          }
        }
        lastCount.current = count;
        const team = values[FIELD_INDEX.TEAM_ID];
        if (team !== expectedTeamId) {
          s.teamMismatch++;
          issues.push({ kind: "TEAM_ID", detail: `Team ID "${team}" ≠ "${expectedTeamId}"` });
        }
      }

      const record: PacketRecord = {
        seq: log.current.length + 1,
        link: linkState,
        rxAt,
        raw,
        values,
        count,
        issues,
        rssi: split.rssi,
        snr: split.snr,
      };
      log.current.push(record);
      const rows = values
        ? { ...prevStats.rows, [linkState]: prevStats.rows[linkState] + 1 }
        : prevStats.rows;
      const nextStats = linkState === "STANDBY" ? { ...prevStats, rows } : { ...s, rows };
      statsRef.current = nextStats;
      setStats(nextStats);
      return record;
    },
    [],
  );

  /** Attach the ground station's RSSI/SNR (printed on the line after a packet) to the latest packet. */
  const attachLink = useCallback((link: GroundLink): PacketRecord | null => {
    const last = log.current[log.current.length - 1];
    if (!last || last.rssi !== null) return null;
    last.rssi = link.rssi;
    last.snr = link.snr;
    return last;
  }, []);

  /** Start a fresh session (e.g. when switching between simulated and live data). */
  const reset = useCallback(() => {
    log.current.length = 0;
    lastCount.current = null;
    statsRef.current = EMPTY_STATS;
    setStats(EMPTY_STATS);
  }, []);

  return { log: log.current, stats, ingest, attachLink, reset };
}

// ---- Team ID ---------------------------------------------------------------

export const DEFAULT_TEAM_ID = "2026-IN-SPACe-ROCKETRY-020";
const TEAM_KEY = "gcs.teamId";

/** Team ID that survives page reloads (stored in this browser only). */
export function useTeamId() {
  const [teamId, setTeamIdState] = useState(DEFAULT_TEAM_ID);

  // Read after mount so server render and first client render match.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEAM_KEY);
      // Skip IDs saved before the switch to the rocketry team ID.
      if (raw && !/7USAT|XXX$/i.test(raw)) setTeamIdState(raw);
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);

  const setTeamId = (id: string) => {
    // A comma would split the field; the spec's IDs never contain one.
    const clean = id.replace(/[,\r\n]/g, "").trim();
    setTeamIdState(clean);
    try {
      localStorage.setItem(TEAM_KEY, clean);
    } catch {
      /* ignore */
    }
  };

  return { teamId, setTeamId };
}

// ---- CSV export ------------------------------------------------------------

function csvCell(v: string) {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function csvLines(rows: string[][]) {
  // CRLF line endings, as the spec asks for a carriage return after each record.
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** RSSI and SNR cells; left empty when the receiver did not report them. */
export function groundCells(r: PacketRecord): [string, string] {
  return [r.rssi === null ? "" : r.rssi.toFixed(0), r.snr === null ? "" : r.snr.toFixed(1)];
}

/** Required file name: Flight_<TEAM_ID>.csv */
export function flightFileName(teamId: string, suffix = "") {
  return `Flight_${teamId.replace(/[^A-Za-z0-9._-]/g, "_") || "TEAM"}${suffix}.csv`;
}

/** The records of one link state; each CSV is built from one of these. */
export function linkRecords(log: PacketRecord[], link: LinkState) {
  return log.filter((r) => r.link === link);
}

/** The judges' file: one row per valid packet, header row first. */
export function buildFlightCsv(log: PacketRecord[]) {
  const header = [...PACKET_FIELDS, ...GROUND_FIELDS].map((f) => f.key);
  const rows = log.flatMap((r) =>
    r.values ? [[...r.values, ...groundCells(r), new Date(r.rxAt).toISOString()]] : [],
  );
  return csvLines([header, ...rows]);
}

/**
 * Short file: the first and last few readings of every flight state, in the
 * order the states were reached. A state with too few readings is written once,
 * without repeats. Same columns as the flight CSV, with STATE_SAMPLE in front.
 */
export function buildStateSummaryCsv(log: PacketRecord[], n = 5) {
  const stateIdx = FIELD_INDEX.FLIGHT_SOFTWARE_STATE;
  const byState = new Map<string, PacketRecord[]>();
  for (const r of log) {
    if (!r.values) continue;
    const list = byState.get(r.values[stateIdx]);
    if (list) list.push(r);
    else byState.set(r.values[stateIdx], [r]);
  }

  const header = ["STATE_SAMPLE", ...[...PACKET_FIELDS, ...GROUND_FIELDS].map((f) => f.key)];
  const rows: string[][] = [];
  for (const list of byState.values()) {
    const first = list.slice(0, n);
    const last = list.slice(Math.max(n, list.length - n));
    const row = (r: PacketRecord, label: string) => [
      label,
      ...r.values!,
      ...groundCells(r),
      new Date(r.rxAt).toISOString(),
    ];
    first.forEach((r, i) => rows.push(row(r, `FIRST_${i + 1}`)));
    last.forEach((r, i) => rows.push(row(r, `LAST_${last.length - i}`)));
  }
  return csvLines([header, ...rows]);
}

/** Data rows buildStateSummaryCsv writes for this log: up to 5 + 5 per state. */
export function stateSummaryRowCount(log: PacketRecord[]) {
  const perState = new Map<string, number>();
  for (const r of log) {
    if (!r.values) continue;
    const s = r.values[FIELD_INDEX.FLIGHT_SOFTWARE_STATE];
    perState.set(s, (perState.get(s) ?? 0) + 1);
  }
  let rows = 0;
  for (const n of perState.values()) rows += Math.min(n, 10);
  return rows;
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
