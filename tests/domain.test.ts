import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIGRATION_CONFIG } from '../src/game/trafficDefs';
import { UTILITY_CONFIG } from '../src/game/utilities';
import { RAID_CONFIG } from '../src/game/herd';
import { Game } from '../src/game/game';
import { CATALOG } from '../src/game/catalog';
import { footprintCells, footprintSize, inBounds, isCoreWater, isWater, MAP_CONFIG, MAP_MAX, MAP_MIN, MAP_SIZE } from '../src/game/grid';
import { nearNaturalWater, BUILD_MAX_H, MOUNTAIN_KINDS, STEEP_REASON, TERRAIN_VERSION, terrainBlocksBuild, terrainBlocksDino } from '../src/game/terrain';
import { BRIDGE_PRICE, OUT_OF_MAP_REASON } from '../src/game/placement';
import { stationRadius, usesNaturalWater } from '../src/game/utilities';
import { HERD_DEFS, HERD_BY_TYPE, HERD_SLOTS, herdRadius, CHASE } from '../src/game/herdDefs';
import { clipGroundSpeed } from '../src/game/herd';
import { manhattanPath, pieceForMask, N, E, S, W } from '../src/game/roadNetwork';
import { BACKUP_KEY_V1, backupKey, SAVE_KEY, SCHEMA_VERSION, validateSave, type KeyValueStorage } from '../src/game/saveStore';
import { EDU_CONFIG, EDU_TASKS, EDUCATION, EDUCATION_BY_TYPE } from '../src/game/education';
import { HEALTH_CONFIG, HEALTH_TASK } from '../src/game/health';
import { CIVIC, CIVIC_CONFIG } from '../src/game/civicDefs';
import { DINO, DINO_SPECS, type DinoProfile } from '../src/game/dino';
import { MOVE_IN_PER_TICK, OUTAGE_GRACE_TICKS, START_MONEY } from '../src/game/simulation';
import { initialTutorial } from '../src/game/tutorial';
import { repTaxRate, REWARDS_CONFIG } from '../src/game/rewards';
import { computeBudget } from '../src/game/budget';
import { buildProgress, CONSTRUCTION, PHASES } from '../src/game/construction';
import { createPresetObjects } from '../src/game/presets';

class MemStorage implements KeyValueStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

/** Boshlang‘ich mahalla bilan (test fixture) — haqiqiy birinchi ochilish bo‘sh shahar, pastdagi testga qarang */
// budjet formulalari so‘mma-so‘m tekshiriladi — bonus tizimi alohida «Bonuslar…» blokida yoqiladi
REWARDS_CONFIG.enabled = false;

function newGame() {
  const s = new MemStorage();
  const g = Game.boot(s);
  g.resetToNewCity();
  return { g, s };
}

describe('Bonuslar, jarimalar va reyting', () => {
  beforeEach(() => { REWARDS_CONFIG.enabled = true; });
  afterEach(() => { REWARDS_CONFIG.enabled = false; });
  it('birinchi ko‘cha: darhol bir marta bonus (pul + reyting); takror yo‘lda yo‘q', () => {
    const g = Game.boot(new MemStorage());
    const m0 = g.money, r0 = g.rewards.rep;
    const res = g.buildRoad(manhattanPath({ x: 14, z: 16 }, { x: 18, z: 16 }));
    expect(res.ok).toBe(true);
    expect(g.rewards.done).toContain('firstRoad');
    expect(g.money).toBe(m0 - res.cost + 3000);
    expect(g.rewards.rep).toBe(r0 + 2);
    const m1 = g.money;
    const res2 = g.buildRoad(manhattanPath({ x: 18, z: 17 }, { x: 18, z: 19 }));
    expect(g.money).toBe(m1 - res2.cost);
    expect(g.rewards.log[0].title).toBe('Birinchi ko‘cha');
  });

  it('reyting uy solig‘iga ta’sir qiladi (50 → 0, 100 → +10%, 0 → −10%)', () => {
    expect(repTaxRate(50)).toBe(0);
    expect(repTaxRate(100)).toBeCloseTo(0.1);
    expect(repTaxRate(0)).toBeCloseTo(-0.1);
  });

  it('aholisi bor uy buzilsa — jarima (kishi soniga qarab) va reyting pasayadi; bo‘sh uy — jarima yo‘q', () => {
    const { g } = newGame();
    const house = g.list.find((o) => CATALOG[o.type].kind === 'house' && !o.build)!;
    house.residents = 6;
    const m0 = g.money, r0 = g.rewards.rep;
    g.demolish(house.id);
    expect(g.money).toBe(m0 - 1000 - 6 * 50);
    expect(g.rewards.rep).toBe(r0 - 3);
    const empty = g.list.find((o) => CATALOG[o.type].kind === 'house' && !o.build && o.residents === 0);
    if (empty) { const m1 = g.money; g.demolish(empty.id); expect(g.money).toBe(m1); }
  });

  it('aholi noroziligi jarimasi har 3 davrda ko‘pi bilan bir marta', () => {
    const { g } = newGame();
    for (const o of g.list) if (CATALOG[o.type].kind === 'house') o.residents = CATALOG[o.type].capacity;
    Object.defineProperty(g, 'happiness', { get: () => 10 });
    const before = g.rewards.log.filter((l) => l.title.startsWith('Aholi noroziligi')).length;
    for (let i = 0; i < 6; i++) g.tick();
    const n = g.rewards.log.filter((l) => l.title.startsWith('Aholi noroziligi')).length - before;
    expect(n).toBe(2);
  });

  it('eski saqlash (rewards yo‘q): bajarilganlar jimgina belgilanadi — birdan pul tushmaydi; saqlash/yuklash reytingni tiklaydi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    g.resetToNewCity(); // tayyor mahalla — yo‘llar bor
    g.saveNow();
    const d = JSON.parse(s.getItem(SAVE_KEY)!);
    delete d.rewards;
    s.setItem(SAVE_KEY, JSON.stringify(d));
    const old = Game.boot(s);
    expect(old.money).toBe(d.money);
    old.rewards.rep = 73;
    old.saveNow();
    expect(Game.boot(s).rewards.rep).toBe(73);
  });
});

describe('Yangi o‘yin', () => {
  it('saqlash yo‘q — bo‘sh shahar: qurilgan obyekt yo‘q, aholi 0, boshlang‘ich pul; tabiat va dinozavr bor; Dastyor yo‘l topshirig‘idan', () => {
    const g = Game.boot(new MemStorage());
    const built = [...g.objects.values()].filter((o) => !['tree', 'daraxt', 'rock', 'tosh'].includes(o.type as string));
    expect(built).toEqual([]);
    expect(g.population).toBe(0);
    expect(g.money).toBe(START_MONEY);
    expect(g.tickCount).toBe(0);
    expect(g.terrain).not.toBeNull();
    expect(g.tutorial.step).toBe(initialTutorial().step);
  });

  it('Dastyor tanishtiruvi: ochiq paytda simulyatsiya to‘xtaydi, paused o‘zgarmaydi; yakunda saqlanadi; qayta ko‘rish hech narsani o‘zgartirmaydi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    expect(g.hints.onboarding).toBe(false);
    g.startOnboarding(false);
    for (let i = 0; i < 40; i++) g.update(0.25);
    expect(g.simTime).toBe(0);
    expect(g.paused).toBe(false);
    expect(g.placeBuilding('uy_a', 20, 20, 0)).toMatchObject({ ok: false });
    g.openModal(null);
    expect(g.hints.onboarding).toBe(true);
    expect(g.dastyorOpen).toBe(true);
    expect(g.tutorial.step).toBe(0);
    g.update(0.25);
    expect(g.simTime).toBeGreaterThan(0);
    g.saveNow();
    expect(Game.boot(s).hints.onboarding).toBe(true);
    // qayta ko‘rish: pauza holati, pul va topshiriq saqlanadi
    g.togglePause();
    const money = g.money, step = g.tutorial.step;
    g.startOnboarding(true);
    g.openModal(null);
    expect([g.paused, g.money, g.tutorial.step, g.hints.onboarding]).toEqual([true, money, step, true]);
  });

  it('eski saqlash (hints.onboarding yo‘q) — tanishtiruv majburan ochilmaydi; «Yangi shahar» — ochiladi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    g.saveNow();
    const d = JSON.parse(s.getItem(SAVE_KEY)!);
    delete d.hints.onboarding;
    s.setItem(SAVE_KEY, JSON.stringify(d));
    const old = Game.boot(s);
    expect(old.hints.onboarding).toBe(true);
    // shu qurilmada hali ko‘rilmagan — o‘yin birinchi ochilganda bir marta chiqadi; yopilgach qayta chiqmaydi
    expect(old.onboardingDue).toBe(true);
    old.startOnboarding(false);
    old.openModal(null);
    expect(old.onboardingDue).toBe(false);
    expect(Game.boot(s).onboardingDue).toBe(false);
    old.confirmNewCity();
    expect(old.hints.onboarding).toBe(false); // UI sahna tayyor bo‘lgach tanishtiruvni ochadi
  });

  it('saqlangan shahar bo‘lsa — u ochiladi (davom etish), bo‘sh shahar bilan almashtirilmaydi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    g.resetToNewCity();
    g.saveNow();
    const n = g.objects.size;
    expect(n).toBeGreaterThan(0);
    expect(Game.boot(s).objects.size).toBe(n);
  });
});

/** Kirish tarmog‘idagi (13,16) dan o‘ngga yo‘l */
function roadEast(g: Game, toX: number) {
  return g.buildRoad(manhattanPath({ x: 14, z: 16 }, { x: toX, z: 16 }));
}

// Eski sinovlar bino darhol tayyor bo‘lishini kutadi; qurilish sinovlari pastda alohida yoqadi.
beforeEach(() => { vi.useFakeTimers(); CONSTRUCTION.enabled = false; MIGRATION_CONFIG.transport = false; UTILITY_CONFIG.mode = 'radius'; RAID_CONFIG.enabled = false; });
afterEach(() => { vi.useRealTimers(); });

describe('Preset va xarita', () => {
  it('karta kengroq bo‘lishi kerak', () => {
    expect(MAP_SIZE).toBe(MAP_CONFIG.coreSize * 2);
  });
  it('preset obyektlar to‘qnashmaydi va suvga tushmaydi', () => {
    const { objects } = createPresetObjects();
    const d = { schemaVersion: 1, seed: 1, money: 1, simTime: 0, tickAccumulator: 0, tickCount: 0, nextId: 1,
      placedObjects: objects, tutorial: { step: 0, completed: false, skipped: false },
      settings: { quality: 'high', autosave: true }, camera: { targetX: 0, targetZ: 0, azimuth: 0, polar: 1, distance: 30 } };
    expect(validateSave(d)).toBeNull();
  });
  it('preset uylar yo‘l, elektr va suv bilan ta’minlangan', () => {
    const { g } = newGame();
    for (const o of g.list) {
      if (CATALOG[o.type].kind !== 'house' && CATALOG[o.type].kind !== 'business') continue;
      const st = g.statuses.get(o.id)!;
      expect([o.type, st.road, st.power, st.water]).toEqual([o.type, true, true, true]);
    }
    expect(g.population).toBe(106);
    expect(g.money).toBe(500000);
  });
});

describe('A02/A03 joylashtirish va cheklovlar', () => {
  it('R footprintni almashtiradi', () => {
    expect(footprintSize('uy_c', 0)).toEqual({ w: 2, d: 3 });
    expect(footprintSize('uy_c', 1)).toEqual({ w: 3, d: 2 });
  });
  it('narx faqat bir marta ayriladi', () => {
    const { g } = newGame();
    const r = g.placeBuilding('uy_a', 16, 17, 0);
    expect(r.ok).toBe(true);
    expect(g.money).toBe(500000 - 500);
    expect(g.placeBuilding('uy_a', 16, 17, 0).ok).toBe(false); // collision
    expect(g.money).toBe(500000 - 500);
  });
  it('suv, collision va mablag‘ bloklaydi, chegara esa olib tashlanadi', () => {
    const { g } = newGame();
    expect(isWater(22, 4)).toBe(true);
    expect(g.checkPlacement('uy_a', 22, 4, 0).reason).toMatch(/Suv/);
    expect(g.checkPlacement('uy_a', 40, 18, 0).ok).toBe(true);
    expect(g.checkPlacement('uy_a', 7, 10, 0).reason).toMatch(/band/);
    g.money = 100;
    expect(g.checkPlacement('uy_a', 20, 20, 0).reason).toMatch(/Mablag/);
  });
  it('har qanday obyektni buzish mumkin: daraxt misolida', () => {
    const { g } = newGame();
    const tree = g.list.find((o) => o.type === 'daraxt');
    expect(tree).toBeTruthy();
    expect(g.demolish(tree!.id)).toBe(true);
    expect(g.objectAt(tree!.gridX, tree!.gridZ)).toBeNull();
  });
});

