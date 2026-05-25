# 🚀 Realtime Chat API — Production-Grade NestJS

> Built as a senior backend engineer would build it: clean architecture, event-driven, horizontally scalable.

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│              Browser / Mobile (HTTP + WebSocket)                │
└──────────────────┬──────────────────────┬───────────────────────┘
                   │ HTTP (REST)           │ WebSocket (Socket.IO)
┌──────────────────▼──────────────────────▼───────────────────────┐
│                     NestJS API (Node.js)                        │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Auth Module │  │  Chat Module  │  │   Messages Module     │  │
│  │  - Register  │  │  - Rooms     │  │   - Send/Edit/Delete  │  │
│  │  - Login     │  │  - Members   │  │   - Pagination        │  │
│  │  - JWT Rot.  │  │  - Gateway   │  │   - Reactions         │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Common/Shared Infrastructure                  │  │
│  │  Guards │ Filters │ Interceptors │ Decorators │ DTOs       │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────┬─────────────────────────────┬────────────────────┘
               │                             │
┌──────────────▼──────────┐    ┌─────────────▼──────────────────┐
│      PostgreSQL          │    │            Redis                │
│  - Users                 │    │  - Presence TTL keys           │
│  - Chats/Members         │    │  - Pub/Sub (WS scaling)        │
│  - Messages              │    │  - Token blacklist             │
│  - Reactions             │    │  - Typing indicators           │
│  - ReadReceipts          │    │  - User profile cache          │
│  - RefreshTokens         │    │                                │
└──────────────────────────┘    └────────────────────────────────┘
```

---

## 📁 Folder Structure — Every Folder Explained

```
server/
│
├── src/
│   │
│   ├── main.ts                    # Bootstrap: Helmet, CORS, Swagger, ValidationPipe
│   ├── app.module.ts              # Root module: global guards, interceptors, filters
│   │
│   ├── config/                    # Configuration layer
│   │   ├── app.config.ts          # Typed config factories (registerAs)
│   │   └── env.validation.ts      # Joi schema — app refuses to start with bad env
│   │
│   ├── logger/                    # Pino structured logger (replaces NestJS default)
│   │   ├── logger.service.ts      # Pino wrapper with child logger support
│   │   └── logger.module.ts       # @Global() — available everywhere
│   │
│   ├── database/                  # Data access layer
│   │   ├── prisma.service.ts      # PrismaClient + lifecycle hooks + slow query log
│   │   └── database.module.ts     # @Global() — PrismaService available everywhere
│   │
│   ├── redis/                     # Cache + pub/sub layer
│   │   ├── redis.service.ts       # IORedis: get/set/pub/sub/presence helpers
│   │   └── redis.module.ts        # @Global()
│   │
│   ├── common/                    # Shared utilities (NOT feature-specific)
│   │   ├── constants/             # Magic strings → typed constants (WS_EVENTS, REDIS_KEYS)
│   │   ├── interfaces/            # Shared TypeScript interfaces (JwtPayload, ApiResponse)
│   │   ├── dto/                   # Reusable DTOs (PaginationDto)
│   │   ├── decorators/
│   │   │   ├── current-user.ts    # @CurrentUser() — extracts authenticated user
│   │   │   └── roles.decorator.ts # @Roles(Role.ADMIN) — attaches metadata
│   │   ├── guards/
│   │   │   └── roles.guard.ts     # Reads @Roles() metadata, enforces RBAC
│   │   ├── filters/
│   │   │   ├── all-exceptions.filter.ts   # Maps ALL errors to consistent shape
│   │   │   └── ws-exceptions.filter.ts    # WS-specific error emitter
│   │   ├── interceptors/
│   │   │   ├── response.interceptor.ts    # Wraps responses in { success, data, meta }
│   │   │   └── logging.interceptor.ts     # Logs every request with timing
│   │   └── health/
│   │       └── health.controller.ts       # /health (liveness) and /ready (readiness)
│   │
│   └── modules/                   # Feature modules (vertical slices)
│       │
│       ├── auth/                  # Authentication & authorization
│       │   ├── dto/               # RegisterDto, LoginDto, TokenResponseDto
│       │   ├── guards/            # JwtAuthGuard + @Public() decorator
│       │   ├── strategies/        # Passport: jwt-access, jwt-refresh
│       │   ├── auth.service.ts    # Register, login, token rotation, logout
│       │   ├── auth.controller.ts # POST /auth/register|login|refresh|logout
│       │   └── auth.module.ts
│       │
│       ├── users/                 # User management
│       │   ├── dto/               # UpdateProfileDto, UserProfileDto
│       │   ├── users.service.ts   # Profile CRUD + Redis cache + presence
│       │   ├── users.controller.ts
│       │   └── users.module.ts
│       │
│       ├── chat/                  # Chat rooms + real-time gateway
│       │   ├── dto/               # CreatePrivateChatDto, CreateGroupChatDto
│       │   ├── gateways/
│       │   │   ├── chat.gateway.ts    # Socket.IO gateway: all WS events
│       │   │   └── ws-jwt.guard.ts    # WS auth guard
│       │   ├── chat.service.ts    # Room creation, membership, unread counts
│       │   ├── chat.controller.ts # REST CRUD for chats
│       │   └── chat.module.ts
│       │
│       └── messages/              # Message operations
│           ├── dto/               # SendMessageDto, EditMessageDto, ReactionDto
│           ├── messages.service.ts # CRUD + cursor pagination + read receipts
│           ├── messages.controller.ts
│           └── messages.module.ts
│
├── prisma/
│   ├── schema.prisma              # Full DB schema: Users, Chats, Messages, etc.
│   └── seed.ts                    # Dev data seeder
│
├── test/
│   ├── unit/
│   │   └── auth.service.spec.ts   # Unit tests with typed mocks
│   ├── e2e/
│   │   └── auth.e2e-spec.ts       # Full HTTP stack integration tests
│   └── jest-e2e.json
│
├── docker/
│   └── postgres/init.sql          # DB extensions (uuid-ossp, pg_trgm)
│
├── docs/
│   └── websocket-client-guide.ts  # Frontend integration guide with examples
│
├── Dockerfile                     # Multi-stage production build
├── docker-compose.yml             # Full dev stack
├── docker-compose.prod.yml        # Production overrides
└── .env.example                   # All environment variables documented
```

---

## ⚡ Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm

### 1. Clone and Install

```bash
git clone <your-repo>
cd server
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your values
# MINIMUM required changes:
#   JWT_ACCESS_SECRET  → random string, min 32 chars
#   JWT_REFRESH_SECRET → different random string, min 32 chars
```

Generate secure secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Start Infrastructure (PostgreSQL + Redis)

```bash
# Start only DB and Redis (API runs locally for hot reload)
docker compose up -d postgres redis

