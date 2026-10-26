import { useCallback, useEffect, useRef, useState } from "react";
import type { RocketFrame } from "./telemetry";
import { cleanNumber, normalizeState, unframe } from "./protocol";

/**
 * Downlink packet format (IN-SPACe Model Rocketry telemetry, section 6.3).
 * The rocket sends one ASCII line per packet, comma-separated, in exactly this
 * order, terminated by CR. Required fields come first, then OPTIONAL_DATA, then
 * the additional fields allowed by 6.3.B.
 */
export type PacketField = {
  key: string;
  label: string;
  unit?: string;
  /** Decimal places sent, from the spec's resolution column. Omitted for text fields. */
  dp?: number;
  /** Spec table row this column belongs to. Additional fields have none. */
  spec?: number;
};

export const PACKET_FIELDS: PacketField[] = [
  { key: "TEAM_ID", label: "Team ID", spec: 1 },
  { key: "TIME_STAMPING", label: "Time since power-on", unit: "s", dp: 2, spec: 2 },
  { key: "PACKET_COUNT", label: "Packet count", dp: 0, spec: 3 },
  { key: "ALTITUDE", label: "Altitude (AGL)", unit: "m", dp: 1, spec: 4 },
  { key: "PRESSURE", label: "Pressure", unit: "Pa", dp: 0, spec: 5 },
  { key: "TEMP", label: "Temperature", unit: "°C", dp: 1, spec: 6 },
  { key: "VOLTAGE", label: "Bus voltage", unit: "V", dp: 2, spec: 7 },
  { key: "GNSS_TIME", label: "GNSS time (UTC s of day)", unit: "s", dp: 0, spec: 8 },
  { key: "GNSS_LATITUDE", label: "GNSS latitude", unit: "°", dp: 4, spec: 9 },
  { key: "GNSS_LONGITUDE", label: "GNSS longitude", unit: "°", dp: 4, spec: 10 },
  { key: "GNSS_ALTITUDE", label: "GNSS altitude (MSL)", unit: "m", dp: 1, spec: 11 },
  { key: "GNSS_SATS", label: "GNSS satellites", dp: 0, spec: 12 },
  { key: "ACCEL_X", label: "Acceleration X", unit: "m/s²", dp: 2, spec: 13 },
  { key: "ACCEL_Y", label: "Acceleration Y", unit: "m/s²", dp: 2, spec: 13 },
  { key: "ACCEL_Z", label: "Acceleration Z", unit: "m/s²", dp: 2, spec: 13 },
  { key: "ROLL", label: "Roll", unit: "°", dp: 1, spec: 13 },
  { key: "PITCH", label: "Pitch", unit: "°", dp: 1, spec: 13 },
  { key: "GYRO_SPIN_RATE", label: "Gyro spin rate", unit: "°/s", dp: 1, spec: 14 },
  { key: "FLIGHT_SOFTWARE_STATE", label: "Flight software state", spec: 15 },
  { key: "OPTIONAL_DATA", label: "Optional data", spec: 16 },
  { key: "VELOCITY", label: "Vertical velocity", unit: "m/s", dp: 1 },
  { key: "GYRO_X", label: "Angular rate X", unit: "°/s", dp: 1 },
  { key: "GYRO_Y", label: "Angular rate Y", unit: "°/s", dp: 1 },
];

/** Measured by the ground station, appended to every CSV row after the packet fields. */
export const GROUND_FIELDS: PacketField[] = [
  { key: "GS_RSSI", label: "RSSI", unit: "dBm", dp: 0 },
  { key: "GS_SNR", label: "SNR", unit: "dB", dp: 1 },
  { key: "GS_RECEIVED_UTC", label: "Received (UTC)" },
];

export const FIELD_INDEX = Object.fromEntries(PACKET_FIELDS.map((f, i) => [f.key, i]));

/** Encode a frame as the flight computer would transmit it. */
export function encodePacket(f: RocketFrame, teamId: string, optional = ""): string {
  const values: Record<string, string | number> = {
    TEAM_ID: teamId,
    TIME_STAMPING: f.t,
    PACKET_COUNT: f.packetCount,
    ALTITUDE: f.altitude,
    PRESSURE: f.pressure * 100,
    TEMP: f.temperature,
    VOLTAGE: f.battery,
    GNSS_TIME: f.gnssTime,
    GNSS_LATITUDE: f.lat,
    GNSS_LONGITUDE: f.lon,
    GNSS_ALTITUDE: f.gnssAlt,
    GNSS_SATS: f.gnssSats,
    ACCEL_X: f.accel[0],
    ACCEL_Y: f.accel[1],
    ACCEL_Z: f.accel[2],
    ROLL: f.roll,
    PITCH: f.pitch,
    GYRO_SPIN_RATE: f.gyro[2],
    FLIGHT_SOFTWARE_STATE: f.state,
    OPTIONAL_DATA: optional,
    VELOCITY: f.velocity,
    GYRO_X: f.gyro[0],
    GYRO_Y: f.gyro[1],
  };
  return PACKET_FIELDS.map((p) => {
    const v = values[p.key];
    return typeof v === "number" && p.dp !== undefined ? v.toFixed(p.dp) : String(v);
  }).join(",");
}

