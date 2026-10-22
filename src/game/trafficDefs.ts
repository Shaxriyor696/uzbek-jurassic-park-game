/**
 * Transport — yagona sozlama. Ko‘chib kelish transporti (avtomobil va avtobus) va shahar ichidagi transport
 * limitlari alohida. 1 katak = 1 birlik (≈10 m): avtomobil ≈4,6 m, avtobus ≈11 m.
 */
export const MIGRATION_CONFIG = {
  /**
   * true — yangi aholi transportda keladi (uyga yetganda qo‘shiladi). false — eski usul: hisob davrida darhol
   * (faqat eski avtomatik sinovlar uchun; o‘yinchi uchun doim true).
   */
  transport: true,
  /** Avtomobil: kichik oila */
  carPeople: [1, 4] as [number, number],
  /** Avtobus: kattaroq guruh, bir nechta uyga taqsimlanadi */
  busPeople: [8, 20] as [number, number],
  busMaxStops: 4,
  /** Avtobus aholi sonidan qat’i nazar katta guruh (ko‘p qavatli uy) uchun keladi */
  busMinPopulation: 0,
  /** Bir vaqtdagi faol migratsiya transporti (kirayotgan, kutayotgan va qaytayotgan hammasi) */
  maxTrips: 8,
  /** Yangi safar jo‘natish oralig‘i (o‘yin soniyasi) */
  dispatchEvery: 2,
  /** Uy oldida yo‘lovchilar tushishi (s) */
  unloadSeconds: { car: 2, bus: 2.5 },
  /** Darvoza qo‘lda yopiq yoki yo‘l band bo‘lsa shuncha kutib, boshqa yo‘l izlaydi / qaytadi */
  giveUpSeconds: 30,
  /** Kirish nuqtasidan shu radiusda dinozavr bo‘lsa kirish xavfsiz emas */
  entryDangerRadius: 6,
};

/** Shahar ichidagi transport (aholining uy–ish–do‘kon–xizmat safarlari, bekatli avtobus) */
export const CITY_TRAFFIC_CONFIG = {
  /** Ko‘rinadigan shaxsiy avtomobillar — shahar harakatining vakili (har oila uchun emas) */
  carMax: 10,
  peoplePerCar: 30,
  spawnEvery: 3,
  /** Manzilda to‘xtash (s) */
  dwell: [4, 9] as [number, number],
  /** Bekatli avtobuslar */
  busMax: 3,
  /** Shahar avtobusi shu aholidan boshlab qatnaydi */
  busMinPopulation: 60,
  peoplePerBus: 150,
  busDwell: 3,
};

/**
 * Har uyga bir marta keladigan oila/guruh (uy hajmiga qarab, sig‘imdan oshmaydi). Joylashgan uyga qayta olib
 * kelinmaydi. [kam, ko‘p] — aniq son uy identifikatoridan (har o‘yinda bir xil).
 */
export const SETTLE_SIZE: Record<string, [number, number]> = {
  uy_a: [2, 2],
  uy_b: [2, 2],
  uy_c: [4, 4],
  kop_qavatli: [10, 20],
};

export function settleSize(o: { id: string; type: string }, capacity: number): number {
  const [a, b] = SETTLE_SIZE[o.type] ?? [2, 2];
  let h = 0;
  for (const ch of o.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Math.min(capacity, a + (h % (b - a + 1)));
}

export const VEHICLE_SPECS = {
  car: { length: 0.46, width: 0.2, lane: 0.12, speed: 1.6, accel: 1.6, wheelR: 0.045, uturnSeconds: 1.6 },
  bus: { length: 1.1, width: 0.25, lane: 0.13, speed: 1.2, accel: 0.9, wheelR: 0.055, uturnSeconds: 3.2 },
  police: { length: 0.46, width: 0.2, lane: 0.12, speed: 2.2, accel: 2.2, wheelR: 0.045, uturnSeconds: 1.2 },
} as const;

export type VehicleKind = keyof typeof VEHICLE_SPECS;

/** Xarita chetidagi yo‘ldan tashqariga (tabiat ichida) davom etadigan tashqi yo‘l uzunligi (katak) */
export const STUB_LENGTH = 10;
export const STUB_MIN = 6;

/**
 * Politsiya maxsus mashinasi: shahar ichiga kirgan dinozavrni chiqarib yuboradi (qurolsiz — chiroq va sirena bilan
 * yaqinlashib, tashqariga haydaydi). Faol xavfsizlik binosi (Politsiya / Xavfsizlik xizmati) dan chiqadi.
 */
export const POLICE_CONFIG = {
  /** Har bir faol bo‘limdan bir vaqtda */
  perStation: 2,
  /** Butun shahar bo‘yicha bir vaqtda */
  maxTotal: 4,
  /** Dinozavrga shu masofagacha yaqinlashsa chiqarib yubora boshlaydi (katak) */
  evictDistance: 5,
};
