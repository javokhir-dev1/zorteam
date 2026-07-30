# Serverga o'rnatish

Bu qo'llanma tizimni bulutli serverga bir marta o'rnatish uchun.
Keyingi barcha o'zgarishlar bitta buyruq bilan chiqariladi (oxirida).

---

## Nima kerak

| Narsa | Talab |
|---|---|
| **VPS** | Ubuntu 24.04, 4 CPU / 8 GB RAM / 100 GB SSD |
| **Domen** | masalan `hr.zorteam.uz` — A yozuvi server IP'siga yo'naltirilgan |
| **Telegram bot tokeni** | @BotFather dan |

200 hodim uchun shu resurs yetarli. Fotolar kuniga ~60 MB, yiliga ~22 GB.

---

## 1. Domenni yo'naltirish

Domen sozlamalarida **A yozuvi** qo'shing:

```
hr    A    <SERVER_IP>
```

Tekshirish (natijada server IP chiqishi kerak):

```bash
nslookup hr.zorteam.uz
```

DNS tarqalishi 5 daqiqadan 2 soatgacha vaqt oladi. HTTPS sertifikati faqat
domen ishlaganda olinadi, shuning uchun avval shuni bajarish kerak.

---

## 2. Serverni tayyorlash

Serverga SSH orqali kiring va Docker'ni o'rnating:

```bash
curl -fsSL https://get.docker.com | sh
```

Tekshirish:

```bash
docker --version && docker compose version
```

---

## 3. Loyihani ko'chirish

```bash
sudo mkdir -p /opt/zorteam && sudo chown $USER:$USER /opt/zorteam
```

```bash
git clone <REPO_URL> /opt/zorteam && cd /opt/zorteam
```

> Agar git ombori hali yaratilmagan bo'lsa, loyihani arxiv qilib
> `scp` bilan ko'chirish ham mumkin — lekin git tavsiya etiladi.

---

## 4. Sozlamalarni to'ldirish

```bash
cp .env.production.example .env
```

Kalitlarni yaratib olish:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
```

```bash
echo "JWT_SECRET=$(openssl rand -base64 48)"
```

```bash
echo "TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 24)"
```

Fayl ochib qiymatlarni joylang:

```bash
nano .env
```

To'ldirilishi shart: `DOMAIN`, `ACME_EMAIL`, `POSTGRES_PASSWORD`,
`JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`.

`TELEGRAM_WEBHOOK_URL` ni hozircha bo'sh qoldiring — 6-qadamda to'ldiriladi.

---

## 5. Ishga tushirish

```bash
chmod +x scripts/*.sh docker/api-entrypoint.sh
```

```bash
docker compose up -d --build
```

Birinchi yig'ish 5–10 daqiqa oladi. Jarayonni kuzatish:

```bash
docker compose logs -f
```

Sertifikat olinganini tekshirish:

```bash
curl -s https://hr.zorteam.uz/health
```

Javob shunday bo'lishi kerak:

```json
{"status":"ok","database":"ok","telegramBot":"sozlangan"}
```

### Boshlang'ich ma'lumotlarni yozish

Faqat **birinchi o'rnatishda** bir marta:

```bash
docker compose exec api npx tsx apps/api/prisma/seed.ts
```

Bu ish grafigi, bo'limlar, jamoa rollari, bayram kunlari va
administrator hisobini yaratadi.

**Darhol parolni almashtiring:** panelga kirib profil orqali yoki
Hodimlar bo'limida admin hisobini tahrirlab yangi parol qo'ying.

---

## 6. Botni webhook rejimiga o'tkazish

Serverda long polling emas, webhook ishlatish tavsiya etiladi — tezroq
va barqarorroq.

`.env` da to'ldiring:

```
TELEGRAM_WEBHOOK_URL="https://hr.zorteam.uz"
```

So'ng qayta ishga tushiring:

```bash
docker compose up -d api
```

Loglarda `Bot webhook rejimida` yozuvi chiqishi kerak:

```bash
docker compose logs --tail=30 api
```

### BotFather sozlamalari

@BotFather da:

1. `/setmenubutton` → botni tanlang → `https://hr.zorteam.uz/app` → nom: `Belgilanish`
2. `/setdescription` → bot tavsifi (ixtiyoriy)

---

## 7. Kunlik zaxira nusxa

```bash
crontab -e
```

Quyidagi qatorlarni qo'shing:

```
0 2 * * * cd /opt/zorteam && ./scripts/backup-db.sh >> /var/log/zorteam-backup.log 2>&1
0 3 * * 0 cd /opt/zorteam && ./scripts/backup-db.sh --with-photos >> /var/log/zorteam-backup.log 2>&1
```

Har kuni 02:00 da baza, har yakshanba 03:00 da fotolar ham zaxiralanadi.
Nusxalar `/opt/zorteam/backups/` da, 30 kun saqlanadi.

> **Muhim:** zaxira nusxalarni vaqti-vaqti bilan boshqa joyga
> (masalan tashqi disk yoki bulut xotira) ko'chirib turing. Server
> butunlay ishdan chiqsa, undagi nusxalar ham yo'qoladi.

---

## Keyingi o'zgarishlar qanday chiqariladi

Kod kompyuterda o'zgartiriladi va sinaladi, so'ng:

```bash
git push
```

Serverda:

```bash
cd /opt/zorteam && ./scripts/deploy.sh
```

Skript o'zi: bazani zaxiralaydi → yangi kodni oladi → konteynerlarni
qayta yig'adi → migratsiyalarni qo'llaydi → sog'liqni tekshiradi.
Odatda 1–3 daqiqa. Xato chiqsa qaysi log'ni ko'rish kerakligini aytadi.

---

## Kerakli buyruqlar

| Maqsad | Buyruq |
|---|---|
| Holatni ko'rish | `docker compose ps` |
| Backend loglari | `docker compose logs -f api` |
| Barcha loglar | `docker compose logs -f` |
| Qayta ishga tushirish | `docker compose restart api` |
| To'xtatish | `docker compose down` |
| Bazaga kirish | `docker compose exec postgres psql -U zorteam -d zorteam` |
| Disk hajmi | `docker system df` va `du -sh backups` |

### Bazani zaxiradan tiklash

```bash
gunzip -c backups/zorteam_2026-07-30_02-00.sql.gz | docker compose exec -T postgres psql -U zorteam -d zorteam
```

---

## Muammolarni hal qilish

**HTTPS sertifikat olinmadi**

```bash
docker compose logs caddy | tail -40
```

Ko'p uchraydigan sabablar: domen hali IP'ga yo'naltirilmagan; 80/443
portlar band yoki firewall bloklagan. Portlarni tekshirish:

```bash
sudo ss -tlnp | grep -E ':80|:443'
```

**Backend ko'tarilmadi**

```bash
docker compose logs --tail=60 api
```

Odatda `.env` da `DATABASE_URL` yoki `JWT_SECRET` to'ldirilmagan bo'ladi.

**Bot javob bermayapti**

Webhook holatini tekshirish (tokenni qo'ying):

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

**Mini App'da kamera ochilmayapti**

Manzil HTTPS bo'lishi shart va sertifikat haqiqiy bo'lishi kerak.
`MINIAPP_URL` `https://<DOMAIN>/app` ko'rinishida bo'lishini tekshiring.
