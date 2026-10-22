import { getBrowserStorage, SAVE_KEY, validateSave, type KeyValueStorage } from '../game/saveStore';

/**
 * Telegram Mini App integratsiyasi (rasmiy SDK: telegram.org/js/telegram-web-app.js — index.html da).
 * SDK yo‘q yoki oddiy brauzer (initData bo‘sh) — o‘yin odatdagidek ishlaydi.
 *
 * Saqlash: Telegram ichida har foydalanuvchining shahri qurilmada alohida kalitda (`tg.<id>.` prefiksi — bitta
 * qurilmada bir nechta Telegram hisobi aralashmaydi). Prefiks uchun initDataUnsafe ishlatiladi, lekin serverda
 * foydalanuvchi faqat imzosi tekshirilgan initData dan aniqlanadi. Eski (prefikssiz) brauzer shahri faqat
 * o‘yinchi roziligi bilan ko‘chiriladi.
 */

interface TgWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string } };
  version: string;
  platform: string;
  isVersionAtLeast?(v: string): boolean;
  ready(): void;
  expand(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  showConfirm?(msg: string, cb: (ok: boolean) => void): void;
  onEvent(e: string, cb: (...a: unknown[]) => void): void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void; isVisible: boolean };
  viewportStableHeight?: number;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
}

export function tgApp(): TgWebApp | null {
  const w = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return w && w.initData ? w : null;
}

export const inTelegram = () => !!tgApp();

/** API manzili (build vaqtida VITE_API_URL — maxfiy emas) */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/** Kalitlarga prefiks qo‘shadigan saqlash (Telegram foydalanuvchisi uchun) */
class PrefixedStorage implements KeyValueStorage {
  constructor(private base: KeyValueStorage, private prefix: string) {}
  getItem(k: string) { return this.base.getItem(this.prefix + k); }
  setItem(k: string, v: string) { this.base.setItem(this.prefix + k, v); onSaveWritten(k); }
  removeItem(k: string) { this.base.removeItem(this.prefix + k); }
}

const META = 'ujp.cloud.meta';
let storage: KeyValueStorage | null = null;
let storageBase: KeyValueStorage | null = null;
let prefix = '';
let cloudTimer: ReturnType<typeof setTimeout> | null = null;

/** Oxirgi lokal saqlash vaqti va bulutga yuborilmaganlar */
function meta(): { savedAt: number; pending: boolean } {
  try { return { savedAt: 0, pending: false, ...JSON.parse(storage?.getItem(META) ?? '{}') }; } catch { return { savedAt: 0, pending: false }; }
}

/** Lokal saqlash yozildi — bulutga yuborish navbatga (tez-tez emas; uzilishda keyinroq qayta) */
function onSaveWritten(key: string) {
  if (key !== SAVE_KEY || !API_URL || !tgApp()) return;
  setMetaRaw({ savedAt: Date.now(), pending: true });
  scheduleUpload(15000);
}
function setMetaRaw(m: { savedAt: number; pending: boolean }) {
  try { (storageBase ?? null)?.setItem(prefix + META, JSON.stringify(m)); } catch { /* */ }
}
export function scheduleUpload(ms: number) {
  if (cloudTimer) return;
  cloudTimer = setTimeout(() => { cloudTimer = null; void uploadNow(); }, ms);
}

export type CloudState = 'off' | 'synced' | 'pending' | 'offline' | 'error';
let cloudState: CloudState = 'off';
export const cloudStatus = () => cloudState;

/** Joriy saqlashni serverga yuborish (keepalive — ilova yopilayotganda ham) */
export async function uploadNow(keepalive = false): Promise<void> {
  const app = tgApp();
  if (!app || !API_URL || !storage) return;
  const m = meta();
  if (!m.pending) return;
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    const res = await fetch(API_URL + '/api/save', {
      method: 'PUT', keepalive: keepalive && raw.length < 60000,
      headers: { 'content-type': 'application/json', 'x-telegram-init-data': app.initData },
      body: `{"savedAt":${m.savedAt},"data":${raw}}`,
    });
    if (res.ok) { setMetaRaw({ savedAt: m.savedAt, pending: false }); cloudState = 'synced'; }
    else if (res.status === 409) { cloudState = 'error'; }
    else { cloudState = 'error'; scheduleUpload(60000); }
  } catch {
    // tarmoq uzildi — lokal nusxa joyida, keyinroq qayta urinadi
    cloudState = 'offline';
    scheduleUpload(30000);
  }
}

function confirmAsk(msg: string): Promise<boolean> {
  const app = tgApp();
  if (app?.showConfirm && app.isVersionAtLeast?.('6.2')) return new Promise((r) => app.showConfirm!(msg, (ok) => r(!!ok)));
  return Promise.resolve(window.confirm(msg));
}

