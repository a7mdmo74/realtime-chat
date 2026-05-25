/**
 * src/modules/chat/dto/chat.dto.ts
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ChatType } from '@prisma/client';

export class CreatePrivateChatDto {
  @ApiProperty({ description: 'ID of the user to start a DM with' })
  @IsUUID()
  recipientId: string;
}

export class CreateGroupChatDto {
  @ApiProperty({ example: 'Engineering Team' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional({ example: 'Backend squad discussions' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiProperty({ description: 'Initial member IDs (excluding creator)' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(99) // Max 100 members including creator
  memberIds: string[];
}

export class AddMembersDto {
  @ApiProperty()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMinSize(1)
  memberIds: string[];
}

export class ChatSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string | null;
  @ApiProperty() type: ChatType;
  @ApiProperty({ nullable: true }) avatarUrl: string | null;
  @ApiProperty({ nullable: true }) lastMessage: LastMessageDto | null;
  @ApiProperty() unreadCount: number;
  @ApiProperty() memberCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class LastMessageDto {
  @ApiProperty() id: string;
  @ApiProperty() content: string | null;
  @ApiProperty() senderUsername: string;
  @ApiProperty() createdAt: Date;
}
