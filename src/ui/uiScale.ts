/**
 * Kompyuter ekranida interfeys o‘lchami: dizayn 1920×1050 ko‘rinishida tuzilgan — kichikroq oynada (masalan, noutbuk
 * 1440×790) interfeys brauzer zoomi kabi mutanosib kichrayadi (75% gacha), xarita (3D sahna) o‘zgarmaydi.
 * Telefon/planshet (sensorli) va kichik oynada — 1 (ixcham joylashuv o‘z CSS qoidalari bilan).
 */
const BASE_W = 1920, BASE_H = 1050, MIN = 0.72;

export function uiScale(w = window.innerWidth, h = window.innerHeight, coarse = matchMedia('(pointer: coarse)').matches): number {
  if (coarse || w < 1000 || h < 560) return 1;
  return Math.max(MIN, Math.min(1, w / BASE_W, h / BASE_H));
}

export function initUiScale() {
  const apply = () => document.documentElement.style.setProperty('--ui-scale', uiScale().toFixed(3));
  apply();
  window.addEventListener('resize', apply);
}
