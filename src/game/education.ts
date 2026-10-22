import { CATALOG } from './catalog';
import { EDUCATION_BY_TYPE, isEducation, type EduRole } from './educationDefs';
import { distance, footprintCenter } from './grid';
import type { ObjectStatus, PlacedObject } from './types';

export { EDUCATION, EDUCATION_BY_TYPE, isEducation, type EduRole, type EducationDef } from './educationDefs';

/**
 * «Ta’lim» bo‘limi: 6 ta bino va soddalashtirilgan ta’lim mexanikasi. Barcha sonlar (narx, xarajat, sig‘im,
 * talab ulushi, malaka, bonus va mukofotlar) shu faylda — o‘yin balansi uchun taxminiy qiymatlar.
 *
 * Aholining yosh guruhlari va o‘quvchi/bitiruvchi simulyatsiyasi yo‘q. Shuning uchun:
 *  - Ta’lim talabi = ceil(aholi × DEMAND_PER_RESIDENT) — «maktab yoshidagilar» ulushi taxmini;
 *  - Mavjud o‘rinlar = faol maktablar sig‘imi yig‘indisi (kutubxona, bog‘cha, universitet maktab o‘rnini bosmaydi);
 *  - Ta’lim qamrovi = min(o‘rinlar, talab) / talab; talab 0 bo‘lsa qamrov ko‘rsatilmaydi;
 *  - Malaka — shahar bo‘yicha 0..100 indeks: faqat faol IT maktabi va universitet uni har davrda biroz oshiradi,
 *    kutubxonalar bu o‘sishni tezlashtiradi; ular yo‘q bo‘lsa indeks sekin pasayadi. Malaka biznes daromadiga
 *    ko‘pi bilan +10% qo‘shadi (cheklangan bonus).
 */
export const EDU_CONFIG = {
  /** Ta’lim talabi: aholining shuncha ulushi maktab o‘rni so‘raydi */
  DEMAND_PER_RESIDENT: 0.2,
  /** Bog‘cha talabi (faqat band o‘rinlarni ko‘rsatish uchun) */
  KINDERGARTEN_PER_RESIDENT: 0.06,
  /** Eski «Maktab» (PRD) binosi ham o‘rin beradi */
  LEGACY_SCHOOL_SEATS: 25,
  /** Bog‘cha va bolalar kutubxonasining oilaviy ta’sir radiusi (katak) */
  FAMILY_RADIUS: 10,
  /** Ta’sir doirasidagi uyga bir davrda qo‘shimcha ko‘chib keladiganlar (nechta bino bo‘lsa ham shuncha) */
  FAMILY_MOVE_IN_BONUS: 1,
  /** Malaka o‘sishi bir davrda: IT maktabi va universitet uchun (har faol bino) */
  SKILL_GAIN: { it_school: 1, university: 2 } as Record<string, number>,
  /** Bir davrdagi bazaviy o‘sish chegarasi (kutubxonasiz) */
  SKILL_BASE_GAIN_CAP: 4,
  /** Kutubxonalar o‘sishni tezlashtiradi (ko‘paytiruvchi qo‘shimchasi) */
  LIBRARY_BOOST: { kids_library: 0.25, library: 0.5 } as Record<string, number>,
  LIBRARY_BOOST_CAP: 0.5,
  /** Malaka beruvchi bino yo‘q bo‘lsa har davrda shuncha pasayadi */
  SKILL_DECAY: 1,
  SKILL_MAX: 100,
  /** Malaka 100 bo‘lganda biznes daromadiga qo‘shimcha ulush */
  SKILL_BUSINESS_BONUS: 0.1,
  /** 3-topshiriq: talab kamida shuncha bo‘lganda o‘rinlar unga yetishi kerak */
  TASK_MIN_DEMAND: 30,
};

export interface EduBuildingState {
  active: boolean;
  /** Ishlamaslik sabablari (bo‘sh — faol) */
  problems: { kind: 'road' | 'power' | 'water' | 'money'; text: string; fix: string }[];
  role: EduRole | 'legacy_school';
  /** O‘rin beradigan binolar uchun */
  seats: number;
  /** Band o‘rinlar (tizim hisoblay oladigan joyda), aks holda null */
  used: number | null;
}

