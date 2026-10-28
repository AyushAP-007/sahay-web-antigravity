import assert from "node:assert/strict";
import test from "node:test";
import {
  checkOpeningHoursStatus,
  calculateNightActivityScore,
  analyzeRouteDistributionAndGaps,
  type MappedPlace,
} from "./night-scoring.ts";
import { isWithinPune } from "./routing-api.ts";
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
