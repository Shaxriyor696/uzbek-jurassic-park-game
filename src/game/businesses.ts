import type { BusinessType } from './types';

/**
 * «Biznes» bo‘limi — barcha 18 korxonaning sozlamalari shu yerda (bitta joy).
 *
 * Iqtisodiyot mavjud biznes qoidasini qayta ishlatadi (budget.ts): bino yo‘l, elektr va suv bilan
 * ta’minlangan va shaharda aholi bo‘lsa, har hisob davrida `income` daromad beradi. Ishlab chiqarish,
 * xomashyo yoki logistika simulyatsiyasi yo‘q — rasmlardagi yuk mashinasi, uskunalar va mollar bezak.
 *
 * Balans: mavjud bizneslar 19–33 davrda o‘zini qoplaydi (Do‘kon 1500/+80 … Mall 18000/+550).
 * Yangilari ham shu oraliqda (~21–29 davr). Maydon (katak) — 3D model o‘lchami bo‘yicha.
 */
export type BusinessGroup = 'qishloq' | 'oziq' | 'savdo' | 'hunar' | 'sanoat' | 'qayta';

export const BUSINESS_GROUPS: { id: BusinessGroup; name: string }[] = [
  { id: 'qishloq', name: 'Qishloq xo‘jaligi' },
  { id: 'oziq', name: 'Oziq-ovqat' },
  { id: 'savdo', name: 'Savdo' },
  { id: 'hunar', name: 'Hunarmandchilik va kiyim' },
  { id: 'sanoat', name: 'Sanoat va qurilish' },
  { id: 'qayta', name: 'Qayta ishlash' },
];

export interface BusinessDef {
  type: BusinessType;
  name: string;
  group: BusinessGroup;
  /** Qisqa vazifasi (kartada va ma’lumot panelida) */
  description: string;
  /** Katakda, rotation=0 da: eni (X) × bo‘yi (Z) */
  width: number;
  depth: number;
  price: number;
  /** Bir davrdagi daromad (mavjud biznes qoidasi bo‘yicha) */
  income: number;
}

export const BUSINESSES: BusinessDef[] = [
  // Qishloq xo‘jaligi
  { type: 'varnet', name: 'Bukhara Varnet', group: 'qishloq', description: 'Issiqxona: pomidor va ko‘katlar yetishtiradi.', width: 5, depth: 4, price: 5000, income: 200 },
  { type: 'sag_gardens', name: 'Sag Gardens', group: 'qishloq', description: 'Yong‘oq va bodom bog‘i, saralash ombori bilan.', width: 5, depth: 5, price: 4500, income: 180 },
  { type: 'pure_milky', name: 'Pure Milky', group: 'qishloq', description: 'Sut chorvachilik fermasi va sut sexi.', width: 5, depth: 4, price: 5500, income: 220 },
  // Oziq-ovqat
  { type: 'bon', name: 'Bon!', group: 'oziq', description: 'Nonvoyxona-kafe.', width: 3, depth: 3, price: 2200, income: 100 },
  { type: 'safia', name: 'Safia', group: 'oziq', description: 'Qandolatxona-kafe.', width: 3, depth: 3, price: 2600, income: 115 },
  { type: 'besh_qozon', name: 'Besh Qozon', group: 'oziq', description: 'Milliy osh markazi, ochiq qozonxona bilan.', width: 4, depth: 3, price: 3500, income: 150 },
  { type: 'crafers', name: 'Crafers', group: 'oziq', description: 'Qandolat fabrikasi.', width: 5, depth: 4, price: 7000, income: 270 },
  // Savdo
  { type: 'korzinka', name: 'Korzinka', group: 'savdo', description: 'Oziq-ovqat supermarketi, avtoturargoh bilan.', width: 4, depth: 3, price: 4000, income: 170 },
  { type: 'chorsu', name: 'Chorsu', group: 'savdo', description: 'Gumbazli yirik bozor.', width: 6, depth: 6, price: 14000, income: 480 },
  // Hunarmandchilik va kiyim
  { type: 'bibi_hanum', name: 'Bibi Hanum', group: 'hunar', description: 'Tikuvchilik va milliy kiyimlar ustaxonasi.', width: 3, depth: 3, price: 2800, income: 120 },
  { type: 'ideal', name: 'IDEAL', group: 'hunar', description: 'Kiyim-kechak do‘koni.', width: 3, depth: 3, price: 3000, income: 125 },
  { type: 'rishton', name: 'Rishton', group: 'hunar', description: 'Kulolchilik ustaxonasi va do‘koni.', width: 3, depth: 3, price: 2400, income: 105 },
  // Sanoat va qurilish
  { type: 'kolxatib', name: 'Ko‘lxatib g‘isht', group: 'sanoat', description: 'G‘isht ishlab chiqarish korxonasi.', width: 5, depth: 4, price: 6500, income: 250 },
  { type: 'akfa', name: 'AKFA Aluminium', group: 'sanoat', description: 'Alyuminiy profil ishlab chiqarish.', width: 5, depth: 4, price: 8000, income: 300 },
  { type: 'imzo', name: 'IMZO', group: 'sanoat', description: 'Eshik-deraza ishlab chiqarish va savdo.', width: 4, depth: 3, price: 4500, income: 185 },
  { type: 'dafna', name: 'DAFNA', group: 'sanoat', description: 'Mebel ustaxonasi va ko‘rgazma zali.', width: 4, depth: 4, price: 5000, income: 200 },
  { type: 'murad', name: 'Murad Buildings', group: 'sanoat', description: 'Qurilish firmasi bazasi.', width: 4, depth: 4, price: 4800, income: 190 },
  // Qayta ishlash
  { type: 'recycling', name: 'Toshrangmetzavod Recycling', group: 'qayta', description: 'Elektron chiqindilarni saralash va qayta ishlash.', width: 5, depth: 4, price: 6000, income: 230 },
];

export const BUSINESS_BY_TYPE = new Map(BUSINESSES.map((b) => [b.type, b]));

export function businessGroupName(g: BusinessGroup): string {
  return BUSINESS_GROUPS.find((x) => x.id === g)?.name ?? g;
}
