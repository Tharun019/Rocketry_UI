import { useCallback, useEffect, useRef, useState } from "react";

// Minimal Web Serial types (not in TypeScript's DOM lib yet). Chrome and Edge only.
type SerialPortLike = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
};
type SerialLike = {
  requestPort(): Promise<SerialPortLike>;
  addEventListener(type: "disconnect", cb: (e: Event & { target: unknown }) => void): void;
  removeEventListener(type: "disconnect", cb: (e: Event & { target: unknown }) => void): void;
};

function webSerial(): SerialLike | undefined {
  return typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { serial?: SerialLike }).serial;
}

export type SerialStatus = "unsupported" | "idle" | "connecting" | "open" | "error";

/** Teensy USB serial ignores the rate, but the port still needs one to open. */
const BAUD_RATE = 115200;

/**
 * Reads text lines from a USB serial port (the ground-station Teensy).
 * `onLine` is called once per non-empty line, without its line ending; `onOpen` when
 * a port has opened, before its first line.
 */
export function useSerialLines(onLine: (line: string) => void, onOpen?: () => void) {
  const [status, setStatus] = useState<SerialStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const port = useRef<SerialPortLike | null>(null);
  const reader = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const closing = useRef(false);
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // Checked after mount so server render and first client render match.
  useEffect(() => {
    if (!webSerial()) setStatus("unsupported");
  }, []);

  const release = useCallback(async () => {
    const r = reader.current;
    const p = port.current;
    reader.current = null;
    port.current = null;
    try {
      await r?.cancel();
    } catch {
      /* already closed */
    }
    try {
      r?.releaseLock();
    } catch {
      /* already released */
    }
    try {
      await p?.close();
    } catch {
      /* already closed or unplugged */
    }
  }, []);

  const disconnect = useCallback(async () => {
    closing.current = true;
    await release();
    setStatus((s) => (s === "unsupported" ? s : "idle"));
    setError(null);
  }, [release]);

  const connect = useCallback(async () => {
    const serial = webSerial();
    if (!serial) return setStatus("unsupported");
    if (port.current) await release();
    setError(null);
    setStatus("connecting");

    let p: SerialPortLike;
    try {
      p = await serial.requestPort();
      await p.open({ baudRate: BAUD_RATE });
    } catch (e) {
      // Closing the port picker without choosing is not an error.
      if (e instanceof DOMException && e.name === "NotFoundError") return setStatus("idle");
      setError(e instanceof Error ? e.message : String(e));
      return setStatus("error");
    }
    if (!p.readable) {
      setError("Port is not readable");
      return setStatus("error");
    }

    port.current = p;
    closing.current = false;
    const r = p.readable.getReader();
    reader.current = r;
    onOpenRef.current?.();
    setStatus("open");

    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await r.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r\n|\r|\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) onLineRef.current(line);
        // Guard against a sender that never ends a line.
        if (buffer.length > 4096) buffer = "";
      }
    } catch (e) {
      if (!closing.current) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    } finally {
      if (reader.current === r) await release();
    }
    if (!closing.current) {
      setStatus((s) => (s === "error" ? s : "idle"));
    }
  }, [release]);

  // Unplugging the Teensy ends the read loop with an error; report it plainly.
  useEffect(() => {
    const serial = webSerial();
    if (!serial) return;
    const onGone = (e: Event & { target: unknown }) => {
      if (e.target !== port.current) return;
      closing.current = true;
      void release();
      setError("Device disconnected");
      setStatus("error");
    };
    serial.addEventListener("disconnect", onGone);
    return () => serial.removeEventListener("disconnect", onGone);
  }, [release]);

  // Close the port when the page unmounts.
  useEffect(
    () => () => {
      closing.current = true;
      void release();
    },
    [release],
  );

  return { status, error, connect, disconnect };
}
