import { CATALOG } from './catalog';
import { ENTRY_CELL, isCoreWater, isLockedRoadCell, LAND_MAX, LAND_MIN, MAP_CONFIG, Occupancy } from './grid';
import { generateTerrain, isTerrainState, setActiveTerrain, TerrainField, terrainCurrent, type TerrainState } from './terrain';
import { validatePlacement, validateRoadPath, type PlacementResult, type RoadPathResult } from './placement';
import { createPresetObjects } from './presets';
import { RoadGrid } from './roadNetwork';
import { computeBudget, type Budget } from './budget';
import { readSave, SCHEMA_VERSION, writeSave, type KeyValueStorage, type SaveData } from './saveStore';
import { cityHappiness, houseForecast, MAX_FRAME_DT, runTick, START_MONEY, TICK_SECONDS, totalPopulation, type HouseForecast } from './simulation';
import { advanceTutorial, initialTutorial } from './tutorial';
import { clampSkill, EDU_CONFIG, EDU_TASKS, educationSummary, type EducationSummary } from './education';
import { HEALTH_TASK, healthSummary, type HealthSummary } from './health';
import { cityAppeals, greenSummary, securityCoverage, sewageSummary, type Appeal, type GreenSummary, type SecurityCoverage, type SewageSummary } from './civic';
import { CIVIC_CONFIG } from './civicDefs';
import { bodyClear, patrolPath, setDinoLayout, spawnOnPath, DINO_SPECS, dinoValid, NATURE_RING, NATURE_ZONE, findZone, reservedCells, spawnDino, stepDino, type DinoProfile, type DinoState } from './dino';
import { footprintCells } from './grid';
import { Herd, isHerdDino } from './herd';
import { buildProgress, needsConstruction, newBuild } from './construction';
import { computeStatuses as computeStatusesFor } from './utilities';
import { checkGate, DEFENSE_STATUS_TEXT, evaluateDefense, gateCenter, pocketSet, planWall, stepGate, terrainPassMask, type Cell, type DefenseEval, type WallPlan } from './defense';
import { DEFENSE_CONFIG, gateNavOpen, gatePhase, isDefense, isGateState, newGateState } from './defenseDefs';
import { herdTerrainOk } from './herd';
import { Traffic, type TrafficWorld } from './traffic';
import { MIGRATION_CONFIG, settleSize } from './trafficDefs';
import { DAMAGE_CONFIG, rectDist, repairCost } from './damage';
import { isCityObject } from './defense';
import { isSecurity } from './civic';
import { CONSTRUCTION } from './construction';
import { MIGRATION_BLOCK_TEXT } from './traffic';
import { edgeDirs, stubFrom } from './roadGraph';
import { inBounds, isWater } from './grid';
import { terrainBlocksBuild } from './terrain';
import { herdRadius, HERD_BY_TYPE } from './herdDefs';
import { computeStatuses, supplyAdvice, supplyReason, supplySummary, type SupplyKind, type SupplySummary } from './utilities';
import type {
  CameraState, CivicState, ObjectStatus, ObjectType, PlacedObject, Rotation, Settings, TickReport, TutorialState,
} from './types';

/** Relyef generatsiyasi keshi (bir xil shahar → bir xil tog‘ va suvlar; masalan «Yangi shahar» qayta bosilsa) */
const TERRAIN_MEMO = new Map<string, TerrainState>();

export function initialCivic(): CivicState {
  return { goals: [], nextGoalId: 1, incident: null, construction: { total: 0, period: 0, lastPeriod: 0 }, lastPenalty: 0 };
}

/** Ovoz hodisalari (o‘yinchi harakati natijasi) — audio tizimi tinglaydi, o‘yin mantig‘iga ta’sir qilmaydi */
export type SfxEvent = 'confirm' | 'error' | 'back' | 'task' | 'demolish' | 'open' | 'close';

export type ToolMode = 'select' | 'build' | 'road' | 'bridge' | 'wall' | 'demolish';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'ok' | 'error';
}

export type ModalKind = null | 'settings' | 'confirmNew' | 'help' | 'invalidSave' | 'credits';

export const DEFAULT_CAMERA: CameraState = { targetX: -6.5, targetZ: -0.5, azimuth: 0.55, polar: 0.74, distance: 21 };
export const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * Domen holati — yagona haqiqat manbai. Renderer va React UI faqat o‘qiydi va metodlarni chaqiradi.
 */
export class Game {
  objects = new Map<string, PlacedObject>();
  statuses = new Map<string, ObjectStatus>();
  occ = new Occupancy();
  roads = new RoadGrid();

  seed = 1;
  money = START_MONEY;
  simTime = 0;
  tickAccumulator = 0;
  tickCount = 0;
  nextId = 1;
  tutorial: TutorialState = initialTutorial();
  /** Shahar malakasi 0..100 (IT maktabi/universitet vaqt davomida oshiradi) — saqlanadi */
  skill = 0;
  /** Bajarilgan ta’lim topshiriqlari soni (ketma-ket; mukofot shu son oshganda bir marta beriladi) — saqlanadi */
  eduTasks = 0;
  /** Shifoxona topshirig‘i bajarilgan (mukofot berilgan) — saqlanadi */
  healthTaskDone = false;
  /** Bank jamg‘armalari, ogohlantirish, qurilish xarajatlari jurnali — saqlanadi */
  civic: CivicState = initialCivic();
  /** Yuradigan dinozavrlar (DINO_SPECS: katta va kichikroq) — saqlanadi; profil renderer GLB ni yuklagach beriladi */
  dinos: DinoState[] = [];
  /** Birinchi (eng katta) dinozavr — eski kod va sinovlar uchun */
  get dino(): DinoState | null {
    return this.dinos[0] ?? null;
  }
  dinoProfile: DinoProfile | null = null;
  /** 7 ta yangi dinozavr (public/models/dinosaurs) — mustaqil xulq, navigatsiya, quvish; saqlanadi */
  herd = new Herd();
  /** Navigatsiya hududi versiyasi: obyekt yoki relyef o‘zgarsa oshadi */
  private navVersion = 0;
  /** Shahar chegarasi (barcha obyektlar) */
  cityBox = { x0: 0, z0: 0, x1: 39, z1: 39 };
  /** Tog‘lar (doimiy relyef) — saqlanadi; joyi seed va ro‘yxat bilan qat’iy */
  terrain: TerrainState | null = null;
  terrainField: TerrainField | null = null;
  /** Bir martalik maslahatlar (saqlanadi) */
  hints = { construction: false, arrival: false, gateAuto: true };
  /** Transport: yangi aholi (avtomobil/avtobus) va shahar ichidagi harakat. Safarlar saqlanadi. */
  traffic = new Traffic();
  /** Tanlangan transport (UI) */
  selectedVehicle: string | null = null;
  /** Oxirgi hisob davridan beri transportda yetib kelganlar (hisobot uchun) */
  private arrivedSinceTick = 0;
  /** «Himoyani tekshirish» topshirig‘i bajarilgan (saqlanadi) */
  defenseChecked = false;
  /** Xaritada himoyalangan hududni ko‘rsatish (UI holati) */
  defenseOverlay = false;
  /** Darvozalar navigatsiya holati versiyasi (ochildi/yopildi) */
  gateNavVersion = 0;
  private defenseCache: { key: string; value: DefenseEval } | null = null;
  private terrainMask: { field: TerrainField | null; mask: Uint8Array } | null = null;
  /** Ogohlantirishlar takrorlanmasligi uchun oxirgi holat */
  private defenseSeen: { status: string; inside: number; t: number } | null = null;
  /** Dinozavrlar uchun shahar chegarasi (himoya qismlarisiz — devor tashqarisi ham ularning hududi) */
  private herdCity = { x0: 0, z0: 0, x1: 39, z1: 39 };
  /** Binolar egallagan hudud (dinozavr shu yerga kirsa — «shaharga kirdi») */
  private cityArea: { x0: number; z0: number; x1: number; z1: number } | null = null;

  /** Dinozavr shahar ichidami (binolar hududi) */
  inCityArea(x: number, z: number): boolean {
    const a = this.cityArea;
    return !!a && x >= a.x0 && z >= a.z0 && x <= a.x1 && z <= a.z1;
  }
  /** Dinozavr joylashmagan bo‘lsa sababi (diagnostika) */
  dinoNote: string | null = null;
  settings: Settings = { quality: 'high', autosave: true };
  camera: CameraState = { ...DEFAULT_CAMERA };

  paused = false;
  tabHidden = false;
  lastReport: TickReport | null = null;

  tool: ToolMode = 'select';
  buildType: ObjectType | null = null;
  buildRotation: Rotation = 0;
  selectedId: string | null = null;
  /** «Shahar budjeti» paneli ochiqmi (uy/bino paneli bilan bir joyni egallaydi) */
  budgetOpen = false;
  modal: ModalKind = null;
  /** Dastyor maslahat oynasi (modal emas, qurilishni bloklamaydi) */
  dastyorOpen = true;
  dastyorMessage: string | null = null;
  toasts: Toast[] = [];
  private toastSeq = 1;

  lastSavedAt: number | null = null;
  saveError: string | null = null;
  /** Buzilgan saqlash topilganda avtosaqlash o‘chadi — fayl jim o‘chirilmaydi. */
  autosaveBlocked = false;
  autosaveBlockReason: string | null = null;
  invalidSaveInfo: { error: string; raw: string } | null = null;

  /** Har qanday o‘zgarishda oshadi (React uchun) */
  version = 0;
  /** Obyektlar yoki ularning holati o‘zgarganda oshadi (sahna uchun) */
  worldVersion = 0;

