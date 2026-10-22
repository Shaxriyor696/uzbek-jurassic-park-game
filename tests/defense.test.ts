import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game/game';
import { CATALOG } from '../src/game/catalog';
import { inBounds, isWater, Occupancy } from '../src/game/grid';
import { manhattanPath, E, N, S, W } from '../src/game/roadNetwork';
import { MIGRATION_CONFIG } from '../src/game/trafficDefs';
import { UTILITY_CONFIG } from '../src/game/utilities';
import { RAID_CONFIG } from '../src/game/herd';
import { CONSTRUCTION } from '../src/game/construction';
import { setActiveTerrain, terrainBlocksBuild } from '../src/game/terrain';
import { HerdNav, type HerdWorld } from '../src/game/herd';
import { HERD_BY_TYPE, herdRadius } from '../src/game/herdDefs';
import { DEFENSE_CONFIG, gateNavOpen, gatePhase, newGateState } from '../src/game/defenseDefs';
import {
  DIRS, evaluateDefense, gateCenter, rotMask, stepGate, terrainPassMask, wallVariant,
} from '../src/game/defense';
import { SAVE_KEY, validateSave, type KeyValueStorage } from '../src/game/saveStore';
import type { PlacedObject, Rotation } from '../src/game/types';

class MemStorage implements KeyValueStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

/** Bo‘sh yangi shahar, dinozavrlarsiz (alohida sinovlarda yoqiladi) */
function emptyCity(herd = false) {
  const s = new MemStorage();
  const g = Game.boot(s);
  g.confirmNewCity();
  if (!herd) { g.herd.disabled = true; g.herd.dinos = []; }
  return { g, s };
}

const need = (t: keyof typeof HERD_BY_TYPE) => Math.ceil(herdRadius(HERD_BY_TYPE[t])) + 1;

let seq = 0;
const obj = (type: PlacedObject['type'], x: number, z: number, rot: Rotation = 0, extra: Partial<PlacedObject> = {}): PlacedObject =>
  ({ id: 't' + seq++, type, gridX: x, gridZ: z, rotation: rot, residents: 0, outageTicks: 0, userPlaced: true, ...extra });

/** To‘g‘ri to‘rtburchak devor halqasi (skip — bo‘sh qoldiriladigan kataklar) */
function ring(x0: number, z0: number, x1: number, z1: number, skip = new Set<string>()): PlacedObject[] {
  const out: PlacedObject[] = [];
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
    if (skip.has(x + ',' + z)) continue;
    const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
    out.push(obj(corner ? 'himoya_burchak' : 'himoya_devor', x, z, 0));
  }
  return out;
}

function synthWorld(objects: PlacedObject[]): HerdWorld {
  const occ = Occupancy.from(objects);
  const byId = new Map(objects.map((o) => [o.id, o]));
  return {
    occ, dinoCells: new Set(), city: { x0: 0, z0: 0, x1: 39, z1: 39 },
    blocks: (x, z) => {
      const o = byId.get(occ.get(x, z)!);
      if (!o || o.type === 'road') return false;
      return !(o.type === 'himoya_darvoza' && !o.build && gateNavOpen(o.gate));
    },
  };
}

beforeEach(() => { vi.useFakeTimers(); CONSTRUCTION.enabled = false; MIGRATION_CONFIG.transport = false; UTILITY_CONFIG.mode = 'radius'; RAID_CONFIG.enabled = false; });
afterEach(() => { vi.useRealTimers(); CONSTRUCTION.enabled = false; });

