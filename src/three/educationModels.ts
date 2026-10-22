import * as THREE from 'three';
import { Builder, mat } from './builder';
import { block, compound, onFace, setPlot, sign, tree, txt, Y0, type Face } from './businessParts';
import {
  curtainGlassTexture, domeLatticeTexture, louvreTexture, ornateGlassTexture, playFloorTexture, uniWindowTexture,
} from './textures';
import type { Builder as BuilderT } from './builder';

/**
 * «Ta’lim» bo‘limidagi 6 ta binoning hajmli 3D generatorlari. Har biri docs/talim-rasmlar/<tur>/1–4.png dagi
 * rakurslarni bitta izchil modelga birlashtiradi: siluet, qavatlar soni, fasad ranglari, deraza tartibi, tom,
 * kirish va hovli. Yozuvlar devorga yopishgan lavha teksturasi (canvas), bino o‘zi geometriya.
 * Koordinatalar: footprint markazi (0,0,0), old tomon (asosiy kirish) +Z, 1 birlik = 1 katak (10 m).
 */
export type Recipe = (b: BuilderT, w: number, d: number) => void;

const cache = new Map<string, THREE.Material>();
export function texMat(key: string, make: () => THREE.Texture, o: { rough?: number; metal?: number; side?: THREE.Side } = {}) {
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: make(), roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide });
    cache.set(key, m);
  }
  return m;
}
export function basic(color: string) {
  let m = cache.get('basic:' + color);
  if (!m) cache.set('basic:' + color, (m = new THREE.MeshBasicMaterial({ color })));
  return m;
}

/** Tekis yuza (deraza to‘ri, parda devor) — UV takrorlanishi geometriyada, material umumiy qoladi. */
export function panel(b: Builder, w: number, h: number, m: THREE.Material, x: number, y: number, z: number, ry: number, rep: [number, number] = [1, 1]) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep[0], uv.getY(i) * rep[1]);
  b.add(g, m, x, y + h / 2, z, ry);
}

/** Shisha parda quti: har yuzida tekstura katak o‘lchamida takrorlanadi (cho‘zilib ketmaydi). */
export function glassBox(b: Builder, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, cell = 0.11) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // yuzalar tartibi: +x, -x, +y, -y, +z, -z (har biri 4 uch)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(dims[f][0] / cell)), uv.getY(i) * Math.max(1, Math.round(dims[f][1] / cell)));
  }
  b.add(g, m, x, y + h / 2, z);
}

/** Blok tomonidagi panel: face bo‘yicha joylashtiradi. t — tomon bo‘ylab markaz. */
export function facePanel(b: Builder, face: Face, W: number, D: number, cx: number, cz: number, t: number, out: number, w: number, h: number, y: number, m: THREE.Material, rep: [number, number] = [1, 1]) {
  const p = onFace(face, W, D, cx, cz, t, out);
  panel(b, w, h, m, p.x, y, p.z, p.ry, rep);
}

/** Tosh plita uchastka: poydevor, ustki qoplama, chekka bordyur. chamfer — old burchaklar qiyiq (olti burchak shakli). */
export function plaza(b: Builder, w: number, d: number, o: { base?: string; top?: string; chamfer?: number } = {}) {
  setPlot(w, d);
  const hw = w / 2 - 0.02, hd = d / 2 - 0.02, ch = o.chamfer ?? 0;
  const sh = new THREE.Shape();
  sh.moveTo(-hw, -hd);
  sh.lineTo(hw, -hd);
  sh.lineTo(hw, hd - ch);
  sh.lineTo(hw - ch, hd);
  sh.lineTo(-hw + ch, hd);
  sh.lineTo(-hw, hd - ch);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: Y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  b.add(g, mat(o.base ?? '#bdbab3', { rough: 0.9 }), 0, 0, 0);
  const top = new THREE.ShapeGeometry(sh);
  top.rotateX(-Math.PI / 2);
  top.scale(0.985, 1, 0.985);
  b.add(top, mat(o.top ?? '#d6d3cc', { rough: 0.95 }), 0, Y0 + 0.002, 0);
}

/** Ko‘kalamzor to‘shak (maysa + butalar). */
export function lawn(b: Builder, x: number, z: number, w: number, d: number, bushes = 0, seed = 1) {
  b.box(w + 0.03, 0.02, d + 0.03, mat('#cfcac0', { rough: 0.8 }), x, Y0, z);
  b.box(w, 0.012, d, mat('#6fae4a', { rough: 0.95 }), x, Y0 + 0.012, z);
  let r = Math.abs(Math.round(seed)) + 1;
  for (let i = 0; i < bushes; i++) {
    r = (r * 16807) % 2147483647;
    const u = (r % 1000) / 1000;
    r = (r * 16807) % 2147483647;
    const v = (r % 1000) / 1000;
    b.bush(x - w / 2 + 0.06 + u * (w - 0.12), z - d / 2 + 0.06 + v * (d - 0.12), 0.6 + (i % 3) * 0.15, undefined, Y0 + 0.02);
  }
}

/** Zamonaviy ko‘cha chirog‘i (ingichka ustun, tepasida yassi chiroq). */
export function modernLamp(b: Builder, x: number, z: number, h = 0.36) {
  const m = mat('#2a2d32', { rough: 0.4, metal: 0.5 });
  b.cyl(0.007, 0.009, h, m, x, Y0, z, 8);
  b.box(0.05, 0.015, 0.025, m, x + 0.015, Y0 + h, z);
  b.box(0.04, 0.004, 0.02, basic('#fff1c8'), x + 0.015, Y0 + h - 0.003, z);
}

/** Shar fonusli chiroq (Navoiy kutubxonasi maydoni). */
export function globeLamp(b: Builder, x: number, z: number) {
  const m = mat('#2a2d32', { rough: 0.4, metal: 0.5 });
  b.cyl(0.008, 0.011, 0.32, m, x, Y0, z, 8);
  for (const [dx, dy] of [[0, 0.36], [-0.04, 0.3], [0.04, 0.3]]) {
    if (dx) b.box(0.08, 0.006, 0.006, m, x, Y0 + 0.3, z);
    b.add(new THREE.SphereGeometry(0.022, 10, 8), basic('#fbf6e6'), x + dx, Y0 + dy + 0.02, z);
  }
}

