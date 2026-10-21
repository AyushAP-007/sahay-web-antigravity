import assert from "node:assert/strict";
import test from "node:test";
import type { EmergencyContact, EmergencyEvent, SahayState, UserProfile } from "./models.ts";
import {
  DEMO_EMAIL,
  DEMO_PROFILE_ID,
  emptyLibrary,
  libraryFromLegacy,
  openDemoProfile,
  registerProfile,
  renameProfile,
  restoreProfile,
  saveActiveSession,
  signOutProfile,
  viewFromLibrary,
} from "./profiles.ts";
import { readStoredLibrary } from "./storage.ts";
import { simulatedDeviceService } from "./services.ts";

function contact(userId: string, name: string): EmergencyContact {
  return {
    id: `contact-${name}`,
    userId,
    name,
    phone: "9000000000",
    relationship: "Friend",
    priority: 1,
    enabled: true,
  };
}

function addContact(library: ReturnType<typeof emptyLibrary>, name: string) {
  const view = viewFromLibrary(library);
  assert.ok(view.user);
  return saveActiveSession(library, {
    ...view,
    contacts: [...view.contacts, contact(view.user.id, name)],
  });
}

test("a new email creates a separate profile and a repeat email does not", () => {
  const first = registerProfile(
    emptyLibrary(),
    { name: "Nila", email: "Nila@Example.com", phone: "1" },
    "user-nila",
  );
  assert.equal(first.result.ok, true);
  const second = registerProfile(
    first.library,
    { name: "Nila Two", email: "nila@example.com", phone: "2" },
    "user-nila-2",
  );
  assert.deepEqual(second.result, { ok: false, reason: "duplicate" });
  assert.equal(second.library.records.length, 1);
  assert.equal(second.library.records[0]?.profile.name, "Nila");
});

test("sign-in restores only the matching profile", () => {
  let library = registerProfile(
    emptyLibrary(),
    { name: "Nila", email: "nila@example.com", phone: "1" },
    "user-nila",
  ).library;
  library = addContact(library, "Nila Contact");
  library = registerProfile(
    library,
    { name: "Bea", email: "bea@example.com", phone: "2" },
    "user-bea",
  ).library;
  library = addContact(library, "Bea Contact");

  const nila = restoreProfile(library, "NILA@example.com");
  assert.equal(nila.result.ok, true);
  const restored = viewFromLibrary(nila.library);
  assert.equal(restored.user?.name, "Nila");
  assert.deepEqual(
    restored.contacts.map((item) => item.name),
    ["Nila Contact"],
  );
  assert.equal(
    restored.events.some((event) => event.userId !== "user-nila"),
    false,
  );
});

test("signing out keeps every profile and hides the active data", () => {
  let library = registerProfile(
    emptyLibrary(),
    { name: "Nila", email: "nila@example.com", phone: "1" },
    "user-nila",
  ).library;
  library = addContact(library, "Nila Contact");
  const signedOut = signOutProfile(library, viewFromLibrary(library));
  const hidden = viewFromLibrary(signedOut);
  assert.equal(hidden.user, null);
  assert.equal(hidden.contacts.length, 0);
  assert.equal(hidden.profiles.length, 1);

  const back = viewFromLibrary(restoreProfile(signedOut, "nila@example.com").library);
  assert.equal(back.contacts[0]?.name, "Nila Contact");
});

test("an unknown email does not create a profile", () => {
  const library = registerProfile(
    emptyLibrary(),
    { name: "Nila", email: "nila@example.com", phone: "1" },
    "user-nila",
  ).library;
  const missed = restoreProfile(library, "missing@example.com");
  assert.deepEqual(missed.result, { ok: false, reason: "unknown" });
  assert.equal(missed.library.records.length, 1);
  assert.equal(missed.library.activeUserId, library.activeUserId);
});

