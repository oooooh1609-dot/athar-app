/**
 * Sites: grouping recorded projects by where they were photographed, and
 * getting them out into something a researcher can actually use.
 *
 * There is no map library and no tile provider here, on purpose. Rendering a
 * slippy map means requesting tiles for the exact coordinates of every
 * findspot from a third party, which for unpublished sites is a disclosure
 * the recorder did not agree to. What researchers ask for instead is a file
 * they can open in QGIS, so that is what this produces.
 */

import { distanceBetween, type GeoFix } from "./geo";
import type { AtharProject } from "./athar-db";

export type Site = {
  id: string;
  /** Mean position of the members, which is what gets labelled on a map. */
  centre: { latitude: number; longitude: number };
  projects: AtharProject[];
  /** Distance from the centre to the furthest member, in metres. */
  spreadM: number;
};

const located = (p: AtharProject): p is AtharProject & { location: GeoFix } =>
  p.location !== undefined;

/**
 * Groups projects that were recorded near each other.
 *
 * Single-link clustering: a project joins a site if it is within `radiusM` of
 * *any* member, not of the centre. That matches how a site is actually
 * walked — along a wadi or a cliff face, the records form a chain rather than
 * a blob, and centre-based clustering would split one wall into three sites.
 *
 * The default radius is 50 m, comfortably above a good GNSS fix (±5–10 m) and
 * below the distance at which two rock-art panels are genuinely separate.
 */
export function groupIntoSites(projects: AtharProject[], radiusM = 50): Site[] {
  const points = projects.filter(located);
  const unassigned = new Set(points.map((_, i) => i));
  const sites: Site[] = [];

  while (unassigned.size > 0) {
    const seed = unassigned.values().next().value as number;
    unassigned.delete(seed);
    const members = [seed];

    // Grow the cluster until nothing else is within reach of any member.
    for (let i = 0; i < members.length; i++) {
      const from = points[members[i]!]!.location;
      for (const candidate of [...unassigned]) {
        if (distanceBetween(from, points[candidate]!.location) <= radiusM) {
          unassigned.delete(candidate);
          members.push(candidate);
        }
      }
    }

    const fixes = members.map((i) => points[i]!.location);
    const centre = {
      latitude: fixes.reduce((a, f) => a + f.latitude, 0) / fixes.length,
      longitude: fixes.reduce((a, f) => a + f.longitude, 0) / fixes.length,
    };
    const spreadM = fixes.reduce(
      (max, f) => Math.max(max, distanceBetween({ ...centre, accuracyM: 0, takenAt: 0 }, f)),
      0,
    );

    sites.push({
      id: members.map((i) => points[i]!.id).sort()[0] ?? crypto.randomUUID(),
      centre,
      projects: members.map((i) => points[i]!),
      spreadM,
    });
  }

  return sites.sort((a, b) => b.projects.length - a.projects.length);
}

/**
 * RFC 7946 FeatureCollection, one point per located project.
 *
 * Coordinates are `[longitude, latitude]` — the order the standard requires
 * and the one that is most often written backwards.
 */
export function toGeoJSON(projects: AtharProject[]) {
  return {
    type: "FeatureCollection" as const,
    features: projects.filter(located).map((p) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates:
          p.location.altitudeM === undefined
            ? [p.location.longitude, p.location.latitude]
            : [p.location.longitude, p.location.latitude, p.location.altitudeM],
      },
      properties: {
        id: p.id,
        name: p.name,
        kind: p.kind,
        recorded: new Date(p.createdAt).toISOString(),
        // Accuracy travels with the point. A findspot without its error
        // radius invites being treated as more precise than it is.
        gps_accuracy_m: Math.round(p.location.accuracyM),
        notes: p.notes || null,
        script: p.machineReading?.script ?? null,
        transliteration: p.machineReading?.transliteration ?? null,
        reading_status: p.machineReading ? "machine_suggestion_unreviewed" : "none",
      },
    })),
  };
}

