import { CATALOG } from './catalog';
import type { PlacedObject, Rotation, ObjectType } from './types';

/**
 * Xarita o‘lchami — YAGONA konfiguratsiya (boshqa fayllar faqat shu yerdan olingan qiymatlarni ishlatadi).
 * Sahnada 1 katak = 1 birlik. Asl 40×40 xarita (kataklar 0..39) joyida qoladi; kengayish uning atrofiga har
 * tomonga `expand` katak qo‘shadi — eski koordinatalar o‘zgarmaydi, saqlashlarni ko‘chirish shart emas.
 */
export const MAP_CONFIG = {
  /** Asl (v0.14 gacha) xarita tomoni — 0..39 */
  coreSize: 40,
  /** Har tomonga qo‘shilgan katak: 40 + 2·20 = 80 (eni va bo‘yi 2 baravar, maydon 4 baravar) */
  expand: 20,
  /** Xarita atrofidagi qurilmaydigan tabiat yeri (tog‘lar, o‘tloq) */
  landMargin: 90,
} as const;

/** Qurish mumkin bo‘lgan xarita tomoni (katak) */
export const MAP_SIZE = MAP_CONFIG.coreSize + 2 * MAP_CONFIG.expand;
/** Xaritaning birinchi va oxirgi katagi (ikkala o‘q bo‘yicha): −20 … 59 */
export const MAP_MIN = -MAP_CONFIG.expand;
export const MAP_MAX = MAP_MIN + MAP_SIZE - 1;
/** Ko‘rinadigan yer chegarasi (xarita + atrofdagi tabiat) */
export const LAND_MIN = MAP_MIN - MAP_CONFIG.landMargin;
export const LAND_MAX = MAP_MAX + MAP_CONFIG.landMargin;
/** Dunyo koordinatasi = katak − WORLD_ORIGIN; asl xarita markazi dunyo (0,0) da qoladi */
export const WORLD_ORIGIN = MAP_CONFIG.coreSize / 2;
export const CELL_METERS = 10;

/** Xarita kirish katagi (chap chekka). BFS shu yerdan boshlanadi. */
export const ENTRY_CELL = { x: 0, z: 16 } as const;

/** Kirish yo‘li kataklari (daryo ustidagi ko‘prik) — buzilmaydi. */
export const LOCKED_ROAD_CELLS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: 16 },
  { x: 1, z: 16 },
];

function buildWaterMask(): Uint8Array {
  const m = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const set = (x: number, z: number) => {
    if (inBounds(x, z)) m[cellIndex(x, z)] = 1;
  };
  // Asl xaritaning chap chekkasidagi daryo/kanal (G001 dagi kabi) — eski shaharlar unga moslab qurilgan
  for (let z = 0; z < MAP_CONFIG.coreSize; z++) {
    set(0, z);
    set(1, z);
  }
  // Mahalla pastidagi hovuz
  for (let x = 2; x <= 4; x++) for (let z = 26; z <= 29; z++) set(x, z);
  set(5, 27);
  set(5, 28);
  // Kengayish hududidagi ko‘l
  for (let x = 22; x <= 25; x++) for (let z = 4; z <= 6; z++) set(x, z);
  set(23, 7);
  set(24, 7);
  return m;
}

/** Katak qurish mumkin bo‘lgan xarita ichidami */
export function inBounds(x: number, z: number): boolean {
  return x >= MAP_MIN && z >= MAP_MIN && x <= MAP_MAX && z <= MAP_MAX;
}

/** Xarita katagining tekis massivdagi indeksi (faqat inBounds kataklar uchun) */
export function cellIndex(x: number, z: number): number {
  return (z - MAP_MIN) * MAP_SIZE + (x - MAP_MIN);
}

const WATER = buildWaterMask();

/** Asl xaritadagi daryo, hovuz va ko‘l (doimiy, saqlashdan mustaqil) */
export function isCoreWater(x: number, z: number): boolean {
  return inBounds(x, z) && WATER[cellIndex(x, z)] === 1;
}

/** Tabiiy ko‘l/soylar (terrain.ts o‘rnatadi) */
let extraWater: ((x: number, z: number) => boolean) | null = null;
export function setExtraWater(f: ((x: number, z: number) => boolean) | null) {
  extraWater = f;
}

/** Har qanday suv: asl daryo/hovuzlar va tabiiy ko‘l/soylar — qurish, yo‘l va dinozavr uchun to‘siq */
export function isWater(x: number, z: number): boolean {
  return isCoreWater(x, z) || (extraWater !== null && extraWater(x, z));
}

export function isLockedRoadCell(x: number, z: number): boolean {
  return LOCKED_ROAD_CELLS.some((c) => c.x === x && c.z === z);
}

/** Rotation toq bo‘lsa eni va bo‘yi almashadi. */
export function footprintSize(type: ObjectType, rotation: Rotation): { w: number; d: number } {
  const c = CATALOG[type];
  return rotation % 2 === 0 ? { w: c.width, d: c.depth } : { w: c.depth, d: c.width };
}

export function footprintCells(type: ObjectType, gridX: number, gridZ: number, rotation: Rotation) {
  const { w, d } = footprintSize(type, rotation);
  const cells: { x: number; z: number }[] = [];
  for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) cells.push({ x: gridX + dx, z: gridZ + dz });
  return cells;
}

/** Footprint markazi (katak koordinatalarida, masalan 2×2 uy (4,4) da → (5,5)). */
export function footprintCenter(o: Pick<PlacedObject, 'type' | 'gridX' | 'gridZ' | 'rotation'>) {
  const { w, d } = footprintSize(o.type, o.rotation);
  return { x: o.gridX + w / 2, z: o.gridZ + d / 2 };
}

/** Footprint atrofidagi 4-qo‘shni perimetr kataklari (diagonal emas). */
export function perimeterCells(o: Pick<PlacedObject, 'type' | 'gridX' | 'gridZ' | 'rotation'>) {
  const { w, d } = footprintSize(o.type, o.rotation);
  const cells: { x: number; z: number }[] = [];
  for (let dx = 0; dx < w; dx++) {
    cells.push({ x: o.gridX + dx, z: o.gridZ - 1 });
    cells.push({ x: o.gridX + dx, z: o.gridZ + d });
  }
  for (let dz = 0; dz < d; dz++) {
    cells.push({ x: o.gridX - 1, z: o.gridZ + dz });
    cells.push({ x: o.gridX + w, z: o.gridZ + dz });
  }
  return cells.filter((c) => inBounds(c.x, c.z));
}

export function distance(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Occupancy — geometriyadan mustaqil: har katakda qaysi obyekt id si turibdi. */
export class Occupancy {
  private cells = new Map<string, string | null>();

  static from(objects: Iterable<PlacedObject>): Occupancy {
    const occ = new Occupancy();
    for (const o of objects) occ.add(o);
    return occ;
  }

  private key(x: number, z: number) {
    return `${x}:${z}`;
  }

  get(x: number, z: number): string | null {
    return this.cells.get(this.key(x, z)) ?? null;
  }

  add(o: PlacedObject) {
    for (const c of footprintCells(o.type, o.gridX, o.gridZ, o.rotation)) this.cells.set(this.key(c.x, c.z), o.id);
  }

  remove(o: PlacedObject) {
    for (const c of footprintCells(o.type, o.gridX, o.gridZ, o.rotation)) {
      if (this.cells.get(this.key(c.x, c.z)) === o.id) this.cells.delete(this.key(c.x, c.z));
    }
  }
}
