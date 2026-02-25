# Pre-built deployment image — dist is committed to repo
FROM node:22-slim
WORKDIR /app

# Install OpenSSL (required by Prisma on Debian slim)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install production dependencies only (fast — no dev deps)
COPY package.json package-lock.json ./
RUN node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));delete p.scripts.prepare;require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && npm ci --legacy-peer-deps --omit=dev

# Copy pre-built dist and prisma schema
COPY dist ./dist
COPY apps/api/prisma ./apps/api/prisma

# Generate Prisma client for this platform
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/apps/api/main.js"]
