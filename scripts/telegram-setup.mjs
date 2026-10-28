/**
 * Botni sozlash (qayta ishlatiladigan): node scripts/telegram-setup.mjs [--webhook] [--delete-webhook]
 *  - getMe: token tekshiruvi
 *  - setMyCommands (/start, /help), bot tavsiflari
 *  - WEB_APP_URL https bo'lsa: menyu tugmasi «🎮 O‘ynash» (Web App)
 *  - --webhook: API_PUBLIC_URL/api/telegram/webhook ga webhook (WEBHOOK_SECRET bilan); --delete-webhook: o'chirish
 * Token va maxfiy qiymatlar konsolga chiqmaydi.
 */
import { callApi, COMMANDS, isHttpsUrl, redact, TEXTS } from '../server/bot-logic.mjs';
import { loadEnv } from './env.mjs';

const env = loadEnv();
const T = env.BOT_TOKEN;
const say = (...a) => console.log(redact(a.join(' '), T, env.WEBHOOK_SECRET));
if (!T) { say('BOT_TOKEN yo‘q (.env yoki muhit o‘zgaruvchisi). To‘xtatildi.'); process.exit(1); }
const args = new Set(process.argv.slice(2));
const call = async (m, p) => { const r = await callApi(T, m, p); say(`${m}:`, r.ok ? 'OK' : `XATO — ${r.description}`); return r; };

const me = await call('getMe');
if (!me.ok) process.exit(1);
say(`Bot: @${me.result.username} (${me.result.first_name})`);
await call('setMyCommands', { commands: COMMANDS });
await call('setMyDescription', { description: 'O‘zbekiston muhitidagi 3D shahar qurish o‘yini: uylar, yo‘llar, biznes va xizmat binolarini quring, budjetni boshqaring va shaharni dinozavrlardan himoya qiling. Boshlash: /start' });
await call('setMyShortDescription', { short_description: 'Shahar quring va uni dinozavrlardan himoya qiling 🦖' });
if (isHttpsUrl(env.WEB_APP_URL)) {
  await call('setChatMenuButton', { menu_button: { type: 'web_app', text: TEXTS.menu, web_app: { url: env.WEB_APP_URL } } });
} else say('WEB_APP_URL https emas yoki bo‘sh — menyu tugmasi (Web App) hali o‘rnatilmadi.');
if (args.has('--delete-webhook')) await call('deleteWebhook', { drop_pending_updates: false });
if (args.has('--webhook')) {
  if (!isHttpsUrl(env.API_PUBLIC_URL) || !env.WEBHOOK_SECRET) say('Webhook uchun API_PUBLIC_URL (https) va WEBHOOK_SECRET kerak.');
  else await call('setWebhook', { url: env.API_PUBLIC_URL.replace(/\/$/, '') + '/api/telegram/webhook', secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message'], drop_pending_updates: false });
}
const info = await callApi(T, 'getWebhookInfo');
if (info.ok) say(`Webhook: ${info.result.url ? 'yoqilgan (' + new URL(info.result.url).host + ')' : 'yo‘q'}; kutayotgan update: ${info.result.pending_update_count}${info.result.last_error_message ? '; oxirgi xato: ' + info.result.last_error_message : ''}`);
