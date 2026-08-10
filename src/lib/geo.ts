import { Wrench, Zap, Hammer, Cog, type LucideIcon } from "lucide-react";

// Haversine distance in km
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Rough ETA assuming 30 km/h urban avg
export function etaMinutes(km: number, avgKmh = 30) {
  return Math.max(1, Math.round((km / avgKmh) * 60));
}

// `icon` (emoji) is kept only for contexts that render raw HTML strings
// (Leaflet map pins, which can't mount a React component). Everywhere else
// in the UI, render `Icon` — a real vector icon reads as a lot more
// polished than emoji, which varies wildly in style/alignment across
// platforms (Windows vs. macOS vs. Android render the same emoji very
// differently).
export const SERVICE_META = {
  plumber: {
    label: "Plumber",
    sw: "Bomba",
    icon: "🔧",
    Icon: Wrench,
    price: 25000,
    color: "#2563eb",
  },
  electrician: {
    label: "Electrician",
    sw: "Umeme",
    icon: "⚡",
    Icon: Zap,
    price: 30000,
    color: "#eab308",
  },
  carpenter: {
    label: "Carpenter",
    sw: "Seremala",
    icon: "🪚",
    Icon: Hammer,
    price: 20000,
    color: "#b45309",
  },
  mechanic: {
    label: "Mechanic",
    sw: "Fundi Gari",
    icon: "🔩",
    Icon: Cog,
    price: 35000,
    color: "#64748b",
  },
} satisfies Record<
  string,
  { label: string; sw: string; icon: string; Icon: LucideIcon; price: number; color: string }
>;

export type ServiceKey = keyof typeof SERVICE_META;

// Dar es Salaam default
export const DEFAULT_CENTER = { lat: -6.7924, lng: 39.2083 };

// Max distance (in meters) within which a fundi can confirm arrival
export const ARRIVAL_RADIUS_M = 150;

export function formatTsh(n: number) {
  return new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(n) + " TSh";
}

// ----- OSRM routing (free, no API key) -----
// Returns route geometry (lat,lng pairs), distance (km) and duration (minutes)
export type RouteResult = {
  coords: [number, number][];
  km: number;
  minutes: number;
};

const ROUTE_CACHE_TTL_MS = 20_000;
const routeCache = new Map<string, { at: number; res: RouteResult }>();

// Cache keys are rounded to ~11m, so a GPS-driven caller (route re-fetched
// every few seconds during active tracking) produces a near-constant stream
// of new keys — entries were only ever added, never evicted, so a long
// session (fundi keeps the app open all day) grew this Map without bound.
// Sweep expired entries whenever we're about to add a new one.
function evictExpiredRoutes() {
  const now = Date.now();
  for (const [key, entry] of routeCache) {
    if (now - entry.at >= ROUTE_CACHE_TTL_MS) routeCache.delete(key);
  }
}

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<RouteResult | null> {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}->${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.at < ROUTE_CACHE_TTL_MS) return cached.res;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    const j = await r.json();
    const route = j?.routes?.[0];
    if (!route) return null;
    const coords: [number, number][] = (route.geometry.coordinates as [number, number][]).map(
      ([lng, lat]) => [lat, lng],
    );
    const res: RouteResult = {
      coords,
      km: route.distance / 1000,
      minutes: Math.max(1, Math.round(route.duration / 60)),
    };
    evictExpiredRoutes();
    routeCache.set(key, { at: Date.now(), res });
    return res;
  } catch {
    return null;
  }
}
