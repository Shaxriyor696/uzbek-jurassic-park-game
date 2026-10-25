/**
 * Bonuslar va jarimalar — yagona sozlama va holat.
 *
 * «Obro‘» (0–100, boshida 50): to‘g‘ri qarorlar oshiradi, xatolar kamaytiradi. Ta’siri — uy solig‘iga ±10% gacha
 * (50 da 0). Bonuslar (yutuqlar) har shaharda bir marta; politsiya dinozavrni chiqarishi kabi hodisalar takrorlanadi.
 * Jarimalar: aholisi bor uyni buzish, aholi noroziligi, qarz, dinozavr binoni ishdan chiqarishi.
 * Qiymatlar o‘yin balansi uchun taxminiy (uy 500–5 000, yo‘l 100 so‘m).
 */

/** false — bonus/jarima/obro‘ ta’siri yo‘q (faqat budjet formulalarini aniq tekshiradigan eski sinovlar uchun; o‘yinchi uchun doim true) */
export const REWARDS_CONFIG = { enabled: true };

export const REP = { START: 50, MIN: 0, MAX: 100, /** obro‘ 100 → uy solig‘i +10%, 0 → −10% */ TAX_EFFECT: 0.1 };

export interface RewardCtx {
  population: number;
  happiness: number;
  /** Foydalanuvchi qurgan yo‘llar */
  userRoads: number;
  houses: number;
  /** Yo‘l + elektr + suv bilan to‘liq ta’minlangan uylar */
  suppliedHouses: number;
  activeBusinesses: number;
  defenseClosed: boolean;
  /** Ketma-ket davrlar: baxt ≥ 80%, sof natija > 0 */
  happyStreak: number;
  profitStreak: number;
}

export interface Achievement {
  id: string;
  title: string;
  hint: string;
  money: number;
  rep: number;
  done: (c: RewardCtx) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'firstRoad', title: 'Birinchi ko‘cha', hint: 'Yo‘l quring', money: 3000, rep: 2, done: (c) => c.userRoads > 0 },
  { id: 'firstHome', title: 'Birinchi oila ko‘chib keldi', hint: 'Uyga yo‘l, elektr va suv bering — odamlar keladi', money: 5000, rep: 3, done: (c) => c.population > 0 },
  { id: 'firstBusiness', title: 'Birinchi biznes ishlayapti', hint: 'Do‘kon quring va ta’minlang', money: 5000, rep: 2, done: (c) => c.activeBusinesses > 0 },
  { id: 'fullSupply', title: 'To‘liq ta’minot', hint: 'Kamida 3 ta uyning hammasiga yo‘l, elektr va suv', money: 10000, rep: 5, done: (c) => c.houses >= 3 && c.suppliedHouses === c.houses },
  { id: 'pop25', title: 'Aholi 25 kishi', hint: 'Aholini 25 ga yetkazing', money: 5000, rep: 2, done: (c) => c.population >= 25 },
  { id: 'pop100', title: 'Aholi 100 kishi', hint: 'Aholini 100 ga yetkazing', money: 10000, rep: 3, done: (c) => c.population >= 100 },
  { id: 'pop250', title: 'Aholi 250 kishi', hint: 'Aholini 250 ga yetkazing', money: 20000, rep: 4, done: (c) => c.population >= 250 },
  { id: 'pop500', title: 'Aholi 500 kishi', hint: 'Aholini 500 ga yetkazing', money: 40000, rep: 5, done: (c) => c.population >= 500 },
  { id: 'pop1000', title: 'Aholi 1 000 kishi', hint: 'Aholini 1 000 ga yetkazing', money: 80000, rep: 6, done: (c) => c.population >= 1000 },
  { id: 'happyCity', title: 'Baxtli shahar', hint: 'Baxt 3 davr ketma-ket 80% va undan yuqori (aholi ≥ 10)', money: 15000, rep: 5, done: (c) => c.happyStreak >= 3 },
  { id: 'profit', title: 'Barqaror budjet', hint: '5 davr ketma-ket foyda', money: 8000, rep: 3, done: (c) => c.profitStreak >= 5 },
  { id: 'defended', title: 'Himoyalangan shahar', hint: 'Shaharni devor va darvoza bilan to‘liq o‘rang', money: 20000, rep: 5, done: (c) => c.defenseClosed },
];

/** Takrorlanadigan bonus va jarimalar */
export const EVENTS = {
  dinoEvicted: { title: 'Dinozavr shahardan chiqarildi', money: 1500, rep: 1 },
  demolishHome: { title: 'Aholisi bor uy buzildi', money: -1000, perResident: -50, rep: -3 },
  unhappy: { title: 'Aholi noroziligi (baxt 30% dan past)', money: -2000, rep: -2, cooldownTicks: 3, minPopulation: 10 },
  debt: { title: 'Shahar qarzda', money: 0, rep: -1 },
  dinoBroke: { title: 'Dinozavr binoni ishdan chiqardi', money: 0, rep: -2 },
};

export interface RewardLogItem { t: number; title: string; money: number; rep: number }

export interface RewardState {
  rep: number;
  done: string[];
  happyStreak: number;
  profitStreak: number;
  unhappyCool: number;
  /** Oxirgi hodisalar (eng yangisi boshida) */
  log: RewardLogItem[];
  /** Oxirgi davrdagi obro‘ ta’siri (so‘m) */
  lastRepTax: number;
}

export const initialRewards = (): RewardState => ({ rep: REP.START, done: [], happyStreak: 0, profitStreak: 0, unhappyCool: 0, log: [], lastRepTax: 0 });

export const clampRep = (r: number) => Math.max(REP.MIN, Math.min(REP.MAX, Math.round(r)));

/** Obro‘ning uy solig‘iga ta’siri (ulush): 50 → 0, 100 → +0.1, 0 → −0.1 */
export const repTaxRate = (rep: number) => ((clampRep(rep) - 50) / 50) * REP.TAX_EFFECT;

/** Saqlangan qiymatni tekshirib tiklash (eski saqlashda yo‘q — boshlang‘ich holat) */
export function readRewards(v: unknown): RewardState {
  const d = initialRewards();
  if (!v || typeof v !== 'object') return d;
  const o = v as Partial<RewardState>;
  const num = (x: unknown, def: number) => (typeof x === 'number' && Number.isFinite(x) ? x : def);
  return {
    rep: clampRep(num(o.rep, d.rep)),
    done: Array.isArray(o.done) ? o.done.filter((x): x is string => typeof x === 'string') : [],
    happyStreak: num(o.happyStreak, 0),
    profitStreak: num(o.profitStreak, 0),
    unhappyCool: num(o.unhappyCool, 0),
    log: Array.isArray(o.log) ? o.log.filter((x) => x && typeof x.title === 'string').slice(0, 12) : [],
    lastRepTax: num(o.lastRepTax, 0),
  };
}
