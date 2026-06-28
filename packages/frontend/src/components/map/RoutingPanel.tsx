import { useState, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface RouteStep {
  distance: number;
  duration: number;
  instruction: string;
  name: string;
}

interface RouteResult {
  distance: number;   // meters
  duration: number;   // seconds
  geometry: [number, number][];
  steps: RouteStep[];
}

let routeLine: L.Polyline | null = null;
let startMarker: L.Marker | null = null;
let endMarker: L.Marker | null = null;

const markerIcon = (color: string, label: string) =>
  L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:${color};border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:white;box-shadow:0 2px 8px rgba(0,0,0,0.4)">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

export default function RoutingPanel() {
  const map = useMap();
  const [isOpen, setIsOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromCoords, setFromCoords] = useState<[number, number] | null>(null);
  const [toCoords, setToCoords] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const clearRoute = useCallback(() => {
    if (routeLine) { routeLine.remove(); routeLine = null; }
    if (startMarker) { startMarker.remove(); startMarker = null; }
    if (endMarker) { endMarker.remove(); endMarker = null; }
  }, []);

  async function geocode(query: string): Promise<[number, number] | null> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=en`
      );
      const data = await res.json();
      if (data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch {}
    return null;
  }

  async function handleRoute() {
    setError('');
    setLoading(true);
    clearRoute();

    try {
      let start: [number, number] | null = fromCoords;
      let end: [number, number] | null = toCoords;

      if (!start && from.trim()) {
        start = await geocode(from);
        if (start) setFromCoords(start);
      }
      if (!end && to.trim()) {
        end = await geocode(to);
        if (end) setToCoords(end);
      }

      if (!start || !end) {
        setError('Could not find one or both locations. Try more specific names.');
        setLoading(false);
        return;
      }

      // Call OSRM
      const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true&alternatives=false`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.routes || data.routes.length === 0) {
        setError('No route found between these locations.');
        setLoading(false);
        return;
      }

      const r = data.routes[0];
      const coords: [number, number][] = r.geometry.coordinates.map(
        (c: number[]) => [c[1], c[0]] as [number, number]
      );

      // Draw route line
      routeLine = L.polyline(coords, {
        color: '#3b82f6',
        weight: 5,
        opacity: 0.8,
      }).addTo(map);

      // Draw markers
      startMarker = L.marker(start, { icon: markerIcon('#22c55e', 'A') }).addTo(map);
      endMarker = L.marker(end, { icon: markerIcon('#ef4444', 'B') }).addTo(map);

      // Fit bounds
      const bounds = L.latLngBounds([start, end]);
      map.fitBounds(bounds, { padding: [80, 80] });

      // Parse steps
      const steps: RouteStep[] = (r.legs?.[0]?.steps || []).map((s: any) => ({
        distance: s.distance,
        duration: s.duration,
        instruction: s.maneuver?.instruction || 'Continue',
        name: s.name || '',
      }));

      setRoute({
        distance: r.distance,
        duration: r.duration,
        geometry: coords,
        steps,
      });
    } catch {
      setError('Failed to calculate route. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    clearRoute();
    setFrom('');
    setTo('');
    setFromCoords(null);
    setToCoords(null);
    setRoute(null);
    setError('');
  }

  function formatDist(m: number) {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m)} m`;
  }

  function formatTime(s: number) {
    const min = Math.round(s / 60);
    if (min >= 60) {
      const h = Math.floor(min / 60);
      return `${h}h ${min % 60}min`;
    }
    return `${min} min`;
  }

  return (
    <div className={`map-routing-panel ${isOpen ? 'map-routing-panel-open' : ''}`}>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="map-routing-toggle"
        title="Find directions"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="3 11 22 2 13 21 11 13 3 11" />
        </svg>
      </button>

      {/* Panel */}
      <div className="map-routing-body">
        <div className="map-routing-header">
          <h3>Find Directions</h3>
          <button onClick={() => setIsOpen(false)} className="map-routing-close">&times;</button>
        </div>

        <div className="map-routing-form">
          <div className="map-routing-field">
            <span className="map-routing-dot" style={{ background: '#22c55e' }} />
            <input
              type="text"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setFromCoords(null); }}
              placeholder="Origin (e.g. Jakarta Pusat)"
            />
          </div>
          <div className="map-routing-field">
            <span className="map-routing-dot" style={{ background: '#ef4444' }} />
            <input
              type="text"
              value={to}
              onChange={(e) => { setTo(e.target.value); setToCoords(null); }}
              placeholder="Destination (e.g. Bandung)"
            />
          </div>

          {error && <p className="map-routing-error">{error}</p>}

          <div className="map-routing-actions">
            <button onClick={handleRoute} disabled={loading} className="map-routing-btn-primary">
              {loading ? 'Calculating...' : 'Get Directions'}
            </button>
            {route && (
              <button onClick={handleClear} className="map-routing-btn-secondary">
                Clear
              </button>
            )}
          </div>
        </div>

        {route && (
          <div className="map-routing-result">
            <div className="map-routing-summary">
              <div>
                <span className="map-routing-label">Distance</span>
                <strong>{formatDist(route.distance)}</strong>
              </div>
              <div>
                <span className="map-routing-label">Duration</span>
                <strong>{formatTime(route.duration)}</strong>
              </div>
            </div>
            <ol className="map-routing-steps">
              {route.steps.slice(0, 10).map((step, i) => (
                <li key={i}>
                  <span className="map-routing-step-icon">
                    {step.instruction.toLowerCase().includes('turn') ? '↪' :
                     step.instruction.toLowerCase().includes('roundabout') ? '⭮' :
                     step.instruction.toLowerCase().includes('arrive') ? '🏁' : '↑'}
                  </span>
                  <div>
                    <p>{step.instruction}</p>
                    {step.name && <small>{step.name} &middot; {formatDist(step.distance)}</small>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
