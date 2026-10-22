import * as THREE from 'three';
import { Builder, mat } from './builder';
import { compound, flatRoof, onFace, sign, tree, txt, Y0, type Face } from './businessParts';
import { archWindow, basic, bench, facePanel, glassBox, globeLamp, hvac, lawn, modernLamp, plaza, texMat } from './educationModels';
import { basinWaterTexture, curtainGlassTexture, emblemTexture, stoneTileTexture, uzFlagTexture } from './textures';
import type { Builder as BuilderT } from './builder';

/**
 * «Boshqaruv va moliya», «Shahar xizmatlari» va «Suv» bo‘limlaridagi 7 ta binoning hajmli generatorlari.
 * Har biri docs/boshqaruv-rasmlar/<tur>/1–4.png asosida alohida yasalgan (umumiy bino rangini almashtirish emas).
 * Koordinatalar: footprint markazi (0,0,0), old tomon (asosiy kirish, yozuv) +Z, 1 birlik = 1 katak (10 m).
 */
export type Recipe = (b: BuilderT, w: number, d: number) => void;

const cache = new Map<string, THREE.Material>();
function once<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) cache.set(key, (m = make()));
  return m;
}
const stone = (base: string) => texMat('stone:' + base, () => stoneTileTexture(base), { rough: 0.75 });
const blueGlass = () => texMat('civicGlass', () => curtainGlassTexture('#2f6fb0', false), { rough: 0.15, metal: 0.35 });
const skyGlass = () => texMat('civicSky', () => curtainGlassTexture('#3f86c9', true), { rough: 0.12, metal: 0.4 });

/** O‘zbekiston bayrog‘i ustunda (bayroq ikki tomondan ko‘rinadi). */
function flag(b: Builder, x: number, y: number, z: number, h = 0.5, ry = 0) {
  b.cyl(0.006, 0.008, h, mat('#c9ccd0', { metal: 0.6, rough: 0.3 }), x, y, z, 8);
  b.add(new THREE.SphereGeometry(0.01, 8, 6), mat('#d8b450', { metal: 0.6, rough: 0.3 }), x, y + h + 0.005, z);
  const m = once('flag', () => new THREE.MeshStandardMaterial({ map: uzFlagTexture(), side: THREE.DoubleSide, roughness: 0.7 }));
  const g = new THREE.PlaneGeometry(0.2, 0.1, 6, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + 0.1) * 18) * 0.008);
  g.translate(0.1, 0, 0);
  b.add(g, m, x + 0.006 * Math.cos(ry), y + h - 0.06, z, ry);
}

/** Gerb doirasi fasadda. */
function emblem(b: Builder, face: Face, W: number, D: number, cx: number, cz: number, t: number, y: number, r: number) {
  const m = once('emblem', () => new THREE.MeshStandardMaterial({ map: emblemTexture(), transparent: true, alphaTest: 0.3, roughness: 0.4, metalness: 0.3 }));
  const p = onFace(face, W, D, cx, cz, t, 0.012);
  b.add(new THREE.CircleGeometry(r, 24), m, p.x, y, p.z, p.ry);
}

/** Yuqoriga torayib boruvchi quti (Milliy bank minorasi). topScale — tepa/past nisbat. */
function taperBox(b: Builder, w: number, h: number, d: number, topScale: number, m: THREE.Material, x: number, y: number, z: number, uvCell = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) { p.setX(i, p.getX(i) * topScale); p.setZ(i, p.getZ(i) * topScale); }
  }
  if (uvCell) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(dims[f][0] / uvCell)), uv.getY(i) * Math.max(1, Math.round(dims[f][1] / uvCell)));
    }
  }
  g.computeVertexNormals();
  b.add(g, m, x, y + h / 2, z);
}

/** Zinapoya: n ta pog‘ona, old tomonga (+Z) tushadi; z0 — yuqori pog‘ona orqa cheti. */
function steps(b: Builder, cx: number, z0: number, w: number, n: number, depth: number, rise: number, color: string, y = Y0) {
  for (let k = 0; k < n; k++) b.box(w, rise * (n - k), depth, mat(color, { rough: 0.6 }), cx, y, z0 + depth * (k + 0.5));
}

/** Panjarali antenna minorasi. */
function latticeTower(b: Builder, x: number, y: number, z: number, h: number) {
  const m = mat('#9aa0a6', { metal: 0.6, rough: 0.35 });
  const r0 = 0.06, r1 = 0.02;
  const up = new THREE.Vector3(0, 1, 0);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = new THREE.Vector3(sx * r0, 0, sz * r0), c = new THREE.Vector3(sx * r1, h, sz * r1);
    const dir = c.clone().sub(a);
    const leg = new THREE.CylinderGeometry(0.004, 0.005, dir.length(), 4);
    leg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()));
    b.add(leg, m, x + (a.x + c.x) / 2, y + h / 2, z + (a.z + c.z) / 2);
  }
  for (let k = 1; k < 6; k++) {
    const r = r0 + (r1 - r0) * (k / 6);
    b.box(r * 2, 0.004, 0.004, m, x, y + (h * k) / 6, z + r);
    b.box(r * 2, 0.004, 0.004, m, x, y + (h * k) / 6, z - r);
    b.box(0.004, 0.004, r * 2, m, x + r, y + (h * k) / 6, z);
    b.box(0.004, 0.004, r * 2, m, x - r, y + (h * k) / 6, z);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.box(0.018, 0.06, 0.008, mat('#e6e6e2'), x + Math.cos(a) * 0.035, y + h * 0.85, z + Math.sin(a) * 0.035, -a);
  }
}

/** Fasad derazasi: ko‘k oyna (katakli), krem ramka. */
function win(b: Builder, face: Face, W: number, D: number, cx: number, cz: number, t: number, y: number, ww: number, wh: number, frame?: THREE.Material, cell = 0.06) {
  if (frame) facePanel(b, face, W, D, cx, cz, t, 0.004, ww + 0.03, wh + 0.03, y - 0.015, frame);
  facePanel(b, face, W, D, cx, cz, t, 0.008, ww, wh, y, blueGlass(), [Math.max(1, Math.round(ww / cell)), Math.max(1, Math.round(wh / cell))]);
}

/** Tik pilyastr (devordan chiqib turadi). */
function pilaster(b: Builder, face: Face, W: number, D: number, cx: number, cz: number, t: number, y: number, h: number, wd: number, m: THREE.Material, out = 0.02) {
  const p = onFace(face, W, D, cx, cz, t, out / 2);
  const along = face === 'front' || face === 'back';
  b.box(along ? wd : out, h, along ? out : wd, m, p.x, y, p.z);
}

// =========================== 1. Shahar hokimligi ===========================

/**
 * hokimlik/1–4.png: ikki-uch qavatli krem tosh bino, qizil granit sokol; oldinga chiqqan baland markaziy qism —
 * katta ko‘k oyna, o‘rtasida gerb, tepasida tilla «SHAHAR HOKIMLIGI» yozuvi; uning oldida to‘rt ustunli ayvon va
 * keng granit zinapoya. Qanotlarda baland tik oynalar va pilyastrlar, orqada kichik derazalar, quvurlar va xizmat
 * eshiklari. Tekis tomlar, konditsionerlar, markaziy tomda bayroq. Atrofda maysa, gulzorlar, past chiroqlar, daraxtlar.
 */
