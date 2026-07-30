# ============================================================
#  Backend (NestJS + Prisma + Telegram bot)
#  Build konteksti — loyiha ildizi
# ============================================================

FROM node:24-slim AS base
# Prisma va sharp uchun kerakli tizim kutubxonalari
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- Bog'liqliklar ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# ---------- Yig'ish ----------
FROM deps AS build
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace=@zorteam/api

# ---------- Ishga tushirish ----------
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

# Davomat fotolari shu papkada saqlanadi (compose'da volume ulanadi)
RUN mkdir -p /app/storage

COPY docker/api-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
