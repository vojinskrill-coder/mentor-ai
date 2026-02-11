# Single-stage build for Railway deployment
FROM node:20-alpine
WORKDIR /app

# Copy all source code first
COPY . .

# Install deps, generate Prisma client, and build everything in one layer
# This avoids Docker layer caching issues with node_modules
RUN rm -rf node_modules \
    && npm ci --legacy-peer-deps \
    && ls node_modules/prisma/build/index.js \
    && node node_modules/prisma/build/index.js generate --schema=apps/api/prisma/schema.prisma \
    && node node_modules/nx/bin/nx.js build web --configuration=production \
    && node node_modules/nx/bin/nx.js build api

# Clean up dev dependencies and source to reduce image size
RUN npm prune --production --legacy-peer-deps 2>/dev/null || true
RUN rm -rf apps/web apps/api/src apps/api-e2e Vector_DB_Source shared .angular .nx

# Re-generate Prisma client after prune (prisma is in dependencies, should survive)
RUN node node_modules/prisma/build/index.js generate --schema=apps/api/prisma/schema.prisma 2>/dev/null || true

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/api/main.js"]
