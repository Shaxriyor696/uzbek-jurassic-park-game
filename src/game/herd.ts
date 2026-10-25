import { inBounds, isWater, LAND_MAX, LAND_MIN, type Occupancy } from './grid';
import { activeTerrain, groundHeight, natureNoise, terrainFordable } from './terrain';
import { CHASE, HERD_BY_TYPE, HERD_SLOTS, herdRadius, type HerdDef, type HerdType, type PoiKind } from './herdDefs';

/**
 * Yangi dinozavrlar podasi: katakli navigatsiya (to‘siqdan masofa maydoni + A*), mustaqil xulq (maqsad tanlaydi,
 * yo‘l topadi, yetib boradi, keyin yangi qaror), qisqa zo‘ravonliksiz quvish. Hammasi o‘yin vaqti (Game.update
 * qadami) bilan — pauzada to‘xtaydi, FPS ga bog‘liq emas. Teleport yo‘q: yo‘l topilmasa to‘xtab boshqa maqsad tanlaydi.
 */

/** raid — shahar binosiga boradi (devorda ochiq joy bo‘lsa); stomp — bino yonida zarar yetkazmoqda; probe — devor yonida
 * kirishga urinmoqda (yo‘l yopiq); leave — politsiya chiqarib yubormoqda */
export type HerdMode = 'idle' | 'rest' | 'look' | 'wander' | 'travel' | 'watch' | 'follow' | 'chase' | 'flee' | 'raid' | 'stomp' | 'probe' | 'leave';

export interface HerdDino {
  id: string;
  type: HerdType;
  /** Tana markazi (katak koordinatasi, uzluksiz) */
  x: number;
  z: number;
  heading: number;
  speed: number;
  mode: HerdMode;
  /** Joriy holatning qolgan vaqti (s) */
  timer: number;
  target: { x: number; z: number } | null;
  /** Quvishdagi sherik */
  partner: string | null;
  /** Keyingi quvishgacha tanaffus */
  cooldown: number;
  /** Yaqinda borgan joylar (darhol qaytmaslik uchun) */
  visited: { x: number; z: number }[];
  /** Animatsiya: joriy holat va har klip fazasi (soniya) */
  anim: 'idle' | 'walk' | 'run' | 'look';
  phase: { idle: number; walk: number; run: number; look: number };
  lookIdx: number;
  rng: number;
  /** Kuzatish nuqtasi (shahar markazi kabi) — u yoqqa buriladi */
  face: { x: number; z: number } | null;
  /** Burilish burchak tezligi (rad/s) — keskin emas, tezlanish bilan o‘zgaradi */
  omega?: number;
  /** Borishi kerak bo‘lgan yo‘nalish (bosh burilishni oldindan sezadi) */
  want?: number;
  /** Diqqat nuqtasi (bosh shu yoqqa qaraydi): sherik, quvuvchi, shahar */
  focus?: { x: number; z: number } | null;
  /** Qadam kuchi (0..1): yurishda 1, joyida burilishda kichik qadamlar */
  step?: number;
  /** Yo‘nalishga burilish davom etyaptimi (chegara tebranmasligi uchun) */
  turning?: boolean;
  /** Yaqinda tiqilgan yo‘nalish (shu tomonga maqsad tanlanmaydi), qolgan soniya */
  avoid?: { a: number; t: number } | null;
  /** Keyingi shaharga hujumgacha (s) */
  raidCool?: number;
  /** Hujum qilinayotgan bino */
  raidOn?: string | null;
  /** Yirtqich yugurib boryapti (sayr/uzoq yo‘l) — maqsadga yetguncha */
  sprint?: boolean;
}

/** Yirtqichlarning vaqti-vaqti bilan yugurishi: ehtimol (har yangi sayr/yo‘lda) va tezlik (yurish klipi tezligiga nisbatan) */
export const SPRINT = { chance: 0.45, walkGaitRate: 2.1 };

/** Shahar hujumi sozlamalari (yagona joy) */
export const RAID_CONFIG = {
  /** false — hujum yo‘q (faqat eski avtomatik sinovlar uchun; o‘yinchi uchun doim true) */
  enabled: true,
  /** Hujumlar orasidagi tanaffus (s) — tez-tez shahar chegarasiga keladi */
  cool: [25, 60] as [number, number],
  /** Politsiya chiqarib yuborgandan keyin */
  coolAfterEvict: [70, 120] as [number, number],
  /** Bino yonida bir urinish (s) */
  stomp: [6, 9] as [number, number],
  /** Oddiy yurishda shahar ichidan o‘tish «qimmat» (yo‘l shahar chetidan aylanib o‘tadi) */
  cityCost: 3,
};

export interface HerdWorld {
  occ: Occupancy;
  /** Eski dinozavrlar (apatozavr) band kataklari */
  dinoCells: Set<string>;
  /** Shahar chegarasi (barcha obyektlar) */
  city: { x0: number; z0: number; x1: number; z1: number };
  /** Eski dinozavrlar (apatozavr) marshruti — poda u yerda to‘xtab qolmaydi (faqat kesib o‘tadi) */
  avoid?: { x: number; z: number }[];
  /** Eski katta dinozavrlar (markazi va uzunligi) — ulardan xavfsiz masofa (ostiga kirmaydi) */
  bigs?: { x: number; z: number; len: number }[];
  /**
   * Katakdagi obyekt dinozavrga to‘siqmi (berilmasa — har qanday obyekt). Yo‘l va to‘liq ochiq darvoza — to‘siq emas;
   * devor, yopiq darvoza va binolar — to‘siq.
   */
  blocks?: (x: number, z: number) => boolean;
  /** Himoyalangan (devor ichidagi) hudud — u yerga maqsad tanlanmaydi, quvilgan dinozavr u yoqqa qochmaydi */
  inside?: (x: number, z: number) => boolean;
  /** Tayyor (buzilmagan) devor/darvoza kataklari — yo‘l yopiq bo‘lsa dinozavr shu yerda urinadi */
  walls?: { x: number; z: number }[];
  /** Hujum qilish mumkin bo‘lgan shahar binolari (tayyor, yo‘l/devor/bezakdan tashqari) */
  cityTargets?: { id: string; x0: number; z0: number; x1: number; z1: number }[];
  /** Yo‘ldagi transport: dinozavr uning ichidan o‘tmaydi; yo‘l kutayotgan transport oldidan chetlashadi */
  vehicles?: { x: number; z: number; r: number; waiting: boolean }[];
}

/** Relyef dinozavr uchun o‘tib bo‘lmaydigan (qorli cho‘qqi yoki tik qiyalik) */
export function herdTerrainBlocked(x: number, z: number): boolean {
  const t = activeTerrain();
  if (!t) return false;
  const h = t.cellHeight(x, z);
  if (h > HERD_MAX_H) return true;
  if (h > 0.05) {
    const sl = Math.max(Math.abs(h - t.cellHeight(x + 1, z)), Math.abs(h - t.cellHeight(x - 1, z)), Math.abs(h - t.cellHeight(x, z + 1)), Math.abs(h - t.cellHeight(x, z - 1)));
    if (sl > HERD_MAX_SLOPE) return true;
  }
  return false;
}

/** Dinozavr navigatsiyasida yuriladigan relyef (suv — faqat sayoz soy; tog‘ — qiyalik bo‘yicha) */
export function herdTerrainOk(x: number, z: number): boolean {
  return inLand(x, z) && !(isWater(x, z) && !terrainFordable(x, z)) && !herdTerrainBlocked(x, z);
}

