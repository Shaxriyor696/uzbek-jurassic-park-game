import { inBounds, isWater, LAND_MAX, LAND_MIN, MAP_CONFIG, MAP_MAX, MAP_MIN, type Occupancy } from './grid';
import { terrainBlocksDino, terrainFordable } from './terrain';

/** Asl xarita (0..CORE-1) — boshlang‘ich shahar hududi */
const CORE = MAP_CONFIG.coreSize;

/**
 * Yuradigan dinozavr (public/models/apato.glb) — domen qismi: joy, yo‘nalish, holat, to‘siqlar. O‘yin vaqtida
 * (Game.update dagi qadam — pauzada to‘xtaydi, katta dt cheklangan) ishlaydi va saqlanadi. Renderer faqat holatni chizadi.
 *
 * Animatsiya haqida (fayldan o‘lchangan, three/dinoWalker.ts runtime da qayta hisoblaydi):
 *  - skelet yo‘q; 5 mesh × 121 morph target, bitta klip «EFS1_AllParts_DirectCubicBSpline.001», 14,58 s;
 *  - klip ichida haqiqiy oldinga yurish bor (0,62 → 4,96 s): oyoqlar navbat bilan ko‘tariladi, yerdagi oyoq
 *    sirpanmaydi, tana model fazosida ~10,85 birlik oldinga siljiydi (root motion vertekslarda);
 *  - 4,96–5,75 s — to‘rt oyoq yerda (dam pozasi).
 * Shuning uchun xaritadagi siljish klipning o‘z root motion idan olinadi (oyoqlar o‘rtasi — «anchor»), ikki marta
 * qo‘shilmaydi. Yurish qadamlari orasida tA ↔ tB o‘tishi morph og‘irliklarini blend qilib bajariladi.
 */
export const DINO = {
  /** Standart uzunlik (katak; 1 katak = 10 m) — har dinozavrning o‘z uzunligi DinoState.len da */
  LENGTH_CELLS: 12,
  /** Model fazosi (GLB, dam pozasi): dum va bosh uchlari X bo‘yicha, yarim kenglik */
  TAIL_X: -50.3,
  HEAD_X: 29.4,
  HALF_WIDTH: 5.2,
  /** Klip vaqtlari (o‘lchangan) */
  T_A: 0.62,
  T_B: 4.96,
  T_R: 5.75,
  /**
   * Uzluksiz yurish sikli (o‘lchangan): 1,17 → 4,88 s — har oyoq bir marta qadam tashlaydi, siljishdan keyin oyoqlar
   * farqi 1,2, dum 0,8 birlik. Sikllar orasida ikkala poza davom etib turgan holda qisqa blend — to‘xtash yo‘q.
   */
  L0: 1.17,
  L1: 4.88,
  LOOP_FADE_S: 0.25,
  /**
   * Orqaga qadam tashlash: klipning 5,75 → 10,17 s qismi (tana ~7,5 birlik orqaga), so‘ng to‘rt oyoq yerda turgan
   * qism 13,5 s gacha davom etadi — u yerdan oldinga yurish boshiga (0,62 s) poza farqi eng kichik (o‘lchangan: 1,26).
   */
  T_BACK_END: 13.5,
  /** Yurishda klip tezligi; dam paytida (yengil chayqalish) */
  RATE: 1.5,
  /** Shu uzunlikdagi dinozavr RATE bilan yuradi; boshqalari yer bo‘ylab bir xil tezlikda yurishi uchun moslanadi */
  RATE_REF_LEN: 10.5,
  REST_RATE: 0.3,
  /** Qadam sikllari orasidagi blend (o‘yin soniyasi) */
  FADE_S: 0.35,
  TURN_DEG_S: 10,
  PIVOT_DEG_S: 8,
  REST_MIN: 2,
  REST_MAX: 5,
  /** Har qadam siklidan keyin dam olish ehtimoli */
  REST_CHANCE: 0.06,
  /** Tana atrofidagi bo‘sh masofa (katak) */
  MARGIN: 0.22,
  /** Paydo bo‘lish uchun eng katta bo‘sh chetki hudud qidiruvi (katak) */
  ZONE_MIN: 8,
  ZONE_MAX: 26,
};

/** O‘yindagi dinozavrlar: katta (12 katak) va biroz kichikroq (9 katak). */
/**
 * Tananing haqiqiy konturi — klipning ishlatiladigan barcha qismlarida (0,62–13,5 s) oyoqlar markaziga nisbatan
 * o‘lchangan (model birligi): X = −56 (dum uchi) … +36 (bosh), har 4 birlikda eng katta yon chetlanish |Z|.
 * Dum yurishda yonga 21 birlikkacha chayqaladi, bo‘yin 7 gacha — to‘qnashuv shu kontur bilan tekshiriladi.
 */
export const BODY_OUTLINE = {
  x0: -56,
  step: 4,
  half: [11.6, 20.2, 21.1, 20.8, 19.3, 17.3, 14.6, 12.0, 9.0, 7.2, 5.4, 5.0, 5.6, 6.0, 6.0, 5.0, 4.4, 3.7, 3.4, 4.2, 5.7, 6.9, 4.7],
};

export const DINO_SPECS: { len: number; seed: number }[] = [
  { len: 12, seed: 7 },
  { len: 9, seed: 13 },
];

/** Klip tezligi: kattasi sekinroq, kichigi tezroq qadam tashlaydi — yer bo‘ylab tezligi bir xil (bir-biriga yetib olmaydi) */
export const rateOf = (s: { len: number }) => (DINO.RATE * DINO.RATE_REF_LEN) / s.len;

/** Model birligi → katak (uzunlikka qarab) */
export const scaleOf = (len: number) => len / (DINO.HEAD_X - DINO.TAIL_X);
export const DINO_SCALE = scaleOf(DINO.LENGTH_CELLS);

