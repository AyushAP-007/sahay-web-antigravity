import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRouteSafetyAssessment,
  deduplicateRoutes,
  extractRouteFeatures,
  isRouteDuplicate,
  rankAndCategorizeRoutes,
  sampleGeometry,
  type OsmContext,
  type RawCandidate,
  type SafetyFeatures,
} from "./routing.ts";

test("sampleGeometry correctly downsamples coordinates uniformly", () => {
  const line: [number, number][] = Array.from({ length: 50 }, (_, i) => [
    18.5 + i * 0.001,
    73.8 + i * 0.001,
  ]);
  const samples = sampleGeometry(line, 10);
  assert.equal(samples.length, 10);
  assert.deepEqual(samples[0], line[0]);
  assert.deepEqual(samples[9], line[49]);
});

test("isRouteDuplicate accurately detects near-identical and overlapping geometries", () => {
  const baseLine: [number, number][] = [
    [18.5074, 73.8077],
    [18.51, 73.815],
    [18.515, 73.825],
    [18.5204, 73.8437],
  ];

  // Identical route
  assert.equal(isRouteDuplicate(baseLine, baseLine), true);

  // Micro-shifted route (< 10m variation)
  const microShifted: [number, number][] = baseLine.map(([lat, lng]) => [
    lat + 0.00005,
    lng + 0.00005,
  ]);
  assert.equal(isRouteDuplicate(microShifted, baseLine), true);

  // Genuinely distinct route diversion (shifted by ~500m)
  const distinctLine: [number, number][] = [
    [18.5074, 73.8077],
    [18.498, 73.818],
    [18.505, 73.835],
    [18.5204, 73.8437],
  ];
  assert.equal(isRouteDuplicate(distinctLine, baseLine), false);
});

test("deduplicateRoutes removes duplicate and superficial candidate variants", () => {
  const routeA: RawCandidate = {
    id: "route-a",
    mode: "foot",
    distanceMeters: 5000,
    durationSeconds: 4000,
    geometry: [
      [18.5074, 73.8077],
      [18.514, 73.825],
      [18.5204, 73.8437],
    ],
  };

  const duplicateA: RawCandidate = {
    id: "dup-a",
    mode: "foot",
    distanceMeters: 5020, // 0.4% diff
    durationSeconds: 4015,
    geometry: [
      [18.50745, 73.80775],
      [18.51405, 73.82505],
      [18.52042, 73.84372],
    ],
  };

  const routeB: RawCandidate = {
    id: "route-b",
    mode: "foot",
    distanceMeters: 5400,
    durationSeconds: 4300,
    geometry: [
      [18.5074, 73.8077],
      [18.528, 73.82],
      [18.5204, 73.8437],
    ],
  };

  const unique = deduplicateRoutes([routeA, duplicateA, routeB]);
  assert.equal(unique.length, 2);
  assert.equal(unique[0]?.id, "route-a");
  assert.equal(unique[1]?.id, "route-b");
});

test("each candidate is scored using its own geometry and segment-level evidence", () => {
  // Route 1: passes right by police stations and hospitals on Paud Road / FC Road
  const routeActive: [number, number][] = [
    [18.5074, 73.8077],
    [18.51, 73.82],
    [18.5204, 73.8437],
  ];

  // Route 2: goes through isolated back-lanes with zero amenities
  const routeQuiet: [number, number][] = [
    [18.5074, 73.8077],
    [18.495, 73.82],
    [18.5204, 73.8437],
  ];

  const osm: OsmContext = {
    lamps: [],
    lampsKnown: false,
    amenities: [
      { lat: 18.51, lng: 73.82, kind: "police", name: "Paud Phata Police Chowki" },
      { lat: 18.511, lng: 73.821, kind: "hospital", name: "Krishna Hospital" },
      { lat: 18.5105, lng: 73.8205, kind: "pharmacy", name: "Apollo Pharmacy" },
    ],
  };

  const feat1 = extractRouteFeatures(
    routeActive,
    osm,
    14,
    5000,
    5000,
    ["Paud Road", "FC Road"],
  );
  const feat2 = extractRouteFeatures(
    routeQuiet,
    osm,
    14,
    5000,
    5100,
    ["Small Lane", "Back Alley"],
  );

  assert.ok(feat1.policeNearbyCount > 0);
  assert.equal(feat2.policeNearbyCount, 0);
  assert.ok(feat1.hospitalNearbyCount > 0);
  assert.equal(feat2.hospitalNearbyCount, 0);

  const score1 = calculateRouteSafetyAssessment(feat1);
  const score2 = calculateRouteSafetyAssessment(feat2);

  // Score 1 must be significantly higher due to genuine measured conditions along its path
  assert.ok(
    score1.score > score2.score + 10,
    `Active route score (${score1.score}) should meaningfully beat isolated route score (${score2.score})`,
  );
});

