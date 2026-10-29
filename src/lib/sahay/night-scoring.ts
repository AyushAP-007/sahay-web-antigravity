import opening_hours from "opening_hours";
import { haversineMeters } from "./routing.ts";

export type TravelMode = "foot" | "bike" | "car";

export type PlaceCategory =
  | "shop_food"
  | "pharmacy_medical"
  | "hospital"
  | "police"
  | "fuel_cng"
  | "transport"
  | "surveillance_camera";

export type OpeningStatus = "open" | "closed" | "unknown";

export interface MappedPlace {
  id: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  openingHoursRaw?: string;
  weeklySchedule?: string[];
  distanceAlongRouteMeters?: number;
  distanceFromRouteMeters?: number;
  estimatedPassingMinute?: number;
  estimatedPassingTimeIso?: string;
  openingStatus?: OpeningStatus;
}

export interface RouteGapAnalysis {
  longestLowActivityGapMeters: number;
  longestNoHelpPointGapMeters: number;
  totalOpenPlaces: number;
  totalOpenCommercial: number;
  totalOpenHelpPoints: number;
  totalPlacesFound: number;
  helpPointTypesPresent: string[];
  distributionScore: number; // 0 to 1
  cameraCount: number;
  cameraDistributionScore: number; // 0 to 1
  meaningfulTurnsCount: number;
  mainRoadTraversedRatio: number; // 0 to 1
}

export interface FactorScoreItem {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  description: string;
  evidence: string;
}

export interface ModeWeights {
  openActivityPlaces: number;
  openHelpPoints: number;
  mainRoadCoverage: number;
  openTransport: number;
  fewerGaps: number;
  fewerTurns: number;
  cameraCoverage: number;
}

export const MODE_WEIGHTS: Record<TravelMode, ModeWeights> = {
  car: {
    openActivityPlaces: 25,
    openHelpPoints: 15,
    mainRoadCoverage: 15,
    openTransport: 10,
    fewerGaps: 15,
    fewerTurns: 10,
    cameraCoverage: 10,
  },
  foot: {
    openActivityPlaces: 25,
    openHelpPoints: 25,
    mainRoadCoverage: 0,
    openTransport: 10,
    fewerGaps: 25,
    fewerTurns: 10,
    cameraCoverage: 5,
  },
  bike: {
    openActivityPlaces: 25,
    openHelpPoints: 20,
    mainRoadCoverage: 10, // moderate main road/arterial access
    openTransport: 10,
    fewerGaps: 20,
    fewerTurns: 10,
    cameraCoverage: 5,
  },
};

/**
 * Convert a UTC Date to an equivalent Date whose local-time methods
 * reflect IST (Asia/Kolkata, UTC+5:30). Required because the
 * opening_hours library calls Date#getDay() / #getHours() which use
 * the runtime system's local timezone, not IST.
 */
export function toIstLocalDate(date: Date): Date {
  const istString = date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  return new Date(istString);
}

// Backward compatibility alias for Route Safety Index
export const calculateRouteSafetyIndex = calculateNightActivityScore;
export function checkOpeningHoursStatus(
  openingHoursStr: string | undefined,
  targetDate: Date,
  lat = 18.5204,
  lon = 73.8567,
): { status: OpeningStatus; weeklySchedule?: string[]; exceptionNote?: string } {
  if (!openingHoursStr || !openingHoursStr.trim()) {
    return { status: "unknown" };
  }

  const raw = openingHoursStr.trim();
  if (raw === "24/7") {
    return {
      status: "open",
      weeklySchedule: ["Open 24 hours every day"],
    };
  }

  try {
    const oh = new (opening_hours as any)(raw, {
      lat,
      lon,
      address: { country_code: "in" },
    });
    const istTargetDate = toIstLocalDate(targetDate);
    // Check if the library marks this time/date as explicitly unknown
    if (typeof oh.getUnknown === "function" && oh.getUnknown(istTargetDate)) {
      return {
        status: "unknown",
        exceptionNote: "Opening hours are explicitly unknown or variable at this time.",
      };
    }

    const isOpen = oh.getState(istTargetDate);
    const comment = oh.getComment(istTargetDate);

    // Try to extract readable schedule if available
    let weekly: string[] | undefined;
    try {
      const pretty = oh.prettifyValue();
      if (pretty) {
        weekly = pretty.split(";").map((s: string) => s.trim()).filter(Boolean);
      }
    } catch {
      // ignore prettify failure
    }

    return {
      status: isOpen ? "open" : "closed",
      weeklySchedule: weekly,
      exceptionNote: comment || undefined,
    };
  } catch {
    // If syntax unsupported or unparseable, classify as unknown
    return { status: "unknown" };
  }
}

