import { useState, useRef, useEffect, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

let searchMarker: L.Marker | null = null;
let searchCircle: L.Circle | null = null;

export default function SearchControl() {
  const map = useMap();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=en`
      );
      const data: SearchResult[] = await res.json();
      setResults(data);
      setIsOpen(data.length > 0);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  }

  function handleSelect(result: SearchResult) {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    // Remove old marker/circle
    if (searchMarker) { searchMarker.remove(); searchMarker = null; }
    if (searchCircle) { searchCircle.remove(); searchCircle = null; }

    // Add marker + circle
    searchMarker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:24px;height:24px;background:#f59e0b;border:3px solid white;border-radius:50%;box-shadow:0 0 12px #f59e0b80;cursor:pointer"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;background:white;border-radius:50%"></div></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).addTo(map);
    searchMarker.bindPopup(`<b>${result.display_name.split(',')[0]}</b><br/><small>${lat.toFixed(5)}, ${lon.toFixed(5)}</small>`).openPopup();

    searchCircle = L.circle([lat, lon], {
      radius: 300,
      color: '#f59e0b',
      fillColor: '#f59e0b',
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(map);

    map.flyTo([lat, lon], 15);

    setQuery(result.display_name.split(',')[0]);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && results.length > 0) {
      handleSelect(results[0]);
    }
  }

  return (
    <div ref={containerRef} className="map-search-control">
      <div className="map-search-input-wrapper">
        <svg className="map-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search location..."
          className="map-search-input"
        />
        {searching && (
          <div className="map-search-spinner" />
        )}
      </div>
      {isOpen && results.length > 0 && (
        <ul className="map-search-dropdown">
          {results.map((r) => (
            <li key={r.place_id} onMouseDown={() => handleSelect(r)} className="map-search-item">
              <svg className="map-search-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{r.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
