import { CATALOG } from './catalog';
import type { ObjectType, PlacedObject, Rotation } from './types';

/**
 * Boshlang‘ich mahalla (chap tomonda) va kirish yo‘li. Barcha preset obyektlar userPlaced=false,
 * shuning uchun Dastyor topshiriqlarini avtomatik bajarmaydi.
 * Preset uylar to‘liq ta’minlangani uchun boshlang‘ich aholi sig‘imga teng qilib qo‘yiladi.
 */
export function createPresetObjects(): { objects: PlacedObject[]; nextId: number } {
  const objects: PlacedObject[] = [];
  let n = 1;
  const add = (type: ObjectType, gridX: number, gridZ: number, rotation: Rotation = 0) => {
    const c = CATALOG[type];
    objects.push({
      id: 'p' + n++,
      type,
      gridX,
      gridZ,
      rotation,
      residents: c.kind === 'house' ? c.capacity : 0,
      outageTicks: 0,
      userPlaced: false,
    });
  };

  // Asosiy ko‘cha: kirish (0,16) dan o‘ngga, x=13 gacha
  for (let x = 0; x <= 13; x++) add('road', x, 16);
  // Vertikal ko‘cha x=7
  for (let z = 8; z <= 22; z++) if (z !== 16) add('road', 7, z);
  // Pastki ko‘cha z=22
  for (let x = 3; x <= 11; x++) if (x !== 7) add('road', x, 22);

  // Rotation: 0 = kirish janubga (+z), 1 = g‘arbga, 2 = shimolga, 3 = sharqqa
  add('elektr', 4, 12, 3);
  add('suv', 8, 12, 1);
  add('kop_qavatli', 8, 8, 1);
  add('uy_a', 5, 9, 3);
  add('uy_a', 5, 17, 2);
  add('uy_b', 8, 17, 2);
  add('uy_c', 10, 17, 2);
  add('dokon', 12, 14, 0);
  add('bog', 3, 17);

  for (const [x, z] of [
    [2, 9], [3, 9], [2, 11], [11, 9], [12, 10], [13, 9], [2, 14], [3, 15],
    [5, 20], [3, 20], [9, 20], [12, 20], [13, 18], [2, 23], [5, 24], [9, 24], [11, 24], [6, 25], [12, 23],
  ]) add('daraxt', x, z);

  // Kengayish hududi chetlaridagi daraxtzorlar (buzib, joy bo‘shatish mumkin)
  for (const [x, z] of [
    [30, 1], [31, 2], [29, 0], [31, 5], [30, 8], [31, 12], [30, 22], [31, 25], [29, 30], [31, 29], [26, 31],
    [21, 31], [18, 30], [15, 31], [20, 0], [17, 1], [14, 0], [27, 2], [19, 27],
  ]) add('daraxt', x, z);

  return { objects, nextId: n };
}
