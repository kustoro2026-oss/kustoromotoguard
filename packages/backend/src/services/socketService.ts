import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { config } from '../config';

export class SocketService {
  private io: SocketIOServer;
  private pubClient: Redis;
  private subClient: Redis;

  constructor(server: HttpServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: config.frontendUrl,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.pubClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });

    this.subClient = this.pubClient.duplicate();
  }

  async initialize(): Promise<void> {
    this.io.adapter(createAdapter(this.pubClient, this.subClient));

    this.io.on('connection', (socket: Socket) => {
      console.log(`[Socket.IO] Client connected: ${socket.id}`);

      socket.on('subscribe:device', (deviceId: string) => {
        const room = `device:${deviceId}`;
        socket.join(room);
        console.log(`[Socket.IO] ${socket.id} joined ${room}`);
      });

      socket.on('unsubscribe:device', (deviceId: string) => {
        const room = `device:${deviceId}`;
        socket.leave(room);
        console.log(`[Socket.IO] ${socket.id} left ${room}`);
      });

      socket.on('subscribe:fleet', () => {
        socket.join('fleet');
      });

      socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
      });
    });

    console.log('[Socket.IO] Initialized with Redis adapter');
  }

  // Broadcast location to room
  emitLocation(deviceId: string, data: any): void {
    this.io.to(`device:${deviceId}`).emit('device:location', data);
    this.io.to('fleet').emit('device:location', data);
  }

  // Broadcast sensor data to room
  emitSensors(deviceId: string, data: any): void {
    this.io.to(`device:${deviceId}`).emit('device:sensors', data);
    this.io.to('fleet').emit('device:sensors', data);
  }

  // Broadcast device status
  emitStatus(deviceId: string, data: any): void {
    this.io.to(`device:${deviceId}`).emit('device:status', data);
    this.io.to('fleet').emit('device:status', data);
  }

  // Broadcast alert
  emitAlert(data: any): void {
    this.io.to('fleet').emit('alert:new', data);
    if (data.device_id) {
      this.io.to(`device:${data.device_id}`).emit('alert:new', data);
    }
  }

  // Notify audio ready
  emitAudioReady(deviceId: string, data: any): void {
    this.io.to(`device:${deviceId}`).emit('audio:ready', data);
  }

  getIO(): SocketIOServer {
    return this.io;
  }

  close(): void {
    this.io.close();
    this.pubClient.quit();
    this.subClient.quit();
  }
}
