/**
 * docs/websocket-client-guide.ts
 *
 * FRONTEND WEBSOCKET INTEGRATION GUIDE
 * =====================================
 * This file documents how to connect to and interact with the
 * Chat WebSocket server from a frontend application.
 *
 * Install: npm install socket.io-client
 */

import { io, Socket } from 'socket.io-client';

// ─── WS Events (mirror src/common/constants/index.ts) ─────────────────────────
const WS_EVENTS = {
  JOIN_CHAT: 'chat:join',
  LEAVE_CHAT: 'chat:leave',
  SEND_MESSAGE: 'message:send',
  EDIT_MESSAGE: 'message:edit',
  DELETE_MESSAGE: 'message:delete',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  READ_MESSAGES: 'message:read',
  ADD_REACTION: 'reaction:add',
  REMOVE_REACTION: 'reaction:remove',
  HEARTBEAT: 'presence:heartbeat',

  NEW_MESSAGE: 'message:new',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  USER_TYPING: 'typing:user',
  USER_STOP_TYPING: 'typing:user:stop',
  USER_ONLINE: 'presence:online',
  USER_OFFLINE: 'presence:offline',
  MESSAGE_READ: 'message:read:ack',
  REACTION_ADDED: 'reaction:added',
  REACTION_REMOVED: 'reaction:removed',
  ERROR: 'error',
};

// ─── 1. CONNECT ────────────────────────────────────────────────────────────────

class ChatClient {
  private socket: Socket;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(serverUrl: string, accessToken: string) {
    this.socket = io(`${serverUrl}/chat`, {
      // JWT token sent in handshake auth — validated on connect
      auth: {
        token: `Bearer ${accessToken}`,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupConnectionHandlers();
    this.setupPresenceHandlers();
    this.startHeartbeat();
  }

  // ─── Connection ─────────────────────────────────────────────────────────────

  private setupConnectionHandlers(): void {
    this.socket.on('connect', () => {
      console.log('Connected to chat server:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      this.stopHeartbeat();
    });

    this.socket.on(WS_EVENTS.ERROR, (error) => {
      console.error('WebSocket error:', error);
      if (error.message === 'Authentication failed') {
        // Token expired — refresh and reconnect
        this.handleAuthError();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error.message);
    });
  }

  // ─── 2. JOIN A CHAT ROOM ───────────────────────────────────────────────────

  joinChat(chatId: string): void {
    this.socket.emit(WS_EVENTS.JOIN_CHAT, { chatId });
  }

  leaveChat(chatId: string): void {
    this.socket.emit(WS_EVENTS.LEAVE_CHAT, { chatId });
  }

  // ─── 3. SEND MESSAGES ─────────────────────────────────────────────────────

  sendMessage(chatId: string, content: string, replyToId?: string): void {
    this.socket.emit(WS_EVENTS.SEND_MESSAGE, {
      chatId,
      content,
      type: 'TEXT',
      ...(replyToId && { replyToId }),
    });
  }

  editMessage(chatId: string, messageId: string, content: string): void {
    this.socket.emit(WS_EVENTS.EDIT_MESSAGE, { chatId, messageId, content });
  }

  deleteMessage(chatId: string, messageId: string): void {
    this.socket.emit(WS_EVENTS.DELETE_MESSAGE, { chatId, messageId });
  }

  // ─── 4. LISTEN FOR NEW MESSAGES ───────────────────────────────────────────

  onNewMessage(handler: (message: any) => void): void {
    this.socket.on(WS_EVENTS.NEW_MESSAGE, handler);
  }

  onMessageUpdated(handler: (message: any) => void): void {
    this.socket.on(WS_EVENTS.MESSAGE_UPDATED, handler);
  }

  onMessageDeleted(handler: (data: { messageId: string; chatId: string }) => void): void {
    this.socket.on(WS_EVENTS.MESSAGE_DELETED, handler);
  }

  // ─── 5. TYPING INDICATORS ─────────────────────────────────────────────────

  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  startTyping(chatId: string): void {
    this.socket.emit(WS_EVENTS.TYPING_START, { chatId });

    // Auto-stop after 5 seconds (in case stop event is never sent)
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(chatId), 5000);
  }

  stopTyping(chatId: string): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
    this.socket.emit(WS_EVENTS.TYPING_STOP, { chatId });
  }

  onUserTyping(handler: (data: { userId: string; username: string; chatId: string }) => void): void {
    this.socket.on(WS_EVENTS.USER_TYPING, handler);
  }

  onUserStopTyping(handler: (data: { userId: string; username: string; chatId: string }) => void): void {
    this.socket.on(WS_EVENTS.USER_STOP_TYPING, handler);
  }

  // ─── 6. READ RECEIPTS ─────────────────────────────────────────────────────

  markAsRead(chatId: string, messageIds: string[]): void {
    this.socket.emit(WS_EVENTS.READ_MESSAGES, { chatId, messageIds });
  }

  onMessageRead(handler: (data: { userId: string; messageIds: string[]; readAt: string }) => void): void {
    this.socket.on(WS_EVENTS.MESSAGE_READ, handler);
  }

  // ─── 7. REACTIONS ─────────────────────────────────────────────────────────

  addReaction(chatId: string, messageId: string, emoji: string): void {
    this.socket.emit(WS_EVENTS.ADD_REACTION, { chatId, messageId, emoji });
  }

  removeReaction(chatId: string, messageId: string, emoji: string): void {
    this.socket.emit(WS_EVENTS.REMOVE_REACTION, { chatId, messageId, emoji });
  }

  // ─── 8. PRESENCE ──────────────────────────────────────────────────────────

  private setupPresenceHandlers(): void {
    this.socket.on(WS_EVENTS.USER_ONLINE, (data: { userId: string }) => {
      console.log(`User ${data.userId} came online`);
    });

    this.socket.on(WS_EVENTS.USER_OFFLINE, (data: { userId: string }) => {
      console.log(`User ${data.userId} went offline`);
    });
  }

  // ─── 9. HEARTBEAT ─────────────────────────────────────────────────────────
  // Keep presence alive — server expires presence after 30s without heartbeat

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket.connected) {
        this.socket.emit(WS_EVENTS.HEARTBEAT);
      }
    }, 20000); // Every 20 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ─── 10. TOKEN REFRESH ────────────────────────────────────────────────────

  private async handleAuthError(): Promise<void> {
    // Get new access token from your auth service
    // const newToken = await authService.refresh(refreshToken);
    // this.socket.auth = { token: `Bearer ${newToken}` };
    // this.socket.connect(); // Reconnect with new token
    console.warn('Token expired — implement token refresh and reconnect');
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.socket.disconnect();
  }
}

