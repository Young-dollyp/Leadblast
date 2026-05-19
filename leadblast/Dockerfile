# ── LeadBlast — Production Docker Image ──────────────────────
FROM node:20-bookworm-slim

WORKDIR /app

# Copy dependency files first (layer caching)
COPY package*.json ./

# Install Node dependencies
RUN npm ci --omit=dev

# Install Chromium and all required system dependencies via Playwright
# Set a stable path so browsers are written into the image filesystem,
# not the ephemeral build cache at /root/.cache/ms-playwright/
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright
RUN npx playwright install --with-deps chromium

# Copy application source
COPY server.js ./
COPY src/       ./src/
COPY public/    ./public/

# Non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -G audio,video appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "server.js"]
