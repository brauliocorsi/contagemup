import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RouteStop } from '@/hooks/useRoutes';

// Fix default marker icons for Leaflet in Vite/webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface RouteMapProps {
  stops: RouteStop[];
  departureLat?: number | null;
  departureLon?: number | null;
  departureLabel?: string;
  returnToBase?: boolean;
}

function createNumberedIcon(number: number) {
  return L.divIcon({
    className: 'custom-numbered-marker',
    html: `<div style="
      background: hsl(var(--primary));
      color: hsl(var(--primary-foreground));
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 12px;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createHomeIcon() {
  return L.divIcon({
    className: 'custom-home-marker',
    html: `<div style="
      background: hsl(142, 71%, 45%);
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    ">🏠</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function FitBounds({ stops, departureLat, departureLon }: { stops: RouteStop[]; departureLat?: number | null; departureLon?: number | null }) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = stops
      .filter(s => s.latitude && s.longitude)
      .map(s => [s.latitude!, s.longitude!]);
    if (departureLat && departureLon) {
      points.push([departureLat, departureLon]);
    }
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [stops, map, departureLat, departureLon]);

  return null;
}

export function RouteMap({ stops, departureLat, departureLon, departureLabel, returnToBase }: RouteMapProps) {
  const positions: [number, number][] = stops
    .filter(s => s.latitude && s.longitude)
    .map(s => [s.latitude!, s.longitude!]);

  const hasDeparture = departureLat != null && departureLon != null;

  // Build polyline: departure → stops → (return to departure)
  const linePositions: [number, number][] = [];
  if (hasDeparture) {
    linePositions.push([departureLat!, departureLon!]);
  }
  linePositions.push(...positions);
  if (returnToBase && hasDeparture && positions.length > 0) {
    linePositions.push([departureLat!, departureLon!]);
  }

  const center: [number, number] = positions.length > 0
    ? positions[0]
    : hasDeparture
      ? [departureLat!, departureLon!]
      : [39.3999, -8.2245];

  return (
    <MapContainer
      center={center}
      zoom={8}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds stops={stops} departureLat={departureLat} departureLon={departureLon} />

      {/* Route line */}
      {linePositions.length > 1 && (
        <Polyline
          positions={linePositions}
          pathOptions={{ color: 'hsl(221, 83%, 53%)', weight: 3, opacity: 0.7, dashArray: '10, 6' }}
        />
      )}

      {/* Departure marker */}
      {hasDeparture && (
        <Marker
          position={[departureLat!, departureLon!]}
          icon={createHomeIcon()}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-bold">🏠 {departureLabel || 'Ponto de Saída'}</p>
            </div>
          </Popup>
        </Marker>
      )}

      {/* Stop markers */}
      {stops.map((stop, idx) => (
        stop.latitude && stop.longitude && (
          <Marker
            key={stop.id}
            position={[stop.latitude, stop.longitude]}
            icon={createNumberedIcon(idx + 1)}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold">{idx + 1}. {stop.client_name}</p>
                {stop.postal_code && <p>📮 {stop.postal_code}</p>}
                {stop.city && <p>🏙️ {stop.city}</p>}
                {stop.address && <p>📍 {stop.address}</p>}
              </div>
            </Popup>
          </Marker>
        )
      ))}
    </MapContainer>
  );
}
