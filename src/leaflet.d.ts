declare module "leaflet" {
  const leaflet: {
    map: (
      element: HTMLElement,
      options?: Record<string, unknown>,
    ) => LeafletMap;
    tileLayer: (
      url: string,
      options?: Record<string, unknown>,
    ) => { addTo: (map: LeafletMap) => void };
    polyline: (
      latlngs: Array<[number, number]>,
      options?: Record<string, unknown>,
    ) => {
      addTo: (map: LeafletMap) => LeafletLine;
      getBounds: () => unknown;
    };
    circleMarker: (
      latlng: [number, number],
      options?: Record<string, unknown>,
    ) => { addTo: (map: LeafletMap) => void };
    latLngBounds: (latlngs: unknown) => {
      extend: (bounds: unknown) => void;
      isValid: () => boolean;
    };
    default: typeof leaflet;
  };
  export type LeafletMap = {
    remove: () => void;
    invalidateSize: () => void;
    setView: (center: [number, number], zoom: number) => LeafletMap;
    fitBounds: (bounds: unknown, options?: unknown) => void;
  };
  export type LeafletLine = {
    getBounds: () => unknown;
  };
  export default leaflet;
}

declare module "leaflet/dist/leaflet.css";
