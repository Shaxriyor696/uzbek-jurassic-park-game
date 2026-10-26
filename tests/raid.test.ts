import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game/game';
import { CATALOG } from '../src/game/catalog';
import { manhattanPath } from '../src/game/roadNetwork';
import { CONSTRUCTION } from '../src/game/construction';
import { MIGRATION_CONFIG, POLICE_CONFIG } from '../src/game/trafficDefs';
import { UTILITY_CONFIG } from '../src/game/utilities';
import { RAID_CONFIG } from '../src/game/herd';
import { HERD_BY_TYPE, herdRadius } from '../src/game/herdDefs';
import { DAMAGE_CONFIG, repairCost } from '../src/game/damage';
import type { PlacedObject } from '../src/game/types';

beforeEach(() => { vi.useFakeTimers(); CONSTRUCTION.enabled = false; MIGRATION_CONFIG.transport = false; UTILITY_CONFIG.mode = 'capacity'; RAID_CONFIG.enabled = true; });
afterEach(() => { vi.useRealTimers(); RAID_CONFIG.enabled = true; });

function run(g: Game, seconds: number, each?: () => void, dt = 0.1) {
  for (let t = 0; t < seconds; t += dt) { g.update(dt); each?.(); }
}

/** Shahar: o‘rtada yo‘l, uylar, elektr; dinozavrlar hujumga tayyor */
function city() {
  const g = Game.boot(null);
  g.confirmNewCity();
  let z = -1;
  for (let k = 14; k < 26 && z < 0; k++) if (g.checkRoadPath(manhattanPath({ x: 12, z: k }, { x: 30, z: k })).ok) z = k;
  g.buildRoad(manhattanPath({ x: 12, z }, { x: 30, z }));
  const houses: PlacedObject[] = [];
  for (const x of [13, 17, 21, 25]) if (g.placeBuilding('uy_a', x, z + 1, 0).ok) houses.push(g.objectAt(x, z + 1)!);
  g.placeBuilding('elektr', 13, z - 3, 0);
  g.placeBuilding('suv', 17, z - 3, 0);
  return { g, z, houses };
}

// hujum to‘lqini (o‘yinda Game shahar rivojiga qarab beradi) — sinovda darhol hammasiga
const goRaid = (g: Game) => { g.herd.raidTickets = 99; for (const d of g.herd.dinos) { d.raidCool = 0; d.timer = 0; } };

describe('Dinozavrlar: doim harakatda', () => {
  it('ko‘p vaqt yuradi; ikki dinozavr yuzma-yuz qotib turmaydi', () => {
    RAID_CONFIG.enabled = false;
    const g = Game.boot(null);
    g.confirmNewCity();
    const mobile = g.herd.dinos.filter((d) => HERD_BY_TYPE[d.type].mobile);
    let moving = 0, samples = 0, maxFace = 0;
    const face = new Map<string, number>();
    const prev = new Map(mobile.map((d) => [d.id, { x: d.x, z: d.z, h: d.heading }]));
    const still = new Map<string, boolean>();
    run(g, 120, () => {
      for (const d of mobile) {
        samples++;
        if (d.speed > 0.05) moving++;
        const p = prev.get(d.id)!;
        still.set(d.id, Math.hypot(d.x - p.x, d.z - p.z) < 0.001 && Math.abs(d.heading - p.h) < 0.001);
        prev.set(d.id, { x: d.x, z: d.z, h: d.heading });
      }
      for (let i = 0; i < mobile.length; i++) for (let j = i + 1; j < mobile.length; j++) {
        const a = mobile[i], b = mobile[j];
        const k = a.id + b.id;
        const close = Math.hypot(a.x - b.x, a.z - b.z) < herdRadius(HERD_BY_TYPE[a.type]) + herdRadius(HERD_BY_TYPE[b.type]) + 4;
        // ikkalasi ham joyidan siljimay va burilmay turibdi
        const t = close && still.get(a.id) && still.get(b.id) ? (face.get(k) ?? 0) + 0.1 : 0;
        face.set(k, t);
        maxFace = Math.max(maxFace, t);
      }
    });
    expect(moving / samples).toBeGreaterThan(0.6);
    expect(maxFace).toBeLessThan(3);
  }, 60000);
});

