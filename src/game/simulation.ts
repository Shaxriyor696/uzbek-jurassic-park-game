import { computeBudget, TAX_PER_RESIDENT } from './budget';
import { CATALOG } from './catalog';
import type { ObjectStatus, PlacedObject, TickReport } from './types';
import type { SupplyKind } from './utilities';

export { TAX_PER_RESIDENT };

/** PRD 05: har 10 soniya faol simulyatsiya = bir hisob davri. */
export const TICK_SECONDS = 10;
export const START_MONEY = 500_000;
/** Fon tabdan qaytganda katta sakrash bo‘lmasligi uchun bitta kadrdagi maksimal dt. */
export const MAX_FRAME_DT = 0.25;

/** To‘liq ta’minlangan uyga bir davrda ko‘pi bilan shuncha kishi ko‘chib keladi. */
export const MOVE_IN_PER_TICK = 2;
/** Ta’minot uzilgach shuncha davr faqat ogohlantirish bo‘ladi, hech kim ketmaydi. */
export const OUTAGE_GRACE_TICKS = 3;
/** Ogohlantirish muddatidan keyin bir davrda ko‘pi bilan shuncha kishi ketadi (muammolar soniga bog‘liq emas). */
export const MOVE_OUT_PER_TICK = 1;

/** Yetishmayotgan ta’minot, ustuvorlik tartibida: yo‘l → elektr → suv. */
export function missingSupplies(st: Pick<ObjectStatus, 'road' | 'power' | 'water'> | undefined): SupplyKind[] {
  const out: SupplyKind[] = [];
  if (!st || !st.road) out.push('road');
  if (!st || !st.power) out.push('power');
  if (!st || !st.water) out.push('water');
  return out;
}

export type HouseState =
  /** Ta’minlangan, bo‘sh joy bor — aholi ko‘chib kelmoqda */
  | 'moving_in'
  /** Ta’minlangan, bo‘sh joy yo‘q */
  | 'full'
  /** Ta’minot yo‘q va uy bo‘sh — hech kim kelmaydi */
  | 'blocked'
  /** Ta’minot uzilgan, ogohlantirish muddati ketmoqda */
  | 'warning'
  /** Ogohlantirish muddati tugagan — aholi ketmoqda */
  | 'leaving';

export interface HouseForecast {
  capacity: number;
  residents: number;
  /** Bo‘sh joy = capacity − residents */
  vacant: number;
  served: boolean;
  missing: SupplyKind[];
  state: HouseState;
  /** Keyingi hisob davrida aholining haqiqiy o‘zgarishi (hozirgi holat saqlansa) */
  nextDelta: number;
  /** Aholi keta boshlashiga qadar qolgan ogohlantirish davrlari */
  graceLeft: number;
}

/**
 * Uyning keyingi davr prognozi. Hisob davri (runTick) aynan shu natijani qo‘llaydi, shuning uchun
 * uy panelidagi «Keyingi davrda +2» yozuvi doim haqiqiy.
 */
export function houseForecast(o: PlacedObject, st: ObjectStatus | undefined, familyBonus = 0): HouseForecast {
  const capacity = CATALOG[o.type].capacity;
  const residents = Math.max(0, Math.min(capacity, o.residents));
  const vacant = capacity - residents;
  const missing = missingSupplies(st);
  const served = missing.length === 0;
  let state: HouseState;
  let nextDelta = 0;
  let graceLeft = 0;
  if (served) {
    // familyBonus: bog‘cha / bolalar kutubxonasi yaqinida (education.ts, cheklangan +1)
    nextDelta = Math.min(MOVE_IN_PER_TICK + familyBonus, vacant);
    state = vacant > 0 ? 'moving_in' : 'full';
  } else if (residents === 0) {
    state = 'blocked';
  } else if (o.outageTicks < OUTAGE_GRACE_TICKS) {
    state = 'warning';
    graceLeft = OUTAGE_GRACE_TICKS - o.outageTicks;
  } else {
    state = 'leaving';
    nextDelta = -Math.min(MOVE_OUT_PER_TICK, residents);
  }
  return { capacity, residents, vacant, served, missing, state, nextDelta, graceLeft };
}

/**
 * Bitta hisob davri. objects ichidagi residents va outageTicks joyida o‘zgaradi.
 * Tartib: 1) budjet — joriy aholi va ta’minot bo‘yicha (HUD va budjet panelida ko‘rinib turgan sonlar),
 * 2) ko‘chib kelish/ketish (keyingi davr solig‘iga ta’sir qiladi).
 */
export function runTick(
  objects: PlacedObject[],
  statuses: Map<string, ObjectStatus>,
  tick: number,
  opts: { skill?: number; familyHouses?: Set<string>; familyBonus?: number; moveIn?: boolean; onMoveIn?: (o: PlacedObject, delta: number, served: boolean) => void } = {},
): TickReport {
  const budget = computeBudget(objects, statuses, opts.skill ?? 0);
  for (const [id, st] of statuses) st.lastNet = budget.perObject.get(id) ?? 0;

  let movedIn = 0;
  let movedOut = 0;
  for (const o of objects) {
    if (CATALOG[o.type].kind !== 'house') continue;
    const f = houseForecast(o, statuses.get(o.id), opts.familyHouses?.has(o.id) ? opts.familyBonus ?? 0 : 0);
    // transport rejimi: ko‘chib kelish shu formulada qoladi, lekin odamlar transportda keladi (uyga yetganda qo‘shiladi)
    const transport = opts.moveIn === false;
    if (transport) opts.onMoveIn?.(o, f.nextDelta, f.served);
    const delta = transport && f.nextDelta > 0 ? 0 : f.nextDelta;
    o.residents = Math.max(0, Math.min(f.capacity, f.residents + delta));
    o.outageTicks = f.served ? 0 : Math.min(OUTAGE_GRACE_TICKS, o.outageTicks + 1);
    if (delta > 0) movedIn += delta;
    else movedOut -= delta;
  }

  const tax = budget.lines.find((l) => l.id === 'houseTax')!.amount;
  const business = budget.lines.find((l) => l.id === 'business')!.amount;
  return { tick, tax, business, upkeep: budget.expense, net: budget.net, moved: movedIn - movedOut, movedIn, movedOut };
}

/** Umumiy aholi = barcha uylardagi residents yig‘indisi (sig‘im yoki uylar soni emas). */
export function totalPopulation(objects: Iterable<PlacedObject>): number {
  let p = 0;
  for (const o of objects) if (CATALOG[o.type].kind === 'house') p += o.residents;
  return p;
}

/** Aholi soniga og‘irliklangan o‘rtacha baxt; aholi 0 bo‘lsa 0. */
export function cityHappiness(objects: Iterable<PlacedObject>, statuses: Map<string, ObjectStatus>): number {
  let sum = 0;
  let pop = 0;
  for (const o of objects) {
    if (CATALOG[o.type].kind !== 'house' || o.residents <= 0) continue;
    sum += (statuses.get(o.id)?.happiness ?? 0) * o.residents;
    pop += o.residents;
  }
  return pop === 0 ? 0 : Math.round(sum / pop);
}
