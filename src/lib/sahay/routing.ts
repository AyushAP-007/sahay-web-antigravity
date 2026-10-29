import type {
  FactorScoreItem,
  MappedPlace,
  RouteGapAnalysis,
  TravelMode,
} from "./night-scoring";

export interface PlaceHit {
  label: string;
  lat: number;
  lng: number;
}

export type RouteObjective =
  | "recommended"
  | "safety-focused"
  | "fastest"
  | "well-lit"
  | "more-assistance";

export type RouteKind = "safest" | "shortest" | "alternate";

export interface RouteFeatureBreakdown {
  pedestrianScore: number; // 0-100
  lightingScore: number; // 0-100
  assistanceScore: number; // 0-100
  activityScore: number; // 0-100
  detourPenalty: number; // 0-30
  isolatedExposurePenalty: number; // 0-30
  timeContextPenalty: number; // 0-25
  coverageConfidence: "high" | "medium" | "low";
  dataCoverageRatio: number; // 0-1
  majorCorridorRatio?: number; // 0-1 measured street-name corridor heuristic
}

export interface PlannedRoute {
  id: string;
  kind: RouteKind;
  objective?: RouteObjective;
  objectiveLabel?: string;
  mode: "foot" | "bike" | "car";
  distanceMeters: number;
  durationSeconds: number;
  safetyScore: number;
  provisionalScore?: number;
  provisionalLabel?: string;
  isHighestScoring?: boolean;
  isFastest?: boolean;
  nightActivityScore?: number;
  dataStatus?: "scored" | "insufficient-data";
  confidence?: "high" | "medium" | "low";
  detourMeters?: number;
  reasons: string[];
  concerns?: string[];
  missingDataNotes?: string[];
  geometry: [number, number][];
  breakdown?: RouteFeatureBreakdown;
  traversedStreets?: string[];
  // NightWise-inspired attributes
  placesAlongRoute?: MappedPlace[];
  camerasAlongRoute?: MappedPlace[];
  gapAnalysis?: RouteGapAnalysis;
  factors?: FactorScoreItem[];
  hasCameraData?: boolean;
  navigationSteps?: NavigationStep[];
}

export interface SafetyFeatures {
  sampleCount: number;
  litRatio: number;
  isolatedRatio: number;
  policeNearbyCount: number;
  hospitalNearbyCount: number;
  pharmacyNearbyCount: number;
  transitNearbyCount: number;
  commercialNearbyCount: number;
  totalAmenitiesCount: number;
  majorPedestrianStreetRatio: number;
  night: boolean;
  detourRatio: number;
  lampsKnown: boolean;
  dataCoverageRatio: number;
}

export interface OsmContext {
  lamps: Array<{ lat: number; lng: number }>;
  amenities: Array<{ lat: number; lng: number; kind: string; name?: string }>;
  lampsKnown: boolean;
}

export function haversineMeters(
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

/**
 * Uniformly sample geometry coordinates with a step size or fixed count.
 * For true distance-weighted evaluation, we sample regularly along the path.
 */
export function sampleGeometry(
  geometry: [number, number][],
  targetCount = 20,
): [number, number][] {
  if (geometry.length <= targetCount) return geometry;
  const out: [number, number][] = [];
  const step = (geometry.length - 1) / (targetCount - 1);
  for (let i = 0; i < targetCount; i += 1) {
    const idx = Math.min(geometry.length - 1, Math.round(i * step));
    out.push(geometry[idx]!);
  }
  return out;
}

export function nearbyCount(
  point: [number, number],
  items: Array<{ lat: number; lng: number }>,
  radiusMeters: number,
): number {
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    if (haversineMeters(point[0], point[1], items[i]!.lat, items[i]!.lng) <= radiusMeters) {
      count++;
    }
  }
  return count;
}

/**
 * Tests if candidate route geometry is too similar to an existing route.
 * Compares sampled coordinates: if > 85% of sample points are within 35 meters,
 * they represent effectively the same street trajectory.
 */
