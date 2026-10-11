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
  isJourneyOverdue,
  needsCheckIn,
  riskFromState,
} from "./safety";
import {
  createActivityEntry,
  createEmergencyEvent,
  createEventNotification,
  createLocalId,
  createLocalNotification,
  createTestActivityEntries,
  defaultSettings,
  getEnabledContactCount,
  requestPhoneLocation,
  simulatedDeviceService,
} from "./services";
import { emptyLocation, loadLocalState, migrateState, saveLocalState } from "./storage";

function freshState(): SahayState {
  const device = simulatedDeviceService.createInitialStatus();
  const settings = { ...defaultSettings };
  const location = emptyLocation();
  return {
    user: null,
    savedProfile: null,
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

interface SahayContextValue {
  state: SahayState;
  ready: boolean;
  storageError: string | null;
  signUp: (profile: Omit<UserProfile, "id">) => boolean;
  signIn: (email: string) => boolean;
  enterDemo: () => boolean;
  signOut: () => void;
  updateProfile: (profile: Omit<UserProfile, "id">) => boolean;
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
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = loadLocalState();
      if (stored !== null) {
        const restored = migrateState(stored);
        if (restored) {
          stateRef.current = restored;
          setState(restored);
        }
      }
      setReady(true);
    } catch (error: unknown) {
      setStorageError(
        error instanceof Error
          ? `Unable to read this device’s saved data: ${error.message}`
          : "Unable to read this device’s saved data.",
      );
      setReady(true);
    }
  }, []);

  const commit = useCallback((next: SahayState) => {
    const scored = withRisk(next);
    stateRef.current = scored;
    setState(scored);
    try {
      saveLocalState(scored);
      setStorageError(null);
    } catch {
      setStorageError("A change could not be saved on this device.");
    }
  }, []);

  const signUp = useCallback(
    (profile: Omit<UserProfile, "id">) => {
      const current = stateRef.current;
      if (
        current.savedProfile &&
        current.savedProfile.email.toLowerCase() !== profile.email.toLowerCase()
      ) {
        return false;
      }
      const user: UserProfile = current.savedProfile
        ? { ...current.savedProfile, ...profile }
        : { id: createLocalId("user"), ...profile };
      commit({
        ...current,
        user,
        savedProfile: user,
        device: { ...current.device, userId: user.id },
      });
      return true;
    },
    [commit],
  );

  const signIn = useCallback((email: string) => {
    const current = stateRef.current;
    if (
      !current.savedProfile ||
      current.savedProfile.email.toLowerCase() !== email.trim().toLowerCase()
    ) {
      return false;
    }
    commit({ ...current, user: current.savedProfile });
    return true;
  }, [commit]);

  const enterDemo = useCallback(() => {
    const current = stateRef.current;
    if (current.savedProfile) {
      commit({ ...current, user: current.savedProfile });
      return true;
    }
    const user: UserProfile = {
      id: createLocalId("user"),
      name: "Asha Rao",
      email: "asha@sahay.demo",
      phone: "+91 98765 43210",
    };
    const contact: EmergencyContact = {
      id: createLocalId("contact"),
      userId: user.id,
      name: "Meera Rao",
      phone: "+91 98111 22001",
      relationship: "Sister",
      priority: 1,
      enabled: true,
    };
    commit({
      ...current,
      user,
      savedProfile: user,
      contacts: [contact],
      settings: { ...current.settings, quietCallName: "Meera Rao" },
      device: {
        ...simulatedDeviceService.createInitialStatus(),
        userId: user.id,
        connectionStatus: "connected",
        communicationStatus: "online",
        gpsStatus: "available",
        lastSeen: new Date().toISOString(),
      },
    });
    return true;
  }, [commit]);

  const signOut = useCallback(() => {
    commit({ ...stateRef.current, user: null, pendingCheckIn: null });
  }, [commit]);

  const updateProfile = useCallback(
    (profile: Omit<UserProfile, "id">) => {
      const current = stateRef.current;
      if (!current.user) return false;
      const updated = { ...current.user, ...profile };
      commit({ ...current, user: updated, savedProfile: updated });
      return true;
    },
    [commit],
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
    const location = await requestPhoneLocation();
    const current = stateRef.current;
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
    }): Promise<EmergencyEvent> => {
      const current = stateRef.current;
      if (!current.user) throw new Error("Sign in before recording an event.");
      const location = await requestPhoneLocation();
      const refreshed = stateRef.current;
      const user = refreshed.user;
      if (!user) throw new Error("Sign in before recording an event.");
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
      commit({
        ...refreshed,
        location,
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

  const runTestSOS = useCallback(async () => {
    return recordEvent({
      type: "TEST",
      confirmed: true,
      motionPattern: null,
      journeyId: stateRef.current.journey?.id ?? null,
      forceNotify: true,
    });
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
      const device = simulatedDeviceService.setMotion(current.device, pattern);
      const next = withRisk({ ...current, device });
      const highMotion =
        pattern === "fall" ||
        pattern === "impact" ||
        pattern === "struggle" ||
        pattern === "sudden_stop";
      const shouldPrompt =
        current.settings.confirmBeforeEscalate &&
        needsCheckIn(next.currentRisk.level) &&
        highMotion;
      const shouldAutoEscalate =
        !current.settings.confirmBeforeEscalate &&
        needsCheckIn(next.currentRisk.level) &&
        highMotion;
      const pending: PendingCheckIn | null = shouldPrompt
        ? {
            id: createLocalId("checkin"),
            reason: `Simulated ${pattern.replace("_", " ")} motion from the demo locket.`,
            motionPattern: pattern,
            risk: next.currentRisk,
            eventType: eventTypeFromMotion(pattern),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(
              Date.now() + (current.settings.checkInSeconds || CHECKIN_SECONDS_DEFAULT) * 1000,
            ).toISOString(),
            journeyId: current.journey?.id ?? null,
          }
        : current.pendingCheckIn;
      commit({
        ...next,
        pendingCheckIn: pending,
        activity: addDeviceActivity(
          `Motion set to ${pattern.replace("_", " ")} (simulated)`,
          "MPU6050 is not connected. This is a demonstration pattern for the risk rules.",
        ),
      });
      if (shouldAutoEscalate && current.user) {
        void recordEvent({
          type: eventTypeFromMotion(pattern),
          confirmed: false,
          motionPattern: pattern,
          journeyId: current.journey?.id ?? null,
          forceNotify: true,
        });
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
      if (!current.user) throw new Error("Sign in before starting a journey.");
      const location = await requestPhoneLocation();
      const refreshed = stateRef.current;
      const user = refreshed.user;
      if (!user) throw new Error("Sign in before starting a journey.");
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
    commit({
      ...current,
      journey: {
        ...current.journey,
        lastCheckInAt: new Date().toISOString(),
        lastKnownLat: current.location.latitude,
        lastKnownLng: current.location.longitude,
      },
      pendingCheckIn: null,
      activity: prependActivity(
        current,
        createActivityEntry(
          current.user.id,
          "Journey check-in",
          "You confirmed you are okay. No contacts were notified.",
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
    const seconds = current.settings.checkInSeconds || CHECKIN_SECONDS_DEFAULT;
    const pending: PendingCheckIn = {
      id: createLocalId("checkin"),
      reason: "This demo marked the journey as off the expected route.",
      motionPattern: current.device.sensor.motionPattern,
      risk: riskFromState({
        ...current,
        journey: { ...current.journey, offRouteSimulated: true },
      }),
      eventType: "JOURNEY_DEVIATION",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
      journeyId: current.journey.id,
    };
    commit({
      ...current,
      journey: { ...current.journey, offRouteSimulated: true },
      pendingCheckIn: pending,
      activity: prependActivity(
        current,
        createActivityEntry(
          current.user.id,
          "Off-route simulated",
          "No map-matching is running. This flag is for the project demonstration.",
          "journey",
        ),
      ),
    });
  }, [commit]);

  const endJourney = useCallback(
    (status: "completed" | "cancelled" = "completed") => {
      const current = stateRef.current;
      if (!current.user || !current.journey) return;
      commit({
        ...current,
        journey: { ...current.journey, status },
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

  const confirmCheckIn = useCallback(
    async (ok: boolean) => {
      const current = stateRef.current;
      const pending = current.pendingCheckIn;
      if (!current.user || !pending) return null;
      if (ok) {
        commit({
          ...current,
          pendingCheckIn: null,
          device: simulatedDeviceService.setMotion(current.device, "idle"),
          journey: current.journey
            ? { ...current.journey, lastCheckInAt: new Date().toISOString() }
            : current.journey,
          activity: prependActivity(
            current,
            createActivityEntry(
              current.user.id,
              "You confirmed you are okay",
              "The prototype did not notify contacts. Simulated motion returned to idle.",
              "checkin",
            ),
          ),
        });
        return null;
      }
      return recordEvent({
        type: pending.eventType,
        confirmed: false,
        motionPattern: pending.motionPattern,
        journeyId: pending.journeyId,
        forceNotify: true,
      });
    },
    [commit, recordEvent],
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
        void recordEvent({
          type:
            pending.eventType === "JOURNEY_DEVIATION"
              ? "JOURNEY_DEVIATION"
              : pending.journeyId
                ? "JOURNEY_TIMEOUT"
                : "CHECKIN_TIMEOUT",
          confirmed: false,
          motionPattern: pending.motionPattern,
          journeyId: pending.journeyId,
          forceNotify: true,
        }).finally(() => {
          handlingExpiry.current = false;
        });
        return;
      }

      let next = current;
      let changed = false;

      if (
        current.journey &&
        current.journey.status === "active" &&
        !current.journey.escalationFired &&
        !current.pendingCheckIn &&
        (isJourneyOverdue(current.journey) || current.journey.delaySimulated)
      ) {
        const seconds = current.settings.checkInSeconds || CHECKIN_SECONDS_DEFAULT;
        next = {
          ...current,
          journey: { ...current.journey, escalationFired: true, delaySimulated: true },
          pendingCheckIn: {
            id: createLocalId("checkin"),
            reason: "This journey is past the expected arrival time.",
            motionPattern: current.device.sensor.motionPattern,
            risk: riskFromState({
              ...current,
              journey: { ...current.journey, delaySimulated: true },
            }),
            eventType: "JOURNEY_TIMEOUT",
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
            journeyId: current.journey.id,
          },
        };
        changed = true;
      }

      const scored = riskFromState(next);
      if (
        scored.score !== next.currentRisk.score ||
        scored.level !== next.currentRisk.level
      ) {
        next = { ...next, currentRisk: scored };
        changed = true;
      }
      if (changed) commit(next);
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [commit, ready, recordEvent]);

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
