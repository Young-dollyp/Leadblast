# ── LeadBlast — Production Docker Image ──────────────────────
# Based on official Playwright image which has Chromium pre-installed
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Copy dependency files first (layer caching)
COPY package*.json ./

# Install Node dependencies (skip Playwright browser download — already in base image)
RUN npm ci --omit=dev

# Copy application source
COPY server.js ./
COPY src/       ./src/
COPY public/    ./public/

# Playwright env — use the pre-installed Chromium in the base image
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -G audio,video appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "server.js"]
