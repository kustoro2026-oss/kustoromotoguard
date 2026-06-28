import { useState } from 'react';
import { api } from '../services/api';
import { useDeviceStore } from '../store/deviceStore';

// Available routes — mirrors packages/simulator/src/routes.ts
const AVAILABLE_ROUTES: { id: string; label: string }[] = [
  { id: 'jakarta-bandung', label: 'Jakarta → Bandung' },
  { id: 'surabaya-malang', label: 'Surabaya → Malang' },
  { id: 'semarang-yogya', label: 'Semarang → Yogyakarta' },
  { id: 'jakarta-bekasi', label: 'Jakarta → Bekasi → Karawang' },
  { id: 'denpasar-loop', label: 'Denpasar → Ubud Loop' },
  { id: 'medan-lake-toba', label: 'Medan → Danau Toba' },
  { id: 'makassar-maros', label: 'Makassar → Maros' },
  { id: 'palembang-loop', label: 'Palembang City Loop' },
];

const SPEED_MULTIPLIERS = [0.25, 0.5, 1, 2, 3, 5];

interface ToastState {
  message: string;
  type: 'success' | 'error';
}

export default function SimulatorControl() {
  const devices = useDeviceStore((s) => s.devices);
  const sensors = useDeviceStore((s) => s.sensors);
  const locations = useDeviceStore((s) => s.locations);

  const [expanded, setExpanded] = useState(false);
  const [pendingDevice, setPendingDevice] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [speedInputs, setSpeedInputs] = useState<Record<string, string>>({});

  async function sendCommand(deviceId: string, action: string, extra?: Record<string, unknown>) {
    setPendingDevice(deviceId);
    try {
      await api.simCommand({ deviceId, action, ...extra } as any);
      showToast(`${action.replace('_', ' ')} → ${deviceId === 'all' ? 'ALL devices' : devices.find(d => d.id === deviceId)?.name ?? deviceId}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Command failed', 'error');
    } finally {
      setPendingDevice(null);
    }
  }

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  function handleSpeedChange(deviceId: string, value: string) {
    setSpeedInputs((prev) => ({ ...prev, [deviceId]: value }));
  }

  function handleSpeedSubmit(deviceId: string) {
    const raw = speedInputs[deviceId];
    if (!raw) return;
    const speed = parseFloat(raw);
    if (isNaN(speed) || speed <= 0 || speed > 150) {
      showToast('Speed must be 1–150 km/h', 'error');
      return;
    }
    sendCommand(deviceId, 'set_speed', { speed });
  }

  function getDeviceRouteId(deviceId: string): string {
    // The simulator device store doesn't track routeId, so we can't know the current route.
    // We show the dropdown but the user explicitly picks the new route.
    return '';
  }

  return (
    <div className="sim-control">
      {/* Header toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="sim-control-header"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Simulator Controls
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible body */}
      {expanded && (
        <div className="sim-control-body">
          {/* Toast notification */}
          {toast && (
            <div className={`sim-toast ${toast.type === 'error' ? 'sim-toast-error' : 'sim-toast-success'}`}>
              {toast.message}
            </div>
          )}

          {/* Global "All Devices" controls */}
          <div className="sim-global-actions">
            <button
              onClick={() => sendCommand('all', 'pause')}
              disabled={pendingDevice === 'all'}
              className="sim-btn sim-btn-sm sim-btn-warn"
            >
              ⏸ Pause All
            </button>
            <button
              onClick={() => sendCommand('all', 'resume')}
              disabled={pendingDevice === 'all'}
              className="sim-btn sim-btn-sm sim-btn-primary"
            >
              ▶ Resume All
            </button>
            <button
              onClick={() => sendCommand('all', 'refuel')}
              disabled={pendingDevice === 'all'}
              className="sim-btn sim-btn-sm sim-btn-success"
            >
              ⛽ Refuel All
            </button>
            <button
              onClick={() => sendCommand('all', 'reset')}
              disabled={pendingDevice === 'all'}
              className="sim-btn sim-btn-sm sim-btn-ghost"
            >
              🔄 Reset All
            </button>
          </div>

          {/* Per-device controls */}
          <div className="sim-device-list">
            {devices.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-3">
                No devices loaded. Start the simulator first.
              </p>
            )}
            {devices.map((device) => {
              const isOnline = device.status === 'online';
              const sensor = sensors[device.id];
              const loc = locations[device.id];
              const isExpanded = expandedDevice === device.id;
              const isPending = pendingDevice === device.id;

              return (
                <div key={device.id} className="sim-device-card">
                  {/* Device header row */}
                  <div className="sim-device-row">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-green-500 pulse-dot' : 'bg-red-500'}`}
                      />
                      <span className="text-xs font-medium text-white truncate">
                        {device.name}
                      </span>
                      <span className="text-[10px] text-gray-500 hidden sm:inline truncate">
                        {device.plate_number}
                      </span>
                    </div>

                    {/* Quick info */}
                    <div className="flex items-center gap-2 shrink-0">
                      {loc && (
                        <span className="text-[10px] text-gray-400">
                          {loc.speed} km/h
                        </span>
                      )}
                      {sensor && (
                        <span className={`text-[10px] ${sensor.fuel_level < 20 ? 'text-red-400' : 'text-gray-500'}`}>
                          ⛽{sensor.fuel_level}%
                        </span>
                      )}
                      <button
                        onClick={() => setExpandedDevice(isExpanded ? null : device.id)}
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <svg
                          className={`w-3.5 h-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded controls */}
                  {isExpanded && (
                    <div className="sim-device-controls">
                      {/* Route selector */}
                      <div className="sim-control-row">
                        <label className="sim-label">Route</label>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              sendCommand(device.id, 'set_route', { route: e.target.value });
                            }
                          }}
                          className="sim-select"
                        >
                          <option value="" disabled>Switch route...</option>
                          {AVAILABLE_ROUTES.map((r) => (
                            <option key={r.id} value={r.id}>{r.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Speed slider + input */}
                      <div className="sim-control-row">
                        <label className="sim-label">Speed</label>
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="range"
                            min={1}
                            max={120}
                            value={speedInputs[device.id] ?? '40'}
                            onChange={(e) => handleSpeedChange(device.id, e.target.value)}
                            className="sim-range flex-1"
                          />
                          <input
                            type="number"
                            min={1}
                            max={150}
                            value={speedInputs[device.id] ?? ''}
                            placeholder="40"
                            onChange={(e) => handleSpeedChange(device.id, e.target.value)}
                            onBlur={() => handleSpeedSubmit(device.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSpeedSubmit(device.id)}
                            className="sim-speed-input"
                          />
                          <span className="text-[10px] text-gray-500">km/h</span>
                        </div>
                      </div>

                      {/* Multiplier buttons */}
                      <div className="sim-control-row">
                        <label className="sim-label">Multiplier</label>
                        <div className="flex gap-1">
                          {SPEED_MULTIPLIERS.map((m) => (
                            <button
                              key={m}
                              onClick={() => sendCommand(device.id, 'set_multiplier', { multiplier: m })}
                              disabled={isPending}
                              className="sim-multiplier-btn"
                            >
                              {m}x
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="sim-actions-row">
                        {isOnline ? (
                          <button
                            onClick={() => sendCommand(device.id, 'pause')}
                            disabled={isPending}
                            className="sim-btn sim-btn-xs sim-btn-warn"
                          >
                            ⏸ Pause
                          </button>
                        ) : (
                          <button
                            onClick={() => sendCommand(device.id, 'resume')}
                            disabled={isPending}
                            className="sim-btn sim-btn-xs sim-btn-primary"
                          >
                            ▶ Resume
                          </button>
                        )}
                        <button
                          onClick={() => sendCommand(device.id, 'refuel')}
                          disabled={isPending}
                          className="sim-btn sim-btn-xs sim-btn-success"
                        >
                          ⛽ Refuel
                        </button>
                        <button
                          onClick={() => sendCommand(device.id, 'reset')}
                          disabled={isPending}
                          className="sim-btn sim-btn-xs sim-btn-ghost"
                        >
                          🔄 Reset
                        </button>
                      </div>

                      {isPending && (
                        <div className="flex items-center gap-1.5 text-[10px] text-blue-400 mt-1">
                          <div className="animate-spin rounded-full h-2.5 w-2.5 border border-blue-400 border-t-transparent" />
                          Sending...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
