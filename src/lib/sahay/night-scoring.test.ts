import assert from "node:assert/strict";
import test from "node:test";
import {
  checkOpeningHoursStatus,
  projectPointOntoRoute,
  getCategoryMetadata,
  deduplicatePlaces,
  evaluatePlacesAlongRoute,
  analyzeRouteDistributionAndGaps,
  calculateNightActivityScore,
  MODE_WEIGHTS,
  type MappedPlace,
  type TravelMode,
} from "./night-scoring.ts";

test("1. Opening-hours schedules in IST, including open, closed, unknown, overnight, and 24/7", () => {
  // Test 24/7
  const res247 = checkOpeningHoursStatus("24/7", new Date("2026-10-23T03:00:00+05:30"));
  assert.equal(res247.status, "open");

  // Test standard business hours (Mo-Sa 10:00-20:00)
  // 2026-10-23 is a Friday
  const openTime = new Date("2026-10-23T14:30:00+05:30");
  const closedTime = new Date("2026-10-23T22:30:00+05:30");
  const stdSchedule = "Mo-Sa 10:00-20:00";

  assert.equal(checkOpeningHoursStatus(stdSchedule, openTime).status, "open");
  assert.equal(checkOpeningHoursStatus(stdSchedule, closedTime).status, "closed");

  // Test overnight schedule (e.g. pub/diner 19:00-03:00)
  const overnightSchedule = "Mo-Su 19:00-03:00";
  const lateNight = new Date("2026-10-24T01:30:00+05:30");
  const morningAfter = new Date("2026-10-24T08:00:00+05:30");

  assert.equal(checkOpeningHoursStatus(overnightSchedule, lateNight).status, "open");
  assert.equal(checkOpeningHoursStatus(overnightSchedule, morningAfter).status, "closed");

  // Test unknown / invalid syntax
  assert.equal(checkOpeningHoursStatus("", openTime).status, "unknown");
  assert.equal(checkOpeningHoursStatus(undefined, openTime).status, "unknown");
  assert.equal(checkOpeningHoursStatus("sometimes open on weekends", openTime).status, "unknown");
});

test("2. Calculated passing times for places at different points along a route", () => {
  const geometry: [number, number][] = [
    [18.5204, 73.8567], // Origin (0m)
    [18.525, 73.86],    // Midpoint
    [18.53, 73.87],     // Destination
  ];
  const totalDist = 2000; // 2km
  const totalDuration = 1200; // 20 minutes (1200s)
  const departure = new Date("2026-10-23T20:00:00+05:30");

  const places: MappedPlace[] = [
    {
      id: "p1",
      name: "Origin Cafe",
      category: "shop_food",
      lat: 18.5205,
      lng: 73.8568,
      openingHoursRaw: "Mo-Su 08:00-22:00",
    },
    {
      id: "p2",
      name: "Dest Pharmacy",
      category: "pharmacy_medical",
      lat: 18.5298,
      lng: 73.8698,
      openingHoursRaw: "Mo-Su 09:00-20:15", // Closes at 20:15
    },
  ];

  const evaluated = evaluatePlacesAlongRoute(
    places,
    geometry,
    totalDist,
    totalDuration,
    departure,
    100,
  );

  assert.equal(evaluated.length, 2);

  // Origin place passed within first 2 minutes -> open (20:00 - 20:02)
  const p1Eval = evaluated.find((p) => p.id === "p1")!;
  assert.ok(p1Eval.estimatedPassingMinute! <= 2);
  assert.equal(p1Eval.openingStatus, "open");

  // Dest place passed near 20 minutes (~20:19) -> closed (closes at 20:15)
  const p2Eval = evaluated.find((p) => p.id === "p2")!;
  assert.ok(p2Eval.estimatedPassingMinute! >= 17);
  assert.equal(p2Eval.openingStatus, "closed");
});

test("3. Correct classification and marker colors for all place categories", () => {
  assert.equal(getCategoryMetadata("shop_food").color, "#eab308"); // Yellow
  assert.equal(getCategoryMetadata("pharmacy_medical").color, "#ec4899"); // Pink
  assert.equal(getCategoryMetadata("pharmacy_medical").isHelpPoint, true);
  assert.equal(getCategoryMetadata("hospital").color, "#2563eb"); // Blue
  assert.equal(getCategoryMetadata("hospital").isHelpPoint, true);
  assert.equal(getCategoryMetadata("fuel_cng").color, "#16a34a"); // Green
  assert.equal(getCategoryMetadata("transport").color, "#9333ea"); // Purple
  assert.equal(getCategoryMetadata("surveillance_camera").color, "#475569"); // Slate
});

