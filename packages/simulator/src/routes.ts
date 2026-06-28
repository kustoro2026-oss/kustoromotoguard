// Real-world Indonesian city routes with waypoints.
// Each route is an array of { lat, lng, name } — devices will interpolate smoothly between them.

export interface Waypoint {
  lat: number;
  lng: number;
  name: string;
}

export interface RouteDef {
  id: string;
  label: string;
  waypoints: Waypoint[];
}

export const ROUTES: RouteDef[] = [
  {
    id: 'jakarta-bandung',
    label: 'Jakarta → Bandung (via Puncak)',
    waypoints: [
      { lat: -6.2088, lng: 106.8456, name: 'Jakarta Pusat (Monas)' },
      { lat: -6.2387, lng: 106.8243, name: 'Jakarta Selatan' },
      { lat: -6.3900, lng: 106.8200, name: 'Depok' },
      { lat: -6.5971, lng: 106.8060, name: 'Bogor' },
      { lat: -6.7040, lng: 106.9940, name: 'Puncak Pass' },
      { lat: -6.8200, lng: 107.1400, name: 'Cianjur' },
      { lat: -6.8840, lng: 107.5400, name: 'Cimahi' },
      { lat: -6.9147, lng: 107.6098, name: 'Bandung' },
    ],
  },
  {
    id: 'surabaya-malang',
    label: 'Surabaya → Malang',
    waypoints: [
      { lat: -7.2575, lng: 112.7521, name: 'Surabaya' },
      { lat: -7.3500, lng: 112.7000, name: 'Sidoarjo' },
      { lat: -7.4700, lng: 112.6500, name: 'Mojokerto' },
      { lat: -7.6300, lng: 112.5500, name: 'Jombang' },
      { lat: -7.7800, lng: 112.5000, name: 'Kediri' },
      { lat: -7.9800, lng: 112.6300, name: 'Malang' },
    ],
  },
  {
    id: 'semarang-yogya',
    label: 'Semarang → Yogyakarta',
    waypoints: [
      { lat: -6.9932, lng: 110.4203, name: 'Semarang' },
      { lat: -7.1000, lng: 110.4500, name: 'Ungaran' },
      { lat: -7.3000, lng: 110.4800, name: 'Salatiga' },
      { lat: -7.4500, lng: 110.5000, name: 'Boyolali' },
      { lat: -7.5667, lng: 110.5000, name: 'Magelang' },
      { lat: -7.7956, lng: 110.3695, name: 'Yogyakarta' },
    ],
  },
  {
    id: 'jakarta-bekasi',
    label: 'Jakarta → Bekasi → Karawang',
    waypoints: [
      { lat: -6.2088, lng: 106.8456, name: 'Jakarta Pusat' },
      { lat: -6.2200, lng: 106.8800, name: 'Jakarta Timur' },
      { lat: -6.2400, lng: 106.9900, name: 'Bekasi' },
      { lat: -6.2800, lng: 107.1000, name: 'Cikarang' },
      { lat: -6.3100, lng: 107.2900, name: 'Karawang' },
    ],
  },
  {
    id: 'denpasar-loop',
    label: 'Denpasar → Ubud → Kuta Loop',
    waypoints: [
      { lat: -8.6705, lng: 115.2126, name: 'Denpasar' },
      { lat: -8.6000, lng: 115.2200, name: 'Sanur' },
      { lat: -8.5069, lng: 115.2625, name: 'Ubud' },
      { lat: -8.5500, lng: 115.3000, name: 'Tegallalang' },
      { lat: -8.6500, lng: 115.2000, name: 'Seminyak' },
      { lat: -8.7200, lng: 115.1700, name: 'Kuta' },
    ],
  },
  {
    id: 'medan-lake-toba',
    label: 'Medan → Parapat (Danau Toba)',
    waypoints: [
      { lat: 3.5952, lng: 98.6722, name: 'Medan' },
      { lat: 3.4800, lng: 98.7500, name: 'Lubuk Pakam' },
      { lat: 3.2000, lng: 98.9500, name: 'Tebing Tinggi' },
      { lat: 2.9700, lng: 99.0200, name: 'Pematang Siantar' },
      { lat: 2.6600, lng: 98.9300, name: 'Parapat' },
    ],
  },
  {
    id: 'makassar-maros',
    label: 'Makassar → Maros',
    waypoints: [
      { lat: -5.1477, lng: 119.4327, name: 'Makassar' },
      { lat: -5.1300, lng: 119.4500, name: 'Panakkukang' },
      { lat: -5.0800, lng: 119.5000, name: 'Daya' },
      { lat: -5.0100, lng: 119.5500, name: 'Maros' },
    ],
  },
  {
    id: 'palembang-loop',
    label: 'Palembang City Loop',
    waypoints: [
      { lat: -2.9911, lng: 104.7568, name: 'Palembang Pusat' },
      { lat: -3.0000, lng: 104.7300, name: 'Ilir Barat' },
      { lat: -2.9800, lng: 104.7100, name: 'Bukit Kecil' },
      { lat: -2.9700, lng: 104.7400, name: 'Ampera Bridge' },
      { lat: -2.9911, lng: 104.7568, name: 'Palembang Pusat' },
    ],
  },
];

// Get a route by ID
export function getRouteById(id: string): RouteDef | undefined {
  return ROUTES.find((r) => r.id === id);
}

// Get total route distance in meters
export function getRouteDistance(route: RouteDef): number {
  let total = 0;
  for (let i = 1; i < route.waypoints.length; i++) {
    total += haversineDistance(
      route.waypoints[i - 1].lat, route.waypoints[i - 1].lng,
      route.waypoints[i].lat, route.waypoints[i].lng
    );
  }
  return total;
}

// ─── Geo math utilities ───

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Haversine distance in meters between two coordinates */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial bearing from point A to point B (degrees, 0=N, 90=E) */
export function bearing(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/** Destination point given start, bearing (degrees), and distance (meters) */
export function destination(
  lat: number, lng: number,
  brng: number, dist: number
): { lat: number; lng: number } {
  const R = 6371000;
  const dOverR = dist / R;
  const bRad = toRad(brng);
  const latRad = toRad(lat);
  const lngRad = toRad(lng);

  const newLat = Math.asin(
    Math.sin(latRad) * Math.cos(dOverR) +
    Math.cos(latRad) * Math.sin(dOverR) * Math.cos(bRad)
  );
  const newLng =
    lngRad +
    Math.atan2(
      Math.sin(bRad) * Math.sin(dOverR) * Math.cos(latRad),
      Math.cos(dOverR) - Math.sin(latRad) * Math.sin(newLat)
    );

  return { lat: toDeg(newLat), lng: toDeg(newLng) };
}