describe('Shahar himoyasi: qurish', () => {
  it('katalog: uchta karta «Shahar himoyasi» bo‘limida, narx va o‘lcham yagona sozlamadan', () => {
    expect(CATALOG.himoya_devor.category).toBe('himoya');
    expect(CATALOG.himoya_devor.price).toBe(DEFENSE_CONFIG.wall.price);
    expect(CATALOG.himoya_burchak.price).toBe(DEFENSE_CONFIG.corner.price);
    expect([CATALOG.himoya_darvoza.width, CATALOG.himoya_darvoza.depth, CATALOG.himoya_darvoza.price]).toEqual([3, 1, DEFENSE_CONFIG.gate.price]);
    // devor bir qavatli uy tomidan (≈0,95) baland
    expect(DEFENSE_CONFIG.look.panelTop).toBeGreaterThan(1.1);
  });

  it('tortib chizish: burilishda burchak qismi, narx bir marta; yaroqsiz yo‘nalishda pul olinmaydi va hech narsa qurilmaydi', () => {
    const { g } = emptyCity();
    const m0 = g.money;
    const path = manhattanPath({ x: 10, z: 10 }, { x: 14, z: 12 });
    const plan = g.checkWallPath(path);
    expect(plan.ok).toBe(true);
    expect(plan.cells.map((c) => c.type)).toEqual(['himoya_devor', 'himoya_devor', 'himoya_devor', 'himoya_devor', 'himoya_burchak', 'himoya_devor', 'himoya_devor']);
    const corner = plan.cells[4];
    expect(rotMask(E | S, corner.rotation)).toBe(W | S);
    expect(plan.cost).toBe(6 * DEFENSE_CONFIG.wall.price + DEFENSE_CONFIG.corner.price);
    g.buildWall(path);
    expect(m0 - g.money).toBe(plan.cost);
    expect(g.list.filter((o) => o.type.startsWith('himoya')).length).toBe(7);
    // qayta chizish — mavjud qismlar qayta narxlanmaydi
    const again = g.checkWallPath(path);
    expect(again.ok).toBe(false);
    expect(again.newCount).toBe(0);
    // yo‘l ustidan — darvoza talab qilinadi, pul olinmaydi
    g.buildRoad(manhattanPath({ x: 20, z: 5 }, { x: 20, z: 15 }));
    const m1 = g.money, n1 = g.list.length;
    const bad = g.buildWall(manhattanPath({ x: 17, z: 8 }, { x: 23, z: 8 }));
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/darvoza/);
    expect(bad.cells.find((c) => c.x === 20)!.state).toBe('bad');
    expect(bad.cells.filter((c) => c.state === 'new').length).toBe(6); // preview: qolganlari yashil
    expect([g.money, g.list.length]).toEqual([m1, n1]);
    // mablag‘ yetmasa — hech narsa
    g.money = 100;
    const poor = g.buildWall(manhattanPath({ x: 25, z: 25 }, { x: 28, z: 25 }));
    expect([poor.ok, poor.reason, g.money]).toEqual([false, 'Mablag‘ yetarli emas', 100]);
  });

  it('suv va tik tog‘ orqali devor qurilmaydi', () => {
    const { g } = emptyCity();
    let wet: { x: number; z: number } | null = null, steep: { x: number; z: number } | null = null;
    for (let z = -20; z < 60; z++) for (let x = -20; x < 60; x++) {
      if (!wet && isWater(x, z) && !g.objectAt(x, z)) wet = { x, z };
      if (!steep && !isWater(x, z) && terrainBlocksBuild(x, z) && !g.objectAt(x, z)) steep = { x, z };
    }
    expect(wet).not.toBeNull();
    expect(g.checkWallPath([wet!]).reason).toMatch(/Suv/);
    if (steep) expect(g.checkWallPath([steep]).ok).toBe(false);
  });

  it('30 soniyalik qurilish: birga tasdiqlanganlar parallel, maydon band, tugaguncha himoya emas; pauzada to‘xtaydi', () => {
    CONSTRUCTION.enabled = true;
    const { g } = emptyCity();
    g.placeBuilding('uy_a', 20, 20, 0);
    g.buildWall(manhattanPath({ x: 15, z: 15 }, { x: 26, z: 15 }));
    g.buildWall(manhattanPath({ x: 26, z: 16 }, { x: 26, z: 26 }));
    g.buildWall(manhattanPath({ x: 25, z: 26 }, { x: 15, z: 26 }));
    g.buildWall(manhattanPath({ x: 15, z: 25 }, { x: 15, z: 16 }));
    const walls = g.list.filter((o) => o.type.startsWith('himoya'));
    expect(walls.length).toBe(44);
    expect(walls.every((o) => o.build)).toBe(true);
    // maydon band (bino qo‘yib bo‘lmaydi)
    expect(g.checkPlacement('daraxt', 15, 20, 0).ok).toBe(false);
    expect(g.defense.status).toBe('construction');
    g.paused = true;
    g.update(0.25);
    expect(walls[0].build!.elapsed).toBe(0);
    g.paused = false;
    for (let t = 0; t < 29.75; t += 0.25) g.update(0.25);
    expect(walls.every((o) => o.build)).toBe(true);
    for (let i = 0; i < 2; i++) g.update(0.25);
    expect(walls.every((o) => !o.build)).toBe(true);
    expect(g.defense.status).toBe('closed');
    expect(g.defense.protectedIds.length).toBe(1);
  });

  it('dinozavr maydonda bo‘lsa tugash kutiladi (ichiga qamab qo‘ymaydi)', () => {
    CONSTRUCTION.enabled = true;
    const { g } = emptyCity();
    g.buildWall([{ x: 30, z: 30 }]);
    const w = g.objectAt(30, 30)!;
    // tana katakka kirib qoldi (masalan, qurilish paytida)
    g.herd.dinos = [{ id: 'raptor', type: 'raptor', x: 30.5, z: 30.5, heading: 0, speed: 0, mode: 'rest', timer: 999, target: null, partner: null, cooldown: 99, visited: [], anim: 'idle', phase: { idle: 0, walk: 0, run: 0, look: 0 }, lookIdx: 0, rng: 1, face: null }];
    vi.spyOn(g.herd, 'step').mockImplementation(() => {});
    for (let t = 0; t < 31; t += 0.25) g.update(0.25);
    expect(w.build?.hold).toBe(true);
    g.herd.dinos = [];
    g.update(0.25);
    expect(w.build).toBeUndefined();
  });
});

