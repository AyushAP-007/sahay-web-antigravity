import type {
  ActivityEntry,
  AppNotification,
  AppSettings,
  DeviceStatus,
  EmergencyContact,
  EmergencyEvent,
  Journey,
  PendingCheckIn,
  PhoneLocation,
  SahayState,
  UserProfile,
} from "./models";
import { completeJourney } from "./geo.ts";
import { riskFromState } from "./safety.ts";
import { defaultSettings, simulatedDeviceService } from "./services.ts";

export const DEMO_PROFILE_ID = "user-asha-demo";
export const DEMO_EMAIL = "asha@sahay.demo";

export type ProfileAccess =
  | { ok: true }
  | { ok: false; reason: "duplicate" | "unknown" | "invalid" | "reserved" };

export interface ProfileRecord {
  profile: UserProfile;
  contacts: EmergencyContact[];
  events: EmergencyEvent[];
  activity: ActivityEntry[];
  notifications: AppNotification[];
  device: DeviceStatus;
  location: PhoneLocation;
  settings: AppSettings;
  journey: Journey | null;
  pendingCheckIn: PendingCheckIn | null;
}

export interface ProfileLibrary {
  version: 2;
  activeUserId: string | null;
  records: ProfileRecord[];
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emptyLibrary(): ProfileLibrary {
  return { version: 2, activeUserId: null, records: [] };
}

function blankLocation(): PhoneLocation {
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

function directory(records: ProfileRecord[]): UserProfile[] {
  return records.map((record) => ({ ...record.profile }));
}

function freshDevice(userId: string | null): DeviceStatus {
  return { ...simulatedDeviceService.createInitialStatus(), userId };
}

export function emptyRecord(profile: UserProfile): ProfileRecord {
  return {
    profile: { ...profile },
    contacts: [],
    events: [],
    activity: [],
    notifications: [],
    device: freshDevice(profile.id),
    location: blankLocation(),
    settings: { ...defaultSettings },
    journey: null,
    pendingCheckIn: null,
  };
}

function demoRecord(): ProfileRecord {
  const profile: UserProfile = {
    id: DEMO_PROFILE_ID,
    name: "Asha Rao",
    email: DEMO_EMAIL,
    phone: "+91 98765 43210",
  };
  const record = emptyRecord(profile);
  record.settings = { ...record.settings, quietCallName: "Meera Rao" };
  record.contacts = [
    {
      id: "contact-asha-meera",
      userId: profile.id,
      name: "Meera Rao",
      phone: "+91 98111 22001",
      relationship: "Sister",
      priority: 1,
      enabled: true,
    },
  ];
  record.device = {
    ...freshDevice(profile.id),
    connectionStatus: "connected",
    communicationStatus: "online",
    gpsStatus: "available",
    lastSeen: new Date().toISOString(),
  };
  return record;
}

export function viewFromLibrary(library: ProfileLibrary): SahayState {
  const profiles = directory(library.records);
  const active = library.records.find(
    (record) => record.profile.id === library.activeUserId,
  );
  if (!active) {
    const device = freshDevice(null);
    const location = blankLocation();
    const settings = { ...defaultSettings };
    return {
      user: null,
      profiles,
      contacts: [],
      events: [],
      activity: [],
      notifications: [],
      device,
      location,
      settings,
      journey: null,
      pendingCheckIn: null,
      currentRisk: riskFromState({ device, location, journey: null, settings }),
    };
  }
  const device = {
    ...freshDevice(active.profile.id),
    ...active.device,
    userId: active.profile.id,
    simulationMode: true as const,
    sensor: {
      ...freshDevice(active.profile.id).sensor,
      ...active.device.sensor,
      simulated: true as const,
    },
  };
  const location = { ...blankLocation(), ...active.location };
  const settings = { ...defaultSettings, ...active.settings };
  const journey = active.journey
    ? completeJourney({ ...active.journey, userId: active.profile.id })
    : null;
  const draft: SahayState = {
    user: { ...active.profile },
    profiles,
    contacts: active.contacts.map((item) => ({
      ...item,
      userId: active.profile.id,
    })),
    events: active.events.map((item) => ({ ...item, userId: active.profile.id })),
    activity: active.activity.map((item) => ({
      ...item,
      userId: active.profile.id,
    })),
    notifications: active.notifications.map((item) => ({
      ...item,
      userId: active.profile.id,
    })),
    device,
    location,
    settings,
    journey,
    pendingCheckIn: active.pendingCheckIn ? { ...active.pendingCheckIn } : null,
    currentRisk: {
      score: 8,
      level: "low",
      reasons: ["Default idle motion"],
      computedAt: new Date().toISOString(),
    },
  };
  draft.currentRisk = riskFromState(draft);
  return draft;
}

export function saveActiveSession(
  library: ProfileLibrary,
  session: SahayState,
): ProfileLibrary {
  if (!session.user) return { ...library, activeUserId: null };
  const profile = session.user;
  const record: ProfileRecord = {
    profile: { ...profile },
    contacts: session.contacts
      .filter((item) => item.userId === profile.id)
      .map((item) => ({ ...item })),
    events: session.events
      .filter((item) => item.userId === profile.id)
      .map((item) => ({ ...item })),
    activity: session.activity
      .filter((item) => item.userId === profile.id)
      .map((item) => ({ ...item })),
    notifications: session.notifications
      .filter((item) => item.userId === profile.id)
      .map((item) => ({ ...item })),
    device: { ...session.device, userId: profile.id, simulationMode: true },
    location: { ...session.location },
    settings: { ...session.settings },
    journey: session.journey ? { ...session.journey, userId: profile.id } : null,
    pendingCheckIn: session.pendingCheckIn
      ? { ...session.pendingCheckIn }
      : null,
  };
  const exists = library.records.some((item) => item.profile.id === profile.id);
  const records = exists
    ? library.records.map((item) =>
        item.profile.id === profile.id ? record : item,
      )
    : [...library.records, record];
  return { version: 2, activeUserId: profile.id, records };
}

function taken(library: ProfileLibrary, email: string, exceptId?: string): boolean {
  const normalized = normalizeEmail(email);
  return library.records.some(
    (record) =>
      record.profile.id !== exceptId &&
      normalizeEmail(record.profile.email) === normalized,
  );
}

export function registerProfile(
  library: ProfileLibrary,
  input: Omit<UserProfile, "id">,
  id: string,
): { library: ProfileLibrary; result: ProfileAccess } {
  if (!input.name.trim() || !input.phone.trim() || !normalizeEmail(input.email)) {
    return { library, result: { ok: false, reason: "invalid" } };
  }
  if (normalizeEmail(input.email) === DEMO_EMAIL) {
    return { library, result: { ok: false, reason: "reserved" } };
  }
  if (taken(library, input.email)) {
    return { library, result: { ok: false, reason: "duplicate" } };
  }
  const record = emptyRecord({
    id,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
  });
  return {
    library: {
      version: 2,
      activeUserId: record.profile.id,
      records: [...library.records, record],
    },
    result: { ok: true },
  };
}

export function restoreProfile(
  library: ProfileLibrary,
  email: string,
): { library: ProfileLibrary; result: ProfileAccess } {
  const normalized = normalizeEmail(email);
  if (!normalized) return { library, result: { ok: false, reason: "invalid" } };
  const record = library.records.find(
    (item) => normalizeEmail(item.profile.email) === normalized,
  );
  if (!record) return { library, result: { ok: false, reason: "unknown" } };
  return {
    library: { ...library, activeUserId: record.profile.id },
    result: { ok: true },
  };
}

export function openDemoProfile(library: ProfileLibrary): ProfileLibrary {
  const existing = library.records.find(
    (record) =>
      record.profile.id === DEMO_PROFILE_ID ||
      normalizeEmail(record.profile.email) === DEMO_EMAIL,
  );
  if (existing) return { ...library, activeUserId: existing.profile.id };
  return {
    version: 2,
    activeUserId: DEMO_PROFILE_ID,
    records: [...library.records, demoRecord()],
  };
}

export function signOutProfile(
  library: ProfileLibrary,
  session: SahayState,
): ProfileLibrary {
  const saved = session.user
    ? saveActiveSession(library, { ...session, pendingCheckIn: null })
    : library;
  return { ...saved, activeUserId: null };
}

export function renameProfile(
  library: ProfileLibrary,
  profileId: string,
  input: Omit<UserProfile, "id">,
): { library: ProfileLibrary; result: ProfileAccess } {
  const current = library.records.find((record) => record.profile.id === profileId);
  if (!current) return { library, result: { ok: false, reason: "unknown" } };
  if (!input.name.trim() || !input.phone.trim() || !normalizeEmail(input.email)) {
    return { library, result: { ok: false, reason: "invalid" } };
  }
  if (taken(library, input.email, profileId)) {
    return { library, result: { ok: false, reason: "duplicate" } };
  }
  const profile: UserProfile = {
    ...current.profile,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
  };
  return {
    library: {
      ...library,
      activeUserId: profileId,
      records: library.records.map((record) =>
        record.profile.id === profileId ? { ...record, profile } : record,
      ),
    },
    result: { ok: true },
  };
}

function asRecord(value: unknown): ProfileRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = value as Partial<ProfileRecord>;
  if (!parsed.profile?.id || !parsed.profile.email) return null;
  const profile: UserProfile = {
    id: parsed.profile.id,
    name: parsed.profile.name?.trim() || "Sahay profile",
    email: parsed.profile.email.trim(),
    phone: parsed.profile.phone?.trim() || "",
  };
  const base = emptyRecord(profile);
  return {
    ...base,
    profile,
    contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
    events: Array.isArray(parsed.events) ? parsed.events : [],
    activity: Array.isArray(parsed.activity) ? parsed.activity : [],
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    device: parsed.device
      ? {
          ...base.device,
          ...parsed.device,
          userId: profile.id,
          simulationMode: true,
          sensor: {
            ...base.device.sensor,
            ...parsed.device.sensor,
            simulated: true,
          },
        }
      : base.device,
    location: parsed.location ? { ...base.location, ...parsed.location } : base.location,
    settings: { ...defaultSettings, ...parsed.settings },
    journey: parsed.journey
      ? completeJourney({
          ...parsed.journey,
          userId: profile.id,
          destLat: parsed.journey.destLat ?? null,
          destLng: parsed.journey.destLng ?? null,
          selectedRoute: parsed.journey.selectedRoute ?? null,
        })
      : null,
    pendingCheckIn: parsed.pendingCheckIn ?? null,
  };
}

export function hydrateLibrary(raw: unknown): ProfileLibrary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Saved Sahay data has an invalid format.");
  }
  const parsed = raw as Partial<ProfileLibrary>;
  if (parsed.version !== 2 || !Array.isArray(parsed.records)) {
    throw new Error("Saved Sahay data has an invalid format.");
  }
  const records = parsed.records
    .map((record) => asRecord(record))
    .filter((record): record is ProfileRecord => record !== null);
  const activeUserId = records.some((record) => record.profile.id === parsed.activeUserId)
    ? (parsed.activeUserId ?? null)
    : null;
  return { version: 2, activeUserId, records };
}

export function libraryFromLegacy(
  state: SahayState,
  savedProfile: UserProfile | null,
): ProfileLibrary {
  const profile = savedProfile ?? state.user;
  if (!profile?.id || !profile.email?.trim()) return emptyLibrary();
  const id = profile.id;
  const claim = <T extends { userId: string }>(rows: T[] | undefined): T[] =>
    (rows ?? []).map((row) => ({ ...row, userId: id }));
  const record: ProfileRecord = {
    profile: {
      id,
      name: profile.name,
      email: profile.email.trim(),
      phone: profile.phone,
    },
    contacts: claim(state.contacts),
    events: claim(state.events),
    activity: claim(state.activity),
    notifications: claim(state.notifications),
    device: { ...state.device, userId: id, simulationMode: true },
    location: { ...state.location },
    settings: { ...defaultSettings, ...state.settings },
    journey: state.journey ? { ...state.journey, userId: id } : null,
    pendingCheckIn: state.pendingCheckIn,
  };
  return {
    version: 2,
    activeUserId: state.user ? id : null,
    records: [record],
  };
}
