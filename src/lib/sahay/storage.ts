import type {
  DeviceStatus,
  EmergencyEvent,
  PhoneLocation,
  SahayState,
  UserProfile,
} from "./models";
import {
  emptyLibrary,
  hydrateLibrary,
  libraryFromLegacy,
  type ProfileLibrary,
} from "./profiles.ts";
import { completeJourney } from "./geo.ts";
import { defaultSettings, simulatedDeviceService } from "./services.ts";
import { riskFromState } from "./safety.ts";

const STORAGE_KEY = "sahay.phase1.local.v1";

export function loadLocalState(): unknown {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === null ? null : JSON.parse(value);
}

export function saveProfileLibrary(library: ProfileLibrary): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

export function readStoredLibrary(raw: unknown): ProfileLibrary {
  if (raw === null || raw === undefined) return emptyLibrary();
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Saved Sahay data has an invalid format.");
  }
  const version = (raw as { version?: unknown }).version;
  if (version === 2) return hydrateLibrary(raw);
  const savedProfile =
    (raw as { savedProfile?: UserProfile | null }).savedProfile ?? null;
  const state = migrateState(raw);
  if (!state) return emptyLibrary();
  return libraryFromLegacy(state, savedProfile);
}

export function emptyLocation(): PhoneLocation {
  return {
    latitude: null,
    longitude: null,
    accuracy: null,
    available: false,
    permission: "not_requested",
    updatedAt: null,
    message: null,
  };
}

export function migrateState(raw: unknown): SahayState | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Saved Sahay data has an invalid format.");
  }
  const parsed = raw as Partial<SahayState> & {
    user?: UserProfile | null;
    device?: Partial<DeviceStatus>;
    location?: Partial<PhoneLocation>;
    events?: Array<Partial<EmergencyEvent>>;
  };
  const deviceBase = simulatedDeviceService.createInitialStatus();
  const device: DeviceStatus = {
    ...deviceBase,
    ...parsed.device,
    simulationMode: true,
    sensor: {
      ...deviceBase.sensor,
      ...parsed.device?.sensor,
      simulated: true,
    },
    userId: parsed.device?.userId ?? parsed.user?.id ?? null,
  };
  const location: PhoneLocation = {
    ...emptyLocation(),
    ...parsed.location,
    accuracy:
      typeof parsed.location?.accuracy === "number"
        ? parsed.location.accuracy
        : (parsed.location?.accuracy ?? null),
  };
  const settings = { ...defaultSettings, ...parsed.settings };
  const events = Array.isArray(parsed.events)
    ? parsed.events.map((event) => hydrateEvent(event, device))
    : [];
  const draft: SahayState = {
    user: parsed.user ?? null,
    profiles: [],
    contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
    events,
    activity: Array.isArray(parsed.activity) ? parsed.activity : [],
    notifications: Array.isArray(parsed.notifications)
      ? parsed.notifications
      : [],
    device,
    location,
    settings,
    journey: parsed.journey
      ? completeJourney({
          ...parsed.journey,
          destLat: parsed.journey.destLat ?? null,
          destLng: parsed.journey.destLng ?? null,
          selectedRoute: parsed.journey.selectedRoute ?? null,
          liveOffRoute: parsed.journey.liveOffRoute ?? false,
          locationWatchRequested: parsed.journey.locationWatchRequested ?? false,
          deviationStreak: parsed.journey.deviationStreak ?? 0,
          locationWatchNote: parsed.journey.locationWatchNote ?? null,
        })
      : null,
    pendingCheckIn: parsed.pendingCheckIn ?? null,
    currentRisk: parsed.currentRisk ?? {
      score: 8,
      level: "low",
      reasons: ["Default idle motion"],
      computedAt: new Date().toISOString(),
    },
  };
  draft.currentRisk = riskFromState(draft);
  return draft;
}

function hydrateEvent(
  event: Partial<EmergencyEvent>,
  fallbackDevice: DeviceStatus,
): EmergencyEvent {
  return {
    id: event.id ?? "event-unknown",
    userId: event.userId ?? "",
    type: event.type ?? "TEST",
    timestamp: event.timestamp ?? new Date().toISOString(),
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    accuracy: event.accuracy ?? null,
    locationAvailable: Boolean(event.locationAvailable),
    enabledContactCount: event.enabledContactCount ?? 0,
    source: event.source ?? "phone",
    deviceStatus: event.deviceStatus
      ? {
          ...fallbackDevice,
          ...event.deviceStatus,
          simulationMode: true,
          sensor: event.deviceStatus.sensor ?? fallbackDevice.sensor,
        }
      : fallbackDevice,
    notificationStatus: event.notificationStatus ?? "pending",
    notificationSummary:
      event.notificationSummary ?? "No notification details stored.",
    riskLevel: event.riskLevel ?? "low",
    riskScore: event.riskScore ?? 0,
    riskReasons: Array.isArray(event.riskReasons) ? event.riskReasons : [],
    responseAction: event.responseAction ?? "observe",
    motionPattern: event.motionPattern ?? null,
    journeyId: event.journeyId ?? null,
    confirmed: event.confirmed ?? null,
  };
}