import { CATALOG } from './catalog';
import type { ObjectType } from './types';

/**
 * Bosqichma-bosqich qurilish: yangi bino joylashtirilgach darhol tayyor bo‘lmaydi — maydon va poydevor, karkas,
 * devor va pardoz, yakunlash. Yagona sozlama: constructionDurationSeconds. Vaqt o‘yin vaqti (Game.update qadami):
 * pauzada va yashirin tabda to‘xtaydi, FPS ga bog‘liq emas. O‘yinda tezlik rejimi yo‘q — qo‘shilsa, shu qadam bilan
 * birga tezlashadi.
 */
export const CONSTRUCTION = {
  constructionDurationSeconds: 30,
  /**
   * false — bino darhol tayyor (faqat avtomatik sinovlar uchun: eski sinovlar ?instant bilan; o‘yinchi uchun doim true).
   */
  enabled: true,
};

export type PhaseId = 'site' | 'frame' | 'finish' | 'cleanup';

/** 30 soniyalik bosqichlar (soniyada); boshqa davomiylikda proporsional cho‘ziladi. */
export const PHASES: { id: PhaseId; name: string; from: number; to: number }[] = [
  { id: 'site', name: 'Maydon va poydevor', from: 0, to: 6 },
  { id: 'frame', name: 'Karkas va qavatlar', from: 6, to: 18 },
  { id: 'finish', name: 'Devor va pardoz', from: 18, to: 28 },
  { id: 'cleanup', name: 'Yakunlash', from: 28, to: 30 },
];

export interface BuildState {
  /** O‘tgan o‘yin vaqti (soniya) */
  elapsed: number;
  /** Jami davomiylik (soniya) — joylashtirilgan paytdagi sozlama */
  duration: number;
  /** Qurilish narxi joylashtirishda bir marta to‘langan */
  paid: true;
  /** Himoya qismi: tugash vaqti keldi, lekin maydonda dinozavr bor — o‘tib ketishini kutmoqda (ichiga qamab qo‘ymaydi) */
  hold?: boolean;
}

/** Yo‘l, daraxt, bog‘ va mayda bezaklar qurilmaydi — darhol joylashadi. */
export function needsConstruction(type: ObjectType): boolean {
  const k = CATALOG[type].kind;
  return CONSTRUCTION.enabled && k !== 'road' && k !== 'decor' && k !== 'park';
}

export function newBuild(): BuildState {
  return { elapsed: 0, duration: CONSTRUCTION.constructionDurationSeconds, paid: true };
}

/** Foiz, bosqich va qolgan vaqt saqlangan elapsed dan hisoblanadi. t30 — 30 soniyalik shkaladagi vaqt. */
export function buildProgress(b: BuildState) {
  const ratio = Math.max(0, Math.min(1, b.elapsed / b.duration));
  const t30 = ratio * 30;
  const phase = PHASES.find((p) => t30 < p.to) ?? PHASES[PHASES.length - 1];
  return {
    ratio,
    percent: Math.floor(ratio * 100),
    t30,
    phase,
    /** Bosqich ichidagi ulush 0..1 */
    phaseT: Math.max(0, Math.min(1, (t30 - phase.from) / (phase.to - phase.from))),
    remaining: Math.max(0, b.duration - b.elapsed),
  };
}

export function isBuildState(v: unknown): v is BuildState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.elapsed === 'number' && Number.isFinite(o.elapsed) && o.elapsed >= 0
    && typeof o.duration === 'number' && Number.isFinite(o.duration) && o.duration > 0 && o.paid === true;
}
