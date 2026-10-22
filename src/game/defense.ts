import { CATALOG } from './catalog';
import { footprintCells, inBounds, isWater, LAND_MAX, LAND_MIN, MAP_MAX, MAP_MIN, isLockedRoadCell } from './grid';
import { STEEP_REASON, terrainBlocksBuild } from './terrain';
import { OUT_OF_MAP_REASON } from './placement';
import { E, N, S, W } from './roadNetwork';
import { DEFENSE_CONFIG, gateNavOpen, isDefense, isWallPiece, type GateState } from './defenseDefs';
import type { DefenseType, PlacedObject, Rotation } from './types';

/**
 * Shahar himoyasi mantiqi (sahnadan mustaqil): devor chizish rejasi, qismlarning ulanish standarti,
 * darvoza holat mashinasi va himoyalangan hududni aniqlash (dinozavr tashqaridan yo‘l topa oladimi).
 *
 * Ulanish standarti: har qism bitta katak; devor chizig‘i katak markazidan o‘tadi va katak chetida qo‘shnisi bilan
 * tutashadi (balandlik va qalinlik hammasida bir xil). Qo‘shni (4 tomon) devor/burchak — doim ulanadi; darvoza —
 * faqat eni bo‘ylab (uning chetki ustuni shu chetda turadi). Ustun bitta chetda faqat bir marta chiziladi.
 */

export type Cell = { x: number; z: number };
type ObjAt = (x: number, z: number) => PlacedObject | null;

export const DIRS = [
  { bit: N, dx: 0, dz: -1 },
  { bit: E, dx: 1, dz: 0 },
  { bit: S, dx: 0, dz: 1 },
  { bit: W, dx: -1, dz: 0 },
] as const;

export function rotMask(mask: number, r: number): number {
  let m = mask;
  for (let i = 0; i < (((r % 4) + 4) % 4); i++) m = ((m << 1) | (m >> 3)) & 0xf;
  return m;
}

const popcount = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
const mod = (v: number, k: number) => ((v % k) + k) % k;

// ---------------- darvoza geometriyasi ----------------

/** Darvoza eni qaysi o‘q bo‘ylab (yo‘l unga perpendikulyar o‘tadi) */
export function gateAxis(rot: Rotation): 'x' | 'z' {
  return rot % 2 === 0 ? 'x' : 'z';
}

export function gateCenter(o: { gridX: number; gridZ: number; rotation: Rotation }): Cell {
  return gateAxis(o.rotation) === 'x' ? { x: o.gridX + 1, z: o.gridZ } : { x: o.gridX, z: o.gridZ + 1 };
}

/** Qanotlar ochilganda suriladigan yon kataklar (har tomonda `pocket` ta) */
export function gatePocketCells(o: { gridX: number; gridZ: number; rotation: Rotation }): Cell[] {
  const c = gateCenter(o);
  const ax = gateAxis(o.rotation) === 'x';
  const out: Cell[] = [];
  for (let k = 2; k < 2 + DEFENSE_CONFIG.gateRun.pocket; k++) for (const s of [-1, 1]) out.push(ax ? { x: c.x + s * k, z: c.z } : { x: c.x, z: c.z + s * k });
  return out;
}

/** Barcha darvozalar qanot joylari (bino va yo‘l qo‘yilmaydi; devor mumkin) */
export function pocketSet(objects: Iterable<PlacedObject>): Map<string, string> {
  const out = new Map<string, string>();
  for (const o of objects) if (o.type === 'himoya_darvoza') for (const c of gatePocketCells(o)) out.set(c.x + ',' + c.z, o.id);
  return out;
}

// ---------------- ulanish standarti ----------------

/** Devor katagi qaysi tomonlarga ulanadi (N/E/S/W bitlari) */
export function wallConns(x: number, z: number, objAt: ObjAt): number {
  let m = 0;
  for (const d of DIRS) {
    const n = objAt(x + d.dx, z + d.dz);
    if (!n) continue;
    if (isWallPiece(n.type)) m |= d.bit;
    else if (n.type === 'himoya_darvoza' && (gateAxis(n.rotation) === 'x' ? d.dx !== 0 : d.dz !== 0)) m |= d.bit;
  }
  return m;
}

