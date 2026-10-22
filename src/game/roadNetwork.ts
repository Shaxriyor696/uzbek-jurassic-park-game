import { ENTRY_CELL } from './grid';
import type { PlacedObject } from './types';

/** Bitmask: N=1 (z-1), E=2 (x+1), S=4 (z+1), W=8 (x-1) */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export type RoadShape = 'isolated' | 'end' | 'straight' | 'corner' | 't' | 'cross';

export interface RoadPiece {
  shape: RoadShape;
  /** Y o‘qi atrofida 90° qadamlar soni (kanonik shakldan) */
  rotation: number;
}

/**
 * Kanonik shakllar (rotation=0):
 *  end: faqat S tomonga ochiq; straight: N+S; corner: N+E; t: N+E+S (W yopiq); cross: hammasi.
 * Rotation r bitmaskni soat strelkasi bo‘yicha (N→E→S→W) r marta suradi.
 */
const CANON: Record<Exclude<RoadShape, 'isolated' | 'cross'>, number> = {
  end: S,
  straight: N | S,
  corner: N | E,
  t: N | E | S,
};

function rotateMask(mask: number, r: number): number {
  let m = mask;
  for (let i = 0; i < r; i++) m = ((m << 1) | (m >> 3)) & 0xf;
  return m;
}

export function pieceForMask(mask: number): RoadPiece {
  if (mask === 0) return { shape: 'isolated', rotation: 0 };
  if (mask === 0xf) return { shape: 'cross', rotation: 0 };
  for (const shape of ['end', 'straight', 'corner', 't'] as const) {
    for (let r = 0; r < 4; r++) if (rotateMask(CANON[shape], r) === mask) return { shape, rotation: r };
  }
  throw new Error('Noma’lum yo‘l maskasi: ' + mask);
}

export class RoadGrid {
  readonly cells = new Map<string, 1>();
  /** Kirishga ulangan komponent */
  readonly connected = new Map<string, 1>();
  /** Eski shaharlardagi qulflangan kirish ko‘prigi bormi (o‘yinchi qurgan emas) */
  hasEntry = false;

  private key(x: number, z: number) {
    return `${x}:${z}`;
  }

  static from(objects: Iterable<PlacedObject>): RoadGrid {
    const g = new RoadGrid();
    for (const o of objects) {
      // darvoza o‘rta katagi — yo‘l (transport o‘tadi; qurilayotganda ham yo‘l uzilmaydi)
      if (o.type === 'himoya_darvoza') {
        const c = o.rotation % 2 === 0 ? { x: o.gridX + 1, z: o.gridZ } : { x: o.gridX, z: o.gridZ + 1 };
        g.cells.set(g.key(c.x, c.z), 1);
        continue;
      }
      if (o.type !== 'road') continue;
      g.cells.set(g.key(o.gridX, o.gridZ), 1);
      if (o.gridX === ENTRY_CELL.x && o.gridZ === ENTRY_CELL.z && !o.userPlaced) g.hasEntry = true;
    }
    g.recompute();
    return g;
  }

  isRoad(x: number, z: number) {
    return this.cells.has(this.key(x, z));
  }

  isConnected(x: number, z: number) {
    return this.connected.has(this.key(x, z));
  }

  maskAt(x: number, z: number): number {
    let m = 0;
    if (this.isRoad(x, z - 1)) m |= N;
    if (this.isRoad(x + 1, z)) m |= E;
    if (this.isRoad(x, z + 1)) m |= S;
    if (this.isRoad(x - 1, z)) m |= W;
    return m;
  }

  /**
   * Shahar ko‘chasi: eski shaharlarda — kirish katagidan BFS; kirish ko‘prigi yo‘q yangi shaharda —
   * eng katta yo‘l tarmog‘i (birinchi chizilgan yo‘l shahar ko‘chasi bo‘ladi, alohida bo‘laklar ulanmagan).
   */
  recompute() {
    this.connected.clear();
    if (this.hasEntry && this.isRoad(ENTRY_CELL.x, ENTRY_CELL.z)) {
      for (const k of this.component(ENTRY_CELL.x, ENTRY_CELL.z)) this.connected.set(k, 1);
      return;
    }
    const seen = new Set<string>();
    let best: string[] = [];
    for (const k of this.cells.keys()) {
      if (seen.has(k)) continue;
      const [x, z] = k.split(':').map(Number);
      const comp = this.component(x, z);
      for (const c of comp) seen.add(c);
      if (comp.length > best.length) best = comp;
    }
    for (const k of best) this.connected.set(k, 1);
  }

  /** 4 yo‘nalishli BFS bilan bitta yo‘l tarmog‘i kataklari. */
  private component(x0: number, z0: number): string[] {
    const out = [this.key(x0, z0)];
    const seen = new Set(out);
    const queue: { x: number; z: number }[] = [{ x: x0, z: z0 }];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = cur.x + dx;
        const nz = cur.z + dz;
        if (!this.isRoad(nx, nz)) continue;
        const key = this.key(nx, nz);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(key);
        queue.push({ x: nx, z: nz });
      }
    }
    return out;
  }
}

/** Ko‘prik uchun to‘g‘ri chiziq: boshlang‘ich katakdan asosiy o‘q bo‘yicha. */
export function straightPath(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? manhattanPath(a, { x: b.x, z: a.z }) : manhattanPath(a, { x: a.x, z: b.z });
}

export function manhattanPath(a: { x: number; z: number }, b: { x: number; z: number }) {
  const cells: { x: number; z: number }[] = [];
  const dx = Math.sign(b.x - a.x);
  const dz = Math.sign(b.z - a.z);
  const xFirst = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
  let x = a.x;
  let z = a.z;
  cells.push({ x, z });
  if (xFirst) {
    while (x !== b.x) { x += dx; cells.push({ x, z }); }
    while (z !== b.z) { z += dz; cells.push({ x, z }); }
  } else {
    while (z !== b.z) { z += dz; cells.push({ x, z }); }
    while (x !== b.x) { x += dx; cells.push({ x, z }); }
  }
  return cells;
}