/** Comma-separated coordinates, for a spreadsheet or a site register. */
export function toCsv(projects: AtharProject[]): string {
  const rows = [
    ["name", "latitude", "longitude", "altitude_m", "gps_accuracy_m", "recorded", "kind", "notes"],
    ...projects
      .filter(located)
      .map((p) => [
        p.name,
        p.location.latitude.toFixed(6),
        p.location.longitude.toFixed(6),
        p.location.altitudeM === undefined ? "" : Math.round(p.location.altitudeM).toString(),
        Math.round(p.location.accuracyM).toString(),
        new Date(p.createdAt).toISOString(),
        p.kind,
        p.notes,
      ]),
  ];
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

export interface HeritageSiteMetadata {
  id: string;
  name: string;
  region: "العلا" | "حائل" | "نجران" | "الجوف" | "الرياض" | "المدينة المنورة";
  period: string;
  lat: number;
  lon: number;
  tags: string[];
  radiusMeters: number;
}

export class OfflineSpatialSitesEngine {
  // قاعدة المواقع الميدانية المدمجة دون اتصال
  private static SITES_DB: HeritageSiteMetadata[] = [
    {
      id: "site_01",
      name: "جبل عكمة (المكتبة المفتوحة)",
      region: "العلا",
      period: "المملكة اللحيانية ودادان (القرن 6 ق.م)",
      lat: 26.654,
      lon: 37.912,
      tags: ["داداني", "لحياني", "نذور"],
      radiusMeters: 800,
    },
    {
      id: "site_02",
      name: "الشويمس (رايات ونقوش)",
      region: "حائل",
      period: "العصر الحجري الحديث",
      lat: 26.042,
      lon: 40.565,
      tags: ["رسوم صخرية", "حيوانات منقرضة"],
      radiusMeters: 1500,
    },
    {
      id: "site_03",
      name: "جبة (أم سنمان)",
      region: "حائل",
      period: "الألف الثامن ق.م وثمودي",
      lat: 28.021,
      lon: 40.932,
      tags: ["ثمودي", "وعول", "جمال"],
      radiusMeters: 2000,
    },
    {
      id: "site_04",
      name: "بئر حما التراثي",
      region: "نجران",
      period: "مسند جنوبي وثمودي وقوافل",
      lat: 17.842,
      lon: 44.471,
      tags: ["مسند", "قوافل", "فرسان"],
      radiusMeters: 3000,
    },
    {
      id: "site_05",
      name: "قرية الفاو الأثرية",
      region: "الرياض",
      period: "مملكة كندة الأولى",
      lat: 19.783,
      lon: 45.152,
      tags: ["سبئي", "خط معيني", "معابد"],
      radiusMeters: 2500,
    },
    {
      id: "site_06",
      name: "دومة الجندل ومارد",
      region: "الجوف",
      period: "أدوماتو والعهد النبطي",
      lat: 29.811,
      lon: 39.866,
      tags: ["نبطي", "آشوري"],
      radiusMeters: 1200,
    },
    {
      id: "site_07",
      name: "الحِجر (مدائن صالح)",
      region: "العلا",
      period: "الأنباط",
      lat: 26.801,
      lon: 37.954,
      tags: ["مقابر", "واجهات نبطية"],
      radiusMeters: 4000,
    },
  ];

  /**
   * البحث عن أقرب المواقع الأثرية لإحداثيات الباحث الحالية
   */
  public static findNearestSites(
    currentLat: number,
    currentLon: number,
    limit = 5,
  ): { site: HeritageSiteMetadata; distanceKm: number }[] {
    const results = this.SITES_DB.map((site) => {
      const distanceMeters = this.calculateHaversineMeters(
        currentLat,
        currentLon,
        site.lat,
        site.lon,
      );
      return {
        site,
        distanceKm: Number((distanceMeters / 1000).toFixed(2)),
      };
    });

    results.sort((a, b) => a.distanceKm - b.distanceKm);
    return results.slice(0, limit);
  }

  /**
   * فحص السياج الجغرافي (Geofencing Alert) لمعرفة ما إذا كان الباحث داخل نطاق موقع محمي
   */
  public static checkGeofence(
    currentLat: number,
    currentLon: number,
  ): { inside: boolean; activeSite?: HeritageSiteMetadata; distanceM: number } {
    for (const site of this.SITES_DB) {
      const dist = this.calculateHaversineMeters(currentLat, currentLon, site.lat, site.lon);
      if (dist <= site.radiusMeters) {
        return { inside: true, activeSite: site, distanceM: Math.round(dist) };
      }
    }
    const nearest = this.findNearestSites(currentLat, currentLon, 1)[0];
    return { inside: false, distanceM: Math.round(nearest ? nearest.distanceKm * 1000 : 999999) };
  }

  private static calculateHaversineMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
