/**
 * src/modules/messages/messages.service.ts
 *
 * RESPONSIBILITIES:
 *   - Send, edit, delete messages
 *   - Paginate messages (cursor-based for real-time accuracy)
 *   - Mark messages as read + update unread count
 *   - Add/remove reactions
 *
 * CURSOR PAGINATION RATIONALE:
 * Chat is a real-time feed. If we use offset pagination and a new
 * message arrives, page 2 will have a duplicate of the last item
 * from page 1. Cursor pagination is stable under concurrent writes.
 *
 * READ RECEIPTS:
 * When a user reads, we:
 *   1. Upsert MessageRead records for each message
 *   2. Update ChatMember.lastReadAt (for unread count calculation)
 *   3. Emit a WebSocket event back to the chat (other members see it)
 */

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChatService } from '../chat/chat.service';
import { SendMessageDto, EditMessageDto, MessageDto } from './dto/message.dto';
import { CursorPaginationDto } from '../../common/dto/pagination.dto';
import { PaginationMeta } from '../../common/interfaces';
import { MessageType } from '@prisma/client';

const MESSAGE_SELECT = {
  id: true,
  chatId: true,
  content: true,
  type: true,
  mediaUrl: true,
  mediaMeta: true,
  editedAt: true,
  isPinned: true,
  replyToId: true,
  createdAt: true,
  updatedAt: true,
  sender: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  reactions: {
    include: {
      user: { select: { username: true } },
    },
  },
  reads: {
    select: { userId: true, readAt: true },
  },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private chatService: ChatService,
  ) {}

  // ─── Send Message ──────────────────────────────────────────────────────────

  async sendMessage(
    chatId: string,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<MessageDto> {
    await this.chatService.assertMembership(chatId, senderId);

    if (dto.replyToId) {
      const replyTo = await this.prisma.message.findFirst({
        where: { id: dto.replyToId, chatId, deletedAt: null },
      });
      if (!replyTo) throw new NotFoundException('Message being replied to not found');
    }

    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId,
        content: dto.content,
        type: dto.type || MessageType.TEXT,
        replyToId: dto.replyToId,
      },
      select: MESSAGE_SELECT,
    });

    // Update chat's updatedAt so it bubbles to top of chat list
    await this.prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    return this.formatMessage(message);
  }

  // ─── Get Messages (Cursor Pagination) ─────────────────────────────────────

  async getMessages(
    chatId: string,
    userId: string,
    pagination: CursorPaginationDto,
  ): Promise<{ data: MessageDto[]; meta: PaginationMeta }> {
    await this.chatService.assertMembership(chatId, userId);

    const limit = pagination.limit ?? 20;

    // Cursor-based: fetch messages before the cursor message
    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        deletedAt: null,
        ...(pagination.cursor && {
          createdAt: { lt: (await this.prisma.message.findUnique({ where: { id: pagination.cursor } }))?.createdAt },
        }),
      },
      select: MESSAGE_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to determine hasNextPage
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    const total = await this.prisma.message.count({
      where: { chatId, deletedAt: null },
    });

    return {
      data: messages.reverse().map(this.formatMessage),
      meta: {
        total,
        page: 1, // Cursor pagination doesn't have page numbers
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: hasMore,
        hasPreviousPage: !!pagination.cursor,
      },
    };
  }

  // ─── Edit Message ──────────────────────────────────────────────────────────

  async editMessage(
    messageId: string,
    userId: string,
    dto: EditMessageDto,
  ): Promise<MessageDto> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null },
    });

    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) {
      throw new ForbiddenException('Cannot edit another user\'s message');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: dto.content, editedAt: new Date() },
      select: MESSAGE_SELECT,
    });

    return this.formatMessage(updated);
  }

  // ─── Delete Message ────────────────────────────────────────────────────────

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null },
      include: {
        chat: {
          include: {
            members: {
              where: { userId, role: { in: ['ADMIN', 'OWNER'] } },
            },
          },
        },
      },
    });

    if (!message) throw new NotFoundException('Message not found');

    const isOwner = message.senderId === userId;
    const isAdmin = message.chat.members.length > 0;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Cannot delete another user\'s message');
    }

    // Soft delete preserves read receipts and reaction history
    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: null },
    });
  }

  // ─── Mark as Read ──────────────────────────────────────────────────────────

  async markAsRead(
    chatId: string,
    userId: string,
    messageIds: string[],
  ): Promise<void> {
    // Upsert read receipts
    await this.prisma.$transaction([
      this.prisma.messageRead.createMany({
        data: messageIds.map((messageId) => ({ messageId, userId })),
        skipDuplicates: true,
      }),
      // Update the member's lastReadAt watermark
      this.prisma.chatMember.updateMany({
        where: { chatId, userId },
        data: { lastReadAt: new Date() },
      }),
    ]);
  }

  // ─── Reactions ─────────────────────────────────────────────────────────────

  async addReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<void> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null },
    });
    if (!message) throw new NotFoundException('Message not found');

    // Verify user is in the chat
    await this.chatService.assertMembership(message.chatId, userId);

    await this.prisma.reaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      create: { messageId, userId, emoji },
      update: {}, // Already exists = no-op
    });
  }

  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<void> {
    await this.prisma.reaction.deleteMany({
      where: { messageId, userId, emoji },
    });
  }

  // ─── Format Helper ─────────────────────────────────────────────────────────

  private formatMessage = (msg: any): MessageDto => ({
    id: msg.id,
    chatId: msg.chatId,
    content: msg.content,
    type: msg.type,
    mediaUrl: msg.mediaUrl,
    editedAt: msg.editedAt,
    isPinned: msg.isPinned,
    replyToId: msg.replyToId,
    sender: msg.sender,
    reactions: msg.reactions.map((r: any) => ({
      emoji: r.emoji,
      userId: r.userId,
      username: r.user.username,
    })),
    reads: msg.reads,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
  });
}