export interface EducationSummary {
  population: number;
  demand: number;
  seats: number;
  /** min(o‘rinlar, talab) */
  covered: number;
  /** 0..100, talab 0 bo‘lsa null */
  coverage: number | null;
  skill: number;
  /** Keyingi davrdagi malaka o‘zgarishi (shu holat saqlansa) */
  skillDelta: number;
  libraryBoost: number;
  /** Biznes daromadiga qo‘shimcha ulush (0..0.1) */
  businessBonusRate: number;
  familyHouses: Set<string>;
  activeSchools: number;
  kidsLibraryActive: boolean;
  perBuilding: Map<string, EduBuildingState>;
}

/**
 * Shahar ta’lim holati — yagona hisob (ma’lumot paneli, «Ta’lim» paneli, budjet, hisob davri va topshiriqlar uchun).
 * Bino faol: yo‘l + elektr + suv bor va balans manfiy emas (qarzda xizmat xarajati to‘lanmaydi).
 */
export function educationSummary(
  objects: Iterable<PlacedObject>,
  statuses: Map<string, ObjectStatus>,
  money: number,
  skill: number,
  population: number,
): EducationSummary {
  const list = [...objects];
  const perBuilding = new Map<string, EduBuildingState>();
  let seats = 0;
  let base = 0;
  let boost = 0;
  let activeSchools = 0;
  let kidsLibraryActive = false;
  const family: PlacedObject[] = [];
  const kindergartens: string[] = [];
  const schoolIds: string[] = [];
  for (const o of list) {
    const st = statuses.get(o.id);
    if (o.type === 'maktab') {
      const active = !!st?.active;
      const s = active ? EDU_CONFIG.LEGACY_SCHOOL_SEATS : 0;
      seats += s;
      if (active && st?.power && st?.water && o.userPlaced) activeSchools++;
      perBuilding.set(o.id, { active, problems: [], role: 'legacy_school', seats: EDU_CONFIG.LEGACY_SCHOOL_SEATS, used: null });
      if (active) schoolIds.push(o.id);
      continue;
    }
    if (!isEducation(o.type)) continue;
    const def = EDUCATION_BY_TYPE[o.type];
    const problems: EduBuildingState['problems'] = [];
    if (!st?.road) problems.push({ kind: 'road', text: 'Yo‘lga ulanmagan', fix: 'Bino chetiga tegib turgan yo‘l quring va uni shahar ko‘chasiga ulang.' });
    if (!st?.power) problems.push({ kind: 'power', text: 'Elektr yo‘q', fix: 'Yo‘lga ulangan elektr stansiyasini 8 katak ichida quring.' });
    if (!st?.water) problems.push({ kind: 'water', text: 'Suv yo‘q', fix: 'Yo‘lga ulangan suv stansiyasini 6 katak ichida quring.' });
    if (money < 0) problems.push({ kind: 'money', text: 'Mablag‘ yetishmaydi', fix: 'Balans manfiy — xizmat xarajati to‘lanmayapti. Daromadni oshiring yoki xarajatli binolarni kamaytiring.' });
    const active = problems.length === 0;
    const isSchool = def.role === 'school' || def.role === 'it_school';
    if (active) {
      if (isSchool) {
        seats += def.capacity;
        activeSchools++;
        schoolIds.push(o.id);
      }
      base += EDU_CONFIG.SKILL_GAIN[def.role] ?? 0;
      boost += EDU_CONFIG.LIBRARY_BOOST[def.role] ?? 0;
      if (def.role === 'kindergarten' || def.role === 'kids_library') family.push(o);
      if (def.role === 'kids_library' && o.userPlaced) kidsLibraryActive = true;
      if (def.role === 'kindergarten') kindergartens.push(o.id);
    }
    perBuilding.set(o.id, { active, problems, role: def.role, seats: def.capacity, used: null });
  }

  const demand = Math.ceil(population * EDU_CONFIG.DEMAND_PER_RESIDENT);
  const covered = Math.min(seats, demand);
  const coverage = demand > 0 ? Math.round((covered / demand) * 100) : null;
  // Band o‘rinlar: talab faol maktablar orasida sig‘imiga qarab taqsimlanadi
  const fill = seats > 0 ? Math.min(1, demand / seats) : 0;
  for (const id of schoolIds) {
    const b = perBuilding.get(id)!;
    b.used = Math.round(b.seats * fill);
  }
  const kidsDemand = Math.ceil(population * EDU_CONFIG.KINDERGARTEN_PER_RESIDENT);
  let kgSeats = 0;
  for (const id of kindergartens) kgSeats += perBuilding.get(id)!.seats;
  const kgFill = kgSeats > 0 ? Math.min(1, kidsDemand / kgSeats) : 0;
  for (const id of kindergartens) {
    const b = perBuilding.get(id)!;
    b.used = Math.round(b.seats * kgFill);
  }

  const libraryBoost = Math.min(EDU_CONFIG.LIBRARY_BOOST_CAP, boost);
  const gain = Math.min(EDU_CONFIG.SKILL_BASE_GAIN_CAP, base) * (1 + libraryBoost);
  const cur = clampSkill(skill);
  const skillDelta = base > 0 ? Math.min(EDU_CONFIG.SKILL_MAX - cur, gain) : -Math.min(cur, EDU_CONFIG.SKILL_DECAY);

  const familyHouses = new Set<string>();
  if (family.length) {
    for (const o of list) {
      if (CATALOG[o.type].kind !== 'house') continue;
      const c = footprintCenter(o);
      if (family.some((f) => distance(footprintCenter(f), c) <= EDU_CONFIG.FAMILY_RADIUS)) familyHouses.add(o.id);
    }
  }

  return {
    population, demand, seats, covered, coverage, skill: cur, skillDelta, libraryBoost,
    businessBonusRate: (cur / EDU_CONFIG.SKILL_MAX) * EDU_CONFIG.SKILL_BUSINESS_BONUS,
    familyHouses, activeSchools, kidsLibraryActive, perBuilding,
  };
}

