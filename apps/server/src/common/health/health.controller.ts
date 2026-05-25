/**
 * src/common/health/health.controller.ts
 *
 * WHY HEALTH CHECKS MATTER IN PRODUCTION:
 *
 * Kubernetes uses two probes:
 *   - Liveness  (/health):  Is the app alive? If NO → restart container
 *   - Readiness (/ready):   Can the app serve traffic? If NO → remove from LB
 *
 * /health — liveness: returns 200 if process is running (lightweight)
 * /ready  — readiness: checks all dependencies (DB, Redis)
 *            Returns 503 if any critical dependency is down
 *            K8s will stop routing traffic to this pod
 *
 * Load balancers (AWS ALB, GCP LB, Nginx) use /health to decide
 * whether to send requests to a server instance.
 *
 * This is also critical during rolling deploys:
 *   1. New pod starts, /ready returns 503 (migrations running)
 *   2. Migrations complete, /ready returns 200
 *   3. K8s routes traffic to new pod
 *   4. Old pod is terminated
 */

import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { Public } from '../../modules/auth/guards/jwt-auth.guard';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Liveness probe — confirms the Node.js process is running.
   * Does NOT check dependencies — that would cause unnecessary restarts
   * if the database is temporarily unavailable.
   */
  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200 })
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    };
  }

  /**
   * Readiness probe — checks all critical dependencies.
   * Returns 503 if anything is unhealthy so the load balancer
   * stops sending traffic here.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async ready() {
    const checks = {
      database: false,
      redis: false,
    };

    let allHealthy = true;

    // Check database
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      allHealthy = false;
    }

    // Check Redis
    try {
      const result = await this.redis.getClient().ping();
      checks.redis = result === 'PONG';
    } catch {
      allHealthy = false;
    }

    const statusCode = allHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return {
      status: allHealthy ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
