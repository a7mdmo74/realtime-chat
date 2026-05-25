/**
 * src/modules/chat/gateways/chat.gateway.ts
 *
 * THE HEART OF THE REAL-TIME SYSTEM.
 *
 * ARCHITECTURE OVERVIEW:
 *
 *   Client ──WebSocket──► ChatGateway ──► MessagesService (DB write)
 *                              │
 *                              ▼
 *                         Redis Pub/Sub  ◄──── Other server instances
 *                              │
 *                              ▼
 *                    Socket.IO Rooms (broadcast to chat members)
 *
 * WHY REDIS PUB/SUB FOR WEBSOCKETS:
 * Without Redis, WebSocket events only reach clients connected to the
 * SAME server instance. With Redis pub/sub, ANY instance can publish
 * and ALL instances subscribed to that channel will forward to their
 * connected clients. This enables horizontal scaling.
 *
 * ROOM STRATEGY:
 * Each chat has a Socket.IO room named `chat:{chatId}`.
 * When a user joins, they `socket.join('chat:{chatId}')`.
 * Broadcasting to a room sends to all sockets in that room.
 *
 * USER PRESENCE ROOM:
 * Each user also joins `user:{userId}` so we can send targeted
 * notifications to a specific user across all their devices.
 *
 * TYPING INDICATORS:
 * Stored in Redis with a TTL. If the "stop typing" event never fires
 * (e.g., client crashed), the indicator auto-expires after 5 seconds.
 *
 * EVENT FLOW FOR A MESSAGE:
 *   1. Client emits `message:send` with { chatId, content }
 *   2. Gateway validates auth, membership
 *   3. MessagesService writes to DB
 *   4. Gateway emits `message:new` to the chat room (all members)
 *   5. Gateway publishes to Redis channel (for other server nodes)
 */

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import {
  Logger,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MessagesService } from '../../messages/messages.service';
import { ChatService } from '../chat.service';
import { RedisService } from '../../../redis/redis.service';
import { UsersService } from '../../users/users.service';
import { WsJwtGuard } from './ws-jwt.guard';
import { WsExceptionsFilter } from '../../../common/filters/ws-exceptions.filter';
import { SocketData } from '../../../common/interfaces';
import { WS_EVENTS, REDIS_CHANNELS, TIMEOUTS } from '../../../common/constants';
import { SendMessageDto } from '../../messages/dto/message.dto';
import { PresenceStatus } from '@prisma/client';

