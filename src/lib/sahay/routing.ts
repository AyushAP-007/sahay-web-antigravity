export interface PlaceHit {
  label: string;
  lat: number;
  lng: number;
}

export type RouteKind = "safest" | "shortest" | "alternate";

export interface PlannedRoute {
  id: string;
  kind: RouteKind;
  mode: "foot" | "bike";
  distanceMeters: number;
  durationSeconds: number;
  safetyScore: number;
  reasons: string[];
  geometry: [number, number][];
}

export interface SafetyFeatures {
  litRatio: number;
  isolatedRatio: number;
  amenityCount: number;
  night: boolean;
  detourRatio: number;
  lampsKnown: boolean;
}

export interface OsmContext {
  lamps: Array<{ lat: number; lng: number }>;
  amenities: Array<{ lat: number; lng: number; kind: string }>;
  lampsKnown: boolean;
}

function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function sampleGeometry(
  geometry: [number, number][],
  count = 12,
): [number, number][] {
  if (geometry.length <= count) return geometry;
  const out: [number, number][] = [];
  const step = (geometry.length - 1) / (count - 1);
  for (let i = 0; i < count; i += 1) {
    out.push(geometry[Math.round(i * step)]!);
  }
  return out;
}

function nearbyCount(
  point: [number, number],
  items: Array<{ lat: number; lng: number }>,
  radius: number,
): number {
  return items.filter(
    (item) => haversineMeters(point[0], point[1], item.lat, item.lng) <= radius,
  ).length;
}

export function extractFeatures(
  geometry: [number, number][],
  osm: OsmContext,
  hour: number,
  shortestMeters: number,
  distanceMeters: number,
): SafetyFeatures {
  const samples = sampleGeometry(geometry);
  const litHits = samples.filter(
    (point) => nearbyCount(point, osm.lamps, 70) > 0,
  ).length;
  const isolatedHits = samples.filter(
    (point) => nearbyCount(point, osm.lamps, 120) === 0,
  ).length;
  const amenityHits = new Set<string>();
  for (const point of samples) {
    for (const amenity of osm.amenities) {
      if (haversineMeters(point[0], point[1], amenity.lat, amenity.lng) <= 400) {
        amenityHits.add(`${amenity.kind}:${amenity.lat.toFixed(4)}`);
      }
    }
  }
  return {
    litRatio: samples.length ? litHits / samples.length : 0,
    isolatedRatio: samples.length ? isolatedHits / samples.length : 1,
    amenityCount: amenityHits.size,
    night: hour >= 22 || hour < 5,
    detourRatio: shortestMeters > 0 ? distanceMeters / shortestMeters : 1,
    lampsKnown: osm.lampsKnown,
  };
}

/**
 * Prototype ensemble: five decision stumps on OSM features.
 * This is the shape of a tiny random forest, not a model trained on crime data.
 */
export function ensembleSafetyScore(features: SafetyFeatures): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 58;

  if (features.lampsKnown) {
    if (features.litRatio >= 0.45) {
      score += 18;
      reasons.push("Higher share of sampled points near street lamps");
    } else if (features.litRatio >= 0.2) {
      score += 8;
      reasons.push("Some mapped lighting along the way");
    } else {
      score -= 12;
      reasons.push("Few mapped street lamps on this path");
    }

    if (features.isolatedRatio <= 0.2) {
      score += 12;
      reasons.push("Stays closer to lit, used streets");
    } else if (features.isolatedRatio >= 0.5) {
      score -= 18;
      reasons.push("Longer stretches away from mapped lighting");
    }

    if (features.night && features.litRatio < 0.3) {
      score -= 16;
      reasons.push("Night hours with weak mapped lighting");
    }
  }

  if (features.amenityCount >= 3) {
    score += 16;
    reasons.push("Passes nearer police, hospitals, or pharmacies");
  } else if (features.amenityCount >= 1) {
    score += 8;
    reasons.push("A civic stop is close to this path");
  } else {
    score -= 6;
    reasons.push("Fewer mapped police, hospitals, or pharmacies nearby");
  }

  if (features.detourRatio > 1.45) {
    score -= 12;
    reasons.push("Much longer than the shorter walk");
  } else if (features.detourRatio > 1.15) {
    score -= 4;
    reasons.push("A bit longer than the shorter walk");
  }

  return {
    score: Math.max(5, Math.min(96, Math.round(score))),
    reasons: reasons.slice(0, 3),
  };
}

export function formatWalkTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatKm(meters: number): string {
  if (meters < 950) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function rankRoutes(
  candidates: Array<Omit<PlannedRoute, "kind" | "safetyScore" | "reasons">>,
  osm: OsmContext,
  hour: number,
): { similar: boolean; routes: PlannedRoute[] } {
  if (candidates.length === 0) return { similar: true, routes: [] };
  const shortest = Math.min(...candidates.map((item) => item.distanceMeters));
  const scored = candidates.map((item, index) => {
    const features = extractFeatures(
      item.geometry,
      osm,
      hour,
      shortest,
      item.distanceMeters,
    );
    const ensemble = ensembleSafetyScore(features);
    return {
      ...item,
      id: item.id || `route-${index}`,
      safetyScore: ensemble.score,
      reasons: ensemble.reasons,
      kind: "alternate" as RouteKind,
    };
  });
  scored.sort((a, b) => {
    if (b.safetyScore !== a.safetyScore) return b.safetyScore - a.safetyScore;
    return a.distanceMeters - b.distanceMeters;
  });
  const spread =
    scored[0]!.safetyScore - scored[scored.length - 1]!.safetyScore;
  const similar = spread < 6;
  if (similar) {
    scored.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
  const shortestIndex = scored.reduce(
    (best, item, index) =>
      item.distanceMeters < scored[best]!.distanceMeters ? index : best,
    0,
  );
  return {
    similar,
    routes: scored.map((item, index) => ({
      ...item,
      kind: (similar
        ? index === shortestIndex
          ? "shortest"
          : "alternate"
        : index === 0
          ? "safest"
          : index === shortestIndex
            ? "shortest"
            : "alternate") as RouteKind,
    })),
  };
}
