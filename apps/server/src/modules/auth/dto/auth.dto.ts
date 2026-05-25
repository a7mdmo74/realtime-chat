/**
 * src/modules/auth/dto/auth.dto.ts
 *
 * WHY STRICT DTO VALIDATION:
 * DTOs are the contract between the client and the server.
 * class-validator enforces this contract at runtime, rejecting
 * malformed input before it reaches business logic.
 *
 * SENIOR PRACTICES:
 * - @IsStrongPassword() checks entropy, not just length
 * - @Transform() sanitizes before validation (trim whitespace)
 * - Response DTOs (without Omit) control what we send back
 * - Never return passwordHash, even in error paths
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  Length,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email: string;

  @ApiProperty({ example: 'john_doe', description: 'Letters, numbers, underscores only' })
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username can only contain letters, numbers, and underscores',
  })
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  username: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  @Transform(({ value }) => (value as string).trim())
  displayName: string;

  @ApiProperty({
    example: 'SecureP@ssw0rd!',
    description: 'Min 8 chars, uppercase, lowercase, number, symbol',
  })
  @IsStrongPassword({
    minLength: 8,
    minUppercase: 1,
    minLowercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  })
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email: string;

  @ApiProperty({ example: 'SecureP@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token from previous login/refresh' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class TokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number;
}

export class AuthResponseDto {
  @ApiProperty()
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
  };

  @ApiProperty()
  tokens: TokenResponseDto;
}