test("the Asha demo is separate and is not reset on a second open", () => {
  let library = registerProfile(
    emptyLibrary(),
    { name: "Nila", email: "nila@example.com", phone: "1" },
    "user-nila",
  ).library;
  library = addContact(library, "Nila Contact");
  library = openDemoProfile(library);
  const demo = viewFromLibrary(library);
  assert.equal(demo.user?.id, DEMO_PROFILE_ID);
  assert.equal(demo.user?.email, DEMO_EMAIL);
  assert.equal(demo.contacts[0]?.name, "Meera Rao");
  assert.equal(demo.profiles.length, 2);

  library = addContact(library, "Demo Extra");
  library = signOutProfile(library, viewFromLibrary(library));
  library = openDemoProfile(library);
  const again = viewFromLibrary(library);
  assert.deepEqual(
    again.contacts.map((item) => item.name),
    ["Meera Rao", "Demo Extra"],
  );

  const nila = viewFromLibrary(restoreProfile(library, "nila@example.com").library);
  assert.deepEqual(
    nila.contacts.map((item) => item.name),
    ["Nila Contact"],
  );
  assert.equal(
    nila.notifications.some((item) => item.userId !== "user-nila"),
    false,
  );
});

test("the demo email cannot be registered over Asha", () => {
  const result = registerProfile(
    emptyLibrary(),
    { name: "Other", email: "ASHA@sahay.demo", phone: "3" },
    "user-other",
  );
  assert.deepEqual(result.result, { ok: false, reason: "reserved" });
  assert.equal(result.library.records.length, 0);
});

test("profile edits cannot take another profile's email", () => {
  let library = registerProfile(
    emptyLibrary(),
    { name: "Nila", email: "nila@example.com", phone: "1" },
    "user-nila",
  ).library;
  library = registerProfile(
    library,
    { name: "Bea", email: "bea@example.com", phone: "2" },
    "user-bea",
  ).library;
  const renamed = renameProfile(library, "user-bea", {
    name: "Bea",
    email: "nila@example.com",
    phone: "2",
  });
  assert.deepEqual(renamed.result, { ok: false, reason: "duplicate" });
  assert.equal(
    viewFromLibrary(renamed.library).user?.email,
    "bea@example.com",
  );
});

test("a signed-in v1 save migrates into one profile without dropping contacts", () => {
  const user: UserProfile = {
    id: "user-legacy",
    name: "Nila",
    email: "nila@example.com",
    phone: "1",
  };
  const device = simulatedDeviceService.createInitialStatus();
  const legacy = {
    user,
    savedProfile: user,
    contacts: [contact("someone-else", "Mom")],
    events: [],
    activity: [],
    notifications: [],
    device,
    location: {
      latitude: 12.9,
      longitude: 77.6,
      accuracy: 10,
      available: true,
      permission: "granted",
      updatedAt: "2026-10-01T00:00:00.000Z",
      message: null,
    },
    settings: { quietCallName: "Mom" },
    journey: null,
    pendingCheckIn: null,
  };
  const library = readStoredLibrary(legacy);
  const view = viewFromLibrary(library);
  assert.equal(view.user?.id, "user-legacy");
  assert.equal(view.contacts[0]?.name, "Mom");
  assert.equal(view.contacts[0]?.userId, "user-legacy");
  assert.equal(view.settings.quietCallName, "Mom");
  assert.equal(view.location.latitude, 12.9);
});

test("a signed-out v1 save stays signed out and still restores later", () => {
  const savedProfile: UserProfile = {
    id: "user-legacy",
    name: "Nila",
    email: "nila@example.com",
    phone: "1",
  };
  const legacy: Partial<SahayState> & { savedProfile: UserProfile } = {
    user: null,
    savedProfile,
    contacts: [contact("user-legacy", "Mom")],
    events: [],
    activity: [],
    notifications: [],
    journey: null,
    pendingCheckIn: null,
  };
  const library = readStoredLibrary(legacy);
  const hidden = viewFromLibrary(library);
  assert.equal(hidden.user, null);
  assert.equal(hidden.contacts.length, 0);
  const restored = viewFromLibrary(
    restoreProfile(library, "nila@example.com").library,
  );
  assert.equal(restored.contacts[0]?.name, "Mom");
});