/** Klipdan olingan root-motion profili: har kalit kadrda oyoqlar o‘rtasining X koordinatasi (model birligi). */
export interface DinoProfile {
  times: number[];
  feetX: number[];
  tA: number;
  tB: number;
  tR: number;
}

export interface DinoZone { x0: number; z0: number; x1: number; z1: number }

export interface DinoState {
  /** Uzunligi (katak) */
  len: number;
  /** Oyoqlar o‘rtasi (anchor), katak koordinatasida (uzluksiz) */
  ax: number;
  az: number;
  /** Yo‘nalish (radian): 0 = +X, π/2 = +Z */
  heading: number;
  mode: 'walk' | 'fade' | 'rest' | 'pivot' | 'back';
  /** Blend tugagach: yurish yoki dam (orqaga qadamdan keyin). Eski saqlanmalarda yo‘q — 'walk' */
  fadeNext?: 'walk' | 'rest';
  /** Joriy klip vaqti */
  t: number;
  /** Blend: f1 → f2, fa 0..1 */
  f1: number;
  f2: number;
  fa: number;
  /** Blend paytida ikkala klip vaqti ham oldinga yuradi (uzluksiz yurish sikli) */
  fadeAdvance?: boolean;
  /** Joriy sikl oxirida to‘xtab dam oladi */
  pendingRest?: boolean;
  /** Ketma-ket necha marta hech qayoqqa yo‘l topilmadi (tiqilib qolishdan chiqish uchun) */
  stuck?: number;
  /** Ushbu qadam sikli uchun yo‘nalish (silliq burilish) */
  walkHeading: number;
  pivotTo: number;
  restLeft: number;
  pingDir: number;
  /** Maqsad nuqta */
  tx: number;
  tz: number;
  hasTarget: boolean;
  /** Rejalashtirilgan sikl oxiri */
  ex: number;
  ez: number;
  eh: number;
  /** Rejalashtirilgan siklning simulyatsiya qilingan pozalari [x, z, h, ...] — tekshirilgan va qurilish uchun band */
  path: number[];
  zone: DinoZone;
  seed: number;
}

export interface DinoWorld {
  occ: Occupancy;
  /** Qo‘shimcha band kataklar (boshqa dinozavrlar) */
  extra?: Set<string>;
  /** Boshqa dinozavrlar (maqsad tanlashda ulardan uzoqroq joy afzal) */
  others?: { x: number; z: number; len: number }[];
}

// ---------------- yordamchilar ----------------

export function feetAt(p: DinoProfile, t: number): number {
  const ts = p.times;
  if (t <= ts[0]) return p.feetX[0];
  if (t >= ts[ts.length - 1]) return p.feetX[ts.length - 1];
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (ts[m] <= t) lo = m;
    else hi = m;
  }
  const k = (t - ts[lo]) / (ts[hi] - ts[lo]);
  return p.feetX[lo] + (p.feetX[hi] - p.feetX[lo]) * k;
}

function rnd(s: DinoState) {
  s.seed = (s.seed * 16807) % 2147483647;
  return s.seed / 2147483647;
}

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Tana kapsulasi (dumdan boshgacha) egallagan kataklar. */
export function bodyCells(_p: DinoProfile, ax: number, az: number, h: number, len: number = DINO.LENGTH_CELLS): { x: number; z: number }[] {
  const s = scaleOf(len);
  const c = Math.cos(h), sn = Math.sin(h);
  const O = BODY_OUTLINE;
  const out = new Map<string, { x: number; z: number }>();
  const x1 = O.x0 + O.step * O.half.length;
  const n = Math.ceil(((x1 - O.x0) * s) / 0.25);
  for (let i = 0; i <= n; i++) {
    const lx = O.x0 + ((x1 - O.x0) * i) / n;
    const bi = Math.min(O.half.length - 1, Math.floor((lx - O.x0) / O.step));
    const d = lx * s;
    const px = ax + c * d, pz = az + sn * d;
    const r = O.half[bi] * s + DINO.MARGIN;
    for (let x = Math.floor(px - r); x <= Math.floor(px + r); x++) {
      for (let z = Math.floor(pz - r); z <= Math.floor(pz + r); z++) {
        const nx = Math.max(x, Math.min(px, x + 1)), nz = Math.max(z, Math.min(pz, z + 1));
        if ((nx - px) ** 2 + (nz - pz) ** 2 <= r * r) out.set(x + ',' + z, { x, z });
      }
    }
  }
  return [...out.values()];
}

function cellFree(w: DinoWorld, zone: DinoZone, x: number, z: number) {
  if (x < zone.x0 || z < zone.z0 || x > zone.x1 || z > zone.z1) return false;
  // xarita tashqarisi — o‘tloq halqasi (qurilish yo‘q); faqat g‘arbdagi kirish yo‘li to‘siq
  // xarita tashqarisi — o‘tloq halqasi. U yerga ham bino/yo‘l qurilgan bo‘lishi mumkin — har qanday qurilgan obyekt
  // (bino, yo‘l, qurilish maydoni) to‘siq; faqat boshlang‘ich kirish yo‘li (obyekt emas, faqat bezak) to‘siq emas
  // tog‘ (tik yoki baland relyef) — dinozavr tog‘ ichidan o‘tmaydi, faqat tekis/yumshoq yerda yuradi
  // sayoz soydan kechib o‘tadi (u shahar atrofini aylanib oqadi); ko‘l va asl daryo — to‘siq
  if (terrainBlocksDino(x, z) || (isWater(x, z) && !terrainFordable(x, z))) return false;
  if (!inBounds(x, z)) return w.occ.get(x, z) === null && !w.extra?.has(x + ',' + z);
  return !isWater(x, z) && w.occ.get(x, z) === null && !w.extra?.has(x + ',' + z);
}