/** Antenna ustuni: qizil-oq bo‘laklar, panel antennalar va likopchalar. */
function mast(b: Builder, x: number, y: number, z: number, h: number, seed = 1) {
  const red = mat('#b3473a', { rough: 0.6 });
  const white = mat('#e9e6e0', { rough: 0.6 });
  const n = 4;
  for (let i = 0; i < n; i++) b.cyl(0.012, 0.014, h / n, i % 2 ? white : red, x, y + (i * h) / n, z, 8);
  const grey = mat('#cfd2d4', { rough: 0.5, metal: 0.3 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + seed;
    b.box(0.02, 0.07, 0.012, grey, x + Math.cos(a) * 0.03, y + h * 0.7, z + Math.sin(a) * 0.03, -a);
  }
  const dish = new THREE.CylinderGeometry(0.035, 0.02, 0.015, 12);
  dish.rotateZ(Math.PI / 2);
  b.add(dish, grey, x + 0.04, y + h * 0.5, z, seed);
  b.add(new THREE.SphereGeometry(0.01, 6, 4), red, x, y + h + 0.005, z);
}

/** Tekis tomdagi shamollatish bloklari. */
export function hvac(b: Builder, x: number, y: number, z: number, w: number, d: number, h = 0.06) {
  b.box(w, h, d, mat('#c9ccd0', { rough: 0.5, metal: 0.2 }), x, y, z);
  b.box(w * 0.4, 0.004, d * 0.6, mat('#7e848b'), x, y + h, z);
}

// =========================== 1. O‘zbekiston Milliy universiteti ===========================

/**
 * milliy_universitet/1–4.png: 11 qavatli to‘g‘ri burchakli minora — oq «katak» panjara (gorizontal plitalar va tik
 * qovurg‘alar), har katakda ko‘k deraza; tepada yaxlit oq attik, tomda qizil-oq antennalar. Pastda oynali vestibyul
 * va ustunli; old tomonda past kirish pavilyoni (ustunlar, «O‘ZBEKISTON MILLIY UNIVERSITETI» yozuvi), chap yonda
 * minoradan chiqib turgan yaxlit pilon (tik yozuv), orqa-o‘ngda bir qavatli qanot. Atrofda archalar va daraxtlar.
 */
function milliyUniversitet(b: Builder, w: number, d: number) {
  plaza(b, w, d);
  const white = mat('#f1efe9', { rough: 0.75 });
  const W = 2.3, D = 1.7, cx = 0.1, cz = -0.35;
  const groundH = 0.26, floors = 11, fh = 0.19;
  const y0 = Y0 + groundH, y1 = y0 + floors * fh;
  // vestibyul: ichkariga chekingan to‘q oyna
  glassBox(b, W - 0.16, groundH, D - 0.16, texMat('curtain', () => curtainGlassTexture('#3d6c9e'), { rough: 0.25, metal: 0.3 }), cx, Y0, cz);
  // minora tanasi (ichki hajm) va har tomonda deraza to‘ri
  b.box(W - 0.02, floors * fh, D - 0.02, white, cx, y0, cz);
  const win = texMat('uniwin', uniWindowTexture, { rough: 0.35, metal: 0.15 });
  const bays: Record<Face, number> = { front: 9, back: 9, left: 7, right: 7 };
  for (const face of ['front', 'back', 'left', 'right'] as Face[]) {
    const along = face === 'front' || face === 'back';
    const L = along ? W : D;
    facePanel(b, face, W, D, cx, cz, 0, 0.002, L, floors * fh, y0, win, [bays[face], floors]);
    // tik qovurg‘alar
    for (let i = 0; i <= bays[face]; i++) {
      const t = -L / 2 + (L * i) / bays[face];
      const p = onFace(face, W, D, cx, cz, t, 0.03);
      b.box(along ? 0.034 : 0.06, floors * fh + groundH, along ? 0.06 : 0.034, white, p.x, Y0, p.z);
    }
  }
  // har qavat chizig‘idagi gorizontal plitalar
  for (let f = 0; f <= floors; f++) b.box(W + 0.1, 0.026, D + 0.1, white, cx, y0 + f * fh - 0.013, cz);
  // attik va tom
  b.box(W + 0.1, 0.25, D + 0.1, white, cx, y1, cz);
  b.box(W + 0.14, 0.03, D + 0.14, mat('#e4e1da', { rough: 0.7 }), cx, y1 + 0.25, cz);
  b.box(W - 0.04, 0.01, D - 0.04, mat('#9ea2a6', { rough: 0.9 }), cx, y1 + 0.28, cz);
  const top = y1 + 0.28;
  b.box(0.9, 0.2, 0.65, white, cx - 0.2, top, cz - 0.1);
  b.box(0.42, 0.14, 0.4, white, cx + 0.7, top, cz + 0.4);
  b.box(0.38, 0.12, 0.36, white, cx - 0.8, top, cz + 0.45);
  for (const [x, z, h, s] of [[-0.3, -0.25, 0.62, 1], [0.15, -0.05, 0.5, 2], [0.85, 0.45, 0.42, 3], [-0.85, 0.5, 0.38, 4], [0.85, -0.6, 0.3, 5], [-0.85, -0.6, 0.3, 6]] as const) {
    mast(b, cx + x, top + (Math.abs(x) < 0.5 ? 0.2 : 0.12), cz + z, h, s);
  }
  // chap yondagi yaxlit pilon va tik yozuv
  const pz = cz + 0.3, pw = 0.5;
  b.box(0.16, y1 + 0.32 - Y0, pw, white, cx - W / 2 - 0.06, Y0, pz);
  sign(b, 'left', W + 0.28, D, cx, y1 - 0.62, pz, 0, 0.42, 0.34, {
    lines: [txt('O‘ZBEKISTON', '#1f2f55', 0.33, { serif: true }), txt('MILLIY', '#1f2f55', 0.33, { serif: true }), txt('UNIVERSITETI', '#1f2f55', 0.33, { serif: true })],
    bg: '#f4efe4',
  }, '#d9cfbb');
  // orqa-o‘ng past qanot
  block(b, 1.1, 0.34, 1.25, 1.65, -1.2, { faces: ['front', 'right', 'back'], bay: 0.3, winW: 0.16, winH: 0.12, wall: '#eeece6', frame: '#58616b', warm: false, roof: '#8d9298', parapet: '#f4f2ec', ac: 2, seed: 3 });
  // kirish pavilyoni (old tomon): ustunlar, oynali devor, yozuvli tasma
  const PW = 2.7, PD = 0.55, PH = 0.36, px = 0.1, pzc = cz + D / 2 + PD / 2 - 0.05;
  glassBox(b, PW - 0.1, PH - 0.02, PD - 0.12, texMat('curtain2', () => curtainGlassTexture('#4a79a8'), { rough: 0.25, metal: 0.3 }), px, Y0, pzc - 0.04);
  b.box(PW + 0.08, 0.06, PD + 0.1, white, px, Y0 + PH - 0.02, pzc);
  b.box(PW + 0.08, 0.12, 0.05, white, px, Y0 + PH - 0.09, pzc + PD / 2 + 0.02);
  sign(b, 'front', PW + 0.08, PD + 0.18, px, Y0 + PH - 0.085, pzc, 0, 1.9, 0.09, { lines: [txt('O‘ZBEKISTON MILLIY UNIVERSITETI', '#1f2f55', 1, { serif: true })], bg: null });
  for (let i = 0; i < 8; i++) b.box(0.045, PH - 0.1, 0.045, white, px - PW / 2 + 0.08 + i * ((PW - 0.16) / 7), Y0, pzc + PD / 2 - 0.01);
  for (let k = 0; k < 3; k++) b.box(1.4 - k * 0.1, 0.012, 0.06, mat('#cfcbc3'), px, Y0 + k * 0.012, pzc + PD / 2 + 0.08 + (2 - k) * 0.05);
  // chap old past blok
  block(b, 0.62, 0.3, 0.7, -1.58, 0.55, { faces: ['front', 'left'], bay: 0.28, winW: 0.14, winH: 0.12, wall: '#eeece6', frame: '#58616b', warm: false, roof: '#8d9298', parapet: '#f4f2ec' });
  // obodonlashtirish: yo‘lak, maysalar, chiroqlar, daraxtlar
  b.box(1.2, 0.006, 1.2, mat('#c8c4bb', { rough: 0.9 }), px, Y0, 1.85);
  lawn(b, -1.45, 1.75, 1.6, 0.7, 6, 3);
  lawn(b, 1.65, 1.75, 1.5, 0.7, 6, 7);
  lawn(b, -2.1, -0.8, 0.5, 2.4, 6, 9);
  for (const x of [-0.75, 0.95]) modernLamp(b, x, 1.4);
  for (const [x, z] of [[-2.2, 1.95], [2.2, 1.95], [-2.25, 0.2], [2.25, 0.5], [-1.6, -2.1], [-0.2, -2.15]] as const) modernLamp(b, x, z);
  for (const [x, z, k] of [
    [-2.1, 1.6, 'cypress'], [-1.6, 1.85, 'round'], [-0.95, 1.75, 'cypress'], [1.25, 1.75, 'round'], [1.9, 1.6, 'cypress'], [2.2, 1.0, 'cypress'],
    [-2.2, 0.75, 'cypress'], [-2.2, -0.3, 'round'], [-2.15, -1.3, 'cypress'], [-1.3, -2.1, 'cypress'], [-0.5, -2.15, 'round'], [0.6, -2.15, 'cypress'],
    [2.2, -0.2, 'round'], [2.2, -2.15, 'cypress'],
    [-1.95, 1.45, 'cypress'], [-1.25, 1.5, 'cypress'], [-0.75, 2.0, 'round'], [1.45, 1.45, 'cypress'], [2.0, 1.95, 'cypress'], [0.95, 2.0, 'round'],
  ] as const) tree(b, x, z, 0.9, k);
}

/** Skameyka (yog‘och o‘rindiq, qora oyoqlar). */
export function bench(b: Builder, x: number, z: number, ry = 0) {
  const g = new Builder();
  g.box(0.16, 0.014, 0.05, mat('#b97a43', { rough: 0.7 }), 0, 0.045, 0);
  g.box(0.16, 0.04, 0.01, mat('#b97a43', { rough: 0.7 }), 0, 0.06, -0.022);
  for (const sx of [-0.065, 0.065]) g.box(0.012, 0.045, 0.045, mat('#2a2d32', { metal: 0.4, rough: 0.5 }), sx, 0, 0);
  b.mergeFrom(g, x, z, ry, Y0);
}

/** Arkali deraza (to‘g‘ri burchak + yarim doira tepasi), oq ramka bilan; face tomonida, pastki sathi y. */
export function archWindow(b: Builder, face: Face, W: number, D: number, cx: number, cz: number, t: number, y: number, ww: number, wh: number, glass: THREE.Material, frame: THREE.Material) {
  const shape = (wd: number, h: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(-wd / 2, 0);
    sh.lineTo(wd / 2, 0);
    sh.lineTo(wd / 2, h - wd / 2);
    sh.absarc(0, h - wd / 2, wd / 2, 0, Math.PI, false);
    sh.closePath();
    return sh;
  };
  const p1 = onFace(face, W, D, cx, cz, t, 0.004);
  const fr = new THREE.ShapeGeometry(shape(ww + 0.05, wh + 0.03), 12);
  b.add(fr, frame, p1.x, y - 0.015, p1.z, p1.ry);
  const p2 = onFace(face, W, D, cx, cz, t, 0.008);
  const g = new THREE.ShapeGeometry(shape(ww, wh), 12);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) / ww + 0.5) * 2, (uv.getY(i) / ww) * 2);
  b.add(g, glass, p2.x, y, p2.z, p2.ry);
}

