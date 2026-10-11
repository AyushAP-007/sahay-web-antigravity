import type { ComponentType } from "react";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  ChevronRight,
  Cpu,
  Info,
  Lock,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  Shield,
  Users,
  Watch,
} from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { SahayShell } from "@/components/sahay/shell";
import { Field, HelperText, Panel, SectionTitle, StatusIcon } from "@/components/sahay/ui";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { useSahay } from "@/lib/sahay/context";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <RequireUser>
      <SettingsScreen />
    </RequireUser>
  );
}

function SettingsScreen() {
  const { state, setActivityEnabled, updateSettings, signOut } = useSahay();
  const navigate = useNavigate();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const user = state.user;

  return (
    <SahayShell
      title="Settings"
      subtitle="Profile, safety preferences, and demo limits."
    >
      <SectionTitle title="Profile" />
      <Link to="/profile-edit">
        <Panel className="flex-row items-center gap-3">
          <span className="flex size-[47px] items-center justify-center rounded-2xl bg-secondary text-lg font-bold text-primary">
            {user?.name.trim().charAt(0).toUpperCase() ?? "S"}
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg">{user?.name}</p>
            <p className="text-[11px] text-muted-fg">{user?.email}</p>
            <p className="text-[11px] text-muted-fg">{user?.phone}</p>
          </div>
          <ChevronRight className="size-[18px] text-muted-fg" />
        </Panel>
      </Link>

      <SectionTitle title="Safety setup" />
      <Panel className="gap-1.5 py-2">
        <SettingLink
          icon={Users}
          title="Emergency contacts"
          detail="Manage your trusted list"
          to="/contacts"
        />
        <div className="ml-[47px] h-px bg-border" />
        <SettingLink
          icon={MapPin}
          title="Location permission"
          detail={
            state.location.permission === "granted"
              ? "Phone location allowed"
              : "Request when needed"
          }
          to="/location"
        />
        <div className="ml-[47px] h-px bg-border" />
        <SettingLink
          icon={Watch}
          title="Device information"
          detail="Simulation mode · no locket connected"
          to="/device"
        />
        <div className="ml-[47px] h-px bg-border" />
        <SettingLink
          icon={Navigation}
          title="Safe Journey"
          detail="Start a watched trip"
          to="/journey"
        />
        <div className="ml-[47px] h-px bg-border" />
        <SettingLink
          icon={Shield}
          title="Safety rules"
          detail="Risk score and response agent"
          to="/safety"
        />
      </Panel>

      <SectionTitle title="Response preferences" />
      <Panel className="gap-3">
        <div className="flex items-center gap-2.5">
          <StatusIcon className="bg-secondary text-primary">
            <Shield className="size-4" />
          </StatusIcon>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-fg">Confirm before escalate</p>
            <p className="text-[11px] leading-4 text-muted-fg">
              Ask “Are you okay?” before a simulated alert.
            </p>
          </div>
          <Switch
            checked={state.settings.confirmBeforeEscalate}
            onCheckedChange={(checked) =>
              updateSettings({ confirmBeforeEscalate: checked })
            }
            aria-label="Confirm before escalate"
          />
        </div>
        <div className="flex items-center gap-2.5 border-t border-border pt-3">
          <StatusIcon className="bg-warning-soft text-warning">
            <Info className="size-4" />
          </StatusIcon>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-fg">Night hours factor</p>
            <p className="text-[11px] leading-4 text-muted-fg">
              Add a small score boost between 22:00 and 05:00.
            </p>
          </div>
          <Switch
            checked={state.settings.nightRiskBoost}
            onCheckedChange={(checked) =>
              updateSettings({ nightRiskBoost: checked })
            }
            aria-label="Night risk boost"
          />
        </div>
        <HelperText>
          Check-in window is {state.settings.checkInSeconds} seconds in this
          demo so a presentation can finish the flow.
        </HelperText>
      </Panel>

      <SectionTitle title="Quiet call" />
      <Panel className="gap-3">
        <Field
          label="Name on the fake call"
          value={state.settings.quietCallName}
          onChange={(value) => updateSettings({ quietCallName: value })}
          placeholder="e.g. Meera Rao"
        />
        <Link to="/quiet-call" className="text-xs font-semibold text-primary">
          <span className="inline-flex items-center gap-1">
            <Phone className="size-3.5" />
            Open quiet call screen
          </span>
        </Link>
      </Panel>

      <SectionTitle title="Data on this device" />
      <Panel className="flex-row items-center gap-2.5">
        <StatusIcon className="bg-success-soft text-success">
          <Lock className="size-4" />
        </StatusIcon>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-fg">Local demo storage</p>
          <p className="text-[11px] leading-4 text-muted-fg">
            Profile, contacts, journeys, and events stay in this browser.
          </p>
        </div>
      </Panel>

      <SectionTitle
        title="Test & demo mode"
        action={<Badge tone="warning">On</Badge>}
      />
      <Panel>
        <div className="flex items-center gap-2.5">
          <StatusIcon className="bg-warning-soft text-warning">
            <Cpu className="size-4" />
          </StatusIcon>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-fg">Simulation mode</p>
            <p className="text-[11px] leading-4 text-muted-fg">
              Always on in this software prototype.
            </p>
          </div>
        </div>
        <HelperText>
          TEST SOS, device status, motion, and notification delivery are
          simulated. No physical locket is paired.
        </HelperText>
      </Panel>

      <SectionTitle title="Notification preferences" />
      <Panel>
        <div className="flex items-center gap-2.5">
          <StatusIcon className="bg-info-soft text-info">
            <Bell className="size-4" />
          </StatusIcon>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-fg">In-app activity</p>
            <p className="text-[11px] leading-4 text-muted-fg">
              Local status entries and test summaries.
            </p>
          </div>
          <Switch
            checked={state.settings.activityEnabled}
            onCheckedChange={setActivityEnabled}
            aria-label="Enable in-app activity"
          />
        </div>
        <div className="flex items-center gap-2 border-t border-border pt-2.5">
          <BellOff className="size-3.5 text-muted-fg" />
          <p className="text-[11px] leading-4 text-muted-fg">
            Push alerts, calls, and SMS are not configured.
          </p>
        </div>
      </Panel>

      <SectionTitle title="About Sahay" />
      <button type="button" onClick={() => setAboutOpen(true)} className="text-left">
        <Panel className="flex-row items-center gap-2.5">
          <StatusIcon className="bg-secondary text-primary">
            <Shield className="size-4" />
          </StatusIcon>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-fg">
              Sahay safety companion
            </p>
            <p className="text-[11px] text-muted-fg">
              Software prototype · Version 1.1
            </p>
          </div>
          <Info className="size-4 text-muted-fg" />
        </Panel>
      </button>

      <Panel className="flex-row items-start gap-2.5">
        <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
        <HelperText>
          Profile, trusted contacts, phone location, journeys, and TEST events
          stay on this device. The physical locket and live emergency services
          are later stages.
        </HelperText>
      </Panel>
      <button
        type="button"
        onClick={() => setSignOutOpen(true)}
        className="flex min-h-[50px] items-center justify-center gap-2 rounded-[14px] text-[13px] font-semibold text-danger shadow-[var(--shadow-border)]"
      >
        <LogOut className="size-4" />
        Sign out
      </button>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              Your profile, contacts, and history will remain saved on this
              device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-fg shadow-[0_0_0_1px_var(--color-danger)]"
              onClick={() => {
                signOut();
                void navigate({ to: "/" });
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sahay · software prototype</AlertDialogTitle>
            <AlertDialogDescription>
              Built for the EDI project: profiles, trusted contacts, real phone
              location, TEST SOS, Safe Journey, heuristic risk rules, and a
              deterministic response agent. The ESP32 locket, trained ML, SMS,
              and emergency calls are not connected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SahayShell>
  );
}

function SettingLink({
  icon: Icon,
  title,
  detail,
  to,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  to: "/contacts" | "/location" | "/device" | "/journey" | "/safety";
}) {
  return (
    <Link to={to} className="flex min-h-[52px] items-center gap-2.5">
      <StatusIcon className="bg-secondary text-primary">
        <Icon className="size-4" />
      </StatusIcon>
      <div className="flex-1">
        <p className="text-[13px] font-semibold text-fg">{title}</p>
        <p className="text-[11px] text-muted-fg">{detail}</p>
      </div>
      <ChevronRight className="size-4 text-muted-fg" />
    </Link>
  );
}