const W = LAND_MAX - LAND_MIN + 1;
const idx = (x: number, z: number) => (z - LAND_MIN) * W + (x - LAND_MIN);
const inLand = (x: number, z: number) => x >= LAND_MIN + 1 && z >= LAND_MIN + 1 && x <= LAND_MAX - 1 && z <= LAND_MAX - 1;
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function rand(d: HerdDino) {
  d.rng = (d.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(d.rng ^ (d.rng >>> 15), 1 | d.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (d: HerdDino, a: number, b: number) => a + rand(d) * (b - a);

// ---------------- navigatsiya ----------------

/** Qiziqish nuqtalari shahar chetidan shu masofagacha (atrofdagi tog‘lar va o‘rmonlar bilan) */
export const HERD_RANGE = 30;

/**
 * Tog‘da yurish: qiyalik bo‘yicha (qo‘shni katakka balandlik farqi, ~24° gacha) va balandlik (qorli cho‘qqi emas)
 * bilan cheklanadi (~37° gacha) — yonbag‘irga chiqadi, tik qoyaga chiqmaydi
 */
export const HERD_MAX_SLOPE = 0.75;
export const HERD_MAX_H = 5;

export class HerdNav {
  /** To‘siqqacha masofa (katak, 8 yo‘nalish), 0 — to‘siq */
  clear: Uint8Array;
  pois: Record<PoiKind, { x: number; z: number }[]> = { foothill: [], valley: [], forest: [], meadow: [], shore: [], cityEdge: [], slope: [] };
  cityCenter: { x: number; z: number };

  /** 1 — to‘siq (obyekt, suv, tik tog‘, shahar ichi) */
  private blocked: Uint8Array;
  /** Bog‘langan hududlar (eng kichik tana sig‘adigan kataklar bo‘yicha): 0 — hudud yo‘q */
  region: Int32Array;
  private world: HerdWorld;

  constructor(w: HerdWorld) {
    this.world = w;
    const blocked = new Uint8Array(W * W);
    this.blocked = blocked;
    const t = activeTerrain();
    const c = w.city;
    this.cityCenter = { x: (c.x0 + c.x1 + 1) / 2, z: (c.z0 + c.z1 + 1) / 2 };
    for (let z = LAND_MIN; z <= LAND_MAX; z++) for (let x = LAND_MIN; x <= LAND_MAX; x++) if (this.blockedAt(x, z)) blocked[idx(x, z)] = 1;
    // ko‘p manbali BFS: to‘siqdan masofa (max 10)
    this.clear = new Uint8Array(W * W);
    this.computeClear(0, 0, W - 1, W - 1);
    this.region = new Int32Array(W * W);
    this.computeRegions();
    this.buildPois(w, t);
  }

  private blockedAt(x: number, z: number) {
    const w = this.world, c = w.city;
    let b = !inLand(x, z) || (w.blocks ? w.occ.get(x, z) !== null && w.blocks(x, z) : w.occ.get(x, z) !== null) || (isWater(x, z) && !terrainFordable(x, z));
    if (!b) b = herdTerrainBlocked(x, z);
    // shahar ichi endi to‘siq emas: devorda ochiq joy bo‘lsa dinozavr kira oladi (oddiy yurishda — «qimmat» yo‘l)
    void c;
    return b;
  }

  /** To‘siqdan masofa [x0..x1]×[z0..z1] (indeks) oralig‘ida qayta hisoblanadi; manba — oraliqdan 10 katak kengroq hududdagi to‘siqlar */
  private computeClear(x0: number, z0: number, x1: number, z1: number) {
    const X0 = Math.max(0, x0 - 10), Z0 = Math.max(0, z0 - 10), X1 = Math.min(W - 1, x1 + 10), Z1 = Math.min(W - 1, z1 + 10);
    const cw = X1 - X0 + 1;
    const loc = new Uint8Array(cw * (Z1 - Z0 + 1)).fill(255);
    let q: number[] = [];
    for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) if (this.blocked[z * W + x]) { loc[(z - Z0) * cw + (x - X0)] = 0; q.push((z - Z0) * cw + (x - X0)); }
    let d = 0;
    while (q.length && d < 10) {
      d++;
      const next: number[] = [];
      for (const k of q) {
        const x = k % cw, z = (k - x) / cw;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Z = z + dz;
          if (X < 0 || Z < 0 || X >= cw || Z > Z1 - Z0) continue;
          const n = Z * cw + X;
          if (loc[n] === 255) { loc[n] = d; next.push(n); }
        }
      }
      q = next;
    }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const v = loc[(z - Z0) * cw + (x - X0)];
      this.clear[z * W + x] = v === 255 ? 10 : v;
    }
  }

  /** Eng kichik tana (masofa ≥ 2) uchun bog‘langan hududlar — maqsad shu hududdan tanlanadi (devor ortiga emas) */
  private computeRegions() {
    const r = this.region;
    r.fill(0);
    let label = 0;
    const q: number[] = [];
    for (let k0 = 0; k0 < W * W; k0++) {
      if (r[k0] || this.clear[k0] < 2) continue;
      r[k0] = ++label;
      q.push(k0);
      while (q.length) {
        const k = q.pop()!;
        const x = k % W, z = (k - x) / W;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const X = x + dx, Z = z + dz;
          if (X < 0 || Z < 0 || X >= W || Z >= W) continue;
          const n = Z * W + X;
          if (r[n] || this.clear[n] < 2) continue;
          if (dx && dz && (this.clear[z * W + X] < 2 || this.clear[Z * W + x] < 2)) continue;
          r[n] = label;
          q.push(n);
        }
      }
    }
  }

  regionOf(x: number, z: number) {
    const X = Math.floor(x), Z = Math.floor(z);
    if (X < LAND_MIN || Z < LAND_MIN || X > LAND_MAX || Z > LAND_MAX) return 0;
    return this.region[idx(X, Z)];
  }

  /**
   * Faqat o‘zgargan kataklar atrofini yangilash (darvoza ochildi/yopildi): to‘siq, masofa maydoni (10 katak
   * radiusda) va hududlar. Butun xarita qayta qurilmaydi.
   */
  patch(w: HerdWorld, cells: { x: number; z: number }[]) {
    if (!cells.length) return;
    this.world = w;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of cells) {
      if (p.x < LAND_MIN || p.z < LAND_MIN || p.x > LAND_MAX || p.z > LAND_MAX) continue;
      this.blocked[idx(p.x, p.z)] = this.blockedAt(p.x, p.z) ? 1 : 0;
      x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z);
    }
    if (x0 === Infinity) return;
    const ix0 = Math.max(0, x0 - LAND_MIN - 10), iz0 = Math.max(0, z0 - LAND_MIN - 10);
    const ix1 = Math.min(W - 1, x1 - LAND_MIN + 10), iz1 = Math.min(W - 1, z1 - LAND_MIN + 10);
    this.computeClear(ix0, iz0, ix1, iz1);
    this.computeRegions();
  }

  clearance(x: number, z: number) {
    const X = Math.floor(x), Z = Math.floor(z);
    if (X < LAND_MIN || Z < LAND_MIN || X > LAND_MAX || Z > LAND_MAX) return 0;
    return this.clear[idx(X, Z)];
  }

  /** Haqiqiy, bo‘sh, yetib borish mumkin bo‘lgan qiziqish nuqtalari (katta tanaga ham joy bor: masofa ≥ 3) */
  private buildPois(w: HerdWorld, t: ReturnType<typeof activeTerrain>) {
    const c = w.city;
    // apatozavr marshruti yo‘lagi (4 katak) — u yerda dam olish/sayr nuqtasi yo‘q (shahar chetini kuzatish — bor)
    const lane = new Set<number>();
    for (const p of w.avoid ?? []) {
      for (let zz = Math.floor(p.z - 4); zz <= Math.ceil(p.z + 4); zz++) for (let xx = Math.floor(p.x - 4); xx <= Math.ceil(p.x + 4); xx++) {
        if (xx >= LAND_MIN && zz >= LAND_MIN && xx <= LAND_MAX && zz <= LAND_MAX && Math.hypot(xx + 0.5 - p.x, zz + 0.5 - p.z) <= 4) lane.add(idx(xx, zz));
      }
    }
    for (let z = LAND_MIN + 4; z <= LAND_MAX - 4; z += 3) {
      for (let x = LAND_MIN + 4; x <= LAND_MAX - 4; x += 3) {
        if (this.clear[idx(x, z)] < 3) continue;
        const cx = x + 0.5, cz = z + 0.5;
        // shahar chetidan masofa
        const dx = Math.max(c.x0 - x, 0, x - c.x1), dz = Math.max(c.z0 - z, 0, z - c.z1);
        const dCity = Math.max(dx, dz);
        if (dCity >= 3 && dCity <= 7) { this.pois.cityEdge.push({ x: cx, z: cz }); continue; }
        if (lane.has(idx(x, z))) continue;
        // shahar atrofidagi 40 katak — o‘yinchi ko‘radigan hudud (tog‘ ortida uzoqqa ketib qolmasin)
        if (dCity < 3 || dCity > HERD_RANGE) continue;
        let mount = 0, water = 0;
        for (let rz = -6; rz <= 6; rz += 2) for (let rx = -6; rx <= 6; rx += 2) {
          if (t && t.cellHeight(x + rx, z + rz) > 0.5) mount++;
          if (isWater(x + rx, z + rz)) water++;
        }
        // tog‘ yonbag‘ri: o‘zi biroz baland, yurish mumkin (to‘siqdan masofa yetarli)
        if (t && t.cellHeight(x, z) > 0.7) { this.pois.slope.push({ x: cx, z: cz }); continue; }
        if (water > 0 && water < 10) this.pois.shore.push({ x: cx, z: cz });
        else if (mount >= 18) this.pois.valley.push({ x: cx, z: cz });
        else if (mount >= 3) this.pois.foothill.push({ x: cx, z: cz });
        else if (!inBounds(x, z) && Math.abs(natureNoise(x * 0.07, z * 0.07, 404) - 0.5) < 0.1) this.pois.forest.push({ x: cx, z: cz });
        else if (mount === 0 && water === 0) this.pois.meadow.push({ x: cx, z: cz });
      }
    }
  }

  /** Shahar ichidagi katak (binolar chegarasi ichida) */
  inCity(x: number, z: number) {
    const c = this.world.city;
    return x > c.x0 && z > c.z0 && x < c.x1 && z < c.z1;
  }

  /** A*: radiusi `need` katak bo‘lgan tana uchun (8 yo‘nalish), so‘ng ko‘rinish chizig‘i bilan silliqlanadi; cityCost — shahar ichidagi har katak uchun qo‘shimcha narx */
  findPath(fx: number, fz: number, tx: number, tz: number, need: number, budget = 14000, cityCost = 0): { x: number; z: number }[] | null {
    const sx = Math.floor(fx), sz = Math.floor(fz), gx = Math.floor(tx), gz = Math.floor(tz);
    if (this.clearance(gx, gz) < need) return null;
    const start = idx(sx, sz), goal = idx(gx, gz);
    const gScore = new Map<number, number>([[start, 0]]);
    const came = new Map<number, number>();
    const heap: [number, number][] = [[Math.hypot(gx - sx, gz - sz), start]];
    const push = (f: number, k: number) => {
      heap.push([f, k]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const closed = new Set<number>();
    let n = 0;
    while (heap.length && n++ < budget) {
      const [, k] = pop();
      if (k === goal) break;
      if (closed.has(k)) continue;
      closed.add(k);
      const x = (k % W) + LAND_MIN, z = Math.floor(k / W) + LAND_MIN;
      const g = gScore.get(k)!;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const X = x + dx, Z = z + dz;
        if (X < LAND_MIN || Z < LAND_MIN || X > LAND_MAX || Z > LAND_MAX) continue;
        const nk = idx(X, Z);
        // boshlang‘ich katak atrofi tor bo‘lsa ham chiqib keta olsin (tana allaqachon shu yerda)
        if (this.clear[nk] < need && !(Math.hypot(X - sx, Z - sz) < 2 && this.clear[nk] >= need - 1)) continue;
        if (dx && dz && (this.clear[idx(x + dx, z)] < need || this.clear[idx(x, z + dz)] < need)) continue;
        const ng = g + (dx && dz ? 1.414 : 1) + (this.clear[nk] < need + 1 ? 0.6 : 0) + (cityCost && this.inCity(X, Z) ? cityCost : 0);
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng);
          came.set(nk, k);
          push(ng + Math.hypot(gx - X, gz - Z), nk);
        }
      }
    }
    if (!came.has(goal) && goal !== start) return null;
    const cells: { x: number; z: number }[] = [];
    for (let k: number | undefined = goal; k !== undefined && k !== start; k = came.get(k)) cells.push({ x: (k % W) + LAND_MIN + 0.5, z: Math.floor(k / W) + LAND_MIN + 0.5 });
    cells.reverse();
    // silliqlash: ko‘rinish chizig‘i (yo‘l bo‘ylab har nuqta tana uchun yetarli kenglikda)
    const out: { x: number; z: number }[] = [];
    let from = { x: fx, z: fz };
    let i = 0;
    while (i < cells.length) {
      let j = Math.min(cells.length - 1, i + 30);
      while (j > i && !this.lineClear(from, cells[j], need)) j--;
      out.push(cells[j]);
      from = cells[j];
      i = j + 1;
    }
    return out;
  }

  lineClear(a: { x: number; z: number }, b: { x: number; z: number }, need: number) {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / 0.4));
    for (let s = 1; s <= n; s++) if (this.clearance(a.x + ((b.x - a.x) * s) / n, a.z + ((b.z - a.z) * s) / n) < need) return false;
    return true;
  }
}

// ---------------- poda ----------------

/**
 * Tana uchun kerakli to‘siqdan masofa (katak): markaz katak ichida istalgan joyda bo‘lishi mumkin, shuning uchun
 * radiusdan bitta katak ko‘p — shunda tana doirasi hech qachon band katakka tegmaydi
 */
const needOf = (def: HerdDef) => Math.ceil(herdRadius(def)) + 1;
/** Yurish/yugurish klipining 1× playback dagi yer tezligi (katak/s) */
export function clipGroundSpeed(def: HerdDef, kind: 'walk' | 'run') {
  const c = kind === 'walk' ? def.walk : def.run;
  return c?.speed ? c.speed * (def.length / def.modelLength) : 0;
}

export class Herd {
  dinos: HerdDino[] = [];
  /** Faqat avtomatik sinovlar (?nodino): poda o‘chiq */
  disabled = false;
  private world: HerdWorld | null = null;
  private navRef: HerdNav | null = null;
  /** Oldingi qadami rad etilgan dinozavrlar (keyingi kadrda to‘g‘ridan yo‘l nuqtasiga) */
  private direct = new Set<string>();
  /** Qorovul uchun: oxirgi siljigan joy */
  private lastPos = new Map<string, { x: number; z: number }>();
  /** Joyida qotib turish kuzatuvi (doim harakat qoidasi) */
  private still = new Map<string, { x: number; z: number; h: number; t: number }>();
  nav: HerdNav | null = null;
  private navKey = '';
  /** Har qadamda ko‘pi bilan shuncha yo‘l qidiruvi (hisob vaqt bo‘yicha taqsimlanadi) */
  private pathBudget = 0;
  private paths = new Map<string, { x: number; z: number }[]>();
  private stuck = new Map<string, number>();
  private chaseCheck = 0;
  note: string | null = null;

  /** Navigatsiya yangilanishi kerak (yangi bino/yo‘l, relyef) */
  invalidate() {
    this.navKey = '';
  }

  /**
   * Darvoza holati o‘zgardi: navigatsiya faqat shu kataklar atrofida yangilanadi; yo‘li shu joy yaqinidan
   * o‘tadigan dinozavrlar yo‘lni qayta hisoblaydi (qolganlari o‘z yo‘lida davom etadi)
   */
  patchNav(w: HerdWorld, cells: { x: number; z: number }[]) {
    if (!this.nav || !cells.length) return;
    this.world = w;
    this.nav.patch(w, cells);
    for (const [id, p] of this.paths) {
      if (p.some((q) => cells.some((c) => Math.abs(q.x - c.x - 0.5) < 12 && Math.abs(q.z - c.z - 0.5) < 12))) this.paths.delete(id);
    }
  }

