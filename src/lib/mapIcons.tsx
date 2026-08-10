import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import { MapPin } from "lucide-react";
import { SERVICE_META, type ServiceKey } from "./geo";

// Map pins render as raw Leaflet divIcon HTML, so they can't mount a React
// component directly — pre-render each service's vector icon to an SVG
// string once and reuse it. A real icon reads far more professional on a
// pin than an emoji glyph, and this keeps the pin visually identical to the
// icon used in the rest of the UI (service picker, badges, etc).
const svgCache = new Map<ServiceKey, string>();
function serviceSvg(key: ServiceKey): string {
  let svg = svgCache.get(key);
  if (!svg) {
    const Icon = SERVICE_META[key].Icon;
    svg = renderToStaticMarkup(<Icon color="white" size={18} strokeWidth={2.25} />);
    svgCache.set(key, svg);
  }
  return svg;
}

/** Circular colored map pin for a fundi/service marker. */
export function servicePin(key: ServiceKey, size = 36) {
  const color = SERVICE_META[key].color;
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;border:2px solid white;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.25)">${serviceSvg(key)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

let destinationSvg: string | null = null;

/** Circular colored pin marking a destination (e.g. the client's job site). */
export function destinationPin(color: string, size = 34) {
  destinationSvg ??= renderToStaticMarkup(<MapPin color="white" size={16} strokeWidth={2.25} />);
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;border:2px solid white;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.25)">${destinationSvg}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Pulsing blue dot for "you are here" — matches the universal map convention. */
export function userLocationIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative"><div style="position:absolute;inset:-12px;background:#3b82f6;opacity:.25;border-radius:50%;animation:pulse 2s infinite"></div><div style="background:#2563eb;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,.3);position:relative"></div></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
