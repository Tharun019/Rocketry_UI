/**
 * Ground radio link, without React: takes every text line from the USB serial
 * port, unwraps the RAK3272S AT format, hands telemetry lines to `onPacket`,
 * and runs the command uplink (ACK / EXE, retries, ARM → FIRE for deploys).
 *
 * Two modes:
 *   rak    the ground Teensy is a transparent USB ↔ RAK bridge; this class
 *          configures the radio and decodes "+EVT:RXP2P:<rssi>:<snr>:<hex>".
 *   plain  the ground Teensy prints one decoded packet per line itself.
 */

import {
  DEFAULT_RADIO,
  DEPLOY_STEPS,
  RAK_RX_OFF,
  RAK_RX_ON,
  encodeCmd,
  isRakLine,
  parseControl,
  parseRakLine,
  rakSend,
  rakSetup,
  type RadioConfig,
} from "./protocol";

export type LinkMode = "rak" | "plain";
export type RadioState = "off" | "configuring" | "listening" | "transmitting" | "error";
export type RadioLogTag = "RX" | "TX" | "AT" | "SYS" | "ERR";
export type RadioLogEntry = { id: number; at: number; tag: RadioLogTag; text: string };
export type UplinkStage = "SENT" | "ACK" | "NAK" | "PASS" | "FAIL";
export type UplinkCb = (stage: UplinkStage, detail?: string) => void;

export type LinkTiming = {
  /** How long to wait for OK after an AT command. */
  atTimeoutMs: number;
  /** How long to wait for "+EVT:TXP2P DONE" after AT+PSEND. */
  txTimeoutMs: number;
  /** Wait this long for the rocket's ACK before sending the command again. */
  ackTimeoutMs: number;
  /** Total sends of one command (first try + retries). */
  attempts: number;
  /** Wait this long after the ACK for the execution report. */
  exeTimeoutMs: number;
  /** If a packet arrived within this time, wait for the next one and send right after it. */
  linkFreshMs: number;
  /** Never wait longer than this for that next packet. */
  windowWaitMs: number;
};

export const DEFAULT_TIMING: LinkTiming = {
  atTimeoutMs: 1500,
  txTimeoutMs: 3000,
  ackTimeoutMs: 2500,
  attempts: 5,
  exeTimeoutMs: 10000,
  linkFreshMs: 3000,
  windowWaitMs: 1500,
};

const LOG_MAX = 300;

