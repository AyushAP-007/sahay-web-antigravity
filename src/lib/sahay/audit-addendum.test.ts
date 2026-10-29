import assert from "node:assert/strict";
import test from "node:test";
import {
  checkOpeningHoursStatus,
  calculateNightActivityScore,
  analyzeRouteDistributionAndGaps,
  type MappedPlace,
} from "./night-scoring.ts";
import {
  isWithinPune,
  mapPhotonFeatureToMappedPlace,
  type PhotonFeature,
} from "./routing-api.ts";
import { describeRouteFailure } from "./routing.ts";

test("Audit P0: Nominatim policy compliance & boundary checks", () => {
  // Test boundary rejection
  assert.equal(isWithinPune(18.5204, 73.8567), true, "Central Pune should be within bounds");
  assert.equal(isWithinPune(19.0760, 72.8777), false, "Mumbai must be outside Pune bounds");
  assert.equal(isWithinPune(18.20, 73.85), false, "South of Pune bounds must be rejected");
  assert.equal(isWithinPune(18.52, 74.20), false, "East of Pune bounds must be rejected");
});

test("Audit P0: Distinguish network failure from no path found", () => {
  const netError = describeRouteFailure("network");
  const noneError = describeRouteFailure("none");
  assert.notEqual(netError, noneError);
  assert.ok(netError.includes("connection problem"));
  assert.ok(noneError.includes("no walking path"));
});

test("Audit P0: Do not invent opening hours and treat unknown as unknown", () => {
  const testDate = new Date("2026-10-26T21:00:00+05:30");
  
  // Empty schedule must stay unknown
  assert.equal(checkOpeningHoursStatus(undefined, testDate).status, "unknown");
  assert.equal(checkOpeningHoursStatus("", testDate).status, "unknown");

  // Unknown state schedule
  const unparseable = checkOpeningHoursStatus("variable seasonal hours", testDate);
  assert.equal(unparseable.status, "unknown");
});

test("Audit P1: Commercial activity places scored separately from help points & transit", () => {
  const geom: [number, number][] = [[18.51, 73.85], [18.52, 73.86]];
  const placesWithOnlyHospital: MappedPlace[] = [
    { id: "h1", name: "Sahyadri Hospital", category: "hospital", lat: 18.515, lng: 73.855, openingStatus: "open", distanceAlongRouteMeters: 500 },
  ];

  const analysis = analyzeRouteDistributionAndGaps(geom, 1000, placesWithOnlyHospital, [], 2, 0.4);
  assert.equal(analysis.totalOpenCommercial, 0, "Hospital should NOT count as commercial venue");
  assert.equal(analysis.totalOpenHelpPoints, 1, "Hospital MUST count as help point");

  const scoreResult = calculateNightActivityScore(analysis, "foot", placesWithOnlyHospital, true);
  const commFactor = scoreResult.factors.find((f) => f.id === "activity_places")!;
  const helpFactor = scoreResult.factors.find((f) => f.id === "help_points")!;

  assert.equal(commFactor.score, 0, "Commercial places score must be 0 when only a hospital is present");
  assert.ok(helpFactor.score > 0, "Help points score must be > 0 when hospital is present");
  assert.ok(commFactor.evidence.includes("0 open commercial"));
});

test("Audit P1: Zero camera mapping adds explicit unmapped note, not proof of absent cameras", () => {
  const geom: [number, number][] = [[18.51, 73.85], [18.52, 73.86]];
  const analysis = analyzeRouteDistributionAndGaps(geom, 1000, [], [], 2, 0.4);

  // Successfully returned from provider, but 0 cameras found
  const scoreResult = calculateNightActivityScore(analysis, "foot", [], true);
  assert.ok(
    scoreResult.missingDataNotes.some((n) => n.includes("Zero surveillance cameras mapped")),
    "Should explain that 0 mapped cameras means OSM data is unmapped, not proof of complete absence in reality",
  );
});

test("Audit Phase 2: IST timezone consistency regardless of system timezone offset", () => {
  // 9:00 AM IST = 03:30 UTC
  const istNineAMUtc = new Date("2024-01-15T03:30:00.000Z");
  const resultOpen = checkOpeningHoursStatus("Mo-Fr 09:00-18:00", istNineAMUtc);
  assert.equal(resultOpen.status, "open", "9:00 AM IST on Monday should be open for 09:00-18:00 schedule");

  // 12:00 Midnight IST = 18:30 UTC on previous day
  const istMidnightUtc = new Date("2024-01-14T18:30:00.000Z");
  const resultClosed = checkOpeningHoursStatus("Mo-Fr 09:00-18:00", istMidnightUtc);
  assert.equal(resultClosed.status, "closed", "Midnight IST should be closed for 09:00-18:00 schedule");
});

