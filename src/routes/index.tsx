import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  Battery,
  Clock,
  Info,
  MapPin,
  Navigation,
  Phone,
  Radio,
  Shield,
  Smartphone,
  Users,
  Watch,
} from "lucide-react";
import { HangingLocket, LocketMark } from "@/components/sahay/locket";
import { RequireUser } from "@/components/sahay/guard";
import { SahayShell } from "@/components/sahay/shell";
import {
  ActivityButton,
  AppColumn,
  EmptyState,
  Field,
  HelperText,
  OpeningScreen,
  Panel,
  SectionTitle,
  StatusIcon,
} from "@/components/sahay/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RiskMeter } from "@/components/sahay/risk-meter";
import { useSahay } from "@/lib/sahay/context";
import { eventLabel, readiness } from "@/lib/sahay/safety";
import { formatSahayDate, triggerRealSOS } from "@/lib/sahay/services";

export const Route = createFileRoute("/")({ component: IndexPage });

function IndexPage() {
  const { ready, state } = useSahay();
  if (!ready) return <OpeningScreen />;
  if (!state.user) return <AuthScreen />;
  return (
    <RequireUser>
      <HomeScreen />
    </RequireUser>
  );
}

function AuthScreen() {
  const { state, signIn, signUp, enterDemo } = useSahay();
  const [mode, setMode] = useState<"signin" | "signup">(
    state.profiles.length > 0 ? "signin" : "signup",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const submit = () => {
    setError("");
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "signup" && (!name.trim() || !phone.trim())) {
      setError("Add your name and phone number to create a profile.");
      return;
    }
    setBusy(true);
    const result =
      mode === "signup"
        ? signUp({ name: name.trim(), email: email.trim(), phone: phone.trim() })
        : signIn(email);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === "duplicate"
          ? "That email is already saved on this device. Sign in instead."
          : result.reason === "reserved"
            ? "That email belongs to the Asha demo. Use Open the companion, or choose another email."
            : "No profile on this device uses that email. Create one first. This does not create a profile.",
      );
    }
  };

  return (
    <AppColumn>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pt-9 pb-8">
        <div className="flex items-center gap-2.5">
          <LocketMark className="size-11" />
          <span className="text-sm font-bold tracking-[0.24em] text-primary">
            SAHAY
          </span>
          <span className="ml-auto rounded-full bg-warning-soft px-2.5 py-1.5 text-[9px] font-bold tracking-[0.08em] text-warning">
            DEMO MODE
          </span>
        </div>

        <div className="flex justify-center py-1">
          <HangingLocket className="h-36 w-28" />
        </div>

        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-[2rem] leading-[1.2] font-bold tracking-[-0.03em] text-fg">
            Safety, close at hand.
          </h1>
          <p className="max-w-[22rem] text-[15px] leading-relaxed text-muted-fg">
            A calm place to check your phone location, trusted contacts, and
            Sahay demo status.
          </p>
        </div>

        <Button
          type="button"
          data-testid="open-demo-button"
          onClick={() => enterDemo()}
        >
          Open the companion
        </Button>
        <p className="-mt-2 text-center text-[11px] text-muted-fg">
          Opens Asha’s demo profile. Profiles you created stay saved.
        </p>

        {state.profiles.length > 0 ? (
          <div className="flex items-center gap-2.5 rounded-[13px] bg-secondary p-3">
            <Smartphone className="size-4 shrink-0 text-primary" />
            <p className="flex-1 text-xs font-medium leading-tight text-secondary-fg">
              {state.profiles.length === 1
                ? "1 profile is saved on this device."
                : `${state.profiles.length} profiles are saved on this device.`}{" "}
              Sign in with the email you used.
            </p>
          </div>
        ) : null}

        <div className="flex rounded-[14px] bg-muted p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError("");
            }}
            className={`flex min-h-10 flex-1 items-center justify-center rounded-[11px] text-[13px] font-semibold ${
              mode === "signin" ? "bg-card text-fg shadow-[var(--shadow-border)]" : "text-muted-fg"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            className={`flex min-h-10 flex-1 items-center justify-center rounded-[11px] text-[13px] font-semibold ${
              mode === "signup" ? "bg-card text-fg shadow-[var(--shadow-border)]" : "text-muted-fg"
            }`}
          >
            Create profile
          </button>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {mode === "signup" ? (
            <>
              <Field
                label="Your name"
                value={name}
                onChange={setName}
                placeholder="e.g. Asha Rao"
                autoComplete="name"
              />
              <Field
                label="Phone number"
                value={phone}
                onChange={setPhone}
                placeholder="+91 98765 43210"
                type="tel"
                autoComplete="tel"
              />
            </>
          ) : null}
          <Field
            label="Email address"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
          />
          {error ? <p className="text-[13px] font-medium text-danger">{error}</p> : null}
          <Button type="submit" disabled={busy} data-testid="auth-submit">
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create demo profile"
                : "Continue with email"}
          </Button>
          <HelperText>
            The email only selects a demo profile stored in this browser. It is
            not a password and it is not account security.
          </HelperText>
        </form>

        <div className="flex items-start gap-2.5 border-t border-border pt-4">
          <Info className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="flex-1 text-xs leading-[1.5] text-muted-fg">
            Sahay is in Simulation Mode. It does not contact emergency services
            or a physical locket.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="self-center p-2 text-xs font-semibold text-primary"
        >
          How demo sign-in works
        </button>
      </div>

      <AlertDialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>About demo sign-in</AlertDialogTitle>
            <AlertDialogDescription>
              Email only picks a profile already saved in this browser. It does
              not check a password, and it is not a cloud account. Each profile
              keeps its own contacts, history, and journeys on this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppColumn>
  );
}

function HomeScreen() {
  const { state, runTestSOS } = useSahay();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [realOpen, setRealOpen] = useState(false);
  const [realMessage, setRealMessage] = useState("");
  const firstName = state.user?.name.trim().split(/\s+/)[0] ?? "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const recentEvents = state.events
    .filter((event) => event.userId === state.user?.id)
    .slice(0, 2);
  const locationText = state.location.available
    ? `${state.location.latitude?.toFixed(4)}, ${state.location.longitude?.toFixed(4)}`
    : "Not available yet";
  const enabledCount = state.contacts.filter(
    (item) => item.enabled && item.userId === state.user?.id,
  ).length;
  const ready = readiness(state);
  const activeJourney =
    state.journey && state.journey.status === "active" ? state.journey : null;

  const handleRealSOS = () => {
    try {
      triggerRealSOS();
    } catch (error) {
      setRealMessage(
        error instanceof Error
          ? error.message
          : "No locket hardware is connected.",
      );
      setRealOpen(true);
    }
  };

  const runTest = async () => {
    setRunning(true);
    try {
      const event = await runTestSOS();
      await navigate({ to: "/event/$id", params: { id: event.id } });
    } finally {
      setRunning(false);
    }
  };

  return (
    <SahayShell
      title={`${greeting}, ${firstName}`}
      subtitle="Your safety overview"
      rightAction={<ActivityButton />}
    >
      <div className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2.5">
        <Info className="size-4 shrink-0 text-warning" />
        <p className="flex-1 text-[11px] leading-4 font-semibold text-warning">
          Prototype · phone GPS · simulated locket · no live alerts
        </p>
      </div>

      <Panel
        className={
          ready.ready
            ? "gap-2 bg-success-soft shadow-none"
            : "gap-2 bg-warning-soft shadow-none"
        }
      >
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold tracking-[0.14em] text-muted-fg">
            READINESS
          </p>
          <Badge tone={ready.ready ? "success" : "warning"}>{ready.label}</Badge>
        </div>
        <p className="text-[13px] leading-5 font-medium text-fg">{ready.detail}</p>
      </Panel>

      {activeJourney ? (
        <Link to="/journey">
          <Panel className="gap-2 bg-secondary shadow-none">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-bold tracking-[0.14em] text-secondary-fg">
                SAFE JOURNEY
              </p>
              <Badge tone="info">Active</Badge>
            </div>
            <p className="text-sm font-semibold text-fg">
              {activeJourney.originLabel} → {activeJourney.destinationLabel}
            </p>
            <p className="text-[11px] text-muted-fg">
              Expected {formatSahayDate(activeJourney.expectedEndAt)}
            </p>
          </Panel>
        </Link>
      ) : null}

      <Panel className="gap-3.5 bg-primary p-[18px] text-primary-fg shadow-none">
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-1 text-[9px] font-bold tracking-[0.14em] text-inverse-muted">
              SAFETY STATUS
            </p>
            <p className="font-display text-[21px] font-semibold tracking-[-0.02em]">
              Simulation mode
            </p>
          </div>
          <span className="flex size-[42px] items-center justify-center rounded-[15px] bg-primary-fg/20">
            <Shield className="size-[22px]" />
          </span>
        </div>
        <p className="max-w-[310px] text-xs leading-[1.5] text-primary-fg/85">
          TEST SOS records an event on this device. Real emergency services are
          not contacted.
        </p>
        <div className="h-px bg-primary-fg/20" />
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest">REAL SOS</p>
            <p className="text-[11px] leading-4 text-inverse-muted">
              Hardware not connected
            </p>
          </div>
          <button
            type="button"
            data-testid="real-sos-unavailable"
            aria-label="Real SOS unavailable"
            onClick={handleRealSOS}
            className="flex size-[61px] items-center justify-center rounded-full border-2 border-primary-fg/50 text-base font-bold tracking-widest"
          >
            SOS
          </button>
        </div>
      </Panel>

      <Panel className="gap-3.5">
        <div className="flex items-center gap-2.5">
          <StatusIcon className="bg-danger-soft text-danger">
            <Radio className="size-[18px]" />
          </StatusIcon>
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-fg">TEST SOS</p>
            <p className="text-xs leading-[1.4] text-muted-fg">
              Creates a local event with phone location. Nothing is sent.
            </p>
          </div>
        </div>
        <Button
          variant="danger"
          disabled={running}
          data-testid="test-sos-button"
          onClick={() => setTestOpen(true)}
        >
          <AlertCircle className="size-4" />
          {running ? "Preparing test…" : "TEST SOS"}
        </Button>
      </Panel>

      <Panel>
        <RiskMeter risk={state.currentRisk} compact />
      </Panel>

      <SectionTitle
        title="Status at a glance"
        action={<Badge tone="info">Live + simulated</Badge>}
      />
      <Panel className="gap-2.5 py-3">
        <Link to="/device" className="flex min-h-[49px] items-center gap-2.5">
          <StatusIcon className="bg-secondary text-primary">
            <Watch className="size-4" />
          </StatusIcon>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-fg">Sahay locket</p>
            <p className="text-[13px] font-semibold text-fg">
              {state.device.connectionStatus === "connected"
                ? "Connected · demo"
                : "Disconnected"}
            </p>
          </div>
          <Badge
            tone={
              state.device.connectionStatus === "connected" ? "success" : "warning"
            }
          >
            {state.device.connectionStatus}
          </Badge>
        </Link>
        <div className="ml-[47px] h-px bg-border" />
        <Link to="/location" className="flex min-h-[49px] items-center gap-2.5">
          <StatusIcon className="bg-info-soft text-info">
            <MapPin className="size-4" />
          </StatusIcon>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-fg">Phone location</p>
            <p className="truncate text-[13px] font-semibold text-fg">
              {locationText}
            </p>
          </div>
          <Badge tone={state.location.available ? "success" : "neutral"}>
            {state.location.available ? "Available" : "Not checked"}
          </Badge>
        </Link>
        <div className="ml-[47px] h-px bg-border" />
        <Link to="/contacts" className="flex min-h-[49px] items-center gap-2.5">
          <StatusIcon className="bg-secondary text-primary">
            <Users className="size-4" />
          </StatusIcon>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-fg">Trusted contacts</p>
            <p className="text-[13px] font-semibold text-fg">
              {enabledCount} enabled
            </p>
          </div>
          <Badge tone={enabledCount > 0 ? "success" : "warning"}>
            {enabledCount > 0 ? "Set" : "Needed"}
          </Badge>
        </Link>
        <div className="ml-[47px] h-px bg-border" />
        <Link to="/device" className="flex min-h-[49px] items-center gap-2.5">
          <StatusIcon className="bg-warning-soft text-warning">
            <Battery className="size-4" />
          </StatusIcon>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-fg">Demo battery</p>
            <p className="text-[13px] font-semibold tabular-nums text-fg">
              {state.device.battery}%
            </p>
          </div>
          <Badge>Simulated</Badge>
        </Link>
      </Panel>

      <SectionTitle title="Quick access" />
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          to="/journey"
          className="flex min-h-[107px] flex-col gap-1.5 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-border)]"
        >
          <Navigation className="size-[19px] text-primary" />
          <p className="text-xs font-semibold text-fg">Safe Journey</p>
          <p className="text-[11px] text-muted-fg">
            {activeJourney ? "Journey in progress" : "Start a watched trip"}
          </p>
        </Link>
        <Link
          to="/quiet-call"
          className="flex min-h-[107px] flex-col gap-1.5 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-border)]"
        >
          <Phone className="size-[19px] text-primary" />
          <p className="text-xs font-semibold text-fg">Quiet call</p>
          <p className="text-[11px] text-muted-fg">A local fake-call screen</p>
        </Link>
        <Link
          to="/location"
          className="flex min-h-[107px] flex-col gap-1.5 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-border)]"
        >
          <MapPin className="size-[19px] text-primary" />
          <p className="text-xs font-semibold text-fg">Phone location</p>
          <p className="text-[11px] text-muted-fg">See coordinates</p>
        </Link>
        <Link
          to="/safety"
          className="flex min-h-[107px] flex-col gap-1.5 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-border)]"
        >
          <Shield className="size-[19px] text-primary" />
          <p className="text-xs font-semibold text-fg">Safety rules</p>
          <p className="text-[11px] text-muted-fg">Risk and response agent</p>
        </Link>
      </div>

      <SectionTitle
        title="Recent activity"
        action={
          <Link to="/history" className="text-xs font-semibold text-primary">
            View all
          </Link>
        }
      />
      <Panel className="py-2.5">
        {recentEvents.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No events yet"
            detail="TEST SOS, missed check-ins, and journey alerts appear here."
          />
        ) : (
          recentEvents.map((event, index) => (
            <div key={event.id}>
              {index > 0 ? <div className="ml-[47px] h-px bg-border" /> : null}
              <Link
                to="/event/$id"
                params={{ id: event.id }}
                className="flex min-h-[54px] items-center gap-2.5"
              >
                <StatusIcon className="bg-danger-soft text-danger">
                  <AlertCircle className="size-4" />
                </StatusIcon>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-fg">
                    {eventLabel(event.type)}
                  </p>
                  <p className="text-[11px] text-muted-fg">
                    {formatSahayDate(event.timestamp)}
                  </p>
                </div>
                <Badge tone={event.locationAvailable ? "success" : "warning"}>
                  {event.locationAvailable ? "Location saved" : "No location"}
                </Badge>
              </Link>
            </div>
          ))
        )}
      </Panel>

      <AlertDialog open={testOpen} onOpenChange={setTestOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run TEST SOS?</AlertDialogTitle>
            <AlertDialogDescription>
              This is a test only. It will not call emergency services, send a
              real SMS, or contact your emergency contacts. Sahay will try to
              read your phone location if you allow it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-fg shadow-[0_0_0_1px_var(--color-danger)]"
              onClick={() => {
                void runTest();
              }}
            >
              Run test
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={realOpen} onOpenChange={setRealOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Real SOS is not available</AlertDialogTitle>
            <AlertDialogDescription>{realMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SahayShell>
  );
}