function hokimlik(b: Builder, w: number, d: number) {
  plaza(b, w, d, { chamfer: 0.45, top: '#d8d3c9', base: '#bdb8ae' });
  const st = stone('#ead9bd');
  const cream = mat('#efe3cc', { rough: 0.7 });
  const granite = mat('#8e4f42', { rough: 0.5 });
  const W = 2.9, D = 1.6, H = 0.78, cx = 0, cz = -0.45;
  glassBox(b, W, H, D, st, cx, Y0, cz, 0.14);
  b.box(W + 0.03, 0.07, D + 0.03, granite, cx, Y0, cz);
  b.box(W + 0.06, 0.04, D + 0.06, cream, cx, Y0 + H - 0.04, cz);
  flatRoof(b, W, D, cx, Y0 + H, cz, '#7c8088', '#eadcc2');
  // qanotlar: baland oynalar va pilyastrlar
  for (const t of [-1.2, -0.82, 0.82, 1.2]) win(b, 'front', W, D, cx, cz, t, Y0 + 0.1, 0.24, 0.6, cream, 0.08);
  for (const t of [-1.4, -1.01, -0.63, 0.63, 1.01, 1.4]) pilaster(b, 'front', W, D, cx, cz, t, Y0 + 0.07, H - 0.11, 0.06, cream);
  for (const face of ['left', 'right'] as Face[]) {
    for (const t of [-0.4, 0.35]) win(b, face, W, D, cx, cz, t, Y0 + 0.1, 0.26, 0.6, cream, 0.08);
    for (const t of [-0.72, -0.02, 0.7]) pilaster(b, face, W, D, cx, cz, t, Y0 + 0.07, H - 0.11, 0.06, cream);
  }
  // orqa: chetlarda baland oynalar, o‘rtada kichik derazalar, quvurlar, xizmat eshiklari
  for (const t of [-1.2, 1.2]) win(b, 'back', W, D, cx, cz, t, Y0 + 0.1, 0.24, 0.6, cream, 0.08);
  for (const t of [-0.55, 0.55]) win(b, 'back', W, D, cx, cz, t, Y0 + 0.45, 0.08, 0.16, cream);
  for (const t of [-0.75, -0.35, 0.35]) {
    const p = onFace('back', W, D, cx, cz, t, 0.012);
    b.cyl(0.008, 0.008, H - 0.05, mat('#9aa0a6', { metal: 0.4 }), p.x, Y0, p.z, 6);
  }
  for (const t of [-0.15, 0.15]) {
    const p = onFace('back', W, D, cx, cz, t, 0.006);
    b.add(new THREE.PlaneGeometry(0.1, 0.18), mat('#7d8288', { rough: 0.5 }), p.x, Y0 + 0.1, p.z, p.ry);
    const q = onFace('back', W, D, cx, cz, t, 0.06);
    b.box(0.16, 0.015, 0.1, mat('#c9ccd0', { metal: 0.3 }), q.x, Y0 + 0.21, q.z);
  }
  for (const x of [-0.4, -0.25]) b.box(0.12, 0.1, 0.08, mat('#c9ccd0', { rough: 0.5, metal: 0.2 }), x, Y0, cz - D / 2 - 0.08);
  // markaziy baland qism
  const RW = 1.3, RD = 0.3, rz = cz + D / 2 + RD / 2 - 0.05, RH = H + 0.16;
  glassBox(b, RW, RH, RD, st, cx, Y0, rz, 0.14);
  b.box(RW + 0.04, 0.07, RD + 0.03, granite, cx, Y0, rz);
  b.box(RW + 0.06, 0.04, RD + 0.06, cream, cx, Y0 + RH - 0.04, rz);
  flatRoof(b, RW, RD + 0.5, cx, Y0 + RH, rz - 0.25, '#7c8088', '#eadcc2');
  win(b, 'front', RW, RD, cx, rz, 0, Y0 + 0.42, 0.95, 0.3, cream, 0.09);
  emblem(b, 'front', RW, RD, cx, rz, 0, Y0 + 0.57, 0.06);
  sign(b, 'front', RW, RD, cx, Y0 + 0.77, rz, 0, 1.05, 0.08, { lines: [txt('SHAHAR HOKIMLIGI', '#d4a12a', 0.95)], bg: null });
  flag(b, cx, Y0 + RH, rz - 0.3, 0.5);
  // ayvon: podium, 4 ustun, tom plitasi, oynali eshik
  const fz = rz + RD / 2;
  const PD = 0.46, PW = 1.25;
  b.box(PW + 0.1, 0.06, PD, mat('#a35f50', { rough: 0.35 }), cx, Y0, fz + PD / 2);
  glassBox(b, 0.42, 0.26, 0.012, blueGlass(), cx, Y0 + 0.06, fz + 0.004, 0.07);
  for (const x of [-0.5, -0.17, 0.17, 0.5]) {
    b.box(0.08, 0.04, 0.08, granite, cx + x, Y0 + 0.06, fz + PD - 0.06);
    b.cyl(0.03, 0.034, 0.27, cream, cx + x, Y0 + 0.1, fz + PD - 0.06, 14);
    b.box(0.075, 0.025, 0.075, cream, cx + x, Y0 + 0.37, fz + PD - 0.06);
  }
  b.box(PW, 0.06, PD + 0.04, cream, cx, Y0 + 0.395, fz + PD / 2);
  b.box(PW + 0.04, 0.025, PD + 0.08, mat('#e8dcc4'), cx, Y0 + 0.455, fz + PD / 2);
  b.box(PW - 0.1, 0.01, PD - 0.05, mat('#7c8088'), cx, Y0 + 0.48, fz + PD / 2);
  steps(b, cx, fz + PD, 1.15, 5, 0.075, 0.012, '#9a5a4a');
  for (const sx of [-1, 1]) b.box(0.08, 0.07, 0.42, granite, cx + sx * 0.62, Y0, fz + PD + 0.19);
  // hovli
  lawn(b, -1.3, 1.05, 1.0, 0.7, 7, 3);
  lawn(b, 1.3, 1.05, 1.0, 0.7, 7, 6);
  lawn(b, -1.75, -0.6, 0.35, 1.6, 4, 9);
  lawn(b, 1.75, -0.6, 0.35, 1.6, 4, 11);
  for (const [x, z] of [[-1.0, 1.1], [1.15, 1.25], [-1.55, 0.85]] as const) {
    for (let i = 0; i < 6; i++) b.add(new THREE.SphereGeometry(0.02, 6, 4), mat(i % 2 ? '#d9443a' : '#e86a5a', { rough: 0.8 }), x + (i % 3) * 0.05, Y0 + 0.04, z + Math.floor(i / 3) * 0.05);
  }
  for (const [x, z] of [[-0.75, 1.45], [0.75, 1.45], [-1.8, 0.4], [1.8, 0.4], [-1.25, 1.6], [1.25, 1.6]] as const) {
    b.cyl(0.01, 0.01, 0.07, mat('#8e9196', { metal: 0.4 }), x, Y0, z, 8);
    b.box(0.02, 0.01, 0.02, basic('#fff1c8'), x, Y0 + 0.07, z);
  }
  for (const [x, z, k] of [[-1.6, 1.3, 'round'], [1.55, 1.35, 'round'], [1.75, 0.3, 'cypress'], [-1.75, 0.1, 'round'], [-1.75, -1.6, 'cypress'], [1.75, -1.6, 'round']] as const) tree(b, x, z, 0.75, k);
}

// =========================== 2. Moliya boshqarmasi ===========================

/**
 * moliya/1–4.png: uzun ikki qavatli krem bino, qizil-jigarrang sokol; old fasadda pilyastrlar orasida baland ko‘k
 * oynalar (tepasi arkali), tishli friz va karniz; ikki chetida oldinga chiqqan burchak qismlari (baland oyna, kapitelli
 * pilyastrlar); markazda kirish soyaboni va «MOLIYA BOSHQARMASI» yozuvi, qizil zinapoya. Orqada kichik to‘rtburchak
 * derazalar, narvonlar, eshik. Tomda qizil piramidali yorug‘lik fonarlari, konditsionerlar va kichik antennalar.
 */