  private ensureNav(w: HerdWorld, key: string) {
    if (this.nav && this.navKey === key) return this.nav;
    this.nav = new HerdNav(w);
    this.navKey = key;
    this.paths.clear(); // eski yo‘llar qayta hisoblanadi
    return this.nav;
  }

  /** Har bir tana egallagan kataklar (qurilish va eski dinozavrlar uchun to‘siq) */
  bodyCells(d: HerdDino): { x: number; z: number }[] {
    const r = herdRadius(HERD_BY_TYPE[d.type]);
    const out: { x: number; z: number }[] = [];
    for (let z = Math.floor(d.z - r); z <= Math.floor(d.z + r); z++) for (let x = Math.floor(d.x - r); x <= Math.floor(d.x + r); x++) {
      const nx = Math.max(x, Math.min(d.x, x + 1)), nz = Math.max(z, Math.min(d.z, z + 1));
      if ((nx - d.x) ** 2 + (nz - d.z) ** 2 <= r * r) out.push({ x, z });
    }
    return out;
  }

  occupied(): Set<string> {
    const s = new Set<string>();
    for (const d of this.dinos) for (const c of this.bodyCells(d)) s.add(c.x + ',' + c.z);
    return s;
  }

  /** Har turdan bittadan; saqlangani yaroqli bo‘lsa — o‘sha, aks holda xavfsiz ochiq joyda yangisi. Takrorlanmaydi. */
  ensure(w: HerdWorld, key: string, saved: HerdDino[]) {
    if (this.disabled) { this.dinos = []; return; }
    const nav = this.ensureNav(w, key);
    const out: HerdDino[] = [];
    const notes: string[] = [];
    let n = 0;
    for (const { def, id } of HERD_SLOTS) {
      const old = saved.find((d) => d.id === id) ?? this.dinos.find((d) => d.id === id);
      // saqlangan joy: yo‘l ustida (tor joydan o‘tayotgan) bo‘lishi mumkin — harakatdagi kabi yumshoq tekshiruv
      // yurish hududidan (shahar atrofi) juda uzoqda qolgan bo‘lsa — yaroqsiz joy, yaqinroq ochiq joyga qo‘yiladi
      const far = old ? cityDist(w.city, old.x, old.z) > HERD_RANGE + 6 : false;
      if (old && !far && old.type === def.type && this.placeOk(nav, w, def, old.x, old.z, out, true)) { out.push(sanitize(old)); continue; }
      const s = this.spawn(nav, w, def, out, n++, id);
      if (s) out.push(s);
      else notes.push(`${def.name} uchun bo‘sh joy topilmadi`);
    }
    this.dinos = out;
    this.note = notes.length ? notes.join('; ') : null;
  }

