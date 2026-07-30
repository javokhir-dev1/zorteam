#!/bin/sh
# ============================================================
#  Yangi versiyani serverga chiqarish
#
#  Ishlatish:  ./scripts/deploy.sh
#
#  Nima qiladi:
#    1. Bazani zaxiralaydi (xato bo'lsa qaytish uchun)
#    2. Git'dan yangi kodni oladi
#    3. Konteynerlarni qayta yig'adi
#    4. Migratsiyalarni qo'llaydi (api konteyneri o'zi qiladi)
#    5. Sog'liqni tekshiradi
# ============================================================

set -e

echo "════════════════════════════════════════"
echo "  Zo'r team — deploy"
echo "════════════════════════════════════════"

if [ ! -f .env ]; then
  echo "✗ .env fayli topilmadi. .env.production.example dan nusxalang."
  exit 1
fi

DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d'"' -f2)

echo ""
echo "1/5  Baza zaxiralanmoqda…"
if docker compose ps postgres 2>/dev/null | grep -q running; then
  ./scripts/backup-db.sh
else
  echo "     (baza hali ishlamayapti — o'tkazib yuborildi)"
fi

echo ""
echo "2/5  Yangi kod olinmoqda…"
git pull --ff-only

echo ""
echo "3/5  Konteynerlar yig'ilmoqda…"
docker compose build

echo ""
echo "4/5  Ishga tushirilmoqda…"
docker compose up -d

echo ""
echo "5/5  Sog'liq tekshirilmoqda…"
sleep 15

for i in 1 2 3 4 5 6; do
  if curl -fsS "https://${DOMAIN}/health" > /tmp/zorteam-health.json 2>/dev/null; then
    echo "     ✓ Tizim javob berdi:"
    cat /tmp/zorteam-health.json
    echo ""
    echo "════════════════════════════════════════"
    echo "  ✓ Deploy muvaffaqiyatli"
    echo "  Panel: https://${DOMAIN}/panel"
    echo "════════════════════════════════════════"
    exit 0
  fi
  echo "     … kutilmoqda ($i/6)"
  sleep 10
done

echo ""
echo "✗ Tizim javob bermadi. Loglarni ko'ring:"
echo "    docker compose logs --tail=80 api"
echo "    docker compose logs --tail=40 caddy"
exit 1
