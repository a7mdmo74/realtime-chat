/**
 * src/common/constants/index.ts
 *
 * WHY CONSTANTS:
 * Magic strings are bugs waiting to happen. Centralized constants ensure:
 *   1. Typos are caught at compile time (string literals aren't)
 *   2. Renaming is a one-place change
 *   3. Self-documenting code
 */

// ─── Redis Key Prefixes ───────────────────────────────────────────────────────
export const REDIS_KEYS = {
  USER_PRESENCE: (userId: string) => `presence:${userId}`,
  REFRESH_TOKEN: (tokenId: string) => `refresh_token:${tokenId}`,
  RATE_LIMIT: (identifier: string) => `rate_limit:${identifier}`,
  CHAT_UNREAD: (chatId: string, userId: string) => `unread:${chatId}:${userId}`,
  TYPING_INDICATOR: (chatId: string) => `typing:${chatId}`,
  USER_CACHE: (userId: string) => `user:${userId}`,
} as const;

// ─── Redis Pub/Sub Channels ───────────────────────────────────────────────────
export const REDIS_CHANNELS = {
  USER_PRESENCE: 'user.presence',
  CHAT_MESSAGE: (chatId: string) => `chat.message:${chatId}`,
  CHAT_TYPING: (chatId: string) => `chat.typing:${chatId}`,
  NOTIFICATION: (userId: string) => `notification:${userId}`,
} as const;

// ─── WebSocket Events ─────────────────────────────────────────────────────────
export const WS_EVENTS = {
  // Client → Server
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

  // Server → Client
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
} as const;

// ─── DI Tokens ────────────────────────────────────────────────────────────────
export const INJECTION_TOKENS = {
  CONFIG: 'CONFIG',
} as const;

// ─── Timeouts (ms) ───────────────────────────────────────────────────────────
export const TIMEOUTS = {
  TYPING_INDICATOR_TTL: 5, // seconds — cleared if no "stop" event
  PRESENCE_HEARTBEAT: 20,  // seconds — client sends heartbeat this often
  PRESENCE_TTL: 30,        // seconds — Redis TTL for presence keys
} as const;

// ─── Pagination Defaults ──────────────────────────────────────────────────────
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// ─── Cache TTLs (seconds) ─────────────────────────────────────────────────────
export const CACHE_TTL = {
  USER_PROFILE: 300,    // 5 minutes
  CHAT_METADATA: 60,    // 1 minute
} as const;
