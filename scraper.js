/**
 * vacancy.gov.uz (ARGOS) — Qashqadaryo (regionSoato=18) vakansiyalarini
 * har kuni tekshirib, Telegram botga yuboruvchi skript.
 *
 * Ishlash mantig'i:
 *  1. Puppeteer (headless Chrome) orqali sahifani to'liq render qilib ochadi
 *     (chunki sayt JavaScript orqali ma'lumot yuklaydi — oddiy HTTP so'rov
 *     bilan ma'lumotlarni ko'rish mumkin emas).
 *  2. Sahifadagi matnni (innerText) qatorlarga ajratadi va vakansiyaga
 *     o'xshagan (uzunroq, ma'noli) qatorlarni ajratib oladi.
 *  3. Avvalgi kun saqlangan ro'yxat bilan solishtiradi — YANGI qatorlarni
 *     aniqlaydi.
 *  4. Har kuni to'liq holatni (🆕 belgisi bilan yangi bandlarni ajratib)
 *     Telegramga matn va skrinshot ko'rinishida yuboradi.
 *  5. Yangi holatni state/seen.json fayliga yozadi (GitHub Actions buni
 *     avtomatik commit qiladi, shuning uchun keyingi ishga tushganda
 *     avvalgi holat saqlanib qoladi).
 *
 * Muhim eslatma: Bu sayt Angular/JS asosida ishlaydi va ma'lumot
 * strukturasi (HTML elementlari) vaqt o'tishi bilan o'zgarishi mumkin.
 * Shu sabab skript "qattiq" CSS selektorlarga emas, balki sahifaning
 * butun matniga tayanadi — bu kamroq nozik, lekin ancha barqaror usul.
 * Agar kelajakda aniqroq (masalan, faqat lavozim nomi, tashkilot,
 * muddat alohida-alohida) formatga o'tkazish kerak bo'lsa, birinchi
 * marta yuboriladigan screenshot va HTML asosida selektorlarni aniqlab,
 * shu faylni yangilash kerak bo'ladi.
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

// ---- SOZLAMALAR ----------------------------------------------------------

const TARGET_URL =
  process.env.TARGET_URL ||
  "https://vacancy.gov.uz/hrm-vacancy-list?regionSoato=18&page=6";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const STATE_DIR = path.join(__dirname, "state");
const STATE_FILE = path.join(STATE_DIR, "seen.json");
const SCREENSHOT_FILE = path.join(__dirname, "latest.png");

// Juda qisqa/ma'nosiz qatorlarni (menyu, tugmalar va h.k.) filtrlash uchun
// minimal uzunlik. Vakansiya nomlari odatda bundan uzunroq bo'ladi.
const MIN_LINE_LENGTH = 12;

// Telegram xabar uzunlik chegarasi (xavfsizlik zaxirasi bilan)
const TELEGRAM_MAX_LEN = 3500;

// ---- YORDAMCHI FUNKSIYALAR -------------------------------------------------

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function loadPreviousLines() {
  ensureStateDir();
  if (!fs.existsSync(STATE_FILE)) return [];
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.lines) ? data.lines : [];
  } catch (e) {
    console.error("state/seen.json o'qishda xato, bo'sh ro'yxatdan boshlanadi:", e.message);
    return [];
  }
}

function saveCurrentLines(lines) {
  ensureStateDir();
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ updatedAt: new Date().toISOString(), lines }, null, 2),
    "utf-8"
  );
}

/** Sahifa matnini olib, vakansiyaga o'xshagan qatorlarni ajratib beradi */
function extractCandidateLines(pageText) {
  const rawLines = pageText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Takrorlanadigan navigatsiya/footer so'zlarini chiqarib tashlash uchun
  // oddiy qora ro'yxat (agar sahifada uchrasa)
  const blacklistSubstrings = [
    "Bosh sahifa",
    "Kirish",
    "Chiqish",
    "Til",
    "Cookie",
    "Barcha huquqlar himoyalangan",
    "Yordam",
    "Aloqa",
  ];

  const filtered = rawLines.filter((line) => {
    if (line.length < MIN_LINE_LENGTH) return false;
    if (blacklistSubstrings.some((b) => line.includes(b))) return false;
    return true;
  });

  // Ketma-ket takrorlanuvchi qatorlarni siqish
  return [...new Set(filtered)];
}

function chunkText(lines, maxLen) {
  const chunks = [];
  let current = "";
  for (const line of lines) {
    if ((current + "\n" + line).length > maxLen) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + "\n" + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHAT_ID berilmagan, xabar yuborilmadi.");
    console.log("---- Yuborilishi kerak edi ----\n" + text);
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("Telegram xabar yuborishda xato:", data);
  }
}

async function sendTelegramPhoto(filePath, caption) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  if (!fs.existsSync(filePath)) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
  const form = new FormData();
  form.append("chat_id", TELEGRAM_CHAT_ID);
  if (caption) form.append("caption", caption.slice(0, 1024));
  form.append("photo", new Blob([fs.readFileSync(filePath)]), "latest.png");

  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json();
  if (!data.ok) {
    console.error("Telegram rasm yuborishda xato:", data);
  }
}

// ---- ASOSIY MANTIQ ---------------------------------------------------------

async function main() {
  console.log("Sahifani ochyapman:", TARGET_URL);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let pageText = "";
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    );

    await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 60000 });

    // SPA ma'lumotlari asinxron yuklanishi mumkin — biroz kutamiz
    await new Promise((r) => setTimeout(r, 5000));

    pageText = await page.evaluate(() => document.body.innerText);

    await page.screenshot({ path: SCREENSHOT_FILE, fullPage: true });
  } finally {
    await browser.close();
  }

  const currentLines = extractCandidateLines(pageText);
  const previousLines = loadPreviousLines();
  const previousSet = new Set(previousLines);

  const newLines = currentLines.filter((l) => !previousSet.has(l));

  console.log(`Jami qatorlar: ${currentLines.length}, yangilari: ${newLines.length}`);

  const today = new Date().toLocaleDateString("uz-UZ", { timeZone: "Asia/Tashkent" });

  // Kunlik hisobot matnini yig'amiz: yangilarini 🆕 bilan belgilaymiz
  const reportLines = currentLines.map((l) =>
    previousSet.has(l) ? l : `🆕 ${l}`
  );

  const header =
    newLines.length > 0
      ? `📋 Qashqadaryo vakansiyalari — ${today}\n${newLines.length} ta yangi band topildi:\n`
      : `📋 Qashqadaryo vakansiyalari — ${today}\nYangi band topilmadi. Joriy ro'yxat:\n`;

  const chunks = chunkText(reportLines, TELEGRAM_MAX_LEN);

  await sendTelegramMessage(header + (chunks[0] || "(ro'yxat bo'sh — sahifa strukturasi tekshirilishi kerak)"));
  for (let i = 1; i < chunks.length; i++) {
    await sendTelegramMessage(chunks[i]);
  }

  await sendTelegramPhoto(SCREENSHOT_FILE, `Skrinshot — ${today}`);

  saveCurrentLines(currentLines);

  console.log("Bajarildi.");
}

main().catch((err) => {
  console.error("Xato:", err);
  process.exit(1);
});
