/**
 * src/modules/chat/chat.controller.ts
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { AddMembersDto, ChatSummaryDto, CreateGroupChatDto, CreatePrivateChatDto } from './dto/chat.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';

@ApiTags('Chats')
@ApiBearerAuth()
@Controller('chats')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('private')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start or retrieve a private DM' })
  @ApiResponse({ status: 201, type: ChatSummaryDto })
  createPrivateChat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePrivateChatDto,
  ): Promise<ChatSummaryDto> {
    return this.chatService.createPrivateChat(user.id, dto);
  }

  @Post('group')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a group chat' })
  @ApiResponse({ status: 201, type: ChatSummaryDto })
  createGroupChat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGroupChatDto,
  ): Promise<ChatSummaryDto> {
    return this.chatService.createGroupChat(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "List current user's chats" })
  @ApiResponse({ status: 200, type: [ChatSummaryDto] })
  getUserChats(@CurrentUser() user: AuthenticatedUser): Promise<ChatSummaryDto[]> {
    return this.chatService.getUserChats(user.id);
  }

  @Get(':chatId')
  @ApiOperation({ summary: 'Get chat details' })
  @ApiResponse({ status: 200, type: ChatSummaryDto })
  getChatById(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChatSummaryDto> {
    return this.chatService.getChatById(chatId, user.id);
  }

  @Post(':chatId/members')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add members to a group chat (admin/owner only)' })
  async addMembers(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddMembersDto,
  ): Promise<void> {
    await this.chatService.addMembers(chatId, user.id, dto.memberIds);
  }

  @Delete(':chatId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member or leave the chat' })
  async removeMember(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.chatService.removeMember(chatId, user.id, targetUserId);
  }
}
