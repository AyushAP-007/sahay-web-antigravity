import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppSettings,
  DeviceStatus,
  EmergencyContact,
  EmergencyEvent,
  EventType,
  Journey,
  MotionPattern,
  PendingCheckIn,
  PhoneLocation,
  SahayState,
  UserProfile,
} from "./models";
import {
  chooseResponse,
  CHECKIN_SECONDS_DEFAULT,
  eventTypeFromMotion,
  riskFromState,
} from "./safety";
import { decideResponse } from "./agent";
import { nextDeviationObservation } from "./geo";
import {
  applyOkay,
  claimEscalation,
  escalationCommitAllowed,
  escalationEventType,
  incidentAction,
  journeyIncident,
  type EscalationFlight,
} from "./incidents";
import { simulatedSensorProvider } from "./sensors";
import {
  createActivityEntry,
  createEmergencyEvent,
  createEventNotification,
  createLocalId,
  createLocalNotification,
  createTestActivityEntries,
  getEnabledContactCount,
  requestPhoneLocation,
  simulatedDeviceService,
  watchPhoneLocation,
  locationAfterWatchUpdate,
} from "./services";
import { emptyLibrary, openDemoProfile, registerProfile, renameProfile, restoreProfile, saveActiveSession, signOutProfile, viewFromLibrary, type ProfileAccess, type ProfileLibrary } from "./profiles";
import { loadLocalState, readStoredLibrary, saveProfileLibrary } from "./storage";

function freshState(): SahayState {
  return viewFromLibrary(emptyLibrary());
}

interface SahayContextValue {
  state: SahayState;
  ready: boolean;
  storageError: string | null;
  signUp: (profile: Omit<UserProfile, "id">) => ProfileAccess;
  signIn: (email: string) => ProfileAccess;
  enterDemo: () => void;
  signOut: () => void;
  updateProfile: (profile: Omit<UserProfile, "id">) => ProfileAccess;
  addContact: (contact: Omit<EmergencyContact, "id" | "userId">) => boolean;
  updateContact: (
    id: string,
    contact: Omit<EmergencyContact, "id" | "userId">,
  ) => boolean;
  deleteContact: (id: string) => boolean;
  toggleContact: (id: string) => boolean;
  requestLocation: () => Promise<PhoneLocation>;
  runTestSOS: () => Promise<EmergencyEvent>;
  simulateConnection: (connectionStatus: DeviceStatus["connectionStatus"]) => void;
  simulateBattery: (low: boolean) => void;
  simulateGps: (available: boolean) => void;
  simulateMotion: (pattern: MotionPattern) => PendingCheckIn | null;
  startJourney: (input: {
    originLabel: string;
    destinationLabel: string;
    expectedMinutes: number;
    notes: string;
    originLat?: number | null;
    originLng?: number | null;
    destLat?: number | null;
    destLng?: number | null;
    selectedRoute?: Journey["selectedRoute"];
  }) => Promise<Journey>;
  checkInJourney: () => void;
  simulateJourneyDelay: () => void;
  simulateJourneyOffRoute: () => void;
  endJourney: (status?: "completed" | "cancelled") => void;
  setJourneyLocationWatch: (requested: boolean) => void;
  confirmCheckIn: (ok: boolean) => Promise<EmergencyEvent | null>;
  markNotificationsRead: () => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  setActivityEnabled: (enabled: boolean) => void;
}

const SahayContext = createContext<SahayContextValue | null>(null);

function withRisk(next: SahayState, extras?: { userConfirmedOk?: boolean }): SahayState {
  return { ...next, currentRisk: riskFromState(next, extras) };
}

function prependActivity(state: SahayState, entry: ReturnType<typeof createActivityEntry>): SahayState["activity"] {
  if (!state.settings.activityEnabled) return state.activity;
  return [entry, ...state.activity].slice(0, 100);
}