// =========================== 2. Alisher Navoiy Milliy kutubxonasi ===========================

/**
 * navoiy_kutubxona/1–4.png: yirik oq bino, burchaklari yumaloq; qizil granit sokol; baland arkali derazalar
 * (ko‘k oyna ustida tilla naqsh); old tomonda oldinga chiqqan markaziy qism va uning tepasida
 * «ALISHER NAVOIY MILLIY KUTUBXONASI» lavhasi; shisha parda bo‘laklari; ikki qatorli karniz; tomda ikkinchi pog‘ona
 * va sakkiz qirrali past shisha gumbaz. Oldida oval favvorali hovuz, shar chiroqlar, skameykalar, archalar.
 */
function navoiyKutubxona(b: Builder, w: number, d: number) {
  plaza(b, w, d, { chamfer: 1.0, top: '#ddd8ce' });
  const white = mat('#f4f0e7', { rough: 0.7 });
  const cream = mat('#e7e0d1', { rough: 0.7 });
  const granite = mat('#9a5546', { rough: 0.55 });
  const glass = texMat('ornate', ornateGlassTexture, { rough: 0.25, metal: 0.25 });
  const curtain = texMat('curtainNav', () => curtainGlassTexture('#2f6fb0'), { rough: 0.2, metal: 0.35 });
  const W = 4.4, D = 2.5, H = 1.2, cx = 0, cz = -1.05, R = 0.42;
  b.roundedBand(W + 0.06, D + 0.06, R + 0.03, 0.16, granite, granite, cx, Y0, cz);
  b.roundedBand(W, D, R, H, white, mat('#c6c3bc', { rough: 0.9 }), cx, Y0 + 0.16, cz);
  b.roundedBand(W + 0.05, D + 0.05, R + 0.025, 0.025, cream, null, cx, Y0 + H - 0.08, cz);
  b.roundedBand(W + 0.1, D + 0.1, R + 0.05, 0.07, white, mat('#c6c3bc', { rough: 0.9 }), cx, Y0 + H + 0.1, cz);
  // tik pilyastrlar (oq, biroz chiqib turadi)
  const pil = (face: Face, t: number, len: number) => {
    const p = onFace(face, W, D, cx, cz, t, 0.012);
    const along = face === 'front' || face === 'back';
    b.box(along ? 0.07 : 0.03, H - 0.08, along ? 0.03 : 0.07, cream, p.x, Y0 + 0.16, p.z);
    void len;
  };
  // old tomon: chetlarda arkali derazalar, shisha parda bo‘laklari, markaziy qism
  for (const sx of [-1, 1]) {
    for (const t of [1.55, 1.25]) archWindow(b, 'front', W, D, cx, cz, sx * t, Y0 + 0.26, 0.2, 0.84, glass, cream);
    pil('front', sx * 1.4, 0);
    const q = onFace('front', W, D, cx, cz, sx * 0.95, 0.03);
    glassBox(b, 0.42, H - 0.12, 0.05, curtain, q.x, Y0 + 0.16, q.z);
    pil('front', sx * 0.72, 0);
  }
  // markaziy qism (risalit) — oldinga chiqadi, ustida lavha
  const RW = 1.3;
  const rz = cz + D / 2 + 0.06;
  b.box(RW, H + 0.06, 0.14, white, cx, Y0 + 0.16, rz);
  b.box(RW + 0.06, 0.06, 0.18, cream, cx, Y0 + H + 0.2, rz);
  for (const t of [-0.38, 0, 0.38]) archWindow(b, 'front', RW, 0.14, cx, rz, t, Y0 + 0.26, 0.2, 0.7, glass, cream);
  sign(b, 'front', RW, 0.14, cx, Y0 + 1.04, rz, 0, 1.05, 0.22, {
    lines: [txt('ALISHER NAVOIY', '#2a2f3a', 0.5, { serif: true }), txt('MILLIY KUTUBXONASI', '#2a2f3a', 0.5, { serif: true })], bg: '#f6f1e6',
  }, '#cdbf9f');
  // yon va orqa tomonlar: arkali derazalar va pilyastrlar
  for (const face of ['left', 'right'] as Face[]) {
    for (const t of [-0.55, 0, 0.55]) archWindow(b, face, W, D, cx, cz, t, Y0 + 0.26, 0.22, 0.84, glass, cream);
    for (const t of [-0.28, 0.28]) pil(face, t, 0);
  }
  for (const t of [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5]) archWindow(b, 'back', W, D, cx, cz, t, Y0 + 0.26, 0.2, 0.84, glass, cream);
  // kirish ayvoni (o‘ng shisha bo‘lak oldida): shisha soyabon, eshik, zinapoya
  const ex = 0.95, ez = cz + D / 2;
  b.box(0.3, 0.26, 0.012, texMat('curtainDoor', () => curtainGlassTexture('#3a76b6'), { rough: 0.2, metal: 0.3 }), ex, Y0 + 0.16, ez + 0.06);
  b.box(0.52, 0.025, 0.34, clearPane(), ex, Y0 + 0.44, ez + 0.2);
  b.box(0.54, 0.02, 0.02, mat('#b9bec4', { metal: 0.6, rough: 0.3 }), ex, Y0 + 0.44, ez + 0.37);
  for (const sx of [-0.24, 0.24]) b.box(0.016, 0.44 - 0.16, 0.016, mat('#b9bec4', { metal: 0.6, rough: 0.3 }), ex + sx, Y0 + 0.16, ez + 0.35);
  for (let k = 0; k < 3; k++) b.box(0.62, 0.05, 0.07 + (2 - k) * 0.07, mat('#cfc9bd'), ex, Y0 + k * 0.05, ez + 0.07 + ((2 - k) * 0.07) / 2);
  // tomdagi ikkinchi pog‘ona, baraban va sakkiz qirrali shisha gumbaz
  const ty = Y0 + H + 0.17;
  b.roundedBand(W - 1.1, D - 0.9, 0.25, 0.14, white, mat('#c6c3bc', { rough: 0.9 }), cx, ty, cz);
  b.roundedBand(W - 1.05, D - 0.85, 0.27, 0.03, cream, null, cx, ty + 0.12, cz);
  const drum = new THREE.CylinderGeometry(0.66, 0.66, 0.14, 8);
  drum.rotateY(Math.PI / 8);
  b.add(drum, white, cx, ty + 0.14 + 0.07, cz);
  const ring = new THREE.CylinderGeometry(0.7, 0.7, 0.03, 8);
  ring.rotateY(Math.PI / 8);
  b.add(ring, cream, cx, ty + 0.28 + 0.015, cz);
  // sakkiz qirrali past shisha gumbaz: ko‘k oyna + qirralar bo‘ylab oq qovurg‘alar
  const dr = 0.68, dh = 0.3, dy = ty + 0.31;
  const dome = new THREE.ConeGeometry(dr, dh, 8, 1);
  dome.rotateY(Math.PI / 8);
  b.add(dome, mat('#4f8fcf', { rough: 0.15, metal: 0.35 }), cx, dy + dh / 2, cz);
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 8; k++) {
    const phi = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const base = new THREE.Vector3(Math.sin(phi) * dr, 0, Math.cos(phi) * dr);
    const dir = new THREE.Vector3(0, dh, 0).sub(base);
    const rib = new THREE.CylinderGeometry(0.008, 0.008, dir.length(), 4);
    rib.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()));
    b.add(rib, mat('#eef0f2', { rough: 0.4 }), cx + base.x / 2, dy + dh / 2, cz + base.z / 2);
  }
  b.cyl(0.03, 0.04, 0.05, mat('#c9ccd0', { metal: 0.6, rough: 0.3 }), cx, ty + 0.6, cz, 8);
  for (const [x, z] of [[-1.75, -1.9], [1.75, -1.9], [-1.7, -0.05], [1.7, -0.05]] as const) b.box(0.32, 0.12, 0.24, white, x, Y0 + H + 0.17, z);
  // favvorali oval hovuz
  const pz = 1.6;
  const rim = new THREE.CylinderGeometry(1, 1, 0.06, 48);
  rim.scale(1.75, 1, 0.62);
  b.add(rim, mat('#d8d3c8', { rough: 0.7 }), 0, Y0 + 0.03, pz);
  const water = new THREE.CylinderGeometry(1, 1, 0.01, 48);
  water.scale(1.67, 1, 0.55);
  b.add(water, mat('#5aa6dc', { rough: 0.08, metal: 0.25 }), 0, Y0 + 0.06, pz);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.018, 0.08, 6), basic('#e8f4fb'), Math.cos(a) * 1.25, Y0 + 0.1, pz + Math.sin(a) * 0.38);
  }
  b.add(new THREE.ConeGeometry(0.03, 0.16, 8), basic('#eef8fd'), 0, Y0 + 0.14, pz);
  // atrofdagi chiroqlar, skameykalar, mashinalar, gulzorlar, archalar
  for (const [x, z] of [[-2.0, 1.1], [2.0, 1.1], [-1.2, 2.45], [1.2, 2.45], [-2.45, 0.3], [2.45, 0.3], [0, 0.65]] as const) globeLamp(b, x, z);
  for (const [x, z, r] of [[-0.6, 2.4, 0], [0.6, 2.4, 0], [-2.15, 1.65, Math.PI / 2], [2.15, 1.65, -Math.PI / 2]] as const) bench(b, x, z, r);
  carAt(b, 1.6, 0.55, '#f2f2f2', Math.PI / 2);
  carAt(b, 2.05, 0.55, '#d9dde2', Math.PI / 2);
  lawn(b, -2.3, -1.0, 0.6, 2.2, 6, 2);
  lawn(b, 2.3, -1.0, 0.6, 2.2, 6, 5);
  lawn(b, -1.55, 0.6, 0.7, 0.35, 3, 8);
  for (const [x, z, k] of [
    [-2.6, -2.6, 'cypress'], [-2.55, -1.6, 'cypress'], [-2.5, -0.6, 'round'], [-2.6, 0.75, 'cypress'], [-2.2, 2.2, 'cypress'], [-1.6, 2.6, 'cypress'],
    [2.6, -2.6, 'cypress'], [2.55, -1.5, 'round'], [2.55, -0.5, 'cypress'], [2.6, 0.85, 'cypress'], [2.2, 2.2, 'cypress'], [1.6, 2.6, 'cypress'],
    [-0.4, -2.65, 'cypress'], [0.6, -2.65, 'cypress'], [-1.6, 0.6, 'round'],
  ] as const) tree(b, x, z, 0.9, k);
}

