/**
 * Telegram Mini App initData tekshiruvi (rasmiy tartib: core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *   secret_key = HMAC_SHA256(key = "WebAppData", msg = bot_token)
 *   hash       = hex(HMAC_SHA256(key = secret_key, msg = data_check_string))
 * data_check_string — hash dan boshqa barcha maydonlar, alifbo tartibida «key=value», «\n» bilan.
 * Frontend yuborgan user ID yoki initDataUnsafe ga ishonilmaydi — faqat shu tekshiruvdan o'tgan user.
 * WebCrypto (Cloudflare Worker va Node 18+ da bir xil).
 */
const enc = new TextEncoder();

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Vaqt bo'yicha teng solishtirish */
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * @returns {Promise<{ ok: true, user: { id: number, first_name?: string, username?: string }, authDate: number } | { ok: false, error: string }>}
 */
export async function validateInitData(initData, botToken, maxAgeSec = 7 * 24 * 3600, now = Math.floor(Date.now() / 1000)) {
  if (!initData || typeof initData !== 'string' || initData.length > 8192) return { ok: false, error: 'initData yo‘q' };
  if (!botToken) return { ok: false, error: 'server sozlanmagan' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'hash yo‘q' };
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac('WebAppData', botToken);
  const calc = hex(await hmac(secret, check));
  if (!same(calc, hash.toLowerCase())) return { ok: false, error: 'imzo noto‘g‘ri' };
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now - authDate > maxAgeSec) return { ok: false, error: 'initData eskirgan' };
  let user;
  try { user = JSON.parse(params.get('user') ?? 'null'); } catch { user = null; }
  if (!user || !Number.isInteger(user.id)) return { ok: false, error: 'user yo‘q' };
  return { ok: true, user, authDate };
}

/** Sinovlar uchun: berilgan maydonlardan to'g'ri imzolangan initData */
export async function signInitData(fields, botToken) {
  const p = new URLSearchParams(fields);
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac('WebAppData', botToken);
  p.set('hash', hex(await hmac(secret, check)));
  return p.toString();
}
