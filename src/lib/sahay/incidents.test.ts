import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOkay,
  claimEscalation,
  escalationCommitAllowed,
  escalationEventType,
  followUpGraceMs,
  incidentAction,
  journeyIncident,
} from "./incidents.ts";
import type { Journey, PendingCheckIn, SahayState } from "./models.ts";
import { emptyLibrary, registerProfile, viewFromLibrary } from "./profiles.ts";
import { describeRouteFailure } from "./routing.ts";
import { countdownLabel, riskFromState } from "./safety.ts";
import { simulatedDeviceService } from "./services.ts";

function signedIn(): SahayState {
  const library = registerProfile(
    emptyLibrary(),
    { name: "Nila", email: "nila@example.com", phone: "1" },
    "user-nila",
  ).library;
  return viewFromLibrary(library);
}

function withJourney(state: SahayState, patch: Partial<Journey> = {}): SahayState {
  const started = Date.parse("2026-10-16T10:00:00.000Z");
  const journey: Journey = {
    id: "journey-1",
    userId: state.user?.id ?? "",
    status: "active",
    originLabel: "Home",
    destinationLabel: "Studio",
    originLat: null,
    originLng: null,
    destLat: null,
    destLng: null,
    expectedMinutes: 20,
    startedAt: new Date(started).toISOString(),
    expectedEndAt: new Date(started + 20 * 60000).toISOString(),
    lastCheckInAt: new Date(started).toISOString(),
    lastKnownLat: null,
    lastKnownLng: null,
    notes: "",
    offRouteSimulated: false,
    delaySimulated: false,
    escalationFired: false,
    selectedRoute: null,
    liveOffRoute: false,
    locationWatchRequested: false,
    deviationStreak: 0,
    locationWatchNote: null,
    ...patch,
  };
  const next = { ...state, journey };
  return { ...next, currentRisk: riskFromState(next) };
}

function pendingFor(state: SahayState, patch: Partial<PendingCheckIn> = {}): PendingCheckIn {
  return {
    id: "checkin-1",
    reason: "Simulated fall",
    motionPattern: "fall",
    risk: state.currentRisk,
    eventType: "FALL_SUSPECTED",
    createdAt: "2026-10-16T10:05:00.000Z",
    expiresAt: "2026-10-16T10:05:20.000Z",
    journeyId: state.journey?.id ?? null,
    ...patch,
  };
}

test("countdown changes every second without a risk update", () => {
  const now = Date.parse("2026-10-16T10:00:00.000Z");
  const end = new Date(now + 65_000).toISOString();
  assert.equal(countdownLabel(end, now), "1:05 remaining");
  assert.equal(countdownLabel(end, now + 1000), "1:04 remaining");
  assert.equal(countdownLabel(end, now + 65_000), "Past expected arrival");
  assert.notEqual(countdownLabel(end, now), countdownLabel(end, now + 1000));
});

test("safety rules choose prompt or immediate alert", () => {
  assert.equal(incidentAction("low", true), "observe");
  assert.equal(incidentAction("medium", false), "prompt");
  assert.equal(incidentAction("high", true), "prompt");
  assert.equal(incidentAction("high", false), "notify");
  assert.equal(incidentAction("critical", true), "notify");
});

test("a timeout keeps the original incident type", () => {
  const state = withJourney(signedIn());
  const pending = pendingFor(state, {
    eventType: "FALL_SUSPECTED",
    journeyId: "journey-1",
  });
  assert.equal(escalationEventType(pending), "FALL_SUSPECTED");
  assert.notEqual(escalationEventType(pending), "JOURNEY_TIMEOUT");
});

