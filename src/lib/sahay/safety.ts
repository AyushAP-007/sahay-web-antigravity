import type {
  EmergencyEvent,
  EventType,
  Journey,
  MotionPattern,
  ResponseAction,
  RiskFactor,
  RiskLevel,
  RiskSnapshot,
  SahayState,
} from "./models";

export const CHECKIN_SECONDS_DEFAULT = 20;

const MOTION_BASE: Record<MotionPattern, number> = {
  idle: 8,
  walking: 14,
  running: 36,
  sudden_stop: 46,
  fall: 72,
  impact: 78,
  struggle: 86,
};

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function eventTypeFromMotion(pattern: MotionPattern): EventType {
  if (pattern === "fall") return "FALL_SUSPECTED";
  if (pattern === "impact") return "IMPACT_SUSPECTED";
  if (pattern === "struggle") return "STRUGGLE_SUSPECTED";
  return "CHECKIN_TIMEOUT";
}

export function signalSourceLabel(source: RiskFactor["source"]): string {
  switch (source) {
    case "simulated_motion":
      return "simulated motion";
    case "browser_gps":
      return "browser GPS";
    case "journey":
      return "the journey";
    case "clock":
      return "the clock";
    case "simulated_device":
      return "the simulated locket";
    case "user":
      return "your confirmation";
  }
}

function factor(
  id: string,
  label: string,
  detail: string,
  points: number,
  source: RiskFactor["source"],
  kind: RiskFactor["kind"],
): RiskFactor {
  return { id, label, detail, points, source, kind };
}