# Verify they're healthy
docker compose ps
```

### 4. Database Setup

```bash
# Generate Prisma client from schema
npm run prisma:generate

# Run migrations (creates all tables)
npm run prisma:migrate

# Seed with development data
npm run prisma:seed
```

### 5. Start the API

```bash
# Development with hot reload
npm run start:dev

# API available at:
# REST:      http://localhost:3000/api/v1
# Swagger:   http://localhost:3000/api/docs
# WebSocket: ws://localhost:3000/chat
```

---

## 🐳 Full Docker Stack

```bash
# Start everything (API + Postgres + Redis)
docker compose up -d

# With admin tools (pgAdmin + Redis Commander)
docker compose --profile tools up -d
#   pgAdmin:          http://localhost:5050
#   Redis Commander:  http://localhost:8081

# View logs
docker compose logs -f api

# Shell into API container
docker compose exec api sh

# Rebuild after code changes
docker compose up -d --build api
```

---

## 🚀 Production Deployment

### Docker Production Build

```bash
# Build production image
docker build -t chat-api:latest .

# Run with production compose
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Run database migrations (ALWAYS before starting app in prod)
docker compose exec api npx prisma migrate deploy
```

### Environment Variables (Production Checklist)

```bash
# These MUST be set and MUST be different from dev values
JWT_ACCESS_SECRET=<64-char random hex>
JWT_REFRESH_SECRET=<different 64-char random hex>
DATABASE_URL=postgresql://user:password@host:5432/db?sslmode=require
REDIS_PASSWORD=<strong password>
CORS_ORIGIN=https://yourdomain.com
NODE_ENV=production
LOG_LEVEL=info
```

### Kubernetes Deployment Notes

```yaml
# The health endpoints map to K8s probes:
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 10
```

### Horizontal Scaling

The API is stateless — scale to any number of instances:

```bash
docker compose up -d --scale api=3
```

WebSocket scaling works via Redis pub/sub:

- User on Instance A sends a message
- Instance A publishes to Redis channel `chat.message:{chatId}`
- Instances B and C subscribe and forward to their connected clients
- All clients receive the message regardless of which server they're on

---

## 🔌 WebSocket Events Reference

### Connection

```javascript
const socket = io('http://localhost:3000/chat', {
  auth: { token: 'Bearer <access_token>' },
})
```

### Client → Server Events

| Event                | Payload                                  | Description            |
| -------------------- | ---------------------------------------- | ---------------------- |
| `chat:join`          | `{ chatId }`                             | Join a chat room       |
| `chat:leave`         | `{ chatId }`                             | Leave a chat room      |
| `message:send`       | `{ chatId, content, type?, replyToId? }` | Send message           |
| `message:edit`       | `{ chatId, messageId, content }`         | Edit message           |
| `message:delete`     | `{ chatId, messageId }`                  | Delete message         |
| `typing:start`       | `{ chatId }`                             | Start typing indicator |
| `typing:stop`        | `{ chatId }`                             | Stop typing indicator  |
| `message:read`       | `{ chatId, messageIds[] }`               | Mark messages read     |
| `reaction:add`       | `{ chatId, messageId, emoji }`           | Add reaction           |
| `reaction:remove`    | `{ chatId, messageId, emoji }`           | Remove reaction        |
| `presence:heartbeat` | `{}`                                     | Keep-alive (every 20s) |

### Server → Client Events

| Event              | Payload                                | Description         |
| ------------------ | -------------------------------------- | ------------------- |
| `message:new`      | `MessageDto`                           | New message in room |
| `message:updated`  | `MessageDto`                           | Message was edited  |
| `message:deleted`  | `{ messageId, chatId }`                | Message was deleted |
| `typing:user`      | `{ userId, username, chatId }`         | User is typing      |
| `typing:user:stop` | `{ userId, username, chatId }`         | User stopped typing |
| `presence:online`  | `{ userId, status }`                   | User came online    |
| `presence:offline` | `{ userId, status }`                   | User went offline   |
| `message:read:ack` | `{ userId, messageIds[], readAt }`     | Messages were read  |
| `reaction:added`   | `{ messageId, chatId, emoji, userId }` | Reaction added      |
| `reaction:removed` | `{ messageId, chatId, emoji, userId }` | Reaction removed    |
| `error`            | `{ message, errorCode? }`              | Error event         |

---

## 🔒 Security Architecture

### Authentication Flow

```
Register/Login
    │
    ▼
