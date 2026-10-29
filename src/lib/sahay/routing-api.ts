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
  type NavigationStep,
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

export interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    opening_hours?: string;
    extra?: {
      opening_hours?: string;
      [k: string]: any;
    };
    [k: string]: any;
  };
}

/**
 * Maps a raw Photon feature into the application's internal MappedPlace structure.
 * Supports both top-level `properties.opening_hours` and nested `properties.extra.opening_hours`.
 */
export function mapPhotonFeatureToMappedPlace(
  feature: PhotonFeature,
  category: MappedPlace["category"],
  index = 0,
  bounds?: { south: number; north: number; west: number; east: number },
): MappedPlace | null {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  if (bounds) {
    if (lat < bounds.south || lat > bounds.north || lng < bounds.west || lng > bounds.east) {
      return null;
    }
  }

  // Safe precedence: top-level opening_hours, then nested extra.opening_hours
  const rawHours =
    feature.properties?.opening_hours?.trim() ||
    feature.properties?.extra?.opening_hours?.trim() ||
    undefined;

  const osmId = feature.properties?.osm_id || Math.round(lat * 10000);
  const name =
    feature.properties?.name?.trim() ||
    feature.properties?.street?.trim() ||
    `${category.replace("_", " ")}`;

  return {
    id: `photon-${category}-${index}-${osmId}`,
    name,
    category,
    lat,
    lng,
    openingHoursRaw: rawHours,
  };
}

// Search place cache to avoid repetitive queries
const placeCache = new Map<string, PlaceHit[]>();

