import {
  deduplicatePlaces,
  evaluatePlacesAlongRoute,
  analyzeRouteDistributionAndGaps,
  calculateNightActivityScore,
  type MappedPlace,
  type TravelMode,
} from "./night-scoring.ts";
import {
  deduplicateRoutes,
  describeRouteFailure,
  extractRouteFeatures,
  haversineMeters,
  rankAndCategorizeRoutes,
  type OsmContext,
  type PlaceHit,
  type PlannedRoute,
  type RawCandidate,
} from "./routing.ts";

const UA = "SahaySafetyCompanion/1.1 (college EDI prototype; Pune route planning)";

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
  const query = input.data.query.trim();
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
  } catch (err) {
    console.warn("Nominatim search failed:", err);
    return [];
  }
}

interface OsrmStep {
  name?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
  };
}

interface OsrmLeg {
  steps?: OsrmStep[];
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry?: {
    coordinates?: [number, number][];
  };
  legs?: OsrmLeg[];
}

function extractStreetNames(route: OsrmRoute): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const name = step.name?.trim();
      if (name && !seen.has(name) && !name.toLowerCase().startsWith("unnamed")) {
        seen.add(name);
        names.push(name);
      }
    }
  }
  return names;
}

function countMeaningfulTurns(route: OsrmRoute): number {
  let count = 0;
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const type = step.maneuver?.type;
      const mod = step.maneuver?.modifier;
      if (
        type === "turn" ||
        type === "end of road" ||
        type === "fork" ||
        type === "roundabout" ||
        (mod && (mod.includes("left") || mod.includes("right") || mod.includes("sharp")))
      ) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Fetches real candidate routes using mode-specific OSRM routers (foot, bike, or car).
 */
export async function fetchMultiPathRoutes(
  from: PlaceHit,
  to: PlaceHit,
  mode: TravelMode = "foot",
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];

  const hostMap: Record<TravelMode, string> = {
    foot: "https://routing.openstreetmap.de/routed-foot",
    bike: "https://routing.openstreetmap.de/routed-bike",
    car: "https://routing.openstreetmap.de/routed-car",
  };
  const host = hostMap[mode] || hostMap.foot;

  const directUrl = `${host}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;

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
          mode,
          distanceMeters: route.distance,
          durationSeconds: route.duration,
          geometry: route.geometry.coordinates.map(
            (pair) => [pair[1]!, pair[0]!] as [number, number],
          ),
          streetNames: extractStreetNames(route),
          meaningfulTurnsCount: countMeaningfulTurns(route),
        });
      });
    }
  } catch (err) {
    console.warn("Direct OSRM route fetch failed:", err);
  }

  // Waypoint diversion for alternative arterial corridors if fewer than 4 routes found
  const straightDist = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  if (candidates.length < 5 && straightDist > 250) {
    const midLat = (from.lat + to.lat) / 2;
    const midLng = (from.lng + to.lng) / 2;
    const dLat = to.lat - from.lat;
    const dLng = to.lng - from.lng;

    const offsetFactor = Math.min(0.007, Math.max(0.0025, (straightDist / 6371000) * 0.7));

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
              mode,
              distanceMeters: r.distance,
              durationSeconds: r.duration,
              geometry: r.geometry.coordinates.map(
                (pair) => [pair[1]!, pair[0]!] as [number, number],
              ),
              streetNames: extractStreetNames(r),
              meaningfulTurnsCount: countMeaningfulTurns(r),
            });
          }
        }
      } catch {
        // Diversion route unreachable
      }
    }
  }

  return deduplicateRoutes(candidates);
}

// Backward-compatible alias
export const fetchMultiPathWalkingRoutes = (from: PlaceHit, to: PlaceHit) =>
  fetchMultiPathRoutes(from, to, "foot");

/**
 * Loads rich categorized places along candidate routes.
 */
export async function loadPuneCategorizedPlaces(
  geometries: Array<[number, number][]>,
): Promise<{ places: MappedPlace[]; cameras: MappedPlace[]; camerasAvailable: boolean }> {
  const allPoints = geometries.flat();
  if (allPoints.length < 2) {
    return { places: [], cameras: [], camerasAvailable: false };
  }

  const lats = allPoints.map((p) => p[0]);
  const lngs = allPoints.map((p) => p[1]);
  const south = Math.min(...lats) - 0.01;
  const north = Math.max(...lats) + 0.01;
  const west = Math.min(...lngs) - 0.01;
  const east = Math.max(...lngs) + 0.01;

  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;

  const categoryQueries = [
    { cat: "shop_food" as const, query: "shop", osmTag: "shop" },
    { cat: "shop_food" as const, query: "restaurant", osmTag: "amenity:restaurant" },
    { cat: "pharmacy_medical" as const, query: "pharmacy", osmTag: "amenity:pharmacy" },
    { cat: "pharmacy_medical" as const, query: "clinic", osmTag: "amenity:clinic" },
    { cat: "hospital" as const, query: "hospital", osmTag: "amenity:hospital" },
    { cat: "fuel_cng" as const, query: "fuel", osmTag: "amenity:fuel" },
    { cat: "transport" as const, query: "bus_stop", osmTag: "highway:bus_stop" },
    { cat: "transport" as const, query: "railway", osmTag: "railway:station" },
  ];

  const fetchedPlaces: MappedPlace[] = [];

  await Promise.all(
    categoryQueries.map(async (cq, idx) => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(cq.query)}&lat=${centerLat}&lon=${centerLng}&limit=30&osm_tag=${encodeURIComponent(cq.osmTag)}`;
        const payload = await fetchJson<{
          features?: Array<{
            geometry?: { coordinates?: number[] };
            properties?: {
              name?: string;
              osm_id?: number;
              opening_hours?: string;
              [k: string]: any;
            };
          }>;
        }>(url, {}, 8000);

        for (const f of payload.features ?? []) {
          const [lng, lat] = f.geometry?.coordinates ?? [];
          if (typeof lat !== "number" || typeof lng !== "number") continue;
          if (lat < south || lat > north || lng < west || lng > east) continue;

          // Default hours heuristic for standard Indian amenities if tag missing
          let rawHours = f.properties?.opening_hours;
          if (!rawHours) {
            if (cq.cat === "hospital") {
              rawHours = "24/7"; // Hospitals operate 24/7 in Pune
            } else if (cq.cat === "shop_food") {
              rawHours = "Mo-Su 10:00-23:00"; // Common shop/restaurant schedule
            } else if (cq.cat === "fuel_cng") {
              rawHours = "Mo-Su 06:00-23:00";
            } else if (cq.cat === "transport") {
              rawHours = "Mo-Su 05:00-23:30";
            }
          }

          fetchedPlaces.push({
            id: `place-${cq.cat}-${idx}-${f.properties?.osm_id || Math.round(lat * 10000)}`,
            name: f.properties?.name || `${cq.cat.replace("_", " ")}`,
            category: cq.cat,
            lat,
            lng,
            openingHoursRaw: rawHours,
          });
        }
      } catch {
        // Continue
      }
    }),
  );

  const deduplicated = deduplicatePlaces(fetchedPlaces);

  // Check Overpass for live surveillance cameras
  let cameras: MappedPlace[] = [];
  let camerasAvailable = false;

  const overpassQuery = `[out:json][timeout:6];node["man_made"="surveillance"](${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)});out body 25;`;
  try {
    const ovRes = await fetchJson<{
      elements?: Array<{ id: number; lat: number; lon: number; tags?: any }>;
    }>("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    }, 6000);

    if (ovRes.elements) {
      camerasAvailable = true;
      cameras = ovRes.elements.map((el) => ({
        id: `cam-${el.id}`,
        name: el.tags?.name || "OSM Surveillance Camera",
        category: "surveillance_camera" as const,
        lat: el.lat,
        lng: el.lon,
      }));
    }
  } catch {
    // If Overpass is rate-limited or unavailable, record camera data as unavailable
    camerasAvailable = false;
  }

  return {
    places: deduplicated,
    cameras,
    camerasAvailable,
  };
}

