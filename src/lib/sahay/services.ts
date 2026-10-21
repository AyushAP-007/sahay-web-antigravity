import type {
  ActivityEntry,
  AppNotification,
  AppSettings,
  DeviceConnection,
  DeviceStatus,
  EmergencyContact,
  EmergencyEvent,
  EventType,
  MotionPattern,
  NotificationStatus,
  PhoneLocation,
  ResponseAction,
  RiskLevel,
  SensorSnapshot,
} from "./models";
import { eventLabel, simulatedAccel } from "./safety.ts";

export function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getEnabledContactCount(
  contacts: EmergencyContact[],
  userId: string,
): number {
  return contacts.filter(
    (contact) => contact.userId === userId && contact.enabled,
  ).length;
}

export const defaultSettings: AppSettings = {
  activityEnabled: true,
  confirmBeforeEscalate: true,
  checkInSeconds: 20,
  nightRiskBoost: true,
  quietCallName: "",
};

export function createIdleSensor(): SensorSnapshot {
  const now = new Date().toISOString();
  const sample = simulatedAccel("idle");
  return {
    motionPattern: "idle",
    accelMagnitude: sample.magnitude,
    orientation: sample.orientation,
    sampledAt: now,
    simulated: true,
  };
}

export function sensorForPattern(pattern: MotionPattern): SensorSnapshot {
  const sample = simulatedAccel(pattern);
  return {
    motionPattern: pattern,
    accelMagnitude: sample.magnitude,
    orientation: sample.orientation,
    sampledAt: new Date().toISOString(),
    simulated: true,
  };
}

export const simulatedDeviceService = {
  createInitialStatus(): DeviceStatus {
    return {
      id: "SHY-DEMO-001",
      userId: null,
      connectionStatus: "disconnected",
      battery: 76,
      gpsStatus: "unavailable",
      communicationStatus: "offline",
      lastSeen: null,
      firmwareVersion: "Demo 0.2",
      simulationMode: true,
      sensor: createIdleSensor(),
    };
  },
  setConnection(current: DeviceStatus, status: DeviceConnection): DeviceStatus {
    const connected = status === "connected";
    return {
      ...current,
      connectionStatus: status,
      communicationStatus: connected ? "online" : "offline",
      lastSeen: connected ? new Date().toISOString() : current.lastSeen,
    };
  },
  setLowBattery(current: DeviceStatus, low: boolean): DeviceStatus {
    return { ...current, battery: low ? 14 : 76 };
  },
  setGpsAvailability(current: DeviceStatus, available: boolean): DeviceStatus {
    return {
      ...current,
      gpsStatus: available ? "available" : "unavailable",
    };
  },
  setMotion(current: DeviceStatus, pattern: MotionPattern): DeviceStatus {
    return {
      ...current,
      sensor: sensorForPattern(pattern),
      lastSeen: new Date().toISOString(),
    };
  },
};

function unavailable(
  permission: PhoneLocation["permission"],
  message: string,
): PhoneLocation {
  return {
    latitude: null,
    longitude: null,
    accuracy: null,
    available: false,
    permission,
    updatedAt: null,
    message,
  };
}

export async function requestPhoneLocation(): Promise<PhoneLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return unavailable(
      "unknown",
      "This browser does not provide location access.",
    );
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null,
          available: true,
          permission: "granted",
          updatedAt: new Date().toISOString(),
          message: null,
        }),
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        const message = denied
          ? "Location permission was not granted."
          : error.code === error.TIMEOUT
            ? "Phone location timed out. Try again."
            : "Phone location is not available right now.";
        resolve(unavailable(denied ? "denied" : "unknown", message));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

export function watchPhoneLocation(onFix: (location: PhoneLocation) => void): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onFix(
      unavailable("unknown", "This browser does not provide location access."),
    );
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    (position) =>
      onFix({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy)
          ? Math.round(position.coords.accuracy)
          : null,
        available: true,
        permission: "granted",
        updatedAt: new Date().toISOString(),
        message: null,
      }),
    (error) => {
      const denied = error.code === error.PERMISSION_DENIED;
      const message = denied
        ? "Location permission was not granted. Missing GPS is not treated as danger."
        : error.code === error.TIMEOUT
          ? "A foreground location update timed out."
          : "Phone location is not available right now. Missing GPS is not treated as danger.";
      onFix(unavailable(denied ? "denied" : "unknown", message));
    },
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Keep the last successful fix visible when a later watch update has no coordinates. */
export function locationAfterWatchUpdate(
  previous: PhoneLocation,
  incoming: PhoneLocation,
): PhoneLocation {
  if (incoming.available && incoming.latitude !== null && incoming.longitude !== null) {
    return incoming;
  }
  if (previous.latitude === null || previous.longitude === null) return incoming;
  return {
    ...incoming,
    latitude: previous.latitude,
    longitude: previous.longitude,
    accuracy: previous.accuracy,
    updatedAt: previous.updatedAt,
    available: false,
  };
}