export function bodyClear(p: DinoProfile, w: DinoWorld, zone: DinoZone, ax: number, az: number, h: number, len: number = DINO.LENGTH_CELLS): boolean {
  return bodyCells(p, ax, az, h, len).every((c) => cellFree(w, zone, c.x, c.z));
}

/** Bir sikldagi oldinga siljish (katak). */
export function strideCells(p: DinoProfile, len: number = DINO.LENGTH_CELLS) {
  return (feetAt(p, p.tB) - feetAt(p, p.tA)) * scaleOf(len);
}

// ---------------- zona va paydo bo‘lish ----------------

/** Yurish hududi — butun xarita: dinozavr bo‘sh tabiat yerida yuradi; binolar, yo‘llar va suv uni chegaralaydi. */
export const WHOLE_MAP: DinoZone = { x0: MAP_MIN, z0: MAP_MIN, x1: MAP_MAX, z1: MAP_MAX };

/** Xarita atrofidagi o‘tloq halqasi kengligi (katak) — environment.ts da bu masofada daraxt yo‘q */
export const NATURE_RING = 16;

/**
 * Tabiat hududi: xaritaning bo‘sh yeri + atrofidagi o‘tloq halqasi. Halqada qurilish yo‘q, shuning uchun katta
 * dinozavrlar shaharga xalaqit bermay keng joyda yuradi.
 */
export const NATURE_ZONE: DinoZone = { x0: -NATURE_RING, z0: -NATURE_RING, x1: CORE - 1 + NATURE_RING, z1: CORE - 1 + NATURE_RING };

/** Yer (o‘tloq) chegarasi — grid.ts dagi LAND dan biroz ichkarida */
const LAND = { min: LAND_MIN + 2, max: LAND_MAX - 2 };
/** Shahar chegarasi (barcha qurilgan obyektlar + xarita) — marshrut va hudud shunga qarab quriladi */
const CITY = { x0: 0, z0: 0, x1: CORE - 1, z1: CORE - 1 };

/**
 * Shahar chegarasini yangilaydi (Game.recompute). Xarita tashqarisiga ham qurish mumkin bo‘lgani uchun marshrut
 * qat’iy emas: shahar to‘rtburchagidan PATROL_OFFSET tashqarida; hudud — undan NATURE_RING gacha (yer chegarasida).
 */
export function setDinoLayout(b: { x0: number; z0: number; x1: number; z1: number }) {
  Object.assign(CITY, b);
  NATURE_ZONE.x0 = Math.max(LAND.min, b.x0 - NATURE_RING);
  NATURE_ZONE.z0 = Math.max(LAND.min, b.z0 - NATURE_RING);
  NATURE_ZONE.x1 = Math.min(LAND.max, b.x1 + NATURE_RING);
  NATURE_ZONE.z1 = Math.min(LAND.max, b.z1 + NATURE_RING);
}

/**
 * Shahar chetidagi eng katta butunlay bo‘sh (bino, yo‘l, suv yo‘q) kvadrat hudud — dinozavrlar shu yerda paydo bo‘ladi. Hech narsa buzilmaydi;
 * topilmasa null.
 */
export function findZone(occ: Occupancy, min = DINO.ZONE_MIN, max = DINO.ZONE_MAX): DinoZone | null {
  // boshlang‘ich shahar (asl 0..CORE-1) chetidagi bo‘sh hudud — dinozavr shu tomonda paydo bo‘ladi
  const free = (x: number, z: number) => !isWater(x, z) && !terrainBlocksDino(x, z) && occ.get(x, z) === null;
  // ball: chetga yaqinlik muhimroq (shahar markazi qurilish uchun ochiq qoladi), keyin kattalik
  let best: DinoZone | null = null;
  let bestScore = Infinity;
  for (let S = max; S >= min; S--) {
    for (let z0 = 0; z0 + S <= CORE; z0++) {
      for (let x0 = 0; x0 + S <= CORE; x0++) {
        const edge = Math.min(x0, z0, CORE - (x0 + S), CORE - (z0 + S));
        const score = edge * 2 - S;
        if (score >= bestScore) continue;
        let ok = true;
        for (let z = z0; z < z0 + S && ok; z++) for (let x = x0; x < x0 + S && ok; x++) if (!free(x, z)) ok = false;
        if (ok) {
          best = { x0, z0, x1: x0 + S - 1, z1: z0 + S - 1 };
          bestScore = score;
        }
      }
    }
  }
  return best;
}

export function spawnDino(p: DinoProfile, w: DinoWorld, zone: DinoZone, seed = 7, len: number = DINO.LENGTH_CELLS, near?: { x: number; z: number }, needTurn = true): DinoState | null {
  const cx = near?.x ?? (zone.x0 + zone.x1 + 1) / 2, cz = near?.z ?? (zone.z0 + zone.z1 + 1) / 2;
  const s: DinoState = {
    len, ax: cx, az: cz, heading: 0, mode: 'rest', t: p.tB, f1: p.tB, f2: p.tB, fa: 0, walkHeading: 0, pivotTo: 0,
    restLeft: 2, pingDir: 1, tx: cx, tz: cz, hasTarget: false, ex: cx, ez: cz, eh: 0, path: [], zone, seed: Math.max(1, seed | 0),
  };
  // markazdan boshlab zona bo‘ylab bo‘sh joy (boshqa dinozavr band qilgan kataklar ham hisobga olinadi)
  const spots: [number, number][] = [];
  for (let z = zone.z0 + 1; z <= zone.z1; z += 1) for (let x = zone.x0 + 1; x <= zone.x1; x += 1) spots.push([x, z]);
  spots.sort((a, b2) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b2[0] - cx, b2[1] - cz));
  // joyida to‘liq aylana oladigan joy (dum va bo‘yin sektori bo‘sh) — aks holda tor joyda tiqilib qoladi
  for (const [x, z] of spots) {
    let full = true;
    for (let i = 0; i < 24 && full && needTurn; i++) full = bodyClear(p, w, zone, x, z, (i / 24) * Math.PI * 2, len);
    if (!full) continue;
    for (let i = 0; i < 8; i++) {
      const h = (i / 8) * Math.PI * 2 + (seed % 8) * 0.39;
      if (bodyClear(p, w, zone, x, z, h, len)) {
        Object.assign(s, { ax: x, az: z, tx: x, tz: z, ex: x, ez: z });
        s.heading = s.walkHeading = s.pivotTo = s.eh = h;
        return s;
      }
    }
  }
  return null;
}

