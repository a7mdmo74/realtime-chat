/**
 * src/redis/redis.service.ts
 *
 * WHY REDIS IN A CHAT APP:
 * 1. Session/token management (fast revocation without DB hit)
 * 2. Online presence tracking (SET with TTL, refreshed on heartbeat)
 * 3. Pub/Sub for WebSocket horizontal scaling (multiple server nodes)
 * 4. Caching frequently-read data (user profiles, chat metadata)
 * 5. Rate limiting state (shared across instances)
 *
 * WHY IOREDIS OVER THE BUILT-IN REDIS CLIENT:
 * IORedis has automatic reconnection, cluster support, Lua scripts,
 * and a Promise-based API. It's the industry standard for Node.js.
 *
 * PATTERN: We provide TWO ioredis instances:
 *   - REDIS_CLIENT: General cache/data operations
 *   - REDIS_SUBSCRIBER: Dedicated connection for pub/sub
 *     (A subscribed connection can ONLY receive; it can't send commands)
 */

import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client: Redis
  private subscriber: Redis
  private publisher: Redis
  private subscriberReady: Promise<void>
  private resolveReady: () => void
  private rejectReady: (error: Error) => void

  constructor(private configService: ConfigService) {
    // Initialize the promise and its resolvers
    this.subscriberReady = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
  }

  onModuleInit(): void {
    const options = {
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string>('redis.password'),
      db: this.configService.get<number>('redis.db', 0),
      retryStrategy: (times: number) => {
        if (times > 10) {
          this.logger.error('Redis connection failed after 10 retries')
          return null // Stop retrying
        }
        return Math.min(times * 100, 3000) // Exponential backoff, max 3s
      },
      lazyConnect: false,
    }

    this.client = new Redis(options)
    // Subscriber should not run the ready check (it issues non-subscriber commands like INFO)
    this.subscriber = new Redis({ ...options, enableReadyCheck: false })
    this.publisher = new Redis(options)

    this.client.on('connect', () => this.logger.log('Redis client connected', RedisService.name))
    this.client.on('error', err => this.logger.error('Redis client error', err, RedisService.name))

    // Handle subscriber connection
    this.subscriber.on('connect', () => {
      this.logger.log('Redis subscriber connected', RedisService.name);
      try {
        this.resolveReady();
      } catch {
        // Already resolved/rejected - ignore
      }
    });
    this.subscriber.on('error', (err) => {
      const message = err instanceof Error ? `${err.message}\n${err.stack}` : JSON.stringify(err);
      this.logger.error(`Redis subscriber error: ${message}`, RedisService.name);
      try {
        this.rejectReady(err instanceof Error ? err : new Error(String(err)));
      } catch {
        // If the promise was already settled, ignore
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.client?.quit().catch(() => {}),
      this.subscriber?.quit().catch(() => {}),
      this.publisher?.quit().catch(() => {}),
    ])
    this.logger.log('Redis connections closed', RedisService.name)
  }

  // ─── Connection Ready Check ───────────────────────────────────────────────

  async ensureSubscriberReady(timeoutMs = 5000): Promise<void> {
    try {
      await Promise.race([
        this.subscriberReady,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for Redis subscriber')), timeoutMs)),
      ]);
    } catch (err) {
      // Non-fatal: log and allow caller to continue (Redis may reconnect shortly)
      this.logger.warn(
        `ensureSubscriberReady warning: ${err instanceof Error ? err.message : String(err)}`,
        RedisService.name,
      );
    }
  }

  // ─── General Cache Operations ────────────────────────────────────────────

  getClient(): Redis {
    return this.client
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key)
    if (!value) return null
    try {
      return JSON.parse(value) as T
    } catch {
      return value as unknown as T
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, serialized)
    } else {
      await this.client.set(key, serialized)
    }
  }

  async del(...keys: string[]): Promise<void> {
    await this.client.del(...keys)
  }

  async exists(...keys: string[]): Promise<boolean> {
    const count = await this.client.exists(...keys)
    return count > 0
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds)
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key)
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value)
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field)
  }

  async hdel(key: string, ...fields: string[]): Promise<void> {
    await this.client.hdel(key, ...fields)
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key)
  }

  // ─── Pub/Sub Operations ───────────────────────────────────────────────────

  async publish(channel: string, message: unknown): Promise<void> {
    const payload = typeof message === 'string' ? message : JSON.stringify(message)
    await this.publisher.publish(channel, payload)
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    await this.ensureSubscriberReady()
    try {
      await this.subscriber.subscribe(channel)
    } catch (err) {
      this.logger.error(
        `Failed to subscribe to channel ${channel}: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
        RedisService.name,
      )
      return
    }

    this.subscriber.on('message', (ch: string, msg: string) => {
      try {
        if (ch === channel) handler(msg)
      } catch (handlerErr) {
        this.logger.error(
          `Redis message handler error: ${handlerErr instanceof Error ? handlerErr.message : String(handlerErr)}`,
          RedisService.name,
        )
      }
    })
  }

  async psubscribe(
    pattern: string,
    handler: (channel: string, message: string) => void,
  ): Promise<void> {
    await this.ensureSubscriberReady()
    try {
      await this.subscriber.psubscribe(pattern)
    } catch (err) {
      this.logger.error(
        `Failed to psubscribe to pattern ${pattern}: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
        RedisService.name,
      )
      return
    }

    this.subscriber.on('pmessage', (_pattern: string, channel: string, msg: string) => {
      try {
        handler(channel, msg)
      } catch (handlerErr) {
        this.logger.error(
          `Redis pmessage handler error: ${handlerErr instanceof Error ? handlerErr.message : String(handlerErr)}`,
          RedisService.name,
        )
      }
    })
  }

  // ─── Presence-Specific Helpers ────────────────────────────────────────────

  /** Track a user as online. TTL is refreshed on each heartbeat. */
  async setUserOnline(userId: string, ttlSeconds = 30): Promise<void> {
    await this.client.setex(`presence:${userId}`, ttlSeconds, 'online')
  }

  async setUserOffline(userId: string): Promise<void> {
    await this.client.del(`presence:${userId}`)
  }

  async isUserOnline(userId: string): Promise<boolean> {
    return this.exists(`presence:${userId}`)
  }

  /** Get all online user IDs from a list */
  async getOnlineUsers(userIds: string[]): Promise<string[]> {
    if (!userIds.length) return []
    const pipeline = this.client.pipeline()
    userIds.forEach(id => pipeline.exists(`presence:${id}`))
    const results = await pipeline.exec()
    return userIds.filter((_, i) => results?.[i]?.[1] === 1)
  }
}