export function clearPane() {
  let m = cache.get('clearPane');
  if (!m) cache.set('clearPane', (m = new THREE.MeshStandardMaterial({ color: '#d9eef6', transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2, depthWrite: false })));
  m.userData.noShadow = true;
  return m;
}

function carAt(b: Builder, x: number, z: number, color: string, ry = 0) {
  const g = new Builder();
  g.car(0, 0, color);
  b.mergeFrom(g, x, z, ry, Y0);
}

// =========================== 3. Respublika bolalar kutubxonasi ===========================

/**
 * bolalar_kutubxona/1–4.png: bir qavatli tarixiy bino — och yashil devor, oq deraza ramkalari va burchak
 * rustlari, kulrang tosh sokol, kulrang metall to‘rt nishabli tomlar va mo‘rilar. O‘ng burchakda dumaloq minora
 * (tepasida oq ustunchali halqa, konus tom). Chap tomonda frontonli kirish (arkali eshik, zinapoya) va ustida
 * «RESPUBLIKA BOLALAR KUTUBXONASI» lavhasi. Oldida o‘qish bog‘i: plitka yo‘laklar, gulzorlar, skameyka-tuvaklar,
 * past chiroqlar, baland qarag‘ay va yosh daraxtlar.
 */
function bolalarKutubxona(b: Builder, w: number, d: number) {
  plaza(b, w, d, { top: '#dcd8cf', base: '#c4c0b8' });
  const mint = '#cfe4da';
  const trim = mat('#f8f7f3', { rough: 0.6 });
  const roofM = mat('#7c858d', { rough: 0.45, metal: 0.35 });
  const stone = mat('#8d8e8b', { rough: 0.85 });
  const opts = (faces: Face[], skipAt?: number) => ({
    wall: mint, floors: 1, faces, bay: 0.34, winW: 0.13, winH: 0.24, frame: '#f8f7f3', warm: false, muntin: true,
    roof: null, cornice: '#f8f7f3', plinth: '#8d8e8b', sill: true,
    skip: skipAt !== undefined ? [{ face: 'front' as Face, at: skipAt, width: 0.5 }] : undefined,
  });
  // asosiy qanot
  const W = 2.5, D = 0.95, H = 0.42, cx = -0.4, cz = -0.5;
  b.building(W, H, D, opts(['front', 'back', 'left'], -0.75), cx, Y0, cz);
  b.hipRoof(W + 0.08, D + 0.1, 0.24, roofM, cx, Y0 + H, cz);
  // o‘ng-orqa qanot
  const W2 = 0.95, D2 = 1.3, cx2 = 1.2, cz2 = -0.62;
  b.building(W2, H, D2, opts(['back', 'right']), cx2, Y0, cz2);
  b.hipRoof(W2 + 0.08, D2 + 0.1, 0.24, roofM, cx2, Y0 + H, cz2);
  // burchak rustlari
  for (const [x, z] of [[cx - W / 2, cz + D / 2], [cx - W / 2, cz - D / 2], [cx2 + W2 / 2, cz2 - D2 / 2], [cx + W / 2, cz + D / 2]] as const) {
    for (let k = 0; k < 5; k++) b.box(k % 2 ? 0.05 : 0.07, 0.06, k % 2 ? 0.05 : 0.07, trim, x, Y0 + 0.07 + k * 0.07, z);
  }
  // mo‘rilar va suv quvurlari
  for (const [x, z] of [[-1.2, -0.6], [0.0, -0.35], [1.25, -0.9]] as const) {
    b.box(0.07, 0.14, 0.07, mat('#d9d6cf'), x, Y0 + H + 0.12, z);
    b.box(0.09, 0.02, 0.09, mat('#b8b5ae'), x, Y0 + H + 0.26, z);
  }
  for (const x of [cx - W / 2 + 0.03, 0.75]) b.cyl(0.008, 0.008, H, mat('#4a4f55', { metal: 0.4 }), x, Y0, cz + D / 2 + 0.01, 6);
  // kirish: frontonli risalit, arkali eshik, lavha, zinapoya
  const ex = -1.15, ez = cz + D / 2 + 0.04;
  b.box(0.56, H + 0.08, 0.08, mat(mint, { rough: 0.85 }), ex, Y0, ez);
  for (const sx of [-0.25, 0.25]) for (let k = 0; k < 6; k++) b.box(k % 2 ? 0.05 : 0.07, 0.06, 0.1, trim, ex + sx, Y0 + 0.05 + k * 0.07, ez);
  b.box(0.6, 0.04, 0.11, trim, ex, Y0 + H + 0.06, ez);
  const ped = new THREE.Shape();
  ped.moveTo(-0.32, 0); ped.lineTo(0.32, 0); ped.lineTo(0, 0.13); ped.closePath();
  b.add(new THREE.ExtrudeGeometry(ped, { depth: 0.1, bevelEnabled: false }), trim, ex, Y0 + H + 0.1, ez - 0.05);
  const door = new THREE.Shape();
  door.moveTo(-0.08, 0); door.lineTo(0.08, 0); door.lineTo(0.08, 0.2); door.absarc(0, 0.2, 0.08, 0, Math.PI, false); door.closePath();
  b.add(new THREE.ShapeGeometry(door, 10), mat('#d8d2c4', { rough: 0.5 }), ex, Y0 + 0.04, ez + 0.042);
  b.box(0.15, 0.2, 0.01, mat('#8a8173', { rough: 0.6 }), ex, Y0 + 0.045, ez + 0.044);
  sign(b, 'front', 0.56, 0.08, ex, Y0 + 0.31, ez, 0, 0.5, 0.11, {
    lines: [txt('RESPUBLIKA BOLALAR', '#1f2f55', 0.5, { serif: true }), txt('KUTUBXONASI', '#1f2f55', 0.5, { serif: true })], bg: '#fbfaf6',
  });
  for (let k = 0; k < 3; k++) b.box(0.5 - k * 0.06, 0.02, 0.06, mat('#cfcac0'), ex, Y0 + k * 0.02, ez + 0.08 + (2 - k) * 0.05);
  // yon devordagi ikkinchi lavha (chap tomon)
  sign(b, 'left', W, D, cx, Y0 + 0.16, cz, 0, 0.5, 0.15, {
    lines: [txt('RESPUBLIKA BOLALAR', '#1f2f55', 0.5, { serif: true }), txt('KUTUBXONASI', '#1f2f55', 0.5, { serif: true })], bg: '#f3efe4',
  }, '#c9c2b0');
  // dumaloq minora (o‘ng old burchak)
  const tx = 1.25, tz = 0.12, TR = 0.36;
  b.cyl(TR + 0.02, TR + 0.02, 0.08, stone, tx, Y0, tz, 24);
  b.cyl(TR, TR, H + 0.02, mat(mint, { rough: 0.85 }), tx, Y0 + 0.08, tz, 24);
  b.cyl(TR + 0.025, TR + 0.025, 0.03, trim, tx, Y0 + H + 0.08, tz, 24);
  b.cyl(TR - 0.03, TR - 0.03, 0.13, mat(mint, { rough: 0.85 }), tx, Y0 + H + 0.11, tz, 24);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.box(0.035, 0.13, 0.03, trim, tx + Math.cos(a) * (TR - 0.015), Y0 + H + 0.11, tz + Math.sin(a) * (TR - 0.015), -a);
  }
  b.cyl(TR + 0.035, TR + 0.035, 0.03, trim, tx, Y0 + H + 0.24, tz, 24);
  b.add(new THREE.ConeGeometry(TR + 0.05, 0.3, 24), roofM, tx, Y0 + H + 0.27 + 0.15, tz);
  b.cyl(0.006, 0.006, 0.06, mat('#5a6168', { metal: 0.5 }), tx, Y0 + H + 0.57, tz, 6);
  for (const a of [-0.3, 0.55, 1.4]) {
    const px = tx + Math.sin(a) * (TR + 0.004), pz = tz + Math.cos(a) * (TR + 0.004);
    b.box(0.13, 0.25, 0.012, trim, px, Y0 + 0.17, pz, a);
    b.box(0.1, 0.21, 0.014, mat('#5e7686', { rough: 0.25, metal: 0.2 }), px, Y0 + 0.19, pz, a);
  }
  // o‘qish bog‘i
  b.box(3.6, 0.006, 1.0, mat('#e3dfd6', { rough: 0.9 }), 0, Y0, 0.9);
  lawn(b, -0.55, 0.75, 0.9, 0.42, 7, 3);
  lawn(b, 0.55, 1.15, 0.9, 0.36, 7, 6);
  lawn(b, -1.55, 1.1, 0.7, 0.45, 6, 9);
  lawn(b, 1.55, 1.15, 0.6, 0.35, 5, 4);
  for (const [x, z] of [[-0.3, 1.25], [0.75, 0.6]] as const) {
    b.box(0.32, 0.07, 0.11, mat('#ecebe6', { rough: 0.6 }), x, Y0, z);
    b.box(0.3, 0.012, 0.09, mat('#c18a4f', { rough: 0.7 }), x, Y0 + 0.07, z);
  }
  b.box(0.06, 0.09, 0.06, mat('#b07a46', { rough: 0.7 }), 0.15, Y0, 0.55);
  for (const [x, z] of [[-1.0, 0.45], [-0.1, 0.45], [0.4, 1.35], [1.3, 0.75], [-1.7, 0.65]] as const) {
    b.cyl(0.012, 0.012, 0.07, mat('#2a2d32', { metal: 0.4 }), x, Y0, z, 8);
    b.box(0.02, 0.01, 0.02, basic('#fff1c8'), x, Y0 + 0.07, z);
  }
  tree(b, 0.15, 1.05, 1.35, 'round');
  tree(b, -1.55, 1.15, 1.05, 'round');
  tree(b, 1.75, 1.2, 0.9, 'round');
  tree(b, -1.8, -1.2, 1.0, 'round');
  tree(b, 1.75, -1.3, 0.85, 'cypress');
}