/** Marshrut nuqtasida, marshrut yo‘nalishiga qaratib joylashtirish (bo‘sh bo‘lsa). */
export function spawnOnPath(p: DinoProfile, w: DinoWorld, spec: { len: number; seed: number }, index: number): DinoState | null {
  const path = patrolPath();
  for (let k = 0; k < path.length; k += 6) {
    const i = (index + k) % path.length;
    const a = path[i], b = path[(i + 4) % path.length];
    const h = Math.atan2(b.z - a.z, b.x - a.x);
    if (!bodyClear(p, w, NATURE_ZONE, a.x, a.z, h, spec.len)) continue;
    const s = spawnDino(p, w, NATURE_ZONE, spec.seed, spec.len, { x: a.x, z: a.z }, false);
    if (!s) continue;
    Object.assign(s, { ax: a.x, az: a.z, tx: a.x, tz: a.z, ex: a.x, ez: a.z, heading: h, walkHeading: h, pivotTo: h, eh: h, restLeft: 0.5 });
    return s;
  }
  return null;
}

/** Yuklangan holat hali yaroqlimi (tana bo‘sh joyda, raqamlar to‘g‘ri). */
export function dinoValid(p: DinoProfile, w: DinoWorld, s: DinoState): boolean {
  const nums = [s.ax, s.az, s.heading, s.t, s.fa, s.restLeft];
  if (!nums.every(Number.isFinite)) return false;
  return bodyClear(p, w, s.zone, s.ax, s.az, s.heading, s.len);
}

/** Qurilish taqiqlangan kataklar: hozirgi tana va rejalashtirilgan sikl oxiri (yoki burilish sektori). */
/**
 * Qurilish taqiqlangan kataklar: hozirgi tana va rejalashtirilgan sikl (yo‘l pozalari yoki burilish sektori).
 * Natija reja o‘zgarguncha keshlanadi — har kadrda qayta hisoblanmaydi (yurish paytida tana rejalashtirilgan
 * yo‘l ichida bo‘ladi).
 */
const reservedCache = new WeakMap<DinoState, { key: string; set: Set<string> }>();
export function reservedCells(p: DinoProfile, s: DinoState): Set<string> {
  const moving = s.mode === 'walk' || s.mode === 'fade' || s.mode === 'back';
  const key = moving
    ? `m|${s.len}|${s.path.length ? s.path.join(',') : `${s.ax},${s.az}`}|${s.ex},${s.ez},${s.eh}`
    : `${s.mode}|${s.len}|${s.ax.toFixed(3)},${s.az.toFixed(3)}|${s.mode === 'pivot' ? s.pivotTo.toFixed(3) : s.heading.toFixed(3)}`;
  const hit = reservedCache.get(s);
  if (hit && hit.key === key) return hit.set;
  const set = new Set<string>();
  const add = (ax: number, az: number, h: number) => { for (const c of bodyCells(p, ax, az, h, s.len)) set.add(c.x + ',' + c.z); };
  if (moving && s.path.length) {
    for (let i = 0; i + 2 < s.path.length; i += 3) add(s.path[i], s.path[i + 1], s.path[i + 2]);
    add(s.ex, s.ez, s.eh);
  } else add(s.ax, s.az, s.heading);
  if (moving) add(s.ax, s.az, s.heading);
  if (s.mode === 'pivot') {
    const d = angDiff(s.pivotTo, s.heading);
    for (let k = 1; k <= 6; k++) add(s.ax, s.az, s.heading + (d * k) / 6);
  }
  reservedCache.set(s, { key, set });
  return set;
}

// ---------------- harakat ----------------

/**
 * Maqsad nuqta: bir nechta nomzod baholanadi — u yerda tana sig‘ishi shart, ko‘proq yo‘nalishga burila oladigan
 * (ochiq) va boshqa dinozavrlardan uzoq joy afzal. Shunda burchak va chetlarga tiqilib qolmaydi.
 */
function pickTarget(p: DinoProfile, w: DinoWorld, s: DinoState) {
  const z = s.zone;
  const m = Math.min(s.len * 0.4, (z.x1 - z.x0) / 3);
  let best: { x: number; z: number; score: number } | null = null;
  for (let i = 0; i < 16; i++) {
    const local = i % 3 !== 0;
    const rr = s.len * 2.5;
    const tx = local ? s.ax + (rnd(s) * 2 - 1) * rr : z.x0 + m + rnd(s) * (z.x1 + 1 - z.x0 - 2 * m);
    const tz = local ? s.az + (rnd(s) * 2 - 1) * rr : z.z0 + m + rnd(s) * (z.z1 + 1 - z.z0 - 2 * m);
    if (tx < z.x0 + m || tz < z.z0 + m || tx > z.x1 + 1 - m || tz > z.z1 + 1 - m) continue;
    const dist = Math.hypot(tx - s.ax, tz - s.az);
    if (dist < s.len * 0.5) continue;
    const h = Math.atan2(tz - s.az, tx - s.ax);
    if (!bodyClear(p, w, z, tx, tz, h, s.len)) continue;
    let open = 0;
    for (let k = 0; k < 4; k++) if (bodyClear(p, w, z, tx, tz, (k / 4) * Math.PI * 2, s.len)) open += 2;
    const away = w.others?.length ? Math.min(...w.others.map((o) => Math.hypot(o.x - tx, o.z - tz) / ((o.len + s.len) * 0.5))) : 2;
    const score = open * 2 + Math.min(away, 2) * 3 + rnd(s);
    if (!best || score > best.score) best = { x: tx, z: tz, score };
  }
  if (best) {
    s.tx = best.x;
    s.tz = best.z;
    s.hasTarget = true;
    return;
  }
  s.hasTarget = false;
}

