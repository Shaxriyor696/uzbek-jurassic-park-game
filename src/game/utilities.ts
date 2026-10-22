import { CATALOG } from './catalog';
import { isActiveNewSchool } from './education';
import { hospitalSupplied } from './health';
import { civicSupplied, isSecurity, securityCoverage } from './civic';
import { isCivic, CIVIC_CONFIG } from './civicDefs';
import { distance, footprintCells, footprintCenter, perimeterCells } from './grid';
import { activeTerrain, nearNaturalWater } from './terrain';
import type { RoadGrid } from './roadNetwork';
import type { ObjectStatus, PlacedObject } from './types';

/** Binoning perimetri yonida kirish tarmog‘iga ulangan yo‘l bormi (diagonal hisoblanmaydi). */
export function hasRoadAccess(o: PlacedObject, roads: RoadGrid): boolean {
  return perimeterCells(o).some((c) => roads.isConnected(c.x, c.z));
}

/** Ko‘l yoki soy bo‘yidagi (2 katak ichida) suv stansiyasi tabiiy manbadan oladi — radiusi shuncha marta katta */
export const NATURAL_WATER_RADIUS_BONUS = 1.5;

const radiusCache = new WeakMap<PlacedObject, { key: string; r: number }>();
/** Stansiya xizmat radiusi: suv stansiyasi tabiiy ko‘l/soy bo‘yida bo‘lsa 6 → 9 katak */
export function stationRadius(station: Pick<PlacedObject, 'type' | 'gridX' | 'gridZ' | 'rotation'>): number {
  const c = CATALOG[station.type];
  if (c.kind !== 'water') return c.utilityRadius;
  return usesNaturalWater(station) ? c.utilityRadius * NATURAL_WATER_RADIUS_BONUS : c.utilityRadius;
}

let terrainSeen: unknown = null;
let terrainTick = 0;
/** Suv stansiyasi tabiiy ko‘l/soydan suv oladimi */
export function usesNaturalWater(station: Pick<PlacedObject, 'type' | 'gridX' | 'gridZ' | 'rotation'>): boolean {
  if (CATALOG[station.type].kind !== 'water') return false;
  const t = activeTerrain();
  if (t !== terrainSeen) { terrainSeen = t; terrainTick++; }
  const key = `${terrainTick}|${station.gridX}|${station.gridZ}|${station.rotation}`;
  const o = station as PlacedObject;
  const hit = radiusCache.get(o);
  if (hit && hit.key === key) return hit.r > 0;
  const near = nearNaturalWater(footprintCells(station.type, station.gridX, station.gridZ, station.rotation));
  radiusCache.set(o, { key, r: near ? 1 : 0 });
  return near;
}

/**
 * Ta’minot qoidasi (yagona sozlama). 'capacity' — har faol stansiya yo‘l tarmog‘i orqali eng yaqin `perStation` ta
 * binogacha (uy, do‘kon, maktab va h.k.) elektr/suv beradi; radius ichidagilar yo‘lsiz ham ulanadi. Ko‘l bo‘yidagi
 * suv stansiyasi tabiiy suv oladi — sig‘imi 1,5 barobar. 'radius' — eski qoida (faqat eski avtomatik sinovlar uchun).
 */
export const UTILITY_CONFIG = {
  mode: 'capacity' as 'capacity' | 'radius',
  perStation: 20,
  /** Yo‘l orqali ta’minot shu masofagacha (katak) — shahardan ancha uzoqdagi bino uchun alohida stansiya kerak */
  maxDistance: 30,
};

export function stationCapacity(station: PlacedObject): number {
  return Math.round(UTILITY_CONFIG.perStation * (usesNaturalWater(station) ? NATURAL_WATER_RADIUS_BONUS : 1));
}

export function stationCovers(station: PlacedObject, target: PlacedObject): boolean {
  const r = stationRadius(station);
  return distance(footprintCenter(station), footprintCenter(target)) <= r;
}

