/**
 * src/modules/messages/messages.controller.ts
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
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { AddReactionDto, EditMessageDto, MessageDto, SendMessageDto } from './dto/message.dto';
import { CursorPaginationDto } from '../../common/dto/pagination.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('chats/:chatId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message to a chat' })
  @ApiResponse({ status: 201, type: MessageDto })
  sendMessage(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.messagesService.sendMessage(chatId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get paginated messages for a chat' })
  getMessages(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: CursorPaginationDto,
  ) {
    return this.messagesService.getMessages(chatId, user.id, pagination);
  }

  @Patch(':messageId')
  @ApiOperation({ summary: 'Edit a message (sender only)' })
  @ApiResponse({ status: 200, type: MessageDto })
  editMessage(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EditMessageDto,
  ): Promise<MessageDto> {
    return this.messagesService.editMessage(messageId, user.id, dto);
  }

  @Delete(':messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a message (sender or admin)' })
  async deleteMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.messagesService.deleteMessage(messageId, user.id);
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark messages as read' })
  async markAsRead(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { messageIds: string[] },
  ): Promise<void> {
    await this.messagesService.markAsRead(chatId, user.id, body.messageIds);
  }

  @Post(':messageId/reactions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add a reaction to a message' })
  async addReaction(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddReactionDto,
  ): Promise<void> {
    await this.messagesService.addReaction(messageId, user.id, dto.emoji);
  }

  @Delete(':messageId/reactions/:emoji')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a reaction from a message' })
  async removeReaction(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('emoji') emoji: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.messagesService.removeReaction(messageId, user.id, emoji);
  }
}