function moliya(b: Builder, w: number, d: number) {
  plaza(b, w, d, { top: '#d9d4ca', base: '#bdb8ae' });
  const st = stone('#ebdfca');
  const cream = mat('#f0e6d4', { rough: 0.65 });
  const granite = mat('#a45a46', { rough: 0.55 });
  const W = 4.2, D = 1.45, H = 0.72, cx = 0, cz = -0.35;
  glassBox(b, W, H, D, st, cx, Y0, cz, 0.14);
  b.box(W + 0.03, 0.08, D + 0.03, granite, cx, Y0, cz);
  b.box(W + 0.05, 0.08, D + 0.05, cream, cx, Y0 + H - 0.14, cz);
  b.box(W + 0.08, 0.035, D + 0.08, cream, cx, Y0 + H - 0.035, cz);
  flatRoof(b, W, D, cx, Y0 + H, cz, '#d2cdc5', '#efe6d6');
  // friz tishlari (old va orqa)
  for (const face of ['front', 'back'] as Face[]) for (let i = 0; i < 22; i++) {
    const p = onFace(face, W + 0.05, D + 0.05, cx, cz, -1.9 + i * 0.181, 0.01);
    b.box(0.05, 0.03, 0.02, mat('#dfd2bb'), p.x, Y0 + H - 0.115, p.z);
  }
  // old fasad: pilyastrlar va arkali baland oynalar
  for (let i = 0; i <= 11; i++) pilaster(b, 'front', W, D, cx, cz, -1.65 + i * 0.3, Y0 + 0.08, H - 0.22, 0.06, cream, 0.03);
  for (let i = 0; i < 11; i++) archWindow(b, 'front', W, D, cx, cz, -1.5 + i * 0.3, Y0 + 0.11, 0.18, 0.44, blueGlass(), cream);
  // burchak qismlari (old tomon chetlarida)
  for (const sx of [-1, 1]) {
    const px = cx + sx * (W / 2 - 0.17);
    const pz = cz + D / 2 + 0.03;
    glassBox(b, 0.34, H + 0.03, 0.08, st, px, Y0, pz, 0.14);
    b.box(0.36, 0.08, 0.1, granite, px, Y0, pz);
    win(b, 'front', 0.34, 0.08, px, pz, 0, Y0 + 0.1, 0.14, 0.48, cream, 0.07);
    for (const t of [-0.13, 0.13]) {
      pilaster(b, 'front', 0.34, 0.08, px, pz, t, Y0 + 0.08, H - 0.16, 0.045, cream, 0.025);
      const p = onFace('front', 0.34, 0.08, px, pz, t, 0.02);
      b.box(0.07, 0.04, 0.035, cream, p.x, Y0 + H - 0.1, p.z);
    }
    // yon tomonlar: baland oyna (rasm: chekka tomonda ko‘k oyna)
    const sf: Face = sx < 0 ? 'left' : 'right';
    win(b, sf, W, D, cx, cz, 0.35, Y0 + 0.1, 0.22, 0.5, cream, 0.07);
    for (const t of [-0.45, 0.1, 0.6]) pilaster(b, sf, W, D, cx, cz, t, Y0 + 0.08, H - 0.22, 0.05, cream, 0.03);
    steps(b, px, cz + D / 2 + 0.08, 0.3, 3, 0.06, 0.02, '#c9b8a2');
  }
  // markaziy kirish soyaboni va yozuv
  const fz = cz + D / 2;
  glassBox(b, 0.42, 0.24, 0.012, blueGlass(), cx, Y0 + 0.08, fz + 0.02, 0.07);
  b.box(0.62, 0.11, 0.3, cream, cx, Y0 + 0.3, fz + 0.15);
  sign(b, 'front', 0.62, 0.3, cx, Y0 + 0.315, fz + 0.15, 0, 0.56, 0.07, { lines: [txt('MOLIYA BOSHQARMASI', '#3a3f46', 0.9, { serif: true })], bg: null });
  steps(b, cx, fz + 0.04, 0.7, 4, 0.06, 0.02, '#b05a48');
  // orqa: kichik derazalar, pilyastrlar, narvon, eshik
  for (let i = 0; i < 9; i++) {
    const t = -1.6 + i * 0.4;
    win(b, 'back', W, D, cx, cz, t, Y0 + 0.4, 0.08, 0.15, cream);
    if (i % 2 === 0) win(b, 'back', W, D, cx, cz, t, Y0 + 0.14, 0.07, 0.07, cream);
    pilaster(b, 'back', W, D, cx, cz, t + 0.2, Y0 + 0.08, H - 0.22, 0.05, cream, 0.025);
  }
  for (const t of [-1.75, 1.3]) {
    const p = onFace('back', W, D, cx, cz, t, 0.03);
    for (const dx of [-0.03, 0.03]) b.box(0.006, H, 0.006, mat('#9aa0a6', { metal: 0.5 }), p.x + dx, Y0, p.z);
    for (let k = 0; k < 10; k++) b.box(0.06, 0.004, 0.004, mat('#9aa0a6', { metal: 0.5 }), p.x, Y0 + 0.06 + k * 0.065, p.z);
  }
  const door = onFace('back', W, D, cx, cz, 0.2, 0.006);
  b.add(new THREE.PlaneGeometry(0.12, 0.2), mat('#6f757c'), door.x, Y0 + 0.18, door.z, door.ry);
  // tom: qizil piramidali fonarlar, konditsionerlar, antennalar
  const ry = Y0 + H;
  b.box(1.3, 0.05, 0.5, cream, cx + 0.2, ry, cz - 0.05);
  for (let i = 0; i < 3; i++) for (const dz of [-0.11, 0.11]) {
    const pyr = new THREE.ConeGeometry(0.11, 0.1, 4);
    pyr.rotateY(Math.PI / 4);
    b.add(pyr, mat('#c9443a', { rough: 0.5 }), cx - 0.2 + i * 0.4, ry + 0.1, cz - 0.05 + dz);
  }
  for (const [x, z] of [[-1.4, -0.7], [-1.0, -0.1], [-0.6, -0.75], [1.2, -0.7], [1.55, -0.2], [0.95, 0.1]] as const) hvac(b, x, ry + 0.012, z, 0.12, 0.1, 0.06);
  for (const [x, z] of [[-2.0, -1.0], [2.0, -1.0], [-2.0, 0.3], [2.0, 0.3], [0.6, 0.32], [-0.6, 0.32]] as const) {
    b.cyl(0.004, 0.004, 0.05, mat('#3a3f46'), x, ry + 0.012, z, 6);
    const dish = new THREE.CylinderGeometry(0.025, 0.012, 0.01, 10);
    dish.rotateX(1.1);
    b.add(dish, mat('#3a3f46'), x, ry + 0.07, z);
  }
  // hovli: to‘siq butalar, daraxtlar, chiroqlar
  for (const sx of [-1, 1]) {
    lawn(b, sx * 1.35, 0.95, 1.5, 0.5, 9, sx > 0 ? 5 : 3);
    b.hedgeRow(sx * 1.35, 1.3, 1.5, true);
  }
  lawn(b, 0, -1.3, 4.2, 0.25, 8, 7);
  for (const [x, z] of [[-0.55, 0.85], [0.55, 0.85], [-2.2, 0.8], [2.2, 0.8]] as const) globeLamp(b, x, z);
  for (const [x, z, k] of [[-1.9, 0.95, 'round'], [-1.3, 1.0, 'round'], [-0.8, 1.05, 'cypress'], [0.85, 1.0, 'round'], [1.4, 0.95, 'round'], [1.95, 1.0, 'cypress'], [-2.25, -1.3, 'round'], [2.25, -1.3, 'round']] as const) tree(b, x, z, 0.7, k);
}

// =========================== 3. Soliq idorasi ===========================

/**
 * soliq/1–4.png: pog‘onali krem tosh majmua — orqada uch qavatli markaziy minora (arkali katta oynalar, kichik
 * to‘rtburchak derazalar qatori), uning ikki yonida ikki qavatli bloklar; old tomonda yumaloq burchakli bir qavatli
 * arkali galereya; markazda to‘rt ustunli kirish va egilgan soyabon ustida ko‘k «SOLIQ IDORASI» yozuvi, qizil
 * zinapoya. Oldida plitkali maydon va dumaloq gulzor, archalar, shar chiroqlar, to‘siq butalar.
 */