test("Audit Phase 2: Honest insufficient-data state instead of arbitrary 5/100 score floor", () => {
  const emptyAnalysis = analyzeRouteDistributionAndGaps(
    [[18.51, 73.85], [18.52, 73.86]],
    2000,
    [],
    [],
    3,
    0.3,
  );
  const result = calculateNightActivityScore(emptyAnalysis, "foot", [], false);
  assert.equal(result.dataStatus, "insufficient-data", "Empty route corridor should be flagged insufficient-data");
  assert.equal(result.nightActivityScore, 0, "Empty corridor should have score 0, not arbitrary 5/100 floor");
  assert.ok(
    result.missingDataNotes.some((n) => n.includes("Insufficient mapped POI evidence")),
    "Must explain that score is not reliable due to insufficient evidence",
  );
});

test("Audit Phase 2: Routes with genuine evidence receive score >= 5 and scored status", () => {
  const mockPlaces: MappedPlace[] = [
    {
      id: "p1",
      name: "Sancheti Hospital",
      category: "hospital",
      lat: 18.525,
      lng: 73.855,
      openingStatus: "open",
      distanceAlongRouteMeters: 400,
    },
  ];
  const analysis = analyzeRouteDistributionAndGaps(
    [[18.52, 73.85], [18.53, 73.86]],
    1500,
    mockPlaces,
    [],
    2,
    0.5,
  );
  const result = calculateNightActivityScore(analysis, "foot", mockPlaces, false);
  assert.equal(result.dataStatus, "scored");
  assert.ok(result.nightActivityScore >= 5, "Genuine evidence should yield score >= 5");
});

test("Audit Phase 2: Photon response mapping supports properties.extra.opening_hours", () => {
  const rawPhotonFeature: PhotonFeature = {
    geometry: { coordinates: [73.8567, 18.5204] },
    properties: {
      name: "Modern Cafe",
      osm_id: 998877,
      osm_key: "amenity",
      osm_value: "cafe",
      extra: {
        opening_hours: "Mo-Su 08:00-23:00",
      },
    },
  };

  // Call the actual production mapper function
  const place = mapPhotonFeatureToMappedPlace(rawPhotonFeature, "shop_food", 1);
  assert.ok(place !== null, "Production mapper must successfully create a MappedPlace");
  assert.equal(place.id, "photon-shop_food-1-998877");
  assert.equal(place.name, "Modern Cafe");
  assert.equal(place.openingHoursRaw, "Mo-Su 08:00-23:00");
  assert.equal(place.lat, 18.5204);
  assert.equal(place.lng, 73.8567);

  const parsed = checkOpeningHoursStatus(place.openingHoursRaw, new Date("2024-01-15T06:30:00.000Z")); // 12:00 PM IST
  assert.equal(parsed.status, "open");
});

test("Audit Phase 3: Route with places that only have unknown hours receives insufficient-data status", () => {
  const geom: [number, number][] = [
    [18.52, 73.85],
    [18.53, 73.86],
  ];
  // Places exist, but have NO confirmed opening hours (only unknown/unlisted)
  const placesWithUnknownHours: MappedPlace[] = [
    {
      id: "u1",
      name: "Unverified Shop 1",
      category: "shop_food",
      lat: 18.522,
      lng: 73.852,
      openingStatus: "unknown",
      distanceAlongRouteMeters: 300,
    },
    {
      id: "u2",
      name: "Unverified Shop 2",
      category: "shop_food",
      lat: 18.527,
      lng: 73.857,
      openingStatus: "unknown",
      distanceAlongRouteMeters: 800,
    },
  ];

  const analysis = analyzeRouteDistributionAndGaps(geom, 1500, placesWithUnknownHours, [], 3, 0.2);
  const result = calculateNightActivityScore(analysis, "foot", placesWithUnknownHours, false);

  assert.equal(result.dataStatus, "insufficient-data", "Places with only unknown hours must NOT produce a scored status");
  assert.equal(result.nightActivityScore, 0, "Score must be 0 when no usable confirmed telemetry exists");
  assert.ok(
    result.missingDataNotes.some((n) => n.includes("none have verified opening schedules")),
    "Missing data notes must clearly state that schedules are unverified",
  );
});

