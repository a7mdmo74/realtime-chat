/**
 * src/common/dto/pagination.dto.ts
 *
 * WHY A SHARED PAGINATION DTO:
 * Every list endpoint needs pagination. Defining this once and extending
 * it avoids copy-paste drift where different endpoints handle page/limit
 * differently.
 *
 * CURSOR vs OFFSET:
 * We support both patterns because:
 *   - Cursor pagination: real-time feeds (chat messages) — no page drift
 *   - Offset pagination: admin lists where jumping to page N matters
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PAGINATION } from '../constants';

export class PagePaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_LIMIT)
  limit?: number = PAGINATION.DEFAULT_LIMIT;

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? PAGINATION.DEFAULT_LIMIT);
  }
}

export class CursorPaginationDto {
  @ApiPropertyOptional({ description: 'Cursor from previous response (message ID)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_LIMIT)
  limit?: number = PAGINATION.DEFAULT_LIMIT;
}