test("changing route-specific conditions dynamically affects the safety assessment", () => {
  const baseFeat: SafetyFeatures = {
    sampleCount: 20,
    litRatio: 0.1,
    isolatedRatio: 0.1,
    policeNearbyCount: 2,
    hospitalNearbyCount: 1,
    pharmacyNearbyCount: 1,
    transitNearbyCount: 2,
    commercialNearbyCount: 3,
    totalAmenitiesCount: 9,
    majorPedestrianStreetRatio: 0.5,
    night: false,
    detourRatio: 1.0,
    lampsKnown: false,
    dataCoverageRatio: 0.7,
  };

  const dayResult = calculateRouteSafetyAssessment(baseFeat);
  const nightResult = calculateRouteSafetyAssessment({ ...baseFeat, night: true });

  assert.ok(
    dayResult.score > nightResult.score,
    "Night-time context must apply penalty when darkness increases risk",
  );

  // If police and hospitals are absent, score drops
  const sparseResult = calculateRouteSafetyAssessment({
    ...baseFeat,
    policeNearbyCount: 0,
    hospitalNearbyCount: 0,
    pharmacyNearbyCount: 0,
  });
  assert.ok(
    sparseResult.score < dayResult.score,
    "Absence of emergency services along route reduces assistance score",
  );
});

test("identical inputs produce deterministic scores without random jitter", () => {
  const feat: SafetyFeatures = {
    sampleCount: 20,
    litRatio: 0.4,
    isolatedRatio: 0.2,
    policeNearbyCount: 1,
    hospitalNearbyCount: 1,
    pharmacyNearbyCount: 1,
    transitNearbyCount: 1,
    commercialNearbyCount: 2,
    totalAmenitiesCount: 6,
    majorPedestrianStreetRatio: 0.3,
    night: true,
    detourRatio: 1.05,
    lampsKnown: false,
    dataCoverageRatio: 0.6,
  };

  const resA = calculateRouteSafetyAssessment(feat);
  const resB = calculateRouteSafetyAssessment(feat);

  assert.equal(resA.score, resB.score);
  assert.deepEqual(resA.reasons, resB.reasons);
  assert.deepEqual(resA.concerns, resB.concerns);
  assert.deepEqual(resA.breakdown, resB.breakdown);
});

test("missing data is treated as unknown with reduced confidence, not verified safety", () => {
  const featNoLamps: SafetyFeatures = {
    sampleCount: 20,
    litRatio: 0,
    isolatedRatio: 0.2,
    policeNearbyCount: 1,
    hospitalNearbyCount: 0,
    pharmacyNearbyCount: 0,
    transitNearbyCount: 0,
    commercialNearbyCount: 1,
    totalAmenitiesCount: 2,
    majorPedestrianStreetRatio: 0.2,
    night: false,
    detourRatio: 1.0,
    lampsKnown: false,
    dataCoverageRatio: 0.3,
  };

  const assessment = calculateRouteSafetyAssessment(featNoLamps);
  assert.equal(assessment.breakdown.coverageConfidence, "low");
  assert.ok(
    assessment.missingDataNotes.some((n) => n.includes("Streetlamp")),
    "Must document missing data in notes",
  );
});

test("rankAndCategorizeRoutes generates distinct objectives and handles route counts honestly", () => {
  const candFastest: RawCandidate = {
    id: "c-fastest",
    mode: "foot",
    distanceMeters: 3000,
    durationSeconds: 2400,
    geometry: [
      [18.5, 73.8],
      [18.51, 73.81],
      [18.52, 73.82],
    ],
    streetNames: ["Direct Shortcut", "Alley"],
  };

  const candSafeArterial: RawCandidate = {
    id: "c-safe",
    mode: "foot",
    distanceMeters: 3200,
    durationSeconds: 2560,
    geometry: [
      [18.5, 73.8],
      [18.508, 73.812],
      [18.52, 73.82],
    ],
    streetNames: ["Karve Road", "FC Road"],
  };

  const candLongDetour: RawCandidate = {
    id: "c-long",
    mode: "foot",
    distanceMeters: 4500,
    durationSeconds: 3600,
    geometry: [
      [18.5, 73.8],
      [18.53, 73.805],
      [18.52, 73.82],
    ],
    streetNames: ["Outer Bypass"],
  };

  const osm: OsmContext = {
    lamps: [],
    lampsKnown: false,
    amenities: [
      { lat: 18.508, lng: 73.812, kind: "police", name: "Chowki" },
      { lat: 18.5082, lng: 73.8122, kind: "hospital", name: "Hospital" },
      { lat: 18.5083, lng: 73.8123, kind: "pharmacy", name: "Chemist" },
    ],
  };

  const ranked = rankAndCategorizeRoutes(
    [candFastest, candSafeArterial, candLongDetour],
    osm,
    15,
  );

  assert.equal(ranked.routes.length, 3);

  // Check distinct objectives are present
  const objectives = ranked.routes.map((r) => r.objective);
  assert.ok(objectives.includes("recommended"));
  assert.ok(objectives.includes("fastest"));

  // Check that scores are distinct
  const scores = ranked.routes.map((r) => r.safetyScore);
  const uniqueScores = new Set(scores);
  assert.ok(
    uniqueScores.size >= 2,
    `Expected distinct scores across genuine route alternatives, got: ${scores.join(", ")}`,
  );

  // Honest handling of single candidate
  const single = rankAndCategorizeRoutes([candFastest], osm, 15);
  assert.equal(single.routes.length, 1);
  assert.match(single.note, /Only 1 direct accessible walking route was mapped/);
});
