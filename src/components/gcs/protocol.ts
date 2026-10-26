/**
 * What travels over the rocket ↔ ground radio link, independent of React.
 *
 *   Downlink telemetry  plain CSV line (see packets.ts for the columns),
 *                       optionally ending in "*HH" (XOR checksum, NMEA style).
 *   Downlink control    $ACK,<id>,ACK|NAK[,reason]*HH   command received
 *                       $EXE,<id>,PASS|FAIL[,reason]*HH command carried out
 *   Uplink              $CMD,<id>,<WIRE_NAME>[,args]*HH
 *
 * Over the air every line is wrapped by the RAK3272S (RUI3 firmware, P2P mode):
 *   received  → "+EVT:RXP2P:<rssi>:<snr>:<payload as hex>"
 *   transmit  ← "AT+PSEND=<payload as hex>", answered by "+EVT:TXP2P DONE"
 *
 * Items marked CONFIRM must match the rocket firmware.
 */

import { ROCKET_STATES, type FlightState } from "./telemetry";

// ---- flight software state -------------------------------------------------

/** Other spellings the firmware or the rulebook might use. CONFIRM with the rocket code. */
const STATE_SYNONYMS: Record<string, FlightState> = {
  PRE_LAUNCH: "TEST_MODE",
  PRELAUNCH: "TEST_MODE",
  TEST: "TEST_MODE",
  PAD: "LAUNCH_PAD",
  LAUNCHPAD: "LAUNCH_PAD",
  ON_PAD: "LAUNCH_PAD",
  IMU_CAL: "IMU_CALIBRATE",
  CALIBRATE: "IMU_CALIBRATE",
  CALIBRATION: "IMU_CALIBRATE",
  IMU_CALIBRATION: "IMU_CALIBRATE",
  LAUNCH: "LIFTOFF",
  LIFT_OFF: "LIFTOFF",
  LAUNCHED: "LIFTOFF",
  BURNOUT: "ASCENT",
  COAST: "ASCENT",
  DROGUE: "PAYLOAD_SEPARATION",
  DROGUE_DEPLOY: "PAYLOAD_SEPARATION",
  SEPARATION: "PAYLOAD_SEPARATION",
  ROCKET_DEPLOY: "PAYLOAD_SEPARATION",
  LANDED: "IMPACT",
  LANDING: "IMPACT",
  RECOVERY: "IMPACT",
  TOUCHDOWN: "IMPACT",
};

/**
 * Any state style → the UI state name, or null if unknown.
 * Accepts the UI names ("ASCENT"), loose spellings ("lift-off", "Pre Launch")
 * and numbers, where N is the N-th entry of ROCKET_STATES (0 = BOOT … 9 = IMPACT).
 * CONFIRM the numbering if the firmware sends numbers.
 */
export function normalizeState(raw: string): FlightState | null {
  const t = raw.trim();
  if (/^\d+$/.test(t)) return ROCKET_STATES[Number(t)] ?? null;
  const key = t.toUpperCase().replace(/[\s-]+/g, "_");
  if ((ROCKET_STATES as string[]).includes(key)) return key as FlightState;
  return STATE_SYNONYMS[key] ?? STATE_SYNONYMS[key.replace(/_/g, "")] ?? null;
}

// ---- numbers -----------------------------------------------------------------

/** What Arduino's Serial.print writes for a float with no valid value. */
const NO_READING = /^(nan|-?inf|ovf)$/i;
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** "" = no reading, a number string = the reading, null = garbage (a corrupted line). */
export function cleanNumber(raw: string | undefined): string | null {
  const t = (raw ?? "").trim();
  if (t === "" || NO_READING.test(t)) return "";
  return NUMBER.test(t) ? t : null;
}

// ---- checksum ------------------------------------------------------------------

export function xorChecksum(text: string): string {
  let x = 0;
  for (let i = 0; i < text.length; i++) x ^= text.charCodeAt(i) & 0xff;
  return x.toString(16).toUpperCase().padStart(2, "0");
}

/** "$BODY*HH" for a body without the leading "$". */
export const frame = (body: string) => `$${body}*${xorChecksum(body)}`;

/**
 * Strip an "*HH" suffix and check it. Required for "$" lines, optional on
 * telemetry. Returns the body without "$" and "*HH".
 */
export function unframe(line: string): { body: string } | { error: string } {
  const control = line.startsWith("$");
  const star = line.lastIndexOf("*");
  const given =
    star >= 0
      ? line
          .slice(star + 1)
          .trim()
          .toUpperCase()
      : "";
  if (star < 0 || !/^[0-9A-F]{2}$/.test(given))
    return control ? { error: "missing checksum" } : { body: line };
  const body = line.slice(control ? 1 : 0, star);
  const want = xorChecksum(body);
  return want === given ? { body } : { error: `checksum ${given} ≠ ${want}` };
}

// ---- commands --------------------------------------------------------------------

/** UI command → name on the wire (short, to save airtime). CONFIRM with the rocket code. */
export const COMMAND_WIRE: Record<string, string> = {
  IMU_CALIBRATE: "CAL",
  LORA_LINK_ON: "LINK_ON",
  LORA_LINK_OFF: "LINK_OFF",
  ARM_PRIMARY: "ARM,MAIN",
  FIRE_PRIMARY: "FIRE,MAIN",
  ARM_DROGUE: "ARM,DROGUE",
  FIRE_DROGUE: "FIRE,DROGUE",
};

/**
 * Deploy commands go out as two radio commands: ARM, and only once the rocket
 * confirms it is armed, FIRE. A single corrupted or stray packet cannot fire a charge.
 */
