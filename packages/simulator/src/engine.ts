// ─── Smooth Movement Engine ───
// Drives virtual devices along waypoint routes using bearing-based interpolation.
// No teleporting — every tick moves exactly speed * interval meters toward the next waypoint.

import {
  Waypoint,
  haversineDistance,
  bearing,
  destination,
} from './routes';

export interface DeviceState {
  id: string;
  name: string;
  plate: string;
  vehicleType: string;
  token: string;

  // Current position
  lat: number;
  lng: number;
  heading: number; // degrees, 0=N

  // Movement config
  speedKmh: number;       // target speed in km/h
  speedMultiplier: number; // individual multiplier

  // Route state
  routeId: string;
  waypointIndex: number;  // index of NEXT waypoint to reach
  loopRoute: boolean;     // restart from beginning when done?

  // Sensors
  fuelLevel: number;
  engineRpm: number;
  engineTemp: number;
  batteryVoltage: number;

  // Stats
  totalDistanceM: number;  // total distance traveled
  tripDistanceM: number;   // current trip distance
}

export const DEFAULT_SPEEDS_KMH = [35, 45, 50, 30, 55, 40, 60, 25];

/**
 * Advance a device along its route by one tick.
 * Returns the new device state (mutates in place).
 */
export function tickDevice(
  device: DeviceState,
  intervalMs: number,
  globalSpeedMultiplier: number
): { moved: boolean; arrivedAtWaypoint: string | null } {
  const effectiveSpeed =
    device.speedKmh * device.speedMultiplier * globalSpeedMultiplier;

  // Speed in m/s, then distance to travel this tick
  const speedMs = (effectiveSpeed * 1000) / 3600;
  const distanceToTravel = speedMs * (intervalMs / 1000);

  if (distanceToTravel <= 0) {
    return { moved: false, arrivedAtWaypoint: null };
  }

  // Get current target waypoint
  const route = getDeviceRoute(device.routeId);
  if (!route || device.waypointIndex >= route.waypoints.length) {
    // Route finished — loop or stop
    if (device.loopRoute && route) {
      device.waypointIndex = 0;
    } else {
      return { moved: false, arrivedAtWaypoint: null };
    }
  }

  const target = route!.waypoints[device.waypointIndex];

  // Distance remaining to target
  let remaining = haversineDistance(device.lat, device.lng, target.lat, target.lng);

  let arrivedName: string | null = null;

  if (distanceToTravel >= remaining) {
    // Arrive at waypoint
    device.lat = target.lat;
    device.lng = target.lng;
    device.heading = device.waypointIndex < route!.waypoints.length - 1
      ? bearing(target.lat, target.lng, route!.waypoints[device.waypointIndex + 1].lat, route!.waypoints[device.waypointIndex + 1].lng)
      : device.heading;
    device.tripDistanceM += remaining;
    device.totalDistanceM += remaining;
    arrivedName = target.name;
    device.waypointIndex++;

    // Carry over remaining distance to next waypoint
    const leftover = distanceToTravel - remaining;
    if (leftover > 0 && device.waypointIndex < route!.waypoints.length) {
      const nextTarget = route!.waypoints[device.waypointIndex];
      const brng = bearing(device.lat, device.lng, nextTarget.lat, nextTarget.lng);
      const nextRemaining = haversineDistance(device.lat, device.lng, nextTarget.lat, nextTarget.lng);
      if (leftover >= nextRemaining) {
        // Also arrived at next waypoint (rare, but handle it)
        device.lat = nextTarget.lat;
        device.lng = nextTarget.lng;
        device.tripDistanceM += nextRemaining;
        device.totalDistanceM += nextRemaining;
        device.heading = device.waypointIndex + 1 < route!.waypoints.length
          ? bearing(nextTarget.lat, nextTarget.lng, route!.waypoints[device.waypointIndex + 1].lat, route!.waypoints[device.waypointIndex + 1].lng)
          : device.heading;
        device.waypointIndex++;
      } else {
        const pos = destination(device.lat, device.lng, brng, leftover);
        device.lat = pos.lat;
        device.lng = pos.lng;
        device.heading = brng;
        device.tripDistanceM += leftover;
        device.totalDistanceM += leftover;
      }
    }

    // Loop if needed
    if (device.waypointIndex >= route!.waypoints.length && device.loopRoute) {
      device.waypointIndex = 1; // start from first segment (not 0, since we're at 0 already)
      device.tripDistanceM = 0;
    }
  } else {
    // Move toward target
    const brng = bearing(device.lat, device.lng, target.lat, target.lng);
    const pos = destination(device.lat, device.lng, brng, distanceToTravel);
    device.lat = pos.lat;
    device.lng = pos.lng;
    device.heading = brng;
    device.tripDistanceM += distanceToTravel;
    device.totalDistanceM += distanceToTravel;
  }

  // Sensor simulation
  simulateSensors(device);

  return { moved: true, arrivedAtWaypoint: arrivedName };
}

