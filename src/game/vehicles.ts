import { DIR4, type Cell, type RoadGraph } from './roadGraph';
import { VEHICLE_SPECS, type VehicleKind } from './trafficDefs';

/**
 * Yo‘l bo‘ylab harakat (migratsiya va shahar transporti uchun umumiy). Katak koordinatasi uzluksiz: katak markazi
 * (x+0,5; z+0,5). O‘ng tomonlama harakat: yo‘nalishning o‘ng tomonidagi qatorda. Burilishda burchak kesiladi
 * (silliq yoy), oldin sekinlashadi; orqaga aylanish — faqat ruxsat etilgan joyda, to‘xtab, yarim aylana bo‘ylab.
 * Tezlik o‘yin vaqti bilan (pauza/FPS ga bog‘liq emas). Teleport yo‘q.
 */

export interface VehicleState {
  id: string;
  kind: VehicleKind;
  x: number;
  z: number;
  /** Harakat yo‘nalishi (rad, atan2(dz, dx)) */
  heading: number;
  speed: number;
  /** G‘ildirak burchagi (aylanish = bosib o‘tilgan masofa / radius) */
  wheel: number;
  /** Rang varianti (ko‘rinish) */
  look: number;
}

export interface Waypoint { x: number; z: number; cell: Cell; uturn?: boolean }

/** Saqlanmaydigan harakat holati: yo‘l va nuqtalar (yuklanganda qayta hisoblanadi) */
export interface Drive {
  cells: Cell[];
  wps: Waypoint[];
  i: number;
  /** Orqaga aylanish jarayoni (0..1) */
  uturn: { t: number; from: { x: number; z: number; h: number }; to: Waypoint } | null;
  /** Kutish sababi (ko‘rsatish uchun) */
  wait: 'gate-closed' | 'gate-danger' | 'gate-opening' | 'blocked' | 'traffic' | null;
  waitT: number;
  /** Oxirgi kutishga sabab bo‘lgan katak (qayta yo‘l topishda chetlab o‘tish uchun) */
  blockCell: Cell | null;
}

const right = (d: { x: number; z: number }) => ({ x: -d.z, z: d.x });
const dirOf = (a: Cell, b: Cell) => ({ x: Math.sign(b.x - a.x), z: Math.sign(b.z - a.z) });
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Katak ketma-ketligidan qator nuqtalari (birinchi katak — joriy joy) */
export function waypoints(cells: Cell[], kind: VehicleKind): Waypoint[] {
  const off = VEHICLE_SPECS[kind].lane;
  const out: Waypoint[] = [];
  const pt = (c: Cell, along: { x: number; z: number }, a: number, lane: { x: number; z: number }, extra: Partial<Waypoint> = {}): Waypoint =>
    ({ x: c.x + 0.5 + along.x * a + lane.x * off, z: c.z + 0.5 + along.z * a + lane.z * off, cell: c, ...extra });
  for (let i = 1; i < cells.length; i++) {
    const c = cells[i];
    const din = dirOf(cells[i - 1], c);
    const next = cells[i + 1];
    if (!next) { out.push(pt(c, din, 0, right(din))); break; }
    const dout = dirOf(c, next);
    if (dout.x === din.x && dout.z === din.z) out.push(pt(c, din, 0, right(din)));
    else if (dout.x === -din.x && dout.z === -din.z) {
      out.push(pt(c, din, 0.05, right(din)));
      out.push(pt(c, dout, -0.05, right(dout), { uturn: true }));
    } else {
      out.push(pt(c, din, -0.3, right(din)));
      out.push(pt(c, dout, 0.3, right(dout)));
    }
  }
  return out;
}

export function newDrive(cells: Cell[], kind: VehicleKind): Drive {
  return { cells, wps: waypoints(cells, kind), i: 0, uturn: null, wait: null, waitT: 0, blockCell: null };
}

/** Joriy nuqtadan yo‘l bo‘ylab masofa bilan nuqtalar (oldinni tekshirish uchun) */
export function lookAhead(v: VehicleState, d: Drive, dist: number, step = 0.25): { x: number; z: number; s: number; cell: Cell }[] {
  const out: { x: number; z: number; s: number; cell: Cell }[] = [];
  let px = v.x, pz = v.z, s = 0;
  for (let i = d.i; i < d.wps.length && s < dist; i++) {
    const w = d.wps[i];
    const L = Math.hypot(w.x - px, w.z - pz);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n && s < dist; k++) {
      s += L / n;
      out.push({ x: px + ((w.x - px) * k) / n, z: pz + ((w.z - pz) * k) / n, s, cell: w.cell });
    }
    px = w.x; pz = w.z;
  }
  return out;
}

/** Qolgan yo‘l uzunligi (manzilgacha) */
export function remaining(v: VehicleState, d: Drive): number {
  let s = 0, px = v.x, pz = v.z;
  for (let i = d.i; i < d.wps.length; i++) { s += Math.hypot(d.wps[i].x - px, d.wps[i].z - pz); px = d.wps[i].x; pz = d.wps[i].z; }
  return s;
}

/**
 * Bir qadam. limit — tashqi cheklovlar bo‘yicha ruxsat etilgan eng katta tezlik (oldingi transport, dinozavr,
 * darvoza). Qaytaradi: manzilga yetib to‘xtadimi.
 */
