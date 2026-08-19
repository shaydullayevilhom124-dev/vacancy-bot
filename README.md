# Vacancy ARGOS Telegram Bot

vacancy.gov.uz saytidan (Qashqadaryo, `regionSoato=18`, `page=6`) vakansiyalarni
har kuni avtomatik tekshirib, Telegramga yuboradigan bot. GitHub Actions
orqali **bepul** va serversiz ishlaydi.

## Qanday ishlaydi

Har kuni soat 08:00 (Toshkent vaqti) GitHub Actions avtomatik ishga tushadi:

1. Headless brauzer (Puppeteer) sahifani ochadi.
2. Sahifadagi matnni o'qiydi va avvalgi kun bilan solishtiradi.
3. Yangi qatorlarni `🆕` belgisi bilan ajratib, Telegramga xabar + sahifa
   skrinshotini yuboradi.
4. Yangi holatni `state/seen.json` fayliga yozib, repo'ga commit qiladi
   (shu bilan ertangi kun uchun "xotira" saqlanadi).

## O'rnatish (10 daqiqa)

### 1. Telegram bot yaratish

1. Telegram'da **@BotFather** ga yozing → `/newbot` → nom bering.
2. Sizga beriladigan **tokenni** saqlab qo'ying (masalan
   `123456:ABC-DEF...`).

### 2. Chat ID'ni topish

1. Yangi botingizga Telegram'da `/start` yozing (yoki uni guruhga qo'shing).
2. Brauzerda oching:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   (`<TOKEN>` o'rniga o'z tokeningizni qo'ying)
3. Javobdan `"chat":{"id": ...}` qiymatini toping — shu sizning
   `TELEGRAM_CHAT_ID` bo'ladi.

### 3. GitHub repo yaratish

1. GitHub'da yangi (bo'sh) repository yarating, masalan `vacancy-bot`.
2. Shu papkadagi barcha fayllarni o'sha repo'ga yuklang:
   ```bash
   cd vacancy-bot
   git init
   git add .
   git commit -m "Boshlang'ich versiya"
   git branch -M main
   git remote add origin https://github.com/<username>/vacancy-bot.git
   git push -u origin main
   ```

### 4. Maxfiy kalitlarni (Secrets) qo'shish

GitHub'da: repo → **Settings → Secrets and variables → Actions → New
repository secret**

- `TELEGRAM_BOT_TOKEN` → BotFather'dan olgan token
- `TELEGRAM_CHAT_ID` → 2-qadamda topilgan ID

### 5. Ishga tushirish

- Avtomatik: har kuni soat 08:00 (Toshkent) o'zi ishlaydi.
- Qo'lda sinab ko'rish: repo → **Actions** tab → *Kunlik vakansiya
  tekshiruvi* → **Run workflow**.

## Muhim eslatma

Sayt Angular asosida ishlaydi va aniq HTML strukturasi (class nomlari
va h.k.) ochiq hujjatlashtirilmagan. Shu sabab skript "qattiq"
selektorlarga emas, sahifaning **butun matniga** tayanadi — bu kamroq
nozik usul. Birinchi ishga tushirishdan keyin (Actions loglarida yoki
Telegram'ga kelgan xabarda) natijani ko'rib chiqing:

- Agar juda ko'p keraksiz qator (menyu, footer va h.k.) kelsa —
  `scraper.js` faylidagi `blacklistSubstrings` ro'yxatiga o'sha
  so'zlarni qo'shing.
- Agar kerakli ma'lumot tushib qolsa — `MIN_LINE_LENGTH` qiymatini
  kamaytiring.

Agar kelajakda saytning haqiqiy API manzilini (Network tab orqali)
topsangiz, menga yuboring — skriptni ancha aniqroq va yengilroq qilib
qayta yozib beraman (unda faqat lavozim nomi, tashkilot, muddat kabi
maydonlar alohida-alohida ajratiladi).

## Boshqa hudud/sahifa uchun

`.github/workflows/daily-check.yml` faylida `TARGET_URL` environment
o'zgaruvchisini qo'shib, boshqa `regionSoato` yoki `page` qiymatlarini
belgilashingiz mumkin.