export interface WallVariant {
  /** Markazdan shu tomonlar chetigacha devor */
  arms: number;
  /** Markazda (burchak/tutashuv) yo‘g‘on ustun */
  junction: boolean;
  /** Shu katak chizadigan chetdagi ustunlar (tomon bitlari) */
  edgePillars: number;
  /** Ulangan tomonlar */
  conns: number;
  /** Shu katak chetlaridagi barcha ustunlar (o‘ziniki, qo‘shnisiniki yoki darvozaniki) — panel tayoqlari ularga kirmaydi */
  pillarEdges: number;
}

function isJunction(o: PlacedObject, objAt: ObjAt): boolean {
  if (o.type === 'himoya_burchak') return true;
  if (o.type !== 'himoya_devor') return false;
  const c = wallConns(o.gridX, o.gridZ, objAt);
  return (c & (E | W)) !== 0 && (c & (N | S)) !== 0;
}

export function wallVariant(o: PlacedObject, objAt: ObjAt): WallVariant {
  const conns = wallConns(o.gridX, o.gridZ, objAt);
  const pc = popcount(conns);
  let arms: number;
  let junction: boolean;
  if (o.type === 'himoya_burchak') {
    arms = pc >= 2 ? conns : conns | rotMask(E | S, o.rotation);
    junction = true;
  } else if (pc === 0) {
    arms = o.rotation % 2 === 0 ? E | W : N | S;
    junction = false;
  } else if ((conns & ~(E | W)) === 0) {
    arms = E | W;
    junction = false;
  } else if ((conns & ~(N | S)) === 0) {
    arms = N | S;
    junction = false;
  } else {
    arms = conns;
    junction = true;
  }
  let edgePillars = 0;
  const every = DEFENSE_CONFIG.look.pillarEvery;
  for (const d of DIRS) {
    if (!(arms & d.bit)) continue;
    // ochiq uch — ustun bilan yopiladi
    if (!(conns & d.bit)) { edgePillars |= d.bit; continue; }
    const n = objAt(o.gridX + d.dx, o.gridZ + d.dz)!;
    if (n.type === 'himoya_darvoza' || isJunction(n, objAt)) continue; // darvoza/tutashuv ustuni o‘zida
    if (junction) continue;
    // ulangan chet: faqat musbat tomondagi (sharq/janub) chetni shu katak chizadi — ikki marta chizilmaydi
    if (d.bit === E && mod(o.gridX + 1, every) === 0) edgePillars |= d.bit;
    if (d.bit === S && mod(o.gridZ + 1, every) === 0) edgePillars |= d.bit;
  }
  let pillarEdges = edgePillars;
  for (const d of DIRS) {
    if (!(conns & d.bit) || junction) continue;
    const n = objAt(o.gridX + d.dx, o.gridZ + d.dz)!;
    if (n.type === 'himoya_darvoza') { pillarEdges |= d.bit; continue; }
    if (isJunction(n, objAt)) continue;
    // qo‘shni chizadigan ustun (g‘arb/shimol chetlari)
    if (d.bit === W && mod(o.gridX, every) === 0) pillarEdges |= d.bit;
    if (d.bit === N && mod(o.gridZ, every) === 0) pillarEdges |= d.bit;
  }
  return { arms, junction, edgePillars, conns, pillarEdges };
}

export function variantKey(v: WallVariant): string {
  return `${v.arms}.${v.junction ? 1 : 0}.${v.edgePillars}`;
}

// ---------------- devor chizish ----------------

export interface WallCell extends Cell {
  type: DefenseType;
  rotation: Rotation;
  state: 'new' | 'exists' | 'bad';
  reason?: string;
}

export interface WallPlan {
  ok: boolean;
  reason: string;
  cells: WallCell[];
  /** Yangi qismlar soni (narx shulardan) */
  newCount: number;
  cost: number;
}

function dirBit(dx: number, dz: number): number {
  return dz < 0 ? N : dx > 0 ? E : dz > 0 ? S : W;
}

/** Burchak qismining aylanishi: ikki qo‘l tomonidan */
function cornerRot(mask: number): Rotation {
  for (let r = 0; r < 4; r++) if (rotMask(E | S, r) === mask) return r as Rotation;
  return 0;
}

