import mqtt, { MqttClient } from 'mqtt';
import { config } from '../config';
import { query } from '../db';
import { SocketService } from './socketService';
import { AudioService } from './audioService';
import {
  LocationPayload,
  SensorPayload,
  AudioChunkPayload,
  AlertPayload,
  StatusPayload,
  MQTT_TOPICS,
  extractDeviceId,
} from '../types/mqtt';

export class MqttService {
  private client: MqttClient | null = null;
  private socketService: SocketService;
  private audioService: AudioService;

  constructor(socketService: SocketService, audioService: AudioService) {
    this.socketService = socketService;
    this.audioService = audioService;
  }

  async connect(): Promise<void> {
    if (!config.mqtt.brokerUrl) {
      console.log('[MQTT] No broker URL configured, skipping MQTT');
      return;
    }

    const options: mqtt.IClientOptions = {
      clientId: `${config.mqtt.clientId}-${Date.now()}`,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 5000,
    };

    if (config.mqtt.username) {
      options.username = config.mqtt.username;
      options.password = config.mqtt.password;
    }

    this.client = mqtt.connect(config.mqtt.brokerUrl, options);

    this.client.on('connect', () => {
      console.log('[MQTT] Connected to broker');

      // Subscribe to all uplink topics
      const topics = [
        MQTT_TOPICS.LOCATION,
        MQTT_TOPICS.SENSORS,
        MQTT_TOPICS.AUDIO,
        MQTT_TOPICS.ALERT,
        MQTT_TOPICS.STATUS,
      ];

      topics.forEach((topic) => {
        this.client!.subscribe(topic, { qos: 1 }, (err) => {
          if (err) {
            console.error(`[MQTT] Failed to subscribe to ${topic}:`, err);
          } else {
            console.log(`[MQTT] Subscribed to ${topic}`);
          }
        });
      });
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on('error', (err) => {
      console.error('[MQTT] Connection error:', err);
    });

    this.client.on('close', () => {
      console.log('[MQTT] Connection closed');
    });

    this.client.on('reconnect', () => {
      console.log('[MQTT] Reconnecting...');
    });
  }

  private async handleMessage(topic: string, message: Buffer): Promise<void> {
    const deviceId = extractDeviceId(topic);
    if (!deviceId) {
      console.warn(`[MQTT] Cannot extract deviceId from topic: ${topic}`);
      return;
    }

    try {
      const payload = JSON.parse(message.toString());

      if (topic.endsWith('/location')) {
        await this.handleLocation(deviceId, payload as LocationPayload);
      } else if (topic.endsWith('/sensors')) {
        await this.handleSensors(deviceId, payload as SensorPayload);
      } else if (topic.endsWith('/audio')) {
        this.handleAudio(deviceId, payload as AudioChunkPayload);
      } else if (topic.endsWith('/alert')) {
        await this.handleAlert(deviceId, payload as AlertPayload);
      } else if (topic.endsWith('/status')) {
        await this.handleStatus(deviceId, payload as StatusPayload);
      }
    } catch (err) {
      console.error(`[MQTT] Failed to parse message on ${topic}:`, err);
    }
  }

  private async handleLocation(deviceId: string, payload: LocationPayload): Promise<void> {
    try {
      await query(
        `INSERT INTO device_locations (time, device_id, latitude, longitude, speed, heading, altitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          payload.timestamp,
          deviceId,
          payload.latitude,
          payload.longitude,
          payload.speed,
          payload.heading,
          payload.altitude,
        ]
      );

      // Update device last_seen
      await query(
        `UPDATE devices SET last_seen_at = NOW() AT TIME ZONE 'UTC', status = 'online' WHERE id = $1`,
        [deviceId]
      );

      // Push location + status to WebSocket
      this.socketService.emitLocation(deviceId, {
        device_id: deviceId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed,
        heading: payload.heading,
        timestamp: payload.timestamp,
      });

      // Also emit status so frontend sidebar updates immediately
      this.socketService.emitStatus(deviceId, {
        device_id: deviceId,
        status: 'online',
        timestamp: payload.timestamp,
      });
    } catch (err) {
      console.error(`[MQTT] Error saving location for ${deviceId}:`, err);
    }
  }

  private async handleSensors(deviceId: string, payload: SensorPayload): Promise<void> {
    try {
      await query(
        `INSERT INTO device_sensors (time, device_id, fuel_level, engine_rpm, engine_temp, battery_voltage, speed)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          payload.timestamp,
          deviceId,
          payload.fuel_level,
          payload.engine_rpm,
          payload.engine_temp,
          payload.battery_voltage,
          payload.speed,
        ]
      );

      // Push to WebSocket
      this.socketService.emitSensors(deviceId, {
        device_id: deviceId,
        fuel_level: payload.fuel_level,
        engine_rpm: payload.engine_rpm,
        engine_temp: payload.engine_temp,
        battery_voltage: payload.battery_voltage,
        speed: payload.speed,
        timestamp: payload.timestamp,
      });
    } catch (err) {
      console.error(`[MQTT] Error saving sensors for ${deviceId}:`, err);
    }
  }

  private handleAudio(deviceId: string, payload: AudioChunkPayload): void {
    this.audioService.handleChunk(
      deviceId,
      payload.session_id,
      payload.chunk_index,
      payload.is_last,
      payload.data
    );
  }

  private async handleAlert(deviceId: string, payload: AlertPayload): Promise<void> {
    try {
      const result = await query(
        `INSERT INTO alerts (device_id, type, message, created_at)
         VALUES ($1, $2, $3, NOW() AT TIME ZONE 'UTC')
         RETURNING id, type, message, is_read, created_at`,
        [deviceId, payload.type, payload.message]
      );

      const alert = result.rows[0];

      // Push to WebSocket
      this.socketService.emitAlert({
        ...alert,
        device_id: deviceId,
      });

      console.log(`[MQTT] Alert from ${deviceId}: ${payload.type} - ${payload.message}`);
    } catch (err) {
      console.error(`[MQTT] Error saving alert for ${deviceId}:`, err);
    }
  }

  private async handleStatus(deviceId: string, payload: StatusPayload): Promise<void> {
    try {
      await query(
        `UPDATE devices SET status = $1, last_seen_at = NOW() AT TIME ZONE 'UTC' WHERE id = $2`,
        [payload.status, deviceId]
      );

      this.socketService.emitStatus(deviceId, {
        device_id: deviceId,
        status: payload.status,
        timestamp: payload.timestamp,
      });
    } catch (err) {
      console.error(`[MQTT] Error updating status for ${deviceId}:`, err);
    }
  }

  // Send command to device
  publishCommand(deviceId: string, topic: string, payload: string): void {
    if (!this.client) {
      console.warn('[MQTT] Client not connected, cannot publish command');
      return;
    }
    this.client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[MQTT] Failed to publish to ${topic}:`, err);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.endAsync();
      console.log('[MQTT] Disconnected');
    }
  }
}
