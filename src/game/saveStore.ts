import { isObjectType } from './catalog';
import { footprintCells, isCoreWater } from './grid';
import { isDinoState, type DinoState } from './dino';
import { isBuildState } from './construction';
import { isTerrainState, type TerrainState } from './terrain';
import { isHerdDino, type HerdDino } from './herd';
import type { CameraState, CivicState, PlacedObject, Rotation, Settings, TutorialState } from './types';

/** Kalit nomi o‘zgarmaydi (eski shaharlar shu yerda); sxema versiyasi JSON ichida. */
export const SAVE_KEY = 'boyota.save.v1';
/**
 * 1 — dastlabki sxema. 2 — obyektlarda `outageTicks` (xizmat uzilishi taymeri) qo‘shildi.
 * 3 — `education` (shahar malakasi va bajarilgan ta’lim topshiriqlari) qo‘shildi.
 * 4 — `health` (shifoxona topshirig‘i bajarilganmi) qo‘shildi.
 * 5 — `civic` (bank jamg‘armalari, ogohlantirish, qurilish xarajatlari jurnali) qo‘shildi.
 * 6 — `creatures.dino` (yuradigan dinozavr holati) qo‘shildi.
 * 7 — `creatures.dinos` (bir nechta dinozavr, har birining uzunligi) — 6 dagi bitta dino ro‘yxatga o‘tadi.
 * 8 — obyektda `build` (qurilish: o‘tgan vaqt, davomiylik, to‘langan) va `hints` qo‘shildi; eski binolar tayyor.
 * 10 — `creatures.herd`: 7 ta yangi dinozavr (ID, tur, joy, yo‘nalish, xulq holati, taymerlar, maqsad, quvish
 *      sherigi, animatsiya fazasi). Eskisida yo‘q — o‘yin har turdan bittadan bo‘sh joyga qo‘yadi; apatozavr saqlanadi.
 * 9 — xarita 40×40 dan 80×80 ga kengaydi (eski koordinatalar o‘zgarmagan) va `terrain` (tog‘lar: versiya, seed,
 *     xarita o‘lchami, har tog‘ joyi/shakli) qo‘shildi. Eski saqlashda tog‘lar faqat bo‘sh joyga yaratiladi.
 */
export const SCHEMA_VERSION = 10;
/** Migratsiyadan oldin eski saqlashning aynan nusxasi shu kalitga yoziladi (sxema raqami bilan). */
export const backupKey = (schema: number) => 'boyota.save.v1.backup-schema' + schema;
export const BACKUP_KEY_V1 = backupKey(1);

/** PRD 08: faqat domen holati; mesh/material JSONga yozilmaydi. */
export interface SaveData {
  schemaVersion: number;
  seed: number;
  money: number;
  simTime: number;
  tickAccumulator: number;
  tickCount: number;
  nextId: number;
  placedObjects: PlacedObject[];
  tutorial: TutorialState;
  /** 3-sxemadan: ta’lim holati (eski saqlashlarda yo‘q — migratsiya 0 qo‘yadi) */
  education?: { skill: number; tasksDone: number };
  /** 4-sxemadan: shifoxona topshirig‘i (eski saqlashlarda yo‘q — migratsiya false qo‘yadi) */
  health?: { taskDone: boolean };
  /** 5-sxemadan: bank jamg‘armalari, ogohlantirish, qurilish jurnali */
  civic?: CivicState;
  /** 7-sxemadan: dinozavrlar (6-sxemada `dino` — bitta) */
  creatures?: { dinos?: DinoState[]; dino?: DinoState | null; herd?: HerdDino[] };
  /** 8-sxemadan: bir martalik maslahatlar */
  hints?: { construction: boolean; arrival?: boolean; gateAuto?: boolean; onboarding?: boolean };
  /** Bonuslar, jarimalar va reyting (rewards.ts) — eski saqlashda yo‘q */
  rewards?: unknown;
  /** 9-sxemadan: tog‘lar (yo‘q bo‘lsa o‘yin bo‘sh joyga yaratadi va saqlaydi) */
  terrain?: TerrainState;
  /** Shahar himoyasi: «Himoyani tekshirish» topshirig‘i bajarilgan (eski saqlashlarda yo‘q) */
  defense?: { checked: boolean };
  /** Ko‘chib kelish transporti: navbat, safarlar, band qilingan o‘rinlar (eski saqlashlarda yo‘q) */
  migration?: import('./traffic').MigrationSave;
  settings: Settings;
  camera: CameraState;
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; data: SaveData; migratedFrom?: number; backupSaved?: boolean }
  | { status: 'invalid'; error: string; raw: string }
  | { status: 'unavailable'; error: string };

