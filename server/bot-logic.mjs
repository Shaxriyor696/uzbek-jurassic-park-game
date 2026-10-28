/**
 * Bot javoblari (Worker webhook va lokal polling uchun umumiy, tarmoqqa bog'liq emas).
 * Qaytaradi: Bot API chaqiruvlari ro'yxati [{ method, payload }].
 * /start qayta bosilsa ham foydalanuvchi shahri o'chmaydi — bot faqat xabar yuboradi, saqlashga tegmaydi.
 */
export const TEXTS = {
  start:
    '🦖 Dinoshahar’ga xush kelibsiz!\n' +
    'O‘z shahringizni quring, rivojlantiring va dinozavrlardan himoya qiling.\n' +
    'Boshlash uchun quyidagi tugmani bosing.',
  help:
    '🦖 Dinoshahar — yordam\n\n' +
    '🎮 O‘yinni ochish: /start dagi «O‘yinni ochish» tugmasi yoki pastdagi «O‘ynash» menyusi.\n\n' +
    '📷 Kamera: bir barmoq bilan surish — xaritada yurish; ikki barmoq — yaqinlashtirish/uzoqlashtirish va aylantirish. ' +
    'Kompyuterda: sichqoncha bilan surish, g‘ildirak — zoom, o‘ng tugma — aylantirish.\n\n' +
    '🏗 Qurilish: pastdagi bo‘limdan bino kartasini tanlang, joyiga bir marta bosing — arvoh ko‘rinadi, ' +
    'yana bir marta bosing — quriladi. Yo‘l va devor barmoq bilan tortib chiziladi. Buzishdan oldin tasdiq so‘raladi.\n\n' +
    '💾 Progress: shahar avtomatik saqlanadi (qurilmada va Telegram hisobingizga bog‘langan serverda). ' +
    '/start qayta bosilsa shahar o‘chmaydi.',
  other: 'O‘yinni ochish uchun /start ni bosing. Yordam: /help',
  button: '🎮 O‘yinni ochish',
  menu: '🎮 O‘ynash',
  noUrl: 'O‘yin manzili hali sozlanmagan. Tez orada ochiladi!',
};

export const COMMANDS = [
  { command: 'start', description: 'O‘yinni ochish' },
  { command: 'help', description: 'Yordam: boshqaruv, qurilish, saqlash' },
];

export function isHttpsUrl(u) {
  try { return new URL(u).protocol === 'https:'; } catch { return false; }
}

/** Kelgan update → yuboriladigan javoblar */
export function replyFor(update, webAppUrl) {
  const msg = update?.message;
  if (!msg?.chat?.id || typeof msg.text !== 'string') return [];
  const chat_id = msg.chat.id;
  const cmd = msg.text.trim().split(/\s+/)[0].split('@')[0].toLowerCase();
  const url = isHttpsUrl(webAppUrl) ? webAppUrl : null;
  if (cmd === '/start') {
    return [{
      method: 'sendMessage',
      payload: {
        chat_id,
        text: url ? TEXTS.start : TEXTS.start + '\n\n' + TEXTS.noUrl,
        ...(url ? { reply_markup: { inline_keyboard: [[{ text: TEXTS.button, web_app: { url } }]] } } : {}),
      },
    }];
  }
  if (cmd === '/help') return [{ method: 'sendMessage', payload: { chat_id, text: TEXTS.help } }];
  return [{ method: 'sendMessage', payload: { chat_id, text: TEXTS.other } }];
}

/** Bot API chaqiruvi (token URL ichida — loglarga chiqarilmaydi) */
export async function callApi(token, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const json = await res.json().catch(() => ({ ok: false, description: 'JSON emas' }));
  return json;
}

/** Log uchun: token va maxfiy qiymatlarni yashirish */
export function redact(s, ...secrets) {
  let out = String(s);
  for (const x of secrets) if (x) out = out.split(x).join('***');
  return out.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***');
}
