import { CATALOG } from './catalog';
import { clampSkill, EDU_CONFIG } from './education';
import type { ObjectStatus, PlacedObject } from './types';

export const TAX_PER_RESIDENT = 2;

export type BudgetLineId = 'houseTax' | 'business' | 'skillBonus' | 'power' | 'water' | 'parks' | 'services' | 'education' | 'defense';

export interface BudgetLine {
  id: BudgetLineId;
  label: string;
  kind: 'income' | 'expense';
  /** Doim musbat; xarajat qatorlari sof natijadan ayriladi. */
  amount: number;
  /** Shu qatorga hissa qo‘shayotgan obyektlar soni */
  count: number;
}

export interface Budget {
  lines: BudgetLine[];
  income: number;
  expense: number;
  /** Sof natija = barcha davriy daromad − barcha davriy xarajat */
  net: number;
  population: number;
  /** Yo‘l/elektr/suv yoki aholi yo‘qligi sababli daromad bermayotgan bizneslar */
  idleBusinesses: number;
  /** Har obyektning hissasi (+ daromad, − xarajat) */
  perObject: Map<string, number>;
}

/**
 * Davriy budjet — yagona hisob. Hisob davri (runTick), HUD va «Shahar budjeti» paneli aynan shu
 * funksiya natijasidan foydalanadi, shuning uchun sonlar bir-biridan farq qilmaydi.
 * Bir martalik qurilish narxi bu yerga kirmaydi.
 *
 * Biznes modeli: do‘kon/ofis/maxsus binolar soliq emas, to‘g‘ridan-to‘g‘ri belgilangan daromad beradi
 * (yo‘l, elektr, suv bo‘lsa va shaharda aholi bo‘lsa).
 */
export function computeBudget(objects: Iterable<PlacedObject>, statuses: Map<string, ObjectStatus>, skill = 0): Budget {
  const line = (id: BudgetLineId, label: string, kind: BudgetLine['kind']): BudgetLine => ({ id, label, kind, amount: 0, count: 0 });
  const houseTax = line('houseTax', 'Uy soliqlari', 'income');
  const business = line('business', 'Savdo va biznes daromadi', 'income');
  const power = line('power', 'Elektr stansiyalari', 'expense');
  const water = line('water', 'Suv stansiyalari', 'expense');
  const parks = line('parks', 'Bog‘lar va maydonlar', 'expense');
  const services = line('services', 'Xizmat binolari', 'expense');
  const skillBonus = line('skillBonus', 'Malaka bonusi', 'income');
  const education = line('education', 'Ta’lim binolari', 'expense');
  const defense = line('defense', 'Shahar himoyasi', 'expense');

  const list = [...objects];
  let population = 0;
  for (const o of list) if (CATALOG[o.type].kind === 'house') population += o.residents;

  const perObject = new Map<string, number>();
  let idleBusinesses = 0;
  for (const o of list) {
    const c = CATALOG[o.type];
    const st = statuses.get(o.id);
    let amount = 0;
    if (c.kind === 'house') {
      amount = o.residents * TAX_PER_RESIDENT;
      houseTax.amount += amount;
      if (o.residents > 0) houseTax.count++;
    } else if (c.kind === 'business') {
      const ok = !!st && st.road && st.power && st.water && population > 0;
      amount = ok ? c.income : 0;
      business.amount += amount;
      if (ok) business.count++;
      else idleBusinesses++;
    } else if (c.upkeep > 0) {
      // Xizmat xarajati qurilgandan boshlab olinadi (faol bo‘lmasa ham).
      const target = c.kind === 'power' ? power : c.kind === 'water' ? water : c.kind === 'park' ? parks : c.kind === 'education' ? education : c.kind === 'defense' ? defense : services;
      target.amount += c.upkeep;
      target.count++;
      amount = -c.upkeep;
    }
    if (amount !== 0) perObject.set(o.id, amount);
  }

  // Malaka bonusi: biznes daromadiga ko‘pi bilan +10% (malaka 100 da); biznes yo‘q bo‘lsa 0 — cheksiz daromad emas.
  skillBonus.amount = Math.floor(business.amount * (clampSkill(skill) / EDU_CONFIG.SKILL_MAX) * EDU_CONFIG.SKILL_BUSINESS_BONUS);
  skillBonus.count = skillBonus.amount > 0 ? business.count : 0;

  const lines = [houseTax, business, skillBonus, power, water, parks, services, education, defense];
  const income = houseTax.amount + business.amount + skillBonus.amount;
  const expense = power.amount + water.amount + parks.amount + services.amount + education.amount + defense.amount;
  return { lines, income, expense, net: income - expense, population, idleBusinesses, perObject };
}
