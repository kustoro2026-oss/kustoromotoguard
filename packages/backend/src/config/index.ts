import dotenv from 'dotenv';
dotenv.config();

// Parse DATABASE_URL format (postgres://user:pass@host:port/db) - Railway standard
function parseDatabaseUrl(): { host: string; port: number; name: string; user: string; password: string } {
  const url = process.env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '5432', 10),
      name: parsed.pathname.slice(1),
      user: parsed.username,
      password: parsed.password,
    };
  }
  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    name: process.env.DATABASE_NAME || 'kustoro',
    user: process.env.DATABASE_USER || 'kustoro',
    password: process.env.DATABASE_PASSWORD || 'kustoro123',
  };
}

// Parse REDIS_URL format (redis://user:pass@host:port) - Railway standard
function parseRedisUrl(): { host: string; port: number; password?: string } {
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
    };
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

const db = parseDatabaseUrl();
const rd = parseRedisUrl();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    clientId: process.env.MQTT_CLIENT_ID || 'kustoro-backend',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
  },

  database: {
    host: db.host,
    port: db.port,
    name: db.name,
    user: db.user,
    password: db.password,
  },

  redis: {
    host: rd.host,
    port: rd.port,
    password: rd.password,
  },

  // Unified storage config - supports MinIO (local) and S3-compatible (Cloudflare R2, AWS)
  storage: {
    endPoint: process.env.STORAGE_ENDPOINT || process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.STORAGE_PORT || process.env.MINIO_PORT || '9000', 10),
    accessKey: process.env.STORAGE_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.STORAGE_BUCKET || process.env.MINIO_BUCKET || 'kustoro-audio',
    useSSL: (process.env.STORAGE_USE_SSL || process.env.MINIO_USE_SSL || 'false') === 'true',
    region: process.env.STORAGE_REGION || 'auto',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  frontendUrl: process.env.FRONTEND_URL || '',
};
