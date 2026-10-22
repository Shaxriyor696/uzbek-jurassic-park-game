import { inBounds, isCoreWater, isWater, LAND_MAX, LAND_MIN, MAP_CONFIG, MAP_MAX, MAP_MIN, MAP_SIZE, setExtraWater } from './grid';

/**
 * Tog‘lar — doimiy tabiiy relyef (obyekt emas: narxi yo‘q, qurilmaydi, buzilmaydi). Balandlik bitta funksiyadan
 * (heightAt) olinadi: sahnadagi mesh ham, qurilish/dinozavr to‘siqlari ham shu funksiyadan — ko‘rinish va
 * collision bir xil. Tog‘lar joylashuvi seed + saqlangan ro‘yxat bilan qat’iy: qayta yuklashda siljimaydi.
 */
export const TERRAIN_VERSION = 2;

export type MountainKind = 'rocky' | 'pine' | 'snowy' | 'valley';
export const MOUNTAIN_KINDS: MountainKind[] = ['rocky', 'pine', 'snowy', 'valley'];

export interface Mountain {
  kind: MountainKind;
  /** Markaz (katak koordinatalarida, uzluksiz) */
  x: number;
  z: number;
  /** Ellips radiuslari (katak) — undan tashqarida balandlik aynan 0 */
  rx: number;
  rz: number;
  /** Burilish (radian) */
  rot: number;
  /** Eng baland nuqta (birlik; 1 katak = 1 birlik) */
  h: number;
  seed: number;
}

/**
 * Tabiiy suv havzasi — doiralar zanjiri (ko‘l: bir nechta katta doira; soy: ingichka doiralar). Chegarasi
 * shovqin bilan notekis. Katak suv hisoblanadi, agar uning biror nuqtasi suv ichida bo‘lsa (ko‘rinish bilan bir xil).
 */
export interface WaterBody {
  kind: 'lake' | 'river';
  pts: { x: number; z: number; r: number }[];
  seed: number;
}

/**
 * Asl xaritadagi suvlarning tabiiy shakli (faqat ko‘rinish): qurilish to‘sig‘i o‘sha asl kataklar (grid.ts) bo‘lib
 * qoladi — mavjud binolar va kirish ko‘prigi joyida. Shakl kataklar ichida chizilgan, egri-bugri qirg‘oq bilan.
 */
export const CORE_WATER_BODIES: WaterBody[] = [
  // chap chekkadagi daryo (x 0..1): ikki katak eni bo‘ylab ilonizi oqim
  { kind: 'river', seed: 101, pts: Array.from({ length: 21 }, (_, i) => ({ x: 1 + Math.sin(i * 0.9) * 0.12, z: i * 2, r: 0.92 + Math.sin(i * 1.7) * 0.05 })) },
  // mahalla pastidagi hovuz (daryoga qo‘shilgan)
  { kind: 'lake', seed: 102, pts: [{ x: 1.4, z: 27.6, r: 0.9 }, { x: 3.1, z: 27.4, r: 1.55 }, { x: 4.0, z: 28.4, r: 1.45 }, { x: 5.3, z: 28.0, r: 0.85 }] },
  // kengayish hududidagi ko‘l
  { kind: 'lake', seed: 103, pts: [{ x: 23.2, z: 5.3, r: 1.45 }, { x: 24.7, z: 5.7, r: 1.4 }, { x: 24.0, z: 7.2, r: 0.85 }] },
];

export interface TerrainState {
  version: number;
  seed: number;
  /** Generatsiya paytidagi xarita tomoni — o‘lcham o‘zgarsa tog‘lar qayta joylanadi (bo‘sh joyga) */
  mapSize: number;
  mountains: Mountain[];
  /** 2-versiyadan: tabiiy ko‘l va soylar */
  waters: WaterBody[];
}

/** Shu balandlikdan baland katakka qurib bo‘lmaydi (ko‘rinadigan har qanday ko‘tarilish) */
export const BUILD_MAX_H = 0.04;
/** Dinozavr faqat tekis yoki juda yumshoq yerdan yuradi */
export const DINO_MAX_H = 0.15;
/** Xaritaning kamida shuncha ulushi tekis (qurish mumkin) qoladi */
export const MIN_FLAT_RATIO = 0.7;
export const STEEP_REASON = 'Bu joyning qiyaligi qurilish uchun mos emas';

// ---------------- shovqin (deterministik) ----------------

function hash(ix: number, iz: number, seed: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function vnoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, z: number, seed: number, oct: number) {
  let s = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, z * f, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

/** Silliq tabiat shovqini 0..1 (o‘rmon to‘dalari, rang) — deterministik */
export function natureNoise(x: number, z: number, seed: number) {
  return fbm(x, z, seed, 3);
}

/** Qirrali shovqin — tizma va cho‘qqilar */
function ridged(x: number, z: number, seed: number, oct: number) {
  let s = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x * f, z * f, seed + i * 17) * 2 - 1);
    s += n * n * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return s / norm;
}

// ---------------- bitta tog‘ shakli ----------------

