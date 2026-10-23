import {
  deduplicateRoutes,
  describeRouteFailure,
  haversineMeters,
  rankAndCategorizeRoutes,
  type OsmContext,
  type PlaceHit,
  type PlannedRoute,
  type RawCandidate,
} from "./routing.ts";

const UA = "SahaySafetyCompanion/1.1 (college EDI prototype; Pune route planning)";

// Pune geographic bounding box: latitude ~ 18.35 - 18.70, longitude ~ 73.65 - 74.05
export const PUNE_BOUNDS = {
  minLat: 18.35,
  maxLat: 18.7,
  minLng: 73.65,
  maxLng: 74.05,
};

export function isWithinPune(lat: number, lng: number): boolean {
  return (
    lat >= PUNE_BOUNDS.minLat &&
    lat <= PUNE_BOUNDS.maxLat &&
    lng >= PUNE_BOUNDS.minLng &&
    lng <= PUNE_BOUNDS.maxLng
  );
}

async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Lookup failed (${response.status}).`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchPlaces(input: {
  data: { query: string };
}): Promise<PlaceHit[]> {
  const query = input.data.query.trim().slice(0, 80);
  if (query.length < 2) return [];

  // Search biased toward central Pune
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=18.5204&lon=73.8567&limit=8&lang=en`;
    const payload = await fetchJson<{
      features?: Array<{
        geometry?: { coordinates?: number[] };
        properties?: {
          name?: string;
          street?: string;
          city?: string;
          state?: string;
          country?: string;
        };
      }>;
    }>(url);

    const hits = (payload.features ?? [])
      .map((feature) => {
        const [lng, lat] = feature.geometry?.coordinates ?? [];
        if (typeof lat !== "number" || typeof lng !== "number") return null;

        // Bias results in or around Pune
        const isPuneArea = isWithinPune(lat, lng);
        const state = feature.properties?.state ?? "";
        if (!isPuneArea && state && !state.toLowerCase().includes("maharashtra")) {
          return null;
        }

        const bits = [
          feature.properties?.name,
          feature.properties?.street,
          feature.properties?.city || "Pune",
          feature.properties?.state,
        ].filter(Boolean);

        return {
          label: bits.join(", ") || query,
          lat,
          lng,
        } satisfies PlaceHit;
      })
      .filter((item): item is PlaceHit => item !== null);

    if (hits.length > 0) return hits.slice(0, 5);
  } catch (err) {
    console.warn("Photon search fallback:", err);
  }

  // Backup: Nominatim restricted to Pune
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ", Pune")}&format=json&limit=5&countrycodes=in`;
    const nomHits = await fetchJson<
      Array<{ display_name: string; lat: string; lon: string }>
    >(nomUrl, { headers: { "User-Agent": UA } });

    return nomHits.map((item) => ({
      label: item.display_name.split(",").slice(0, 3).join(","),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));
  } catch {
    return [];
  }
}

interface OsrmStep {
  name: string;
  distance: number;
  duration: number;
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry?: { coordinates?: number[][] };
  legs?: Array<{
    steps?: OsrmStep[];
  }>;
}

function extractStreetNames(route: OsrmRoute): string[] {
  const names = new Set<string>();
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      if (step.name && step.name.trim().length > 1) {
        names.add(step.name.trim());
      }
    }
  }
  return Array.from(names);
}

/**
 * Multi-path candidate generator for Pune.
 * Calls OSRM walking engine with alternatives=true and waypoint diversions
 * to discover 3-5 genuinely distinct valid walking routes.
 */
export async function fetchMultiPathWalkingRoutes(
  from: PlaceHit,
  to: PlaceHit,
): Promise<RawCandidate[]> {
  const host = "https://routing.openstreetmap.de/routed-foot";
  const directPath = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const directUrl = `${host}/route/v1/driving/${directPath}?alternatives=true&overview=full&geometries=geojson&steps=true`;

  const candidates: RawCandidate[] = [];

  try {
    const payload = await fetchJson<{ code?: string; routes?: OsrmRoute[] }>(
      directUrl,
      {},
      12000,
    );

    if (payload.code === "Ok" && payload.routes) {
      payload.routes.forEach((route, idx) => {
        if (!route.geometry?.coordinates || route.geometry.coordinates.length < 2) return;
        candidates.push({
          id: `direct-${idx}`,
          mode: "foot",
          distanceMeters: route.distance,
          durationSeconds: route.duration,
          geometry: route.geometry.coordinates.map(
            (pair) => [pair[1]!, pair[0]!] as [number, number],
          ),
          streetNames: extractStreetNames(route),
        });
      });
    }
  } catch (err) {
    console.warn("Direct OSRM route fetch failed:", err);
  }

  // If direct routing gave fewer than 4 routes, synthesize orthogonal waypoint diversions
  // through real Pune street nodes to discover alternative arterial corridors
  const straightDist = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  if (candidates.length < 5 && straightDist > 250) {
    // Vector between from and to
    const midLat = (from.lat + to.lat) / 2;
    const midLng = (from.lng + to.lng) / 2;
    const dLat = to.lat - from.lat;
    const dLng = to.lng - from.lng;

    // Normal vectors (perpendicular offsets left and right)
    // Scale offset between 200m and 600m depending on journey distance
    const offsetFactor = Math.min(0.007, Math.max(0.0025, straightDist / 6371000 * 0.7));

    // Two lateral diversion waypoints
    const waypointLeft = {
      lat: midLat - dLng * 0.45 + (dLng > 0 ? offsetFactor : -offsetFactor),
      lng: midLng + dLat * 0.45 + (dLat > 0 ? offsetFactor : -offsetFactor),
    };
    const waypointRight = {
      lat: midLat + dLng * 0.45 + (dLng > 0 ? -offsetFactor : offsetFactor),
      lng: midLng - dLat * 0.45 + (dLat > 0 ? -offsetFactor : offsetFactor),
    };

    const diversions = [waypointLeft, waypointRight];

    for (let i = 0; i < diversions.length; i++) {
      const wp = diversions[i]!;
      const viaPath = `${from.lng},${from.lat};${wp.lng.toFixed(5)},${wp.lat.toFixed(5)};${to.lng},${to.lat}`;
      const viaUrl = `${host}/route/v1/driving/${viaPath}?overview=full&geometries=geojson&steps=true`;

      try {
        const viaRes = await fetchJson<{ code?: string; routes?: OsrmRoute[] }>(
          viaUrl,
          {},
          10000,
        );
        if (viaRes.code === "Ok" && viaRes.routes?.[0]?.geometry?.coordinates) {
          const r = viaRes.routes[0];
          if (r.distance < straightDist * 2.2 && r.geometry?.coordinates) {
            candidates.push({
              id: `via-${i}`,
              mode: "foot",
              distanceMeters: r.distance,
              durationSeconds: r.duration,
              geometry: r.geometry.coordinates.map(
                (pair) => [pair[1]!, pair[0]!] as [number, number],
              ),
              streetNames: extractStreetNames(r),
            });
          }
        }
      } catch {
        // Diversion route not found or unreachable, continue
      }
    }
  }

  return deduplicateRoutes(candidates);
}

/**
 * Loads rich Pune OSM context covering police stations, hospitals, 24/7 pharmacies,
 * commercial shop density, and transit stops along all candidate geometries.
 */
export async function loadPuneOsmContext(
  geometries: Array<[number, number][]>,
): Promise<OsmContext> {
  const empty: OsmContext = { lamps: [], amenities: [], lampsKnown: false };
  const allPoints = geometries.flat();
  if (allPoints.length < 2) return empty;

  const lats = allPoints.map((p) => p[0]);
  const lngs = allPoints.map((p) => p[1]);
  const south = Math.min(...lats) - 0.008;
  const north = Math.max(...lats) + 0.008;
  const west = Math.min(...lngs) - 0.008;
  const east = Math.max(...lngs) + 0.008;

  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;

  // Categories to query: police, hospital, pharmacy, shop, bus_stop
  const tags: Array<{ kind: string; query: string; osmTag: string }> = [
    { kind: "police", query: "police", osmTag: "amenity:police" },
    { kind: "hospital", query: "hospital", osmTag: "amenity:hospital" },
    { kind: "pharmacy", query: "pharmacy", osmTag: "amenity:pharmacy" },
    { kind: "transit", query: "bus_stop", osmTag: "highway:bus_stop" },
    { kind: "commercial", query: "shop", osmTag: "shop" },
  ];

  const results = await Promise.all(
    tags.map(async (t) => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(t.query)}&lat=${centerLat}&lon=${centerLng}&limit=25&osm_tag=${encodeURIComponent(t.osmTag)}`;
        const payload = await fetchJson<{
          features?: Array<{
            geometry?: { coordinates?: number[] };
            properties?: { name?: string };
          }>;
        }>(url, {}, 8000);

        const items: Array<{ lat: number; lng: number; kind: string; name?: string }> = [];
        for (const f of payload.features ?? []) {
          const [lng, lat] = f.geometry?.coordinates ?? [];
          if (typeof lat !== "number" || typeof lng !== "number") continue;
          if (lat < south || lat > north || lng < west || lng > east) continue;
          items.push({
            lat,
            lng,
            kind: t.kind,
            name: f.properties?.name,
          });
        }
        return items;
      } catch {
        return [];
      }
    }),
  );

  return {
    lamps: [],
    amenities: results.flat(),
    lampsKnown: false, // Explicitly false so missing streetlight data is handled by policy
  };
}

export async function planSafeRoutes(input: {
  data: { from: PlaceHit; to: PlaceHit; hour: number };
}): Promise<{ routes: PlannedRoute[]; note: string }> {
  const { from, to, hour } = input.data;

  // Pune check
  const fromInPune = isWithinPune(from.lat, from.lng);
  const toInPune = isWithinPune(to.lat, to.lng);

  if (!fromInPune || !toInPune) {
    console.warn("Route planning requested outside Pune bounding box:", from, to);
  }

  const rawCandidates = await fetchMultiPathWalkingRoutes(from, to);
  if (rawCandidates.length === 0) {
    throw new Error(describeRouteFailure("none"));
  }

  const osmContext = await loadPuneOsmContext(
    rawCandidates.map((c) => c.geometry),
  );

  const ranked = rankAndCategorizeRoutes(rawCandidates, osmContext, hour);
  return ranked;
}