Access Token (15min, stateless JWT)
    +
Refresh Token (7 days, stored as bcrypt hash in DB)
    │
    ▼
Access token expires → POST /auth/refresh
    │
    ├── Valid: rotate tokens (revoke old, issue new pair)
    └── Stolen token reused after rotation:
        → Revoke ALL user tokens (security lockout)
        → User must log in again
```

### Security Measures

- **bcrypt cost factor 12** — thwarts GPU brute force
- **Refresh token hashing** — DB breach doesn't expose tokens
- **Token rotation** — each refresh use invalidates the old token
- **Same error message** for wrong email AND wrong password — prevents user enumeration
- **Helmet** — 11 security headers set on every response
- **CORS whitelist** — only allowed origins can make requests
- **Rate limiting** — 5 registrations/min, 10 logins/min per IP
- **ValidationPipe whitelist** — unknown properties stripped and rejected
- **Non-root Docker user** — container runs as `node` user
- **JWT expiration auto-checked** by passport-jwt
- **Soft deletes** — deleted users can't log in but their messages persist

---

## 🧪 Testing

```bash
# Unit tests
npm test

# Unit tests with coverage
npm run test:cov

# E2E tests (requires running DB and Redis)
npm run test:e2e

# Watch mode during development
npm run test:watch
```

### Testing Strategy

- **Unit**: Service methods in isolation with typed mocks
- **E2E**: Full HTTP stack against real test database
- **WebSocket**: Use `socket.io-client` to test gateway events

---

## 📊 API Reference

After starting the server, Swagger UI is at:
**http://localhost:3000/api/docs**

- OpenAPI JSON: **http://localhost:3000/api/docs/openapi.json**
- OpenAPI YAML: **http://localhost:3000/api/docs/openapi.yaml**
- Postman Collection: **http://localhost:3000/api/docs/postman-collection.json**
- Docs UI app (monorepo): **http://localhost:3001**

### Key Endpoints

| Method | Path                                           | Description              |
| ------ | ---------------------------------------------- | ------------------------ |
| POST   | `/api/v1/auth/register`                        | Register new user        |
| POST   | `/api/v1/auth/login`                           | Login                    |
| POST   | `/api/v1/auth/refresh`                         | Refresh tokens           |
| POST   | `/api/v1/auth/logout`                          | Logout                   |
| GET    | `/api/v1/users/me`                             | Current user profile     |
| PATCH  | `/api/v1/users/me`                             | Update profile           |
| GET    | `/api/v1/users/search?q=`                      | Search users             |
| POST   | `/api/v1/chats/private`                        | Start/get DM             |
| POST   | `/api/v1/chats/group`                          | Create group chat        |
| GET    | `/api/v1/chats`                                | List my chats            |
| GET    | `/api/v1/chats/:id`                            | Get chat details         |
| POST   | `/api/v1/chats/:id/messages`                   | Send message             |
| GET    | `/api/v1/chats/:id/messages`                   | Get messages (paginated) |
| PATCH  | `/api/v1/chats/:chatId/messages/:id`           | Edit message             |
| DELETE | `/api/v1/chats/:chatId/messages/:id`           | Delete message           |
| POST   | `/api/v1/chats/:chatId/messages/:id/reactions` | Add reaction             |
| GET    | `/health`                                      | Liveness probe           |
| GET    | `/ready`                                       | Readiness probe          |

---

## 🔧 Prisma Commands

```bash
# Generate Prisma Client after schema changes
npm run prisma:generate