export function planWall(
  path: Cell[],
  ctx: { objAt: ObjAt; money: number; rotation: Rotation; dinoAt: (x: number, z: number) => boolean },
): WallPlan {
  const cells: WallCell[] = [];
  let newCount = 0;
  let cost = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const prev = path[i - 1], next = path[i + 1];
    let type: DefenseType = 'himoya_devor';
    let rotation: Rotation = ctx.rotation;
    if (prev && next && (prev.x === p.x) !== (next.x === p.x)) {
      type = 'himoya_burchak';
      rotation = cornerRot(dirBit(prev.x - p.x, prev.z - p.z) | dirBit(next.x - p.x, next.z - p.z));
    } else if (prev || next) {
      const q = (next ?? prev)!;
      rotation = q.x !== p.x ? 0 : 1;
    }
    const c: WallCell = { x: p.x, z: p.z, type, rotation, state: 'new' };
    const o = ctx.objAt(p.x, p.z);
    if (!inBounds(p.x, p.z)) { c.state = 'bad'; c.reason = OUT_OF_MAP_REASON; }
    else if (o && isWallPiece(o.type)) c.state = 'exists';
    else if (o?.type === 'road') { c.state = 'bad'; c.reason = 'Yo‘l ustiga devor qurilmaydi — bu joyga «Himoya darvozasi» qo‘ying'; }
    else if (o?.type === 'himoya_darvoza') { c.state = 'bad'; c.reason = 'Bu yerda darvoza bor'; }
    else if (o) { c.state = 'bad'; c.reason = 'Devor bino ichidan o‘tolmaydi'; }
    else if (isWater(p.x, p.z)) { c.state = 'bad'; c.reason = 'Suv orqali devor qurib bo‘lmaydi'; }
    else if (terrainBlocksBuild(p.x, p.z)) { c.state = 'bad'; c.reason = STEEP_REASON; }
    else if (ctx.dinoAt(p.x, p.z)) { c.state = 'bad'; c.reason = 'Bu yerda dinozavr yuribdi — u ketishini kuting'; }
    if (c.state === 'new') { newCount++; cost += type === 'himoya_burchak' ? DEFENSE_CONFIG.corner.price : DEFENSE_CONFIG.wall.price; }
    cells.push(c);
  }
  const bad = cells.find((c) => c.state === 'bad');
  if (bad) return { ok: false, reason: bad.reason!, cells, newCount, cost };
  if (newCount === 0) return { ok: false, reason: 'Bu yerda devor allaqachon bor', cells, newCount, cost };
  if (ctx.money < cost) return { ok: false, reason: 'Mablag‘ yetarli emas', cells, newCount, cost };
  return { ok: true, reason: `Devor: ${newCount} ta yangi qism`, cells, newCount, cost };
}

// ---------------- darvoza joylashuvi ----------------

export interface GateCheck {
  ok: boolean;
  reason: string;
  cost: number;
  /** Darvoza o‘rnini egallaydigan yo‘l katagi */
  roadId: string | null;
}

export function checkGate(gx: number, gz: number, rot: Rotation, ctx: { objAt: ObjAt; money: number }): GateCheck {
  const cost = DEFENSE_CONFIG.gate.price;
  const fail = (reason: string): GateCheck => ({ ok: false, reason, cost, roadId: null });
  const spot = { gridX: gx, gridZ: gz, rotation: rot };
  const cells = footprintCells('himoya_darvoza', gx, gz, rot);
  const pockets = gatePocketCells(spot);
  if ([...cells, ...pockets].some((p) => !inBounds(p.x, p.z))) return fail(OUT_OF_MAP_REASON);
  const c = gateCenter(spot);
  const road = ctx.objAt(c.x, c.z);
  if (!road || road.type !== 'road') return fail('Darvoza yo‘l ustiga qo‘yiladi — kursorni yo‘l katagiga olib boring');
  if (isWater(c.x, c.z)) return fail('Ko‘prik ustiga darvoza qo‘yib bo‘lmaydi');
  if (!road.userPlaced && isLockedRoadCell(c.x, c.z)) return fail('Kirish yo‘liga darvoza qo‘yib bo‘lmaydi');
  for (const p of cells) {
    if (p.x === c.x && p.z === c.z) continue;
    const o = ctx.objAt(p.x, p.z);
    if (o?.type === 'road') return fail('Yo‘l darvoza bo‘ylab ketgan — darvozani aylantiring (R)');
    if (o) return fail('Darvoza ustunlari uchun joy band');
    if (isWater(p.x, p.z)) return fail('Suv ustiga qurib bo‘lmaydi');
    if (terrainBlocksBuild(p.x, p.z)) return fail(STEEP_REASON);
  }
  for (const p of pockets) {
    const o = ctx.objAt(p.x, p.z);
    if (o && !isWallPiece(o.type)) return fail('Qanotlar ochilishi uchun yon tomonlarda 2 katakdan bo‘sh joy (yoki devor) kerak');
  }
  if (ctx.money < cost) return fail('Mablag‘ yetarli emas');
  return { ok: true, reason: 'Darvoza qurish mumkin', cost, roadId: road.id };
}

