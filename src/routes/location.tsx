import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Crosshair, ExternalLink, Info, MapPin, Watch } from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { SahayShell } from "@/components/sahay/shell";
import { HelperText, Panel, SectionTitle, StatusIcon } from "@/components/sahay/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSahay } from "@/lib/sahay/context";
import { formatAccuracy, formatSahayDate } from "@/lib/sahay/services";

export const Route = createFileRoute("/location")({ component: LocationPage });

function LocationPage() {
  return (
    <RequireUser>
      <LocationScreen />
    </RequireUser>
  );
}

function LocationScreen() {
  const { state, requestLocation } = useSahay();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(state.location.message);
  const location = state.location;

  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await requestLocation();
      setMessage(result.message);
    } finally {
      setBusy(false);
    }
  };

  const openMap = () => {
    if (location.latitude === null || location.longitude === null) return;
    window.open(
      `https://maps.google.com/?q=${location.latitude},${location.longitude}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <SahayShell
      title="Phone Location"
      subtitle="Foreground phone GPS — not the locket."
      tabbed={false}
      backTo="/"
    >
      <Panel className="gap-4">
        <div className="flex items-center gap-2.5">
          <StatusIcon className="size-[43px] rounded-[14px] bg-info-soft text-info">
            <MapPin className="size-5" />
          </StatusIcon>
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg">Current phone position</p>
            <p className="text-[11px] text-muted-fg">Foreground access only</p>
          </div>
          <Badge tone={location.available ? "success" : "warning"}>
            {location.available ? "Available" : "Unavailable"}
          </Badge>
        </div>

        <div className="flex items-center gap-3 rounded-[14px] bg-muted p-3.5">
          <Coordinate
            label="Latitude"
            value={location.latitude?.toFixed(6) ?? "—"}
          />
          <div className="h-[42px] w-px bg-border" />
          <Coordinate
            label="Longitude"
            value={location.longitude?.toFixed(6) ?? "—"}
          />
        </div>
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 text-muted-fg" />
          <p className="text-[11px] text-muted-fg">
            Last update · {formatSahayDate(location.updatedAt)}
          </p>
        </div>
        <p className="text-[11px] text-muted-fg">
          Accuracy · {formatAccuracy(location.accuracy)}
        </p>
        {message ? (
          <div className="flex items-start gap-2 rounded-[11px] bg-warning-soft p-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="flex-1 text-xs font-medium leading-[1.4] text-warning">
              {message}
            </p>
          </div>
        ) : null}
        {location.available ? (
          <Button variant="secondary" onClick={openMap}>
            <ExternalLink className="size-4" />
            Open position in map
          </Button>
        ) : null}
        <Button
          disabled={busy}
          data-testid="request-location-button"
          onClick={() => void refresh()}
        >
          <Crosshair className="size-4" />
          {busy
            ? "Checking phone location…"
            : location.available
              ? "Refresh phone location"
              : "Request phone location"}
        </Button>
        {location.permission === "denied" ? (
          <Button
            variant="outline"
            onClick={() =>
              window.alert(
                "Allow location access in your browser’s site settings, then try again.",
              )
            }
          >
            Location settings
          </Button>
        ) : null}
      </Panel>

      <Panel className="gap-3.5">
        <SectionTitle title="About this location" />
        <HelperText>
          Sahay reads your phone’s current location only after you request it,
          start a journey, or confirm a TEST SOS. Continuous background tracking
          is not enabled.
        </HelperText>
        <div className="flex items-start gap-2.5 border-t border-border pt-3">
          <Watch className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="flex-1 text-xs font-medium leading-[1.5] text-muted-fg">
            Future version: location can be received from the Sahay locket GPS.
          </p>
        </div>
      </Panel>
    </SahayShell>
  );
}

function Coordinate({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <p className="text-[9px] font-bold tracking-widest text-muted-fg uppercase">
        {label}
      </p>
      <p className="text-[15px] font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}
