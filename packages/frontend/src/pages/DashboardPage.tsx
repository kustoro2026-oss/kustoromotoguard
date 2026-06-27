import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../services/api';
import { connectSocket, subscribeToFleet } from '../services/socket';
import { useDeviceStore, Device, DeviceLocation } from '../store/deviceStore';
import { useAuthStore } from '../store/authStore';

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

  const unreadAlerts = alerts.filter((a) => !a.is_read).length;

  useEffect(() => {
    // Fetch devices
    api.getDevices().then((data) => setDevices(data.devices));
    api.getAlerts().then((data) => setAlerts(data.alerts));

    // Connect WebSocket
    connectSocket();
    subscribeToFleet();

    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
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
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Vehicles ({devices.length})
            </h2>
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
              {devices.length === 0 && (
                <p className="text-sm text-gray-500 p-3">No devices found</p>
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
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <DeviceTrails locations={locations} />
            <FitBounds devices={devices} locations={locations} />
          </MapContainer>
        </main>
      </div>
    </div>
  );
}
