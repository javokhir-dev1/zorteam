#!/bin/sh
# ============================================================
#  Ma'lumotlar bazasining zaxira nusxasi
#
#  Qo'lda:   ./scripts/backup-db.sh
#  Har kuni: crontab -e ga qo'shing:
#            0 2 * * * cd /opt/zorteam && ./scripts/backup-db.sh >> /var/log/zorteam-backup.log 2>&1
# ============================================================

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP=$(date +%Y-%m-%d_%H-%M)

mkdir -p "$BACKUP_DIR"

# .env dan foydalanuvchi va baza nomini olamiz
POSTGRES_USER=$(grep -E '^POSTGRES_USER=' .env | cut -d'"' -f2)
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' .env | cut -d'"' -f2)
POSTGRES_USER="${POSTGRES_USER:-zorteam}"
POSTGRES_DB="${POSTGRES_DB:-zorteam}"

FILE="$BACKUP_DIR/zorteam_${STAMP}.sql.gz"

echo "→ Baza zaxiralanmoqda: $FILE"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "✓ Tayyor: $FILE ($SIZE)"

# Fotolarni ham zaxiralaymiz (haftada bir marta yetarli, hajmi katta)
if [ "$1" = "--with-photos" ]; then
  PHOTOS="$BACKUP_DIR/storage_${STAMP}.tar.gz"
  echo "→ Fotolar zaxiralanmoqda: $PHOTOS"
  docker compose exec -T api tar czf - -C /app storage > "$PHOTOS"
  echo "✓ Tayyor: $PHOTOS ($(du -h "$PHOTOS" | cut -f1))"
fi

# Eski nusxalarni tozalash
echo "→ ${KEEP_DAYS} kundan eski nusxalar o'chirilmoqda"
find "$BACKUP_DIR" -name 'zorteam_*.sql.gz' -type f -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'storage_*.tar.gz' -type f -mtime "+$KEEP_DAYS" -delete

echo "✓ Zaxiralash yakunlandi"
