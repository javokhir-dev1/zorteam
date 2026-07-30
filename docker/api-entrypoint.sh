#!/bin/sh
# Backend ishga tushishidan oldin baza migratsiyalarini qo'llaydi.
# Bu amal idempotent — qo'llanilgan migratsiya qayta ishlamaydi.

set -e

echo "→ Ma'lumotlar bazasi migratsiyalari qo'llanmoqda…"
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "→ Backend ishga tushirilmoqda…"
exec node apps/api/dist/main.js
