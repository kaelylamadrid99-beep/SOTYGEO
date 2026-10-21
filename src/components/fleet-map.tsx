import { useEffect, useRef } from "react";
import { parsePolygon } from "@/lib/geo";
import { MOTION_LABEL } from "@/lib/sotygeo/format";
import type { Geofence } from "@/lib/sotygeo/types";

export type MapUnit = {
  id: string;
  economic_number: string;
  license_plate: string;
  current_latitude: number | null;
  current_longitude: number | null;
  last_speed: number;
  last_heading: number;
  motion_state: string;
  driver_name?: string | null;
  client_name?: string | null;
  fleet_name?: string | null;
  gps_provider?: string | null;
};

type Props = {
  units: MapUnit[];
  geofences?: Geofence[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  focus?: { lat: number; lng: number; zoom?: number } | null;
  route?: { lat: number; lng: number }[] | null;
  playhead?: { lat: number; lng: number } | null;
};

const FENCE_COLOR: Record<string, string> = {
  BASE: "#0284c7",
  CLIENTE: "#16a34a",
  OPERACION: "#d97706",
  RESTRINGIDA: "#dc2626",
  OTRA: "#64748b",
};

/**
 * Seguridad (anti Stored XSS): Leaflet inserta como HTML cualquier string que reciba
 * en bindPopup/bindTooltip/divIcon.html. Los datos vienen de la BD, por lo que SIEMPRE
 * se construyen nodos DOM con textContent (nunca se interpolan en HTML).
 */
function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { text?: unknown; style?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (opts.style) e.setAttribute("style", opts.style);
  if (opts.text !== undefined) e.textContent = text(opts.text);
  for (const c of children) e.append(c);
  return e;
}

function tooltipNode(label: unknown): HTMLElement {
  return node("span", { text: label });
}

function markerNode(label: unknown, selected: boolean, border: string): HTMLElement {
  return node("div", { style: "display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%)" }, [
    node("div", {
      text: label,
      style: `min-width:54px;padding:3px 7px;border-radius:4px;background:${selected ? "#0d9488" : "#ffffff"};color:${selected ? "#ffffff" : "#1e293b"};border:1px solid ${border};font:600 11px/1.2 'IBM Plex Mono',monospace;text-align:center;box-shadow:0 4px 12px -6px rgb(15 23 42 / 0.25);`,
    }),
    node("div", { style: `width:2px;height:8px;background:${border}` }),
  ]);
}

function popupNode(u: MapUnit): HTMLElement {
  const root = node("div", { style: "font:12px/1.45 'IBM Plex Sans',sans-serif;min-width:180px" });
  const line = (...parts: (Node | string)[]) => {
    root.append(...parts, document.createElement("br"));
  };
  line(node("strong", { text: u.economic_number }), ` · ${text(u.license_plate)}`);
  if (u.driver_name) line(`Conductor: ${text(u.driver_name)}`);
  if (u.fleet_name) line(`Flotilla: ${text(u.fleet_name)}`);
  if (u.client_name) line(`Cliente: ${text(u.client_name)}`);
  line(text(MOTION_LABEL[u.motion_state as keyof typeof MOTION_LABEL] ?? u.motion_state));
  root.append(`${Math.round(Number(u.last_speed) || 0)} km/h`);
  if (u.gps_provider) root.append(document.createElement("br"), `GPS: ${text(u.gps_provider)}`);
  return root;
}

export function FleetMap({
  units,
  geofences = [],
  selectedId,
  onSelect,
  className,
  focus,
  route,
  playhead,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    if (!el.current) return;
    void (async () => {
      const leaflet = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      const L = (leaflet as { default?: typeof leaflet }).default ?? leaflet;
      if (cancelled || !el.current) return;
      const map = L.map(el.current, {
        zoomControl: true,
        attributionControl: true,
        minZoom: 4,
        maxZoom: 16,
      }).setView([23.6, -101.5], 5.4);
      // Carto public Dark Matter tiles now return "API KEY REQUIRED".
      // OSM raster + CSS invert keeps the dark dashboard look without a vendor key.
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        subdomains: "abc",
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
        className: "sotygeo-basemap",
      }).addTo(map);
      const layers = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layers;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;
    void import("leaflet").then((mod) => {
      const L = (mod as { default?: typeof mod }).default ?? mod;
      layers.clearLayers();
      for (const g of geofences) {
        const color = FENCE_COLOR[g.type] ?? "#64748b";
        const ring = parsePolygon(g.polygon);
        if (ring.length >= 3) {
          L.polygon(
            ring.map((p) => [p.lat, p.lng] as [number, number]),
            { color, weight: 1, fillOpacity: 0.12 },
          )
            .bindTooltip(tooltipNode(g.name))
            .addTo(layers);
        } else {
          L.circle([g.lat, g.lng], { radius: g.radius_m, color, weight: 1, fillOpacity: 0.1 })
            .bindTooltip(tooltipNode(g.name))
            .addTo(layers);
        }
      }
      if (route && route.length > 1) {
        L.polyline(
          route.map((p) => [p.lat, p.lng] as [number, number]),
          { color: "#64748b", weight: 2.5, opacity: 0.7 },

        ).addTo(layers);
      }
      if (playhead) {
        L.circleMarker([playhead.lat, playhead.lng], {
          radius: 7,
          color: "#ffffff",
          fillColor: "#16a34a",
          fillOpacity: 1,
        }).addTo(layers);
      }
      for (const u of units) {
        if (u.current_latitude == null || u.current_longitude == null) continue;
        const moving = u.motion_state === "MOVING";
        const selected = u.id === selectedId;
        const border =
          u.motion_state === "OFFLINE" ? "#dc2626" : moving ? "#16a34a" : "#d97706";
        const icon = L.divIcon({
          className: "unit-marker",
          html: markerNode(u.economic_number, selected, border),
          iconSize: [0, 0],
        });
        const marker = L.marker([u.current_latitude, u.current_longitude], {
          icon,
          zIndexOffset: selected ? 800 : moving ? 400 : 0,
        });
        marker.bindPopup(popupNode(u));
        marker.on("click", () => onSelectRef.current?.(u.id));
        marker.addTo(layers);
      }
      if (focus) map.setView([focus.lat, focus.lng], focus.zoom ?? 8, { animate: true });
    });
  }, [units, selectedId, focus, route, playhead, geofences]);

  return <div ref={el} className={className ? `relative z-0 isolate ${className}` : "relative z-0 isolate h-full min-h-[320px] w-full"} />;
}
