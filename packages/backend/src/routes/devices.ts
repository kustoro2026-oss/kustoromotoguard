import { Router, Response } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// GET /api/devices - List all devices
router.get('/', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT id, name, plate_number, device_token, vehicle_type, is_active, status, last_seen_at, created_at
       FROM devices
       ORDER BY name ASC`
    );

    res.json({ devices: result.rows });
  } catch (err) {
    console.error('[Devices] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/devices/:id - Device detail with latest data
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Device info
    const deviceResult = await query(
      `SELECT id, name, plate_number, device_token, vehicle_type, is_active, status, last_seen_at, created_at
       FROM devices WHERE id = $1`,
      [id]
    );

    if (deviceResult.rows.length === 0) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const device = deviceResult.rows[0];

    // Latest location
    const locationResult = await query(
      `SELECT time, latitude, longitude, speed, heading, altitude
       FROM device_locations
       WHERE device_id = $1
       ORDER BY time DESC LIMIT 1`,
      [id]
    );

    // Latest sensors
    const sensorResult = await query(
      `SELECT time, fuel_level, engine_rpm, engine_temp, battery_voltage, speed
       FROM device_sensors
       WHERE device_id = $1
       ORDER BY time DESC LIMIT 1`,
      [id]
    );

    res.json({
      device,
      latest_location: locationResult.rows[0] || null,
      latest_sensors: sensorResult.rows[0] || null,
    });
  } catch (err) {
    console.error('[Devices] Detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/devices/:id/locations - Location history
router.get('/:id/locations', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { from, to, limit } = req.query;

    let queryStr = `
      SELECT time, latitude, longitude, speed, heading, altitude
      FROM device_locations
      WHERE device_id = $1
    `;
    const params: any[] = [id];

    if (from) {
      params.push(from);
      queryStr += ` AND time >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      queryStr += ` AND time <= $${params.length}`;
    }

    queryStr += ` ORDER BY time DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit as string) || 500);

    const result = await query(queryStr, params);
    res.json({ locations: result.rows });
  } catch (err) {
    console.error('[Devices] Locations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/devices/:id/sensors - Sensor history
router.get('/:id/sensors', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { from, to, limit } = req.query;

    let queryStr = `
      SELECT time, fuel_level, engine_rpm, engine_temp, battery_voltage, speed
      FROM device_sensors
      WHERE device_id = $1
    `;
    const params: any[] = [id];

    if (from) {
      params.push(from);
      queryStr += ` AND time >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      queryStr += ` AND time <= $${params.length}`;
    }

    queryStr += ` ORDER BY time DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit as string) || 500);

    const result = await query(queryStr, params);
    res.json({ sensors: result.rows });
  } catch (err) {
    console.error('[Devices] Sensors error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/devices/:id/audio - List audio recordings
router.get('/:id/audio', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, file_path, duration, recorded_at, file_size
       FROM audio_recordings
       WHERE device_id = $1
       ORDER BY recorded_at DESC
       LIMIT 50`,
      [id]
    );

    res.json({ recordings: result.rows });
  } catch (err) {
    console.error('[Devices] Audio list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/devices/:id/audio/record - Start recording command
router.post('/:id/audio/record', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const sessionId = uuidv4();

    // Get MQTT service from app locals (set in index.ts)
    const mqttService = req.app.locals.mqttService;
    const audioService = req.app.locals.audioService;

    const topic = `cmd/${id}/audio_start`;
    const payload = audioService.getStartRecordingPayload(sessionId);

    mqttService.publishCommand(id, topic, payload);

    res.json({
      message: 'Recording started',
      session_id: sessionId,
    });
  } catch (err) {
    console.error('[Devices] Audio record error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