// =========================== 4. Muhammad al-Xorazmiy maktabi ===========================

/**
 * xorazmiy_maktab/1–3.png: uch qavatli oq bino, ichki hovli (maysa, daraxtlar) atrofida yopiq halqa; jigarrang-kulrang
 * sokol, tor tik derazalar; tomda konditsionerlar va jigarrang panjarali gumbaz. Old-o‘ng burchakda o‘ziga xos
 * kirish: katta shisha hajm ustida qiya kesilgan oq pona va unda «MUHAMMAD AL-XORAZMIY MAKTABI» yozuvi, yonida
 * plitkali maydon. Atrof oq ustunli panjara bilan o‘ralgan. (To‘rtinchi rakurs berilmagan — orqa tomon izchil davom ettirilgan.)
 */
function xorazmiyMaktab(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 1.55, width: 0.7 }, { face: 'right', at: 1.3, width: 0.4 }], stone: '#f1f0ec', cap: '#ffffff', base: '#cfccc5', ground: '#d9d6cf' });
  const H = 0.62;
  const o = { floors: 3, bay: 0.2, winW: 0.075, winH: 0.15, wall: '#f5f4f0', frame: '#38424c', warm: false, roof: '#cfcfcb', parapet: '#f7f6f2', plinth: '#8a7b70' };
  const wings: [number, number, number, number][] = [
    [-0.2, -1.75, 3.8, 0.7],
    [-1.75, -0.1, 0.7, 2.6],
    [-0.6, 0.85, 1.6, 0.7],
    [1.35, -0.45, 0.7, 1.9],
  ];
  wings.forEach(([x, z, ww, dd], i) => block(b, ww, H, dd, x, z, { ...o, ac: 3, seed: i + 2 }));
  // jigarrang-kulrang sokol (pastki qavat bo‘ylab)
  for (const [x, z, ww, dd] of wings) b.box(ww + 0.012, 0.09, dd + 0.012, mat('#8a7b70', { rough: 0.85 }), x, Y0, z);
  // ichki hovli: maysa, yo‘lak, daraxtlar
  lawn(b, -0.2, -0.45, 2.3, 1.8, 5, 4);
  b.box(0.18, 0.01, 1.8, mat('#d9d6cf'), -0.2, Y0 + 0.012, -0.45);
  tree(b, -0.75, -0.8, 0.85, 'round');
  tree(b, 0.45, -0.1, 0.8, 'round');
  // kirish: shisha hajm + qiya oq pona va yozuv
  const ex0 = 0.2, ex1 = 1.7, ez = 0.85, ED = 0.7;
  const glassM = texMat('curtainX', () => curtainGlassTexture('#3a77ad'), { rough: 0.2, metal: 0.35 });
  glassBox(b, ex1 - ex0 - 0.04, 0.4, ED - 0.04, glassM, (ex0 + ex1) / 2, Y0, ez, 0.1);
  b.box(ex1 - ex0, 0.025, ED, mat('#e9e8e4'), (ex0 + ex1) / 2, Y0 + 0.4, ez);
  const wedge = new THREE.Shape();
  wedge.moveTo(ex0, 0.42); wedge.lineTo(ex1, 0.42); wedge.lineTo(ex1, 0.5); wedge.lineTo(ex0, H + 0.2); wedge.closePath();
  const wg = new THREE.ExtrudeGeometry(wedge, { depth: ED, bevelEnabled: false });
  b.add(wg, mat('#f7f6f3', { rough: 0.6 }), 0, Y0, ez - ED / 2);
  sign(b, 'front', 1.0, ED, ex0 + 0.6, Y0 + 0.44, ez, 0, 0.98, 0.13, {
    lines: [txt('MUHAMMAD AL-XORAZMIY', '#1f2f55', 0.5, { serif: true }), txt('MAKTABI', '#1f2f55', 0.5, { serif: true })], bg: null,
  });
  // gumbaz (orqa-chap burchakdagi tomda)
  const dx = -1.6, dz = -1.6, dy = Y0 + H;
  b.cyl(0.3, 0.3, 0.06, mat('#f1efea'), dx, dy, dz, 24);
  const dome = new THREE.SphereGeometry(0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add(dome, texMat('domeLattice', domeLatticeTexture, { rough: 0.6 }), dx, dy + 0.06, dz);
  // old maydon: plitka, tuvakdagi daraxtlar, chiroqlar, zinapoya
  b.box(1.3, 0.006, 2.0, mat('#e1ddd4', { rough: 0.9 }), 1.75, Y0, 1.1);
  for (const [x, z] of [[2.05, 0.4], [1.0, 1.65], [2.05, 1.55]] as const) {
    b.box(0.2, 0.05, 0.2, mat('#d5d1c8'), x, Y0, z);
    tree(b, x, z, 0.75, 'round');
  }
  for (const [x, z] of [[1.45, 1.75], [2.2, 0.95]] as const) modernLamp(b, x, z);
  for (let k = 0; k < 3; k++) b.box(0.5, 0.02, 0.06, mat('#cfcac0'), 0.5, Y0 + k * 0.02, ez + ED / 2 + 0.04 + (2 - k) * 0.05);
  for (const [x, z, k] of [
    [-2.25, 1.6, 'cypress'], [-1.6, 2.2, 'cypress'], [-0.8, 2.2, 'cypress'], [0.0, 2.2, 'cypress'], [0.8, 2.2, 'cypress'],
    [2.25, -0.4, 'cypress'], [2.25, -1.2, 'cypress'], [2.25, -2.1, 'round'], [-2.25, -2.2, 'round'], [-2.3, 0.6, 'cypress'],
  ] as const) tree(b, x, z, 0.85, k);
}

