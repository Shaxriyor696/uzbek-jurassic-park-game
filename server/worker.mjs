/**
 * O‘yin serveri (Cloudflare Worker, bepul tarif).
 *  POST /api/telegram/webhook — Telegram bot (webhook; polling bilan bir vaqtda ishlatilmaydi)
 *  GET  /api/save, PUT /api/save — foydalanuvchi shahri (D1). Foydalanuvchi faqat tekshirilgan initData dan.
 *  GET  /api/health — holat (maxfiy ma'lumotsiz)
 * Maxfiy: BOT_TOKEN, WEBHOOK_SECRET (wrangler secret). Oddiy: WEB_APP_URL, ALLOWED_ORIGIN (wrangler.toml [vars]).
 */
import { callApi, redact, replyFor } from './bot-logic.mjs';
import { validateInitData } from './initdata.mjs';

const MAX_SAVE_BYTES = 3 * 1024 * 1024;

function cors(env, req) {
  const origin = req.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin : allowed[0] || 'null',
    'access-control-allow-methods': 'GET, PUT, OPTIONS',
    'access-control-allow-headers': 'content-type, x-telegram-init-data',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

async function handleWebhook(req, env) {
  if (!env.WEBHOOK_SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
  let update;
  try { update = await req.json(); } catch { return new Response('ok'); }
  try {
    for (const r of replyFor(update, env.WEB_APP_URL)) {
      const res = await callApi(env.BOT_TOKEN, r.method, r.payload);
      if (!res.ok) console.log('bot xato:', redact(res.description, env.BOT_TOKEN, env.WEBHOOK_SECRET));
    }
  } catch (e) {
    console.log('bot istisno:', redact(String(e), env.BOT_TOKEN, env.WEBHOOK_SECRET));
  }
  // Telegram qayta yubormasligi uchun doim 200
  return new Response('ok');
}

async function auth(req, env) {
  const v = await validateInitData(req.headers.get('x-telegram-init-data') || '', env.BOT_TOKEN);
  return v.ok ? String(v.user.id) : null;
}

async function handleSave(req, env, h) {
  if (!env.DB) return json({ error: 'saqlash bazasi ulanmagan' }, 503, h);
  const uid = await auth(req, env);
  if (!uid) return json({ error: 'Telegram initData tekshiruvdan o‘tmadi' }, 401, h);
  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT data, saved_at FROM saves WHERE user_id = ?').bind(uid).first();
    return json(row ? { data: JSON.parse(row.data), savedAt: row.saved_at } : { data: null, savedAt: 0 }, 200, h);
  }
  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_SAVE_BYTES) return json({ error: 'saqlash juda katta' }, 413, h);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'JSON noto‘g‘ri' }, 400, h); }
    const d = body?.data, savedAt = Number(body?.savedAt);
    if (!d || typeof d !== 'object' || !Array.isArray(d.placedObjects) || !Number.isFinite(savedAt)) return json({ error: 'saqlash shakli noto‘g‘ri' }, 400, h);
    const prev = await env.DB.prepare('SELECT saved_at FROM saves WHERE user_id = ?').bind(uid).first();
    // eskiroq nusxa yangisini bosib ketmaydi (boshqa qurilmada keyinroq saqlangan bo'lsa)
    if (prev && prev.saved_at > savedAt && !body.force) return json({ error: 'serverda yangiroq nusxa bor', savedAt: prev.saved_at }, 409, h);
    await env.DB.prepare('INSERT INTO saves (user_id, data, saved_at, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id) DO UPDATE SET data = ?2, saved_at = ?3, updated_at = ?4')
      .bind(uid, JSON.stringify(d), savedAt, Date.now()).run();
    return json({ ok: true, savedAt }, 200, h);
  }
  return json({ error: 'metod' }, 405, h);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    try {
      if (url.pathname === '/api/telegram/webhook' && req.method === 'POST') return await handleWebhook(req, env);
      if (url.pathname === '/api/save') return await handleSave(req, env, h);
      if (url.pathname === '/api/health') return json({ ok: true, bot: !!env.BOT_TOKEN, db: !!env.DB, webApp: !!env.WEB_APP_URL }, 200, h);
      return json({ error: 'topilmadi' }, 404, h);
    } catch (e) {
      console.log('server xato:', redact(String(e), env.BOT_TOKEN, env.WEBHOOK_SECRET));
      return json({ error: 'server xatosi' }, 500, h);
    }
  },
};
