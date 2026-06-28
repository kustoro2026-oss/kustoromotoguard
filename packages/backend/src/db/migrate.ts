import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('[Migrate] No DATABASE_URL, skipping migration');
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('[Migrate] Running database migration...');

    // Extensions: try each individually; some (postgis, timescaledb) may not be
    // available on managed PostgreSQL like Railway. Failures here are non-fatal.
    for (const ext of ['postgis', 'timescaledb', 'uuid-ossp']) {
      try {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS "${ext}"`);
        console.log(`[Migrate] Extension "${ext}" ready`);
      } catch (err: any) {
        console.warn(`[Migrate] Extension "${ext}" unavailable (non-fatal):`, err.message);
      }
    }

    // Users
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'viewer',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Devices
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        plate_number VARCHAR(50),
        device_token VARCHAR(255) UNIQUE NOT NULL,
        vehicle_type VARCHAR(100),
        is_active BOOLEAN NOT NULL DEFAULT true,
        status VARCHAR(20) NOT NULL DEFAULT 'offline',
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Device locations hypertable
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_locations (
        time TIMESTAMPTZ NOT NULL,
        device_id UUID NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        speed DOUBLE PRECISION,
        heading DOUBLE PRECISION,
        altitude DOUBLE PRECISION
      )
    `);
    await pool.query(`SELECT create_hypertable('device_locations', 'time', if_not_exists => TRUE)`)
      .catch(() => console.log('[Migrate] Hypertable already exists or TimescaleDB not available'));

    // Device sensors hypertable
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_sensors (
        time TIMESTAMPTZ NOT NULL,
        device_id UUID NOT NULL,
        fuel_level DOUBLE PRECISION,
        engine_rpm DOUBLE PRECISION,
        engine_temp DOUBLE PRECISION,
        battery_voltage DOUBLE PRECISION,
        speed DOUBLE PRECISION
      )
    `);
    await pool.query(`SELECT create_hypertable('device_sensors', 'time', if_not_exists => TRUE)`)
      .catch(() => console.log('[Migrate] Hypertable already exists or TimescaleDB not available'));

    // Audio recordings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audio_recordings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id UUID NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        duration INTEGER,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        file_size BIGINT
      )
    `);

    // Alerts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id UUID NOT NULL,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Seed admin user (password: admin123)
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(`
      INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')
      ON CONFLICT (email) DO NOTHING
    `, ['admin@kustoro.com', hash]);

    // Seed demo devices
    const devices = [
      ['Motor Alpha', 'B 1234 ABC', 'dev-token-alpha-001', 'Honda Vario 150'],
      ['Motor Bravo', 'B 2345 BCD', 'dev-token-bravo-002', 'Yamaha NMAX'],
      ['Motor Charlie', 'B 3456 CDE', 'dev-token-charlie-003', 'Honda Beat'],
      ['Motor Delta', 'B 4567 DEF', 'dev-token-delta-004', 'Yamaha Mio'],
      ['Motor Echo', 'B 5678 EFG', 'dev-token-echo-005', 'Honda PCX'],
    ];

    for (const [name, plate, token, type] of devices) {
      await pool.query(`
        INSERT INTO devices (name, plate_number, device_token, vehicle_type)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (device_token) DO NOTHING
      `, [name, plate, token, type]);
    }

    console.log('[Migrate] Migration complete');
  } catch (err) {
    console.error('[Migrate] Migration error:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('[Migrate] Migration failed, server will start anyway:', err.message);
  process.exit(0);
});
