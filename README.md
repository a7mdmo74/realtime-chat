# Realtime Chat Platform Monorepo

A production-grade realtime chat platform built using modern fullstack architecture and enterprise-level engineering practices.

This monorepo contains:

- Realtime Chat Server built with NestJS
- Web application built with Next.js 16
- Mobile application built with React Native
- Shared UI package
- Shared TypeScript configurations
- Shared ESLint configurations
- Turborepo-powered build system
- Scalable monorepo architecture

---

# Tech Stack

## Server

- NestJS
- PostgreSQL
- Prisma ORM
- Redis
- Socket.IO
- JWT Authentication
- Swagger
- Docker

## Web

- Next.js 16
- React 19
- TypeScript
- TailwindCSS
- Shadcn UI
- TanStack Query
- Zustand
- Socket.IO Client

## Mobile

- React Native
- Expo
- TypeScript
- React Navigation
- TanStack Query
- Zustand
- Socket.IO Client
- NativeWind

## Tooling

- Turborepo
- TypeScript
- ESLint
- Prettier
- Husky
- Docker Compose

---

# Monorepo Structure

```bash id="mwx2ga"
.
├── apps
│   ├── server        # NestJS realtime backend server
│   ├── web           # Next.js web application
│   ├── mobile        # React Native mobile application
│   └── docs          # Documentation app
│
├── packages
│   ├── ui                  # Shared UI components
│   ├── eslint-config       # Shared ESLint configs
│   ├── typescript-config   # Shared TypeScript configs
│   ├── shared-types        # Shared types/interfaces
│   ├── api-client          # Shared API SDK/client
│   └── utils               # Shared utilities/helpers
│
├── docker
│   ├── postgres
│   └── redis
│
├── .github
│   └── workflows
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

# Applications

## apps/server

Production-ready realtime chat backend server built with NestJS.

### Features

- JWT Authentication
- Refresh Tokens
- WebSockets
- Redis Pub/Sub
- Private & Group Chats
- Read Receipts
- Typing Indicators
- Message Reactions
- Role-based Authorization
- Swagger Documentation
- Docker Support
- Prisma ORM

### Main Technologies

- NestJS
- Prisma
- PostgreSQL
- Redis
- Socket.IO

---

## apps/web

Modern realtime chat web application built with Next.js 16 App Router.

### Features

- Server Components
- Client Components
- Realtime Messaging
- Responsive Design
- Dark Mode
- Authentication
- Optimistic UI
- Infinite Scrolling
- Modern SaaS UI
- Socket.IO Integration

### Main Technologies

- Next.js 16
- React 19
- TailwindCSS
- Zustand
- TanStack Query

---

## apps/mobile

Cross-platform mobile chat application built with React Native.

### Features

- Android Support
- iOS Support
- Realtime Messaging
- Push-ready Architecture
- Persistent Authentication
- Realtime Presence
- Mobile-first UI
- Offline-ready Patterns
- Optimistic Updates

### Main Technologies

- React Native
- Expo
- NativeWind
- Zustand
- TanStack Query
- Socket.IO Client

---

## apps/docs

Internal documentation and engineering references.

Can include:

- API documentation
- UI documentation
- Design system
- Architecture notes
- Internal engineering guides

---

# Shared Packages

## @repo/ui

Shared UI component system for web and mobile platforms.

### Includes

- Buttons
- Inputs
- Modals
- Chat Components
- Layout Components
- Shared Hooks
- Shared Design Tokens

Built for:

- Reusability
- Accessibility
- Consistency
- Scalability

---

## @repo/api-client

Shared typed API client and socket layer.

### Responsibilities

- API abstraction
- Shared request handling
- Typed responses
- Socket event typing
- Authentication helpers

---

## @repo/eslint-config

Centralized ESLint configurations shared across the monorepo.

Ensures:

- Consistent code quality
- Shared linting rules
- Standardized formatting

---

## @repo/typescript-config

Centralized TypeScript configurations.

Provides:

- Shared tsconfig bases
- Strict type safety
- Consistent compiler rules

---

# Getting Started

## Prerequisites

Install:

- Node.js 22+
- pnpm
- Docker
- Docker Compose

---

# Installation

Clone the repository:

```bash id="ewnm22"
git clone <your-repository-url>
cd realtime-chat-platform
```

Install dependencies:

```bash id="jlwmkp"
pnpm install
```

---

# Environment Variables

Create environment files:

```bash id="8h5j20"
apps/server/.env
apps/web/.env.local
apps/mobile/.env
```

Example server environment:

```env id="6iy5wv"
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chat_app
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret

PORT=3000
NODE_ENV=development
```

Example web environment:

```env id="0v8a0w"
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3000
```

Example mobile environment:

```env id="s4r9aj"
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_WS_URL=http://localhost:3000
```

---

# Docker Setup

Start PostgreSQL and Redis:

```bash id="zmdg87"
docker compose up -d
```

Stop containers:

```bash id="x5q9mh"
docker compose down
```

---

# Database Setup

Run Prisma migrations:

```bash id="t0g48o"
pnpm --filter server prisma migrate dev
```

Generate Prisma client:

```bash id="7wsx1l"
pnpm --filter server prisma generate
```

Seed database:

```bash id="rwqv92"
pnpm --filter server prisma db seed
```

---

# Development

## Run Entire Monorepo

```bash id="ct4rf4"
pnpm dev
```

or

```bash id="gxh0ui"
turbo dev
```

---

## Run Specific App

### Server

```bash id="mrbjlwm"
pnpm --filter server dev
```

### Web

```bash id="wqmsln"
pnpm --filter web dev
```

### Mobile

```bash id="o6h9cw"
pnpm --filter mobile dev
```

### Docs

```bash id="j8ol86"
pnpm --filter docs dev
```

---

# Build

Build all apps/packages:

```bash id="8s9ehj"
pnpm build
```

or

```bash id="hgb72n"
turbo build
```

---

# Engineering Principles

This platform follows:

- Clean Architecture
- SOLID Principles
- Feature-based Architecture
- Domain Separation
- Scalable Monorepo Design
- Shared Type Safety
- Reusable UI System
- Enterprise-level Code Standards

---

# Realtime Architecture

The platform uses:

- Socket.IO
- Redis Adapter
- Event-driven patterns
- Optimistic updates
- Presence tracking
- Read receipts
- Reconnect handling

Designed for:

- Horizontal scaling
- Multi-instance deployments
- High concurrency

---

# Security

Implemented security practices:

- JWT Authentication
- Refresh Token Rotation
- Password Hashing
- Helmet
- Rate Limiting
- Input Validation
- DTO Validation
- CORS Protection
- Secure Environment Variables

---

# Deployment

## Recommended Platforms

### Server

- Railway
- Render
- Fly.io
- AWS
- DigitalOcean

### Web

- Vercel

### Mobile

- Expo EAS
- App Store
- Google Play Store

### Database

- Neon
- Supabase
- AWS RDS

### Redis

- Upstash
- Redis Cloud

---

# Useful Commands

## Turbo

```bash id="5v7v66"
turbo dev
turbo build
turbo lint
turbo check-types
```

## Prisma

```bash id="6n2i3w"
pnpm --filter server prisma studio
pnpm --filter server prisma migrate dev
pnpm --filter server prisma generate
```

## Docker

```bash id="80z00h"
docker compose up -d
docker compose down
docker compose logs
```

---

# Future Improvements

Potential future additions:

- Push Notifications
- Voice Messages
- Video Calls
- File Uploads
- AI Features
- End-to-End Encryption
- Microservices Architecture
- Kubernetes Deployment

---

# License

Private Project — All Rights Reserved.
