import { useEffect, useRef } from "react";
import type { PlannedRoute } from "@/lib/sahay/routing";

export function RouteMap({
  routes,
  selectedId,
}: {
  routes: PlannedRoute[];
  selectedId: string | null;
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
      const L = mod.default;
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
            : route.objective === "safety-focused"
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

      const origin = selected.geometry[0]!;
      const dest = selected.geometry[selected.geometry.length - 1]!;
      L.circleMarker(origin, {
        radius: 6,
        color: "#0f766e",
        fillColor: "#0f766e",
        fillOpacity: 1,
      }).addTo(created);
      L.circleMarker(dest, {
        radius: 6,
        color: "#b94f43",
        fillColor: "#b94f43",
        fillOpacity: 1,
      }).addTo(created);

      if (bounds.isValid()) {
        created.fitBounds(bounds, { padding: [18, 18] });
      }
      window.setTimeout(() => map?.invalidateSize(), 80);
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [routes, selectedId]);

  if (routes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-[16px] bg-muted text-xs text-muted-fg"
        style={{ height: 192, minHeight: 192, flexShrink: 0 }}
      >
        Search a destination to see routes.
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-[16px] bg-muted"
      style={{ height: 210, minHeight: 210, flexShrink: 0 }}
    >
      <div
        ref={hostRef}
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
        data-testid="safe-route-map"
      />
    </div>
  );
}
