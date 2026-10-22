import { BUSINESSES, type BusinessGroup } from './businesses';
import { EDUCATION } from './educationDefs';
import { HEALTH_CONFIG } from './health';
import { CIVIC } from './civicDefs';
import { DEFENSE_CONFIG } from './defenseDefs';
import type { BusinessType, Category, CivicType, EducationType, Kind, ObjectType } from './types';

/**
 * Obyektlar katalogi. Narx, daromad, xarajat, sig‘im va radiuslar PRD 06-bo‘limidan olingan.
 * `source: 'prd'` — qiymat PRDda bor. `source: 'qoshimcha'` — PRD jadvalida yo‘q, prototip uchun
 * men tanlagan balans (README da ro‘yxatlangan).
 *
 * referencePaths — public/assets ichidagi haqiqiy fayllar (manifest.json ID lari bilan).
 * modelFactoryKey — modelFactory dagi procedural model kaliti. gltfUrl berilsa, o‘sha model yuklanadi
 * (v1 da hech bir obyekt uchun GLB yo‘q, shuning uchun hammasi undefined).
 */
export interface CatalogEntry {
  type: ObjectType;
  name: string;
  description: string;
  kind: Kind;
  category: Category;
  /** Katakda: eni (X) × bo‘yi (Z), rotation=0 da */
  width: number;
  depth: number;
  price: number;
  /** Biznes daromadi bir davrga */
  income: number;
  /** Xizmat xarajati bir davrga (musbat son, ayriladi) */
  upkeep: number;
  /** Uy sig‘imi */
  capacity: number;
  /** Elektr/suv yoki xizmat radiusi, katakda */
  utilityRadius: number;
  needsRoad: boolean;
  /** Bino elektr/suv iste’mol qiladimi (indikator ko‘rsatiladi) */
  needsUtilities: boolean;
  assetIds: string[];
  referencePaths: string[];
  /** UI kartasi uchun rasm. null — PNG yo‘q, kod bilan chizilgan ikon ishlatiladi. */
  cardImage: string | null;
  modelFactoryKey: string;
  gltfUrl?: string;
  source: 'prd' | 'qoshimcha';
  /** Faqat «Biznes» bo‘limi uchun: ichki guruh */
  group?: BusinessGroup;
}

const R = 'assets/reference/';
const D = 'assets/derived/';

/** «Biznes» bo‘limi yozuvlari businesses.ts dagi yagona sozlamalardan hosil qilinadi. */
function businessEntries(): Record<BusinessType, CatalogEntry> {
  const out = {} as Record<BusinessType, CatalogEntry>;
  for (const b of BUSINESSES) {
    out[b.type] = {
      type: b.type, name: b.name, description: b.description, kind: 'business', category: 'biznes', group: b.group,
      width: b.width, depth: b.depth, price: b.price, income: b.income, upkeep: 0, capacity: 0,
      utilityRadius: 0, needsRoad: true, needsUtilities: true,
      assetIds: [], referencePaths: [], cardImage: 'assets/business/' + b.type + '.jpg',
      modelFactoryKey: 'biz_' + b.type, source: 'qoshimcha',
    };
  }
  return out;
}

/** «Ta’lim» bo‘limi yozuvlari educationDefs.ts dagi yagona sozlamalardan. Faol bo‘lishi uchun yo‘l, elektr va suv kerak. */
function educationEntries(): Record<EducationType, CatalogEntry> {
  const out = {} as Record<EducationType, CatalogEntry>;
  for (const e of EDUCATION) {
    out[e.type] = {
      type: e.type, name: e.name, description: e.description, kind: 'education', category: 'talim',
      width: e.width, depth: e.depth, price: e.price, income: 0, upkeep: e.upkeep, capacity: 0,
      utilityRadius: 0, needsRoad: true, needsUtilities: true,
      assetIds: [], referencePaths: [], cardImage: 'assets/education/' + e.type + '.jpg',
      modelFactoryKey: 'edu_' + e.type, source: 'qoshimcha',
    };
  }
  return out;
}