/** Tog‘ning (px, pz) nuqtadagi balandligi; ellipsdan tashqarida 0. Etak silliq (hosilasi ham 0 ga tushadi). */
export function mountainHeight(m: Mountain, px: number, pz: number): number {
  const dx = px - m.x, dz = pz - m.z;
  const c = Math.cos(m.rot), s = Math.sin(m.rot);
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  const nu = u / m.rx, nv = v / m.rz;
  const d2 = nu * nu + nv * nv;
  if (d2 >= 1) return 0;
  // notekis etak: burchak bo‘yicha shovqin — tog‘ ellipsdan faqat kichrayadi (tirgaklar va qo‘ltiqlar), ellipsdan chiqmaydi
  const a = Math.atan2(nv, nu);
  const k = 0.74 + 0.26 * fbm(Math.cos(a) * 1.6 + 7, Math.sin(a) * 1.6 + 3, m.seed + 5, 3);
  const dd = Math.sqrt(d2) / k;
  if (dd >= 1) return 0;
  // tizma va cho‘qqilar shovqini biroz buralgan koordinatada — to‘g‘ri chiziqli takror bo‘lmasin
  const wu = u + 3 * (fbm(u * 0.05, v * 0.05, m.seed + 9, 2) - 0.5) * 4;
  const wv = v + 3 * (fbm(v * 0.05, u * 0.05, m.seed + 11, 2) - 0.5) * 4;
  const t = 1 - dd;
  const mask = t * t * (3 - 2 * t); // etak: yumshoq o‘tloq qiyaligi
  switch (m.kind) {
    case 'rocky':
      return m.h * Math.pow(mask, 1.2) * (0.36 + 0.84 * ridged(wu * 0.11, wv * 0.11, m.seed, 4));
    case 'snowy':
      return m.h * Math.pow(mask, 1.05) * (0.32 + 0.88 * ridged(wu * 0.09, wv * 0.09, m.seed, 5));
    case 'pine':
      return m.h * Math.pow(mask, 1.4) * (0.62 + 0.6 * fbm(wu * 0.08, wv * 0.08, m.seed, 4));
    case 'valley': {
      // ikki parallel tizma, o‘rtasida egri-bugri soy (vodiy)
      const w = nv + 0.12 * Math.sin(nu * 4.2 + m.seed);
      const g = Math.exp(-(((Math.abs(w) - 0.45) / 0.24) ** 2));
      return m.h * Math.pow(mask, 1.1) * (0.1 + 0.9 * g) * (0.66 + 0.5 * ridged(wu * 0.1, wv * 0.1, m.seed, 4));
    }
  }
}

/** Qor chizig‘i (tog‘ balandligiga nisbatan); undan yuqorida qor */
export function snowLine(m: Mountain) {
  return m.kind === 'snowy' ? m.h * 0.52 : m.kind === 'rocky' ? m.h * 0.8 : m.kind === 'valley' ? m.h * 0.86 : Infinity;
}

/** Suv havzasi ichida musbat (chuqurlik ~ chegaradan masofa), tashqarida manfiy (qirg‘oqqacha masofa). */
export function waterDepth(b: WaterBody, px: number, pz: number): number {
  let d = -Infinity;
  const p = b.pts;
  if (p.length === 1) d = p[0].r - Math.hypot(px - p[0].x, pz - p[0].z);
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i], c = p[i + 1];
    const vx = c.x - a.x, vz = c.z - a.z;
    const L2 = vx * vx + vz * vz || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (pz - a.z) * vz) / L2));
    const r = a.r + (c.r - a.r) * t;
    const v = r - Math.hypot(px - (a.x + vx * t), pz - (a.z + vz * t));
    if (v > d) d = v;
  }
  // notekis tabiiy qirg‘oq
  return d + 0.34 * (fbm(px * 0.55, pz * 0.55, b.seed, 2) - 0.5);
}

export function waterBox(b: WaterBody, pad = 0) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of b.pts) {
    x0 = Math.min(x0, q.x - q.r); x1 = Math.max(x1, q.x + q.r);
    z0 = Math.min(z0, q.z - q.r); z1 = Math.max(z1, q.z + q.r);
  }
  return { x0: x0 - 0.5 - pad, x1: x1 + 0.5 + pad, z0: z0 - 0.5 - pad, z1: z1 + 0.5 + pad };
}

/** Katakning eng chuqur nuqtasi (4 burchak + markaz) */
function cellWaterDepth(b: WaterBody, x: number, z: number) {
  return Math.max(waterDepth(b, x + 0.5, z + 0.5), waterDepth(b, x + 0.02, z + 0.02), waterDepth(b, x + 0.98, z + 0.02), waterDepth(b, x + 0.02, z + 0.98), waterDepth(b, x + 0.98, z + 0.98));
}

/** Asl xarita va uning 2 katak atrofi — o‘yinchining asosiy qurilish yeri, irmoqlar uni kesib o‘tmaydi */
function inCoreArea(x: number, z: number) {
  return x >= -2 && z >= -2 && x <= MAP_CONFIG.coreSize + 1 && z <= MAP_CONFIG.coreSize + 1;
}

/** Katak tog‘ ellipsiga tegishi mumkinmi (markazi ellipsdan yarim diagonal + chetdan uzoq bo‘lmasa) */
function cellTouches(m: Mountain, x: number, z: number) {
  const dx = x + 0.5 - m.x, dz = z + 0.5 - m.z;
  const c = Math.cos(m.rot), s = Math.sin(m.rot);
  const u = Math.abs(dx * c + dz * s) - 0.71, v = Math.abs(-dx * s + dz * c) - 0.71;
  const nu = Math.max(0, u) / m.rx, nv = Math.max(0, v) / m.rz;
  return nu * nu + nv * nv < 1;
}

function bbox(m: Mountain) {
  const r = Math.max(m.rx, m.rz);
  return { x0: m.x - r, x1: m.x + r, z0: m.z - r, z1: m.z + r };
}

