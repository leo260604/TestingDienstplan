# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# DienstPlan Pro – Produktions-Image (Next.js standalone + Prisma)
# ---------------------------------------------------------------------------
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts

FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Für "prisma generate" reicht eine Platzhalter-URL – zur Laufzeit kommt die echte aus der Umgebung.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate \
 && npm run build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Prisma CLI + Schema für "migrate deploy" beim Start (eigener Ordner, unabhängig vom standalone-Bundle)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./migrate/node_modules
COPY --from=build --chown=nextjs:nodejs /app/prisma ./migrate/prisma
COPY --from=build --chown=nextjs:nodejs /app/prisma.config.ts ./migrate/prisma.config.ts
COPY --chown=nextjs:nodejs docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
