// ─── Kustoro Fleet Simulator ───
// Realistic virtual motorcycle fleet simulator with:
//  - 8 real Indonesian city routes (Jakarta-Bandung, Surabaya-Malang, etc.)
//  - Bearing-based smooth interpolation (no teleporting)
//  - Configurable speed, interval, devices via env vars
//  - Real-time MQTT command interface for live route/speed changes
//  - Live status dashboard in terminal

import mqtt from 'mqtt';
import { v4 as uuidv4 } from 'uuid';
import { ROUTES, getRouteById } from './routes';
import { DeviceState, tickDevice, createDevice, formatDistance } from './engine';

// ═══════════════════════════════════════════════
// Configuration (env vars with defaults)
// ═══════════════════════════════════════════════

const CONFIG = {
  brokerUrl: process.env.SIM_BROKER_URL || process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  numDevices: parseInt(process.env.SIM_DEVICES || '5', 10),
  locationInterval: parseInt(process.env.SIM_INTERVAL || '1000', 10),  // ms between location updates
  sensorInterval: parseInt(process.env.SIM_SENSOR_INTERVAL || '2000', 10),
  heartbeatInterval: parseInt(process.env.SIM_HEARTBEAT_INTERVAL || '5000', 10),
  speedMultiplier: parseFloat(process.env.SIM_SPEED || '1.0'),  // global speed multiplier
  alertChance: parseFloat(process.env.SIM_ALERT_CHANCE || '0.15'), // 0-1, chance per cycle
  verbose: process.env.SIM_VERBOSE === '1',
  quiet: process.env.SIM_QUIET === '1',
};

// ═══════════════════════════════════════════════
// Device fleet definition
// ═══════════════════════════════════════════════

const DEVICE_DEFS = [
  { name: 'Alpha',   plate: 'B 1234 ABC', type: 'Honda Vario 150', token: 'dev-token-alpha-001',   route: 'jakarta-bandung',  speed: 45 },
  { name: 'Bravo',   plate: 'B 2345 BCD', type: 'Yamaha NMAX',     token: 'dev-token-bravo-002',   route: 'jakarta-bekasi',   speed: 50 },
  { name: 'Charlie', plate: 'D 3456 CDE', type: 'Honda Beat',      token: 'dev-token-charlie-003', route: 'surabaya-malang',   speed: 40 },
  { name: 'Delta',   plate: 'H 4567 DEF', type: 'Yamaha Mio',      token: 'dev-token-delta-004',   route: 'semarang-yogya',    speed: 35 },
  { name: 'Echo',    plate: 'DK 5678 EFG', type: 'Honda PCX',      token: 'dev-token-echo-005',    route: 'denpasar-loop',     speed: 55 },
  { name: 'Foxtrot', plate: 'BK 6789 FGH', type: 'Suzuki Address', token: 'dev-token-foxtrot-006', route: 'medan-lake-toba',   speed: 30 },
  { name: 'Golf',    plate: 'DD 7890 GHI', type: 'Yamaha Aerox',   token: 'dev-token-golf-007',    route: 'makassar-maros',    speed: 60 },
  { name: 'Hotel',   plate: 'BG 8901 HIJ', type: 'Honda Scoopy',   token: 'dev-token-hotel-008',   route: 'palembang-loop',    speed: 25 },
];

const DEVICE_IDS = [
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440004',
  '550e8400-e29b-41d4-a716-446655440005',
  '550e8400-e29b-41d4-a716-446655440006',
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440008',
];

// ═══════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════

