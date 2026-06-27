import { create } from 'zustand';

export interface Device {
  id: string;
  name: string;
  plate_number: string;
  vehicle_type: string;
  status: 'online' | 'offline';
  last_seen_at: string;
}

export interface DeviceLocation {
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  timestamp: string;
}

export interface DeviceSensors {
  device_id: string;
  fuel_level: number;
  engine_rpm: number;
  engine_temp: number;
  battery_voltage: number;
  speed: number;
  timestamp: string;
}

export interface Alert {
  id: string;
  device_id: string;
  device_name: string;
  type: 'speeding' | 'low_fuel' | 'geofence' | 'sos';
  message: string;
  is_read: boolean;
  created_at: string;
}

interface DeviceState {
  devices: Device[];
  locations: Record<string, DeviceLocation>;
  sensors: Record<string, DeviceSensors>;
  alerts: Alert[];
  selectedDeviceId: string | null;

  setDevices: (devices: Device[]) => void;
  updateLocation: (location: DeviceLocation) => void;
  updateSensors: (sensors: DeviceSensors) => void;
  updateDeviceStatus: (deviceId: string, status: 'online' | 'offline') => void;
  addAlert: (alert: Alert) => void;
  setAlerts: (alerts: Alert[]) => void;
  markAlertRead: (alertId: string) => void;
  setSelectedDevice: (id: string | null) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  devices: [],
  locations: {},
  sensors: {},
  alerts: [],
  selectedDeviceId: null,

  setDevices: (devices) => set({ devices }),

  updateLocation: (location) =>
    set((state) => ({
      locations: { ...state.locations, [location.device_id]: location },
    })),

  updateSensors: (sensors) =>
    set((state) => ({
      sensors: { ...state.sensors, [sensors.device_id]: sensors },
    })),

  updateDeviceStatus: (deviceId, status) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, status, last_seen_at: new Date().toISOString() } : d
      ),
    })),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 100),
    })),

  setAlerts: (alerts) => set({ alerts }),

  markAlertRead: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, is_read: true } : a
      ),
    })),

  setSelectedDevice: (id) => set({ selectedDeviceId: id }),
}));
