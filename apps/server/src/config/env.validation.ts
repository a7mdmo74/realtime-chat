/**
 * src/config/env.validation.ts
 *
 * WHY THIS EXISTS:
 * A misconfigured environment is the #1 cause of production incidents.
 * By validating all env vars at startup with Joi, we "fail fast" —
 * the app refuses to boot instead of silently running broken.
 *
 * SENIOR PRACTICE:
 * - Every variable has a type, default (when safe), and validation rule.
 * - Secrets have no defaults — forcing explicit configuration in every env.
 * - `allowUnknown: true` lets Docker/Heroku/K8s inject system vars freely.
 */

import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  API_VERSION: Joi.string().default('v1'),

  // Database — required, no default (must be explicit)
  DATABASE_URL: Joi.string().uri().required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_DB: Joi.number().default(0),
  REDIS_TTL: Joi.number().default(3600),

  // JWT — required, no defaults (secrets must be set)
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRATION: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),

  // Throttling
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),

  // CORS
  CORS_ORIGIN: Joi.string().default('http://localhost:3001'),

  // Upload
  UPLOAD_DEST: Joi.string().default('./uploads'),
  MAX_FILE_SIZE: Joi.number().default(10485760), // 10MB

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),
});
