import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { MqttService } from './services/mqttService';
import { SocketService } from './services/socketService';
import { AudioService } from './services/audioService';
import { DemoSimulatorService } from './services/demoSimulator';
import authRoutes from './routes/auth';
import deviceRoutes from './routes/devices';
import alertRoutes from './routes/alerts';

async function main() {
  const app = express();
  const server = http.createServer(app);

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // WebSocket
  const socketService = new SocketService(server);
  await socketService.initialize();

  // Audio Service
  const audioService = new AudioService();

  // MQTT
  const mqttService = new MqttService(socketService, audioService);
  await mqttService.connect();

  // Demo simulator: auto-starts when no MQTT broker (e.g. Railway deployment)
  let demoSimulator: DemoSimulatorService | null = null;
  if (!config.mqtt.brokerUrl) {
    demoSimulator = new DemoSimulatorService(socketService);
    demoSimulator.start();
  }

  // Expose services to routes via app.locals
  app.locals.mqttService = mqttService;
  app.locals.audioService = audioService;

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/devices', deviceRoutes);
  app.use('/api/alerts', alertRoutes);

  // Serve frontend static files (production: Docker, development: Vite dev server)
  const publicDir = path.join(__dirname, '..', 'public');
  if (fs.existsSync(publicDir)) {
    console.log(`[Kustoro] Serving static frontend from ${publicDir}`);
    app.use(express.static(publicDir));

    // SPA fallback: semua non-API route balikin index.html
    app.get('*', (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  } else {
    console.log('[Kustoro] No static frontend found, API-only mode');
  }

  // Start server
  server.listen(config.port, () => {
    console.log(`[Kustoro Backend] Running on http://localhost:${config.port}`);
    console.log(`[Kustoro Backend] Environment: ${config.nodeEnv}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Kustoro Backend] Shutting down...');
    demoSimulator?.stop();
    await mqttService.disconnect();
    socketService.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Kustoro Backend] Failed to start:', err);
  process.exit(1);
});
