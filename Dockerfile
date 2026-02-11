# Single-stage build for Railway deployment
FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Debug: verify prisma is installed
RUN ls node_modules/.bin/prisma && ls node_modules/prisma/build/

# Generate Prisma client
RUN node node_modules/prisma/build/index.js generate --schema=apps/api/prisma/schema.prisma

# Build Angular frontend (production config with fileReplacements)
RUN node node_modules/nx/bin/nx.js build web --configuration=production

# Build NestJS API
RUN node node_modules/nx/bin/nx.js build api

# Clean up dev dependencies and source to reduce image size
RUN npm prune --production --legacy-peer-deps 2>/dev/null; \
    rm -rf apps/web apps/api/src apps/api-e2e Vector_DB_Source shared .angular .nx

# Re-generate Prisma client after prune (in case it was removed)
RUN node node_modules/prisma/build/index.js generate --schema=apps/api/prisma/schema.prisma 2>/dev/null || true

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/api/main.js"]
