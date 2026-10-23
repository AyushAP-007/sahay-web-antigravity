import { useEffect, useRef } from "react";
import type { PlannedRoute } from "@/lib/sahay/routing";
import { getCategoryMetadata, type MappedPlace } from "@/lib/sahay/night-scoring";

export interface LayerVisibility {
  shopFood: boolean;
  medical: boolean;
  hospital: boolean;
  fuel: boolean;
  transport: boolean;
  cameras: boolean;
}

export function RouteMap({
  routes,
  selectedId,
  places = [],
  cameras = [],
  layers = {
    shopFood: true,
    medical: true,
    hospital: true,
    fuel: true,
    transport: true,
    cameras: true,
  },
}: {
  routes: PlannedRoute[];
  selectedId: string | null;
  places?: MappedPlace[];
  cameras?: MappedPlace[];
  layers?: LayerVisibility;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || routes.length === 0) return;
    let cancelled = false;
    let map: {
      remove: () => void;
      invalidateSize: () => void;
    } | null = null;

    void (async () => {
      const mod = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !hostRef.current) return;
      const L: any = mod.default;
      host.innerHTML = "";
      const selected =
        routes.find((route) => route.id === selectedId) ?? routes[0]!;
      const start = selected.geometry[0]!;
      const created = L.map(host, {
        zoomControl: false,
        attributionControl: true,
      }).setView(start, 14);
      map = created;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 18,
      }).addTo(created);

      const bounds = L.latLngBounds([]);

      // Render non-selected routes first, then the selected route on top
      const sortedRoutes = [...routes].sort((a, b) => {
        if (a.id === selected.id) return 1;
        if (b.id === selected.id) return -1;
        return 0;
      });

      for (const route of sortedRoutes) {
        const isSelected = route.id === selected.id;
        const color = isSelected
          ? "#0f766e" // Primary Teal
          : route.objective === "fastest"
            ? "#64748b" // Slate
            : route.objective === "safety-focused" || route.objectiveLabel?.includes("Night activity-favoured")
              ? "#15803d" // Green
              : "#94a3b8"; // Muted gray

        const line = L.polyline(route.geometry, {
          color,
          weight: isSelected ? 5.5 : 3.5,
          opacity: isSelected ? 0.95 : 0.6,
          dashArray: !isSelected && route.objective === "fastest" ? "4, 6" : undefined,
        }).addTo(created);
        bounds.extend(line.getBounds());
      }

      // Render Categorized Place Markers if layers enabled
      const placesToRender = selected.placesAlongRoute && selected.placesAlongRoute.length > 0
        ? selected.placesAlongRoute
        : places;

      for (const p of placesToRender) {
        let visible = false;
        if (p.category === "shop_food" && layers.shopFood) visible = true;
        if (p.category === "pharmacy_medical" && layers.medical) visible = true;
        if (p.category === "hospital" && layers.hospital) visible = true;
        if (p.category === "fuel_cng" && layers.fuel) visible = true;
        if (p.category === "transport" && layers.transport) visible = true;

        if (visible) {
          const meta = getCategoryMetadata(p.category);
          const isOpen = p.openingStatus === "open";
          const statusText =
            p.openingStatus === "open"
              ? "Listed OPEN"
              : p.openingStatus === "closed"
                ? "Listed CLOSED"
                : "Hours UNKNOWN";

          const marker = L.circleMarker([p.lat, p.lng], {
            radius: p.category === "hospital" ? 7 : 5,
            color: meta.color,
            fillColor: meta.color,
            fillOpacity: isOpen ? 0.95 : 0.45,
            weight: 2,
          });
          marker.addTo(created);

          marker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
              <strong style="color: ${meta.color};">${meta.label}</strong><br/>
              <b>${p.name}</b><br/>
              <span style="font-weight: 600; color: ${isOpen ? '#16a34a' : p.openingStatus === 'closed' ? '#dc2626' : '#64748b'};">
                ● ${statusText}
              </span>
              ${p.estimatedPassingMinute !== undefined ? `<br/><span style="color:#64748b;">Pass ~${p.estimatedPassingMinute}m into journey</span>` : ""}
            </div>
          `);
        }
      }

      // Render Cameras if layer enabled
      if (layers.cameras) {
        const camsToRender = selected.camerasAlongRoute && selected.camerasAlongRoute.length > 0
          ? selected.camerasAlongRoute
          : cameras;

        for (const cam of camsToRender) {
          const camMarker = L.circleMarker([cam.lat, cam.lng], {
            radius: 5,
            color: "#475569",
            fillColor: "#334155",
            fillOpacity: 0.9,
            weight: 2,
          });
          camMarker.addTo(created);

          camMarker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px;">
              <strong>📷 Mapped Surveillance Camera</strong><br/>
              <span style="color: #64748b;">Mapped on OpenStreetMap.<br/>Note: Live recording/monitoring not guaranteed.</span>
            </div>
          `);
        }
      }

      // Origin and destination markers
      const origin = selected.geometry[0]!;
      const dest = selected.geometry[selected.geometry.length - 1]!;
      const origMarker = L.circleMarker(origin, {
        radius: 7,
        color: "#0f766e",
        fillColor: "#0f766e",
        fillOpacity: 1,
      });
      origMarker.addTo(created);
      origMarker.bindPopup("<b>Journey Origin</b>");

      const destMarker = L.circleMarker(dest, {
        radius: 7,
        color: "#b94f43",
        fillColor: "#b94f43",
        fillOpacity: 1,
      });
      destMarker.addTo(created);
      destMarker.bindPopup("<b>Destination</b>");

      if (bounds.isValid()) {
        created.fitBounds(bounds, { padding: [18, 18] });
      }
      window.setTimeout(() => map?.invalidateSize(), 80);
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [routes, selectedId, places, cameras, layers]);

  if (routes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-[16px] bg-muted text-xs text-muted-fg"
        style={{ height: 210, minHeight: 210, flexShrink: 0 }}
      >
        Select origin & destination to view Pune night routes.
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className="overflow-hidden rounded-[16px] border border-border shadow-soft"
      style={{ height: 250, minHeight: 250, width: "100%", flexShrink: 0 }}
    />
  );
}