describe('Shahar himoyasi: ulanish standarti', () => {
  it('to‘g‘ri, burchak va darvoza tirqishsiz ulanadi; ustun bir joyda ikki marta chizilmaydi', () => {
    const objs: PlacedObject[] = [];
    // halqa + bitta T tutashuv + darvoza (yo‘l ustida) + yolg‘iz devor
    objs.push(...ring(0, 0, 12, 8, new Set(['6,0', '5,0', '7,0'])));
    objs.push(obj('himoya_darvoza', 5, 0, 0, { gate: newGateState() }));
    for (let z = 1; z <= 4; z++) objs.push(obj('himoya_devor', 9, z, 1));
    objs.push(obj('himoya_devor', 20, 20, 0));
    const occ = Occupancy.from(objs);
    const byId = new Map(objs.map((o) => [o.id, o]));
    const objAt = (x: number, z: number) => byId.get(occ.get(x, z)!) ?? null;
    const pillars: { x: number; z: number }[] = [];
    for (const o of objs) {
      if (o.type === 'himoya_darvoza') {
        const c = gateCenter(o);
        pillars.push({ x: c.x - 1.5 + 0.5, z: c.z + 0.5 }, { x: c.x + 1.5 + 0.5, z: c.z + 0.5 });
        continue;
      }
      const v = wallVariant(o, objAt);
      if (v.junction) pillars.push({ x: o.gridX + 0.5, z: o.gridZ + 0.5 });
      for (const d of DIRS) {
        if (v.edgePillars & d.bit) pillars.push({ x: o.gridX + 0.5 + d.dx * 0.5, z: o.gridZ + 0.5 + d.dz * 0.5 });
        if (!(v.conns & d.bit)) continue;
        // ulangan tomonga qo‘l chetigacha boradi, qo‘shnisi ham qarshi tomonga (darvoza — o‘z ustuni bilan)
        expect(v.arms & d.bit).toBeTruthy();
        const n = objAt(o.gridX + d.dx, o.gridZ + d.dz)!;
        if (n.type !== 'himoya_darvoza') expect(wallVariant(n, objAt).arms & rotMask(d.bit, 2)).toBeTruthy();
      }
    }
    // darvoza ikki chetidagi devorlar unga ulangan
    expect(wallVariant(objAt(4, 0)!, objAt).conns & E).toBeTruthy();
    expect(wallVariant(objAt(8, 0)!, objAt).conns & W).toBeTruthy();
    // T tutashuv
    expect(wallVariant(objAt(9, 0)!, objAt).junction).toBe(true);
    // ustunlar: takrorlanmaydi va ustma-ust tushmaydi
    for (let i = 0; i < pillars.length; i++) for (let j = i + 1; j < pillars.length; j++) {
      expect(Math.hypot(pillars[i].x - pillars[j].x, pillars[i].z - pillars[j].z)).toBeGreaterThan(0.9);
    }
    // yolg‘iz devor ikki uchida ustun
    expect(wallVariant(objAt(20, 20)!, objAt).edgePillars).toBe(E | W);
    expect(N).toBe(1);
  });

  it('darvoza faqat yo‘l ustiga, yon tomonda qanotlar uchun joy kerak; yo‘l uzilmaydi', () => {
    const { g } = emptyCity();
    g.buildRoad(manhattanPath({ x: 20, z: 5 }, { x: 20, z: 30 }));
    expect(g.checkPlacement('himoya_darvoza', 30, 10, 0).reason).toMatch(/yo‘l ustiga/);
    // aylantirilmagan (yo‘l bo‘ylab) — rad
    expect(g.checkPlacement('himoya_darvoza', 20, 9, 1).ok).toBe(false);
    // qanot joyida bino — rad
    g.placeBuilding('daraxt', 23, 15, 0);
    expect(g.checkPlacement('himoya_darvoza', 19, 15, 0).reason).toMatch(/Qanot/);
    const m0 = g.money;
    expect(g.placeBuilding('himoya_darvoza', 19, 20, 0).ok).toBe(true);
    expect(m0 - g.money).toBe(DEFENSE_CONFIG.gate.price);
    expect(g.roads.isRoad(20, 20)).toBe(true);
    expect(g.roads.isConnected(20, 30)).toBe(true);
    // qanot joyiga endi bino ham, yo‘l ham qo‘yilmaydi, devor — mumkin
    expect(g.checkPlacement('daraxt', 17, 20, 0).ok).toBe(false);
    expect(g.checkRoadPath([{ x: 22, z: 20 }]).ok).toBe(false);
    expect(g.checkWallPath([{ x: 22, z: 20 }]).ok).toBe(true);
    // buzilsa yo‘l qaytadi
    const gate = g.objectAt(20, 20)!;
    expect(g.demolishImpact(gate.id).join(' ')).toMatch(/Yo‘l saqlanadi/);
    g.demolish(gate.id);
    expect(g.objectAt(20, 20)?.type).toBe('road');
    expect(g.roads.isConnected(20, 30)).toBe(true);
  });
});