// =========================== 5. Toshkent Prezident maktabi ===========================

/**
 * prezident_maktab/1–4.png: uzun ikki qavatli bino; krem-oq fasad, ikki chetida g‘isht rangli tik pilyastrlar
 * (derazalar orasida), markazda katta «PREZIDENT MAKTABI» lavhasi; sariq kirish hajmi, uning ustida to‘q kulrang
 * soyabon va to‘q sariq hoshiya, keng zinapoya va panjarali pandus. To‘q kulrang tekis tom: ko‘p shamollatish
 * bloklari va yorug‘lik fonari. Oldida keng plitkali maydon: maysali tuvaklar, yosh daraxtlar, chiroqlar, skameykalar.
 */
function prezidentMaktab(b: Builder, w: number, d: number) {
  plaza(b, w, d, { top: '#d9d6d0', base: '#bdb9b2' });
  const W = 3.9, D = 1.25, H = 0.5, cx = 0, cz = -0.95;
  const bay = 0.2;
  block(b, W, H, D, cx, cz, {
    floors: 2, bay, winW: 0.08, winH: 0.15, wall: '#eee8dc', frame: '#3b4148', warm: false, roof: '#4f5358', parapet: '#e9e3d6', plinth: '#6f7378',
    skip: [{ face: 'front', at: 0, width: 1.0 }],
  });
  // g‘isht pilyastrlar (derazalar oralig‘ida) — chetki bo‘laklarda, old va orqa tomonda; yon tomonlarda hammasi
  const brick = mat('#a4523d', { rough: 0.8 });
  const piers = (face: Face, len: number, edgeOnly: boolean) => {
    const n = Math.max(1, Math.floor((len - 0.08) / bay));
    const step = (len - 0.08) / n;
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + 0.04 + step * i;
      if (edgeOnly && Math.abs(t) < 1.0) continue;
      const p = onFace(face, W, D, cx, cz, t, 0.012);
      const along = face === 'front' || face === 'back';
      b.box(along ? 0.1 : 0.024, H - 0.04, along ? 0.024 : 0.1, brick, p.x, Y0 + 0.02, p.z);
    }
  };
  piers('front', W, true);
  piers('back', W, true);
  piers('left', D, false);
  piers('right', D, false);
  // markaziy lavha (ikkinchi qavat ustida krem panel)
  const fz = cz + D / 2;
  b.box(1.5, 0.2, 0.03, mat('#f1ebdf', { rough: 0.6 }), cx, Y0 + 0.28, fz + 0.015);
  sign(b, 'front', W, D + 0.06, cx, Y0 + 0.3, cz, 0, 1.36, 0.16, { lines: [txt('PREZIDENT MAKTABI', '#1f2f55', 0.95, { serif: true })], bg: '#f6f1e6' }, '#b9ab8c');
  // sariq kirish hajmi, oynali eshiklar, soyabon (to‘q sariq hoshiya)
  // sariq hajm lavha ostigacha ko‘tariladi; soyabon uning old qismini yopadi, yon tomonlari ochiq ko‘rinadi
  b.box(1.1, 0.27, 0.2, mat('#f2b81c', { rough: 0.55 }), cx, Y0, fz + 0.1);
  glassBox(b, 0.62, 0.18, 0.012, texMat('curtainP', () => curtainGlassTexture('#3a5f86'), { rough: 0.2, metal: 0.3 }), cx, Y0 + 0.01, fz + 0.205, 0.08);
  b.box(1.4, 0.03, 0.42, mat('#4c5157', { rough: 0.6 }), cx - 0.08, Y0 + 0.21, fz + 0.24);
  b.box(1.42, 0.04, 0.02, mat('#f08a24', { rough: 0.5 }), cx - 0.08, Y0 + 0.2, fz + 0.45);
  for (const sx of [-1, 1]) b.box(0.02, 0.04, 0.42, mat('#f08a24', { rough: 0.5 }), cx - 0.08 + sx * 0.71, Y0 + 0.2, fz + 0.24);
  for (let k = 0; k < 3; k++) b.box(1.1, 0.02, 0.07, mat('#c5c1b9'), cx, Y0 + k * 0.02, fz + 0.48 + (2 - k) * 0.06);
  // pandus va panjara (chapda)
  const ramp = new THREE.BoxGeometry(0.16, 0.012, 0.6);
  ramp.rotateX(0.12);
  b.add(ramp, mat('#c5c1b9'), cx - 0.75, Y0 + 0.04, fz + 0.5);
  for (const sx of [-0.08, 0.08]) b.box(0.006, 0.006, 0.6, mat('#b9bec4', { metal: 0.6, rough: 0.3 }), cx - 0.75 + sx, Y0 + 0.1, fz + 0.5);
  b.box(0.15, 0.08, 0.12, mat('#7bab4f', { rough: 0.9 }), cx + 0.62, Y0 + 0.01, fz + 0.3);
  // tom: shamollatish bloklari va yorug‘lik fonari
  const ry = Y0 + H;
  for (const [x, z, ww, dd] of [[-1.5, -1.25, 0.2, 0.14], [-1.1, -0.7, 0.16, 0.12], [-0.6, -1.15, 0.24, 0.16], [0.5, -1.2, 0.22, 0.16], [1.05, -0.7, 0.2, 0.14], [1.5, -1.1, 0.16, 0.2], [-0.2, -0.65, 0.12, 0.1], [1.75, -1.35, 0.12, 0.1]] as const) hvac(b, x, ry, z, ww, dd, 0.07);
  b.gableRoof(0.5, 0.2, 0.06, clearPane(), 0.15, ry + 0.012, -0.95);
  // maydon: maysali tuvaklar, daraxtlar, chiroqlar, skameykalar
  for (const [x, z] of [[-1.9, 0.55], [-1.2, 1.35], [1.2, 1.35], [1.9, 0.55], [-2.0, 1.6], [2.0, 1.6]] as const) {
    lawn(b, x, z, 0.5, 0.36, 3, Math.round(x * 10));
    tree(b, x, z, 0.75, 'round');
  }
  for (const [x, z] of [[-0.9, 1.05], [0.9, 1.05], [-1.5, 1.85], [1.5, 1.85]] as const) modernLamp(b, x, z);
  for (const [x, z, r] of [[-0.45, 1.5, 0], [0.45, 1.5, 0]] as const) bench(b, x, z, r);
  for (const [x, z, k] of [[-2.25, -1.8, 'cypress'], [-2.25, -0.4, 'cypress'], [2.25, -1.8, 'cypress'], [2.25, -0.4, 'round'], [0, -1.85, 'cypress']] as const) tree(b, x, z, 0.85, k);
}