describe('Dinozavrlar: qotib qolmaydi, yirtqichlar yuguradi', () => {
  it('har biri ko‘p vaqt harakatda; uzoq qotish yo‘q; T-rex, spinozavr, Alice vaqti-vaqti bilan yuguradi', () => {
    RAID_CONFIG.enabled = false;
    const g = Game.boot(null);
    g.confirmNewCity();
    const mobile = g.herd.dinos.filter((d) => HERD_BY_TYPE[d.type].mobile);
    const moving = new Map<string, number>(), still = new Map<string, number>(), maxStill = new Map<string, number>();
    const prev = new Map(mobile.map((d) => [d.id, { x: d.x, z: d.z, h: d.heading }]));
    const sprinted = new Set<string>();
    let n = 0;
    run(g, 300, () => {
      n++;
      for (const d of mobile) {
        if (d.speed > 0.05) moving.set(d.id, (moving.get(d.id) ?? 0) + 1);
        const p = prev.get(d.id)!;
        const s = Math.hypot(d.x - p.x, d.z - p.z) < 0.001 && Math.abs(d.heading - p.h) < 0.001 ? (still.get(d.id) ?? 0) + 0.05 : 0;
        still.set(d.id, s);
        maxStill.set(d.id, Math.max(maxStill.get(d.id) ?? 0, s));
        prev.set(d.id, { x: d.x, z: d.z, h: d.heading });
        if (d.sprint && d.speed > 0.05) sprinted.add(d.type);
      }
    }, 0.05);
    for (const d of mobile) {
      expect(moving.get(d.id)! / n, d.id).toBeGreaterThan(0.65);
      // qisqa dam olish/kuzatish (animatsiya bilan) bo‘lishi mumkin, lekin uzoq qotish yo‘q
      expect(maxStill.get(d.id)!, d.id).toBeLessThan(9);
    }
    for (const t of ['trex', 'spinosaurus', 'alice']) expect(sprinted.has(t), t).toBe(true);
  }, 180000);
});

describe('Dinozavrlar: hujum to‘lqinlari (o‘yin rejimida)', () => {
  it('kichik shaharga hujum yo‘q; shahar o‘sgach vaqti-vaqti bilan 1–3 dinozavr keladi, hammasi birdan emas; orada tanaffus', () => {
    const g = Game.boot(null);
    g.confirmNewCity();
    const raiding = () => g.herd.dinos.filter((d) => d.mode === 'raid' || d.mode === 'stomp' || d.mode === 'probe').length;
    // bino yo‘q — 5 daqiqa hujum yo‘q
    let max0 = 0;
    run(g, 300, () => { max0 = Math.max(max0, raiding()); }, 0.1);
    expect(max0).toBe(0);
    // shahar quriladi
    const { g: c } = city();
    let maxRaid = 0, starts = 0, prev = 0, quietAfter = 0, firstWaveBroken = false, sawPartial = false;
    run(c, 900, () => {
      const n = c.herd.dinos.filter((d) => d.mode === 'raid' || d.mode === 'stomp' || d.mode === 'probe').length;
      maxRaid = Math.max(maxRaid, n);
      if (n > 0 && prev === 0) starts++;
      if (n === 0 && starts > 0) quietAfter += 0.1;
      if (starts === 1 && c.list.some((o) => (o.damage ?? 0) >= 1)) firstWaveBroken = true;
      if (c.list.some((o) => (o.damage ?? 0) > 0 && (o.damage ?? 0) < 1)) sawPartial = true;
      prev = n;
    }, 0.1);
    expect(starts).toBeGreaterThanOrEqual(2); // vaqti-vaqti bilan, bir necha marta
    expect(maxRaid).toBeLessThanOrEqual(3); // hammasi birdan emas
    expect(maxRaid).toBeGreaterThan(0);
    expect(quietAfter).toBeGreaterThan(120); // hujumlar orasida tanaffus
    expect(sawPartial).toBe(true);
    expect(firstWaveBroken).toBe(false); // birinchi hujumdayoq bino butunlay buzilmaydi
  }, 180000);
});

