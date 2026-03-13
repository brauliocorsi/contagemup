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

function FitBounds({ stops }: { stops: RouteStop[] }) {
  const map = useMap();

  useEffect(() => {
    if (stops.length === 0) return;
    const bounds = L.latLngBounds(
      stops.map(s => [s.latitude!, s.longitude!] as [number, number])
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [stops, map]);

  return null;
}

export function RouteMap({ stops }: RouteMapProps) {
  const positions: [number, number][] = stops
    .filter(s => s.latitude && s.longitude)
    .map(s => [s.latitude!, s.longitude!]);

  const center: [number, number] = positions.length > 0
    ? positions[0]
    : [39.3999, -8.2245]; // Portugal center

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
      <FitBounds stops={stops} />

      {/* Route line */}
      {positions.length > 1 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: 'hsl(221, 83%, 53%)', weight: 3, opacity: 0.7, dashArray: '10, 6' }}
        />
      )}

      {/* Markers */}
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
