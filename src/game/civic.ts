import { UTILITY_CONFIG } from './utilities';
import { CATALOG } from './catalog';
import { CIVIC_BY_TYPE, CIVIC_CONFIG, isCivic } from './civicDefs';
import { distance, footprintCenter } from './grid';
import type { ObjectStatus, PlacedObject } from './types';

export { CIVIC, CIVIC_BY_TYPE, CIVIC_CONFIG, isCivic, type CivicDef } from './civicDefs';

/**
 * Boshqaruv, shahar xizmatlari va oqova tozalash hisoblari. Hammasi xaritadagi haqiqiy obyektlar va ularning
 * ta’minot holatidan hisoblanadi (tasodifiy yoki soxta son yo‘q). Hisob davri bilan bog‘liq qismlar (jarima muddati)
 * game.ts dagi tick() da — pauzada to‘xtaydi.
 */

/** Bino faolmi: o‘z ehtiyojlari (civicDefs.needs) bajarilgan. Eski «Politsiya» xavfsizlik binosi sifatida: yo‘l + elektr. */
export function civicSupplied(o: PlacedObject, st: Pick<ObjectStatus, 'road' | 'power' | 'water'> | undefined): boolean {
  if (!st) return false;
  const n = isCivic(o.type) ? CIVIC_BY_TYPE[o.type].needs : o.type === 'politsiya' ? { road: true, power: true, water: false } : null;
  if (!n) return st.road;
  return (!n.road || st.road) && (!n.power || st.power) && (!n.water || st.water);
}

export function isSecurity(type: string) {
  return type === 'xavfsizlik' || (CIVIC_CONFIG.SECURITY.INCLUDES_POLICE && type === 'politsiya');
}

const isHouse = (o: PlacedObject) => CATALOG[o.type].kind === 'house';

// ---------------- Xavfsizlik qamrovi ----------------

export interface SecurityCoverage {
  /** Qamralgan uylar (baxt bonusi shularga, bir marta) */
  covered: Set<string>;
  perBuilding: Map<string, { active: boolean; capacity: number; served: number; houses: number }>;
  capacity: number;
  served: number;
  /** Shahar aholisi */
  population: number;
}

/**
 * Har faol xavfsizlik binosi o‘z radiusidagi uylarni (yaqinidan boshlab) sig‘imi tugaguncha qamraydi.
 * Uy faqat bir binoga biriktiriladi — bir nechta bino bonusni ko‘paytirmaydi.
 */
export function securityCoverage(objects: PlacedObject[], statuses: Map<string, ObjectStatus>): SecurityCoverage {
  const S = CIVIC_CONFIG.SECURITY;
  const houses = objects.filter(isHouse);
  const population = houses.reduce((a, h) => a + h.residents, 0);
  const covered = new Set<string>();
  const perBuilding = new Map<string, { active: boolean; capacity: number; served: number; houses: number }>();
  let capacity = 0, served = 0;
  const buildings = objects.filter((o) => isSecurity(o.type)).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const s of buildings) {
    const active = civicSupplied(s, statuses.get(s.id));
    const rec = { active, capacity: S.CAPACITY, served: 0, houses: 0 };
    perBuilding.set(s.id, rec);
    if (!active) continue;
    capacity += S.CAPACITY;
    const c = footprintCenter(s);
    const near = houses
      .filter((h) => !covered.has(h.id))
      .map((h) => ({ h, dist: distance(footprintCenter(h), c) }))
      .filter((x) => x.dist <= S.RADIUS)
      .sort((a, b) => a.dist - b.dist);
    for (const { h } of near) {
      if (rec.served + h.residents > S.CAPACITY) continue;
      rec.served += h.residents;
      rec.houses++;
      covered.add(h.id);
    }
    served += rec.served;
  }
  return { covered, perBuilding, capacity, served, population };
}

// ---------------- Oqova suv ----------------

export interface SewageSource {
  id: string;
  load: number;
  untreated: number;
  x: number;
  z: number;
}

export interface SewageSummary {
  /** Butun shahar oqova yuklamasi (birlik/davr) */
  load: number;
  treated: number;
  untreated: number;
  perPlant: Map<string, { active: boolean; capacity: number; treated: number; areaLoad: number }>;
  /** Tozalanmagan yuklamasi bor manbalar (eng kattasi birinchi) */
  untreatedSources: SewageSource[];
}

