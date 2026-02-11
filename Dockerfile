# Single-stage build for Railway deployment
FROM node:20-alpine
WORKDIR /app

# Copy all source code first
COPY . .

# Remove any host node_modules that may have been copied, then install fresh
RUN rm -rf node_modules && npm ci --legacy-peer-deps

# Debug: show what prisma installed
RUN ls -la node_modules/prisma/ && ls -la node_modules/prisma/build/ && ls -la node_modules/.bin/ | grep -E "(prisma|nx)"

# Generate Prisma client (use npx with exact version to avoid downloading latest)
RUN npx prisma@5.22.0 generate --schema=apps/api/prisma/schema.prisma

# Build Angular frontend (production config with fileReplacements)
RUN npx nx@22.4.5 build web --configuration=production

# Build NestJS API
RUN npx nx@22.4.5 build api

# Clean up dev dependencies and source to reduce image size
RUN npm prune --production --legacy-peer-deps 2>/dev/null; \
    rm -rf apps/web apps/api/src apps/api-e2e Vector_DB_Source shared .angular .nx

# Re-generate Prisma client after prune
RUN npx prisma@5.22.0 generate --schema=apps/api/prisma/schema.prisma 2>/dev/null || true

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/api/main.js"]