// ─── EXAMPLE REACT USAGE ──────────────────────────────────────────────────────

/*
import { useEffect, useRef, useState } from 'react';

function ChatRoom({ chatId, accessToken }) {
  const clientRef = useRef<ChatClient | null>(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  useEffect(() => {
    const client = new ChatClient('http://localhost:3000', accessToken);
    clientRef.current = client;

    client.joinChat(chatId);

    client.onNewMessage((message) => {
      setMessages(prev => [...prev, message]);
      // Auto-read messages you receive
      client.markAsRead(chatId, [message.id]);
    });

    client.onUserTyping(({ username }) => {
      setTypingUsers(prev => [...new Set([...prev, username])]);
    });

    client.onUserStopTyping(({ username }) => {
      setTypingUsers(prev => prev.filter(u => u !== username));
    });

    return () => {
      client.leaveChat(chatId);
      client.disconnect();
    };
  }, [chatId, accessToken]);

  const handleSend = (content: string) => {
    clientRef.current?.stopTyping(chatId);
    clientRef.current?.sendMessage(chatId, content);
  };

  const handleInput = () => {
    clientRef.current?.startTyping(chatId);
  };

  return (
    <div>
      {messages.map(msg => <div key={msg.id}>{msg.content}</div>)}
      {typingUsers.length > 0 && <p>{typingUsers.join(', ')} typing...</p>}
      <input onChange={handleInput} />
      <button onClick={() => handleSend(inputValue)}>Send</button>
    </div>
  );
}
*/

export { ChatClient };