test("4. Deduplication of places retrieved from multiple sources", () => {
  const duplicates: MappedPlace[] = [
    { id: "1", name: "Ruby Hall Clinic", category: "hospital", lat: 18.532, lng: 73.877 },
    { id: "2", name: "Ruby Hall Clinic Pune", category: "hospital", lat: 18.53205, lng: 73.87705 }, // 7m away
    { id: "3", name: "FC Road Cafe", category: "shop_food", lat: 18.524, lng: 73.841 },
  ];

  const deduped = deduplicatePlaces(duplicates, 25);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0]?.name, "Ruby Hall Clinic");
  assert.equal(deduped[1]?.name, "FC Road Cafe");
});

test("5. Distribution scoring rewards evenly distributed places over clustered places", () => {
  const geometry: [number, number][] = [
    [18.51, 73.85],
    [18.52, 73.86],
  ];
  const totalDist = 2000;

  // Route A: 6 places all clustered in the first 200m
  const clusteredPlaces: MappedPlace[] = Array.from({ length: 6 }, (_, i) => ({
    id: `c${i}`,
    name: `Shop ${i}`,
    category: "shop_food" as const,
    lat: 18.51 + i * 0.0001,
    lng: 73.85 + i * 0.0001,
    distanceAlongRouteMeters: 20 + i * 25, // all under 150m
    openingStatus: "open" as const,
  }));

  // Route B: 4 places evenly spaced across the 2000m corridor
  const evenlyDistributedPlaces: MappedPlace[] = [
    { id: "e1", name: "Shop 1", category: "shop_food", lat: 18.511, lng: 73.851, distanceAlongRouteMeters: 300, openingStatus: "open" },
    { id: "e2", name: "Shop 2", category: "shop_food", lat: 18.514, lng: 73.854, distanceAlongRouteMeters: 800, openingStatus: "open" },
    { id: "e3", name: "Shop 3", category: "shop_food", lat: 18.517, lng: 73.857, distanceAlongRouteMeters: 1300, openingStatus: "open" },
    { id: "e4", name: "Shop 4", category: "shop_food", lat: 18.519, lng: 73.859, distanceAlongRouteMeters: 1800, openingStatus: "open" },
  ];

  const analysisA = analyzeRouteDistributionAndGaps(geometry, totalDist, clusteredPlaces, [], 2, 0.5);
  const analysisB = analyzeRouteDistributionAndGaps(geometry, totalDist, evenlyDistributedPlaces, [], 2, 0.5);

  // Route A has 1/5 populated segments (0.2), Route B has 4/5 populated segments (0.8)
  assert.ok(analysisB.distributionScore > analysisA.distributionScore);
  // Route A longest gap without open activity is ~1850m; Route B longest gap is much smaller (~500m)
  assert.ok(analysisA.longestLowActivityGapMeters > analysisB.longestLowActivityGapMeters * 2);
});

test("6. Longest low-activity and no-open-help-point gap calculations", () => {
  const geometry: [number, number][] = [[18.51, 73.85], [18.52, 73.86]];
  const totalDist = 1000;

  const places: MappedPlace[] = [
    { id: "1", name: "Shop A", category: "shop_food", lat: 18.51, lng: 73.85, distanceAlongRouteMeters: 200, openingStatus: "open" },
    { id: "2", name: "Hospital B", category: "hospital", lat: 18.515, lng: 73.855, distanceAlongRouteMeters: 800, openingStatus: "open" },
  ];

  const analysis = analyzeRouteDistributionAndGaps(geometry, totalDist, places, [], 1, 0.5);

  // Longest gap between open places: 200m to 800m = 600m
  assert.equal(analysis.longestLowActivityGapMeters, 600);
  // Longest gap for help points (only 1 help point at 800m): start(0) to 800m = 800m
  assert.equal(analysis.longestNoHelpPointGapMeters, 800);
});

