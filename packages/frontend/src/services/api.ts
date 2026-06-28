const API_BASE = '/api';

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => request('/auth/me'),

  // Devices
  getDevices: () => request('/devices'),

  getDevice: (id: string) => request(`/devices/${id}`),

  getDeviceLocations: (id: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('limit', '500');
    return request(`/devices/${id}/locations?${params}`);
  },

  getDeviceSensors: (id: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('limit', '500');
    return request(`/devices/${id}/sensors?${params}`);
  },

  getDeviceAudio: (id: string) => request(`/devices/${id}/audio`),

  startAudioRecording: (id: string) =>
    request(`/devices/${id}/audio/record`, { method: 'POST' }),

  // Alerts
  getAlerts: (params?: { device_id?: string; type?: string; unread?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.device_id) search.set('device_id', params.device_id);
    if (params?.type) search.set('type', params.type);
    if (params?.unread) search.set('unread', 'true');
    return request(`/alerts?${search}`);
  },

  markAlertRead: (id: string) =>
    request(`/alerts/${id}/read`, { method: 'PUT' }),

  // Simulator control
  simCommand: (params: {
    deviceId: string;
    action: string;
    route?: string;
    speed?: number;
    multiplier?: number;
  }) =>
    request('/simulator/command', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
};