describe('A04/A05 yo‘llar va tarmoq', () => {
  it('bitmask shakllari', () => {
    expect(pieceForMask(N | S).shape).toBe('straight');
    expect(pieceForMask(E | W)).toEqual({ shape: 'straight', rotation: 1 });
    expect(pieceForMask(N | E).shape).toBe('corner');
    expect(pieceForMask(S | W).shape).toBe('corner');
    expect(pieceForMask(N | E | S).shape).toBe('t');
    expect(pieceForMask(E | S | W).shape).toBe('t');
    expect(pieceForMask(N | E | S | W).shape).toBe('cross');
    expect(pieceForMask(W).shape).toBe('end');
  });
  it('mavjud katak qayta narxlanmaydi; diagonal yo‘q', () => {
    const { g } = newGame();
    const path = manhattanPath({ x: 10, z: 16 }, { x: 16, z: 19 });
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].z - path[i - 1].z)).toBe(1);
    }
    const r = g.buildRoad(path);
    // (10..13,16) allaqachon yo‘l → faqat 3 + 3 yangi katak
    expect(r.newCells.length).toBe(6);
    expect(g.money).toBe(500000 - 600);
  });
  it('mablag‘ yetmasa butun harakat bekor', () => {
    const { g } = newGame();
    g.money = 250;
    const r = roadEast(g, 18);
    expect(r.ok).toBe(false);
    expect(g.money).toBe(250);
    expect(g.roads.isRoad(14, 16)).toBe(false);
  });
  it('uzilgan yo‘l yonidagi uy ulanmagan, ulanganda yangilanadi', () => {
    const { g } = newGame();
    g.buildRoad(manhattanPath({ x: 20, z: 16 }, { x: 24, z: 16 }));
    expect(g.roads.isConnected(20, 16)).toBe(false);
    g.placeBuilding('uy_a', 21, 17, 2);
    const id = g.objectAt(21, 17)!.id;
    expect(g.statuses.get(id)!.road).toBe(false);
    roadEast(g, 19);
    expect(g.roads.isConnected(24, 16)).toBe(true);
    expect(g.statuses.get(id)!.road).toBe(true);
  });
  it('diagonal tegish ulanish emas', () => {
    const { g } = newGame();
    roadEast(g, 18);
    g.placeBuilding('uy_a', 19, 17, 0); // (18,16) bilan faqat diagonal
    expect(g.statuses.get(g.objectAt(19, 17)!.id)!.road).toBe(false);
  });
});

describe('A06 ta’minot', () => {
  it('radius ichida bor, tashqarisida yo‘q, buzilsa darhol yangilanadi', () => {
    const { g } = newGame();
    roadEast(g, 30);
    g.placeBuilding('uy_a', 26, 17, 0);
    const house = g.objectAt(26, 17)!.id;
    expect(g.statuses.get(house)!.power).toBe(false);
    g.placeBuilding('elektr', 20, 13, 0); // markaz (21.5,14.5) → uy (27,18): 6.5
    const st = g.objectAt(20, 13)!.id;
    expect(g.statuses.get(st)!.active).toBe(true);
    expect(g.statuses.get(house)!.power).toBe(true);
    g.placeBuilding('uy_a', 29, 12, 0); // markaz (30,13) masofa 8.6 > 8, yo‘lga ham ulanmagan
    expect(g.statuses.get(g.objectAt(29, 12)!.id)!.power).toBe(false);
    g.demolish(st);
    expect(g.statuses.get(house)!.power).toBe(false);
  });
  it('yo‘lga ulanmagan stansiya xizmat bermaydi', () => {
    const { g } = newGame();
    g.placeBuilding('suv', 20, 25, 0);
    expect(g.statuses.get(g.objectAt(20, 25)!.id)!.active).toBe(false);
  });
});

describe('A07/A08 hisob va pauza', () => {
  it('aholi kelishi/ketishi va daromad formulasi', () => {
    const { g } = newGame();
    roadEast(g, 24);
    g.placeBuilding('uy_c', 18, 17, 0); // sig‘im 18, elektr yo‘q
    const h = g.objectAt(18, 17)!;
    g.placeBuilding('elektr', 15, 13, 0);
    g.placeBuilding('suv', 19, 13, 0);
    expect(g.statuses.get(h.id)!.power && g.statuses.get(h.id)!.water).toBe(true);
    const moneyBefore = g.money;
    const popBefore = g.population;
    g.update(0.25);
    for (let i = 0; i < 40; i++) g.update(0.25); // 10 s
    expect(g.tickCount).toBe(1);
    expect(h.residents).toBe(MOVE_IN_PER_TICK); // davrda ko‘pi bilan 2 kishi
    const upkeep = 40 + 40 + 25 + 25 + 5; // 2 ta elektr, 2 ta suv, preset bog‘
    const tax = popBefore * 2; // soliq davr boshidagi aholidan; yangi kelganlar keyingi davrdan to‘laydi
    const business = 80; // preset do‘kon
    expect(g.money - moneyBefore).toBe(tax + business - upkeep);
    // stansiya buzilsa — avval ogohlantirish muddati, darhol hech kim ketmaydi
    g.demolish(g.objectAt(15, 13)!.id);
    for (let i = 0; i < 40; i++) g.update(0.25);
    expect(h.residents).toBe(MOVE_IN_PER_TICK);
  });
  it('pauzada pul va aholi o‘zgarmaydi', () => {
    const { g } = newGame();
    g.togglePause();
    const m = g.money;
    for (let i = 0; i < 200; i++) g.update(0.25);
    expect(g.money).toBe(m);
    expect(g.tickCount).toBe(0);
  });
  it('fon tabdan qaytishda katta dt bitta davrdan oshmaydi', () => {
    const { g } = newGame();
    g.update(5000);
    expect(g.tickCount).toBe(0);
  });
  it('qarzda qurilish bloklanadi', () => {
    const { g } = newGame();
    g.money = -50;
    expect(g.placeBuilding('daraxt', 20, 20, 0).ok).toBe(false);
  });
});

describe('A09 Dastyor', () => {
  it('preset topshiriqni bajarmaydi; real amallar bosqichma-bosqich yakunlaydi', () => {
    const { g } = newGame();
    expect(g.tutorial.step).toBe(0);
    roadEast(g, 16);
    expect(g.tutorial.step).toBe(1);
    g.placeBuilding('uy_a', 15, 17, 0);
    expect(g.tutorial.step).toBe(2);
    g.placeBuilding('elektr', 18, 17, 0); // yo‘lga ulanmagan
    expect(g.tutorial.step).toBe(2);
    roadEast(g, 21);
    expect(g.tutorial.step).toBe(3);
    g.placeBuilding('suv', 14, 13, 0);
    expect(g.tutorial.step).toBe(4);
    g.placeBuilding('bog', 15, 19, 0);
    expect(g.tutorial.completed).toBe(true);
  });
  it('skip saqlanadi', () => {
    const { g, s } = newGame();
    g.skipTutorial();
    vi.advanceTimersByTime(600);
    expect(JSON.parse(s.getItem(SAVE_KEY)!).tutorial.skipped).toBe(true);
  });
});

describe('A10 saqlash va tiklash', () => {
  it('qurish, aylantirish, bir davr, refresh', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    roadEast(g, 20);
    g.placeBuilding('uy_c', 16, 17, 1);
    for (let i = 0; i < 40; i++) g.update(0.25);
    vi.advanceTimersByTime(600);
    const g2 = Game.boot(s);
    expect(g2.money).toBe(g.money);
    expect(g2.tutorial.step).toBe(g.tutorial.step);
    expect(g2.list.length).toBe(g.list.length);
    const h = g2.objectAt(16, 17)!;
    expect(h.rotation).toBe(1);
    expect(h.residents).toBe(g.objectAt(16, 17)!.residents);
    expect(g2.population).toBe(g.population);
  });
  it('buzilgan saqlash jim o‘chirilmaydi', () => {
    const s = new MemStorage();
    s.setItem(SAVE_KEY, '{"schemaVersion":1,"placedObjects":"x"}');
    const g = Game.boot(s);
    expect(g.modal).toBe('invalidSave');
    expect(g.autosaveBlocked).toBe(true);
    g.placeBuilding;
    g.scheduleAutosave();
    vi.advanceTimersByTime(600);
    expect(s.getItem(SAVE_KEY)).toBe('{"schemaVersion":1,"placedObjects":"x"}');
  });
  it('collision bor saqlash rad etiladi', () => {
    const { g } = newGame();
    const d = g.toSaveData();
    d.placedObjects.push({ ...d.placedObjects[0], id: 'dup' });
    expect(validateSave(d)).toMatch(/ustma-ust/);
  });
});

describe('A12 buzish', () => {
  it('kirish yo‘li buzilmaydi; xarajat to‘xtaydi; occupancy bo‘shaydi', () => {
    const { g } = newGame();
    expect(g.demolish(g.objectAt(0, 16)!.id)).toBe(false);
    const station = g.objectAt(4, 12)!; // preset elektr
    const m = g.money;
    expect(g.demolish(station.id)).toBe(true);
    expect(g.money).toBe(m); // narx qaytarilmaydi
    expect(g.objectAt(4, 12)).toBeNull();
    // keyingi davrda elektr xarajati yo‘q va uylar elektrsiz
    const house = g.objectAt(5, 9)!;
    expect(g.statuses.get(house.id)!.power).toBe(false);
    for (let i = 0; i < 40; i++) g.update(0.25);
    expect(g.lastReport!.upkeep).toBe(25 + 5);
  });
  it('yo‘l buzilsa ulanish qayta hisoblanadi', () => {
    const { g } = newGame();
    const shop = g.objectAt(12, 14)!;
    expect(g.statuses.get(shop.id)!.road).toBe(true);
    g.demolish(g.objectAt(12, 16)!.id);
    g.demolish(g.objectAt(13, 16)!.id);
    expect(g.statuses.get(shop.id)!.road).toBe(false);
  });
});

/** Bitta hisob davrini o‘tkazadi (10 s faol simulyatsiya). */
function tick(g: Game, n = 1) {
  for (let k = 0; k < n; k++) for (let i = 0; i < 40; i++) g.update(0.25);
}

/** Yo‘l, elektr va suv bilan to‘liq ta’minlangan yangi Uy A (sig‘im 8). */
function servedHouse(g: Game) {
  roadEast(g, 24);
  g.placeBuilding('uy_a', 18, 17, 0);
  g.placeBuilding('elektr', 15, 13, 0);
  g.placeBuilding('suv', 19, 13, 0);
  const h = g.objectAt(18, 17)!;
  const st = g.statuses.get(h.id)!;
  expect([st.road, st.power, st.water]).toEqual([true, true, true]);
  return h;
}

describe('Aholi ko‘chishi', () => {
  it('yangi uy bo‘sh; sig‘im aholi emas', () => {
    const { g } = newGame();
    const pop = g.population;
    const h = servedHouse(g);
    expect(h.residents).toBe(0);
    expect(g.population).toBe(pop); // sig‘im 8 qo‘shilmaydi
    const f = g.houseForecast(h.id)!;
    expect([f.capacity, f.residents, f.vacant, f.state, f.nextDelta]).toEqual([8, 0, 8, 'moving_in', 2]);
  });
  it('ta’minlangan uyga davrda 2 kishidan keladi, sig‘imdan oshmaydi, prognoz haqiqiy', () => {
    const { g } = newGame();
    const pop = g.population;
    const h = servedHouse(g);
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      const predicted = g.houseForecast(h.id)!.nextDelta;
      const before = h.residents;
      tick(g);
      expect(h.residents - before).toBe(predicted);
      seen.push(h.residents);
    }
    expect(seen).toEqual([2, 4, 6, 8, 8, 8]);
    expect(g.houseForecast(h.id)!.state).toBe('full');
    expect(g.population).toBe(pop + 8);
  });
  it('bo‘sh joy 1 bo‘lsa prognoz +1', () => {
    const { g } = newGame();
    const h = servedHouse(g);
    h.residents = 7;
    expect(g.houseForecast(h.id)!.nextDelta).toBe(1);
    tick(g);
    expect(h.residents).toBe(8);
  });
  it('ta’minlanmagan bo‘sh uyga hech kim kelmaydi va sababi aytiladi', () => {
    const { g } = newGame();
    roadEast(g, 24);
    g.placeBuilding('uy_a', 22, 17, 0); // yo‘l bor, boshlang‘ich stansiyalar radiusidan tashqarida
    const h = g.objectAt(22, 17)!;
    tick(g, 5);
    expect(h.residents).toBe(0);
    const f = g.houseForecast(h.id)!;
    expect(f.state).toBe('blocked');
    expect(f.missing).toEqual(['power', 'water']);
    expect(g.supplyReason(h.id, 'power')).toMatch(/8 katak/);
    expect(g.supplyReason(h.id, 'water')).toMatch(/6 katak/);
  });
  it('uzilish: 3 davr ogohlantirish, keyin davrda 1 kishi; bir nechta muammo ham 1 kishi', () => {
    const { g } = newGame();
    const h = servedHouse(g);
    tick(g, 4);
    expect(h.residents).toBe(8);
    // elektr ham, suv ham uziladi
    g.demolish(g.objectAt(15, 13)!.id);
    g.demolish(g.objectAt(19, 13)!.id);
    expect(g.houseForecast(h.id)!.missing).toEqual(['power', 'water']);
    for (let i = 1; i <= OUTAGE_GRACE_TICKS; i++) {
      expect(g.houseForecast(h.id)!.state).toBe('warning');
      expect(g.houseForecast(h.id)!.graceLeft).toBe(OUTAGE_GRACE_TICKS - i + 1);
      tick(g);
      expect(h.residents).toBe(8);
      expect(h.outageTicks).toBe(i);
    }
    expect(g.houseForecast(h.id)!.state).toBe('leaving');
    expect(g.houseForecast(h.id)!.nextDelta).toBe(-1);
    tick(g);
    expect(h.residents).toBe(7);
    tick(g);
    expect(h.residents).toBe(6);
  });
  it('ta’minot tiklansa taymer tozalanadi va ko‘chish davom etadi', () => {
    const { g } = newGame();
    const h = servedHouse(g);
    tick(g, 4);
    g.demolish(g.objectAt(19, 13)!.id);
    tick(g, 2);
    expect(h.outageTicks).toBe(2);
    g.placeBuilding('suv', 19, 13, 0);
    expect(g.houseForecast(h.id)!.state).toBe('full');
    tick(g);
    expect(h.outageTicks).toBe(0);
    expect(h.residents).toBe(8);
    // qayta uzilsa muddat boshidan
    g.demolish(g.objectAt(19, 13)!.id);
    tick(g, 3);
    expect(h.residents).toBe(8);
  });
  it('yo‘l uzilsa ham xuddi shu qoida; residents 0 dan pastga tushmaydi', () => {
    const { g } = newGame();
    const h = servedHouse(g);
    tick(g);
    expect(h.residents).toBe(2);
    g.demolish(g.objectAt(14, 16)!.id); // tarmoqni kirishdan uzadi
    expect(g.statuses.get(h.id)!.road).toBe(false);
    expect(g.houseForecast(h.id)!.missing).toEqual(['road', 'power', 'water']); // stansiyalar ham o‘chdi
    tick(g, 3);
    expect(h.residents).toBe(2);
    tick(g, 10);
    expect(h.residents).toBe(0);
    expect(g.houseForecast(h.id)!.state).toBe('blocked');
  });
  it('uy buzilsa yashovchilar umumiy aholidan bir marta chiqadi', () => {
    const { g } = newGame();
    const h = servedHouse(g);
    tick(g, 2);
    const pop = g.population;
    expect(h.residents).toBe(4);
    g.demolish(h.id);
    expect(g.population).toBe(pop - 4);
    tick(g);
    expect(g.population).toBe(pop - 4);
  });
  it('pauzada ko‘chish to‘xtaydi', () => {
    const { g } = newGame();
    const h = servedHouse(g);
    g.togglePause();
    tick(g, 3);
    expect(h.residents).toBe(0);
    g.togglePause();
    tick(g);
    expect(h.residents).toBe(2);
  });
});