  private listeners = new Set<() => void>();
  /** Ovoz hodisalari tinglovchilari */
  readonly sfxListeners = new Set<(e: SfxEvent) => void>();
  sfx(e: SfxEvent) {
    for (const l of this.sfxListeners) l(e);
  }
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private storage: KeyValueStorage | null) {}

  // ---------- yaratish / yuklash ----------

  static boot(storage: KeyValueStorage | null): Game {
    const g = new Game(storage);
    const res = readSave(storage);
    if (res.status === 'ok') {
      g.applySave(res.data);
      if (res.migratedFrom !== undefined) {
        if (res.backupSaved) {
          g.pushToast('Eski saqlangan shahar yangilandi — asl nusxasi saqlab qo‘yildi', 'info');
        } else {
          // Nusxa olinmagan bo‘lsa eski fayl ustidan avtomatik yozilmaydi.
          g.autosaveBlocked = true;
          g.autosaveBlockReason = 'Avtosaqlash o‘chiq: eski saqlash nusxasini olib bo‘lmadi. Sozlamalardan qo‘lda saqlang.';
        }
      }
    } else {
      g.resetToNewCity();
      if (res.status === 'invalid') {
        g.autosaveBlocked = true;
        g.autosaveBlockReason = 'Avtosaqlash o‘chiq: saqlangan fayl buzilgan';
        g.invalidSaveInfo = { error: res.error, raw: res.raw };
        g.modal = 'invalidSave';
      } else if (res.status === 'unavailable') {
        g.saveError = res.error;
        g.pushToast(res.error, 'error');
      }
    }
    return g;
  }

  /**
   * Yangi shahar. `empty` — o‘yinchi «Yangi shahar» bosganda: hech narsa qurilmagan (kirish ko‘prigi ham yo‘q —
   * ko‘priklarni o‘yinchi o‘zi quradi). Birinchi ochilishda — boshlang‘ich mahalla bilan.
   */
  resetToNewCity(empty = false) {
    const preset = createPresetObjects();
    const objects = empty ? [] : preset.objects;
    const nextId = preset.nextId;
    this.objects = new Map(objects.map((o) => [o.id, o]));
    this.nextId = nextId;
    this.seed = 1;
    this.money = START_MONEY;
    this.simTime = 0;
    this.tickAccumulator = 0;
    this.tickCount = 0;
    this.tutorial = initialTutorial();
    this.skill = 0;
    this.eduTasks = 0;
    this.healthTaskDone = false;
    this.civic = initialCivic();
    this.dinos = [];
    this.hints = { construction: false, arrival: false, gateAuto: true };
    this.traffic.load(undefined, this.objects);
    this.selectedVehicle = null;
    this.defenseChecked = false;
    this.defenseSeen = null;
    this.camera = { ...DEFAULT_CAMERA };
    this.lastReport = null;
    this.selectedId = null;
    this.budgetOpen = false;
    this.tool = 'select';
    this.buildType = null;
    this.dastyorOpen = true;
    this.dastyorMessage = null;
    this.paused = false;
    this.rebuildIndexes();
    this.terrain = null;
    this.ensureTerrain();
    this.ensureDino();
    this.ensureHerd([]);
  }

  applySave(d: SaveData) {
    this.objects = new Map(d.placedObjects.map((o) => [o.id, { ...o }]));
    this.seed = d.seed;
    this.money = d.money;
    this.simTime = d.simTime;
    this.tickAccumulator = d.tickAccumulator;
    this.tickCount = d.tickCount;
    this.nextId = d.nextId;
    this.tutorial = Object.assign(initialTutorial(), d.tutorial);
    this.skill = clampSkill(d.education?.skill ?? 0);
    this.eduTasks = Math.max(0, Math.min(EDU_TASKS.length, Math.floor(d.education?.tasksDone ?? 0)));
    this.healthTaskDone = d.health?.taskDone === true;
    this.civic = d.civic ? structuredClone(d.civic) : initialCivic();
    this.dinos = structuredClone(d.creatures?.dinos ?? []);
    this.hints = { construction: d.hints?.construction === true, arrival: d.hints?.arrival === true, gateAuto: true };
    this.defenseChecked = d.defense?.checked === true;
    this.selectedVehicle = null;
    this.defenseSeen = null;
    this.settings = { ...this.settings, ...d.settings };
    this.camera = { ...d.camera };
    this.dastyorOpen = !this.tutorial.skipped && !this.tutorial.completed && !this.tutorial.hidden;
    // Residents va uzilish taymeri saqlanadi; yo‘l/ta’minot/baxt/budjet qayta hisoblanadi.
    // Offline vaqt hisoblanmaydi: yuklash aholi yoki pulni qo‘shimcha o‘zgartirmaydi.
    for (const o of this.objects.values()) {
      const cap = CATALOG[o.type].capacity;
      o.residents = Math.max(0, Math.min(cap, Math.floor(o.residents)));
      o.outageTicks = Math.max(0, Math.floor(o.outageTicks ?? 0));
      if (o.build) {
        // saqlangan joyidan davom etadi (qayta to‘lov yo‘q); yaroqsiz bo‘lsa — tayyor
        const b = o.build;
        if (!(b.duration > 0) || !Number.isFinite(b.elapsed) || b.paid !== true) delete o.build;
        else b.elapsed = Math.max(0, Math.min(b.duration, b.elapsed));
      }
      // darvoza holati aynan tiklanadi; yaroqsiz bo‘lsa — xavfsiz yopiq holat (yopiq ko‘rinib, ochiq qolmaydi)
      if (o.type === 'himoya_darvoza') {
        if (!isGateState(o.gate)) o.gate = newGateState();
        else o.gate = { ...o.gate, car: o.gate.car ? { ...o.gate.car } : null };
        // bir martalik: avvalgi versiyada sukut bo‘yicha «qo‘lda, yopiq» qurilgan darvozalar avtomatik rejimga
        // (transport kelsa ochiladi, dinozavr yaqin bo‘lsa ochilmaydi) — aks holda yangi aholi kirolmay qolardi
        if (d.hints?.gateAuto !== true && o.gate.mode === 'manual' && o.gate.want === 'closed') o.gate.mode = 'auto';
      } else delete o.gate;
    }
    this.rebuildIndexes();
    // safarlar va band qilingan o‘rinlar (eski saqlashda yo‘q — bo‘sh); yetkazilganlar takror qo‘shilmaydi
    this.traffic.load(d.migration, this.objects);
    // saqlangan tog‘lar joyida qoladi; eski saqlashda (yoki xarita o‘lchami o‘zgargan bo‘lsa) — faqat bo‘sh joyga
    this.terrain = d.terrain && isTerrainState(d.terrain) && terrainCurrent(d.terrain) ? structuredClone(d.terrain) : null;
    this.ensureTerrain();
    this.ensureDino();
    this.ensureHerd((d.creatures?.herd ?? []).filter(isHerdDino));
  }

  private herdWorld() {
    return {
      occ: this.occ, dinoCells: this.apatoCells(), city: this.herdCity, avoid: this.dinos.length ? patrolPath() : [], bigs: this.dinos.map((d) => ({ x: d.ax, z: d.az, len: d.len })),
      blocks: this.navBlocks, inside: this.insideAt, vehicles: this.traffic.vehicleBodies(),
      ...this.raidWorld(),
    };
  }

  private raidCache: { key: number; value: { cityTargets: NonNullable<import('./herd').HerdWorld['cityTargets']>; walls: { x: number; z: number }[] } } | null = null;
  /** Dinozavr hujumi uchun: shahar binolari (to‘rtburchaklari) va tayyor devor kataklari — faqat o‘zgarishda */
  private raidWorld() {
    if (this.raidCache?.key === this.navVersion) return this.raidCache.value;
    const cityTargets: { id: string; x0: number; z0: number; x1: number; z1: number }[] = [];
    const walls: { x: number; z: number }[] = [];
    for (const o of this.objects.values()) {
      if (o.build) continue;
      if (isDefense(o.type)) {
        if ((o.damage ?? 0) < 1) for (const c of footprintCells(o.type, o.gridX, o.gridZ, o.rotation)) walls.push(c);
        continue;
      }
      if (!isCityObject(o) || (o.damage ?? 0) >= 1) continue;
      const cs = footprintCells(o.type, o.gridX, o.gridZ, o.rotation);
      cityTargets.push({ id: o.id, x0: Math.min(...cs.map((c) => c.x)), z0: Math.min(...cs.map((c) => c.z)), x1: Math.max(...cs.map((c) => c.x)), z1: Math.max(...cs.map((c) => c.z)) });
    }
    this.raidCache = { key: this.navVersion, value: { cityTargets, walls } };
    return this.raidCache.value;
  }

  /**
   * Dinozavr zarari: bino yonida turgan (stomp) — binoga, devor oldida urinayotgan (probe) — eng yaqin devor/darvoza
   * qismiga. 1 ga yetsa: bino ishlamaydi, devor buziladi (o‘sha joy ochiq bo‘ladi). Qon/jarohat yo‘q.
   */
  private applyDinoDamage(dt: number) {
    let broke: PlacedObject[] | null = null;
    const rw = this.raidWorld();
    for (const d of this.herd.dinos) {
      if (d.mode !== 'stomp' && !(d.mode === 'probe' && !d.target)) continue;
      const r = herdRadius(HERD_BY_TYPE[d.type]);
      if (d.mode === 'stomp') {
        const t = rw.cityTargets.find((b) => b.id === d.raidOn);
        const o = t && this.objects.get(t.id);
        if (!o || rectDist(d.x, d.z, t!) > r + 2.5) continue;
        const was = o.damage ?? 0;
        o.damage = Math.min(1, was + dt / DAMAGE_CONFIG.buildingSeconds);
        if (was < 1 && o.damage >= 1) (broke ??= []).push(o);
      } else {
        let best: PlacedObject | null = null, bd = r + 1.6;
        for (const c of rw.walls) {
          const dd = Math.hypot(c.x + 0.5 - d.x, c.z + 0.5 - d.z);
          if (dd < bd) { const o = this.objectAt(c.x, c.z); if (o) { bd = dd; best = o; } }
        }
        if (!best) continue;
        const was = best.damage ?? 0;
        best.damage = Math.min(1, was + dt / DAMAGE_CONFIG.wallSeconds);
        if (was < 1 && best.damage >= 1) (broke ??= []).push(best);
      }
    }
    if (!broke) return;
    for (const o of broke) this.pushToast(isDefense(o.type) ? `Dinozavr ${CATALOG[o.type].name.toLowerCase()}ni buzdi — chegarada ochiq joy! Ta’mirlang.` : `Dinozavr «${CATALOG[o.type].name}»ni ishdan chiqardi — ta’mirlash kerak`, 'error');
    this.recompute();
    this.scheduleAutosave();
    this.emit(true);
  }

  /** Ta’mirlash: pullik qisqa qurilish (tugaguncha himoya/bino ishlamaydi) */
  repair(id: string): boolean {
    const o = this.objects.get(id);
    if (!o || !(o.damage ?? 0) || o.build) return false;
    const cost = repairCost(o);
    if (this.money < cost) { this.pushToast('Ta’mirlash uchun mablag‘ yetarli emas', 'error'); return false; }
    this.money -= cost;
    this.noteConstruction(cost);
    delete o.damage;
    if (CONSTRUCTION.enabled) o.build = { elapsed: 0, duration: DAMAGE_CONFIG.repairSeconds, paid: true };
    this.recompute();
    this.pushToast(`${CATALOG[o.type].name}: ta’mirlash boshlandi (−${fmt(cost)})`, 'ok');
    this.scheduleAutosave();
    this.emit(true);
    return true;
  }

  /** Shikastlangan himoya qismlari / binolar ro‘yxati va jami ta’mirlash narxi */
  damaged(kind: 'defense' | 'city'): { list: PlacedObject[]; cost: number } {
    const list = this.list.filter((o) => (o.damage ?? 0) > 0 && !o.build && (kind === 'defense') === isDefense(o.type));
    return { list, cost: list.reduce((a, o) => a + repairCost(o), 0) };
  }

  repairAll(kind: 'defense' | 'city') {
    const { list, cost } = this.damaged(kind);
    if (!list.length) return;
    if (this.money < cost) { this.pushToast('Hammasini ta’mirlash uchun mablag‘ yetarli emas', 'error'); return; }
    for (const o of list) this.repair(o.id);
  }

  /** Dinozavr navigatsiyasi: yo‘l va to‘liq ochiq darvoza — o‘tiladi; devor, yopiq darvoza, binolar — to‘siq */
  /** Transport dunyosi: yo‘llar, obyektlar, dinozavr tanalari, uyga joylashtirish */
  private trafficWorld(): TrafficWorld {
    const bodies = this.herd.dinos.map((d) => ({ x: d.x, z: d.z, r: herdRadius(HERD_BY_TYPE[d.type]) }));
    for (const a of this.dinos) bodies.push({ x: a.ax, z: a.az, r: a.len * 0.35 });
    return {
      objects: this.objects, roads: this.roads, version: this.navVersion, statuses: this.statuses, population: this.population,
      dinoCells: this.dinoCellsSet(), dinoBodies: bodies, deliver: this.deliver,
      free: this.freeLand, inside: this.insideAt,
      intruders: this.herd.dinos.filter((d) => d.mode !== 'leave' && this.inCityArea(d.x, d.z)).map((d) => ({ id: d.id, x: d.x, z: d.z })),
      stations: this.active.filter((o) => isSecurity(o.type) && this.statuses.get(o.id)?.active),
      // tashqari: binolar hududidan kamida 5 katak narida
      evict: (id) => { if (this.herd.evict(id, (x, z) => !this.inCityArea(x - 5, z) && !this.inCityArea(x + 5, z) && !this.inCityArea(x, z - 5) && !this.inCityArea(x, z + 5) && !this.inCityArea(x, z))) this.pushToast('Politsiya dinozavrni shahardan chiqarmoqda', 'info'); },
    };
  }

  /** Bo‘sh yer: obyekt, suv, tik tog‘ yo‘q (xarita tashqarisida — tekis tabiat) */
  private freeLand = (x: number, z: number): boolean => {
    if (this.occ.get(x, z) || isWater(x, z) || terrainBlocksBuild(x, z)) return false;
    return inBounds(x, z) || (this.terrainField?.cellHeight(x, z) ?? 0) <= 0.08;
  }

  /** Transport uy oldiga yetib, yo‘lovchilar tushdi: aholiga bir marta qo‘shiladi (sig‘imdan oshmaydi) */
  private deliver = (houseId: string, count: number): number => {
    const o = this.objects.get(houseId);
    if (!o || CATALOG[o.type].kind !== 'house' || o.build) return 0;
    const add = Math.max(0, Math.min(count, CATALOG[o.type].capacity - o.residents));
    if (!add) return 0;
    o.residents += add;
    o.settled = true; // shu uyga oila joylashdi — qayta olib kelinmaydi
    this.arrivedSinceTick += add;
    this.budgetCache = null;
    if (!this.hints.arrival) {
      this.hints.arrival = true;
      this.dastyorMessage = 'Yangi aholi shaharga yetib keldi! Ular uchun uy, ish va xizmatlarni tayyorlab boramiz.';
      this.pushToast('Dastyor: Yangi aholi shaharga yetib keldi! Ular uchun uy, ish va xizmatlarni tayyorlab boramiz.', 'ok');
    }
    this.checkTutorial();
    this.scheduleAutosave();
    this.emit();
    return add;
  };

  /**
   * Kirish yo‘li taklifi: shahar yo‘l tarmog‘idan xarita chetigacha (tashqarisida tashqi yo‘l uchun tekis joy bor)
   * eng qisqa bo‘sh yo‘l. O‘yinchi tugma bilan quradi (pul to‘lanadi) — avtomatik qurilmaydi.
   */
  suggestEntryRoad(): { x: number; z: number }[] | null {
    const key = (x: number, z: number) => x + ',' + z;
    const pocket = pocketSet(this.objects.values());
    const free = (x: number, z: number) => inBounds(x, z) && !this.occ.get(x, z) && !isWater(x, z) && !terrainBlocksBuild(x, z) && !pocket.has(key(x, z));
    const prev = new Map<string, string | null>();
    const q: { x: number; z: number }[] = [];
    for (const k of this.roads.cells.keys()) {
      const [x, z] = k.split(':').map(Number);
      if (!this.roads.isConnected(x, z)) continue;
      prev.set(key(x, z), null);
      q.push({ x, z });
    }
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      // chetga yetdi va tashqarisida tashqi yo‘l uchun joy bor
      if (prev.get(key(c.x, c.z)) !== null && edgeDirs(c.x, c.z).some((d) => stubFrom(c.x, c.z, d))) {
        const out: { x: number; z: number }[] = [];
        for (let k: string | null | undefined = key(c.x, c.z); k && prev.get(k) !== undefined; k = prev.get(k)) {
          const [x, z] = k.split(',').map(Number);
          if (this.roads.isRoad(x, z)) break;
          out.push({ x, z });
        }
        return out.reverse();
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, nz = c.z + dz, k = key(nx, nz);
        if (prev.has(k) || !free(nx, nz)) continue;
        prev.set(k, key(c.x, c.z));
        q.push({ x: nx, z: nz });
      }
    }
    return null;
  }

  /** Qo‘lda yopilgan darvozalarni avtomatik rejimga o‘tkazish (transport kelganda ochiladi, dinozavr yaqin bo‘lsa — yo‘q) */
  autoAllGates() {
    let n = 0;
    for (const o of this.objects.values()) if (o.type === 'himoya_darvoza' && o.gate?.mode === 'manual') { o.gate.mode = 'auto'; n++; }
    if (n) this.pushToast(`${n} ta darvoza avtomatik rejimga o‘tkazildi`, 'ok');
    this.scheduleAutosave();
    this.emit();
  }

  /** Taklif qilingan kirish yo‘lini qurish (oddiy yo‘l narxida) */
  buildEntryRoad(): RoadPathResult | null {
    const p = this.suggestEntryRoad();
    if (!p || !p.length) { this.pushToast('Xarita chetigacha bo‘sh yo‘l topilmadi — yo‘lni o‘zingiz chizing', 'error'); return null; }
    return this.buildRoad(p);
  }

  private intruderSeen = 0;
  /** Shahar ichida dinozavr: bir marta ogohlantirish; politsiya bo‘limi yo‘q bo‘lsa — nima qilish kerakligi */
  private watchIntruders() {
    const n = this.herd.dinos.filter((d) => d.mode !== 'leave' && this.inCityArea(d.x, d.z)).length;
    if (n > 0 && this.intruderSeen === 0) {
      const hasPolice = this.active.some((o) => isSecurity(o.type) && this.statuses.get(o.id)?.active);
      this.pushToast(hasPolice ? 'Shaharga dinozavr kirdi! Politsiya mashinasi yo‘lga chiqdi.' : 'Shaharga dinozavr kirdi! Uni chiqarish uchun Politsiya yoki Xavfsizlik xizmati binosini quring (yo‘l va elektrga ulang).', 'error');
      if (!hasPolice) this.dastyorMessage = 'Dinozavr shaharga kirdi. Politsiya binosi qursangiz, maxsus mashina uni shahardan chiqarib yuboradi. Devordagi ochiq joylarni ham yoping!';
    }
    this.intruderSeen = n;
  }

  private lastBlock: string | null = null;
  /** Kelish to‘xtasa — sababi bir marta bildiriladi (holat o‘zgarganda), har kadrda takrorlanmaydi */
  private watchMigration() {
    const b = this.traffic.block;
    if (b === this.lastBlock) return;
    this.lastBlock = b;
    if (!MIGRATION_CONFIG.transport) return;
    if (b === 'noEntry' || b === 'noRoad' || b === 'noSupply' || b === 'unsafe' || b === 'gateClosed') {
      this.pushToast(`Yangi aholi kelmayapti: ${MIGRATION_BLOCK_TEXT[b]}`, 'error');
      if (b === 'noEntry') this.dastyorMessage = 'Mashinalar shaharga xarita chetidagi tashqi yo‘ldan kiradi. «Aholi» panelida «Kirish yo‘lini qurish» tugmasini bosing.';
      this.emit();
    }
  }

  /** Yo‘lda (transportda) kelayotgan aholi */
  get enRoute() {
    return this.traffic.enRoute;
  }

  /** Haqiqatan bo‘sh uy o‘rinlari (band qilinganlarsiz) */
  get freeSeats() {
    return this.traffic.freeSeats(this.objects.values());
  }

  selectVehicle(id: string | null) {
    this.selectedVehicle = id;
    if (id) { this.selectedId = null; this.budgetOpen = false; }
    this.emit();
  }

  private navBlocks = (x: number, z: number): boolean => {
    const id = this.occ.get(x, z);
    if (!id) return false;
    const o = this.objects.get(id);
    if (!o) return true;
    if (o.type === 'road') return false;
    if (o.type === 'himoya_darvoza' && !o.build && gateNavOpen(o.gate)) return false;
    // buzilgan devor/darvoza — ochiq joy
    if (isDefense(o.type) && !o.build && (o.damage ?? 0) >= 1) return false;
    return true;
  };

  private insideAt = (x: number, z: number): boolean => this.defense.inside(x, z);

  // ---------- shahar himoyasi ----------

  /**
   * Himoya holati: dinozavr tashqaridan (xarita atrofidagi tabiat chetidan) shahar binolariga yo‘l topa oladimi.
   * Faqat obyektlar yoki darvoza holati o‘zgarganda qayta hisoblanadi (har kadrda emas).
   */
  get defense(): DefenseEval {
    const key = `${this.navVersion}|${this.gateNavVersion}`;
    if (this.defenseCache?.key === key) return this.defenseCache.value;
    if (!this.terrainMask || this.terrainMask.field !== this.terrainField) this.terrainMask = { field: this.terrainField, mask: terrainPassMask(herdTerrainOk) };
    const value = evaluateDefense(this.list, this.terrainMask.mask);
    this.defenseCache = { key, value };
    return value;
  }

  /** Himoyalangan hududda qolgan dinozavrlar soni */
  get dinosInside(): number {
    const d = this.defense;
    if (d.status === 'none') return 0;
    return this.herd.dinos.filter((h) => d.inside(h.x, h.z)).length + this.dinos.filter((a) => d.inside(a.ax, a.az)).length;
  }

  /** Darvoza qanotlari uchun band yon kataklar (bino va yo‘l qo‘yilmaydi) */
  private pocketReason(cells: Cell[]): string | null {
    const pk = pocketSet(this.objects.values());
    if (!pk.size) return null;
    return cells.some((c) => pk.has(c.x + ',' + c.z)) ? 'Bu joy darvoza qanotlari uchun kerak (faqat devor qurish mumkin)' : null;
  }

  private dinoCellsSet(): Set<string> {
    const s = this.herd.occupied();
    for (const k of this.dinoReserved()) s.add(k);
    return s;
  }

  /** Devor yo‘nalishi (sudrab chizilgan): har katak holati, jami narx; hammasi yaroqli bo‘lsagina quriladi */
  checkWallPath(path: Cell[]): WallPlan {
    const dc = this.dinoCellsSet();
    return planWall(path, { objAt: (x, z) => this.objectAt(x, z), money: this.money, rotation: this.buildRotation, dinoAt: (x, z) => dc.has(x + ',' + z) });
  }

  buildWall(path: Cell[]): WallPlan {
    if (this.modal) return { ok: false, reason: 'Avval oynani yoping', cells: [], newCount: 0, cost: 0 };
    const plan = this.checkWallPath(path);
    if (!plan.ok) {
      // pul olinmaydi, qisman qurilmaydi
      if (plan.reason !== 'Bu yerda devor allaqachon bor') { this.pushToast(plan.reason, 'error'); this.sfx('error'); }
      return plan;
    }
    this.sfx('confirm');
    this.money -= plan.cost; // bir marta, butun yo‘nalish uchun
    this.noteConstruction(plan.cost);
    for (const c of plan.cells) {
      if (c.state !== 'new') continue;
      const o: PlacedObject = { id: 'u' + this.nextId++, type: c.type, gridX: c.x, gridZ: c.z, rotation: c.rotation, residents: 0, outageTicks: 0, userPlaced: true };
      if (needsConstruction(c.type)) o.build = newBuild(); // hammasi parallel quriladi
      this.objects.set(o.id, o);
      this.occ.add(o);
    }
    this.recompute();
    this.pushToast(`Himoya devori: ${plan.newCount} ta qism qurilmoqda (−${fmt(plan.cost)})`, 'ok');
    this.scheduleAutosave();
    this.emit(true);
    return plan;
  }

  /** Darvoza buyrug‘i: ochish, yopish yoki avtomatik rejim */
  gateCommand(id: string, cmd: 'open' | 'close' | 'auto') {
    const o = this.objects.get(id);
    if (!o || o.type !== 'himoya_darvoza') return;
    const s = (o.gate ??= newGateState());
    if (cmd === 'auto') s.mode = 'auto';
    else {
      s.mode = 'manual';
      s.want = cmd === 'open' ? 'open' : 'closed';
      if (cmd === 'open' && !o.build && this.dinoNear(gateCenter(o), DEFENSE_CONFIG.gateRun.dangerRadius)) this.pushToast('Diqqat: yaqinda dinozavr bor — ochiq darvozadan kirishi mumkin', 'error');
    }
    this.scheduleAutosave();
    this.emit();
  }

  private dinoNear(c: Cell, r: number): boolean {
    const x = c.x + 0.5, z = c.z + 0.5;
    return this.herd.dinos.some((d) => Math.hypot(d.x - x, d.z - z) < r) || this.dinos.some((d) => Math.hypot(d.ax - x, d.az - z) < r + d.len * 0.4);
  }

  /** Darvozalar: avtomatika, mashina, animatsiya (o‘yin vaqti). Navigatsiya faqat holati o‘zgargan darvoza atrofida yangilanadi. */
  private stepGates(dt: number) {
    let changed: Cell[] | null = null;
    let phaseChanged = false;
    let busySet: Set<string> | null = null;
    for (const o of this.objects.values()) {
      if (o.type !== 'himoya_darvoza' || o.build) continue;
      const s = (o.gate ??= newGateState());
      const cells = footprintCells(o.type, o.gridX, o.gridZ, o.rotation);
      const c = gateCenter(o);
      busySet ??= this.dinoCellsSet();
      const busyDino = cells.some((p) => busySet!.has(p.x + ',' + p.z));
      const sig = this.traffic.gateSignals.get(o.id);
      const navBefore = gateNavOpen(s);
      const phaseBefore = gatePhase(s);
      const ev = stepGate(s, dt, { busyDino, danger: this.dinoNear(c, DEFENSE_CONFIG.gateRun.dangerRadius), request: !!sig?.request, busyVehicle: !!sig?.busy });
      if (ev.waitStart) this.pushToast('Darvoza yo‘li band. Yopilish kutilmoqda.', 'info');
      if (gateNavOpen(s) !== navBefore) (changed ??= []).push(...cells);
      if (gatePhase(s) !== phaseBefore) phaseChanged = true;
    }
    if (changed) {
      this.gateNavVersion++;
      this.herd.patchNav(this.herdWorld(), changed);
    }
    if (changed || phaseChanged) { this.scheduleAutosave(); this.emit(); }
  }

  /** Himoya ogohlantirishlari: faqat holat o‘zgarganda bir marta (har soniyada takrorlanmaydi) */
  private watchDefense(dt: number) {
    const seen = this.defenseSeen;
    if (seen && (seen.t -= dt) > 0) return;
    const d = this.defense;
    const inside = this.dinosInside;
    if (seen && d.status !== 'none') {
      if (d.status !== seen.status) {
        if (d.status === 'gap') this.pushToast('Chegarada ochiq joy bor.', 'error');
        else if (d.status === 'gateOpen') this.pushToast('Darvoza ochiq. Dinozavr kirishi mumkin.', 'info');
        else if (d.status === 'closed' && seen.status !== 'none') this.pushToast('Chegara yopildi — shahar himoyalangan', 'ok');
      }
      if (inside > 0 && seen.inside === 0) this.pushToast('Ichkarida dinozavr qolgan.', 'error');
    }
    this.defenseSeen = { status: d.status, inside, t: 1 };
  }

  setDefenseOverlay(on: boolean) {
    this.defenseOverlay = on;
    this.emit();
  }

  /** «Himoyani tekshirish»: natija Dastyor topshirig‘ida hisobga olinadi */
  checkDefense(): DefenseEval {
    const d = this.defense;
    if (d.status === 'closed' && this.dinosInside === 0) {
      if (!this.defenseChecked) { this.defenseChecked = true; this.scheduleAutosave(); this.sfx('task'); }
      this.pushToast(`Himoya tekshirildi: chegara yopiq, ${d.protectedIds.length} ta bino himoyalangan`, 'ok');
    } else if (d.status === 'closed') this.pushToast('Chegara yopiq, lekin ichkarida dinozavr qolgan.', 'error');
    else if (d.status === 'none') this.pushToast('Avval shahar chetiga devor quring', 'info');
    else if (d.status === 'empty') this.pushToast('Devor ichida himoya qilinadigan bino yo‘q', 'info');
    else this.pushToast(`${DEFENSE_STATUS_TEXT[d.status]}: ${d.exposedIds.length} ta bino himoyasiz`, 'error');
    this.emit();
    return d;
  }

  /** Eski (apatozavr) dinozavrlar band kataklari; GLB profili hali yuklanmagan bo‘lsa — saqlangan joyi atrofidagi doira */
  private apatoCells(): Set<string> {
    if (this.dinoProfile) return this.dinoReserved();
    const out = new Set<string>();
    for (const d of this.dinos) {
      const r = d.len * 0.65;
      for (let z = Math.floor(d.az - r); z <= Math.ceil(d.az + r); z++) for (let x = Math.floor(d.ax - r); x <= Math.ceil(d.ax + r); x++) {
        if (Math.hypot(x + 0.5 - d.ax, z + 0.5 - d.az) <= r) out.add(x + ',' + z);
      }
    }
    return out;
  }

  private herdKey() {
    return `${this.navVersion}|${this.terrain?.seed ?? 0}|${this.terrain?.mountains.length ?? 0}`;
  }

  /** Har turdan bitta (takrorlanmaydi); saqlangani yaroqli bo‘lsa joyida */
  ensureHerd(saved: import('./herd').HerdDino[]) {
    this.herd.invalidate();
    this.herd.ensure(this.herdWorld(), this.herdKey(), saved);
  }

  /**
   * Tog‘lar yo‘q bo‘lsa yaratadi: biror bino, yo‘l, suv, boshlang‘ich (asl) xarita, kirish yo‘li, dinozavr va
   * uning marshruti ustiga tog‘ (hatto etagi ham) tushmaydi. Mavjud narsa o‘chirilmaydi yoki siljimaydi.
   */
  ensureTerrain() {
    if (!this.terrain) {
      const W = LAND_MAX - LAND_MIN + 1;
      const keepMask = new Uint8Array(W * W);
      const hardMask = new Uint8Array(W * W);
      const mark = (x: number, z: number, r: number, m = keepMask) => {
        for (let zz = Math.floor(z - r); zz <= Math.ceil(z + r); zz++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
          if (xx < LAND_MIN || zz < LAND_MIN || xx > LAND_MAX || zz > LAND_MAX) continue;
          if (Math.hypot(xx + 0.5 - x, zz + 0.5 - z) <= r + 0.71) m[(zz - LAND_MIN) * W + (xx - LAND_MIN)] = 1;
        }
      };
      for (const o of this.objects.values()) for (const c of footprintCells(o.type, o.gridX, o.gridZ, o.rotation)) { mark(c.x + 0.5, c.z + 0.5, 2); mark(c.x + 0.5, c.z + 0.5, 2, hardMask); }
      for (const d of this.dinos) { mark(d.ax, d.az, d.len * 0.65 + 2); mark(d.ax, d.az, d.len * 0.65 + 2, hardMask); }
      const maxLen = Math.max(...DINO_SPECS.map((s) => s.len));
      // marshrut yo‘lagi: tana marshrut bo‘ylab cho‘zilgan — yon tomonga ~uzunlikning 0.3 qismi + zaxira
      for (const pt of patrolPath()) mark(pt.x, pt.z, maxLen * 0.3 + 1.5);
      const CORE = MAP_CONFIG.coreSize;
      // qat’iy: obyektlar (2 katak zaxira bilan), saqlangan dinozavrlar, kirish yo‘li — hech narsa tushmaydi
      const hard = (x: number, z: number) => {
        if (Math.abs(z - ENTRY_CELL.z) <= 2 && x <= ENTRY_CELL.x) return true; // g‘arbdan keladigan kirish yo‘li
        if (x < LAND_MIN || z < LAND_MIN || x > LAND_MAX || z > LAND_MAX) return false;
        return hardMask[(z - LAND_MIN) * W + (x - LAND_MIN)] === 1;
      };
      // yumshoq: asl xarita (tekis qoladi) va dinozavr marshruti — tog‘ va ko‘l tushmaydi, sayoz soy kesib o‘tishi mumkin
      const soft = (x: number, z: number) => {
        if (x >= -2 && z >= -2 && x <= CORE + 1 && z <= CORE + 1) return true;
        if (isCoreWater(x, z)) return true;
        if (x < LAND_MIN || z < LAND_MIN || x > LAND_MAX || z > LAND_MAX) return false;
        return keepMask[(z - LAND_MIN) * W + (x - LAND_MIN)] === 1;
      };
      setActiveTerrain(null); // eski relyefning ko‘llari yangi generatsiyaga to‘siq bo‘lmasin
      // bir xil kirish (seed + to‘siq maskalari) — bir xil natija: qayta hisoblamaslik uchun kesh
      let h = 2166136261 ^ (this.seed | 0);
      for (const m of [hardMask, keepMask]) for (let i = 0; i < m.length; i++) if (m[i]) h = Math.imul(h ^ i, 16777619);
      const key = `${this.seed}|${h >>> 0}`;
      const hit = TERRAIN_MEMO.get(key);
      this.terrain = hit ? structuredClone(hit) : generateTerrain(20261020 ^ (this.seed | 0), hard, soft);
      if (!hit) {
        TERRAIN_MEMO.set(key, structuredClone(this.terrain));
        if (TERRAIN_MEMO.size > 4) TERRAIN_MEMO.delete(TERRAIN_MEMO.keys().next().value!);
      }
    }
    this.terrainField = new TerrainField(this.terrain);
    setActiveTerrain(this.terrainField);
  }

  toSaveData(): SaveData {
    return {
      schemaVersion: SCHEMA_VERSION,
      seed: this.seed,
      money: this.money,
      simTime: this.simTime,
      tickAccumulator: this.tickAccumulator,
      tickCount: this.tickCount,
      nextId: this.nextId,
      placedObjects: [...this.objects.values()].map((o) => (o.gate ? { ...o, gate: { ...o.gate, car: o.gate.car ? { ...o.gate.car } : null } } : { ...o })),
      tutorial: { ...this.tutorial },
      education: { skill: this.skill, tasksDone: this.eduTasks },
      health: { taskDone: this.healthTaskDone },
      civic: structuredClone(this.civic),
      creatures: { dinos: structuredClone(this.dinos), herd: this.herd.serialize() },
      terrain: this.terrain ? structuredClone(this.terrain) : undefined,
      hints: { ...this.hints },
      defense: { checked: this.defenseChecked },
      migration: this.traffic.save(),
      settings: { ...this.settings },
      camera: { ...this.camera },
    };
  }

  // ---------- obuna ----------

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit(world = false) {
    this.version++;
    if (world) this.worldVersion++;
    for (const l of this.listeners) l();
  }

  // ---------- hisob-kitob ----------

  private rebuildIndexes() {
    this.occ = Occupancy.from(this.objects.values());
    this.recompute();
  }

  /** Yo‘l → stansiya → ta’minot → baxt; keyin Dastyor sharti. */
  recompute() {
    // darvoza (qurilayotgani ham) yo‘l tarmog‘ida qoladi
    this.roads = RoadGrid.from(this.objects.values());
    const prev = this.statuses;
    this.statuses = computeStatuses(this.active, this.roads);
    // shahar chegarasi (xarita tashqarisidagi qurilishlar ham) — dinozavr marshruti va hududi shunga moslashadi
    const CORE = MAP_CONFIG.coreSize;
    let bx0 = 0, bz0 = 0, bx1 = CORE - 1, bz1 = CORE - 1;
    for (const o of this.objects.values()) {
      const c = CATALOG[o.type], ex = Math.max(c.width, c.depth) - 1;
      bx0 = Math.min(bx0, o.gridX); bz0 = Math.min(bz0, o.gridZ);
      bx1 = Math.max(bx1, o.gridX + ex); bz1 = Math.max(bz1, o.gridZ + ex);
    }
    setDinoLayout({ x0: bx0, z0: bz0, x1: bx1, z1: bz1 });
    this.cityBox = { x0: bx0, z0: bz0, x1: bx1, z1: bz1 };
    // poda uchun: himoya qismlarisiz (devor tashqarisi va devor bilan shahar orasi — haqiqiy yer, devor — haqiqiy to‘siq)
    let hx0 = 0, hz0 = 0, hx1 = CORE - 1, hz1 = CORE - 1;
    // shahar hududi (dinozavr «shaharga kirdi»mi): haqiqiy binolar chegarasi, bo‘sh yer emas
    let ax0 = Infinity, az0 = Infinity, ax1 = -Infinity, az1 = -Infinity;
    for (const o of this.objects.values()) {
      if (isDefense(o.type)) continue;
      const c = CATALOG[o.type], ex = Math.max(c.width, c.depth) - 1;
      hx0 = Math.min(hx0, o.gridX); hz0 = Math.min(hz0, o.gridZ);
      hx1 = Math.max(hx1, o.gridX + ex); hz1 = Math.max(hz1, o.gridZ + ex);
      if (o.type === 'road' || c.kind === 'decor') continue;
      ax0 = Math.min(ax0, o.gridX - 1); az0 = Math.min(az0, o.gridZ - 1);
      ax1 = Math.max(ax1, o.gridX + ex + 2); az1 = Math.max(az1, o.gridZ + ex + 2);
    }
    this.herdCity = { x0: hx0, z0: hz0, x1: hx1, z1: hz1 };
    this.cityArea = ax0 === Infinity ? null : { x0: ax0, z0: az0, x1: ax1, z1: az1 };
    this.navVersion++;
    for (const [id, st] of this.statuses) st.lastNet = prev.get(id)?.lastNet ?? 0;
    this.budgetCache = null;
    this.checkTutorial();
    this.checkEduTasks();
    this.checkHealthTask();
  }

  private budgetCache: Budget | null = null;

  /**
   * Joriy holat bo‘yicha davriy budjet. Keyingi hisob davri aynan shu sof natijani balansga qo‘shadi;
   * HUD va «Shahar budjeti» paneli ham shuni ko‘rsatadi.
   */
  get budget(): Budget {
    return (this.budgetCache ??= computeBudget(this.active, this.statuses, this.skill));
  }

  get supply(): SupplySummary {
    return supplySummary(this.active, this.statuses);
  }

  /** Dastyor maslahati — uy paneli va xarita belgilari bilan bir xil ta’minot holatidan. */
  get advice(): string | null {
    return supplyAdvice(this.supply);
  }

  houseForecast(id: string): HouseForecast | null {
    const o = this.objects.get(id);
    if (!o || CATALOG[o.type].kind !== 'house') return null;
    const bonus = this.education.familyHouses.has(id) ? EDU_CONFIG.FAMILY_MOVE_IN_BONUS : 0;
    const f = houseForecast(o, this.statuses.get(id), bonus);
    if (MIGRATION_CONFIG.transport && f.nextDelta > 0) {
      // transport rejimi: uyga bir marta oila keladi (uy hajmiga qarab); joylashgan uyga qayta kelmaydi
      if (o.settled || o.residents > 0) return { ...f, state: 'full', nextDelta: 0 };
      return { ...f, nextDelta: Math.max(0, settleSize(o, f.capacity) - this.traffic.reserved(o.id)) || settleSize(o, f.capacity) };
    }
    return f;
  }

  /**
   * Ta’lim holati (talab, o‘rinlar, qamrov, malaka, har bino holati) — panel, budjet, hisob davri va
   * topshiriqlar uchun yagona hisob.
   */
  /** Tibbiyot: talab, faol xizmat sig‘imi, qamrov va har shifoxona holati — yagona hisob. */
  get health(): HealthSummary {
    return healthSummary(this.active, this.statuses, this.money, this.population);
  }

  get education(): EducationSummary {
    return educationSummary(this.active, this.statuses, this.money, this.skill, this.population);
  }

  supplyReason(id: string, kind: SupplyKind): string {
    const o = this.objects.get(id);
    return o ? supplyReason(o, kind, this.active, this.statuses, this.roads) : '';
  }

  get population() {
    return totalPopulation(this.active);
  }

  get happiness() {
    return cityHappiness(this.active, this.statuses);
  }

  /** Barcha obyektlar (qurilayotganlar ham — xarita va sahna uchun) */
  get list(): PlacedObject[] {
    return [...this.objects.values()];
  }

  /** Tayyor obyektlar — aholi, budjet, ta’minot, xizmatlar va topshiriqlar faqat shularni hisoblaydi */
  get active(): PlacedObject[] {
    const out: PlacedObject[] = [];
    for (const o of this.objects.values()) if (!o.build) out.push(o);
    return out;
  }

  /** Qurilayotgan obyektlar */
  get constructing(): PlacedObject[] {
    const out: PlacedObject[] = [];
    for (const o of this.objects.values()) if (o.build) out.push(o);
    return out;
  }

  /** Har kadrda chaqiriladi; dt soniyada. */
  update(dt: number) {
    if (this.paused || this.tabHidden) return;
    const step = Math.min(Math.max(dt, 0), MAX_FRAME_DT);
    this.simTime += step;
    // dinozavr: o‘yin vaqti bilan (pauza/yashirin tabda to‘xtaydi, katta dt cheklangan)
    this.advanceConstruction(step);
    // transport (darvozaga so‘rov va bandlik signali shu yerda yangilanadi), keyin darvozalar
    this.traffic.step(step, this.trafficWorld());
    this.stepGates(step);
    if (this.dinoProfile) {
      // har biri boshqalarini to‘siq deb biladi (bir-birining ustidan o‘tmaydi)
      for (const d of this.dinos) stepDino(this.dinoProfile, { occ: this.occ, extra: this.othersReserved(d), others: this.dinos.filter((o) => o !== d).map((o) => ({ x: o.ax, z: o.az, len: o.len })) }, d, step);
    }
    // yangi dinozavrlar podasi (o‘yin vaqti bilan)
    this.herd.step(step, this.herdWorld(), this.herdKey());
    this.watchDefense(step);
    this.applyDinoDamage(step);
    this.watchIntruders();
    this.watchMigration();
    this.tickAccumulator += step;
    let ticked = false;
    while (this.tickAccumulator >= TICK_SECONDS) {
      this.tickAccumulator -= TICK_SECONDS;
      this.tick();
      ticked = true;
    }
    if (ticked) this.emit(true);
  }

  tick() {
    this.tickCount++;
    const edu = this.education;
    const transport = MIGRATION_CONFIG.transport;
    const report = runTick(this.active, this.statuses, this.tickCount, {
      skill: this.skill, familyHouses: edu.familyHouses, familyBonus: EDU_CONFIG.FAMILY_MOVE_IN_BONUS,
      moveIn: !transport, onMoveIn: (o, delta, served) => this.traffic.addDemand(o, delta, served),
    });
    if (transport) {
      // shu davrda transportda yetib kelganlar (aholiga uyga yetganda bir marta qo‘shilgan)
      report.movedIn = this.arrivedSinceTick;
      report.moved = report.movedIn - report.movedOut;
      this.arrivedSinceTick = 0;
    }
    this.money += report.net;
    // qurilish xarajati jurnali: o‘tgan davr yopiladi
    this.civic.construction.lastPeriod = this.civic.construction.period;
    this.civic.construction.period = 0;
    this.civic.lastPenalty = 0;
    // malaka davrdan davrga, faqat faol IT maktabi/universitet bo‘lsa o‘sadi (bino qurilishi bilan darhol emas)
    this.skill = clampSkill(this.skill + edu.skillDelta);
    this.lastReport = report;
    this.budgetCache = null; // aholi o‘zgardi → keyingi davr solig‘i ham
    this.checkTutorial();
    this.checkEduTasks();
    this.checkHealthTask();
    this.checkRule();
    this.scheduleAutosave();
  }

  // ---------- qurilish ----------

  checkPlacement(type: ObjectType, x: number, z: number, rot: Rotation): PlacementResult {
    if (type === 'himoya_darvoza') {
      const gc = checkGate(x, z, rot, { objAt: (cx, cz) => this.objectAt(cx, cz), money: this.money });
      if (gc.ok && this.dinoBlocks(footprintCells(type, x, z, rot))) return { ok: false, reason: 'Bu yerda dinozavr yuribdi — boshqa joy tanlang', cost: gc.cost };
      return { ok: gc.ok, reason: gc.reason, cost: gc.cost };
    }
    const res = validatePlacement(type, x, z, rot, this.occ, this.money);
    if (res.ok && type === 'avtobus_bekati' && !footprintCells(type, x, z, rot).some((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.roads.isRoad(c.x + dx, c.z + dz)))) {
      return { ok: false, reason: 'Bekat yo‘l chetiga qo‘yiladi', cost: res.cost };
    }
    if (res.ok && !isDefense(type)) {
      const pr = this.pocketReason(footprintCells(type, x, z, rot));
      if (pr) return { ok: false, reason: pr, cost: res.cost };
    }
    if (res.ok && this.dinoBlocks(footprintCells(type, x, z, rot))) return { ok: false, reason: 'Bu yerda dinozavr yuribdi — boshqa joy tanlang', cost: res.cost };
    return res;
  }

  // ---------- bosqichma-bosqich qurilish (construction.ts) ----------

  /** Qurilish vaqti o‘yin vaqti bilan; tugaganda bino tizimlarga bir marta qo‘shiladi. */
  private advanceConstruction(step: number) {
    let done: PlacedObject[] | null = null;
    let dc: Set<string> | null = null;
    for (const o of this.objects.values()) {
      if (!o.build) continue;
      o.build.elapsed = Math.min(o.build.duration, o.build.elapsed + step);
      if (o.build.elapsed < o.build.duration) continue;
      // himoya qismi dinozavrni ichiga qamab qo‘ymaydi: maydonda tana bo‘lsa tugash kutiladi
      if (isDefense(o.type)) {
        dc ??= this.dinoCellsSet();
        if (footprintCells(o.type, o.gridX, o.gridZ, o.rotation).some((c) => dc!.has(c.x + ',' + c.z))) {
          o.build.elapsed = o.build.duration - 1e-3;
          if (!o.build.hold) { o.build.hold = true; this.emit(); }
          continue;
        }
        delete o.build.hold;
      }
      (done ??= []).push(o);
    }
    if (!done) return;
    for (const o of done) {
      delete o.build;
      this.pushToast(`${CATALOG[o.type].name} qurib bitkazildi`, 'ok');
    }
    this.recompute(); // ta’minot, aholi, xizmat — shu paytdan, bir marta
    this.scheduleAutosave();
    this.emit(true);
  }

  /** Qurilish holati: foiz, bosqich, qolgan o‘yin vaqti (UI uchun). */
  buildInfo(id: string) {
    const o = this.objects.get(id);
    return o?.build ? buildProgress(o.build) : null;
  }

  // ---------- dinozavr ----------

  /** Dinozavrlar egallagan yoki joriy qadam siklida o‘tadigan kataklar (qurilish taqiqlanadi). */
  dinoReserved(): Set<string> {
    const out = new Set<string>();
    if (this.dinoProfile) for (const d of this.dinos) for (const k of reservedCells(this.dinoProfile, d)) out.add(k);
    return out;
  }

  private othersReserved(self: DinoState): Set<string> {
    // yangi dinozavrlar tanasi ham to‘siq
    const out = this.herd.occupied();
    if (this.dinoProfile) for (const d of this.dinos) if (d !== self) for (const k of reservedCells(this.dinoProfile, d)) out.add(k);
    return out;
  }

  private dinoBlocks(cells: { x: number; z: number }[]): boolean {
    const herd = this.herd.occupied();
    if (cells.some((c) => herd.has(c.x + ',' + c.z))) return true;
    if (!this.dinos.length || !this.dinoProfile) return false;
    const r = this.dinoReserved();
    return cells.some((c) => r.has(c.x + ',' + c.z));
  }

  /** Barcha dinozavr tanalari bo‘sh joydami (bino, yo‘l, suv, zona chegarasi va bir-biri) — sinov va diagnostika uchun. */
  dinoBodyClear(): boolean {
    const p = this.dinoProfile;
    if (!p) return true;
    return this.dinos.every((d) => bodyClear(p, { occ: this.occ, extra: this.othersBody(d) }, d.zone, d.ax, d.az, d.heading, d.len));
  }

  private othersBody(self: DinoState): Set<string> {
    const out = new Set<string>();
    if (this.dinoProfile) for (const d of this.dinos) if (d !== self) for (const k of reservedCells(this.dinoProfile, { ...d, mode: 'rest' })) out.add(k);
    return out;
  }

  /** Renderer GLB dan hisoblagan root-motion profilini beradi; dinozavrlar shundan keyin joylashadi/yuradi. */
  setDinoProfile(p: DinoProfile) {
    this.dinoProfile = p;
    this.ensureDino();
  }

  /**
   * DINO_SPECS bo‘yicha dinozavrlar: saqlangani yaroqli bo‘lsa — o‘sha, bo‘lmasa umumiy bo‘sh tabiat hududida yangisi.
   * Soni har doim spec soniga teng (ko‘paymaydi). Hech narsa buzilmaydi.
   */
  ensureDino() {
    const p = this.dinoProfile;
    if (!p) return;
    const out: DinoState[] = [];
    // paydo bo‘lish: eng katta bo‘sh chetki hudud markazi; yurish hududi — butun xaritaning bo‘sh tabiat yeri
    // xarita chetidagi eng katta bo‘sh hudud tomoni, lekin xaritadan tashqaridagi halqada (qurilishga xalaqit bermaydi)
    const spawnZone = findZone(this.occ);
    const CORE = MAP_CONFIG.coreSize, MID = CORE / 2;
    const zc = spawnZone ? { x: (spawnZone.x0 + spawnZone.x1 + 1) / 2, z: (spawnZone.z0 + spawnZone.z1 + 1) / 2 } : { x: MID, z: MID };
    const out1 = (v: number) => (v < MID ? -NATURE_RING / 2 : CORE - 1 + NATURE_RING / 2);
    const near = Math.abs(zc.x - MID) > Math.abs(zc.z - MID) ? { x: out1(zc.x), z: zc.z } : { x: zc.x, z: out1(zc.z) };
    const notes: string[] = [];
    DINO_SPECS.forEach((spec, i) => {
      const extra = this.herd.occupied(); // yangi dinozavrlar ustiga paydo bo‘lmaydi
      for (const d of out) for (const k of reservedCells(p, d)) extra.add(k);
      const w = { occ: this.occ, extra };
      const old = this.dinos[i];
      if (old && old.len === spec.len && dinoValid(p, w, { ...old, zone: NATURE_ZONE })) { out.push({ ...old, zone: NATURE_ZONE }); return; }
      // yangi joy: avvalgilar aylanadigan doira (uzunligi radiusida) ham band — yonma-yon tiqilib qolmasin
      const room = new Set(extra);
      for (const d of out) {
        const r = Math.ceil(d.len * 0.65);
        for (let z = Math.floor(d.az) - r; z <= Math.floor(d.az) + r; z++) for (let x = Math.floor(d.ax) - r; x <= Math.floor(d.ax) + r; x++) {
          if (Math.hypot(x + 0.5 - d.ax, z + 0.5 - d.az) <= r) room.add(x + ',' + z);
        }
      }
      // marshrutda: har dinozavr halqaning o‘z qismida (qarama-qarshi tomonlarda)
      const path = patrolPath();
      const pi = Math.floor((i / DINO_SPECS.length) * path.length + path.length * 0.1) % path.length;
      const onPath = spawnOnPath(p, { occ: this.occ, extra: room }, spec, pi);
      if (onPath) { out.push(onPath); return; }
      const s = spawnDino(p, { occ: this.occ, extra: room }, NATURE_ZONE, spec.seed, spec.len, near)
        ?? spawnDino(p, w, NATURE_ZONE, spec.seed, spec.len, near)
        ?? spawnDino(p, { occ: this.occ, extra: room }, NATURE_ZONE, spec.seed, spec.len, near, false)
        ?? spawnDino(p, w, NATURE_ZONE, spec.seed, spec.len, near, false);
      if (s) out.push(s);
      else notes.push(`${spec.len} katakli dinozavr uchun bo‘sh joy topilmadi`);
    });
    this.dinos = out;
    this.dinoNote = notes.length ? `${notes.join('; ')}. Hech narsa buzilmadi.` : null;
    if (this.dinoNote) console.warn('[dino]', this.dinoNote);
  }


  placeBuilding(type: ObjectType, x: number, z: number, rot: Rotation): PlacementResult {
    if (this.modal) return { ok: false, reason: 'Avval oynani yoping', cost: 0 };
    const res = this.checkPlacement(type, x, z, rot);
    if (!res.ok) {
      this.pushToast(res.reason, 'error');
      this.sfx('error');
      return res;
    }
    this.sfx('confirm');
    const o: PlacedObject = {
      id: 'u' + this.nextId++, type, gridX: x, gridZ: z, rotation: rot, residents: 0, outageTicks: 0, userPlaced: true,
    };
    if (type === 'himoya_darvoza') {
      // darvoza yo‘l katagi o‘rnini egallaydi (yo‘l tarmog‘ida darvoza o‘rta katagi yo‘l bo‘lib qoladi)
      const gc = checkGate(x, z, rot, { objAt: (cx, cz) => this.objectAt(cx, cz), money: this.money });
      const road = gc.roadId ? this.objects.get(gc.roadId) : undefined;
      if (road) { this.objects.delete(road.id); this.occ.remove(road); }
      o.gate = newGateState();
    }
    // maydon darhol band; bino qurilish tugagach tizimlarga qo‘shiladi
    if (needsConstruction(type)) o.build = newBuild();
    this.money -= res.cost; // narx faqat shu yerda, bir marta ayriladi
    this.noteConstruction(res.cost);
    this.objects.set(o.id, o);
    this.occ.add(o);
    this.recompute();
    if (o.build) {
      this.pushToast(`${CATALOG[type].name}: qurilish boshlandi (−${fmt(res.cost)})`, 'ok');
      if (!this.hints.construction) {
        // birinchi qurilishda bir marta qisqa tushuntirish (majburiy oyna emas)
        this.hints.construction = true;
        this.dastyorMessage = 'Bino avval poydevordan boshlanadi. Qurilish tugagach undan foydalanamiz!';
        this.pushToast('Dastyor: Bino avval poydevordan boshlanadi. Qurilish tugagach undan foydalanamiz!', 'info');
      }
    } else this.pushToast(`${CATALOG[type].name} qurildi (−${fmt(res.cost)})`, 'ok');
    this.scheduleAutosave();
    this.emit(true);
    return res;
  }

  checkRoadPath(path: { x: number; z: number }[], bridge = false): RoadPathResult {
    const res = validateRoadPath(path, this.occ, (x, z) => this.roads.isRoad(x, z), this.money, bridge);
    if (res.ok) {
      const pr = this.pocketReason(res.newCells);
      if (pr) return { ok: false, reason: pr, newCells: [], cost: 0 };
    }
    return res;
  }

  /** Ko‘prik — suv ustidagi yo‘l kataklari (to‘g‘ri chiziq), o‘yinchi o‘zi quradi. */
  buildBridge(path: { x: number; z: number }[]): RoadPathResult {
    return this.buildRoad(path, true);
  }

  buildRoad(path: { x: number; z: number }[], bridge = false): RoadPathResult {
    if (this.modal) return { ok: false, reason: 'Avval oynani yoping', newCells: [], cost: 0 };
    let res = this.checkRoadPath(path, bridge);
    if (res.ok && this.dinoBlocks(res.newCells)) res = { ok: false, reason: 'Yo‘l dinozavr ustidan o‘tolmaydi — u ketishini kuting', newCells: [], cost: 0 };
    if (!res.ok) {
      // Mablag‘ yetmasa butun harakat bekor qilinadi, qisman qurilmaydi.
      if (res.newCells.length > 0 || !/allaqachon bor$/.test(res.reason)) { this.pushToast(res.reason, 'error'); this.sfx('error'); }
      return res;
    }
    this.sfx('confirm');
    this.money -= res.cost;
    this.noteConstruction(res.cost);
    for (const c of res.newCells) {
      const o: PlacedObject = {
        id: 'u' + this.nextId++, type: 'road', gridX: c.x, gridZ: c.z, rotation: 0, residents: 0, outageTicks: 0, userPlaced: true,
      };
      this.objects.set(o.id, o);
      this.occ.add(o);
    }
    this.recompute();
    this.pushToast(bridge ? `Ko‘prik qurildi: ${res.newCells.length} katak (−${fmt(res.cost)})` : `${res.newCells.length} ta yo‘l katagi qurildi (−${fmt(res.cost)})`, 'ok');
    this.scheduleAutosave();
    this.emit(true);
    return res;
  }

  canDemolish(id: string): { ok: boolean; reason: string } {
    const o = this.objects.get(id);
    if (!o) return { ok: false, reason: 'Obyekt topilmadi' };
    if (o.type === 'road' && !o.userPlaced && isLockedRoadCell(o.gridX, o.gridZ)) return { ok: false, reason: 'Kirish yo‘lini buzib bo‘lmaydi' };
    if (o.build) return { ok: true, reason: 'Qurilish bekor qilinadi — mavjud qoida bo‘yicha pul qaytarilmaydi (0)' };
    return { ok: true, reason: 'Buzish bepul, narx qaytarilmaydi' };
  }

  demolish(id: string): boolean {
    if (this.modal) return false;
    const chk = this.canDemolish(id);
    if (!chk.ok) {
      this.pushToast(chk.reason, 'error');
      return false;
    }
    const o = this.objects.get(id)!;
    this.objects.delete(id);
    this.occ.remove(o);
    if (this.selectedId === id) this.selectedId = null;
    this.sfx('demolish');
    if (o.type === 'himoya_darvoza') {
      // darvoza buzilsa yo‘l uzilmaydi: o‘rta katakda yo‘l qoladi (bepul)
      const c = gateCenter(o);
      const r: PlacedObject = { id: 'u' + this.nextId++, type: 'road', gridX: c.x, gridZ: c.z, rotation: 0, residents: 0, outageTicks: 0, userPlaced: true };
      this.objects.set(r.id, r);
      this.occ.add(r);
    }
    // oxirgi bank buzilsa jamg‘arma yo‘qolmaydi — erkin budjetga qaytadi
    if (o.type === 'milliy_bank' && !this.list.some((x) => x.type === 'milliy_bank')) {
      const back = this.savingsTotal;
      if (back > 0) {
        this.money += back;
        this.pushToast(`Jamg‘arma (${fmt(back)}) erkin budjetga qaytarildi`, 'info');
      }
      this.civic.goals = [];
    }
    this.recompute();
    this.pushToast(o.build ? `${CATALOG[o.type].name}: qurilish bekor qilindi — pul qaytarilmaydi, maydon bo‘shadi` : `${CATALOG[o.type].name} buzildi — narx qaytarilmaydi`, 'info');
    this.scheduleAutosave();
    this.emit(true);
    return true;
  }

  objectAt(x: number, z: number): PlacedObject | null {
    const id = this.occ.get(x, z);
    return id ? this.objects.get(id) ?? null : null;
  }

  // ---------- vositalar ----------

  setTool(mode: ToolMode, type: ObjectType | null = null) {
    this.tool = mode;
    this.buildType = mode === 'build' ? type : null;
    if (mode !== 'select') this.selectedId = null;
    this.emit();
  }

  rotateBuild() {
    this.buildRotation = ((this.buildRotation + 1) % 4) as Rotation;
    this.emit();
  }

  cancelTool() {
    if (this.tool !== 'select') this.sfx('back');
    this.setTool('select');
  }

  select(id: string | null) {
    this.selectedId = id;
    if (id) { this.budgetOpen = false; this.selectedVehicle = null; }
    this.emit();
  }

  toggleBudget(open = !this.budgetOpen) {
    this.budgetOpen = open;
    if (open) this.selectedId = null;
    this.emit();
  }

  togglePause() {
    this.paused = !this.paused;
    this.emit();
  }

  setTabHidden(h: boolean) {
    this.tabHidden = h;
    this.emit();
  }

  openModal(m: ModalKind) {
    if (m && !this.modal) this.sfx('open');
    else if (!m && this.modal) this.sfx('close');
    this.modal = m;
    this.emit();
  }

  setQuality(q: Settings['quality']) {
    this.settings.quality = q;
    this.scheduleAutosave();
    this.emit();
  }

  setCamera(c: CameraState) {
    this.camera = c;
  }

  // ---------- Dastyor ----------

  private checkTutorial() {
    const n = advanceTutorial(this.tutorial, this.active, this.statuses, this.roads);
    if (n > 0) {
      this.sfx('task');
      this.dastyorMessage = this.tutorial.completed
        ? 'Barakalla!'
        : 'Zo‘r!';
      if (!this.tutorial.hidden) this.dastyorOpen = true;
      this.scheduleAutosave();
    }
  }

  // ---------- boshqaruv va xizmatlar (civic.ts) ----------

  private noteConstruction(cost: number) {
    this.civic.construction.total += cost;
    this.civic.construction.period += cost;
  }

  get security(): SecurityCoverage {
    return securityCoverage(this.active, this.statuses);
  }

  get sewage(): SewageSummary {
    return sewageSummary(this.active, this.statuses);
  }

  get green(): GreenSummary {
    return greenSummary(this.active);
  }

  /** Hokimlik murojaatlari (mavjud holatdan, joyi va yechimi bilan). */
  get appeals(): Appeal[] {
    return cityAppeals(this.active, this.statuses, this.sewage, this.green);
  }

  /** Qoida ishlaydimi: yo‘riqnoma tugagan yoki o‘tkazilgan (o‘rganish paytida jarima yo‘q). */
  get ruleEnabled(): boolean {
    return this.tutorial.completed || this.tutorial.skipped;
  }

  /**
   * Yumshoq mas’uliyat — yagona aniq qoida: «Tozalanmagan oqova ≥ SEWAGE_ALERT bo‘lmasin».
   * Ogohlantirish → sabab → tuzatish muddati (GRACE_TICKS hisob davri; pauzada to‘xtaydi) → bir martalik jarima.
   * Yechim imkoni yo‘q bo‘lsa (inshootga pul yetmaydi va inshoot yo‘q) muddat boshlanmaydi. Tuzatilsa yopiladi.
   * Jarima muammoni hal qilmaydi va qayta yechilmaydi.
   */
  private checkRule() {
    const R = CIVIC_CONFIG.RULE;
    const bad = this.sewage.untreated >= R.SEWAGE_ALERT;
    const inc = this.civic.incident;
    // tuzatilgan muammo har doim yopiladi (yo‘riqnoma paytida ham)
    if (!this.ruleEnabled && (bad || !inc)) return;
    if (!bad) {
      if (inc) {
        this.civic.incident = null;
        this.pushToast('Oqova muammosi hal qilindi — ogohlantirish yopildi', 'ok');
      }
      return;
    }
    if (!inc) {
      const canFix = this.money >= CATALOG.suv_tozalash.price || this.list.some((o) => o.type === 'suv_tozalash');
      if (!canFix) return;
      this.civic.incident = { kind: 'sewage', openedTick: this.tickCount, deadlineTick: this.tickCount + R.GRACE_TICKS, penalized: false };
      this.pushToast(`Ogohlantirish: oqova suv tozalanmayapti. ${R.GRACE_TICKS} davr ichida tuzating, aks holda −${R.PENALTY}`, 'error');
      return;
    }
    if (!inc.penalized && this.tickCount >= inc.deadlineTick) {
      inc.penalized = true;
      this.money -= R.PENALTY;
      this.civic.lastPenalty = R.PENALTY;
      this.budgetCache = null;
      this.pushToast(`Jarima −${R.PENALTY}: oqova muddatida tozalanmadi. Muammo hali ham bor — suv tozalash inshooti quring.`, 'error');
    }
  }

  /** Buzishdan oldin oqibat: qaysi uylar yo‘l/elektr/suvsiz qoladi, jamg‘arma nima bo‘ladi. */
  demolishImpact(id: string): string[] {
    const key = id + ':' + this.worldVersion;
    if (this.impactCache?.key === key) return this.impactCache.value;
    const o = this.objects.get(id);
    const out: string[] = [];
    if (o) {
      const rest = this.active.filter((x) => x.id !== id);
      // darvoza buzilsa o‘rnida yo‘l qoladi
      const gc = o.type === 'himoya_darvoza' ? gateCenter(o) : null;
      const back: PlacedObject | null = gc ? { id: '~road', type: 'road', gridX: gc.x, gridZ: gc.z, rotation: 0, residents: 0, outageTicks: 0, userPlaced: true } : null;
      if (back) rest.push(back);
      const after = computeStatusesFor(rest, RoadGrid.from(rest));
      const lost = { road: 0, power: 0, water: 0 };
      const lostB = { road: 0, power: 0, water: 0 };
      for (const h of rest) {
        const c = CATALOG[h.type];
        if (c.kind === 'road' || c.kind === 'decor') continue;
        const need = { road: c.needsRoad, power: c.needsUtilities, water: c.needsUtilities };
        const a = this.statuses.get(h.id), b = after.get(h.id);
        for (const k of ['road', 'power', 'water'] as const) {
          if (!need[k] || !a?.[k] || b?.[k]) continue;
          if (c.kind === 'house') lost[k]++;
          else lostB[k]++;
        }
      }
      const w = { road: 'yo‘lsiz', power: 'elektrsiz', water: 'suvsiz' } as const;
      for (const k of ['road', 'power', 'water'] as const) if (lost[k]) out.push(`${lost[k]} ta uy ${w[k]} qoladi`);
      for (const k of ['road', 'power', 'water'] as const) if (lostB[k]) out.push(`${lostB[k]} ta bino ${w[k]} qoladi`);
      if (o.type === 'milliy_bank' && !rest.some((x) => x.type === 'milliy_bank') && this.savingsTotal > 0) out.push(`Jamg‘arma (${fmt(this.savingsTotal)}) erkin budjetga qaytadi`);
      if (isDefense(o.type)) {
        const before = this.defense;
        const all = this.list.filter((x) => x.id !== id);
        if (back) all.push(back);
        const after2 = evaluateDefense(all, this.terrainMask!.mask);
        const lostP = after2.exposedIds.filter((x) => before.protectedIds.includes(x)).length;
        if (before.status === 'closed' && after2.status !== 'closed') out.push(`Shahar chegarasi ochiladi: ${lostP} ta bino himoyasiz qoladi`);
        else if (lostP > 0) out.push(`${lostP} ta bino himoyasiz qoladi`);
        else out.push('Himoyalangan hududga ta’sir qilmaydi');
        out.push(o.type === 'himoya_darvoza' ? 'Yo‘l saqlanadi — transport o‘taveradi, lekin bu joyda chegara ochiq qoladi' : 'Yo‘l aloqasiga ta’sir qilmaydi');
        out.push('Qaytariladigan pul: 0 (mavjud qoida — narx qaytarilmaydi)');
      }
    }
    this.impactCache = { key, value: out };
    return out;
  }
  private impactCache: { key: string; value: string[] } | null = null;

  // ---------- Milliy bank: maqsadli jamg‘arma (foizsiz, pul yaratmaydi) ----------

  get bankActive(): boolean {
    return this.list.some((o) => o.type === 'milliy_bank' && this.statuses.get(o.id)?.active);
  }

  get savingsTotal(): number {
    return this.civic.goals.reduce((a, g) => a + g.saved, 0);
  }

  createGoal(name: string, target: number): { ok: boolean; reason: string } {
    const B = CIVIC_CONFIG.BANK;
    const n = name.trim().slice(0, B.NAME_MAX);
    if (!this.bankActive) return this.bankFail('Faol Milliy bank yo‘q (yo‘l, elektr va suv kerak)');
    if (!n) return this.bankFail('Maqsad nomini yozing');
    if (!Number.isInteger(target) || target <= 0) return this.bankFail('Kerakli summa musbat butun son bo‘lsin');
    if (this.civic.goals.length >= B.MAX_GOALS) return this.bankFail(`Ko‘pi bilan ${B.MAX_GOALS} ta maqsad`);
    this.civic.goals.push({ id: 'j' + this.civic.nextGoalId++, name: n, target, saved: 0 });
    return this.bankOk(`«${n}» jamg‘armasi ochildi`);
  }

  /** Erkin budjetdan jamg‘armaga o‘tkazish: pul faqat ko‘chadi (ikki joyda bir vaqtda bo‘lmaydi). */
  deposit(goalId: string, amount: number): { ok: boolean; reason: string } {
    const g = this.civic.goals.find((x) => x.id === goalId);
    if (!this.bankActive) return this.bankFail('Faol Milliy bank yo‘q — o‘tkazib bo‘lmaydi');
    if (!g) return this.bankFail('Jamg‘arma topilmadi');
    if (!Number.isInteger(amount) || amount <= 0) return this.bankFail('Summa musbat butun son bo‘lsin');
    const room = g.target - g.saved;
    if (room <= 0) return this.bankFail('Maqsadga yetilgan');
    const a = Math.min(amount, room);
    if (a > this.money) return this.bankFail('Erkin budjetda buncha pul yo‘q');
    this.money -= a;
    g.saved += a;
    return this.bankOk(`${fmt(a)} jamg‘armaga o‘tkazildi`);
  }

  /** Jamg‘armadan erkin budjetga qaytarish (bank ishlamasa ham mumkin). */
  withdraw(goalId: string, amount: number): { ok: boolean; reason: string } {
    const g = this.civic.goals.find((x) => x.id === goalId);
    if (!g) return this.bankFail('Jamg‘arma topilmadi');
    if (!Number.isInteger(amount) || amount <= 0) return this.bankFail('Summa musbat butun son bo‘lsin');
    const a = Math.min(amount, g.saved);
    if (a <= 0) return this.bankFail('Jamg‘armada pul yo‘q');
    g.saved -= a;
    this.money += a;
    return this.bankOk(`${fmt(a)} erkin budjetga qaytarildi`);
  }

  /** Maqsadni yopish: qolgan pul erkin budjetga qaytadi. */
  closeGoal(goalId: string): { ok: boolean; reason: string } {
    const g = this.civic.goals.find((x) => x.id === goalId);
    if (!g) return this.bankFail('Jamg‘arma topilmadi');
    this.money += g.saved;
    this.civic.goals = this.civic.goals.filter((x) => x.id !== goalId);
    return this.bankOk(`«${g.name}» yopildi${g.saved ? `, ${fmt(g.saved)} qaytarildi` : ''}`);
  }

  private bankOk(text: string) {
    this.budgetCache = null;
    this.pushToast(text, 'ok');
    this.scheduleAutosave();
    this.emit();
    return { ok: true, reason: text };
  }

  private bankFail(reason: string) {
    this.pushToast(reason, 'error');
    this.emit();
    return { ok: false, reason };
  }

  /** Shifoxona topshirig‘i: shifoxona amalda faol bo‘lganda, mukofot bir marta (healthTaskDone saqlanadi). */
  private checkHealthTask() {
    if (this.healthTaskDone || !HEALTH_TASK.done(this.health)) return;
    this.healthTaskDone = true;
    this.money += HEALTH_TASK.reward;
    this.budgetCache = null;
    this.pushToast(`Topshiriq bajarildi: ${HEALTH_TASK.title} (+${fmt(HEALTH_TASK.reward)})`, 'ok');
    this.sfx('task');
    this.dastyorMessage = 'Barakalla! Mukofot olindi.';
    this.scheduleAutosave();
  }

  /** Ta’lim topshiriqlari: ketma-ket, shart amalda bajarilganda; mukofot bir marta (eduTasks saqlanadi). */
  private checkEduTasks() {
    let done = 0;
    while (this.eduTasks < EDU_TASKS.length) {
      const t = EDU_TASKS[this.eduTasks];
      if (!t.done(this.education)) break;
      this.money += t.reward;
      this.eduTasks++;
      this.budgetCache = null;
      this.pushToast(`Topshiriq bajarildi: ${t.title} (+${fmt(t.reward)})`, 'ok');
      this.sfx('task');
      done++;
    }
    if (done > 0) {
      this.dastyorMessage = 'Barakalla! Mukofot olindi.';
      this.scheduleAutosave();
    }
  }

  closeDastyor() {
    this.dastyorOpen = false;
    this.dastyorMessage = null;
    this.tutorial.hidden = true;
    this.scheduleAutosave();
    this.emit();
  }

  reopenDastyor() {
    this.dastyorOpen = true;
    this.tutorial.hidden = false;
    this.modal = null;
    this.scheduleAutosave();
    this.emit();
  }

  skipTutorial() {
    this.tutorial.skipped = true;
    this.dastyorOpen = false;
    this.dastyorMessage = null;
    this.scheduleAutosave();
    this.emit();
  }

  resumeTutorial() {
    this.tutorial.skipped = false;
    this.tutorial.hidden = false;
    this.dastyorOpen = true;
    this.checkTutorial();
    this.scheduleAutosave();
    this.emit();
  }

  // ---------- saqlash ----------

  saveNow(manual = false): boolean {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (this.autosaveBlocked && !manual) return false;
    const res = writeSave(this.storage, this.toSaveData());
    if (res.ok) {
      this.lastSavedAt = Date.now();
      this.saveError = null;
      if (manual) {
        this.autosaveBlocked = false;
        this.autosaveBlockReason = null;
        this.invalidSaveInfo = null;
        this.pushToast('Shahar saqlandi', 'ok');
      }
    } else {
      this.saveError = res.error;
      this.pushToast(res.error, 'error');
    }
    this.emit();
    return res.ok;
  }

  scheduleAutosave() {
    if (!this.settings.autosave || this.autosaveBlocked) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.saveNow(false);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  /** Faqat foydalanuvchi tasdiqlagandan keyin chaqiriladi. */
  confirmNewCity() {
    this.resetToNewCity(true);
    this.autosaveBlocked = false;
    this.autosaveBlockReason = null;
    this.invalidSaveInfo = null;
    this.modal = null;
    this.saveNow(false);
    this.pushToast('Yangi shahar boshlandi', 'info');
    this.emit(true);
  }

  // ---------- xabarlar ----------

  pushToast(text: string, tone: Toast['tone'] = 'info') {
    const t = { id: this.toastSeq++, text, tone };
    this.toasts = [...this.toasts.slice(-3), t];
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.emit();
    }, 3200);
  }
}

export function fmt(n: number): string {
  const sign = n < 0 ? '−' : '';
  return sign + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
