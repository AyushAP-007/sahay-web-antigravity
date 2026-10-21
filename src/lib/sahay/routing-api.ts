import { createServerFn } from "@tanstack/react-start";
import {
  describeRouteFailure,
  rankRoutes,
  type OsmContext,
  type PlaceHit,
  type PlannedRoute,
} from "./routing";

const UA = "SahaySafetyCompanion/1.1 (college EDI prototype; route planning)";

async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
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

export const searchPlaces = createServerFn({ method: "POST" })
  .validator((input: { query: string }) => ({
    query: input.query.trim().slice(0, 80),
  }))
  .handler(async ({ data }): Promise<PlaceHit[]> => {
    if (data.query.length < 2) return [];
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(data.query)}&limit=5&lang=en`;
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
    return (payload.features ?? [])
      .map((feature) => {
        const [lng, lat] = feature.geometry?.coordinates ?? [];
        if (typeof lat !== "number" || typeof lng !== "number") return null;
        const bits = [
          feature.properties?.name,
          feature.properties?.street,
          feature.properties?.city,
          feature.properties?.state,
        ].filter(Boolean);
        return {
          label: bits.join(", ") || data.query,
          lat,
          lng,
        } satisfies PlaceHit;
      })
      .filter((item): item is PlaceHit => item !== null);
  });

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry?: { coordinates?: number[][] };
}

async function osrmRoutes(
  profile: "foot" | "bike",
  from: PlaceHit,
  to: PlaceHit,
): Promise<
  | { ok: true; routes: Array<Omit<PlannedRoute, "kind" | "safetyScore" | "reasons">> }
  | { ok: false; reason: "network" | "none" }
> {
  const host =
    profile === "foot"
      ? "https://routing.openstreetmap.de/routed-foot"
      : "https://routing.openstreetmap.de/routed-bike";
  const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${host}/route/v1/driving/${path}?alternatives=true&overview=full&geometries=geojson&steps=false`;
  try {
    const payload = await fetchJson<{ code?: string; routes?: OsrmRoute[] }>(
      url,
      {},
      12000,
    );
    if (payload.code !== "Ok" || !payload.routes?.length) {
      return { ok: false, reason: "none" };
    }
    return {
      ok: true,
      routes: payload.routes.slice(0, 3).map((route, index) => ({
        id: `${profile}-${index}`,
        mode: profile,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        geometry: (route.geometry?.coordinates ?? []).map(
          (pair) => [pair[1]!, pair[0]!] as [number, number],
        ),
      })),
    };
  } catch {
    return { ok: false, reason: "network" };
  }
}

async function loadOsmContext(geometry: [number, number][]): Promise<OsmContext> {
  const empty: OsmContext = { lamps: [], amenities: [], lampsKnown: false };
  if (geometry.length < 2) return empty;
  const lats = geometry.map((point) => point[0]);
  const lngs = geometry.map((point) => point[1]);
  const south = Math.min(...lats) - 0.012;
  const north = Math.max(...lats) + 0.012;
  const west = Math.min(...lngs) - 0.012;
  const east = Math.max(...lngs) + 0.012;
  if (north - south > 0.4 || east - west > 0.4) return empty;
  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;
  const tags: Array<[string, string]> = [
    ["pharmacy", "amenity:pharmacy"],
    ["hospital", "amenity:hospital"],
    ["police", "amenity:police"],
  ];
  const lists = await Promise.all(
    tags.map(async ([kind, tag]) => {
      try {
        const url = `https://photon.komoot.io/api/?q=${kind}&lat=${centerLat}&lon=${centerLng}&limit=15&osm_tag=${encodeURIComponent(tag)}`;
        const payload = await fetchJson<{
          features?: Array<{
            geometry?: { coordinates?: number[] };
            properties?: { osm_value?: string };
          }>;
        }>(url, {}, 8000);
        return (payload.features ?? [])
          .map((feature) => {
            const [lng, lat] = feature.geometry?.coordinates ?? [];
            if (typeof lat !== "number" || typeof lng !== "number") return null;
            if (lat < south || lat > north || lng < west || lng > east) return null;
            return { lat, lng, kind } as const;
          })
          .filter((item): item is { lat: number; lng: number; kind: string } => item !== null);
      } catch {
        return [];
      }
    }),
  );
  return { lamps: [], amenities: lists.flat(), lampsKnown: false };
}

export const planSafeRoutes = createServerFn({ method: "POST" })
  .validator((input: { from: PlaceHit; to: PlaceHit; hour: number }) => input)
  .handler(
    async ({
      data,
    }): Promise<{ routes: PlannedRoute[]; note: string }> => {
      const foot = await osrmRoutes("foot", data.from, data.to);
      if (!foot.ok) {
        throw new Error(describeRouteFailure(foot.reason));
      }
      const merged = foot.routes.filter((route) => route.geometry.length >= 2);
      if (merged.length === 0) {
        throw new Error(describeRouteFailure("none"));
      }
      const osm = await loadOsmContext(merged[0]!.geometry);
      const ranked = rankRoutes(merged, osm, data.hour);
      const note = ranked.similar
        ? "These walks score almost the same on nearby mapped police, hospitals, and pharmacies, so the shorter one is listed first. The number is a distance-and-amenity heuristic, not proof that a walk is safe, and it is not crime data."
        : "Ordered by a heuristic: how close each walk stays to mapped police, hospitals, and pharmacies, then by extra distance. The score is not proof of safety and not a crime dataset.";
      return { routes: ranked.routes, note };
    },
  );
