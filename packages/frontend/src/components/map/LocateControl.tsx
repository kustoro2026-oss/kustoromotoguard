import { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export default function LocateControl() {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const [active, setActive] = useState(false);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const watchRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
      if (markerRef.current) markerRef.current.remove();
      if (circleRef.current) circleRef.current.remove();
    };
  }, []);

  function clearLocation() {
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
    if (circleRef.current) { circleRef.current.remove(); circleRef.current = null; }
  }

  function handleLocate() {
    if (active) {
      // Stop tracking
      setActive(false);
      setLocating(false);
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      clearLocation();
      return;
    }

    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setLocating(true);

    // First, try one-time position for quick response
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setActive(true);
        updatePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 16);
      },
      (err) => {
        setLocating(false);
        alert(`Location error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Then start watching for continuous updates
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        updatePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
    );
  }

  function updatePosition(lat: number, lng: number, accuracy: number) {
    clearLocation();

    markerRef.current = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#3b82f6',
      color: '#ffffff',
      weight: 3,
      opacity: 1,
      fillOpacity: 1,
    }).addTo(map);

    markerRef.current.bindPopup(
      `<b>📍 Your Location</b><br/><small>Accuracy: ±${Math.round(accuracy)}m</small>`
    );

    circleRef.current = L.circle([lat, lng], {
      radius: accuracy,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      weight: 1,
    }).addTo(map);
  }

  return (
    <div className="map-locate-control">
      <button
        onClick={handleLocate}
        className={`map-control-btn ${active ? 'map-control-btn-active' : ''}`}
        title={active ? 'Stop tracking' : 'Find my location'}
      >
        {locating ? (
          <div className="map-control-spinner" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        )}
      </button>
    </div>
  );
}
