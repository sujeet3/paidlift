// Google Maps client utilities (polyline decode + backend proxy client).

export type Coordinate = { latitude: number; longitude: number };

export type DirectionsResult = {
  distanceMeters: number;
  durationSeconds: number;
  overviewPolyline: string;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  mocked: boolean;
};

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export function decodePolyline(encoded: string): Coordinate[] {
  let i = 0;
  let lat = 0;
  let lng = 0;
  const out: Coordinate[] = [];
  while (i < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return out;
}

export async function fetchDirections(
  origin: string,
  destination: string,
  waypoints: string[] = [],
): Promise<DirectionsResult> {
  const res = await fetch(`${BASE}/api/maps/directions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, waypoints, mode: "driving", departure_time: "now" }),
  });
  if (!res.ok) throw new Error("Route unavailable");
  return res.json();
}

export async function placesAutocomplete(
  input: string,
  sessionToken: string,
): Promise<{ suggestions: { placeId: string; text: string; secondary: string }[]; mocked: boolean }> {
  const q = new URLSearchParams({ input, session_token: sessionToken });
  const res = await fetch(`${BASE}/api/maps/places/autocomplete?${q}`);
  if (!res.ok) return { suggestions: [], mocked: true };
  return res.json();
}

export function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
