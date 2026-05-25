/**
 * src/modules/chat/chat.service.ts
 *
 * RESPONSIBILITIES:
 *   - Create private (DM) and group chats
 *   - Manage members (add/remove/promote)
 *   - List chats for a user with unread counts
 *   - Chat metadata retrieval
 *
 * DESIGN DECISIONS:
 *   - Private chats are identified by their member pair, not name
 *   - Deduplication: creating a DM between users A→B returns existing chat
 *   - Unread count is computed from ChatMember.lastReadAt vs latest message
 *   - All queries filter deletedAt: null (soft delete pattern)
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatType, MemberRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePrivateChatDto, CreateGroupChatDto, ChatSummaryDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // ─── Create Private DM ─────────────────────────────────────────────────────

  async createPrivateChat(
    userId: string,
    dto: CreatePrivateChatDto,
  ): Promise<ChatSummaryDto> {
    if (userId === dto.recipientId) {
      throw new BadRequestException('Cannot create a chat with yourself');
    }

    // Idempotency: return existing DM if it already exists
    const existing = await this.findPrivateChat(userId, dto.recipientId);
    if (existing) return this.formatChatSummary(existing, userId);

    // Verify recipient exists
    const recipient = await this.prisma.user.findFirst({
      where: { id: dto.recipientId, deletedAt: null, isActive: true },
    });
    if (!recipient) throw new NotFoundException('Recipient user not found');

    const chat = await this.prisma.chat.create({
      data: {
        type: ChatType.PRIVATE,
        members: {
          create: [
            { userId, role: MemberRole.OWNER },
            { userId: dto.recipientId, role: MemberRole.MEMBER },
          ],
        },
      },
      include: this.chatInclude(),
    });

    return this.formatChatSummary(chat, userId);
  }

  // ─── Create Group Chat ─────────────────────────────────────────────────────

  async createGroupChat(
    userId: string,
    dto: CreateGroupChatDto,
  ): Promise<ChatSummaryDto> {
    // Deduplicate member list and ensure creator is included
    const uniqueMemberIds = [...new Set([...dto.memberIds])].filter(
      (id) => id !== userId,
    );

    const chat = await this.prisma.chat.create({
      data: {
        name: dto.name,
        description: dto.description,
        type: ChatType.GROUP,
        members: {
          create: [
            { userId, role: MemberRole.OWNER },
            ...uniqueMemberIds.map((memberId) => ({
              userId: memberId,
              role: MemberRole.MEMBER,
            })),
          ],
        },
      },
      include: this.chatInclude(),
    });

    return this.formatChatSummary(chat, userId);
  }

  // ─── List User's Chats ─────────────────────────────────────────────────────

  async getUserChats(userId: string): Promise<ChatSummaryDto[]> {
    const chats = await this.prisma.chat.findMany({
      where: {
        deletedAt: null,
        members: {
          some: { userId, leftAt: null },
        },
      },
      include: this.chatInclude(),
      orderBy: { updatedAt: 'desc' },
    });

    return Promise.all(chats.map((chat) => this.formatChatSummary(chat, userId)));
  }

  // ─── Get Single Chat ───────────────────────────────────────────────────────

  async getChatById(chatId: string, userId: string): Promise<ChatSummaryDto> {
    await this.assertMembership(chatId, userId);

    const chat = await this.prisma.chat.findFirst({
      where: { id: chatId, deletedAt: null },
      include: this.chatInclude(),
    });

    if (!chat) throw new NotFoundException('Chat not found');

    return this.formatChatSummary(chat, userId);
  }

  // ─── Member Management ─────────────────────────────────────────────────────

  async addMembers(
    chatId: string,
    requesterId: string,
    memberIds: string[],
  ): Promise<void> {
    await this.assertAdminOrOwner(chatId, requesterId);

    const chat = await this.prisma.chat.findFirst({
      where: { id: chatId, type: ChatType.GROUP },
    });

    if (!chat) throw new NotFoundException('Group chat not found');

    await this.prisma.chatMember.createMany({
      data: memberIds.map((userId) => ({
        chatId,
        userId,
        role: MemberRole.MEMBER,
      })),
      skipDuplicates: true,
    });
  }

  async removeMember(
    chatId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<void> {
    // Users can remove themselves (leave). Admins can remove others.
    if (requesterId !== targetUserId) {
      await this.assertAdminOrOwner(chatId, requesterId);
    }

    await this.prisma.chatMember.updateMany({
      where: { chatId, userId: targetUserId },
      data: { leftAt: new Date() },
    });
  }

  // ─── Guards/Assertions ─────────────────────────────────────────────────────

  async assertMembership(chatId: string, userId: string): Promise<void> {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId, leftAt: null },
    });
    if (!member) throw new ForbiddenException('You are not a member of this chat');
  }

  async assertAdminOrOwner(chatId: string, userId: string): Promise<void> {
    const member = await this.prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
        leftAt: null,
        role: { in: [MemberRole.ADMIN, MemberRole.OWNER] },
      },
    });
    if (!member)
      throw new ForbiddenException('Only admins and owners can perform this action');
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async findPrivateChat(userIdA: string, userIdB: string) {
    return this.prisma.chat.findFirst({
      where: {
        type: ChatType.PRIVATE,
        deletedAt: null,
        AND: [
          { members: { some: { userId: userIdA, leftAt: null } } },
          { members: { some: { userId: userIdB, leftAt: null } } },
        ],
      },
      include: this.chatInclude(),
    });
  }

  private chatInclude() {
    return {
      members: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              presenceStatus: true,
            },
          },
        },
      },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        include: {
          sender: { select: { username: true } },
        },
      },
    };
  }

  private async formatChatSummary(chat: any, userId: string): Promise<ChatSummaryDto> {
    const member = chat.members.find((m: any) => m.userId === userId);
    const lastMessage = chat.messages[0] ?? null;

    // Count unread: messages after lastReadAt
    let unreadCount = 0;
    if (member?.lastReadAt) {
      unreadCount = await this.prisma.message.count({
        where: {
          chatId: chat.id,
          deletedAt: null,
          senderId: { not: userId }, // Don't count own messages
          createdAt: { gt: member.lastReadAt },
        },
      });
    } else if (member) {
      // Never read — count all messages not from self
      unreadCount = await this.prisma.message.count({
        where: {
          chatId: chat.id,
          deletedAt: null,
          senderId: { not: userId },
          createdAt: { gt: member.joinedAt },
        },
      });
    }

    return {
      id: chat.id,
      name: chat.name,
      type: chat.type,
      avatarUrl: chat.avatarUrl,
      memberCount: chat.members.length,
      unreadCount,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            senderUsername: lastMessage.sender.username,
            createdAt: lastMessage.createdAt,
          }
        : null,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }
}
