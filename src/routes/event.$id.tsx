import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ExternalLink, MapPin } from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { SahayShell } from "@/components/sahay/shell";
import { HelperText, Panel, SectionTitle } from "@/components/sahay/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSahay } from "@/lib/sahay/context";
import { eventLabel, eventMapsUrl, motionLabel, responseLabel, riskTone } from "@/lib/sahay/safety";
import { formatAccuracy, formatSahayDate } from "@/lib/sahay/services";

export const Route = createFileRoute("/event/$id")({ component: EventPage });

function EventPage() {
  return (
    <RequireUser>
      <EventScreen />
    </RequireUser>
  );
}

function EventScreen() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { state } = useSahay();
  const event = useMemo(
    () =>
      state.events.find((item) => item.id === id && item.userId === state.user?.id),
    [id, state.events, state.user?.id],
  );

  if (!event) {
    return (
      <SahayShell
        title="Event not found"
        subtitle="This event is not available in the current demo profile."
        tabbed={false}
        backTo="/history"
      >
        <Button variant="outline" onClick={() => void navigate({ to: "/history" })}>
          Back to history
        </Button>
      </SahayShell>
    );
  }

  const openMap = () => {
    const url = eventMapsUrl(event);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const notificationLabel =
    event.notificationStatus === "simulated_sent"
      ? "Simulated sent"
      : event.notificationStatus === "failed"
        ? "Failed"
        : "Pending";

  return (
    <SahayShell
      title="Event details"
      subtitle="A local record · no real alert was sent."
      tabbed={false}
      backTo="/history"
    >
      <Panel className="items-center gap-2.5 bg-danger-soft py-[22px] shadow-none">
        <span className="mb-0.5 flex size-[47px] items-center justify-center rounded-[17px] bg-card text-danger">
          <AlertCircle className="size-[23px]" />
        </span>
        <p className="font-display text-xl font-semibold tracking-[0.04em] text-danger">
          {eventLabel(event.type)}
        </p>
        <p className="text-xs font-medium text-fg">
          {formatSahayDate(event.timestamp)}
        </p>
        <Badge tone={riskTone(event.riskLevel)}>
          {event.riskLevel} · score {event.riskScore}
        </Badge>
        <Badge tone="warning">Simulation · not an emergency call</Badge>
      </Panel>

      <Panel className="gap-2">
        <SectionTitle title="Event record" />
        <Detail label="Event ID" value={event.id} />
        <Detail label="Event type" value={event.type} />
        <Detail label="Source" value={event.source === "phone" ? "Phone GPS" : "Simulated locket"} />
        <Detail
          label="Enabled contacts"
          value={String(event.enabledContactCount)}
        />
        <Detail label="Response" value={responseLabel(event.responseAction)} />
        <Detail label="Notification status" value={notificationLabel} />
        <HelperText>{event.notificationSummary}</HelperText>
      </Panel>

      <Panel className="gap-2">
        <SectionTitle title="Risk snapshot" />
        <Detail label="Level" value={event.riskLevel} />
        <Detail label="Score" value={`${event.riskScore} / 100`} />
        {event.motionPattern ? (
          <Detail label="Motion" value={motionLabel(event.motionPattern)} />
        ) : null}
        {event.confirmed === null ? null : (
          <Detail
            label="User confirmation"
            value={event.confirmed ? "Okay" : "Needed help / missed"}
          />
        )}
        {event.riskReasons.map((reason) => (
          <p key={reason} className="text-[11px] leading-4 text-muted-fg">
            {reason}
          </p>
        ))}
      </Panel>

      <Panel className="gap-2">
        <SectionTitle title="Phone location" />
        {event.locationAvailable ? (
          <>
            <Detail label="Latitude" value={event.latitude?.toFixed(6) ?? "—"} />
            <Detail label="Longitude" value={event.longitude?.toFixed(6) ?? "—"} />
            <Detail label="Accuracy" value={formatAccuracy(event.accuracy)} />
            <Button variant="secondary" onClick={openMap}>
              <ExternalLink className="size-4" />
              Open coordinates in map
            </Button>
          </>
        ) : (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-fg" />
            <HelperText>
              No phone coordinates were available when this record was created.
            </HelperText>
          </div>
        )}
      </Panel>

      <Panel className="gap-2">
        <SectionTitle title="Device status at the time" />
        <Detail
          label="Connection"
          value={`${event.deviceStatus.connectionStatus} · simulated`}
        />
        <Detail label="Demo battery" value={`${event.deviceStatus.battery}%`} />
        <Detail
          label="Device GPS"
          value={`${event.deviceStatus.gpsStatus} · simulated`}
        />
        <Detail
          label="Communication"
          value={`${event.deviceStatus.communicationStatus} · simulated`}
        />
        <Detail label="Device ID" value={event.deviceStatus.id} />
        <HelperText>Physical locket hardware was not connected.</HelperText>
      </Panel>
      <Button variant="outline" onClick={() => void navigate({ to: "/history" })}>
        Back to event history
      </Button>
    </SahayShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[39px] items-center justify-between gap-3 border-b border-border">
      <p className="flex-1 text-[11px] text-muted-fg">{label}</p>
      <p className="flex-[1.2] text-right text-xs font-semibold break-all text-fg">
        {value}
      </p>
    </div>
  );
}