function startRest(s: DinoState, p: DinoProfile, secs: number) {
  s.restLeft = secs;
  s.pingDir = 1;
  if (s.t < p.tB - 1e-6 || s.t > p.tR + 1e-6) {
    // boshqa pozadan (masalan, orqaga qadam oxiri) dam pozasiga sakramasdan — blend orqali
    s.mode = 'fade';
    s.f1 = s.t;
    s.f2 = p.tB;
    s.fa = 0;
    s.fadeNext = 'rest';
    s.fadeAdvance = false;
    s.walkHeading = s.heading;
    return;
  }
  s.mode = 'rest';
}

/**
 * Keyingi qadam siklini rejalashtiradi. Yo‘nalish: maqsad tomon, bir siklda ko‘pi bilan TURN_DEG_S × davomiylik
 * buriladi; oxirgi va o‘rta pozada tana bo‘sh joyda bo‘lishi tekshiriladi. Yo‘l yopiq bo‘lsa — boshqa yo‘nalish,
 * joyida sekin burilish yoki xavfsiz joyda dam.
 */
// ---------------- marshrut: shahar atrofidagi o‘tloq halqasi ----------------

/** Marshrut xarita chetidan shuncha katak tashqarida (halqa o‘rtasi) */
export const PATROL_OFFSET = 8;

let patrolCache: { key: string; pts: { x: number; z: number }[] } | null = null;
/**
 * Shahar atrofidagi yopiq marshrut (burchaklari yumaloq to‘rtburchak, 0,5 katak qadamli nuqtalar). Xaritadan
 * tashqarida — binolar, yo‘llar va qurilish maydonlari ustidan o‘tmaydi.
 */
export function patrolPath(): { x: number; z: number }[] {
  const x0 = Math.max(LAND.min + 6, CITY.x0 - PATROL_OFFSET), x1 = Math.min(LAND.max - 5, CITY.x1 + 1 + PATROL_OFFSET);
  const z0 = Math.max(LAND.min + 6, CITY.z0 - PATROL_OFFSET), z1 = Math.min(LAND.max - 5, CITY.z1 + 1 + PATROL_OFFSET);
  const key = `${x0},${x1},${z0},${z1}`;
  if (patrolCache?.key === key) return patrolCache.pts;
  const r = 6; // r ≤ PATROL_OFFSET — burchakda ham shahardan kamida PATROL_OFFSET masofa
  const pts: { x: number; z: number }[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.5));
    for (let i = 0; i < n; i++) pts.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n });
  };
  const arc = (cx: number, cz: number, a0: number) => {
    const n = Math.round((Math.PI / 2) * r / 0.5);
    for (let i = 0; i < n; i++) { const t = a0 + (Math.PI / 2) * (i / n); pts.push({ x: cx + Math.cos(t) * r, z: cz + Math.sin(t) * r }); }
  };
  line(x0 + r, z0, x1 - r, z0); arc(x1 - r, z0 + r, -Math.PI / 2);
  line(x1, z0 + r, x1, z1 - r); arc(x1 - r, z1 - r, 0);
  line(x1 - r, z1, x0 + r, z1); arc(x0 + r, z1 - r, Math.PI / 2);
  line(x0, z1 - r, x0, z0 + r); arc(x0 + r, z0 + r, Math.PI);
  patrolCache = { key, pts };
  return pts;
}

/** Marshrut bo‘yicha oldindagi nuqta (eng yaqin nuqtadan tana uzunligicha oldinda) — silliq yoy bo‘ylab yuradi. */
function patrolTarget(s: DinoState) {
  const path = patrolPath();
  let bi = 0, bd = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = (path[i].x - s.ax) ** 2 + (path[i].z - s.az) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  const ahead = Math.round((s.len * 1.1) / 0.5);
  const t = path[(bi + ahead) % path.length];
  s.tx = t.x;
  s.tz = t.z;
  s.hasTarget = true;
}