function soliq(b: Builder, w: number, d: number) {
  plaza(b, w, d, { chamfer: 0.8, top: '#d6c9b8', base: '#bdb4a6' });
  const st = stone('#e9dcc0');
  const cream = mat('#efe3c9', { rough: 0.65 });
  const roofC = '#8c8f94', parC = '#eadcc0';
  // markaziy minora
  const tx = 0, tz = -1.25, TW = 1.25, TD = 1.05, TH = 1.12;
  glassBox(b, TW, TH, TD, st, tx, Y0, tz, 0.13);
  b.box(TW + 0.05, 0.05, TD + 0.05, cream, tx, Y0 + TH - 0.05, tz);
  flatRoof(b, TW, TD, tx, Y0 + TH, tz, roofC, parC);
  for (const face of ['front', 'left', 'right', 'back'] as Face[]) {
    const L = face === 'front' || face === 'back' ? TW : TD;
    for (const t of [-L * 0.25, L * 0.25]) archWindow(b, face, TW, TD, tx, tz, t, Y0 + 0.8, 0.2, 0.26, blueGlass(), cream);
    for (let i = 0; i < 6; i++) win(b, face, TW, TD, tx, tz, -L / 2 + 0.12 + i * ((L - 0.24) / 5), Y0 + 1.03, 0.035, 0.035);
    win(b, face, TW, TD, tx, tz, 0, Y0 + 0.62, 0.3, 0.1, cream);
  }
  hvac(b, tx - 0.2, Y0 + TH + 0.012, tz, 0.16, 0.12, 0.07);
  hvac(b, tx + 0.25, Y0 + TH + 0.012, tz + 0.1, 0.14, 0.12, 0.07);
  // yon ikki qavatli bloklar
  for (const sx of [-1, 1]) {
    const bx = sx * 1.3, bz = -1.05, BW = 1.25, BD = 1.25, BH = 0.78;
    glassBox(b, BW, BH, BD, st, bx, Y0, bz, 0.13);
    b.box(BW + 0.05, 0.05, BD + 0.05, cream, bx, Y0 + BH - 0.05, bz);
    flatRoof(b, BW, BD, bx, Y0 + BH, bz, roofC, parC);
    const outer: Face = sx < 0 ? 'left' : 'right';
    for (const face of ['front', outer, 'back'] as Face[]) {
      for (const t of [-0.3, 0.3]) archWindow(b, face, BW, BD, bx, bz, t, Y0 + 0.45, 0.2, 0.26, blueGlass(), cream);
      for (let i = 0; i < 6; i++) win(b, face, BW, BD, bx, bz, -0.5 + i * 0.2, Y0 + 0.73, 0.03, 0.03);
    }
    hvac(b, bx, Y0 + BH + 0.012, bz, 0.18, 0.12, 0.07);
    // orqa: eshik, quvur, elektr shkaflari
    const dp = onFace('back', BW, BD, bx, bz, 0, 0.006);
    b.add(new THREE.PlaneGeometry(0.1, 0.18), mat('#d8d2c4'), dp.x, Y0 + 0.1, dp.z, dp.ry);
  }
  for (const x of [-0.25, -0.1]) b.box(0.1, 0.14, 0.06, mat('#c4c8cc', { metal: 0.2 }), x, Y0, tz - TD / 2 - 0.05);
  // old bir qavatli arkali galereya (yumaloq burchaklar)
  const GW = 4.5, GD = 1.0, GH = 0.42, gz = 0.05;
  b.roundedBand(GW, GD, 0.42, GH, st, mat(roofC, { rough: 0.85 }), 0, Y0, gz);
  b.roundedBand(GW + 0.04, GD + 0.04, 0.44, 0.05, cream, null, 0, Y0 + GH - 0.05, gz);
  b.roundedBand(GW + 0.02, GD + 0.02, 0.43, 0.06, mat('#c9a68a', { rough: 0.7 }), null, 0, Y0, gz);
  for (const t of [-1.75, -1.4, -1.05, -0.7, 0.7, 1.05, 1.4, 1.75]) archWindow(b, 'front', GW, GD, 0, gz, t, Y0 + 0.08, 0.2, 0.28, blueGlass(), cream);
  for (const face of ['left', 'right'] as Face[]) archWindow(b, face, GW, GD, 0, gz, 0, Y0 + 0.08, 0.2, 0.28, blueGlass(), cream);
  // kirish: 4 ustun, egilgan soyabon, yozuv, zinapoya
  const fz = gz + GD / 2;
  glassBox(b, 0.5, 0.3, 0.012, blueGlass(), 0, Y0 + 0.02, fz + 0.004, 0.07);
  for (const x of [-0.42, -0.15, 0.15, 0.42]) {
    b.cyl(0.03, 0.034, 0.36, cream, x, Y0 + 0.04, fz + 0.3, 14);
    b.box(0.07, 0.04, 0.07, cream, x, Y0, fz + 0.3);
  }
  b.roundedBand(1.15, 0.45, 0.18, 0.1, cream, mat(roofC), 0, Y0 + 0.4, fz + 0.12);
  sign(b, 'front', 1.15, 0.45 + 0.01, 0, Y0 + 0.415, fz + 0.12, 0, 0.8, 0.07, { lines: [txt('SOLIQ IDORASI', '#2a46a8', 0.95)], bg: null });
  b.box(1.1, 0.04, 0.4, mat('#b5654f', { rough: 0.5 }), 0, Y0, fz + 0.2);
  steps(b, 0, fz + 0.4, 1.0, 3, 0.06, 0.013, '#b05a48');
  // maydon: dumaloq gulzor, chiroqlar, archalar, to‘siq butalar
  b.box(1.8, 0.006, 1.2, mat('#cdb9a3', { rough: 0.9 }), 0.3, Y0, 1.55);
  b.cyl(0.32, 0.32, 0.035, mat('#efe6d6'), 0.45, Y0, 1.6, 28);
  b.cyl(0.29, 0.29, 0.04, mat('#5d8f3e', { rough: 0.95 }), 0.45, Y0, 1.6, 28);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2, r = 0.08 + (i % 3) * 0.07;
    b.add(new THREE.SphereGeometry(0.022, 6, 4), mat(i % 4 === 0 ? '#ffffff' : '#d9332b', { rough: 0.8 }), 0.45 + Math.cos(a) * r, Y0 + 0.055, 1.6 + Math.sin(a) * r);
  }
  lawn(b, -1.55, 1.25, 1.6, 0.85, 8, 3);
  lawn(b, 1.95, 1.0, 0.75, 0.6, 5, 7);
  b.hedgeRow(-1.55, 1.75, 1.6, true);
  for (const [x, z] of [[-0.75, 1.2], [1.6, 0.85], [-1.6, 1.55]] as const) globeLamp(b, x, z);
  for (const [x, z, k] of [[-2.1, 1.0, 'cypress'], [-1.6, 1.35, 'cypress'], [-1.05, 1.4, 'cypress'], [-1.3, 0.95, 'round'], [1.85, 1.2, 'cypress'], [2.2, 0.75, 'cypress'], [-2.25, -0.9, 'cypress'], [2.25, -0.9, 'cypress'], [-2.25, -2.0, 'round'], [2.25, -2.0, 'round']] as const) tree(b, x, z, 0.75, k);
}

// =========================== 4. Milliy bank ===========================

/**
 * milliy_bank/1–4.png: ikki minorali majmua. Chapdagi baland minora yuqoriga torayadi: oq tosh, old tomonda keng ko‘k
 * oyna, yonlarida tor ko‘k tasmalar, tepasida toj (halqa panjara, kichik gumbaz, antenna) va «MILLIY BANK» lavhasi,
 * pastida shisha piramida-atrium. O‘ngdagi to‘g‘ri burchakli minora: ko‘k shisha fasad, oq tosh burchaklar, pog‘onali
 * tepa va tomdagi texnik bloklar. Orqada past podium (yorug‘lik fonari), old tomonda aylanma yo‘l va dumaloq gulzor,
 * atrof oq ustunli panjara va daraxtlar.
 */
