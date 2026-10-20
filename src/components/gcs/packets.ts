import { useCallback, useEffect, useRef, useState } from "react";
import { ROCKET_STATES, type RocketFrame } from "./telemetry";

/**
 * Downlink packet format (IN-SPACe CAN-7USAT telemetry, section 6.3).
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

const FIELD_INDEX = Object.fromEntries(PACKET_FIELDS.map((f, i) => [f.key, i]));

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

export type IssueKind = "MALFORMED" | "GAP" | "DUPLICATE" | "RESET" | "TEAM_ID";
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
  rssi: number;
  snr: number;
};

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

export function parsePacket(raw: string): { values: string[] } | { error: string } {
  const values = raw.replace(/[\r\n]+$/, "").split(",");
  if (values.length !== PACKET_FIELDS.length)
    return { error: `Expected ${PACKET_FIELDS.length} fields, got ${values.length}` };
  for (let i = 0; i < PACKET_FIELDS.length; i++) {
    const f = PACKET_FIELDS[i];
    if (f.dp !== undefined && (values[i] === "" || !Number.isFinite(Number(values[i]))))
      return { error: `${f.key} is not a number: "${values[i]}"` };
  }
  const state = values[FIELD_INDEX.FLIGHT_SOFTWARE_STATE];
  if (!(ROCKET_STATES as string[]).includes(state))
    return { error: `Unknown flight software state "${state}"` };
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

  const ingest = useCallback(
    (raw: string, link: { rssi: number; snr: number }, expectedTeamId: string) => {
      const rxAt = Date.now();
      const parsed = parsePacket(raw);
      const s = { ...statsRef.current, received: statsRef.current.received + 1, lastRxAt: rxAt };
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

      log.current.push({
        seq: s.received,
        rxAt,
        raw,
        values,
        count,
        issues,
        rssi: link.rssi,
        snr: link.snr,
      });
      statsRef.current = s;
      setStats(s);
    },
    [],
  );

  return { log: log.current, stats, ingest };
}

// ---- Team ID ---------------------------------------------------------------

export const TEAM_ID_PLACEHOLDER = "2026-IN-SPACe-CAN-7USAT-XXX";
const TEAM_KEY = "gcs.teamId";

/** Team ID that survives page reloads (stored in this browser only). */
export function useTeamId() {
  const [teamId, setTeamIdState] = useState(TEAM_ID_PLACEHOLDER);

  // Read after mount so server render and first client render match.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEAM_KEY);
      if (raw) setTeamIdState(raw);
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

/** Required file name: Flight_<TEAM_ID>.csv */
export function flightFileName(teamId: string, suffix = "") {
  return `Flight_${teamId.replace(/[^A-Za-z0-9._-]/g, "_") || "TEAM"}${suffix}.csv`;
}

/** The judges' file: one row per valid packet, header row first. */
export function buildFlightCsv(log: PacketRecord[]) {
  const header = [...PACKET_FIELDS, ...GROUND_FIELDS].map((f) => f.key);
  const rows = log.flatMap((r) =>
    r.values
      ? [[...r.values, r.rssi.toFixed(0), r.snr.toFixed(1), new Date(r.rxAt).toISOString()]]
      : [],
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
      r.rssi.toFixed(0),
      r.snr.toFixed(1),
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