// ---------------- darvoza holat mashinasi ----------------

export interface GateCtx {
  /** O‘tish joyida dinozavr tanasi bor */
  busyDino: boolean;
  /** Xavf radiusida dinozavr bor */
  danger: boolean;
  /** Ruxsat etilgan transport yaqinlashib, ochilishni so‘ramoqda (faqat avtomatik rejimda hisobga olinadi) */
  request: boolean;
  /** Transport tanasi (avtobusning orqa qismi ham) o‘tish joyida */
  busyVehicle: boolean;
}

export interface GateEvents {
  waitStart: boolean;
  opened: boolean;
  closed: boolean;
}

/**
 * Bir qadam (o‘yin vaqti): avtomatika va ochilish/yopilish. Bir-biriga zid buyruqlar animatsiyani buzmaydi — faqat
 * yo‘nalish o‘zgaradi. Avtomatik rejim: transport so‘rasa va dinozavr xavf hududida bo‘lmasa ochadi, o‘tish joyi
 * bo‘shagach yopadi. Dinozavr uchun hech qachon ochilmaydi. Qo‘lda yopilgan darvozani transport ochmaydi.
 */
export function stepGate(s: GateState, dt: number, ctx: GateCtx): GateEvents {
  const R = DEFENSE_CONFIG.gateRun;
  const ev: GateEvents = { waitStart: false, opened: false, closed: false };
  const was = s.open;
  s.car = null; // eski saqlashdagi soxta mashina — endi haqiqiy transport o‘tadi
  if (s.mode === 'auto') {
    if (ctx.request && !ctx.danger) s.want = 'open';
    else if (!ctx.busyVehicle && !ctx.busyDino) s.want = 'closed';
  }
  const busy = ctx.busyDino || ctx.busyVehicle;
  if (s.want === 'open') {
    s.waiting = false;
    s.open = Math.min(1, s.open + dt / R.openSeconds);
  } else if (s.open > 0) {
    // o‘tish joyida kimdir bo‘lsa ustiga yopilmaydi — kutadi
    if (busy) { if (!s.waiting) ev.waitStart = true; s.waiting = true; }
    else { s.waiting = false; s.open = Math.max(0, s.open - dt / R.openSeconds); }
  } else s.waiting = false;
  if (was < 1 && s.open >= 1) ev.opened = true;
  if (was > 0 && s.open <= 0) ev.closed = true;
  return ev;
}

// ---------------- himoyalangan hudud ----------------

export type DefenseStatus = 'none' | 'empty' | 'closed' | 'gap' | 'gateOpen' | 'construction';

export const DEFENSE_STATUS_TEXT: Record<DefenseStatus, string> = {
  none: 'Himoya qurilmagan',
  empty: 'Himoya qilinadigan bino yo‘q',
  closed: 'Chegara yopilgan',
  gap: 'Chegarada ochiq joy bor',
  gateOpen: 'Darvoza ochiq',
  construction: 'Qurilish tugallanmagan',
};

export interface DefenseEval {
  status: DefenseStatus;
  /** Tayyor devor/burchak kataklari */
  wallBuilt: number;
  gates: number;
  gatesOpen: number;
  constructing: number;
  protectedIds: string[];
  exposedIds: string[];
  /** Ochiq joy (kamerani olib borish uchun) */
  gap: Cell | null;
  /** Himoyalangan hudud (darvozalar yopiq holatda tashqaridan yetib bo‘lmaydigan, shahar binolari turgan joy) — faqat xarita ichida */
  insideCells: Cell[];
  /** Himoyalangan hududdagi katakmi (dinozavr ichkarida qolganini aniqlash uchun) */
  inside: (x: number, z: number) => boolean;
}

const LW = LAND_MAX - LAND_MIN + 1;
const lidx = (x: number, z: number) => (z - LAND_MIN) * LW + (x - LAND_MIN);

/** Shahar obyekti (himoya qilinadigan): yo‘l, bezak va himoya qismlaridan tashqari */
export function isCityObject(o: PlacedObject): boolean {
  return o.type !== 'road' && !isDefense(o.type) && CATALOG[o.type].kind !== 'decor';
}

