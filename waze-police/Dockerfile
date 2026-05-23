# ─────────────────────────────────────────────
#  Stage 1: Build
# ─────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install build deps
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# ─────────────────────────────────────────────
#  Stage 2: Runtime
# ─────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# Install Playwright OS dependencies + Chromium
# This is the recommended approach for Playwright on Debian-slim
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright Chromium
RUN npx playwright install chromium --with-deps

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Copy migrations
COPY migrations/ ./migrations/

# Non-root user for security
RUN groupadd -r waze && useradd -r -g waze waze
RUN chown -R waze:waze /app
USER waze

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -q --spider http://localhost:${PORT:-3001}/health/live || exit 1

EXPOSE 3001

ENTRYPOINT ["node", "dist/index.js"]
