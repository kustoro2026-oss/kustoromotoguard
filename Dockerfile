# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY packages/frontend/package.json ./
RUN npm install
COPY packages/frontend/ ./
RUN npx vite build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY packages/backend/package.json ./
RUN npm install --omit=dev
COPY packages/backend/tsconfig.json ./
COPY packages/backend/src ./src/
RUN npx tsc

# Stage 3: Production
FROM node:20-alpine
WORKDIR /app
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/package.json ./package.json
COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /app/dist ./public
EXPOSE 3000
CMD node dist/db/migrate.js && node dist/index.js