/**
 * Tashqi chegaradan (xarita atrofidagi tabiat cheti) dinozavr yura oladigan kataklar bo‘ylab to‘ldirish.
 * mode: 'actual' — hozirgi holat; 'gatesClosed' — darvozalar yopiq deb; 'planned' — qurilayotganlar ham tayyor va darvozalar yopiq.
 * terrainOk — dinozavr navigatsiyasida o‘tib bo‘ladigan relyef (suv/tik tog‘ faqat haqiqatan to‘siq bo‘lsa to‘siq).
 */
/** Relyef niqobi (1 — dinozavr yura oladi), bir marta hisoblanadi va keshlanadi */
export function terrainPassMask(terrainOk: (x: number, z: number) => boolean): Uint8Array {
  const m = new Uint8Array(LW * LW);
  for (let z = LAND_MIN; z <= LAND_MAX; z++) for (let x = LAND_MIN; x <= LAND_MAX; x++) if (terrainOk(x, z)) m[lidx(x, z)] = 1;
  return m;
}

function objectGrid(objects: PlacedObject[]): (PlacedObject | undefined)[] {
  const g: (PlacedObject | undefined)[] = new Array(LW * LW);
  for (const o of objects) for (const c of footprintCells(o.type, o.gridX, o.gridZ, o.rotation)) {
    if (c.x < LAND_MIN || c.z < LAND_MIN || c.x > LAND_MAX || c.z > LAND_MAX) continue;
    g[lidx(c.x, c.z)] = o;
  }
  return g;
}

function flood(grid: (PlacedObject | undefined)[], tmask: Uint8Array, mode: 'actual' | 'gatesClosed' | 'planned') {
  const pass = new Uint8Array(LW * LW);
  for (let k = 0; k < LW * LW; k++) {
    if (!tmask[k]) continue;
    const o = grid[k];
    let ok = true;
    if (o && o.type !== 'road') {
      // buzilgan qism — ochiq joy (ta’mirlanguncha)
      if (isDefense(o.type) && (o.damage ?? 0) >= 1 && !o.build) ok = true;
      else if (isWallPiece(o.type)) ok = !!o.build && mode !== 'planned';
      else if (o.type === 'himoya_darvoza') ok = o.build ? mode !== 'planned' : mode === 'actual' && gateNavOpen(o.gate);
      else ok = false;
    }
    if (ok) pass[k] = 1;
  }
  const reached = new Uint8Array(LW * LW);
  const parent = new Int32Array(LW * LW).fill(-1);
  const q = new Int32Array(LW * LW);
  let qh = 0, qt = 0;
  // tashqi chet: tabiat hududining eng chetki yuriladigan qatori (1 katak ichkarida — eng chekka katak dinozavr uchun to‘siq)
  for (let i = 0; i < LW; i++) for (const [x, z] of [[LAND_MIN + i, LAND_MIN + 1], [LAND_MIN + i, LAND_MAX - 1], [LAND_MIN + 1, LAND_MIN + i], [LAND_MAX - 1, LAND_MIN + i]]) {
    const k = lidx(x, z);
    if (pass[k] && !reached[k]) { reached[k] = 1; q[qt++] = k; }
  }
  while (qh < qt) {
    const k = q[qh++];
    const x = k % LW, z = (k - x) / LW;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const X = x + dx, Z = z + dz;
      if (X < 0 || Z < 0 || X >= LW || Z >= LW) continue;
      const n = Z * LW + X;
      if (!pass[n] || reached[n]) continue;
      reached[n] = 1;
      parent[n] = k;
      q[qt++] = n;
    }
  }
  return { pass, reached, parent };
}

function touched(o: PlacedObject, reached: Uint8Array): Cell | null {
  for (const c of footprintCells(o.type, o.gridX, o.gridZ, o.rotation)) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx, z = c.z + dz;
      if (x < LAND_MIN || z < LAND_MIN || x > LAND_MAX || z > LAND_MAX) continue;
      if (reached[lidx(x, z)]) return { x, z };
    }
  }
  return null;
}

