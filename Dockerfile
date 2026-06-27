# Stage 1: Build everything
FROM node:20-alpine AS builder
WORKDIR /app

# Copy all workspace files
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Install all dependencies (workspaces auto-linked)
RUN npm ci

# Copy source code
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/src ./packages/backend/src/
COPY packages/frontend/tsconfig.json ./packages/frontend/
COPY packages/frontend/vite.config.ts ./packages/frontend/
COPY packages/frontend/tailwind.config.js ./packages/frontend/
COPY packages/frontend/postcss.config.js ./packages/frontend/
COPY packages/frontend/index.html ./packages/frontend/
COPY packages/frontend/public ./packages/frontend/public/
COPY packages/frontend/src ./packages/frontend/src/

# Build backend
RUN cd packages/backend && npx tsc

# Build frontend
RUN cd packages/frontend && npx vite build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app

# Copy only production node_modules (backend deps only - keep it small)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend/package.json ./package.json
COPY --from=builder /app/packages/backend/dist ./dist

# Copy frontend build output (served by Express)
COPY --from=builder /app/packages/frontend/dist ./public

EXPOSE 3000
CMD node dist/db/migrate.js && node dist/index.js