async function fetchCloud(app: TgWebApp): Promise<{ data: unknown; savedAt: number } | null> {
  if (!API_URL) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(API_URL + '/api/save', { headers: { 'x-telegram-init-data': app.initData }, signal: ctl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * O‘yindan oldin: saqlash joyini tanlash (Telegram — foydalanuvchi bo‘yicha), bulutdan yangiroq nusxani olish,
 * eski brauzer shahrini (rozilik bilan) ko‘chirish. Tarmoq bo‘lmasa — lokal nusxa bilan davom etadi.
 */
export async function prepareStorage(): Promise<KeyValueStorage | null> {
  const base = getBrowserStorage();
  const app = tgApp();
  const uid = app?.initDataUnsafe?.user?.id;
  if (!app || !base || !uid) { storage = base; return base; }
  storageBase = base;
  prefix = `tg.${uid}.`;
  storage = new PrefixedStorage(base, prefix);
  cloudState = API_URL ? 'pending' : 'off';
  const local = base.getItem(prefix + SAVE_KEY);
  const m = meta();
  const cloud = await fetchCloud(app);
  if (cloud && cloud.data && validateSave(cloud.data) === null && cloud.savedAt > m.savedAt) {
    // boshqa qurilmada keyinroq saqlangan — yuklanadi; lokal nusxa zaxiraga
    if (local) base.setItem(prefix + SAVE_KEY + '.before-cloud', local);
    base.setItem(prefix + SAVE_KEY, JSON.stringify(cloud.data));
    setMetaRaw({ savedAt: cloud.savedAt, pending: false });
    cloudState = 'synced';
  } else if (cloud) cloudState = m.pending ? 'pending' : 'synced';
  else if (API_URL) cloudState = 'offline';
  if (!base.getItem(prefix + SAVE_KEY)) {
    const legacy = base.getItem(SAVE_KEY);
    if (legacy && (await confirmAsk('Bu qurilmada avval o‘ynalgan shahar bor. Uni Telegram hisobingizga ko‘chiraymi?\n(Rad etsangiz — yangi shahar boshlanadi, eski shahar o‘chirilmaydi.)'))) {
      base.setItem(prefix + SAVE_KEY, legacy);
      setMetaRaw({ savedAt: Date.now(), pending: true });
    }
  }
  if (meta().pending) scheduleUpload(3000);
  return storage;
}

export function gameStorage(): KeyValueStorage | null {
  return storage ?? getBrowserStorage();
}

/** Telegram muhitini sozlash: kengaytirish, fullscreen (mobil), xavfsiz hudud, fon rejimi */
export function initTelegramShell(onActive: (active: boolean) => void) {
  const app = tgApp();
  const root = document.documentElement;
  if (!app) return;
  root.classList.add('in-telegram');
  try {
    app.expand();
    app.setHeaderColor?.('#0f2a4d');
    app.setBackgroundColor?.('#0f2a4d');
    if (app.isVersionAtLeast?.('7.7')) app.disableVerticalSwipes?.();
    // fullscreen faqat telefonlarda (8.0+), kompyuterda emas
    if (app.isVersionAtLeast?.('8.0') && /android|ios/i.test(app.platform)) app.requestFullscreen?.();
  } catch { /* eski klient */ }
  const applyInsets = () => {
    const s = app.safeAreaInset, c = app.contentSafeAreaInset;
    const top = (s?.top ?? 0) + (c?.top ?? 0), bottom = (s?.bottom ?? 0) + (c?.bottom ?? 0);
    root.style.setProperty('--safe-top', top + 'px');
    root.style.setProperty('--safe-bottom', bottom + 'px');
    root.style.setProperty('--safe-left', (s?.left ?? 0) + (c?.left ?? 0) + 'px');
    root.style.setProperty('--safe-right', (s?.right ?? 0) + (c?.right ?? 0) + 'px');
    window.dispatchEvent(new Event('resize'));
  };
  applyInsets();
  for (const e of ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged', 'fullscreenChanged']) app.onEvent(e, applyInsets);
  // ilova fon rejimiga o‘tdi (8.0+): simulyatsiya, render va ovoz pauza
  app.onEvent('deactivated', () => { onActive(false); void uploadNow(true); });
  app.onEvent('activated', () => onActive(true));
  window.addEventListener('pagehide', () => void uploadNow(true));
}

/** Telegram «orqaga» tugmasi: avval ichki oyna/menyu yopiladi */
export function bindBackButton(canGoBack: () => boolean, goBack: () => void): () => void {
  const app = tgApp();
  const bb = app?.BackButton;
  if (!bb || !app.isVersionAtLeast?.('6.1')) return () => {};
  const click = () => goBack();
  bb.onClick(click);
  const iv = setInterval(() => { const v = canGoBack(); if (v && !bb.isVisible) bb.show(); else if (!v && bb.isVisible) bb.hide(); }, 250);
  return () => { clearInterval(iv); bb.offClick(click); bb.hide(); };
}

/** Tayyor — Telegram yuklanish ekranini yopadi */
export function telegramReady() {
  try { tgApp()?.ready(); } catch { /* */ }
}