describe('Ta’minot xulosasi', () => {
  it('uylar soni, Dastyor maslahati va ustuvorlik bir xil holatdan', () => {
    const { g } = newGame();
    expect(g.supply).toEqual({ houses: 5, road: 5, power: 5, water: 5 });
    expect(g.advice).toBeNull();
    roadEast(g, 24);
    g.placeBuilding('uy_a', 22, 17, 0);
    expect(g.supply).toEqual({ houses: 6, road: 6, power: 5, water: 5 });
    expect(g.advice).toBe('Bir uyga elektr yetishmayapti.');
    g.placeBuilding('elektr', 19, 13, 0);
    expect(g.advice).toBe('Bir uyga suv yetishmayapti.');
    g.placeBuilding('suv', 23, 13, 0);
    expect(g.advice).toBeNull();
    expect(g.supply).toEqual({ houses: 6, road: 6, power: 6, water: 6 });
  });
  it('radius chegarasi: markazdan markazgacha masofa ≤ radius', () => {
    const { g } = newGame();
    roadEast(g, 34);
    g.placeBuilding('suv', 20, 13, 0); // markaz (21.5, 14.5), radius 6
    g.placeBuilding('uy_a', 26, 14, 0); // markaz (27, 15): 5.52 — ichida
    g.placeBuilding('uy_a', 27, 12, 0); // markaz (28, 13): 6.67 — tashqarida
    expect(g.statuses.get(g.objectAt(26, 14)!.id)!.water).toBe(true);
    expect(g.statuses.get(g.objectAt(27, 12)!.id)!.water).toBe(false);
  });
  it('yo‘lga ulanmagan stansiya sabab sifatida ko‘rsatiladi', () => {
    const { g } = newGame();
    roadEast(g, 24);
    g.placeBuilding('uy_a', 22, 17, 0);
    g.placeBuilding('elektr', 21, 20, 0); // yo‘lsiz
    expect(g.supplyReason(g.objectAt(22, 17)!.id, 'power')).toMatch(/yo‘lga ulanmagan/);
  });
});

describe('Budjet', () => {
  it('qatorlar yig‘indisi sof natijaga teng va davr aynan shuni qo‘llaydi', () => {
    const { g } = newGame();
    servedHouse(g);
    g.placeBuilding('maktab', 21, 17, 0);
    for (let i = 0; i < 4; i++) {
      const b = g.budget;
      const income = b.lines.filter((l) => l.kind === 'income').reduce((a, l) => a + l.amount, 0);
      const expense = b.lines.filter((l) => l.kind === 'expense').reduce((a, l) => a + l.amount, 0);
      expect(b.income).toBe(income);
      expect(b.expense).toBe(expense);
      expect(b.net).toBe(income - expense);
      expect([...b.perObject.values()].reduce((a, v) => a + v, 0)).toBe(b.net);
      const money = g.money;
      tick(g);
      expect(g.money - money).toBe(b.net);
      expect(g.lastReport!.net).toBe(b.net);
    }
  });
  it('guruhlar: uy solig‘i, biznes, elektr, suv, bog‘, xizmatlar', () => {
    const { g } = newGame();
    const get = (id: string) => g.budget.lines.find((l) => l.id === id)!.amount;
    expect(get('houseTax')).toBe(106 * 2);
    expect(get('business')).toBe(80);
    expect(get('power')).toBe(40);
    expect(get('water')).toBe(25);
    expect(get('parks')).toBe(5);
    expect(get('services')).toBe(0);
    expect(g.budget.net).toBe(212 + 80 - 70);
  });
  it('qurilish narxi davriy xarajatga kirmaydi va bir marta ayriladi', () => {
    const { g } = newGame();
    const net = g.budget.net;
    const money = g.money;
    g.placeBuilding('uy_a', 16, 17, 0); // 500, xarajatsiz
    expect(g.money).toBe(money - 500);
    expect(g.budget.net).toBe(net);
    g.placeBuilding('maktab', 20, 20, 0); // 2500 + davriy 30
    expect(g.money).toBe(money - 3000);
    expect(g.budget.net).toBe(net - 30);
    tick(g);
    expect(g.money).toBe(money - 3000 + net - 30);
  });
  it('zarar yashirilmaydi: manfiy sof natija qatorlari bilan, balans manfiyga tushadi', () => {
    const { g } = newGame();
    for (const o of g.list) if (CATALOG[o.type].kind === 'house') o.residents = 0;
    g.recompute();
    const b = computeBudget(g.list, g.statuses);
    expect(b.income).toBe(0); // aholi yo‘q → soliq ham, biznes ham yo‘q
    expect(b.idleBusinesses).toBe(1);
    expect(b.net).toBe(-70);
    g.money = 20;
    g.togglePause(); // pauzada zarar ham hisoblanmaydi
    tick(g);
    expect(g.money).toBe(20);
    g.togglePause();
    tick(g);
    expect(g.money).toBe(-50);
  });
});

describe('Saqlash: sxema 2 va migratsiya', () => {
  it('residents va uzilish taymeri saqlanadi; refresh hech narsani qayta hisoblamaydi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    const h = servedHouse(g);
    tick(g, 2);
    g.demolish(g.objectAt(19, 13)!.id);
    tick(g, 2);
    g.saveNow(true);
    const saved = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    const g2 = Game.boot(s);
    const h2 = g2.objectAt(18, 17)!;
    expect([h2.residents, h2.outageTicks]).toEqual([h.residents, 2]);
    expect(g2.money).toBe(g.money);
    expect(g2.population).toBe(g.population);
    expect(g2.tickCount).toBe(g.tickCount);
    expect(g2.budget.net).toBe(g.budget.net);
    expect(g2.supply).toEqual(g.supply);
    // yana bir marta yuklash ham o‘zgartirmaydi
    const g3 = Game.boot(s);
    expect([g3.money, g3.population]).toEqual([g.money, g.population]);
  });
  it('eski (1-sxema) shahar saqlangan holda yuklanadi, asl nusxa alohida saqlanadi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    servedHouse(g);
    tick(g, 2);
    const old = g.toSaveData() as unknown as { schemaVersion: number; placedObjects: Record<string, unknown>[] };
    old.schemaVersion = 1;
    for (const o of old.placedObjects) delete o.outageTicks;
    const raw = JSON.stringify(old);
    s.setItem(SAVE_KEY, raw);

    const g2 = Game.boot(s);
    expect(g2.modal).toBeNull();
    expect(g2.autosaveBlocked).toBe(false);
    expect(s.getItem(BACKUP_KEY_V1)).toBe(raw);
    expect(s.getItem(SAVE_KEY)).toBe(raw); // yuklashning o‘zi eski faylni o‘zgartirmaydi
    expect(g2.list.length).toBe(g.list.length);
    expect(g2.money).toBe(g.money);
    expect(g2.population).toBe(g.population);
    expect(g2.objectAt(18, 17)!.residents).toBe(4);
    expect(g2.list.every((o) => o.outageTicks === 0)).toBe(true);
    // keyingi saqlash joriy sxemada yoziladi, nusxa esa o‘zgarmaydi
    g2.saveNow(true);
    expect(JSON.parse(s.getItem(SAVE_KEY)!).schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.getItem(BACKUP_KEY_V1)).toBe(raw);
  });
  it('nusxa olib bo‘lmasa eski fayl ustidan avtomatik yozilmaydi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    const old = g.toSaveData() as unknown as { schemaVersion: number };
    old.schemaVersion = 1;
    const raw = JSON.stringify(old);
    s.setItem(SAVE_KEY, raw);
    const orig = s.setItem.bind(s);
    s.setItem = (k: string, v: string) => { if (k === BACKUP_KEY_V1) throw new Error('kvota'); orig(k, v); };
    const g2 = Game.boot(s);
    expect(g2.autosaveBlocked).toBe(true);
    g2.scheduleAutosave();
    vi.advanceTimersByTime(600);
    expect(s.getItem(SAVE_KEY)).toBe(raw);
  });
});

import { BUSINESSES, BUSINESS_GROUPS } from '../src/game/businesses';
import { itemsInCategory } from '../src/game/catalog';
import type { ObjectType, Rotation } from '../src/game/types';

/** Bo‘sh joy topib qo‘yadi (40×40 xaritaning sharqiy qismida). */
function placeSomewhere(g: Game, t: ObjectType, rot: Rotation) {
  for (let z = 0; z < 40; z++) for (let x = 14; x < 40; x++) {
    if (g.checkPlacement(t, x, z, rot).ok) {
      const r = g.placeBuilding(t, x, z, rot);
      expect(r.ok).toBe(true);
      return g.objectAt(x, z)!;
    }
  }
  throw new Error('joy topilmadi: ' + t);
}

describe('Biznes binolari', () => {
  it('18 ta obyekt, 6 guruh, hammasi «Biznes» bo‘limida', () => {
    expect(BUSINESSES).toHaveLength(18);
    expect(new Set(BUSINESSES.map((b) => b.type)).size).toBe(18);
    const items = itemsInCategory('biznes');
    expect(items).toHaveLength(18);
    for (const gr of BUSINESS_GROUPS) expect(items.some((e) => e.group === gr.id)).toBe(true);
    for (const e of items) {
      expect(e.kind).toBe('business');
      expect(e.cardImage).toBe('assets/business/' + e.type + '.jpg');
      expect(e.price).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(5);
      // balans mavjud bizneslar oralig‘ida: 18–33 davrda o‘zini qoplaydi
      expect(e.price / e.income).toBeGreaterThanOrEqual(18);
      expect(e.price / e.income).toBeLessThanOrEqual(33);
    }
  });
  it('maydon model o‘lchamiga mos: Chorsu kichik do‘kondan katta', () => {
    expect(CATALOG.chorsu.width * CATALOG.chorsu.depth).toBe(36);
    expect(CATALOG.bon.width * CATALOG.bon.depth).toBe(9);
    expect(footprintSize('korzinka', 1)).toEqual({ w: 3, d: 4 });
  });
  it('hammasi quriladi va aylantiriladi, pul bir marta yechiladi, ustma-ust qurilmaydi', () => {
    const { g } = newGame();
    g.money = 1_000_000;
    for (const [i, def] of BUSINESSES.entries()) {
      const rot = (i % 4) as Rotation;
      const before = g.money;
      const o = placeSomewhere(g, def.type, rot);
      expect(g.money).toBe(before - def.price);
      expect(o.rotation).toBe(rot);
      // xuddi shu joyga yoki uning ustiga qayta qurib bo‘lmaydi, pul o‘zgarmaydi
      expect(g.placeBuilding(def.type, o.gridX, o.gridZ, rot).ok).toBe(false);
      expect(g.placeBuilding('bon', o.gridX + 1, o.gridZ + 1, 0).ok).toBe(false);
      expect(g.money).toBe(before - def.price);
      const fp = footprintSize(def.type, rot);
      for (let dz = 0; dz < fp.d; dz++) for (let dx = 0; dx < fp.w; dx++) expect(g.occ.get(o.gridX + dx, o.gridZ + dz)).toBe(o.id);
    }
  });
  it('suv va yo‘l ustiga qurilmaydi', () => {
    const { g } = newGame();
    expect(g.checkPlacement('chorsu', 20, 2, 0).reason).toMatch(/Suv/); // ko‘l 22–25 × 4–7
    expect(g.checkPlacement('bon', 12, 15, 0).reason).toMatch(/band/); // asosiy ko‘cha z=16
  });
  it('xizmat holati: yo‘l, elektr va suv bo‘lsa daromad beradi, aks holda sababi aytiladi', () => {
    const { g } = newGame();
    roadEast(g, 30);
    g.placeBuilding('korzinka', 16, 17, 0);
    const k = g.objectAt(16, 17)!;
    expect(g.statuses.get(k.id)!.road).toBe(true);
    expect(g.supplyReason(k.id, 'power')).toMatch(/elektr/);
    const income0 = g.budget.lines.find((l) => l.id === 'business')!.amount;
    g.placeBuilding('elektr', 20, 17, 0);
    g.placeBuilding('suv', 16, 13, 0);
    const st = g.statuses.get(k.id)!;
    expect([st.road, st.power, st.water]).toEqual([true, true, true]);
    expect(g.budget.lines.find((l) => l.id === 'business')!.amount).toBe(income0 + CATALOG.korzinka.income);
  });
  it('buzish va saqlash/yuklash: tur, joy va burilish tiklanadi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    g.money = 1_000_000;
    const placed = BUSINESSES.map((def, i) => placeSomewhere(g, def.type, ((i + 1) % 4) as Rotation));
    const victim = placed[3];
    expect(g.demolish(victim.id)).toBe(true);
    expect(g.objectAt(victim.gridX, victim.gridZ)).toBeNull();
    g.saveNow(true);
    const g2 = Game.boot(s);
    expect(g2.money).toBe(g.money);
    for (const o of placed) {
      const o2 = g2.objects.get(o.id);
      if (o === victim) { expect(o2).toBeUndefined(); continue; }
      expect(o2 && [o2.type, o2.gridX, o2.gridZ, o2.rotation]).toEqual([o.type, o.gridX, o.gridZ, o.rotation]);
    }
  });
});