test("7. Camera deduplication, section distribution, and unavailable-data handling", () => {
  const geometry: [number, number][] = [[18.51, 73.85], [18.52, 73.86]];
  const totalDist = 1500;

  const cameras: MappedPlace[] = [
    { id: "c1", name: "Cam 1", category: "surveillance_camera", lat: 18.512, lng: 73.852, distanceAlongRouteMeters: 250 },
    { id: "c2", name: "Cam 2", category: "surveillance_camera", lat: 18.516, lng: 73.856, distanceAlongRouteMeters: 750 },
  ];

  const analysis = analyzeRouteDistributionAndGaps(geometry, totalDist, [], cameras, 2, 0.5);
  assert.equal(analysis.cameraCount, 2);
  assert.ok(analysis.cameraDistributionScore > 0);

  // Scoring with live camera data available
  const scoreWithCams = calculateNightActivityScore(analysis, "foot", [], true);
  const camFactor = scoreWithCams.factors.find((f) => f.id === "cameras")!;
  assert.ok(camFactor.score > 0);

  // Scoring with camera data unavailable
  const scoreNoCams = calculateNightActivityScore(analysis, "foot", [], false);
  const camFactorNo = scoreNoCams.factors.find((f) => f.id === "cameras")!;
  assert.equal(camFactorNo.score, 0);
  assert.ok(camFactorNo.evidence.includes("Camera data unavailable"));
});

test("8. Mode-specific weight profiles sum to exactly 100", () => {
  const modes: TravelMode[] = ["foot", "bike", "car"];
  for (const m of modes) {
    const w = MODE_WEIGHTS[m];
    const sum =
      w.openActivityPlaces +
      w.openHelpPoints +
      w.mainRoadCoverage +
      w.openTransport +
      w.fewerGaps +
      w.fewerTurns +
      w.cameraCoverage;
    assert.equal(sum, 100, `Weights for mode ${m} must sum to exactly 100`);
  }
  // Foot has 0 mainRoadCoverage, Driving has 15
  assert.equal(MODE_WEIGHTS.foot.mainRoadCoverage, 0);
  assert.equal(MODE_WEIGHTS.car.mainRoadCoverage, 15);
  assert.equal(MODE_WEIGHTS.bike.mainRoadCoverage, 10);
});

test("9. Meaningful changes to scoring when factor evidence changes, with no random jitter", () => {
  const geom: [number, number][] = [[18.51, 73.85], [18.52, 73.86]];
  const emptyAnalysis = analyzeRouteDistributionAndGaps(geom, 1000, [], [], 8, 0.1);
  const richPlaces: MappedPlace[] = [
    { id: "1", name: "Shop", category: "shop_food", lat: 18.51, lng: 73.85, distanceAlongRouteMeters: 200, openingStatus: "open" },
    { id: "2", name: "Clinic", category: "pharmacy_medical", lat: 18.515, lng: 73.855, distanceAlongRouteMeters: 500, openingStatus: "open" },
    { id: "3", name: "Hospital", category: "hospital", lat: 18.52, lng: 73.86, distanceAlongRouteMeters: 800, openingStatus: "open" },
  ];
  const richAnalysis = analyzeRouteDistributionAndGaps(geom, 1000, richPlaces, [], 2, 0.8);

  const score1 = calculateNightActivityScore(emptyAnalysis, "foot", [], true);
  const score2 = calculateNightActivityScore(richAnalysis, "foot", richPlaces, true);

  assert.ok(score2.nightActivityScore > score1.nightActivityScore);

  // Determinism check (no random jitter)
  const score2Repeat = calculateNightActivityScore(richAnalysis, "foot", richPlaces, true);
  assert.equal(score2.nightActivityScore, score2Repeat.nightActivityScore);
  assert.deepEqual(score2.factors, score2Repeat.factors);
});

test("10. Missing data reduces confidence without being interpreted as proof of danger", () => {
  const geom: [number, number][] = [[18.51, 73.85], [18.52, 73.86]];
  const unknownHoursPlaces: MappedPlace[] = Array.from({ length: 6 }, (_, i) => ({
    id: `u${i}`,
    name: `Store ${i}`,
    category: "shop_food" as const,
    lat: 18.51,
    lng: 73.85,
    openingStatus: "unknown" as const,
  }));

  const analysis = analyzeRouteDistributionAndGaps(geom, 1000, unknownHoursPlaces, [], 3, 0.5);
  const scoring = calculateNightActivityScore(analysis, "foot", unknownHoursPlaces, false);

  assert.equal(scoring.confidence, "low");
  assert.ok(scoring.missingDataNotes.length >= 2);
  // Score stays within valid range (does not crash or assign 0 arbitrarily)
  assert.ok(scoring.nightActivityScore >= 10);
});
