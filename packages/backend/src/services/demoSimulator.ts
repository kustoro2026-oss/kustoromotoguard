import { query } from '../db';
import { SocketService } from './socketService';

// Same 5 devices as the external simulator (UUIDs match migration seed)
interface VirtualDevice {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  fuelLevel: number;
  engineRpm: number;
  engineTemp: number;
  batteryVoltage: number;
  routeIndex: number;
}

const DEVICES: VirtualDevice[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001', name: 'Motor Alpha',
    latitude: -6.2088, longitude: 106.8456, heading: 90, speed: 35,
    fuelLevel: 85, engineRpm: 3200, engineTemp: 88, batteryVoltage: 12.8, routeIndex: 0,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002', name: 'Motor Bravo',
    latitude: -6.2200, longitude: 106.8200, heading: 180, speed: 45,
    fuelLevel: 60, engineRpm: 4500, engineTemp: 92, batteryVoltage: 12.5, routeIndex: 0,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003', name: 'Motor Charlie',
    latitude: -6.1950, longitude: 106.8350, heading: 0, speed: 50,
    fuelLevel: 40, engineRpm: 5200, engineTemp: 95, batteryVoltage: 12.3, routeIndex: 0,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004', name: 'Motor Delta',
    latitude: -6.2300, longitude: 106.8600, heading: 270, speed: 20,
    fuelLevel: 95, engineRpm: 2800, engineTemp: 82, batteryVoltage: 12.9, routeIndex: 0,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005', name: 'Motor Echo',
    latitude: -6.2150, longitude: 106.8550, heading: 45, speed: 60,
    fuelLevel: 25, engineRpm: 6000, engineTemp: 98, batteryVoltage: 12.1, routeIndex: 0,
  },
];

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

  const speedChange = (Math.random() - 0.5) * 10;
  device.speed = Math.max(0, Math.min(80, device.speed + speedChange));

  device.heading = Math.atan2(offset.dlon, offset.dlat) * (180 / Math.PI);
  if (device.heading < 0) device.heading += 360;

  if (device.speed > 10) {
    device.fuelLevel -= 0.002 * (device.speed / 60);
    if (device.fuelLevel < 0) device.fuelLevel = 0;
  }

  device.engineRpm = Math.round(2000 + (device.speed / 80) * 5000 + (Math.random() - 0.5) * 500);
  if (device.engineRpm < 800) device.engineRpm = 800;

  device.engineTemp += (Math.random() - 0.5) * 2;
  device.engineTemp = Math.max(70, Math.min(105, device.engineTemp));

  device.batteryVoltage += (Math.random() - 0.5) * 0.1;
  device.batteryVoltage = Math.max(11.5, Math.min(14.5, device.batteryVoltage));
}

export class DemoSimulatorService {
  private socketService: SocketService;
  private intervals: NodeJS.Timeout[] = [];
  private running = false;

  constructor(socketService: SocketService) {
    this.socketService = socketService;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log('[DemoSim] Starting built-in demo simulator (5 devices)');

    // Immediately mark all devices online
    this.emitAllOnline();

    // Location + status every 1s
    this.intervals.push(setInterval(() => this.tickLocation(), 1000));

    // Sensors every 2s
    this.intervals.push(setInterval(() => this.tickSensors(), 2000));

    // Random alerts every 15s (30% chance)
    this.intervals.push(setInterval(() => this.tickAlerts(), 15000));
  }

  stop(): void {
    this.running = false;
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    console.log('[DemoSim] Stopped');
  }

  private emitAllOnline(): void {
    const now = new Date().toISOString();
    DEVICES.forEach((d) => {
      this.socketService.emitStatus(d.id, {
        device_id: d.id,
        status: 'online' as const,
        timestamp: now,
      });
    });
  }

  private async tickLocation(): Promise<void> {
    const now = new Date().toISOString();
    for (const device of DEVICES) {
      simulateMovement(device);

      const locData = {
        device_id: device.id,
        latitude: Math.round(device.latitude * 100000) / 100000,
        longitude: Math.round(device.longitude * 100000) / 100000,
        speed: Math.round(device.speed * 10) / 10,
        heading: Math.round(device.heading),
        altitude: 15 + Math.round(Math.random() * 5 * 10) / 10,
        timestamp: now,
      };

      // Store in DB (fire-and-forget, non-blocking)
      query(
        `INSERT INTO device_locations (time, device_id, latitude, longitude, speed, heading, altitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [now, device.id, locData.latitude, locData.longitude, locData.speed, locData.heading, locData.altitude]
      ).catch((err) => console.error('[DemoSim] DB location error:', err.message));

      // Update device status in DB
      query(
        `UPDATE devices SET last_seen_at = NOW(), status = 'online' WHERE id = $1`,
        [device.id]
      ).catch(() => {});

      // Push to WebSocket
      this.socketService.emitLocation(device.id, locData);
      this.socketService.emitStatus(device.id, {
        device_id: device.id,
        status: 'online',
        timestamp: now,
      });
    }
  }

  private async tickSensors(): Promise<void> {
    const now = new Date().toISOString();
    for (const device of DEVICES) {
      const sensorData = {
        device_id: device.id,
        fuel_level: Math.round(device.fuelLevel * 10) / 10,
        engine_rpm: device.engineRpm,
        engine_temp: Math.round(device.engineTemp * 10) / 10,
        battery_voltage: Math.round(device.batteryVoltage * 100) / 100,
        speed: Math.round(device.speed * 10) / 10,
        timestamp: now,
      };

      query(
        `INSERT INTO device_sensors (time, device_id, fuel_level, engine_rpm, engine_temp, battery_voltage, speed)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [now, device.id, sensorData.fuel_level, sensorData.engine_rpm, sensorData.engine_temp, sensorData.battery_voltage, sensorData.speed]
      ).catch((err) => console.error('[DemoSim] DB sensor error:', err.message));

      this.socketService.emitSensors(device.id, sensorData);
    }
  }

  private async tickAlerts(): Promise<void> {
    if (Math.random() > 0.3) return;

    const alertTypes = ['speeding', 'low_fuel', 'geofence', 'sos'] as const;
    const device = DEVICES[Math.floor(Math.random() * DEVICES.length)];
    const type = alertTypes[Math.floor(Math.random() * alertTypes.length)];

    const messages: Record<string, string> = {
      speeding: `Kecepatan ${Math.round(device.speed)} km/h melebihi batas 60 km/h`,
      low_fuel: `Bensin tinggal ${Math.round(device.fuelLevel)}%`,
      geofence: 'Kendaraan keluar dari area geofence',
      sos: 'Tombol SOS ditekan!',
    };

    try {
      const result = await query(
        `INSERT INTO alerts (device_id, type, message, created_at)
         VALUES ($1, $2, $3, NOW()) RETURNING id, type, message, is_read, created_at`,
        [device.id, type, messages[type]]
      );

      const alert = result.rows[0];
      this.socketService.emitAlert({
        ...alert,
        device_id: device.id,
        device_name: device.name,
      });
    } catch (err: any) {
      console.error('[DemoSim] Alert error:', err.message);
    }
  }
}
