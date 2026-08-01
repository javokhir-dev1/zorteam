#!/bin/sh
# ============================================================
#  Yangi versiyani serverga chiqarish — pm2 (Docker'siz)
#
#  Qo'lda:      ./scripts/deploy-pm2.sh
#  Avtomatik:   GitHub Actions (.github/workflows/deploy.yml)
#
#  Nima qiladi:
#    1. Bazani zaxiralaydi (pg_dump bo'lsa)
#    2. Git'dan yangi kodni oladi
#    3. Bog'liqliklarni va Prisma klientini yangilaydi
#    4. Migratsiyalarni qo'llaydi
#    5. Yig'adi va pm2'ni qayta ishga tushiradi
#    6. Sog'liqni tekshiradi
# ============================================================

set -e

# Skript qayerdan chaqirilishidan qat'i nazar loyiha ildizida ishlaymiz
cd "$(dirname "$0")/.."

# SSH orqali interaktiv bo'lmagan seansda nvm PATH'ga tushmaydi —
# node/npm/pm2 topilmasa deploy shu yerda to'xtar edi.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

echo "════════════════════════════════════════"
echo "  Zo'r team — deploy (pm2)"
echo "════════════════════════════════════════"

if [ ! -f .env ]; then
  echo "✗ .env fayli topilmadi."
  exit 1
fi

# Web build paytidagi qiymat pm2 ishga tushirish qiymati bilan bir xil
# bo'lishi SHART — Next.js rewrites'ni build paytida hisoblab qo'yadi.
API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:4002}"
API_PORT=$(grep -E '^API_PORT=' .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
API_PORT="${API_PORT:-4002}"

echo ""
echo "1/6  Baza zaxiralanmoqda…"
if command -v pg_dump > /dev/null 2>&1; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  mkdir -p backups
  BACKUP="backups/zorteam_$(date +%Y-%m-%d_%H-%M).sql.gz"
  if pg_dump "$DATABASE_URL" | gzip > "$BACKUP"; then
    echo "     ✓ $BACKUP ($(du -h "$BACKUP" | cut -f1))"
    find backups -name 'zorteam_*.sql.gz' -type f -mtime +30 -delete
  else
    echo "     ⚠ zaxiralash bajarilmadi — davom etilmoqda"
    rm -f "$BACKUP"
  fi
else
  echo "     (pg_dump topilmadi — o'tkazib yuborildi)"
fi

echo ""
echo "2/6  Yangi kod olinmoqda…"
git pull --ff-only

echo ""
echo "3/6  Bog'liqliklar va Prisma klienti…"
npm install --no-audit --no-fund
npm run db:generate

echo ""
echo "4/6  Migratsiyalar qo'llanmoqda…"
npm run db:deploy

echo ""
echo "5/6  Yig'ilmoqda…"
API_PROXY_TARGET="$API_PROXY_TARGET" npm run build

echo ""
echo "6/6  Qayta ishga tushirilmoqda…"
pm2 restart ecosystem.config.js --update-env
pm2 save

sleep 8

for i in 1 2 3 4 5 6; do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" > /tmp/zorteam-health.json 2>/dev/null; then
    echo "     ✓ Tizim javob berdi:"
    cat /tmp/zorteam-health.json
    echo ""
    echo "════════════════════════════════════════"
    echo "  ✓ Deploy muvaffaqiyatli"
    echo "════════════════════════════════════════"
    exit 0
  fi
  echo "     … kutilmoqda ($i/6)"
  sleep 5
done

echo ""
echo "✗ Tizim javob bermadi. Loglarni ko'ring:"
echo "    pm2 logs zorteam-api --lines 80"
exit 1
