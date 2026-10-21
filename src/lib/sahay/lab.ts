import { decideResponse, type AgentDecision } from "./agent.ts";
import {
  claimEscalation,
  escalationCommitAllowed,
  escalationEventType,
} from "./incidents.ts";
import { applyOkay } from "./incidents.ts";
import type { Journey, PendingCheckIn, RiskSnapshot, SahayState } from "./models.ts";
import { emptyLibrary, registerProfile, viewFromLibrary } from "./profiles.ts";
import { nextDeviationObservation, type DeviationObservation } from "./geo.ts";
import { riskFromState } from "./safety.ts";
import { simulatedSensorProvider } from "./sensors.ts";
import type { MotionPattern } from "./models.ts";

export type ScenarioId =
  | "fall-no-response"
  | "fall-okay"
  | "route-deviation"
  | "journey-overdue"
  | "missing-gps"
  | "help-during-timeout";

export interface LabSignal {
  label: string;
  source: string;
  value: string;
}

export interface LabStep {
  id: string;
  atLabel: string;
  title: string;
  signals: LabSignal[];
  risk: RiskSnapshot;
  decision: AgentDecision;
  outcome: string;
}

export interface LabReport {
  id: ScenarioId;
  title: string;
  summary: string;
  steps: LabStep[];
  finalOutcome: string;
  simulated: true;
  persistsToHistory: false;
}

export const SCENARIOS: Array<{ id: ScenarioId; title: string; summary: string }> = [
  {
    id: "fall-no-response",
    title: "Fall, no response",
    summary: "A simulated fall opens a check-in. Nobody answers, so one simulated alert is recorded.",
  },
  {
    id: "fall-okay",
    title: "Fall, then okay",
    summary: "The same fall opens a check-in. You confirm you are okay before it expires.",
  },
  {
    id: "route-deviation",
    title: "Route deviation",
    summary: "Foreground GPS is compared with the walking line. One drifted fix is not enough.",
  },
  {
    id: "journey-overdue",
    title: "Journey overdue",
    summary: "A late journey asks if you are okay. An unanswered window records one simulated alert.",
  },
  {
    id: "missing-gps",
    title: "Missing GPS",
    summary: "No phone coordinates. The missing fix is uncertainty, not proof of danger.",
  },
  {
    id: "help-during-timeout",
    title: "Help during timeout",
    summary: "Asking for help and the timer ending share one alert. Ending the journey blocks a late one.",
  },
];

const NOW = Date.parse("2026-06-15T09:30:00.000Z");
const HOUR = 15;

function freshState(confirmBeforeEscalate: boolean): SahayState {
  const library = registerProfile(
    emptyLibrary(),
    { name: "Lab", email: "lab@sahay.demo", phone: "0" },
    "user-lab",
  ).library;
  const state = viewFromLibrary(library);
  return {
    ...state,
    settings: {
      ...state.settings,
      confirmBeforeEscalate,
      checkInSeconds: 20,
      nightRiskBoost: true,
    },
    location: {
      ...state.location,
      latitude: 12.97,
      longitude: 77.59,
      accuracy: 12,
      available: true,
      permission: "granted",
      updatedAt: new Date(NOW).toISOString(),
      message: null,
    },
    contacts: state.user
      ? [
          {
            id: "contact-lab",
            userId: state.user.id,
            name: "Meera Rao",
            phone: "+91 98111 22001",
            relationship: "Sister",
            priority: 1,
            enabled: true,
          },
        ]
      : [],
  };
}

function withMotion(state: SahayState, pattern: MotionPattern): SahayState {
  const reading = simulatedSensorProvider.read(pattern);
  if (!reading) return state;
  return {
    ...state,
    device: {
      ...state.device,
      sensor: {
        motionPattern: reading.motionPattern,
        accelMagnitude: reading.accelMagnitude,
        orientation: reading.orientation,
        sampledAt: new Date(NOW).toISOString(),
        simulated: true,
      },
    },
  };
}

function score(state: SahayState, now = NOW): RiskSnapshot {
  return riskFromState(state, { hour: HOUR, now });
}

