import { ensureEngine } from './index';
import { SOUNDS } from './audioConfig';
import type { AudioEngine, Voice } from './audioEngine';

/**
 * Yuklanish ekranidagi intro bo‘kirishi — global effekt, sahifa ochilishida ko‘pi bilan BIR marta (holat modul
 * darajasida: React qayta render qilsa ham, hodisa takror kelsa ham qayta boshlanmaydi; loop yo‘q).
 *
 * - Brauzer/Telegram ruxsat bersa — logo bilan birga yangraydi.
 * - Ruxsat bo‘lmasa (o‘yinchi hali hech narsa bosmagan — brauzer ovozni bloklaydi): yuklanish ekrani logo bilan
 *   qoladi, shahar tayyor bo‘lgach «Boshlash uchun bosing»; ekranga bosish — bo‘kirish shu yerda, keyin shahar.
 *   Bo‘kirish o‘yin ichida kechikib yangramaydi.
 * - Ovoz o‘chiq (mute) — intro ham, kutish ham yo‘q.
 * - O‘yin bu orada fonda yuklanaveradi; «Shahar yuklanmoqda…» faqat sahna tayyor bo‘lguncha.
 * - Sahna tayyor bo‘lganda intro davom etsa — ko‘pi bilan HOLD_MS gacha kutiladi, keyin qisqa fade-out.
 * - Sahifa yoki Telegram fon rejimiga o‘tsa — intro to‘xtaydi va qaytganda qayta boshlanmaydi.
 * - Fayl yuklanmasa/ijro xatosi — jim, o‘yin davom etadi.
 */

/** Ijro boshidan splash ko‘pi bilan shuncha turadi (bo‘kirishning asosiy qismi ~3 s, qolgani so‘nayotgan dum) */
const HOLD_MS = 3200;
/** Shahar tayyor bo‘lgandan keyin fayl ~2.5 s da ham tayyor bo‘lmasa — intro o‘tkaziladi (kechikib yangramasin).
 *  100 ms lik tekshiruvlar soni bilan sanaladi: sahna/birinchi kadrlar asosiy oqimni band qilganda devor soati
 *  «o‘tib ketadi», tayyor fayl esa navbatda turgan bo‘ladi. */
const LATE_TICKS = 25;
/** Tarmoq osilib qolsa — xavfsizlik chegarasi */
const LOAD_SAFETY_MS = 15000;
const FADE_OUT = 0.45;
const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;

type State = 'off' | 'checking' | 'armed' | 'playing' | 'done';
let state: State = 'off';
let engine: AudioEngine | null = null;
let voice: Voice | null = null;
let playStartedAt = 0;
let sceneReady = false;
let lateTicks = 0;
let splashGone = false;
let holdTimer: ReturnType<typeof setTimeout> | null = null;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const splashEl = () => document.getElementById('splash');

/** Diagnostika va sinovlar */
export const introDebug = { plays: 0, armed: 0, skippedReason: '' as string, t: {} as Record<string, number> };
export const introState = () => state;

export function startIntro() {
  if (state !== 'off') return;
  const splash = splashEl();
  if (!splash) { state = 'done'; return; }
  // Avtomatik sinovlar (?test=1) — bo‘kirish sinov bosishlariga aralashmasin; ?intro=1 bilan sinovda ham yoqiladi
  const q = new URLSearchParams(location.search);
  if (q.has('test')) (window as unknown as { __INTRO__?: unknown }).__INTRO__ = { debug: introDebug, state: introState };
  if (q.has('test') && !q.has('intro')) return finish('test');
  try { engine = ensureEngine(); } catch { return finish('no-engine'); }
  if (engine.settings.muted) return finish('muted');
  state = 'checking';
  document.addEventListener('visibilitychange', onVisibility);
  try {
    (window as unknown as { Telegram?: { WebApp?: { onEvent?(e: string, cb: () => void): void } } }).Telegram?.WebApp?.onEvent?.('deactivated', () => interrupt('background'));
  } catch { /* SDK yo‘q */ }
  engine.unlock(); // kontekst yaratiladi; ruxsat bo‘lmasa «suspended» qoladi
  const ctx = engine.ctx;
  if (!ctx) return finish('no-audio');
  introDebug.t.start = performance.now();
  void engine.load(SOUNDS.introRoar.files[0]).then(() => { introDebug.t.loaded = performance.now(); }); // fonda oldindan yuklanadi
  void Promise.race([ctx.resume().catch(() => {}), wait(400)]).then(() => {
    if (state !== 'checking') return;
    if (ctx.state === 'running') void play();
    else arm();
  });
}

/** Ruxsat yo‘q — yuklanish ekranida birinchi bosish/teginish/klavishni kutamiz (aynan shu harakat ichida ovoz yoqiladi) */
function arm() {
  if (splashGone || !splashEl()) return finish('no-splash');
  state = 'armed';
  splashEl()!.style.cursor = 'pointer';
  updateLoadingText();
  introDebug.armed++;
  for (const ev of GESTURES) window.addEventListener(ev, onGesture, { capture: true });
}

