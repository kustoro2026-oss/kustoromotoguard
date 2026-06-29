import { Router, Response } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

function handleDbError(err: any, res: Response): void {
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    res.status(503).json({ error: 'Database not available. Please add PostgreSQL plugin in Railway.' });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
}

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
    handleDbError(err, res);
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
    handleDbError(err, res);
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
    handleDbError(err, res);
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
    handleDbError(err, res);
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
    handleDbError(err, res);
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
    handleDbError(err, res);
  }
});

// POST /api/devices — Create a new device
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, plate_number, vehicle_type, device_token } = req.body;

    if (!name || !device_token) {
      res.status(400).json({ error: 'name and device_token are required' });
      return;
    }

    const id = uuidv4();
    const result = await query(
      `INSERT INTO devices (id, name, plate_number, device_token, vehicle_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, plate_number, device_token, vehicle_type, is_active, status, last_seen_at, created_at`,
      [id, name, plate_number || null, device_token, vehicle_type || null]
    );

    const device = result.rows[0];

    // Notify simulator of new device via MQTT (if available)
    try {
      const mqttService = req.app.locals.mqttService;
      if (mqttService) {
        mqttService.publishCommand('all', 'sim/all/command', JSON.stringify({
          action: 'add_device',
          device: { id, name, plate_number: plate_number || '', vehicle_type: vehicle_type || '', device_token },
        }));
      }
    } catch { /* non-critical */ }

    res.status(201).json({ device });
  } catch (err: any) {
    console.error('[Devices] Create error:', err);
    if (err.code === '23505') {
      res.status(409).json({ error: 'Device token already exists' });
      return;
    }
    handleDbError(err, res);
  }
});

// PUT /api/devices/:id — Update a device
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, plate_number, vehicle_type, device_token, is_active } = req.body;

    // Check device exists
    const existing = await query('SELECT id FROM devices WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Build dynamic UPDATE
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (plate_number !== undefined) { fields.push(`plate_number = $${idx++}`); values.push(plate_number); }
    if (vehicle_type !== undefined) { fields.push(`vehicle_type = $${idx++}`); values.push(vehicle_type); }
    if (device_token !== undefined) { fields.push(`device_token = $${idx++}`); values.push(device_token); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);
    const result = await query(
      `UPDATE devices SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, plate_number, device_token, vehicle_type, is_active, status, last_seen_at, created_at`,
      values
    );

    res.json({ device: result.rows[0] });
  } catch (err: any) {
    console.error('[Devices] Update error:', err);
    if (err.code === '23505') {
      res.status(409).json({ error: 'Device token already exists' });
      return;
    }
    handleDbError(err, res);
  }
});

// DELETE /api/devices/:id — Delete a device (cascades to locations/sensors/alerts/audio)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id, name FROM devices WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Cascade deletes happen automatically via DB foreign keys with ON DELETE CASCADE
    await query('DELETE FROM devices WHERE id = $1', [id]);

    // Notify simulator to remove device via MQTT (if available)
    try {
      const mqttService = req.app.locals.mqttService;
      if (mqttService) {
        mqttService.publishCommand('all', 'sim/all/command', JSON.stringify({
          action: 'remove_device',
          device_id: id,
        }));
      }
    } catch { /* non-critical */ }

    res.json({ success: true, message: `Device '${existing.rows[0].name}' deleted` });
  } catch (err) {
    console.error('[Devices] Delete error:', err);
    handleDbError(err, res);
  }
});

export default router;