/**
 * PRD 04 «Qayta hisoblash» tartibi:
 *  1) yo‘l komponentlari (RoadGrid.recompute — chaqiruvchi bajaradi),
 *  2) stansiya faolligi (yo‘lga ulangan),
 *  3) bino ta’minoti (radius ichidagi faol stansiya),
 *  4) baxt.
 */
export function computeStatuses(objects: PlacedObject[], roads: RoadGrid): Map<string, ObjectStatus> {
  const out = new Map<string, ObjectStatus>();
  for (const o of objects) {
    const c = CATALOG[o.type];
    const road = o.type === 'road' ? roads.isConnected(o.gridX, o.gridZ) : c.needsRoad ? hasRoadAccess(o, roads) : true;
    out.set(o.id, { road, power: false, water: false, active: false, happiness: 0, lastNet: 0 });
  }

  const powerStations: PlacedObject[] = [];
  const waterStations: PlacedObject[] = [];
  const schools: PlacedObject[] = [];
  const hospitals: PlacedObject[] = [];
  const parks: PlacedObject[] = [];
  for (const o of objects) {
    const st = out.get(o.id)!;
    const kind = CATALOG[o.type].kind;
    if (kind === 'power' || kind === 'water') {
      st.active = st.road && (o.damage ?? 0) < 1; // shikastlangan stansiya ta’minot bermaydi
      if (st.active) (kind === 'power' ? powerStations : waterStations).push(o);
    } else if (o.type === 'maktab') {
      // Talqin: maktab yo‘lga ulangan bo‘lsa faol hisoblanadi (PRD bu yerda aniq emas).
      st.active = st.road;
      if (st.active) schools.push(o);
    } else if (o.type === 'bog') {
      st.active = true;
      parks.push(o);
    } else {
      st.active = st.road;
    }
  }

  if (UTILITY_CONFIG.mode === 'radius') {
    for (const o of objects) {
      const c = CATALOG[o.type];
      if (!c.needsUtilities) continue;
      const st = out.get(o.id)!;
      st.power = powerStations.some((s) => stationCovers(s, o));
      st.water = waterStations.some((s) => stationCovers(s, o));
    }
  } else {
    // har stansiya — eng yaqin binolardan boshlab sig‘imigacha (yo‘lga ulangan yoki radius ichidagi)
    const consumers = objects.filter((o) => CATALOG[o.type].needsUtilities);
    for (const [stations, key] of [[powerStations, 'power'], [waterStations, 'water']] as const) {
      const left = new Map(stations.map((s) => [s.id, stationCapacity(s)]));
      const pairs: { s: PlacedObject; o: PlacedObject; d: number }[] = [];
      for (const s of stations) {
        const sc = footprintCenter(s);
        for (const o of consumers) {
          const d = distance(sc, footprintCenter(o));
          if ((out.get(o.id)!.road && d <= UTILITY_CONFIG.maxDistance) || stationCovers(s, o)) pairs.push({ s, o, d });
        }
      }
      pairs.sort((a, b) => a.d - b.d);
      for (const p of pairs) {
        const st = out.get(p.o.id)!;
        if (st[key] || (left.get(p.s.id) ?? 0) <= 0) continue;
        st[key] = true;
        left.set(p.s.id, left.get(p.s.id)! - 1);
      }
    }
  }

  // dinozavr ishdan chiqargan bino — ta’mirlanguncha elektr/suv yo‘q, ishlamaydi
  for (const o of objects) {
    if ((o.damage ?? 0) < 1) continue;
    const st = out.get(o.id)!;
    st.power = false; st.water = false; st.active = false;
  }

  // Yangi ta’lim maktablari faqat yo‘l + elektr + suv bo‘lsa «maktab yaqinida» baxtini beradi.
  for (const o of objects) if (isActiveNewSchool(o, out.get(o.id))) schools.push(o);
  // Shifoxona: yo‘l + elektr + suv bo‘lsagina faol (health.ts) — baxt ta’siri faqat shunda.
  for (const o of objects) {
    if (o.type !== 'shifoxona') continue;
    const st = out.get(o.id)!;
    st.active = hospitalSupplied(st);
    if (st.active) hospitals.push(o);
  }

  for (const o of objects) {
    if (CATALOG[o.type].kind !== 'house') continue;
    const st = out.get(o.id)!;
    st.happiness = houseHappiness(o, st, parks, schools, hospitals);
  }

  // Boshqaruv/xizmat binolari va eski «Politsiya»: o‘z ehtiyojlari bo‘yicha faol (civicDefs.needs).
  for (const o of objects) if (isCivic(o.type) || isSecurity(o.type)) out.get(o.id)!.active = civicSupplied(o, out.get(o.id));
  // Xavfsizlik qamrovi: qamralgan uyga +5% baxt, bir marta (bir nechta bino qo‘shilib ketmaydi).
  for (const id of securityCoverage(objects, out).covered) {
    const st = out.get(id)!;
    st.happiness = Math.min(100, st.happiness + CIVIC_CONFIG.SECURITY.HAPPINESS_BONUS);
  }
  return out;
}

