# ==============================================================================
# Multi-stage Dockerfile for NestJS Backend (Mazoomen)
# Optimized for Google Cloud Run
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Install Dependencies
# ------------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Copy package manifests
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm install

# ------------------------------------------------------------------------------
# Stage 2: Build Application
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

# Copy Prisma schema and source code
COPY prisma ./prisma
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY public ./public

# Generate Prisma Client
RUN npx prisma generate

# Build NestJS production application
RUN npm run build

# Remove development dependencies to minimize node_modules size
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 3: Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Create public directory structure for static files/uploads with proper ownership
RUN mkdir -p /app/public/uploads && chown -R node:node /app

# Copy package manifests and production artifacts from builder
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Use unprivileged node user for security
USER node

# Expose default Cloud Run port
EXPOSE 8080

# Start NestJS application
CMD ["node", "dist/src/main.js"]
