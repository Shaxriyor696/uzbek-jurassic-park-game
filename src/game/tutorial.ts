import { CATALOG } from './catalog';
import { distance, footprintCenter } from './grid';
import type { RoadGrid } from './roadNetwork';
import { stationCovers } from './utilities';
import type { ObjectStatus, PlacedObject, TutorialState } from './types';

/**
 * Yo‘riqnoma bosqichlari. `short` — Dastyor pufakchasidagi qisqa jumla (asosiy ma’no ikonlar bilan
 * ko‘rsatiladi, `ui/TutorialVisual.tsx`), `task` — topshiriq panelidagi aniq shart.
 */
export const TUTORIAL_STEPS = [
  {
    title: 'Yo‘l quring',
    short: 'Ko‘chadan boshlab sudrang',
    task: 'Ko‘chaga ulangan 3 ta yo‘l katagi',
    hint: 'Avval yo‘l quring. Pastdagi «Yo‘l» bo‘limini tanlang va mavjud ko‘chadan boshlab sichqonchani sudrang.',
  },
  {
    title: 'Uy quring',
    short: 'Yangi yo‘l yoniga',
    task: 'Yo‘lga ulangan yangi uy',
    hint: 'Ajoyib! Endi «Uylar» bo‘limidan uy tanlang va yangi yo‘lingiz yoniga joylashtiring. R tugmasi uyni aylantiradi.',
  },
  {
    title: 'Elektr bering',
    short: 'Uydan 8 katak ichida',
    task: 'Uyga elektr yetkazing',
    hint: 'Uyga elektr kerak. «Elektr» bo‘limidan stansiyani yo‘l yoniga, uydan 8 katak ichida quring.',
  },
  {
    title: 'Suv bering',
    short: 'Uydan 6 katak ichida',
    task: 'Uyga suv yetkazing',
    hint: 'Endi suv. «Suv» bo‘limidagi stansiya 6 katak radiusda xizmat qiladi va yo‘lga ulanishi shart.',
  },
  {
    title: 'Bog‘ yarating',
    short: 'Uy yoniga, 4 katak ichida',
    task: 'Uy yonida yangi bog‘',
    hint: 'Oxirgi qadam: uy yoniga bog‘ qursangiz, aholining baxti oshadi.',
  },
] as const;

export const TUTORIAL_TOTAL = TUTORIAL_STEPS.length;

export function initialTutorial(): TutorialState {
  return { step: 0, completed: false, skipped: false, hidden: false, targetHouseId: null };
}

function userHouses(objects: PlacedObject[], statuses: Map<string, ObjectStatus>) {
  return objects.filter((o) => o.userPlaced && CATALOG[o.type].kind === 'house' && statuses.get(o.id)?.road);
}

/** Maqsad uy: 2-bosqichda yozib olingan uy; u buzilgan bo‘lsa — tarmoqqa ulangan boshqa foydalanuvchi uyi. */
function targetHouses(t: TutorialState, objects: PlacedObject[], statuses: Map<string, ObjectStatus>) {
  const houses = userHouses(objects, statuses);
  const first = houses.find((h) => h.id === t.targetHouseId);
  return first ? [first, ...houses.filter((h) => h !== first)] : houses;
}

/** Joriy bosqich sharti bajarilganmi. Faqat userPlaced obyektlar hisobga olinadi. */
export function isStepSatisfied(
  t: TutorialState,
  objects: PlacedObject[],
  statuses: Map<string, ObjectStatus>,
  roads: RoadGrid,
): boolean {
  switch (t.step) {
    case 0:
      return objects.filter((o) => o.type === 'road' && o.userPlaced && roads.isConnected(o.gridX, o.gridZ)).length >= 3;
    case 1:
      return userHouses(objects, statuses).length > 0;
    case 2:
    case 3: {
      const kind = t.step === 2 ? 'power' : 'water';
      const stations = objects.filter((o) => o.userPlaced && CATALOG[o.type].kind === kind && statuses.get(o.id)?.active);
      return targetHouses(t, objects, statuses).some((h) => stations.some((s) => stationCovers(s, h)));
    }
    case 4: {
      const parks = objects.filter((o) => o.userPlaced && o.type === 'bog');
      return targetHouses(t, objects, statuses).some((h) =>
        parks.some((p) => distance(footprintCenter(p), footprintCenter(h)) <= 4),
      );
    }
    default:
      return false;
  }
}

/**
 * Bosqichlarni oldinga suradi (bir chaqiruvda bir nechta, agar amal oldindan bajarilgan bo‘lsa).
 * Tugallangan bosqich qaytarilmaydi. Natija: yakunlangan bosqichlar soni.
 */
export function advanceTutorial(
  t: TutorialState,
  objects: PlacedObject[],
  statuses: Map<string, ObjectStatus>,
  roads: RoadGrid,
): number {
  if (t.skipped || t.completed) return 0;
  let advanced = 0;
  while (t.step < TUTORIAL_TOTAL && isStepSatisfied(t, objects, statuses, roads)) {
    if (t.step === 1 || (t.step > 1 && !objects.some((o) => o.id === t.targetHouseId))) {
      t.targetHouseId = userHouses(objects, statuses)[0]?.id ?? t.targetHouseId;
    }
    t.step++;
    advanced++;
  }
  if (t.step >= TUTORIAL_TOTAL) t.completed = true;
  return advanced;
}