test("Audit Phase 3: Three distinct candidate routes evaluated independently with different evidence", () => {
  // Route A: Corridor with confirmed-open hospital and open cafe
  const geomA: [number, number][] = [
    [18.52, 73.84],
    [18.53, 73.85],
    [18.54, 73.86],
  ];
  const placesA: MappedPlace[] = [
    { id: "h1", name: "Apex Hospital", category: "hospital", lat: 18.525, lng: 73.845, openingStatus: "open", distanceAlongRouteMeters: 500 },
    { id: "c1", name: "24/7 Chai Cafe", category: "shop_food", lat: 18.535, lng: 73.855, openingStatus: "open", distanceAlongRouteMeters: 1200 },
  ];

  // Route B: Substantially different corridor with zero mapped facilities
  const geomB: [number, number][] = [
    [18.51, 73.82],
    [18.515, 73.83],
    [18.52, 73.84],
  ];
  const placesB: MappedPlace[] = [];

  // Route C: High-turn complex corridor with only closed shops
  const geomC: [number, number][] = [
    [18.50, 73.85],
    [18.505, 73.855],
    [18.51, 73.86],
  ];
  const placesC: MappedPlace[] = [
    { id: "s1", name: "Day Market Store", category: "shop_food", lat: 18.505, lng: 73.855, openingStatus: "closed", distanceAlongRouteMeters: 600 },
  ];

  const analysisA = analyzeRouteDistributionAndGaps(geomA, 2500, placesA, [], 2, 0.6);
  const analysisB = analyzeRouteDistributionAndGaps(geomB, 2500, placesB, [], 1, 0.1);
  const analysisC = analyzeRouteDistributionAndGaps(geomC, 2500, placesC, [], 8, 0.3);

  const scoreA = calculateNightActivityScore(analysisA, "foot", placesA, false);
  const scoreB = calculateNightActivityScore(analysisB, "foot", placesB, false);
  const scoreC = calculateNightActivityScore(analysisC, "foot", placesC, false);

  // Route A must have a high score
  assert.equal(scoreA.dataStatus, "scored");
  assert.ok(scoreA.nightActivityScore >= 20, "Route A with hospital and cafe must have strong score");

  // Route B has no facilities -> insufficient data
  assert.equal(scoreB.dataStatus, "insufficient-data");
  assert.equal(scoreB.nightActivityScore, 0);

  // Route C has confirmed closed places -> with only 1 closed shop, evidence threshold is NOT met
  assert.equal(scoreC.dataStatus, "insufficient-data", "Single closed shop with no other evidence must be insufficient-data");
  assert.equal(scoreC.nightActivityScore, 0);

  // Ensure factors and scores reflect genuine evidence
  assert.notEqual(scoreA.nightActivityScore, scoreB.nightActivityScore);
  assert.notEqual(scoreA.nightActivityScore, scoreC.nightActivityScore);
});

test("Audit Phase 4: Single closed venue with no other evidence produces insufficient-data status", () => {
  const geom: [number, number][] = [[18.52, 73.85], [18.53, 73.86]];
  const singleClosedPlace: MappedPlace[] = [
    {
      id: "c1",
      name: "Day Closed Bakery",
      category: "shop_food",
      lat: 18.525,
      lng: 73.855,
      openingStatus: "closed",
      distanceAlongRouteMeters: 400,
    },
  ];

  const analysis = analyzeRouteDistributionAndGaps(geom, 1500, singleClosedPlace, [], 3, 0.4);
  const result = calculateNightActivityScore(analysis, "foot", singleClosedPlace, false);

  assert.equal(result.dataStatus, "insufficient-data", "Single closed place is inadequate to assess night route activity");
  assert.equal(result.nightActivityScore, 0);
});

test("Audit Phase 4: Corridor with at least two confirmed places (e.g. 2 closed) meets usable threshold", () => {
  const geom: [number, number][] = [[18.52, 73.85], [18.53, 73.86]];
  const twoClosedPlaces: MappedPlace[] = [
    { id: "c1", name: "Closed Bakery", category: "shop_food", lat: 18.522, lng: 73.852, openingStatus: "closed", distanceAlongRouteMeters: 300 },
    { id: "c2", name: "Closed Stationery", category: "shop_food", lat: 18.527, lng: 73.857, openingStatus: "closed", distanceAlongRouteMeters: 900 },
  ];

  const analysis = analyzeRouteDistributionAndGaps(geom, 1500, twoClosedPlaces, [], 3, 0.4);
  const result = calculateNightActivityScore(analysis, "foot", twoClosedPlaces, false);

  assert.equal(result.dataStatus, "scored", "Two confirmed places establish sufficient evidence to score corridor");
  assert.ok(result.nightActivityScore >= 5, "Score should be floored to 5 when scored");
});

