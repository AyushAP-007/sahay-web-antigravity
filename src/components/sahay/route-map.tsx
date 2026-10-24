import { useEffect, useRef } from "react";
import type { PlannedRoute } from "@/lib/sahay/routing";
import { getCategoryMetadata, type MappedPlace } from "@/lib/sahay/night-scoring";

export interface LayerVisibility {
  shopFood: boolean;
  medical: boolean;
  hospital: boolean;
  police: boolean;
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
    police: true,
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
  const mapInstanceRef = useRef<any>(null);
  const layersGroupRef = useRef<any>(null);
  const fittedRouteIdRef = useRef<string | null>(null);

  // Initialize Map once
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;

    void (async () => {
      const mod = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !hostRef.current || mapInstanceRef.current) return;

      const L: any = mod.default;
      const initialCenter: [number, number] = [18.5204, 73.8567]; // Central Pune default
      const map = L.map(host, {
        zoomControl: false,
        attributionControl: true,
      }).setView(initialCenter, 13);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      layersGroupRef.current = layerGroup;

      window.setTimeout(() => map.invalidateSize(), 80);
    })();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layersGroupRef.current = null;
        fittedRouteIdRef.current = null;
      }
    };
  }, []);

  // Update Route Polylines and Markers without recreating map instance
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    // When no routes, clear layers and reset to Pune default view
    if (routes.length === 0) {
      group.clearLayers();
      fittedRouteIdRef.current = null;
      map.setView([18.5204, 73.8567], 13, { animate: false });
      return;
    }

    void (async () => {
      const mod = await import("leaflet");
      const L: any = mod.default;

      // Clear previous layers (lines, markers)
      group.clearLayers();

      const selected =
        routes.find((route) => route.id === selectedId) ?? routes[0]!;

      const bounds = L.latLngBounds([]);

      // 1. Draw non-selected routes first, then selected route
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
            : route.objective === "safety-focused" ||
                route.objectiveLabel?.includes("Night activity-favoured")
              ? "#15803d" // Green
              : "#94a3b8"; // Muted gray

        const line = L.polyline(route.geometry, {
          color,
          weight: isSelected ? 5.5 : 3.5,
          opacity: isSelected ? 0.95 : 0.6,
          dashArray:
            !isSelected && route.objective === "fastest" ? "4, 6" : undefined,
        });
        group.addLayer(line);
        bounds.extend(line.getBounds());
      }

      // 2. Render Categorized Place Markers along route
      const placesToRender =
        selected.placesAlongRoute && selected.placesAlongRoute.length > 0
          ? selected.placesAlongRoute
          : places;

      for (const p of placesToRender) {
        let visible = false;
        if (p.category === "shop_food" && layers.shopFood) visible = true;
        if (p.category === "pharmacy_medical" && layers.medical) visible = true;
        if (p.category === "hospital" && layers.hospital) visible = true;
        if (p.category === "police" && layers.police) visible = true;
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
            radius: p.category === "hospital" || p.category === "police" ? 7 : 5,
            color: meta.color,
            fillColor: meta.color,
            fillOpacity: isOpen ? 0.95 : 0.45,
            weight: 2,
          });

          marker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
              <strong style="color: ${meta.color};">${meta.label}</strong><br/>
              <b>${p.name}</b><br/>
              <span style="font-weight: 600; color: ${isOpen ? "#16a34a" : p.openingStatus === "closed" ? "#dc2626" : "#64748b"};">
                ● ${statusText}
              </span>
              ${p.estimatedPassingMinute !== undefined ? `<br/><span style="color:#64748b;">Pass ~${p.estimatedPassingMinute}m into journey</span>` : ""}
            </div>
          `);
          group.addLayer(marker);
        }
      }

      // 3. Render Cameras along route
      if (layers.cameras) {
        const camsToRender =
          selected.camerasAlongRoute && selected.camerasAlongRoute.length > 0
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

          camMarker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px;">
              <strong>📷 Mapped Surveillance Camera</strong><br/>
              <span style="color: #64748b;">Mapped on OpenStreetMap.<br/>Note: Live recording/monitoring not guaranteed.</span>
            </div>
          `);
          group.addLayer(camMarker);
        }
      }

      // 4. Origin & Destination Markers
      const origin = selected.geometry[0]!;
      const dest = selected.geometry[selected.geometry.length - 1]!;
      const origMarker = L.circleMarker(origin, {
        radius: 7,
        color: "#0f766e",
        fillColor: "#0f766e",
        fillOpacity: 1,
      });
      origMarker.bindPopup("<b>Journey Origin</b>");
      group.addLayer(origMarker);

      const destMarker = L.circleMarker(dest, {
        radius: 7,
        color: "#b94f43",
        fillColor: "#b94f43",
        fillOpacity: 1,
      });
      destMarker.bindPopup("<b>Destination</b>");
      group.addLayer(destMarker);

      // Only fitBounds ONCE when candidate route set changes or journey starts
      const currentRouteKey = routes.map((r) => r.id).join(",");
      if (fittedRouteIdRef.current !== currentRouteKey && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [22, 22], animate: false });
        fittedRouteIdRef.current = currentRouteKey;
      }
    })();
  }, [routes, selectedId, places, cameras, layers]);

  return (
    <div
      ref={hostRef}
      className="overflow-hidden rounded-[16px] border border-border shadow-soft"
      style={{ height: 250, minHeight: 250, width: "100%", flexShrink: 0 }}
    />
  );
}