export type SaveResult = { ok: true } | { ok: false; error: string };

/** Minimal storage interfeysi — testlarda xotiradagi storage ishlatiladi. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getBrowserStorage(): KeyValueStorage | null {
  try {
    const s = window.localStorage;
    const probe = '__boyota_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function writeSave(storage: KeyValueStorage | null, data: SaveData): SaveResult {
  if (!storage) return { ok: false, error: 'Brauzer localStorage ni bloklagan — saqlab bo‘lmadi.' };
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return {
      ok: false,
      error: quota ? 'Saqlash joyi (kvota) to‘lgan — saqlab bo‘lmadi.' : 'Saqlashda xato: ' + String(e),
    };
  }
}

export function readSave(storage: KeyValueStorage | null): LoadResult {
  if (!storage) return { status: 'unavailable', error: 'Brauzer localStorage ni bloklagan — shahar saqlanmaydi.' };
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch (e) {
    return { status: 'unavailable', error: 'localStorage o‘qilmadi: ' + String(e) };
  }
  if (raw === null) return { status: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', error: 'Saqlangan fayl JSON emas.', raw };
  }
  const err = validateSave(parsed);
  if (err) return { status: 'invalid', error: err, raw };
  const from = (parsed as SaveData).schemaVersion;
  const data = migrateSave(parsed as SaveData);
  if (from === SCHEMA_VERSION) return { status: 'ok', data };
  // Eski sxema: avval asl matn nusxasi saqlanadi (mavjud nusxa ustidan yozilmaydi), keyin migratsiya.
  let backupSaved = false;
  try {
    const key = backupKey(from);
    if (storage.getItem(key) === null) storage.setItem(key, raw);
    backupSaved = true;
  } catch {
    backupSaved = false;
  }
  return { status: 'ok', data, migratedFrom: from, backupSaved };
}

/**
 * Tekshiruvdan o‘tgan saqlashni joriy sxemaga keltiradi. Shahar (obyektlar, pul, aholi) o‘zgarmaydi:
 * 1 → 2 da faqat har obyektga outageTicks = 0 qo‘shiladi; 2 → 3 da education = { skill: 0, tasksDone: 0 };
 * 3 → 4 da health = { taskDone: false }; 4 → 5 da civic — bo‘sh jamg‘arma va jurnal;
 * 5 → 6 da creatures.dino = null (o‘yin ochilganda bo‘sh hududda joylashadi);
 * 6 → 7 da bitta dino → dinos ro‘yxati (uzunligi o‘zgargan bo‘lsa o‘yin uni qayta joylashtiradi).
 */
