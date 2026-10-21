import type {
  EventType,
  MotionPattern,
  PendingCheckIn,
  RiskLevel,
  SahayState,
} from "./models.ts";
import { isJourneyOverdue, riskFromState } from "./safety.ts";
import { simulatedDeviceService } from "./services.ts";

export type IncidentAction = "observe" | "prompt" | "notify";

const WARNING_MOTIONS = new Set<MotionPattern>([
  "running",
  "sudden_stop",
  "fall",
  "impact",
  "struggle",
]);

export interface EscalationFlight {
  pendingId: string;
  eventType: EventType;
  journeyId: string | null;
  ownerId: string;
}

export function followUpGraceMs(checkInSeconds: number): number {
  return Math.max(60, checkInSeconds || 20) * 1000;
}

/**
 * How a risk level becomes a prompt or a simulated alert.
 * Critical never waits. High waits only when confirmation is on.
 * Medium always asks first.
 */
export function incidentAction(
  level: RiskLevel,
  confirmBeforeEscalate: boolean,
): IncidentAction {
  if (level === "low") return "observe";
  if (level === "medium") return "prompt";
  if (level === "high") return confirmBeforeEscalate ? "prompt" : "notify";
  return "notify";
}

export function escalationEventType(pending: PendingCheckIn): EventType {
  return pending.eventType;
}

export function claimEscalation(
  current: EscalationFlight | null,
  pending: PendingCheckIn,
  ownerId: string,
): { flight: EscalationFlight; started: boolean } {
  if (current?.pendingId === pending.id) return { flight: current, started: false };
  return {
    flight: {
      pendingId: pending.id,
      eventType: pending.eventType,
      journeyId: pending.journeyId,
      ownerId,
    },
    started: true,
  };
}

export function escalationCommitAllowed(
  flight: EscalationFlight,
  state: Pick<SahayState, "user" | "pendingCheckIn" | "journey">,
): boolean {
  if (!state.user || state.user.id !== flight.ownerId) return false;
  if (state.pendingCheckIn?.id !== flight.pendingId) return false;
  if (flight.journeyId) {
    if (!state.journey || state.journey.id !== flight.journeyId) return false;
    if (state.journey.status !== "active") return false;
  }
  return true;
}

export function journeyIncident(
  state: Pick<SahayState, "journey" | "pendingCheckIn" | "settings" | "device" | "location">,
  now = Date.now(),
): IncidentAction {
  const journey = state.journey;
  if (!journey || journey.status !== "active") return "observe";
  if (state.pendingCheckIn) return "observe";
  if (journey.escalationFired) return "observe";
  if (!journey.delaySimulated && !isJourneyOverdue(journey, now)) return "observe";
  const projected = riskFromState({
    ...state,
    journey: { ...journey, delaySimulated: true },
  });
  return incidentAction(projected.level, state.settings.confirmBeforeEscalate);
}

export function applyOkay(state: SahayState, now = Date.now()): SahayState {
  const pending = state.pendingCheckIn;
  const clearMotion = pending?.motionPattern
    ? WARNING_MOTIONS.has(pending.motionPattern)
    : false;
  const device = clearMotion
    ? simulatedDeviceService.setMotion(state.device, "idle")
    : state.device;
  let journey = state.journey;
  if (journey && journey.status === "active") {
    const late = journey.delaySimulated || isJourneyOverdue(journey, now);
    journey = {
      ...journey,
      lastCheckInAt: new Date(now).toISOString(),
      lastKnownLat: state.location.latitude,
      lastKnownLng: state.location.longitude,
      offRouteSimulated: false,
      delaySimulated: false,
      escalationFired: late ? false : journey.escalationFired,
      expectedEndAt: late
        ? new Date(now + followUpGraceMs(state.settings.checkInSeconds)).toISOString()
        : journey.expectedEndAt,
    };
  }
  const draft: SahayState = {
    ...state,
    pendingCheckIn: null,
    device,
    journey,
  };
  return { ...draft, currentRisk: riskFromState(draft) };
}