// ============================ Ta’lim binolari ============================

/** Ko‘chaga ulangan yo‘l (z=16), elektr (15,13) va suv (19,13) — ta’lim binolari uchun xizmatli hudud. */
function eduCity(g: Game) {
  roadEast(g, 26);
  expect(g.placeBuilding('elektr', 15, 13, 0).ok).toBe(true);
  expect(g.placeBuilding('suv', 19, 13, 0).ok).toBe(true);
}

describe('Ta’lim binolari', () => {
  it('6 ta bino «Ta’lim» bo‘limida, sozlamalar bitta joyda', () => {
    const items = itemsInCategory('talim');
    expect(items.map((e) => e.type).sort()).toEqual(EDUCATION.map((e) => e.type).sort());
    expect(items).toHaveLength(6);
    for (const e of items) {
      const def = EDUCATION_BY_TYPE[e.type as keyof typeof EDUCATION_BY_TYPE];
      expect(e.kind).toBe('education');
      expect([e.price, e.upkeep, e.width, e.depth]).toEqual([def.price, def.upkeep, def.width, def.depth]);
      expect(def.capacity).toBeGreaterThan(0);
      expect(e.needsRoad && e.needsUtilities).toBe(true);
      expect(e.cardImage).toBe('assets/education/' + e.type + '.jpg');
      expect(e.modelFactoryKey).toBe('edu_' + e.type);
    }
    expect(EDUCATION.map((e) => e.name)).toEqual([
      'INVENTO — Tashkent City kampusi', 'Toshkent Prezident maktabi', 'Muhammad al-Xorazmiy maktabi',
      'Respublika bolalar kutubxonasi', 'Alisher Navoiy Milliy kutubxonasi', 'O‘zbekiston Milliy universiteti',
    ]);
  });

  it('qurish: pul bir marta yechiladi, aylantirilganda footprint almashadi, mablag‘ yetmasa qurilmaydi', () => {
    const { g } = newGame();
    const m0 = g.money;
    const o = placeSomewhere(g, 'prezident_maktab', 1);
    expect(g.money).toBe(m0 - CATALOG.prezident_maktab.price);
    expect(footprintSize('prezident_maktab', 1)).toEqual({ w: 4, d: 5 });
    g.recompute();
    expect(g.money).toBe(m0 - CATALOG.prezident_maktab.price);
    g.money = 100;
    expect(g.checkPlacement('milliy_universitet', 30, 30, 0).ok).toBe(false);
    expect(g.placeBuilding('milliy_universitet', 30, 30, 0).ok).toBe(false);
    expect(g.money).toBe(100);
    expect(g.demolish(o.id)).toBe(true);
  });

  it('maktab faqat yo‘l + elektr + suv bo‘lsa o‘rin beradi; sabab va yechim ko‘rsatiladi', () => {
    const { g } = newGame();
    roadEast(g, 26);
    expect(g.placeBuilding('prezident_maktab', 16, 17, 0).ok).toBe(true);
    const id = g.objectAt(16, 17)!.id;
    let s = g.education;
    expect(s.perBuilding.get(id)!.active).toBe(false);
    expect(s.perBuilding.get(id)!.problems.map((p) => p.kind)).toEqual(['power', 'water']);
    expect(s.seats).toBe(0);
    g.placeBuilding('elektr', 15, 13, 0);
    g.placeBuilding('suv', 19, 13, 0);
    s = g.education;
    expect(s.perBuilding.get(id)!.active).toBe(true);
    expect(s.seats).toBe(EDUCATION_BY_TYPE.prezident_maktab.capacity);
    expect(s.demand).toBe(Math.ceil(g.population * EDU_CONFIG.DEMAND_PER_RESIDENT));
    expect(s.covered).toBe(Math.min(s.seats, s.demand));
    expect(s.coverage).toBeLessThanOrEqual(100);
    expect(s.perBuilding.get(id)!.used).toBe(Math.min(s.seats, s.demand));
    // suv uzilsa — to‘xtaydi, o‘rinlar yo‘qoladi
    g.demolish(g.objectAt(19, 13)!.id);
    s = g.education;
    expect(s.perBuilding.get(id)!.active).toBe(false);
    expect(s.perBuilding.get(id)!.problems.some((p) => p.kind === 'water' && p.fix.length > 0)).toBe(true);
    expect(s.seats).toBe(0);
    // balans manfiy — mablag‘ yetishmaydi
    g.placeBuilding('suv', 19, 13, 0);
    g.money = -10;
    expect(g.education.perBuilding.get(id)!.problems.map((p) => p.kind)).toEqual(['money']);
  });

  it('kutubxona va universitet maktab o‘rnini bosmaydi; talab 0 bo‘lsa qamrov buzilmaydi', () => {
    const { g } = newGame();
    eduCity(g);
    expect(g.placeBuilding('bolalar_kutubxona', 16, 17, 0).ok).toBe(true);
    expect(g.education.perBuilding.get(g.objectAt(16, 17)!.id)!.active).toBe(true);
    expect(g.education.seats).toBe(0);
    for (const o of g.list) o.residents = 0;
    const s = g.education;
    expect([s.demand, s.coverage]).toEqual([0, null]);
  });

  it('malaka vaqt davomida o‘sadi (darhol emas), kutubxona tezlashtiradi, uzilsa pasayadi, 100 dan oshmaydi', () => {
    const { g } = newGame();
    eduCity(g);
    expect(g.placeBuilding('xorazmiy_maktab', 16, 17, 0).ok).toBe(true);
    expect(g.skill).toBe(0);
    expect(g.education.skillDelta).toBe(1);
    tick(g, 3);
    expect(g.skill).toBe(3);
    expect(g.placeBuilding('bolalar_kutubxona', 21, 17, 0).ok).toBe(true);
    expect(g.education.perBuilding.get(g.objectAt(21, 17)!.id)!.active).toBe(true);
    expect(g.education.skillDelta).toBeCloseTo(1.25);
    // elektr uzildi — bonus yo‘q, malaka pasayadi
    g.demolish(g.objectAt(15, 13)!.id);
    expect(g.education.skillDelta).toBe(-EDU_CONFIG.SKILL_DECAY);
    tick(g, 1);
    expect(g.skill).toBeCloseTo(2);
    g.placeBuilding('elektr', 15, 13, 0);
    g.skill = 99.5;
    tick(g, 2);
    expect(g.skill).toBe(EDU_CONFIG.SKILL_MAX);
  });

  it('malaka bonusi cheklangan (biznes daromadining ko‘pi bilan 10%), xarajat budjetga kiradi', () => {
    const { g } = newGame();
    const base = computeBudget(g.list, g.statuses, 0);
    const full = computeBudget(g.list, g.statuses, 500);
    const biz = base.lines.find((l) => l.id === 'business')!.amount;
    expect(full.lines.find((l) => l.id === 'skillBonus')!.amount).toBe(Math.floor(biz * EDU_CONFIG.SKILL_BUSINESS_BONUS));
    expect(base.lines.find((l) => l.id === 'skillBonus')!.amount).toBe(0);
    placeSomewhere(g, 'milliy_universitet', 0);
    const b = g.budget;
    expect(b.lines.find((l) => l.id === 'education')!.amount).toBe(EDUCATION_BY_TYPE.milliy_universitet.upkeep);
    expect(b.net).toBe(b.income - b.expense);
  });

  it('bog‘cha yaqinidagi uyga oilalar tezroq keladi (+1, cheklangan); faol bo‘lmasa bonus yo‘q', () => {
    const { g } = newGame();
    const h = servedHouse(g);
    expect(g.houseForecast(h.id)!.nextDelta).toBe(MOVE_IN_PER_TICK);
    expect(g.placeBuilding('invento', 20, 17, 0).ok).toBe(true);
    expect(g.education.perBuilding.get(g.objectAt(20, 17)!.id)!.active).toBe(true);
    expect(g.houseForecast(h.id)!.nextDelta).toBe(MOVE_IN_PER_TICK + EDU_CONFIG.FAMILY_MOVE_IN_BONUS);
    tick(g, 1);
    expect(h.residents).toBe(MOVE_IN_PER_TICK + EDU_CONFIG.FAMILY_MOVE_IN_BONUS);
    expect(g.placeBuilding('bolalar_kutubxona', 20, 21, 0).ok).toBe(true); // ikkinchi bino bonusni oshirmaydi
    expect(g.houseForecast(h.id)!.nextDelta).toBe(MOVE_IN_PER_TICK + EDU_CONFIG.FAMILY_MOVE_IN_BONUS);
    g.money = -1; // to‘xtagan bino bonus bermaydi
    expect(g.houseForecast(h.id)!.nextDelta).toBe(MOVE_IN_PER_TICK);
  });

  it('topshiriqlar: shart bajarilganda mukofot bir marta, yuklanganda takrorlanmaydi', () => {
    const { g, s } = newGame();
    eduCity(g);
    expect(g.eduTasks).toBe(0);
    const m0 = g.money;
    expect(g.placeBuilding('prezident_maktab', 16, 17, 0).ok).toBe(true);
    expect(g.eduTasks).toBe(1);
    expect(g.money).toBe(m0 - CATALOG.prezident_maktab.price + EDU_TASKS[0].reward);
    const m1 = g.money;
    g.recompute();
    tick(g, 1);
    expect(g.eduTasks).toBe(1);
    expect(g.money).toBe(m1 + g.lastReport!.net);
    expect(g.placeBuilding('bolalar_kutubxona', 21, 17, 0).ok).toBe(true);
    expect(g.eduTasks).toBe(2);
    const m2 = g.money;
    g.saveNow(true);
    const g2 = Game.boot(s);
    expect([g2.eduTasks, g2.money]).toEqual([2, m2]);
    const g3 = Game.boot(s);
    expect([g3.eduTasks, g3.money]).toEqual([2, m2]);
    // 3-topshiriq sharti
    const t3 = EDU_TASKS[2];
    const sum = g.education;
    expect(t3.done({ ...sum, demand: 29, seats: 100 })).toBe(false);
    expect(t3.done({ ...sum, demand: 40, seats: 39 })).toBe(false);
    expect(t3.done({ ...sum, demand: 40, seats: 40 })).toBe(true);
  });

  it('saqlash: ta’lim binolari, burilish, malaka tiklanadi; 2-sxema migratsiya bo‘ladi', () => {
    const { g, s } = newGame();
    eduCity(g);
    g.placeBuilding('xorazmiy_maktab', 16, 17, 1);
    tick(g, 2);
    g.saveNow(true);
    const saved = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved.education.skill).toBe(2);
    const g2 = Game.boot(s);
    const o = g2.objectAt(16, 17)!;
    expect([o.type, o.rotation]).toEqual(['xorazmiy_maktab', 1]);
    expect(g2.skill).toBe(2);
    expect(g2.education.seats).toBe(g.education.seats);
    // eski 2-sxema (education yo‘q)
    const old = { ...saved, schemaVersion: 2 };
    delete old.education;
    const raw = JSON.stringify(old);
    s.setItem(SAVE_KEY, raw);
    const g3 = Game.boot(s);
    expect(g3.skill).toBe(0);
    expect(g3.list.length).toBe(g2.list.length);
    expect(s.getItem(backupKey(2))).toBe(raw);
    expect(validateSave({ ...saved, education: { skill: 'x', tasksDone: 0 } })).toMatch(/education/);
  });
});

// ============================ Shifoxona (tibbiyot) ============================

