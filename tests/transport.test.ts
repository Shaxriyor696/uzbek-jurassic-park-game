import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game/game';
import { CATALOG } from '../src/game/catalog';
import { inBounds, isWater } from '../src/game/grid';
import { manhattanPath } from '../src/game/roadNetwork';
import { CONSTRUCTION } from '../src/game/construction';
import { CITY_TRAFFIC_CONFIG, MIGRATION_CONFIG, VEHICLE_SPECS } from '../src/game/trafficDefs';
import { UTILITY_CONFIG } from '../src/game/utilities';
import { RAID_CONFIG } from '../src/game/herd';
import { SAVE_KEY, validateSave, type KeyValueStorage } from '../src/game/saveStore';
import type { Trip } from '../src/game/traffic';

class MemStorage implements KeyValueStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

beforeEach(() => { vi.useFakeTimers(); CONSTRUCTION.enabled = false; MIGRATION_CONFIG.transport = true; UTILITY_CONFIG.mode = 'capacity'; RAID_CONFIG.enabled = false; });
afterEach(() => { vi.useRealTimers(); MIGRATION_CONFIG.transport = true; });

/**
 * Sinov shahri: sharqiy xarita chetidan (x = 59) g‘arbga yo‘l, uning janubida uylar, shimolida elektr va suv.
 * Relyef (tog‘/ko‘l) xalaqit bermaydigan qator avtomatik tanlanadi.
 */
function city(opts: { houses?: number; type?: 'uy_a' | 'uy_c' } = {}) {
  const s = new MemStorage();
  const g = Game.boot(s);
  g.confirmNewCity();
  g.herd.disabled = true; g.herd.dinos = [];
  let z = -1;
  for (let k = 8; k < 32 && z < 0; k++) {
    const p = manhattanPath({ x: 59, z: k }, { x: 10, z: k });
    const stubOk = [...Array(10).keys()].every((i) => !isWater(60 + i, k) && g.terrainField!.cellHeight(60 + i, k) <= 0.08);
    if (stubOk && g.checkRoadPath(p).ok && [0, 1, 2, 3, 4, 5, 6].every((i) => g.checkPlacement('uy_c', 13 + i * 3, k + 1, 0).ok) && [13, 17, 22, 26, 31, 35, 40].every((x) => g.checkPlacement('elektr', x, k - 3, 0).ok)) z = k;
  }
  expect(z).toBeGreaterThan(0);
  g.buildRoad(manhattanPath({ x: 59, z }, { x: 10, z }));
  // g‘arbiy berk uchda tuproq yo‘l bo‘lmasin — sinovlar xarita chetidagi kirishni tekshiradi
  g.placeBuilding('daraxt', 9, z, 0);
  const type = opts.type ?? 'uy_a';
  const w = CATALOG[type].width;
  const houses = [];
  for (let i = 0; i < (opts.houses ?? 1); i++) {
    const x = 13 + i * (w + 1);
    const r = g.placeBuilding(type, x, z + 1, 0);
    expect(r.ok, r.reason).toBe(true);
    houses.push(g.objectAt(x, z + 1)!);
  }
  for (const [t, x] of [['suv', 13], ['elektr', 17], ['suv', 22], ['elektr', 26], ['suv', 31], ['elektr', 35], ['suv', 40]] as const) g.placeBuilding(t, x, z - 3, 0);
  return { g, s, z, houses };
}

function run(g: Game, seconds: number, each?: () => void, dt = 0.1) {
  for (let t = 0; t < seconds; t += dt) { g.update(dt); each?.(); }
}

const people = (g: Game) => g.population + g.enRoute + g.traffic.queued;

