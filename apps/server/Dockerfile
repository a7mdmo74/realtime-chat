# ============================================================================
# Dockerfile — Multi-stage production build
# ============================================================================
#
# WHY MULTI-STAGE:
# Stage 1 (builder): Full Node.js + build tools + devDependencies
#   - Compiles TypeScript to JavaScript
#   - Generates Prisma client
#   - Runs in ~1GB image (acceptable for CI)
#
# Stage 2 (production): Minimal Node.js + only production artifacts
#   - No TypeScript compiler, no devDependencies, no source maps
#   - Runs in ~200MB image (fast to pull, smaller attack surface)
#
# SENIOR PRACTICE:
#   - Non-root user (node) for security — no process should run as root
#   - .dockerignore (see below) excludes node_modules, .env, dist
#   - COPY --chown=node:node sets correct file ownership in one step
#   - NODE_ENV=production optimizes npm install and Node.js runtime
# ============================================================================

# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install build dependencies for native addons (bcrypt uses native bindings)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency manifests first — Docker layer cache optimization.
# This layer is only rebuilt when package.json changes, not source code.
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDeps needed for build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source and compile
COPY tsconfig*.json ./
COPY src ./src/

RUN npm run build

# ─── Stage 2: Production Runtime ──────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: install dumb-init for proper signal handling in containers
# Without it, Node.js is PID 1 and doesn't handle SIGTERM correctly
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production

WORKDIR /app

# Create non-root user
# The node user already exists in the node:alpine image
RUN chown -R node:node /app

# Switch to non-root user before copying files
USER node

# Copy production dependencies (re-install without devDeps for smaller image)
COPY --chown=node:node package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --chown=node:node postman-collection.json ./postman-collection.json

# Copy compiled output and Prisma artifacts from builder
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node prisma ./prisma/

# Health check — Docker will mark container unhealthy if this fails
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-3000}/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

EXPOSE 3000

# dumb-init ensures:
# 1. Proper signal forwarding (SIGTERM reaches Node.js)
# 2. Zombie process reaping
# 3. Correct behavior in Docker/K8s
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