/**
 * Projects a point onto a polyline to calculate cumulative distance along route and offset distance.
 */
export function projectPointOntoRoute(
  point: [number, number],
  geometry: [number, number][],
): { distanceAlongRoute: number; distanceFromRoute: number } {
  if (geometry.length === 0) {
    return { distanceAlongRoute: 0, distanceFromRoute: 0 };
  }
  if (geometry.length === 1) {
    const d = haversineMeters(point[0], point[1], geometry[0]![0], geometry[0]![1]);
    return { distanceAlongRoute: 0, distanceFromRoute: d };
  }

  let minDistance = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  let cumulativeDist = 0;

  for (let i = 0; i < geometry.length - 1; i++) {
    const p1 = geometry[i]!;
    const p2 = geometry[i + 1]!;
    const segLen = haversineMeters(p1[0], p1[1], p2[0], p2[1]);

    // Segment projection calculation (flat earth approximation for small distances)
    const dLat = p2[0] - p1[0];
    const dLng = p2[1] - p1[1];
    const segMagSq = dLat * dLat + dLng * dLng;

    let t = 0;
    if (segMagSq > 1e-12) {
      t = ((point[0] - p1[0]) * dLat + (point[1] - p1[1]) * dLng) / segMagSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projLat = p1[0] + t * dLat;
    const projLng = p1[1] + t * dLng;
    const distToSeg = haversineMeters(point[0], point[1], projLat, projLng);

    if (distToSeg < minDistance) {
      minDistance = distToSeg;
      bestAlong = cumulativeDist + t * segLen;
    }

    cumulativeDist += segLen;
  }

  return {
    distanceAlongRoute: Math.round(bestAlong),
    distanceFromRoute: Math.round(minDistance),
  };
}

/**
 * Maps place category to UI color and icon metadata.
 */
export function getCategoryMetadata(category: PlaceCategory): {
  label: string;
  color: string;
  isHelpPoint: boolean;
} {
  switch (category) {
    case "shop_food":
      return { label: "Shops & food", color: "#eab308", isHelpPoint: false }; // yellow
    case "pharmacy_medical":
      return { label: "Pharmacies & clinics", color: "#ec4899", isHelpPoint: true }; // pink
    case "hospital":
      return { label: "Hospitals", color: "#2563eb", isHelpPoint: true }; // blue
    case "police":
      return { label: "Police stations", color: "#0284c7", isHelpPoint: true }; // ocean blue
    case "fuel_cng":
      return { label: "Petrol & CNG pumps", color: "#16a34a", isHelpPoint: false }; // green
    case "transport":
      return { label: "Transport locations", color: "#9333ea", isHelpPoint: false }; // purple
    case "surveillance_camera":
      return { label: "Mapped camera", color: "#475569", isHelpPoint: false }; // slate
  }
}

/**
 * Deduplicate mapped places by distance threshold (within 25m) and name/category.
 */
export function deduplicatePlaces(places: MappedPlace[], thresholdMeters = 25): MappedPlace[] {
  const result: MappedPlace[] = [];
  for (const place of places) {
    const isDup = result.some((existing) => {
      const dist = haversineMeters(existing.lat, existing.lng, place.lat, place.lng);
      if (dist < thresholdMeters) {
        if (existing.category === place.category) return true;
        if (existing.name && place.name && existing.name.toLowerCase() === place.name.toLowerCase()) return true;
      }
      return false;
    });
    if (!isDup) {
      result.push(place);
    }
  }
  return result;
}

/**
 * Calculates time-aware passing information for places along a candidate route.
 */
export function evaluatePlacesAlongRoute(
  places: MappedPlace[],
  geometry: [number, number][],
  totalDistanceMeters: number,
  totalDurationSeconds: number,
  departureTime: Date,
  maxCorridorMeters = 70,
): MappedPlace[] {
  if (geometry.length < 2 || totalDistanceMeters <= 0) return [];

  const evaluated: MappedPlace[] = [];

  for (const p of places) {
    const proj = projectPointOntoRoute([p.lat, p.lng], geometry);
    if (proj.distanceFromRoute <= maxCorridorMeters) {
      const fraction = Math.min(1, Math.max(0, proj.distanceAlongRoute / totalDistanceMeters));
      const passingSeconds = Math.round(fraction * totalDurationSeconds);
      const passingMinute = Math.round(passingSeconds / 60);
      const passingTime = new Date(departureTime.getTime() + passingSeconds * 1000);

      const ohResult = checkOpeningHoursStatus(p.openingHoursRaw, passingTime, p.lat, p.lng);

      evaluated.push({
        ...p,
        distanceAlongRouteMeters: proj.distanceAlongRoute,
        distanceFromRouteMeters: proj.distanceFromRoute,
        estimatedPassingMinute: passingMinute,
        estimatedPassingTimeIso: passingTime.toISOString(),
        openingStatus: ohResult.status,
        weeklySchedule: ohResult.weeklySchedule,
      });
    }
  }

  // Sort by order of appearance along the route
  evaluated.sort((a, b) => (a.distanceAlongRouteMeters ?? 0) - (b.distanceAlongRouteMeters ?? 0));
  return evaluated;
}

/**
 * Evaluates route distribution, gap analysis, turn counts, and camera distribution.
 */
export function analyzeRouteDistributionAndGaps(
  geometry: [number, number][],
  totalDistanceMeters: number,
  placesAlongRoute: MappedPlace[],
  camerasAlongRoute: MappedPlace[],
  meaningfulTurnsCount: number,
  mainRoadRatio: number,
): RouteGapAnalysis {
  // Filter confirmed open places
  const openPlaces = placesAlongRoute.filter((p) => p.openingStatus === "open");
  const openCommercial = openPlaces.filter((p) => p.category === "shop_food");
  const openHelpPoints = openPlaces.filter((p) => {
    const meta = getCategoryMetadata(p.category);
    return meta.isHelpPoint;
  });

  const helpTypes = Array.from(new Set(openHelpPoints.map((p) => getCategoryMetadata(p.category).label)));

  // Calculate gaps for all open places
  const placePositions = [0, ...openPlaces.map((p) => p.distanceAlongRouteMeters ?? 0), totalDistanceMeters].sort((a, b) => a - b);
  let maxActivityGap = 0;
  for (let i = 0; i < placePositions.length - 1; i++) {
    const gap = placePositions[i + 1]! - placePositions[i]!;
    if (gap > maxActivityGap) maxActivityGap = gap;
  }

  // Calculate gaps for open help points
  const helpPositions = [0, ...openHelpPoints.map((p) => p.distanceAlongRouteMeters ?? 0), totalDistanceMeters].sort((a, b) => a - b);
  let maxHelpGap = 0;
  for (let i = 0; i < helpPositions.length - 1; i++) {
    const gap = helpPositions[i + 1]! - helpPositions[i]!;
    if (gap > maxHelpGap) maxHelpGap = gap;
  }

  // Distribution score: divide route into 5 equal segments, reward open place presence across segments
  const numSegments = 5;
  const segLength = totalDistanceMeters / numSegments;
  let populatedSegments = 0;

  if (segLength > 0 && openPlaces.length > 0) {
    for (let s = 0; s < numSegments; s++) {
      const segStart = s * segLength;
      const segEnd = (s + 1) * segLength;
      const count = openPlaces.filter((p) => {
        const d = p.distanceAlongRouteMeters ?? 0;
        return d >= segStart && d < segEnd;
      }).length;
      if (count > 0) populatedSegments++;
    }
  }

  const distributionScore = openPlaces.length === 0 ? 0 : populatedSegments / numSegments;

  // Camera distribution in ~500m sections
  const camera500mSections = Math.max(1, Math.ceil(totalDistanceMeters / 500));
  let populatedCameraSections = 0;
  for (let s = 0; s < camera500mSections; s++) {
    const sStart = s * 500;
    const sEnd = (s + 1) * 500;
    const hasCam = camerasAlongRoute.some((c) => {
      const d = c.distanceAlongRouteMeters ?? 0;
      return d >= sStart && d < sEnd;
    });
    if (hasCam) populatedCameraSections++;
  }
  const cameraDistributionScore = camerasAlongRoute.length === 0 ? 0 : populatedCameraSections / camera500mSections;

  return {
    longestLowActivityGapMeters: Math.round(maxActivityGap),
    longestNoHelpPointGapMeters: Math.round(maxHelpGap),
    totalOpenPlaces: openPlaces.length,
    totalOpenCommercial: openCommercial.length,
    totalOpenHelpPoints: openHelpPoints.length,
    totalPlacesFound: placesAlongRoute.length,
    helpPointTypesPresent: helpTypes,
    distributionScore,
    cameraCount: camerasAlongRoute.length,
    cameraDistributionScore,
    meaningfulTurnsCount,
    mainRoadTraversedRatio: Math.min(1, Math.max(0, mainRoadRatio)),
  };
}

/**
 * Calculates transparent, mode-specific Night Activity Score (0-100) and factor breakdowns.
 * Normalizes available factor weights so missing sources (like cameras) do not unfairly distort comparisons.
 */
export function calculateNightActivityScore(
  analysis: RouteGapAnalysis,
  mode: TravelMode,
  placesAlongRoute: MappedPlace[],
  hasCameraData: boolean,
): {
  routeSafetyIndex: number;
  nightActivityScore: number;
  factors: FactorScoreItem[];
  confidence: "high" | "medium" | "low";
  missingDataNotes: string[];
  dataStatus: "scored" | "insufficient-data";
  provisionalScore: number;
} {
  const baseWeights = MODE_WEIGHTS[mode];
  const factors: FactorScoreItem[] = [];
  const missingDataNotes: string[] = [];

  // Exclude unavailable factors and normalize remaining weights to sum to 100
  const totalBaseWeight = 100;
  const unavailableWeight = !hasCameraData ? baseWeights.cameraCoverage : 0;
  const availableWeight = totalBaseWeight - unavailableWeight;
  const normFactor = availableWeight > 0 ? totalBaseWeight / availableWeight : 1;

  const weights = {
    openActivityPlaces: Math.round(baseWeights.openActivityPlaces * normFactor),
    openHelpPoints: Math.round(baseWeights.openHelpPoints * normFactor),
    mainRoadCoverage: Math.round(baseWeights.mainRoadCoverage * normFactor),
    openTransport: Math.round(baseWeights.openTransport * normFactor),
    fewerGaps: Math.round(baseWeights.fewerGaps * normFactor),
    fewerTurns: Math.round(baseWeights.fewerTurns * normFactor),
    cameraCoverage: hasCameraData ? baseWeights.cameraCoverage : 0,
  };

  // Adjust one factor to ensure sum is exactly 100
  const currentSum =
    weights.openActivityPlaces +
    weights.openHelpPoints +
    weights.mainRoadCoverage +
    weights.openTransport +
    weights.fewerGaps +
    weights.fewerTurns +
    weights.cameraCoverage;
  if (currentSum !== 100) {
    weights.openActivityPlaces += 100 - currentSum;
  }

  // 1. Open Activity Places (Commercial venues: shops, food, dining)
  const commercialCount = analysis.totalOpenCommercial;
  const activityScoreRatio = Math.min(1, commercialCount / 5);
  const activityScore = Math.round(activityScoreRatio * weights.openActivityPlaces);
  factors.push({
    id: "activity_places",
    name: "Open Commercial Places",
    score: activityScore,
    maxScore: weights.openActivityPlaces,
    description: "Mapped shops, eateries, and commercial venues listed open at your passing time.",
    evidence: `${commercialCount} open commercial venue${commercialCount === 1 ? "" : "s"} listed along the corridor.`,
  });

  // 2. Open Help Points
  const helpRatio = Math.min(1, analysis.totalOpenHelpPoints / 2);
  const helpScore = Math.round(helpRatio * weights.openHelpPoints);
  factors.push({
    id: "help_points",
    name: "Open Help Points",
    score: helpScore,
    maxScore: weights.openHelpPoints,
    description: "Hospitals, active clinics, and 24/7 pharmacies open along this route.",
    evidence:
      analysis.totalOpenHelpPoints > 0
        ? `${analysis.totalOpenHelpPoints} open help point(s) (${analysis.helpPointTypesPresent.join(", ")}).`
        : "No confirmed open help points mapped along this corridor.",
  });

  // 3. Main Road Coverage
  const mainRoadScore = Math.round(analysis.mainRoadTraversedRatio * weights.mainRoadCoverage);
  factors.push({
    id: "main_road",
    name: "Main-Road Prominence",
    score: mainRoadScore,
    maxScore: weights.mainRoadCoverage,
    description: "Proportion of route traversing primary/secondary arterial corridors (proxy for prominence, infrastructure, and passive observation).",
    evidence: `${Math.round(analysis.mainRoadTraversedRatio * 100)}% on mapped primary/arterial roads (heuristic match).`,
  });

  // 4. Open Transport Locations
  const transportOpen = placesAlongRoute.filter(
    (p) => p.category === "transport" && p.openingStatus === "open",
  ).length;
  const transportScoreRatio = Math.min(1, transportOpen / 2);
  const transportScore = Math.round(transportScoreRatio * weights.openTransport);
  factors.push({
    id: "transport",
    name: "Open Transport Hubs",
    score: transportScore,
    maxScore: weights.openTransport,
    description: "Mapped bus stops, railway stations, or transit locations open at passing time.",
    evidence: `${transportOpen} open transport location(s) along route.`,
  });

  // 5. Fewer Gaps (Distribution)
  const gapScore = Math.round(analysis.distributionScore * weights.fewerGaps);
  factors.push({
    id: "gaps",
    name: "Even Activity Distribution",
    score: gapScore,
    maxScore: weights.fewerGaps,
    description: "Even distribution of open places with fewer dark or unpopulated stretches.",
    evidence:
      analysis.totalPlacesFound > 0
        ? `Longest stretch without open activity: ${analysis.longestLowActivityGapMeters}m. ${Math.round(analysis.distributionScore * 100)}% segments populated.`
        : "No route-associated POIs mapped; gap distribution cannot be verified from POI telemetry.",
  });

  // 6. Fewer Turns
  const turnRatio = Math.max(0, 1 - Math.max(0, analysis.meaningfulTurnsCount - 4) / 8);
  const turnScore = Math.round(turnRatio * weights.fewerTurns);
  factors.push({
    id: "turns",
    name: "Route Directness & Turns",
    score: turnScore,
    maxScore: weights.fewerTurns,
    description: "Fewer complex turns simplify orientation and reduce isolated corner exposure.",
    evidence: `${analysis.meaningfulTurnsCount} navigation turn(s).`,
  });

  // 7. Mapped Camera Coverage
  if (!hasCameraData) {
    missingDataNotes.push("Surveillance camera data unavailable from OpenStreetMap for this corridor (weights normalized).");
    factors.push({
      id: "cameras",
      name: "Camera Coverage",
      score: 0,
      maxScore: 0,
      description: "Surveillance camera coverage mapped in OpenStreetMap.",
      evidence: "Camera data unavailable from provider (excluded from comparison).",
    });
  } else {
    const camRatio = Math.min(1, (analysis.cameraCount / 4) * 0.5 + analysis.cameraDistributionScore * 0.5);
    const cameraScore = Math.round(camRatio * weights.cameraCoverage);
    factors.push({
      id: "cameras",
      name: "Camera Coverage",
      score: cameraScore,
      maxScore: weights.cameraCoverage,
      description: "OSM mapped surveillance cameras (presence does not guarantee live monitoring).",
      evidence: `${analysis.cameraCount} mapped camera(s) across corridor.`,
    });
  }

  // Calculate sum of factor scores
  const totalScore = factors.reduce((acc, f) => acc + f.score, 0);
  const routeSafetyIndex = Math.max(0, Math.min(100, totalScore));

  // Count place data states
  const totalPlaces = placesAlongRoute.length;
  const openCount = placesAlongRoute.filter((p) => p.openingStatus === "open").length;
  const closedCount = placesAlongRoute.filter((p) => p.openingStatus === "closed").length;
  const unknownCount = placesAlongRoute.filter((p) => p.openingStatus === "unknown").length;

  const confirmedPlaces = openCount + closedCount;
  const hasUsableEvidence =
    openCount >= 1 ||
    analysis.totalOpenCommercial >= 1 ||
    analysis.totalOpenHelpPoints >= 1 ||
    (hasCameraData && analysis.cameraCount >= 1) ||
    confirmedPlaces >= 2 ||
    totalPlaces >= 4;

  const dataStatus: "scored" | "insufficient-data" = hasUsableEvidence ? "scored" : "insufficient-data";

  // For backward compatibility: legacy nightActivityScore was 0 on insufficient-data
  const legacyNightScore = hasUsableEvidence ? Math.max(5, Math.min(98, totalScore)) : 0;

  if (dataStatus === "insufficient-data") {
    missingDataNotes.unshift(
      totalPlaces > 0
        ? `Found ${totalPlaces} nearby place(s), but none have verified opening schedules or usable safety telemetry. Route Safety Index relies on available infrastructure parameters.`
        : "Insufficient mapped POI evidence along this route corridor; Route Safety Index relies on available road infrastructure parameters.",
    );
  } else if (unknownCount > 0) {
    missingDataNotes.push(`${unknownCount} nearby place(s) had unlisted or unparseable opening hours.`);
  }

  const confidence: "high" | "medium" | "low" =
    !hasUsableEvidence
      ? "low"
      : hasCameraData && unknownCount <= 2 && (confirmedPlaces >= 3 || totalPlaces >= 6)
        ? "high"
        : unknownCount > 5 || !hasCameraData || confirmedPlaces < 2
          ? "low"
          : "medium";

  if (hasCameraData) {
    if (analysis.cameraCount === 0) {
      missingDataNotes.push("Zero surveillance cameras mapped in OpenStreetMap along this route; actual street coverage may be unmapped.");
    } else {
      missingDataNotes.push("Mapped cameras indicate OSM records only; live recording, maintenance, or monitoring is not guaranteed.");
    }
  }

  return {
    routeSafetyIndex,
    nightActivityScore: legacyNightScore, // Backward compatibility for legacy tests
    factors,
    confidence,
    missingDataNotes,
    dataStatus,
    provisionalScore: routeSafetyIndex, // Backward compatibility
  };
}