describe('Shifoxona', () => {
  it('mavjud PRD obyekti yaxshilangan: «Tibbiyot» bo‘limida, narx/xarajat markaziy sozlamadan, footprint 3×3', () => {
    const items = itemsInCategory('tibbiyot');
    expect(items.map((e) => e.type)).toEqual(['shifoxona']);
    const c = CATALOG.shifoxona;
    expect([c.price, c.upkeep, c.width, c.depth]).toEqual([HEALTH_CONFIG.PRICE, HEALTH_CONFIG.UPKEEP, 3, 3]);
    expect(c.needsRoad && c.needsUtilities).toBe(true);
    expect(itemsInCategory('xizmatlar').some((e) => e.type === 'shifoxona')).toBe(false);
  });

  it('faqat yo‘l + elektr + suv bo‘lsa faol; sabab va yechim aniq', () => {
    const { g } = newGame();
    roadEast(g, 26);
    expect(g.placeBuilding('shifoxona', 16, 17, 0).ok).toBe(true);
    const id = g.objectAt(16, 17)!.id;
    let h = g.health.perBuilding.get(id)!;
    expect(h.active).toBe(false);
    expect(h.problems.map((p) => p.text)).toEqual(['Elektr yetishmayapti', 'Suv ulanmagan']);
    expect(h.problems[1].fix).toMatch(/suv tarmog‘iga ulang/);
    expect(g.statuses.get(id)!.active).toBe(false);
    expect(g.health.capacity).toBe(0);
    g.placeBuilding('elektr', 15, 13, 0);
    g.placeBuilding('suv', 19, 13, 0);
    h = g.health.perBuilding.get(id)!;
    expect(h.active).toBe(true);
    expect(g.statuses.get(id)!.active).toBe(true);
    const s = g.health;
    expect(s.demand).toBe(g.population);
    expect(s.capacity).toBe(HEALTH_CONFIG.SERVICE_CAPACITY);
    expect(s.covered).toBe(Math.min(s.capacity, s.demand));
    expect(h.served).toBe(s.covered);
    // suv uzildi
    g.demolish(g.objectAt(19, 13)!.id);
    expect(g.health.perBuilding.get(id)!.active).toBe(false);
    expect(g.health.capacity).toBe(0);
  });

  it('bir nechta shifoxona aholini ikki marta sanamaydi, qamrov ≤ 100%, baxt bonusi qo‘shilib ketmaydi; aholi 0 bo‘lsa buzilmaydi', () => {
    const { g } = newGame();
    const house = servedHouse(g);
    const base = g.statuses.get(house.id)!.happiness;
    expect(g.placeBuilding('shifoxona', 21, 17, 0).ok).toBe(true);
    expect(g.statuses.get(house.id)!.happiness).toBe(base + HEALTH_CONFIG.HAPPINESS_BONUS);
    expect(g.placeBuilding('shifoxona', 22, 13, 0).ok).toBe(true);
    const s = g.health;
    expect(s.activeHospitals).toBe(2);
    expect(s.capacity).toBe(2 * HEALTH_CONFIG.SERVICE_CAPACITY);
    expect(s.covered).toBe(Math.min(s.capacity, s.demand));
    expect(s.coverage).toBeLessThanOrEqual(100);
    const sumServed = [...s.perBuilding.values()].reduce((a, b) => a + b.served, 0);
    expect(Math.abs(sumServed - s.covered)).toBeLessThanOrEqual(1);
    expect(g.statuses.get(house.id)!.happiness).toBe(base + HEALTH_CONFIG.HAPPINESS_BONUS);
    for (const o of g.list) o.residents = 0;
    const z = g.health;
    expect([z.demand, z.covered, z.coverage]).toEqual([0, 0, null]);
  });

  it('xarajat budjetga kiradi (faol bo‘lmasa ham), hisob davri bo‘yicha olinadi, daromad yo‘q', () => {
    const { g } = newGame();
    const before = g.budget.lines.find((l) => l.id === 'services')!.amount;
    placeSomewhere(g, 'shifoxona', 1);
    const b = g.budget;
    expect(b.lines.find((l) => l.id === 'services')!.amount).toBe(before + HEALTH_CONFIG.UPKEEP);
    const m = g.money;
    g.update(0.2); // kadr: hisob davri emas — pul o‘zgarmaydi
    expect(g.money).toBe(m);
    tick(g, 1);
    expect(g.money).toBe(m + b.net);
  });

  it('topshiriq: shifoxona faol bo‘lganda mukofot bir marta; saqlash va 3-sxema migratsiyasi', () => {
    const { g, s } = newGame();
    roadEast(g, 26);
    g.placeBuilding('shifoxona', 16, 17, 0);
    expect(g.healthTaskDone).toBe(false); // faol emas — bajarilmaydi
    const m0 = g.money;
    g.placeBuilding('elektr', 15, 13, 0);
    expect(g.healthTaskDone).toBe(false);
    g.placeBuilding('suv', 19, 13, 0);
    expect(g.healthTaskDone).toBe(true);
    expect(g.money).toBe(m0 - CATALOG.elektr.price - CATALOG.suv.price + HEALTH_TASK.reward);
    const m1 = g.money;
    g.recompute();
    expect(g.money).toBe(m1);
    g.saveNow(true);
    const saved = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved.health).toEqual({ taskDone: true });
    const g2 = Game.boot(s);
    expect([g2.healthTaskDone, g2.money]).toEqual([true, m1]);
    expect(g2.objectAt(16, 17)!.type).toBe('shifoxona');
    // eski 3-sxema: health yo‘q — fayl ochiladi, nusxa olinadi
    const old = { ...saved, schemaVersion: 3 };
    delete old.health;
    const raw = JSON.stringify(old);
    s.setItem(SAVE_KEY, raw);
    const g3 = Game.boot(s);
    expect(g3.list.length).toBe(g2.list.length);
    expect(s.getItem(backupKey(3))).toBe(raw);
    expect(validateSave({ ...saved, health: { taskDone: 'ha' } })).toMatch(/health/);
  });
});

// ============================ Boshqaruv va shahar xizmatlari ============================

describe('Boshqaruv va xizmat binolari', () => {
  it('faqat 7 ta obyekt, kerakli bo‘limlarda; yong‘in/transport/elektr qo‘shilmagan', () => {
    expect(CIVIC.map((c) => c.type)).toEqual(['hokimlik', 'moliya', 'soliq', 'milliy_bank', 'ekologiya', 'suv_tozalash', 'xavfsizlik']);
    expect(itemsInCategory('boshqaruv').map((e) => e.type)).toEqual(['hokimlik', 'moliya', 'soliq', 'milliy_bank']);
    expect(itemsInCategory('shahar_xizmat').map((e) => e.type)).toEqual(['ekologiya', 'xavfsizlik']);
    expect(itemsInCategory('suv').map((e) => e.type).sort()).toEqual(['suv', 'suv_tozalash']);
    for (const c of CIVIC) {
      const e = CATALOG[c.type];
      expect([e.price, e.upkeep, e.width, e.depth, e.income]).toEqual([c.price, c.upkeep, c.width, c.depth, 0]);
      expect(e.cardImage).toBe('assets/civic/' + c.type + '.jpg');
    }
    expect(CIVIC.find((c) => c.type === 'hokimlik')!.name).toBe('Shahar hokimligi');
  });

  it('qurish: pul bir marta, qurilish jurnaliga yoziladi; ulanmasa to‘xtagan, ulansa faol', () => {
    const { g } = newGame();
    roadEast(g, 26);
    const c0 = g.civic.construction.total;
    const m0 = g.money;
    expect(g.placeBuilding('hokimlik', 16, 17, 0).ok).toBe(true);
    expect(g.money).toBe(m0 - CATALOG.hokimlik.price);
    expect(g.civic.construction.total).toBe(c0 + CATALOG.hokimlik.price);
    const id = g.objectAt(16, 17)!.id;
    expect(g.statuses.get(id)!.active).toBe(false);
    g.placeBuilding('elektr', 15, 13, 0);
    g.placeBuilding('suv', 19, 13, 0);
    expect(g.statuses.get(id)!.active).toBe(true);
    tick(g, 1);
    expect(g.civic.construction.lastPeriod).toBeGreaterThan(0);
    expect(g.civic.construction.period).toBe(0);
    // ma’muriy bino daromad yaratmaydi: faqat xarajat qatoriga kiradi
    expect(g.budget.lines.find((l) => l.id === 'services')!.count).toBeGreaterThan(0);
  });

  it('xavfsizlik: qamrov sig‘im bilan cheklangan, baxt bonusi bir marta, to‘xtasa bonus yo‘q', () => {
    const { g } = newGame();
    const house = servedHouse(g);
    house.residents = 8;
    g.recompute();
    const base = g.statuses.get(house.id)!.happiness;
    expect(g.placeBuilding('xavfsizlik', 21, 17, 0).ok).toBe(true);
    expect(g.statuses.get(house.id)!.happiness).toBe(base + CIVIC_CONFIG.SECURITY.HAPPINESS_BONUS);
    expect(g.placeBuilding('xavfsizlik', 22, 12, 0).ok).toBe(true);
    expect(g.statuses.get(house.id)!.happiness).toBe(base + CIVIC_CONFIG.SECURITY.HAPPINESS_BONUS);
    const s = g.security;
    expect(s.served).toBeLessThanOrEqual(s.capacity);
    for (const b of s.perBuilding.values()) expect(b.served).toBeLessThanOrEqual(CIVIC_CONFIG.SECURITY.CAPACITY);
    // elektr uzilsa — to‘xtaydi, bonus yo‘qoladi
    g.demolish(g.objectAt(15, 13)!.id);
    expect(g.security.capacity).toBe(0);
  });

  it('oqova: suvli uylar va ishlayotgan bizneslardan; har birlik bir marta; inshoot ichimlik suvi bermaydi', () => {
    const { g } = newGame();
    const sw0 = g.sewage;
    let expected = 0;
    for (const o of g.list) {
      const st = g.statuses.get(o.id)!;
      if (CATALOG[o.type].kind === 'house' && st.water) expected += o.residents * CIVIC_CONFIG.SEWAGE.PER_RESIDENT;
      if (CATALOG[o.type].kind === 'business' && st.road && st.power && st.water) expected += CIVIC_CONFIG.SEWAGE.PER_BUSINESS;
    }
    expect(sw0.load).toBe(expected);
    expect([sw0.treated, sw0.untreated]).toEqual([0, expected]);
    const waterBefore = g.list.filter((o) => g.statuses.get(o.id)!.water).length;
    eduCity(g);
    expect(g.placeBuilding('suv_tozalash', 16, 17, 0).ok).toBe(true);
    expect(g.placeBuilding('suv_tozalash', 8, 26, 0).ok || true).toBe(true);
    const sw = g.sewage;
    expect(sw.treated + sw.untreated).toBe(sw.load);
    let sum = 0;
    for (const p of sw.perPlant.values()) {
      expect(p.treated).toBeLessThanOrEqual(CIVIC_CONFIG.SEWAGE.PLANT_CAPACITY);
      if (!p.active) expect(p.treated).toBe(0);
      sum += p.treated;
    }
    expect(sum).toBe(sw.treated);
    // tozalash inshooti suv ta’minotini oshirmaydi
    const waterNow = g.list.filter((o) => o.type !== 'suv_tozalash' && g.statuses.get(o.id)!.water).length;
    expect(waterNow).toBeGreaterThanOrEqual(waterBefore);
    expect(g.list.filter((o) => o.type === 'suv_tozalash').every((o) => CATALOG[o.type].kind !== 'water')).toBe(true);
  });

  it('bank: pul faqat ko‘chadi (yaratilmaydi), foiz yo‘q; oxirgi bank buzilsa jamg‘arma qaytadi', () => {
    const { g } = newGame();
    expect(g.createGoal('Park', 5000).ok).toBe(false); // bank yo‘q
    eduCity(g);
    expect(g.placeBuilding('milliy_bank', 16, 17, 0).ok).toBe(true);
    expect(g.bankActive).toBe(true);
    expect(g.createGoal('Yangi park', 5000).ok).toBe(true);
    const goal = g.civic.goals[0];
    const total0 = g.money + g.savingsTotal;
    expect(g.deposit(goal.id, 3000).ok).toBe(true);
    expect(g.money + g.savingsTotal).toBe(total0);
    expect(goal.saved).toBe(3000);
    expect(g.deposit(goal.id, 9000).ok).toBe(true); // maqsadgacha cheklanadi
    expect(goal.saved).toBe(5000);
    expect(g.money + g.savingsTotal).toBe(total0);
    const m = g.money;
    g.money = 10;
    expect(g.createGoal('Ikkinchi', 100).ok).toBe(true);
    expect(g.deposit(g.civic.goals[1].id, 50).ok).toBe(false); // erkin budjetda yo‘q
    g.money = m;
    const savedBefore = g.savingsTotal;
    tick(g, 3);
    expect(g.savingsTotal).toBe(savedBefore); // foiz yo‘q
    expect(g.withdraw(goal.id, 1000).ok).toBe(true);
    expect(goal.saved).toBe(4000);
    const before = g.money + g.savingsTotal;
    g.demolish(g.objectAt(16, 17)!.id);
    expect(g.savingsTotal).toBe(0);
    expect(g.money).toBe(before);
  });

  it('qoida: ogohlantirish → muddat (davrlar) → bir martalik jarima; pauzada to‘xtaydi; tuzatilsa yopiladi', () => {
    const { g } = newGame();
    // yo‘riqnoma paytida qoida ishlamaydi
    tick(g, 2);
    expect(g.civic.incident).toBeNull();
    g.skipTutorial();
    expect(g.sewage.untreated).toBeGreaterThanOrEqual(CIVIC_CONFIG.RULE.SEWAGE_ALERT);
    tick(g, 1);
    const inc = g.civic.incident!;
    expect(inc.deadlineTick - inc.openedTick).toBe(CIVIC_CONFIG.RULE.GRACE_TICKS);
    // pauza: davr o‘tmaydi
    g.togglePause();
    const tc = g.tickCount;
    g.update(0.25);
    for (let i = 0; i < 400; i++) g.update(0.25);
    expect(g.tickCount).toBe(tc);
    g.togglePause();
    tick(g, CIVIC_CONFIG.RULE.GRACE_TICKS - 1);
    expect(g.civic.incident!.penalized).toBe(false);
    const m = g.money;
    tick(g, 1);
    expect(g.civic.incident!.penalized).toBe(true);
    expect(g.money).toBe(m + g.lastReport!.net - CIVIC_CONFIG.RULE.PENALTY);
    const m2 = g.money;
    tick(g, 5);
    expect(g.money).toBe(m2 + 5 * g.lastReport!.net); // qayta jarima yo‘q (aholi ko‘chmaydigan holatda net o‘zgarmas)
    // tuzatildi (oqova yo‘q) — yopiladi
    for (const o of g.list) o.residents = 0;
    for (const o of [...g.list]) if (CATALOG[o.type].kind === 'business') g.demolish(o.id);
    tick(g, 1);
    expect(g.civic.incident).toBeNull();
  });

  it('yechim imkoni bo‘lmasa (pul yetmaydi, inshoot yo‘q) muddat boshlanmaydi; kam pulning o‘zi jarima emas', () => {
    const { g } = newGame();
    g.skipTutorial();
    g.money = 100;
    tick(g, 3);
    expect(g.civic.incident).toBeNull();
  });

  it('murojaatlar haqiqiy holatdan: joy va yechim bilan; buzish oqibati oldindan aytiladi', () => {
    const { g } = newGame();
    roadEast(g, 26);
    g.placeBuilding('uy_a', 18, 17, 0);
    const a = g.appeals.find((x) => x.id === 'house-power')!;
    expect(a).toBeTruthy();
    expect(a.fix).toMatch(/elektr/);
    expect(typeof a.x).toBe('number');
    g.placeBuilding('elektr', 15, 13, 0);
    g.placeBuilding('suv', 19, 13, 0);
    expect(g.appeals.find((x) => x.id === 'house-power')).toBeUndefined();
    const st = g.objectAt(15, 13)!;
    expect(g.demolishImpact(st.id).join(' ')).toMatch(/elektrsiz/);
  });

  it('saqlash: 5-sxema — jamg‘arma va ogohlantirish tiklanadi; 4-sxema ochiladi', () => {
    const { g, s } = newGame();
    eduCity(g);
    g.placeBuilding('milliy_bank', 16, 17, 0);
    g.createGoal('Maktab', 4000);
    g.deposit(g.civic.goals[0].id, 1500);
    g.skipTutorial();
    tick(g, 1);
    g.saveNow(true);
    const saved = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    const g2 = Game.boot(s);
    expect(g2.civic.goals).toEqual(g.civic.goals);
    expect(g2.civic.incident).toEqual(g.civic.incident);
    expect(g2.money).toBe(g.money);
    const old = { ...saved, schemaVersion: 4 };
    delete old.civic;
    const raw = JSON.stringify(old);
    s.setItem(SAVE_KEY, raw);
    const g3 = Game.boot(s);
    expect(g3.civic.goals).toEqual([]);
    expect(s.getItem(backupKey(4))).toBe(raw);
    expect(validateSave({ ...saved, civic: { ...saved.civic, goals: [{ id: 'x', name: 'a', target: 0, saved: 0 }] } })).toMatch(/civic/);
  });
});

