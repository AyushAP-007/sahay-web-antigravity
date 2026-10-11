import type {
  EmergencyEvent,
  EventType,
  Journey,
  MotionPattern,
  ResponseAction,
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

export function computeRisk(input: {
  motion: MotionPattern;
  hour: number;
  locationAvailable: boolean;
  journey: Journey | null;
  nightRiskBoost: boolean;
  lowBattery: boolean;
  userConfirmedOk?: boolean;
}): RiskSnapshot {
  const reasons: string[] = [];
  let score = MOTION_BASE[input.motion];
  reasons.push(`Motion pattern: ${motionLabel(input.motion)} (+${MOTION_BASE[input.motion]})`);

  const night = input.hour >= 22 || input.hour < 5;
  if (input.nightRiskBoost && night) {
    score += 12;
    reasons.push("Night hours (22:00–05:00) (+12)");
  }

  if (!input.locationAvailable) {
    score += 8;
    reasons.push("Phone location unavailable (+8)");
  }

  if (input.lowBattery) {
    score += 4;
    reasons.push("Demo locket battery is low (+4)");
  }

  if (input.journey && input.journey.status === "active") {
    if (input.motion === "running") {
      score += 8;
      reasons.push("Running during an active journey (+8)");
    }
    if (input.journey.offRouteSimulated) {
      score += 16;
      reasons.push("Journey marked off-route in this demo (+16)");
    }
    if (input.journey.delaySimulated || isJourneyOverdue(input.journey)) {
      score += 18;
      reasons.push("Journey later than expected (+18)");
    }
  }

  if (input.userConfirmedOk) {
    score = Math.min(score, 22);
    reasons.push("User confirmed they are okay (capped)");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    level: riskLevelFromScore(score),
    reasons,
    computedAt: new Date().toISOString(),
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

export function journeyRemainingMs(journey: Journey, now = Date.now()): number {
  return new Date(journey.expectedEndAt).getTime() - now;
}

export function riskFromState(
  state: Pick<SahayState, "device" | "location" | "journey" | "settings">,
  extras?: { userConfirmedOk?: boolean },
): RiskSnapshot {
  return computeRisk({
    motion: state.device.sensor.motionPattern,
    hour: new Date().getHours(),
    locationAvailable: state.location.available,
    journey: state.journey,
    nightRiskBoost: state.settings.nightRiskBoost,
    lowBattery: state.device.battery <= 20,
    userConfirmedOk: extras?.userConfirmedOk,
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
