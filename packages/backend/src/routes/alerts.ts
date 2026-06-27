import { Router, Response } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

function handleDbError(err: any, res: Response): void {
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    res.status(503).json({ error: 'Database not available. Please add PostgreSQL plugin in Railway.' });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
}

const router = Router();

// GET /api/alerts - List alerts with filters
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { device_id, type, unread } = req.query;

    let queryStr = `
      SELECT a.id, a.device_id, a.type, a.message, a.is_read, a.created_at, d.name as device_name
      FROM alerts a
      JOIN devices d ON a.device_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 0;

    if (device_id) {
      paramIndex++;
      params.push(device_id);
      queryStr += ` AND a.device_id = $${paramIndex}`;
    }

    if (type) {
      paramIndex++;
      params.push(type);
      queryStr += ` AND a.type = $${paramIndex}`;
    }

    if (unread === 'true') {
      queryStr += ` AND a.is_read = false`;
    }

    queryStr += ` ORDER BY a.created_at DESC LIMIT 100`;

    const result = await query(queryStr, params);
    res.json({ alerts: result.rows });
  } catch (err) {
    console.error('[Alerts] List error:', err);
    handleDbError(err, res);
  }
});

// PUT /api/alerts/:id/read - Mark alert as read
router.put('/:id/read', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await query(
      `UPDATE alerts SET is_read = true WHERE id = $1`,
      [id]
    );

    res.json({ message: 'Alert marked as read' });
  } catch (err) {
    console.error('[Alerts] Mark read error:', err);
    handleDbError(err, res);
  }
});

export default router;