/**
 * Oqova: suv bilan ta’minlangan uylar (aholi × PER_RESIDENT) va faol bizneslar (PER_BUSINESS). Har birlik
 * faqat bir marta tozalanadi: faol inshoot o‘z radiusidagi manbalarni yaqinidan boshlab sig‘imi tugaguncha oladi.
 * Ichimlik suvi (suv stansiyasi) bu hisobga kirmaydi va tozalashdan yangi suv paydo bo‘lmaydi.
 */
export function sewageSummary(objects: PlacedObject[], statuses: Map<string, ObjectStatus>): SewageSummary {
  const W = CIVIC_CONFIG.SEWAGE;
  const sources: (SewageSource & { c: { x: number; z: number } })[] = [];
  for (const o of objects) {
    const st = statuses.get(o.id);
    const kind = CATALOG[o.type].kind;
    let load = 0;
    if (kind === 'house' && st?.water) load = o.residents * W.PER_RESIDENT;
    else if (kind === 'business' && st?.road && st.power && st.water) load = W.PER_BUSINESS;
    if (load <= 0) continue;
    const c = footprintCenter(o);
    sources.push({ id: o.id, load, untreated: load, x: o.gridX, z: o.gridZ, c });
  }
  const perPlant = new Map<string, { active: boolean; capacity: number; treated: number; areaLoad: number }>();
  const plants = objects.filter((o) => o.type === 'suv_tozalash').sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const p of plants) {
    const active = civicSupplied(p, statuses.get(p.id));
    const pc = footprintCenter(p);
    // sig‘im rejimi: yo‘l tarmog‘i orqali (yo‘lga ulangan manbalar, 30 katakkacha) — har binoga alohida inshoot shart emas
    const byRoad = UTILITY_CONFIG.mode === 'capacity';
    const near = sources.map((s) => ({ s, dist: distance(s.c, pc) }))
      .filter((x) => x.dist <= W.PLANT_RADIUS || (byRoad && x.dist <= UTILITY_CONFIG.maxDistance && !!statuses.get(x.s.id)?.road))
      .sort((a, b) => a.dist - b.dist);
    const rec = { active, capacity: W.PLANT_CAPACITY, treated: 0, areaLoad: near.reduce((a, x) => a + x.s.load, 0) };
    perPlant.set(p.id, rec);
    if (!active) continue;
    for (const { s } of near) {
      const take = Math.min(s.untreated, W.PLANT_CAPACITY - rec.treated);
      if (take <= 0) break;
      s.untreated -= take;
      rec.treated += take;
    }
  }
  const load = sources.reduce((a, s) => a + s.load, 0);
  const untreated = sources.reduce((a, s) => a + s.untreated, 0);
  return {
    load, treated: load - untreated, untreated, perPlant,
    untreatedSources: sources.filter((s) => s.untreated > 0).sort((a, b) => b.untreated - a.untreated).map(({ c: _c, ...s }) => s),
  };
}

// ---------------- Yashillik ----------------

export interface GreenSummary {
  houses: number;
  /** Bog‘ radiusidagi uylar */
  greenHouses: number;
  parks: number;
  trees: number;
  /** Bog‘siz uylardan biri (joylashuv uchun) */
  firstBare: PlacedObject | null;
}

export function greenSummary(objects: PlacedObject[]): GreenSummary {
  const parks = objects.filter((o) => o.type === 'bog');
  const houses = objects.filter(isHouse);
  let green = 0;
  let firstBare: PlacedObject | null = null;
  for (const h of houses) {
    const c = footprintCenter(h);
    if (parks.some((p) => distance(footprintCenter(p), c) <= CIVIC_CONFIG.GREEN.PARK_RADIUS)) green++;
    else if (!firstBare) firstBare = h;
  }
  return { houses: houses.length, greenHouses: green, parks: parks.length, trees: objects.filter((o) => o.type === 'daraxt').length, firstBare };
}

// ---------------- Murojaatlar (hokimlik) ----------------

export interface Appeal {
  id: string;
  title: string;
  /** Aniq muammo */
  text: string;
  /** Yechim */
  fix: string;
  /** Joylashuv (katak) — bosilganda kamera shu yerga o‘tadi */
  x: number;
  z: number;
  objectId: string | null;
  tone: 'bad' | 'warn';
}

/**
 * Aholi murojaatlari — mavjud holatdan: ta’minotsiz uylar, ishlamayotgan binolar, tozalanmagan oqova, bog‘siz
 * uylar. Har birida muammo, joy va yechim; soxta murojaat yo‘q.
 */
