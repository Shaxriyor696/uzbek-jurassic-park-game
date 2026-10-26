import { CATALOG } from './catalog';
import { isDefense } from './defenseDefs';
import type { PlacedObject } from './types';

/**
 * Dinozavr zarari va ta’mirlash (yagona sozlama). Qon, jarohat yo‘q — faqat bino/devor shikastlanishi.
 * damage 0..1: bino 1 ga yetsa ishlamay qoladi (elektr/suv uzilgan kabi); devor/darvoza 1 ga yetsa buziladi —
 * o‘sha joy ochiq joyga aylanadi (dinozavr o‘tadi). Ta’mirlash pullik va qisqa qurilish (tugaguncha himoya emas).
 */
export const DAMAGE_CONFIG = {
  /** Bino yonida tinmay urayotgan dinozavr shuncha soniyada binoni ishdan chiqaradi (bir hujum ≈ 20–30% — qisman zarar) */
  buildingSeconds: 28,
  /** Devor/darvoza yonida urinayotgan dinozavr(lar) jami shuncha soniyada qismni buzadi */
  wallSeconds: 60,
  /** Ta’mirlash qurilishi (o‘yin soniyasi) */
  repairSeconds: 10,
  /** Ta’mirlash narxi: narxning shu ulushi × shikast (kamida 25%) — arzon emas, himoya foydaliroq */
  repairShare: 0.55,
};

export const isBroken = (o: PlacedObject) => (o.damage ?? 0) >= 1;

/** Ko‘rinish bosqichi: 0 — butun, 1 — yoriqlar, 2 — qiyshaygan va tutun, 3 — og‘ir, 4 — ishdan chiqqan (qulagan) */
export function damageStage(d: number | undefined): 0 | 1 | 2 | 3 | 4 {
  const v = d ?? 0;
  return v >= 1 ? 4 : v >= 0.75 ? 3 : v >= 0.45 ? 2 : v >= 0.12 ? 1 : 0;
}

/** Hujum to‘lqinlari: shahar rivojiga qarab (binolar soni) — kichik shaharga kam va kichik, katta shaharga tez-tez */
export const RAID_WAVES = {
  /** Shuncha shahar binosi bo‘lmaguncha hujum yo‘q */
  minBuildings: 3,
  /** Yangi shahar / yuklashdan keyin birinchi to‘lqingacha (s) */
  firstDelay: 150,
  /** To‘lqinlar oralig‘i: max(minGap, baseGap − binolar × perBuilding) + 0..jitter (s) */
  baseGap: 260, perBuilding: 4, minGap: 90, jitter: 40,
  /** Bir to‘lqindagi dinozavrlar: binolar < 8 → 1, < 20 → 2, aks holda 3 */
  party: (buildings: number) => (buildings < 8 ? 1 : buildings < 20 ? 2 : 3),
};

/** Shikastlanishi mumkin: shahar binolari va himoya qismlari (yo‘l, bezak — yo‘q) */
export function damageable(o: PlacedObject): boolean {
  return o.type !== 'road' && CATALOG[o.type].kind !== 'decor' && !o.build;
}

export function repairCost(o: PlacedObject): number {
  const d = Math.max(0.25, Math.min(1, o.damage ?? 0));
  return Math.max(10, Math.round(CATALOG[o.type].price * DAMAGE_CONFIG.repairShare * d));
}

/** Nuqtadan bino to‘rtburchagigacha masofa (katak) */
export function rectDist(x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }): number {
  const dx = Math.max(r.x0 - x, 0, x - (r.x1 + 1)), dz = Math.max(r.z0 - z, 0, z - (r.z1 + 1));
  return Math.hypot(dx, dz);
}

export { isDefense };