# Create and run a new migration (development)
npm run prisma:migrate

# Deploy migrations in production (no prompt)
npm run prisma:migrate:prod

# Open Prisma Studio (DB GUI)
npm run prisma:studio

# Seed development data
npm run prisma:seed
```

---

## 🏗️ Senior-Level Patterns Used

| Pattern                | Location                        | Why                                     |
| ---------------------- | ------------------------------- | --------------------------------------- |
| **Fail Fast**          | `env.validation.ts`             | App refuses to start with bad config    |
| **Secure by Default**  | `app.module.ts`                 | JWT guard global, @Public() to opt out  |
| **Cache-Aside**        | `users.service.ts`              | Redis cache, invalidate on write        |
| **Token Rotation**     | `auth.service.ts`               | Stolen token detection                  |
| **Soft Deletes**       | Prisma schema                   | Data preservation, reversible           |
| **Cursor Pagination**  | `messages.service.ts`           | Stable under real-time inserts          |
| **Redis Pub/Sub**      | `chat.gateway.ts`               | Horizontal WS scaling                   |
| **Config Abstraction** | `app.config.ts`                 | Typed, testable, single source of truth |
| **Global Error Shape** | `all-exceptions.filter.ts`      | Consistent API contract                 |
| **Health Probes**      | `health.controller.ts`          | K8s liveness/readiness                  |
| **Graceful Shutdown**  | `main.ts` + `prisma.service.ts` | Zero-downtime deploys                   |
| **Non-root Container** | `Dockerfile`                    | Container security                      |
| **Multi-stage Build**  | `Dockerfile`                    | ~200MB production image                 |