function milliyBank(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 0.2, width: 1.0 }], stone: '#e8e5df', cap: '#ffffff', base: '#cfccc5', ground: '#d4d1ca' });
  const white = mat('#e4e2dd', { rough: 0.6 });
  const blue = skyGlass();
  // chap minora (toraygan)
  const ax = -1.15, az = -0.25, AW = 1.25, AD = 1.05, AH = 3.7, s = 0.76;
  taperBox(b, AW, AH, AD, s, white, ax, Y0, az);
  taperBox(b, AW * 0.5, AH - 0.25, AD + 0.04, s, blue, ax, Y0 + 0.2, az, 0.12);
  taperBox(b, AW + 0.04, AH - 0.4, AD * 0.18, s, blue, ax, Y0 + 0.2, az, 0.12);
  // gorizontal bo‘linishlar (old ko‘k fasadda)
  for (let k = 1; k < 5; k++) {
    const y = 0.2 + (AH - 0.25) * (k / 5);
    const sc = 1 - (1 - s) * (y / AH);
    b.box(AW * 0.5 * sc + 0.02, 0.03, 0.02, white, ax, Y0 + y, az + (AD / 2) * sc + 0.02);
  }
  // toj: halqa, panjara, gumbaz, antenna
  const topY = Y0 + AH;
  const topR = (AW * s) / 2;
  b.cyl(topR * 0.95, topR, 0.12, white, ax, topY, az, 24);
  const rail = new THREE.TorusGeometry(topR * 0.98, 0.006, 4, 32);
  rail.rotateX(Math.PI / 2);
  b.add(rail, mat('#c9ccd0', { metal: 0.5 }), ax, topY + 0.2, az);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.box(0.008, 0.08, 0.008, mat('#c9ccd0', { metal: 0.5 }), ax + Math.cos(a) * topR * 0.98, topY + 0.12, az + Math.sin(a) * topR * 0.98);
  }
  b.add(new THREE.SphereGeometry(topR * 0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#b9bec4', { metal: 0.5, rough: 0.3 }), ax, topY + 0.12, az);
  b.cyl(0.006, 0.006, 0.35, mat('#9aa0a6', { metal: 0.6 }), ax, topY + 0.3, az, 6);
  sign(b, 'front', AW * s, AD * s + 0.06, ax, topY - 0.32, az, 0, 0.62, 0.13, { lines: [txt('MILLIY BANK', '#e8c56a', 0.95, { serif: true })], bg: '#1d3f7a' });
  // shisha atrium (old tomonda)
  const atz = az + AD / 2 + 0.2;
  glassBox(b, 0.8, 0.32, 0.35, blue, ax, Y0, atz, 0.1);
  const pyr = new THREE.ConeGeometry(0.5, 0.3, 4);
  pyr.rotateY(Math.PI / 4);
  pyr.scale(1, 1, 0.48);
  b.add(pyr, blue, ax, Y0 + 0.32 + 0.15, atz);
  glassBox(b, 0.35, 0.2, 0.3, blue, ax - 0.6, Y0, az + 0.35, 0.1);
  // o‘ng minora (to‘g‘ri burchakli, ko‘k shisha, pog‘onali tepa)
  const bx = 1.15, bz = -0.75, BW = 1.15, BD = 1.05, BH = 3.15;
  b.box(BW, BH, BD, white, bx, Y0, bz);
  glassBox(b, BW - 0.3, BH - 0.2, BD + 0.03, blue, bx, Y0 + 0.15, bz, 0.12);
  glassBox(b, BW + 0.03, BH - 0.2, BD - 0.4, blue, bx, Y0 + 0.15, bz, 0.12);
  glassBox(b, BW - 0.5, 0.3, BD - 0.3, blue, bx - 0.05, Y0 + BH, bz, 0.12);
  b.box(0.35, 0.18, 0.35, white, bx + 0.3, Y0 + BH, bz - 0.25);
  for (const [x, z] of [[-0.25, 0.25], [0.15, 0.3], [0.35, -0.2]] as const) hvac(b, bx + x, Y0 + BH, bz + z, 0.14, 0.12, 0.07);
  for (const t of [-0.2, 0.2]) {
    const p = onFace('front', BW, BD, bx, bz, t, 0.006);
    b.add(new THREE.PlaneGeometry(0.14, 0.16), mat('#7d8288'), p.x, Y0 + 0.09, p.z, p.ry);
  }
  // podium (orqa), yorug‘lik fonari, garaj eshiklari
  const px = 0, pz = -1.55;
  b.box(1.3, 0.36, 1.05, white, px, Y0, pz);
  flatRoof(b, 1.3, 1.05, px, Y0 + 0.36, pz, '#b9b7b2', '#e8e6e1');
  const sky = new THREE.ConeGeometry(0.18, 0.08, 4);
  sky.rotateY(Math.PI / 4);
  b.add(sky, blue, px - 0.2, Y0 + 0.42, pz + 0.1);
  hvac(b, px + 0.3, Y0 + 0.37, pz - 0.1, 0.14, 0.12, 0.06);
  for (const t of [-0.3, 0.3]) {
    const p = onFace('back', 1.3, 1.05, px, pz, t, 0.006);
    b.add(new THREE.PlaneGeometry(0.2, 0.2), mat('#6f757c'), p.x, Y0 + 0.11, p.z, p.ry);
  }
  // aylanma yo‘l va gulzor
  const rx = 0.15, rz = 1.05;
  b.cyl(0.62, 0.62, 0.008, mat('#7c7f84', { rough: 0.85 }), rx, Y0, rz, 32);
  b.cyl(0.26, 0.26, 0.04, mat('#e6e3dc'), rx, Y0, rz, 24);
  b.cyl(0.23, 0.23, 0.045, mat('#5d8f3e', { rough: 0.95 }), rx, Y0, rz, 24);
  for (let i = 0; i < 12; i++) b.add(new THREE.SphereGeometry(0.02, 6, 4), mat(i % 3 ? '#d9443a' : '#f2c94c', { rough: 0.8 }), rx + Math.cos(i) * 0.15, Y0 + 0.06, rz + Math.sin(i) * 0.15);
  tree(b, rx, rz, 0.55, 'cypress');
  b.box(0.5, 0.008, 0.9, mat('#7c7f84', { rough: 0.85 }), 0.2, Y0, 1.85);
  for (const [x, z, k] of [[-2.1, 1.2, 'round'], [-1.6, 1.6, 'round'], [-2.1, 0.5, 'cypress'], [2.1, 1.3, 'round'], [1.4, 1.65, 'cypress'], [2.15, 0.55, 'round'], [2.15, -2.0, 'round'], [-2.15, -2.0, 'cypress'], [-0.6, 1.7, 'round']] as const) tree(b, x, z, 0.7, k);
  for (const [x, z] of [[-0.55, 1.5], [0.85, 1.5]] as const) modernLamp(b, x, z);
  bench(b, -1.2, 1.25, 0);
}

// =========================== 5. Ekologiya markazi ===========================

/**
 * ekologiya/1–4.png: uch qavatli zamonaviy bino — oq devorlar, qalin to‘q kulrang gorizontal tasmalar va hoshiyalar,
 * katta ko‘k shisha qismlar; oldinga chiqqan oq minora-panelda yashil-ko‘k qalqon belgisi va «EKOLOGIYA MARKAZI»
 * yozuvi; o‘ng burchakda donador tosh tik panel; o‘ng tomonda past qanot. Kirishda panjarali zinapoya va
 * gulzorli tuvaklar, oldida uchta bayroq ustuni. Orqada jigarrang jalyuzili derazalar, narvon, konditsionerlar.
 * Tomda antenna minorasi va konditsionerlar.
 */
function ekologiya(b: Builder, w: number, d: number) {
  plaza(b, w, d, { chamfer: 0.45, top: '#cfccc6', base: '#b3b0aa' });
  const white = mat('#f2f0ea', { rough: 0.6 });
  const slate = mat('#4b5563', { rough: 0.55 });
  const W = 2.1, D = 1.6, H = 0.8, cx = -0.35, cz = -0.45;
  b.box(W, H, D, white, cx, Y0, cz);
  glassBox(b, W - 0.1, 0.24, D - 0.1, blueGlass(), cx, Y0, cz, 0.1);
  for (const sx of [-1, 0, 1]) b.box(0.07, 0.24, 0.07, slate, cx + sx * (W / 2 - 0.1), Y0, cz + D / 2 - 0.04);
  for (const y of [0.24, 0.52]) b.box(W + 0.08, 0.06, D + 0.08, slate, cx, Y0 + y, cz);
  b.box(W + 0.12, 0.1, D + 0.12, slate, cx, Y0 + H - 0.04, cz);
  b.box(W - 0.04, 0.012, D - 0.04, mat('#cbbfa8', { rough: 0.9 }), cx, Y0 + H + 0.05, cz);
  for (const face of ['front', 'back', 'left', 'right'] as Face[]) {
    const p = onFace(face, W + 0.12, D + 0.12, cx, cz, 0, -0.01);
    const along = face === 'front' || face === 'back';
    b.box(along ? W + 0.12 : 0.04, 0.06, along ? 0.04 : D + 0.12, slate, p.x, Y0 + H + 0.06, p.z);
  }
  // old: katta ko‘k shisha qism (2–3 qavat), oq minora-panel (logo va yozuv), donador tosh panel
  win(b, 'front', W, D, cx, cz, 0.35, Y0 + 0.31, 0.75, 0.42, undefined, 0.09);
  const tpx = cx - 0.55, tpz = cz + D / 2 + 0.06;
  b.box(0.5, H + 0.06, 0.12, white, tpx, Y0 + 0.24, tpz);
  for (const sx of [-1, 1]) b.box(0.05, H + 0.06, 0.13, white, tpx + sx * 0.27, Y0 + 0.24, tpz);
  sign(b, 'front', 0.5, 0.12, tpx, Y0 + 0.36, tpz, 0, 0.42, 0.42, {
    lines: [txt('EKOLOGIYA', '#1f4f9f', 0.5), txt('MARKAZI', '#1f4f9f', 0.5)], bg: null, logo: 'shield', logoColor: '#1f6fd0', logoPos: 'top',
  });
  const grainy = stone('#cfc6b5');
  const gp = onFace('front', W, D, cx, cz, W / 2 - 0.12, 0.03);
  glassBox(b, 0.16, H + 0.12, 0.06, grainy, gp.x, Y0 + 0.24, gp.z, 0.08);
  // yon va orqa derazalar (yuqori qavatda jigarrang jalyuzi)
  const louvre = mat('#8a5a36', { rough: 0.7 });
  for (const face of ['left', 'back'] as Face[]) {
    const L = face === 'back' ? W : D;
    for (let i = 0; i < 4; i++) {
      const t = -L / 2 + 0.25 + i * ((L - 0.5) / 3);
      win(b, face, W, D, cx, cz, t, Y0 + 0.31, 0.24, 0.18, undefined, 0.08);
      const p = onFace(face, W, D, cx, cz, t, 0.01);
      b.add(new THREE.PlaneGeometry(0.2, 0.18), louvre, p.x, Y0 + 0.66, p.z, p.ry);
      for (let k = 0; k < 6; k++) {
        const q = onFace(face, W, D, cx, cz, t, 0.014);
        b.add(new THREE.PlaneGeometry(0.2, 0.008), mat('#6b4425'), q.x, Y0 + 0.59 + k * 0.028, q.z, q.ry);
      }
    }
  }
  const lp = onFace('back', W, D, cx, cz, 0.55, 0.03);
  for (const dx of [-0.03, 0.03]) b.box(0.006, H + 0.05, 0.006, mat('#9aa0a6', { metal: 0.5 }), lp.x + dx, Y0, lp.z);
  for (let k = 0; k < 12; k++) b.box(0.06, 0.004, 0.004, mat('#9aa0a6', { metal: 0.5 }), lp.x, Y0 + 0.06 + k * 0.065, lp.z);
  for (const x of [cx - 0.3, cx - 0.1]) b.box(0.12, 0.1, 0.08, mat('#e9eaeb', { rough: 0.5 }), x, Y0, cz - D / 2 - 0.08);
  // o‘ng past qanot
  const ww = 1.05, wd = 1.2, wh = 0.5, wx = cx + W / 2 + ww / 2, wz = cz + 0.15;
  b.box(ww, wh, wd, white, wx, Y0, wz);
  glassBox(b, ww - 0.1, 0.22, wd + 0.01, blueGlass(), wx, Y0 + 0.02, wz, 0.1);
  b.box(ww + 0.06, 0.06, wd + 0.06, slate, wx, Y0 + 0.24, wz);
  b.box(ww + 0.08, 0.08, wd + 0.08, slate, wx, Y0 + wh - 0.04, wz);
  b.box(ww - 0.04, 0.012, wd - 0.04, mat('#cbbfa8'), wx, Y0 + wh + 0.03, wz);
  win(b, 'front', ww, wd, wx, wz, 0, Y0 + 0.3, 0.8, 0.14, undefined, 0.09);
  b.box(ww * 0.8, 0.012, 0.15, clearRail(), wx, Y0 + 0.22, wz + wd / 2 + 0.08);
  // tom: antenna minorasi, konditsionerlar
  latticeTower(b, cx + 0.45, Y0 + H + 0.06, cz - 0.1, 0.55);
  for (const [x, z] of [[-0.5, -0.8], [-0.1, -0.85], [-0.85, -0.2]] as const) hvac(b, cx + x + 0.35, Y0 + H + 0.06, z, 0.13, 0.11, 0.06);
  // kirish: zinapoya, panjaralar, tuvaklar, soyabon
  const ez = cz + D / 2;
  b.box(0.7, 0.03, 0.3, slate, tpx + 0.05, Y0 + 0.22, ez + 0.2);
  steps(b, tpx + 0.05, ez + 0.05, 0.55, 4, 0.07, 0.015, '#5b6470');
  for (const sx of [-0.3, 0.3]) {
    b.box(0.006, 0.07, 0.3, mat('#b9bec4', { metal: 0.6 }), tpx + 0.05 + sx, Y0 + 0.04, ez + 0.2);
    b.box(0.14, 0.06, 0.22, mat('#4b5563'), tpx + 0.05 + sx * 1.6, Y0, ez + 0.25);
    for (let i = 0; i < 4; i++) b.add(new THREE.SphereGeometry(0.02, 6, 4), mat(i % 2 ? '#d9443a' : '#f08a3c'), tpx + 0.05 + sx * 1.6 + (i - 1.5) * 0.03, Y0 + 0.08, ez + 0.25);
  }
  // bayroq ustunlari
  for (const [i, x] of [0.55, 0.75, 0.95].entries()) {
    if (i === 0) flag(b, x, Y0, 0.85, 0.55);
    else b.cyl(0.006, 0.008, 0.55, mat('#c9ccd0', { metal: 0.6 }), x, Y0, 0.85, 8);
  }
  // hovli: yo‘lak, maysalar, archalar
  b.box(1.2, 0.006, 1.2, mat('#8e9196', { rough: 0.85 }), 1.2, Y0, 1.3);
  lawn(b, -1.15, 0.95, 1.4, 0.75, 8, 4);
  lawn(b, 0.75, 1.05, 0.5, 0.5, 4, 6);
  lawn(b, -1.75, -0.6, 0.35, 1.8, 5, 9);
  for (const [x, z, k] of [[-1.7, 0.75, 'cypress'], [-1.3, 1.2, 'cypress'], [-0.85, 0.85, 'cypress'], [-1.75, -0.2, 'cypress'], [-1.75, -1.2, 'cypress'], [0.7, 1.15, 'cypress'], [1.75, -0.95, 'cypress'], [1.75, -1.6, 'cypress'], [0.6, -1.65, 'cypress']] as const) tree(b, x, z, 0.75, k);
}

function clearRail() {
  return once('clearRail', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#cfe7ef', transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false });
    m.userData.noShadow = true;
    return m;
  });
}

