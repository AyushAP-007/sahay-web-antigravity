import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ChevronRight, Clock, Lock } from "lucide-react";
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
import { eventLabel, riskTone } from "@/lib/sahay/safety";
import { formatSahayDate } from "@/lib/sahay/services";

export const Route = createFileRoute("/history")({ component: HistoryPage });

function HistoryPage() {
  return (
    <RequireUser>
      <HistoryScreen />
    </RequireUser>
  );
}

function HistoryScreen() {
  const { state } = useSahay();
  const events = state.events.filter((event) => event.userId === state.user?.id);

  return (
    <SahayShell
      title="Event history"
      subtitle="Events saved locally on this device."
    >
      <Panel className="flex-row items-start gap-2.5">
        <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
        <HelperText>
          Real emergency calls and messages are not part of this prototype.
        </HelperText>
      </Panel>
      <SectionTitle
        title={`${events.length} ${events.length === 1 ? "event" : "events"}`}
      />
      {events.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Clock}
            title="Your history is clear"
            detail="TEST SOS, missed check-ins, and journey alerts will appear here."
          />
        </Panel>
      ) : (
        events.map((event) => (
          <Link
            key={event.id}
            to="/event/$id"
            params={{ id: event.id }}
            data-testid={`history-event-${event.id}`}
          >
            <Panel className="flex-row items-center gap-3 py-3.5">
              <StatusIcon className="size-[41px] rounded-[14px] bg-danger-soft text-danger">
                <AlertCircle className="size-[19px]" />
              </StatusIcon>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-fg">
                    {eventLabel(event.type)}
                  </p>
                  <Badge tone={riskTone(event.riskLevel)}>{event.riskLevel}</Badge>
                </div>
                <p className="text-[11px] text-muted-fg">
                  {formatSahayDate(event.timestamp)}
                </p>
                <p className="text-[11px] text-muted-fg">
                  {event.locationAvailable
                    ? "Phone location captured"
                    : "Location unavailable"}
                  {" · "}
                  {event.enabledContactCount} contact
                  {event.enabledContactCount === 1 ? "" : "s"}
                </p>
              </div>
              <ChevronRight className="size-[18px] text-muted-fg" />
            </Panel>
          </Link>
        ))
      )}
    </SahayShell>
  );
}
