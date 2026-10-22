// Domen turlari. Domen holati — yagona haqiqat manbai; Three.js sahna faqat uni chizadi.

export type ObjectType =
  | 'road'
  | 'uy_a'
  | 'uy_b'
  | 'uy_c'
  | 'kop_qavatli'
  | 'dokon'
  | 'ofis'
  | 'maktab'
  | 'shifoxona'
  | 'elektr'
  | 'suv'
  | 'bog'
  | 'daraxt'
  | 'nest_one'
  | 'hilton'
  | 'politsiya'
  | 'yongin'
  | 'bogcha'
  | 'sport'
  | 'kongress'
  | 'mall'
  | 'avtobus_bekati'
  | BusinessType
  | EducationType
  | CivicType
  | DefenseType;

/** «Shahar himoyasi»: devor, burchak va darvoza (sozlamalari: game/defenseDefs.ts). */
export type DefenseType = 'himoya_devor' | 'himoya_burchak' | 'himoya_darvoza';

/** Boshqaruv, shahar xizmatlari va oqova tozalash binolari (sozlamalari: game/civicDefs.ts). */
export type CivicType = 'hokimlik' | 'moliya' | 'soliq' | 'milliy_bank' | 'ekologiya' | 'suv_tozalash' | 'xavfsizlik';

/** «Ta’lim» bo‘limidagi 6 ta bino (sozlamalari: game/education.ts). */
export type EducationType =
  | 'invento' | 'prezident_maktab' | 'xorazmiy_maktab' | 'bolalar_kutubxona' | 'navoiy_kutubxona' | 'milliy_universitet';

/** «Biznes» bo‘limidagi 18 ta korxona (sozlamalari: game/businesses.ts). */
export type BusinessType =
  | 'korzinka' | 'bon' | 'safia'
  | 'varnet' | 'sag_gardens' | 'pure_milky' | 'besh_qozon' | 'crafers'
  | 'bibi_hanum' | 'ideal' | 'rishton' | 'chorsu'
  | 'kolxatib' | 'akfa' | 'imzo' | 'dafna' | 'murad' | 'recycling';

export type Kind = 'road' | 'house' | 'business' | 'service' | 'education' | 'power' | 'water' | 'park' | 'decor' | 'defense';

export type Category = 'yol' | 'uylar' | 'savdo' | 'elektr' | 'suv' | 'xizmatlar' | 'boglar' | 'maxsus' | 'biznes' | 'talim' | 'tibbiyot' | 'boshqaruv' | 'shahar_xizmat' | 'himoya';

/** 0..3, har biri 90° */
export type Rotation = 0 | 1 | 2 | 3;

export interface PlacedObject {
  id: string;
  type: ObjectType;
  gridX: number;
  gridZ: number;
  rotation: Rotation;
  /** Haqiqiy yashovchilar (0..capacity). Sig‘im katalogda (capacity) — bu ikkisi alohida. */
  residents: number;
  /** Uy ketma-ket necha hisob davri yo‘l/elektr/suvsiz qolgani (ta’minot tiklansa 0). */
  outageTicks: number;
  userPlaced: boolean;
  /** Qurilmoqda (yo‘q — tayyor). Tayyor bo‘lguncha hech qaysi tizimda hisoblanmaydi. */
  build?: import('./construction').BuildState;
  /** Dinozavr zarari 0..1: 1 — bino ishlamaydi / devor buzilgan (ta’mirlash kerak) */
  damage?: number;
  /** Uy: transportda oila bir marta joylashgan (shu uyga qayta olib kelinmaydi) */
  settled?: boolean;
  /** Faqat darvoza: ochilish holati, rejim, o‘tayotgan mashina */
  gate?: import('./defenseDefs').GateState;
}

/** Qayta hisoblangan (saqlanmaydigan) holat. */
export interface ObjectStatus {
  road: boolean;
  power: boolean;
  water: boolean;
  /** Stansiya uchun: yo‘l tarmog‘iga ulangan va xizmat beryapti */
  active: boolean;
  happiness: number;
  /** Oxirgi davrdagi daromad (+) yoki xarajat (-) */
  lastNet: number;
}

/** Milliy bank: maqsadli jamg‘arma (foizsiz) */
export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
}

/** Yumshoq mas’uliyat: ochiq ogohlantirish (hozircha yagona aniq qoida — tozalanmagan oqova) */
export interface Incident {
  kind: 'sewage';
  openedTick: number;
  /** Shu hisob davrigacha tuzatilmasa jarima (pauzada davr o‘tmaydi) */
  deadlineTick: number;
  penalized: boolean;
}

export interface CivicState {
  goals: SavingsGoal[];
  nextGoalId: number;
  incident: Incident | null;
  /** Qurilish xarajati (bir martalik): jami, joriy davrda, o‘tgan davrda */
  construction: { total: number; period: number; lastPeriod: number };
  /** O‘tgan davrdagi jarima (moliya hisoboti uchun) */
  lastPenalty: number;
}

export interface TutorialState {
  /** 0..5; 5 = hammasi bajarildi */
  step: number;
  completed: boolean;
  skipped: boolean;
  /** Vaqtincha yopilgan (yordam tugmasi qayta ochadi) */
  hidden: boolean;
  /** 2-bosqichda aniqlangan foydalanuvchi uyi */
  targetHouseId: string | null;
}

export type Quality = 'high' | 'low';

export interface Settings {
  quality: Quality;
  autosave: boolean;
}

export interface CameraState {
  targetX: number;
  targetZ: number;
  azimuth: number;
  polar: number;
  distance: number;
}

export interface TickReport {
  tick: number;
  tax: number;
  business: number;
  upkeep: number;
  net: number;
  /** Aholining sof o‘zgarishi (kelganlar − ketganlar) */
  moved: number;
  movedIn: number;
  movedOut: number;
}