function planBout(p: DinoProfile, w: DinoWorld, s: DinoState, fromT: number) {
  // doim marshrut bo‘ylab: shahar atrofida aylanib yuradi (bir joyda tiqilib qolmaydi)
  patrolTarget(s);
  void pickTarget;
  if (!s.hasTarget) {
    // aniq maqsad topilmadi — hudud markazi tomon (chet va burchakka emas)
    s.tx = (s.zone.x0 + s.zone.x1 + 1) / 2;
    s.tz = (s.zone.z0 + s.zone.z1 + 1) / 2;
    s.hasTarget = true;
  }
  const dur = (p.tB - p.tA) / rateOf(s) + DINO.FADE_S;
  const maxTurn = ((DINO.TURN_DEG_S * Math.PI) / 180) * dur;
  const desired = Math.atan2(s.tz - s.az, s.tx - s.ax);
  const want = s.heading + Math.max(-maxTurn, Math.min(maxTurn, angDiff(desired, s.heading)));
  const cands = [0, 0.35, -0.35, 0.7, -0.7].map((d) => want + d * maxTurn).filter((h) => Math.abs(angDiff(h, s.heading)) <= maxTurn + 1e-6);
  const stride = strideCells(p, s.len);
  // 1-o‘tish: sikl oxiridan yana bir qadam oldinda ham joy bo‘lsin (berk ko‘chaga kirmaslik); 2-o‘tish: shartsiz
  for (const look of [true, false]) for (const h of cands) {
    // siklni aynan stepOnce kabi simulyatsiya qilamiz (blend + yurish, silliq burilish) va har pozani tekshiramiz
    const path = simulateBout(p, s, h);
    let ok = true;
    for (let i = 0; i + 2 < path.length && ok; i += 3) ok = bodyClear(p, w, s.zone, path[i], path[i + 1], path[i + 2], s.len);
    if (ok && look) {
      const n = path.length;
      ok = bodyClear(p, w, s.zone, path[n - 3] + Math.cos(path[n - 1]) * stride, path[n - 2] + Math.sin(path[n - 1]) * stride, path[n - 1], s.len);
    }
    if (ok) {
      s.stuck = 0;
      s.fadeNext = 'walk';
      s.fadeAdvance = false;
      s.walkHeading = h;
      s.path = path;
      s.ex = path[path.length - 3]; s.ez = path[path.length - 2]; s.eh = path[path.length - 1];
      s.mode = 'fade';
      s.f1 = fromT;
      s.f2 = p.tA;
      s.fa = 0;
      return;
    }
  }
  // yo‘lni faqat boshqa dinozavr to‘sib turgan bo‘lsa — orqaga yurmaydi, joyida kutadi (u o‘tib ketadi)
  if (w.extra?.size) {
    const free: DinoWorld = { occ: w.occ };
    const h0 = cands[0] ?? s.heading;
    const path0 = simulateBout(p, s, h0);
    let okWithout = true;
    for (let i = 0; i + 2 < path0.length && okWithout; i += 3) okWithout = bodyClear(p, free, s.zone, path0[i], path0[i + 1], path0[i + 2], s.len);
    if (okWithout) { startRest(s, p, 1.5 + rnd(s)); return; }
  }
  // oldinga yo‘l yopiq: avval orqaga qadam tashlaydi (klipning o‘z orqaga yurishi) va shu paytda maqsad/markaz
  // tomon sekin buriladi — joyida aylanishdan (oyoqlar sirpanadi) tabiiyroq
  if (s.t >= p.tB && s.t <= p.tR + 1e-6) {
    const zc0 = Math.atan2((s.zone.z0 + s.zone.z1 + 1) / 2 - s.az, (s.zone.x0 + s.zone.x1 + 1) / 2 - s.ax);
    const backDur = (DINO.T_BACK_END - s.t) / rateOf(s);
    const maxB = ((DINO.TURN_DEG_S * Math.PI) / 180) * backDur;
    for (const aim of [desired, zc0, s.heading]) {
      const turn = Math.max(-maxB, Math.min(maxB, angDiff(aim, s.heading)));
      for (const h of [s.heading + turn, s.heading + turn / 2, s.heading]) {
        const back = simulateBack(p, s, h);
        let ok = back.length > 0;
        for (let i = 0; i + 2 < back.length && ok; i += 3) ok = bodyClear(p, w, s.zone, back[i], back[i + 1], back[i + 2], s.len);
        if (ok) {
          s.mode = 'back';
          s.walkHeading = h;
          s.path = back;
          s.ex = back[back.length - 3]; s.ez = back[back.length - 2]; s.eh = back[back.length - 1];
          s.hasTarget = false;
          return;
        }
      }
    }
  }
  // oldinga yo‘l yopiq: maqsadni almashtiramiz va joyida burilamiz — bir nechta burchak sinaladi (avval zona
  // markazi tomon), dum va bo‘yin o‘tadigan butun sektor bo‘sh bo‘lishi shart
  s.hasTarget = false;
  const zc = Math.atan2((s.zone.z0 + s.zone.z1 + 1) / 2 - s.az, (s.zone.x0 + s.zone.x1 + 1) / 2 - s.ax);
  const tries = [angDiff(zc, s.heading), angDiff(desired, s.heading), 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI * 0.95, -Math.PI * 0.95];
  for (const d of tries) {
    if (Math.abs(d) < 0.15) continue;
    const n = Math.max(4, Math.ceil(Math.abs(d) / 0.12));
    let ok = true;
    for (let k = 1; k <= n && ok; k++) ok = bodyClear(p, w, s.zone, s.ax, s.az, s.heading + (d * k) / n, s.len);
    if (ok && s.t >= p.tB - 1e-6 && s.t <= p.tR + 1e-6) {
      s.mode = 'pivot';
      s.pivotTo = s.heading + d;
      return;
    }
  }
  // hech qayerga yo‘l yo‘q: bir necha urinishdan keyin marshrutdagi eng yaqin bo‘sh joyga ko‘chadi (abadiy tiqilib qolmaydi)
  s.stuck = (s.stuck ?? 0) + 1;
  if (s.stuck >= 4) {
    const path = patrolPath();
    let bi = 0, bd = Infinity;
    for (let i = 0; i < path.length; i++) { const d = (path[i].x - s.ax) ** 2 + (path[i].z - s.az) ** 2; if (d < bd) { bd = d; bi = i; } }
    for (let k = 0; k < path.length; k += 3) {
      for (const i of [(bi + k) % path.length, (bi - k + path.length * 2) % path.length]) {
        const a = path[i], b = path[(i + 4) % path.length];
        const h = Math.atan2(b.z - a.z, b.x - a.x);
        if (bodyClear(p, w, s.zone, a.x, a.z, h, s.len)) {
          Object.assign(s, { ax: a.x, az: a.z, heading: h, walkHeading: h, pivotTo: h, ex: a.x, ez: a.z, eh: h, path: [], stuck: 0 });
          startRest(s, p, 1);
          return;
        }
      }
    }
  }
  startRest(s, p, 1.5); // hech qayerga yo‘l yo‘q — xavfsiz joyda kutadi va qayta urinadi
}