export function simulateContactDelivery(enabledContacts: number): {
  status: NotificationStatus;
  summary: string;
} {
  if (enabledContacts < 1) {
    return {
      status: "pending",
      summary: "No enabled contacts; no notification was simulated.",
    };
  }
  return {
    status: "simulated_sent",
    summary: `Preview only — ${enabledContacts} enabled contact${enabledContacts === 1 ? "" : "s"} would be notified. No SMS, call, or push was sent.`,
  };
}

export function createEmergencyEvent(input: {
  userId: string;
  type: EventType;
  location: PhoneLocation;
  device: DeviceStatus;
  enabledContacts: number;
  riskLevel: RiskLevel;
  riskScore: number;
  riskReasons: string[];
  responseAction: ResponseAction;
  motionPattern: MotionPattern | null;
  journeyId: string | null;
  confirmed: boolean | null;
}): EmergencyEvent {
  const notification = simulateContactDelivery(
    input.responseAction === "notify_contacts" ? input.enabledContacts : 0,
  );
  const withheld =
    input.responseAction !== "notify_contacts"
      ? {
          status: "pending" as const,
          summary:
            input.responseAction === "observe"
              ? "No alert was prepared. This stayed on-device."
              : "Contacts were not notified. Confirmation or monitoring is in progress.",
        }
      : notification;
  return {
    id: createLocalId("event"),
    userId: input.userId,
    type: input.type,
    timestamp: new Date().toISOString(),
    latitude: input.location.latitude,
    longitude: input.location.longitude,
    accuracy: input.location.accuracy,
    locationAvailable: input.location.available,
    enabledContactCount: input.enabledContacts,
    source: "phone",
    deviceStatus: { ...input.device },
    notificationStatus: withheld.status,
    notificationSummary: withheld.summary,
    riskLevel: input.riskLevel,
    riskScore: input.riskScore,
    riskReasons: input.riskReasons,
    responseAction: input.responseAction,
    motionPattern: input.motionPattern,
    journeyId: input.journeyId,
    confirmed: input.confirmed,
  };
}

export function triggerRealSOS(): never {
  throw new Error(
    "Real SOS is unavailable in this prototype. No locket hardware, SMS, or emergency service is connected.",
  );
}

export function createActivityEntry(
  userId: string,
  title: string,
  detail: string,
  kind: ActivityEntry["kind"],
): ActivityEntry {
  return {
    id: createLocalId("activity"),
    userId,
    title,
    detail,
    timestamp: new Date().toISOString(),
    kind,
  };
}

export function createEventNotification(
  userId: string,
  event: EmergencyEvent,
): AppNotification {
  return {
    id: createLocalId("note"),
    userId,
    eventId: event.id,
    title: eventLabel(event.type),
    body: event.notificationSummary,
    timestamp: event.timestamp,
    read: false,
    kind: event.type.startsWith("JOURNEY") ? "journey" : "sos",
  };
}

export function createLocalNotification(input: {
  userId: string;
  title: string;
  body: string;
  kind: AppNotification["kind"];
  eventId?: string | null;
}): AppNotification {
  return {
    id: createLocalId("note"),
    userId: input.userId,
    eventId: input.eventId ?? null,
    title: input.title,
    body: input.body,
    timestamp: new Date().toISOString(),
    read: false,
    kind: input.kind,
  };
}

export function createDeviceActivityEntry(
  userId: string,
  title: string,
  detail: string,
): ActivityEntry {
  return createActivityEntry(userId, title, detail, "device");
}

export function createTestActivityEntries(
  userId: string,
  event: EmergencyEvent,
): ActivityEntry[] {
  const timestamp = event.timestamp;
  return [
    {
      id: createLocalId("activity"),
      userId,
      title: `${eventLabel(event.type)} recorded`,
      detail: event.locationAvailable
        ? "Phone location was captured for this record."
        : "Phone location was unavailable for this record.",
      timestamp,
      kind: "sos",
    },
    {
      id: createLocalId("activity"),
      userId,
      title: "Notification step",
      detail: event.notificationSummary,
      timestamp,
      kind: "system",
    },
    {
      id: createLocalId("activity"),
      userId,
      title: "No live emergency services",
      detail: "No call, SMS, or emergency service was contacted.",
      timestamp,
      kind: "sos",
    },
  ];
}

export function formatSahayDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalMinutes = Math.floor(clamped / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((clamped % 60000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes >= 1) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatAccuracy(meters: number | null): string {
  if (meters === null) return "Not recorded";
  if (meters < 15) return `±${meters} m`;
  return `±${meters} m`;
}
