import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import LocateControl from '../components/map/LocateControl';
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
  className: 'moto-marker-icon',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#3b82f6" opacity="0.2" stroke="#3b82f6" stroke-width="1.5"/>
    <circle cx="7" cy="15" r="2.2" fill="#3b82f6" stroke="#fff" stroke-width="0.8"/>
    <circle cx="17" cy="15" r="2.2" fill="#3b82f6" stroke="#fff" stroke-width="0.8"/>
    <path d="M4.5 14l1.8-3h2.2l1.2 3h4.6" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 12v-2.5h3" stroke="#3b82f6" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="1.5" fill="#3b82f6"/>
  </svg>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

function SpeedGauge({ value, max = 120 }: { value: number; max?: number }) {
  const cx = 100;
  const cy = 110;
  const r = 80;
  const startAngle = 225; // degrees (bottom-left, SVG coords)
  const endAngle = -45;   // degrees (bottom-right via top, SVG coords)
  const totalSweep = 270; // degrees of arc

  const pct = Math.min(Math.max(value / max, 0), 1);
  const needleAngleDeg = startAngle - pct * totalSweep;
  const needleAngleRad = (needleAngleDeg * Math.PI) / 180;

  // Needle tip
  const needleLen = r - 12;
  const nx = cx + needleLen * Math.cos(needleAngleRad);
  const ny = cy + needleLen * Math.sin(needleAngleRad);

  // Needle base (opposite side)
  const baseLen = 12;
  const bx = cx - baseLen * Math.cos(needleAngleRad);
  const by = cy - baseLen * Math.sin(needleAngleRad);

  // Color based on speed
  const color =
    pct < 0.5 ? '#22c55e' : pct < 0.75 ? '#f59e0b' : '#ef4444';

  // --- Tick marks & labels ---
  const ticks: { angle: number; label?: string; major: boolean }[] = [];
  for (let v = 0; v <= max; v += 10) {
    const tPct = v / max;
    const tAngleDeg = startAngle - tPct * totalSweep;
    ticks.push({ angle: tAngleDeg, label: v % 20 === 0 ? `${v}` : undefined, major: v % 20 === 0 });
  }

  const tickOuter = r - 5;
  const tickInnerMajor = r - 18;
  const tickInnerMinor = r - 12;
  const labelRadius = r - 30;

  // Build arc path for colored segments
  function arcPath(fromPct: number, toPct: number): string {
    const a1 = (startAngle - fromPct * totalSweep) * Math.PI / 180;
    const a2 = (startAngle - toPct * totalSweep) * Math.PI / 180;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const large = (toPct - fromPct) * totalSweep > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  return (
    <div className="relative w-44 h-44 sm:w-48 sm:h-48 mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-full -mt-1">
        {/* Background track */}
        <path
          d={arcPath(0, 1)}
          fill="none"
          stroke="#1f2937"
          strokeWidth="9"
          strokeLinecap="round"
        />

        {/* Colored progress arc — segmented green / yellow / red */}
        {/* Green zone: 0 → 50% */}
        {pct > 0 && (
          <path
            d={arcPath(0, Math.min(pct, 0.5))}
            fill="none"
            stroke="#22c55e"
            strokeWidth="9"
            strokeLinecap={pct <= 0.5 ? 'round' : 'butt'}
          />
        )}
        {/* Yellow zone: 50% → 75% */}
        {pct > 0.5 && (
          <path
            d={arcPath(0.5, Math.min(pct, 0.75))}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="9"
            strokeLinecap={pct <= 0.75 ? 'round' : 'butt'}
          />
        )}
        {/* Red zone: 75% → 100% */}
        {pct > 0.75 && (
          <path
            d={arcPath(0.75, pct)}
            fill="none"
            stroke="#ef4444"
            strokeWidth="9"
            strokeLinecap="round"
          />
        )}

        {/* Tick marks */}
        {ticks.map((t) => {
          const ta = (t.angle * Math.PI) / 180;
          const inner = t.major ? tickInnerMajor : tickInnerMinor;
          return (
            <line
              key={t.angle}
              x1={cx + inner * Math.cos(ta)}
              y1={cy + inner * Math.sin(ta)}
              x2={cx + tickOuter * Math.cos(ta)}
              y2={cy + tickOuter * Math.sin(ta)}
              stroke={t.major ? '#9ca3af' : '#4b5563'}
              strokeWidth={t.major ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Labels */}
        {ticks
          .filter((t) => t.label)
          .map((t) => {
            const ta = (t.angle * Math.PI) / 180;
            const lx = cx + labelRadius * Math.cos(ta);
            const ly = cy + labelRadius * Math.sin(ta);
            return (
              <text
                key={`lbl-${t.angle}`}
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#9ca3af"
                fontSize="9"
                fontFamily="'Inter', system-ui, sans-serif"
                fontWeight={500}
              >
                {t.label}
              </text>
            );
          })}

        {/* Needle */}
        <line
          x1={bx}
          y1={by}
          x2={nx}
          y2={ny}
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Needle inner shadow (makes it look 3D) */}
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="rgba(0,0,0,0.3)"
          strokeWidth="1"
          strokeLinecap="round"
        />

        {/* Center hub */}
        <circle cx={cx} cy={cy} r="8" fill="#1f2937" stroke="#4b5563" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="3.5" fill={color} />

        {/* Digital speed readout in center */}
        <text
          x={cx}
          y={cy + 30}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize="26"
          fontFamily="'Inter', system-ui, sans-serif"
          fontWeight="bold"
        >
          {Math.round(value)}
        </text>
        <text
          x={cx}
          y={cy + 48}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#6b7280"
          fontSize="10"
          fontFamily="'Inter', system-ui, sans-serif"
          fontWeight={500}
          letterSpacing="1"
        >
          km/h
        </text>
      </svg>
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
    <div className="h-dvh flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 gap-2 relative z-10">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-base sm:text-lg font-bold truncate">
            {device?.name || 'Device'}
            <span className={`ml-2 inline-block w-2 h-2 rounded-full shrink-0 ${device?.status === 'online' ? 'bg-green-500 pulse-dot' : 'bg-red-500'}`} />
          </h1>
          {device && <span className="hidden sm:inline text-sm text-gray-500 truncate">{device.plate_number} &middot; {device.vehicle_type}</span>}
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <span className="hidden sm:inline text-sm text-gray-400">{user?.email}</span>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white whitespace-nowrap">Logout</button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 flex gap-0 sm:gap-1 shrink-0 overflow-x-auto">
        {(['overview', 'history', 'audio'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors capitalize whitespace-nowrap ${
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
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden h-48 sm:h-64 md:h-72">
              {currentLocation && (
                <MapContainer
                  center={[currentLocation.latitude, currentLocation.longitude]}
                  zoom={15}
                  className="w-full h-full"
                  zoomControl={true}
                >
                  <TileLayer
                    attribution='&copy; OSM'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker
                    position={[currentLocation.latitude, currentLocation.longitude]}
                    icon={markerIcon}
                  />
                  <LocateControl />
                </MapContainer>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Speed Chart */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">Speed History (Last Hour)</h3>
              <div className="h-48 sm:h-64">
                <Line data={speedChartData} options={chartOptions} />
              </div>
            </div>

            {/* Fuel Chart */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">Fuel Level History (Last Hour)</h3>
              <div className="h-48 sm:h-64">
                <Line data={fuelChartData} options={chartOptions} />
              </div>
            </div>

            {/* Route Map */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden h-56 sm:h-80">
              {locationPath.length > 0 && (
                <MapContainer
                  center={locationPath[0]}
                  zoom={14}
                  className="w-full h-full"
                  zoomControl={true}
                >
                  <TileLayer
                    attribution='&copy; OSM'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Polyline positions={locationPath} color="#3b82f6" weight={3} opacity={0.8} />
                  <Marker position={locationPath[0]} icon={markerIcon} />
                  <LocateControl />
                </MapContainer>
              )}
            </div>
          </div>
        )}

        {activeTab === 'audio' && (
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
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
                        className="h-8 w-full sm:w-auto"
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