test("Audit Phase 3: Legitimately equal routes produce equal scores deterministically", () => {
  const geom: [number, number][] = [
    [18.52, 73.85],
    [18.53, 73.86],
  ];
  const places: MappedPlace[] = [
    { id: "p1", name: "Clinic A", category: "pharmacy_medical", lat: 18.525, lng: 73.855, openingStatus: "open", distanceAlongRouteMeters: 500 },
  ];

  const analysis1 = analyzeRouteDistributionAndGaps(geom, 1500, places, [], 3, 0.4);
  const analysis2 = analyzeRouteDistributionAndGaps(geom, 1500, places, [], 3, 0.4);

  const score1 = calculateNightActivityScore(analysis1, "foot", places, false);
  const score2 = calculateNightActivityScore(analysis2, "foot", places, false);

  assert.equal(score1.nightActivityScore, score2.nightActivityScore);
  assert.deepEqual(score1.factors, score2.factors);
});

test("Audit Phase 5: Map marker deduplication combines global inventory with route places", () => {
  const globalPlaces: MappedPlace[] = [
    { id: "p1", name: "Cafe One", category: "shop_food", lat: 18.521, lng: 73.856, openingStatus: "unknown" },
    { id: "p2", name: "Hospital Two", category: "hospital", lat: 18.528, lng: 73.861, openingStatus: "unknown" },
  ];
  const routePlaces: MappedPlace[] = [
    { id: "p1", name: "Cafe One", category: "shop_food", lat: 18.521, lng: 73.856, openingStatus: "open", estimatedPassingMinute: 6 },
  ];

  const placeMap = new Map<string, MappedPlace>();
  for (const p of globalPlaces) {
    const key = p.id || `${p.category}-${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    placeMap.set(key, p);
  }
  for (const rp of routePlaces) {
    const key = rp.id || `${rp.category}-${rp.lat.toFixed(5)},${rp.lng.toFixed(5)}`;
    placeMap.set(key, rp);
  }

  const combined = Array.from(placeMap.values());
  assert.equal(combined.length, 2, "Should preserve all 2 distinct locations");
  const p1 = combined.find((p) => p.id === "p1")!;
  assert.equal(p1.openingStatus, "open", "Route-evaluated status (open) must override unknown");
  assert.equal(p1.estimatedPassingMinute, 6, "Passing minute must be preserved");
});

test("Audit Phase 5: Provisional comparison score generated when POI data is insufficient", () => {
  const emptyAnalysis = {
    longestLowActivityGapMeters: 2000,
    longestNoHelpPointGapMeters: 2000,
    totalOpenPlaces: 0,
    totalOpenCommercial: 0,
    totalOpenHelpPoints: 0,
    totalPlacesFound: 0,
    helpPointTypesPresent: [],
    distributionScore: 0,
    cameraCount: 0,
    cameraDistributionScore: 0,
    meaningfulTurnsCount: 2,
    mainRoadTraversedRatio: 0.6,
  };

  const scoreResult = calculateNightActivityScore(emptyAnalysis, "foot", [], false);
  assert.equal(scoreResult.dataStatus, "insufficient-data");
  assert.equal(scoreResult.nightActivityScore, 0);
  assert.ok(scoreResult.provisionalScore > 0, "Provisional score must be calculated from route-derived features");
  assert.ok(scoreResult.provisionalScore <= 100);
});

test("Audit Phase 5: Highest-scoring candidate identified independently of fastest candidate", () => {
  const routeFastest = {
    id: "r-fast",
    durationSeconds: 900,
    distanceMeters: 1200,
    nightActivityScore: 45,
    dataStatus: "scored" as const,
  };
  const routeSafeAndSlow = {
    id: "r-safe",
    durationSeconds: 1800, // 15 mins slower, outside 10-min constraint
    distanceMeters: 2200,
    nightActivityScore: 82,
    dataStatus: "scored" as const,
  };

  const routes = [routeFastest, routeSafeAndSlow];
  let fastestIndex = 0;
  routes.forEach((r, idx) => {
    if (r.durationSeconds < routes[fastestIndex]!.durationSeconds) fastestIndex = idx;
  });

  let highestScoreIndex = 0;
  let highestScore = -Infinity;
  routes.forEach((r, idx) => {
    if (r.nightActivityScore > highestScore) {
      highestScore = r.nightActivityScore;
      highestScoreIndex = idx;
    }
  });

  assert.equal(routes[fastestIndex]!.id, "r-fast", "Fastest route correctly identified");
  assert.equal(routes[highestScoreIndex]!.id, "r-safe", "Highest-scoring route correctly identified independently");
  assert.notEqual(fastestIndex, highestScoreIndex, "Fastest and highest scoring can differ");
});

test("Phase 6: Unified Route Safety Index (0-100) and factor consistency across modes and data states", () => {
  const geom: [number, number][] = [[18.52, 73.85], [18.53, 73.86], [18.54, 73.87]];
  const placesWithHospitalAndCafe: MappedPlace[] = [
    { id: "h1", name: "Ruby Hall Clinic", category: "hospital", lat: 18.525, lng: 73.855, openingStatus: "open", distanceAlongRouteMeters: 500 },
    { id: "c1", name: "FC Road Cafe", category: "shop_food", lat: 18.535, lng: 73.865, openingStatus: "open", distanceAlongRouteMeters: 1200 },
  ];

  const analysis = analyzeRouteDistributionAndGaps(geom, 2000, placesWithHospitalAndCafe, [], 2, 0.5);

  // 1. Authoritative Route Safety Index matches factor breakdown sum
  const resultFoot = calculateNightActivityScore(analysis, "foot", placesWithHospitalAndCafe, false);
  const factorSum = resultFoot.factors.reduce((sum, f) => sum + f.score, 0);
  assert.equal(resultFoot.routeSafetyIndex, factorSum, "Route Safety Index must equal the exact sum of factor scores");
  assert.ok(resultFoot.routeSafetyIndex >= 0 && resultFoot.routeSafetyIndex <= 100);

  // 2. Weights in factor breakdown always sum to exactly 100
  const maxFactorWeightSum = resultFoot.factors.reduce((sum, f) => sum + f.maxScore, 0);
  assert.equal(maxFactorWeightSum, 100, "Factor weights must sum to exactly 100");

  // 3. Travel mode specificity: bike, car, foot produce deterministic mode-appropriate scoring
  const resultBike = calculateNightActivityScore(analysis, "bike", placesWithHospitalAndCafe, false);
  const resultCar = calculateNightActivityScore(analysis, "car", placesWithHospitalAndCafe, false);
  assert.ok(resultBike.routeSafetyIndex > 0);
  assert.ok(resultCar.routeSafetyIndex > 0);
  assert.equal(resultBike.factors.reduce((sum, f) => sum + f.score, 0), resultBike.routeSafetyIndex);
  assert.equal(resultCar.factors.reduce((sum, f) => sum + f.score, 0), resultCar.routeSafetyIndex);

  // 4. Missing POI data still yields an explainable Route Safety Index from route infrastructure
  const emptyAnalysis = analyzeRouteDistributionAndGaps(geom, 2000, [], [], 2, 0.4);
  const resultEmpty = calculateNightActivityScore(emptyAnalysis, "foot", [], false);
  assert.equal(resultEmpty.dataStatus, "insufficient-data");
  assert.ok(resultEmpty.routeSafetyIndex >= 0, "Route Safety Index is computed for every route");
  assert.equal(resultEmpty.confidence, "low", "Confidence is marked low for insufficient POI data");
  assert.equal(
    resultEmpty.routeSafetyIndex,
    resultEmpty.factors.reduce((sum, f) => sum + f.score, 0),
    "Factor breakdown sum matches index even when POI data is missing",
  );

  // 5. Camera data toggle changes max weight normalization cleanly
  const resultWithCam = calculateNightActivityScore(analysis, "foot", placesWithHospitalAndCafe, true);
  const camFactor = resultWithCam.factors.find((f) => f.id === "cameras")!;
  assert.ok(camFactor.maxScore > 0, "Camera max score > 0 when cameras are available");
  assert.equal(resultWithCam.factors.reduce((sum, f) => sum + f.maxScore, 0), 100);
});
