import type { Journey } from "./models.ts";

export const DEVIATION_THRESHOLD_METERS = 80;
export const DEVIATION_REQUIRED_STREAK = 2;
export const MAX_ACCURACY_METERS = 60;

export function completeJourney(journey: Journey): Journey {
  return {
    ...journey,
    liveOffRoute: journey.liveOffRoute ?? false,
    locationWatchRequested: journey.locationWatchRequested ?? false,
    deviationStreak:
      typeof journey.deviationStreak === "number" ? journey.deviationStreak : 0,
    locationWatchNote: journey.locationWatchNote ?? null,
  };
}

export function distanceToPolylineMeters(
  lat: number,
  lng: number,
  geometry: [number, number][],
): number | null {
  if (geometry.length < 2) return null;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < geometry.length; index += 1) {
    const distance = distanceToSegmentMeters(
      lat,
      lng,
      geometry[index - 1]!,
      geometry[index]!,
    );
    if (distance < best) best = distance;
  }
  return Number.isFinite(best) ? best : null;
}

function distanceToSegmentMeters(
  lat: number,
  lng: number,
  start: [number, number],
  end: [number, number],
): number {
  const lat0 = ((start[0] + end[0]) / 2) * (Math.PI / 180);
  const kx = 111320 * Math.cos(lat0);
  const ky = 110540;
  const bx = (end[1] - start[1]) * kx;
  const by = (end[0] - start[0]) * ky;
  const px = (lng - start[1]) * kx;
  const py = (lat - start[0]) * ky;
  const len2 = bx * bx + by * by;
  const raw = len2 === 0 ? 0 : (px * bx + py * by) / len2;
  const t = Math.max(0, Math.min(1, raw));
  return Math.hypot(px - bx * t, py - by * t);
}

export interface DeviationObservation {
  streak: number;
  liveOffRoute: boolean;
  distanceMeters: number | null;
  status:
    | "on_route"
    | "off_route"
    | "confirming"
    | "ignored_accuracy"
    | "no_geometry"
    | "no_fix";
  note: string;
}

export function nextDeviationObservation(input: {
  previousStreak: number;
  previouslyOffRoute: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  geometry: [number, number][] | null | undefined;
}): DeviationObservation {
  if (input.latitude === null || input.longitude === null) {
    return {
      streak: input.previousStreak,
      liveOffRoute: input.previouslyOffRoute,
      distanceMeters: null,
      status: "no_fix",
      note: "This update has no coordinates. Missing GPS is not treated as danger, and it does not by itself mean you left the route.",
    };
  }
  if (!input.geometry || input.geometry.length < 2) {
    return {
      streak: 0,
      liveOffRoute: false,
      distanceMeters: null,
      status: "no_geometry",
      note: "This journey has no walking line to compare, so Sahay is not judging route deviation.",
    };
  }
  if (input.accuracy !== null && input.accuracy > MAX_ACCURACY_METERS) {
    return {
      streak: input.previousStreak,
      liveOffRoute: input.previouslyOffRoute,
      distanceMeters: null,
      status: "ignored_accuracy",
      note: `This fix is only accurate to about ${Math.round(input.accuracy)} m, so it was ignored. A coarse GPS fix is not counted as leaving the route.`,
    };
  }
  const distance = distanceToPolylineMeters(
    input.latitude,
    input.longitude,
    input.geometry,
  );
  if (distance === null) {
    return {
      streak: 0,
      liveOffRoute: false,
      distanceMeters: null,
      status: "no_geometry",
      note: "The walking line could not be measured, so no deviation was recorded.",
    };
  }
  const rounded = Math.round(distance);
  if (distance <= DEVIATION_THRESHOLD_METERS) {
    return {
      streak: 0,
      liveOffRoute: false,
      distanceMeters: rounded,
      status: "on_route",
      note: `About ${rounded} m from the chosen walking line. Still counted as on the route.`,
    };
  }
  const streak = input.previousStreak + 1;
  const offRoute = streak >= DEVIATION_REQUIRED_STREAK;
  return {
    streak,
    liveOffRoute: offRoute,
    distanceMeters: rounded,
    status: offRoute ? "off_route" : "confirming",
    note: offRoute
      ? `About ${rounded} m from the chosen line on ${streak} updates in a row. Sahay will use the normal check-in rules. This is phone GPS, not proof of harm.`
      : `About ${rounded} m from the chosen line. One update is not enough, so Sahay is waiting for another before calling it off-route.`,
  };
}