async function main() {
  printBanner();

  // Create devices
  const count = Math.min(CONFIG.numDevices, DEVICE_DEFS.length);
  const devices: DeviceState[] = [];

  for (let i = 0; i < count; i++) {
    const def = DEVICE_DEFS[i];
    const dev = createDevice(
      DEVICE_IDS[i],
      def.name,
      def.plate,
      def.type,
      def.token,
      def.route,
      def.speed,
      1.0,
    );
    devices.push(dev);
  }

  console.log(`  Broker:   ${CONFIG.brokerUrl}`);
  console.log(`  Devices:  ${devices.length}`);
  console.log(`  Interval: ${CONFIG.locationInterval}ms`);
  console.log(`  Speed:    ${CONFIG.speedMultiplier}x`);
  console.log(`  Routes:`);
  devices.forEach((d) => {
    const route = getRouteById(d.routeId);
    console.log(`    ${d.name.padEnd(10)} ${d.plate.padEnd(14)} → ${route?.label ?? d.routeId} @ ${d.speedKmh} km/h`);
  });
  console.log('');

  // Connect MQTT
  const client = mqtt.connect(CONFIG.brokerUrl, {
    clientId: `kustoro-sim-${Date.now()}`,
    clean: true,
    reconnectPeriod: 3000,
  });

  client.on('connect', () => {
    log('[MQTT] Connected');

    // Subscribe to command topics
    client.subscribe('sim/+/command', { qos: 1 });
    devices.forEach((d) => {
      client.subscribe(`cmd/${d.id}/#`, { qos: 1 });
    });

    // ─── Location updates (every LOCATION_INTERVAL ms) ───
    setInterval(() => {
      devices.forEach((device) => {
        const result = tickDevice(device, CONFIG.locationInterval, CONFIG.speedMultiplier);

        const payload = JSON.stringify({
          device_id: device.id,
          timestamp: new Date().toISOString(),
          latitude: Math.round(device.lat * 1e7) / 1e7,
          longitude: Math.round(device.lng * 1e7) / 1e7,
          speed: Math.round(device.speedKmh * device.speedMultiplier * CONFIG.speedMultiplier * 10) / 10,
          heading: Math.round(device.heading),
          altitude: 15 + Math.random() * 5,
        });

        client.publish(`kustoro/${device.id}/location`, payload, { qos: 1 });

        if (result.arrivedAtWaypoint && !CONFIG.quiet) {
          log(`📍 ${device.name} arrived at ${result.arrivedAtWaypoint}`);
        }
      });
    }, CONFIG.locationInterval);

    // ─── Sensor updates ───
    setInterval(() => {
      devices.forEach((device) => {
        const payload = JSON.stringify({
          device_id: device.id,
          timestamp: new Date().toISOString(),
          fuel_level: Math.round(device.fuelLevel * 10) / 10,
          engine_rpm: device.engineRpm,
          engine_temp: Math.round(device.engineTemp * 10) / 10,
          battery_voltage: Math.round(device.batteryVoltage * 100) / 100,
          speed: Math.round(device.speedKmh * device.speedMultiplier * CONFIG.speedMultiplier * 10) / 10,
        });

        client.publish(`kustoro/${device.id}/sensors`, payload, { qos: 1 });
      });
    }, CONFIG.sensorInterval);

    // ─── Heartbeat ───
    setInterval(() => {
      devices.forEach((device) => {
        client.publish(`kustoro/${device.id}/status`, JSON.stringify({
          device_id: device.id,
          timestamp: new Date().toISOString(),
          status: device.fuelLevel <= 0 ? 'offline' : 'online',
        }), { qos: 1 });
      });
    }, CONFIG.heartbeatInterval);

    // ─── Random alerts ───
    setInterval(() => {
      if (Math.random() > CONFIG.alertChance) return;

      const device = devices[Math.floor(Math.random() * devices.length)];
      if (device.fuelLevel <= 0) return;

      const types = ['speeding', 'low_fuel', 'geofence', 'sos'] as const;
      const type = types[Math.floor(Math.random() * types.length)];

      const messages: Record<string, string> = {
        speeding: `Speed ${Math.round(device.speedKmh)} km/h exceeds limit`,
        low_fuel: `Fuel low: ${Math.round(device.fuelLevel)}% remaining`,
        geofence: 'Vehicle left geofence area',
        sos: 'SOS button pressed!',
      };

      client.publish(`kustoro/${device.id}/alert`, JSON.stringify({
        device_id: device.id,
        timestamp: new Date().toISOString(),
        type,
        message: messages[type],
      }), { qos: 1 });

      log(`🚨 Alert: ${device.name} — ${messages[type]}`);
    }, 15000);

    // ─── Status display every 15s ───
    if (!CONFIG.quiet) {
      setInterval(() => printStatus(devices), 15000);
    }
  });

  // ═══════════════════════════════════════════════
  // Command handling — real-time control via MQTT
  // ═══════════════════════════════════════════════

  client.on('message', (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());

      // sim/deviceId/command — generic device commands
      if (topic.startsWith('sim/')) {
        const parts = topic.split('/');
        const deviceId = parts[1];
        handleSimCommand(devices, deviceId, payload, client);
        return;
      }

      // cmd/deviceId/audio_start
      if (topic.endsWith('/audio_start')) {
        const deviceId = topic.split('/')[1];
        simulateAudioRecording(client, deviceId);
        return;
      }

      if (CONFIG.verbose) {
        log(`[CMD] ${topic}: ${message.toString().slice(0, 80)}`);
      }
    } catch {
      // Ignore non-JSON messages
    }
  });

  client.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Simulator] Shutting down...');
    printStatus(devices);
    client.end();
    process.exit(0);
  });
}