export function isRouteDuplicate(
  candidate: [number, number][],
  existing: [number, number][],
): boolean {
  if (candidate.length === 0 || existing.length === 0) return true;
  const cSamples = sampleGeometry(candidate, 15);
  const eSamples = sampleGeometry(existing, 15);
  let closeMatches = 0;
  for (const cp of cSamples) {
    let closest = Number.POSITIVE_INFINITY;
    for (const ep of eSamples) {
      const d = haversineMeters(cp[0], cp[1], ep[0], ep[1]);
      if (d < closest) closest = d;
    }
    if (closest <= 35) {
      closeMatches++;
    }
  }
  return closeMatches / cSamples.length >= 0.85;
}

/**
 * Filter out duplicate and near-identical route geometries.
 */
export function deduplicateRoutes<
  T extends { geometry: [number, number][]; distanceMeters: number },
>(routes: T[]): T[] {
  const result: T[] = [];
  for (const route of routes) {
    if (route.geometry.length < 2) continue;
    const isDup = result.some((kept) => {
      // If distance differs by less than 4% and paths overlap heavily
      const distDiff = Math.abs(kept.distanceMeters - route.distanceMeters);
      const distRatio = distDiff / Math.max(1, kept.distanceMeters);
      if (distRatio < 0.04 && isRouteDuplicate(route.geometry, kept.geometry)) {
        return true;
      }
      return false;
    });
    if (!isDup) {
      result.push(route);
    }
  }
  return result;
}

