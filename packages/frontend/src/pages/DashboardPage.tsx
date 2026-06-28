import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../services/api';
import { connectSocket, subscribeToFleet } from '../services/socket';
import { useDeviceStore, Device, DeviceLocation } from '../store/deviceStore';
import { useAuthStore } from '../store/authStore';
import SearchControl from '../components/map/SearchControl';
import LocateControl from '../components/map/LocateControl';
import RoutingPanel from '../components/map/RoutingPanel';

// Custom marker icons
const onlineIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#22c55e;border:2px solid white;border-radius:50%;box-shadow:0 0 8px #22c55e80"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const offlineIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#ef4444;border:2px solid white;border-radius:50%"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Auto-fit map to markers
function FitBounds({ devices, locations }: { devices: Device[]; locations: Record<string, DeviceLocation> }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([]);
    devices.forEach((d) => {
      const loc = locations[d.id];
      if (loc) bounds.extend([loc.latitude, loc.longitude]);
    });
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, devices, locations]);
  return null;
}

// Device trails
function DeviceTrails({ locations }: { locations: Record<string, DeviceLocation> }) {
  return (
    <>
      {Object.entries(locations).map(([id, loc]) => (
        <Marker key={id} position={[loc.latitude, loc.longitude]} icon={onlineIcon}>
          <Popup>
            <div className="text-sm text-gray-900">
              <strong>ID:</strong> {id.slice(0, 8)}...<br />
              <strong>Speed:</strong> {loc.speed} km/h
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const devices = useDeviceStore((s) => s.devices);
  const locations = useDeviceStore((s) => s.locations);
  const sensors = useDeviceStore((s) => s.sensors);
  const alerts = useDeviceStore((s) => s.alerts);
  const setDevices = useDeviceStore((s) => s.setDevices);
  const setAlerts = useDeviceStore((s) => s.setAlerts);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const unreadAlerts = alerts.filter((a) => !a.is_read).length;
  const onlineCount = devices.filter((d) => d.status === 'online').length;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError('');
        const [devData, alertData] = await Promise.all([
          api.getDevices(),
          api.getAlerts(),
        ]);
        if (!cancelled) {
          setDevices(devData.devices);
          setAlerts(alertData.alerts);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Connect WebSocket
    connectSocket();
    subscribeToFleet();

    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => { cancelled = true; };
  }, [setDevices, setAlerts]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold tracking-tight">Kustoro Fleet</h1>
        <div className="flex items-center gap-4">
          {/* Alert badge */}
          <button
            onClick={() => navigate(`/device/alerts`)}
            className="relative text-gray-400 hover:text-white transition-colors"
            title="Alerts"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadAlerts > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {unreadAlerts}
              </span>
            )}
          </button>

          <span className="text-sm text-gray-400">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content: Map + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Device List Sidebar */}
        <aside className="w-72 bg-gray-900 border-r border-gray-800 overflow-y-auto shrink-0">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Vehicles
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              {onlineCount}/{devices.length} online
            </p>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}
            {loading && (
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-3">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-500" />
                Loading devices...
              </div>
            )}
            {!loading && !error && devices.length === 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3">
                <p className="text-yellow-400 text-xs">
                  No devices found. Run the migration first:
                  <code className="block mt-1 bg-gray-800 px-2 py-1 rounded text-yellow-300">
                    npm run db:migrate
                  </code>
                </p>
              </div>
            )}
            <div className="space-y-1">
              {devices.map((device) => {
                const loc = locations[device.id];
                const sensor = sensors[device.id];
                return (
                  <button
                    key={device.id}
                    onClick={() => navigate(`/device/${device.id}`)}
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-800 transition-colors border border-transparent hover:border-gray-700"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          device.status === 'online' ? 'bg-green-500 pulse-dot' : 'bg-red-500'
                        }`}
                      />
                      <span className="text-sm font-medium text-white truncate">
                        {device.name}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 ml-4">{device.plate_number}</p>
                    {loc && (
                      <p className="text-xs text-gray-400 ml-4 mt-1">
                        {loc.speed} km/h
                        {sensor && <> &middot; Fuel: {sensor.fuel_level}%</>}
                      </p>
                    )}
                  </button>
                );
              })}
              {!loading && devices.length > 0 && locations && Object.keys(locations).length === 0 && (
                <p className="text-sm text-gray-500 p-3">
                  Waiting for live data from devices...
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <MapContainer
            center={[-6.2088, 106.8456]}
            zoom={13}
            className="w-full h-full"
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <DeviceTrails locations={locations} />
            <FitBounds devices={devices} locations={locations} />
            <SearchControl />
            <LocateControl />
            <RoutingPanel />
          </MapContainer>

          {/* Overlay when no live data */}
          {!loading && devices.length > 0 && Object.keys(locations).length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
              <div className="bg-gray-900/90 backdrop-blur rounded-xl px-6 py-4 border border-gray-700 text-center">
                <p className="text-white font-medium mb-1">No live data yet</p>
                <p className="text-gray-400 text-sm">
                  Start the simulator to see devices moving:
                </p>
                <code className="block mt-2 bg-gray-800 px-3 py-1.5 rounded text-green-400 text-xs">
                  docker compose up -d &amp;&amp; npm run dev:simulator
                </code>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