export function computeRisk(input: {
  motion: MotionPattern;
  hour: number;
  locationAvailable: boolean;
  journey: Journey | null;
  nightRiskBoost: boolean;
  lowBattery: boolean;
  userConfirmedOk?: boolean;
  now?: number;
}): RiskSnapshot {
  const factors: RiskFactor[] = [];
  const motionPoints = MOTION_BASE[input.motion];
  factors.push(
    factor(
      "motion",
      `Simulated motion: ${motionLabel(input.motion)}`,
      "This pattern comes from the demonstration controls or the Simulation Lab. It is not a reading from a physical locket.",
      motionPoints,
      "simulated_motion",
      "contribution",
    ),
  );

  const night = input.hour >= 22 || input.hour < 5;
  if (input.nightRiskBoost && night) {
    factors.push(
      factor(
        "night",
        "Night hours",
        "The Safety Rules night boost is on, and the clock is between 22:00 and 05:00.",
        12,
        "clock",
        "contribution",
      ),
    );
  } else {
    factors.push(
      factor(
        "night",
        "Night hours",
        input.nightRiskBoost
          ? "The night boost is on, but it is not between 22:00 and 05:00, so nothing is added."
          : "The night boost is turned off in Safety Rules, so the hour is not added.",
        0,
        "clock",
        "inactive",
      ),
    );
  }

  if (!input.locationAvailable) {
    factors.push(
      factor(
        "gps",
        "Browser location unavailable",
        "No phone coordinates are available. That is missing data, not evidence that anyone is in danger. The rules add 8 only as uncertainty.",
        8,
        "browser_gps",
        "unavailable",
      ),
    );
  } else {
    factors.push(
      factor(
        "gps",
        "Browser location available",
        "A phone fix is available, so the uncertainty amount is not added.",
        0,
        "browser_gps",
        "inactive",
      ),
    );
  }

  if (input.lowBattery) {
    factors.push(
      factor(
        "battery",
        "Simulated locket battery is low",
        "The demonstration battery control is at or below 20%. This is not a reading from a physical device.",
        4,
        "simulated_device",
        "contribution",
      ),
    );
  } else {
    factors.push(
      factor(
        "battery",
        "Simulated battery",
        "The demonstration battery is above 20%, so nothing is added.",
        0,
        "simulated_device",
        "inactive",
      ),
    );
  }

  const journey = input.journey;
  const active = journey?.status === "active";
  if (!active || !journey) {
    factors.push(
      factor(
        "journey",
        "No active journey",
        "Route, delay, and off-route amounts apply only while a journey is being watched.",
        0,
        "journey",
        "inactive",
      ),
    );
  } else {
    if (input.motion === "running") {
      factors.push(
        factor(
          "running",
          "Running during the journey",
          "Simulated running while a journey is active.",
          8,
          "simulated_motion",
          "contribution",
        ),
      );
    } else {
      factors.push(
        factor(
          "running",
          "Running during the journey",
          "The simulated motion is not running, so this amount is not added.",
          0,
          "simulated_motion",
          "inactive",
        ),
      );
    }
    if (journey.offRouteSimulated || journey.liveOffRoute) {
      const fromGps = Boolean(journey.liveOffRoute) && !journey.offRouteSimulated;
      factors.push(
        factor(
          "off-route",
          fromGps ? "Phone GPS is away from the chosen line" : "Off-route flag",
          fromGps
            ? "Foreground GPS passed the distance check more than once. This is not proof of harm."
            : "The demonstration off-route control is on. It does not use live map-matching.",
          16,
          fromGps ? "browser_gps" : "journey",
          "contribution",
        ),
      );
    } else {
      factors.push(
        factor(
          "off-route",
          "On the chosen route",
          "Neither the demonstration flag nor the GPS deviation check is off-route.",
          0,
          "journey",
          "inactive",
        ),
      );
    }
    const now = input.now ?? Date.now();
    if (journey.delaySimulated || isJourneyOverdue(journey, now)) {
      factors.push(
        factor(
          "late",
          "Journey later than expected",
          journey.delaySimulated
            ? "The delay demonstration is on, or the expected arrival time has passed."
            : "The expected arrival time has passed.",
          18,
          "journey",
          "contribution",
        ),
      );
    } else {
      factors.push(
        factor(
          "late",
          "Journey timing",
          "The journey is still inside the expected arrival time.",
          0,
          "journey",
          "inactive",
        ),
      );
    }
  }

  let score = factors.reduce((sum, item) => sum + item.points, 0);
  if (input.userConfirmedOk) {
    const capped = Math.min(score, 22);
    factors.push(
      factor(
        "confirmed",
        "You confirmed you are okay",
        capped < score
          ? "The rules cap the total at 22 after you confirm you are okay."
          : "You confirmed you are okay. The total was already under the cap, so the cap changes nothing.",
        capped - score,
        "user",
        capped < score ? "contribution" : "inactive",
      ),
    );
    score = capped;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = riskLevelFromScore(score);
  const reasons = factors
    .filter((item) => item.points !== 0)
    .map((item) => `${item.label} (${item.points > 0 ? "+" : ""}${item.points})`);
  const added = factors
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points);
  const missing = factors.filter((item) => item.kind === "unavailable");
  const lead = added[0];
  const explanation = [
    `The score is ${score} out of 100, in the ${level} band. This is a rule total, not a ${score}% chance of harm.`,
    lead
      ? `The largest amount is ${lead.label.toLowerCase()} (+${lead.points}), from ${signalSourceLabel(lead.source)}.`
      : "No positive amounts were added.",
    missing.length > 0 ? missing.map((item) => item.detail).join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    score,
    level,
    reasons,
    factors,
    explanation,
    computedAt: new Date(input.now ?? Date.now()).toISOString(),
  };
}

export function chooseResponse(level: RiskLevel, confirmBeforeEscalate: boolean): ResponseAction {
  if (level === "low") return "observe";
  if (level === "medium") return "request_checkin";
  if (level === "high") return confirmBeforeEscalate ? "prepare_alert" : "notify_contacts";
  return "notify_contacts";
}

export function isJourneyOverdue(journey: Journey, now = Date.now()): boolean {
  return now >= new Date(journey.expectedEndAt).getTime();
}

