import { inBounds, isWater, MAP_MAX, MAP_MIN, perimeterCells } from './grid';
import { activeTerrain } from './terrain';
import type { RoadGrid } from './roadNetwork';
import { STUB_LENGTH, STUB_MIN, type VehicleKind } from './trafficDefs';
import type { PlacedObject } from './types';

/**
 * Transport yo‘l grafigi: shahar yo‘llari (darvoza o‘rta katagi ham yo‘l), xarita chetidan tashqariga davom etadigan
 * tashqi yo‘llar (kirish/chiqish). Yo‘l topish — katak + kelish yo‘nalishi holatlari bo‘yicha BFS: transport yo‘l
 * o‘rtasida orqaga burilmaydi; avtomobil faqat chorraha, berk ko‘cha yoki o‘z to‘xtash joyida, avtobus faqat
 * chorrahada aylanib oladi (tor ko‘chaga majburan kiritilmaydi).
 */

export type Cell = { x: number; z: number };
export const DIR4 = [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }] as const;
const key = (x: number, z: number) => x + ',' + z;
const opp = (d: number) => (d + 2) % 4;

export interface Entry {
  /** Kirish: xarita chetidagi yo‘l ('edge') yoki shahar chetidagi berk ko‘cha uchidan tuproq yo‘l ('track') */
  kind: 'edge' | 'track';
  /** Yo‘l katagi (tashqi yo‘l shu katakdan davom etadi) */
  cell: Cell;
  /** Tashqi yo‘l kataklari: [0] chetga yopishgan, oxirgisi — uzoq uchi (transport shu yerda paydo bo‘ladi/ketadi) */
  stub: Cell[];
  dir: number;
}

/** Xarita chetidagi katakdan tashqariga tashqi yo‘l kataklari (tekis, quruq yer); joy yetmasa — null */
export function stubFrom(x: number, z: number, d: number): Cell[] | null {
  const t = activeTerrain();
  const stub: Cell[] = [];
  for (let i = 1; i <= STUB_LENGTH; i++) {
    const c = { x: x + DIR4[d].x * i, z: z + DIR4[d].z * i };
    if (inBounds(c.x, c.z) || isWater(c.x, c.z) || (t && t.cellHeight(c.x, c.z) > 0.08)) break;
    stub.push(c);
  }
  return stub.length >= STUB_MIN ? stub : null;
}

/** Chetki katakdan tashqariga qaragan yo‘nalishlar */
export function edgeDirs(x: number, z: number): number[] {
  const dirs: number[] = [];
  if (z === MAP_MIN) dirs.push(0);
  if (x === MAP_MAX) dirs.push(1);
  if (z === MAP_MAX) dirs.push(2);
  if (x === MAP_MIN) dirs.push(3);
  return dirs;
}

/** Shahar chetidagi tuproq yo‘l uzunligi (katak) */
export const TRACK_LENGTH = 5;

export class RoadGraph {
  private cells = new Set<string>();
  /** Darvoza o‘rta katagi → darvoza */
  readonly gates = new Map<string, PlacedObject>();
  readonly entries: Entry[] = [];
  /** Tashqi yo‘l uchun joy bo‘lmagan chetki yo‘llar (sababni ko‘rsatish uchun) */
  readonly blockedEdges: Cell[] = [];
  readonly version: number;

  /**
   * opts.free — katak bo‘sh yer (obyekt, suv, tik tog‘ yo‘q); opts.inside — himoyalangan (devor ichidagi) hudud:
   * tuproq yo‘l devor ichidan boshlanmaydi (transport darvozadan o‘tadi).
   */
  constructor(roads: RoadGrid, objects: Iterable<PlacedObject>, version: number, opts: { free?: (x: number, z: number) => boolean; inside?: (x: number, z: number) => boolean } = {}) {
    this.version = version;
    for (const k of roads.cells.keys()) this.cells.add(k.replace(':', ','));
    for (const o of objects) {
      if (o.type !== 'himoya_darvoza') continue;
      const c = o.rotation % 2 === 0 ? { x: o.gridX + 1, z: o.gridZ } : { x: o.gridX, z: o.gridZ + 1 };
      this.gates.set(key(c.x, c.z), o);
    }
    // xarita chetidagi yo‘llar: tashqariga to‘g‘ri tashqi yo‘l (tabiat ichida tekis, quruq yer bo‘lsa)
    for (const k of [...this.cells]) {
      const [x, z] = k.split(',').map(Number);
      if (this.gates.has(k)) continue;
      for (const d of edgeDirs(x, z)) {
        const stub = stubFrom(x, z, d);
        if (stub) this.entries.push({ kind: 'edge', cell: { x, z }, stub, dir: d });
        else this.blockedEdges.push({ x, z });
      }
    }
    // shahar chetidagi kirish: tashqi tomonga qaragan berk ko‘cha uchidan qisqa tuproq yo‘l (xarita chetigacha
    // uzun yo‘l qurish shart emas). Ko‘pi bilan 3 ta — shahar markazidan eng uzoqdagilari.
    if (opts.free) {
      const all = [...this.cells].map((k) => k.split(',').map(Number) as [number, number]).filter(([x, z]) => roads.isConnected(x, z));
      if (all.length) {
        const cx = all.reduce((s, c) => s + c[0], 0) / all.length, cz = all.reduce((s, c) => s + c[1], 0) / all.length;
        const cands: { e: Entry; far: number }[] = [];
        for (const [x, z] of all) {
          if (this.gates.has(key(x, z)) || this.degree(x, z) !== 1 || opts.inside?.(x + 0.5, z + 0.5)) continue;
          if (this.entries.some((e) => e.cell.x === x && e.cell.z === z)) continue; // xarita chetidagi kirish allaqachon bor
          for (let d = 0; d < 4; d++) {
            const back = { x: x - DIR4[d].x, z: z - DIR4[d].z };
            if (!this.has(back.x, back.z)) continue; // yo‘l davomiga qarama-qarshi tomon
            const stub: Cell[] = [];
            for (let i = 1; i <= TRACK_LENGTH; i++) {
              const c = { x: x + DIR4[d].x * i, z: z + DIR4[d].z * i };
              if (this.has(c.x, c.z) || !opts.free(c.x, c.z) || opts.inside?.(c.x + 0.5, c.z + 0.5)) break;
              stub.push(c);
            }
            // tashqariga qarab: shahar markazidan uzoqlashadigan yo‘nalish
            if (stub.length < TRACK_LENGTH) continue;
            const end = stub[stub.length - 1];
            const far = Math.hypot(end.x - cx, end.z - cz);
            if (far <= Math.hypot(x - cx, z - cz)) continue;
            cands.push({ e: { kind: 'track', cell: { x, z }, stub, dir: d }, far });
          }
        }
        cands.sort((a, b) => b.far - a.far);
        for (const c of cands.slice(0, 3)) this.entries.push(c.e);
      }
    }
    for (const e of this.entries) for (const c of e.stub) this.cells.add(key(c.x, c.z));
  }