/** Boshqaruv, shahar xizmatlari va oqova tozalash binolari — civicDefs.ts dagi yagona sozlamalardan. */
function civicEntries(): Record<CivicType, CatalogEntry> {
  const out = {} as Record<CivicType, CatalogEntry>;
  for (const c of CIVIC) {
    out[c.type] = {
      type: c.type, name: c.name, description: c.description, kind: 'service', category: c.category,
      width: c.width, depth: c.depth, price: c.price, income: 0, upkeep: c.upkeep, capacity: 0,
      utilityRadius: 0, needsRoad: c.needs.road, needsUtilities: c.needs.power || c.needs.water,
      assetIds: [], referencePaths: [], cardImage: 'assets/civic/' + c.type + '.jpg',
      modelFactoryKey: 'civ_' + c.type, source: 'qoshimcha',
    };
  }
  return out;
}

export const CATALOG: Record<ObjectType, CatalogEntry> = {
  ...businessEntries(),
  ...educationEntries(),
  ...civicEntries(),
  road: {
    type: 'road', name: 'Yo‘l', description: 'Kataklarga yo‘l chizish. Qo‘shni yo‘llar avtomatik ulanadi.',
    kind: 'road', category: 'yol', width: 1, depth: 1, price: 100, income: 0, upkeep: 0, capacity: 0,
    utilityRadius: 0, needsRoad: false, needsUtilities: false,
    assetIds: ['G039', 'G013', 'G038'], referencePaths: [R + 'G039.png'], cardImage: R + 'G039.png',
    modelFactoryKey: 'road', source: 'prd',
  },
  uy_a: {
    type: 'uy_a', name: 'Uy A', description: 'Bir qavatli uy, to‘q kulrang tom.',
    kind: 'house', category: 'uylar', width: 2, depth: 2, price: 500, income: 0, upkeep: 0, capacity: 8,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G001'], referencePaths: [R + 'G001.png'], cardImage: D + 'uy_a_G001_crop.png',
    modelFactoryKey: 'house_a', source: 'prd',
  },
  uy_b: {
    type: 'uy_b', name: 'Uy B', description: 'Terrakota tomli uy, kichik hovli.',
    kind: 'house', category: 'uylar', width: 2, depth: 2, price: 800, income: 0, upkeep: 0, capacity: 12,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G001'], referencePaths: [R + 'G001.png'], cardImage: D + 'uy_b_G001_crop.png',
    modelFactoryKey: 'house_b', source: 'prd',
  },
  uy_c: {
    type: 'uy_c', name: 'Uy C', description: 'Ikki qavatli uy, balkonli.',
    kind: 'house', category: 'uylar', width: 2, depth: 3, price: 1200, income: 0, upkeep: 0, capacity: 18,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G001'], referencePaths: [R + 'G001.png'], cardImage: D + 'uy_c_G001_crop.png',
    modelFactoryKey: 'house_c', source: 'prd',
  },
  kop_qavatli: {
    type: 'kop_qavatli', name: 'Ko‘p qavatli uy', description: 'Besh qavatli turar-joy, tomida bog‘.',
    kind: 'house', category: 'uylar', width: 3, depth: 3, price: 5000, income: 0, upkeep: 0, capacity: 60,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G001', 'G032'], referencePaths: [R + 'G001.png', R + 'G032.png'], cardImage: D + 'kop_qavatli_G032_crop.png',
    modelFactoryKey: 'apartment', source: 'prd',
  },
  dokon: {
    type: 'dokon', name: 'Do‘kon', description: 'Supermarket: yo‘l, elektr, suv va aholi bo‘lsa daromad beradi.',
    kind: 'business', category: 'savdo', width: 2, depth: 2, price: 1500, income: 80, upkeep: 0, capacity: 0,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G036'], referencePaths: [R + 'G036.png'], cardImage: R + 'G036.png',
    modelFactoryKey: 'shop', source: 'prd',
  },
  ofis: {
    type: 'ofis', name: 'Ofis', description: 'Shisha fasadli ofis binosi.',
    kind: 'business', category: 'savdo', width: 3, depth: 3, price: 3000, income: 150, upkeep: 0, capacity: 0,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G032'], referencePaths: [R + 'G032.png'], cardImage: D + 'ofis_G032_crop.png',
    modelFactoryKey: 'office', source: 'prd',
  },
  maktab: {
    type: 'maktab', name: 'Maktab', description: '6 katak ichidagi uylarga +5% baxt.',
    kind: 'service', category: 'xizmatlar', width: 3, depth: 3, price: 2500, income: 0, upkeep: 30, capacity: 0,
    utilityRadius: 6, needsRoad: true, needsUtilities: true,
    assetIds: ['G027'], referencePaths: [R + 'G027.png'], cardImage: R + 'G027.png',
    modelFactoryKey: 'school', source: 'prd',
  },
  shifoxona: {
    type: 'shifoxona', name: 'Shifoxona',
    description: `To‘rt qavatli shifoxona: ${HEALTH_CONFIG.SERVICE_CAPACITY} kishiga xizmat; yo‘l, elektr va suv kerak. 6 katak ichidagi uylarga +10% baxt.`,
    kind: 'service', category: 'tibbiyot', width: 3, depth: 3, price: HEALTH_CONFIG.PRICE, income: 0, upkeep: HEALTH_CONFIG.UPKEEP, capacity: 0,
    utilityRadius: 6, needsRoad: true, needsUtilities: true,
    assetIds: ['G034'], referencePaths: [R + 'G034.png'], cardImage: 'assets/health/shifoxona.jpg',
    modelFactoryKey: 'hospital', source: 'prd',
  },
  elektr: {
    type: 'elektr', name: 'Elektr stansiyasi', description: 'Yo‘lga ulansa yo‘l tarmog‘i orqali 20 ta binogacha (eng yaqinlaridan) elektr beradi.',
    kind: 'power', category: 'elektr', width: 3, depth: 3, price: 3000, income: 0, upkeep: 40, capacity: 0,
    utilityRadius: 8, needsRoad: true, needsUtilities: false,
    assetIds: [], referencePaths: [], cardImage: null,
    modelFactoryKey: 'power_plant', source: 'prd',
  },
  suv: {
    type: 'suv', name: 'Suv stansiyasi', description: 'Yo‘lga ulansa yo‘l tarmog‘i orqali 20 ta binogacha suv beradi; ko‘l yoki soy bo‘yida (2 katak ichida) tabiiy suv oladi — 30 ta binogacha.',
    kind: 'water', category: 'suv', width: 3, depth: 3, price: 2000, income: 0, upkeep: 25, capacity: 0,
    utilityRadius: 6, needsRoad: true, needsUtilities: false,
    assetIds: ['G037'], referencePaths: [R + 'G037.png'], cardImage: R + 'G037.png',
    modelFactoryKey: 'water_plant', source: 'prd',
  },
  bog: {
    type: 'bog', name: 'Bog‘', description: '4 katak ichidagi uylarga +10% baxt. Yo‘l talab qilmaydi.',
    kind: 'park', category: 'boglar', width: 2, depth: 2, price: 400, income: 0, upkeep: 5, capacity: 0,
    utilityRadius: 4, needsRoad: false, needsUtilities: false,
    assetIds: ['G010'], referencePaths: [R + 'G010.png'], cardImage: R + 'G010.png',
    modelFactoryKey: 'park', source: 'prd',
  },
  daraxt: {
    type: 'daraxt', name: 'Daraxt', description: 'Bezak.',
    kind: 'decor', category: 'boglar', width: 1, depth: 1, price: 50, income: 0, upkeep: 0, capacity: 0,
    utilityRadius: 0, needsRoad: false, needsUtilities: false,
    assetIds: ['G014'], referencePaths: [R + 'G014.png'], cardImage: R + 'G014.png',
    modelFactoryKey: 'tree', source: 'prd',
  },
  nest_one: {
    type: 'nest_one', name: 'Nest One konsepti', description: 'Toshkent City uslubidagi baland majmua (aniq nusxa emas).',
    kind: 'business', category: 'maxsus', width: 4, depth: 4, price: 15000, income: 500, upkeep: 0, capacity: 0,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G004', 'P009', 'P010', 'P011', 'P012'], referencePaths: [R + 'Toshkent_City_PNG/Nest_One_01.png'],
    cardImage: R + 'Toshkent_City_PNG/Nest_One_01.png',
    modelFactoryKey: 'nest_one', source: 'prd',
  },
  hilton: {
    type: 'hilton', name: 'Hilton konsepti', description: 'Shisha minorali mehmonxona konsepti (aniq nusxa emas).',
    kind: 'business', category: 'maxsus', width: 4, depth: 3, price: 10000, income: 350, upkeep: 0, capacity: 0,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G005', 'P001', 'P002', 'P003', 'P004'], referencePaths: [R + 'Toshkent_City_PNG/Hilton_01.png'],
    cardImage: R + 'Toshkent_City_PNG/Hilton_01.png',
    modelFactoryKey: 'hilton', source: 'prd',
  },
  // ---- PRD jadvalidan tashqari qo‘shimcha obyektlar (balans men tomondan tanlangan) ----
  politsiya: {
    type: 'politsiya', name: 'Politsiya', description: 'V1: faqat xarajat, baxtga ta’siri keyingi versiyada.',
    kind: 'service', category: 'xizmatlar', width: 3, depth: 3, price: 3000, income: 0, upkeep: 35, capacity: 0,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G031'], referencePaths: [R + 'G031.png'], cardImage: R + 'G031.png',
    modelFactoryKey: 'police', source: 'qoshimcha',
  },
  yongin: {
    type: 'yongin', name: 'Yong‘in bo‘limi', description: 'V1: faqat xarajat, baxtga ta’siri keyingi versiyada.',
    kind: 'service', category: 'xizmatlar', width: 3, depth: 3, price: 3500, income: 0, upkeep: 35, capacity: 0,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G030'], referencePaths: [R + 'G030.png'], cardImage: R + 'G030.png',
    modelFactoryKey: 'fire_station', source: 'qoshimcha',
  },
  bogcha: {
    type: 'bogcha', name: 'Bog‘cha', description: 'V1: faqat xarajat, baxtga ta’siri keyingi versiyada.',
    kind: 'service', category: 'xizmatlar', width: 3, depth: 3, price: 2000, income: 0, upkeep: 20, capacity: 0,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G011'], referencePaths: [R + 'G011.png'], cardImage: R + 'G011.png',
    modelFactoryKey: 'kindergarten', source: 'qoshimcha',
  },
  sport: {
    type: 'sport', name: 'Sport maydoni', description: 'Futbol va basketbol maydoni. Yo‘l talab qilmaydi.',
    kind: 'park', category: 'boglar', width: 3, depth: 3, price: 1200, income: 0, upkeep: 10, capacity: 0,
    utilityRadius: 0, needsRoad: false, needsUtilities: false,
    assetIds: ['G035'], referencePaths: [R + 'G035.png'], cardImage: R + 'G035.png',
    modelFactoryKey: 'sport_field', source: 'qoshimcha',
  },
  kongress: {
    type: 'kongress', name: 'Kongress markazi konsepti', description: 'To‘lqinsimon naqshli fasad konsepti (aniq nusxa emas).',
    kind: 'business', category: 'maxsus', width: 5, depth: 4, price: 12000, income: 400, upkeep: 0, capacity: 0,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G006', 'P005', 'P006', 'P007', 'P008'], referencePaths: [R + 'Toshkent_City_PNG/Kongress_markazi_01.png'],
    cardImage: R + 'Toshkent_City_PNG/Kongress_markazi_01.png',
    modelFactoryKey: 'congress', source: 'qoshimcha',
  },
  avtobus_bekati: {
    type: 'avtobus_bekati', name: 'Avtobus bekati', description: 'Yo‘l chetiga qo‘yiladi. Ikki va undan ortiq bekat bo‘lsa shahar avtobusi marshrut bo‘yicha qatnaydi.',
    kind: 'decor', category: 'yol', width: 1, depth: 1, price: 150, income: 0, upkeep: 0, capacity: 0,
    utilityRadius: 0, needsRoad: false, needsUtilities: false,
    assetIds: [], referencePaths: [], cardImage: null,
    modelFactoryKey: 'bus_stop', source: 'qoshimcha',
  },
  // ---- Shahar himoyasi (narx va o‘lcham: defenseDefs.ts) ----
  himoya_devor: {
    type: 'himoya_devor', name: 'Himoya devori', description: 'Dinozavrlar o‘tolmaydigan beton-po‘lat devor. Sichqoncha bilan tortib chiziladi.',
    kind: 'defense', category: 'himoya', width: 1, depth: 1, price: DEFENSE_CONFIG.wall.price, income: 0, upkeep: DEFENSE_CONFIG.wall.upkeep, capacity: 0,
    utilityRadius: 0, needsRoad: false, needsUtilities: false,
    assetIds: [], referencePaths: [], cardImage: 'assets/defense/himoya_devor.jpg',
    modelFactoryKey: 'defense', source: 'qoshimcha',
  },
  himoya_burchak: {
    type: 'himoya_burchak', name: 'Burchak qismi', description: '90° burchak: ikki devorni yo‘g‘on ustun bilan tirqishsiz ulaydi. R — aylantirish.',
    kind: 'defense', category: 'himoya', width: 1, depth: 1, price: DEFENSE_CONFIG.corner.price, income: 0, upkeep: DEFENSE_CONFIG.corner.upkeep, capacity: 0,
    utilityRadius: 0, needsRoad: false, needsUtilities: false,
    assetIds: [], referencePaths: [], cardImage: 'assets/defense/himoya_burchak.jpg',
    modelFactoryKey: 'defense', source: 'qoshimcha',
  },
  himoya_darvoza: {
    type: 'himoya_darvoza', name: 'Himoya darvozasi', description: 'Yo‘l ustiga qo‘yiladi: transport o‘tadi, yopiq bo‘lsa dinozavr kirolmaydi. Qanotlari yon tomonga suriladi.',
    kind: 'defense', category: 'himoya', width: DEFENSE_CONFIG.gate.width, depth: DEFENSE_CONFIG.gate.depth, price: DEFENSE_CONFIG.gate.price, income: 0, upkeep: DEFENSE_CONFIG.gate.upkeep, capacity: 0,
    utilityRadius: 0, needsRoad: false, needsUtilities: false,
    assetIds: [], referencePaths: [], cardImage: 'assets/defense/himoya_darvoza.jpg',
    modelFactoryKey: 'defense', source: 'qoshimcha',
  },
  mall: {
    type: 'mall', name: 'Tashkent City Mall konsepti', description: 'Savdo markazi, shisha gumbaz va uchta minora (aniq nusxa emas).',
    kind: 'business', category: 'maxsus', width: 5, depth: 5, price: 18000, income: 550, upkeep: 0, capacity: 0,
    utilityRadius: 0, needsRoad: true, needsUtilities: true,
    assetIds: ['G007'], referencePaths: [R + 'Toshkent_City_PNG/Tashkent_City_Mall_01.png'],
    cardImage: R + 'Toshkent_City_PNG/Tashkent_City_Mall_01.png',
    modelFactoryKey: 'mall', source: 'qoshimcha',
  },
};

