import type { PlannedRoute } from "./routing";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  relationship: string;
  priority: number;
  enabled: boolean;
}

export type DeviceConnection = "connected" | "disconnected";
export type NotificationStatus = "pending" | "simulated_sent" | "failed";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type MotionPattern =
  | "idle"
  | "walking"
  | "running"
  | "sudden_stop"
  | "fall"
  | "impact"
  | "struggle";
export type EventType =
  | "TEST"
  | "MANUAL_SOS"
  | "FALL_SUSPECTED"
  | "IMPACT_SUSPECTED"
  | "STRUGGLE_SUSPECTED"
  | "JOURNEY_CHECKIN"
  | "JOURNEY_DEVIATION"
  | "JOURNEY_TIMEOUT"
  | "CHECKIN_TIMEOUT";
export type EventSource = "phone" | "simulated_locket";
export type ResponseAction =
  | "observe"
  | "request_checkin"
  | "monitor"
  | "prepare_alert"
  | "notify_contacts";
export type JourneyStatus =
  | "active"
  | "completed"
  | "cancelled"
  | "escalated";

export interface SensorSnapshot {
  motionPattern: MotionPattern;
  accelMagnitude: number;
  orientation: "upright" | "tilted" | "inverted";
  sampledAt: string;
  simulated: true;
}

export interface DeviceStatus {
  id: string;
  userId: string | null;
  connectionStatus: DeviceConnection;
  battery: number;
  gpsStatus: "available" | "unavailable";
  communicationStatus: "online" | "offline";
  lastSeen: string | null;
  firmwareVersion: string;
  simulationMode: true;
  sensor: SensorSnapshot;
}

export interface PhoneLocation {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  available: boolean;
  permission: "not_requested" | "granted" | "denied" | "unknown";
  updatedAt: string | null;
  message: string | null;
}

export interface RiskSnapshot {
  score: number;
  level: RiskLevel;
  reasons: string[];
  computedAt: string;
}

export interface EmergencyEvent {
  id: string;
  userId: string;
  type: EventType;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  locationAvailable: boolean;
  enabledContactCount: number;
  source: EventSource;
  deviceStatus: DeviceStatus;
  notificationStatus: NotificationStatus;
  notificationSummary: string;
  riskLevel: RiskLevel;
  riskScore: number;
  riskReasons: string[];
  responseAction: ResponseAction;
  motionPattern: MotionPattern | null;
  journeyId: string | null;
  confirmed: boolean | null;
}

export interface AppNotification {
  id: string;
  userId: string;
  eventId: string | null;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  kind: "sos" | "journey" | "device" | "checkin" | "system";
}

export interface ActivityEntry {
  id: string;
  userId: string;
  title: string;
  detail: string;
  timestamp: string;
  kind: "sos" | "device" | "location" | "system" | "journey" | "checkin";
}

export interface Journey {
  id: string;
  userId: string;
  status: JourneyStatus;
  originLabel: string;
  destinationLabel: string;
  originLat: number | null;
  originLng: number | null;
  destLat: number | null;
  destLng: number | null;
  expectedMinutes: number;
  startedAt: string;
  expectedEndAt: string;
  lastCheckInAt: string | null;
  lastKnownLat: number | null;
  lastKnownLng: number | null;
  notes: string;
  offRouteSimulated: boolean;
  delaySimulated: boolean;
  escalationFired: boolean;
  selectedRoute: PlannedRoute | null;
}

export interface PendingCheckIn {
  id: string;
  reason: string;
  motionPattern: MotionPattern | null;
  risk: RiskSnapshot;
  eventType: EventType;
  createdAt: string;
  expiresAt: string;
  journeyId: string | null;
}

export interface AppSettings {
  activityEnabled: boolean;
  confirmBeforeEscalate: boolean;
  checkInSeconds: number;
  nightRiskBoost: boolean;
  quietCallName: string;
}

export interface SahayState {
  user: UserProfile | null;
  savedProfile: UserProfile | null;
  contacts: EmergencyContact[];
  events: EmergencyEvent[];
  activity: ActivityEntry[];
  notifications: AppNotification[];
  device: DeviceStatus;
  location: PhoneLocation;
  settings: AppSettings;
  journey: Journey | null;
  pendingCheckIn: PendingCheckIn | null;
  currentRisk: RiskSnapshot;
}
