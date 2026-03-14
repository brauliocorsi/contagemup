import { useEffect, useState } from 'react';
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

// Decode OSRM polyline (polyline6 format)
function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const factor = Math.pow(10, precision);
  const result: [number, number][] = [];
  let lat = 0;
  let lng = 0;
  let index = 0;

  while (index < encoded.length) {
    let shift = 0;
    let b: number;
    let dlat = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      dlat |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (dlat & 1) ? ~(dlat >> 1) : (dlat >> 1);

    shift = 0;
    let dlng = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      dlng |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (dlng & 1) ? ~(dlng >> 1) : (dlng >> 1);

    result.push([lat / factor, lng / factor]);
  }
  return result;
}

function RoadRoute({ waypoints }: { waypoints: [number, number][] }) {
  const [roadPath, setRoadPath] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (waypoints.length < 2) {
      setRoadPath([]);
      return;
    }

    const fetchRoute = async () => {
      setLoading(true);
      try {
        // OSRM expects lon,lat format
        const coords = waypoints.map(([lat, lon]) => `${lon},${lat}`).join(';');
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline`
        );
        const data = await response.json();
        if (data.code === 'Ok' && data.routes?.[0]?.geometry) {
          const decoded = decodePolyline(data.routes[0].geometry);
          setRoadPath(decoded);
        } else {
          // Fallback to straight lines
          setRoadPath(waypoints);
        }
      } catch {
        // Fallback to straight lines
        setRoadPath(waypoints);
      } finally {
        setLoading(false);
      }
    };

    fetchRoute();
  }, [JSON.stringify(waypoints)]);

  if (roadPath.length < 2) return null;

  return (
    <Polyline
      positions={roadPath}
      pathOptions={{
        color: 'hsl(221, 83%, 53%)',
        weight: 4,
        opacity: 0.8,
      }}
    />
  );
}

export function RouteMap({ stops, departureLat, departureLon, departureLabel, returnToBase }: RouteMapProps) {
  const positions: [number, number][] = stops
    .filter(s => s.latitude && s.longitude)
    .map(s => [s.latitude!, s.longitude!]);

  const hasDeparture = departureLat != null && departureLon != null;

  // Build waypoints: departure → stops → (return to departure)
  const waypoints: [number, number][] = [];
  if (hasDeparture) {
    waypoints.push([departureLat!, departureLon!]);
  }
  waypoints.push(...positions);
  if (returnToBase && hasDeparture && positions.length > 0) {
    waypoints.push([departureLat!, departureLon!]);
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

      {/* Road route */}
      <RoadRoute waypoints={waypoints} />

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
            icon={createNumberedIcon((stop.order_number ?? idx) + 1)}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold">{(stop.order_number ?? idx) + 1}. {stop.client_name}</p>
                {stop.venda_codigo && <p>📋 Nota: {stop.venda_codigo}</p>}
                {stop.venda_status && <p>📦 {stop.venda_status}</p>}
                {stop.postal_code && <p>📮 {stop.postal_code}</p>}
                {stop.city && <p>🏙️ {stop.city}</p>}
                {stop.municipio && <p>🏛️ {stop.municipio}</p>}
                {stop.address && <p>📍 {stop.address}</p>}
                {stop.notes && <p>📝 {stop.notes}</p>}
              </div>
            </Popup>
          </Marker>
        )
      ))}
    </MapContainer>
  );
}
