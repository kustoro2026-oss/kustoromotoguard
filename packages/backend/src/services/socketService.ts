import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { config } from '../config';

export class SocketService {
  private io: SocketIOServer;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private redisReady = false;

  constructor(server: HttpServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: true,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
  }

  async initialize(): Promise<void> {
    // Try Redis - if fails, fall back to in-memory adapter
    try {
      this.pubClient = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        retryStrategy: (times) => {
          if (times > 3) return null; // stop retrying
          return Math.min(times * 500, 3000);
        },
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.pubClient.on('error', () => {
        // silently ignore - will fall back to in-memory
      });

      this.subClient = this.pubClient.duplicate();
      this.subClient.on('error', () => {});

      await this.pubClient.connect();
      await this.subClient.connect();

      this.io.adapter(createAdapter(this.pubClient, this.subClient));
      this.redisReady = true;
      console.log('[Socket.IO] Initialized with Redis adapter');
    } catch {
      console.log('[Socket.IO] Redis unavailable, using in-memory adapter');
      this.cleanupRedis();
    }

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
  }

  private cleanupRedis(): void {
    try { this.pubClient?.disconnect(); } catch {}
    try { this.subClient?.disconnect(); } catch {}
    this.pubClient = null;
    this.subClient = null;
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
    this.cleanupRedis();
  }
}
