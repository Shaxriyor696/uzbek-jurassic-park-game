import type { CivicType } from './types';

/**
 * «Boshqaruv va moliya», «Shahar xizmatlari» va «Suv» bo‘limlaridagi 7 ta bino — ta’riflar va BARCHA balans
 * qiymatlari (narx, xarajat, sig‘im, radius, bonus, stavka, muddat, jarima) shu yerda. O‘yin uchun taxminiy sonlar;
 * haqiqiy tashkilotlarning vakolatlari yoki qonunlari nusxasi emas.
 */
export type CivicCategory = 'boshqaruv' | 'shahar_xizmat' | 'suv';

export interface CivicDef {
  type: CivicType;
  name: string;
  /** Kartadagi qisqa vazifa */
  roleName: string;
  description: string;
  category: CivicCategory;
  width: number;
  depth: number;
  price: number;
  upkeep: number;
  /** Faol bo‘lish uchun kerakli ulanishlar */
  needs: { road: boolean; power: boolean; water: boolean };
}

export const CIVIC: CivicDef[] = [
  {
    type: 'hokimlik', name: 'Shahar hokimligi', roleName: 'Shahar boshqaruvi', category: 'boshqaruv',
    description: 'Shahar holati, budjet xulosasi va aholi murojaatlari (joyi va yechimi bilan).',
    width: 4, depth: 4, price: 8000, upkeep: 60, needs: { road: true, power: true, water: true },
  },
  {
    type: 'moliya', name: 'Moliya boshqarmasi', roleName: 'Daromad-xarajat hisoboti', category: 'boshqaruv',
    description: 'Budjet hisoboti: qurilish va doimiy xarajatlar, kamomad sababi, keyingi davr prognozi.',
    width: 5, depth: 3, price: 6000, upkeep: 40, needs: { road: true, power: true, water: true },
  },
  {
    type: 'soliq', name: 'Soliq idorasi', roleName: 'Soliq tushumlari hisoboti', category: 'boshqaruv',
    description: 'Mavjud soliq va biznes tushumlarini ko‘rsatadi (yangi soliq qo‘shmaydi, daromad yaratmaydi).',
    width: 5, depth: 5, price: 6000, upkeep: 40, needs: { road: true, power: true, water: true },
  },
  {
    type: 'milliy_bank', name: 'Milliy bank', roleName: 'Maqsadli jamg‘arma', category: 'boshqaruv',
    description: 'Maqsad uchun pul jamg‘arish: o‘tkazish va qaytarib olish. Foiz yoki kredit yo‘q.',
    width: 5, depth: 5, price: 12000, upkeep: 70, needs: { road: true, power: true, water: true },
  },
  {
    type: 'ekologiya', name: 'Ekologiya markazi', roleName: 'Ekologik monitoring', category: 'shahar_xizmat',
    description: 'Yashillik va suv sifati (oqova) ko‘rsatkichlari, muammo joyi va yechimi. Ifloslanishni o‘zi tozalamaydi.',
    width: 4, depth: 4, price: 5000, upkeep: 35, needs: { road: true, power: true, water: true },
  },
  {
    type: 'suv_tozalash', name: 'Suv tozalash inshooti', roleName: 'Oqova suvni tozalash', category: 'suv',
    description: 'Atrofdagi uylar va bizneslarning oqova suvini tozalaydi. Ichimlik suvi bermaydi — buni suv stansiyasi qiladi.',
    width: 6, depth: 5, price: 7000, upkeep: 45, needs: { road: true, power: true, water: false },
  },
  {
    type: 'xavfsizlik', name: 'Xavfsizlik xizmati', roleName: 'Mahalla xavfsizligi', category: 'shahar_xizmat',
    description: 'Atrofdagi mahallalarga xizmat qamrovi: qamralgan uylarga +5% baxt (cheklangan).',
    width: 4, depth: 4, price: 4500, upkeep: 35, needs: { road: true, power: true, water: false },
  },
];

export const CIVIC_BY_TYPE = Object.fromEntries(CIVIC.map((c) => [c.type, c])) as Record<CivicType, CivicDef>;

export function isCivic(type: string): type is CivicType {
  return Object.prototype.hasOwnProperty.call(CIVIC_BY_TYPE, type);
}

export const CIVIC_CONFIG = {
  SECURITY: {
    /** Xizmat hududi (katak) */
    RADIUS: 8,
    /** Bitta bino xizmat ko‘rsata oladigan aholi */
    CAPACITY: 200,
    /** Qamralgan uyga baxt qo‘shimchasi (nechta bino bo‘lsa ham bir marta) */
    HAPPINESS_BONUS: 5,
    /** Eski «Politsiya» binosi ham shu qamrov tizimiga kiradi (parallel tizim emas) */
    INCLUDES_POLICE: true,
  },
  SEWAGE: {
    /** Suv bilan ta’minlangan uyning har bir aholisi bir davrda shuncha birlik oqova beradi */
    PER_RESIDENT: 1,
    /** Faol biznes (yo‘l + elektr + suv) bir davrda */
    PER_BUSINESS: 8,
    /** Bitta inshootning tozalash sig‘imi (birlik/davr) */
    PLANT_CAPACITY: 150,
    /** Xizmat hududi (katak) */
    PLANT_RADIUS: 9,
  },
  GREEN: {
    /** Uy «yashil» hisoblanadi: shu radiusda bog‘ bor (PRD dagi bog‘ radiusi) */
    PARK_RADIUS: 4,
  },
  /** Yumshoq mas’uliyat: aniq qoida — tozalanmagan oqova */
  RULE: {
    /** Shundan ko‘p tozalanmagan oqova (birlik/davr) bo‘lsa ogohlantirish */
    SEWAGE_ALERT: 40,
    /** Tuzatish muddati (hisob davri; pauzada to‘xtaydi) — 30 davr = 5 daqiqa */
    GRACE_TICKS: 30,
    /** Muddat o‘tsa bir martalik kichik jarima */
    PENALTY: 300,
  },
  BANK: {
    MAX_GOALS: 5,
    NAME_MAX: 32,
  },
};
