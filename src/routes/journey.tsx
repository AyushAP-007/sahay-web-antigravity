import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bike,
  Camera,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Flag,
  Footprints,
  HelpCircle,
  Info,
  Layers,
  LocateFixed,
  Navigation,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Timer,
  X,
} from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { RouteMap, type LayerVisibility } from "@/components/sahay/route-map";
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
import {
  getCategoryMetadata,
  type MappedPlace,
  type TravelMode,
} from "@/lib/sahay/night-scoring";
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
        subtitle="Watching the route you chose in Pune."
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
              {active.selectedRoute?.nightActivityScore
                ? `Night Activity ${active.selectedRoute.nightActivityScore}/100`
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
              {formatKm(active.selectedRoute.distanceMeters)} · Night Activity Score{" "}
              {active.selectedRoute.nightActivityScore ?? active.selectedRoute.safetyScore}/100.
              This indicates mapped activity & access points, not guaranteed safety.
            </p>
          ) : null}
          <div className="flex items-center gap-2 rounded-2xl bg-card/60 px-3 py-2 text-xs text-fg">
            <Timer className="size-4 shrink-0 text-primary" />
            <span>
              Expected finish:{" "}
              <strong className="text-fg">{formatSahayDate(active.expectedEndAt)}</strong>
            </span>
            <span className="ml-auto text-muted-fg">{remaining}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="compact"
              variant="secondary"
              onClick={() => void checkInJourney()}
            >
              Check in okay
            </Button>
            <Button
              size="compact"
              variant="secondary"
              onClick={() => void simulateJourneyDelay()}
            >
              +10m delay
            </Button>
            <Button
              size="compact"
              variant="secondary"
              onClick={() => void simulateJourneyOffRoute()}
            >
              Demo off-route
            </Button>
            <Button
              size="compact"
              variant="danger"
              onClick={() => void endJourney()}
            >
              End journey
            </Button>
          </div>
        </Panel>
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
  const [allPlaces, setAllPlaces] = useState<MappedPlace[]>([]);
  const [allCameras, setAllCameras] = useState<MappedPlace[]>([]);
  const [planNote, setPlanNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"gps" | "search" | "start" | null>(null);

  // New NightWise features: Mode & Departure
  const [travelMode, setTravelMode] = useState<TravelMode>("foot");
  const [departureDateTime, setDepartureDateTime] = useState(() => {
    // Current local time in YYYY-MM-DDTHH:mm format for datetime-local input
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });

  // Layer toggles
  const [layers, setLayers] = useState<LayerVisibility>({
    shopFood: true,
    medical: true,
    hospital: true,
    fuel: true,
    transport: true,
    cameras: true,
  });
  const [showLayerControls, setShowLayerControls] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [expandedFactorRouteId, setExpandedFactorRouteId] = useState<string | null>(null);
  const [showPlacesList, setShowPlacesList] = useState(false);

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
        label: "Current location (Pune)",
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
        setError("Type a start and a destination in Pune, then pick a suggestion or search again.");
        return;
      }
      setFrom(origin);
      setFromQuery(origin.label);
      setFromHits([]);
      setTo(destination);
      setToQuery(destination.label);
      setToHits([]);

      const depDate = new Date(departureDateTime);
      const found = await planSafeRoutes({
        data: {
          from: origin,
          to: destination,
          hour: depDate.getHours(),
          mode: travelMode,
          departureTimeIso: depDate.toISOString(),
        },
      });

      setRoutes(found.routes);
      setAllPlaces(found.allPlaces);
      setAllCameras(found.allCameras);
      setPlanNote(found.note);
      setSelectedId(found.routes[0]?.id ?? null);
    } catch (caught) {
      setRoutes([]);
      setAllPlaces([]);
      setAllCameras([]);
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

  const restartJourneyPlan = () => {
    setRoutes([]);
    setAllPlaces([]);
    setAllCameras([]);
    setSelectedId(null);
    setPlanNote("");
    setError("");
  };

  const start = async () => {
    if (!from || !to || !selected) {
      setError("Find and compare routes before starting journey watch.");
      return;
    }
    setBusy("start");
    try {
      await onStart({
        originLabel: from.label,
        destinationLabel: to.label,
        expectedMinutes: Math.max(1, Math.round(selected.durationSeconds / 60)),
        notes: `Night Activity Score: ${selected.nightActivityScore ?? selected.safetyScore}/100. ${selected.reasons.join(" · ")}`,
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
      title="Night Activity Journey"
      subtitle="Compare Pune routes with time-aware opening hours and activity indicators."
    >
      {/* Notice Banner */}
      <Panel className="flex-row items-start gap-2.5 bg-secondary/50">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <HelperText>
            <strong>Night Activity Score (out of 100):</strong> Measures open commercial spots,
            help points, road characteristics, and camera distribution along each route at your
            chosen time. <em>This is an activity & access indicator, not a guarantee of safety or probability of harm.</em>
          </HelperText>
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary underline"
          >
            <HelpCircle className="size-3" /> View Legend & Scoring Guide
          </button>
        </div>
      </Panel>

      {/* Tutorial Modal / Box */}
      {showTutorial ? (
        <Panel className="relative gap-3 border-primary/30 bg-card p-4">
          <button
            type="button"
            onClick={() => setShowTutorial(false)}
            className="absolute right-3 top-3 rounded-full p-1 text-muted-fg hover:bg-muted"
          >
            <X className="size-4" />
          </button>
          <p className="text-sm font-bold text-fg">Night Activity Guide & Legend</p>
          <div className="space-y-2 text-xs text-muted-fg">
            <p>
              <strong>Map Marker Colors:</strong>
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#eab308]" /> Shops & Food</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#ec4899]" /> Pharmacies & Clinics</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#2563eb]" /> Hospitals (24/7)</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#16a34a]" /> Petrol & CNG Pumps</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#9333ea]" /> Transport Hubs</span>
              <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#475569]" /> Surveillance Cameras</span>
            </div>
            <p className="pt-2">
              <strong>How Night Activity Scoring Works:</strong> Open commercial venues and 24/7 help points give traveller presence and assistance. Fewer long dark stretches and direct streets improve the score. Mapped camera presence is noted but never guaranteed active.
            </p>
          </div>
        </Panel>
      ) : null}

      {/* Origin, Destination, Mode, and Departure Controls */}
      <Panel className="gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-secondary text-primary">
              <Navigation className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">Plan a Pune journey</p>
              <p className="text-[11px] text-muted-fg">Walking, cycling, or driving routing profiles.</p>
            </div>
          </div>
          {routes.length > 0 ? (
            <Button size="compact" variant="ghost" onClick={restartJourneyPlan}>
              <RefreshCw className="size-3.5" /> Reset
            </Button>
          ) : null}
        </div>

        {/* Travel Mode Selector */}
        <div className="flex rounded-xl bg-muted p-1 text-xs">
          <button
            type="button"
            onClick={() => setTravelMode("foot")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition-colors ${
              travelMode === "foot" ? "bg-card text-fg shadow-sm" : "text-muted-fg hover:text-fg"
            }`}
          >
            <Footprints className="size-3.5" /> Walking
          </button>
          <button
            type="button"
            onClick={() => setTravelMode("bike")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition-colors ${
              travelMode === "bike" ? "bg-card text-fg shadow-sm" : "text-muted-fg hover:text-fg"
            }`}
          >
            <Bike className="size-3.5" /> Cycling
          </button>
          <button
            type="button"
            onClick={() => setTravelMode("car")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition-colors ${
              travelMode === "car" ? "bg-card text-fg shadow-sm" : "text-muted-fg hover:text-fg"
            }`}
          >
            <Car className="size-3.5" /> Driving
          </button>
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
          {busy === "gps" ? "Checking phone…" : "Use current phone location"}
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

        {/* Departure Date & Time */}
        <div className="flex flex-col gap-1.5">
          <Label className="flex items-center gap-1.5 text-xs text-muted-fg">
            <Clock className="size-3.5" /> Departure Date & Time (IST)
          </Label>
          <Input
            type="datetime-local"
            value={departureDateTime}
            onChange={(e) => setDepartureDateTime(e.target.value)}
            className="text-xs"
          />
        </div>

        <Button
          disabled={busy === "search"}
          data-testid="find-safe-route"
          onClick={() => void findRoutes()}
        >
          <Search className="size-4" />
          {busy === "search" ? "Analyzing night routes…" : "Compare night routes"}
        </Button>
        {error ? (
          <p className="text-[13px] font-medium text-danger">{error}</p>
        ) : null}
      </Panel>

      {/* Routes Comparison and Map */}
      {routes.length > 0 ? (
        <>
          {/* Map with Layer Controls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg">Interactive Pune Route Map</span>
              <button
                type="button"
                onClick={() => setShowLayerControls(!showLayerControls)}
                className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-fg hover:text-fg"
              >
                <Layers className="size-3" /> Map Layers {showLayerControls ? "▲" : "▼"}
              </button>
            </div>

            {showLayerControls ? (
              <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-2 text-[11px]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.shopFood}
                    onChange={(e) => setLayers({ ...layers, shopFood: e.target.checked })}
                  />
                  <span className="size-2 rounded-full bg-[#eab308]" /> Shops & Food
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.medical}
                    onChange={(e) => setLayers({ ...layers, medical: e.target.checked })}
                  />
                  <span className="size-2 rounded-full bg-[#ec4899]" /> Medical/Pharmacies
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.hospital}
                    onChange={(e) => setLayers({ ...layers, hospital: e.target.checked })}
                  />
                  <span className="size-2 rounded-full bg-[#2563eb]" /> Hospitals
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.fuel}
                    onChange={(e) => setLayers({ ...layers, fuel: e.target.checked })}
                  />
                  <span className="size-2 rounded-full bg-[#16a34a]" /> Fuel/CNG
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.transport}
                    onChange={(e) => setLayers({ ...layers, transport: e.target.checked })}
                  />
                  <span className="size-2 rounded-full bg-[#9333ea]" /> Transport
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.cameras}
                    onChange={(e) => setLayers({ ...layers, cameras: e.target.checked })}
                  />
                  <span className="size-2 rounded-full bg-[#475569]" /> Cameras
                </label>
              </div>
            ) : null}

            <RouteMap
              routes={routes}
              selectedId={selectedId}
              places={allPlaces}
              cameras={allCameras}
              layers={layers}
            />
          </div>

          {planNote ? (
            <p className="text-[11px] leading-4 text-muted-fg">{planNote}</p>
          ) : null}

          <SectionTitle title="Candidate Route Comparison" />

          {/* Compared Route Cards */}
          {routes.map((route) => {
            const active = route.id === selected?.id;
            const scoreVal = route.nightActivityScore ?? route.safetyScore;
            const badgeTone =
              scoreVal >= 65 ? "success" : scoreVal >= 40 ? "neutral" : "warning";

            const isExpanded = expandedFactorRouteId === route.id;

            return (
              <div
                key={route.id}
                className={`flex flex-col gap-2.5 rounded-[16px] border p-3.5 text-left transition-colors ${
                  active
                    ? "border-primary bg-secondary ring-1 ring-primary/20"
                    : "border-border bg-card hover:border-muted-fg/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(route.id)}
                  className="flex items-start justify-between gap-2 text-left"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-fg">
                        {route.objectiveLabel || "Alternative Route"}
                      </p>
                      {route.objective === "recommended" ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Best balance
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-fg">
                      {formatWalkTime(route.durationSeconds)} · {formatKm(route.distanceMeters)}
                      {route.detourMeters && route.detourMeters > 50 ? (
                        <span className="text-muted-fg/80">
                          {" "}(+{formatKm(route.detourMeters)} detour)
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={badgeTone}>
                      Night Activity {scoreVal}/100
                    </Badge>
                    <span className="text-[10px] uppercase tracking-wider text-muted-fg">
                      {route.confidence ? `${route.confidence} coverage` : "heuristic"}
                    </span>
                  </div>
                </button>

                {/* Gap Analysis Summary */}
                {route.gapAnalysis ? (
                  <div className="grid grid-cols-2 gap-1.5 rounded-[10px] bg-card/70 p-2 text-[11px] text-fg">
                    <div>
                      <span className="text-muted-fg">Open places:</span>{" "}
                      <strong>{route.gapAnalysis.totalOpenPlaces}</strong> of {route.gapAnalysis.totalPlacesFound}
                    </div>
                    <div>
                      <span className="text-muted-fg">Open help points:</span>{" "}
                      <strong>{route.gapAnalysis.totalOpenHelpPoints}</strong>
                    </div>
                    <div>
                      <span className="text-muted-fg">Longest activity gap:</span>{" "}
                      <strong>{formatKm(route.gapAnalysis.longestLowActivityGapMeters)}</strong>
                    </div>
                    <div>
                      <span className="text-muted-fg">Mapped cameras:</span>{" "}
                      <strong>
                        {route.hasCameraData
                          ? `${route.gapAnalysis.cameraCount} mapped`
                          : "Data unavailable"}
                      </strong>
                    </div>
                  </div>
                ) : null}

                {/* Traversed streets */}
                {route.traversedStreets && route.traversedStreets.length > 0 ? (
                  <p className="truncate text-[10px] text-muted-fg">
                    Corridor: {route.traversedStreets.slice(0, 4).join(", ")}
                  </p>
                ) : null}

                {/* Factor Breakdown Toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedFactorRouteId(isExpanded ? null : route.id)
                  }
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <SlidersHorizontal className="size-3" />
                  {isExpanded ? "Hide factor breakdown" : "View transparent factor scoring"}
                  {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>

                {isExpanded && route.factors ? (
                  <div className="space-y-2 rounded-xl border border-border/80 bg-background/50 p-2.5 text-xs">
                    <p className="font-semibold text-fg">
                      Transparent Factor Contributions ({travelMode} profile)
                    </p>
                    {route.factors.map((f) => (
                      <div key={f.id} className="border-b border-border/40 pb-1.5 last:border-b-0">
                        <div className="flex justify-between font-medium">
                          <span>{f.name}</span>
                          <span className="text-primary font-bold">
                            {f.score} / {f.maxScore} pts
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-fg">{f.evidence}</p>
                      </div>
                    ))}
                    {route.missingDataNotes && route.missingDataNotes.length > 0 ? (
                      <div className="pt-1 text-[10px] text-warning-fg">
                        <strong>Missing Data Notes:</strong>
                        <ul className="list-disc pl-3">
                          {route.missingDataNotes.map((note, idx) => (
                            <li key={idx}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* Places Along Selected Route Details */}
          {selected?.placesAlongRoute && selected.placesAlongRoute.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg">
                  Places Along Selected Route ({selected.placesAlongRoute.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowPlacesList(!showPlacesList)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {showPlacesList ? "Collapse places" : "View timeline & hours"}
                </button>
              </div>

              {showPlacesList ? (
                <div className="space-y-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-2 text-xs">
                  {selected.placesAlongRoute.map((p) => {
                    const meta = getCategoryMetadata(p.category);
                    const isOpen = p.openingStatus === "open";
                    const isClosed = p.openingStatus === "closed";

                    return (
                      <div
                        key={p.id}
                        className="flex items-start justify-between border-b border-border/50 py-1.5 last:border-b-0"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: meta.color }}
                            />
                            <span className="font-medium text-fg">{p.name}</span>
                          </div>
                          <p className="text-[10px] text-muted-fg">
                            {meta.label} · pass ~{p.estimatedPassingMinute}m ({p.distanceFromRouteMeters}m off route)
                          </p>
                          {p.weeklySchedule && p.weeklySchedule.length > 0 ? (
                            <p className="text-[9px] text-muted-fg/80 truncate">
                              Schedule: {p.weeklySchedule.slice(0, 2).join("; ")}
                            </p>
                          ) : null}
                        </div>
                        <Badge tone={isOpen ? "success" : isClosed ? "danger" : "neutral"}>
                          {isOpen ? "Listed open" : isClosed ? "Listed closed" : "Hours unknown"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Action button */}
          <Button
            disabled={busy === "start"}
            data-testid="start-journey-button"
            onClick={() => void start()}
          >
            <Flag className="size-4" />
            {busy === "start" ? "Starting watch…" : "Watch this route"}
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
        placeholder={label === "From" ? "Start point in Pune" : "Destination in Pune"}
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
