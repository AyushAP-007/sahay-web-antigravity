import assert from "node:assert/strict";
import test from "node:test";
import { decideResponse } from "./agent.ts";
import { nextDeviationObservation } from "./geo.ts";
import { incidentAction } from "./incidents.ts";
import { runScenario } from "./lab.ts";
import type { RiskLevel } from "./models.ts";
import { emptyLibrary, registerProfile } from "./profiles.ts";
import { computeRisk } from "./safety.ts";
import { locationAfterWatchUpdate } from "./services.ts";

const baseRisk = {
  hour: 15,
  locationAvailable: true,
  journey: null,
  nightRiskBoost: true,
  lowBattery: false,
} as const;

test("the explanation uses the same points as the score", () => {
  const risk = computeRisk({ ...baseRisk, motion: "fall", locationAvailable: false, lowBattery: true });
  const sum = (risk.factors ?? []).reduce((total, item) => total + item.points, 0);
  assert.equal(risk.score, Math.max(0, Math.min(100, sum)));
  assert.match(risk.explanation ?? "", /84 out of 100/);
  assert.match(risk.explanation ?? "", /not a 84% chance of harm/);
  assert.equal(risk.factors?.some((item) => item.kind === "unavailable"), true);
  const idle = computeRisk({ ...baseRisk, motion: "idle" });
  assert.ok(idle.score < risk.score);
  assert.notEqual(idle.explanation, risk.explanation);
});

test("confirming okay changes the explanation with the score", () => {
  const before = computeRisk({ ...baseRisk, motion: "fall" });
  const after = computeRisk({ ...baseRisk, motion: "idle", userConfirmedOk: true });
  assert.ok(after.score < before.score);
  assert.match(after.explanation ?? "", new RegExp(`${after.score} out of 100`));
  assert.notEqual(before.explanation, after.explanation);
});

test("the agent follows the safety rules", () => {
  const levels: RiskLevel[] = ["low", "medium", "high", "critical"];
  for (const confirm of [true, false]) {
    for (const level of levels) {
      const risk = {
        score: level === "low" ? 10 : level === "medium" ? 30 : level === "high" ? 60 : 90,
        level,
        reasons: [],
        computedAt: "2026-06-15T09:30:00.000Z",
      };
      const decision = decideResponse({ risk, confirmBeforeEscalate: confirm });
      const policy = incidentAction(level, confirm);
      const expected =
        policy === "observe" ? "monitor" : policy === "prompt" ? "request_confirmation" : "escalate_simulated";
      assert.equal(decision.action, expected);
    }
  }
  const critical = decideResponse({
    risk: { score: 90, level: "critical", reasons: [], computedAt: "2026-06-15T09:30:00.000Z" },
    confirmBeforeEscalate: true,
    testSos: true,
  });
  assert.equal(critical.action, "escalate_simulated");
});

test("lab scenarios follow the shared agent and stay isolated", () => {
  const library = registerProfile(
    emptyLibrary(),
    { name: "Nila", email: "nila@example.com", phone: "1" },
    "user-nila",
  ).library;
  const before = JSON.stringify(library);

  const fall = runScenario("fall-no-response");
  assert.equal(fall.persistsToHistory, false);
  assert.deepEqual(
    fall.steps.map((item) => item.decision.action),
    ["monitor", "request_confirmation", "escalate_simulated"],
  );
  assert.match(fall.steps[2]!.decision.reason, /Suspected fall|FALL_SUSPECTED|ignored/i);
  assert.match(fall.steps[2]!.outcome, /Suspected fall/);

  const okay = runScenario("fall-okay");
  assert.match(okay.steps[1]!.decision.reason, /does not record an alert/i);
  assert.ok(okay.steps[1]!.risk.score < okay.steps[0]!.risk.score);

  const late = runScenario("journey-overdue");
  assert.equal(late.steps[0]!.decision.action, "request_confirmation");
  assert.equal(late.steps[1]!.decision.action, "escalate_simulated");
  assert.match(late.steps[1]!.decision.reason, /ignored/);
  assert.match(late.steps[1]!.outcome, /Journey overdue/);

  const help = runScenario("help-during-timeout");
  assert.equal(help.steps[0]!.decision.action, "escalate_simulated");
  assert.match(help.steps[0]!.outcome, /did not start a second/);
  assert.match(help.steps[1]!.decision.reason, /dropped/);

  const missing = runScenario("missing-gps");
  assert.equal(missing.steps[0]!.decision.action, "monitor");
  assert.equal(
    missing.steps[0]!.risk.factors?.find((item) => item.id === "gps")?.kind,
    "unavailable",
  );
  assert.match(missing.steps[0]!.risk.explanation ?? "", /not evidence/);

  const deviation = runScenario("route-deviation");
  assert.equal(deviation.steps[1]!.signals.find((item) => item.label === "Deviation")?.value, "ignored_accuracy");
  assert.equal(deviation.steps[2]!.signals.find((item) => item.label === "Deviation")?.value, "confirming");
  assert.equal(deviation.steps[3]!.signals.find((item) => item.label === "Deviation")?.value, "off_route");
  assert.equal(deviation.steps[3]!.decision.action, "monitor");

  const quiet = runScenario("fall-no-response", { confirmBeforeEscalate: false });
  assert.equal(quiet.steps.at(-1)?.decision.action, "escalate_simulated");
  assert.equal(JSON.stringify(library), before);
});

test("GPS denial, a missing fix, and one drifted point do not count as off-route", () => {
  const line: [number, number][] = [
    [12.97, 77.59],
    [12.975, 77.59],
  ];
  const denied = nextDeviationObservation({
    previousStreak: 0,
    previouslyOffRoute: false,
    latitude: null,
    longitude: null,
    accuracy: null,
    geometry: line,
  });
  assert.equal(denied.status, "no_fix");
  assert.equal(denied.liveOffRoute, false);
  assert.match(denied.note, /not treated as danger/);

  const coarse = nextDeviationObservation({
    previousStreak: 0,
    previouslyOffRoute: false,
    latitude: 12.971,
    longitude: 77.592,
    accuracy: 120,
    geometry: line,
  });
  assert.equal(coarse.status, "ignored_accuracy");
  assert.equal(coarse.liveOffRoute, false);

  const once = nextDeviationObservation({
    previousStreak: 0,
    previouslyOffRoute: false,
    latitude: 12.971,
    longitude: 77.592,
    accuracy: 15,
    geometry: line,
  });
  assert.equal(once.liveOffRoute, false);
  assert.equal(once.status, "confirming");
  const twice = nextDeviationObservation({
    previousStreak: once.streak,
    previouslyOffRoute: false,
    latitude: 12.971,
    longitude: 77.592,
    accuracy: 15,
    geometry: line,
  });
  assert.equal(twice.liveOffRoute, true);
  assert.equal(twice.status, "off_route");
});

test("a failed watch update keeps the last successful phone fix", () => {
  const previous = {
    latitude: 12.97,
    longitude: 77.59,
    accuracy: 12,
    available: true,
    permission: "granted" as const,
    updatedAt: "2026-06-15T09:30:00.000Z",
    message: null,
  };
  const denied = locationAfterWatchUpdate(previous, {
    latitude: null,
    longitude: null,
    accuracy: null,
    available: false,
    permission: "denied",
    updatedAt: null,
    message: "Location permission was not granted. Missing GPS is not treated as danger.",
  });
  assert.equal(denied.available, false);
  assert.equal(denied.permission, "denied");
  assert.equal(denied.latitude, 12.97);
  assert.equal(denied.updatedAt, previous.updatedAt);
  assert.match(denied.message ?? "", /permission was not granted/);
});