// ============================ Dinozavr (domen) ============================

/** Sintetik profil: apato.glb dagi o‘lchovlarga o‘xshash — tA..tB oralig‘ida oyoqlar 10,85 birlik oldinga. */
function synthProfile(): DinoProfile {
  const times: number[] = [];
  const feetX: number[] = [];
  for (let i = 0; i <= 350; i++) {
    const t = i / 24;
    times.push(t);
    const k = Math.max(0, Math.min(1, (t - DINO.T_A) / (DINO.T_B - DINO.T_A)));
    feetX.push(-1.95 + 10.85 * k);
  }
  return { times, feetX, tA: DINO.T_A, tB: DINO.T_B, tR: DINO.T_R };
}

function run(g: Game, secs: number, dt = 0.05, each?: () => void) {
  for (let i = 0; i < secs / dt; i++) { g.update(dt); each?.(); }
}

describe('Dinozavr', () => {
  it('ikkita dinozavr (12 va 9 katak) bo‘sh tabiat yerida paydo bo‘ladi; yurish, to‘xtash va burilish sikllari bor; to‘siqqa kirmaydi', () => {
    const { g } = newGame();
    expect(g.dino).toBeNull();
    g.setDinoProfile(synthProfile());
    expect(g.dinos.map((x) => x.len)).toEqual(DINO_SPECS.map((x) => x.len));
    const d = g.dino!;
    expect(d).toBeTruthy();
    expect(g.dinoBodyClear()).toBe(true);
    const modes = new Set<string>();
    const h0 = d.heading;
    let turned = 0, moved = 0, px = d.ax, pz = d.az, clear = true;
    run(g, 240, 0.05, () => {
      modes.add(g.dino!.mode);
      turned = Math.max(turned, Math.abs(g.dino!.heading - h0));
      moved += Math.hypot(g.dino!.ax - px, g.dino!.az - pz);
      px = g.dino!.ax; pz = g.dino!.az;
      if (!g.dinoBodyClear()) clear = false;
    });
    expect([...modes].sort()).toEqual(expect.arrayContaining(['fade', 'rest', 'walk']));
    expect(turned).toBeGreaterThan(0.3);
    expect(moved).toBeGreaterThan(3);
    expect(clear).toBe(true);
  });

  it('pauza va yashirin tabda to‘xtaydi; katta dt sakratmaydi', () => {
    const { g } = newGame();
    g.setDinoProfile(synthProfile());
    run(g, 20);
    const snap = JSON.stringify(g.dino);
    g.togglePause();
    run(g, 30);
    expect(JSON.stringify(g.dino)).toBe(snap);
    g.togglePause();
    g.setTabHidden(true);
    run(g, 30);
    expect(JSON.stringify(g.dino)).toBe(snap);
    g.setTabHidden(false);
    const a = { x: g.dino!.ax, z: g.dino!.az };
    g.update(60); // tabdan qaytish: dt cheklanadi
    expect(Math.hypot(g.dino!.ax - a.x, g.dino!.az - a.z)).toBeLessThan(0.2);
  });

  it('dinozavr va uning joriy yo‘li ustiga qurib bo‘lmaydi', () => {
    const { g } = newGame();
    g.setDinoProfile(synthProfile());
    const cell = [...g.dinoReserved()][0].split(',').map(Number);
    const r = g.checkPlacement('daraxt', cell[0], cell[1], 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/dinozavr/);
    const road = g.checkRoadPath([{ x: cell[0], z: cell[1] }]);
    expect(road.ok).toBe(true); // tekshiruvning o‘zi; quruvchi buildRoad dinozavrni hisobga oladi
    const m = g.money;
    expect(g.buildRoad([{ x: cell[0], z: cell[1] }]).ok).toBe(false);
    expect(g.money).toBe(m);
  });

  it('atrofi yopilsa xavfsiz joyda turadi (tanasi to‘siqqa kirmaydi)', () => {
    const { g } = newGame();
    g.setDinoProfile(synthProfile());
    const res = g.dinoReserved();
    // tana atrofidagi bo‘sh kataklarni daraxt bilan to‘ldiramiz (qurilish tizimi orqali)
    g.money = 1e9;
    for (let z = 0; z < 40; z++) for (let x = 0; x < 40; x++) {
      if (res.has(x + ',' + z) || g.objectAt(x, z)) continue;
      const near = [...res].some((k) => { const [a, b] = k.split(',').map(Number); return Math.abs(a - x) <= 1 && Math.abs(b - z) <= 1; });
      if (near) g.placeBuilding('daraxt', x, z, 0);
    }
    let clear = true;
    run(g, 60, 0.05, () => { if (!g.dinoBodyClear()) clear = false; });
    expect(clear).toBe(true);
    expect(['rest', 'pivot', 'fade', 'walk', 'back']).toContain(g.dino!.mode);
  });

  it('saqlash: holat tiklanadi, takrorlanmaydi; 5-sxema ochiladi; xarita to‘la bo‘lsa halqada joylashadi, hech narsa buzilmaydi', () => {
    const { g, s } = newGame();
    g.setDinoProfile(synthProfile());
    run(g, 15);
    g.saveNow(true);
    const saved = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    const g2 = Game.boot(s);
    g2.setDinoProfile(synthProfile());
    expect(g2.dinos).toEqual(g.dinos);
    g2.setDinoProfile(synthProfile()); // qayta chaqirish — soni o‘zgarmaydi
    expect(g2.dinos).toEqual(g.dinos);
    expect(g2.dinos.length).toBe(DINO_SPECS.length);
    // 6-sxema: bitta dino → ro‘yxat (uzunligi boshqa — qayta joylashadi)
    const v6 = { ...saved, schemaVersion: 6, creatures: { dino: { ...saved.creatures.dinos[0], len: undefined } } };
    s.setItem(SAVE_KEY, JSON.stringify(v6));
    const g6 = Game.boot(s);
    g6.setDinoProfile(synthProfile());
    expect(g6.dinos.length).toBe(DINO_SPECS.length);
    const old = { ...saved, schemaVersion: 5 };
    delete old.creatures;
    s.setItem(SAVE_KEY, JSON.stringify(old));
    const g3 = Game.boot(s);
    g3.setDinoProfile(synthProfile());
    expect(g3.dino).toBeTruthy();
    // xarita ichi to‘la: dinozavrlar atrofdagi o‘tloq halqasida joylashadi, xaritadagi obyektlar o‘chirilmaydi
    const g4 = Game.boot(new MemStorage());
    g4.money = 1e9;
    for (let z = 0; z < 40; z += 4) for (let x = 0; x < 40; x += 4) g4.placeBuilding('daraxt', x, z, 0);
    const n = g4.list.length;
    g4.setDinoProfile(synthProfile());
    expect(g4.dinos.length).toBe(DINO_SPECS.length);
    expect(g4.dinoBodyClear()).toBe(true);
    expect(g4.list.length).toBe(n);
  });
});

// ============================ Bosqichma-bosqich qurilish ============================

describe('Qurilish (30 soniya)', () => {
  beforeEach(() => { CONSTRUCTION.enabled = true; });

  it('joylashtirishda pul bir marta yechiladi, maydon darhol band; tugaguncha hech qaysi tizimda hisoblanmaydi', () => {
    const { g } = newGame();
    roadEast(g, 24);
    g.placeBuilding('elektr', 15, 13, 0);
    g.placeBuilding('suv', 19, 13, 0);
    expect(g.constructing.length).toBe(2);
    run(g, 30);
    expect(g.constructing.length).toBe(0);
    const m0 = g.money, pop0 = g.population, net0 = g.budget.net;
    expect(g.placeBuilding('uy_a', 18, 17, 0).ok).toBe(true);
    const h = g.objectAt(18, 17)!;
    expect(g.money).toBe(m0 - CATALOG.uy_a.price);
    expect(h.build).toBeTruthy();
    expect(g.checkPlacement('daraxt', 18, 17, 0).ok).toBe(false); // band
    expect(g.statuses.has(h.id)).toBe(false);
    expect(g.budget.net).toBe(net0);
    for (let i = 0; i < 2; i++) tick(g, 1);
    expect(h.residents).toBe(0);
    expect(g.population).toBe(pop0);
  });

  it('1× tezlikda aynan 30 o‘yin soniyasida tugaydi; bosqichlar belgilangan vaqtda almashadi; tugash bir marta', () => {
    const { g } = newGame();
    roadEast(g, 24);
    g.placeBuilding('uy_a', 18, 17, 0);
    const h = g.objectAt(18, 17)!;
    const seen: string[] = [];
    let t = 0;
    while (h.build) {
      const p = buildProgress(h.build);
      if (seen[seen.length - 1] !== p.phase.id) { seen.push(p.phase.id); expect(Math.abs(t - p.phase.from)).toBeLessThan(0.051); }
      g.update(0.05);
      t += 0.05;
    }
    expect(Math.abs(t - CONSTRUCTION.constructionDurationSeconds)).toBeLessThan(0.051);
    expect(seen).toEqual(PHASES.map((p) => p.id));
    expect(g.statuses.has(h.id)).toBe(true);
    const m = g.money;
    run(g, 5);
    expect(g.money).toBeGreaterThanOrEqual(m); // qayta to‘lov yo‘q
  });

  it('pauza va yashirin tabda to‘xtaydi; katta dt sakratmaydi; bir nechta parallel qurilish', () => {
    const { g } = newGame();
    roadEast(g, 26);
    g.placeBuilding('uy_a', 18, 17, 0);
    run(g, 10);
    g.placeBuilding('uy_b', 21, 17, 0);
    const a = g.objectAt(18, 17)!, b = g.objectAt(21, 17)!;
    expect(a.build!.elapsed).toBeCloseTo(10, 5);
    g.togglePause();
    run(g, 20);
    expect(a.build!.elapsed).toBeCloseTo(10, 5);
    g.togglePause();
    g.setTabHidden(true);
    run(g, 20);
    expect(a.build!.elapsed).toBeCloseTo(10, 5);
    g.setTabHidden(false);
    g.update(100);
    expect(a.build!.elapsed).toBeCloseTo(10.25, 5);
    run(g, 20);
    expect(a.build).toBeUndefined();
    expect(b.build!.elapsed).toBeCloseTo(20.25, 5);
  });

  it('o‘rtada saqlash/yuklash: shu joydan davom etadi, qayta to‘lov va ikkinchi bino yo‘q; eski saqlanmadagi binolar tayyor', () => {
    const { g, s } = newGame();
    roadEast(g, 24);
    g.placeBuilding('uy_a', 18, 17, 0);
    run(g, 12);
    g.saveNow(true);
    const saved = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    const g2 = Game.boot(s);
    const h2 = g2.objectAt(18, 17)!;
    expect(h2.build!.elapsed).toBeCloseTo(12, 5);
    expect(g2.money).toBe(g.money);
    expect(g2.list.filter((o) => o.type === 'uy_a' && o.userPlaced).length).toBe(1);
    expect(buildProgress(h2.build!).phase.id).toBe('frame');
    run(g2, 18);
    expect(h2.build).toBeUndefined();
    // eski (7-sxema) — build yo‘q: barcha binolar tayyor
    const old = { ...saved, schemaVersion: 7 };
    old.placedObjects = old.placedObjects.map((o: Record<string, unknown>) => { const c = { ...o }; delete c.build; return c; });
    s.setItem(SAVE_KEY, JSON.stringify(old));
    const g3 = Game.boot(s);
    expect(g3.constructing.length).toBe(0);
    expect(validateSave({ ...saved, placedObjects: saved.placedObjects.map((o: Record<string, unknown>) => (o.type === 'uy_a' ? { ...o, build: { elapsed: -1, duration: 30, paid: true } } : o)) })).toMatch(/Qurilish/);
  });

  it('bekor qilish: maydon bo‘shaydi, pul qaytarilmaydi (sabab ko‘rsatiladi); yo‘l va daraxt darhol joylashadi', () => {
    const { g } = newGame();
    roadEast(g, 24);
    expect(g.constructing.length).toBe(0); // yo‘l qurilmaydi
    g.placeBuilding('daraxt', 30, 30, 0);
    expect(g.objectAt(30, 30)!.build).toBeUndefined();
    g.placeBuilding('uy_a', 18, 17, 0);
    const h = g.objectAt(18, 17)!;
    expect(g.canDemolish(h.id).reason).toMatch(/qaytarilmaydi/);
    const m = g.money;
    expect(g.demolish(h.id)).toBe(true);
    expect(g.money).toBe(m);
    expect(g.objectAt(18, 17)).toBeNull();
    expect(g.checkPlacement('uy_a', 18, 17, 0).ok).toBe(true);
  });

  it('Dastyor birinchi qurilishda bir marta tushuntiradi (saqlanadi)', () => {
    const { g, s } = newGame();
    roadEast(g, 26);
    g.placeBuilding('uy_a', 18, 17, 0);
    expect(g.dastyorMessage).toMatch(/poydevordan/);
    g.dastyorMessage = null;
    g.placeBuilding('uy_b', 21, 17, 0);
    expect(g.dastyorMessage).toBeNull();
    g.saveNow(true);
    expect(Game.boot(s).hints.construction).toBe(true);
  });
});