export const CATEGORIES: { id: Category; name: string; icon: string }[] = [
  { id: 'yol', name: 'Yo‘l', icon: 'road' },
  { id: 'uylar', name: 'Uylar', icon: 'house' },
  { id: 'savdo', name: 'Savdo', icon: 'shop' },
  { id: 'elektr', name: 'Elektr', icon: 'bolt' },
  { id: 'suv', name: 'Suv', icon: 'tap' },
  { id: 'xizmatlar', name: 'Xizmatlar', icon: 'service' },
  { id: 'talim', name: 'Ta’lim', icon: 'book' },
  { id: 'tibbiyot', name: 'Tibbiyot', icon: 'medical' },
  { id: 'boshqaruv', name: 'Boshqaruv va moliya', icon: 'gov' },
  { id: 'shahar_xizmat', name: 'Shahar xizmatlari', icon: 'shield' },
  { id: 'boglar', name: 'Bog‘lar', icon: 'tree' },
  { id: 'maxsus', name: 'Maxsus binolar', icon: 'tower' },
  { id: 'biznes', name: 'Biznes', icon: 'briefcase' },
  { id: 'himoya', name: 'Shahar himoyasi', icon: 'fort' },
];

export function itemsInCategory(cat: Category): CatalogEntry[] {
  return Object.values(CATALOG).filter((c) => c.category === cat);
}

export function isObjectType(t: unknown): t is ObjectType {
  return typeof t === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, t);
}