test("switching profiles hides history, activity, notifications, settings, and the journey", () => {
  let library = registerProfile(
    emptyLibrary(),
    { name: "Nila", email: "nila@example.com", phone: "1" },
    "user-nila",
  ).library;
  const nila = viewFromLibrary(library);
  assert.ok(nila.user);
  library = saveActiveSession(library, {
    ...nila,
    events: [
      {
        id: "event-nila",
        userId: "user-nila",
        type: "TEST",
        timestamp: "2026-10-01T00:00:00.000Z",
        latitude: null,
        longitude: null,
        accuracy: null,
        locationAvailable: false,
        enabledContactCount: 0,
        source: "phone",
        deviceStatus: nila.device,
        notificationStatus: "pending",
        notificationSummary: "Nila only",
        riskLevel: "low",
        riskScore: 1,
        riskReasons: [],
        responseAction: "observe",
        motionPattern: null,
        journeyId: null,
        confirmed: true,
      } satisfies EmergencyEvent,
    ],
    activity: [
      {
        id: "activity-nila",
        userId: "user-nila",
        title: "Nila activity",
        detail: "private",
        timestamp: "2026-10-01T00:00:00.000Z",
        kind: "system",
      },
    ],
    notifications: [
      {
        id: "note-nila",
        userId: "user-nila",
        eventId: null,
        title: "Nila note",
        body: "private",
        timestamp: "2026-10-01T00:00:00.000Z",
        read: false,
        kind: "system",
      },
    ],
    settings: { ...nila.settings, quietCallName: "Nila Only", nightRiskBoost: false },
    journey: {
      id: "journey-nila",
      userId: "user-nila",
      status: "active",
      originLabel: "Home",
      destinationLabel: "Studio",
      originLat: null,
      originLng: null,
      destLat: null,
      destLng: null,
      expectedMinutes: 20,
      startedAt: "2026-10-01T00:00:00.000Z",
      expectedEndAt: "2026-10-01T00:20:00.000Z",
      lastCheckInAt: null,
      lastKnownLat: null,
      lastKnownLng: null,
      notes: "nila",
      offRouteSimulated: false,
      delaySimulated: false,
      escalationFired: false,
      selectedRoute: null,
      liveOffRoute: false,
      locationWatchRequested: false,
      deviationStreak: 0,
      locationWatchNote: null,
    },
  });

  library = registerProfile(
    library,
    { name: "Bea", email: "bea@example.com", phone: "2" },
    "user-bea",
  ).library;
  const bea = viewFromLibrary(library);
  assert.equal(bea.user?.id, "user-bea");
  assert.equal(bea.events.length, 0);
  assert.equal(bea.activity.length, 0);
  assert.equal(bea.notifications.length, 0);
  assert.equal(bea.journey, null);
  assert.equal(bea.settings.quietCallName, "");
  assert.equal(bea.settings.nightRiskBoost, true);

  const back = viewFromLibrary(restoreProfile(library, "nila@example.com").library);
  assert.equal(back.events[0]?.notificationSummary, "Nila only");
  assert.equal(back.activity[0]?.title, "Nila activity");
  assert.equal(back.notifications[0]?.title, "Nila note");
  assert.equal(back.journey?.destinationLabel, "Studio");
  assert.equal(back.settings.quietCallName, "Nila Only");
  assert.equal(back.settings.nightRiskBoost, false);
});

test("legacy migration does not invent a profile when nothing was saved", () => {
  const library = libraryFromLegacy(viewFromLibrary(emptyLibrary()), null);
  assert.equal(library.records.length, 0);
  assert.equal(readStoredLibrary(null).records.length, 0);
});
