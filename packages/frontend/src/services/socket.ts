import { io, Socket } from 'socket.io-client';
import { useDeviceStore } from '../store/deviceStore';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  socket = io({
    transports: ['websocket', 'polling'],
    auth: {
      token: localStorage.getItem('token'),
    },
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('device:location', (data) => {
    useDeviceStore.getState().updateLocation(data);
  });

  socket.on('device:sensors', (data) => {
    useDeviceStore.getState().updateSensors(data);
  });

  socket.on('device:status', (data) => {
    useDeviceStore.getState().updateDeviceStatus(data.device_id, data.status);
  });

  socket.on('alert:new', (data) => {
    useDeviceStore.getState().addAlert(data);

    // Browser notification
    if (Notification.permission === 'granted') {
      new Notification(`Kustoro Alert - ${data.type}`, {
        body: data.message,
        icon: '/vite.svg',
      });
    }
  });

  socket.on('audio:ready', (data) => {
    console.log('[Socket] Audio ready:', data);
    // Will be handled by audio player component
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
  });

  return socket;
}

export function subscribeToDevice(deviceId: string): void {
  if (!socket) return;
  socket.emit('subscribe:device', deviceId);
}

export function unsubscribeFromDevice(deviceId: string): void {
  if (!socket) return;
  socket.emit('unsubscribe:device', deviceId);
}

export function subscribeToFleet(): void {
  if (!socket) return;
  socket.emit('subscribe:fleet');
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