function disarm() {
  for (const ev of GESTURES) window.removeEventListener(ev, onGesture, { capture: true });
}

function onGesture() {
  if (state !== 'armed') return;
  disarm();
  engine?.unlock();
  void engine?.ctx?.resume().catch(() => {});
  void play();
}

async function play() {
  if (!engine || (state !== 'checking' && state !== 'armed')) return;
  state = 'playing';
  updateLoadingText();
  const buf = await Promise.race([engine.load(SOUNDS.introRoar.files[0]), wait(LOAD_SAFETY_MS).then(() => null)]);
  if (state !== 'playing') return; // shu orada fon rejimi va hokazo
  if (!buf || engine.settings.muted) return finish(buf ? 'muted' : 'load-failed');
  // ruxsat bir zum kechikib kelishi mumkin — kontekst yoqilishini kutamiz (cheklangan vaqt)
  const ctx = engine.ctx;
  if (ctx && ctx.state !== 'running') {
    await new Promise<void>((res) => {
      const t = setTimeout(res, 4000);
      ctx.addEventListener('statechange', () => { if (ctx.state === 'running') { clearTimeout(t); res(); } });
      void ctx.resume().catch(() => {});
    });
  }
  if (state !== 'playing') return;
  try {
    voice = engine.play('introRoar', { fadeIn: 0.04 });
  } catch { voice = null; }
  if (!voice) return finish('play-failed');
  introDebug.plays++;
  playStartedAt = performance.now();
  engine.setDuck(true);
  const dur = (buf.duration ?? 5) * 1000;
  setTimeout(() => { if (state === 'playing') finish('ended'); }, dur + 50);
  maybeHideSplash();
}

/** Fon rejimi: intro to‘xtaydi, qaytganda qayta boshlanmaydi */
function interrupt(reason: string) {
  if (state === 'done' || state === 'off') return;
  voice?.stop(0.05);
  finish(reason);
}

function onVisibility() {
  if (document.visibilityState === 'hidden') interrupt('hidden');
}

function finish(reason: string) {
  if (state === 'done') return;
  const wasPlaying = state === 'playing';
  state = 'done';
  introDebug.skippedReason = introDebug.skippedReason || reason;
  if (wasPlaying && voice && !voice.ended) voice.stop(FADE_OUT);
  voice = null;
  engine?.setDuck(false);
  disarm();
  document.removeEventListener('visibilitychange', onVisibility);
  updateLoadingText();
  maybeHideSplash();
}

/** «Shahar yuklanmoqda…» — faqat haqiqatan yuklanayotganda; tayyor bo‘lib bosish kutilsa — «Boshlash uchun bosing» */
function updateLoadingText() {
  const p = splashEl()?.querySelector('p');
  if (!p) return;
  if (!sceneReady) { p.textContent = 'Shahar yuklanmoqda…'; p.style.visibility = 'visible'; p.classList.remove('tap'); }
  else if (state === 'armed') { p.textContent = 'Boshlash uchun bosing'; p.style.visibility = 'visible'; p.classList.add('tap'); }
  else p.style.visibility = 'hidden';
}

/** Sahna tayyor (App) — splash intro holatiga qarab yopiladi */
export function introSceneReady() {
  if (sceneReady) return;
  sceneReady = true;
  introDebug.t.sceneReady = performance.now();
  updateLoadingText();
  maybeHideSplash();
}

function maybeHideSplash() {
  if (!sceneReady || splashGone) return;
  if (state === 'armed') return; // o‘yinchi bosishi kutilmoqda (shahar fonda tayyor)
  if (state === 'checking') { // ruxsat tekshiruvi (≤0.4 s)
    if (!holdTimer) holdTimer = setTimeout(() => { holdTimer = null; maybeHideSplash(); }, 100);
    return;
  }
  if (state === 'playing' && !voice) {
    // fayl hali tayyorlanmoqda — shahar tayyor bo‘lgach ko‘pi bilan LATE_MS kutiladi, keyin intro o‘tkaziladi
    if (++lateTicks > LATE_TICKS) { introDebug.t.late = performance.now(); finish('late'); hideSplash(); return; }
    if (!holdTimer) holdTimer = setTimeout(() => { holdTimer = null; maybeHideSplash(); }, 100);
    return;
  }
  if (state === 'playing') {
    const left = HOLD_MS - (performance.now() - playStartedAt);
    if (left > 0) {
      if (!holdTimer) holdTimer = setTimeout(() => { holdTimer = null; maybeHideSplash(); }, left);
      return;
    }
    // sahna ochilmoqda — qolgan dum qismi qisqa fade bilan tugaydi
    finish('scene-open');
  }
  hideSplash();
}

function hideSplash() {
  if (splashGone) return;
  splashGone = true;
  const splash = splashEl();
  if (!splash) return;
  requestAnimationFrame(() => splash.classList.add('hide'));
  setTimeout(() => splash.remove(), 700);
}

/** Sahna yaratilmadi (xato ekrani) — intro va splash darhol yo‘qoladi */
export function introAbort() {
  finish('fatal');
  splashGone = true;
  splashEl()?.remove();
}