export function clampSkill(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(EDU_CONFIG.SKILL_MAX, v)) : 0;
}

/** Yangi maktablar (faol) — uy baxtidagi «maktab yaqinida» sharti uchun. */
export function isActiveNewSchool(o: PlacedObject, st: ObjectStatus | undefined): boolean {
  if (!isEducation(o.type)) return false;
  const role = EDUCATION_BY_TYPE[o.type].role;
  return (role === 'school' || role === 'it_school') && !!st?.road && !!st.power && !!st.water;
}

// ---------------- Dastyor: ta’lim topshiriqlari ----------------

export interface EduTask {
  title: string;
  /** Topshiriq panelidagi aniq shart */
  task: string;
  /** Dastyor pufakchasidagi bolalarga tushunarli matn */
  hint: string;
  reward: number;
  done: (s: EducationSummary) => boolean;
}

export const EDU_TASKS: EduTask[] = [
  {
    title: 'Birinchi maktab',
    task: 'Maktab quring va unga yo‘l, elektr, suv bering',
    hint: 'Bolalar o‘qishi kerak! «Ta’lim» bo‘limidan maktab tanlang, yo‘l yoniga quring, keyin elektr va suv bering.',
    reward: 1500,
    done: (s) => s.activeSchools > 0,
  },
  {
    title: 'Bolalar kutubxonasi',
    task: 'Respublika bolalar kutubxonasini quring va ishlating',
    hint: 'Kitob — eng yaxshi do‘st! Bolalar kutubxonasini quring va unga yo‘l, elektr, suv bering.',
    reward: 1000,
    done: (s) => s.kidsLibraryActive,
  },
  {
    title: 'Hamma bolaga joy',
    task: `Ta’lim o‘rinlari talabga yetsin (talab kamida ${EDU_CONFIG.TASK_MIN_DEMAND})`,
    hint: 'Shahar o‘syapti! Hamma bola maktabda o‘qishi uchun o‘rinlar talabdan kam bo‘lmasin. Uylar va maktablar quring.',
    reward: 2500,
    done: (s) => s.demand >= EDU_CONFIG.TASK_MIN_DEMAND && s.seats >= s.demand,
  },
];
