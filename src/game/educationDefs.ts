import type { EducationType } from './types';

/** «Ta’lim» binolarining ta’riflari (importsiz — katalog va ta’lim mexanikasi ikkalasi ham shu yerdan oladi). */
export type EduRole = 'kindergarten' | 'school' | 'it_school' | 'kids_library' | 'library' | 'university';

export interface EducationDef {
  type: EducationType;
  name: string;
  role: EduRole;
  /** Panel va kartadagi qisqa vazifa nomi */
  roleName: string;
  description: string;
  /** Katakda, rotation = 0 da */
  width: number;
  depth: number;
  price: number;
  /** Xizmat xarajati bir davrga (qurilgandan boshlab, faol bo‘lmasa ham) */
  upkeep: number;
  /** Sig‘im: maktab/bog‘cha — o‘rinlar, kutubxona — o‘quvchi joylari, universitet — talabalar */
  capacity: number;
  /** Ta’sir matni (ma’lumot paneli uchun) */
  effect: string;
}

export const EDUCATION: EducationDef[] = [
  {
    type: 'invento', name: 'INVENTO — Tashkent City kampusi', role: 'kindergarten', roleName: 'Bog‘cha',
    description: 'Zamonaviy bog‘cha: rangli fasad va bolalar maydonchasi.',
    width: 4, depth: 4, price: 6000, upkeep: 40, capacity: 30,
    effect: 'Atrofidagi uylarga oilalar tezroq ko‘chib keladi (+1 kishi/davr, cheklangan).',
  },
  {
    type: 'prezident_maktab', name: 'Toshkent Prezident maktabi', role: 'school', roleName: 'Maktab',
    description: 'Ikki qavatli maktab: oq fasad, g‘isht rangli qismlar, sariq kirish ayvoni.',
    width: 5, depth: 4, price: 9000, upkeep: 60, capacity: 40,
    effect: 'Shahardagi ta’lim o‘rinlarini oshiradi; 6 katak ichidagi uylarga +5% baxt.',
  },
  {
    type: 'xorazmiy_maktab', name: 'Muhammad al-Xorazmiy maktabi', role: 'it_school', roleName: 'IT va texnologiya maktabi',
    description: 'Hovlili uch qavatli maktab: qiya oq fasad, oynali kirish, gumbaz.',
    width: 5, depth: 5, price: 12000, upkeep: 80, capacity: 30,
    effect: 'Ta’lim o‘rinlari beradi va vaqt davomida shahar malakasini oshiradi.',
  },
  {
    type: 'bolalar_kutubxona', name: 'Respublika bolalar kutubxonasi', role: 'kids_library', roleName: 'Bolalar kutubxonasi',
    description: 'Och yashil tarixiy bino, minorali burchak va o‘qish bog‘i.',
    width: 4, depth: 3, price: 4000, upkeep: 25, capacity: 60,
    effect: 'Oilalar uchun jozibador (+1 kishi/davr atrofda) va malaka o‘sishini tezlashtiradi. Maktab o‘rnini bosmaydi.',
  },
  {
    type: 'navoiy_kutubxona', name: 'Alisher Navoiy Milliy kutubxonasi', role: 'library', roleName: 'Milliy kutubxona',
    description: 'Yirik oq bino, baland bezakli oynalar, shisha gumbaz va favvorali maydon.',
    width: 6, depth: 6, price: 15000, upkeep: 90, capacity: 400,
    effect: 'Mustaqil o‘rganishni qo‘llab-quvvatlaydi: malaka o‘sishini tezlashtiradi. Maktab o‘rnini bosmaydi.',
  },
  {
    type: 'milliy_universitet', name: 'O‘zbekiston Milliy universiteti', role: 'university', roleName: 'Universitet',
    description: 'Baland universitet binosi: oq panjarali fasad, ko‘k oynalar, tomdagi antennalar.',
    width: 5, depth: 5, price: 25000, upkeep: 150, capacity: 2000,
    effect: 'Malakali mutaxassislar tayyorlaydi: shahar malakasini vaqt davomida eng tez oshiradi.',
  },
];

export const EDUCATION_BY_TYPE = Object.fromEntries(EDUCATION.map((e) => [e.type, e])) as Record<EducationType, EducationDef>;

export function isEducation(type: string): type is EducationType {
  return Object.prototype.hasOwnProperty.call(EDUCATION_BY_TYPE, type);
}
