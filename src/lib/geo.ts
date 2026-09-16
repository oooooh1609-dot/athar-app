/**
 * Where a photograph was taken.
 *
 * The browser's geolocation API only, with no map SDK and no tile provider, so
 * nothing about a site's position leaves the device unless the user saves the
 * project — locations of unpublished archaeological sites are sensitive, and
 * silently sending them to a third-party map service would be the wrong
 * default for this application.
 */

export type GeoFix = {
  latitude: number;
  longitude: number;
  /** Metres; the radius the device believes the true position lies within. */
  accuracyM: number;
  /** Metres above the WGS-84 ellipsoid, when the device reports it. */
  altitudeM?: number;
  altitudeAccuracyM?: number;
  /** Degrees clockwise from true north, when the device reports it. */
  headingDeg?: number;
  takenAt: number;
};

export type GeoOutcome =
  | { ok: true; fix: GeoFix }
  | { ok: false; reason: "unsupported" | "denied" | "unavailable" | "timeout" };

/**
 * Reads one position fix.
 *
 * `enableHighAccuracy` asks for GNSS rather than a network estimate, which is
 * what a field recording needs — a cell-tower fix can be a kilometre out and
 * would be recorded as though it were the findspot.
 */
export function captureLocation(timeoutMs = 20000): Promise<GeoOutcome> {
  if (typeof navigator === "undefined" || !navigator.geolocation)
    return Promise.resolve({ ok: false, reason: "unsupported" });

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = pos.coords;
        resolve({
          ok: true,
          fix: {
            latitude: c.latitude,
            longitude: c.longitude,
            accuracyM: c.accuracy,
            ...(typeof c.altitude === "number" ? { altitudeM: c.altitude } : {}),
            ...(typeof c.altitudeAccuracy === "number"
              ? { altitudeAccuracyM: c.altitudeAccuracy }
              : {}),
            ...(typeof c.heading === "number" && !Number.isNaN(c.heading)
              ? { headingDeg: c.heading }
              : {}),
            takenAt: pos.timestamp || Date.now(),
          },
        });
      },
      (err) => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.TIMEOUT
              ? "timeout"
              : "unavailable";
        resolve({ ok: false, reason });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/** Decimal degrees, at the ~1 cm precision that six decimals already exceeds. */
export const formatDecimal = (fix: GeoFix) =>
  `${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}`;

const dms = (value: number, positive: string, negative: string) => {
  const hemisphere = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return `${deg}°${String(min).padStart(2, "0")}′${sec.toFixed(2).padStart(5, "0")}″${hemisphere}`;
};

/** Degrees-minutes-seconds, which is still what most site records use. */
export const formatDms = (fix: GeoFix) =>
  `${dms(fix.latitude, "N", "S")} ${dms(fix.longitude, "E", "W")}`;

/**
 * A fix good enough to call a findspot.
 *
 * Ten metres is the working threshold: beyond it the point may fall outside
 * the feature it is meant to record.
 */
export const fixIsReliable = (fix: GeoFix) => fix.accuracyM <= 10;

/** OpenStreetMap, opened by the user — never fetched in the background. */
export const osmUrl = (fix: GeoFix) =>
  `https://www.openstreetmap.org/?mlat=${fix.latitude}&mlon=${fix.longitude}#map=18/${fix.latitude}/${fix.longitude}`;

/** Standard geo: URI, which hands off to whatever map app the device has. */
export const geoUri = (fix: GeoFix) =>
  `geo:${fix.latitude},${fix.longitude}?q=${fix.latitude},${fix.longitude}`;

/**
 * Great-circle distance in metres, for "is this the same findspot as last
 * time?" comparisons between saved projects.
 */
export function distanceBetween(a: GeoFix, b: GeoFix): number {
  const R = 6371008.8; // IUGG mean Earth radius
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
