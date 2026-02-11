# ─── Stage 1: Install dependencies ────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ─── Stage 2: Build both apps ────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
ENV PATH="/app/node_modules/.bin:$PATH"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN prisma generate --schema=apps/api/prisma/schema.prisma

# Build Angular frontend (production config with fileReplacements)
RUN nx build web --configuration=production

# Build NestJS API
RUN nx build api

# ─── Stage 3: Production image ───────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV PATH="/app/node_modules/.bin:$PATH"

# Only copy what's needed for production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Prisma needs the schema for runtime
RUN prisma generate --schema=apps/api/prisma/schema.prisma

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/api/main.js"]
