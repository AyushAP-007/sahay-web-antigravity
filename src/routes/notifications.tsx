import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  BellOff,
  MapPin,
  Navigation,
  Watch,
} from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { SahayShell } from "@/components/sahay/shell";
import {
  EmptyState,
  HelperText,
  Panel,
  SectionTitle,
  StatusIcon,
} from "@/components/sahay/ui";
import { Badge } from "@/components/ui/badge";
import { useSahay } from "@/lib/sahay/context";
import { formatSahayDate } from "@/lib/sahay/services";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <RequireUser>
      <NotificationsScreen />
    </RequireUser>
  );
}

function NotificationsScreen() {
  const { state, markNotificationsRead } = useSahay();
  useEffect(() => {
    markNotificationsRead();
  }, [markNotificationsRead]);

  const notes = state.notifications.filter(
    (item) => item.userId === state.user?.id,
  );
  const iconForKind = {
    sos: AlertCircle,
    device: Watch,
    location: MapPin,
    system: Bell,
    journey: Navigation,
    checkin: Bell,
  } as const;

  return (
    <SahayShell
      title="Activity & alerts"
      subtitle="In-app demo status only. Push notifications are not enabled."
      tabbed={false}
      backTo="/"
    >
      <Panel className="flex-row items-start gap-2.5">
        <BellOff className="mt-0.5 size-4 shrink-0 text-info" />
        <HelperText>
          No real push alert, SMS, or call is delivered by this screen.
        </HelperText>
      </Panel>
      <SectionTitle title="Notifications" />
      {notes.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Bell}
            title="Nothing to report"
            detail="TEST SOS, journeys, and device simulation changes appear here."
          />
        </Panel>
      ) : (
        notes.map((entry) => {
          const Icon = iconForKind[entry.kind] ?? Bell;
          const inner = (
            <Panel className="flex-row items-start gap-2.5 p-3.5">
              <StatusIcon
                className={
                  entry.kind === "sos"
                    ? "bg-danger-soft text-danger"
                    : "bg-secondary text-primary"
                }
              >
                <Icon className="size-4" />
              </StatusIcon>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-fg">{entry.title}</p>
                <p className="text-[11px] leading-4 text-muted-fg">
                  {entry.body}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-fg">
                  {formatSahayDate(entry.timestamp)}
                </p>
              </div>
              <Badge>{entry.eventId ? "Event" : "Local"}</Badge>
            </Panel>
          );
          return entry.eventId ? (
            <Link
              key={entry.id}
              to="/event/$id"
              params={{ id: entry.eventId }}
            >
              {inner}
            </Link>
          ) : (
            <div key={entry.id}>{inner}</div>
          );
        })
      )}
      <Link
        to="/device"
        className="flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-primary"
      >
        Open Device Status controls
        <ArrowUpRight className="size-3.5" />
      </Link>
    </SahayShell>
  );
}
