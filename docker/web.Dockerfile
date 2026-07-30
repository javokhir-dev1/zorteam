# ============================================================
#  Frontend (Next.js — admin panel va Telegram Mini App)
#  Build konteksti — loyiha ildizi
# ============================================================

FROM node:24-slim AS base
WORKDIR /app

# ---------- Bog'liqliklar ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# ---------- Yig'ish ----------
FROM deps AS build
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@zorteam/web

# ---------- Ishga tushirish ----------
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web ./apps/web

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
