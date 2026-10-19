import { useEffect, useState } from "react";

/** Launch / reference site. Competition default; adjustable from the UI on the day. */
export type LaunchSite = { lat: number; lon: number };

export const DEFAULT_SITE: LaunchSite = { lat: 26.717535, lon: 84.301543 };

const KEY = "gcs.launchSite";

function isValid(s: unknown): s is LaunchSite {
  if (!s || typeof s !== "object") return false;
  const { lat, lon } = s as LaunchSite;
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

/** Site state that survives page reloads (stored in this browser only). */
export function useLaunchSite() {
  const [site, setSiteState] = useState<LaunchSite>(DEFAULT_SITE);

  // Read after mount so server render and first client render match.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValid(parsed)) setSiteState(parsed);
      }
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);

  const setSite = (s: LaunchSite) => {
    if (!isValid(s)) return;
    setSiteState(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };

  const resetSite = () => setSite(DEFAULT_SITE);

  return { site, setSite, resetSite };
}

// ---- Geo helpers (local flat-earth approximation, fine within a few km) ----

const M_PER_DEG_LAT = 111_320;

export function offsetToLatLon(site: LaunchSite, eastM: number, northM: number) {
  const lat = site.lat + northM / M_PER_DEG_LAT;
  const lon = site.lon + eastM / (M_PER_DEG_LAT * Math.cos((site.lat * Math.PI) / 180));
  return { lat, lon };
}

/** Ground distance (m) and bearing (deg from north) from a to b. */
export function distanceBearing(a: LaunchSite, b: LaunchSite) {
  const north = (b.lat - a.lat) * M_PER_DEG_LAT;
  const east = (b.lon - a.lon) * M_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
  const dist = Math.hypot(east, north);
  const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return { dist, bearing };
}