  has(x: number, z: number) {
    return this.cells.has(key(x, z));
  }

  degree(x: number, z: number) {
    let n = 0;
    for (const d of DIR4) if (this.has(x + d.x, z + d.z)) n++;
    return n;
  }

  gateAt(x: number, z: number) {
    return this.gates.get(key(x, z)) ?? null;
  }

  /** Bino oldidagi (perimetriga tegib turgan) yo‘l kataklari */
  curbCells(o: PlacedObject): Cell[] {
    return perimeterCells(o).filter((c) => this.has(c.x, c.z) && !this.gates.has(key(c.x, c.z)));
  }

  /** Tashqi yo‘llarning uzoq uchlari (transport paydo bo‘ladigan/ketadigan joy) */
  stubEnds(): Cell[] {
    return this.entries.map((e) => e.stub[e.stub.length - 1]);
  }

  entryOfStubEnd(c: Cell): Entry | null {
    return this.entries.find((e) => { const s = e.stub[e.stub.length - 1]; return s.x === c.x && s.z === c.z; }) ?? null;
  }

  /**
   * Yo‘l topish: from katagidan (kelish yo‘nalishi dir, null — istalgan tomonga chiqa oladi) targets dan biriga.
   * blocked(x,z) — vaqtincha o‘tib bo‘lmaydigan katak (qo‘lda yopilgan darvoza, tiqilgan joy).
   * Qaytaradi: kataklar ketma-ketligi (from bilan) yoki null.
   */
  route(from: Cell, dir: number | null, targets: Cell[], kind: VehicleKind, blocked?: (x: number, z: number) => boolean, maxStates = 40000): Cell[] | null {
    if (!this.has(from.x, from.z) || !targets.length) return null;
    const goal = new Set(targets.map((c) => key(c.x, c.z)));
    if (goal.has(key(from.x, from.z))) return [from];
    const sk = (x: number, z: number, d: number) => `${x},${z},${d}`;
    const prev = new Map<string, string | null>();
    const q: { x: number; z: number; d: number; start: boolean }[] = [];
    const startD = dir ?? 4;
    prev.set(sk(from.x, from.z, startD), null);
    q.push({ x: from.x, z: from.z, d: startD, start: true });
    let found: string | null = null;
    for (let h = 0; h < q.length && h < maxStates; h++) {
      const s = q[h];
      for (let nd = 0; nd < 4; nd++) {
        if (s.d < 4 && nd === opp(s.d) && !this.canReverse(s.x, s.z, kind, s.start)) continue;
        const nx = s.x + DIR4[nd].x, nz = s.z + DIR4[nd].z;
        if (!this.has(nx, nz) || blocked?.(nx, nz)) continue;
        const k2 = sk(nx, nz, nd);
        if (prev.has(k2)) continue;
        prev.set(k2, sk(s.x, s.z, s.d));
        if (goal.has(key(nx, nz))) { found = k2; break; }
        q.push({ x: nx, z: nz, d: nd, start: false });
      }
      if (found) break;
    }
    if (!found) return null;
    const out: Cell[] = [];
    for (let k: string | null = found; k; k = prev.get(k) ?? null) {
      const [x, z] = k.split(',').map(Number);
      out.push({ x, z });
    }
    return out.reverse();
  }

  /** Orqaga aylanib olish mumkin bo‘lgan joy */
  private canReverse(x: number, z: number, kind: VehicleKind, start: boolean) {
    const deg = this.degree(x, z);
    if (kind === 'bus') return deg >= 3;
    return start || deg !== 2;
  }
}