describe('Dinozavrlar: shaharga hujum', () => {
  it('ochiq shaharga kiradi, binoni ishdan chiqaradi; politsiya mashinasi chiqarib yuboradi (limit bilan)', () => {
    const { g, z } = city();
    goRaid(g);
    let entered = false, damaged: PlacedObject | null = null, warned = false, partial = false, retreated = false, hits = 0;
    // bir to‘lqin: qisman zarar (bino birdan buzilmaydi), keyin chekinadi; zarba hodisalari (ko‘rinish/ovoz uchun)
    run(g, 60, () => {
      if (g.list.some((o) => (o.damage ?? 0) > 0 && (o.damage ?? 0) < 1)) partial = true;
      if (g.herd.dinos.some((d) => d.mode === 'leave' && (d.raidHits ?? 0) > 0)) retreated = true;
      hits = Math.max(hits, g.herd.hits.length);
    });
    expect(partial).toBe(true);
    expect(retreated).toBe(true);
    expect(hits).toBeGreaterThan(0);
    // takroriy to‘lqinlar: zarar to‘planadi — oxiri bino ishdan chiqadi
    for (let wave = 0; wave < 8 && !damaged; wave++) {
      goRaid(g);
      run(g, 60, () => {
        if (g.herd.dinos.some((d) => g.inCityArea(d.x, d.z))) entered = true;
        if (g.toasts.some((t) => t.text.startsWith('Shaharga dinozavr kirdi'))) warned = true;
        damaged ??= g.list.find((o) => (o.damage ?? 0) >= 1) ?? null;
      });
    }
    expect(entered).toBe(true);
    expect(damaged).not.toBeNull();
    { const st0 = g.statuses.get(damaged!.id)!; expect(CATALOG[damaged!.type].utilityRadius > 0 ? st0.active : st0.power).toBe(false); } // ishlamaydi
    expect(warned).toBe(true);
    // shikastlangan stansiyalarni ta’mirlab, politsiya bo‘limi (yo‘l + elektr)
    g.repairAll('city');
    // joyda dinozavr turgan bo‘lishi mumkin — o‘tib ketguncha qayta urinadi
    let r = g.placeBuilding('politsiya', 21, z - 3, 0);
    for (let k = 0; k < 60 && !r.ok && r.reason.includes('dinozavr'); k++) { run(g, 1); r = g.placeBuilding('politsiya', 21, z - 3, 0); }
    expect(r.ok, r.reason).toBe(true);
    let maxPolice = 0, sawPolice = false;
    const evicted = new Map<string, number>();
    let left = 0;
    run(g, 240, () => {
      maxPolice = Math.max(maxPolice, g.traffic.police.length);
      if (g.traffic.police.length) sawPolice = true;
      for (const d of g.herd.dinos) {
        if (d.mode === 'leave' && !evicted.has(d.id)) evicted.set(d.id, 0);
        if (evicted.has(d.id) && evicted.get(d.id)! >= 0) {
          if (!g.inCityArea(d.x, d.z)) { left++; evicted.set(d.id, -1); } else evicted.set(d.id, evicted.get(d.id)! + 0.1);
        }
      }
    });
    expect(sawPolice).toBe(true);
    expect(maxPolice).toBeLessThanOrEqual(POLICE_CONFIG.perStation);
    expect(evicted.size).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(0); // chiqarib yuborilgan dinozavr shahar hududidan chiqdi
    damaged = g.list.find((o) => (o.damage ?? 0) >= 1 && !o.build) ?? damaged;
    // ta’mirlash: pullik, qisqa qurilish, keyin ishlaydi
    const m = g.money, cost = repairCost(damaged!);
    expect(g.repair(damaged!.id)).toBe(true);
    expect(m - g.money).toBe(cost);
    expect(damaged!.damage).toBeUndefined();
    // stansiyalar ham ta’mirlangach — bino yana ishlaydi
    RAID_CONFIG.enabled = false;
    g.repairAll('city');
    // stansiya bo‘lsa — u ishlayapti (active); iste’molchi bo‘lsa — elektr oladi
    const st = g.statuses.get(damaged!.id)!;
    expect(CATALOG[damaged!.type].utilityRadius > 0 ? st.active : st.power).toBe(true);
    expect(CATALOG.politsiya).toBeDefined();
  }, 60000);

  it('devor bilan o‘ralgan shaharga kirmaydi — devor oldida urinadi va devorga zarar yetkazadi; buzilgan devor ochiq joy bo‘ladi va ta’mirlanadi', () => {
    const { g, houses } = city();
    // shahar atrofida halqa (dinozavr turgan joydan o‘tmaydi)
    const body = g.herd.occupied();
    let k = 6;
    const ringCells = (k: number) => { const o: { x: number; z: number }[] = []; for (let x = -k; x <= 39 + k; x++) for (let z = -k; z <= 39 + k; z++) if (x === -k || z === -k || x === 39 + k || z === 39 + k) o.push({ x, z }); return o; };
    while (k < 30 && ringCells(k).some((c) => body.has(c.x + ',' + c.z))) k++;
    let n = 0;
    for (const c of ringCells(k)) {
      if (g.objectAt(c.x, c.z)) continue;
      g.objects.set('w' + n, { id: 'w' + n++, type: 'himoya_devor', gridX: c.x, gridZ: c.z, rotation: 0, residents: 0, outageTicks: 0, userPlaced: true });
    }
    (g as unknown as { rebuildIndexes(): void }).rebuildIndexes();
    expect(g.defense.status).toBe('closed');
    const side = new Map(g.herd.dinos.map((d) => [d.id, g.defense.inside(d.x, d.z)]));
    goRaid(g);
    let crossed = 0, probed = false;
    run(g, 150, () => {
      for (const d of g.herd.dinos) {
        if (d.mode === 'probe') probed = true;
        if (!side.get(d.id) && g.defense.inside(d.x, d.z)) crossed++;
      }
    });
    expect(probed).toBe(true);
    const walls = g.list.filter((o) => o.type === 'himoya_devor');
    const hurt = walls.filter((o) => (o.damage ?? 0) > 0);
    expect(hurt.length).toBeGreaterThan(0);
    // devor hali buzilmagan bo‘lsa, tashqaridan hech kim kirmagan
    if (!walls.some((o) => (o.damage ?? 0) >= 1)) expect(crossed).toBe(0);
    // buzilgan devor — ochiq joy; ta’mirlansa yana yopiq
    const w0 = hurt[0];
    w0.damage = 1;
    (g as unknown as { recompute(): void }).recompute();
    expect(g.defense.status).toBe('gap');
    expect((g as unknown as { navBlocks(x: number, z: number): boolean }).navBlocks(w0.gridX, w0.gridZ)).toBe(false);
    expect(g.damaged('defense').list.length).toBeGreaterThan(0);
    g.repairAll('defense');
    expect(g.defense.status).toBe('closed');
    expect(houses.length).toBeGreaterThan(0);
    expect(DAMAGE_CONFIG.wallSeconds).toBeGreaterThan(DAMAGE_CONFIG.buildingSeconds);
  }, 60000);

  it('politsiya mashinalari umumiy limitdan oshmaydi', () => {
    const { g, z } = city();
    g.placeBuilding('politsiya', 21, z - 3, 0);
    g.placeBuilding('elektr', 25, z - 3, 0);
    RAID_CONFIG.enabled = false;
    // hamma dinozavr shahar ichida deb (sinov uchun joylashtiramiz)
    vi.spyOn(g, 'inCityArea').mockReturnValue(true);
    vi.spyOn(g.herd, 'evict').mockReturnValue(false);
    let max = 0;
    run(g, 30, () => { max = Math.max(max, g.traffic.police.length); });
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(Math.min(POLICE_CONFIG.maxTotal, POLICE_CONFIG.perStation));
  });
});