/**
 * Gateway configuration:
 * - namespace: '/chat' isolates chat events from future namespaces (e.g., '/notifications')
 * - cors: must match your frontend origins
 * - transports: prefer websocket; polling as fallback
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
@UseFilters(WsExceptionsFilter)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private messagesService: MessagesService,
    private chatService: ChatService,
    private redisService: RedisService,
    private usersService: UsersService,
  ) {}

  // ─── Lifecycle Hooks ───────────────────────────────────────────────────────

  async afterInit(server: Server): Promise<void> {
    this.logger.log('ChatGateway initialized', ChatGateway.name);
    await this.setupRedisSubscriptions();
  }

  /**
   * Called when a new socket connects (before any events).
   * We authenticate here so unauthenticated sockets are immediately rejected.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const rawToken =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization;

      if (!rawToken) throw new Error('No token');

      const token = rawToken.replace(/^Bearer\s+/i, '');
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      // Store user context on the socket
      client.data = {
        userId: payload.sub,
        username: payload.username,
        role: payload.role,
      } as SocketData;

      // Join personal room for targeted notifications
      await client.join(`user:${payload.sub}`);

      // Mark user as online in Redis
      await this.redisService.setUserOnline(payload.sub, TIMEOUTS.PRESENCE_TTL);

      // Update DB presence
      await this.usersService.updatePresence(payload.sub, PresenceStatus.ONLINE);

      // Publish presence event to all nodes
      await this.redisService.publish(REDIS_CHANNELS.USER_PRESENCE, {
        userId: payload.sub,
        status: PresenceStatus.ONLINE,
      });

      this.logger.log(
        `Client connected: ${client.id} (user: ${payload.sub})`,
        ChatGateway.name,
      );
    } catch (error) {
      this.logger.warn(
        `Connection rejected for socket ${client.id}: ${(error as Error).message}`,
        ChatGateway.name,
      );
      client.emit(WS_EVENTS.ERROR, { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const { userId } = client.data as SocketData;
    if (!userId) return;

    // Check if user has other active connections before marking offline
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    const otherConnections = sockets.filter((s) => s.id !== client.id);

    if (otherConnections.length === 0) {
      // Last connection — mark truly offline
      await this.redisService.setUserOffline(userId);
      await this.usersService.updatePresence(userId, PresenceStatus.OFFLINE);

      await this.redisService.publish(REDIS_CHANNELS.USER_PRESENCE, {
        userId,
        status: PresenceStatus.OFFLINE,
      });
    }

    this.logger.log(
      `Client disconnected: ${client.id} (user: ${userId})`,
      ChatGateway.name,
    );
  }

  // ─── Chat Room Management ──────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.JOIN_CHAT)
  async handleJoinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string },
  ): Promise<void> {
    const { userId } = client.data as SocketData;

    await this.chatService.assertMembership(data.chatId, userId);
    await client.join(`chat:${data.chatId}`);

    this.logger.debug(
      `User ${userId} joined room chat:${data.chatId}`,
      ChatGateway.name,
    );
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.LEAVE_CHAT)
  async handleLeaveChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string },
  ): Promise<void> {
    await client.leave(`chat:${data.chatId}`);
  }

  // ─── Messaging ─────────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string } & SendMessageDto,
  ): Promise<void> {
    const { userId } = client.data as SocketData;
    const { chatId, ...messageDto } = data;

    const message = await this.messagesService.sendMessage(chatId, userId, messageDto);

    // Broadcast to all members in the chat room (including sender for confirmation)
    this.server.to(`chat:${chatId}`).emit(WS_EVENTS.NEW_MESSAGE, message);

    // Publish to Redis so other server instances also broadcast
    await this.redisService.publish(REDIS_CHANNELS.CHAT_MESSAGE(chatId), message);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.EDIT_MESSAGE)
  async handleEditMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string; messageId: string; content: string },
  ): Promise<void> {
    const { userId } = client.data as SocketData;

    const updated = await this.messagesService.editMessage(data.messageId, userId, {
      content: data.content,
    });

    this.server.to(`chat:${data.chatId}`).emit(WS_EVENTS.MESSAGE_UPDATED, updated);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.DELETE_MESSAGE)
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string; messageId: string },
  ): Promise<void> {
    const { userId } = client.data as SocketData;

    await this.messagesService.deleteMessage(data.messageId, userId);

    this.server.to(`chat:${data.chatId}`).emit(WS_EVENTS.MESSAGE_DELETED, {
      messageId: data.messageId,
      chatId: data.chatId,
    });
  }

  // ─── Typing Indicators ─────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.TYPING_START)
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string },
  ): Promise<void> {
    const { userId, username } = client.data as SocketData;

    // Store typing state in Redis with TTL (auto-expires if no stop event)
    await this.redisService.hset(
      `typing:${data.chatId}`,
      userId,
      username,
    );
    await this.redisService.expire(
      `typing:${data.chatId}`,
      TIMEOUTS.TYPING_INDICATOR_TTL,
    );

    // Broadcast to others in the chat (not back to sender)
    client.to(`chat:${data.chatId}`).emit(WS_EVENTS.USER_TYPING, {
      userId,
      username,
      chatId: data.chatId,
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.TYPING_STOP)
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string },
  ): Promise<void> {
    const { userId, username } = client.data as SocketData;

    await this.redisService.hdel(`typing:${data.chatId}`, userId);

    client.to(`chat:${data.chatId}`).emit(WS_EVENTS.USER_STOP_TYPING, {
      userId,
      username,
      chatId: data.chatId,
    });
  }

  // ─── Read Receipts ─────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.READ_MESSAGES)
  async handleReadMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string; messageIds: string[] },
  ): Promise<void> {
    const { userId } = client.data as SocketData;

    await this.messagesService.markAsRead(data.chatId, userId, data.messageIds);

    // Notify other chat members their messages were read
    client.to(`chat:${data.chatId}`).emit(WS_EVENTS.MESSAGE_READ, {
      userId,
      messageIds: data.messageIds,
      chatId: data.chatId,
      readAt: new Date().toISOString(),
    });
  }

  // ─── Reactions ─────────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.ADD_REACTION)
  async handleAddReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string; messageId: string; emoji: string },
  ): Promise<void> {
    const { userId, username } = client.data as SocketData;

    await this.messagesService.addReaction(data.messageId, userId, data.emoji);

    this.server.to(`chat:${data.chatId}`).emit(WS_EVENTS.REACTION_ADDED, {
      messageId: data.messageId,
      chatId: data.chatId,
      emoji: data.emoji,
      userId,
      username,
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.REMOVE_REACTION)
  async handleRemoveReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: string; messageId: string; emoji: string },
  ): Promise<void> {
    const { userId } = client.data as SocketData;

    await this.messagesService.removeReaction(data.messageId, userId, data.emoji);

    this.server.to(`chat:${data.chatId}`).emit(WS_EVENTS.REACTION_REMOVED, {
      messageId: data.messageId,
      chatId: data.chatId,
      emoji: data.emoji,
      userId,
    });
  }

  // ─── Presence Heartbeat ────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage(WS_EVENTS.HEARTBEAT)
  async handleHeartbeat(@ConnectedSocket() client: Socket): Promise<void> {
    const { userId } = client.data as SocketData;
    // Refresh the presence TTL — keeps user marked online
    await this.redisService.setUserOnline(userId, TIMEOUTS.PRESENCE_TTL);
  }

  // ─── Redis Pub/Sub Subscriptions ───────────────────────────────────────────

  /**
   * Subscribe to Redis channels so this server instance forwards messages
   * published by OTHER server instances.
   *
   * This is the core of horizontal WebSocket scaling:
   *   Instance A publishes → Redis → Instance B receives → emits to its clients
   */
  private async setupRedisSubscriptions(): Promise<void> {
    // Wait for Redis subscriber to be ready
    await this.redisService.ensureSubscriberReady();

    // Presence changes from other nodes
    await this.redisService.subscribe(
      REDIS_CHANNELS.USER_PRESENCE,
      (message: string) => {
        const { userId, status } = JSON.parse(message) as {
          userId: string;
          status: PresenceStatus;
        };

        const event =
          status === PresenceStatus.ONLINE
            ? WS_EVENTS.USER_ONLINE
            : WS_EVENTS.USER_OFFLINE;

        // Broadcast to all connected clients (presence is global)
        this.server.emit(event, { userId, status });
      },
    );

    // Chat messages from other nodes — use pattern subscription
    await this.redisService.psubscribe(
      'chat.message:*',
      (channel: string, message: string) => {
        const chatId = channel.replace('chat.message:', '');
        const msg = JSON.parse(message);

        // Emit to the Socket.IO room — only clients on THIS node see it
        // Other nodes do the same for THEIR clients
        this.server.to(`chat:${chatId}`).emit(WS_EVENTS.NEW_MESSAGE, msg);
      },
    );

    this.logger.log('Redis pub/sub subscriptions established', ChatGateway.name);
  }
}