test("confirming okay before a location request drops the incident", () => {
  const now = Date.parse("2026-10-16T10:10:00.000Z");
  let state = withJourney(signedIn(), {
    delaySimulated: true,
    offRouteSimulated: true,
    expectedEndAt: new Date(now - 1000).toISOString(),
  });
  state = {
    ...state,
    device: simulatedDeviceService.setMotion(state.device, "fall"),
  };
  state = { ...state, currentRisk: riskFromState(state) };
  state = { ...state, pendingCheckIn: pendingFor(state) };
  const pending = state.pendingCheckIn;
  assert.ok(pending);
  const flight = claimEscalation(null, pending, "user-nila").flight;
  const resolved = applyOkay(state, now);
  assert.equal(resolved.pendingCheckIn, null);
  assert.equal(escalationCommitAllowed(flight, resolved), false);
  assert.equal(journeyIncident(resolved, now + 1000), "observe");
});

test("confirming okay during an in-flight location request blocks the event", () => {
  const now = Date.parse("2026-10-16T10:10:00.000Z");
  let state = withJourney(signedIn());
  state = {
    ...state,
    device: simulatedDeviceService.setMotion(state.device, "fall"),
    pendingCheckIn: pendingFor(state),
  };
  const flight = claimEscalation(null, state.pendingCheckIn!, "user-nila").flight;
  const resolved = applyOkay(state, now);
  assert.equal(flight.pendingId, "checkin-1");
  assert.equal(escalationCommitAllowed(flight, resolved), false);
});

test("ending or cancelling a journey during escalation blocks the event", () => {
  const state = withJourney(signedIn(), { status: "active" });
  const pending = pendingFor(state);
  const open = { ...state, pendingCheckIn: pending };
  const flight = claimEscalation(null, pending, "user-nila").flight;
  assert.equal(escalationCommitAllowed(flight, open), true);
  for (const status of ["completed", "cancelled"] as const) {
    const ended = {
      ...open,
      journey: { ...open.journey!, status },
      pendingCheckIn: null,
    };
    assert.equal(escalationCommitAllowed(flight, ended), false);
    const stalePending = {
      ...open,
      journey: { ...open.journey!, status },
    };
    assert.equal(escalationCommitAllowed(flight, stalePending), false);
  }
});

test("timeout and help cannot start two escalations for one incident", () => {
  const state = withJourney(signedIn());
  const pending = pendingFor(state);
  const first = claimEscalation(null, pending, "user-nila");
  const second = claimEscalation(first.flight, pending, "user-nila");
  assert.equal(first.started, true);
  assert.equal(second.started, false);
  assert.equal(second.flight, first.flight);
  assert.equal(second.flight.eventType, "FALL_SUSPECTED");
});

test("okay recalculates risk and does not immediately reopen the same journey prompt", () => {
  const now = Date.parse("2026-10-16T10:10:00.000Z");
  let state = withJourney(signedIn(), {
    delaySimulated: true,
    offRouteSimulated: true,
    escalationFired: true,
    expectedEndAt: new Date(now - 5000).toISOString(),
  });
  state = {
    ...state,
    device: simulatedDeviceService.setMotion(state.device, "fall"),
  };
  state = {
    ...state,
    currentRisk: riskFromState(state),
    pendingCheckIn: pendingFor(state),
  };
  const before = state.currentRisk.score;
  const resolved = applyOkay(state, now);
  assert.ok(resolved.currentRisk.score < before);
  assert.equal(resolved.device.sensor.motionPattern, "idle");
  assert.equal(resolved.journey?.delaySimulated, false);
  assert.equal(resolved.journey?.offRouteSimulated, false);
  assert.equal(resolved.pendingCheckIn, null);
  assert.equal(journeyIncident(resolved, now + 1000), "observe");
  const grace = followUpGraceMs(resolved.settings.checkInSeconds);
  assert.equal(journeyIncident(resolved, now + grace + 1000), "prompt");
});

test("route failures explain network loss separately from no walking path", () => {
  const network = describeRouteFailure("network");
  const none = describeRouteFailure("none");
  assert.notEqual(network, none);
  assert.match(network, /could not be reached/i);
  assert.match(none, /no walking path/i);
  assert.doesNotMatch(network, /found no walking path/i);
});
