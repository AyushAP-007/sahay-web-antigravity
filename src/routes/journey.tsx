import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Flag, Info, LocateFixed, Navigation, Search, Timer } from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { RouteMap } from "@/components/sahay/route-map";
import { SahayShell } from "@/components/sahay/shell";
import { HelperText, Panel, SectionTitle } from "@/components/sahay/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSahay } from "@/lib/sahay/context";
import { planSafeRoutes, searchPlaces } from "@/lib/sahay/routing-api";
import { countdownLabel } from "@/lib/sahay/safety";
import {
  formatKm,
  formatWalkTime,
  type PlaceHit,
  type PlannedRoute,
} from "@/lib/sahay/routing";
import { formatSahayDate } from "@/lib/sahay/services";

export const Route = createFileRoute("/journey")({ component: JourneyPage });

async function resolvePlace(
  current: PlaceHit | null,
  query: string,
): Promise<PlaceHit | null> {
  if (current) return current;
  const text = query.trim();
  if (text.length < 3) return null;
  const hits = await searchPlaces({ data: { query: text } });
  return hits[0] ?? null;
}

function JourneyPage() {
  return (
    <RequireUser>
      <JourneyScreen />
    </RequireUser>
  );
}

function JourneyScreen() {
  const {
    state,
    startJourney,
    checkInJourney,
    simulateJourneyDelay,
    simulateJourneyOffRoute,
    endJourney,
    setJourneyLocationWatch,
    requestLocation,
  } = useSahay();
  const active =
    state.journey && state.journey.status === "active" ? state.journey : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active?.id]);
  const remaining = active ? countdownLabel(active.expectedEndAt, now) : "";

  if (active) {
    return (
      <SahayShell
        title="Safe Journey"
        subtitle="Watching the route you chose."
      >
        {active.selectedRoute ? (
          <RouteMap
            routes={[active.selectedRoute]}
            selectedId={active.selectedRoute.id}
          />
        ) : null}
        <Panel className="gap-3 bg-secondary shadow-none">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold tracking-[0.14em] text-secondary-fg">
              IN PROGRESS
            </p>
            <Badge tone={active.offRouteSimulated ? "warning" : "success"}>
              {active.selectedRoute?.kind === "safest"
                ? "Closer to services"
                : active.offRouteSimulated
                  ? "Off-route demo"
                  : "On watch"}
            </Badge>
          </div>
          <p className="font-display text-xl font-semibold tracking-[-0.03em] text-fg">
            {active.originLabel} → {active.destinationLabel}
          </p>
          {active.selectedRoute ? (
            <p className="text-[11px] text-muted-fg">
              {formatWalkTime(active.selectedRoute.durationSeconds)} ·{" "}
              {formatKm(active.selectedRoute.distanceMeters)} · amenity score{" "}
              {active.selectedRoute.safetyScore}/100. This is a map heuristic,
              not proof the walk is safe.
            </p>
          ) : null}
          <div className="flex items-center gap-2 text-[13px] text-fg">
            <Timer className="size-4 text-primary" />
            <span className="tabular-nums">{remaining}</span>
          </div>
          <p className="text-[11px] text-muted-fg">
            Expected {formatSahayDate(active.expectedEndAt)}
          </p>
          <div className="rounded-[13px] bg-card p-3">
            <p className="text-[9px] font-bold tracking-[0.14em] text-muted-fg">
              PHONE GPS
            </p>
            <p className="mt-1 text-[11px] leading-4 text-fg">
              {active.locationWatchRequested ? "Foreground watching" : "Not watching"}
              {active.liveOffRoute ? " · away from the chosen line" : ""}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-fg">
              {active.locationWatchNote ??
                "Turn this on to use the browser’s foreground location. It is not background tracking, and a missing fix is not treated as danger."}
            </p>
            {state.location.updatedAt ? (
              <p className="mt-1 text-[11px] text-muted-fg">
                Last phone update {formatSahayDate(state.location.updatedAt)}
                {state.location.permission === "denied" ? " · permission denied" : ""}
              </p>
            ) : null}
          </div>
          <Button
            size="compact"
            variant="secondary"
            onClick={() => setJourneyLocationWatch(!active.locationWatchRequested)}
          >
            <LocateFixed className="size-4" />
            {active.locationWatchRequested ? "Stop location watch" : "Watch phone location"}
          </Button>
        </Panel>
        <Button data-testid="journey-checkin" onClick={() => checkInJourney()}>
          I am okay — check in
        </Button>
        <SectionTitle title="Demonstration" />
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="compact"
            variant="outline"
            onClick={() => simulateJourneyDelay()}
          >
            Simulate delay
          </Button>
          <Button
            size="compact"
            variant="outline"
            onClick={() => simulateJourneyOffRoute()}
          >
            Simulate off-route
          </Button>
        </div>
        <Button variant="secondary" onClick={() => endJourney("completed")}>
          End journey
        </Button>
        <Button variant="ghost" onClick={() => endJourney("cancelled")}>
          Cancel journey
        </Button>
      </SahayShell>
    );
  }

  return (
    <Planner
      onStart={startJourney}
      requestLocation={requestLocation}
      last={state.journey}
    />
  );
}