// ---------------- maydon (barcha tog‘lar) ----------------

const LAND_W = LAND_MAX - LAND_MIN + 1;
/** Katak balandliklari tog‘lar ro‘yxati bo‘yicha keshlanadi (generatsiya va o‘yin bitta ro‘yxatdan bir marta hisoblaydi) */
const heightCache = new WeakMap<Mountain[], { n: number; data: Float32Array }>();

export class TerrainField {
  private boxes: { x0: number; x1: number; z0: number; z1: number }[];
  /** Har katakning eng baland nuqtasi (3×3 namuna) — qurilish va dinozavr to‘siqlari */
  private cellMax: Float32Array;

  /** Tabiiy suv kataklari (ko‘l/soy): 1 — ko‘l, 2 — soy (dinozavr kechib o‘ta oladi) */
  private waterMask: Uint8Array;

  constructor(readonly state: TerrainState) {
    this.boxes = state.mountains.map(bbox);
    const cached = heightCache.get(state.mountains);
    this.cellMax = cached && cached.n === state.mountains.length ? cached.data : new Float32Array(LAND_W * LAND_W);
    this.waterMask = new Uint8Array(LAND_W * LAND_W);
    for (const b of state.waters ?? []) {
      const bb = waterBox(b);
      for (let z = Math.max(LAND_MIN, Math.floor(bb.z0)); z <= Math.min(LAND_MAX, Math.ceil(bb.z1)); z++) {
        for (let x = Math.max(LAND_MIN, Math.floor(bb.x0)); x <= Math.min(LAND_MAX, Math.ceil(bb.x1)); x++) {
          const k = (z - LAND_MIN) * LAND_W + (x - LAND_MIN);
          if (cellWaterDepth(b, x, z) > 0 && !isCoreWater(x, z)) this.waterMask[k] = b.kind === 'lake' ? 1 : this.waterMask[k] || 2;
        }
      }
    }
    if (cached && cached.n === state.mountains.length) return;
    heightCache.set(state.mountains, { n: state.mountains.length, data: this.cellMax });
    for (let i = 0; i < state.mountains.length; i++) {
      const b = this.boxes[i];
      for (let z = Math.max(LAND_MIN, Math.floor(b.z0)); z <= Math.min(LAND_MAX, Math.ceil(b.z1)); z++) {
        for (let x = Math.max(LAND_MIN, Math.floor(b.x0)); x <= Math.min(LAND_MAX, Math.ceil(b.x1)); x++) {
          // tog‘lar ustma-ust bo‘lsa balandlik — eng balandi, shuning uchun har tog‘ alohida max ga qo‘shiladi
          const m = state.mountains[i];
          if (!cellTouches(m, x, z)) continue;
          let mx = 0;
          for (let sz = 0; sz <= 2; sz++) for (let sx = 0; sx <= 2; sx++) mx = Math.max(mx, mountainHeight(m, x + sx * 0.5, z + sz * 0.5));
          const k = (z - LAND_MIN) * LAND_W + (x - LAND_MIN);
          if (mx > this.cellMax[k]) this.cellMax[k] = mx;
        }
      }
    }
  }

  /** Uzluksiz katak koordinatasidagi balandlik (katak (x,z) markazi — x+0.5, z+0.5). Tog‘lar ustma-ust — eng balandi. */
  heightAt(px: number, pz: number): number {
    let h = 0;
    const ms = this.state.mountains;
    for (let i = 0; i < ms.length; i++) {
      const b = this.boxes[i];
      if (px < b.x0 || px > b.x1 || pz < b.z0 || pz > b.z1) continue;
      const v = mountainHeight(ms[i], px, pz);
      if (v > h) h = v;
    }
    return h;
  }

  /** Nuqtada ustun tog‘ (rang/qor uchun) */
  dominant(px: number, pz: number): Mountain | null {
    let h = 0, best: Mountain | null = null;
    const ms = this.state.mountains;
    for (let i = 0; i < ms.length; i++) {
      const b = this.boxes[i];
      if (px < b.x0 || px > b.x1 || pz < b.z0 || pz > b.z1) continue;
      const v = mountainHeight(ms[i], px, pz);
      if (v > h) { h = v; best = ms[i]; }
    }
    return best;
  }

  cellHeight(x: number, z: number): number {
    if (x < LAND_MIN || z < LAND_MIN || x > LAND_MAX || z > LAND_MAX) return 0;
    return this.cellMax[(z - LAND_MIN) * LAND_W + (x - LAND_MIN)];
  }

  /** Tabiiy ko‘l/soy katagi */
  isWaterCell(x: number, z: number) {
    if (x < LAND_MIN || z < LAND_MIN || x > LAND_MAX || z > LAND_MAX) return false;
    return this.waterMask[(z - LAND_MIN) * LAND_W + (x - LAND_MIN)] > 0;
  }

  /** Sayoz soy katagi — dinozavr kechib o‘tadi (qurilish va yo‘l uchun baribir suv) */
  isFordCell(x: number, z: number) {
    if (x < LAND_MIN || z < LAND_MIN || x > LAND_MAX || z > LAND_MAX) return false;
    return this.waterMask[(z - LAND_MIN) * LAND_W + (x - LAND_MIN)] === 2;
  }

  /** Nuqtadagi eng katta suv chuqurligi (ko‘rinish uchun) */
  waterDepthAt(px: number, pz: number) {
    let d = -Infinity;
    for (const b of this.state.waters ?? []) d = Math.max(d, waterDepth(b, px, pz));
    for (const b of CORE_WATER_BODIES) d = Math.max(d, waterDepth(b, px, pz));
    return d;
  }