// =========================== 6. Suv tozalash inshooti ===========================

/** Ko‘k panjara (ustunlar + to‘r), beton poydevor ustida, uchastka chetida. */
function blueFence(b: Builder, hw: number, hd: number, chamfer: number, gate: { at: number; width: number }) {
  const blue = mat('#2f5fd0', { rough: 0.45, metal: 0.3 });
  const mesh = once('fenceMesh', () => {
    const m = new THREE.MeshStandardMaterial({ color: '#3a6ad8', transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 0.6, depthWrite: false });
    m.userData.noShadow = true;
    return m;
  });
  const pts: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd - chamfer], [hw - chamfer, hd], [-hw + chamfer, hd], [-hw, hd - chamfer], [-hw, -hd]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    const n = Math.max(1, Math.round(len / 0.4));
    for (let k = 0; k < n; k++) {
      const a = k / n, c = (k + 1) / n;
      const mx = x0 + (x1 - x0) * ((a + c) / 2), mz = z0 + (z1 - z0) * ((a + c) / 2);
      // darvoza (old tomonda)
      if (Math.abs(z0 - hd) < 1e-6 && Math.abs(z1 - hd) < 1e-6 && Math.abs(mx - gate.at) < gate.width / 2) continue;
      const seg = len / n;
      const g = new THREE.PlaneGeometry(seg, 0.12);
      b.add(g, mesh, mx, Y0 + 0.08, mz, -ang);
      const top = new THREE.BoxGeometry(seg, 0.008, 0.008);
      b.add(top, blue, mx, Y0 + 0.14, mz, -ang);
      b.box(0.012, 0.13, 0.012, blue, x0 + (x1 - x0) * a, Y0 + 0.02, z0 + (z1 - z0) * a);
    }
  }
}