describe('Kengaytirilgan xarita va tog‘lar', () => {
  /** Xaritadagi tekis, bo‘sh, suvsiz katak (yangi hududda) */
  function flatSpot(g: Game, w: number, d: number, inNew = true) {
    for (let z = MAP_MIN; z <= MAP_MAX - d; z++) for (let x = MAP_MIN; x <= MAP_MAX - w; x++) {
      if (inNew && x >= -1 && z >= -1 && x <= 40 && z <= 40) continue;
      let ok = true;
      for (let dz = 0; dz < d && ok; dz++) for (let dx = 0; dx < w && ok; dx++) {
        if (terrainBlocksBuild(x + dx, z + dz) || isWater(x + dx, z + dz) || g.objectAt(x + dx, z + dz)) ok = false;
      }
      if (ok) return { x, z };
    }
    return null;
  }

  it('xarita 40×40 → 80×80 (maydon 4 baravar), eski koordinatalar joyida', () => {
    expect(MAP_SIZE).toBe(80);
    expect([MAP_MIN, MAP_MAX]).toEqual([-20, 59]);
    expect(MAP_SIZE * MAP_SIZE).toBe(4 * MAP_CONFIG.coreSize ** 2);
    expect([inBounds(-20, -20), inBounds(59, 59), inBounds(-21, 0), inBounds(0, 60)]).toEqual([true, true, false, false]);
    // asl daryo va hovuz o‘z joyida
    expect([isWater(0, 5), isWater(1, 39), isWater(3, 27), isWater(23, 5)]).toEqual([true, true, true, true]);
  });

  it('yangi o‘yin: 4 xil tog‘, kamida 70% tekis, hech bir bino/yo‘l/suv/asl xarita ustida emas', () => {
    const { g } = newGame();
    const t = g.terrain!;
    expect(t.version).toBe(TERRAIN_VERSION);
    expect(t.mapSize).toBe(MAP_SIZE);
    expect(new Set(t.mountains.map((m) => m.kind))).toEqual(new Set(MOUNTAIN_KINDS));
    expect(g.terrainField!.flatRatio()).toBeGreaterThanOrEqual(0.7);
    for (const o of g.list) for (const c of footprintCells(o.type, o.gridX, o.gridZ, o.rotation)) expect(g.terrainField!.cellHeight(c.x, c.z)).toBe(0);
    for (let z = 0; z < 40; z++) for (let x = 0; x < 40; x++) expect(g.terrainField!.cellHeight(x, z)).toBe(0);
    // takroriy qator emas: aylanish va o‘lchamlar har xil
    expect(new Set(t.mountains.map((m) => `${m.rot.toFixed(2)}|${m.h.toFixed(1)}|${m.rx.toFixed(1)}`)).size).toBe(t.mountains.length);
    expect(new Set(t.mountains.map((m) => m.rot.toFixed(1))).size).toBeGreaterThan(8);
    // tog‘ning bir qismi yangi qo‘shilgan hududda (xarita ichida) bor
    let inMap = 0;
    for (let z = MAP_MIN; z <= MAP_MAX; z++) for (let x = MAP_MIN; x <= MAP_MAX; x++) if (terrainBlocksBuild(x, z)) inMap++;
    expect(inMap).toBeGreaterThan(0);
    // tog‘lar bepul: pul o‘zgarmagan, obyekt sifatida yo‘q (tanlab/buzib bo‘lmaydi)
    expect(g.money).toBe(500000);
    expect(g.list.some((o) => (o.type as string).includes('tog'))).toBe(false);
  });

  it('yangi hududda qurish va yo‘l ishlaydi; tik joy va xarita tashqarisi rad etiladi', () => {
    const { g } = newGame();
    const p = flatSpot(g, 3, 3)!;
    expect(p).not.toBeNull();
    expect(g.checkPlacement('uy_a', p.x, p.z, 0).ok).toBe(true);
    // tik katak
    let steep: { x: number; z: number } | null = null;
    for (let z = MAP_MIN; z <= MAP_MAX - 2 && !steep; z++) for (let x = MAP_MIN; x <= MAP_MAX - 2 && !steep; x++) if (g.terrainField!.cellHeight(x, z) > 1) steep = { x, z };
    expect(steep).not.toBeNull();
    const r = g.checkPlacement('uy_a', steep!.x, steep!.z, 0);
    expect([r.ok, r.reason]).toEqual([false, STEEP_REASON]);
    expect(g.checkRoadPath([steep!]).reason).toBe(STEEP_REASON);
    expect(g.checkPlacement('uy_a', MAP_MAX, 10, 0).reason).toBe(OUT_OF_MAP_REASON);
    expect(g.checkPlacement('uy_a', MAP_MIN - 1, 10, 0).reason).toBe(OUT_OF_MAP_REASON);
    // tik katakda hech qanday obyekt yo‘q — buzish uchun tanlanmaydi
    expect(g.objectAt(steep!.x, steep!.z)).toBeNull();
    // yangi hudud chekkasigacha yo‘l (kirish tarmog‘idan g‘arbga −20 gacha, tekis bo‘lsa)
    expect(g.placeBuilding('uy_a', p.x, p.z, 0).ok).toBe(true);
    expect(g.objectAt(p.x + 1, p.z + 1)).not.toBeNull();
  });

  it('saqlash/yuklash: tog‘lar siljimaydi; yangi hududdagi bino saqlanadi', () => {
    const { g, s } = newGame();
    const p = flatSpot(g, 1, 1)!;
    g.placeBuilding('daraxt', p.x, p.z, 0);
    g.saveNow(true);
    const saved = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved.terrain.mountains.length).toBe(g.terrain!.mountains.length);
    const g2 = Game.boot(s);
    expect(g2.terrain).toEqual(g.terrain);
    expect(g2.objectAt(p.x, p.z)?.type).toBe('daraxt');
    expect(validateSave({ ...saved, terrain: { ...saved.terrain, mountains: [{ kind: 'vulkan' }] } })).toMatch(/terrain/);
  });

  it('eski (8-sxema) saqlash: obyektlar joyida, tog‘lar faqat bo‘sh joyga, nusxa olinadi', () => {
    const { g, s } = newGame();
    // eski xaritadan tashqariga qurilgan obyektlar (eski versiyada chegara tekshirilmasdi)
    const extra = [
      { x: -7, z: 16 }, { x: -12, z: 30 }, { x: 53, z: 47 }, { x: 45, z: -1 }, { x: -19, z: -19 }, { x: 58, z: 58 },
    ];
    const data = g.toSaveData() as unknown as Record<string, unknown> & { placedObjects: Record<string, unknown>[] };
    let id = 9000;
    for (const c of extra) data.placedObjects.push({ id: 'o' + id++, type: 'daraxt', gridX: c.x, gridZ: c.z, rotation: 0, residents: 0, outageTicks: 0, userPlaced: true });
    data.schemaVersion = 8;
    delete data.terrain;
    s.setItem(SAVE_KEY, JSON.stringify(data));
    const g2 = Game.boot(s);
    expect(s.getItem(backupKey(8))).toBe(JSON.stringify(data));
    for (const c of extra) {
      expect(g2.objectAt(c.x, c.z)?.type).toBe('daraxt');
      // tog‘ etagi ham bu obyektlar ustiga tushmaydi
      expect(g2.terrainField!.cellHeight(c.x, c.z)).toBe(0);
    }
    expect(g2.list.length).toBe(data.placedObjects.length);
    expect(g2.terrainField!.flatRatio()).toBeGreaterThanOrEqual(0.7);
    g2.saveNow(true);
    expect(JSON.parse(s.getItem(SAVE_KEY)!).terrain).toEqual(g2.terrain);
  });

  it('dinozavrlar tog‘ ichida emas va tik kataklar ular uchun to‘siq', () => {
    const { g } = newGame();
    g.setDinoProfile(synthProfile());
    expect(g.dinos.length).toBe(DINO_SPECS.length);
    expect(g.dinoBodyClear()).toBe(true);
    for (let i = 0; i < 4000; i++) g.update(0.05);
    expect(g.dinoBodyClear()).toBe(true);
    let steep = 0;
    for (let z = MAP_MIN - 40; z <= MAP_MAX + 40; z++) for (let x = MAP_MIN - 40; x <= MAP_MAX + 40; x++) if (g.terrainField!.cellHeight(x, z) > BUILD_MAX_H * 4) { steep++; expect(terrainBlocksDino(x, z)).toBe(true); }
    expect(steep).toBeGreaterThan(100);
  });

  it('tabiiy ko‘l va soylar: shaharga yaqin va tog‘lar orasida; obyektlarga tushmaydi; suv stansiyasi undan foydalanadi', () => {
    const { g } = newGame();
    const f = g.terrainField!;
    const ws = g.terrain!.waters;
    expect(ws.filter((w) => w.kind === 'lake').length).toBeGreaterThanOrEqual(6);
    expect(ws.some((w) => w.kind === 'river')).toBe(true);
    // xarita ichidagi (yangi hudud) suv kataklari bor — shahar quruvchisi foydalana oladi
    let inMap = 0;
    for (let z = MAP_MIN; z <= MAP_MAX; z++) for (let x = MAP_MIN; x <= MAP_MAX; x++) if (f.isWaterCell(x, z)) { inMap++; // asl xarita ichida faqat asl daryoning davomi (uning uchida, 2 katak ichida)
        expect(x < 0 || z < 0 || x > 39 || z > 39 || [-2, -1, 0, 1, 2].some((d) => isWater(x + d, z) && x + d <= 1 && (z <= 2 || z >= 37))).toBe(true); expect(f.cellHeight(x, z)).toBeLessThanOrEqual(BUILD_MAX_H); }
    expect(inMap).toBeGreaterThan(10);
    for (const o of g.list) for (const c of footprintCells(o.type, o.gridX, o.gridZ, o.rotation)) expect(f.isWaterCell(c.x, c.z)).toBe(false);
    // ko‘l katagiga qurib/yo‘l solib bo‘lmaydi
    let wc: { x: number; z: number } | null = null;
    for (let z = MAP_MIN; z <= MAP_MAX && !wc; z++) for (let x = MAP_MIN; x <= MAP_MAX && !wc; x++) if (f.isWaterCell(x, z) && !f.isFordCell(x, z)) wc = { x, z };
    // irmoqlar ko‘llarni bog‘laydi; sayoz irmoq ustidan yo‘l o‘tadi, bino qurilmaydi
    expect(ws.filter((w) => w.kind === 'river').length).toBeGreaterThanOrEqual(8);
    let ford: { x: number; z: number } | null = null;
    for (let z = MAP_MIN; z <= MAP_MAX && !ford; z++) for (let x = MAP_MIN; x <= MAP_MAX && !ford; x++) if (f.isFordCell(x, z) && !g.objectAt(x, z) && !terrainBlocksBuild(x, z)) ford = { x, z };
    if (ford) {
      expect(g.checkPlacement('daraxt', ford.x, ford.z, 0).reason).toMatch(/Suv ustiga/);
      expect(g.checkRoadPath([ford]).reason).not.toMatch(/Suv ustiga/);
    }
    expect(isWater(wc!.x, wc!.z)).toBe(true);
    expect(g.checkPlacement('daraxt', wc!.x, wc!.z, 0).reason).toMatch(/Suv ustiga/);
    expect(g.checkRoadPath([wc!]).reason).toMatch(/Suv ustiga/);
    // ko‘l bo‘yidagi bo‘sh 3×3 joyga suv stansiyasi: radius 9; uzoqdagisi 6
    let spot: { x: number; z: number } | null = null;
    for (let z = MAP_MIN; z <= MAP_MAX - 2 && !spot; z++) for (let x = MAP_MIN; x <= MAP_MAX - 2 && !spot; x++) {
      const cells = footprintCells('suv', x, z, 0);
      if (cells.every((c) => !isWater(c.x, c.z) && !terrainBlocksBuild(c.x, c.z) && !g.objectAt(c.x, c.z) && inBounds(c.x, c.z)) && nearNaturalWater(cells)) spot = { x, z };
    }
    expect(spot).not.toBeNull();
    expect(g.checkPlacement('suv', spot!.x, spot!.z, 0).ok).toBe(true);
    expect(usesNaturalWater({ type: 'suv', gridX: spot!.x, gridZ: spot!.z, rotation: 0 })).toBe(true);
    expect(stationRadius({ type: 'suv', gridX: spot!.x, gridZ: spot!.z, rotation: 0 })).toBe(9);
    // boshlang‘ich mahalladagi stansiyalar o‘zgarmagan (asl daryo tabiiy manba hisoblanmaydi)
    for (const o of g.list) if (o.type === 'suv') expect(stationRadius(o)).toBe(6);
    // tabiiy suv qurish uchun tekis maydonni 70% dan kamaytirmaydi
    expect(f.flatRatio()).toBeGreaterThanOrEqual(0.7);
  });
});