  blocksBuild(x: number, z: number) {
    return this.cellHeight(x, z) > BUILD_MAX_H;
  }

  blocksDino(x: number, z: number) {
    return this.cellHeight(x, z) > DINO_MAX_H;
  }

  /** Xaritaning tekis (qurish mumkin: tog‘ ham, yangi ko‘l/soy ham emas) ulushi */
  flatRatio(): number {
    let flat = 0;
    for (let z = MAP_MIN; z <= MAP_MAX; z++) for (let x = MAP_MIN; x <= MAP_MAX; x++) if (!this.blocksBuild(x, z) && !this.isWaterCell(x, z)) flat++;
    return flat / (MAP_SIZE * MAP_SIZE);
  }
}

// ---------------- faol relyef (qurilish/dinozavr tekshiruvlari uchun) ----------------

let ACTIVE: TerrainField | null = null;

export function setActiveTerrain(f: TerrainField | null) {
  ACTIVE = f;
}
// grid.ts isWater tabiiy ko‘l/soylarni ham biladi (qurilish, yo‘l, dinozavr — hammasi bir xil suv tekshiruvi)
setExtraWater((x, z) => !!ACTIVE && ACTIVE.isWaterCell(x, z));

/** Dinozavr shu suv katagidan kechib o‘ta oladimi (faqat sayoz soy) */
export function terrainFordable(x: number, z: number) {
  return !!ACTIVE && ACTIVE.isFordCell(x, z);
}

/** Bino footprint atrofida (2 katak ichida) tabiiy ko‘l/soy bormi — suv stansiyasi tabiiy manbadan oladi */
export function nearNaturalWater(cells: { x: number; z: number }[], reach = 2): boolean {
  if (!ACTIVE) return false;
  for (const c of cells) for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) if (ACTIVE.isWaterCell(c.x + dx, c.z + dz)) return true;
  return false;
}

export function activeTerrain(): TerrainField | null {
  return ACTIVE;
}

export function terrainBlocksBuild(x: number, z: number) {
  return !!ACTIVE && ACTIVE.blocksBuild(x, z);
}

export function terrainBlocksDino(x: number, z: number) {
  return !!ACTIVE && ACTIVE.blocksDino(x, z);
}

/** Dunyo nuqtasi ostidagi yer balandligi (katak koordinatasida) — kamera yer ichiga kirmasligi uchun */
export function groundHeight(px: number, pz: number) {
  return ACTIVE ? ACTIVE.heightAt(px, pz) : 0;
}

// ---------------- generatsiya ----------------

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shape(kind: MountainKind, r: () => number) {
  switch (kind) {
    case 'rocky': { const s = 11 + r() * 5; return { rx: s * (1 + r() * 0.35), rz: s, h: 11 + r() * 5 }; }
    case 'snowy': { const s = 14 + r() * 5; return { rx: s * (1 + r() * 0.3), rz: s, h: 18 + r() * 6 }; }
    case 'pine': { const s = 10 + r() * 5; return { rx: s * (1 + r() * 0.4), rz: s, h: 7 + r() * 4 }; }
    case 'valley': { const s = 10 + r() * 3; return { rx: s * (2.1 + r() * 0.5), rz: s, h: 9 + r() * 4 }; }
  }
}

/**
 * Tog‘larni xarita chekkalari bo‘ylab (asosan yangi qo‘shilgan hudud va undan tashqaridagi tabiat yerida) uch
 * qator qilib joylaydi, keyin tog‘lar orasiga va shaharga yaqin chekkaga ko‘l va tog‘dan tushadigan soylar qo‘yadi.
 * `keep(x, z)` true bo‘lgan katakka (bino, yo‘l, suv, dinozavr va uning marshruti, asl xarita) na tog‘ etagi, na
 * suv tushadi. Xaritaning kamida 70% tekis qoladi.
 */