describe('Shahar himoyasi: dinozavr navigatsiyasi', () => {
  // xarita tashqarisidagi tekis maydon (relyefsiz), shahar 0..39
  const R = { x0: 70, z0: 0, x1: 90, z1: 20 };
  const out = { x: 60.5, z: 10.5 }, inn = { x: 80.5, z: 10.5 };

  it('yopiq halqadan katta ham, kichik ham o‘tolmaydi; ochiq joydan sig‘adigani o‘tadi', () => {
    setActiveTerrain(null);
    const closed = new HerdNav(synthWorld(ring(R.x0, R.z0, R.x1, R.z1)));
    for (const t of ['raptor', 'triceratops_jp', 'trex'] as const) expect(closed.findPath(out.x, out.z, inn.x, inn.z, need(t), 40000)).toBeNull();
    // devor kataklari to‘siq, ichki tomonga masofa 1 dan boshlanadi
    expect(closed.clearance(R.x0 + 0.5, 10.5)).toBe(0);
    // 3 katak ochiq joy: raptor (kichik) o‘tadi, triseratops (katta) sig‘maydi
    const gap3 = new HerdNav(synthWorld(ring(R.x0, R.z0, R.x1, R.z1, new Set(['70,9', '70,10', '70,11']))));
    expect(gap3.findPath(out.x, out.z, inn.x, inn.z, need('raptor'), 40000)).not.toBeNull();
    expect(gap3.findPath(out.x, out.z, inn.x, inn.z, need('triceratops_jp'), 40000)).toBeNull();
    const gap5 = new HerdNav(synthWorld(ring(R.x0, R.z0, R.x1, R.z1, new Set(['70,8', '70,9', '70,10', '70,11', '70,12']))));
    expect(gap5.findPath(out.x, out.z, inn.x, inn.z, need('triceratops_jp'), 40000)).not.toBeNull();
    // hududlar: yopiq halqa ichi — boshqa hudud (maqsad u yerdan tanlanmaydi)
    expect(closed.regionOf(out.x, out.z)).not.toBe(closed.regionOf(inn.x, inn.z));
    expect(gap3.regionOf(out.x, out.z)).toBe(gap3.regionOf(inn.x, inn.z));
  });

  it('darvoza: yopiq — to‘siq, to‘liq ochiq — o‘tish; holat o‘zgarsa faqat atrofi yangilanadi', () => {
    setActiveTerrain(null);
    const gate = obj('himoya_darvoza', 69, 10, 1, { gate: newGateState() }); // eni z bo‘ylab: (70,9..11)
    const objs = [...ring(R.x0, R.z0, R.x1, R.z1, new Set(['70,9', '70,10', '70,11'])), gate];
    gate.gridX = 70; gate.gridZ = 9;
    const w = synthWorld(objs);
    const nav = new HerdNav(w);
    expect(nav.findPath(out.x, out.z, inn.x, inn.z, need('raptor'), 40000)).toBeNull();
    gate.gate!.want = 'open';
    gate.gate!.open = 0.6; // hali ochilmoqda — o‘tish yo‘q
    nav.patch(w, [{ x: 70, z: 9 }, { x: 70, z: 10 }, { x: 70, z: 11 }]);
    expect(nav.findPath(out.x, out.z, inn.x, inn.z, need('raptor'), 40000)).toBeNull();
    gate.gate!.open = 1;
    const t0 = performance.now();
    nav.patch(w, [{ x: 70, z: 9 }, { x: 70, z: 10 }, { x: 70, z: 11 }]);
    const tPatch = performance.now() - t0;
    expect(nav.findPath(out.x, out.z, inn.x, inn.z, need('raptor'), 40000)).not.toBeNull();
    // qisman yangilash to‘liq qayta qurish bilan aynan bir xil natija beradi
    const full = new HerdNav(w);
    expect(nav.clear.every((v, i) => v === full.clear[i])).toBe(true);
    const t1 = performance.now();
    new HerdNav(w);
    const tFull = performance.now() - t1;
    expect(tPatch).toBeLessThan(tFull);
    gate.gate!.want = 'closed';
    nav.patch(w, [{ x: 70, z: 9 }, { x: 70, z: 10 }, { x: 70, z: 11 }]);
    expect(nav.findPath(out.x, out.z, inn.x, inn.z, need('raptor'), 40000)).toBeNull();
  });

  it('o‘yinda: tayyor devor halqasi bilan 3 daqiqa — dinozavr devorga kirmaydi va tashqaridan ichkariga o‘tmaydi', () => {
    const { g } = emptyCity(true);
    expect(g.herd.dinos.length).toBeGreaterThan(5);
    g.placeBuilding('uy_a', 18, 18, 0);
    // xarita ichida, shahar atrofida halqa (relyef to‘sig‘i bo‘lgan kataklarda ham — sinov uchun to‘g‘ridan-to‘g‘ri)
    const added: PlacedObject[] = [];
    // halqa dinozavr turgan joydan o‘tmasin (qurilishda ham dinozavr ustiga qurib bo‘lmaydi)
    const body = g.herd.occupied();
    let k = 6;
    while (k < 30 && ring(-k, -k, 39 + k, 39 + k).some((o) => body.has(o.gridX + ',' + o.gridZ))) k++;
    for (const o of ring(-k, -k, 39 + k, 39 + k)) {
      if (g.objectAt(o.gridX, o.gridZ)) continue;
      g.objects.set(o.id, o);
      added.push(o);
    }
    (g as unknown as { rebuildIndexes(): void }).rebuildIndexes();
    const d0 = g.defense;
    expect(k).toBeLessThan(30);
    expect(d0.status).toBe('closed');
    const wallCells = new Set(added.map((o) => o.gridX + ',' + o.gridZ));
    const side = new Map(g.herd.dinos.map((d) => [d.id, d0.inside(d.x, d.z)]));
    let hits = 0, crossed = 0, moved = 0;
    const start = new Map(g.herd.dinos.map((d) => [d.id, { x: d.x, z: d.z }]));
    for (let t = 0; t < 180; t += 0.05) {
      g.update(0.05);
      for (const d of g.herd.dinos) {
        if (g.herd.bodyCells(d).some((c) => wallCells.has(c.x + ',' + c.z)))hits++;
        if (g.defense.inside(d.x, d.z) !== side.get(d.id)) crossed++;
      }
    }
    for (const d of g.herd.dinos) if (Math.hypot(d.x - start.get(d.id)!.x, d.z - start.get(d.id)!.z) > 3) moved++;
    expect(hits).toBe(0);
    expect(crossed).toBe(0);
    expect(moved).toBeGreaterThan(4); // to‘xtab qolmagan
  }, 60000);
});

