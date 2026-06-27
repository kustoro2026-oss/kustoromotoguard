import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { api } from '../services/api';
import { connectSocket, subscribeToDevice, unsubscribeFromDevice } from '../services/socket';
import { useDeviceStore } from '../store/deviceStore';
import { useAuthStore } from '../store/authStore';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

const markerIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:20px;height:20px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 12px #3b82f680;position:relative"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:6px;height:6px;background:white;border-radius:50%"></div></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function SpeedGauge({ value, max = 120 }: { value: number; max?: number }) {
  const pct = Math.min(value / max, 1);
  const angle = pct * 180;
  const color =
    pct < 0.5 ? '#22c55e' : pct < 0.75 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-32 h-20 mx-auto">
      <svg viewBox="0 0 120 70" className="w-full h-full">
        <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="#1f2937" strokeWidth="10" />
        <path
          d="M 10 65 A 50 50 0 0 1 110 65"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${angle * 0.87} 180`}
          strokeLinecap="round"
        />
        {/* Needle */}
        <line
          x1="60" y1="65"
          x2={60 + 40 * Math.cos((180 - angle) * Math.PI / 180)}
          y2={65 - 40 * Math.sin((180 - angle) * Math.PI / 180)}
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="60" cy="65" r="3" fill="white" />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 text-center">
        <span className="text-xl font-bold" style={{ color }}>{Math.round(value)}</span>
        <span className="text-xs text-gray-500 ml-1">km/h</span>
      </div>
    </div>
  );
}

function FuelGauge({ value }: { value: number }) {
  const color =
    value > 30 ? '#22c55e' : value > 15 ? '#f59e0b' : '#ef4444';

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>Fuel</span>
        <span style={{ color }}>{Math.round(value)}%</span>
      </div>
      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function SensorCard({ label, value, unit, color = '#3b82f6' }: {
  label: string;
  value: number;
  unit: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-semibold" style={{ color }}>
        {typeof value === 'number' ? Math.round(value * 10) / 10 : '--'}
        <span className="text-xs ml-1 text-gray-500">{unit}</span>
      </p>
    </div>
  );
}

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const locations = useDeviceStore((s) => s.locations);
  const sensors = useDeviceStore((s) => s.sensors);
  const devices = useDeviceStore((s) => s.devices);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const device = devices.find((d) => d.id === id);
  const currentLocation = id ? locations[id] : null;
  const currentSensors = id ? sensors[id] : null;

  const [historyLocations, setHistoryLocations] = useState<any[]>([]);
  const [sensorHistory, setSensorHistory] = useState<any[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'audio'>('overview');

  useEffect(() => {
    if (!id) return;
    connectSocket();
    subscribeToDevice(id);

    // Fetch history
    const now = new Date().toISOString();
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    api.getDeviceLocations(id, hourAgo, now).then((d) => setHistoryLocations(d.locations));
    api.getDeviceSensors(id, hourAgo, now).then((d) => setSensorHistory(d.sensors));
    api.getDeviceAudio(id).then((d) => setRecordings(d.recordings));

    // Refresh devices list
    api.getDevices();

    return () => {
      unsubscribeFromDevice(id);
    };
  }, [id]);

  async function startRecording() {
    if (!id) return;
    try {
      const result = await api.startAudioRecording(id);
      setRecording(true);
      setRecordingSessionId(result.session_id);
      setRecordingTime(0);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }

  async function stopRecording() {
    setRecording(false);
    setRecordingSessionId(null);
    if (id) {
      setTimeout(() => {
        api.getDeviceAudio(id).then((d) => setRecordings(d.recordings));
      }, 2000);
    }
  }

  // Recording timer
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => {
      setRecordingTime((t) => {
        if (t >= 60) {
          stopRecording();
          return 0;
        }
        return t + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [recording]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const locationPath = historyLocations
    .filter((l: any) => l.latitude && l.longitude)
    .map((l: any) => [l.latitude, l.longitude] as [number, number]);

  const speedChartData = {
    labels: sensorHistory.map((s: any) => new Date(s.time).toLocaleTimeString()),
    datasets: [
      {
        label: 'Speed (km/h)',
        data: sensorHistory.map((s: any) => s.speed),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  const fuelChartData = {
    labels: sensorHistory.map((s: any) => new Date(s.time).toLocaleTimeString()),
    datasets: [
      {
        label: 'Fuel Level (%)',
        data: sensorHistory.map((s: any) => s.fuel_level),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: '#1f2937' } },
      y: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: '#1f2937' } },
    },
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold">
            {device?.name || 'Device'}
            <span className={`ml-2 inline-block w-2 h-2 rounded-full ${device?.status === 'online' ? 'bg-green-500 pulse-dot' : 'bg-red-500'}`} />
          </h1>
          {device && <span className="text-sm text-gray-500">{device.plate_number} &middot; {device.vehicle_type}</span>}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user?.email}</span>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white">Logout</button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-gray-900 border-b border-gray-800 px-6 flex gap-1 shrink-0">
        {(['overview', 'history', 'audio'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'text-white border-b-2 border-primary-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">
            {/* Gauges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex flex-col items-center">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Speed</p>
                <SpeedGauge value={currentLocation?.speed || currentSensors?.speed || 0} />
              </div>
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">Fuel</p>
                <FuelGauge value={currentSensors?.fuel_level || 0} />
              </div>
              <SensorCard label="Engine RPM" value={currentSensors?.engine_rpm || 0} unit="RPM" color="#f59e0b" />
              <SensorCard label="Engine Temp" value={currentSensors?.engine_temp || 0} unit="C" color="#ef4444" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SensorCard label="Battery" value={currentSensors?.battery_voltage || 0} unit="V" color="#22c55e" />
              <SensorCard label="Latitude" value={currentLocation?.latitude || 0} unit="" color="#8b5cf6" />
              <SensorCard label="Longitude" value={currentLocation?.longitude || 0} unit="" color="#8b5cf6" />
              <SensorCard label="Heading" value={currentLocation?.heading || 0} unit="deg" color="#06b6d4" />
            </div>

            {/* Mini Map */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden h-64">
              {currentLocation && (
                <MapContainer
                  center={[currentLocation.latitude, currentLocation.longitude]}
                  zoom={15}
                  className="w-full h-full"
                  zoomControl={false}
                >
                  <TileLayer
                    attribution='&copy; OSM'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker
                    position={[currentLocation.latitude, currentLocation.longitude]}
                    icon={markerIcon}
                  />
                </MapContainer>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="p-6 space-y-6">
            {/* Speed Chart */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">Speed History (Last Hour)</h3>
              <div className="h-64">
                <Line data={speedChartData} options={chartOptions} />
              </div>
            </div>

            {/* Fuel Chart */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">Fuel Level History (Last Hour)</h3>
              <div className="h-64">
                <Line data={fuelChartData} options={chartOptions} />
              </div>
            </div>

            {/* Route Map */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden h-80">
              {locationPath.length > 0 && (
                <MapContainer
                  center={locationPath[0]}
                  zoom={14}
                  className="w-full h-full"
                  zoomControl={false}
                >
                  <TileLayer
                    attribution='&copy; OSM'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Polyline positions={locationPath} color="#3b82f6" weight={3} opacity={0.8} />
                  <Marker position={locationPath[0]} icon={markerIcon} />
                </MapContainer>
              )}
            </div>
          </div>
        )}

        {activeTab === 'audio' && (
          <div className="p-6 space-y-6">
            {/* Recording Controls */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">Audio Recording</h3>

              {!recording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <div className="w-3 h-3 bg-white rounded-full" />
                  Start Recording (Max 60s)
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm text-red-400 font-medium">
                      Recording... {recordingTime}s / 60s
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 transition-all duration-1000"
                      style={{ width: `${(recordingTime / 60) * 100}%` }}
                    />
                  </div>
                  <button
                    onClick={stopRecording}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                  >
                    Stop Recording
                  </button>
                </div>
              )}
            </div>

            {/* Recordings List */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">
                Saved Recordings ({recordings.length})
              </h3>
              {recordings.length === 0 ? (
                <p className="text-sm text-gray-500">No recordings yet</p>
              ) : (
                <div className="space-y-2">
                  {recordings.map((rec: any) => (
                    <div
                      key={rec.id}
                      className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                    >
                      <div>
                        <p className="text-sm text-white">
                          {new Date(rec.recorded_at).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          Duration: {rec.duration}s &middot; Size: {(rec.file_size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <audio
                        controls
                        className="h-8"
                        src={`/api/devices/${id}/audio/${rec.id}`}
                      >
                        Browser Anda tidak mendukung audio playback.
                      </audio>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