type Waiter = {
  resolve: (v: { ok: boolean; text: string }) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class GroundLink {
  mode: LinkMode = "rak";
  radio: RadioConfig = { ...DEFAULT_RADIO };
  state: RadioState = "off";
  stateDetail = "";
  log: RadioLogEntry[] = [];
  lastRxAt = 0;

  /** A telemetry line, with RSSI/SNR when the radio reported them. */
  onPacket: (line: string, link: { rssi: number; snr: number } | null) => void = () => {};
  /** Called whenever state or log changes. */
  onChange: () => void = () => {};

  private write: ((text: string) => Promise<void>) | null = null;
  private logId = 0;
  private atQueue: Promise<unknown> = Promise.resolve();
  private atWaiter: Waiter | null = null;
  private txWaiter: Waiter | null = null;
  private rxWaiters: (() => void)[] = [];
  private cmdId = 1;
  private cmdQueue: Promise<unknown> = Promise.resolve();
  private acks = new Map<number, (ok: boolean, reason?: string) => void>();
  private exes = new Map<number, (ok: boolean, reason?: string) => void>();
  private generation = 0;

  constructor(private timing: LinkTiming = DEFAULT_TIMING) {}

  // ---- connection -----------------------------------------------------------------

  /** Port opened: start using it (and configure the radio in RAK mode). */
  async attach(write: (text: string) => Promise<void>) {
    this.write = write;
    this.generation++;
    if (this.mode === "rak") await this.configure();
    else this.setState("listening", "Plain lines from the ground Teensy");
  }

  detach() {
    this.write = null;
    this.generation++;
    this.atWaiter?.resolve({ ok: false, text: "port closed" });
    this.txWaiter?.resolve({ ok: false, text: "port closed" });
    for (const [, cb] of this.acks) cb(false, "PORT CLOSED");
    for (const [, cb] of this.exes) cb(false, "PORT CLOSED");
    this.acks.clear();
    this.exes.clear();
    this.flushRxWaiters();
    this.setState("off", "");
  }

  get connected() {
    return this.write !== null;
  }

  /** Send the P2P setup to the RAK. Safe to call again, e.g. after changing channel. */
  async configure() {
    if (!this.write || this.mode !== "rak") return;
    this.setState("configuring", `${(this.radio.hz / 1e6).toFixed(2)} MHz`);
    const gen = this.generation;
    for (const cmd of rakSetup(this.radio)) {
      const r = await this.at(cmd);
      if (gen !== this.generation) return;
      // Stopping receive may answer with an error when it was not running; that is fine.
      if (!r.ok && cmd !== RAK_RX_OFF) {
        this.setState("error", `${cmd} → ${r.text}`);
        return;
      }
    }
    this.setState(
      "listening",
      `${(this.radio.hz / 1e6).toFixed(2)} MHz · SF${this.radio.sf} · 125 kHz · 4/5 · sync ${this.radio.syncWord}`,
    );
  }

  // ---- receive ----------------------------------------------------------------------

  feedLine(raw: string) {
    const t = raw.trim();
    if (!t) return;

    if (isRakLine(t)) {
      const ev = parseRakLine(t);
      switch (ev.kind) {
        case "rx":
          this.lastRxAt = Date.now();
          this.addLog("RX", `${ev.rssi} dBm · ${ev.snr} dB · ${ev.payload.trim()}`);
          for (const line of ev.payload.split(/\r\n|\r|\n/)) this.handlePayload(line, ev);
          this.flushRxWaiters();
          break;
        case "rx-bad":
          this.addLog("ERR", `RX payload is not hex: ${t}`);
          this.onPacket(t, null);
          break;
        case "ok":
          this.resolveAt(true, t);
          break;
        case "error":
          this.addLog("ERR", t);
          this.resolveAt(false, t);
          break;
        case "tx-done":
          this.addLog("AT", t);
          this.txWaiter?.resolve({ ok: true, text: t });
          break;
        case "rx-timeout":
        case "other":
          this.addLog("AT", t);
          break;
      }
    } else if (t.startsWith("$")) {
      this.lastRxAt = Date.now();
      this.handlePayload(t, null);
      this.flushRxWaiters();
    } else if ((t.match(/,/g)?.length ?? 0) >= 5) {
      // A packet line printed by the ground Teensy itself (plain mode).
      this.lastRxAt = Date.now();
      this.onPacket(t, null);
      this.flushRxWaiters();
    } else {
      // Banner or debug text from the Teensy: show it, but it is not a broken packet.
      this.addLog("SYS", t);
    }
    this.onChange();
  }

  private handlePayload(line: string, link: { rssi: number; snr: number } | null) {
    const t = line.trim();
    if (!t) return;
    if (!t.startsWith("$")) {
      this.onPacket(t, link ? { rssi: link.rssi, snr: link.snr } : null);
      return;
    }
    const c = parseControl(t);
    if ("error" in c) {
      this.addLog("ERR", `${c.error}: ${t}`);
      return;
    }
    this.addLog(
      "RX",
      `${c.kind.toUpperCase()} #${c.id} ${c.ok ? "OK" : "FAILED"}${c.reason ? ` · ${c.reason}` : ""}`,
    );
    const map = c.kind === "ack" ? this.acks : this.exes;
    map.get(c.id)?.(c.ok, c.reason);
  }

  // ---- AT plumbing -----------------------------------------------------------------

  /** Send one AT command and wait for OK / error / timeout. Commands never overlap. */
  private at(cmd: string): Promise<{ ok: boolean; text: string }> {
    const run = async () => {
      if (!this.write) return { ok: false, text: "not connected" };
      const result = new Promise<{ ok: boolean; text: string }>((resolve) => {
        const timer = setTimeout(() => {
          this.atWaiter = null;
          resolve({ ok: false, text: "no answer (timeout)" });
        }, this.timing.atTimeoutMs);
        this.atWaiter = { resolve, timer };
      });
      this.addLog("TX", cmd);
      this.onChange();
      try {
        await this.write(cmd + "\r\n");
      } catch (e) {
        this.resolveAt(false, e instanceof Error ? e.message : String(e));
      }
      return result;
    };
    const p = this.atQueue.then(run, run);
    this.atQueue = p;
    return p;
  }

  private resolveAt(ok: boolean, text: string) {
    const w = this.atWaiter;
    if (!w) return;
    this.atWaiter = null;
    clearTimeout(w.timer);
    w.resolve({ ok, text });
  }

  private waitTxDone(): Promise<{ ok: boolean; text: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.txWaiter = null;
        resolve({ ok: false, text: "no TXP2P DONE (timeout)" });
      }, this.timing.txTimeoutMs);
      this.txWaiter = {
        timer,
        resolve: (v) => {
          clearTimeout(timer);
          this.txWaiter = null;
          resolve(v);
        },
      };
    });
  }

  /**
   * The rocket listens between its own transmissions, so while its packets are
   * arriving, send right after one. If the link is quiet (e.g. LINK_OFF), send now.
   */
  private waitForWindow(): Promise<void> {
    if (Date.now() - this.lastRxAt > this.timing.linkFreshMs) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.rxWaiters = this.rxWaiters.filter((w) => w !== done);
        resolve();
      };
      const timer = setTimeout(done, this.timing.windowWaitMs);
      this.rxWaiters.push(done);
    });
  }

  private flushRxWaiters() {
    const w = this.rxWaiters;
    this.rxWaiters = [];
    w.forEach((f) => f());
  }

  /** Put one uplink line on the air. */
  private async transmit(line: string): Promise<{ ok: boolean; text: string }> {
    if (!this.write) return { ok: false, text: "not connected" };
    await this.waitForWindow();
    if (this.mode === "plain") {
      this.addLog("TX", line);
      try {
        await this.write(line + "\r\n");
        return { ok: true, text: "written" };
      } catch (e) {
        return { ok: false, text: e instanceof Error ? e.message : String(e) };
      }
    }
    this.setState("transmitting", line);
    // Continuous receive blocks AT+PSEND, so stop it, send, and listen again.
    await this.at(RAK_RX_OFF);
    const done = this.waitTxDone();
    const sent = await this.at(rakSend(line));
    const tx = sent.ok ? await done : (this.txWaiter?.resolve(sent), sent);
    const rx = await this.at(RAK_RX_ON);
    this.setState(
      rx.ok ? "listening" : "error",
      rx.ok ? this.stateDetailListening() : `${RAK_RX_ON} → ${rx.text}`,
    );
    return tx;
  }

  private stateDetailListening() {
    return `${(this.radio.hz / 1e6).toFixed(2)} MHz · SF${this.radio.sf} · 125 kHz · 4/5 · sync ${this.radio.syncWord}`;
  }

  // ---- commands -----------------------------------------------------------------------

  /**
   * Send one radio command and wait for the rocket to answer, resending the same
   * id until it ACKs (the rocket must ignore an id it has already carried out).
   */
  private async runOne(
    uiName: string,
    onSent: () => void,
  ): Promise<{ ok: boolean; acked: boolean; detail?: string }> {
    const id = this.cmdId++;
    const line = encodeCmd(id, uiName);
    let ack: { ok: boolean; reason?: string } | null = null;
    const exe = new Promise<{ ok: boolean; reason?: string }>((resolve) =>
      this.exes.set(id, (ok, reason) => resolve({ ok, reason })),
    );
    try {
      for (let attempt = 1; attempt <= this.timing.attempts && !ack; attempt++) {
        const gotAck = new Promise<{ ok: boolean; reason?: string } | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), this.timing.ackTimeoutMs);
          this.acks.set(id, (ok, reason) => {
            clearTimeout(timer);
            resolve({ ok, reason });
          });
        });
        const tx = await this.transmit(line);
        if (!this.connected) return { ok: false, acked: false, detail: "PORT CLOSED" };
        if (!tx.ok) this.addLog("ERR", `#${id} not sent: ${tx.text}`);
        else if (attempt === 1) onSent();
        if (attempt > 1) this.addLog("SYS", `#${id} ${uiName}: retry ${attempt - 1}`);
        ack = await gotAck;
      }
      this.acks.delete(id);
      if (!ack)
        return { ok: false, acked: false, detail: `NO ACK after ${this.timing.attempts} tries` };
      if (!ack.ok) return { ok: false, acked: false, detail: ack.reason ?? "NAK" };

      const result = await Promise.race([
        exe,
        new Promise<null>((r) => setTimeout(() => r(null), this.timing.exeTimeoutMs)),
      ]);
      if (!result) return { ok: false, acked: true, detail: "NO EXEC REPORT (timeout)" };
      return { ok: result.ok, acked: true, detail: result.reason };
    } finally {
      this.acks.delete(id);
      this.exes.delete(id);
    }
  }

  /**
   * Send a UI command (e.g. "LORA_LINK_OFF", "DEPLOY_PRIMARY_PARACHUTE") and
   * report SENT → ACK/NAK → PASS/FAIL. Deploys run ARM, then FIRE.
   * Commands are queued: one in flight at a time.
   */
  sendCommand(uiName: string, cb: UplinkCb) {
    if (!this.connected) {
      cb("NAK", "NOT CONNECTED");
      return;
    }
    const steps = DEPLOY_STEPS[uiName] ?? [uiName];
    const run = async () => {
      let sentReported = false;
      const sent = () => {
        if (!sentReported) cb("SENT");
        sentReported = true;
      };
      for (let i = 0; i < steps.length; i++) {
        const last = i === steps.length - 1;
        const r = await this.runOne(steps[i], sent);
        const label = steps.length > 1 ? `${steps[i]}: ` : "";
        if (!r.acked) {
          this.addLog("ERR", `${uiName} ${label}${r.detail ?? "NAK"}`);
          cb("NAK", `${label}${r.detail ?? "NAK"}`);
          return;
        }
        if (last) cb("ACK");
        if (!r.ok) {
          this.addLog("ERR", `${uiName} ${label}${r.detail ?? "FAIL"}`);
          cb("FAIL", `${label}${r.detail ?? "FAIL"}`);
          return;
        }
      }
      cb("PASS");
    };
    const p = this.cmdQueue.then(run, run);
    this.cmdQueue = p;
  }

  // ---- misc ---------------------------------------------------------------------------

  private setState(state: RadioState, detail: string) {
    this.state = state;
    this.stateDetail = detail;
    if (state === "error") this.addLog("ERR", detail);
    this.onChange();
  }

  addLog(tag: RadioLogTag, text: string) {
    this.log.push({ id: ++this.logId, at: Date.now(), tag, text });
    if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
  }
}