// ═══════════════════════════════════════════════
// Real-time command handler
// ═══════════════════════════════════════════════

interface SimCommand {
  action: 'set_route' | 'set_speed' | 'set_multiplier' | 'refuel' | 'reset' | 'pause' | 'resume' | 'status' | 'list_routes';
  route?: string;
  speed?: number;
  multiplier?: number;
}

function handleSimCommand(
  devices: DeviceState[],
  deviceId: string,
  cmd: SimCommand,
  client: mqtt.MqttClient,
): void {
  const device = deviceId === 'all'
    ? null
    : devices.find((d) => d.id === deviceId);

  const targets = device ? [device] : devices;

  switch (cmd.action) {
    case 'set_route': {
      if (!cmd.route) break;
      const route = getRouteById(cmd.route);
      if (!route) {
        log(`❌ Unknown route: ${cmd.route}. Available: ${ROUTES.map(r => r.id).join(', ')}`);
        break;
      }
      targets.forEach((d) => {
        d.routeId = cmd.route!;
        d.waypointIndex = 1;
        d.tripDistanceM = 0;
        const start = route.waypoints[0];
        d.lat = start.lat + (Math.random() - 0.5) * 0.003;
        d.lng = start.lng + (Math.random() - 0.5) * 0.003;
      });
      log(`🛣️  ${targets.length} device(s) switched to route: ${route.label}`);
      break;
    }

    case 'set_speed': {
      if (cmd.speed == null || cmd.speed <= 0) break;
      targets.forEach((d) => { d.speedKmh = cmd.speed!; });
      log(`⚡ ${targets.length} device(s) speed set to ${cmd.speed} km/h`);
      break;
    }

    case 'set_multiplier': {
      if (cmd.multiplier == null) break;
      targets.forEach((d) => { d.speedMultiplier = cmd.multiplier!; });
      log(`🔧 ${targets.length} device(s) multiplier set to ${cmd.multiplier}x`);
      break;
    }

    case 'refuel': {
      targets.forEach((d) => { d.fuelLevel = 100; });
      log(`⛽ ${targets.length} device(s) refueled to 100%`);
      break;
    }

    case 'reset': {
      targets.forEach((d) => {
        d.waypointIndex = 1;
        d.tripDistanceM = 0;
        d.totalDistanceM = 0;
        d.fuelLevel = 80 + Math.random() * 20;
      });
      log(`🔄 ${targets.length} device(s) reset`);
      break;
    }

    case 'pause': {
      targets.forEach((d) => { d.speedMultiplier = 0; });
      log(`⏸️  ${targets.length} device(s) paused`);
      break;
    }

    case 'resume': {
      targets.forEach((d) => { d.speedMultiplier = 1.0; });
      log(`▶️  ${targets.length} device(s) resumed`);
      break;
    }

    case 'status': {
      targets.forEach((d) => {
        const route = getRouteById(d.routeId);
        const wp = route?.waypoints[d.waypointIndex];
        log(`  ${d.name}: ${d.speedKmh} km/h | Fuel: ${Math.round(d.fuelLevel)}% | Route: ${route?.label} | Next: ${wp?.name ?? 'end'} | Trip: ${formatDistance(d.tripDistanceM)}`);
      });
      break;
    }

    case 'list_routes': {
      log('Available routes:');
      ROUTES.forEach((r) => {
        log(`  ${r.id.padEnd(22)} ${r.label}`);
      });
      break;
    }

    default:
      log(`⚠️  Unknown command action: ${(cmd as any).action}`);
  }
}

