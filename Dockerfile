# Multi-stage build — builds dist inside Docker, no need to commit dist
FROM node:22-slim AS builder
WORKDIR /app

# Install OpenSSL (required by Prisma on Debian slim)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install ALL dependencies (including dev) for build
COPY package.json package-lock.json ./
RUN node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));delete p.scripts.prepare;require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && npm ci --legacy-peer-deps

# Copy source code and build configs
COPY nx.json tsconfig.base.json ./
COPY apps ./apps
COPY shared ./shared

# Generate Prisma client and build API
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npx nx build api --skip-nx-cache

# ─── Production stage ───
FROM node:22-slim
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
COPY package.json package-lock.json ./
RUN node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));delete p.scripts.prepare;require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && npm ci --legacy-peer-deps --omit=dev

# Copy built dist from builder stage
COPY --from=builder /app/dist ./dist
COPY apps/api/prisma ./apps/api/prisma

# Generate Prisma client for this platform
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/apps/api/main.js"]
