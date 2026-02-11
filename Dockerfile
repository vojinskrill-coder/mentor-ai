# Pre-built deployment image — dist is committed to repo
FROM node:22-alpine
WORKDIR /app

# Install production dependencies only (fast — no dev deps)
COPY package.json package-lock.json ./
RUN HUSKY=0 npm ci --legacy-peer-deps --omit=dev

# Copy pre-built dist and prisma schema
COPY dist ./dist
COPY apps/api/prisma ./apps/api/prisma

# Generate Prisma client for this platform
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/apps/api/main.js"]