/** Dumaloq tindirgich havza: beton devor, suv, markaziy halqa, ko‘k ko‘prik-skreper. */
function clarifier(b: Builder, x: number, z: number, r: number, bridgeAng: number) {
  const concrete = mat('#cfcac0', { rough: 0.85 });
  const ring = new THREE.CylinderGeometry(r, r, 0.22, 40, 1, true);
  b.add(ring, once('basinWall', () => new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 0.85, side: THREE.DoubleSide })), x, Y0 + 0.11, z);
  const lip = new THREE.TorusGeometry(r, 0.025, 4, 40);
  lip.rotateX(Math.PI / 2);
  b.add(lip, concrete, x, Y0 + 0.22, z);
  b.cyl(r, r, 0.17, mat('#9fb7b4'), x, Y0, z, 40);
  b.add(new THREE.CircleGeometry(r - 0.01, 40).rotateX(-Math.PI / 2), texMat('basinWater', basinWaterTexture, { rough: 0.15, metal: 0.1 }), x, Y0 + 0.18, z);
  b.cyl(r * 0.25, r * 0.25, 0.22, concrete, x, Y0, z, 24);
  b.cyl(r * 0.18, r * 0.18, 0.005, mat('#5f8f8a'), x, Y0 + 0.22, z, 20);
  b.cyl(0.04, 0.05, 0.06, mat('#3a3f46', { metal: 0.4 }), x, Y0 + 0.22, z, 12);
  // ko‘prik markazdan chetga
  const blue = mat('#2f5fd0', { rough: 0.45, metal: 0.3 });
  const c = Math.cos(bridgeAng), s = Math.sin(bridgeAng);
  const mx = x + c * r * 0.5, mz = z + s * r * 0.5;
  const deck = new THREE.BoxGeometry(r * 1.02, 0.02, 0.08);
  b.add(deck, blue, mx, Y0 + 0.26, mz, -bridgeAng);
  for (const side of [-1, 1]) {
    const rail2 = new THREE.BoxGeometry(r * 1.02, 0.008, 0.008);
    b.add(rail2, blue, mx - s * side * 0.04, Y0 + 0.32, mz + c * side * 0.04, -bridgeAng);
    for (let k = 0; k <= 5; k++) {
      const t = (k / 5 - 0.5) * r;
      b.box(0.006, 0.06, 0.006, blue, mx + c * t - s * side * 0.04, Y0 + 0.27, mz + s * t + c * side * 0.04);
    }
  }
  b.box(0.08, 0.12, 0.08, blue, x + c * r * 0.97, Y0 + 0.16, z + s * r * 0.97);
}

/**
 * suv_tozalash/1–4.png: beton poydevorli uchastka, ko‘k panjara; ikkita dumaloq tindirgich havza (markaziy halqa,
 * ko‘k ko‘prik-skreper), old-chapda to‘rt bo‘lmali to‘rtburchak kanallar va ko‘prikchalar; orqada uzun krem xizmat
 * binosi (qizil-jigarrang sokol, ko‘k profnastil ikki nishabli tom, «SUV TOZALASH INSHOOTI» lavhasi), o‘ngda kichik
 * ilova; quvurlar, baland chiroqlar va archalar.
 */
function suvTozalash(b: Builder, w: number, d: number) {
  plaza(b, w, d, { chamfer: 0.7, top: '#d3cfc6', base: '#bcb8ae' });
  const hw = w / 2 - 0.08, hd = d / 2 - 0.08;
  blueFence(b, hw, hd, 0.62, { at: 0.6, width: 0.6 });
  // xizmat binosi
  const BW = 3.3, BD = 0.75, BH = 0.38, bx = 0.55, bz = -1.75;
  const wall = mat('#efe2c4', { rough: 0.8 });
  b.box(BW, BH, BD, wall, bx, Y0, bz);
  b.box(BW + 0.01, 0.09, BD + 0.01, mat('#b06a55', { rough: 0.8 }), bx, Y0, bz);
  const roofBlue = mat('#2f5fd0', { rough: 0.5, metal: 0.2 });
  b.gableRoof(BW + 0.1, BD + 0.16, 0.2, roofBlue, bx, Y0 + BH, bz);
  for (let i = 0; i < 6; i++) {
    const t = -BW / 2 + 0.35 + i * 0.5;
    if (Math.abs(t - 0.1) < 0.4) continue;
    for (const face of ['front', 'back'] as Face[]) win(b, face, BW, BD, bx, bz, t, Y0 + 0.17, 0.12, 0.1, mat('#ffffff'));
  }
  sign(b, 'front', BW, BD, bx, Y0 + 0.17, bz, 0.1, 0.9, 0.12, { lines: [txt('SUV TOZALASH INSHOOTI', '#1f4fb0', 0.9)], bg: '#ffffff', logo: 'drop', logoColor: '#1f6fd0' }, '#2f5fd0');
  for (const t of [-1.45, 1.4]) {
    const p = onFace('front', BW, BD, bx, bz, t, 0.006);
    b.add(new THREE.PlaneGeometry(0.1, 0.2), mat('#f2f2ef'), p.x, Y0 + 0.11, p.z, p.ry);
  }
  // ilova (o‘ng) va kichik ilova (chap)
  b.box(0.55, 0.3, 0.6, wall, bx + BW / 2 + 0.3, Y0, bz + 0.05);
  b.box(0.56, 0.08, 0.61, mat('#b06a55'), bx + BW / 2 + 0.3, Y0, bz + 0.05);
  b.gableRoof(0.62, 0.7, 0.12, roofBlue, bx + BW / 2 + 0.3, Y0 + 0.3, bz + 0.05);
  const dp = onFace('front', 0.55, 0.6, bx + BW / 2 + 0.3, bz + 0.05, 0, 0.006);
  b.add(new THREE.PlaneGeometry(0.1, 0.2), mat('#f2f2ef'), dp.x, Y0 + 0.11, dp.z, dp.ry);
  b.box(0.45, 0.28, 0.45, wall, bx - BW / 2 - 0.25, Y0, bz + 0.1);
  b.gableRoof(0.52, 0.55, 0.1, roofBlue, bx - BW / 2 - 0.25, Y0 + 0.28, bz + 0.1);
  // quvurlar
  const pipe = mat('#b9bec4', { metal: 0.6, rough: 0.35 });
  for (const dy of [0.08, 0.14]) {
    const g = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 10);
    g.rotateZ(Math.PI / 2);
    b.add(g, pipe, bx + 1.45, Y0 + dy, bz + BD / 2 + 0.08);
  }
  for (const x of [bx + 1.0, bx + 1.9]) b.cyl(0.025, 0.025, 0.18, pipe, x, Y0, bz + BD / 2 + 0.08, 10);
  // havzalar
  clarifier(b, -1.15, -0.2, 0.78, -0.9);
  clarifier(b, 1.3, 0.25, 0.75, -0.7);
  // kanallar (old-chap)
  const cxx = -1.3, czz = 1.45, CW = 2.2, CD = 0.75;
  const concrete = mat('#cfcac0', { rough: 0.85 });
  b.box(CW, 0.05, CD, mat('#6f8f8b', { rough: 0.3 }), cxx, Y0, czz);
  for (const t of [-0.5, 0.5]) b.box(CW, 0.18, 0.06, concrete, cxx, Y0, czz + t * CD);
  for (let i = 0; i <= 4; i++) b.box(0.06, 0.18, CD, concrete, cxx - CW / 2 + (i * CW) / 4, Y0, czz);
  b.box(CW, 0.18, 0.06, concrete, cxx, Y0, czz);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.PlaneGeometry(CW / 4 - 0.08, CD / 2 - 0.08);
    g.rotateX(-Math.PI / 2);
    b.add(g, texMat('basinWater', basinWaterTexture, { rough: 0.15, metal: 0.1 }), cxx - CW / 2 + CW / 8 + (i * CW) / 4, Y0 + 0.13, czz - CD / 4);
    b.add(g.clone(), mat('#7e9a8c', { rough: 0.6 }), cxx - CW / 2 + CW / 8 + (i * CW) / 4, Y0 + 0.13, czz + CD / 4);
  }
  const pink = mat('#d98a9a', { rough: 0.5 });
  for (const x of [cxx - 0.5, cxx + 0.55]) {
    b.box(0.08, 0.02, 0.5, pink, x, Y0 + 0.19, czz - 0.55);
    for (const dx of [-0.04, 0.04]) b.box(0.006, 0.06, 0.5, pink, x + dx, Y0 + 0.21, czz - 0.55);
  }
  // yo‘laklar, chiroqlar, archalar
  b.box(0.35, 0.006, 3.2, mat('#bdb9b0', { rough: 0.9 }), 0.15, Y0, -0.1);
  for (const [x, z] of [[-2.6, 0.6], [2.6, -0.6], [2.6, 1.3], [-0.2, -1.2], [-2.6, -1.2]] as const) modernLamp(b, x, z, 0.45);
  for (const [x, z] of [[-2.6, -0.4], [-2.6, 0.2], [-2.0, -1.4], [2.65, 0.0], [2.65, 0.75], [2.1, 1.55], [1.5, 1.6], [0.9, 1.6], [0.3, 1.65], [-2.55, 1.0], [-0.1, -1.25], [2.65, -1.3]] as const) tree(b, x, z, 0.6, 'cypress');
}

