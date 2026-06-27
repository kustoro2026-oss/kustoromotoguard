import mqtt from 'mqtt';
import { v4 as uuidv4 } from 'uuid';

// ─── Configuration ───
const BROKER_URL = 'mqtt://localhost:1883';
const NUM_DEVICES = 5;
const LOCATION_INTERVAL = 1000; // 1 detik
const SENSOR_INTERVAL = 2000;   // 2 detik
const HEARTBEAT_INTERVAL = 5000; // 5 detik

// ─── Virtual Devices ───
interface VirtualDevice {
  id: string;
  name: string;
  plate: string;
  vehicleType: string;
  token: string;
  // Simulasi posisi
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  // Simulasi sensor
  fuelLevel: number;
  engineRpm: number;
  engineTemp: number;
  batteryVoltage: number;
  // Route
  routeIndex: number;
}

const DEVICES: VirtualDevice[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Motor Alpha',
    plate: 'B 1234 ABC',
    vehicleType: 'Honda Vario 150',
    token: 'dev-token-alpha-001',
    latitude: -6.2088,
    longitude: 106.8456,
    heading: 90,
    speed: 35,
    fuelLevel: 85,
    engineRpm: 3200,
    engineTemp: 88,
    batteryVoltage: 12.8,
    routeIndex: 0,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Motor Bravo',
    plate: 'B 2345 BCD',
    vehicleType: 'Yamaha NMAX',
    token: 'dev-token-bravo-002',
    latitude: -6.2200,
    longitude: 106.8200,
    heading: 180,
    speed: 45,
    fuelLevel: 60,
    engineRpm: 4500,
    engineTemp: 92,
    batteryVoltage: 12.5,
    routeIndex: 0,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'Motor Charlie',
    plate: 'B 3456 CDE',
    vehicleType: 'Honda Beat',
    token: 'dev-token-charlie-003',
    latitude: -6.1950,
    longitude: 106.8350,
    heading: 0,
    speed: 50,
    fuelLevel: 40,
    engineRpm: 5200,
    engineTemp: 95,
    batteryVoltage: 12.3,
    routeIndex: 0,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    name: 'Motor Delta',
    plate: 'B 4567 DEF',
    vehicleType: 'Yamaha Mio',
    token: 'dev-token-delta-004',
    latitude: -6.2300,
    longitude: 106.8600,
    heading: 270,
    speed: 20,
    fuelLevel: 95,
    engineRpm: 2800,
    engineTemp: 82,
    batteryVoltage: 12.9,
    routeIndex: 0,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    name: 'Motor Echo',
    plate: 'B 5678 EFG',
    vehicleType: 'Honda PCX',
    token: 'dev-token-echo-005',
    latitude: -6.2150,
    longitude: 106.8550,
    heading: 45,
    speed: 60,
    fuelLevel: 25,
    engineRpm: 6000,
    engineTemp: 98,
    batteryVoltage: 12.1,
    routeIndex: 0,
  },
];

// ─── Simulasi pergerakan ───
const ROUTE_OFFSETS = [
  { dlat: 0.0002, dlon: 0.0003 },
  { dlat: -0.0001, dlon: 0.0002 },
  { dlat: 0.0003, dlon: -0.0001 },
  { dlat: -0.0002, dlon: -0.0003 },
  { dlat: 0.0001, dlon: -0.0001 },
  { dlat: -0.0003, dlon: 0.0001 },
  { dlat: 0.0002, dlon: -0.0002 },
  { dlat: -0.0001, dlon: -0.0001 },
];

function simulateMovement(device: VirtualDevice): void {
  const offset = ROUTE_OFFSETS[device.routeIndex % ROUTE_OFFSETS.length];
  device.latitude += offset.dlat;
  device.longitude += offset.dlon;
  device.routeIndex++;

  // Randomize speed
  const speedChange = (Math.random() - 0.5) * 10;
  device.speed = Math.max(0, Math.min(80, device.speed + speedChange));

  // Update heading based on movement
  device.heading = Math.atan2(offset.dlon, offset.dlat) * (180 / Math.PI);
  if (device.heading < 0) device.heading += 360;

  // Konsumsi bensin
  if (device.speed > 10) {
    device.fuelLevel -= 0.002 * (device.speed / 60);
    if (device.fuelLevel < 0) device.fuelLevel = 0;
  }

  // RPM bervariasi dengan kecepatan
  device.engineRpm = Math.round(2000 + (device.speed / 80) * 5000 + (Math.random() - 0.5) * 500);
  if (device.engineRpm < 800) device.engineRpm = 800;

  // Suhu mesin
  device.engineTemp += (Math.random() - 0.5) * 2;
  device.engineTemp = Math.max(70, Math.min(105, device.engineTemp));

  // Voltase baterai
  device.batteryVoltage += (Math.random() - 0.5) * 0.1;
  device.batteryVoltage = Math.max(11.5, Math.min(14.5, device.batteryVoltage));
}