export function migrateSave(d: SaveData): SaveData {
  const e = d.education;
  return {
    ...d,
    schemaVersion: SCHEMA_VERSION,
    education: { skill: e && isNum(e.skill) ? e.skill : 0, tasksDone: e && isInt(e.tasksDone) ? e.tasksDone : 0 },
    health: { taskDone: d.health?.taskDone === true },
    creatures: { dinos: migrateDinos(d.creatures), herd: (d.creatures?.herd ?? []).filter(isHerdDino) },
    civic: d.civic ?? { goals: [], nextGoalId: 1, incident: null, construction: { total: 0, period: 0, lastPeriod: 0 }, lastPenalty: 0 },
    placedObjects: d.placedObjects.map((o) => ({ ...o, outageTicks: isInt(o.outageTicks) && o.outageTicks > 0 ? o.outageTicks : 0 })),
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

/** Sxema, katak chegarasi, suv va collision tekshiruvi. Xato bo‘lsa o‘zbekcha matn qaytaradi. */
export function validateSave(d: unknown): string | null {
  if (!d || typeof d !== 'object') return 'Saqlash obyekt emas.';
  const s = d as Record<string, unknown>;
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, SCHEMA_VERSION].includes(s.schemaVersion as number)) return `Sxema versiyasi mos emas (${String(s.schemaVersion)}).`;
  for (const k of ['seed', 'money', 'simTime', 'tickAccumulator', 'tickCount', 'nextId'] as const) {
    if (!isNum(s[k])) return `«${k}» maydoni noto‘g‘ri.`;
  }
  if (!Array.isArray(s.placedObjects)) return '«placedObjects» ro‘yxat emas.';
  const ids = new Set<string>();
  const occ = new Map<string, string>();
  for (const raw of s.placedObjects as unknown[]) {
    const o = raw as Record<string, unknown>;
    if (!o || typeof o.id !== 'string' || !o.id) return 'Obyekt identifikatori noto‘g‘ri.';
    if (ids.has(o.id)) return `Takroriy identifikator: ${o.id}.`;
    ids.add(o.id);
    if (!isObjectType(o.type)) return `Noma’lum obyekt turi: ${String(o.type)}.`;
    if (!isInt(o.gridX) || !isInt(o.gridZ)) return `Katak koordinatasi noto‘g‘ri: ${o.id}.`;
    if (!isInt(o.rotation) || (o.rotation as number) < 0 || (o.rotation as number) > 3) return `Burilish noto‘g‘ri: ${o.id}.`;
    if (!isInt(o.residents) || (o.residents as number) < 0) return `Aholi soni noto‘g‘ri: ${o.id}.`;
    if (o.outageTicks !== undefined && (!isInt(o.outageTicks) || (o.outageTicks as number) < 0)) return `Uzilish taymeri noto‘g‘ri: ${o.id}.`;
    if (typeof o.userPlaced !== 'boolean') return `userPlaced noto‘g‘ri: ${o.id}.`;
    if (o.build !== undefined && !isBuildState(o.build)) return `Qurilish holati noto‘g‘ri: ${o.id}.`;
    for (const c of footprintCells(o.type, o.gridX as number, o.gridZ as number, o.rotation as Rotation)) {
      // faqat asl suv: tabiiy ko‘llar saqlash ichidagi terrain dan keyin quriladi va obyektlarga tushmaydi
      if (isCoreWater(c.x, c.z) && o.type !== 'road') return `Obyekt suv ustida: ${o.id}.`;
      const key = c.x + ',' + c.z;
      if (occ.has(key)) return `Obyektlar ustma-ust tushgan: ${occ.get(key)} va ${o.id}.`;
      occ.set(key, o.id);
    }
  }
  const t = s.tutorial as Record<string, unknown> | undefined;
  if (!t || !isInt(t.step) || typeof t.completed !== 'boolean' || typeof t.skipped !== 'boolean') return '«tutorial» maydoni noto‘g‘ri.';
  const ed = s.education as Record<string, unknown> | undefined;
  if (ed !== undefined && (!ed || typeof ed !== 'object' || !isNum(ed.skill) || !isInt(ed.tasksDone) || (ed.tasksDone as number) < 0)) return '«education» maydoni noto‘g‘ri.';
  const he = s.health as Record<string, unknown> | undefined;
  if (he !== undefined && (!he || typeof he !== 'object' || typeof he.taskDone !== 'boolean')) return '«health» maydoni noto‘g‘ri.';
  const cv = s.civic as Record<string, unknown> | undefined;
  if (cv !== undefined) {
    if (!cv || typeof cv !== 'object' || !Array.isArray(cv.goals) || !isInt(cv.nextGoalId)) return '«civic» maydoni noto‘g‘ri.';
    for (const g of cv.goals as Record<string, unknown>[]) {
      if (!g || typeof g.id !== 'string' || typeof g.name !== 'string' || !isInt(g.target) || !isInt(g.saved) || (g.saved as number) < 0 || (g.target as number) <= 0) return '«civic» jamg‘armasi noto‘g‘ri.';
    }
    const c = cv.construction as Record<string, unknown> | undefined;
    if (!c || !isNum(c.total) || !isNum(c.period) || !isNum(c.lastPeriod)) return '«civic» jurnali noto‘g‘ri.';
  }
  if (s.terrain !== undefined && !isTerrainState(s.terrain)) return '«terrain» maydoni noto‘g‘ri.';
  const df = s.defense as Record<string, unknown> | undefined;
  if (df !== undefined && (!df || typeof df !== 'object' || typeof df.checked !== 'boolean')) return '«defense» maydoni noto‘g‘ri.';
  const st = s.settings as Record<string, unknown> | undefined;
  if (!st || (st.quality !== 'high' && st.quality !== 'low')) return '«settings» maydoni noto‘g‘ri.';
  const cam = s.camera as Record<string, unknown> | undefined;
  if (!cam || !['targetX', 'targetZ', 'azimuth', 'polar', 'distance'].every((k) => isNum(cam[k]))) return '«camera» maydoni noto‘g‘ri.';
  return null;
}

/** Saqlangan dinozavrlar: yaroqlilari olinadi; 6-sxemadagi bitta `dino` (uzunligi yo‘q) ro‘yxatga o‘tadi. */
function migrateDinos(c: SaveData['creatures']): DinoState[] {
  const list: unknown[] = c?.dinos ?? (c?.dino ? [{ ...c.dino, len: (c.dino as Partial<DinoState>).len ?? 6 }] : []);
  return list.filter((d): d is DinoState => isDinoState(d)).map((d) => ({ ...d, path: d.path ?? [] }));
}
