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
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
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

      // 2. Render Categorized Place Markers
      // Always merge selected route places (which carry opening status & passing times)
      // with broader map places so markers remain visible even when the route itself has 0 places.
      const routePlaces = selected.placesAlongRoute ?? [];
      const placeMap = new Map<string, MappedPlace>();

      // Seed with broader places inventory first
      for (const p of places) {
        const key = p.id || `${p.category}-${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
        placeMap.set(key, p);
      }
      // Overwrite/enrich with route-evaluated places (which have openingStatus, passing time, etc.)
      for (const rp of routePlaces) {
        const key = rp.id || `${rp.category}-${rp.lat.toFixed(5)},${rp.lng.toFixed(5)}`;
        placeMap.set(key, rp);
      }

      const placesToRender = Array.from(placeMap.values());

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

          // Safe popup text construction
          const container = document.createElement("div");
          container.style.fontFamily = "sans-serif";
          container.style.fontSize = "12px";
          container.style.lineHeight = "1.4";

          const header = document.createElement("strong");
          header.style.color = meta.color;
          header.textContent = meta.label;
          container.appendChild(header);
          container.appendChild(document.createElement("br"));

          const nameEl = document.createElement("b");
          nameEl.textContent = p.name;
          container.appendChild(nameEl);
          container.appendChild(document.createElement("br"));

          const statusSpan = document.createElement("span");
          statusSpan.style.fontWeight = "600";
          statusSpan.style.color = isOpen ? "#10b981" : p.openingStatus === "closed" ? "#f43f5e" : "#8b9bb0";
          statusSpan.textContent = `● ${statusText}`;
          container.appendChild(statusSpan);

          if (p.estimatedPassingMinute !== undefined) {
            container.appendChild(document.createElement("br"));
            const passSpan = document.createElement("span");
            passSpan.style.color = "#8b9bb0";
            passSpan.textContent = `Pass ~${p.estimatedPassingMinute}m into journey`;
            container.appendChild(passSpan);
          }

          marker.bindPopup(container);
          group.addLayer(marker);
        }
      }

      // 3. Render Cameras
      if (layers.cameras) {
        const routeCams = selected.camerasAlongRoute ?? [];
        const camMap = new Map<string, MappedPlace>();
        for (const c of cameras) {
          const key = c.id || `cam-${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
          camMap.set(key, c);
        }
        for (const rc of routeCams) {
          const key = rc.id || `cam-${rc.lat.toFixed(5)},${rc.lng.toFixed(5)}`;
          camMap.set(key, rc);
        }
        const camsToRender = Array.from(camMap.values());

        for (const cam of camsToRender) {
          const camMarker = L.circleMarker([cam.lat, cam.lng], {
            radius: 5,
            color: "#475569",
            fillColor: "#334155",
            fillOpacity: 0.9,
            weight: 2,
          });

          const camContainer = document.createElement("div");
          camContainer.style.fontFamily = "sans-serif";
          camContainer.style.fontSize = "12px";

          const camHeader = document.createElement("strong");
          camHeader.textContent = "📷 Mapped Surveillance Camera";
          camContainer.appendChild(camHeader);
          camContainer.appendChild(document.createElement("br"));

          const camNote = document.createElement("span");
          camNote.style.color = "#8b9bb0";
          camNote.textContent = "Mapped on OpenStreetMap. Note: Live recording/monitoring not guaranteed.";
          camContainer.appendChild(camNote);

          camMarker.bindPopup(camContainer);
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