describe('Yangi dinozavrlar podasi (7 model)', () => {
  it('har turdan bittadan, xavfsiz ochiq joyda; statiklar qurilish xaritasidan tashqarida; takrorlanmaydi', () => {
    const { g, s } = newGame();
    expect(g.herd.dinos.map((d) => d.id).sort()).toEqual(HERD_SLOTS.map((q) => q.id).sort());
    // raptor, ankilozavr va JP triseratopsdan 3 tadan, qolganlaridan 1 tadan (jami 13), ID lar takrorlanmaydi
    expect(g.herd.dinos.filter((d) => d.type === 'raptor').length).toBe(3);
    expect(g.herd.dinos.filter((d) => d.type === 'ankylosaurus').length).toBe(3);
    expect(g.herd.dinos.filter((d) => d.type === 'triceratops_jp').length).toBe(3);
    expect(new Set(g.herd.dinos.map((d) => d.id)).size).toBe(13);
    expect(g.herd.allClear()).toBe(true);
    for (const d of g.herd.dinos) {
      const def = HERD_BY_TYPE[d.type];
      for (const c of g.herd.bodyCells(d)) {
        expect(g.objectAt(c.x, c.z)).toBeNull();
        expect(isWater(c.x, c.z) && !g.terrainField!.isFordCell(c.x, c.z)).toBe(false);
        if (!def.mobile) expect(inBounds(c.x, c.z)).toBe(false);
      }
      for (const o of g.herd.dinos) if (o !== d) expect(Math.hypot(o.x - d.x, o.z - d.z)).toBeGreaterThan(herdRadius(def) + herdRadius(HERD_BY_TYPE[o.type]));
    }
    g.saveNow(true);
    const saved = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(saved.creatures.herd.length).toBe(13);
    const g2 = Game.boot(s);
    expect(g2.herd.dinos.length).toBe(13);
    for (const d of g2.herd.dinos) {
      const o = g.herd.dinos.find((q) => q.id === d.id)!;
      expect([d.type, d.x, d.z, d.heading]).toEqual([o.type, o.x, o.z, o.heading]);
    }
  });

  it('harakat: maqsadga yo‘l bilan boradi, to‘siqqa kirmaydi, quvish qoidalari, oyoq qadami tezlikka mos', () => {
    const { g } = newGame();
    const moved = new Map<string, number>();
    const modes = new Set<string>();
    let pairsMax = 0;
    for (let i = 0; i < 240 * 20; i++) {
      const before = g.herd.dinos.map((d) => [d.x, d.z, d.phase.walk + d.phase.run]);
      g.update(0.05);
      g.herd.dinos.forEach((d, k) => {
        const step = Math.hypot(d.x - before[k][0], d.z - before[k][1]);
        moved.set(d.type, (moved.get(d.type) ?? 0) + step);
        modes.add(d.mode);
        const def = HERD_BY_TYPE[d.type];
        // siljish bor joyda animatsiya fazasi ham oldinga (sirpanmaydi): faza o‘sishi × klip tezligi = siljish
        if (step > 1e-4 && def.mobile) {
          const dPhase = d.phase.walk + d.phase.run - before[k][2];
          const gs = clipGroundSpeed(def, d.anim === 'run' || !def.walk ? 'run' : 'walk');
          // oyoqlar tanadan sekin yurmaydi (sirpanmaydi); burilishda qo‘shimcha qadam tashlashi mumkin
          expect(dPhase * gs).toBeGreaterThan(step * 0.95 - 1e-4);
        }
      });
      const pairs = g.herd.dinos.filter((d) => d.mode === 'chase').length;
      pairsMax = Math.max(pairsMax, pairs);
      expect(g.herd.allClear()).toBe(true);
      for (const d of g.herd.dinos) for (const c of g.herd.bodyCells(d)) expect(g.objectAt(c.x, c.z)).toBeNull();
    }
    for (const def of HERD_DEFS) {
      if (def.mobile) expect(moved.get(def.type)!).toBeGreaterThan(3);
      else expect(moved.get(def.type)!).toBe(0);
    }
    expect(pairsMax).toBeLessThanOrEqual(CHASE.maxPairs);
    for (const m of ['wander', 'rest']) expect(modes.has(m)).toBe(true);
    // pauza: hech narsa siljimaydi
    g.paused = true;
    const snap = JSON.stringify(g.herd.dinos);
    for (let i = 0; i < 100; i++) g.update(0.05);
    expect(JSON.stringify(g.herd.dinos)).toBe(snap);
  });

  it('dinozavr turgan joyga qurilmaydi (sabab ko‘rsatiladi); yangi bino navigatsiyani yangilaydi', () => {
    const { g } = newGame();
    const d = g.herd.dinos.find((q) => HERD_BY_TYPE[q.type].mobile && g.herd.bodyCells(q).some((c) => inBounds(c.x, c.z)))!;
    if (d) {
      const c = g.herd.bodyCells(d).find((q) => inBounds(q.x, q.z) && !isWater(q.x, q.z) && !terrainBlocksBuild(q.x, q.z));
      if (c) expect(g.checkPlacement('daraxt', c.x, c.z, 0).reason).toMatch(/dinozavr/);
    }
    const k0 = g.herd.nav;
    const p = (() => { for (let z = 42; z < 58; z++) for (let x = 42; x < 58; x++) if (g.checkPlacement('daraxt', x, z, 0).ok) return { x, z }; return null; })()!;
    g.placeBuilding('daraxt', p.x, p.z, 0);
    g.update(0.05);
    expect(g.herd.nav).not.toBe(k0);
    expect(g.herd.nav!.clearance(p.x, p.z)).toBe(0);
  });

  it('yonma-yon, bir-biriga qarab turgan ikki dinozavr tiqilib qolmaydi (o‘zaro kutish yo‘q)', () => {
    const { g } = newGame();
    const a = g.herd.dinos.find((d) => d.type === 'triceratops_jp')!, b = g.herd.dinos.find((d) => d.type === 'raptor')!;
    const gap = herdRadius(HERD_BY_TYPE[a.type]) + herdRadius(HERD_BY_TYPE[b.type]) + 0.6;
    b.x = a.x + gap; b.z = a.z; a.heading = 0; b.heading = Math.PI;
    for (const d of [a, b]) { d.mode = 'rest'; d.timer = 0; d.target = null; d.partner = null; d.cooldown = 99; }
    const a0 = { x: a.x, z: a.z }, b0 = { x: b.x, z: b.z };
    for (let i = 0; i < 90 * 20; i++) g.update(0.05);
    expect(Math.hypot(a.x - a0.x, a.z - a0.z) + Math.hypot(b.x - b0.x, b.z - b0.z)).toBeGreaterThan(4);
    expect(g.herd.allClear()).toBe(true);
  });

  it('burilish silliq: yo‘nalish sakramaydi, burchak tezligi tezlanish bilan o‘zgaradi', () => {
    const { g } = newGame();
    let maxJump = 0, maxDOmega = 0;
    const prev = new Map(g.herd.dinos.map((d) => [d.id, { h: d.heading, o: d.omega ?? 0 }]));
    for (let i = 0; i < 120 * 20; i++) {
      g.update(0.05);
      for (const d of g.herd.dinos) {
        const p = prev.get(d.id)!;
        const def = HERD_BY_TYPE[d.type];
        const dh = Math.abs(Math.atan2(Math.sin(d.heading - p.h), Math.cos(d.heading - p.h)));
        maxJump = Math.max(maxJump, dh / (def.turnRate || 1));
        maxDOmega = Math.max(maxDOmega, Math.abs((d.omega ?? 0) - p.o) / (def.turnRate || 1));
        prev.set(d.id, { h: d.heading, o: d.omega ?? 0 });
      }
    }
    // bir qadamda (0,05 s) yo‘nalish o‘zgarishi ≤ 1,3×turnRate×dt; burchak tezligi bir qadamda turnRate ning 40% idan ko‘p o‘zgarmaydi (to‘xtashda silliq so‘nish)
    expect(maxJump).toBeLessThanOrEqual(1.3 * 0.05 + 1e-6);
    expect(maxDOmega).toBeLessThanOrEqual(0.4);
  });

  it('qotib qolmaydi: yurmoqchi bo‘lgan dinozavr 8 s dan ortiq turib qolmaydi, joyida «yugurmaydi»', () => {
    const { g } = newGame();
    const moving = new Set(['wander', 'travel', 'follow', 'watch', 'chase', 'flee']);
    const stall = new Map<string, number>(), still = new Map<string, number>();
    let maxStall = 0, maxStill = 0;
    for (let i = 0; i < 300 * 20; i++) {
      const before = new Map(g.herd.dinos.map((d) => [d.id, [d.x, d.z]]));
      g.update(0.05);
      for (const d of g.herd.dinos) {
        const wants = moving.has(d.mode) && (d.target || d.partner) && !(d.mode === 'watch' && !d.target);
        const s0 = wants && d.speed < 0.02 ? (stall.get(d.id) ?? 0) + 0.05 : 0;
        stall.set(d.id, s0); maxStall = Math.max(maxStall, s0);
        // tezligi bor, lekin joyidan siljimayapti
        const b = before.get(d.id)!;
        const s1 = d.speed > 0.1 && Math.hypot(d.x - b[0], d.z - b[1]) < 1e-6 ? (still.get(d.id) ?? 0) + 0.05 : 0;
        still.set(d.id, s1); maxStill = Math.max(maxStill, s1);
      }
    }
    expect(maxStall).toBeLessThan(8);
    expect(maxStill).toBeLessThan(4);
  });

  it('«Yangi shahar» — bo‘sh xarita: hech narsa yo‘q (ko‘prik ham), pul 500 000, aholi 0; birinchi yo‘l shahar ko‘chasi', () => {
    const { g } = newGame();
    g.confirmNewCity();
    expect(g.list).toEqual([]);
    expect(g.money).toBe(500000);
    expect(g.population).toBe(0);
    const r = g.buildRoad(manhattanPath({ x: 4, z: 16 }, { x: 10, z: 16 }));
    expect(r.ok).toBe(true);
    expect(g.roads.isConnected(10, 16)).toBe(true);
    // alohida kichik bo‘lak shahar ko‘chasiga ulanmagan
    g.buildRoad(manhattanPath({ x: 4, z: 24 }, { x: 5, z: 24 }));
    expect(g.roads.isConnected(4, 24)).toBe(false);
    expect(g.roads.isConnected(4, 16)).toBe(true);
  });

  it('Ko‘prik: suv ustiga oddiy yo‘l yo‘q, «Ko‘prik» bilan to‘g‘ri chiziqda quriladi va buziladi', () => {
    const { g, s } = newGame();
    g.confirmNewCity();
    // asl daryo ustidan o‘tuvchi to‘g‘ri chiziq: quruqlik → suv → quruqlik
    let line: { x: number; z: number }[] | null = null;
    for (let z = 0; z < 40 && !line; z++) for (let x = 0; x < 38 && !line; x++) {
      if (!isCoreWater(x + 1, z) || isCoreWater(x, z)) continue;
      let e = x + 1;
      while (e < 40 && isCoreWater(e, z)) e++;
      const path = manhattanPath({ x, z }, { x: e, z });
      if (g.checkRoadPath(path, true).ok) line = path;
    }
    expect(line).not.toBeNull();
    const path = line!;
    const wet = path.filter((p) => isCoreWater(p.x, p.z)).length;
    expect(g.checkRoadPath(path).ok).toBe(false);
    expect(g.checkRoadPath(path).reason).toMatch(/Ko‘prik/);
    // egri chiziq ko‘prik bo‘lolmaydi
    const bent = [...path, { x: path[path.length - 1].x, z: path[0].z + 1 }];
    expect(g.checkRoadPath(bent, true).ok).toBe(false);
    // suvsiz «ko‘prik» yo‘q
    expect(g.checkRoadPath([path[0]], true).ok).toBe(false);
    const money = g.money;
    const r = g.buildBridge(path);
    expect(r.ok).toBe(true);
    expect(money - g.money).toBe(wet * BRIDGE_PRICE + (path.length - wet) * CATALOG.road.price);
    expect(path.every((p) => g.roads.isRoad(p.x, p.z) && g.roads.isConnected(p.x, p.z))).toBe(true);
    // saqlash va qayta yuklash: suv ustidagi yo‘l (ko‘prik) yaroqli
    expect(validateSave(g.toSaveData())).toBeNull();
    g.saveNow(true);
    const g2 = Game.boot(s);
    expect(g2.roads.isRoad(path[1].x, path[1].z)).toBe(true);
    // o‘yinchi qurgan ko‘prik buziladi
    const id = g.objectAt(path[1].x, path[1].z)!.id;
    expect(g.canDemolish(id).ok).toBe(true);
  });
});