/** PRD 05: yo‘l 25 + elektr 25 + suv 25 + bog‘(4) 10 + maktab(6) 5 + shifoxona(6) 10, 0–100. */
export function houseHappiness(
  house: PlacedObject,
  st: Pick<ObjectStatus, 'road' | 'power' | 'water'>,
  parks: PlacedObject[],
  schools: PlacedObject[],
  hospitals: PlacedObject[],
): number {
  const c = footprintCenter(house);
  const near = (list: PlacedObject[], r: number) => list.some((p) => distance(footprintCenter(p), c) <= r);
  let h = 0;
  if (st.road) h += 25;
  if (st.power) h += 25;
  if (st.water) h += 25;
  if (near(parks, 4)) h += 10;
  if (near(schools, 6)) h += 5;
  if (near(hospitals, 6)) h += 10;
  return Math.max(0, Math.min(100, h));
}

// ---------- ta’minot xulosasi (UI, Dastyor va xarita belgilari uchun yagona manba) ----------

export type SupplyKind = 'road' | 'power' | 'water';

const SUPPLY_WORD: Record<SupplyKind, string> = { road: 'yo‘l', power: 'elektr', water: 'suv' };

export interface SupplySummary {
  /** Jami uylar */
  houses: number;
  road: number;
  power: number;
  water: number;
}

/** Nechta uy yo‘l / elektr / suv bilan ta’minlangan. */
export function supplySummary(objects: Iterable<PlacedObject>, statuses: Map<string, ObjectStatus>): SupplySummary {
  const s: SupplySummary = { houses: 0, road: 0, power: 0, water: 0 };
  for (const o of objects) {
    if (CATALOG[o.type].kind !== 'house') continue;
    const st = statuses.get(o.id);
    s.houses++;
    if (st?.road) s.road++;
    if (st?.power) s.power++;
    if (st?.water) s.water++;
  }
  return s;
}

/** Dastyor maslahati: eng muhim yetishmovchilik (yo‘l → elektr → suv). Hammasi joyida bo‘lsa null. */
export function supplyAdvice(s: SupplySummary): string | null {
  for (const k of ['road', 'power', 'water'] as const) {
    const n = s.houses - s[k];
    if (n > 0) return `${n === 1 ? 'Bir' : n + ' ta'} uyga ${SUPPLY_WORD[k]} yetishmayapti.`;
  }
  return null;
}