function journey(state: SahayState, patch: Partial<Journey> = {}): SahayState {
  const started = NOW - 5 * 60000;
  const next: Journey = {
    id: "journey-lab",
    userId: state.user?.id ?? "user-lab",
    status: "active",
    originLabel: "Home",
    destinationLabel: "Studio",
    originLat: 12.97,
    originLng: 77.59,
    destLat: 12.98,
    destLng: 77.6,
    expectedMinutes: 20,
    startedAt: new Date(started).toISOString(),
    expectedEndAt: new Date(NOW + 15 * 60000).toISOString(),
    lastCheckInAt: new Date(started).toISOString(),
    lastKnownLat: 12.97,
    lastKnownLng: 77.59,
    notes: "",
    offRouteSimulated: false,
    delaySimulated: false,
    escalationFired: false,
    selectedRoute: {
      id: "lab-route",
      kind: "shortest",
      mode: "foot",
      distanceMeters: 800,
      durationSeconds: 600,
      safetyScore: 60,
      reasons: ["Lab geometry only"],
      geometry: [
        [12.97, 77.59],
        [12.975, 77.59],
      ],
    },
    liveOffRoute: false,
    locationWatchRequested: true,
    deviationStreak: 0,
    locationWatchNote: null,
    ...patch,
  };
  return { ...state, journey: next };
}

function pending(state: SahayState, patch: Partial<PendingCheckIn> = {}): PendingCheckIn {
  return {
    id: "checkin-lab",
    reason: "Simulated fall-like motion.",
    motionPattern: "fall",
    risk: score(state),
    eventType: "FALL_SUSPECTED",
    createdAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 20_000).toISOString(),
    journeyId: state.journey?.status === "active" ? state.journey.id : null,
    ...patch,
  };
}

function step(input: {
  id: string;
  atLabel: string;
  title: string;
  signals: LabSignal[];
  state: SahayState;
  now?: number;
  explicitHelp?: boolean;
  testSos?: boolean;
  outcome: string;
}): LabStep {
  const risk = score(input.state, input.now ?? NOW);
  return {
    id: input.id,
    atLabel: input.atLabel,
    title: input.title,
    signals: input.signals,
    risk,
    decision: decideResponse({
      risk,
      confirmBeforeEscalate: input.state.settings.confirmBeforeEscalate,
      explicitHelp: input.explicitHelp,
      testSos: input.testSos,
    }),
    outcome: input.outcome,
  };
}

function motionSignals(pattern: MotionPattern, location: string): LabSignal[] {
  const reading = simulatedSensorProvider.read(pattern);
  return [
    {
      label: "Motion",
      source: simulatedSensorProvider.label,
      value: reading ? `${reading.motionPattern}, ${reading.accelMagnitude.toFixed(2)} g` : "unavailable",
    },
    { label: "Locket IMU", source: "future device", value: "not connected" },
    { label: "Phone GPS", source: "browser", value: location },
  ];
}

export function runScenario(
  id: ScenarioId,
  options?: { confirmBeforeEscalate?: boolean },
): LabReport {
  const confirm = options?.confirmBeforeEscalate ?? true;
  const meta = SCENARIOS.find((item) => item.id === id)!;
  const steps = build(id, confirm);
  return {
    id,
    title: meta.title,
    summary: meta.summary,
    steps,
    finalOutcome: steps[steps.length - 1]?.outcome ?? meta.summary,
    simulated: true,
    persistsToHistory: false,
  };
}

function build(id: ScenarioId, confirm: boolean): LabStep[] {
  if (id === "fall-no-response") return fallNoResponse(confirm);
  if (id === "fall-okay") return fallOkay(confirm);
  if (id === "route-deviation") return routeDeviation(confirm);
  if (id === "journey-overdue") return journeyOverdue(confirm);
  if (id === "missing-gps") return missingGps(confirm);
  return helpDuringTimeout(confirm);
}

function fallNoResponse(confirm: boolean): LabStep[] {
  const idle = withMotion(freshState(confirm), "idle");
  const fallen = withMotion(idle, "fall");
  const opened = step({
    id: "fall",
    atLabel: "0:01",
    title: "Simulated fall",
    signals: motionSignals("fall", "fix available"),
    state: fallen,
    outcome: confirm
      ? "A check-in opens. The incident type stays Suspected fall. No alert yet."
      : "Confirmation is off and the score is high, so one simulated alert is recorded now. No second alert is added later.",
  });
  if (!confirm || opened.decision.action !== "request_confirmation") {
    return [
      step({
        id: "watch",
        atLabel: "0:00",
        title: "Watching",
        signals: motionSignals("idle", "fix available"),
        state: idle,
        outcome: "No incident. The agent keeps watching.",
      }),
      opened,
    ];
  }
  const open = { ...fallen, pendingCheckIn: pending(fallen) };
  const first = claimEscalation(null, open.pendingCheckIn!, "user-lab");
  const second = claimEscalation(first.flight, open.pendingCheckIn!, "user-lab");
  return [
    step({
      id: "watch",
      atLabel: "0:00",
      title: "Watching",
      signals: motionSignals("idle", "fix available"),
      state: idle,
      outcome: "No incident. The agent keeps watching.",
    }),
    opened,
    {
      id: "timeout",
      atLabel: "0:21",
      title: "Check-in expired",
      signals: [
        ...motionSignals("fall", "fix available"),
        {
          label: "Check-in",
          source: "response agent",
          value: second.started ? "second escalation started" : "duplicate timeout ignored",
        },
      ],
      risk: score(open, NOW + 20_000),
      decision: {
        action: "escalate_simulated",
        response: "notify_contacts",
        riskScore: score(open, NOW + 20_000).score,
        riskLevel: score(open, NOW + 20_000).level,
        reason: `The window ended with no answer. One simulated alert is recorded as ${escalationEventType(open.pendingCheckIn!)}. A second claim was ${second.started ? "started" : "ignored"}. Meera Rao is named only in the simulated notice. Acknowledgement is not available and counts as no response. No SMS was sent.`,
      },
      outcome:
        "Final outcome: one simulated alert, type Suspected fall. It is not written to your History.",
    },
  ];
}