export function cityAppeals(objects: PlacedObject[], statuses: Map<string, ObjectStatus>, sewage: SewageSummary, green: GreenSummary): Appeal[] {
  const out: Appeal[] = [];
  const houses = objects.filter(isHouse);
  const word = { road: 'yo‘l', power: 'elektr', water: 'suv' } as const;
  const fixFor = {
    road: 'Uy yoniga yo‘l quring va uni shahar ko‘chasiga ulang.',
    power: 'Yo‘lga ulangan elektr stansiyasini 8 katak ichida quring.',
    water: 'Yo‘lga ulangan suv stansiyasini 6 katak ichida quring.',
  };
  for (const k of ['road', 'power', 'water'] as const) {
    const bad = houses.filter((h) => !statuses.get(h.id)?.[k]);
    if (!bad.length) continue;
    const h = bad[0];
    out.push({
      id: 'house-' + k, tone: 'bad', title: `${bad.length} ta uyda ${word[k]} yo‘q`,
      text: `Masalan (${h.gridX}, ${h.gridZ}) dagi uy: aholi ${word[k]}siz yashay olmaydi, yangi oilalar kelmaydi.`,
      fix: fixFor[k], x: h.gridX, z: h.gridZ, objectId: h.id,
    });
  }
  for (const o of objects) {
    const c = CATALOG[o.type];
    if (c.kind !== 'business' && c.kind !== 'education' && c.kind !== 'service') continue;
    const st = statuses.get(o.id);
    if (!st) continue;
    const ok = isCivic(o.type) || isSecurity(o.type) ? civicSupplied(o, st) : st.road && (!c.needsUtilities || (st.power && st.water));
    if (ok) continue;
    const miss = [!st.road && 'yo‘l', c.needsUtilities && !st.power && 'elektr', c.needsUtilities && !st.water && !(isCivic(o.type) && !CIVIC_BY_TYPE[o.type].needs.water) && 'suv'].filter(Boolean).join(', ');
    if (!miss) continue;
    out.push({
      id: 'bld-' + o.id, tone: 'warn', title: `${c.name} ishlamayapti`,
      text: `(${o.gridX}, ${o.gridZ}) dagi binoda ${miss} yo‘q.`,
      fix: 'Binoni panelidan tekshiring: yetishmayotgan ulanishni bering.', x: o.gridX, z: o.gridZ, objectId: o.id,
    });
  }
  if (sewage.untreated > 0) {
    const s = sewage.untreatedSources[0];
    out.push({
      id: 'sewage', tone: sewage.untreated >= CIVIC_CONFIG.RULE.SEWAGE_ALERT ? 'bad' : 'warn',
      title: `Oqova suv tozalanmayapti: ${sewage.untreated} birlik/davr`,
      text: `Eng ko‘p tozalanmagan oqova (${s.x}, ${s.z}) atrofida.`,
      fix: UTILITY_CONFIG.mode === 'capacity'
        ? `Suv tozalash inshooti quring (yo‘l va elektrga ulangan, shu joydan ${UTILITY_CONFIG.maxDistance} katak ichida) — u yo‘l orqali ${CIVIC_CONFIG.SEWAGE.PLANT_CAPACITY} birlik/davrgacha tozalaydi.`
        : `Suv tozalash inshootini shu joydan ${CIVIC_CONFIG.SEWAGE.PLANT_RADIUS} katak ichida quring va yo‘l hamda elektrga ulang.`,
      x: s.x, z: s.z, objectId: s.id,
    });
  }
  if (green.firstBare) {
    const h = green.firstBare;
    out.push({
      id: 'green', tone: 'warn', title: `${green.houses - green.greenHouses} ta uy yonida bog‘ yo‘q`,
      text: `Masalan (${h.gridX}, ${h.gridZ}) dagi uy atrofida ${CIVIC_CONFIG.GREEN.PARK_RADIUS} katak ichida bog‘ yo‘q.`,
      fix: 'Uy yoniga bog‘ quring — baxt oshadi, shahar yashilroq bo‘ladi.', x: h.gridX, z: h.gridZ, objectId: h.id,
    });
  }
  return out;
}

// ---------------- Soliq hisoboti ----------------

export interface TaxReport {
  residents: number;
  ratePerResident: number;
  houseTax: number;
  activeBusinesses: number;
  idleBusinesses: number;
  businessIncome: number;
  skillBonus: number;
  total: number;
}