/**
 * Loads Pune OSM context for backward compatibility.
 */
export async function loadPuneOsmContext(
  geometries: Array<[number, number][]>,
): Promise<OsmContext> {
  const { places } = await loadPuneCategorizedPlaces(geometries);
  return {
    lamps: [],
    amenities: places.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      kind: p.category === "pharmacy_medical" ? "pharmacy" : p.category === "shop_food" ? "commercial" : p.category,
      name: p.name,
    })),
    lampsKnown: false,
  };
}

/**
 * Plan safe routes with time-aware Night Activity scoring and multi-mode comparison.
 */
export async function planSafeRoutes(input: {
  data: {
    from: PlaceHit;
    to: PlaceHit;
    hour?: number;
    mode?: TravelMode;
    departureTimeIso?: string;
  };
}): Promise<{ routes: PlannedRoute[]; note: string; allPlaces: MappedPlace[]; allCameras: MappedPlace[] }> {
  const { from, to, mode = "foot", departureTimeIso } = input.data;

  const departureDate = departureTimeIso ? new Date(departureTimeIso) : new Date();
  const hour = input.data.hour ?? departureDate.getHours();

  const rawCandidates = await fetchMultiPathRoutes(from, to, mode);
  if (rawCandidates.length === 0) {
    throw new Error(describeRouteFailure("none"));
  }

  const { places, cameras, camerasAvailable } = await loadPuneCategorizedPlaces(
    rawCandidates.map((c) => c.geometry),
  );

  // Legacy baseline ranking
  const legacyOsm: OsmContext = {
    lamps: [],
    amenities: places.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      kind: p.category === "pharmacy_medical" ? "pharmacy" : p.category,
      name: p.name,
    })),
    lampsKnown: false,
  };

  const rankedBase = rankAndCategorizeRoutes(rawCandidates, legacyOsm, hour);
  const shortestMeters = Math.min(...rawCandidates.map((c) => c.distanceMeters));
  const fastestDuration = Math.min(...rawCandidates.map((c) => c.durationSeconds));

  // Calculate Night Activity Score and time-aware passing for each candidate
  const enhancedRoutes: PlannedRoute[] = rankedBase.routes.map((route) => {
    // 1. Evaluate places along this specific route
    const placesAlong = evaluatePlacesAlongRoute(
      places,
      route.geometry,
      route.distanceMeters,
      route.durationSeconds,
      departureDate,
      70, // 70m corridor
    );

    // 2. Evaluate cameras along this route
    const camerasAlong = evaluatePlacesAlongRoute(
      cameras,
      route.geometry,
      route.distanceMeters,
      route.durationSeconds,
      departureDate,
      60, // 60m corridor
    );

    // 3. Gap analysis & distribution
    const rawMatch = rawCandidates.find((c) => c.id === route.id);
    const turns = rawMatch?.meaningfulTurnsCount ?? 3;
    const mainRoadRatio = route.breakdown?.pedestrianScore ? route.breakdown.pedestrianScore / 100 : 0.4;

    const gapAnalysis = analyzeRouteDistributionAndGaps(
      route.geometry,
      route.distanceMeters,
      placesAlong,
      camerasAlong,
      turns,
      mainRoadRatio,
    );

    // 4. Night Activity Score
    const scoring = calculateNightActivityScore(
      gapAnalysis,
      mode,
      placesAlong,
      camerasAvailable,
    );

    return {
      ...route,
      nightActivityScore: scoring.nightActivityScore,
      factors: scoring.factors,
      gapAnalysis,
      placesAlongRoute: placesAlong,
      camerasAlongRoute: camerasAlong,
      hasCameraData: camerasAvailable,
      missingDataNotes: [
        ...(route.missingDataNotes ?? []),
        ...scoring.missingDataNotes,
      ],
      confidence: scoring.confidence,
    };
  });

  // Apply Section 10: Fastest vs Night-Activity-Favoured comparison
  // 1. Fastest candidate
  let fastestIndex = 0;
  enhancedRoutes.forEach((r, idx) => {
    if (r.durationSeconds < enhancedRoutes[fastestIndex]!.durationSeconds) {
      fastestIndex = idx;
    }
  });

  // 2. Night activity-favoured candidate within 10-minute constraint of fastest
  const fastestDurationSec = enhancedRoutes[fastestIndex]!.durationSeconds;
  const maxAllowedDurationSec = fastestDurationSec + 10 * 60; // 10 minutes constraint

  let bestActivityIndex = -1;
  let bestScore = -Infinity;

  enhancedRoutes.forEach((r, idx) => {
    const isWithin10Min = r.durationSeconds <= maxAllowedDurationSec;
    const score = r.nightActivityScore ?? r.safetyScore;
    if (isWithin10Min && score > bestScore) {
      bestScore = score;
      bestActivityIndex = idx;
    }
  });

  if (bestActivityIndex === -1) {
    bestActivityIndex = fastestIndex;
  }

  // Label the candidates honestly
  enhancedRoutes.forEach((r, idx) => {
    if (idx === fastestIndex && idx === bestActivityIndex) {
      r.objective = "recommended";
      r.objectiveLabel = "Recommended activity route (also fastest)";
      r.kind = "safest";
    } else if (idx === bestActivityIndex) {
      r.objective = "safety-focused";
      r.objectiveLabel = "Night activity-favoured";
      r.kind = "safest";
    } else if (idx === fastestIndex) {
      r.objective = "fastest";
      r.objectiveLabel = "Fastest";
      r.kind = "shortest";
    } else {
      r.objectiveLabel = `Alternative ${mode}`;
    }
  });

  // Sort so Recommended / Night activity-favoured is first, then Fastest, then others
  enhancedRoutes.sort((a, b) => {
    if (a.objectiveLabel?.includes("Recommended") || a.objectiveLabel?.includes("Night activity-favoured")) return -1;
    if (b.objectiveLabel?.includes("Recommended") || b.objectiveLabel?.includes("Night activity-favoured")) return 1;
    if (a.objective === "fastest") return -1;
    if (b.objective === "fastest") return 1;
    return (b.nightActivityScore ?? b.safetyScore) - (a.nightActivityScore ?? a.safetyScore);
  });

  const count = enhancedRoutes.length;
  const note = `Compared ${count} distinct ${mode} route option(s) in Pune for departure at ${departureDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}.`;

  return {
    routes: enhancedRoutes,
    note,
    allPlaces: places,
    allCameras: cameras,
  };
}