export function stepVehicle(v: VehicleState, d: Drive, dt: number, limit: number): boolean {
  const sp = VEHICLE_SPECS[v.kind];
  if (d.uturn) {
    // to‘xtab, yo‘l markazi atrofida yarim aylana bo‘ylab aylanib oladi
    const u = d.uturn;
    u.t = Math.min(1, u.t + dt / sp.uturnSeconds);
    const k = u.t * u.t * (3 - 2 * u.t);
    const cx = (u.from.x + u.to.x) / 2, cz = (u.from.z + u.to.z) / 2;
    const a0 = Math.atan2(u.from.z - cz, u.from.x - cx);
    const r = Math.hypot(u.from.x - cx, u.from.z - cz);
    // aylanish yo‘nalishi: chap tomonga (o‘ng qatordan qarama-qarshi qatorga)
    const a = a0 - Math.PI * k;
    v.x = cx + Math.cos(a) * r;
    v.z = cz + Math.sin(a) * r;
    v.heading = u.from.h - Math.PI * k;
    v.speed = 0;
    if (u.t >= 1) { d.uturn = null; v.heading = Math.atan2(Math.sin(v.heading), Math.cos(v.heading)); d.i++; }
    return false;
  }
  if (d.i >= d.wps.length) {
    v.speed = Math.max(0, v.speed - sp.accel * 2 * dt);
    return v.speed === 0;
  }
  // tezlik: burilish oldidan sekinlashadi, manzil va to‘siq oldida to‘xtaydi
  const rem = remaining(v, d);
  // manzilga 3 sm qolgan va to‘xtagan: oxirgi nuqtaga (tormoz formulasi aniq nolga yetmaydi)
  if (rem < 0.03 && v.speed < 0.05 && !d.wps.slice(d.i).some((q) => q.uturn)) {
    const last = d.wps[d.wps.length - 1];
    v.x = last.x; v.z = last.z; d.i = d.wps.length; v.speed = 0;
    return true;
  }
  let vmax = Math.min(sp.speed, Math.max(0.08, Math.sqrt(2 * sp.accel * Math.max(0, rem - 0.02))), limit);
  const w = d.wps[d.i];
  // aylanish nuqtasiga yetgan: to‘liq to‘xtaydi, keyin yarim aylana (sekin «sudralib» qolmaydi)
  if (w.uturn) vmax = 0;
  const nxt = d.wps[d.i + 1];
  if (nxt && !w.uturn) {
    const a1 = Math.atan2(w.z - v.z, w.x - v.x), a2 = Math.atan2(nxt.z - w.z, nxt.x - w.x);
    if (Math.abs(angDiff(a1, a2)) > 0.4 && Math.hypot(w.x - v.x, w.z - v.z) < 0.9) vmax = Math.min(vmax, sp.speed * 0.5);
  }
  if (v.speed < vmax) v.speed = Math.min(vmax, v.speed + sp.accel * dt);
  else v.speed = Math.max(vmax, v.speed - sp.accel * 2.5 * dt);
  // aylanish nuqtasida to‘xtadi — yarim aylana boshlanadi
  if (w.uturn && v.speed < 0.05) { v.speed = 0; d.uturn = { t: 0, from: { x: v.x, z: v.z, h: v.heading }, to: w }; return false; }
  let move = v.speed * dt;
  while (move > 1e-6 && d.i < d.wps.length) {
    const t = d.wps[d.i];
    if (t.uturn) {
      // yarim aylanaga tayyor: to‘xtagan bo‘lsa boshlanadi
      if (v.speed < 0.05) d.uturn = { t: 0, from: { x: v.x, z: v.z, h: v.heading }, to: t };
      break;
    }
    const dx = t.x - v.x, dz = t.z - v.z, L = Math.hypot(dx, dz);
    if (L <= move) { v.x = t.x; v.z = t.z; move -= L; d.i++; v.wheel += L / sp.wheelR; continue; }
    v.x += (dx / L) * move; v.z += (dz / L) * move;
    v.wheel += move / sp.wheelR;
    const want = Math.atan2(dz, dx);
    // silliq burilish: tana yo‘nalishi tezlikka mos sur’atda yo‘nalishga yetadi
    const turn = Math.max(1.5, v.speed * 5) * dt;
    const diff = angDiff(v.heading, want);
    v.heading += Math.max(-turn, Math.min(turn, diff));
    move = 0;
  }
  return d.i >= d.wps.length && v.speed < 0.01;
}

/** Transportning old/orqa chegarasi yo‘nalish bo‘ylab (darvoza bandligini aniqlash uchun) */
export function bodyPoints(v: VehicleState): { x: number; z: number }[] {
  const L = VEHICLE_SPECS[v.kind].length / 2;
  const hx = Math.cos(v.heading), hz = Math.sin(v.heading);
  return [{ x: v.x + hx * L, z: v.z + hz * L }, { x: v.x, z: v.z }, { x: v.x - hx * L, z: v.z - hz * L }];
}

/** Boshlang‘ich yo‘nalish katakdan keyingisiga */
export function dirIndex(a: Cell, b: Cell): number {
  const d = dirOf(a, b);
  return DIR4.findIndex((q) => q.x === d.x && q.z === d.z);
}

/** Transport turgan katak (yo‘l grafigida eng yaqin) */
export function cellOf(v: { x: number; z: number }, g: RoadGraph): Cell {
  const c = { x: Math.floor(v.x), z: Math.floor(v.z) };
  if (g.has(c.x, c.z)) return c;
  let best = c, bd = Infinity;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const q = { x: c.x + dx, z: c.z + dz };
    if (!g.has(q.x, q.z)) continue;
    const dd = Math.hypot(q.x + 0.5 - v.x, q.z + 0.5 - v.z);
    if (dd < bd) { bd = dd; best = q; }
  }
  return best;
}

/** Yo‘nalish indeksi transport burchagidan */
export function headingDir(h: number): number {
  const x = Math.cos(h), z = Math.sin(h);
  if (Math.abs(x) > Math.abs(z)) return x > 0 ? 1 : 3;
  return z > 0 ? 2 : 0;
}
