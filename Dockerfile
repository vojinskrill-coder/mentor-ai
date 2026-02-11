# Multi-stage build for Railway deployment
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies (cached unless package*.json change)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Generate Prisma client + build both apps
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma \
    && npx nx build web --configuration=production \
    && npx nx build api

# --- Production image ---
FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/api/main.js"]