export function SahayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SahayState>(freshState);
  const stateRef = useRef(state);
  const libraryRef = useRef<ProfileLibrary>(emptyLibrary());
  const escalationRef = useRef<{
    flight: EscalationFlight;
    promise: Promise<EmergencyEvent | null>;
  } | null>(null);
  const watchStopRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const publish = useCallback((library: ProfileLibrary) => {
    libraryRef.current = library;
    const view = viewFromLibrary(library);
    stateRef.current = view;
    setState(view);
    try {
      saveProfileLibrary(library);
      setStorageError(null);
    } catch {
      setStorageError("A change could not be saved on this device.");
    }
  }, []);

  useEffect(() => {
    try {
      const stored = loadLocalState();
      publish(readStoredLibrary(stored));
      setReady(true);
    } catch (error: unknown) {
      setStorageError(
        error instanceof Error
          ? `Unable to read this device’s saved data: ${error.message}`
          : "Unable to read this device’s saved data.",
      );
      setReady(true);
    }
  }, [publish]);

  const commit = useCallback(
    (next: SahayState) => {
      const scored = withRisk(next);
      publish(saveActiveSession(libraryRef.current, scored));
    },
    [publish],
  );

  const signUp = useCallback(
    (profile: Omit<UserProfile, "id">) => {
      const base = stateRef.current.user
        ? saveActiveSession(libraryRef.current, stateRef.current)
        : libraryRef.current;
      const result = registerProfile(base, profile, createLocalId("user"));
      if (result.result.ok) publish(result.library);
      return result.result;
    },
    [publish],
  );

  const signIn = useCallback(
    (email: string) => {
      const base = stateRef.current.user
        ? saveActiveSession(libraryRef.current, stateRef.current)
        : libraryRef.current;
      const result = restoreProfile(base, email);
      if (result.result.ok) publish(result.library);
      return result.result;
    },
    [publish],
  );

  const enterDemo = useCallback(() => {
    const base = stateRef.current.user
      ? saveActiveSession(libraryRef.current, stateRef.current)
      : libraryRef.current;
    publish(openDemoProfile(base));
  }, [publish]);

  const signOut = useCallback(() => {
    publish(signOutProfile(libraryRef.current, stateRef.current));
  }, [publish]);

  const updateProfile = useCallback(
    (profile: Omit<UserProfile, "id">) => {
      const current = stateRef.current;
      if (!current.user) return { ok: false, reason: "unknown" } as const;
      const result = renameProfile(libraryRef.current, current.user.id, profile);
      if (result.result.ok) publish(result.library);
      return result.result;
    },
    [publish],
  );

  const addContact = useCallback(
    (contact: Omit<EmergencyContact, "id" | "userId">) => {
      const current = stateRef.current;
      if (!current.user) return false;
      const nextContact: EmergencyContact = {
        id: createLocalId("contact"),
        userId: current.user.id,
        ...contact,
      };
      commit({ ...current, contacts: [...current.contacts, nextContact] });
      return true;
    },
    [commit],
  );

  const updateContact = useCallback(
    (id: string, contact: Omit<EmergencyContact, "id" | "userId">) => {
      const current = stateRef.current;
      if (!current.user) return false;
      commit({
        ...current,
        contacts: current.contacts.map((item) =>
          item.id === id && item.userId === current.user?.id
            ? { ...item, ...contact }
            : item,
        ),
      });
      return true;
    },
    [commit],
  );

  const deleteContact = useCallback(
    (id: string) => {
      const current = stateRef.current;
      if (!current.user) return false;
      commit({
        ...current,
        contacts: current.contacts.filter(
          (item) => item.id !== id || item.userId !== current.user?.id,
        ),
      });
      return true;
    },
    [commit],
  );

  const toggleContact = useCallback(
    (id: string) => {
      const current = stateRef.current;
      const existing = current.contacts.find(
        (item) => item.id === id && item.userId === current.user?.id,
      );
      if (!current.user || !existing) return false;
      commit({
        ...current,
        contacts: current.contacts.map((item) =>
          item.id === id ? { ...item, enabled: !item.enabled } : item,
        ),
      });
      return true;
    },
    [commit],
  );

  const requestLocation = useCallback(async () => {
    const ownerId = stateRef.current.user?.id ?? null;
    const location = await requestPhoneLocation();
    const current = stateRef.current;
    if ((current.user?.id ?? null) !== ownerId) return location;
    commit({
      ...current,
      location,
      activity: current.user
        ? prependActivity(
            current,
            createActivityEntry(
              current.user.id,
              location.available ? "Phone location updated" : "Location check failed",
              location.available
                ? "Foreground phone GPS was captured."
                : location.message ?? "Location was not available.",
              "location",
            ),
          )
        : current.activity,
    });
    return location;
  }, [commit]);

  const recordEvent = useCallback(
    async (input: {
      type: EventType;
      confirmed: boolean | null;
      motionPattern: MotionPattern | null;
      journeyId: string | null;
      forceNotify?: boolean;
      flight?: EscalationFlight;
      requireActiveJourney?: boolean;
    }): Promise<EmergencyEvent | null> => {
      const current = stateRef.current;
      const ownerId = current.user?.id;
      if (!ownerId) throw new Error("Sign in before recording an event.");
      const location = await requestPhoneLocation();
      const refreshed = stateRef.current;
      const user = refreshed.user;
      if (!user || user.id !== ownerId) {
        throw new Error("Sign in before recording an event.");
      }
      if (input.flight && !escalationCommitAllowed(input.flight, refreshed)) {
        return null;
      }
      if (
        input.requireActiveJourney &&
        (!refreshed.journey ||
          refreshed.journey.id !== input.journeyId ||
          refreshed.journey.status !== "active")
      ) {
        return null;
      }
      const enabledContacts = getEnabledContactCount(refreshed.contacts, user.id);
      const risk = riskFromState({ ...refreshed, location });
      const responseAction = input.forceNotify
        ? "notify_contacts"
        : input.type === "TEST" || input.type === "MANUAL_SOS"
          ? "notify_contacts"
          : chooseResponse(risk.level, refreshed.settings.confirmBeforeEscalate);
      const event = createEmergencyEvent({
        userId: user.id,
        type: input.type,
        location,
        device: refreshed.device,
        enabledContacts,
        riskLevel: input.type === "TEST" || input.type === "MANUAL_SOS" ? "critical" : risk.level,
        riskScore: input.type === "TEST" || input.type === "MANUAL_SOS" ? 100 : risk.score,
        riskReasons:
          input.type === "TEST" || input.type === "MANUAL_SOS"
            ? ["Manual test / SOS action"]
            : risk.reasons,
        responseAction,
        motionPattern: input.motionPattern,
        journeyId: input.journeyId,
        confirmed: input.confirmed,
      });
      const notes = createEventNotification(user.id, event);
      const activity = createTestActivityEntries(user.id, event);
      const journey =
        refreshed.journey &&
        input.journeyId &&
        refreshed.journey.id === input.journeyId
          ? { ...refreshed.journey, escalationFired: true }
          : refreshed.journey;
      commit({
        ...refreshed,
        location,
        journey,
        events: [event, ...refreshed.events],
        notifications: [notes, ...refreshed.notifications].slice(0, 80),
        activity: refreshed.settings.activityEnabled
          ? [...activity, ...refreshed.activity].slice(0, 100)
          : refreshed.activity,
        pendingCheckIn: null,
      });
      return event;
    },
    [commit],
  );

  const escalatePending = useCallback(
    (pending: PendingCheckIn) => {
      const ownerId = stateRef.current.user?.id;
      if (!ownerId) return Promise.resolve(null);
      const existing = escalationRef.current;
      if (existing?.flight.pendingId === pending.id) return existing.promise;
      const claim = claimEscalation(existing?.flight ?? null, pending, ownerId);
      if (!claim.started) return existing?.promise ?? Promise.resolve(null);
      const promise = recordEvent({
        type: escalationEventType(pending),
        confirmed: false,
        motionPattern: pending.motionPattern,
        journeyId: pending.journeyId,
        forceNotify: true,
        flight: claim.flight,
      }).finally(() => {
        if (escalationRef.current?.flight.pendingId === pending.id) {
          escalationRef.current = null;
        }
      });
      escalationRef.current = { flight: claim.flight, promise };
      return promise;
    },
    [recordEvent],
  );

  const runTestSOS = useCallback(async () => {
    const event = await recordEvent({
      type: "TEST",
      confirmed: true,
      motionPattern: null,
      journeyId: stateRef.current.journey?.id ?? null,
      forceNotify: true,
    });
    if (!event) throw new Error("TEST SOS could not be recorded.");
    return event;
  }, [recordEvent]);

  const addDeviceActivity = useCallback((title: string, detail: string) => {
    const current = stateRef.current;
    if (!current.user || !current.settings.activityEnabled) return current.activity;
    return [
      createActivityEntry(current.user.id, title, detail, "device"),
      ...current.activity,
    ].slice(0, 100);
  }, []);

  const simulateConnection = useCallback(
    (connectionStatus: DeviceStatus["connectionStatus"]) => {
      const current = stateRef.current;
      const connected = connectionStatus === "connected";
      commit({
        ...current,
        activity: addDeviceActivity(
          connected
            ? "Device connected (simulated)"
            : "Device disconnected (simulated)",
          "Simulation control changed the demo locket state.",
        ),
        device: simulatedDeviceService.setConnection(
          current.device,
          connectionStatus,
        ),
      });
    },
    [addDeviceActivity, commit],
  );

  const simulateBattery = useCallback(
    (low: boolean) => {
      const current = stateRef.current;
      commit({
        ...current,
        device: simulatedDeviceService.setLowBattery(current.device, low),
        activity: addDeviceActivity(
          low ? "Low battery (simulated)" : "Battery restored (simulated)",
          `Demo battery is now ${low ? 14 : 76}%.`,
        ),
        notifications: current.user && low
          ? [
              createLocalNotification({
                userId: current.user.id,
                title: "Low battery (simulated)",
                body: "Demo locket battery is at 14%. This is not a physical device warning.",
                kind: "device",
              }),
              ...current.notifications,
            ].slice(0, 80)
          : current.notifications,
      });
    },
    [addDeviceActivity, commit],
  );

  const simulateGps = useCallback(
    (available: boolean) => {
      const current = stateRef.current;
      commit({
        ...current,
        device: simulatedDeviceService.setGpsAvailability(
          current.device,
          available,
        ),
        activity: addDeviceActivity(
          available
            ? "Device GPS available (simulated)"
            : "GPS unavailable (simulated)",
          "This is a locket demo status; phone location is managed separately.",
        ),
      });
    },
    [addDeviceActivity, commit],
  );

  const simulateMotion = useCallback(
    (pattern: MotionPattern) => {
      const current = stateRef.current;
      const reading = simulatedSensorProvider.read(pattern);
      const device = reading
        ? {
            ...current.device,
            lastSeen: reading.sampledAt,
            sensor: {
              motionPattern: reading.motionPattern,
              accelMagnitude: reading.accelMagnitude,
              orientation: reading.orientation,
              sampledAt: reading.sampledAt,
              simulated: true as const,
            },
          }
        : simulatedDeviceService.setMotion(current.device, pattern);
      const next = withRisk({ ...current, device });
      const decision = incidentAction(
        next.currentRisk.level,
        current.settings.confirmBeforeEscalate,
      );
      const agent = decideResponse({
        risk: next.currentRisk,
        confirmBeforeEscalate: current.settings.confirmBeforeEscalate,
      });
      const pending: PendingCheckIn | null =
        decision === "prompt"
          ? {
              id: createLocalId("checkin"),
              reason: agent.reason,
              motionPattern: pattern,
              risk: next.currentRisk,
              eventType: eventTypeFromMotion(pattern),
              createdAt: new Date().toISOString(),
              expiresAt: new Date(
                Date.now() + (current.settings.checkInSeconds || CHECKIN_SECONDS_DEFAULT) * 1000,
              ).toISOString(),
              journeyId: current.journey?.status === "active" ? current.journey.id : null,
            }
          : decision === "notify"
            ? null
            : current.pendingCheckIn;
      commit({
        ...next,
        pendingCheckIn: pending,
        activity: addDeviceActivity(
          `Motion set to ${pattern.replaceAll("_", " ")} (simulated)`,
          "MPU6050 is not connected. This is a demonstration pattern for the risk rules.",
        ),
      });
      if (decision === "notify" && current.user) {
        void recordEvent({
          type: eventTypeFromMotion(pattern),
          confirmed: false,
          motionPattern: pattern,
          journeyId: current.journey?.status === "active" ? current.journey.id : null,
          forceNotify: true,
        }).catch(() => undefined);
      }
      return pending;
    },
    [addDeviceActivity, commit, recordEvent],
  );

  const startJourney = useCallback(
    async (input: {
      originLabel: string;
      destinationLabel: string;
      expectedMinutes: number;
      notes: string;
      originLat?: number | null;
      originLng?: number | null;
      destLat?: number | null;
      destLng?: number | null;
      selectedRoute?: Journey["selectedRoute"];
    }) => {
      const current = stateRef.current;
      const ownerId = current.user?.id;
      if (!ownerId) throw new Error("Sign in before starting a journey.");
      const location = await requestPhoneLocation();
      const refreshed = stateRef.current;
      const user = refreshed.user;
      if (!user || user.id !== ownerId) {
        throw new Error("Sign in before starting a journey.");
      }
      const startedAt = new Date();
      const originLat = input.originLat ?? location.latitude;
      const originLng = input.originLng ?? location.longitude;
      const journey: Journey = {
        id: createLocalId("journey"),
        userId: user.id,
        status: "active",
        originLabel: input.originLabel.trim() || "Current location",
        destinationLabel: input.destinationLabel.trim(),
        originLat,
        originLng,
        destLat: input.destLat ?? null,
        destLng: input.destLng ?? null,
        expectedMinutes: input.expectedMinutes,
        startedAt: startedAt.toISOString(),
        expectedEndAt: new Date(
          startedAt.getTime() + input.expectedMinutes * 60000,
        ).toISOString(),
        lastCheckInAt: startedAt.toISOString(),
        lastKnownLat: location.latitude ?? originLat,
        lastKnownLng: location.longitude ?? originLng,
        notes: input.notes.trim(),
        offRouteSimulated: false,
        delaySimulated: false,
        escalationFired: false,
        selectedRoute: input.selectedRoute ?? null,
        liveOffRoute: false,
        locationWatchRequested: false,
        deviationStreak: 0,
        locationWatchNote: input.selectedRoute
          ? "Location watching is off until you turn it on. Background tracking is not available."
          : "This journey has no walking line, so GPS deviation will not be judged.",
      };
      commit({
        ...refreshed,
        location,
        journey,
        activity: prependActivity(
          refreshed,
          createActivityEntry(
            user.id,
            "Safe Journey started",
            `${journey.originLabel} → ${journey.destinationLabel} · ${input.expectedMinutes} min`,
            "journey",
          ),
        ),
        notifications: [
          createLocalNotification({
            userId: user.id,
            title: "Safe Journey is on",
            body: `Expected arrival in ${input.expectedMinutes} minutes. Check-ins stay on this device.`,
            kind: "journey",
          }),
          ...refreshed.notifications,
        ].slice(0, 80),
      });
      return journey;
    },
    [commit],
  );

  const checkInJourney = useCallback(() => {
    const current = stateRef.current;
    if (!current.user || !current.journey || current.journey.status !== "active") return;
    const resolved = applyOkay(current);
    commit({
      ...resolved,
      activity: prependActivity(
        current,
        createActivityEntry(
          current.user.id,
          "Journey check-in",
          "You confirmed you are okay. The current warning was cleared, and no contacts were notified.",
          "checkin",
        ),
      ),
    });
  }, [commit]);

  const simulateJourneyDelay = useCallback(() => {
    const current = stateRef.current;
    if (!current.user || !current.journey || current.journey.status !== "active") return;
    const journey: Journey = {
      ...current.journey,
      delaySimulated: true,
      expectedEndAt: new Date(Date.now() - 1000).toISOString(),
    };
    commit({
      ...current,
      journey,
      activity: prependActivity(
        current,
        createActivityEntry(
          current.user.id,
          "Journey delay simulated",
          "Expected arrival was marked overdue for this demonstration.",
          "journey",
        ),
      ),
    });
  }, [commit]);

  const simulateJourneyOffRoute = useCallback(() => {
    const current = stateRef.current;
    if (!current.user || !current.journey || current.journey.status !== "active") return;
    const projectedJourney = { ...current.journey, offRouteSimulated: true };
    const projected = riskFromState({ ...current, journey: projectedJourney });
    const decision = incidentAction(
      projected.level,
      current.settings.confirmBeforeEscalate,
    );
    if (decision === "notify") {
      commit({
        ...current,
        journey: { ...projectedJourney, escalationFired: true },
        pendingCheckIn: null,
        currentRisk: projected,
        activity: prependActivity(
          current,
          createActivityEntry(
            current.user.id,
            "Off-route simulated",
            "Confirmation is off for this score, so a simulated alert was recorded. No map-matching is running.",
            "journey",
          ),
        ),
      });
      void recordEvent({
        type: "JOURNEY_DEVIATION",
        confirmed: false,
        motionPattern: current.device.sensor.motionPattern,
        journeyId: current.journey.id,
        forceNotify: true,
        requireActiveJourney: true,
      }).catch(() => undefined);
      return;
    }
    if (decision === "observe") {
      commit({
        ...current,
        journey: projectedJourney,
        currentRisk: projected,
        activity: prependActivity(
          current,
          createActivityEntry(
            current.user.id,
            "Off-route simulated",
            "The score stayed in the observe band, so Sahay did not ask or send a simulated alert.",
            "journey",
          ),
        ),
      });
      return;
    }
    const seconds = current.settings.checkInSeconds || CHECKIN_SECONDS_DEFAULT;
    const pending: PendingCheckIn = {
      id: createLocalId("checkin"),
      reason: `This demo marked the journey as off the expected route. ${decideResponse({ risk: projected, confirmBeforeEscalate: current.settings.confirmBeforeEscalate }).reason}`,
      motionPattern: current.device.sensor.motionPattern,
      risk: projected,
      eventType: "JOURNEY_DEVIATION",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
      journeyId: current.journey.id,
    };
    commit({
      ...current,
      journey: projectedJourney,
      pendingCheckIn: pending,
      currentRisk: projected,
      activity: prependActivity(
        current,
        createActivityEntry(
          current.user.id,
          "Off-route simulated",
          "No map-matching is running. This flag asks if you are okay.",
          "journey",
        ),
      ),
    });
  }, [commit, recordEvent]);

  const endJourney = useCallback(
    (status: "completed" | "cancelled" = "completed") => {
      const current = stateRef.current;
      if (!current.user || !current.journey) return;
      commit({
        ...current,
        journey: {
          ...current.journey,
          status,
          locationWatchRequested: false,
          locationWatchNote: "Location watching stopped.",
        },
        pendingCheckIn:
          current.pendingCheckIn?.journeyId === current.journey.id
            ? null
            : current.pendingCheckIn,
        activity: prependActivity(
          current,
          createActivityEntry(
            current.user.id,
            status === "completed" ? "Journey ended" : "Journey cancelled",
            `${current.journey.originLabel} → ${current.journey.destinationLabel}`,
            "journey",
          ),
        ),
      });
    },
    [commit],
  );

  const setJourneyLocationWatch = useCallback((requested: boolean) => {
    const current = stateRef.current;
    if (!current.user || !current.journey || current.journey.status !== "active") return;
    commit({
      ...current,
      journey: {
        ...current.journey,
        locationWatchRequested: requested,
        locationWatchNote: requested
          ? "Foreground updates requested. Watching stops when the journey ends, you turn it off, or you sign out. Background tracking is not available."
          : "Location watching is off.",
      },
    });
  }, [commit]);

  const confirmCheckIn = useCallback(
    async (ok: boolean) => {
      const current = stateRef.current;
      const pending = current.pendingCheckIn;
      if (!current.user || !pending) return null;
      if (ok) {
        const resolved = applyOkay(current);
        commit({
          ...resolved,
          activity: prependActivity(
            current,
            createActivityEntry(
              current.user.id,
              "You confirmed you are okay",
              "The warning was cleared and the risk score was recalculated. Contacts were not notified.",
              "checkin",
            ),
          ),
        });
        return null;
      }
      return escalatePending(pending);
    },
    [commit, escalatePending],
  );

  const markNotificationsRead = useCallback(() => {
    const current = stateRef.current;
    if (current.notifications.every((item) => item.read)) return;
    commit({
      ...current,
      notifications: current.notifications.map((item) => ({ ...item, read: true })),
    });
  }, [commit]);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const current = stateRef.current;
      commit({ ...current, settings: { ...current.settings, ...patch } });
    },
    [commit],
  );

  const setActivityEnabled = useCallback(
    (enabled: boolean) => {
      updateSettings({ activityEnabled: enabled });
    },
    [updateSettings],
  );

  const handlingExpiry = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const current = stateRef.current;
      if (!current.user) return;

      if (
        current.pendingCheckIn &&
        Date.now() >= new Date(current.pendingCheckIn.expiresAt).getTime()
      ) {
        if (handlingExpiry.current) return;
        handlingExpiry.current = true;
        const pending = current.pendingCheckIn;
        void escalatePending(pending)
          .catch(() => null)
          .finally(() => {
            handlingExpiry.current = false;
          });
        return;
      }

      const incident = journeyIncident(current);
      if (incident === "notify" && current.journey) {
        const journey = {
          ...current.journey,
          delaySimulated: true,
          escalationFired: true,
        };
        commit({ ...current, journey, pendingCheckIn: null });
        void recordEvent({
          type: "JOURNEY_TIMEOUT",
          confirmed: false,
          motionPattern: current.device.sensor.motionPattern,
          journeyId: current.journey.id,
          forceNotify: true,
          requireActiveJourney: true,
        }).catch(() => undefined);
        return;
      }
      if (incident === "prompt" && current.journey) {
        const seconds = current.settings.checkInSeconds || CHECKIN_SECONDS_DEFAULT;
        const journey = {
          ...current.journey,
          delaySimulated: true,
          escalationFired: true,
        };
        const risk = riskFromState({ ...current, journey });
        commit({
          ...current,
          journey,
          pendingCheckIn: {
            id: createLocalId("checkin"),
            reason: `This journey is past the expected arrival time. ${decideResponse({ risk, confirmBeforeEscalate: current.settings.confirmBeforeEscalate }).reason}`,
            motionPattern: current.device.sensor.motionPattern,
            risk,
            eventType: "JOURNEY_TIMEOUT",
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
            journeyId: current.journey.id,
          },
        });
        return;
      }

      const scored = riskFromState(current);
      if (
        scored.score !== current.currentRisk.score ||
        scored.level !== current.currentRisk.level
      ) {
        commit({ ...current, currentRisk: scored });
      }
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [commit, escalatePending, ready, recordEvent]);

  useEffect(() => {
    watchStopRef.current?.();
    watchStopRef.current = null;
    if (!ready || !state.user) return;
    const active = stateRef.current.journey;
    if (!active || active.status !== "active" || !active.locationWatchRequested) return;
    const stop = watchPhoneLocation((location) => {
      const current = stateRef.current;
      const journey = current.journey;
      if (
        !current.user ||
        !journey ||
        journey.status !== "active" ||
        !journey.locationWatchRequested
      ) {
        return;
      }
      const observation = nextDeviationObservation({
        previousStreak: journey.deviationStreak ?? 0,
        previouslyOffRoute: journey.liveOffRoute ?? false,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        geometry: journey.selectedRoute?.geometry ?? null,
      });
      const note =
        !location.available && location.message ? location.message : observation.note;
      const phone = { ...locationAfterWatchUpdate(current.location, location), message: note };
      const nextJourney: Journey = {
        ...journey,
        deviationStreak: observation.streak,
        liveOffRoute: observation.liveOffRoute,
        locationWatchNote: note,
        lastKnownLat: location.latitude ?? journey.lastKnownLat,
        lastKnownLng: location.longitude ?? journey.lastKnownLng,
      };
      const becameOffRoute = observation.liveOffRoute && !journey.liveOffRoute;
      if (becameOffRoute && !current.pendingCheckIn) {
        const projected = riskFromState({
          ...current,
          journey: nextJourney,
          location,
        });
        const decision = incidentAction(
          projected.level,
          current.settings.confirmBeforeEscalate,
        );
        if (decision === "notify") {
          commit({
            ...current,
            location: phone,
            journey: { ...nextJourney, escalationFired: true },
            pendingCheckIn: null,
            currentRisk: projected,
          });
          void recordEvent({
            type: "JOURNEY_DEVIATION",
            confirmed: false,
            motionPattern: current.device.sensor.motionPattern,
            journeyId: journey.id,
            forceNotify: true,
            requireActiveJourney: true,
          }).catch(() => undefined);
          return;
        }
        if (decision === "prompt") {
          const seconds = current.settings.checkInSeconds || CHECKIN_SECONDS_DEFAULT;
          commit({
            ...current,
            location: phone,
            journey: nextJourney,
            currentRisk: projected,
            pendingCheckIn: {
              id: createLocalId("checkin"),
              reason: observation.note,
              motionPattern: current.device.sensor.motionPattern,
              risk: projected,
              eventType: "JOURNEY_DEVIATION",
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
              journeyId: journey.id,
            },
          });
          return;
        }
      }
      commit({
        ...current,
        location: phone,
        journey: nextJourney,
      });
    });
    watchStopRef.current = stop;
    return () => {
      stop();
      if (watchStopRef.current === stop) watchStopRef.current = null;
    };
  }, [
    commit,
    ready,
    recordEvent,
    state.journey?.id,
    state.journey?.locationWatchRequested,
    state.journey?.status,
    state.user?.id,
  ]);

  const value = useMemo<SahayContextValue>(
    () => ({
      state,
      ready,
      storageError,
      signUp,
      signIn,
      enterDemo,
      signOut,
      updateProfile,
      addContact,
      updateContact,
      deleteContact,
      toggleContact,
      requestLocation,
      runTestSOS,
      simulateConnection,
      simulateBattery,
      simulateGps,
      simulateMotion,
      startJourney,
      checkInJourney,
      simulateJourneyDelay,
      simulateJourneyOffRoute,
      endJourney,
      setJourneyLocationWatch,
      confirmCheckIn,
      markNotificationsRead,
      updateSettings,
      setActivityEnabled,
    }),
    [
      state,
      ready,
      storageError,
      signUp,
      signIn,
      enterDemo,
      signOut,
      updateProfile,
      addContact,
      updateContact,
      deleteContact,
      toggleContact,
      requestLocation,
      runTestSOS,
      simulateConnection,
      simulateBattery,
      simulateGps,
      simulateMotion,
      startJourney,
      checkInJourney,
      simulateJourneyDelay,
      simulateJourneyOffRoute,
      endJourney,
      setJourneyLocationWatch,
      confirmCheckIn,
      markNotificationsRead,
      updateSettings,
      setActivityEnabled,
    ],
  );

  return <SahayContext.Provider value={value}>{children}</SahayContext.Provider>;
}

export function useSahay(): SahayContextValue {
  const context = useContext(SahayContext);
  if (!context) throw new Error("useSahay must be used inside SahayProvider.");
  return context;
}