describe('Shahar himoyasi: darvoza', () => {
  function gateCity() {
    const { g, s } = emptyCity();
    g.buildRoad(manhattanPath({ x: 20, z: 5 }, { x: 20, z: 35 }));
    g.placeBuilding('himoya_darvoza', 19, 20, 0);
    const gate = g.objectAt(20, 20)!;
    return { g, s, gate };
  }

  it('qo‘lda: ochish/yopish animatsiyasi 4 s, holatlar; ochiq bo‘lsa navigatsiya ochiq', () => {
    const { g, gate } = gateCity();
    expect(gatePhase(gate.gate!)).toBe('closed');
    g.gateCommand(gate.id, 'open');
    g.update(0.25);
    expect(gatePhase(gate.gate!)).toBe('opening');
    const v0 = g.gateNavVersion;
    for (let t = 0; t < 4; t += 0.25) g.update(0.25);
    expect(gatePhase(gate.gate!)).toBe('open');
    expect(g.gateNavVersion).toBe(v0 + 1);
    g.gateCommand(gate.id, 'close');
    g.update(0.25);
    expect(gatePhase(gate.gate!)).toBe('closing');
    expect(gateNavOpen(gate.gate)).toBe(false); // yopish buyrug‘idan keyin dinozavr uchun darhol yopiq
    // zid buyruq: yarim yo‘lda qayta ochish — sakrashsiz davom etadi
    const mid = gate.gate!.open;
    g.gateCommand(gate.id, 'open');
    g.update(0.25);
    expect(gate.gate!.open).toBeGreaterThan(mid);
    expect(gate.gate!.open - mid).toBeLessThan(0.1);
  });

  it('avtomatik: transport so‘rasa ochiladi, o‘tgach yopiladi; dinozavr xavf hududida — ochilmaydi; qo‘lda yopiqni ochmaydi', () => {
    const ctx = (o: Partial<{ busyDino: boolean; danger: boolean; request: boolean; busyVehicle: boolean }>) => ({ busyDino: false, danger: false, request: false, busyVehicle: false, ...o });
    const s = newGateState();
    s.mode = 'auto';
    const seen = new Set<string>();
    for (let t = 0; t < 5; t += 0.1) { stepGate(s, 0.1, ctx({ request: true })); seen.add(gatePhase(s)); }
    for (let t = 0; t < 2; t += 0.1) { stepGate(s, 0.1, ctx({ busyVehicle: true })); seen.add(gatePhase(s)); }
    expect(s.open).toBe(1); // transport o‘tish joyida — yopilmaydi
    for (let t = 0; t < 5; t += 0.1) { stepGate(s, 0.1, ctx({})); seen.add(gatePhase(s)); }
    expect([...seen].sort()).toEqual(['closed', 'closing', 'open', 'opening']);
    // xavf: so‘rov bo‘lsa ham ochilmaydi
    for (let t = 0; t < 5; t += 0.1) stepGate(s, 0.1, ctx({ request: true, danger: true }));
    expect(s.open).toBe(0);
    // qo‘lda yopilgan — transport so‘rovi ochmaydi
    const m = newGateState();
    m.mode = 'manual';
    for (let t = 0; t < 5; t += 0.1) stepGate(m, 0.1, ctx({ request: true }));
    expect(m.open).toBe(0);
  });

  it('o‘tish band bo‘lsa ustiga yopilmaydi — kutadi, bo‘shagach yopiladi', () => {
    const s = newGateState();
    s.want = 'open'; s.open = 1;
    s.want = 'closed';
    const busy = stepGate(s, 0.1, { busyDino: true, danger: false, request: false, busyVehicle: false });
    expect(busy.waitStart).toBe(true);
    expect([gatePhase(s), s.open, gateNavOpen(s)]).toEqual(['waiting', 1, true]); // ichidagi chiqib keta oladi
    stepGate(s, 0.1, { busyDino: true, danger: false, request: false, busyVehicle: false });
    expect(s.open).toBe(1);
    stepGate(s, 0.1, { busyDino: false, danger: false, request: false, busyVehicle: false });
    expect(gatePhase(s)).toBe('closing');
    // transport (avtobus orqasi ham) o‘tish joyida — ham band
    const c = newGateState();
    c.want = 'open'; c.open = 1; c.want = 'closed';
    stepGate(c, 0.05, { busyDino: false, danger: false, request: false, busyVehicle: true });
    expect(gatePhase(c)).toBe('waiting');
  });

  it('saqlash/yuklash: darvoza holati va to‘siq aynan tiklanadi; pauzada animatsiya to‘xtaydi', () => {
    const { g, s, gate } = gateCity();
    g.gateCommand(gate.id, 'auto');
    gate.gate!.want = 'open'; gate.gate!.open = 0.55; gate.gate!.nextCar = 7;
    g.paused = true;
    g.update(0.25);
    expect(gate.gate!.open).toBe(0.55);
    g.saveNow(true);
    const saved = JSON.parse(s.getItem(SAVE_KEY)!);
    expect(validateSave(saved)).toBeNull();
    const g2 = Game.boot(s);
    const gate2 = g2.objectAt(20, 20)!;
    expect(gate2.gate).toEqual(gate.gate);
    // to‘siq ko‘rinish bilan bir xil: yarim ochiq — dinozavr uchun yopiq
    expect((g2 as unknown as { navBlocks(x: number, z: number): boolean }).navBlocks(20, 20)).toBe(true);
    gate2.gate!.open = 1;
    expect((g2 as unknown as { navBlocks(x: number, z: number): boolean }).navBlocks(20, 20)).toBe(false);
    // buzilgan holat — xavfsiz yopiq
    saved.placedObjects.find((o: PlacedObject) => o.type === 'himoya_darvoza').gate = { mode: 'x' };
    s.setItem(SAVE_KEY, JSON.stringify(saved));
    const g3 = Game.boot(s);
    expect(gatePhase(g3.objectAt(20, 20)!.gate!)).toBe('closed');
  });
});

