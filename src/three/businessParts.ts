import * as THREE from 'three';
import { blob, Builder, glassMat, mat, wallMat } from './builder';
import { carvedTexture, cowHideTexture, signTexture, stripeTexture, tileTexture, type SignSpec } from './textures';

/**
 * Biznes binolari uchun qayta ishlatiladigan hajmli detallar.
 * O‘lchamlar katakda (1 = 10 m), old tomon +Z, model markazi footprint markazida, yer sathi y = 0.
 * Barcha detallar footprint ichida qoladi (devor-panjara chetdan EDGE ichkarida).
 */
export type Face = 'front' | 'back' | 'left' | 'right';
export interface Gate { face: Face; at: number; width: number }

/** Uchastka asosining (krem tosh poydevor) balandligi — barcha bino va bezaklar shu sathda turadi. */
export const Y0 = 0.06;
export const EDGE = 0.06;

export const P = {
  wall: '#efe2c8', wall2: '#e7d5b5', base: '#e2cfad', cap: '#f4ead7', iron: '#24272c',
  roof: '#62749a', roof2: '#566788', roofGray: '#7d8594', paving: '#d9d1c2', pavingLight: '#e6dfd1',
  asphalt: '#73767c', lineY: '#e8c33a', bed: '#6aa346', soil: '#8f6c49', wood: '#9c6b3d', woodDark: '#6b4425',
  red: '#cf3a31', green: '#3d8a48', steel: '#a8b0b8', steelDark: '#7e868f', yellow: '#efc01f', glassTint: '#cfe7ef',
};

const shared = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = shared.get(key) as T | undefined;
  if (!m) {
    m = make();
    shared.set(key, m);
  }
  return m;
}