export const DEPLOY_STEPS: Record<string, [string, string]> = {
  DEPLOY_PRIMARY_PARACHUTE: ["ARM_PRIMARY", "FIRE_PRIMARY"],
  DEPLOY_DROGUE_PARACHUTE: ["ARM_DROGUE", "FIRE_DROGUE"],
};

export function encodeCmd(id: number, uiName: string): string {
  return frame(`CMD,${id},${COMMAND_WIRE[uiName] ?? uiName}`);
}

export type Control =
  | { kind: "ack"; id: number; ok: boolean; reason?: string }
  | { kind: "exe"; id: number; ok: boolean; reason?: string };

/** Decode a "$ACK…" or "$EXE…" line; an error string for any other "$" line. */
export function parseControl(line: string): Control | { error: string } {
  const u = unframe(line.trim());
  if ("error" in u) return u;
  const [type, idText, result, ...rest] = u.body.split(",").map((s) => s.trim());
  const id = Number(idText);
  const res = (result ?? "").toUpperCase();
  const reason = rest.join(",") || undefined;
  if (!Number.isInteger(id)) return { error: `bad ${type} id "${idText}"` };
  if (type.toUpperCase() === "ACK" && (res === "ACK" || res === "NAK"))
    return { kind: "ack", id, ok: res === "ACK", reason };
  if (type.toUpperCase() === "EXE" && (res === "PASS" || res === "FAIL"))
    return { kind: "exe", id, ok: res === "PASS", reason };
  return { error: `unknown control line ${type}` };
}

// ---- RAK3272S (RUI3 P2P AT commands) ---------------------------------------------

export const asciiToHex = (s: string) =>
  Array.from(s, (c) => (c.charCodeAt(0) & 0xff).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

export function hexToAscii(hex: string): string | null {
  const h = hex.trim();
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) return null;
  let out = "";
  for (let i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
  return out;
}

/** MR frequency assignment, Team 020. Backup only when Mission Control says so. */
export const CHANNELS = [
  { id: "main", label: "Main · 866.50 MHz", hz: 866_500_000 },
  { id: "backup", label: "Backup · 865.25 MHz", hz: 865_250_000 },
] as const;
export type ChannelId = (typeof CHANNELS)[number]["id"];

export type RadioConfig = {
  hz: number;
  sf: number;
  /** RUI3 bandwidth code: 0 = 125 kHz. */
  bw: number;
  /** RUI3 coding-rate code: 0 = 4/5. */
  cr: number;
  preamble: number;
  /** Ground station only transmits commands; dBm. */
  txPower: number;
  /**
   * SX126x two-byte form of the LoRa sync word. The one-byte SX127x value 0x54
   * becomes 0x5444 (each nibble goes in the high half of its own byte, low half 4).
   */
  syncWord: string;
};

export const DEFAULT_RADIO: RadioConfig = {
  hz: CHANNELS[0].hz,
  sf: 9,
  bw: 0,
  cr: 0,
  preamble: 8,
  txPower: 14,
  syncWord: "5444",
};

/** Continuous receive. While it is on, RUI3 refuses most P2P changes, so stop it first. */
export const RAK_RX_ON = "AT+PRECV=65534";
export const RAK_RX_OFF = "AT+PRECV=0";

/** Commands that put the ground RAK into P2P receive with this config, in order. */
export function rakSetup(c: RadioConfig): string[] {
  return [
    "AT",
    RAK_RX_OFF,
    "AT+NWM=0",
    `AT+P2P=${c.hz}:${c.sf}:${c.bw}:${c.cr}:${c.preamble}:${c.txPower}`,
    `AT+SYNCWORD=${c.syncWord}`,
    RAK_RX_ON,
  ];
}

export const rakSend = (payload: string) => `AT+PSEND=${asciiToHex(payload)}`;

export type RakEvent =
  | { kind: "rx"; rssi: number; snr: number; payload: string }
  | { kind: "rx-bad"; text: string }
  | { kind: "rx-timeout" }
  | { kind: "tx-done" }
  | { kind: "ok" }
  | { kind: "error"; text: string }
  | { kind: "other"; text: string };

/**
 * Interpret one line from the RAK3272S, e.g.
 *   +EVT:RXP2P:-68:11:323032362C...   a received packet (RSSI dBm, SNR dB, hex payload)
 *   +EVT:TXP2P DONE                   our transmission finished
 *   OK / AT_PARAM_ERROR / AT_BUSY_ERROR
 */
export function parseRakLine(line: string): RakEvent {
  const t = line.trim();
  const m = /^\+EVT:RXP2P:(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?):([0-9a-fA-F]*)$/.exec(t);
  if (m) {
    const payload = hexToAscii(m[3]);
    return payload === null
      ? { kind: "rx-bad", text: t }
      : { kind: "rx", rssi: Number(m[1]), snr: Number(m[2]), payload };
  }
  if (/^\+EVT:RXP2P\s+RECEIVE TIMEOUT/i.test(t)) return { kind: "rx-timeout" };
  if (/^\+EVT:TXP2P/i.test(t)) return { kind: "tx-done" };
  if (t === "OK") return { kind: "ok" };
  if (/^AT_[A-Z_]*ERROR|^ERROR/i.test(t)) return { kind: "error", text: t };
  return { kind: "other", text: t };
}

/** Lines that are RAK output rather than packets the ground Teensy printed itself. */
export const isRakLine = (t: string) => /^\+EVT:|^OK$|^AT_[A-Z_]+|^AT\+/.test(t.trim());