export function countdownLabel(expectedEndAt: string, now: number): string {
  const ms = new Date(expectedEndAt).getTime() - now;
  if (!Number.isFinite(ms)) return "Time unavailable";
  if (ms <= 0) return "Past expected arrival";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)} remaining`;
  return `${minutes}:${pad(seconds)} remaining`;
}

export function riskFromState(
  state: Pick<SahayState, "device" | "location" | "journey" | "settings">,
  extras?: { userConfirmedOk?: boolean; hour?: number; now?: number },
): RiskSnapshot {
  const now = extras?.now ?? Date.now();
  return computeRisk({
    motion: state.device.sensor.motionPattern,
    hour: extras?.hour ?? new Date(now).getHours(),
    locationAvailable: state.location.available,
    journey: state.journey,
    nightRiskBoost: state.settings.nightRiskBoost,
    lowBattery: state.device.battery <= 20,
    userConfirmedOk: extras?.userConfirmedOk,
    now,
  });
}

export function readiness(state: SahayState): {
  ready: boolean;
  label: string;
  detail: string;
} {
  const contacts = state.contacts.filter(
    (item) => item.userId === state.user?.id && item.enabled,
  ).length;
  const locationOk =
    state.location.available || state.location.permission === "granted";
  if (contacts < 1 && !locationOk) {
    return {
      ready: false,
      label: "Not ready",
      detail: "Add a trusted contact and check phone location.",
    };
  }
  if (contacts < 1) {
    return {
      ready: false,
      label: "Almost ready",
      detail: "Add at least one enabled trusted contact.",
    };
  }
  if (!locationOk) {
    return {
      ready: false,
      label: "Almost ready",
      detail: "Phone location has not been checked yet.",
    };
  }
  return {
    ready: true,
    label: "Ready for demo",
    detail: "Contacts and phone location are in place. Hardware is still simulated.",
  };
}

export function eventLabel(type: EventType): string {
  switch (type) {
    case "TEST":
      return "TEST SOS";
    case "MANUAL_SOS":
      return "Manual SOS";
    case "FALL_SUSPECTED":
      return "Suspected fall";
    case "IMPACT_SUSPECTED":
      return "Suspected impact";
    case "STRUGGLE_SUSPECTED":
      return "Unusual motion";
    case "JOURNEY_CHECKIN":
      return "Journey check-in";
    case "JOURNEY_DEVIATION":
      return "Journey off-route";
    case "JOURNEY_TIMEOUT":
      return "Journey overdue";
    case "CHECKIN_TIMEOUT":
      return "Check-in missed";
  }
}

export function motionLabel(pattern: MotionPattern): string {
  switch (pattern) {
    case "idle":
      return "Idle";
    case "walking":
      return "Walking";
    case "running":
      return "Running";
    case "sudden_stop":
      return "Sudden stop";
    case "fall":
      return "Fall-like";
    case "impact":
      return "Impact-like";
    case "struggle":
      return "Struggle-like";
  }
}

export function responseLabel(action: ResponseAction): string {
  switch (action) {
    case "observe":
      return "Observe only";
    case "request_checkin":
      return "Ask if you are okay";
    case "monitor":
      return "Keep monitoring";
    case "prepare_alert":
      return "Prepare simulated alert";
    case "notify_contacts":
      return "Notify trusted contacts (simulated)";
  }
}

export function riskTone(
  level: RiskLevel,
): "success" | "warning" | "danger" | "info" {
  if (level === "low") return "success";
  if (level === "medium") return "warning";
  if (level === "high") return "danger";
  return "danger";
}

export function needsCheckIn(level: RiskLevel): boolean {
  return level === "medium" || level === "high" || level === "critical";
}

export function simulatedAccel(pattern: MotionPattern): {
  magnitude: number;
  orientation: "upright" | "tilted" | "inverted";
} {
  switch (pattern) {
    case "idle":
      return { magnitude: 1.02, orientation: "upright" };
    case "walking":
      return { magnitude: 1.18, orientation: "upright" };
    case "running":
      return { magnitude: 1.85, orientation: "upright" };
    case "sudden_stop":
      return { magnitude: 2.4, orientation: "tilted" };
    case "fall":
      return { magnitude: 3.6, orientation: "inverted" };
    case "impact":
      return { magnitude: 4.2, orientation: "tilted" };
    case "struggle":
      return { magnitude: 3.1, orientation: "tilted" };
  }
}

export function eventMapsUrl(event: Pick<EmergencyEvent, "latitude" | "longitude">): string | null {
  if (event.latitude === null || event.longitude === null) return null;
  return `https://maps.google.com/?q=${event.latitude},${event.longitude}`;
}