describe('Ko‘chib kelish transporti', () => {
  it('bitta avtomobilning to‘liq safari: navbat → band qilish → yo‘l bo‘ylab keladi → uyga yetganda bir marta qo‘shiladi → xarita chetidan ketadi', () => {
    const { g, houses } = city();
    const h = houses[0];
    expect(g.statuses.get(h.id)).toMatchObject({ road: true, power: true, water: true });
    expect(g.traffic.ensureGraph((g as unknown as { trafficWorld(): never }).trafficWorld()).entries.length).toBeGreaterThan(0);
    // hisob davri: odamlar darhol qo‘shilmaydi — navbatga
    run(g, 10.05);
    expect(h.residents).toBe(0);
    expect(g.traffic.queued + g.enRoute).toBeGreaterThan(0);
    let trip: Trip | undefined;
    let offRoad = 0, removedOnMap = false, maxRes = 0, seenOnStub = false;
    const g2 = g.traffic.graph!;
    run(g, 60, () => {
      trip ??= g.traffic.trips[0];
      for (const t of g.traffic.trips) {
        const c = { x: Math.floor(t.v.x), z: Math.floor(t.v.z) };
        if (!g2.has(c.x, c.z)) offRoad++;
        if (!inBounds(c.x, c.z)) seenOnStub = true;
      }
      if (trip && !g.traffic.trips.includes(trip) && inBounds(Math.floor(trip.v.x), Math.floor(trip.v.z))) removedOnMap = true;
      maxRes = Math.max(maxRes, h.residents + g.traffic.reserved(h.id));
    });
    expect(trip).toBeDefined();
    expect(trip!.kind).toBe('car');
    expect(trip!.people).toBeGreaterThanOrEqual(1);
    expect(trip!.people).toBeLessThanOrEqual(4);
    expect(seenOnStub).toBe(true); // kirish/chiqish — xarita chetidan tashqaridagi tashqi yo‘l
    expect(offRoad).toBe(0); // maysa/bino ustidan o‘tmaydi
    expect(removedOnMap).toBe(false); // shahar o‘rtasida yo‘qolmaydi
    expect(h.residents).toBeGreaterThanOrEqual(trip!.people);
    expect(maxRes).toBeLessThanOrEqual(CATALOG.uy_a.capacity);
    expect(g.toasts.some((t) => t.text.includes('Yangi aholi shaharga yetib keldi'))).toBe(true);
  });

  it('yo‘l xarita chetiga yetmagan: sabab bildiriladi, «Kirish yo‘lini qurish» yo‘lni chetgacha quradi va mashinalar keladi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    g.confirmNewCity();
    g.herd.disabled = true; g.herd.dinos = [];
    // shahar o‘rtasida yo‘l, uylar va ta’minot — chetga yetmagan
    let z = -1;
    for (let k = 12; k < 30 && z < 0; k++) if (g.checkRoadPath(manhattanPath({ x: 12, z: k }, { x: 40, z: k })).ok && g.checkPlacement('uy_a', 20, k + 1, 0).ok && g.checkPlacement('suv', 19, k - 3, 0).ok && g.checkPlacement('elektr', 23, k - 3, 0).ok) z = k;
    expect(z).toBeGreaterThan(0);
    g.buildRoad(manhattanPath({ x: 12, z }, { x: 40, z }));
    // berk uchlar band (tuproq yo‘l uchun joy yo‘q) — kirish faqat xarita chetidan
    g.placeBuilding('daraxt', 11, z, 0); g.placeBuilding('daraxt', 41, z, 0);
    const h = g.placeBuilding('uy_a', 20, z + 1, 0).ok && g.objectAt(20, z + 1)!;
    g.placeBuilding('suv', 19, z - 3, 0); g.placeBuilding('elektr', 23, z - 3, 0);
    run(g, 12);
    expect(g.traffic.block).toBe('noEntry');
    expect(g.toasts.some((t) => t.text.startsWith('Yangi aholi kelmayapti'))).toBe(true);
    const p = g.suggestEntryRoad();
    expect(p && p.length).toBeGreaterThan(0);
    const m0 = g.money;
    expect(g.buildEntryRoad()?.ok).toBe(true);
    expect(m0 - g.money).toBe(p!.length * CATALOG.road.price);
    run(g, 120);
    expect((h as { residents: number }).residents).toBeGreaterThan(0);
  });

  it('yo‘l xarita chetigacha qurilmagan bo‘lsa ham: shahar chetidagi berk ko‘cha uchidan tuproq yo‘l orqali keladi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    g.confirmNewCity();
    g.herd.disabled = true; g.herd.dinos = [];
    let z = -1;
    for (let k = 12; k < 30 && z < 0; k++) if (g.checkRoadPath(manhattanPath({ x: 12, z: k }, { x: 40, z: k })).ok && g.checkPlacement('uy_a', 20, k + 1, 0).ok && g.checkPlacement('suv', 19, k - 3, 0).ok && g.checkPlacement('elektr', 23, k - 3, 0).ok) z = k;
    g.buildRoad(manhattanPath({ x: 12, z }, { x: 40, z }));
    g.placeBuilding('uy_a', 20, z + 1, 0); g.placeBuilding('suv', 19, z - 3, 0); g.placeBuilding('elektr', 23, z - 3, 0);
    const h = g.objectAt(20, z + 1)!;
    let onTrack = false, first = -1, t = 0;
    run(g, 150, () => {
      t += 0.1;
      const tracks = g.traffic.graph?.entries.filter((e) => e.kind === 'track') ?? [];
      for (const tr of g.traffic.trips) if (tracks.some((e) => e.stub.some((c) => c.x === Math.floor(tr.v.x) && c.z === Math.floor(tr.v.z)))) onTrack = true;
      if (first < 0 && h.residents > 0) first = t;
    });
    expect(g.traffic.graph!.entries.some((e) => e.kind === 'track')).toBe(true);
    expect(onTrack).toBe(true);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(60); // birinchi oila bir daqiqa ichida
  });

  it('eski saqlash: sukut bo‘yicha «qo‘lda, yopiq» qurilgan darvoza bir marta avtomatik rejimga o‘tadi', () => {
    const { g, s, z } = city();
    g.placeBuilding('himoya_darvoza', 45, z - 1, 1);
    const gate = g.objectAt(45, z)!;
    gate.gate!.mode = 'manual';
    g.saveNow(true);
    const raw = JSON.parse(s.getItem(SAVE_KEY)!);
    delete raw.hints.gateAuto;
    s.setItem(SAVE_KEY, JSON.stringify(raw));
    const g2 = Game.boot(s);
    expect(g2.objectAt(45, z)!.gate!.mode).toBe('auto');
    // keyingi yuklashda o‘yinchi tanlovi (qo‘lda) saqlanadi
    g2.gateCommand(g2.objectAt(45, z)!.id, 'close');
    g2.saveNow(true);
    expect(Game.boot(s).objectAt(45, z)!.gate!.mode).toBe('manual');
  });

  it('bitta elektr va bitta suv stansiyasi yo‘l orqali 20 ta binogacha ta’minlaydi; 21-chisiga yangi stansiya kerak', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    g.confirmNewCity();
    g.herd.disabled = true; g.herd.dinos = [];
    let z = -1;
    for (let k = 10; k < 30 && z < 0; k++) if (g.checkRoadPath(manhattanPath({ x: 10, z: k }, { x: 59, z: k })).ok) z = k;
    expect(z).toBeGreaterThan(0);
    g.buildRoad(manhattanPath({ x: 10, z }, { x: 59, z }));
    let sx = -1;
    for (let x = 20; x < 50 && sx < 0; x++) if (g.checkPlacement('elektr', x, z - 3, 0).ok && g.checkPlacement('suv', x + 4, z - 3, 0).ok) sx = x;
    expect(sx).toBeGreaterThan(0);
    g.placeBuilding('elektr', sx, z - 3, 0); g.placeBuilding('suv', sx + 4, z - 3, 0);
    const hs = [];
    for (const dz of [1, -2]) for (let x = 10; x < 58 && hs.length < 21; x += 3) if (g.placeBuilding('uy_a', x, z + dz, 0).ok) hs.push(g.objectAt(x, z + dz)!);
    expect(hs.length).toBe(21);
    const served = hs.filter((h) => g.statuses.get(h.id)!.power && g.statuses.get(h.id)!.water);
    expect(served.length).toBe(20);
    const left = hs.find((h) => !served.includes(h))!;
    expect(g.supplyReason(left.id, 'power')).toMatch(/to‘la/);
    // eng uzoqdagisi qoladi (yaqinlardan boshlab)
    const dist = (h: { gridX: number; gridZ: number }) => Math.hypot(h.gridX - sx - 2, h.gridZ - z);
    expect(dist(left)).toBeGreaterThanOrEqual(Math.max(...served.map(dist)) - 1.5);
  });

    it('suv tozalash inshooti yo‘l orqali uzoqroqdagi (9 katakdan nari) uylar oqovasini ham tozalaydi', () => {
    const { g, z, houses } = city({ houses: 3 });
    for (const h of houses) h.residents = 8;
    const r = g.placeBuilding('suv_tozalash', 24, z + 1, 0);
    expect(r.ok, r.reason).toBe(true);
    g.update(0.1);
    const far = Math.hypot(14 - 27, 0);
    expect(far).toBeGreaterThan(9);
    expect(g.sewage.load).toBeGreaterThan(0);
    expect(g.sewage.untreated).toBe(0);
    UTILITY_CONFIG.mode = 'radius';
    (g as unknown as { recompute(): void }).recompute();
    expect(g.sewage.untreated).toBeGreaterThan(0); // eski qoida: radiusdan tashqaridagi uy tozalanmasdi
    UTILITY_CONFIG.mode = 'capacity';
  });

    it('bo‘sh uy, yo‘l, ta’minot, kirish yo‘q bo‘lsa jo‘natilmaydi — aniq sabab', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    g.confirmNewCity();
    g.herd.disabled = true; g.herd.dinos = [];
    run(g, 3);
    expect(g.traffic.block).toBe('noVacancy');
    const { g: g2, houses } = city();
    // elektr va suvni olib tashlaymiz
    for (const o of g2.list.filter((o) => o.type === 'elektr' || o.type === 'suv')) g2.demolish(o.id);
    run(g2, 12);
    expect(g2.traffic.block).toBe('noSupply');
    expect(g2.traffic.trips.length).toBe(0);
    expect(houses[0].residents).toBe(0);
  });

  it('har uyga bir marta: kichik uyga 2 kishi; joylashgan uyga qayta olib kelinmaydi; hisob saqlanadi', () => {
    const { g, houses } = city({ houses: 3 });
    let bad = 0;
    let last = people(g);
    run(g, 120, () => {
      for (const h of houses) if (h.residents + g.traffic.reserved(h.id) + (g.traffic.demand.get(h.id) ?? 0) > CATALOG[h.type].capacity) bad++;
      const p = people(g);
      if (p < last) bad++; // hech kim yo‘qolmaydi
      last = p;
    });
    expect(bad).toBe(0);
    expect(houses.map((h) => h.residents)).toEqual([2, 2, 2]);
    expect(houses.every((h) => h.settled)).toBe(true);
    // keyin transport to‘xtaydi: yangi safar yo‘q, aholi o‘zgarmaydi
    run(g, 120);
    expect(houses.map((h) => h.residents)).toEqual([2, 2, 2]);
    expect(g.traffic.trips.length + g.traffic.queued).toBe(0);
  });

  it('uy hajmiga qarab: katta uyga 4 kishi (avtomobil), ko‘p qavatli uyga 10–20 kishi (avtobus)', () => {
    const { g, z, houses } = city({ houses: 2, type: 'uy_c' });
    // avtobus berk ko‘chada aylana olmaydi — chorraha
    g.buildRoad(manhattanPath({ x: 11, z: z - 1 }, { x: 11, z: z - 4 }));
    const apt = g.placeBuilding('kop_qavatli', 21, z + 1, 0);
    expect(apt.ok, apt.reason).toBe(true);
    const big = g.objectAt(21, z + 1)!;
    let bus: Trip | undefined;
    run(g, 150, () => { bus ??= g.traffic.trips.find((t) => t.kind === 'bus'); });
    expect(houses.map((h) => h.residents)).toEqual([4, 4]);
    expect(bus).toBeDefined();
    expect(bus!.stops.map((s) => s.house)).toEqual([big.id]);
    expect(big.residents).toBeGreaterThanOrEqual(10);
    expect(big.residents).toBeLessThanOrEqual(20);
    expect(g.traffic.trips.filter((t) => t.kind === 'car').every((t) => t.people <= 4)).toBe(true);
    expect(VEHICLE_SPECS.bus.length).toBeGreaterThan(VEHICLE_SPECS.car.length * 2);
  });

  it('darvoza: avtomatik — transport so‘raydi, to‘liq ochilgach o‘tadi, ustiga yopilmaydi; qo‘lda yopiq — jo‘natilmaydi', () => {
    const { g, z, houses } = city();
    // yo‘l ustiga darvoza (x = 45), atrofi bo‘sh
    const r = g.placeBuilding('himoya_darvoza', 45, z - 1, 1);
    expect(r.ok, r.reason).toBe(true);
    const gate = g.objectAt(45, z)!;
    expect(gate.type).toBe('himoya_darvoza');
    expect(gate.gate!.mode).toBe('auto'); // yangi darvoza sukut bo‘yicha avtomatik
    g.gateCommand(gate.id, 'close'); // qo‘lda yopilsa — transport uni ochmaydi
    run(g, 12);
    expect(g.traffic.block).toBe('gateClosed');
    expect(g.traffic.trips.length).toBe(0);
    g.gateCommand(gate.id, 'auto');
    let closedOnVehicle = 0, passed = false, waited = false;
    run(g, 80, () => {
      for (const t of g.traffic.trips) {
        const inGate = Math.abs(t.v.x - 45.5) < 0.5 + VEHICLE_SPECS[t.kind].length / 2 && Math.abs(t.v.z - (z + 0.5)) < 0.6;
        if (inGate && gate.gate!.open < 1) closedOnVehicle++;
        if (t.v.x < 44.5 && t.phase === 'arriving') passed = true;
        if (g.traffic.statusOf(t.id)?.status === 'Darvozada kutmoqda') waited = true;
      }
    });
    expect(passed).toBe(true);
    expect(waited).toBe(true);
    expect(closedOnVehicle).toBe(0);
    expect(houses[0].residents).toBeGreaterThan(0);
  });

  it('dinozavr yo‘lni to‘ssa — oldinroq to‘xtaydi (ichidan o‘tmaydi), bo‘shagach davom etadi', () => {
    const { g, z } = city();
    run(g, 10.05);
    // yo‘lda turgan dinozavr (harakatsiz)
    vi.spyOn(g.herd, 'step').mockImplementation(() => {});
    g.herd.dinos = [{ id: 'trex', type: 'trex', x: 50.5, z: z + 0.5, heading: 0, speed: 0, mode: 'rest', timer: 999, target: null, partner: null, cooldown: 99, visited: [], anim: 'idle', phase: { idle: 0, walk: 0, run: 0, look: 0 }, lookIdx: 0, rng: 1, face: null }];
    let overlap = 0, blocked = false;
    run(g, 25, () => {
      for (const t of g.traffic.trips) {
        const d = Math.hypot(t.v.x - 50.5, t.v.z - z - 0.5);
        if (d < 1.0) overlap++;
        if (g.traffic.statusOf(t.id)?.status === 'Yo‘l band') blocked = true;
      }
    });
    expect(blocked).toBe(true);
    expect(overlap).toBe(0);
    const before = g.traffic.trips[0]?.v.x;
    g.herd.dinos = [];
    run(g, 20);
    expect(g.traffic.trips[0] ? g.traffic.trips[0].v.x : 99).not.toBe(before);
  });

  it('uy buzilsa: boshqa mos uy izlanadi yoki safar bekor bo‘lib qaytadi; buzilgan uyga hech kim qo‘shilmaydi', () => {
    const { g, houses } = city({ houses: 2 });
    run(g, 12);
    const t = g.traffic.trips[0];
    expect(t).toBeDefined();
    const target = t.stops[0].house;
    g.demolish(target);
    run(g, 2);
    expect(t.stops.every((s) => s.house !== target)).toBe(true);
    const other = houses.find((h) => h.id !== target)!;
    run(g, 60);
    expect(g.objects.has(target)).toBe(false);
    expect(other.residents).toBeGreaterThan(0);
  });

  it('saqlash/yuklash yo‘lda: takror qo‘shilmaydi, band qilingan joy yo‘qolmaydi; pauzada to‘xtaydi', () => {
    const { g, s, houses } = city();
    run(g, 14);
    const t = g.traffic.trips[0];
    expect(t?.phase).toBe('arriving');
    const pos = { x: t.v.x, z: t.v.z };
    g.paused = true;
    run(g, 3);
    expect([t.v.x, t.v.z]).toEqual([pos.x, pos.z]);
    g.paused = false;
    g.saveNow(true);
    const raw = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(validateSave(raw)).toBeNull();
    const g2 = Game.boot(s);
    g2.herd.disabled = true; g2.herd.dinos = [];
    const h2 = g2.objectAt(houses[0].gridX, houses[0].gridZ)!;
    expect(g2.traffic.trips.length).toBe(1);
    expect(g2.traffic.reserved(h2.id)).toBe(t.people);
    expect(h2.residents).toBe(houses[0].residents);
    const before = h2.residents;
    let maxRes = 0;
    run(g2, 60, () => { maxRes = Math.max(maxRes, h2.residents); });
    expect(h2.residents - before).toBeGreaterThanOrEqual(t.people);
    expect(maxRes).toBeLessThanOrEqual(CATALOG.uy_a.capacity);
    // eski saqlash (transport ma’lumotisiz) — aholi o‘zgarmaydi
    delete raw.migration;
    s.setItem(SAVE_KEY, JSON.stringify(raw));
    const g3 = Game.boot(s);
    expect([g3.population, g3.traffic.trips.length]).toEqual([g.population, 0]);
  });

  it('bir vaqtda ko‘pi bilan 8 ta migratsiya transporti; shahar transporti alohida chegarada', () => {
    const { g, houses } = city({ houses: 7, type: 'uy_c' });
    let maxTrips = 0, maxCity = 0;
    for (const h of houses) h.residents = 2;
    run(g, 90, () => {
      maxTrips = Math.max(maxTrips, g.traffic.trips.length);
      maxCity = Math.max(maxCity, g.traffic.city.length);
    }, 0.2);
    expect(maxTrips).toBeLessThanOrEqual(MIGRATION_CONFIG.maxTrips);
    expect(maxCity).toBeLessThanOrEqual(CITY_TRAFFIC_CONFIG.carMax + CITY_TRAFFIC_CONFIG.busMax);
  }, 60000);
});