/** Shaffof shisha (issiqxona, soyabon). Soya tashlamaydi — modelFactory userData.noShadow ni o‘qiydi. */
export function clearGlass(tint = P.glassTint, opacity = 0.38) {
  return cached(`clear:${tint}:${opacity}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity, roughness: 0.08, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    m.userData.noShadow = true;
    return m;
  });
}

export function signMat(spec: SignSpec, aspect: number) {
  return cached('sign:' + JSON.stringify(spec) + aspect.toFixed(2), () => {
    const m = new THREE.MeshStandardMaterial({ map: signTexture(spec, aspect), roughness: 0.55, metalness: 0.05 });
    if (!spec.bg) {
      m.transparent = true;
      m.alphaTest = 0.4;
      m.userData.noShadow = true;
    }
    return m;
  });
}

export function stripeMat(a: string, c: string, n = 8) {
  return cached(`stripe:${a}:${c}:${n}`, () => new THREE.MeshStandardMaterial({ map: stripeTexture(a, c, n), roughness: 0.8 }));
}

export function tileMat(rep: [number, number] = [1, 1]) {
  return cached('tile:' + rep.join('x'), () => {
    const t = tileTexture().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.05 });
  });
}

export function carvedMat() {
  return cached('carved', () => new THREE.MeshStandardMaterial({ map: carvedTexture(), roughness: 0.7 }));
}

/** Deterministik tasodif (har safar bir xil model). */
export function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Tomon bo‘yicha joylashuv: t — tomon bo‘ylab, out — devordan tashqariga. */
export function onFace(face: Face, W: number, D: number, cx: number, cz: number, t: number, out = 0) {
  const ry = face === 'front' ? 0 : face === 'back' ? Math.PI : face === 'right' ? Math.PI / 2 : -Math.PI / 2;
  const off = (face === 'front' || face === 'back' ? D / 2 : W / 2) + out;
  const c = Math.cos(ry), s = Math.sin(ry);
  return { x: cx + t * c + off * s, z: cz - t * s + off * c, ry };
}

/** Geometriyani avval X atrofida qiyshaytirib, keyin Y bo‘yicha burib qo‘shadi. */
export function addTilted(b: Builder, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry: number, rx: number) {
  geo.rotateX(rx);
  return b.add(geo, m, x, y, z, ry);
}

// ---------------- uchastka: poydevor, devor-panjara, darvoza ----------------

/**
 * Krem tosh poydevor, past devor + ustunlar + qora temir panjara (yoki yog‘och to‘siq), darvozalar.
 * Hammasi footprint ichida.
 */
export function compound(b: Builder, w: number, d: number, o: { gates: Gate[]; wood?: boolean; ground?: string; lush?: boolean; stone?: string; cap?: string; base?: string }) {
  plot.hw = w / 2;
  plot.hd = d / 2;
  fence.stone = o.stone ?? P.base;
  fence.cap = o.cap ?? P.cap;
  const hw = w / 2 - EDGE, hd = d / 2 - EDGE;
  b.box(2 * hw + 0.04, Y0, 2 * hd + 0.04, mat(o.base ?? P.base, { rough: 0.9 }), 0, 0, 0);
  b.box(2 * hw - 0.04, 0.004, 2 * hd - 0.04, mat(o.ground ?? P.paving, { rough: 0.95 }), 0, Y0 - 0.002, 0);
  for (const face of ['front', 'back', 'left', 'right'] as Face[]) {
    const along = face === 'front' || face === 'back';
    const L = along ? 2 * hw : 2 * hd;
    const gates = o.gates.filter((g) => g.face === face).sort((a, c) => a.at - c.at);
    let start = -L / 2;
    const runs: [number, number][] = [];
    for (const g of gates) {
      runs.push([start, g.at - g.width / 2]);
      start = g.at + g.width / 2;
    }
    runs.push([start, L / 2]);
    const at = (t: number) => (face === 'front' ? [t, hd] : face === 'back' ? [t, -hd] : face === 'left' ? [-hw, t] : [hw, t]) as [number, number];
    for (const [a, c] of runs) if (c - a > 0.02) fenceRun(b, along, at, a, c, !!o.wood);
    // devor bo‘yidagi zich gulzor (rasmlardagi kabi), darvozalar ochiq qoladi
    if (o.lush !== false) {
      for (const [a, c] of runs) {
        const a2 = Math.max(a, -L / 2 + 0.1), c2 = Math.min(c, L / 2 - 0.1);
        if (c2 - a2 < 0.12) continue;
        const [bx, bz] = at((a2 + c2) / 2);
        const inX = face === 'left' ? 0.1 : face === 'right' ? -0.1 : 0;
        const inZ = face === 'front' ? -0.1 : face === 'back' ? 0.1 : 0;
        bed(b, bx + inX, bz + inZ, c2 - a2, along, Math.round((a2 + 7) * 13) + face.length, 0.12, true);
      }
    }
    for (const g of gates) gateRun(b, along, at, g.at - g.width / 2, g.at + g.width / 2, !!o.wood);
  }
}

/** Joriy uchastka to‘sig‘i ranglari (compound() o‘rnatadi). */
const fence = { stone: P.base, cap: P.cap };

function fenceRun(b: Builder, along: boolean, at: (t: number) => [number, number], a: number, c: number, wood: boolean) {
  const len = c - a, mid = (a + c) / 2;
  const [mx, mz] = at(mid);
  const stone = mat(fence.stone, { rough: 0.85 });
  const capM = mat(fence.cap, { rough: 0.6 });
  const rail = wood ? mat(P.wood, { rough: 0.8 }) : mat(P.iron, { rough: 0.45, metal: 0.6 });
  const bx = (l: number, h: number, th: number, m: THREE.Material, x: number, y: number, z: number) =>
    b.box(along ? l : th, h, along ? th : l, m, x, y, z);
  bx(len, 0.07, 0.06, stone, mx, Y0, mz);
  bx(len, 0.012, 0.075, capM, mx, Y0 + 0.07, mz);
  const n = Math.max(1, Math.ceil(len / 0.55));
  for (let i = 0; i <= n; i++) {
    const [px, pz] = at(a + (len * i) / n);
    b.box(0.075, 0.18, 0.075, stone, px, Y0, pz);
    b.box(0.095, 0.022, 0.095, capM, px, Y0 + 0.18, pz);
  }
  if (wood) {
    for (const y of [0.11, 0.15]) bx(len, 0.018, 0.014, rail, mx, Y0 + y, mz);
    return;
  }
  bx(len, 0.01, 0.012, rail, mx, Y0 + 0.155, mz);
  bx(len, 0.008, 0.01, rail, mx, Y0 + 0.09, mz);
  const bars = Math.floor(len / 0.045);
  for (let i = 1; i < bars; i++) {
    const [px, pz] = at(a + (len * i) / bars);
    b.box(0.008, 0.075, 0.008, rail, px, Y0 + 0.082, pz);
  }
}

function gateRun(b: Builder, along: boolean, at: (t: number) => [number, number], a: number, c: number, wood: boolean) {
  const len = c - a, mid = (a + c) / 2;
  const iron = wood ? mat(P.woodDark, { rough: 0.8 }) : mat(P.iron, { rough: 0.45, metal: 0.6 });
  const stone = mat(fence.stone, { rough: 0.85 });
  const [mx, mz] = at(mid);
  for (const t of [a, c]) {
    const [px, pz] = at(t);
    b.box(0.09, 0.21, 0.09, stone, px, Y0, pz);
    b.box(0.11, 0.024, 0.11, mat(fence.cap), px, Y0 + 0.21, pz);
    b.add(new THREE.SphereGeometry(0.018, 8, 6), mat('#f6d27a', { emissive: '#f0b545', rough: 0.3 }), px, Y0 + 0.255, pz);
  }
  b.box(along ? len : 0.012, 0.012, along ? 0.012 : len, iron, mx, Y0 + 0.165, mz);
  b.box(along ? len : 0.012, 0.01, along ? 0.012 : len, iron, mx, Y0 + 0.02, mz);
  const bars = Math.max(2, Math.floor(len / 0.035));
  for (let i = 1; i < bars; i++) {
    const [px, pz] = at(a + (len * i) / bars);
    b.box(0.007, 0.15, 0.007, iron, px, Y0 + 0.02, pz);
  }
}

// ---------------- o‘simliklar ----------------

const FOLIAGE = ['#5d9a3e', '#6eaa46', '#4f8a37', '#7cb64e'];

/**
 * Daraxt: Nest One / Hilton va shahar bezagidagi kabi rasmli daraxtlar (Builder.tree/cypress — foydalanuvchi bergan
 * rasmlardan qirqilgan sprite). Bino o‘zi hajmli; daraxtlar shahar qolgan qismi bilan bir xil ko‘rinadi.
 */
export function tree(b: Builder, x: number, z: number, s = 1, kind: 'round' | 'cypress' | 'blossom' | 'fruit' = 'round', _seed = 1) {
  const k = kind === 'cypress' ? s * 0.85 : s * (kind === 'fruit' ? 0.58 : 0.7);
  // sprite toji (Builder.tree/cypress o‘lchamlari) footprint ichida qolsin
  const half = kind === 'cypress' ? (0.8 * 0.95 * k * 0.325) / 2 : (0.85 * 1.05 * k * 0.814) / 2;
  const cx = Math.max(-plot.hw + half + 0.01, Math.min(plot.hw - half - 0.01, x));
  const cz = Math.max(-plot.hd + half + 0.01, Math.min(plot.hd - half - 0.01, z));
  if (kind === 'cypress') b.cypress(cx, cz, k, Y0);
  else b.tree(cx, cz, k, Y0, kind === 'blossom');
}

/** Joriy uchastka yarim o‘lchamlari (compound() yoki setPlot() o‘rnatadi) — daraxt toji chetdan chiqmasligi uchun. */
const plot = { hw: Infinity, hd: Infinity };

/** To‘siqsiz uchastkalar uchun (ta’lim binolari plaza()) daraxt chegarasini o‘rnatadi. */
export function setPlot(w: number, d: number) {
  plot.hw = w / 2;
  plot.hd = d / 2;
}

const FLOWERS = ['#e0558f', '#f2c94c', '#ffffff', '#e86a5a', '#c77ddb'];

/** Gulzor tasmasi: mulcha to‘shak, rasmli butalar, gullagan butachalar va mayda gullar. */
export function bed(b: Builder, x: number, z: number, len: number, alongX: boolean, seed = 1, wdt = 0.12, lush = false) {
  b.box(alongX ? len : wdt, 0.025, alongX ? wdt : len, mat('#5b4a3a', { rough: 0.98 }), x, Y0, z);
  const r = rng(seed * 97 + 13);
  const step = lush ? 0.1 : 0.13;
  const n = Math.max(1, Math.floor(len / step));
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (len * (i + 0.5)) / n;
    const off = (r() - 0.5) * wdt * 0.4;
    const px = alongX ? x + t : x + off;
    const pz = alongX ? z + off : z + t;
    const roll = r();
    if (roll < 0.22) b.tree(px, pz, 0.15 + r() * 0.05, Y0 + 0.02, true);
    else b.bush(px, pz, 0.55 + r() * 0.25, undefined, Y0 + 0.02);
    if (r() < 0.55) {
      const fx = px + (alongX ? (r() - 0.5) * step : (r() - 0.5) * wdt * 0.7);
      const fz = pz + (alongX ? (r() - 0.5) * wdt * 0.7 : (r() - 0.5) * step);
      b.add(blob(0.017, i + seed, 1), mat(FLOWERS[(i + seed) % FLOWERS.length], { rough: 0.9 }), fx, Y0 + 0.04, fz);
    }
  }
}

/** Gul tuvak (vaza shakli). */
export function pot(b: Builder, x: number, z: number, color = '#2f6fb5', s = 1, plant = true) {
  const pts = [[0, 0], [0.022, 0], [0.03, 0.02], [0.026, 0.045], [0.018, 0.058], [0.02, 0.064]].map(([u, v]) => new THREE.Vector2(u * s, v * s));
  b.add(new THREE.LatheGeometry(pts, 10), mat(color, { rough: 0.35 }), x, Y0, z);
  if (plant) b.add(blob(0.03 * s, Math.round(x * 31 + z * 17), 1), mat(FOLIAGE[1], { rough: 0.95 }), x, Y0 + 0.085 * s, z);
}

// ---------------- bino qismlari ----------------

export interface BlockOpts {
  wall?: string;
  floors?: number;
  faces?: Face[];
  bay?: number;
  winW?: number;
  winH?: number;
  frame?: string;
  warm?: boolean;
  skip?: { face: Face; at: number; width: number }[];
  roof?: string;
  parapet?: string;
  ac?: number;
  seed?: number;
  /** Sokol rangi (null — sokolsiz) */
  plinth?: string | null;
  muntin?: boolean;
}

/** Tekis tomli bino bloki: 3D derazalar, parapet, tom qatlami, konditsionerlar. */
export function block(b: Builder, W: number, H: number, D: number, cx: number, cz: number, o: BlockOpts = {}, y = Y0) {
  b.building(W, H, D, {
    wall: o.wall ?? P.wall, floors: o.floors ?? 1, faces: o.faces ?? ['front', 'back', 'left', 'right'], bay: o.bay ?? 0.32,
    winW: o.winW ?? 0.13, winH: o.winH, frame: o.frame ?? '#3a3f46', warm: o.warm ?? true, skip: o.skip,
    roof: null, cornice: null, plinth: o.plinth === undefined ? '#d4c3a3' : o.plinth, muntin: o.muntin ?? false, sill: false,
  }, cx, y, cz);
  flatRoof(b, W, D, cx, y + H, cz, o.roof ?? P.roof, o.parapet ?? P.cap);
  if (o.ac) acUnits(b, W, D, cx, y + H, cz, o.ac, o.seed ?? 3);
}

export function flatRoof(b: Builder, W: number, D: number, cx: number, y: number, cz: number, color = P.roof, parapet = P.cap) {
  const pm = mat(parapet, { rough: 0.7 });
  b.box(W - 0.04, 0.012, D - 0.04, mat(color, { rough: 0.75 }), cx, y, cz);
  const seam = mat(shade(color, 1.12), { rough: 0.7 });
  const n = Math.max(2, Math.floor(W / 0.16));
  for (let i = 1; i < n; i++) b.box(0.006, 0.006, D - 0.08, seam, cx - W / 2 + (W * i) / n, y + 0.012, cz);
  b.box(W + 0.01, 0.045, 0.03, pm, cx, y - 0.005, cz + D / 2 - 0.01);
  b.box(W + 0.01, 0.045, 0.03, pm, cx, y - 0.005, cz - D / 2 + 0.01);
  b.box(0.03, 0.045, D, pm, cx - W / 2 + 0.01, y - 0.005, cz);
  b.box(0.03, 0.045, D, pm, cx + W / 2 - 0.01, y - 0.005, cz);
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
}

export function acUnit(b: Builder, x: number, y: number, z: number, s = 1) {
  b.rbox(0.12 * s, 0.07 * s, 0.1 * s, mat('#cfd4d9', { rough: 0.5, metal: 0.2 }), x, y, z, 0.006);
  b.cyl(0.033 * s, 0.033 * s, 0.006, mat('#3d434a', { rough: 0.5 }), x, y + 0.07 * s, z, 12);
}

export function acUnits(b: Builder, W: number, D: number, cx: number, y: number, cz: number, n: number, seed = 3) {
  const r = rng(seed * 31 + 7);
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * (W - 0.3);
    const z = cz + (r() - 0.5) * (D - 0.3);
    acUnit(b, x, y + 0.012, z, 0.8 + r() * 0.5);
  }
}

/** Katta vitrina: ramka, oyna, ustunchalar. y — pastki sath. */
export function shopfront(b: Builder, face: Face, W: number, D: number, cx: number, y: number, cz: number, t: number, gw: number, gh: number, o: { frame?: string; mull?: number; warm?: boolean } = {}) {
  const fm = mat(o.frame ?? '#2b2f36', { rough: 0.45, metal: 0.4 });
  let p = onFace(face, W, D, cx, cz, t, 0.006);
  b.add(new THREE.BoxGeometry(gw + 0.03, gh + 0.03, 0.014), fm, p.x, y + gh / 2, p.z, p.ry);
  p = onFace(face, W, D, cx, cz, t, 0.0145);
  b.add(new THREE.PlaneGeometry(gw, gh), glassMat(o.warm ?? true), p.x, y + gh / 2, p.z, p.ry);
  const n = o.mull ?? Math.max(1, Math.round(gw / 0.2));
  for (let i = 1; i < n; i++) {
    const q = onFace(face, W, D, cx, cz, t - gw / 2 + (gw * i) / n, 0.018);
    b.add(new THREE.BoxGeometry(0.012, gh, 0.008), fm, q.x, y + gh / 2, q.z, q.ry);
  }
  const q = onFace(face, W, D, cx, cz, t, 0.018);
  b.add(new THREE.BoxGeometry(gw, 0.01, 0.008), fm, q.x, y + gh * 0.82, q.z, q.ry);
}

/** Lavha (yozuv + logo). backing — lavha qutisi rangi; null bo‘lsa harflar to‘g‘ridan-to‘g‘ri devorda. */
export function sign(b: Builder, face: Face, W: number, D: number, cx: number, y: number, cz: number, t: number, sw: number, sh: number, spec: SignSpec, backing: string | null = null) {
  if (backing) {
    const p = onFace(face, W, D, cx, cz, t, 0.012);
    b.add(new THREE.BoxGeometry(sw + 0.02, sh + 0.02, 0.024), mat(backing, { rough: 0.6 }), p.x, y + sh / 2, p.z, p.ry);
  }
  const p = onFace(face, W, D, cx, cz, t, backing ? 0.0255 : 0.008);
  b.add(new THREE.PlaneGeometry(sw, sh), signMat(spec, sw / sh), p.x, y + sh / 2, p.z, p.ry);
}

/** Erkin turuvchi lavha (masalan, darvoza oldidagi ustun). */
export function signPost(b: Builder, x: number, z: number, ry: number, spec: SignSpec, sw = 0.12, sh = 0.18, pole = '#cf3a31') {
  b.box(sw + 0.02, sh + 0.04, 0.04, mat(pole, { rough: 0.6 }), x, Y0, z, ry);
  const c = Math.cos(ry), s = Math.sin(ry);
  b.add(new THREE.PlaneGeometry(sw, sh * 0.7), signMat(spec, sw / (sh * 0.7)), x + 0.021 * s, Y0 + sh * 0.6, z + 0.021 * c, ry);
}

/** Qiya soyabon (devorga ilingan). */
export function awning(b: Builder, face: Face, W: number, D: number, cx: number, y: number, cz: number, t: number, aw: number, depth: number, m: THREE.Material, tilt = 0.32, posts?: string) {
  const p = onFace(face, W, D, cx, cz, t, 0);
  const g = new THREE.BoxGeometry(aw, 0.014, depth);
  g.translate(0, 0, depth / 2);
  addTilted(b, g, m, p.x, y, p.z, p.ry, tilt);
  if (posts) {
    const h = y - Y0 - Math.sin(tilt) * depth;
    for (const k of [-0.5, 0.5]) {
      const q = onFace(face, W, D, cx, cz, t + k * (aw - 0.04), depth * Math.cos(tilt) - 0.02);
      b.cyl(0.01, 0.01, h, mat(posts, { rough: 0.5, metal: 0.3 }), q.x, Y0, q.z, 8);
    }
  }
}

/** Ko‘tarma (roller) darvoza. */
export function rollerDoor(b: Builder, face: Face, W: number, D: number, cx: number, y: number, cz: number, t: number, dw = 0.2, dh = 0.22) {
  const p = onFace(face, W, D, cx, cz, t, 0.006);
  b.add(new THREE.BoxGeometry(dw + 0.03, dh + 0.02, 0.012), mat('#6d737a', { rough: 0.5, metal: 0.4 }), p.x, y + dh / 2 + 0.01, p.z, p.ry);
  const q = onFace(face, W, D, cx, cz, t, 0.0125);
  b.add(new THREE.PlaneGeometry(dw, dh), mat('#a9afb6', { rough: 0.45, metal: 0.5 }), q.x, y + dh / 2, q.z, q.ry);
  for (let i = 1; i < 6; i++) {
    const r = onFace(face, W, D, cx, cz, t, 0.014);
    b.add(new THREE.BoxGeometry(dw, 0.004, 0.003), mat('#8a9097', { rough: 0.5 }), r.x, y + (dh * i) / 6, r.z, r.ry);
  }
  for (const k of [-1, 1]) {
    const r = onFace(face, W, D, cx, cz, t + k * (dw / 2 + 0.03), 0.02);
    b.box(0.018, 0.08, 0.018, mat(P.yellow, { rough: 0.5 }), r.x, Y0, r.z);
  }
}

/** Ustunli ayvon / soyabonli maydon: tekis yoki qiya tom, ustunlar. */
export function canopy(b: Builder, x: number, z: number, w: number, d: number, h: number, roof: THREE.Material, post: THREE.Material, o: { slope?: number; postsAlongFront?: number } = {}) {
  const n = Math.max(2, o.postsAlongFront ?? Math.round(w / 0.45) + 1);
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + 0.03 + ((w - 0.06) * i) / (n - 1);
    b.box(0.025, h, 0.025, post, px, Y0, z + d / 2 - 0.03);
    b.box(0.025, h, 0.025, post, px, Y0, z - d / 2 + 0.03);
  }
  const g = new THREE.BoxGeometry(w + 0.04, 0.018, d + 0.04);
  addTilted(b, g, roof, x, Y0 + h + 0.01, z, 0, o.slope ?? 0);
}

/** Yog‘och pergola (to‘sinlar). */
export function pergola(b: Builder, x: number, z: number, w: number, d: number, h: number, y = Y0) {
  const wood = mat(P.wood, { rough: 0.75 });
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.box(0.03, h, 0.03, wood, x + px * (w / 2 - 0.02), y, z + pz * (d / 2 - 0.02));
  b.box(w, 0.025, 0.03, wood, x, y + h, z + d / 2 - 0.02);
  b.box(w, 0.025, 0.03, wood, x, y + h, z - d / 2 + 0.02);
  const n = Math.max(3, Math.round(w / 0.06));
  for (let i = 0; i < n; i++) b.box(0.014, 0.016, d + 0.04, wood, x - w / 2 + 0.02 + ((w - 0.04) * i) / (n - 1), y + h + 0.025, z);
}

/** Majolika portal (ravoq shaklidagi yog‘och eshik bilan). */
export function portal(b: Builder, face: Face, W: number, D: number, cx: number, y: number, cz: number, t: number, pw: number, ph: number, label?: SignSpec) {
  let p = onFace(face, W, D, cx, cz, t, 0.02);
  b.add(new THREE.BoxGeometry(pw, ph, 0.04), tileMat([2, 3]), p.x, y + ph / 2, p.z, p.ry);
  p = onFace(face, W, D, cx, cz, t, 0.041);
  const dw = pw * 0.48, dh = ph * 0.62;
  b.add(new THREE.PlaneGeometry(dw, dh), mat('#7a4a26', { rough: 0.6 }), p.x, y + dh / 2, p.z, p.ry);
  const arch = new THREE.CircleGeometry(dw / 2, 16, 0, Math.PI);
  b.add(arch, mat('#7a4a26', { rough: 0.6 }), p.x, y + dh, p.z, p.ry);
  const frame = new THREE.RingGeometry(dw / 2, dw / 2 + 0.014, 16, 1, 0, Math.PI);
  p = onFace(face, W, D, cx, cz, t, 0.043);
  b.add(frame, mat('#f1e3c3', { rough: 0.5 }), p.x, y + dh, p.z, p.ry);
  if (label) {
    const lw = pw * 0.86, lh = ph * 0.15;
    p = onFace(face, W, D, cx, cz, t, 0.044);
    b.add(new THREE.PlaneGeometry(lw, lh), signMat(label, lw / lh), p.x, y + ph - lh * 0.75, p.z, p.ry);
  }
}

/** O‘ymakor yog‘och panel (devorga). */
export function carvedPanel(b: Builder, face: Face, W: number, D: number, cx: number, y: number, cz: number, t: number, pw: number, ph: number) {
  const p = onFace(face, W, D, cx, cz, t, 0.01);
  b.add(new THREE.BoxGeometry(pw, ph, 0.012), carvedMat(), p.x, y + ph / 2, p.z, p.ry);
}

/** Vertikal rangli tasma (masalan, qizil yoki yog‘och reykalar). */
export function stripe(b: Builder, face: Face, W: number, D: number, cx: number, y: number, cz: number, t: number, sw: number, sh: number, color: string, wood = false) {
  const p = onFace(face, W, D, cx, cz, t, 0.008);
  b.add(new THREE.BoxGeometry(sw, sh, 0.016), mat(color, { rough: wood ? 0.7 : 0.5 }), p.x, y + sh / 2, p.z, p.ry);
  if (wood) {
    const n = Math.max(2, Math.round(sw / 0.025));
    for (let i = 1; i < n; i++) {
      const q = onFace(face, W, D, cx, cz, t - sw / 2 + (sw * i) / n, 0.017);
      b.add(new THREE.BoxGeometry(0.004, sh, 0.004), mat('#6e4626'), q.x, y + sh / 2, q.z, q.ry);
    }
  }
}

// ---------------- transport va jihozlar (bezak) ----------------

/** Yuk mashinasi: old tomoni lokal +Z. logo — kuzov yon tomonlaridagi yozuv. */
export function truck(b: Builder, x: number, z: number, ry: number, o: { body?: string; cab?: string; stripe?: string; logo?: SignSpec; load?: string; open?: boolean } = {}) {
  const g = new Builder();
  const body = mat(o.body ?? '#f3f3f1', { rough: 0.5 });
  const cab = mat(o.cab ?? '#f3f3f1', { rough: 0.35, metal: 0.15 });
  g.box(0.15, 0.02, 0.44, mat('#3a3d42'), 0, 0.035, 0);
  if (o.open) {
    g.box(0.17, 0.03, 0.31, body, 0, 0.055, -0.06);
    if (o.load) for (let i = 0; i < 3; i++) g.box(0.13, 0.07, 0.08, mat(o.load, { rough: 0.85 }), 0, 0.085, -0.17 + i * 0.1);
  } else {
    g.rbox(0.17, 0.17, 0.31, body, 0, 0.055, -0.06, 0.008);
  }
  g.rbox(0.165, 0.13, 0.11, cab, 0, 0.05, 0.165, 0.02);
  g.box(0.15, 0.05, 0.004, mat('#2b3d52', { rough: 0.1, metal: 0.4 }), 0, 0.12, 0.221);
  for (const sx of [-1, 1]) g.box(0.004, 0.04, 0.06, mat('#2b3d52', { rough: 0.1, metal: 0.4 }), sx * 0.084, 0.125, 0.17);
  if (o.stripe) for (const sx of [-1, 1]) g.box(0.003, 0.02, 0.3, mat(o.stripe), sx * 0.086, 0.07, -0.06);
  if (o.logo && !o.open) {
    for (const sx of [-1, 1]) g.add(new THREE.PlaneGeometry(0.2, 0.08), signMat(o.logo, 2.5), sx * 0.0865, 0.15, -0.06, sx * Math.PI / 2);
  }
  const wheel = mat('#24262a', { rough: 0.8 });
  for (const wz of [-0.16, -0.05, 0.16]) for (const sx of [-1, 1]) g.add(new THREE.CylinderGeometry(0.034, 0.034, 0.026, 12), wheel, sx * 0.075, 0.034, wz, 0, 0, Math.PI / 2);
  b.mergeFrom(g, x, z, ry, Y0);
}

export function forklift(b: Builder, x: number, z: number, ry = 0) {
  const g = new Builder();
  const y = mat(P.yellow, { rough: 0.45 });
  const dark = mat('#2b2e33', { rough: 0.5 });
  g.rbox(0.07, 0.05, 0.1, y, 0, 0.018, 0, 0.008);
  g.box(0.06, 0.045, 0.03, dark, 0, 0.068, -0.03);
  for (const sx of [-1, 1]) {
    g.box(0.006, 0.09, 0.006, dark, sx * 0.028, 0.068, -0.045);
    g.box(0.006, 0.09, 0.006, dark, sx * 0.028, 0.068, 0.03);
    g.box(0.008, 0.13, 0.008, dark, sx * 0.022, 0.018, 0.055);
    g.box(0.008, 0.004, 0.07, dark, sx * 0.018, 0.02, 0.09);
  }
  g.box(0.07, 0.006, 0.08, dark, 0, 0.158, -0.008);
  for (const wz of [-0.03, 0.035]) for (const sx of [-1, 1]) g.add(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 10), dark, sx * 0.038, 0.018, wz, 0, 0, Math.PI / 2);
  b.mergeFrom(g, x, z, ry, Y0);
}

/** Kran yuk mashinasi (Murad Buildings). */
export function craneTruck(b: Builder, x: number, z: number, ry = 0) {
  const g = new Builder();
  const y = mat(P.yellow, { rough: 0.45 });
  const dark = mat('#2b2e33', { rough: 0.5 });
  g.rbox(0.14, 0.05, 0.36, y, 0, 0.035, 0, 0.01);
  g.rbox(0.12, 0.08, 0.1, y, 0, 0.08, 0.12, 0.012);
  g.box(0.1, 0.035, 0.004, mat('#2b3d52', { rough: 0.1, metal: 0.4 }), 0, 0.13, 0.171);
  g.cyl(0.035, 0.04, 0.05, dark, 0, 0.085, -0.08, 12);
  const boom = new THREE.BoxGeometry(0.035, 0.035, 0.42);
  boom.translate(0, 0, 0.21);
  boom.rotateX(-0.75);
  g.add(boom, y, 0, 0.14, -0.08);
  g.box(0.004, 0.12, 0.004, dark, 0, 0.3, 0.17);
  g.box(0.02, 0.025, 0.02, dark, 0, 0.29, 0.17);
  for (const wz of [-0.12, 0.0, 0.13]) for (const sx of [-1, 1]) g.add(new THREE.CylinderGeometry(0.03, 0.03, 0.024, 12), dark, sx * 0.07, 0.03, wz, 0, 0, Math.PI / 2);
  b.mergeFrom(g, x, z, ry, Y0);
}

/** Yengil mashina (poydevor sathida). */
export function car(b: Builder, x: number, z: number, color: string, ry = 0) {
  const g = new Builder();
  g.car(0, 0, color);
  b.mergeFrom(g, x, z, ry, Y0);
}

/** Palletdagi yuk. */
export function pallet(b: Builder, x: number, z: number, w: number, h: number, d: number, color: string, ry = 0, y = Y0) {
  b.box(w + 0.01, 0.018, d + 0.01, mat('#b98a55', { rough: 0.85 }), x, y, z, ry);
  b.box(w, h, d, mat(color, { rough: 0.85 }), x, y + 0.018, z, ry);
}

/** G‘isht / quti kabi bo‘lingan stack (ko‘rinadigan choklar bilan). */
export function brickStack(b: Builder, x: number, z: number, w: number, h: number, d: number, color = '#c8643c', ry = 0) {
  pallet(b, x, z, w, h, d, color, ry);
  const line = mat(shade(color, 0.75), { rough: 0.9 });
  for (let i = 1; i < 4; i++) b.box(w + 0.004, 0.004, d + 0.004, line, x, Y0 + 0.018 + (h * i) / 4, z, ry);
}

/** Uzun profil/quvur to‘plami. */
export function profileStack(b: Builder, x: number, z: number, len: number, alongX: boolean, color = '#c7ccd1', layers = 3) {
  const m = mat(color, { rough: 0.35, metal: 0.7 });
  for (let l = 0; l < layers; l++) for (let i = 0; i < 4; i++) {
    const off = (i - 1.5) * 0.026 + (l % 2) * 0.013;
    b.box(alongX ? len : 0.022, 0.022, alongX ? 0.022 : len, m, alongX ? x : x + off, Y0 + 0.02 + l * 0.023, alongX ? z + off : z);
  }
  for (const k of [-0.4, 0, 0.4]) b.box(alongX ? 0.02 : 0.14, 0.02, alongX ? 0.14 : 0.02, mat('#b98a55'), alongX ? x + k * len : x, Y0, alongX ? z : z + k * len);
}

export function dumpster(b: Builder, x: number, z: number, ry = 0, color = '#3d8a4a') {
  b.rbox(0.15, 0.085, 0.1, mat(color, { rough: 0.55 }), x, Y0, z, 0.008, ry);
  b.box(0.155, 0.01, 0.105, mat('#2c5f34', { rough: 0.6 }), x, Y0 + 0.085, z, ry);
}

/** Silos: oyoqlar, silindr, konus qopqoq, ixtiyoriy aylana panjara. */
export function silo(b: Builder, x: number, z: number, r: number, h: number, o: { legs?: number; rail?: string; color?: string; y?: number } = {}) {
  const y = o.y ?? Y0;
  const body = mat(o.color ?? '#e1e5e9', { rough: 0.28, metal: 0.4 });
  const legs = o.legs ?? 0;
  if (legs) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.box(0.014, legs, 0.014, mat(P.steelDark, { metal: 0.6, rough: 0.4 }), x + sx * r * 0.7, y, z + sz * r * 0.7);
    b.add(new THREE.ConeGeometry(r, r * 0.8, 20), body, x, y + legs - r * 0.2, z, 0, Math.PI);
  }
  b.cyl(r, r, h, body, x, y + legs, z, 24);
  for (let i = 1; i < 4; i++) b.cyl(r + 0.003, r + 0.003, 0.006, mat('#aab2ba', { metal: 0.45, rough: 0.35 }), x, y + legs + (h * i) / 4, z, 24);
  b.add(new THREE.ConeGeometry(r * 1.02, r * 0.55, 24), body, x, y + legs + h + r * 0.27, z);
  if (o.rail) {
    const rail = mat(o.rail, { rough: 0.5 });
    const ring = new THREE.TorusGeometry(r + 0.03, 0.006, 4, 24);
    ring.rotateX(Math.PI / 2);
    b.add(ring, rail, x, y + legs + h + 0.05, z);
    const ring2 = ring.clone();
    b.add(ring2, rail, x, y + legs + h, z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.box(0.006, 0.05, 0.006, rail, x + Math.cos(a) * (r + 0.03), y + legs + h, z + Math.sin(a) * (r + 0.03));
    }
    b.box(0.03, h + legs, 0.008, rail, x + r + 0.02, y, z);
  }
}

/** Havo tozalash/chang yig‘ish quvurlari (siklon). */
export function cyclone(b: Builder, x: number, z: number, h = 0.32, toWall?: { x: number; z: number; y: number }) {
  const m = mat('#c3c9cf', { rough: 0.3, metal: 0.75 });
  b.cyl(0.05, 0.05, h * 0.6, m, x, Y0 + h * 0.25, z, 16);
  b.add(new THREE.ConeGeometry(0.05, h * 0.25, 16), m, x, Y0 + h * 0.125, z, 0, Math.PI);
  b.cyl(0.014, 0.014, h * 0.25, m, x, Y0, z, 8);
  if (toWall) {
    const dx = toWall.x - x, dz = toWall.z - z;
    const len = Math.hypot(dx, dz);
    const g = new THREE.CylinderGeometry(0.022, 0.022, len, 10);
    g.rotateZ(Math.PI / 2);
    b.add(g, m, x + dx / 2, toWall.y, z + dz / 2, -Math.atan2(dz, dx));
    b.cyl(0.022, 0.022, toWall.y - (Y0 + h * 0.85), m, x, Y0 + h * 0.85, z, 10);
  }
}

/** G‘isht mo‘ri (halqalar bilan). */
export function chimney(b: Builder, x: number, z: number, r: number, h: number) {
  const brick = mat('#b9643f', { rough: 0.85 });
  b.cyl(r * 0.85, r, h, brick, x, Y0, z, 16);
  for (let i = 1; i < 6; i++) b.cyl(r * (1 - 0.15 * (i / 6)) + 0.006, r * (1 - 0.15 * (i / 6)) + 0.006, 0.012, mat('#d0d4d8', { metal: 0.5, rough: 0.4 }), x, Y0 + (h * i) / 6, z, 16);
  b.cyl(r * 0.9, r * 0.9, 0.03, brick, x, Y0 + h, z, 16);
  b.cyl(r * 0.6, r * 0.6, 0.032, mat('#2a2523'), x, Y0 + h + 0.001, z, 16);
}

/** Stol + stullar, ixtiyoriy soyabon. */
export function cafeTable(b: Builder, x: number, z: number, umbrella?: THREE.Material) {
  const dark = mat('#5b3b22', { rough: 0.6 });
  b.cyl(0.035, 0.035, 0.006, mat('#f2ece0'), x, Y0 + 0.055, z, 12);
  b.cyl(0.004, 0.004, 0.055, dark, x, Y0, z, 6);
  for (const a of [0, Math.PI]) {
    b.box(0.03, 0.006, 0.03, dark, x + Math.cos(a) * 0.055, Y0 + 0.035, z + Math.sin(a) * 0.055);
    b.box(0.03, 0.03, 0.004, dark, x + Math.cos(a) * 0.07, Y0 + 0.035, z + Math.sin(a) * 0.055, Math.PI / 2);
  }
  if (umbrella) {
    b.cyl(0.003, 0.003, 0.17, mat('#d8d0c4'), x, Y0, z, 6);
    b.add(new THREE.ConeGeometry(0.1, 0.04, 12), umbrella, x, Y0 + 0.17, z);
  }
}

/** Manekenda kiyim (rangli chopon/libos). */
export function mannequin(b: Builder, x: number, z: number, color: string, y = Y0) {
  b.cyl(0.004, 0.004, 0.02, mat('#2b2e33'), x, y, z, 6);
  b.cyl(0.012, 0.026, 0.085, mat(color, { rough: 0.7 }), x, y + 0.02, z, 10);
  b.add(new THREE.SphereGeometry(0.011, 8, 6), mat('#e8d8c4', { rough: 0.5 }), x, y + 0.118, z);
}

/** Golshtin sigir: dog‘li yumaloq tana, bosh, tumshuq, quloq, shox, oyoqlar, yelin va dum. Old tomoni +Z. */
export function cow(b: Builder, x: number, z: number, ry: number, _seed = 1, s = 1) {
  const g = new Builder();
  const hide = cached('cowhide', () => new THREE.MeshStandardMaterial({ map: cowHideTexture(), roughness: 0.8 }));
  const dark = mat('#1f1d1b', { rough: 0.8 });
  const pink = mat('#e8a9a0', { rough: 0.7 });
  const white = mat('#f6f3ec', { rough: 0.8 });
  const L = 0.15 * s, R = 0.034 * s, legH = 0.06 * s;
  const body = new THREE.CapsuleGeometry(R, L - 2 * R, 4, 12);
  body.rotateX(Math.PI / 2);
  body.scale(0.9, 1.05, 1);
  g.add(body, hide, 0, legH + R, 0);
  // bo‘yin va bosh (biroz pastga egilgan)
  const neck = new THREE.CylinderGeometry(R * 0.55, R * 0.75, 0.04 * s, 10);
  neck.rotateX(-0.9);
  g.add(neck, dark, 0, legH + R * 1.35, L / 2 - 0.004 * s);
  const head = new THREE.CapsuleGeometry(R * 0.5, 0.03 * s, 3, 10);
  head.rotateX(Math.PI / 2 + 0.5);
  g.add(head, dark, 0, legH + R * 1.15, L / 2 + 0.022 * s);
  g.add(new THREE.SphereGeometry(R * 0.42, 10, 8), pink, 0, legH + R * 0.62, L / 2 + 0.04 * s);
  g.add(new THREE.SphereGeometry(R * 0.28, 8, 6), white, 0, legH + R * 1.55, L / 2 + 0.02 * s);
  for (const sx of [-1, 1]) {
    const ear = new THREE.SphereGeometry(R * 0.28, 8, 6);
    ear.scale(1.6, 0.5, 0.9);
    g.add(ear, dark, sx * R * 0.62, legH + R * 1.65, L / 2 + 0.008 * s);
    const horn = new THREE.ConeGeometry(R * 0.1, R * 0.4, 6);
    horn.rotateZ(-sx * 0.9);
    g.add(horn, mat('#e8dcc4', { rough: 0.5 }), sx * R * 0.38, legH + R * 1.9, L / 2 + 0.012 * s);
  }
  // oyoqlar va tuyoqlar
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) {
    const px = lx * R * 0.5, pz = lz * (L / 2 - R * 0.9);
    g.cyl(R * 0.2, R * 0.24, legH + R * 0.4, lz > 0 && lx > 0 ? dark : white, px, 0.006 * s, pz, 8);
    g.cyl(R * 0.24, R * 0.26, 0.01 * s, dark, px, 0, pz, 8);
  }
  // yelin va dum
  g.add(new THREE.SphereGeometry(R * 0.38, 10, 8), pink, 0, legH + R * 0.15, -L / 2 + R * 1.3);
  const tail = new THREE.CylinderGeometry(0.0025 * s, 0.003 * s, 0.07 * s, 5);
  tail.rotateX(0.2);
  g.add(tail, white, 0, legH + R * 0.9, -L / 2 - 0.004 * s);
  g.add(new THREE.SphereGeometry(0.007 * s, 6, 4), dark, 0, legH + R * 0.2, -L / 2 - 0.01 * s);
  b.mergeFrom(g, x, z, ry, Y0);
}

/**
 * Issiqxona (varnet/1–4.png): baland oyna devorlar, ikki nishabli shisha tom, oq ramka to‘ri, tizma bo‘ylab shamollatgich
 * qopqoqlar va iliq chiroqlar; ichida qalin pomidor butalari (rasmli buta + qizil mevalar). Uzunligi Z bo‘ylab, eshigi +Z da.
 */
export function greenhouse(b: Builder, x: number, z: number, span: number, len: number, wallH: number, roofH: number) {
  const glass = clearGlass('#e4f3f8', 0.26);
  const frame = mat('#eef1f3', { rough: 0.35, metal: 0.3 });
  const y = Y0;
  b.box(span, 0.02, len, mat('#c9c2b4'), x, y, z);
  b.box(span + 0.02, 0.035, len + 0.02, mat('#d8d2c6', { rough: 0.8 }), x, y, z);
  for (const sx of [-1, 1]) b.add(new THREE.PlaneGeometry(len, wallH), glass, x + sx * span / 2, y + wallH / 2, z, Math.PI / 2);
  const tri = new THREE.Shape();
  tri.moveTo(-span / 2, 0); tri.lineTo(span / 2, 0); tri.lineTo(0, roofH); tri.closePath();
  for (const sz of [-1, 1]) {
    b.add(new THREE.PlaneGeometry(span, wallH), glass, x, y + wallH / 2, z + sz * len / 2);
    b.add(new THREE.ShapeGeometry(tri), glass, x, y + wallH, z + sz * len / 2);
    // uchidagi ramka: tik ustunlar va gorizontal to‘sin
    for (let i = 0; i <= 6; i++) b.box(0.01, wallH, 0.01, frame, x - span / 2 + (span * i) / 6, y, z + sz * len / 2);
    b.box(span, 0.01, 0.01, frame, x, y + wallH * 0.55, z + sz * len / 2);
  }
  // old eshik (ikki tabaqali)
  b.box(0.2, 0.24, 0.012, mat('#3a4048', { rough: 0.3, metal: 0.4 }), x, y + 0.02, z + len / 2 + 0.004);
  b.box(0.008, 0.24, 0.016, frame, x, y + 0.02, z + len / 2 + 0.006);
  const slope = Math.hypot(span / 2, roofH);
  const ang = Math.atan2(roofH, span / 2);
  for (const sx of [-1, 1]) {
    const g = new THREE.PlaneGeometry(slope, len);
    g.rotateX(-Math.PI / 2);
    g.rotateZ(sx * ang);
    b.add(g, glass, x + sx * span / 4, y + wallH + roofH / 2, z);
    // tom bo‘ylab to‘sinlar
    for (const k of [0.33, 0.66]) b.box(0.01, 0.01, len, frame, x + sx * (span / 2) * (1 - k), y + wallH + roofH * k, z);
    for (const k of [0.33, 0.66]) b.box(0.008, 0.008, len, frame, x + sx * span / 2, y + wallH * k, z);
  }
  // qovurg‘alar
  const n = Math.max(3, Math.round(len / 0.16));
  for (let i = 0; i <= n; i++) {
    const zz = z - len / 2 + (len * i) / n;
    for (const sx of [-1, 1]) {
      b.box(0.012, wallH, 0.012, frame, x + sx * span / 2, y, zz);
      const rib = new THREE.BoxGeometry(slope, 0.012, 0.012);
      rib.rotateZ(sx * ang);
      b.add(rib, frame, x + sx * span / 4, y + wallH + roofH / 2, zz);
    }
  }
  b.box(0.018, 0.02, len, frame, x, y + wallH + roofH - 0.01, z);
  for (const sx of [-1, 1]) b.box(0.016, 0.016, len, frame, x + sx * span / 2, y + wallH - 0.008, z);
  // tizmadagi shamollatgich qopqoqlar
  const ventM = mat('#d5dade', { rough: 0.4, metal: 0.3 });
  for (let i = 0; i < Math.floor(len / 0.55); i++) b.box(0.14, 0.03, 0.1, ventM, x, y + wallH + roofH - 0.005, z - len / 2 + 0.35 + i * 0.55);
  // iliq chiroqlar (tom ostida ikki qator)
  const lamp = cached('lamp-warm', () => new THREE.MeshBasicMaterial({ color: '#ffe3a0' }));
  for (let i = 0; i < Math.floor(len / 0.3); i++) for (const sx of [-1, 1]) b.add(new THREE.SphereGeometry(0.012, 6, 4), lamp, x + sx * span * 0.22, y + wallH + roofH * 0.35, z - len / 2 + 0.2 + i * 0.3);
  // ekin qatorlari: tuproq to‘shak, qalin butalar, qizil pomidorlar
  const soil = mat('#6e5640', { rough: 0.95 });
  const tomato = mat('#e0442f', { rough: 0.55 });
  const tomGeo = () => new THREE.IcosahedronGeometry(0.013, 0);
  const rows = Math.max(2, Math.floor(span / 0.2));
  const r = rng(Math.round(x * 100 + z * 10));
  for (let ri = 0; ri < rows; ri++) {
    const rx = x - span / 2 + (span * (ri + 0.5)) / rows;
    b.box(0.1, 0.03, len - 0.12, soil, rx, y + 0.02, z);
    for (let k = 0; k < Math.floor((len - 0.15) / 0.075); k++) {
      const zz = z - len / 2 + 0.11 + k * 0.075;
      b.bush(rx + (r() - 0.5) * 0.03, zz, 0.85 + r() * 0.3, undefined, y + 0.04);
      for (let t = 0; t < 2; t++) b.add(tomGeo(), tomato, rx + (r() < 0.5 ? -1 : 1) * (0.035 + r() * 0.015), y + 0.08 + r() * 0.08, zz + (r() - 0.5) * 0.05);
    }
  }
}

/** Lavha teksturasiga qisqa yo‘l. */
export function txt(text: string, color: string, size = 1, o: { serif?: boolean; italic?: boolean } = {}) {
  return { text, color, size, ...o };
}

export { wallMat };