// =========================== 7. Xavfsizlik xizmati ===========================

/**
 * xavfsizlik/1–4.png: to‘rt qavatli krem-bej tosh bino (plitka choklari), qizil-jigarrang granit sokol, tik pilyastrlar
 * orasida juft ko‘k derazalar; old tomonda baland shishali markaziy qism (ikki katta oyna, tepasida gerb va yoysimon
 * karniz), pastida «XAVFSIZLIK XIZMATI» tilla yozuvi, jigarrang ustunlar va yog‘och eshiklar, keng kulrang zinapoya.
 * Pog‘onali parapet, tomda panjarali antenna minorasi, bayroq va konditsionerlar. Atrofda tosh ustunli qora panjara,
 * archalar, devor yonida konditsionerlar.
 */
function xavfsizlik(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: -0.7, width: 1.05 }], stone: '#e3cfae', cap: '#efe1c6', base: '#b88a72', ground: '#d6d1c7' });
  const st = stone('#e6d3b4');
  const cream = mat('#ead9bc', { rough: 0.7 });
  const granite = mat('#8e5444', { rough: 0.55 });
  const W = 2.6, D = 1.75, H = 0.9, cx = 0.15, cz = -0.4, fh = 0.2;
  glassBox(b, W, H, D, st, cx, Y0, cz, 0.12);
  b.box(W + 0.03, 0.13, D + 0.03, granite, cx, Y0, cz);
  b.box(W + 0.05, 0.05, D + 0.05, cream, cx, Y0 + H - 0.05, cz);
  flatRoof(b, W, D, cx, Y0 + H, cz, '#7f838a', '#e8d6b8');
  // pog‘onali parapet (burchak bloklari)
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1]] as const) b.box(0.4, 0.08, 0.3, cream, cx + sx * (W / 2 - 0.2), Y0 + H, cz + sz * (D / 2 - 0.15));
  b.box(0.5, 0.06, 0.06, cream, cx + 0.2, Y0 + H + 0.04, cz - 0.1);
  // pilyastrlar va juft derazalar (barcha tomonlar; old tomonda markaziy qism o‘rni bo‘sh)
  const faces: Face[] = ['front', 'back', 'left', 'right'];
  for (const face of faces) {
    const L = face === 'front' || face === 'back' ? W : D;
    const n = Math.round(L / 0.33);
    for (let i = 0; i <= n; i++) {
      const t = -L / 2 + (L * i) / n;
      if (face === 'front' && t > -1.25 && t < -0.15) continue;
      pilaster(b, face, W, D, cx, cz, t, Y0 + 0.13, H - 0.18, 0.05, cream, 0.03);
    }
    for (let i = 0; i < n; i++) {
      const t = -L / 2 + (L * (i + 0.5)) / n;
      if (face === 'front' && t > -1.25 && t < -0.15) continue;
      for (let f = 1; f < 4; f++) win(b, face, W, D, cx, cz, t, Y0 + 0.08 + f * fh, 0.2, 0.1, undefined, 0.1);
      if (i % 3 === 1) win(b, face, W, D, cx, cz, t, Y0 + 0.16, 0.08, 0.05);
    }
  }
  // old markaziy qism: baland oynalar, gerb, yoysimon karniz, yozuv, ustunlar va eshik
  const RW = 1.1, rx = cx - 0.55, rz = cz + D / 2 + 0.06;
  glassBox(b, RW, H + 0.06, 0.12, st, rx, Y0, rz, 0.12);
  b.box(RW + 0.03, 0.13, 0.15, granite, rx, Y0, rz);
  for (const t of [-0.25, 0.25]) win(b, 'front', RW, 0.12, rx, rz, t, Y0 + 0.36, 0.38, 0.4, cream, 0.07);
  pilaster(b, 'front', RW, 0.12, rx, rz, 0, Y0 + 0.33, 0.48, 0.07, cream, 0.04);
  const arch = new THREE.Shape();
  arch.moveTo(-RW / 2, 0); arch.lineTo(RW / 2, 0); arch.lineTo(RW / 2, 0.06); arch.quadraticCurveTo(0, 0.14, -RW / 2, 0.06); arch.closePath();
  b.add(new THREE.ExtrudeGeometry(arch, { depth: 0.04, bevelEnabled: false }), cream, rx, Y0 + H, rz + 0.04);
  emblem(b, 'front', RW, 0.12, rx, rz, 0, Y0 + H - 0.03, 0.05);
  b.box(RW + 0.04, 0.09, 0.16, cream, rx, Y0 + 0.24, rz + 0.04);
  sign(b, 'front', RW + 0.04, 0.24, rx, Y0 + 0.25, rz + 0.04, 0, 0.9, 0.065, { lines: [txt('XAVFSIZLIK XIZMATI', '#a87a2a', 0.95)], bg: null });
  for (const t of [-0.42, -0.14, 0.14, 0.42]) b.box(0.05, 0.11, 0.05, mat('#7a4a3a', { rough: 0.6 }), rx + t, Y0 + 0.13, rz + 0.1);
  const door = onFace('front', RW, 0.12, rx, rz, 0, 0.006);
  b.add(new THREE.PlaneGeometry(0.2, 0.11), mat('#8a5a36', { rough: 0.6 }), door.x, Y0 + 0.185, door.z, door.ry);
  // zinapoya (keng, kulrang) va podium
  b.box(RW + 0.1, 0.13, 0.25, mat('#b9b6b0', { rough: 0.7 }), rx, Y0, rz + 0.18);
  steps(b, rx, rz + 0.3, RW, 6, 0.07, 0.02, '#a9a6a0');
  for (const sx of [-1, 1]) b.box(0.07, 0.13, 0.42, mat('#b9b6b0'), rx + sx * (RW / 2 + 0.03), Y0, rz + 0.51);
  // tom: antenna minorasi, bayroq, konditsionerlar
  latticeTower(b, cx + 0.85, Y0 + H + 0.01, cz - 0.4, 0.5);
  flag(b, rx - 0.2, Y0 + H, rz - 0.25, 0.5);
  for (const [x, z] of [[-0.3, -0.6], [0.1, -0.3], [0.5, 0.1], [-0.6, 0.0], [0.3, -0.8]] as const) hvac(b, cx + x, Y0 + H + 0.012, cz + z, 0.13, 0.11, 0.07);
  // devor yonidagi konditsionerlar, kichik soyabonli eshiklar
  for (const [x, z] of [[cx + 0.5, cz + D / 2 + 0.08], [cx + 0.75, cz + D / 2 + 0.08], [cx - W / 2 - 0.08, cz - 0.3]] as const) b.box(0.1, 0.08, 0.06, mat('#e8e8e6', { rough: 0.5 }), x, Y0, z);
  for (const t of [0.3, -0.5]) {
    const p = onFace('right', W, D, cx, cz, t, 0.006);
    b.add(new THREE.PlaneGeometry(0.1, 0.17), mat('#6f757c'), p.x, Y0 + 0.1, p.z, p.ry);
    const q = onFace('right', W, D, cx, cz, t, 0.06);
    b.box(0.1, 0.015, 0.16, mat('#a9adb2', { metal: 0.3 }), q.x, Y0 + 0.2, q.z);
  }
  // hovli: archalar, butalar
  for (const [x, z, k] of [[-1.6, 0.9, 'cypress'], [-1.65, -1.55, 'cypress'], [1.65, -1.55, 'cypress'], [1.65, 1.4, 'cypress'], [0.55, 1.15, 'cypress'], [1.0, 1.4, 'round'], [-1.6, -0.3, 'cypress']] as const) tree(b, x, z, 0.8, k);
  lawn(b, 0.95, 1.1, 1.3, 0.55, 7, 5);
  lawn(b, -1.6, 0.6, 0.45, 0.7, 4, 8);
}

export const CIVIC_RECIPES: Record<string, Recipe> = {
  civ_hokimlik: hokimlik,
  civ_moliya: moliya,
  civ_soliq: soliq,
  civ_milliy_bank: milliyBank,
  civ_ekologiya: ekologiya,
  civ_suv_tozalash: suvTozalash,
  civ_xavfsizlik: xavfsizlik,
};