function fallOkay(confirm: boolean): LabStep[] {
  const idle = withMotion(freshState(confirm), "idle");
  const fallen = withMotion(idle, "fall");
  const open = { ...fallen, pendingCheckIn: pending(fallen) };
  const flight = claimEscalation(null, open.pendingCheckIn!, "user-lab").flight;
  const resolved = applyOkay(open, NOW + 5_000);
  const allowed = escalationCommitAllowed(flight, resolved);
  const after = score(resolved, NOW + 5_000);
  return [
    step({
      id: "fall",
      atLabel: "0:01",
      title: "Simulated fall",
      signals: motionSignals("fall", "fix available"),
      state: fallen,
      outcome: "Check-in requested. Contacts are not notified.",
    }),
    {
      id: "okay",
      atLabel: "0:06",
      title: "You confirmed you are okay",
      signals: motionSignals("idle", "fix available"),
      risk: after,
      decision: {
        action: "monitor",
        response: "observe",
        riskScore: after.score,
        riskLevel: after.level,
        reason: allowed
          ? "The incident was still open, so an alert could still be recorded."
          : "The pending incident was cleared before the location request finished, so the agent does not record an alert. The score was recalculated from idle motion.",
      },
      outcome: `Resolved. Score moved from ${score(fallen).score} to ${after.score}. No simulated alert. The same fall does not immediately reopen.`,
    },
  ];
}

function routeDeviation(confirm: boolean): LabStep[] {
  const line: [number, number][] = [
    [12.97, 77.59],
    [12.975, 77.59],
  ];
  let state = journey(withMotion(freshState(confirm), "idle"));
  const samples: Array<{ lat: number | null; lng: number | null; accuracy: number | null; label: string }> = [
    { lat: 12.971, lng: 77.59, accuracy: 15, label: "on the line" },
    { lat: 12.971, lng: 77.592, accuracy: 120, label: "far, coarse accuracy" },
    { lat: 12.971, lng: 77.592, accuracy: 15, label: "far, accurate, first time" },
    { lat: 12.971, lng: 77.592, accuracy: 18, label: "far, accurate, second time" },
  ];
  const steps: LabStep[] = [];
  samples.forEach((sample, index) => {
    const observation = nextDeviationObservation({
      previousStreak: state.journey?.deviationStreak ?? 0,
      previouslyOffRoute: state.journey?.liveOffRoute ?? false,
      latitude: sample.lat,
      longitude: sample.lng,
      accuracy: sample.accuracy,
      geometry: line,
    });
    state = {
      ...state,
      journey: state.journey
        ? {
            ...state.journey,
            deviationStreak: observation.streak,
            liveOffRoute: observation.liveOffRoute,
            locationWatchNote: observation.note,
          }
        : state.journey,
    };
    steps.push(
      deviationStep(state, observation, sample.label, index, confirm),
    );
  });
  return steps;
}

function deviationStep(
  state: SahayState,
  observation: DeviationObservation,
  label: string,
  index: number,
  _confirm: boolean,
): LabStep {
  const risk = score(state);
  const decision = decideResponse({
    risk,
    confirmBeforeEscalate: state.settings.confirmBeforeEscalate,
  });
  return {
    id: `gps-${index}`,
    atLabel: `0:0${index + 1}`,
    title: observation.status === "off_route" ? "Off-route confirmed" : "GPS update",
    signals: [
      { label: "Sample", source: "browser GPS", value: label },
      { label: "Deviation", source: "phone GPS", value: observation.status },
      {
        label: "Distance",
        source: "walking line",
        value:
          observation.distanceMeters === null ? "not used" : `${observation.distanceMeters} m`,
      },
    ],
    risk,
    decision,
    outcome: observation.note,
  };
}