export async function searchPlaces(input: {
  data: { query: string };
}): Promise<PlaceHit[]> {
  const query = input.data.query.trim();
  if (query.length < 2) return [];

  const cacheKey = query.toLowerCase();
  if (placeCache.has(cacheKey)) {
    return placeCache.get(cacheKey)!;
  }

  // Photon is designed and licensed specifically for client-side search/autocomplete.
  // Public Nominatim is NOT used for client-side autocomplete in accordance with the
  // OpenStreetMap Foundation / Nominatim Acceptable Use Policy.
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=18.5204&lon=73.8567&limit=10&lang=en`;
    const payload = await fetchJson<{
      features?: PhotonFeature[];
    }>(url, {}, 4500);

    const hits = (payload.features ?? [])
      .map((feature) => {
        const [lng, lat] = feature.geometry?.coordinates ?? [];
        if (typeof lat !== "number" || typeof lng !== "number") return null;

        // Strictly enforce Pune geographic boundary
        if (!isWithinPune(lat, lng)) {
          return null;
        }

        const bits = [
          feature.properties?.name,
          feature.properties?.street,
          feature.properties?.city || "Pune",
        ].filter(Boolean);

        return {
          label: bits.join(", ") || query,
          lat,
          lng,
        } satisfies PlaceHit;
      })
      .filter((item): item is PlaceHit => item !== null);

    const distinct = Array.from(
      new Map(hits.map((h) => [`${h.lat.toFixed(4)},${h.lng.toFixed(4)}`, h])).values(),
    );

    const result = distinct.slice(0, 5);
    if (result.length > 0) {
      placeCache.set(cacheKey, result);
    }
    return result;
  } catch (err) {
    console.warn("Place search failed:", err);
    return [];
  }
}

interface OsrmStep {
  name?: string;
  distance?: number;
  duration?: number;
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

function formatManeuverInstruction(step: OsrmStep): string {
  const type = step.maneuver?.type ?? "continue";
  const modifier = step.maneuver?.modifier ?? "";
  const streetName = step.name?.trim() || "unnamed road";

  switch (type) {
    case "depart":
      return `Start on ${streetName}`;
    case "arrive":
      return `Arrive at destination`;
    case "turn":
      return `Turn ${modifier} onto ${streetName}`;
    case "end of road":
      return `At end of road, turn ${modifier} onto ${streetName}`;
    case "fork":
      return `Take the ${modifier} fork onto ${streetName}`;
    case "roundabout":
      return `Enter roundabout, exit onto ${streetName}`;
    case "new name":
      return `Continue onto ${streetName}`;
    case "merge":
      return `Merge ${modifier} onto ${streetName}`;
    case "continue":
      return modifier ? `Continue ${modifier} on ${streetName}` : `Continue on ${streetName}`;
    default:
      return modifier ? `${modifier} onto ${streetName}` : `Continue on ${streetName}`;
  }
}

function extractNavigationSteps(route: OsrmRoute): NavigationStep[] {
  const steps: NavigationStep[] = [];
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const type = step.maneuver?.type ?? "continue";
      // Skip arrive step with 0 distance
      if (type === "arrive" && (step.distance ?? 0) < 1) {
        steps.push({
          instruction: "Arrive at destination",
          streetName: step.name?.trim() || "",
          distanceMeters: 0,
          durationSeconds: 0,
          type,
          modifier: step.maneuver?.modifier,
        });
        continue;
      }
      steps.push({
        instruction: formatManeuverInstruction(step),
        streetName: step.name?.trim() || "",
        distanceMeters: step.distance ?? 0,
        durationSeconds: step.duration ?? 0,
        type,
        modifier: step.maneuver?.modifier,
      });
    }
  }
  return steps;
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

  const directUrl = `${host}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true&alternatives=3`;

  let providerResponded = false;
  let providerError: Error | null = null;

  try {
    const payload = await fetchJson<{ code?: string; routes?: OsrmRoute[] }>(
      directUrl,
      {},
      12000,
    );
    providerResponded = true;

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
          navigationSteps: extractNavigationSteps(route),
        });
      });
    }
  } catch (err) {
    providerError = err instanceof Error ? err : new Error(String(err));
    console.warn("Direct OSRM route fetch failed:", err);
  }

  // If the direct router request threw a network/transport error, rethrow so callers distinguish network failure from 0 routes
  if (!providerResponded && providerError) {
    throw new Error(describeRouteFailure("network"));
  }

  // Waypoint diversion for alternative arterial corridors if fewer than 3 unique routes found
  const initialUnique = deduplicateRoutes(candidates);
  const straightDist = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  if (initialUnique.length < 3 && straightDist > 250) {
    const dLat = to.lat - from.lat;
    const dLng = to.lng - from.lng;

    // Normal unit perpendicular vector to direct path
    const pathLen = Math.sqrt(dLat * dLat + dLng * dLng);
    const uLat = -dLng / (pathLen || 1);
    const uLng = dLat / (pathLen || 1);

    // Lateral offset distance in degrees (~250m to 700m depending on journey length)
    const offset = Math.min(0.0065, Math.max(0.0025, (straightDist / 6371000) * 0.5));

    // Try multiple strategic waypoint positions (midpoint left/right, 1/3 and 2/3 along corridor)
    const diversions = [
      // Midpoint offsets
      {
        lat: (from.lat + to.lat) / 2 + uLat * offset,
        lng: (from.lng + to.lng) / 2 + uLng * offset,
      },
      {
        lat: (from.lat + to.lat) / 2 - uLat * offset,
        lng: (from.lng + to.lng) / 2 - uLng * offset,
      },
      // 1/3 point left offset
      {
        lat: from.lat + dLat * 0.33 + uLat * (offset * 0.8),
        lng: from.lng + dLng * 0.33 + uLng * (offset * 0.8),
      },
      // 2/3 point right offset
      {
        lat: from.lat + dLat * 0.67 - uLat * (offset * 0.8),
        lng: from.lng + dLng * 0.67 - uLng * (offset * 0.8),
      },
    ];

    for (let i = 0; i < diversions.length; i++) {
      // Check if we already have 3 unique routes
      if (deduplicateRoutes(candidates).length >= 3) break;

      const wp = diversions[i]!;
      // Bounds check: diversion waypoint must be within Pune bounds
      if (!isWithinPune(wp.lat, wp.lng)) continue;

      const viaPath = `${from.lng},${from.lat};${wp.lng.toFixed(5)},${wp.lat.toFixed(5)};${to.lng},${to.lat}`;
      const viaUrl = `${host}/route/v1/driving/${viaPath}?overview=full&geometries=geojson&steps=true`;

      try {
        const viaRes = await fetchJson<{ code?: string; routes?: OsrmRoute[] }>(
          viaUrl,
          {},
          8000,
        );
        if (viaRes.code === "Ok" && viaRes.routes?.[0]?.geometry?.coordinates) {
          const r = viaRes.routes[0];
          // Reasonable detour threshold (at most 2.2x straight distance)
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
              navigationSteps: extractNavigationSteps(r),
            });
          }
        }
      } catch {
        // Diversion route unreachable; continue to next waypoint
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
 * Uses Photon for client-safe POI searches by category with geographic bounds,
 * and Overpass for surveillance camera telemetry.
 */
export interface CategorizedPlacesResult {
  places: MappedPlace[];
  cameras: MappedPlace[];
  camerasAvailable: boolean;
  providerStatus: "success" | "partial" | "failed";
  providerMessage?: string;
}

// POI Corridor Cache to avoid redundant requests across same journey bounds (10-minute TTL)
interface CacheEntry {
  data: CategorizedPlacesResult;
  timestamp: number;
}
const poiCorridorCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function loadPuneCategorizedPlaces(
  geometries: Array<[number, number][]>,
): Promise<CategorizedPlacesResult> {
  const allPoints = geometries.flat();
  if (allPoints.length < 2) {
    return { places: [], cameras: [], camerasAvailable: false, providerStatus: "success" };
  }

  const lats = allPoints.map((p) => p[0]);
  const lngs = allPoints.map((p) => p[1]);
  const south = Math.max(PUNE_BOUNDS.minLat, Math.min(...lats) - 0.015);
  const north = Math.min(PUNE_BOUNDS.maxLat, Math.max(...lats) + 0.015);
  const west = Math.max(PUNE_BOUNDS.minLng, Math.min(...lngs) - 0.015);
  const east = Math.min(PUNE_BOUNDS.maxLng, Math.max(...lngs) + 0.015);

  const corridorKey = `${south.toFixed(3)},${north.toFixed(3)},${west.toFixed(3)},${east.toFixed(3)}`;
  const cached = poiCorridorCache.get(corridorKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;
  const bounds = { south, north, west, east };

  const fetchedPlaces: MappedPlace[] = [];

  // Strategy:
  // Query POIs through Photon (permissible for OSM POI querying and autocomplete) across categories.
  // Photon supports osm_tag filtering, coordinates biasing, and returns extra tags including opening_hours.
  const photonCategories = [
    { cat: "police" as const, query: "police", osmTag: "amenity:police" },
    { cat: "hospital" as const, query: "hospital", osmTag: "amenity:hospital" },
    { cat: "pharmacy_medical" as const, query: "pharmacy", osmTag: "amenity:pharmacy" },
    { cat: "shop_food" as const, query: "restaurant", osmTag: "amenity:restaurant" },
    { cat: "shop_food" as const, query: "cafe", osmTag: "amenity:cafe" },
    { cat: "shop_food" as const, query: "supermarket", osmTag: "shop" },
    { cat: "fuel_cng" as const, query: "fuel", osmTag: "amenity:fuel" },
    { cat: "transport" as const, query: "bus_stop", osmTag: "highway:bus_stop" },
  ];

  let successCount = 0;
  let failCount = 0;

  await Promise.allSettled(
    photonCategories.map(async (cq, idx) => {
      try {
        const bboxParam = `&bbox=${west.toFixed(4)},${south.toFixed(4)},${east.toFixed(4)},${north.toFixed(4)}`;
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(cq.query)}&lat=${centerLat}&lon=${centerLng}${bboxParam}&limit=15&osm_tag=${encodeURIComponent(cq.osmTag)}`;
        const payload = await fetchJson<{
          features?: PhotonFeature[];
        }>(url, {}, 4500);

        successCount += 1;
        for (const f of payload.features ?? []) {
          const place = mapPhotonFeatureToMappedPlace(f, cq.cat, idx, bounds);
          if (place) {
            fetchedPlaces.push(place);
          }
        }
      } catch {
        failCount += 1;
      }
    }),
  );

  const deduplicated = deduplicatePlaces(fetchedPlaces);

  // Determine provider outcome honestly
  let providerStatus: "success" | "partial" | "failed" = "success";
  let providerMessage: string | undefined;

  if (failCount === photonCategories.length) {
    providerStatus = "failed";
    providerMessage = "POI map service was unreachable for this corridor.";
  } else if (failCount > 0) {
    providerStatus = "partial";
    providerMessage = `Partial POI response: ${successCount}/${photonCategories.length} categories responded.`;
  }

  // Check Overpass for live surveillance cameras with timeout
  let cameras: MappedPlace[] = [];
  let camerasAvailable = false;

  const overpassQuery = `[out:json][timeout:5];node["man_made"="surveillance"](${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)});out body 25;`;
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
    }, 4500);

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
    // Overpass unavailable or rate-limited; cameras marked unavailable
    camerasAvailable = false;
  }

  const result: CategorizedPlacesResult = {
    places: deduplicated,
    cameras,
    camerasAvailable,
    providerStatus,
    providerMessage,
  };

  // Only cache if not a total provider failure (do not cache total outages)
  if (providerStatus !== "failed") {
    poiCorridorCache.set(corridorKey, { data: result, timestamp: Date.now() });
  }

  return result;
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

  const { places, cameras, camerasAvailable, providerMessage } = await loadPuneCategorizedPlaces(
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
    // 1. Evaluate places along this specific route (120m corridor for accurate street-level matching)
    const placesAlong = evaluatePlacesAlongRoute(
      places,
      route.geometry,
      route.distanceMeters,
      route.durationSeconds,
      departureDate,
      120, // 120m corridor
    );

    // 2. Evaluate cameras along this route (100m corridor)
    const camerasAlong = evaluatePlacesAlongRoute(
      cameras,
      route.geometry,
      route.distanceMeters,
      route.durationSeconds,
      departureDate,
      100, // 100m corridor
    );

    // 3. Gap analysis & distribution
    const rawMatch = rawCandidates.find((c) => c.id === route.id);
    const turns = rawMatch?.meaningfulTurnsCount ?? 3;
    const mainRoadRatio = route.breakdown?.majorCorridorRatio ?? 0.2;

    const gapAnalysis = analyzeRouteDistributionAndGaps(
      route.geometry,
      route.distanceMeters,
      placesAlong,
      camerasAlong,
      turns,
      mainRoadRatio,
    );

    // 4. Authoritative Route Safety Index
    const scoring = calculateNightActivityScore(
      gapAnalysis,
      mode,
      placesAlong,
      camerasAvailable,
    );

    return {
      ...route,
      routeSafetyIndex: scoring.routeSafetyIndex,
      nightActivityScore: scoring.routeSafetyIndex, // Backward compatibility
      safetyScore: scoring.routeSafetyIndex, // Align legacy safetyScore
      dataStatus: scoring.dataStatus,
      provisionalScore: scoring.routeSafetyIndex, // Backward compatibility
      factors: scoring.factors,
      gapAnalysis,
      placesAlongRoute: placesAlong,
      camerasAlongRoute: camerasAlong,
      hasCameraData: camerasAvailable,
      navigationSteps: rawMatch?.navigationSteps,
      missingDataNotes: [
        ...(providerMessage ? [providerMessage] : []),
        ...(route.missingDataNotes ?? []),
        ...scoring.missingDataNotes,
      ],
      confidence: scoring.confidence,
    };
  });

  // 1. Identify Fastest candidate (shortest duration)
  let fastestIndex = 0;
  enhancedRoutes.forEach((r, idx) => {
    if (r.durationSeconds < enhancedRoutes[fastestIndex]!.durationSeconds) {
      fastestIndex = idx;
    }
  });

  // 2. Identify Highest Route Safety Index candidate (evaluated without duration constraint)
  let highestScoreIndex = 0;
  let highestIndexVal = -Infinity;

  enhancedRoutes.forEach((r, idx) => {
    const score = r.routeSafetyIndex ?? r.safetyScore;
    if (score > highestIndexVal) {
      highestIndexVal = score;
      highestScoreIndex = idx;
    }
  });

  // 3. Identify Recommended candidate (best safety index within 10-minute constraint of fastest)
  const fastestDurationSec = enhancedRoutes[fastestIndex]!.durationSeconds;
  const maxAllowedDurationSec = fastestDurationSec + 10 * 60; // 10 minutes constraint

  let recommendedIndex = fastestIndex;
  let bestConstrainedScore = -Infinity;

  enhancedRoutes.forEach((r, idx) => {
    const isWithin10Min = r.durationSeconds <= maxAllowedDurationSec;
    const score = r.routeSafetyIndex ?? r.safetyScore;
    if (isWithin10Min && score > bestConstrainedScore) {
      bestConstrainedScore = score;
      recommendedIndex = idx;
    }
  });

  // Mark metadata on candidates transparently
  enhancedRoutes.forEach((r, idx) => {
    r.isFastest = idx === fastestIndex;
    r.isHighestScoring = idx === highestScoreIndex;

    if (idx === fastestIndex && idx === recommendedIndex && idx === highestScoreIndex) {
      r.objective = "recommended";
      r.objectiveLabel = "Recommended route (highest safety index & fastest)";
      r.kind = "safest";
    } else if (idx === recommendedIndex && idx === fastestIndex) {
      r.objective = "recommended";
      r.objectiveLabel = "Recommended (fastest)";
      r.kind = "safest";
    } else if (idx === recommendedIndex) {
      r.objective = "recommended";
      r.objectiveLabel = "Recommended safety route";
      r.kind = "safest";
    } else if (idx === highestScoreIndex) {
      r.objective = "safety-focused";
      r.objectiveLabel = "Highest Route Safety Index";
      r.kind = "safest";
    } else if (idx === fastestIndex) {
      r.objective = "fastest";
      r.objectiveLabel = "Fastest";
      r.kind = "shortest";
    } else {
      r.objectiveLabel = `Alternative ${mode}`;
    }
  });

  // Sort so Recommended is first, then Highest Route Safety Index, then Fastest, then others
  enhancedRoutes.sort((a, b) => {
    if (a.objective === "recommended") return -1;
    if (b.objective === "recommended") return 1;
    if (a.isHighestScoring) return -1;
    if (b.isHighestScoring) return 1;
    if (a.isFastest) return -1;
    if (b.isFastest) return 1;
    return (b.routeSafetyIndex ?? b.safetyScore) - (a.routeSafetyIndex ?? a.safetyScore);
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