describe('Shahar himoyasi: hududni baholash', () => {
  const mask = terrainPassMask(() => true);
  const house = () => obj('uy_a', 80, 10);

  it('yopiq / ochiq joy / darvoza ochiq / qurilish tugallanmagan; ochiq joy joylashuvi', () => {
    const h = house();
    const closed = evaluateDefense([...ring(70, 0, 90, 20), h], mask);
    expect(closed.status).toBe('closed');
    expect(closed.protectedIds).toEqual([h.id]);
    expect(closed.inside(75.5, 5.5)).toBe(true);
    expect(closed.inside(60, 10)).toBe(false);
    const gap = evaluateDefense([...ring(70, 0, 90, 20, new Set(['90,15'])), h], mask);
    expect(gap.status).toBe('gap');
    expect(Math.hypot(gap.gap!.x - 90, gap.gap!.z - 15)).toBeLessThan(2);
    // bitta tirqish (diagonal tegish) ham ochiq joy
    const g2 = ring(70, 0, 90, 20);
    const diag = evaluateDefense([...g2.filter((o) => !(o.gridX === 90 && o.gridZ === 0)), h], mask);
    expect(diag.status).toBe('gap');
    const gate = obj('himoya_darvoza', 70, 9, 1, { gate: { ...newGateState(), want: 'open', open: 1 } });
    const open = evaluateDefense([...ring(70, 0, 90, 20, new Set(['70,9', '70,10', '70,11'])), gate, h], mask);
    expect(open.status).toBe('gateOpen');
    expect(open.gap).toEqual({ x: 70, z: 10 });
    gate.gate!.want = 'closed'; gate.gate!.open = 0;
    expect(evaluateDefense([...ring(70, 0, 90, 20, new Set(['70,9', '70,10', '70,11'])), gate, h], mask).status).toBe('closed');
    const building = ring(70, 0, 90, 20);
    building[5].build = { elapsed: 3, duration: 30, paid: true };
    expect(evaluateDefense([...building, h], mask).status).toBe('construction');
  });

  it('kichik yopiq halqa butun shaharni himoyalangan qilmaydi', () => {
    const a = obj('uy_a', 80, 10), b = obj('uy_a', 100, 10);
    const d = evaluateDefense([...ring(70, 0, 90, 20), a, b], mask);
    expect(d.status).toBe('gap');
    expect(d.protectedIds).toEqual([a.id]);
    expect(d.exposedIds).toEqual([b.id]);
  });

  it('ko‘p segment: 600 ta devor qismi bilan baholash tez (har kadr emas, faqat o‘zgarishda)', () => {
    const big = ring(-100, -100, 49, 49);
    expect(big.length).toBeGreaterThan(590);
    const t0 = performance.now();
    const d = evaluateDefense([...big, obj('uy_a', 10, 10)], mask);
    const dt = performance.now() - t0;
    expect(d.status).toBe('closed');
    expect(dt).toBeLessThan(400);
  });

  it('o‘yinda: holat faqat o‘zgarishda hisoblanadi; ogohlantirish bir marta; buzish oqibati ko‘rsatiladi', () => {
    const { g } = emptyCity();
    g.placeBuilding('uy_a', 20, 20, 0);
    g.buildWall(manhattanPath({ x: 15, z: 15 }, { x: 26, z: 15 }));
    g.buildWall(manhattanPath({ x: 26, z: 16 }, { x: 26, z: 26 }));
    g.buildWall(manhattanPath({ x: 25, z: 26 }, { x: 15, z: 26 }));
    g.buildWall(manhattanPath({ x: 15, z: 25 }, { x: 15, z: 16 }));
    expect(g.defense).toBe(g.defense); // kesh
    expect(g.defense.status).toBe('closed');
    g.update(1.1);
    const w = g.objectAt(15, 20)!;
    expect(g.demolishImpact(w.id).join(' ')).toMatch(/chegarasi ochiladi: 1 ta bino/);
    g.demolish(w.id);
    for (let i = 0; i < 6; i++) g.update(0.5);
    expect(g.toasts.filter((t) => t.text === 'Chegarada ochiq joy bor.').length).toBe(1);
    expect(Math.hypot(g.defense.gap!.x - 15, g.defense.gap!.z - 20)).toBeLessThan(1.6);
    // tekshirish topshirig‘i: faqat yopiq bo‘lganda
    g.checkDefense();
    expect(g.defenseChecked).toBe(false);
    g.buildWall([{ x: 15, z: 20 }]);
    g.checkDefense();
    expect(g.defenseChecked).toBe(true);
    // budjet: darvoza xizmat xarajati «Shahar himoyasi» qatorida
    expect(g.budget.lines.find((l) => l.id === 'defense')!.amount).toBe(0);
  });

  it('eski saqlangan shahar (himoyasiz) ochiladi: pul, aholi va obyektlar o‘zgarmaydi', () => {
    const s = new MemStorage();
    const g = Game.boot(s);
    g.saveNow(true);
    const raw = JSON.parse(s.getItem(SAVE_KEY)!);
    delete raw.defense;
    s.setItem(SAVE_KEY, JSON.stringify(raw));
    const g2 = Game.boot(s);
    expect([g2.money, g2.population, g2.list.length]).toEqual([g.money, g.population, g.list.length]);
    expect(g2.defense.status).toBe('none');
    expect(g2.defenseChecked).toBe(false);
    expect(inBounds(0, 0)).toBe(true);
  });
});