function journeyOverdue(confirm: boolean): LabStep[] {
  const late = journey(withMotion(freshState(confirm), "idle"), {
    delaySimulated: true,
    expectedEndAt: new Date(NOW - 60_000).toISOString(),
  });
  const open = {
    ...late,
    pendingCheckIn: pending(late, {
      eventType: "JOURNEY_TIMEOUT",
      reason: "The journey is past the expected arrival.",
      motionPattern: "idle",
      journeyId: "journey-lab",
    }),
  };
  const first = claimEscalation(null, open.pendingCheckIn!, "user-lab");
  const second = claimEscalation(first.flight, open.pendingCheckIn!, "user-lab");
  return [
    step({
      id: "late",
      atLabel: "0:00",
      title: "Expected arrival has passed",
      signals: [
        ...motionSignals("idle", "fix available"),
        { label: "Journey", source: "journey", value: "past expected arrival" },
      ],
      state: late,
      outcome: "The agent asks if you are okay. A simulated alert waits until the window ends unanswered.",
    }),
    {
      id: "unanswered",
      atLabel: "0:20",
      title: "Check-in unanswered",
      signals: [
        { label: "Escalation claims", source: "response agent", value: second.started ? "2" : "1" },
        { label: "Incident type", source: "response agent", value: escalationEventType(open.pendingCheckIn!) },
      ],
      risk: score(open, NOW + 20_000),
      decision: {
        action: "escalate_simulated",
        response: "notify_contacts",
        riskScore: score(open).score,
        riskLevel: score(open).level,
        reason: `One simulated alert is recorded as ${escalationEventType(open.pendingCheckIn!)}. The duplicate claim was ${second.started ? "accepted" : "ignored"}. Contact acknowledgement is simulated as no response.`,
      },
      outcome: "Final outcome: one Journey overdue simulated alert. Not saved to History.",
    },
  ];
}

function missingGps(confirm: boolean): LabStep[] {
  const state = withMotion(freshState(confirm), "idle");
  const missing = {
    ...state,
    location: {
      ...state.location,
      latitude: null,
      longitude: null,
      accuracy: null,
      available: false,
      permission: "denied" as const,
      message: "Location permission was not granted.",
    },
  };
  const observation = nextDeviationObservation({
    previousStreak: 0,
    previouslyOffRoute: false,
    latitude: null,
    longitude: null,
    accuracy: null,
    geometry: [
      [12.97, 77.59],
      [12.975, 77.59],
    ],
  });
  return [
    step({
      id: "missing",
      atLabel: "0:00",
      title: "No phone coordinates",
      signals: [
        { label: "Phone GPS", source: "browser", value: "permission denied" },
        { label: "Locket GPS", source: "simulated device", value: "separate from the phone" },
        { label: "Deviation", source: "phone GPS", value: observation.status },
      ],
      state: missing,
      outcome: observation.note,
    }),
  ];
}

function helpDuringTimeout(confirm: boolean): LabStep[] {
  const moving = journey(withMotion(freshState(confirm), "fall"));
  const open = { ...moving, pendingCheckIn: pending(moving) };
  const help = claimEscalation(null, open.pendingCheckIn!, "user-lab");
  const timeout = claimEscalation(help.flight, open.pendingCheckIn!, "user-lab");
  const allowed = escalationCommitAllowed(help.flight, open);
  const cancelled = {
    ...open,
    journey: open.journey ? { ...open.journey, status: "cancelled" as const } : open.journey,
    pendingCheckIn: null,
  };
  const stale = escalationCommitAllowed(help.flight, cancelled);
  const risk = score(open);
  return [
    {
      id: "race",
      atLabel: "0:20",
      title: "Help and timeout together",
      signals: [
        ...motionSignals("fall", "fix available"),
        {
          label: "Claims",
          source: "response agent",
          value: timeout.started ? "two alerts" : "one shared alert",
        },
      ],
      risk,
      decision: decideResponse({
        risk,
        confirmBeforeEscalate: confirm,
        explicitHelp: true,
      }),
      outcome: allowed
        ? `One simulated ${escalationEventType(open.pendingCheckIn!)} alert. The timeout did not start a second one.`
        : "The incident was no longer valid.",
    },
    {
      id: "cancel",
      atLabel: "0:21",
      title: "Journey cancelled during the location request",
      signals: [
        { label: "Journey", source: "journey", value: "cancelled" },
        { label: "Pending check-in", source: "response agent", value: "cleared" },
      ],
      risk: score(cancelled),
      decision: {
        action: "monitor",
        response: "observe",
        riskScore: score(cancelled).score,
        riskLevel: score(cancelled).level,
        reason: stale
          ? "A late alert would still be recorded."
          : "The journey ended before the phone finished locating. The in-flight alert is dropped.",
      },
      outcome: "No stale alert after cancel. This run is not written to History.",
    },
  ];
}
