/**
 * Alert debounce: a condition must hold for `raiseMs` before its alert is
 * raised, and be gone for `clearMs` before it clears. One noisy packet (a GPS
 * dropout, a battery dip under load) no longer flickers an alert on and off.
 */

export type AlertCondition<T extends string = string> = {
  type: T;
  source: string;
  level: "warn" | "danger";
  detail?: string;
  /** Override the default hold times, e.g. 0 for an alert that must show at once. */
  raiseMs?: number;
  clearMs?: number;
};

export const RAISE_MS = 2000;
export const CLEAR_MS = 3000;

type Track = {
  pendingSince: number | null;
  active: boolean;
  goneSince: number | null;
  clearMs: number;
};
export type DebounceState = Map<string, Track>;

export const alertKey = (a: { type: string; source: string }) => `${a.type}|${a.source}`;

/**
 * Advance the debounce with the conditions true right now.
 * Returns the keys that became active and the keys that cleared on this step.
 */
export function stepAlerts(
  state: DebounceState,
  conditions: AlertCondition[],
  now: number,
): { raised: string[]; cleared: string[]; active: Set<string> } {
  const raised: string[] = [];
  const cleared: string[] = [];
  const present = new Set<string>();

  for (const c of conditions) {
    const k = alertKey(c);
    present.add(k);
    const t = state.get(k) ?? {
      pendingSince: null,
      active: false,
      goneSince: null,
      clearMs: CLEAR_MS,
    };
    t.clearMs = c.clearMs ?? CLEAR_MS;
    t.goneSince = null;
    if (!t.active) {
      t.pendingSince ??= now;
      if (now - t.pendingSince >= (c.raiseMs ?? RAISE_MS)) {
        t.active = true;
        t.pendingSince = null;
        raised.push(k);
      }
    }
    state.set(k, t);
  }

  for (const [k, t] of state) {
    if (present.has(k)) continue;
    if (!t.active) {
      state.delete(k); // was only pending: forget it
      continue;
    }
    t.goneSince ??= now;
    if (now - t.goneSince >= t.clearMs) {
      state.delete(k);
      cleared.push(k);
    }
  }

  const active = new Set([...state].filter(([, t]) => t.active).map(([k]) => k));
  return { raised, cleared, active };
}