// =========================== 6. INVENTO (Tashkent City kampusi) ===========================

/**
 * invento/1–4.png: uch qavatli zamonaviy bino — oq devorlar, chap qismning pastki qavati kulrang tosh, katta to‘q
 * oynalar; old tomonda oldinga chiqqan markaziy qism: sariq va kulrang tik panellar, ustida oq soyabon va
 * «INVENTO» yozuvi, pastda oynali kirish; yashil tik jalyuzilar (o‘ng yonida va chap qanotda). Tekis tom, zinapoya
 * bloklari. Chap yon hovlida rangli rezina qoplamali bolalar maydonchasi (qizil tomli minorali tepalik, sirpanchiq).
 * Atrof kulrang tosh ustunli panjara, kirish oldida tosh tuvaklar va daraxtlar.
 */
function invento(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 0.55, width: 0.75 }], stone: '#a9a9a5', cap: '#c9c9c5', base: '#b4b3ae', ground: '#d6d4cf' });
  const W = 2.3, D = 1.45, H = 0.72, cx = 0.55, cz = -0.5;
  block(b, W, H, D, cx, cz, {
    floors: 3, bay: 0.28, winW: 0.17, winH: 0.15, wall: '#f4f4f2', frame: '#39424a', warm: false, roof: '#9a9d9f', parapet: '#e2e3e1', plinth: '#8f9091',
    skip: [{ face: 'front', at: 0, width: 0.9 }],
  });
  const grey = mat('#6d7176', { rough: 0.7 });
  const stone = mat('#8f9091', { rough: 0.85 });
  const louvre = texMat('louvre', louvreTexture, { rough: 0.45, metal: 0.1 });
  const fz = cz + D / 2;
  // chap qanot pastki qavati — kulrang tosh, yon tomonda yashil jalyuzi
  b.box(0.72, 0.25, D + 0.012, stone, cx - W / 2 + 0.36, Y0, cz);
  facePanel(b, 'front', W, D, cx, cz, -W / 2 + 0.36, 0.008, 0.36, 0.22, Y0 + 0.01, louvre, [3, 1]);
  facePanel(b, 'left', W, D, cx, cz, 0.35, 0.008, 0.3, H - 0.1, Y0 + 0.05, louvre, [2, 2]);
  // markaziy oldinga chiqqan qism: kulrang asos, sariq tik panellar, derazalar
  const CW = 0.92, cz2 = fz + 0.07;
  b.box(CW, H + 0.03, 0.14, grey, cx, Y0, cz2);
  const yellow = mat('#f2b51c', { rough: 0.55 });
  const winM = texMat('curtainI', () => curtainGlassTexture('#2f6680'), { rough: 0.2, metal: 0.3 });
  for (let f = 1; f < 3; f++) {
    for (let i = 0; i < 4; i++) {
      const t = -CW / 2 + 0.115 + i * 0.23;
      b.box(0.09, 0.2, 0.012, i % 2 ? winM : yellow, cx + t - 0.05, Y0 + f * 0.24 + 0.02, cz2 + 0.072);
      b.box(0.09, 0.2, 0.012, i % 2 ? yellow : winM, cx + t + 0.05, Y0 + f * 0.24 + 0.02, cz2 + 0.072);
    }
  }
  b.box(CW + 0.1, 0.035, 0.16, mat('#e9e9e7'), cx, Y0 + H + 0.03, cz2);
  // kirish: oynali devor, oq soyabon va INVENTO yozuvi, zinapoya
  glassBox(b, CW - 0.12, 0.2, 0.012, winM, cx, Y0, cz2 + 0.072, 0.09);
  b.box(CW + 0.16, 0.1, 0.32, mat('#f3f3f1', { rough: 0.6 }), cx, Y0 + 0.2, cz2 + 0.16);
  sign(b, 'front', CW + 0.16, 0.64, cx, Y0 + 0.21, cz2, 0, 0.62, 0.08, { lines: [txt('INVENTO', '#1f2f55', 0.95, { serif: true })], bg: null });
  for (let k = 0; k < 3; k++) b.box(0.8, 0.022, 0.07, mat('#cfcdc7'), cx, Y0 + k * 0.022, cz2 + 0.34 + (2 - k) * 0.06);
  // markaziy qismning o‘ng yonida yashil jalyuzi, o‘ng-old burchakda ham
  facePanel(b, 'front', W, D, cx, cz, CW / 2 + 0.14, 0.01, 0.2, H - 0.04, Y0 + 0.02, louvre, [2, 3]);
  facePanel(b, 'right', W, D, cx, cz, -D / 2 + 0.2, 0.01, 0.26, H - 0.04, Y0 + 0.02, louvre, [2, 3]);
  // tom: zinapoya bloklari, konditsionerlar, kulrang parapet chizig‘i
  const ty = Y0 + H;
  b.box(W + 0.02, 0.03, D + 0.02, mat('#8b8f93'), cx, ty - 0.03, cz);
  for (const [x, z, ww, dd] of [[-0.25, -0.75, 0.36, 0.3], [0.95, -0.25, 0.32, 0.28]] as const) {
    b.box(ww, 0.13, dd, mat('#9b9fa3', { rough: 0.7 }), cx + x, ty, z);
    b.box(ww + 0.02, 0.02, dd + 0.02, mat('#d9dadb'), cx + x, ty + 0.13, z);
  }
  hvac(b, cx + 0.45, ty, -0.85, 0.14, 0.1);
  hvac(b, cx - 0.7, ty, -0.2, 0.12, 0.1);
  // bolalar maydonchasi (chap yon hovli)
  const px = -1.3, pz = -0.5;
  b.box(1.05, 0.012, 2.3, texMat('playfloor', playFloorTexture, { rough: 0.9 }), px, Y0, pz);
  const post = mat('#e9e6e0', { rough: 0.5 });
  const tx = -1.45, tz = -0.75;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.025, 0.3, 0.025, post, tx + sx * 0.12, Y0, tz + sz * 0.12);
  b.box(0.28, 0.02, 0.28, mat('#4f86c6', { rough: 0.6 }), tx, Y0 + 0.14, tz);
  const roof = new THREE.ConeGeometry(0.22, 0.14, 4);
  roof.rotateY(Math.PI / 4);
  b.add(roof, mat('#d9473a', { rough: 0.6 }), tx, Y0 + 0.37, tz);
  const slide = new THREE.BoxGeometry(0.09, 0.012, 0.36);
  slide.rotateX(-0.42);
  b.add(slide, mat('#f2c22b', { rough: 0.5 }), tx, Y0 + 0.075, tz + 0.29);
  for (let i = 0; i < 4; i++) b.box(0.1, 0.008, 0.02, mat('#2f8f5b'), tx - 0.18, Y0 + 0.03 + i * 0.035, tz - 0.02);
  const arc = new THREE.TorusGeometry(0.09, 0.008, 6, 16, Math.PI);
  b.add(arc, mat('#e2574c', { rough: 0.5 }), -1.15, Y0, 0.25);
  b.add(new THREE.SphereGeometry(0.035, 10, 8), mat('#f08a3c', { rough: 0.5 }), -1.5, Y0 + 0.05, 0.3);
  b.add(new THREE.SphereGeometry(0.03, 10, 8), mat('#6cbf5a', { rough: 0.5 }), -1.1, Y0 + 0.045, -1.4);
  bench(b, -1.0, -1.55, 0);
  // kirish oldidagi tosh tuvaklar va daraxtlar
  for (const x of [-0.05, 0.25, 0.85, 1.15]) {
    b.box(0.1, 0.07, 0.1, mat('#b9b7b2', { rough: 0.8 }), x, Y0, 0.85);
    b.bush(x, 0.85, 0.55, undefined, Y0 + 0.07);
  }
  for (const [x, z, k] of [[-1.75, 1.5, 'cypress'], [-1.2, 1.55, 'round'], [1.75, 1.45, 'round'], [1.75, 0.6, 'cypress'], [1.78, -1.6, 'cypress'], [0.3, -1.68, 'round'], [-1.8, -1.6, 'cypress']] as const) tree(b, x, z, 0.85, k);
}

export const EDUCATION_RECIPES: Record<string, Recipe> = {
  edu_milliy_universitet: milliyUniversitet,
  edu_navoiy_kutubxona: navoiyKutubxona,
  edu_bolalar_kutubxona: bolalarKutubxona,
  edu_xorazmiy_maktab: xorazmiyMaktab,
  edu_prezident_maktab: prezidentMaktab,
  edu_invento: invento,
};

