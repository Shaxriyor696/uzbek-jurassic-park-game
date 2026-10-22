import { CATALOG } from './catalog';
import { footprintCells, inBounds, isWater, type Occupancy } from './grid';
import { STEEP_REASON, terrainBlocksBuild, terrainFordable } from './terrain';
import type { ObjectType, Rotation } from './types';

export const OUT_OF_MAP_REASON = 'Xarita chegarasidan tashqariga qurib bo‘lmaydi';

export interface PlacementResult {
  ok: boolean;
  /** O‘zbekcha sabab (yaroqsiz bo‘lsa) */
  reason: string;
  cost: number;
}

export function validatePlacement(
  type: ObjectType,
  gridX: number,
  gridZ: number,
  rotation: Rotation,
  occ: Occupancy,
  money: number,
): PlacementResult {
  const c = CATALOG[type];
  const cells = footprintCells(type, gridX, gridZ, rotation);
  if (cells.some((p) => !inBounds(p.x, p.z))) return { ok: false, reason: OUT_OF_MAP_REASON, cost: c.price };
  if (cells.some((p) => isWater(p.x, p.z))) return { ok: false, reason: 'Suv ustiga qurib bo‘lmaydi', cost: c.price };
  if (cells.some((p) => terrainBlocksBuild(p.x, p.z))) return { ok: false, reason: STEEP_REASON, cost: c.price };
  if (cells.some((p) => occ.get(p.x, p.z) !== null)) return { ok: false, reason: 'Bu joy band', cost: c.price };
  if (money < c.price) return { ok: false, reason: 'Mablag‘ yetarli emas', cost: c.price };
  return { ok: true, reason: 'Qurish mumkin', cost: c.price };
}

export interface RoadPathResult {
  ok: boolean;
  reason: string;
  /** Faqat yangi kataklar (mavjud yo‘l qayta narxlanmaydi) */
  newCells: { x: number; z: number }[];
  cost: number;
}

/** Ko‘prikning suv ustidagi har bir katagi narxi (quruqlikdagi qismi — oddiy yo‘l narxida). */
export const BRIDGE_PRICE = 300;

export function validateRoadPath(
  path: { x: number; z: number }[],
  occ: Occupancy,
  isRoadAt: (x: number, z: number) => boolean,
  money: number,
  bridge = false,
): RoadPathResult {
  const price = CATALOG.road.price;
  const newCells: { x: number; z: number }[] = [];
  let cost = 0;
  let water = 0;
  for (const p of path) {
    if (isRoadAt(p.x, p.z)) continue;
    if (!inBounds(p.x, p.z)) return { ok: false, reason: OUT_OF_MAP_REASON, newCells: [], cost: 0 };
    const wet = isWater(p.x, p.z);
    // sayoz irmoq ustidan yo‘l (ko‘prikcha) o‘tadi; ko‘l va asl daryo ustidan — faqat «Ko‘prik» bilan
    if (wet && !bridge && !terrainFordable(p.x, p.z)) return { ok: false, reason: 'Suv ustiga yo‘l qurib bo‘lmaydi — «Ko‘prik» kartasini tanlang', newCells: [], cost: 0 };
    if (!wet && terrainBlocksBuild(p.x, p.z)) return { ok: false, reason: STEEP_REASON, newCells: [], cost: 0 };
    if (occ.get(p.x, p.z) !== null) return { ok: false, reason: 'Yo‘l bino ustidan o‘tolmaydi', newCells: [], cost: 0 };
    newCells.push(p);
    if (wet && bridge) water++;
    cost += wet && bridge ? BRIDGE_PRICE : price;
  }
  if (bridge && path.length > 1 && !path.every((p) => p.x === path[0].x) && !path.every((p) => p.z === path[0].z)) {
    return { ok: false, reason: 'Ko‘prik to‘g‘ri chiziqda bo‘lishi kerak', newCells: [], cost: 0 };
  }
  if (newCells.length === 0) return { ok: false, reason: bridge ? 'Bu yerda ko‘prik allaqachon bor' : 'Bu yerda yo‘l allaqachon bor', newCells, cost };
  if (bridge && water === 0) return { ok: false, reason: 'Ko‘prik suv ustidan o‘tishi kerak — qirg‘oqdan qirg‘oqqa torting', newCells, cost };
  if (money < cost) return { ok: false, reason: 'Mablag‘ yetarli emas', newCells, cost };
  return { ok: true, reason: bridge ? `Ko‘prik: ${water} ta suv katagi` : `${newCells.length} ta yangi katak`, newCells, cost };
}