// ═══════════════════════════════════════════════
// Audio recording simulation
// ═══════════════════════════════════════════════

function simulateAudioRecording(client: mqtt.MqttClient, deviceId: string): void {
  const sessionId = uuidv4();
  const numChunks = 5;
  let chunkIndex = 0;

  log(`🎤 Simulating audio for ${deviceId} (session ${sessionId.slice(0, 8)})`);

  const interval = setInterval(() => {
    const isLast = chunkIndex >= numChunks - 1;
    const fakeAudio = Buffer.alloc(4096);
    for (let i = 0; i < fakeAudio.length; i++) {
      fakeAudio[i] = Math.floor(Math.random() * 256);
    }

    client.publish(`kustoro/${deviceId}/audio`, JSON.stringify({
      device_id: deviceId,
      session_id: sessionId,
      chunk_index: chunkIndex,
      is_last: isLast,
      data: fakeAudio.toString('base64'),
    }), { qos: 1 });

    chunkIndex++;
    if (isLast) {
      clearInterval(interval);
      log(`🎤 Audio complete for ${deviceId}`);
    }
  }, 500);
}

// ═══════════════════════════════════════════════
// Display helpers
// ═══════════════════════════════════════════════

function printBanner(): void {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║     🏍️  Kustoro Fleet Simulator v2       ║');
  console.log('  ║     Realistic GPS + Sensor Simulation     ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log('  Commands via MQTT (topic: sim/<deviceId>/command):');
  console.log('    set_route, set_speed, set_multiplier, refuel, reset, pause, resume, status, list_routes');
  console.log('  Use "all" as deviceId to target all devices.');
  console.log('');
}

function printStatus(devices: DeviceState[]): void {
  if (CONFIG.quiet) return;
  console.log(`\n  ═══════ Status (${new Date().toLocaleTimeString()}) ═══════`);
  devices.forEach((d) => {
    const route = getRouteById(d.routeId);
    const wp = route?.waypoints[Math.min(d.waypointIndex, route.waypoints.length - 1)];
    const effSpeed = Math.round(d.speedKmh * d.speedMultiplier * CONFIG.speedMultiplier);
    const fuelBar = '█'.repeat(Math.round(d.fuelLevel / 10)) + '░'.repeat(10 - Math.round(d.fuelLevel / 10));
    console.log(`  ${d.name.padEnd(10)} ${effSpeed.toString().padStart(3)} km/h  ⛽${fuelBar} ${Math.round(d.fuelLevel)}%  📍${wp?.name ?? '—'.padEnd(18)}`);
  });
  console.log('');
}

function log(msg: string): void {
  if (!CONFIG.quiet) {
    console.log(`  ${msg}`);
  }
}

main().catch(console.error);
