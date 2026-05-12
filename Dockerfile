# All stages use node:20-slim (debian-based, glibc + OpenSSL 3) so that
# native modules — especially Prisma's platform-specific engine binaries —
# are compatible across stages. Mixing alpine (musl) and slim (glibc) made
# Prisma try to re-download its engines at startup into a root-owned
# node_modules directory, which failed under USER nextjs.

# ---- Dependencies ----
FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Builder ----
FROM node:26-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Opt into standalone output for Docker (gated in next.config.js so `npm start`
# still works for local production testing without this env var set).
ENV NEXT_OUTPUT_MODE=standalone
RUN npm run build

# ---- Runner ----
FROM node:26-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output (owned by nextjs to keep Prisma's engine cache writable)
COPY --chown=nextjs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs --from=builder /app/public ./public

# Copy Prisma schema + migrations for runtime migrate
COPY --chown=nextjs:nodejs --from=builder /app/prisma ./prisma

# Copy full node_modules for Prisma CLI (prisma migrate deploy needs 25+ transitive deps)
COPY --chown=nextjs:nodejs --from=builder /app/node_modules ./node_modules

# Copy entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Install Playwright Chromium with system deps (requires root, must be before USER nextjs)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install chromium --with-deps
RUN chown -R nextjs:nodejs /ms-playwright

# Create directories for logs and screenshots
RUN mkdir -p logs public/screenshots
RUN chown -R nextjs:nodejs logs public/screenshots .next

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
