/**
 * Ovozlar — yagona sozlama: fayllar (public/audio ichida, base path ga nisbatan), balandliklar, cheklovlar.
 * Kesilgan nusxalar (*.m4a) asl fayllardan alohida nom bilan tayyorlangan; asl MP3/OGG lar o‘zgartirilmagan.
 * Paketda musiqa yo‘q — musiqa kanali ham yo‘q.
 */
export type Bus = 'ambience' | 'effects' | 'ui';

export interface SoundDef {
  /** public/ ga nisbatan yo‘l (oldida «/» yo‘q — GitHub Pages kabi ichki manzilda ham ishlaydi) */
  files: string[];
  bus: Bus;
  /** Asosiy balandlik (0..1) */
  gain: number;
  /** Muhim — audio yoqilishi bilan oldindan yuklanadi */
  preload?: boolean;
}

const A = 'audio/';

export const SOUNDS = {
  // ---- interfeys (Kenney CC0) ----
  click: { files: [A + 'ui/click_001.ogg'], bus: 'ui', gain: 0.5, preload: true },
  open: { files: [A + 'ui/open_001.ogg'], bus: 'ui', gain: 0.55, preload: true },
  close: { files: [A + 'ui/close_001.ogg'], bus: 'ui', gain: 0.55, preload: true },
  confirm: { files: [A + 'ui/confirmation_002.ogg'], bus: 'ui', gain: 0.6, preload: true },
  back: { files: [A + 'ui/back_001.ogg'], bus: 'ui', gain: 0.55, preload: true },
  error: { files: [A + 'ui/error_004.ogg'], bus: 'ui', gain: 0.55, preload: true },
  task: { files: [A + 'ui/confirmation_004.ogg'], bus: 'ui', gain: 0.65, preload: true },
  demolish: { files: [A + 'ui/drop_002.ogg'], bus: 'ui', gain: 0.55, preload: true },
  // ---- qurilish ----
  constructionHits: { files: [A + 'construction/construction_hits.m4a'], bus: 'effects', gain: 0.45, preload: true },
  buildDone: { files: [A + 'ui/confirmation_003.ogg'], bus: 'effects', gain: 0.5 },
  // ---- transport ----
  carStart: { files: [A + 'vehicles/car_start_short.m4a'], bus: 'effects', gain: 0.4 },
  busDepart: { files: [A + 'vehicles/bus_depart_short.m4a'], bus: 'effects', gain: 0.45 },
  busDoorOpen: { files: [A + 'vehicles/bus_door_open.m4a'], bus: 'effects', gain: 0.45 },
  busDoorClose: { files: [A + 'vehicles/bus_door_close.m4a'], bus: 'effects', gain: 0.45 },
  // ---- dinozavrlar ----
  dinoStep: { files: [1, 2, 3, 4, 5, 6].map((i) => `${A}dinosaurs/dino_step_0${i}.m4a`), bus: 'effects', gain: 0.55, preload: true },
  dinoGrowl: { files: [A + 'dinosaurs/dino_growl_norm.m4a'], bus: 'effects', gain: 0.55 },
  dinoHiss: { files: [A + 'dinosaurs/dino_hiss_short.m4a'], bus: 'effects', gain: 0.45 },
  // ---- darvoza ----
  gateMotor: { files: [A + 'security/gate_motor.m4a'], bus: 'effects', gain: 0.4 },
  gateLock: { files: [A + 'security/gate_lock.m4a'], bus: 'effects', gain: 0.5 },
  // ---- muhit (uzluksiz, kesilgan va chetlari silliqlangan) ----
  traffic: { files: [A + 'ambience/traffic_loop.m4a'], bus: 'ambience', gain: 0.35 },
  city: { files: [A + 'ambience/city_ambience_loop.m4a'], bus: 'ambience', gain: 0.4 },
  fountain: { files: [A + 'water/fountain_loop.m4a'], bus: 'ambience', gain: 0.5 },
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;

export const AUDIO_CONFIG = {
  /** Bir vaqtdagi qisqa effektlar soni (muhit looplari alohida) */
  maxVoices: 14,
  /** Fazoviy ovoz: shu masofagacha (dunyo birligi = katak) to‘liq, keyin pasayadi, maxDistance dan keyin eshitilmaydi */
  refDistance: 6,
  maxDistance: 38,
  /** Kanallarning boshlang‘ich balandligi (o‘yinchi sozlamasidan oldin) */
  defaults: { master: 0.8, ambience: 0.5, effects: 0.8, ui: 0.8, muted: false },
  /** Sozlamalar kaliti (o‘yin saqlashidan alohida — eski saqlashlarga tegmaydi) */
  storageKey: 'ujp.audio.settings',
  /** Dinozavr bo‘kirishi: umumiy tanaffus (s) — bir vaqtda bir nechtasi bo‘kirmaydi */
  growlGap: [14, 32] as [number, number],
  /** Qurilish: zarbalar orasidagi tanaffus (s) */
  constructionGap: [2.8, 5.5] as [number, number],
  /** Muhit looplari ulanish joyidagi o‘tish (s) — fayllar chetida ham shuncha silliq kirish/chiqish bor */
  loopCrossfade: 1.5,
  /** Muhit balandligi o‘zgarishi silliqligi (s) */
  ambienceRamp: 2,
};
