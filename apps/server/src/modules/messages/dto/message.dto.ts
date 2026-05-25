/**
 * src/modules/messages/dto/message.dto.ts
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Length } from 'class-validator'
import { MessageType } from '@prisma/client'

export class SendMessageDto {
  @ApiPropertyOptional({
    description: 'Required for TEXT messages',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 4000)
  content?: string

  @ApiPropertyOptional({
    enum: MessageType,
    default: MessageType.TEXT,
  })
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType = MessageType.TEXT

  @ApiPropertyOptional({
    description: 'ID of message being replied to',
  })
  @IsOptional()
  @IsUUID()
  replyToId?: string
}

export class EditMessageDto {
  @ApiProperty({
    example: 'Updated message content',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 4000)
  content: string
}

export class AddReactionDto {
  @ApiProperty({
    example: '👍',
    description: 'Unicode emoji character',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 8) // Some emoji are multi-byte
  emoji: string
}

/**
 * Nested DTOs must be declared BEFORE MessageDto
 * to avoid runtime metadata initialization issues.
 */

export class MessageSenderDto {
  @ApiProperty({
    example: 'a7d7f2d1-1234-4567-8901-abcdef123456',
  })
  id: string

  @ApiProperty({
    example: 'ahmedamer',
  })
  username: string

  @ApiProperty({
    example: 'Ahmed Amer',
  })
  displayName: string

  @ApiProperty({
    nullable: true,
    example: 'https://cdn.example.com/avatar.jpg',
  })
  avatarUrl: string | null
}

export class ReactionDto {
  @ApiProperty({
    example: '🔥',
  })
  emoji: string

  @ApiProperty({
    example: 'b2d9a9e2-9876-4321-1111-fedcba654321',
  })
  userId: string

  @ApiProperty({
    example: 'john_doe',
  })
  username: string
}

export class MessageReadDto {
  @ApiProperty({
    example: 'c3a8e7d5-5555-4444-3333-222222222222',
  })
  userId: string

  @ApiProperty({
    example: '2026-05-25T10:30:00.000Z',
  })
  readAt: Date
}

export class MessageDto {
  @ApiProperty({
    example: 'msg_123456789',
  })
  id: string

  @ApiProperty({
    example: 'chat_123456789',
  })
  chatId: string

  @ApiProperty({
    nullable: true,
    example: 'Hello world',
  })
  content: string | null

  @ApiProperty({
    enum: MessageType,
    example: MessageType.TEXT,
  })
  type: MessageType

  @ApiProperty({
    nullable: true,
    example: 'https://cdn.example.com/image.png',
  })
  mediaUrl: string | null

  @ApiProperty({
    nullable: true,
    example: '2026-05-25T10:35:00.000Z',
  })
  editedAt: Date | null

  @ApiProperty({
    example: false,
  })
  isPinned: boolean

  @ApiProperty({
    nullable: true,
    example: 'msg_reply_123',
  })
  replyToId: string | null

  @ApiProperty({
    type: () => MessageSenderDto,
  })
  sender: MessageSenderDto

  @ApiProperty({
    type: () => [ReactionDto],
  })
  reactions: ReactionDto[]

  @ApiProperty({
    type: () => [MessageReadDto],
  })
  reads: MessageReadDto[]

  @ApiProperty({
    example: '2026-05-25T10:00:00.000Z',
  })
  createdAt: Date

  @ApiProperty({
    example: '2026-05-25T10:00:00.000Z',
  })
  updatedAt: Date
}
