import type { DefenseType } from './types';

/**
 * «Shahar himoyasi» — yagona sozlama: narx, xizmat xarajati, o‘lcham, balandlik, darvoza vaqtlari.
 * 1 katak = 1 birlik (≈10 m). Bir qavatli uy tomi ≈0,95 — devor undan baland (1,3), ustunlar 1,5.
 * Dinozavr va bino masshtabi o‘zgarmaydi; devor balandligi faqat shu yerda sozlanadi.
 */
export const DEFENSE_CONFIG = {
  wall: { price: 150, upkeep: 0, width: 1, depth: 1 },
  corner: { price: 220, upkeep: 0, width: 1, depth: 1 },
  gate: { price: 1200, upkeep: 6, width: 3, depth: 1 },
  /** Ko‘rinish o‘lchamlari (katakda) */
  look: {
    /** Beton poydevor balandligi va qalinligi */
    baseH: 0.3,
    thick: 0.44,
    /** Po‘lat panel yuqori cheti */
    panelTop: 1.3,
    /** Ustun: kengligi va balandligi (chiroqsiz) */
    pillarW: 0.42,
    pillarH: 1.46,
    /** Burchak/tutashuv ustuni biroz yo‘g‘onroq */
    cornerPillarW: 0.52,
    /** To‘g‘ri devorda ustun har necha katakda (global koordinata bo‘yicha — ulangan qismlarda bir xil) */
    pillarEvery: 3,
    /** Darvoza qanotlari yo‘lagi: devor chizig‘idan ichkariga siljish */
    leafTrack: 0.36,
  },
  gateRun: {
    /** To‘liq ochilish yoki yopilish (o‘yin soniyasi) */
    openSeconds: 4,
    /** Qanotlar ochilganda yon tomonda egallaydigan kataklar (har tomonda) */
    pocket: 2,
    /** Mashina tezligi (katak/s), darvozagacha kelish masofasi, kutish chizig‘i */
    carSpeed: 1.3,
    approach: 4,
    waitLine: 1.4,
    /** Avtomatik rejimda mashinalar oralig‘i (s) */
    carEvery: [22, 40] as [number, number],
    /** Shu radiusda (katak) dinozavr bo‘lsa avtomatik rejim ochmaydi va ochiqni yopadi */
    dangerRadius: 9,
  },
} as const;

export const DEFENSE_TYPES: DefenseType[] = ['himoya_devor', 'himoya_burchak', 'himoya_darvoza'];

export function isDefense(t: string): t is DefenseType {
  return t === 'himoya_devor' || t === 'himoya_burchak' || t === 'himoya_darvoza';
}

/** Devor yoki burchak (darvoza emas) */
export function isWallPiece(t: string): boolean {
  return t === 'himoya_devor' || t === 'himoya_burchak';
}

export type GateMode = 'manual' | 'auto';

/** Darvoza holati (saqlanadi): animatsiya, rejim, o‘tayotgan mashina */
export interface GateState {
  mode: GateMode;
  /** O‘yinchi yoki avtomatika buyrug‘i */
  want: 'open' | 'closed';
  /** 0 — yopiq, 1 — to‘liq ochiq */
  open: number;
  /** Yopilishi kerak, lekin o‘tish joyi band — kutmoqda */
  waiting: boolean;
  /** O‘tayotgan mashina: s — darvoza markazidan yo‘l bo‘ylab masofa (yo‘nalish dir bo‘yicha), −approach..+approach */
  car: { s: number; dir: 1 | -1 } | null;
  /** Keyingi mashinagacha (s) */
  nextCar: number;
  /** Mashinalar hisoblagichi (oraliqlar takrorlanadigan, lekin bir xil emas) */
  carSeq: number;
}

export type GatePhase = 'closed' | 'opening' | 'open' | 'closing' | 'waiting';

export function newGateState(): GateState {
  return { mode: 'auto', want: 'closed', open: 0, waiting: false, car: null, nextCar: DEFENSE_CONFIG.gateRun.carEvery[0], carSeq: 0 };
}

export function gatePhase(s: GateState): GatePhase {
  if (s.waiting) return 'waiting';
  if (s.want === 'open') return s.open >= 1 ? 'open' : 'opening';
  return s.open <= 0 ? 'closed' : 'closing';
}

export const GATE_PHASE_NAME: Record<GatePhase, string> = {
  closed: 'Yopiq',
  opening: 'Ochilmoqda',
  open: 'Ochiq',
  closing: 'Yopilmoqda',
  waiting: 'O‘tish band — kutmoqda',
};

/** Darvoza dinozavr uchun ochiq yo‘lmi (navigatsiya): faqat to‘liq ochilganda; yopish buyrug‘idan keyin darhol yopiq */
export function gateNavOpen(s: GateState | undefined): boolean {
  return !!s && s.open >= 1 && (s.want === 'open' || s.waiting);
}

export function isGateState(v: unknown): v is GateState {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  const n = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  if (s.mode !== 'manual' && s.mode !== 'auto') return false;
  if (s.want !== 'open' && s.want !== 'closed') return false;
  if (!n(s.open) || (s.open as number) < 0 || (s.open as number) > 1) return false;
  if (typeof s.waiting !== 'boolean' || !n(s.nextCar) || !n(s.carSeq)) return false;
  if (s.car !== null) {
    const c = s.car as Record<string, unknown> | undefined;
    if (!c || !n(c.s) || (c.dir !== 1 && c.dir !== -1)) return false;
  }
  return true;
}

/** Qurilish bosqichlari nomi (30 s: 0–6, 6–18, 18–28, 28–30) — himoya qismlari uchun */
export const DEFENSE_PHASE_NAMES: Record<'site' | 'frame' | 'finish' | 'cleanup', string> = {
  site: 'Maydon va poydevor',
  frame: 'Ustun va asosiy konstruksiya',
  finish: 'Metall panellar va darvoza',
  cleanup: 'Chiroqlar va yakunlash',
};