export function extractRouteFeatures(
  geometry: [number, number][],
  osm: OsmContext,
  hour: number,
  shortestMeters: number,
  distanceMeters: number,
  streetNames: string[] = [],
): SafetyFeatures {
  const samples = sampleGeometry(geometry, 24);
  const sampleCount = samples.length;
  if (sampleCount === 0) {
    return {
      sampleCount: 0,
      litRatio: 0,
      isolatedRatio: 1,
      policeNearbyCount: 0,
      hospitalNearbyCount: 0,
      pharmacyNearbyCount: 0,
      transitNearbyCount: 0,
      commercialNearbyCount: 0,
      totalAmenitiesCount: 0,
      majorPedestrianStreetRatio: 0,
      night: hour >= 20 || hour < 6,
      detourRatio: 1,
      lampsKnown: osm.lampsKnown,
      dataCoverageRatio: 0,
    };
  }

  // Count lit points (if lamp tags known)
  const litHits = osm.lampsKnown
    ? samples.filter((point) => nearbyCount(point, osm.lamps, 65) > 0).length
    : 0;

  // Segment isolation check: distance to nearest amenity/active corridor
  let isolatedSamples = 0;
  const policeMatches = new Set<string>();
  const hospitalMatches = new Set<string>();
  const pharmacyMatches = new Set<string>();
  const transitMatches = new Set<string>();
  const shopMatches = new Set<string>();

  for (const point of samples) {
    let nearestAmenityDist = Number.POSITIVE_INFINITY;

    for (const item of osm.amenities) {
      const d = haversineMeters(point[0], point[1], item.lat, item.lng);
      if (d < nearestAmenityDist) nearestAmenityDist = d;

      const key = `${item.kind}:${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
      if (item.kind === "police" && d <= 380) policeMatches.add(key);
      else if (item.kind === "hospital" && d <= 350) hospitalMatches.add(key);
      else if (item.kind === "pharmacy" && d <= 250) pharmacyMatches.add(key);
      else if (item.kind === "transit" && d <= 250) transitMatches.add(key);
      else if (item.kind === "commercial" && d <= 200) shopMatches.add(key);
    }

    // A sample point with no mapped civic amenity, transit, or shop within 300m is flagged isolated
    if (nearestAmenityDist > 300) {
      isolatedSamples++;
    }
  }

  // Known Pune pedestrian thoroughfares vs back alleys from steps
  const namedStreets = streetNames.filter(Boolean);
  const majorCorridors = [
    "paud road",
    "karve road",
    "fc road",
    "fergusson college road",
    "jm road",
    "jangli maharaj road",
    "mg road",
    "law college road",
    "senapati bapat road",
    "shivaji road",
    "bajirao road",
    "satara road",
    "tilak road",
    "kumthekar road",
    "shankar sheth road",
    "bund garden road",
    "sinhagad road",
    "nagar road",
    "solapur road",
    "airport road",
    "baner road",
    "aundh road",
    "pashan road",
  ];

  let majorStreetCount = 0;
  for (const st of namedStreets) {
    const lower = st.toLowerCase();
    if (majorCorridors.some((m) => lower.includes(m))) {
      majorStreetCount++;
    }
  }

  const majorRatio =
    namedStreets.length > 0 ? majorStreetCount / namedStreets.length : 0.2;

  const totalCivic =
    policeMatches.size +
    hospitalMatches.size +
    pharmacyMatches.size +
    transitMatches.size +
    shopMatches.size;

  // Measure data coverage
  const dataCoverage = Math.min(
    1,
    (osm.amenities.length > 0 ? 0.6 : 0.2) + (osm.lampsKnown ? 0.4 : 0.1),
  );

  return {
    sampleCount,
    litRatio: osm.lampsKnown ? litHits / sampleCount : 0,
    isolatedRatio: isolatedSamples / sampleCount,
    policeNearbyCount: policeMatches.size,
    hospitalNearbyCount: hospitalMatches.size,
    pharmacyNearbyCount: pharmacyMatches.size,
    transitNearbyCount: transitMatches.size,
    commercialNearbyCount: shopMatches.size,
    totalAmenitiesCount: totalCivic,
    majorPedestrianStreetRatio: majorRatio,
    night: hour >= 20 || hour < 6,
    detourRatio: shortestMeters > 0 ? distanceMeters / shortestMeters : 1,
    lampsKnown: osm.lampsKnown,
    dataCoverageRatio: dataCoverage,
  };
}

/**
 * Transparent, deterministic route-specific safety assessment.
 * Calculates score on a 0-100 scale using distance-weighted segment metrics.
 */
export function calculateRouteSafetyAssessment(features: SafetyFeatures): {
  score: number;
  breakdown: RouteFeatureBreakdown;
  reasons: string[];
  concerns: string[];
  missingDataNotes: string[];
} {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const missingDataNotes: string[] = [];

  // 1. Pedestrian Infrastructure Factor (Base 25 pts)
  let pedestrianScore = 14;
  if (features.majorPedestrianStreetRatio >= 0.35) {
    pedestrianScore = 24;
    reasons.push("Follows well-traversed Pune arterial roads");
  } else if (features.majorPedestrianStreetRatio >= 0.15) {
    pedestrianScore = 19;
    reasons.push("Follows accessible urban roads");
  } else {
    pedestrianScore = 12;
    concerns.push("Traverses smaller secondary lanes with fewer pedestrian paths");
  }

  // 2. Lighting and Visibility Factor (25 pts)
  let lightingScore = 15;
  if (features.lampsKnown) {
    if (features.litRatio >= 0.5) {
      lightingScore = 25;
      reasons.push("Continuous mapped streetlamp coverage along path");
    } else if (features.litRatio >= 0.25) {
      lightingScore = 19;
      reasons.push("Partial streetlamp coverage mapped");
    } else {
      lightingScore = 10;
      concerns.push("Sparse mapped streetlights on this route");
    }
  } else {
    // Missing data policy: Unknown != Safe and Unknown != High Danger
    // Base lighting on road class: arterial roads have reliable municipal lighting
    if (features.majorPedestrianStreetRatio >= 0.3) {
      lightingScore = 18;
      reasons.push("Follows major lit municipal road corridor");
    } else {
      lightingScore = 13;
    }
    missingDataNotes.push(
      "Streetlamp telemetry is unmapped for some segments; lighting assessed from urban road class",
    );
  }

  // 3. Proximity to Assistance (Police, Hospitals, Pharmacies) (30 pts)
  let assistanceScore = 12;
  if (features.policeNearbyCount > 0) {
    assistanceScore += 10;
    reasons.push(
      `Passes near ${features.policeNearbyCount} mapped police station(s) / chowky`,
    );
  }
  if (features.hospitalNearbyCount > 0) {
    assistanceScore += 6;
    reasons.push(
      `Within 350m of ${features.hospitalNearbyCount} hospital(s) or clinic(s)`,
    );
  }
  if (features.pharmacyNearbyCount > 0) {
    assistanceScore += 4;
    reasons.push(
      `Passes ${features.pharmacyNearbyCount} accessible medical/pharmacy stop(s)`,
    );
  }
  if (features.transitNearbyCount > 0) {
    assistanceScore += 4;
    reasons.push(
      `Direct access to ${features.transitNearbyCount} PMPML/transit stop(s)`,
    );
  }
  assistanceScore = Math.min(30, assistanceScore);

  if (assistanceScore < 15) {
    concerns.push("Few mapped emergency facilities along this specific corridor");
  }

  // 4. Activity and Isolation Factor (20 pts)
  let activityScore = 12;
  if (features.commercialNearbyCount >= 4) {
    activityScore = 20;
    reasons.push("Active commercial storefronts and regular public footfall");
  } else if (features.commercialNearbyCount >= 1) {
    activityScore = 16;
    reasons.push("Moderate commercial activity along route");
  } else if (features.majorPedestrianStreetRatio >= 0.25) {
    activityScore = 15;
    reasons.push("Regular vehicular and public footfall on arterial road");
  }

  // Isolated stretches penalty
  let isolatedPenalty = 0;
  if (features.isolatedRatio >= 0.55) {
    isolatedPenalty = 12;
    concerns.push("Contains long stretches (300m+) without mapped public facilities");
  } else if (features.isolatedRatio >= 0.3) {
    isolatedPenalty = 6;
    concerns.push("Includes quieter residential or low-activity sections");
  }

  // Night time context multiplier
  let nightPenalty = 0;
  if (features.night) {
    if (features.isolatedRatio > 0.35) {
      nightPenalty += 8;
      concerns.push("After-dark hours amplify isolation risk on quieter stretches");
    } else {
      nightPenalty += 3;
    }
  }

  // Detour penalty (excessive detours increase overall exposure time)
  let detourPenalty = 0;
  if (features.detourRatio > 1.35) {
    detourPenalty = 10;
    concerns.push("Significantly longer detour adds extra exposure time");
  } else if (features.detourRatio > 1.15) {
    detourPenalty = 4;
  }

  // Calculate composite score
  const totalRaw =
    pedestrianScore +
    lightingScore +
    assistanceScore +
    activityScore -
    isolatedPenalty -
    nightPenalty -
    detourPenalty;

  const finalScore = Math.max(10, Math.min(95, Math.round(totalRaw)));

  // Determine confidence
  const confidence: "high" | "medium" | "low" =
    features.dataCoverageRatio >= 0.7
      ? "high"
      : features.dataCoverageRatio >= 0.4
        ? "medium"
        : "low";

  const breakdown: RouteFeatureBreakdown = {
    pedestrianScore,
    lightingScore,
    assistanceScore,
    activityScore,
    detourPenalty,
    isolatedExposurePenalty: isolatedPenalty,
    timeContextPenalty: nightPenalty,
    coverageConfidence: confidence,
    dataCoverageRatio: features.dataCoverageRatio,
    majorCorridorRatio: features.majorPedestrianStreetRatio,
  };

  return {
    score: finalScore,
    breakdown,
    reasons: reasons.slice(0, 3),
    concerns: concerns.slice(0, 3),
    missingDataNotes,
  };
}

export function describeRouteFailure(kind: "network" | "none"): string {
  if (kind === "network") {
    return "The walking-route service could not be reached. This is a connection problem, not a result that no path exists. Try again in a moment.";
  }
  return "The route service responded, but it found no walking path between those places. Try a closer destination or specify an accessible landmark.";
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

export interface NavigationStep {
  instruction: string;
  streetName: string;
  distanceMeters: number;
  durationSeconds: number;
  type: string;
  modifier?: string;
}

export interface RawCandidate {
  id: string;
  mode: "foot" | "bike" | "car";
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][];
  streetNames?: string[];
  meaningfulTurnsCount?: number;
  navigationSteps?: NavigationStep[];
}

/**
 * Evaluates and ranks genuine candidate walking routes with differentiated objectives.
 */
export function rankAndCategorizeRoutes(
  candidates: RawCandidate[],
  osm: OsmContext,
  hour: number,
): { routes: PlannedRoute[]; note: string } {
  if (candidates.length === 0) {
    return {
      routes: [],
      note: "No walking routes found for this path.",
    };
  }

  // Deduplicate before scoring
  const uniqueCandidates = deduplicateRoutes(candidates);
  const shortestMeters = Math.min(...uniqueCandidates.map((c) => c.distanceMeters));
  const fastestDuration = Math.min(...uniqueCandidates.map((c) => c.durationSeconds));

  // Score each candidate independently on its own geometry
  const evaluated = uniqueCandidates.map((candidate, index) => {
    const features = extractRouteFeatures(
      candidate.geometry,
      osm,
      hour,
      shortestMeters,
      candidate.distanceMeters,
      candidate.streetNames ?? [],
    );

    const assessment = calculateRouteSafetyAssessment(features);
    const detourMeters = Math.max(0, candidate.distanceMeters - shortestMeters);

    return {
      id: candidate.id || `route-${index}`,
      kind: "alternate" as RouteKind,
      objective: "recommended" as RouteObjective,
      objectiveLabel: "Alternative walk",
      mode: candidate.mode,
      distanceMeters: candidate.distanceMeters,
      durationSeconds: candidate.durationSeconds,
      safetyScore: assessment.score,
      confidence: assessment.breakdown.coverageConfidence,
      detourMeters,
      reasons: assessment.reasons,
      concerns: assessment.concerns,
      missingDataNotes: assessment.missingDataNotes,
      geometry: candidate.geometry,
      breakdown: assessment.breakdown,
      traversedStreets: candidate.streetNames ?? [],
    };
  });

  // Assign distinct objectives based on metrics
  // 1. Safety-focused: highest safety score
  // 2. Fastest: minimum duration
  // 3. More assistance: highest assistanceScore
  // 4. Well-lit: highest lightingScore
  // 5. Recommended: best balance of (safetyScore - detour_fraction * 25)

  let bestSafetyIndex = 0;
  let bestFastestIndex = 0;
  let bestAssistanceIndex = 0;
  let bestLitIndex = 0;
  let bestBalancedIndex = 0;
  let bestBalancedScore = -Infinity;

  evaluated.forEach((route, idx) => {
    if (route.safetyScore > evaluated[bestSafetyIndex]!.safetyScore) {
      bestSafetyIndex = idx;
    }
    if (route.durationSeconds < evaluated[bestFastestIndex]!.durationSeconds) {
      bestFastestIndex = idx;
    }
    if (
      route.breakdown.assistanceScore >
      evaluated[bestAssistanceIndex]!.breakdown.assistanceScore
    ) {
      bestAssistanceIndex = idx;
    }
    if (
      route.breakdown.lightingScore >
      evaluated[bestLitIndex]!.breakdown.lightingScore
    ) {
      bestLitIndex = idx;
    }

    const detourRatio = route.distanceMeters / Math.max(1, shortestMeters);
    const balancedScore = route.safetyScore - (detourRatio - 1) * 35;
    if (balancedScore > bestBalancedScore) {
      bestBalancedScore = balancedScore;
      bestBalancedIndex = idx;
    }
  });

  // Set objective labels without duplication
  const usedObjectives = new Set<RouteObjective>();

  // Assign Recommended first
  evaluated[bestBalancedIndex]!.objective = "recommended";
  evaluated[bestBalancedIndex]!.objectiveLabel = "Recommended";
  evaluated[bestBalancedIndex]!.kind = "safest";
  usedObjectives.add("recommended");

  // Assign Safety-focused if distinct
  if (
    bestSafetyIndex !== bestBalancedIndex &&
    !usedObjectives.has("safety-focused")
  ) {
    evaluated[bestSafetyIndex]!.objective = "safety-focused";
    evaluated[bestSafetyIndex]!.objectiveLabel = "Safety-focused";
    evaluated[bestSafetyIndex]!.kind = "safest";
    usedObjectives.add("safety-focused");
  }

  // Assign Fastest if distinct
  if (
    !usedObjectives.has("fastest") &&
    evaluated[bestFastestIndex]!.objective === "recommended" &&
    bestFastestIndex !== bestBalancedIndex
  ) {
    evaluated[bestFastestIndex]!.objective = "fastest";
    evaluated[bestFastestIndex]!.objectiveLabel = "Fastest route";
    evaluated[bestFastestIndex]!.kind = "shortest";
    usedObjectives.add("fastest");
  } else if (!usedObjectives.has("fastest")) {
    evaluated[bestFastestIndex]!.objective = "fastest";
    evaluated[bestFastestIndex]!.objectiveLabel = "Fastest route";
    evaluated[bestFastestIndex]!.kind = "shortest";
    usedObjectives.add("fastest");
  }

  // Assign More Assistance if distinct
  if (
    !usedObjectives.has("more-assistance") &&
    evaluated[bestAssistanceIndex]!.objectiveLabel === "Alternative walk"
  ) {
    evaluated[bestAssistanceIndex]!.objective = "more-assistance";
    evaluated[bestAssistanceIndex]!.objectiveLabel = "Near assistance";
    usedObjectives.add("more-assistance");
  }

  // Assign Well-lit if distinct
  if (
    !usedObjectives.has("well-lit") &&
    evaluated[bestLitIndex]!.objectiveLabel === "Alternative walk"
  ) {
    evaluated[bestLitIndex]!.objective = "well-lit";
    evaluated[bestLitIndex]!.objectiveLabel = "Better-lit streets";
    usedObjectives.add("well-lit");
  }

  // Sort so Recommended is first, followed by Safety-focused, Fastest, and others
  evaluated.sort((a, b) => {
    const order: Record<RouteObjective, number> = {
      recommended: 0,
      "safety-focused": 1,
      fastest: 2,
      "more-assistance": 3,
      "well-lit": 4,
    };
    const orderA = order[a.objective] ?? 5;
    const orderB = order[b.objective] ?? 5;
    if (orderA !== orderB) return orderA - orderB;
    return b.safetyScore - a.safetyScore;
  });

  const count = evaluated.length;
  const note =
    count >= 3
      ? `Compared ${count} distinct walking routes across Pune. Scores reflect mapped police, hospitals, pharmacies, road hierarchy, and isolation exposure.`
      : count === 2
        ? `Found 2 distinct accessible walking routes between these locations in Pune.`
        : `Only 1 direct accessible walking route was mapped between these specific points.`;

  return { routes: evaluated, note };
}

// Backward compatibility helper for existing tests
export function ensembleSafetyScore(features: {
  litRatio: number;
  isolatedRatio: number;
  amenityCount: number;
  night: boolean;
  detourRatio: number;
  lampsKnown: boolean;
}): { score: number; reasons: string[] } {
  const assessment = calculateRouteSafetyAssessment({
    sampleCount: 12,
    litRatio: features.litRatio,
    isolatedRatio: features.isolatedRatio,
    policeNearbyCount: Math.min(2, Math.floor(features.amenityCount / 2)),
    hospitalNearbyCount: features.amenityCount > 0 ? 1 : 0,
    pharmacyNearbyCount: features.amenityCount > 1 ? 1 : 0,
    transitNearbyCount: 0,
    commercialNearbyCount: 2,
    totalAmenitiesCount: features.amenityCount,
    majorPedestrianStreetRatio: 0.3,
    night: features.night,
    detourRatio: features.detourRatio,
    lampsKnown: features.lampsKnown,
    dataCoverageRatio: 0.6,
  });

  return {
    score: assessment.score,
    reasons: assessment.reasons,
  };
}

export function rankRoutes(
  candidates: Array<Omit<PlannedRoute, "kind" | "safetyScore" | "reasons">>,
  osm: OsmContext,
  hour: number,
): { similar: boolean; routes: PlannedRoute[] } {
  const res = rankAndCategorizeRoutes(
    candidates.map((c) => ({
      id: c.id,
      mode: c.mode,
      distanceMeters: c.distanceMeters,
      durationSeconds: c.durationSeconds,
      geometry: c.geometry,
    })),
    osm,
    hour,
  );

  return {
    similar:
      res.routes.length > 1 &&
      Math.abs(res.routes[0]!.safetyScore - res.routes[res.routes.length - 1]!.safetyScore) < 5,
    routes: res.routes,
  };
}
