/**
 * src/modules/users/dto/user.dto.ts
 */

import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  IsUrl,
} from 'class-validator';
import { PresenceStatus } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @Length(2, 50)
  @Transform(({ value }) => (value as string)?.trim())
  displayName?: string;

  @ApiPropertyOptional({ example: 'Software engineer by day, gamer by night.' })
  @IsOptional()
  @IsString()
  @Length(0, 160)
  bio?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}

export class UserProfileDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() username: string;
  @ApiProperty() displayName: string;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
  @ApiProperty({ nullable: true }) bio: string | null;
  @ApiProperty() role: string;
  @ApiProperty() presenceStatus: PresenceStatus;
  @ApiProperty({ nullable: true }) lastSeenAt: Date | null;
  @ApiProperty() createdAt: Date;
}
