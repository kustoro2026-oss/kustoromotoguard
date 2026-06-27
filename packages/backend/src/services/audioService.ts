import { Client as MinioClient } from 'minio';
import { config } from '../config';
import * as db from '../db';

let storageClient: MinioClient | null = null;

function getStorageClient(): MinioClient {
  if (!storageClient) {
    storageClient = new MinioClient({
      endPoint: config.storage.endPoint,
      port: config.storage.port,
      useSSL: config.storage.useSSL,
      accessKey: config.storage.accessKey,
      secretKey: config.storage.secretKey,
      region: config.storage.region === 'auto' ? '' : config.storage.region,
    });
  }
  return storageClient;
}

async function ensureBucket(): Promise<void> {
  const client = getStorageClient();
  const exists = await client.bucketExists(config.storage.bucket);
  if (!exists) {
    await client.makeBucket(config.storage.bucket, config.storage.region);
    console.log(`[Audio] Created bucket: ${config.storage.bucket}`);
  }
}

export class AudioService {
  // Buffer untuk menyimpan chunk audio per sesi
  private audioBuffers: Map<string, { chunks: Buffer[]; deviceId: string; startTime: number }> = new Map();

  constructor() {
    // Initialize MinIO bucket on startup
    ensureBucket().catch((err) => {
      console.warn('[Audio] MinIO not available, audio storage disabled:', err.message);
    });
  }

  // Handle incoming audio chunk
  handleChunk(deviceId: string, sessionId: string, chunkIndex: number, isLast: boolean, data: string): void {
    const key = `${deviceId}:${sessionId}`;

    if (!this.audioBuffers.has(key)) {
      this.audioBuffers.set(key, {
        chunks: [],
        deviceId,
        startTime: Date.now(),
      });
    }

    const buffer = this.audioBuffers.get(key)!;
    const chunk = Buffer.from(data, 'base64');
    buffer.chunks[chunkIndex] = chunk;

    console.log(`[Audio] Chunk ${chunkIndex} for ${key} (${chunk.length} bytes)`);

    if (isLast) {
      this.finalizeRecording(deviceId, sessionId);
    }
  }

  // Finalize recording: combine chunks, upload to MinIO, save metadata
  private async finalizeRecording(deviceId: string, sessionId: string): Promise<void> {
    const key = `${deviceId}:${sessionId}`;
    const buffer = this.audioBuffers.get(key);

    if (!buffer) {
      console.warn(`[Audio] No buffer found for ${key}`);
      return;
    }

    const combined = Buffer.concat(buffer.chunks);
    const duration = Math.round((Date.now() - buffer.startTime) / 1000);
    const fileName = `${deviceId}/${sessionId}.ogg`;
    const fileSize = combined.length;

    console.log(`[Audio] Finalized ${key}: ${fileSize} bytes, ${duration}s`);

    // Upload to MinIO
    try {
      const client = getStorageClient();
      await ensureBucket();
      await client.putObject(config.storage.bucket, fileName, combined, fileSize, {
        'Content-Type': 'audio/ogg',
      });

      // Save metadata to database
      await db.query(
        `INSERT INTO audio_recordings (device_id, file_path, duration, file_size, recorded_at)
         VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'UTC')`,
        [deviceId, `${config.storage.bucket}/${fileName}`, duration, fileSize]
      );

      console.log(`[Audio] Saved recording: ${fileName}`);
    } catch (err) {
      console.error(`[Audio] Failed to save recording:`, err);
    }

    // Cleanup buffer
    this.audioBuffers.delete(key);
  }

  // Start recording command
  getStartRecordingPayload(sessionId: string): string {
    return JSON.stringify({
      action: 'audio_start',
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  // Stop recording command
  getStopRecordingPayload(sessionId: string): string {
    return JSON.stringify({
      action: 'audio_stop',
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    });
  }
}