/** Bino yonidan tashqariga olib boruvchi yo‘l bo‘ylab himoya qismi yonidagi birinchi katak — ochiq joy */
function leakPoint(start: Cell, parent: Int32Array, grid: (PlacedObject | undefined)[]): Cell {
  let k = lidx(start.x, start.z);
  const near = (x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Z = z + dz;
      if (X < LAND_MIN || Z < LAND_MIN || X > LAND_MAX || Z > LAND_MAX) continue;
      const o = grid[lidx(X, Z)];
      if (o && isDefense(o.type)) return true;
    }
    return false;
  };
  let steps = 0;
  while (k >= 0 && steps++ < 4000) {
    const x = (k % LW) + LAND_MIN, z = Math.floor(k / LW) + LAND_MIN;
    if (near(x, z)) return { x, z };
    k = parent[k];
  }
  return start;
}

export function evaluateDefense(objects: PlacedObject[], tmask: Uint8Array): DefenseEval {
  let wallBuilt = 0, gates = 0, gatesOpen = 0, constructing = 0, anyDefense = false;
  const city: PlacedObject[] = [];
  for (const o of objects) {
    if (isDefense(o.type)) {
      anyDefense = true;
      if (o.build) constructing++;
      else if (o.type === 'himoya_darvoza') { gates++; if (gateNavOpen(o.gate)) gatesOpen++; }
      else wallBuilt++;
    } else if (isCityObject(o)) city.push(o);
  }
  const base = { wallBuilt, gates, gatesOpen, constructing };
  if (!anyDefense) return { ...base, status: 'none', protectedIds: [], exposedIds: city.map((o) => o.id), gap: null, insideCells: [], inside: () => false };
  const grid = objectGrid(objects);
  const A = flood(grid, tmask, 'actual');
  const exposed: PlacedObject[] = [];
  const protectedIds: string[] = [];
  for (const o of city) {
    if (touched(o, A.reached)) exposed.push(o);
    else protectedIds.push(o.id);
  }
  const B = flood(grid, tmask, 'gatesClosed');
  // himoyalangan hudud: darvozalar yopiq holatda tashqaridan yetib bo‘lmaydigan va shahar binosiga tegib turgan yuriladigan kataklar
  const insideMask = new Uint8Array(LW * LW);
  const seeds: number[] = [];
  for (const o of city) {
    if (touched(o, B.reached)) continue;
    for (const c of footprintCells(o.type, o.gridX, o.gridZ, o.rotation)) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx, z = c.z + dz;
      if (x < LAND_MIN || z < LAND_MIN || x > LAND_MAX || z > LAND_MAX) continue;
      const k = lidx(x, z);
      if (B.pass[k] && !insideMask[k]) { insideMask[k] = 1; seeds.push(k); }
    }
  }
  while (seeds.length) {
    const k = seeds.pop()!;
    const x = k % LW, z = (k - x) / LW;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Z = z + dz;
      if (X < 0 || Z < 0 || X >= LW || Z >= LW) continue;
      const n = Z * LW + X;
      if (B.pass[n] && !B.reached[n] && !insideMask[n]) { insideMask[n] = 1; seeds.push(n); }
    }
  }
  const insideCells: Cell[] = [];
  for (let z = MAP_MIN; z <= MAP_MAX; z++) for (let x = MAP_MIN; x <= MAP_MAX; x++) if (insideMask[lidx(x, z)]) insideCells.push({ x, z });
  const inside = (x: number, z: number) => {
    const X = Math.floor(x), Z = Math.floor(z);
    return X >= LAND_MIN && Z >= LAND_MIN && X <= LAND_MAX && Z <= LAND_MAX && insideMask[lidx(X, Z)] === 1;
  };
  let status: DefenseStatus;
  let gap: Cell | null = null;
  if (!city.length) status = 'empty';
  else if (!exposed.length) status = 'closed';
  else {
    const exposedB = city.filter((o) => touched(o, B.reached));
    if (!exposedB.length) {
      status = 'gateOpen';
      const g = objects.find((o) => o.type === 'himoya_darvoza' && !o.build && gateNavOpen(o.gate));
      gap = g ? gateCenter(g) : null;
    } else {
      const C = flood(grid, tmask, 'planned');
      const exposedC = city.filter((o) => touched(o, C.reached));
      if (!exposedC.length) { status = 'construction'; const t = touched(exposedB[0], B.reached)!; gap = leakPoint(t, B.parent, grid); }
      else { status = 'gap'; const t = touched(exposedC[0], C.reached)!; gap = leakPoint(t, C.parent, grid); }
    }
  }
  return { ...base, status, protectedIds, exposedIds: exposed.map((o) => o.id), gap, insideCells, inside };
}
