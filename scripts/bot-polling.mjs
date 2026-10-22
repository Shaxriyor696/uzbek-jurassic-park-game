/**
 * Lokal sinov uchun polling (kompyuter yoqiq bo'lgandagina ishlaydi). Doimiy ishlash — Worker webhook.
 * Webhook yoqilgan bo'lsa ishga tushmaydi (ikkalasi bir vaqtda ishlamaydi): avval `node scripts/telegram-setup.mjs --delete-webhook`.
 *   node scripts/bot-polling.mjs [--once]
 */
import { callApi, redact, replyFor } from '../server/bot-logic.mjs';
import { loadEnv } from './env.mjs';

const env = loadEnv();
const T = env.BOT_TOKEN;
const say = (...a) => console.log(redact(a.join(' '), T, env.WEBHOOK_SECRET));
if (!T) { say('BOT_TOKEN yo‘q.'); process.exit(1); }
const info = await callApi(T, 'getWebhookInfo');
if (info.ok && info.result.url) { say('Webhook yoqilgan — polling ishga tushirilmadi (to‘qnashuv bo‘lmasin).'); process.exit(2); }
const once = process.argv.includes('--once');
let offset = 0;
say('Polling boshlandi', once ? '(bir marta)' : '');
for (;;) {
  const r = await callApi(T, 'getUpdates', { offset, timeout: once ? 0 : 30, allowed_updates: ['message'] });
  if (!r.ok) { say('getUpdates xato:', r.description); if (r.error_code === 409) process.exit(3); await new Promise((s) => setTimeout(s, 3000)); continue; }
  for (const u of r.result) {
    offset = u.update_id + 1;
    for (const x of replyFor(u, env.WEB_APP_URL)) {
      const res = await callApi(T, x.method, x.payload);
      say(`→ ${x.method}:`, res.ok ? 'OK' : res.description);
    }
  }
  if (once) break;
}
