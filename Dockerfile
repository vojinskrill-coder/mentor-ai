# Single-stage build for Railway deployment
FROM node:20-alpine
WORKDIR /app

# Copy all source code first
COPY . .

# Remove any host node_modules that may have been copied, then install fresh
RUN rm -rf node_modules && npm ci --legacy-peer-deps

# Generate Prisma client
RUN node node_modules/prisma/build/index.js generate --schema=apps/api/prisma/schema.prisma

# Build Angular frontend (production config with fileReplacements)
RUN node node_modules/nx/bin/nx.js build web --configuration=production

# Build NestJS API
RUN node node_modules/nx/bin/nx.js build api

# Clean up dev dependencies and source to reduce image size
RUN npm prune --production --legacy-peer-deps 2>/dev/null; \
    rm -rf apps/web apps/api/src apps/api-e2e Vector_DB_Source shared .angular .nx

# Re-generate Prisma client after prune
RUN node node_modules/prisma/build/index.js generate --schema=apps/api/prisma/schema.prisma 2>/dev/null || true

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/api/main.js"]