// ─── Main ───
async function main() {
  console.log(`[Simulator] Starting ${NUM_DEVICES} virtual devices...`);
  console.log(`[Simulator] Broker: ${BROKER_URL}`);

  const client = mqtt.connect(BROKER_URL, {
    clientId: `kustoro-simulator-${Date.now()}`,
    clean: true,
  });

  client.on('connect', () => {
    console.log('[Simulator] Connected to MQTT broker');

    // Subscribe to commands
    DEVICES.forEach((device) => {
      client.subscribe(`cmd/${device.id}/#`, { qos: 1 });
    });

    // Send GPS location updates every second
    setInterval(() => {
      DEVICES.forEach((device) => {
        simulateMovement(device);

        const payload = JSON.stringify({
          device_id: device.id,
          timestamp: new Date().toISOString(),
          latitude: device.latitude,
          longitude: device.longitude,
          speed: Math.round(device.speed * 10) / 10,
          heading: Math.round(device.heading),
          altitude: 15 + Math.random() * 5,
        });

        client.publish(`kustoro/${device.id}/location`, payload, { qos: 1 });
      });
    }, LOCATION_INTERVAL);

    // Send sensor updates every 2 seconds
    setInterval(() => {
      DEVICES.forEach((device) => {
        const payload = JSON.stringify({
          device_id: device.id,
          timestamp: new Date().toISOString(),
          fuel_level: Math.round(device.fuelLevel * 10) / 10,
          engine_rpm: device.engineRpm,
          engine_temp: Math.round(device.engineTemp * 10) / 10,
          battery_voltage: Math.round(device.batteryVoltage * 100) / 100,
          speed: Math.round(device.speed * 10) / 10,
        });

        client.publish(`kustoro/${device.id}/sensors`, payload, { qos: 1 });
      });
    }, SENSOR_INTERVAL);

    // Send heartbeat every 5 seconds
    setInterval(() => {
      DEVICES.forEach((device) => {
        const payload = JSON.stringify({
          device_id: device.id,
          timestamp: new Date().toISOString(),
          status: 'online',
        });

        client.publish(`kustoro/${device.id}/status`, payload, { qos: 1 });
      });
    }, HEARTBEAT_INTERVAL);

    // Send random alerts occasionally (every 15 seconds)
    setInterval(() => {
      const alertTypes = ['speeding', 'low_fuel', 'geofence', 'sos'] as const;
      const randomDevice = DEVICES[Math.floor(Math.random() * DEVICES.length)];

      // Only 30% chance of alert each cycle
      if (Math.random() > 0.3) return;

      const type = alertTypes[Math.floor(Math.random() * alertTypes.length)];
      const messages: Record<string, string> = {
        speeding: `Kecepatan ${Math.round(randomDevice.speed)} km/h melebihi batas 60 km/h`,
        low_fuel: `Bensin tinggal ${Math.round(randomDevice.fuelLevel)}%`,
        geofence: 'Kendaraan keluar dari area geofence',
        sos: 'Tombol SOS ditekan!',
      };

      const payload = JSON.stringify({
        device_id: randomDevice.id,
        timestamp: new Date().toISOString(),
        type,
        message: messages[type],
      });

      client.publish(`kustoro/${randomDevice.id}/alert`, payload, { qos: 1 });
    }, 15000);

    // Log device information
    DEVICES.forEach((device) => {
      console.log(`  [${device.name}] ${device.plate} - ${device.vehicleType}`);
    });
  });

  client.on('message', (topic, message) => {
    console.log(`[Simulator] Received command on ${topic}: ${message.toString()}`);

    // Handle audio commands
    if (topic.endsWith('/audio_start')) {
      const deviceId = topic.split('/')[1];
      simulateAudioRecording(client, deviceId);
    }
  });

  client.on('error', (err) => {
    console.error('[Simulator] Error:', err);
  });

  // Cleanup
  process.on('SIGINT', () => {
    console.log('\n[Simulator] Shutting down...');
    client.end();
    process.exit(0);
  });
}

// Simulate audio recording: send chunks over MQTT
function simulateAudioRecording(client: mqtt.MqttClient, deviceId: string): void {
  const sessionId = uuidv4();
  const numChunks = 5;
  let chunkIndex = 0;

  console.log(`[Simulator] Simulating audio recording for ${deviceId}, session ${sessionId}`);

  const interval = setInterval(() => {
    const isLast = chunkIndex >= numChunks - 1;

    // Generate fake base64 audio data
    const fakeAudio = Buffer.alloc(4096);
    for (let i = 0; i < fakeAudio.length; i++) {
      fakeAudio[i] = Math.floor(Math.random() * 256);
    }

    const payload = JSON.stringify({
      device_id: deviceId,
      session_id: sessionId,
      chunk_index: chunkIndex,
      is_last: isLast,
      data: fakeAudio.toString('base64'),
    });

    client.publish(`kustoro/${deviceId}/audio`, payload, { qos: 1 });
    console.log(`[Simulator] Audio chunk ${chunkIndex + 1}/${numChunks} for ${deviceId}`);

    chunkIndex++;

    if (isLast) {
      clearInterval(interval);
      console.log(`[Simulator] Audio recording complete for ${deviceId}`);
    }
  }, 500);
}

main().catch(console.error);