function Planner({
  onStart,
  requestLocation,
  last,
}: {
  onStart: ReturnType<typeof useSahay>["startJourney"];
  requestLocation: ReturnType<typeof useSahay>["requestLocation"];
  last: ReturnType<typeof useSahay>["state"]["journey"];
}) {
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [from, setFrom] = useState<PlaceHit | null>(null);
  const [to, setTo] = useState<PlaceHit | null>(null);
  const [fromHits, setFromHits] = useState<PlaceHit[]>([]);
  const [toHits, setToHits] = useState<PlaceHit[]>([]);
  const [routes, setRoutes] = useState<PlannedRoute[]>([]);
  const [planNote, setPlanNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"gps" | "search" | "start" | null>(null);

  useEffect(() => {
    const q = fromQuery.trim();
    if (q.length < 3 || from?.label === q) {
      setFromHits([]);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      void searchPlaces({ data: { query: q } })
        .then((hits) => {
          if (!cancelled) setFromHits(hits.slice(0, 4));
        })
        .catch(() => {
          if (!cancelled) setFromHits([]);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [fromQuery, from?.label]);

  useEffect(() => {
    const q = toQuery.trim();
    if (q.length < 3 || to?.label === q) {
      setToHits([]);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      void searchPlaces({ data: { query: q } })
        .then((hits) => {
          if (!cancelled) setToHits(hits.slice(0, 4));
        })
        .catch(() => {
          if (!cancelled) setToHits([]);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [toQuery, to?.label]);

  const selected = routes.find((route) => route.id === selectedId) ?? routes[0];

  const useGps = async () => {
    setBusy("gps");
    setError("");
    try {
      const location = await requestLocation();
      if (!location.available || location.latitude === null || location.longitude === null) {
        setError(location.message ?? "Phone location is not available.");
        return;
      }
      const place: PlaceHit = {
        label: "Current location",
        lat: location.latitude,
        lng: location.longitude,
      };
      setFrom(place);
      setFromQuery(place.label);
      setFromHits([]);
    } finally {
      setBusy(null);
    }
  };

  const findRoutes = async () => {
    setError("");
    setBusy("search");
    try {
      const origin = await resolvePlace(from, fromQuery);
      const destination = await resolvePlace(to, toQuery);
      if (!origin || !destination) {
        setError("Type a start and a destination, then pick a suggestion or search again.");
        return;
      }
      setFrom(origin);
      setFromQuery(origin.label);
      setFromHits([]);
      setTo(destination);
      setToQuery(destination.label);
      setToHits([]);
      const found = await planSafeRoutes({
        data: { from: origin, to: destination, hour: new Date().getHours() },
      });
      setRoutes(found.routes);
      setPlanNote(found.note);
      setSelectedId(found.routes[0]?.id ?? null);
    } catch (caught) {
      setRoutes([]);
      setPlanNote("");
      setError(
        caught instanceof Error
          ? caught.message
          : "Routes could not be planned right now.",
      );
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    if (!from || !to || !selected) {
      setError("Find a route before starting the watch.");
      return;
    }
    setBusy("start");
    try {
      await onStart({
        originLabel: from.label,
        destinationLabel: to.label,
        expectedMinutes: Math.max(1, Math.round(selected.durationSeconds / 60)),
        notes: selected.reasons.join(" · "),
        originLat: from.lat,
        originLng: from.lng,
        destLat: to.lat,
        destLng: to.lng,
        selectedRoute: selected,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Journey could not start.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <SahayShell
      title="Safe Journey"
      subtitle="Compare walking routes. The score is a map heuristic, not a safety guarantee."
    >
      <Panel className="flex-row items-start gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-warning" />
        <HelperText>
          Routes come from OpenStreetMap walking paths. The number on each walk
          only reflects mapped police, hospitals, pharmacies, and extra
          distance. It is not proof that a route is safe, and it is not based
          on crime data. Nothing is sent to your contacts.
        </HelperText>
      </Panel>

      <Panel className="gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-primary">
            <Navigation className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-fg">Plan a walking route</p>
            <p className="text-[11px] text-muted-fg">
              A closer-to-services walk is listed first when the heuristic scores differ.
            </p>
          </div>
        </div>
        <PlaceField
          label="From"
          value={fromQuery}
          onChange={(value) => {
            setFromQuery(value);
            setFrom(null);
          }}
          hits={fromHits}
          onPick={(place) => {
            setFrom(place);
            setFromQuery(place.label);
            setFromHits([]);
          }}
        />
        <Button
          size="compact"
          variant="secondary"
          disabled={busy === "gps"}
          onClick={() => void useGps()}
        >
          <LocateFixed className="size-4" />
          {busy === "gps" ? "Checking phone…" : "Use current location"}
        </Button>
        <PlaceField
          label="To"
          value={toQuery}
          onChange={(value) => {
            setToQuery(value);
            setTo(null);
          }}
          hits={toHits}
          onPick={(place) => {
            setTo(place);
            setToQuery(place.label);
            setToHits([]);
          }}
        />
        <Button
          disabled={busy === "search"}
          data-testid="find-safe-route"
          onClick={() => void findRoutes()}
        >
          <Search className="size-4" />
          {busy === "search" ? "Comparing walks…" : "Compare walking routes"}
        </Button>
        {error ? (
          <p className="text-[13px] font-medium text-danger">{error}</p>
        ) : null}
      </Panel>

      {routes.length > 0 ? (
        <>
          <RouteMap routes={routes} selectedId={selectedId} />
          {planNote ? (
            <p className="text-[11px] leading-4 text-muted-fg">{planNote}</p>
          ) : null}
          <SectionTitle title="Compared walks" />
          {routes.map((route) => {
            const active = route.id === selected?.id;
            const title =
              route.kind === "safest"
                ? "Closer to services"
                : route.kind === "shortest"
                  ? "Shorter walk"
                  : "Alternate walk";
            return (
              <button
                key={route.id}
                type="button"
                onClick={() => setSelectedId(route.id)}
                className={`rounded-[16px] border p-3.5 text-left ${
                  active ? "border-primary bg-secondary" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-fg">{title}</p>
                  <Badge tone="neutral">Score {route.safetyScore}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-fg">
                  {formatWalkTime(route.durationSeconds)} ·{" "}
                  {formatKm(route.distanceMeters)} · walking
                </p>
                {route.reasons[0] ? (
                  <p className="mt-1 text-[11px] leading-4 text-muted-fg">
                    {route.reasons[0]}
                  </p>
                ) : null}
              </button>
            );
          })}
          <Button
            disabled={busy === "start"}
            data-testid="start-journey-button"
            onClick={() => void start()}
          >
            <Flag className="size-4" />
            {busy === "start" ? "Starting…" : "Watch this route"}
          </Button>
        </>
      ) : null}

      {last ? (
        <Panel>
          <p className="text-[13px] font-semibold text-fg">Last journey</p>
          <p className="text-xs text-muted-fg">
            {last.originLabel} → {last.destinationLabel}
          </p>
          <Badge tone="neutral">{last.status}</Badge>
        </Panel>
      ) : null}
    </SahayShell>
  );
}

function PlaceField({
  label,
  value,
  onChange,
  hits,
  onPick,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hits: PlaceHit[];
  onPick: (place: PlaceHit) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label === "From" ? "Start point" : "Destination"}
        autoComplete="off"
      />
      {hits.length > 0 ? (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          {hits.map((hit) => (
            <button
              key={`${hit.lat}-${hit.lng}-${hit.label}`}
              type="button"
              onClick={() => onPick(hit)}
              className="block w-full border-b border-border px-3 py-2.5 text-left text-xs last:border-b-0"
            >
              {hit.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