export function generateTerrain(seed: number, hard: (x: number, z: number) => boolean, soft: (x: number, z: number) => boolean = () => false): TerrainState {
  const keep = (x: number, z: number) => hard(x, z) || soft(x, z);
  const r = rng(seed * 7919 + 13);
  const mountains: Mountain[] = [];
  const state: TerrainState = { version: TERRAIN_VERSION, seed, mapSize: MAP_SIZE, mountains, waters: [] };
  // 1) avval shaharga yaqin ko‘llar (yangi hudud chekkasida) — tog‘lar ularni chetlab joylashadi
  const water = waterTools(r, state, keep, hard);
  water.nearCity();
  const bag: MountainKind[] = [];
  const nextKind = () => {
    if (!bag.length) {
      bag.push(...MOUNTAIN_KINDS);
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    return bag.pop()!;
  };
  // shaharga yaqin ko‘llar atrofi (2.5 katak) — tog‘ etagi tushmaydi
  const wet = new Uint8Array(LAND_W * LAND_W);
  for (const w of state.waters) {
    const bb = waterBox(w, 3);
    for (let z = Math.max(LAND_MIN, Math.floor(bb.z0)); z <= Math.min(LAND_MAX, Math.ceil(bb.z1)); z++) {
      for (let x = Math.max(LAND_MIN, Math.floor(bb.x0)); x <= Math.min(LAND_MAX, Math.ceil(bb.x1)); x++) if (cellWaterDepth(w, x, z) > -2.5) wet[(z - LAND_MIN) * LAND_W + (x - LAND_MIN)] = 1;
    }
  }
  const fits = (m: Mountain) => {
    const b = bbox(m);
    if (b.x0 < LAND_MIN + 1 || b.z0 < LAND_MIN + 1 || b.x1 > LAND_MAX - 1 || b.z1 > LAND_MAX - 1) return false;
    for (const o of mountains) {
      if (Math.hypot(o.x - m.x, o.z - m.z) < 0.5 * (Math.max(o.rx, o.rz) + Math.min(m.rx, m.rz))) return false;
    }
    for (let z = Math.floor(b.z0); z <= Math.ceil(b.z1); z++) {
      for (let x = Math.floor(b.x0); x <= Math.ceil(b.x1); x++) {
        if (!cellTouches(m, x, z)) continue;
        const nearWater = x >= LAND_MIN && z >= LAND_MIN && x <= LAND_MAX && z <= LAND_MAX && wet[(z - LAND_MIN) * LAND_W + (x - LAND_MIN)] === 1;
        if (!keep(x, z) && !nearWater) continue;
        // katakning har qanday nuqtasi ellips ichida bo‘lsa — to‘siq
        for (let sz = 0; sz <= 2; sz++) for (let sx = 0; sx <= 2; sx++) if (mountainHeight(m, x + sx * 0.5, z + sz * 0.5) > 0) return false;
      }
    }
    return true;
  };
  // side 0 — shimol (z min), 1 — sharq (x max), 2 — janub (z max), 3 — g‘arb (x min). out — xarita chetidan tashqariga
  const at = (side: number, along: number, out: number) => {
    const edge = side === 0 ? MAP_MIN - out : side === 1 ? MAP_MAX + 1 + out : side === 2 ? MAP_MAX + 1 + out : MAP_MIN - out;
    return side === 0 || side === 2 ? { x: along, z: edge } : { x: edge, z: along };
  };
  type Ring = { out: () => number; step: number; tries: number; kind: () => MountainKind; size: number; hMul: number; gap: () => number; span: number };
  const rings: Ring[] = [
    // 1-qator: xarita chekkasi (etagi yangi hududga kiradi), 4 tur aralash
    { out: () => -6 + r() * 12, step: 3, tries: 14, kind: nextKind, size: 1, hMul: 1, gap: () => 0.9 + r() * 0.7, span: 14 },
    // 2-qator: tashqarida, balandroq
    { out: () => 16 + r() * 10, step: 3, tries: 8, kind: () => (r() < 0.3 ? 'pine' : r() < 0.6 ? 'snowy' : 'rocky'), size: 1.1, hMul: 1.15, gap: () => 1 + r() * 0.5, span: 30 },
    // 3-qator: ufqdagi katta qorli tizmalar
    { out: () => 42 + r() * 14, step: -3, tries: 8, kind: () => (r() < 0.65 ? 'snowy' : 'rocky'), size: 1.45, hMul: 1.35, gap: () => 1 + r() * 0.4, span: 60 },
  ];
  for (const ring of rings) {
    for (let side = 0; side < 4; side++) {
      let t = MAP_MIN - ring.span + r() * 8;
      while (t < MAP_MAX + ring.span) {
        const kind = ring.kind();
        const sh = shape(kind, r);
        sh.rx *= ring.size; sh.rz *= ring.size; sh.h *= ring.hMul;
        const rot = (side % 2 === 0 ? 0 : Math.PI / 2) + (r() - 0.5) * 1.0;
        let placed: Mountain | null = null;
        let out = ring.out();
        for (let k = 0; k < ring.tries && !placed; k++, out += ring.step) {
          const p = at(side, t, out);
          const m: Mountain = { kind, x: p.x, z: p.z, rx: sh.rx, rz: sh.rz, rot, h: sh.h, seed: Math.floor(r() * 100000) };
          if (fits(m)) placed = m;
        }
        if (placed) mountains.push(placed);
        t += Math.max(sh.rx, sh.rz) * ring.gap() + r() * 5;
      }
    }
  }
  // kamida 70% tekis: xarita ichiga eng ko‘p kirgan tog‘dan boshlab olib tashlanadi
  for (;;) {
    const f = new TerrainField(state);
    if (f.flatRatio() >= MIN_FLAT_RATIO + 0.04 || !state.mountains.length) break;
    let worst = 0, wi = 0;
    state.mountains.forEach((m, i) => {
      const one = new TerrainField({ ...state, mountains: [m] });
      let n = 0;
      for (let z = MAP_MIN; z <= MAP_MAX; z++) for (let x = MAP_MIN; x <= MAP_MAX; x++) if (one.blocksBuild(x, z)) n++;
      if (n > worst) { worst = n; wi = i; }
    });
    state.mountains.splice(wi, 1);
  }
  // 2) tog‘lar orasida ko‘llar va tog‘ etagidan tushadigan soylar
  water.betweenMountains();
  // 3) asl daryo ikki uchidan tog‘ etagigacha davom etadi (tog‘ yonidan oqib keladi)
  water.connectCoreRiver();
  // 4) barcha ko‘llar irmoqlar bilan yagona suv tarmog‘iga bog‘lanadi
  water.connectAll();
  return state;
}

/** Ko‘llar (shaharga yaqin chekkada va tog‘lar orasida) va tog‘ etagidan tushib ko‘lga quyiladigan soylar. */
function waterTools(r: () => number, state: TerrainState, keep: (x: number, z: number) => boolean, hard: (x: number, z: number) => boolean) {
  const waters = state.waters;
  let field = new TerrainField(state);
  const valid = (b: WaterBody, except?: WaterBody) => {
    // tez saralash: doira markazlari to‘siqda bo‘lsa — to‘liq tekshiruvsiz rad
    for (const q of b.pts) {
      const x = Math.floor(q.x), z = Math.floor(q.z);
      if (isCoreWater(x, z) && b.kind === 'river') continue;
      if (b.kind === 'river' ? hard(x, z) : keep(x, z)) return false;
      if (b.kind === 'lake' && field.cellHeight(x, z) > BUILD_MAX_H) return false;
    }
    const bb = waterBox(b, 1.5);
    if (bb.x0 < LAND_MIN + 2 || bb.z0 < LAND_MIN + 2 || bb.x1 > LAND_MAX - 2 || bb.z1 > LAND_MAX - 2) return false;
    for (let z = Math.floor(bb.z0); z <= Math.ceil(bb.z1); z++) {
      for (let x = Math.floor(bb.x0); x <= Math.ceil(bb.x1); x++) {
        const d = cellWaterDepth(b, x, z);
        if (d <= -1.3) continue;
        // suv va qirg‘oq: hech narsa ustiga tushmaydi; suvning o‘zi tekis yerda. Soy (sayoz, dinozavr kechib o‘tadi)
        // faqat qat’iy to‘siqlarni (obyekt, kirish yo‘li) chetlaydi va asl daryoga qo‘shila oladi
        if (b.kind === 'river' ? isCoreWater(x, z) : false) continue;
        if ((b.kind === 'river' ? hard(x, z) : keep(x, z)) || isCoreWater(x, z)) return false;
        if (d > 0 && field.cellHeight(x, z) > BUILD_MAX_H) return false;
        // boshqa havzalardan kamida 3 katak
        for (const o of waters) if (o !== except && cellWaterDepth(o, x, z) > -3) return false;
        if (b.kind === 'lake') for (const o of CORE_WATER_BODIES) if (cellWaterDepth(o, x, z) > -3) return false;
      }
    }
    return true;
  };
  const lake = (cx: number, cz: number, big: number): WaterBody => {
    const pts = [{ x: cx, z: cz, r: (2 + r() * 2.2) * big }];
    let h = r() * Math.PI * 2;
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const prev = pts[pts.length - 1];
      h += (r() - 0.5) * 1.5;
      pts.push({ x: prev.x + Math.cos(h) * prev.r * 0.85, z: prev.z + Math.sin(h) * prev.r * 0.85, r: (1.5 + r() * 2.3) * big });
    }
    return { kind: 'lake', pts, seed: Math.floor(r() * 100000) };
  };
  /** Ko‘ldan eng yaqin tog‘ etagigacha ingichka egri soy (tog‘dan oqib tushgandek) */
  const stream = (b: WaterBody, dir?: { x: number; z: number }, maxLen = 30, maxDist = 40): WaterBody | null => {
    const end = b.pts[b.pts.length - 1];
    let best: Mountain | null = null, bd = maxDist;
    for (const m of state.mountains) {
      // dir berilgan bo‘lsa — faqat o‘sha tomondagi tog‘lar
      if (dir && (m.x - end.x) * dir.x + (m.z - end.z) * dir.z < 0.5 * Math.hypot(m.x - end.x, m.z - end.z)) continue;
      const d = Math.hypot(m.x - end.x, m.z - end.z) - Math.min(m.rx, m.rz);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return null;
    const pts = [{ x: end.x, z: end.z, r: Math.min(end.r, 1.1) }];
    let h = dir ? Math.atan2(dir.z, dir.x) : Math.atan2(best.z - end.z, best.x - end.x);
    for (let i = 0; i < maxLen; i++) {
      const p = pts[pts.length - 1];
      h += (r() - 0.5) * 0.7;
      const toM = Math.atan2(best.z - p.z, best.x - p.x);
      h += Math.atan2(Math.sin(toM - h), Math.cos(toM - h)) * 0.35; // tog‘ga qarab egiladi
      const q = { x: p.x + Math.cos(h) * 1.3, z: p.z + Math.sin(h) * 1.3, r: Math.max(0.6, p.r - 0.02) };
      // tog‘ etagiga yetdi: soy shu yerdan boshlanadi (tog‘ meshi uning uchini yopadi)
      if (field.cellHeight(Math.floor(q.x + Math.cos(h) * (q.r + 0.6)), Math.floor(q.z + Math.sin(h) * (q.r + 0.6))) > BUILD_MAX_H) {
        return pts.length >= 4 ? { kind: 'river', pts, seed: Math.floor(r() * 100000) } : null;
      }
      pts.push(q);
    }
    return null;
  };
  const tryAdd = (cx: number, cz: number, big: number) => {
    for (let k = 0; k < 3; k++) {
      const b = lake(cx, cz, big);
      if (!valid(b)) continue;
      waters.push(b);
      return b;
    }
    return null;
  };
  const addStream = (b: WaterBody) => {
    const s = stream(b);
    if (s && valid(s, b)) waters.push(s);
  };
  const nearLakes: WaterBody[] = [];
  return {
    /** Yangi hudud chekkasida (xarita chegarasi atrofida, qisman xarita ichida) — suv stansiyasi uchun manba */
    nearCity() {
      for (let i = 0; i < 900 && nearLakes.length < 6; i++) {
        const side = Math.floor(r() * 4), along = MAP_MIN + r() * MAP_SIZE, out = -9 + r() * 12;
        const edge = side === 0 || side === 3 ? MAP_MIN - out : MAP_MAX + 1 + out;
        const p = side % 2 === 0 ? { x: along, z: edge } : { x: edge, z: along };
        const b = tryAdd(p.x, p.z, 0.65 + r() * 0.45);
        // xarita ichiga hech bo‘lmasa bir necha suv katagi tushsin
        if (b) {
          let inside = 0;
          const bb = waterBox(b);
          for (let z = Math.floor(bb.z0); z <= Math.ceil(bb.z1); z++) for (let x = Math.floor(bb.x0); x <= Math.ceil(bb.x1); x++) if (inBounds(x, z) && cellWaterDepth(b, x, z) > 0) inside++;
          if (inside < 4) { waters.pop(); continue; }
          nearLakes.push(b);
        }
      }
    },
    /** Asl daryoning shimoliy va janubiy uchidan eng yaqin tog‘ etagigacha (yo‘lda obyekt bo‘lsa — qisqaroq urinish) */
    connectCoreRiver() {
      field = new TerrainField(state);
      const ends = [{ x: 1, z: 0, dir: { x: 0, z: -1 } }, { x: 1, z: 40, dir: { x: 0, z: 1 } }];
      for (const e of ends) {
        for (let k = 0; k < 8; k++) {
          const s = stream({ kind: 'river', seed: 0, pts: [{ x: e.x, z: e.z, r: 0.95 }] }, e.dir, 60, 90);
          if (s && valid(s)) { waters.push(s); break; }
        }
      }
    },
    /**
     * Irmoqlar: asl daryodan boshlab har safar tarmoqqa eng yaqin bog‘lanmagan ko‘lgacha eng qisqa yo‘l (BFS)
     * topiladi va egri-bugri soy bilan ulanadi. Yo‘l obyekt, kirish yo‘li, asl xarita yeri va tog‘ ustidan o‘tmaydi.
     */
    connectAll() {
      field = new TerrainField(state);
      const W = LAND_W, N = W * W;
      const idx = (x: number, z: number) => (z - LAND_MIN) * W + (x - LAND_MIN);
      const owner = new Int16Array(N).fill(-1); // qaysi havza (index) katagi
      const lakes = waters.map((w, i) => ({ w, i })).filter((q) => q.w.kind === 'lake');
      const cellsOf = (w: WaterBody) => {
        const out: number[] = [];
        const bb = waterBox(w);
        for (let z = Math.max(LAND_MIN, Math.floor(bb.z0)); z <= Math.min(LAND_MAX, Math.ceil(bb.z1)); z++) {
          for (let x = Math.max(LAND_MIN, Math.floor(bb.x0)); x <= Math.min(LAND_MAX, Math.ceil(bb.x1)); x++) if (cellWaterDepth(w, x, z) > 0) out.push(idx(x, z));
        }
        return out;
      };
      waters.forEach((w, i) => { for (const k of cellsOf(w)) owner[k] = i; });
      // o‘tish mumkin: 3×3 atrofi qat’iy to‘siq emas, tekis, asl xarita yerida emas (asl suv — maqsad sifatida mumkin)
      const pass = new Uint8Array(N);
      for (let z = LAND_MIN + 2; z <= LAND_MAX - 2; z++) {
        for (let x = LAND_MIN + 2; x <= LAND_MAX - 2; x++) {
          let ok = true;
          for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) {
            const X = x + dx, Z = z + dz;
            if (hard(X, Z) || field.cellHeight(X, Z) > BUILD_MAX_H) ok = false;
            else if (inCoreArea(X, Z) && !isCoreWater(X, Z) && owner[idx(X, Z)] < 0) ok = false;
          }
          if (ok) pass[idx(x, z)] = 1;
        }
      }
      const connected = new Uint8Array(N); // tarmoqqa ulangan suv kataklari
      const linked = new Set<number>(); // ulangan havzalar
      const mark = (i: number) => { linked.add(i); for (const k of cellsOf(waters[i])) connected[k] = 1; };
      for (let z = 0; z <= 41; z++) for (let x = -1; x <= 41; x++) if (isCoreWater(x, z)) connected[idx(x, z)] = 1;
      waters.forEach((w, i) => { if (w.kind === 'river') {
        // asl daryodan boshlangan soylar tarmoqda
        const p = w.pts[0];
        if (isCoreWater(Math.floor(p.x), Math.floor(p.z)) || isCoreWater(Math.floor(p.x), Math.floor(p.z) + 1) || isCoreWater(Math.floor(p.x), Math.floor(p.z) - 1)) mark(i);
      } });
      const prev = new Int32Array(N);
      for (let iter = 0; iter < lakes.length * 2; iter++) {
        // tarmoqdan ko‘p manbali BFS
        prev.fill(-2);
        let queue: number[] = [];
        for (let k = 0; k < N; k++) if (connected[k]) { prev[k] = -1; queue.push(k); }
        let hit = -1, depth = 0;
        while (queue.length && hit < 0 && depth < 70) {
          const next: number[] = [];
          for (const k of queue) {
            const x = (k % W) + LAND_MIN, z = Math.floor(k / W) + LAND_MIN;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const X = x + dx, Z = z + dz;
              if (X < LAND_MIN || Z < LAND_MIN || X > LAND_MAX || Z > LAND_MAX) continue;
              const n = idx(X, Z);
              if (prev[n] !== -2) continue;
              const o = owner[n];
              if (o >= 0 && waters[o].kind === 'lake' && !linked.has(o)) { prev[n] = k; hit = n; break; }
              if (!pass[n]) continue;
              prev[n] = k;
              next.push(n);
            }
            if (hit >= 0) break;
          }
          queue = next;
          depth++;
        }
        if (hit < 0) {
          // tarmoqqa yetib bo‘lmaydi (tog‘lar o‘rab olgan) — eng katta bog‘lanmagan ko‘l yangi tarmoq boshi bo‘ladi,
          // qolganlari unga ulanadi (har bir ko‘l hech bo‘lmasa qo‘shnisi bilan bog‘langan)
          const rest = lakes.filter((q) => !linked.has(q.i));
          if (!rest.length) break;
          mark(rest[0].i);
          continue;
        }
        const target = owner[hit];
        // yo‘l: ko‘ldan tarmoqqacha kataklar
        const cells: { x: number; z: number }[] = [];
        for (let k = hit; k >= 0 && prev[k] !== -1; k = prev[k]) cells.push({ x: (k % W) + LAND_MIN + 0.5, z: Math.floor(k / W) + LAND_MIN + 0.5 });
        mark(target);
        if (cells.length < 2) continue;
        // silliq egri: har 2-katak, Chaikin bilan yumshatiladi, kichik ilonizi
        let pts = cells.filter((_, i) => i % 2 === 0 || i === cells.length - 1);
        for (let s = 0; s < 2; s++) {
          const out = [pts[0]];
          for (let i = 0; i + 1 < pts.length; i++) {
            const a = pts[i], b = pts[i + 1];
            out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
          }
          out.push(pts[pts.length - 1]);
          pts = out;
        }
        const seed = Math.floor(r() * 100000);
        const river: WaterBody = { kind: 'river', seed, pts: pts.map((p, i) => ({ x: p.x + Math.sin(i * 0.7 + seed) * 0.12, z: p.z + Math.cos(i * 0.6 + seed) * 0.12, r: 0.62 + Math.sin(i * 0.4) * 0.06 })) };
        waters.push(river);
        for (const k of cellsOf(river)) { connected[k] = 1; if (owner[k] < 0) owner[k] = waters.length - 1; }
      }
    },
    /** Tog‘lar orasidagi tekis joylar, tashqi tabiat yeri; ko‘llarning ko‘piga tog‘dan soy */
    betweenMountains() {
      field = new TerrainField(state);
      for (const b of nearLakes) if (r() < 0.6) addStream(b);
      const ms = state.mountains;
      let between = 0;
      const pairs: [Mountain, Mountain][] = [];
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
        const d = Math.hypot(ms[i].x - ms[j].x, ms[i].z - ms[j].z);
        if (d < (Math.max(ms[i].rx, ms[i].rz) + Math.max(ms[j].rx, ms[j].rz)) * 1.5) pairs.push([ms[i], ms[j]]);
      }
      for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
      for (const [a, b] of pairs) {
        if (between >= 12) break;
        const t = 0.4 + r() * 0.2;
        const w = tryAdd(a.x + (b.x - a.x) * t + (r() - 0.5) * 6, a.z + (b.z - a.z) * t + (r() - 0.5) * 6, 0.9 + r() * 0.5);
        if (w) { between++; if (r() < 0.8) addStream(w); }
      }
      for (let i = 0; i < 300 && between < 18; i++) {
        const x = LAND_MIN + 6 + r() * (LAND_MAX - LAND_MIN - 12), z = LAND_MIN + 6 + r() * (LAND_MAX - LAND_MIN - 12);
        if (inBounds(Math.floor(x), Math.floor(z))) continue;
        const w = tryAdd(x, z, 1 + r() * 0.6);
        if (w) { between++; if (r() < 0.7) addStream(w); }
      }
    },
  };
}