/** Nega aynan shu binoda yo‘l / elektr / suv yo‘q — aniq sabab (o‘zbekcha). */
export function supplyReason(
  o: PlacedObject,
  kind: SupplyKind,
  objects: Iterable<PlacedObject>,
  statuses: Map<string, ObjectStatus>,
  roads: RoadGrid,
): string {
  if (kind === 'road') {
    return perimeterCells(o).some((c) => roads.isRoad(c.x, c.z))
      ? 'Yonidagi yo‘l shahar kirishiga ulanmagan.'
      : 'Yonida yo‘l yo‘q (diagonal tegish hisoblanmaydi).';
  }
  const word = SUPPLY_WORD[kind];
  if ((o.damage ?? 0) >= 1) return 'Dinozavr binoni shikastlagan — ta’mirlang (bino panelidagi «Ta’mirlash» tugmasi).';
  let radius = 0;
  let inactiveNearby = false;
  for (const s of objects) {
    const c = CATALOG[s.type];
    if (c.kind !== kind) continue;
    radius = stationRadius(s);
    if (stationCovers(s, o) && !statuses.get(s.id)?.active) inactiveNearby = true;
  }
  if (inactiveNearby) return `Yaqindagi ${word} stansiyasi yo‘lga ulanmagan, shuning uchun ishlamayapti.`;
  if (UTILITY_CONFIG.mode === 'capacity') {
    const active = [...objects].filter((s) => CATALOG[s.type].kind === kind && statuses.get(s.id)?.active);
    if (!active.length) return `Ishlayotgan ${word} stansiyasi yo‘q — yo‘lga ulangan ${word} stansiyasi quring (har biri ${UTILITY_CONFIG.perStation} ta binogacha).`;
    if (!statuses.get(o.id)?.road) return `Bino yo‘lga ulanmagan — ${word} yo‘l tarmog‘i orqali keladi.`;
    return `${word[0].toUpperCase() + word.slice(1)} stansiyalari to‘la (har biri ${UTILITY_CONFIG.perStation} ta binogacha) — yana bitta ${word} stansiyasi quring.`;
  }
  if (radius === 0) radius = kind === 'power' ? CATALOG.elektr.utilityRadius : CATALOG.suv.utilityRadius;
  return `${radius} katak ichida ishlayotgan ${word} stansiyasi yo‘q.`;
}

/** Hali qurilmagan bino shu joyda qanday ta’minlanishini oldindan ko‘rsatadi (qurilish preview uchun). */
export function previewSupply(
  candidate: Pick<PlacedObject, 'type' | 'gridX' | 'gridZ' | 'rotation'>,
  objects: Iterable<PlacedObject>,
  statuses: Map<string, ObjectStatus>,
  roads: RoadGrid,
): SupplyKind[] {
  const c = CATALOG[candidate.type];
  const ghost: PlacedObject = { ...candidate, id: '', residents: 0, outageTicks: 0, userPlaced: true };
  const missing: SupplyKind[] = [];
  if (c.needsRoad && !hasRoadAccess(ghost, roads)) missing.push('road');
  if (c.needsUtilities) {
    let power = false;
    let water = false;
    const capacity = UTILITY_CONFIG.mode === 'capacity';
    const onRoad = hasRoadAccess(ghost, roads);
    const all = [...objects];
    for (const s of all) {
      if (!statuses.get(s.id)?.active) continue;
      const k = CATALOG[s.type].kind;
      if (k !== 'power' && k !== 'water') continue;
      // sig‘im rejimi: yo‘lga ulangan va stansiyada bo‘sh o‘rin bor
      const reach = capacity ? onRoad || stationCovers(s, ghost) : stationCovers(s, ghost);
      if (!reach) continue;
      if (capacity && all.filter((x) => CATALOG[x.type].needsUtilities && statuses.get(x.id)?.[k]).length >= all.filter((x) => CATALOG[x.type].kind === k && statuses.get(x.id)?.active).reduce((a, x) => a + stationCapacity(x), 0)) continue;
      if (k === 'power') power = true;
      if (k === 'water') water = true;
    }
    if (!power) missing.push('power');
    if (!water) missing.push('water');
  }
  return missing;
}

export function supplyWord(k: SupplyKind): string {
  return SUPPLY_WORD[k];
}