  private placeOk(nav: HerdNav, w: HerdWorld, def: HerdDef, x: number, z: number, others: HerdDino[], loose = false) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (nav.clearance(x, z) < needOf(def) - (loose ? 1 : 0)) return false;
    const r = herdRadius(def);
    for (const o of others) {
      const gap = r + herdRadius(HERD_BY_TYPE[o.type]) + (loose ? 0 : 1);
      // statik modellar bir-biridan uzoqroq (bir qatorga tizilmasin)
      const spread = !loose && !def.mobile && !HERD_BY_TYPE[o.type].mobile ? 18 : 0;
      if (Math.hypot(o.x - x, o.z - z) < Math.max(gap, spread)) return false;
    }
    // saqlangan joy (o‘yinda allaqachon to‘qnashmagan) — eski dinozavrning taxminiy doirasi bilan qayta tekshirilmaydi
    if (!loose) for (let zz = Math.floor(z - r); zz <= Math.floor(z + r); zz++) for (let xx = Math.floor(x - r); xx <= Math.floor(x + r); xx++) if (w.dinoCells.has(xx + ',' + zz)) return false;
    return true;
  }

  private spawn(nav: HerdNav, w: HerdWorld, def: HerdDef, others: HerdDino[], i: number, id: string): HerdDino | null {
    const order: PoiKind[] = [def.home, 'meadow', 'foothill', 'forest', 'shore', 'cityEdge', 'valley'];
    // tur bo‘yicha boshqacha boshlanish (hammasi bir joyda paydo bo‘lmasin)
    for (const kind of order) {
      const list = nav.pois[kind];
      if (!list.length) continue;
      // shaharga yaqinroq nuqtalar (o‘yinchi ko‘radi), lekin har tur boshqa tomonda
      // har nusxa boshqa tomonda; bir turdagilar bir-biriga yaqinroq (podadek), lekin ustma-ust emas
      const ang = (i / HERD_SLOTS.length) * Math.PI * 2 + 0.4;
      const cc = nav.cityCenter;
      const sorted = [...list].sort((a, b) => score(a) - score(b));
      function score(p: { x: number; z: number }) {
        const d = Math.hypot(p.x - cc.x, p.z - cc.z);
        const a = Math.atan2(p.z - cc.z, p.x - cc.x);
        // statik model — xarita chetiga eng yaqin (ko‘rinib tursin); harakatlanuvchi — har tur o‘z tomonida
        return def.mobile ? d * 0.6 + Math.abs(angDiff(a, ang)) * 25 : d + Math.abs(angDiff(a, ang)) * 6;
      }
      for (const p of sorted.slice(0, 400)) {
        // statik (yurmaydigan) model qurilish xaritasini doim band qilmasin — xarita chetidan tashqarida turadi
        if (!def.mobile && !outsideMap(def, p)) continue;
        if (!this.placeOk(nav, w, def, p.x, p.z, others)) continue;
        const face = kind === 'cityEdge' || (!def.mobile && def.home === 'cityEdge') ? { x: cc.x, z: cc.z } : null;
        const heading = face ? Math.atan2(face.z - p.z, face.x - p.x) : ang + Math.PI;
        return {
          id, type: def.type, x: p.x, z: p.z, heading, speed: 0, mode: def.mobile ? 'rest' : (face ? 'watch' : 'rest'),
          // boshida qisqa, har xil (hammasi bir vaqtda qo‘zg‘almasin, lekin uzoq turmasin)
          timer: 0.5 + i * 0.25, target: null, partner: null, cooldown: 15 + i * 3, visited: [], anim: 'idle',
          phase: { idle: i * 0.7, walk: i * 0.37, run: i * 0.21, look: 0 }, lookIdx: 0, rng: 1234 + i * 977, face,
        };
      }
    }
    return null;
  }

  /** Qadam: navigatsiya kerak bo‘lsa yangilanadi, har dinozavr xulqi va harakati, quvish boshqaruvi */
  step(dt: number, w: HerdWorld, key: string) {
    if (!this.dinos.length) return;
    const nav = this.ensureNav(w, key);
    this.world = w;
    this.navRef = nav;
    this.pathBudget = 2;
    this.manageChases(dt, nav);
    for (const d of this.dinos) {
      this.stepOne(d, dt, nav, w);
      d.focus = this.focusOf(d, nav);
      this.watchdog(d, dt, nav, w);
    }
  }

  /**
   * Qorovul: yurmoqchi bo‘lgan (sayr, yo‘l, ergashish, quvish, qochish, kuzatishga borish) dinozavr 4 s dan ortiq
   * joyidan siljimasa — sababidan qat’i nazar boshqa tomondagi yangi maqsadga o‘tadi (bir joyda qotib qolmaydi)
   */
  private watchdog(d: HerdDino, dt: number, nav: HerdNav, w: HerdWorld) {
    if (!this.def(d).mobile) return;
    const wants = (d.mode === 'wander' || d.mode === 'travel' || d.mode === 'follow' || d.mode === 'chase' || d.mode === 'flee' || d.mode === 'raid' || d.mode === 'leave' || ((d.mode === 'watch' || d.mode === 'probe') && !!d.target))
      && !this.besideStillPartner(d);
    const key = d.id + ':w';
    const last = this.lastPos.get(d.id);
    const moved = last ? Math.hypot(d.x - last.x, d.z - last.z) : 1;
    if (!wants || moved > 0.02) { this.stuck.set(key, 0); this.lastPos.set(d.id, { x: d.x, z: d.z }); return; }
    const t = (this.stuck.get(key) ?? 0) + dt;
    this.stuck.set(key, t);
    if (t > 4) {
      this.stuck.set(key, 0);
      this.lastPos.set(d.id, { x: d.x, z: d.z });
      d.avoid = { a: d.want ?? d.heading, t: 15 };
      this.giveUp(d, nav, w);
      d.timer = Math.min(d.timer, 1); // qisqa nafasdan keyin yangi qaror
    }
  }

  /** Ergashuvchi to‘xtab turgan sherigining yonida (kutish — tiqilish emas) */
  private besideStillPartner(d: HerdDino) {
    if (d.mode !== 'follow' || !d.partner) return false;
    const o = this.dinos.find((q) => q.id === d.partner);
    if (!o || o.speed >= 0.05) return false;
    return Math.hypot(o.x - d.x, o.z - d.z) < herdRadius(this.def(d)) + herdRadius(this.def(o)) + 3.5;
  }

  /** Bosh qaraydigan nuqta: sherik/quvuvchi, kuzatishda shahar, yaqin turgan boshqa dinozavr; aks holda yo‘q */
  private focusOf(d: HerdDino, nav: HerdNav): { x: number; z: number } | null {
    const p = d.partner ? this.dinos.find((q) => q.id === d.partner) : null;
    if (p && (d.mode === 'follow' || d.mode === 'chase' || d.mode === 'flee')) return { x: p.x, z: p.z };
    if (d.mode === 'watch' && !d.target) return d.face ?? nav.cityCenter;
    if (d.speed < 0.05) {
      let best: HerdDino | null = null, bd = 9;
      for (const o of this.dinos) { if (o === d) continue; const dd = Math.hypot(o.x - d.x, o.z - d.z); if (dd < bd) { bd = dd; best = o; } }
      if (best) return { x: best.x, z: best.z };
    }
    return null;
  }

  private def(d: HerdDino) {
    return HERD_BY_TYPE[d.type];
  }

  private stepOne(d: HerdDino, dt: number, nav: HerdNav, w: HerdWorld) {
    const def = this.def(d);
    d.cooldown = Math.max(0, d.cooldown - dt);
    d.timer -= dt;
    if (!def.mobile) {
      // statik model: joyida turadi (animatsiya yo‘q) — faqat taymer yangilanadi
      d.speed = 0;
      d.anim = 'idle';
      if (d.timer <= 0) d.timer = between(d, def.restTime[0], def.restTime[1]);
      return;
    }
    if (d.avoid) { d.avoid.t -= dt; if (d.avoid.t <= 0) d.avoid = null; }
    // doim harakatda: boshqa dinozavr yonida 2 s joyidan siljimay (va burilmay) turib qolsa — undan uzoq tomonga yangi maqsad
    {
      const prev = this.still.get(d.id);
      const movedNow = !prev || Math.hypot(d.x - prev.x, d.z - prev.z) > 0.01 || Math.abs(angDiff(prev.h, d.heading)) > 0.005;
      const o = this.dinos.find((q) => q !== d && this.def(q).mobile && Math.hypot(q.x - d.x, q.z - d.z) < herdRadius(def) + herdRadius(this.def(q)) + 4);
      const t = !movedNow && o && d.mode !== 'stomp' ? (prev?.t ?? 0) + dt : 0;
      this.still.set(d.id, { x: d.x, z: d.z, h: d.heading, t });
      if (o && t > 1.2) {
        this.still.set(d.id, { x: d.x, z: d.z, h: d.heading, t: 0 });
        d.avoid = { a: Math.atan2(o.z - d.z, o.x - d.x), t: 12 };
        this.stuck.set(d.id + ':nosep', 3);
        this.paths.delete(d.id);
        d.target = null;
        d.partner = null;
        if (d.mode === 'chase' || d.mode === 'flee') this.endChase(d);
        if (d.mode !== 'raid' && d.mode !== 'leave' && d.mode !== 'probe') { d.mode = 'rest'; d.timer = 0; }
        this.decide(d, nav, w);
      }
    }
    const fc = this.stuck.get(d.id + ':fcool');
    if (fc) this.stuck.set(d.id + ':fcool', Math.max(0, fc - dt));
    // bir-biriga juda yaqin qolgan bo‘lsa (tanalar deyarli tegib turibdi) — avval sekin ajralishadi
    // (ajralish uddalanmasa — 8 s ga to‘xtatiladi, joyida aylanib qolmaydi)
    const noSep = (this.stuck.get(d.id + ':nosep') ?? 0) - dt;
    this.stuck.set(d.id + ':nosep', Math.max(0, noSep));
    if (d.mode !== 'chase' && d.mode !== 'flee' && noSep <= 0) {
      const r = herdRadius(def);
      let near: HerdDino | null = null, gap = Infinity;
      for (const o of this.dinos) {
        if (o === d) continue;
        const g2 = Math.hypot(o.x - d.x, o.z - d.z) - r - herdRadius(this.def(o));
        if (g2 < 0.8 && g2 < gap) { gap = g2; near = o; }
      }
      if (near) {
        const away = Math.atan2(d.z - near.z, d.x - near.x);
        const gs = clipGroundSpeed(def, def.walk ? 'walk' : 'run');
        if (Math.cos(angDiff(d.heading, away)) > 0.3) {
          d.speed += (gs * 0.45 - d.speed) * Math.min(1, dt * 2);
          this.steer(d, dt, away, def.turnRate);
          if (!this.tryStep(d, d.speed * dt, nav, w)) {
            d.speed = 0;
            const f = (this.stuck.get(d.id + ':sep') ?? 0) + dt;
            this.stuck.set(d.id + ':sep', f);
            if (f > 1.5) { this.stuck.set(d.id + ':sep', 0); this.stuck.set(d.id + ':nosep', 8); }
          } else this.stuck.set(d.id + ':sep', 0);
          this.advanceAnim(d, dt, false);
        } else {
          this.turnInPlace(d, dt, away); // avval qadam bilan buriladi, keyin uzoqlashadi
          const f = (this.stuck.get(d.id + ':sep') ?? 0) + dt * 0.25;
          this.stuck.set(d.id + ':sep', f);
          if (f > 1.5) { this.stuck.set(d.id + ':sep', 0); this.stuck.set(d.id + ':nosep', 8); }
        }
        this.paths.delete(d.id);
        return;
      }
    }
    // qamalib qolgan (qurilish sabab atrofi toraygan): eng keng tomonga chiqib ketadi
    if (nav.clearance(d.x, d.z) < needOf(def) - 1 && d.mode !== 'chase' && d.mode !== 'flee') {
      if (this.escape(d, dt, nav, w)) return;
    }
    // katta (eski) dinozavr yonida turib qolmaydi — unga yo‘l bo‘shatadi
    if ((d.mode === 'rest' || d.mode === 'idle' || d.mode === 'look' || (d.mode === 'watch' && !d.target)) && (w.bigs ?? []).some((b) => Math.hypot(b.x - d.x, b.z - d.z) < b.len + 2)) d.timer = Math.min(d.timer, 0.5);
    // yo‘lni to‘sib turgan bo‘lsa — kutayotgan transportga yo‘l beradi (boshqa joyga ketadi)
    if ((d.mode === 'rest' || d.mode === 'idle' || d.mode === 'look' || (d.mode === 'watch' && !d.target)) && (w.vehicles ?? []).some((b) => b.waiting && Math.hypot(b.x - d.x, b.z - d.z) < herdRadius(def) + 3)) d.timer = Math.min(d.timer, 0.5);
    d.raidCool = (d.raidCool ?? between(d, RAID_CONFIG.cool[0], RAID_CONFIG.cool[1])) - dt;
    // yurmoqchi, lekin boshqa dinozavr bilan bir-birini to‘sib turibdi — 1,5 s dan keyin undan uzoqroq tomonga yangi maqsad
    if ((d.mode === 'wander' || d.mode === 'travel' || d.mode === 'follow') && d.speed < 0.02) {
      const o = this.dinos.find((q) => q !== d && this.def(q).mobile && Math.hypot(q.x - d.x, q.z - d.z) < herdRadius(def) + herdRadius(this.def(q)) + 4);
      const t = o ? (this.stuck.get(d.id + ':face') ?? 0) + dt : 0;
      this.stuck.set(d.id + ':face', t);
      if (o && t > 1.5) {
        this.stuck.set(d.id + ':face', 0);
        d.avoid = { a: Math.atan2(o.z - d.z, o.x - d.x), t: 12 };
        this.paths.delete(d.id);
        d.target = null;
        d.partner = null;
        d.mode = 'rest';
        d.timer = 0;
      }
    } else this.stuck.set(d.id + ':face', 0);
    // doim harakatda: turgan joyida boshqa dinozavr bilan yuzma-yuz qotib qolmaydi
    if ((d.mode === 'rest' || d.mode === 'idle' || d.mode === 'look' || (d.mode === 'watch' && !d.target)) && this.dinos.some((o) => o !== d && this.def(o).mobile && Math.hypot(o.x - d.x, o.z - d.z) < herdRadius(def) + herdRadius(this.def(o)) + 4)) d.timer = Math.min(d.timer, 0.4);
    switch (d.mode) {
      case 'raid': case 'leave': case 'probe': {
        if (d.mode === 'probe' && !d.target) {
          // devor yonida: shahar tomonga qarab urinadi, keyin ketadi
          const b = (w.cityTargets ?? []).find((t) => t.id === d.raidOn);
          if (b) this.turnToward(d, dt, Math.atan2((b.z0 + b.z1) / 2 - d.z, (b.x0 + b.x1) / 2 - d.x), nav); else this.settle(d, dt);
          if (d.timer <= 0) { d.raidOn = null; this.decide(d, nav, w); }
          return;
        }
        if (!this.paths.has(d.id)) {
          if (!d.target && d.mode === 'leave') d.target = this.pickOutside(d, nav, w);
          if (!d.target || (this.pathBudget > 0 && !this.plan(d, nav, d.target))) {
            if (d.mode === 'raid') { this.probe(d, nav, w); return; }
            if (d.mode === 'leave') d.target = null;
            this.settle(d, dt);
            if (d.mode === 'probe') d.timer = Math.min(d.timer, 1);
            return;
          }
          if (!this.paths.has(d.id)) { this.settle(d, dt); return; }
        }
        this.move(d, dt, nav, w, d.mode === 'leave' ? 1 : def.travelRate, d.mode === 'leave' && !!def.run);
        return;
      }
      case 'stomp': {
        // bino yonida: unga qarab, joyida qadam tashlab turadi (zarar Game da hisoblanadi)
        const b = (w.cityTargets ?? []).find((t) => t.id === d.raidOn);
        if (!b) { this.startRaid(d, nav, w, true) || this.toRest(d, 0.5, 1); return; }
        this.turnToward(d, dt, Math.atan2((b.z0 + b.z1 + 1) / 2 - d.z, (b.x0 + b.x1 + 1) / 2 - d.x), nav);
        if (d.speed === 0) { d.anim = def.look?.length ? 'look' : 'idle'; d.phase[d.anim] += dt; }
        if (d.timer <= 0 && !this.startRaid(d, nav, w, true)) this.toRest(d, 0.5, 1);
        return;
      }
      case 'rest': case 'idle': case 'look':
        this.settle(d, dt);
        // to‘xtab bo‘lmaguncha yurish animatsiyasi davom etadi (turish pozasida sirpanmasin)
        if (d.speed === 0) { if (d.mode === 'look' && def.look?.length) { d.anim = 'look'; d.phase.look += dt; } else { d.anim = 'idle'; d.phase.idle += dt; } }
        if (d.timer <= 0) this.decide(d, nav, w);
        return;
      case 'watch':
        // shahar chetiga boradi, sekin to‘xtab, shahar tomonga burilib kuzatadi
        if (d.target) {
          // shahar chetiga: yirtqich ba’zan yugurib boradi
          if (this.paths.has(d.id)) { const sp = !!d.sprint && def.diet === 'carnivore'; this.move(d, dt, nav, w, sp ? (def.run ? 1 : SPRINT.walkGaitRate) : def.wanderRate * 0.8, sp && !!def.run); return; }
          if (this.pathBudget > 0 && !this.plan(d, nav, d.target)) { this.toRest(d, 2, 4); return; }
          this.settle(d, dt);
          return;
        }
        if (d.face) this.turnToward(d, dt, Math.atan2(d.face.z - d.z, d.face.x - d.x), nav);
        if (d.timer <= 0) this.decide(d, nav, w);
        return;
      case 'wander': case 'travel': {
        const sprint = !!d.sprint && def.diet === 'carnivore';
        // yugurish: klipi bor (raptor) — yugurish klipi to‘liq tezlikda; protsedurali yurish (T-rex va b.) — tezroq qadam
        const rate = sprint ? (def.run ? 1 : SPRINT.walkGaitRate) : d.mode === 'travel' ? def.travelRate : def.wanderRate;
        if (!this.paths.has(d.id)) {
          if (d.target && this.pathBudget > 0) this.plan(d, nav, d.target);
          else if (!d.target) this.decide(d, nav, w);
          this.settle(d, dt);
          // yo‘l topilmay qoldi — uzoq kutmaydi, boshqa maqsad
          if (d.timer < -2) this.giveUp(d, nav, w);
          return;
        }
        this.move(d, dt, nav, w, rate, sprint && !!def.run);
        return;
      }
      case 'follow': {
        const o = this.dinos.find((q) => q.id === d.partner);
        if (!o || d.timer <= 0) { this.toRest(d, 2, 5); return; }
        const gap = herdRadius(def) + herdRadius(this.def(o)) + 2;
        const dist = Math.hypot(o.x - d.x, o.z - d.z);
        // yetib oldi: sherigi to‘xtab turgan bo‘lsa — to‘xtaydi; yurayotgan bo‘lsa — orqasidan yuraveradi
        if (o.speed < 0.05 && dist < gap + 1.5) {
          this.paths.delete(d.id);
          // sherigi to‘xtab turgan bo‘lsa — uzoq qotib turmaydi, ergashish tugaydi (yangi qaror)
          if (o.speed < 0.05) { const w2 = (this.stuck.get(d.id + ':f') ?? 0) + dt; this.stuck.set(d.id + ':f', w2); if (w2 > 2.5) { this.stuck.set(d.id + ':f', 0); this.toRest(d, 0.8, 2); return; } }
          const to = Math.atan2(o.z - d.z, o.x - d.x);
          if (Math.abs(angDiff(d.heading, to)) > 1.2) this.turnToward(d, dt, to, nav); else this.settle(d, dt);
          return;
        }
        if (!this.paths.has(d.id) || (d.timer % 3 < dt && this.pathBudget > 0)) {
          // sherigi orqasiga yo‘l topilmasa — ergashish tugaydi (turib qolmaydi)
          if (this.pathBudget > 0 && !this.plan(d, nav, behind(o, gap), true) && !this.paths.has(d.id)) { this.toRest(d, 0.8, 2); return; }
        }
        this.move(d, dt, nav, w, def.wanderRate);
        return;
      }
      case 'chase': {
        const o = this.dinos.find((q) => q.id === d.partner);
        if (!o || d.timer <= 0) { this.endChase(d); return; }
        const gap = herdRadius(def) + herdRadius(this.def(o)) + 1.5;
        const dist = Math.hypot(o.x - d.x, o.z - d.z);
        if (dist > CHASE.giveUpDist) { this.endChase(d); return; }
        // yetib oldi: urilmasdan sekinlashadi va qisqa vaqtdan keyin quvish tugaydi (yonida qotib turmaydi)
        if (dist < gap + 0.5) { this.paths.delete(d.id); this.settle(d, dt); if (d.speed < 0.05) d.timer = Math.min(d.timer, 1); return; }
        if ((!this.paths.has(d.id) || d.timer % 1 < dt) && this.pathBudget > 0) {
          if (!this.plan(d, nav, { x: o.x, z: o.z }, true)) { this.endChase(d); return; }
        }
        this.move(d, dt, nav, w, 1, true, Math.min(1, (dist - gap) / 4 + 0.35));
        return;
      }
      case 'flee': {
        const o = this.dinos.find((q) => q.id === d.partner);
        if (!o || o.mode !== 'chase' || d.timer <= 0) { this.endChase(d); return; }
        if (!this.paths.has(d.id) && this.pathBudget > 0) {
          const t = this.pickFlee(d, o, nav);
          if (!t || !this.plan(d, nav, t)) { this.endChase(d); return; }
        }
        this.move(d, dt, nav, w, 1, !!def.run);
        return;
      }
    }
  }

  private settle(d: HerdDino, dt: number) {
    // to‘xtaganda qolgan burilish tez so‘nadi (oyoqsiz aylanmasin)
    d.omega = (d.omega ?? 0) * Math.max(0, 1 - dt * (d.speed > 0.05 ? 3 : 5));
    d.heading += (d.omega ?? 0) * dt;
    // to‘xtash: sekinlashib bir necha qadam oldinga yuradi (joyida oyoq yugurib qolmasin); oldinda to‘siq — darhol to‘xtaydi
    d.speed = Math.max(0, d.speed - dt * Math.max(1.5, d.speed * 2.5));
    if (d.speed < 0.02) d.speed = 0;
    if (d.speed > 0 && this.navRef && this.world && !this.tryStep(d, d.speed * dt, this.navRef, this.world)) d.speed = 0;
    if (d.speed > 0) this.advanceAnim(d, dt, d.anim === 'run');
    // to‘xtadi — turish pozasiga (oyoq qadam o‘rtasida qotib qolmasin)
    else if (d.anim === 'walk' || d.anim === 'run') { d.anim = 'idle'; d.step = 0; }
  }

  /**
   * Silliq burilish: burchak tezligi darhol emas, tezlanish bilan o‘zgaradi (og‘ir tana), maqsadga yaqinlashganda
   * sekinlashadi — «robotdek» bir xil tezlikda aylanmaydi
   */
  private steer(d: HerdDino, dt: number, want: number, maxRate: number) {
    d.want = want;
    const diff = angDiff(d.heading, want);
    // katta tana yurib, yoy bo‘ylab buriladi: burilish radiusi tananing radiusidan kichik emas (ω ≤ v / R);
    // to‘xtab turganda — faqat juda sekin, qadam bilan
    const rMin = this.def(d).length * 0.35;
    // joyida (qadam bilan) burilish: og‘ir tana ~20°/s; epchil (turnRate ≥ 1, raptor) ~45°/s — to‘siq oldida tez qayriladi
    const inPlace = this.def(d).turnRate >= 1 ? 0.8 : 0.35;
    maxRate = Math.max(Math.min(maxRate, inPlace), Math.min(maxRate, d.speed / rMin));
    const wTarget = Math.max(-maxRate, Math.min(maxRate, diff * 1.8));
    const acc = maxRate * 1.4;
    const om = d.omega ?? 0;
    d.omega = om + Math.max(-acc * dt, Math.min(acc * dt, wTarget - om));
    d.heading += d.omega * dt;
    return diff;
  }

  /**
   * Yo‘nalishga burilish (kuzatish, ergashish): joy bo‘lsa — sekin yurib yoy bo‘ylab (tabiiy), joy bo‘lmasa — joyida
   * sekin. Yoy bo‘ylab yurishda oyoqlar siljishga mos qadam tashlaydi.
   */
  private turnToward(d: HerdDino, dt: number, want: number, nav: HerdNav) {
    const def = this.def(d);
    const diff = angDiff(d.heading, want);
    // ikki chegara: 0,3 rad dan katta bo‘lsa burila boshlaydi, 0,08 dan kichik bo‘lguncha davom etadi (har kadr almashmaydi)
    if (Math.abs(diff) < 0.08 || (!d.turning && Math.abs(diff) < 0.3)) { d.turning = false; d.want = want; d.omega = (d.omega ?? 0) * Math.max(0, 1 - dt * 4); this.settle(d, dt); if (d.speed === 0 && d.anim !== 'look') { d.anim = 'idle'; d.phase.idle += dt; } return; }
    d.turning = true;
    const gs = clipGroundSpeed(def, def.walk ? 'walk' : 'run');
    const creep = gs * (def.walk ? 0.45 : 0.3);
    const nx = d.x + Math.cos(d.heading) * creep * dt * 4, nz = d.z + Math.sin(d.heading) * creep * dt * 4;
    const room = nav.clearance(nx, nz) >= needOf(def) && !this.dinos.some((o) => o !== d && Math.hypot(o.x - nx, o.z - nz) < herdRadius(def) + herdRadius(this.def(o)) + 0.5);
    if (room && gs > 0) {
      d.speed += (creep - d.speed) * Math.min(1, dt * 2);
      this.steer(d, dt, want, def.turnRate * 0.8);
      if (!this.tryStep(d, d.speed * dt, nav, this.world!)) d.speed = 0;
      this.advanceAnim(d, dt, false);
      return;
    }
    this.turnInPlace(d, dt, want);
  }

  /** Joyida silliq burilish (joy yo‘q bo‘lganda): klipli modellarda oyoqlar qadam tashlaydi */
  private turnInPlace(d: HerdDino, dt: number, want: number) {
    const def = this.def(d);
    d.speed = 0;
    const before = d.heading;
    // og‘ir dinozavr ham joyida juda sekin aylanmasin (180° ~9 s, aks holda qotib qolgandek ko‘rinadi)
    const diff = this.steer(d, dt, want, Math.max(def.turnRate * 0.45, 0.35));
    const turn = d.heading - before;
    // joyida burilishda ham oyoqlar kichik qadam tashlaydi (tana qotib aylanmasin); qadam kuchi burilish tezligiga mos
    if (Math.abs(diff) > 0.05 && Math.abs(turn) > 1e-4) {
      // joyida burilish: tashqi oyoqlar aylana yoyi bo‘ylab qadam bosadi (kamida kichik qadamlar)
      const gs = clipGroundSpeed(def, def.walk ? 'walk' : 'run');
      const arc = (Math.abs(turn) / Math.max(dt, 1e-6)) * herdRadius(def) * 0.6;
      this.gait(d, dt, Math.max(arc, gs * 0.25));
    } else if (d.speed === 0) {
      d.anim = 'idle';
      d.phase.idle += dt;
    }
  }

  private advanceAnim(d: HerdDino, dt: number, run: boolean) {
    const def = this.def(d);
    // burilishda tashqi oyoqlar ham yuradi — samarali tezlik burchak tezligiga ham bog‘liq (tana qotib aylanmasin)
    this.gait(d, dt, Math.max(d.speed, Math.abs(d.omega ?? 0) * herdRadius(def) * 0.5), run);
  }

  /**
   * Qadam ritmi: tirik hayvon sekin yurganda oyoqlarini sekinlashtirilgan kinodek emas, deyarli o‘sha ritmda, lekin
   * qisqaroq qadam bilan bosadi. Shuning uchun ritm kamida 60% saqlanadi, qadam uzunligi (step) esa tezlikka mos
   * kichrayadi: step × ritm × klip tezligi = yer tezligi (oyoq sirpanmaydi; klipli modellarda klip turish pozasi
   * bilan shu nisbatda aralashtiriladi).
   */
  private gait(d: HerdDino, dt: number, eff: number, run = false) {
    const def = this.def(d);
    const kind = run && def.run ? 'run' : def.walk ? 'walk' : 'run';
    const gs = clipGroundSpeed(def, kind);
    d.anim = kind;
    if (gs <= 0 || eff <= 1e-4) { d.step = 0; return; }
    const rate = eff / gs;
    // siljishi klipga yozilgan (raptor) — turish bilan aralashtirib bo‘lmaydi; sekinlikda ham ritm kamida 50%
    // (oyoq biroz sirpanadi, lekin qotib qolmaydi), boshqalarda 60% va qadam qisqaradi
    const cadence = Math.max(rate, def.bakedMotion ? 0.5 : 0.6);
    d.step = Math.min(1, rate / cadence);
    d.phase[kind] += cadence * dt;
  }

  /** Yo‘l bo‘ylab yurish: burilish cheklangan, oldinda boshqa dinozavr bo‘lsa sekinlashadi/kutadi */
  private move(d: HerdDino, dt: number, nav: HerdNav, w: HerdWorld, rate: number, run = false, factor = 1) {
    const def = this.def(d);
    const path = this.paths.get(d.id);
    if (!path || !path.length) { this.arrive(d, nav, w); return; }
    const r0 = herdRadius(def);
    // o‘tilgan nuqtalar: yetib kelgan yoki ortda qolgan (yo‘l egrisini kesib o‘tganda) nuqtalar tashlanadi
    while (path.length) {
      const p = path[0];
      const dd = Math.hypot(p.x - d.x, p.z - d.z);
      const behindMe = (p.x - d.x) * Math.cos(d.heading) + (p.z - d.z) * Math.sin(d.heading) < 0;
      if (dd < 0.7 || (behindMe && dd < r0 + 1 && path.length > 1)) path.shift(); else break;
    }
    if (!path.length) { this.paths.delete(d.id); this.arrive(d, nav, w); return; }
    const dist = Math.hypot(path[0].x - d.x, path[0].z - d.z);
    // oldindagi nuqta: yo‘l bo‘ylab tezlikka mos masofa — nuqtadan nuqtaga keskin emas, silliq egri bo‘ylab
    let look = 1 + d.speed * 1.2, px = d.x, pz = d.z, tx = path[path.length - 1].x, tz = path[path.length - 1].z;
    for (const p of path) {
      const seg = Math.hypot(p.x - px, p.z - pz);
      if (seg >= look) { tx = px + ((p.x - px) * look) / seg; tz = pz + ((p.z - pz) * look) / seg; break; }
      look -= seg; px = p.x; pz = p.z;
    }
    // oldingi qadam rad etilgan bo‘lsa — burchakni kesmasdan, yo‘lning keyingi nuqtasiga to‘g‘ridan
    if (this.direct.delete(d.id)) { tx = path[0].x; tz = path[0].z; }
    let want = Math.atan2(tz - d.z, tx - d.x);
    // boshqa dinozavrni yon tomondan aylanib o‘tish (to‘xtab kutmaydi): oldindagi har biri uchun qarama-qarshi yonga
    // va biroz orqaga itaruvchi kuch; yon birlik vektori — maqsad yo‘nalishiga perpendikular
    {
      const r1 = herdRadius(def);
      const fx = Math.cos(want), fz = Math.sin(want), px0 = -fz, pz0 = fx;
      let ax = fx, az = fz;
      for (const o of this.dinos) {
        if (o === d) continue;
        const dx = o.x - d.x, dz = o.z - d.z, dd = Math.hypot(dx, dz) || 1e-6;
        const range = r1 + herdRadius(this.def(o)) + 3;
        if (dd > range || (dx * fx + dz * fz) / dd < -0.2) continue;
        const push = ((range - dd) / range) * 1.6;
        const side = fx * dz - fz * dx > 0 ? -1 : 1; // to‘siq chapda bo‘lsa — o‘ngga
        ax += px0 * side * push - (dx / dd) * push * 0.4;
        az += pz0 * side * push - (dz / dd) * push * 0.4;
      }
      want = Math.atan2(az, ax);
    }
    // tuyg‘ich: oldinga qarab, tana sig‘adigan va maqsadga eng yaqin yo‘nalish (tor chetga urilmasdan oldindan buriladi)
    {
      const need = needOf(def), cNow = nav.clearance(d.x, d.z), probe = Math.max(1, herdRadius(def) * 0.7);
      for (const off of [0, 0.26, -0.26, 0.52, -0.52, 0.8, -0.8]) {
        const a = want + off;
        const c1 = nav.clearance(d.x + Math.cos(a) * probe, d.z + Math.sin(a) * probe);
        const c2 = nav.clearance(d.x + Math.cos(a) * probe * 0.5, d.z + Math.sin(a) * probe * 0.5);
        if (Math.min(c1, c2) >= Math.min(need, cNow)) { want = a; break; }
      }
    }
    const diff = angDiff(d.heading, want);
    const kind = run && def.run ? 'run' : def.walk ? 'walk' : 'run';
    let vmax = clipGroundSpeed(def, kind) * (kind === 'run' && !run ? rate : run ? 1 : rate) * factor;
    // burilish qancha keskin bo‘lsa, shuncha sekin (dum keng aylanmasin) — bir tekis bog‘liqlik
    // (juda sekinlashsa, burilish ham sekin bo‘lib, dinozavr joyida sudralib aylanayotgandek ko‘rinadi — kamida 60%)
    // keskin burilishda (yo‘l burchagi) ko‘proq sekinlashadi — burilish radiusi to‘siqqa kirib ketmasin
    vmax *= Math.max(Math.abs(diff) > 1 ? 0.4 : 0.6, Math.min(1, 1 - (Math.abs(diff) - 0.4) / 2));
    const remain = path.reduce((s, p, i) => s + (i === 0 ? dist : Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z)), 0);
    if (remain < 3) vmax *= Math.max(0.35, remain / 3);
    // boshqa dinozavr oldida — sekinlashadi yoki kutadi
    const r = herdRadius(def);
    let block = false;
    for (const o of this.dinos) {
      if (o === d) continue;
      const ro = herdRadius(this.def(o));
      const dd = Math.hypot(o.x - d.x, o.z - d.z);
      // «oldinda» — borishi kerak bo‘lgan yo‘nalish bo‘yicha (aks holda ikki dinozavr bir-birini abadiy kutadi)
      const ahead = Math.cos(angDiff(want, Math.atan2(o.z - d.z, o.x - d.x))) > 0.2;
      if (ahead && dd < r + ro + 0.4) block = true;
      else if (ahead && dd < r + ro + 2) vmax *= 0.6;
    }
    // yangi bino yoki yo‘l paydo bo‘lgan bo‘lsa — yo‘l qayta hisoblanadi
    if (path.length && nav.clearance(path[0].x, path[0].z) < needOf(def) - 1) this.paths.delete(d.id);
    // qiyalik: tepaga sekinroq, pastga biroz tezroq
    const up = groundHeight(d.x + Math.cos(d.heading) * 0.6, d.z + Math.sin(d.heading) * 0.6) - groundHeight(d.x, d.z);
    vmax *= Math.max(0.55, Math.min(1.1, 1 - up * 1.3));
    // og‘ir tana: to‘liq tezlikka ~1 s da chiqadi, keskin to‘xtamaydi
    // epchil raptor tezlikni tez oladi (sekin sudralish qisqa)
    const accel = Math.max(0.25, vmax * (run ? 1.6 : 0.9) * (def.bakedMotion ? 2.5 : 1));
    if (block) {
      d.speed = Math.max(0, d.speed - dt * 3);
      // to‘xtab turganda ham yo‘nalishiga sekin buriladi — boshqa tomonga yo‘l ochilsa yura oladi
      if (d.speed === 0) this.turnInPlace(d, dt, want); else d.omega = (d.omega ?? 0) * Math.max(0, 1 - dt * 3);
      const s = (this.stuck.get(d.id) ?? 0) + dt;
      this.stuck.set(d.id, s);
      if (s > 1.5) { this.stuck.set(d.id, 0); d.avoid = { a: want, t: 12 }; this.giveUp(d, nav, w); }
    } else {
      d.speed = d.speed < vmax ? Math.min(vmax, d.speed + accel * dt) : Math.max(vmax, d.speed - accel * 1.3 * dt);
      this.steer(d, dt, want, def.turnRate * (run ? 1.3 : 1));
      // siljish aynan yangi yo‘nalish bo‘yicha tekshiriladi (burilgandan keyin)
      if (!this.tryStep(d, d.speed * dt, nav, w)) {
        // siljish rad etildi — darhol to‘xtaydi (joyida «yugurib» qolmasin), keyingi kadrda yo‘l nuqtasiga to‘g‘ridan buriladi
        d.speed = 0;
        this.direct.add(d.id);
        // manzilga juda yaqin — aynan nuqtaga tiqilmaydi, yetib keldi deb hisoblanadi
        const left = path.reduce((acc, p, i) => acc + (i === 0 ? Math.hypot(p.x - d.x, p.z - d.z) : Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z)), 0);
        if (left < herdRadius(def) + 2) { this.paths.delete(d.id); this.stuck.set(d.id, 0); this.arrive(d, nav, w); return; }
        // katta (eski) dinozavr yo‘lni to‘sdi — kutmaydi, uning qarama-qarshi tomoniga yangi maqsad
        const big = (w.bigs ?? []).find((b) => Math.hypot(b.x - d.x, b.z - d.z) < herdRadius(def) + b.len * 0.45 + 1);
        if (big) { this.stuck.set(d.id, 0); d.avoid = { a: Math.atan2(big.z - d.z, big.x - d.x), t: 15 }; this.giveUp(d, nav, w); return; }
        const s = (this.stuck.get(d.id) ?? 0) + dt;
        this.stuck.set(d.id, s);
        if (s > 1.2) { this.stuck.set(d.id, 0); d.avoid = { a: want, t: 12 }; this.giveUp(d, nav, w); }
      } else this.stuck.set(d.id, Math.max(0, (this.stuck.get(d.id) ?? 0) - dt * 0.5));
    }
    this.advanceAnim(d, dt, run);
  }

  /**
   * Yagona xavfsiz siljish: joriy yo‘nalish bo‘yicha `dist` ga. Torroq joyga (tana uchun kenglik yetmaydigan) kirmaydi,
   * eski dinozavr band qilgan kataklar va boshqa podadagilarga yaqinlashmaydi; allaqachon tor joyda bo‘lsa —
   * kengayib borayotgan tomonga ruxsat (chiqib keta olsin).
   */
  private tryStep(d: HerdDino, dist: number, nav: HerdNav, w: HerdWorld): boolean {
    if (dist <= 0) return true;
    const def = this.def(d), r = herdRadius(def), need = needOf(def);
    const nx = d.x + Math.cos(d.heading) * dist, nz = d.z + Math.sin(d.heading) * dist;
    const cNext = nav.clearance(nx, nz), cNow = nav.clearance(d.x, d.z);
    // tor joy: zaxira (need = tana + 1 katak) faqat yo‘l rejalashtirishda; qadam faqat tana haqiqatan to‘siqqa
    // yaqinlashsa rad etiladi. Aks holda yo‘ldan biroz chetga chiqqan dinozavr zaxira chegarasida har qadami rad
    // etilib, joyida qotib qolardi (yo‘nalishi o‘zgarmagani uchun burilmasdi ham).
    if (cNext < need) {
      // tana to‘siq katagiga kirmaydi (kirib qolgan bo‘lsa — faqat chiqish tomonga)
      if (this.blockedUnder(nx, nz, r, nav) > this.blockedUnder(d.x, d.z, r, nav)) return false;
      // markaz to‘siqdan kamida need − 1 masofada (allClear bilan bir xil chegara)
      if (cNext < need - 1 && cNext < cNow) return false;
    }
    const overlap = (px: number, pz: number) => {
      let n = 0;
      for (let zz = Math.floor(pz - r); zz <= Math.floor(pz + r); zz++) for (let xx = Math.floor(px - r); xx <= Math.floor(px + r); xx++) {
        if (w.dinoCells.has(xx + ',' + zz) && Math.hypot(xx + 0.5 - px, zz + 0.5 - pz) < r) n++;
      }
      return n;
    };
    const ov = overlap(nx, nz);
    if (ov > 0 && ov >= overlap(d.x, d.z)) return false;
    for (const b of w.bigs ?? []) {
      // katta (12 katakli) dinozavr bir qadam siklida oldinga uzoq joyni band qiladi — to‘liq uzunligicha masofa
      // aniq band kataklar alohida tekshiriladi — bu faqat yaqin kelmaslik uchun (katta shaharda halqa tor)
      const lim = r + b.len * 0.45;
      const dn = Math.hypot(b.x - nx, b.z - nz);
      if (dn < lim && dn < Math.hypot(b.x - d.x, b.z - d.z)) return false;
    }
    for (const b of w.vehicles ?? []) {
      const lim = r + b.r + 0.15;
      const dn = Math.hypot(b.x - nx, b.z - nz);
      if (dn < lim && dn < Math.hypot(b.x - d.x, b.z - d.z)) return false;
    }
    for (const o of this.dinos) {
      if (o === d) continue;
      const lim = r + herdRadius(this.def(o)) + 0.3;
      const dn = Math.hypot(o.x - nx, o.z - nz);
      if (dn < lim && dn < Math.hypot(o.x - d.x, o.z - d.z)) return false;
    }
    d.x = nx;
    d.z = nz;
    return true;
  }

  /** Tana doirasidagi band kataklar soni (chiqib ketishda kamayib borishi kerak) */
  private blockedUnder(x: number, z: number, r: number, nav: HerdNav) {
    let n = 0;
    for (let zz = Math.floor(z - r); zz <= Math.floor(z + r); zz++) for (let xx = Math.floor(x - r); xx <= Math.floor(x + r); xx++) {
      const qx = Math.max(xx, Math.min(x, xx + 1)), qz = Math.max(zz, Math.min(z, zz + 1));
      if ((qx - x) ** 2 + (qz - z) ** 2 <= r * r && nav.clearance(xx + 0.5, zz + 0.5) === 0) n++;
    }
    return n;
  }


  private plan(d: HerdDino, nav: HerdNav, t: { x: number; z: number }, near = false): boolean {
    this.pathBudget--;
    const def = this.def(d);
    let goal = t;
    // nishon katagi tor bo‘lsa — yaqinidagi yetarli keng joy
    if (nav.clearance(goal.x, goal.z) < needOf(def)) {
      let best: { x: number; z: number } | null = null, bd = Infinity;
      for (let rz = -5; rz <= 5; rz++) for (let rx = -5; rx <= 5; rx++) {
        const p = { x: Math.floor(t.x) + rx + 0.5, z: Math.floor(t.z) + rz + 0.5 };
        if (nav.clearance(p.x, p.z) >= needOf(def)) { const dd = Math.hypot(rx, rz); if (dd < bd) { bd = dd; best = p; } }
      }
      if (!best) return false;
      goal = best;
    }
    const city = d.mode === 'raid' || d.mode === 'leave' || d.mode === 'stomp' ? 0 : RAID_CONFIG.cityCost;
    const p = nav.findPath(d.x, d.z, goal.x, goal.z, needOf(def), near ? 6000 : 14000, city);
    if (!p || !p.length) { if (!near) d.target = null; return false; }
    this.paths.set(d.id, p);
    return true;
  }

  private arrive(d: HerdDino, nav: HerdNav, w: HerdWorld) {
    const def = this.def(d);
    if (d.target) { d.visited.push({ ...d.target }); if (d.visited.length > 6) d.visited.shift(); }
    d.target = null;
    if (d.mode === 'watch') { d.sprint = false; d.timer = between(d, 3, 6); return; }
    if (d.mode === 'flee' || d.mode === 'chase') { this.endChase(d); return; }
    if (d.mode === 'raid') { d.mode = 'stomp'; d.timer = between(d, RAID_CONFIG.stomp[0], RAID_CONFIG.stomp[1]); return; }
    if (d.mode === 'probe') { d.timer = between(d, 6, 10); return; }
    if (d.mode === 'leave') { d.raidCool = between(d, RAID_CONFIG.coolAfterEvict[0], RAID_CONFIG.coolAfterEvict[1]); d.raidOn = null; this.toRest(d, 0.5, 1.2); return; }
    // yetib keldi — biroz dam/atrofga qarash, keyin yangi qaror
    if (def.look?.length && rand(d) < 0.5) { d.mode = 'look'; d.lookIdx = Math.floor(rand(d) * def.look.length); d.phase.look = 0; d.timer = between(d, 2, 3.5); }
    else this.toRest(d, def.restTime[0] * 0.5, def.restTime[1] * 0.6);
    void nav; void w;
  }

  private toRest(d: HerdDino, a: number, b: number) {
    d.sprint = false;
    d.mode = 'rest';
    d.timer = between(d, a, b);
    d.target = null;
    d.partner = null;
    this.paths.delete(d.id);
  }

  /** Yo‘l topilmadi yoki tiqilib qoldi: teleport yo‘q — to‘xtab, boshqa maqsad */
  private giveUp(d: HerdDino, nav: HerdNav, w: HerdWorld) {
    this.paths.delete(d.id);
    if (d.target) { d.visited.push({ ...d.target }); if (d.visited.length > 6) d.visited.shift(); }
    d.target = null;
    if (d.mode === 'chase' || d.mode === 'flee') { this.endChase(d); return; }
    // qisqa to‘xtash, keyin boshqa yo‘nalish (uzoq turib qolmaydi; dam olishdan keyin yana dam tanlanmaydi)
    this.toRest(d, 0.4, 1);
    void nav; void w;
  }

  /** Tor joydan chiqish: atrofdagi (4 katakkacha) eng keng nuqtaga sekin yuradi; yo‘l topilmasa false */
  private escape(d: HerdDino, dt: number, nav: HerdNav, w: HerdWorld): boolean {
    const def = this.def(d);
    const c0 = nav.clearance(d.x, d.z);
    let best: { a: number; c: number } | null = null;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (let k = 1; k <= 4; k++) {
        const c = nav.clearance(d.x + Math.cos(a) * k, d.z + Math.sin(a) * k);
        if (c === 0) break;
        if (c > c0 && (!best || c > best.c)) best = { a, c };
      }
    }
    if (!best) return false;
    this.paths.delete(d.id);
    const gs = clipGroundSpeed(def, def.walk ? 'walk' : 'run');
    d.speed += (gs * 0.5 - d.speed) * Math.min(1, dt * 2);
    if (Math.cos(angDiff(d.heading, best.a)) < 0.3) { this.turnInPlace(d, dt, best.a); return true; }
    this.steer(d, dt, best.a, def.turnRate);
    if (!this.tryStep(d, d.speed * dt, nav, w)) { d.speed = 0; return false; }
    this.advanceAnim(d, dt, false);
    return true;
  }

  /** Yangi qaror: og‘irliklar bo‘yicha holat va qiziqish nuqtasi */
  private decide(d: HerdDino, nav: HerdNav, w: HerdWorld) {
    const def = this.def(d);
    const b = def.behave;
    // tez-tez shahar chegarasiga keladi: ochiq joy bo‘lsa — ichkariga, yo‘q bo‘lsa — devor yonida urinadi
    if (RAID_CONFIG.enabled && (d.raidCool ?? 1) <= 0 && w.cityTargets?.length && this.startRaid(d, nav, w, false)) return;
    // kam dam oladi — ko‘proq yuradi
    // doim harakatda: dam olishdan keyin yana dam olinmaydi (ketma-ket to‘xtashlar uzun qotishga aylanmasin)
    const wasResting = d.mode === 'rest' || d.mode === 'idle';
    d.sprint = false;
    const opts: [HerdMode | 'shore', number][] = [['wander', b.wander], ['travel', b.travel], ['rest', wasResting ? 0 : b.rest * 0.3], ['look', def.look?.length && !wasResting ? b.look * 0.6 : 0], ['follow', b.follow], ['watch', b.watch], ['shore', b.shore]];
    let sum = opts.reduce((s, o) => s + o[1], 0);
    let r = rand(d) * sum;
    let pick: HerdMode | 'shore' = 'rest';
    for (const [m, wgt] of opts) { if ((r -= wgt) <= 0) { pick = m; break; } }
    void sum;
    d.face = null;
    if (pick === 'rest') { this.toRest(d, def.restTime[0] * 0.5, def.restTime[1] * 0.5); return; }
    if (pick === 'look') { d.mode = 'look'; d.lookIdx = Math.floor(rand(d) * (def.look?.length ?? 1)); d.phase.look = 0; d.timer = between(d, 2, 3.5); return; }
    if (pick === 'follow') {
      // faqat o‘z guruhiga (o‘txo‘r yirtqichga ergashmaydi)
      // yaqinda ergashgan bo‘lsa — qayta ergashmaydi (hammasi bir yetakchi atrofida to‘planib turib qolmasin);
      // turgan (dam olayotgan) dinozavrga ham ergashmaydi
      const recent = (this.stuck.get(d.id + ':fcool') ?? 0) > 0;
      const mates = recent ? [] : this.dinos.filter((o) => o !== d && this.def(o).mobile && this.def(o).diet === def.diet && o.mode !== 'chase' && o.mode !== 'flee' && o.mode !== 'follow' && o.speed > 0.05 && Math.hypot(o.x - d.x, o.z - d.z) < 30);
      // triseratopslar bir-biriga ergashishni afzal ko‘radi
      mates.sort((a, c) => (c.type.startsWith('triceratops') ? 1 : 0) - (a.type.startsWith('triceratops') ? 1 : 0));
      if (mates.length) { d.mode = 'follow'; d.partner = mates[0].id; d.timer = between(d, 10, 20); this.stuck.set(d.id + ':fcool', 25 + d.timer); return; }
      pick = 'wander';
    }
    // joy turi og‘irlik bilan (har xil joyda yursin: tog‘ yonbag‘ri, vodiy, daraxtzor, o‘tloq, suv bo‘yi), keyin shu turdan nuqta
    const weights: Partial<Record<PoiKind, number>> = pick === 'watch' ? { cityEdge: 1 } : pick === 'shore' ? { shore: 1 }
      : pick === 'travel' ? { slope: 3, valley: 2.5, forest: 2, foothill: 1.5, meadow: 0.8, shore: 1 }
      : { meadow: 1.5, foothill: 1.5, forest: 1.5, slope: 1.2, valley: 1, shore: 1 };
    const [minD, maxD] = pick === 'travel' ? [14, 70] : pick === 'watch' ? [4, 60] : [5, 24];
    const byKind = new Map<PoiKind, { x: number; z: number }[]>();
    for (const k of Object.keys(weights) as PoiKind[]) for (const p of nav.pois[k]) {
      const dd = Math.hypot(p.x - d.x, p.z - d.z);
      if (dd < minD || dd > maxD) continue;
      if (d.visited.some((v) => Math.hypot(v.x - p.x, v.z - p.z) < 7)) continue; // yaqinda borgan joyga darhol qaytmaydi
      if (!this.reachable(d, p, nav, w)) continue; // devor ortidagi (boshqa hududdagi) joy emas
      if ((w.bigs ?? []).some((b) => Math.hypot(b.x - p.x, b.z - p.z) < b.len * 0.6 + 3)) continue; // katta dinozavr yonida emas
      // to‘planib qolmasin: boshqalarning maqsadi yoki turgan joyi yonidan emas
      if (this.dinos.some((o) => o !== d && ((o.target && Math.hypot(o.target.x - p.x, o.target.z - p.z) < 7) || Math.hypot(o.x - p.x, o.z - p.z) < herdRadius(def) + herdRadius(this.def(o)) + 3))) continue;
      // yaqinda tiqilgan tomonga emas
      if (d.avoid && Math.cos(angDiff(d.avoid.a, Math.atan2(p.z - d.z, p.x - d.x))) > 0.6) continue;
      // maqsad tana uchun kenglikdan kamida 1 katak keng joyda (chetga tiqilib qolmasin)
      if (nav.clearance(p.x, p.z) < needOf(def) + 1) continue;
      (byKind.get(k) ?? byKind.set(k, []).get(k)!).push(p);
    }
    let cands: { x: number; z: number }[] = [];
    if (byKind.size) {
      const ks = [...byKind.keys()];
      let r = rand(d) * ks.reduce((a, k) => a + (weights[k] ?? 0), 0);
      let kind = ks[0];
      for (const k of ks) { if ((r -= weights[k] ?? 0) <= 0) { kind = k; break; } }
      cands = byKind.get(kind)!;
    }
    if (!cands.length) {
      // yaqinida mos joy yo‘q (masalan, uzoqda qolgan) — eng yaqin qiziqish nuqtasiga uzoq yo‘l
      let best: { x: number; z: number } | null = null, bd = Infinity;
      for (const k of ['meadow', 'foothill', 'shore', 'forest', 'cityEdge'] as PoiKind[]) for (const p of nav.pois[k]) {
        const dd = Math.hypot(p.x - d.x, p.z - d.z);
        if (dd > 4 && dd < bd && nav.clearance(p.x, p.z) >= needOf(def) && this.reachable(d, p, nav, w)) { bd = dd; best = p; }
      }
      if (!best) {
        // qiziqish nuqtasi yo‘q — dam olish o‘rniga yaqin atrofda (5–10 katak) bo‘sh joyga yuradi
        for (let k = 0; k < 12 && !best; k++) {
          const a = rand(d) * Math.PI * 2, r = between(d, 5, 10);
          const p = { x: d.x + Math.cos(a) * r, z: d.z + Math.sin(a) * r };
          if (nav.clearance(p.x, p.z) >= needOf(def) && this.reachable(d, p, nav, w)) best = p;
        }
        if (!best) { this.toRest(d, 1, 2); return; }
      }
      d.mode = 'travel';
      d.target = { ...best };
      d.timer = 0;
      if (def.diet === 'carnivore' && rand(d) < SPRINT.chance) d.sprint = true;
      this.paths.delete(d.id);
      return;
    }
    const t = cands[Math.floor(rand(d) * cands.length)];
    d.mode = pick === 'shore' ? 'wander' : pick;
    d.target = { x: t.x + between(d, -0.8, 0.8), z: t.z + between(d, -0.8, 0.8) };
    d.timer = 0;
    // yirtqichlar (T-rex, spinozavr, raptor…) tez-tez yugurib o‘tadi
    if (def.diet === 'carnivore' && (d.mode === 'wander' || d.mode === 'travel' || d.mode === 'watch') && rand(d) < SPRINT.chance) d.sprint = true;
    if (pick === 'watch') d.face = { ...nav.cityCenter };
    this.paths.delete(d.id);
    void w;
  }

  /**
   * Shahar binosiga hujum: eng yaqin binolardan biri; yonidagi bo‘sh joyga yo‘l topilsa — kiradi (raid), topilmasa
   * (devor yopiq) — devor yonida urinadi (probe). near — bino yonida turib, keyingi yaqin binoga o‘tish.
   */
  private startRaid(d: HerdDino, nav: HerdNav, w: HerdWorld, near: boolean): boolean {
    const def = this.def(d);
    if (!def.mobile) return false;
    const list = (w.cityTargets ?? []).filter((t) => t.id !== d.raidOn)
      .map((t) => ({ t, dist: Math.hypot((t.x0 + t.x1 + 1) / 2 - d.x, (t.z0 + t.z1 + 1) / 2 - d.z) }))
      .filter((x) => !near || x.dist < 14).sort((a, b) => a.dist - b.dist).slice(0, 5);
    if (!list.length) return false;
    const pick = list[Math.floor(rand(d) * list.length)].t;
    const need = needOf(def);
    // bino atrofidagi tana sig‘adigan joy: binoga imkon qadar yaqin (keyin — dinozavrga yaqinrog‘i)
    let goal: { x: number; z: number } | null = null, bd = Infinity;
    for (let z = pick.z0 - 5; z <= pick.z1 + 5; z++) for (let x = pick.x0 - 5; x <= pick.x1 + 5; x++) {
      if (x >= pick.x0 && x <= pick.x1 && z >= pick.z0 && z <= pick.z1) continue;
      if (nav.clearance(x + 0.5, z + 0.5) < need) continue;
      const toB = Math.hypot(Math.max(pick.x0 - x - 0.5, 0, x + 0.5 - pick.x1 - 1), Math.max(pick.z0 - z - 0.5, 0, z + 0.5 - pick.z1 - 1));
      const dd = toB * 10 + Math.hypot(x + 0.5 - d.x, z + 0.5 - d.z) * 0.05;
      if (dd < bd) { bd = dd; goal = { x: x + 0.5, z: z + 0.5 }; }
    }
    d.raidOn = pick.id;
    d.face = null;
    d.partner = null;
    this.paths.delete(d.id);
    const p = goal && nav.regionOf(goal.x, goal.z) === nav.regionOf(d.x, d.z) ? nav.findPath(d.x, d.z, goal.x, goal.z, need, 14000) : null;
    if (p && p.length) {
      d.mode = 'raid';
      d.target = goal;
      this.paths.set(d.id, p);
      return true;
    }
    if (near) return false;
    this.probe(d, nav, w);
    return true;
  }

  /** Yo‘l yopiq: shahar chetidagi (binoga eng yaqin) joyga borib, kirishga urinadi, keyin ketadi */
  private probe(d: HerdDino, nav: HerdNav, w: HerdWorld) {
    const b = (w.cityTargets ?? []).find((t) => t.id === d.raidOn);
    d.raidCool = between(d, RAID_CONFIG.cool[0], RAID_CONFIG.cool[1]);
    if (!b) { this.toRest(d, 0.5, 1); return; }
    const bx = (b.x0 + b.x1 + 1) / 2, bz = (b.z0 + b.z1 + 1) / 2;
    const need = needOf(this.def(d));
    // binoga yaqin devor oldidagi (tashqi tomondagi) joy — shu yerda devorga urinadi
    const walls = [...(w.walls ?? [])].sort((p, q) => Math.hypot(p.x - bx, p.z - bz) - Math.hypot(q.x - bx, q.z - bz)).slice(0, 12);
    let spot: { x: number; z: number } | null = null, sd = Infinity;
    for (const c of walls) for (let dz = -need - 1; dz <= need + 1; dz++) for (let dx = -need - 1; dx <= need + 1; dx++) {
      const p = { x: c.x + dx + 0.5, z: c.z + dz + 0.5 };
      if (nav.clearance(p.x, p.z) < need || !this.reachable(d, p, nav, w)) continue;
      const dd = Math.hypot(p.x - c.x - 0.5, p.z - c.z - 0.5) * 3 + Math.hypot(p.x - d.x, p.z - d.z) * 0.1;
      if (dd < sd) { sd = dd; spot = p; }
    }
    this.paths.delete(d.id);
    if (spot) { d.mode = 'probe'; d.target = spot; d.timer = between(d, 6, 10); return; }
    const cands = nav.pois.cityEdge.filter((p) => this.reachable(d, p, nav, w) && nav.clearance(p.x, p.z) >= needOf(this.def(d)))
      .sort((p, q) => Math.hypot(p.x - bx, p.z - bz) - Math.hypot(q.x - bx, q.z - bz));
    this.paths.delete(d.id);
    if (!cands.length) { this.toRest(d, 0.5, 1); return; }
    d.mode = 'probe';
    d.target = { ...cands[0] };
    d.timer = between(d, 6, 10);
  }

  /** Shahar tashqarisidagi (chetidan kamida 5 katak) eng yaqin yetib boriladigan joy */
  private pickOutside(d: HerdDino, nav: HerdNav, w: HerdWorld, outside?: (x: number, z: number) => boolean): { x: number; z: number } | null {
    const c = w.city;
    let best: { x: number; z: number } | null = null, bd = Infinity;
    for (const k of ['cityEdge', 'meadow', 'foothill', 'forest', 'shore'] as PoiKind[]) for (const p of nav.pois[k]) {
      if (outside ? !outside(p.x, p.z) : Math.max(c.x0 - p.x, p.x - c.x1 - 1, c.z0 - p.z, p.z - c.z1 - 1) < 5) continue;
      if (nav.clearance(p.x, p.z) < needOf(this.def(d))) continue;
      const dd = Math.hypot(p.x - d.x, p.z - d.z);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best ? { ...best } : null;
  }

  /** Politsiya: shahar ichidagi dinozavrni tashqariga chiqarib yuboradi (yuguradi, zarar to‘xtaydi) */
  evict(id: string, outside?: (x: number, z: number) => boolean) {
    const d = this.dinos.find((q) => q.id === id);
    if (!d || d.mode === 'leave' || !this.navRef || !this.world) return false;
    d.mode = 'leave';
    d.raidOn = null;
    d.partner = null;
    d.face = null;
    d.target = this.pickOutside(d, this.navRef, this.world, outside);
    this.paths.delete(d.id);
    return true;
  }

  /** Dinozavr shahar ichidami (binolar chegarasi ichida) */
  inCity(d: HerdDino): boolean {
    return !!this.navRef && this.navRef.inCity(Math.floor(d.x), Math.floor(d.z));
  }

  /** Maqsad shu dinozavr hududida va himoyalangan (devor ichidagi) joy emas */
  private reachable(d: HerdDino, p: { x: number; z: number }, nav: HerdNav, w: HerdWorld) {
    // tashqaridagi dinozavr devor ichidagi joyni maqsad qilmaydi; ichkarida qolgani (teleportsiz) ichkarida yuraveradi
    if (w.inside && w.inside(p.x, p.z) && !w.inside(d.x, d.z)) return false;
    const a = nav.regionOf(d.x, d.z);
    return !a || nav.regionOf(p.x, p.z) === a;
  }

  private pickFlee(d: HerdDino, o: HerdDino, nav: HerdNav) {
    const away = Math.atan2(d.z - o.z, d.x - o.x);
    let best: { x: number; z: number } | null = null, bs = -Infinity;
    for (const k of ['meadow', 'foothill', 'forest'] as PoiKind[]) for (const p of nav.pois[k]) {
      const dd = Math.hypot(p.x - d.x, p.z - d.z);
      if (dd < 10 || dd > 26) continue;
      if (nav.clearance(p.x, p.z) < needOf(this.def(d)) + 1) continue;
      if (this.world && !this.reachable(d, p, nav, this.world)) continue; // yopiq shahar ichiga qochmaydi
      const s = Math.cos(angDiff(away, Math.atan2(p.z - d.z, p.x - d.x))) * 10 - dd * 0.1 + rand(d);
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }

  /** Qisqa quvishlar: ko‘pi bilan 2 juft, har biri bitta juftda; nishon yaqin va yo‘l bilan yetib boriladigan */
  private manageChases(dt: number, nav: HerdNav) {
    this.chaseCheck -= dt;
    if (this.chaseCheck > 0) return;
    this.chaseCheck = 2;
    const active = this.dinos.filter((d) => d.mode === 'chase').length;
    if (active >= CHASE.maxPairs) return;
    const free = (d: HerdDino) => this.def(d).mobile && d.cooldown <= 0 && d.mode !== 'chase' && d.mode !== 'flee' && !d.partner && d.mode !== 'raid' && d.mode !== 'stomp' && d.mode !== 'leave' && d.mode !== 'probe';
    for (const c of this.dinos) {
      if (!free(c) || !this.def(c).canChase || rand(c) > 0.4) continue;
      const targets = this.dinos.filter((t) => t !== c && free(t) && Math.hypot(t.x - c.x, t.z - c.z) < CHASE.maxDist);
      if (!targets.length) continue;
      const t = targets[Math.floor(rand(c) * targets.length)];
      if (this.pathBudget <= 0) return;
      if (!this.plan(c, nav, { x: t.x, z: t.z }, true)) continue;
      const dur = between(c, CHASE.durMin, CHASE.durMax);
      c.mode = 'chase'; c.partner = t.id; c.timer = dur;
      t.mode = 'flee'; t.partner = c.id; t.timer = dur + 1;
      this.paths.delete(t.id);
      return;
    }
  }

  private endChase(d: HerdDino) {
    const p = this.dinos.find((q) => q.id === d.partner);
    for (const x of p ? [d, p] : [d]) {
      if (x.mode !== 'chase' && x.mode !== 'flee') continue;
      x.cooldown = between(x, CHASE.coolMin, CHASE.coolMax);
      this.toRest(x, 3, 6);
    }
  }

  /** Saqlash uchun (yo‘llar saqlanmaydi — qayta hisoblanadi) */
  serialize(): HerdDino[] {
    return this.dinos.map((d) => structuredClone(d));
  }

  /** Tekshiruv: har tana xavfsiz joyda (bino, suv, tog‘, shahar ichi emas) */
  allClear(): boolean {
    if (!this.nav) return true;
    return this.dinos.every((d) => this.nav!.clearance(d.x, d.z) >= needOf(this.def(d)) - 1 && this.bodyCells(d).every((c) => this.nav!.clearance(c.x + 0.5, c.z + 0.5) > 0));
  }

  pathOf(id: string) {
    return this.paths.get(id) ?? null;
  }
}

function cityDist(c: HerdWorld['city'], x: number, z: number) {
  return Math.max(c.x0 - x, 0, x - c.x1, c.z0 - z, 0, z - c.z1);
}

/** Tana (radiusi bilan) butunlay qurilish xaritasidan tashqarida */
function outsideMap(def: HerdDef, p: { x: number; z: number }) {
  const r = herdRadius(def) + 1;
  return [[0, 0], [-r, 0], [r, 0], [0, -r], [0, r], [-r, -r], [r, r], [-r, r], [r, -r]].every(([dx, dz]) => !inBounds(Math.floor(p.x + dx), Math.floor(p.z + dz)));
}

function behind(o: HerdDino, gap: number) {
  return { x: o.x - Math.cos(o.heading) * gap, z: o.z - Math.sin(o.heading) * gap };
}

function sanitize(d: HerdDino): HerdDino {
  const def = HERD_BY_TYPE[d.type];
  const ph = d.phase ?? { idle: 0, walk: 0, run: 0, look: 0 };
  // yaroqsiz maqsad/sherik — tinch holatga
  const mode: HerdMode = !def.mobile ? (d.face ? 'watch' : 'rest') : d.mode === 'chase' || d.mode === 'flee' || d.mode === 'follow' || d.mode === 'raid' || d.mode === 'stomp' || d.mode === 'probe' ? 'rest' : d.mode;
  return {
    ...d, mode, partner: mode === 'rest' ? null : d.partner, speed: 0, timer: Number.isFinite(d.timer) ? Math.max(0.5, d.timer) : 2,
    visited: Array.isArray(d.visited) ? d.visited.slice(-6) : [], phase: { idle: ph.idle || 0, walk: ph.walk || 0, run: ph.run || 0, look: ph.look || 0 },
    anim: 'idle', rng: d.rng | 0 || 1,
  };
}

export function isHerdDino(v: unknown): v is HerdDino {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return typeof d.id === 'string' && typeof d.type === 'string' && d.type in HERD_BY_TYPE
    && [d.x, d.z, d.heading].every((n) => typeof n === 'number' && Number.isFinite(n));
}
