import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/simulator/command — forward control commands to the simulator via MQTT
router.post('/command', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { deviceId, action, route, speed, multiplier } = req.body;

    if (!deviceId || !action) {
      res.status(400).json({ error: 'deviceId and action are required' });
      return;
    }

    const validActions = [
      'set_route', 'set_speed', 'set_multiplier',
      'refuel', 'reset', 'pause', 'resume',
      'status', 'list_routes',
    ];

    if (!validActions.includes(action)) {
      res.status(400).json({
        error: `Invalid action: ${action}`,
        valid_actions: validActions,
      });
      return;
    }

    const mqttService = req.app.locals.mqttService;
    if (!mqttService) {
      res.status(503).json({ error: 'MQTT service not available' });
      return;
    }

    const command: Record<string, unknown> = { action };
    if (route !== undefined) command.route = route;
    if (speed !== undefined) command.speed = Number(speed);
    if (multiplier !== undefined) command.multiplier = Number(multiplier);

    const topic = `sim/${deviceId}/command`;
    const payload = JSON.stringify(command);

    mqttService.publishCommand(deviceId, topic, payload);

    res.json({
      success: true,
      topic,
      command,
      message: `Command '${action}' sent to ${deviceId}`,
    });
  } catch (err) {
    console.error('[Simulator] Command error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