// ─── Sensor simulation ───
function simulateSensors(device: DeviceState): void {
  // Fuel: slowly decreasing based on speed
  if (device.speedKmh > 5) {
    device.fuelLevel -= 0.0001 * (device.speedKmh / 50);
    if (device.fuelLevel < 0) device.fuelLevel = 0;
  }

  // If fuel is empty, stop
  if (device.fuelLevel <= 0) {
    device.speedKmh = 0;
    device.fuelLevel = 0;
  }

  // RPM varies with speed
  const baseRpm = 1500 + (device.speedKmh / 80) * 5000;
  device.engineRpm = Math.round(baseRpm + (Math.random() - 0.5) * 400);
  device.engineRpm = Math.max(800, Math.min(7500, device.engineRpm));

  // Engine temp
  if (device.speedKmh > 20) {
    device.engineTemp += (Math.random() - 0.3) * 1.5; // tends to rise
  } else {
    device.engineTemp += (Math.random() - 0.7) * 1.5; // tends to cool
  }
  device.engineTemp = Math.max(70, Math.min(105, device.engineTemp));

  // Battery
  device.batteryVoltage += (Math.random() - 0.5) * 0.05;
  device.batteryVoltage = Math.max(11.5, Math.min(14.5, device.batteryVoltage));
}

// ─── Route registry (imported lazily to avoid circular) ───
import { ROUTES, RouteDef } from './routes';

function getDeviceRoute(routeId: string): RouteDef | null {
  return ROUTES.find((r) => r.id === routeId) || null;
}

/** Create a device assigned to a specific route */
export function createDevice(
  id: string,
  name: string,
  plate: string,
  vehicleType: string,
  token: string,
  routeId: string,
  speedKmh?: number,
  speedMultiplier?: number,
): DeviceState {
  const route = getDeviceRoute(routeId);
  const start = route?.waypoints[0] ?? { lat: -6.2, lng: 106.8 };

  return {
    id,
    name,
    plate,
    vehicleType,
    token,
    lat: start.lat + (Math.random() - 0.5) * 0.005,
    lng: start.lng + (Math.random() - 0.5) * 0.005,
    heading: route ? bearing(start.lat, start.lng, route.waypoints[1].lat, route.waypoints[1].lng) : 90,
    speedKmh: speedKmh ?? DEFAULT_SPEEDS_KMH[Math.floor(Math.random() * DEFAULT_SPEEDS_KMH.length)],
    speedMultiplier: speedMultiplier ?? 1.0,
    routeId,
    waypointIndex: 1, // start moving toward the second waypoint
    loopRoute: true,
    fuelLevel: 60 + Math.random() * 40,
    engineRpm: 2500 + Math.random() * 2000,
    engineTemp: 80 + Math.random() * 15,
    batteryVoltage: 12.2 + Math.random() * 0.8,
    totalDistanceM: 0,
    tripDistanceM: 0,
  };
}

/** Format distance for display */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}
