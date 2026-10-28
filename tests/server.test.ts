import { describe, expect, it, vi, afterEach } from 'vitest';
// @ts-expect-error — oddiy JS modul (Worker va Node uchun umumiy)
import { signInitData, validateInitData } from '../server/initdata.mjs';
// @ts-expect-error — oddiy JS modul
import { replyFor, redact, TEXTS } from '../server/bot-logic.mjs';
// @ts-expect-error — oddiy JS modul
import worker from '../server/worker.mjs';

// Sinov tokeni (haqiqiy emas)
const TOKEN = '123456:TEST-token-not-real';
const SECRET = 'webhook-secret-test';
const now = () => Math.floor(Date.now() / 1000);

/** D1 o‘rnini bosuvchi xotiradagi baza */
function fakeDb() {
  const rows = new Map<string, { data: string; saved_at: number }>();
  return {
    rows,
    prepare(sql: string) {
      return {
        bind(...a: unknown[]) {
          return {
            first: async () => {
              const r = rows.get(String(a[0]));
              return r ? (sql.includes('data,') ? r : { saved_at: r.saved_at }) : null;
            },
            run: async () => { rows.set(String(a[0]), { data: String(a[1]), saved_at: Number(a[2]) }); },
          };
        },
      };
    },
  };
}

const env = (db = fakeDb()) => ({ BOT_TOKEN: TOKEN, WEBHOOK_SECRET: SECRET, WEB_APP_URL: 'https://example.github.io/ujp/', ALLOWED_ORIGIN: 'https://example.github.io', DB: db });
const initFor = (id: number, t = now()) => signInitData({ auth_date: String(t), query_id: 'q', user: JSON.stringify({ id, first_name: 'T' }) }, TOKEN);
const save = (n: number) => ({ schemaVersion: 10, placedObjects: Array.from({ length: n }, (_, i) => ({ id: 'o' + i })) });

afterEach(() => vi.restoreAllMocks());

describe('Telegram initData tekshiruvi', () => {
  it('to‘g‘ri imzo — foydalanuvchi aniqlanadi; o‘zgartirilgan, eskirgan yoki boshqa token — rad', async () => {
    const good = await initFor(42);
    const v = await validateInitData(good, TOKEN);
    expect(v.ok && v.user.id).toBe(42);
    // user ID ni o‘zgartirish (soxta foydalanuvchi) — imzo buziladi
    const forged = good.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
    expect((await validateInitData(forged, TOKEN)).ok).toBe(false);
    expect((await validateInitData(good, '999:other')).ok).toBe(false);
    expect((await validateInitData(await initFor(42, now() - 8 * 24 * 3600), TOKEN)).ok).toBe(false);
    expect((await validateInitData('', TOKEN)).ok).toBe(false);
  });
});

describe('Bot javoblari', () => {
  it('/start — matn va Web App tugmasi (faqat https); /help; boshqa xabar', () => {
    const [s] = replyFor({ message: { chat: { id: 7 }, text: '/start' } }, 'https://example.github.io/ujp/');
    expect(s.payload.text).toBe(TEXTS.start);
    expect(s.payload.text).toContain('🦖 Dinoshahar’ga xush kelibsiz!');
    expect(s.payload.reply_markup.inline_keyboard[0][0]).toEqual({ text: '🎮 O‘yinni ochish', web_app: { url: 'https://example.github.io/ujp/' } });
    const [noUrl] = replyFor({ message: { chat: { id: 7 }, text: '/start' } }, '');
    expect(noUrl.payload.reply_markup).toBeUndefined();
    const [http] = replyFor({ message: { chat: { id: 7 }, text: '/start@Jurassic_Park_game' } }, 'http://insecure');
    expect(http.payload.reply_markup).toBeUndefined();
    const [h] = replyFor({ message: { chat: { id: 7 }, text: '/help' } }, '');
    expect(h.payload.text).toMatch(/Kamera/);
    expect(h.payload.text).toMatch(/Qurilish/);
    expect(h.payload.text).toMatch(/Progress/);
    expect(replyFor({}, '')).toEqual([]);
  });

  it('loglarda token yashiriladi', () => {
    expect(redact(`xato https://api.telegram.org/bot${TOKEN}/sendMessage`, TOKEN)).not.toContain(TOKEN);
    expect(redact('bot1111111111:FAKEfakeFAKEfake-x')).toBe('bot***');
  });
});

describe('Server (Worker)', () => {
  const req = (path: string, init: RequestInit = {}) => new Request('https://w.example' + path, init);

  it('saqlash: faqat tekshirilgan foydalanuvchi; har foydalanuvchi alohida; eski nusxa yangisini bosmaydi', async () => {
    const e = env();
    expect((await worker.fetch(req('/api/save'), e)).status).toBe(401);
    const a = await initFor(1), b = await initFor(2);
    const put = (init: string, body: unknown) => worker.fetch(req('/api/save', { method: 'PUT', headers: { 'x-telegram-init-data': init }, body: JSON.stringify(body) }), e);
    expect((await put(a, { savedAt: 100, data: save(3) })).status).toBe(200);
    expect((await put(b, { savedAt: 100, data: save(5) })).status).toBe(200);
    const ga = await (await worker.fetch(req('/api/save', { headers: { 'x-telegram-init-data': a } }), e)).json();
    const gb = await (await worker.fetch(req('/api/save', { headers: { 'x-telegram-init-data': b } }), e)).json();
    expect([ga.data.placedObjects.length, gb.data.placedObjects.length]).toEqual([3, 5]);
    // eskiroq nusxa — 409, server nusxasi o‘zgarmaydi
    expect((await put(a, { savedAt: 50, data: save(1) })).status).toBe(409);
    expect(JSON.parse(e.DB.rows.get('1')!.data).placedObjects.length).toBe(3);
    // yaroqsiz shakl
    expect((await put(a, { savedAt: 200, data: { foo: 1 } })).status).toBe(400);
    // soxta initData bilan boshqa birovning shahrini o‘qib bo‘lmaydi
    expect((await worker.fetch(req('/api/save', { headers: { 'x-telegram-init-data': a.replace('hash=', 'hash=0') } }), e)).status).toBe(401);
  });

  it('webhook: maxfiy kalitsiz — 403; /start — Telegram ga Web App tugmali xabar; token logga chiqmaydi', async () => {
    const e = env();
    expect((await worker.fetch(req('/api/telegram/webhook', { method: 'POST', body: '{}' }), e)).status).toBe(403);
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { calls.push({ url, body: String(init.body) }); return new Response(JSON.stringify({ ok: false, description: `fail for bot${TOKEN}` })); });
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => { logs.push(a.join(' ')); });
    const r = await worker.fetch(req('/api/telegram/webhook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': SECRET }, body: JSON.stringify({ update_id: 1, message: { chat: { id: 9 }, text: '/start' } }) }), e);
    expect(r.status).toBe(200);
    expect(calls[0].url).toMatch(/\/sendMessage$/);
    expect(JSON.parse(calls[0].body).reply_markup.inline_keyboard[0][0].web_app.url).toBe('https://example.github.io/ujp/');
    expect(logs.join('\n')).not.toContain(TOKEN);
    vi.unstubAllGlobals();
  });

  it('health — maxfiy qiymat qaytarmaydi', async () => {
    const body = await (await worker.fetch(req('/api/health'), env())).text();
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain(SECRET);
  });
});
