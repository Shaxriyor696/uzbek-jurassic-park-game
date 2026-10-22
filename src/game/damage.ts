import { CATALOG } from './catalog';
import { isDefense } from './defenseDefs';
import type { PlacedObject } from './types';

/**
 * Dinozavr zarari va ta’mirlash (yagona sozlama). Qon, jarohat yo‘q — faqat bino/devor shikastlanishi.
 * damage 0..1: bino 1 ga yetsa ishlamay qoladi (elektr/suv uzilgan kabi); devor/darvoza 1 ga yetsa buziladi —
 * o‘sha joy ochiq joyga aylanadi (dinozavr o‘tadi). Ta’mirlash pullik va qisqa qurilish (tugaguncha himoya emas).
 */
export const DAMAGE_CONFIG = {
  /** Bino yonida tinmay turgan dinozavr shuncha soniyada binoni ishdan chiqaradi */
  buildingSeconds: 8,
  /** Devor/darvoza yonida urinayotgan dinozavr(lar) jami shuncha soniyada qismni buzadi */
  wallSeconds: 60,
  /** Ta’mirlash qurilishi (o‘yin soniyasi) */
  repairSeconds: 10,
  /** Ta’mirlash narxi: narxning shu ulushi × shikast (kamida 20%) */
  repairShare: 0.3,
};

export const isBroken = (o: PlacedObject) => (o.damage ?? 0) >= 1;

/** Shikastlanishi mumkin: shahar binolari va himoya qismlari (yo‘l, bezak — yo‘q) */
export function damageable(o: PlacedObject): boolean {
  return o.type !== 'road' && CATALOG[o.type].kind !== 'decor' && !o.build;
}

export function repairCost(o: PlacedObject): number {
  const d = Math.max(0.2, Math.min(1, o.damage ?? 0));
  return Math.max(10, Math.round(CATALOG[o.type].price * DAMAGE_CONFIG.repairShare * d));
}

/** Nuqtadan bino to‘rtburchagigacha masofa (katak) */
export function rectDist(x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }): number {
  const dx = Math.max(r.x0 - x, 0, x - (r.x1 + 1)), dz = Math.max(r.z0 - z, 0, z - (r.z1 + 1));
  return Math.hypot(dx, dz);
}

export { isDefense };