/** Saqlangan relyef yaroqlimi (raqamlar to‘g‘ri, versiya va xarita o‘lchami joriy) */
export function isTerrainState(v: unknown): v is TerrainState {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  if (typeof t.version !== 'number' || typeof t.seed !== 'number' || typeof t.mapSize !== 'number' || !Array.isArray(t.mountains)) return false;
  if (t.waters !== undefined && !(Array.isArray(t.waters) && t.waters.every((w: Record<string, unknown>) => w && (w.kind === 'lake' || w.kind === 'river') && typeof w.seed === 'number'
    && Array.isArray(w.pts) && w.pts.length > 0 && (w.pts as Record<string, unknown>[]).every((q) => q && [q.x, q.z, q.r].every((v) => typeof v === 'number' && Number.isFinite(v)) && (q.r as number) > 0)))) return false;
  return t.mountains.every((m: Record<string, unknown>) => m && MOUNTAIN_KINDS.includes(m.kind as MountainKind)
    && ['x', 'z', 'rx', 'rz', 'rot', 'h', 'seed'].every((k) => typeof m[k] === 'number' && Number.isFinite(m[k] as number))
    && (m.rx as number) > 0 && (m.rz as number) > 0 && (m.h as number) > 0);
}

/** Saqlangan relyef joriy versiya va xarita o‘lchamiga mosmi (aks holda bo‘sh joyga qayta generatsiya) */
export function terrainCurrent(t: TerrainState) {
  return t.version === TERRAIN_VERSION && t.mapSize === MAP_SIZE && Array.isArray(t.waters);
}

/** Katak xaritada, suv emas va relyef tekis — umumiy yordamchi */
export function flatLand(x: number, z: number) {
  return inBounds(x, z) && !isWater(x, z) && !terrainBlocksBuild(x, z);
}
