/**
 * src/modules/users/users.service.ts
 *
 * RESPONSIBILITIES:
 *   - User profile retrieval (with Redis caching)
 *   - Profile updates
 *   - Online/offline presence management
 *   - User search
 *
 * CACHING STRATEGY:
 * User profiles are cached in Redis for 5 minutes.
 * On update, the cache is invalidated (cache-aside pattern).
 * This dramatically reduces DB load for frequently-viewed profiles.
 */

import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { UpdateProfileDto, UserProfileDto } from './dto/user.dto';
import { CACHE_TTL, REDIS_KEYS } from '../../common/constants';
import { PresenceStatus, User } from '@prisma/client';

// Exclude sensitive fields from user responses
const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  role: true,
  presenceStatus: true,
  lastSeenAt: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async findById(id: string): Promise<UserProfileDto> {
    // Cache-aside: check Redis first
    const cached = await this.redis.get<UserProfileDto>(REDIS_KEYS.USER_CACHE(id));
    if (cached) return cached;

    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, isActive: true },
      select: USER_SELECT,
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);

    // Populate cache
    await this.redis.set(REDIS_KEYS.USER_CACHE(id), user, CACHE_TTL.USER_PROFILE);

    return user;
  }

  async findByUsername(username: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: USER_SELECT,
    });

    if (!user) throw new NotFoundException(`User @${username} not found`);
    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserProfileDto> {
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });

    // Invalidate cache on update
    await this.redis.del(REDIS_KEYS.USER_CACHE(id));

    return user;
  }

  async search(query: string, limit = 20): Promise<UserProfileDto[]> {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: USER_SELECT,
      take: limit,
      orderBy: { username: 'asc' },
    });
  }

  async updatePresence(
    userId: string,
    status: PresenceStatus,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        presenceStatus: status,
        ...(status === PresenceStatus.OFFLINE && { lastSeenAt: new Date() }),
      },
    });

    // Invalidate cache so presence change is immediately visible
    await this.redis.del(REDIS_KEYS.USER_CACHE(userId));
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        email: `deleted_${id}@deleted.invalid`, // Free up email for reuse
        username: `deleted_${id}`,
      },
    });
    await this.redis.del(REDIS_KEYS.USER_CACHE(id));
  }

  /**
   * Serialize user for safe JWT payload / response (no sensitive fields)
   */
  static toSafeUser(user: User): Omit<User, 'passwordHash' | 'deletedAt'> {
    const { passwordHash: _, deletedAt: __, ...safe } = user;
    return safe;
  }
}