/**
 * Uzluksiz davom: L1 ga yetganda keyingi siklni rejalashtiradi (faqat oldinga, yo‘l tekshiriladi). Muvaffaqiyatli bo‘lsa
 * ikkala poza davom etayotgan blend boshlanadi; bo‘lmasa false — dinozavr siklni tugatib to‘xtaydi va oddiy reja ishlaydi.
 */
function planLoop(p: DinoProfile, w: DinoWorld, s: DinoState): boolean {
  patrolTarget(s);
  const dur = (DINO.L1 - DINO.L0) / rateOf(s) + DINO.LOOP_FADE_S;
  const maxTurn = ((DINO.TURN_DEG_S * Math.PI) / 180) * dur;
  const desired = Math.atan2(s.tz - s.az, s.tx - s.ax);
  const want = s.heading + Math.max(-maxTurn, Math.min(maxTurn, angDiff(desired, s.heading)));
  const stride = strideCells(p, s.len);
  for (const look of [true, false]) for (const d of [0, 0.35, -0.35, 0.7, -0.7]) {
    const h = want + d * maxTurn;
    if (Math.abs(angDiff(h, s.heading)) > maxTurn + 1e-6) continue;
    const path = simulateBout(p, s, h, true);
    let ok = true;
    for (let i = 0; i + 2 < path.length && ok; i += 3) ok = bodyClear(p, w, s.zone, path[i], path[i + 1], path[i + 2], s.len);
    if (ok && look) {
      const n = path.length;
      ok = bodyClear(p, w, s.zone, path[n - 3] + Math.cos(path[n - 1]) * stride, path[n - 2] + Math.sin(path[n - 1]) * stride, path[n - 1], s.len);
    }
    if (!ok) continue;
    s.stuck = 0;
    s.walkHeading = h;
    s.path = path;
    s.ex = path[path.length - 3]; s.ez = path[path.length - 2]; s.eh = path[path.length - 1];
    s.mode = 'fade';
    s.fadeNext = 'walk';
    s.fadeAdvance = true;
    s.f1 = s.t;
    s.f2 = DINO.L0;
    s.fa = 0;
    return true;
  }
  return false;
}

/** Bir qadam siklining haqiqiy yo‘li: blend (oyoqlar joyida, burilish) + yurish (klip root motion, burilish). */
function simulateBout(p: DinoProfile, s: DinoState, h: number, loop = false): number[] {
  const out: number[] = [];
  let ax = s.ax, az = s.az, hd = s.heading;
  const m = (DINO.TURN_DEG_S * Math.PI) / 180;
  const turn = (dt: number) => { const d = angDiff(h, hd); hd += Math.max(-m * dt, Math.min(m * dt, d)); };
  const dt = 0.05;
  if (!loop) for (let tt = 0; tt < DINO.FADE_S; tt += dt) turn(dt);
  out.push(ax, az, hd);
  // uzluksiz siklda blend ham yurish (L0 dan biroz oldin boshlab hisoblanadi); oxiri — keyingi qaror nuqtasi
  let t = loop ? Math.max(p.tA, DINO.L0 - DINO.LOOP_FADE_S * rateOf(s)) : p.tA, k = 0;
  const end = loop ? DINO.L1 : p.tB;
  while (t < end) {
    const tn = Math.min(end, t + dt * rateOf(s));
    turn(dt);
    const df = (feetAt(p, tn) - feetAt(p, t)) * scaleOf(s.len);
    ax += Math.cos(hd) * df;
    az += Math.sin(hd) * df;
    t = tn;
    if (++k % 6 === 0) out.push(ax, az, hd);
  }
  out.push(ax, az, hd);
  return out;
}

/** Orqaga qadam yo‘li: joriy dam vaqtidan T_BACK_END gacha (yo‘nalish o‘zgarmaydi). */
function simulateBack(p: DinoProfile, s: DinoState, h = s.heading): number[] {
  const out: number[] = [];
  let ax = s.ax, az = s.az, t = s.t, k = 0, hd = s.heading;
  const sc = scaleOf(s.len), m = (DINO.TURN_DEG_S * Math.PI) / 180, dt = 0.05;
  while (t < DINO.T_BACK_END) {
    const tn = Math.min(DINO.T_BACK_END, t + dt * rateOf(s));
    hd += Math.max(-m * dt, Math.min(m * dt, angDiff(h, hd)));
    const df = (feetAt(p, tn) - feetAt(p, t)) * sc;
    ax += Math.cos(hd) * df;
    az += Math.sin(hd) * df;
    t = tn;
    if (++k % 6 === 0) out.push(ax, az, hd);
  }
  out.push(ax, az, hd);
  return out;
}

/** O‘yin vaqti bo‘yicha bir qadam (dt — Game.update dagi cheklangan qadam; pauzada chaqirilmaydi). */
export function stepDino(p: DinoProfile, w: DinoWorld, s: DinoState, dt: number) {
  let left = Math.min(dt, 0.25);
  // katta qadamni bo‘lib hisoblaymiz (holat almashishlari aniq bo‘lsin)
  while (left > 1e-6) {
    const step = Math.min(left, 0.05);
    left -= step;
    stepOnce(p, w, s, step);
  }
}

function turnToward(s: DinoState, target: number, rate: number, dt: number) {
  const d = angDiff(target, s.heading);
  const m = ((rate * Math.PI) / 180) * dt;
  s.heading += Math.max(-m, Math.min(m, d));
}

