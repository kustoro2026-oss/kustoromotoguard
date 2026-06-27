export interface LocationPayload {
  device_id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  altitude: number;
}

export interface SensorPayload {
  device_id: string;
  timestamp: string;
  fuel_level: number;
  engine_rpm: number;
  engine_temp: number;
  battery_voltage: number;
  speed: number;
}

export interface AudioChunkPayload {
  device_id: string;
  session_id: string;
  chunk_index: number;
  is_last: boolean;
  data: string; // base64 encoded Opus audio
}

export interface AlertPayload {
  device_id: string;
  timestamp: string;
  type: 'geofence' | 'speeding' | 'low_fuel' | 'sos';
  message: string;
}

export interface StatusPayload {
  device_id: string;
  timestamp: string;
  status: 'online' | 'offline';
}

export interface CommandPayload {
  action: 'audio_start' | 'audio_stop' | 'engine_kill' | 'geofence';
  params?: Record<string, any>;
}

// MQTT Topic patterns
export const MQTT_TOPICS = {
  // Uplink (device -> server)
  LOCATION: 'kustoro/+/location',
  SENSORS: 'kustoro/+/sensors',
  AUDIO: 'kustoro/+/audio',
  ALERT: 'kustoro/+/alert',
  STATUS: 'kustoro/+/status',

  // Downlink (server -> device)
  cmdAudioStart: (deviceId: string) => `cmd/${deviceId}/audio_start`,
  cmdAudioStop: (deviceId: string) => `cmd/${deviceId}/audio_stop`,
  cmdEngineKill: (deviceId: string) => `cmd/${deviceId}/engine_kill`,
  cmdGeofence: (deviceId: string) => `cmd/${deviceId}/geofence`,
} as const;

// Extract device_id from MQTT topic
export function extractDeviceId(topic: string): string | null {
  const parts = topic.split('/');
  if (parts.length >= 2) {
    return parts[1];
  }
  return null;
}
