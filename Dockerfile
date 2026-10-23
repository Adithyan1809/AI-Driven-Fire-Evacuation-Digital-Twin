# ================================================================
# Multi-Stage Hardened Production Dockerfile
# AI-Driven Fire Evacuation Digital Twin
# ================================================================

FROM node:22-alpine AS production

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Create app directory with proper non-root node permissions
RUN chown -R node:node /app

# Copy application files with proper ownership
COPY --chown=node:node package.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node index.html ./
COPY --chown=node:node app.js ./
COPY --chown=node:node data ./data
COPY --chown=node:node modules ./modules
COPY --chown=node:node styles ./styles
COPY --chown=node:node ui ./ui
COPY --chown=node:node build ./build

# Switch to non-root user for security hardening
USER node

# Expose HTTP port
EXPOSE 8080

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

# Start server
CMD ["node", "server.js"]