/** Simulator only: what the radio hands over, including the occasional corrupted line. */
export function simulateDownlink(f: RocketFrame, teamId: string): string {
  const line = encodePacket(f, teamId);
  return Math.random() < 0.005 ? line.slice(0, Math.floor(line.length * Math.random())) : line;
}

export type IssueKind = "MALFORMED" | "GAP" | "DUPLICATE" | "RESET" | "TEAM_ID" | "WARNING";
export type PacketIssue = { kind: IssueKind; detail: string };

export type PacketRecord = {
  /** Ground-side receive index, 1-based. */
  seq: number;
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
};

/** Columns of the rulebook line: the 16 spec rows, accelerometer as one "ax;ay;az" cell. */
export const RULEBOOK_COLS = 16;

/**
 * A plain receiver line may end with the ground station's own RSSI and SNR as
 * two extra fields (after a 23-column or a 16-column packet).
 */
export function splitGroundLink(raw: string): { packet: string } & GroundLink {
  const parts = raw.replace(/[\r\n]+$/, "").split(",");
  if (parts.length === PACKET_FIELDS.length + 2 || parts.length === RULEBOOK_COLS + 2) {
    const [rssi, snr] = parts.slice(-2).map((v) => v.trim());
    if (rssi !== "" && snr !== "" && Number.isFinite(Number(rssi)) && Number.isFinite(Number(snr)))
      return { packet: parts.slice(0, -2).join(","), rssi: Number(rssi), snr: Number(snr) };
  }
  return { packet: raw, rssi: null, snr: null };
}

/** Keys allowed in the rulebook line's optional "KEY=val;KEY=val" field → our column. */
const OPTIONAL_KEYS: Record<string, string> = {
  VEL: "VELOCITY",
  VELOCITY: "VELOCITY",
  VZ: "VELOCITY",
  GX: "GYRO_X",
  GYRO_X: "GYRO_X",
  GY: "GYRO_Y",
  GYRO_Y: "GYRO_Y",
  ROLL: "ROLL",
  PITCH: "PITCH",
};

/**
 * Rulebook line (spec 6.3): TEAM_ID, TIME, COUNT, ALT, PRESSURE, TEMP, VOLTAGE,
 * GNSS_TIME, LAT, LON, GNSS_ALT, SATS, "ax;ay;az[;roll;pitch]", SPIN, STATE,
 * [OPTIONAL]. Returned as our 23 columns. The optional field is kept as sent;
 * any KEY=val pairs we know also fill their own columns.
 */
function fromRulebook(cols: string[]): string[] | { error: string } {
  const v = new Array<string>(PACKET_FIELDS.length).fill("");
  for (let i = 0; i < 12; i++) v[i] = cols[i];
  const accel = cols[12].split(";").map((s) => s.trim());
  if (accel.length === 1 && accel[0] !== "")
    return { error: `Acceleration field needs ax;ay;az, got "${cols[12]}"` };
  if (![1, 3, 5].includes(accel.length))
    return { error: `Acceleration field needs ax;ay;az or ax;ay;az;roll;pitch, got "${cols[12]}"` };
  if (accel.length >= 3)
    [v[FIELD_INDEX.ACCEL_X], v[FIELD_INDEX.ACCEL_Y], v[FIELD_INDEX.ACCEL_Z]] = accel;
  if (accel.length === 5) [v[FIELD_INDEX.ROLL], v[FIELD_INDEX.PITCH]] = accel.slice(3);
  v[FIELD_INDEX.GYRO_SPIN_RATE] = cols[13];
  v[FIELD_INDEX.FLIGHT_SOFTWARE_STATE] = cols[14];
  const optional = cols[15] ?? "";
  v[FIELD_INDEX.OPTIONAL_DATA] = optional;
  for (const pair of optional.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const key = OPTIONAL_KEYS[pair.slice(0, eq).trim().toUpperCase()];
    if (key) v[FIELD_INDEX[key]] = pair.slice(eq + 1).trim();
  }
  return v;
}

