-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Devices table
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
);

-- Device locations (TimescaleDB hypertable for GPS data)
CREATE TABLE IF NOT EXISTS device_locations (
    time TIMESTAMPTZ NOT NULL,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    altitude DOUBLE PRECISION
);

SELECT create_hypertable('device_locations', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_device_locations_device_time ON device_locations (device_id, time DESC);

-- Device sensors (TimescaleDB hypertable for sensor data)
CREATE TABLE IF NOT EXISTS device_sensors (
    time TIMESTAMPTZ NOT NULL,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    fuel_level DOUBLE PRECISION,
    engine_rpm DOUBLE PRECISION,
    engine_temp DOUBLE PRECISION,
    battery_voltage DOUBLE PRECISION,
    speed DOUBLE PRECISION
);

SELECT create_hypertable('device_sensors', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_device_sensors_device_time ON device_sensors (device_id, time DESC);

-- Audio recordings table
CREATE TABLE IF NOT EXISTS audio_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    duration INTEGER,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    file_size BIGINT
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_device_type ON alerts (device_id, type);
CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts (device_id, is_read) WHERE is_read = false;

-- Insert seed data: admin user (password: admin123)
INSERT INTO users (email, password_hash, role) VALUES
    ('admin@kustoro.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Insert seed data: devices with fixed UUIDs (matching simulator's hardcoded IDs)
INSERT INTO devices (id, name, plate_number, device_token, vehicle_type) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Motor Alpha',   'B 1234 ABC', 'dev-token-alpha-001',   'Honda Vario 150'),
    ('550e8400-e29b-41d4-a716-446655440002', 'Motor Bravo',   'B 2345 BCD', 'dev-token-bravo-002',   'Yamaha NMAX'),
    ('550e8400-e29b-41d4-a716-446655440003', 'Motor Charlie', 'B 3456 CDE', 'dev-token-charlie-003', 'Honda Beat'),
    ('550e8400-e29b-41d4-a716-446655440004', 'Motor Delta',   'B 4567 DEF', 'dev-token-delta-004',   'Yamaha Mio'),
    ('550e8400-e29b-41d4-a716-446655440005', 'Motor Echo',    'B 5678 EFG', 'dev-token-echo-005',    'Honda PCX')
ON CONFLICT (device_token) DO UPDATE SET id = EXCLUDED.id;
