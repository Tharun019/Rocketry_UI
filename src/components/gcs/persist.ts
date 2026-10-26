/**
 * Keeps live packets safe across a refresh, a tab crash or a closed laptop lid.
 *
 * 1. Browser backup (always on in Live): every received line goes into
 *    IndexedDB, flushed about once a second. After a reload the UI offers to
 *    restore it; restoring replays the lines, so the log, stats, CSV and charts
 *    come back exactly as they were.
 * 2. Live file (optional, Chrome/Edge): the judges' CSV is written to a file on
 *    disk as packets arrive. A File System Access stream only reaches the disk
 *    when it is closed, so each batch is appended with its own short
 *    open → seek to end → write → close.
 */

/** One received line, enough to replay it through the parser. */
export type SavedLine = {
  rxAt: number;
  raw: string;
  rssi: number | null;
  snr: number | null;
  /** True when RSSI/SNR came from the radio, not from the end of the line. */
  viaLink: boolean;
};

const DB_NAME = "gcs-rocket";
const STORE = "lines";
const FLUSH_MS = 1000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class PacketBackup {
  private db: Promise<IDBDatabase> | null = null;
  private pending: SavedLine[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Last error, shown in the panel; null while saving works. */
  error: string | null = null;

  private get conn() {
    if (typeof indexedDB === "undefined") return null;
    this.db ??= openDb();
    return this.db;
  }

  add(line: SavedLine) {
    this.pending.push(line);
    this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS);
  }

  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const batch = this.pending;
    if (!batch.length || !this.conn) return;
    this.pending = [];
    try {
      const tx = (await this.conn).transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const l of batch) store.add(l);
      await done(tx);
      this.error = null;
    } catch (e) {
      // Keep the lines and try again with the next batch.
      this.pending = [...batch, ...this.pending];
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async count(): Promise<number> {
    if (!this.conn) return 0;
    try {
      const store = (await this.conn).transaction(STORE).objectStore(STORE);
      return await new Promise((resolve, reject) => {
        const r = store.count();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } catch {
      return 0;
    }
  }

  async loadAll(): Promise<SavedLine[]> {
    if (!this.conn) return [];
    const store = (await this.conn).transaction(STORE).objectStore(STORE);
    return new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result as SavedLine[]);
      r.onerror = () => reject(r.error);
    });
  }

  async clear() {
    this.pending = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.conn) return;
    try {
      const tx = (await this.conn).transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      await done(tx);
    } catch {
      /* nothing saved to clear */
    }
  }
}

// ---- live CSV file ---------------------------------------------------------------

type WritableLike = {
  seek(position: number): Promise<void>;
  write(data: string): Promise<void>;
  close(): Promise<void>;
};
type FileHandleLike = {
  name: string;
  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<WritableLike>;
};
type SavePicker = (options: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileHandleLike>;

export const fileRecordingSupported = () =>
  typeof window !== "undefined" && "showSaveFilePicker" in window;

/** Appends text to a chosen file in small batches, closing the stream after each one. */
export class LiveCsvFile {
  private pending = "";
  private busy = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  rows = 0;
  error: string | null = null;

  private constructor(private handle: FileHandleLike) {}

  get name() {
    return this.handle.name;
  }

  /** Ask where to save, then write `initial` (header + rows so far). Null if the user cancels. */
  static async create(suggestedName: string, initial: string, initialRows: number) {
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
    if (!picker) throw new Error("This browser cannot write files directly. Use Chrome or Edge.");
    let handle: FileHandleLike;
    try {
      handle = await picker({
        suggestedName,
        types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }],
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      throw e;
    }
    const w = await handle.createWritable();
    await w.write(initial);
    await w.close();
    const f = new LiveCsvFile(handle);
    f.rows = initialRows;
    f.timer = setInterval(() => void f.flush(), 2000);
    return f;
  }

  append(text: string, rows = 1) {
    this.pending += text;
    this.rows += rows;
  }

  async flush() {
    if (this.busy || !this.pending) return;
    this.busy = true;
    const chunk = this.pending;
    this.pending = "";
    try {
      const size = (await this.handle.getFile()).size;
      const w = await this.handle.createWritable({ keepExistingData: true });
      await w.seek(size);
      await w.write(chunk);
      await w.close();
      this.error = null;
    } catch (e) {
      this.pending = chunk + this.pending;
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
    }
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }
}