/**
 * Accepts the 23-column line and the 16-column (or 15, without the optional
 * field) rulebook line, with or without an "*HH" checksum. Empty numbers mean
 * "no reading" (e.g. no GPS fix) and are kept empty; an unknown state is kept
 * as sent with a warning. Only garbage in a number field rejects the line.
 * Values come back as our 23 columns, the state in its UI name.
 */
export function parsePacket(
  raw: string,
): { values: string[]; warnings: string[] } | { error: string } {
  const u = unframe(raw.replace(/[\r\n]+$/, "").trim());
  if ("error" in u) return u;
  const cols = u.body.split(",").map((c) => c.trim());
  if (/^TEAM[_ ]?ID$/i.test(cols[0])) return { error: "Header row, not a packet" };

  let values: string[];
  if (cols.length === PACKET_FIELDS.length) values = cols;
  else if (cols.length === RULEBOOK_COLS || cols.length === RULEBOOK_COLS - 1) {
    const r = fromRulebook(cols);
    if ("error" in r) return r;
    values = r;
  } else
    return {
      error: `Expected ${RULEBOOK_COLS} (rulebook) or ${PACKET_FIELDS.length} fields, got ${cols.length}`,
    };

  for (let i = 0; i < PACKET_FIELDS.length; i++) {
    const f = PACKET_FIELDS[i];
    if (f.dp === undefined) continue;
    const n = cleanNumber(values[i]);
    if (n === null) return { error: `${f.key} is not a number: "${values[i]}"` };
    values[i] = n;
  }

  const warnings: string[] = [];
  const si = FIELD_INDEX.FLIGHT_SOFTWARE_STATE;
  const state = normalizeState(values[si]);
  if (state) values[si] = state;
  else warnings.push(`Unknown flight software state "${values[si]}"`);
  return { values, warnings };
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
   * Log one received line. Pass `link` when the radio reports RSSI/SNR separately
   * (the simulator); pass null to read them from the end of the line, if present.
   */
  const ingest = useCallback(
    (raw: string, link: GroundLink | null, expectedTeamId: string, at?: number): PacketRecord => {
      const rxAt = at ?? Date.now();
      const split = link ? { packet: raw, ...link } : splitGroundLink(raw);
      const parsed = parsePacket(split.packet);
      const s = { ...statsRef.current, received: statsRef.current.received + 1, lastRxAt: rxAt };
      const issues: PacketIssue[] = [];
      let values: string[] | null = null;
      let count: number | null = null;

      if ("error" in parsed) {
        s.malformed++;
        issues.push({ kind: "MALFORMED", detail: parsed.error });
      } else {
        values = parsed.values;
        const countText = values[FIELD_INDEX.PACKET_COUNT];
        count = countText === "" ? null : Number(countText);
        s.valid++;
        for (const w of parsed.warnings) issues.push({ kind: "WARNING", detail: w });
        const prev = lastCount.current;
        if (prev !== null && count !== null) {
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
        if (count !== null) lastCount.current = count;
        const team = values[FIELD_INDEX.TEAM_ID];
        if (team !== expectedTeamId) {
          s.teamMismatch++;
          issues.push({ kind: "TEAM_ID", detail: `Team ID "${team}" ≠ "${expectedTeamId}"` });
        }
      }

      const record: PacketRecord = {
        seq: s.received,
        rxAt,
        raw,
        values,
        count,
        issues,
        rssi: split.rssi,
        snr: split.snr,
      };
      log.current.push(record);
      statsRef.current = s;
      setStats(s);
      return record;
    },
    [],
  );

  /** Start a fresh session (e.g. when switching between simulated and live data). */
  const reset = useCallback(() => {
    log.current.length = 0;
    lastCount.current = null;
    statsRef.current = EMPTY_STATS;
    setStats(EMPTY_STATS);
  }, []);

  return { log: log.current, stats, ingest, reset };
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

export const FLIGHT_CSV_HEADER = [...PACKET_FIELDS, ...GROUND_FIELDS].map((f) => f.key);

/** One judges' CSV line (with CRLF) for a valid packet; "" for a malformed one. */
export function flightCsvRow(r: PacketRecord) {
  return r.values
    ? csvLines([[...r.values, ...groundCells(r), new Date(r.rxAt).toISOString()]])
    : "";
}

/** The judges' file: one row per valid packet, header row first. */
export function buildFlightCsv(log: PacketRecord[]) {
  return csvLines([FLIGHT_CSV_HEADER]) + log.map(flightCsvRow).join("");
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