function stepOnce(p: DinoProfile, w: DinoWorld, s: DinoState, dt: number) {
  switch (s.mode) {
    case 'walk': {
      const t0 = s.t;
      const tn = Math.min(p.tB, s.t + dt * rateOf(s));
      turnToward(s, s.walkHeading, DINO.TURN_DEG_S, dt);
      const df = (feetAt(p, tn) - feetAt(p, s.t)) * scaleOf(s.len);
      s.ax += Math.cos(s.heading) * df;
      s.az += Math.sin(s.heading) * df;
      s.t = tn;
      // sikl qaror nuqtasi: to‘xtamasdan keyingi siklga o‘tadi (yoki ba’zan to‘xtab dam oladi)
      if (t0 < DINO.L1 && s.t >= DINO.L1 && !s.pendingRest) {
        if (rnd(s) < DINO.REST_CHANCE) s.pendingRest = true;
        else if (planLoop(p, w, s)) break;
      }
      if (s.t >= p.tB) {
        const rest = s.pendingRest;
        s.pendingRest = false;
        if (rest) startRest(s, p, DINO.REST_MIN + rnd(s) * (DINO.REST_MAX - DINO.REST_MIN));
        else planBout(p, w, s, p.tB);
      }
      break;
    }
    case 'fade': {
      // og‘irliklar blend qilinadi, yo‘nalish silliq buriladi
      turnToward(s, s.walkHeading, DINO.TURN_DEG_S, dt);
      if (s.fadeAdvance) {
        // uzluksiz sikl: ikkala poza ham davom etadi, tana blendlangan root motion bilan yuradi
        const n1 = s.f1 + dt * rateOf(s), n2 = s.f2 + dt * rateOf(s);
        const df = ((1 - s.fa) * (feetAt(p, n1) - feetAt(p, s.f1)) + s.fa * (feetAt(p, n2) - feetAt(p, s.f2))) * scaleOf(s.len);
        s.ax += Math.cos(s.heading) * df;
        s.az += Math.sin(s.heading) * df;
        s.f1 = n1;
        s.f2 = n2;
      }
      s.fa = Math.min(1, s.fa + dt / (s.fadeAdvance ? DINO.LOOP_FADE_S : DINO.FADE_S));
      if (s.fa >= 1) {
        s.t = s.f2;
        s.fa = 0;
        s.fadeAdvance = false;
        if (s.fadeNext === 'rest') { s.mode = 'rest'; s.restLeft = Math.max(s.restLeft, 0.5 + rnd(s)); s.pingDir = 1; }
        else s.mode = 'walk';
      }
      break;
    }
    case 'back': {
      // klipning orqaga qadam qismi: root motion manfiy — tana orqaga siljiydi, oyoqlar navbat bilan; sekin burilish
      const tn = Math.min(DINO.T_BACK_END, s.t + dt * rateOf(s));
      turnToward(s, s.walkHeading, DINO.TURN_DEG_S, dt);
      const df = (feetAt(p, tn) - feetAt(p, s.t)) * scaleOf(s.len);
      s.ax += Math.cos(s.heading) * df;
      s.az += Math.sin(s.heading) * df;
      s.t = tn;
      if (s.t >= DINO.T_BACK_END) {
        // to‘rt oyoq yerda — to‘g‘ridan-to‘g‘ri keyingi oldinga yurishga (poza farqi dam pozasidagidan kichik);
        // yo‘l bo‘lmasa dam pozasiga blend bilan
        s.hasTarget = false;
        planBout(p, w, s, DINO.T_BACK_END);
      }
      break;
    }
    case 'rest':
    case 'pivot': {
      s.t += s.pingDir * dt * DINO.REST_RATE;
      if (s.t > p.tR) { s.t = p.tR; s.pingDir = -1; }
      if (s.t < p.tB) { s.t = p.tB; s.pingDir = 1; }
      if (s.mode === 'pivot') {
        turnToward(s, s.pivotTo, DINO.PIVOT_DEG_S, dt);
        if (Math.abs(angDiff(s.pivotTo, s.heading)) < 1e-3) startRest(s, p, 1 + rnd(s) * 2);
      } else {
        s.restLeft -= dt;
        if (s.restLeft <= 0) planBout(p, w, s, s.t);
      }
      break;
    }
  }
}

/** Renderer uchun: model ildizi (base), yo‘nalish va morph blend (t1 → t2, a). */
export function dinoPose(p: DinoProfile, s: DinoState) {
  const fA = feetAt(p, p.tA);
  let t1 = s.t, t2 = s.t, a = 0, local = feetAt(p, s.t) - fA;
  if (s.mode === 'fade') {
    t1 = s.f1; t2 = s.f2; a = s.fa;
    const f1 = feetAt(p, t1), f2 = feetAt(p, t2);
    local = f1 - fA - a * (f1 - f2);
  }
  const c = Math.cos(s.heading), sn = Math.sin(s.heading);
  const sc = scaleOf(s.len);
  return { baseX: s.ax - c * local * sc, baseZ: s.az - sn * local * sc, heading: s.heading, t1, t2, a, fA, scale: sc };
}

/** Saqlangan holat tekshiruvi (sxema). */
export function isDinoState(v: unknown): v is DinoState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const nums = ['len', 'ax', 'az', 'heading', 't', 'f1', 'f2', 'fa', 'walkHeading', 'pivotTo', 'restLeft', 'pingDir', 'tx', 'tz', 'ex', 'ez', 'eh', 'seed'];
  if (!nums.every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]))) return false;
  if (!Array.isArray(o.path) || !o.path.every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  if (!['walk', 'fade', 'rest', 'pivot', 'back'].includes(o.mode as string)) return false;
  const z = o.zone as Record<string, unknown> | undefined;
  return !!z && ['x0', 'z0', 'x1', 'z1'].every((k) => Number.isInteger(z[k])) && typeof o.hasTarget === 'boolean';
}
