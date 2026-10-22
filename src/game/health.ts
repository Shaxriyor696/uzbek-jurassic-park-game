import type { ObjectStatus, PlacedObject } from './types';

/**
 * Tibbiyot: mavjud «Shifoxona» (PRD) binosi uchun sodda xizmat tizimi. Barcha sonlar shu yerda — o‘yin balansi
 * uchun taxminiy qiymatlar. Xodimlar, bemorlar, yotoqlar va transport simulyatsiyasi yo‘q.
 *
 *  - Tibbiy xizmat talabi = shahar aholisi (har bir aholi xizmatga muhtoj);
 *  - Faol xizmat sig‘imi = faol shifoxonalar sig‘imi yig‘indisi («xizmat ko‘rsata oladigan aholi», yotoq emas);
 *  - Qamrov = min(sig‘im, talab) / talab — 100% dan oshmaydi; bir nechta shifoxona bir aholini ikki marta sanamaydi;
 *    aholi 0 bo‘lsa qamrov ko‘rsatilmaydi (null);
 *  - Ta’sir: faol shifoxonadan 6 katak ichidagi uylarga +10% baxt (PRD; nechta shifoxona bo‘lsa ham bir marta).
 *    Alohida «salomatlik» ko‘rsatkichi o‘yinda yo‘q — yangisi qo‘shilmagan.
 *  - Elektr va suv tizimi radius bo‘yicha (sarf miqdori hisoblanmaydi), shuning uchun shifoxona faqat «bor/yo‘q» talab qiladi.
 */
export const HEALTH_CONFIG = {
  /** Qurilish narxi va xizmat xarajati (PRD 06) */
  PRICE: 4000,
  UPKEEP: 50,
  /** Bitta faol shifoxona xizmat ko‘rsata oladigan aholi */
  SERVICE_CAPACITY: 150,
  /** Har aholi tibbiy xizmat talab qiladi */
  DEMAND_PER_RESIDENT: 1,
  /** Baxt ta’siri (PRD 05) */
  HAPPINESS_RADIUS: 6,
  HAPPINESS_BONUS: 10,
  /** Faol bo‘lishi uchun kerak */
  NEEDS: { road: true, power: true, water: true },
  /** Dastyor topshirig‘i mukofoti */
  TASK_REWARD: 2000,
};

export interface HealthBuildingState {
  active: boolean;
  problems: { kind: 'road' | 'power' | 'water' | 'money'; text: string; fix: string }[];
  capacity: number;
  /** Shu shifoxona qamrab olayotgan aholi (talab faol shifoxonalar orasida sig‘imga qarab taqsimlanadi) */
  served: number;
}

export interface HealthSummary {
  demand: number;
  capacity: number;
  covered: number;
  /** 0..100, talab 0 bo‘lsa null */
  coverage: number | null;
  activeHospitals: number;
  /** Foydalanuvchi qurgan va faol shifoxonalar (topshiriq uchun) */
  userActiveHospitals: number;
  perBuilding: Map<string, HealthBuildingState>;
}

/** Shifoxona faolmi: yo‘l + elektr + suv (pul sharti summary da). Baxt hisobi ham shuni ishlatadi. */
export function hospitalSupplied(st: Pick<ObjectStatus, 'road' | 'power' | 'water'> | undefined): boolean {
  return !!st && st.road && st.power && st.water;
}

export function healthSummary(objects: Iterable<PlacedObject>, statuses: Map<string, ObjectStatus>, money: number, population: number): HealthSummary {
  const perBuilding = new Map<string, HealthBuildingState>();
  let capacity = 0;
  let activeHospitals = 0;
  let userActiveHospitals = 0;
  const active: string[] = [];
  for (const o of objects) {
    if (o.type !== 'shifoxona') continue;
    const st = statuses.get(o.id);
    const problems: HealthBuildingState['problems'] = [];
    if (!st?.road) problems.push({ kind: 'road', text: 'Yo‘l ulanmagan', fix: 'Shifoxonani yo‘l tarmog‘iga ulang — bino chetiga tegib turgan yo‘l quring.' });
    if (!st?.power) problems.push({ kind: 'power', text: 'Elektr yetishmayapti', fix: 'Elektr ta’minotini yaxshilang — yo‘lga ulangan elektr stansiyasini 8 katak ichida quring.' });
    if (!st?.water) problems.push({ kind: 'water', text: 'Suv ulanmagan', fix: 'Shifoxonani suv tarmog‘iga ulang — yo‘lga ulangan suv stansiyasini 6 katak ichida quring.' });
    if (money < 0) problems.push({ kind: 'money', text: 'Mablag‘ yetishmaydi', fix: 'Balans manfiy — xizmat xarajati to‘lanmayapti. Daromadni oshiring.' });
    const ok = problems.length === 0;
    if (ok) {
      capacity += HEALTH_CONFIG.SERVICE_CAPACITY;
      activeHospitals++;
      if (o.userPlaced) userActiveHospitals++;
      active.push(o.id);
    }
    perBuilding.set(o.id, { active: ok, problems, capacity: HEALTH_CONFIG.SERVICE_CAPACITY, served: 0 });
  }
  const demand = Math.max(0, Math.ceil(population * HEALTH_CONFIG.DEMAND_PER_RESIDENT));
  const covered = Math.min(capacity, demand);
  const coverage = demand > 0 ? Math.round((covered / demand) * 100) : null;
  const fill = capacity > 0 ? Math.min(1, demand / capacity) : 0;
  for (const id of active) {
    const b = perBuilding.get(id)!;
    b.served = Math.round(b.capacity * fill);
  }
  return { demand, capacity, covered, coverage, activeHospitals, userActiveHospitals, perBuilding };
}

/** Dastyor topshirig‘i: shifoxona amalda faol bo‘lganda bajariladi; mukofot bir marta (holat saqlanadi). */
export const HEALTH_TASK = {
  title: 'Shifoxona',
  task: 'Shifoxona qur va uni yo‘l, elektr hamda suvga ula',
  hint: 'Odamlar kasal bo‘lsa davolanishi kerak! «Tibbiyot» bo‘limidan shifoxona quring, keyin yo‘l, elektr va suv bering.',
  reward: HEALTH_CONFIG.TASK_REWARD,
  done: (s: HealthSummary) => s.userActiveHospitals > 0,
};
