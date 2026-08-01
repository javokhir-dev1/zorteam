# Zo'r team — Hodimlarni nazorat qilish va boshqarish tizimi

1-bosqich: **Web admin panel + Telegram bot (Mini App)**.
Native mobil ilova va Hikvision Face ID integratsiyasi 2-bosqichda qo'shiladi.

---

## Tizim nima qiladi

| Modul | Tavsif |
|---|---|
| **Ro'yxatdan o'tish** | Hodim botda o'zi ariza to'ldiradi (ism, vazifa, bo'lim). Bosh admin tasdiqlagunga qadar tizimga kira olmaydi |
| **Davomat** | Ish vaqti boshlanganda bot xabar yuboradi → hodim Mini App'da **jonli kamera**dan suratga oladi, GPS avtomatik olinadi. Galereyadan rasm tanlash imkoni yo'q. |
| **Aldashga qarshi** | Geofence, GPS aniqligi tekshiruvi, takroriy rasm aniqlash (perceptual hash), "sakrash" tekshiruvi, zaxira usul belgisi |
| **Yo'qlik so'rovlari** | Bo'lim rahbari kiritadi → **tasdiqlovchi rahbar** Telegramdagi tugma orqali tasdiqlaydi |
| **Ko'rsatuvlar** | Efirlar, jamoa biriktirish (operator, boshlovchi, montajchi, chiroqchi, monitorchi…). Rahbar faqat **o'z bo'limi** hodimini qo'ya oladi |
| **Baholash** | Admin "kim kimni baholaydi" matritsasini tuzadi. Hodim → prodakshnga baho faqat o'sha ko'rsatuvga biriktirilganlar uchun |
| **Maxfiy murojaat** | Hodimga maxfiy, administratorga muallif ko'rinadi. Javob botga qaytadi |
| **Bo'limlararo so'rovlar** | Deadline nazorati, kechikish va javobsizlik avtomatik qayd etiladi |
| **Hisobotlar** | Haftalik/oylik tahlil, bo'lim kamchiliklari, Excel eksport, dushanba avtomatik xulosa |
| **Ijtimoiy tarmoq** | YouTube va Instagram avtomatik, Telegram — postlar avtomatik, ko'rishlar qo'lda |

---

## Texnik tarkib

```
apps/
  api/    NestJS + Prisma + PostgreSQL + grammY (Telegram bot)
  web/    Next.js 15 + React 19 + Tailwind 4
          ├─ /panel   admin panel (brauzer)
          └─ /app     Telegram Mini App (hodimlar)
```

---

## Birinchi marta ishga tushirish

### 1. Talablar

- Node.js 20+
- PostgreSQL 14+

### 2. Sozlash

```bash
npm install
```

`.env.example` faylini `.env` nomi bilan nusxalang va to'ldiring:

```bash
cp .env.example .env
```

Eng muhim qiymatlar:

| O'zgaruvchi | Tavsif |
|---|---|
| `DATABASE_URL` | PostgreSQL ulanish satri |
| `JWT_SECRET` | Uzun tasodifiy satr (albatta almashtiring) |
| `TELEGRAM_BOT_TOKEN` | @BotFather dan olinadi |
| `TELEGRAM_BOT_USERNAME` | Bot username (@ belgisisiz) |
| `MINIAPP_URL` | Mini App manzili — **HTTPS bo'lishi shart** |

### 3. Baza

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Seed quyidagilarni yaratadi: standart ish grafigi (10:00–19:00), namunaviy ofis,
10 ta bo'lim, 8 ta jamoa roli, 2 ta baholash qoidasi, bayram kunlari va administrator.

**Standart admin:** `admin@zorteam.uz` / `admin12345`
Birinchi kirishdan keyin parolni albatta almashtiring.

### 4. Ishga tushirish

```bash
npm run dev:api
```

```bash
npm run dev:web
```

- Admin panel: http://localhost:3000/login
- Mini App: http://localhost:3000/app (Telegram ichida ochilishi kerak)
- API: http://localhost:4000/health

---

## Telegram botni ulash

1. [@BotFather](https://t.me/BotFather) da bot yarating → tokenni `.env` ga yozing
2. BotFather'da `/setmenubutton` → Mini App manzilini kiriting
3. Botni qayta ishga tushiring

**Muhim:** Mini App'da kamera va geolokatsiya ishlashi uchun sayt **HTTPS** orqali
ochilishi shart. Localhost faqat brauzerda test qilish uchun ishlaydi.
Ishlab chiqish paytida `ngrok` yoki shunga o'xshash tunnel ishlatiladi.

### Hodimlarni tizimga qo'shishning ikki yo'li

**1-yo'l: hodim o'zi ro'yxatdan o'tadi (asosiy)**

1. Hodim botga **/start** yuboradi
2. **📝 Ro'yxatdan o'tish** tugmasini bosadi
3. Ism sharifini yozadi → vazifasini yozadi → ro'yxatdan bo'limini tanlaydi
4. Ariza bosh administratorga boradi (Telegramga xabar keladi)
5. Admin panelda **Arizalar** bo'limida ariza ko'rinadi
6. Admin ma'lumotlarni tekshiradi, kerak bo'lsa tuzatadi va **tasdiqlaydi**
7. Shundagina hodim yozuvi yaratiladi va Mini App ochiladi

Tasdiqlanmagunga qadar hodim tizimga kira olmaydi — Mini App
"Arizangiz ko'rib chiqilmoqda" deb yozadi.

Rad etilsa, sabab hodimga Telegramga yuboriladi va u tuzatib qayta
ariza berishi mumkin.

**2-yo'l: admin oldindan qo'shadi**

1. Admin panelda hodim qo'shiladi
2. Hodim qatoridagi **Havola** tugmasi bosiladi
3. Havola hodimga yuboriladi — u bosgach akkaunt darhol bog'lanadi
   (ariza va tasdiqlash talab qilinmaydi)

Havola yo'qolsa, hodim botga telefon raqamini yuborib ham ulanishi mumkin
(raqam tizimda oldindan kiritilgan bo'lishi kerak).

---

## Ishga tushirishdan oldin sozlanadigan narsalar

1. **Ofis koordinatasi** — Sozlamalar → Ofis va geofence.
   Google Maps'da ofis ustiga o'ng tugma bosib koordinatani oling.
   Radius 100–200 m tavsiya etiladi (kichik radius GPS xatoligi sabab
   ofisdagi hodimni "tashqarida" deb belgilashi mumkin).

2. **Ish grafiklari** — bo'limlarga yoki alohida hodimlarga biriktiriladi.

3. **Bo'lim rahbarlari** — Bo'limlar → Rahbarlar. Rahbar tanlanganda unga
   "Bo'lim rahbari" roli avtomatik beriladi.

4. **Tasdiqlovchi rahbar** — Hodimlar → tahrirlash → `Tasdiqlovchi rahbar` roli.
   Yo'qlik so'rovlari shu odamga boradi.

5. **Baholash matritsasi** — Baholash → Baholash matritsasi.

---

## Avtomatik jarayonlar (cron)

| Vaqt | Nima bo'ladi |
|---|---|
| 00:05 | Kunlik davomat yozuvlari tayyorlanadi |
| Har daqiqa | Ish vaqti kelganlarga bot xabari |
| Har daqiqa | Belgilanmaganlarga eslatma |
| Har daqiqa | Oyna yopilgach "belgilanmadi" yoziladi |
| Har 5 daqiqa | Rahbarlarga belgilanmaganlar ro'yxati |
| Har 10 daqiqa | Deadline eslatmalari va kechikishlarni belgilash |
| Har soat | 24 soat javobsiz qolgan so'rovlarni belgilash |
| Dushanba 09:00 | Rahbarlarga haftalik xulosa |
| Har kuni 03:30 | Ijtimoiy tarmoq statistikasini yangilash |
| Oy boshi 05:00 | O'tgan oy statistikasini yakunlash |

---

## Ma'lum cheklovlar (1-bosqich)

Bular Telegram va tarmoqlarning o'z cheklovlari, dasturning kamchiligi emas:

1. **Bot telefonni o'zi uyg'otib kamerani ocholmaydi.**
   Amalda: push xabar keladi → hodim bosadi → Mini App'da kamera darhol ochiladi.
   Natija bir xil, lekin bir tugma bosiladi.

2. **Soxta GPS'ni 100% to'sib bo'lmaydi.**
   Aniqlik tekshiruvi, geofence, takroriy rasm va "sakrash" tekshiruvi
   amaliy holatlarning katta qismini yopadi. To'liq himoya 2-bosqichdagi
   native ilovada (mock location va root aniqlash) bo'ladi.

3. **Telegram kanal ko'rishlari avtomatik olinmaydi.**
   Telegram Bot API bu ma'lumotni bermaydi. Postlar avtomatik yoziladi,
   ko'rishlar soni panelda qo'lda kiritiladi. 2-bosqichda MTProto klienti
   qo'shilsa avtomatlashadi.

4. **Instagram** uchun akkaunt Business/Creator turida bo'lishi va
   Facebook ilovasi orqali token olinishi shart.

---

## Ma'lumotlar himoyasi

Tizim hodimlarning fotosi va joylashuvini yig'adi. Ishga tushirishdan oldin:

- hodimlar bilan yozma rozilik rasmiylashtirilsin (ish shartnomasiga ilova)
- fotolar saqlash muddati belgilansin (masalan 6 oy)

Barcha muhim amallar (qo'lda tuzatish, rol o'zgartirish, tasdiqlash)
`AuditLog` jadvaliga yoziladi.

---

## Serverga joylashtirish

Ishlab chiqarish serveriga o'rnatish va yangilash bo'yicha qo'llanma — [DEPLOY.md](DEPLOY.md).

---

## 2-bosqich rejasi

- Native Android/iOS ilova (mock location va root aniqlash, offline rejim)
- Hikvision Face ID integratsiyasi (ISAPI + ofisdagi ko'prik xizmat)
- Telegram ko'rishlari uchun MTProto klienti
- Bir nechta ofis va ko'chma s'yomka nuqtalari
