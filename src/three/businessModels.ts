import * as THREE from 'three';
import { Builder, glassMat, mat } from './builder';
import {
  acUnit, addTilted, awning, bed, block, brickStack, cafeTable, canopy, car, carvedPanel, chimney, clearGlass, compound, cow,
  craneTruck, cyclone, dumpster, flatRoof, forklift, greenhouse, mannequin, onFace, P, pallet, pergola, portal, pot,
  profileStack, rng, rollerDoor, shopfront, sign, signMat, signPost, silo, stripe, stripeMat, tileMat, tree, truck, txt, Y0,
} from './businessParts';
import { domeTileTexture } from './textures';
import type { Builder as BuilderT } from './builder';

/**
 * «Biznes» bo‘limidagi binolarning hajmli 3D generatorlari.
 * Har biri docs/biznes-rasmlar/<tur>/1–4.png dagi to‘rt rakursni bitta izchil modelga birlashtiradi:
 * silueti, qavatlari, tom shakli, ranglari va lavhasi rasmlarga yaqin; ko‘rinmagan tomonlar sodda davom ettirilgan.
 * Koordinatalar: footprint markazi (0,0,0), old tomon (lavha, kirish) +Z, 1 birlik = 1 katak.
 */
const lampMat = new Map<string, THREE.MeshBasicMaterial>();
function cachedLamp(color = '#ffe3a0') {
  let m = lampMat.get(color);
  if (!m) lampMat.set(color, (m = new THREE.MeshBasicMaterial({ color })));
  return m;
}

export type Recipe = (b: BuilderT, w: number, d: number) => void;

// =========================== 1-bosqich: Korzinka, Bon!, Safia ===========================

/** Korzinka — bir qavatli supermarket, qizil fasad tasmasi, vitrina, oldida avtoturargoh, o‘ngda arava soyaboni. */
function korzinka(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: -1.05, width: 0.62 }, { face: 'front', at: 1.45, width: 0.3 }] });
  const W = 3.0, D = 1.2, H = 0.5, cx = 0.35, cz = -0.6;
  block(b, W, H, D, cx, cz, { faces: ['back', 'left', 'right'], bay: 0.42, winW: 0.14, winH: 0.11, skip: [{ face: 'left', at: 0.25, width: 0.32 }], ac: 6, seed: 11, roof: '#6a7ea6' });
  // vitrina va eshik
  shopfront(b, 'front', W, D, cx, Y0 + 0.03, cz, -0.1, 2.5, 0.27, { mull: 11 });
  b.doorOn('front', W, D, cx, Y0, cz, 0.75, 0.22, 0.26, '#2b2f36', true);
  // qizil fasad tasmasi (tom ustidan chiqib turadi): old tomon, chap burchak va orqa-o‘ng burchak
  const red = mat(P.red, { rough: 0.5 });
  const bandH = 0.21, bandY = Y0 + H - 0.15;
  let p = onFace('front', W, D, cx, cz, 0, 0.02);
  b.box(W + 0.04, bandH, 0.04, red, p.x, bandY, p.z);
  p = onFace('left', W, D, cx, cz, -0.25, 0.02);
  b.box(0.04, bandH, 0.74, red, p.x, bandY, p.z);
  p = onFace('right', W, D, cx, cz, 0.4, 0.02);
  b.box(0.04, bandH, 0.42, red, p.x, bandY, p.z);
  sign(b, 'front', W, D + 0.09, cx, bandY + 0.03, cz, -0.45, 1.3, 0.15, { lines: [txt('Korzinka', '#ffffff', 1)], bg: null, logo: 'cart', logoColor: '#ffffff' });
  sign(b, 'left', W + 0.09, D, cx, bandY + 0.04, cz, -0.25, 0.6, 0.12, { lines: [txt('Korzinka', '#ffffff', 1)], bg: null, logo: 'cart', logoColor: '#ffffff' });
  // tomdagi katta sovutish-shamollatish bloklari
  const hvac = mat('#cdd2d7', { rough: 0.45, metal: 0.25 });
  for (const [x, z, sw] of [[-0.35, -0.75, 0.24], [0.45, -0.5, 0.2], [1.2, -0.85, 0.22], [-0.85, -0.35, 0.16]] as const) {
    b.box(sw, 0.11, sw * 0.8, hvac, cx + x, Y0 + H, z);
    b.cyl(sw * 0.28, sw * 0.28, 0.006, mat('#3d434a'), cx + x - sw * 0.2, Y0 + H + 0.11, z, 14);
    b.cyl(sw * 0.28, sw * 0.28, 0.006, mat('#3d434a'), cx + x + sw * 0.2, Y0 + H + 0.11, z, 14);
  }
  // vitrina ichidagi meva-sabzavot plakatlari (yon oynalarda)
  for (const t of [-1.25, 1.1]) {
    const q = onFace('front', W, D, cx, cz, t, 0.02);
    b.add(new THREE.PlaneGeometry(0.16, 0.2), mat('#f0b23a', { rough: 0.6 }), q.x, Y0 + 0.16, q.z, q.ry);
    b.add(new THREE.CircleGeometry(0.04, 12), mat('#d9442f', { rough: 0.6 }), q.x, Y0 + 0.18, q.z + 0.001, q.ry);
  }
  // avtoturargoh
  const asphalt = mat(P.asphalt, { rough: 0.9 });
  b.box(2.35, 0.006, 1.12, asphalt, -0.6, Y0, 0.78);
  const line = mat('#f4f1e6', { rough: 0.8 });
  for (let i = 0; i < 6; i++) b.box(0.012, 0.003, 0.34, line, -1.72 + i * 0.3, Y0 + 0.006, 0.52);
  for (let i = 0; i < 6; i++) b.box(0.04, 0.003, 0.26, line, 0.32 + i * 0.07 - 0.17, Y0 + 0.006, 1.06);
  b.box(0.1, 0.003, 0.1, mat('#2f74c9'), -1.58, Y0 + 0.006, 0.5);
  car(b, -1.27, 0.55, '#d9dde2', 0);
  car(b, -0.67, 0.55, '#5b6068', 0);
  // trotuar, bolardlar, skameyka
  b.box(W, 0.012, 0.16, mat(P.pavingLight), cx, Y0, 0.08);
  const bol = mat(P.yellow, { rough: 0.5 });
  for (let i = 0; i < 8; i++) b.cyl(0.011, 0.011, 0.05, bol, -1.05 + i * 0.32, Y0, 0.19, 8);
  b.box(0.16, 0.02, 0.05, mat(P.woodDark), 1.35, Y0 + 0.04, 0.12);
  // arava soyaboni (shisha tom) va aravalar
  canopy(b, 1.5, 0.52, 0.55, 0.34, 0.2, clearGlass('#e2f0f6', 0.55), mat(P.steel, { metal: 0.6, rough: 0.35 }), { postsAlongFront: 3 });
  const cart = mat(P.red, { rough: 0.5 });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) b.box(0.05, 0.05, 0.075, cart, 1.32 + i * 0.12, Y0 + 0.01, 0.44 + r * 0.16);
  // chap hovli: yuk mashinasi, ko‘tarma darvoza, konteynerlar
  rollerDoor(b, 'left', W, D, cx, Y0, cz, 0.25, 0.26, 0.24);
  truck(b, -1.58, -0.66, 0, {});
  dumpster(b, -1.65, -1.2, 0);
  dumpster(b, -1.45, -1.2, 0, '#2f7a3d');
  // chiroq ustunlari va vitrina oldidagi tuvakdagi sarvlar
  for (const [x, z] of [[-1.9, 0.3], [-1.9, 1.35], [0.62, 1.35]] as const) {
    b.cyl(0.008, 0.01, 0.32, mat('#24272c', { metal: 0.5, rough: 0.4 }), x, Y0, z, 8);
    b.box(0.04, 0.03, 0.04, mat('#24272c', { metal: 0.5, rough: 0.4 }), x, Y0 + 0.32, z);
    b.add(new THREE.SphereGeometry(0.012, 8, 6), cachedLamp(), x, Y0 + 0.315, z);
  }
  for (const x of [-0.57, 0.39, 1.03]) {
    b.box(0.08, 0.05, 0.08, mat('#c9a46a', { rough: 0.7 }), x, Y0, 0.24);
    b.cypress(x, 0.24, 0.32, Y0 + 0.05);
  }
  // gulzor va daraxtlar
  tree(b, 1.76, 1.2, 0.8, 'round', 2);
  tree(b, 1.82, -1.25, 0.8, 'cypress', 3);
  tree(b, -1.82, 0.12, 0.8, 'cypress', 4);
  tree(b, -1.8, 1.25, 0.75, 'round', 5);
  tree(b, 1.88, 0.0, 0.7, 'cypress', 6);
}

/** Bon! — nonvoyxona-kafe: qora lavhali bir qavatli bino, keng vitrina, to‘q soyabon, oldida kafe terasasi. */
function bon(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: -0.35, width: 0.36 }, { face: 'right', at: 0.6, width: 0.48 }] });
  const W = 1.9, D = 1.35, H = 0.48, cx = -0.25, cz = -0.32;
  block(b, W, H, D, cx, cz, { faces: ['back', 'left', 'right'], bay: 0.42, winW: 0.16, winH: 0.14, skip: [{ face: 'right', at: 0.3, width: 0.3 }], ac: 2, seed: 5, roof: '#5b6b8c' });
  // to‘q kulrang fasad panellari va markaziy lavha
  const dark = mat('#2a2d32', { rough: 0.55 });
  let p = onFace('front', W, D, cx, cz, 0, 0.015);
  b.box(W + 0.02, 0.12, 0.03, dark, p.x, Y0 + H - 0.1, p.z);
  shopfront(b, 'front', W, D, cx, Y0 + 0.03, cz, 0, 1.6, 0.25, { mull: 7 });
  b.doorOn('front', W, D, cx, Y0, cz, -0.1, 0.18, 0.25, '#2b2f36', true);
  sign(b, 'front', W, D, cx, Y0 + H - 0.14, cz, 0, 0.5, 0.3, { lines: [txt('BON!', '#d9b45a', 1, { serif: true })], bg: '#26292d', logo: 'wheat', logoColor: '#d9b45a', logoPos: 'top' }, '#26292d');
  awning(b, 'front', W, D, cx, Y0 + 0.31, cz, 0, W - 0.04, 0.24, mat('#363a40', { rough: 0.5, metal: 0.3 }), 0.14);
  // burchaklarda yog‘och reykalar
  for (const t of [-W / 2 + 0.06, W / 2 - 0.06]) stripe(b, 'front', W, D, cx, Y0, cz, t, 0.09, H - 0.02, '#b07a46', true);
  stripe(b, 'right', W, D, cx, Y0, cz, -0.45, 0.09, H - 0.02, '#b07a46', true);
  // terasa: stol-stullar va tuvaklar
  b.box(W, 0.008, 0.85, mat(P.pavingLight), cx, Y0, 0.85);
  for (const [x, z] of [[-0.85, 0.72], [-0.3, 0.95], [0.25, 0.72]]) cafeTable(b, x, z);
  for (const x of [-1.15, 0.6]) pot(b, x, 0.52, '#e8e1d2', 1.6);
  // o‘ng tomonda yuk hovlisi: ko‘tarma eshik, aravachalar, yuk mashinasi
  rollerDoor(b, 'right', W, D, cx, Y0, cz, 0.3, 0.24, 0.22);
  truck(b, 1.05, -0.58, Math.PI / 2, {});
  for (let i = 0; i < 2; i++) {
    const x = 0.88, z = -0.12 + i * 0.12;
    b.box(0.07, 0.15, 0.09, mat('#c9ced3', { metal: 0.6, rough: 0.35 }), x, Y0, z);
    for (let k = 0; k < 4; k++) b.box(0.072, 0.008, 0.092, mat('#c78a43'), x, Y0 + 0.03 + k * 0.035, z);
  }
  // bog‘
  tree(b, -1.25, -1.25, 0.8, 'round', 1);
  tree(b, 1.25, -1.25, 0.75, 'round', 2);
  tree(b, -1.3, 1.25, 0.8, 'cypress', 3);
  tree(b, 1.3, 1.25, 0.8, 'cypress', 4);
  tree(b, 1.3, 0.2, 0.7, 'round', 5);
}

/** Safia — qandolatxona-kafe: ikki qavatli krem bino, yoysimon markaziy fasad, pushti-oq soyabonlar, soyabonli terasa. */
function safia(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 0.25, width: 0.36 }, { face: 'front', at: 1.12, width: 0.36 }] });
  const W = 1.75, D = 1.3, H = 0.62, cx = 0.2, cz = -0.35;
  block(b, W, H, D, cx, cz, { floors: 2, faces: ['back', 'left', 'right'], bay: 0.36, winW: 0.13, winH: 0.15, frame: '#f3ead7', ac: 3, seed: 8, roof: '#64779c', skip: [{ face: 'right', at: 0.25, width: 0.32 }] });
  const pinkStripe = stripeMat('#f2b8c6', '#ffffff', 8);
  // pastki vitrinalar + soyabonlar, yuqori derazalar
  for (const t of [-0.6, 0.6]) {
    shopfront(b, 'front', W, D, cx, Y0 + 0.04, cz, t, 0.4, 0.21, { frame: '#5a3b26', mull: 2 });
    awning(b, 'front', W, D, cx, Y0 + 0.29, cz, t, 0.46, 0.16, pinkStripe, 0.45);
    shopfront(b, 'front', W, D, cx, Y0 + 0.37, cz, t, 0.3, 0.17, { frame: '#5a3b26', mull: 2 });
    awning(b, 'front', W, D, cx, Y0 + 0.57, cz, t, 0.36, 0.12, pinkStripe, 0.45);
  }
  for (const t of [-0.25, 0.25]) awning(b, 'left', W, D, cx, Y0 + 0.29, cz, t, 0.36, 0.14, pinkStripe, 0.45);
  // markaziy yoysimon fasad (old tomonga chiqib turadi)
  const bayW = 0.56;
  const fz = cz + D / 2;
  b.box(bayW, H + 0.1, 0.08, mat(P.wall, { rough: 0.85 }), cx, Y0, fz + 0.04);
  const arch = new THREE.Shape();
  arch.absarc(0, 0, bayW / 2, 0, Math.PI, false);
  arch.closePath();
  const ag = new THREE.ExtrudeGeometry(arch, { depth: 0.08, bevelEnabled: false, curveSegments: 18 });
  b.add(ag, mat(P.wall, { rough: 0.85 }), cx, Y0 + H + 0.1, fz);
  b.add(new THREE.BoxGeometry(bayW + 0.03, 0.02, 0.1), mat(P.cap), cx, Y0 + H + 0.1, fz + 0.04);
  b.doorOn('front', W, D + 0.16, cx, Y0, cz, 0, 0.2, 0.26, '#5a3b26', true);
  shopfront(b, 'front', W, D + 0.16, cx, Y0 + 0.36, cz, 0, 0.32, 0.18, { frame: '#5a3b26', mull: 2 });
  sign(b, 'front', W, D + 0.16, cx, Y0 + H - 0.06, cz, 0, 0.46, 0.24, { lines: [txt('Safia', '#b68a3a', 1, { serif: true, italic: true })], bg: null, logo: 'leaf', logoColor: '#b68a3a', logoPos: 'top' });
  // naqshli panellar markaziy fasad yonlarida
  for (const t of [-0.34, 0.34]) stripe(b, 'front', W, D, cx, Y0 + 0.36, cz, t, 0.08, 0.22, '#d8c08e');
  // orqa minora (mo‘ri kabi) va orqa yuk eshigi
  block(b, 0.3, 0.2, 0.3, cx - 0.55, cz - 0.4, { faces: [], roof: '#64779c' }, Y0 + H);
  rollerDoor(b, 'right', W, D, cx, Y0, cz, 0.25, 0.22, 0.22);
  truck(b, 1.2, -0.35, Math.PI, {});
  // chap-oldida soyabonli terasa
  b.box(0.95, 0.008, 1.05, mat(P.pavingLight), -0.85, Y0, 0.78);
  const umb = stripeMat('#f2b8c6', '#ffffff', 12);
  cafeTable(b, -1.05, 0.55, umb);
  cafeTable(b, -0.65, 0.95, umb);
  b.box(0.06, 0.1, 0.012, mat('#2a2d32'), -0.35, Y0, 0.6, 0.3);
  // zinapoya
  b.box(0.5, 0.02, 0.1, mat(P.cap), cx, Y0, fz + 0.13);
  // bog‘
  tree(b, -1.25, -1.2, 0.85, 'round', 1);
  tree(b, -1.3, 0.15, 0.85, 'cypress', 2);
  tree(b, 1.28, 1.25, 0.7, 'blossom', 3);
  tree(b, -0.2, 1.28, 0.7, 'round', 4);
  tree(b, 1.3, -1.28, 0.75, 'cypress', 5);
  pot(b, -0.12, 0.25, '#e8e1d2', 1.5);
  pot(b, 0.52, 0.25, '#e8e1d2', 1.5);
}

// =========================== 2-bosqich: qishloq xo‘jaligi va oziq-ovqat ===========================

/**
 * Bukhara Varnet (varnet/1–4.png): uchta baland shisha issiqxona (ichida pomidor, iliq chiroqlar), old-o‘ngda
 * ikki qavatli krem do‘kon-ofis (katta vitrina, «BUKHARA VARNET» lavhasi, to‘q soyabon), orqasida yordamchi blok
 * (ko‘tarma eshik, konditsionerlar), chap-orqada oyoqli suv minorasi, nasos soyaboni va ko‘k bochkalar, pomidor yashiklari.
 */
function varnet(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: -0.55, width: 0.6 }] });
  // issiqxonalar (Z bo‘ylab)
  for (let i = 0; i < 3; i++) greenhouse(b, -1.12 + i * 1.02, -0.72, 0.98, 2.2, 0.3, 0.24);
  // do‘kon-ofis (old-o‘ng)
  const W = 1.5, D = 0.8, H = 0.58, cx = 1.55, cz = 0.98;
  block(b, W, H, D, cx, cz, { floors: 2, faces: ['back', 'left', 'right'], bay: 0.34, winW: 0.15, winH: 0.15, ac: 3, seed: 4, roof: '#6b7486' });
  shopfront(b, 'front', W, D, cx, Y0 + 0.03, cz, 0.15, 1.0, 0.25, { mull: 5 });
  b.doorOn('front', W, D, cx, Y0, cz, -0.5, 0.18, 0.26, '#2b2f36', true);
  awning(b, 'front', W, D, cx, Y0 + 0.31, cz, 0.0, 1.3, 0.2, mat('#3a3e45', { metal: 0.3, rough: 0.5 }), 0.18);
  sign(b, 'front', W, D, cx, Y0 + 0.36, cz, 0.05, 1.05, 0.2, { lines: [txt('BUKHARA VARNET', '#2f6b35', 1, { serif: true })], bg: null, logo: 'wheat', logoColor: '#c39a3d', logoPos: 'top' });
  stripe(b, 'front', W, D, cx, Y0, cz, -W / 2 + 0.07, 0.1, H - 0.02, '#b07a46', true);
  shopfront(b, 'right', W, D, cx, Y0 + 0.33, cz, 0, 0.5, 0.18, { mull: 2 });
  // yordamchi blok (do‘kon orqasida)
  block(b, 0.75, 0.42, 0.62, 1.95, 0.1, { faces: ['right', 'back'], bay: 0.3, winW: 0.12, winH: 0.1, ac: 2, seed: 6, roof: '#7a828f' });
  rollerDoor(b, 'right', 0.75, 0.62, 1.95, Y0, 0.1, 0.1, 0.26, 0.24);
  b.cyl(0.07, 0.07, 0.2, mat('#eef0f2', { rough: 0.4 }), 1.85, Y0, 0.52, 16);
  // suv minorasi (chap-orqa), nasos soyaboni, bochkalar, quvurlar
  silo(b, -2.05, -1.45, 0.17, 0.26, { legs: 0.34, rail: P.yellow });
  canopy(b, -2.0, -0.35, 0.6, 0.55, 0.24, mat('#8a929e', { metal: 0.4, rough: 0.5 }), mat(P.steelDark, { metal: 0.5 }), { slope: 0.08 });
  const blue = mat('#2f74c9', { rough: 0.4 });
  for (let i = 0; i < 6; i++) b.cyl(0.04, 0.04, 0.12, blue, -2.18 + (i % 3) * 0.11, Y0, -0.45 + Math.floor(i / 3) * 0.13, 14);
  b.cyl(0.08, 0.08, 0.2, mat('#eef0f2', { rough: 0.4 }), -1.85, Y0, 0.15, 16);
  const pipe = mat('#3a7fd0', { rough: 0.4, metal: 0.3 });
  b.box(0.025, 0.025, 1.0, pipe, -1.75, Y0 + 0.16, -0.9);
  b.box(0.12, 0.025, 0.025, pipe, -1.68, Y0 + 0.16, -0.4);
  // pomidor yashiklari, yuk mashinasi, forklift
  for (let i = 0; i < 8; i++) pallet(b, -0.15 + (i % 4) * 0.17, 0.75 + Math.floor(i / 4) * 0.17, 0.14, 0.07, 0.12, i % 3 ? '#d9442f' : '#7cae3f');
  truck(b, -0.55, 1.3, 0, {});
  forklift(b, 0.75, 1.45, 0.4);
  // bog‘
  for (const [x, z, k] of [[-2.3, 1.75, 'cypress'], [-1.4, 1.72, 'round'], [2.3, -1.75, 'cypress'], [2.3, -0.75, 'cypress'], [-2.22, 0.55, 'round'], [0.4, 1.78, 'cypress']] as const) tree(b, x, z, 0.85, k);
}

/** Sag Gardens — yong‘oq/bodom bog‘i: ikki qavatli yashil tomli ombor, oldida yuk maydoni, uch tomonda mevali daraxtlar. */
function sagGardens(b: Builder, w: number, d: number) {
  const hw = w / 2 - 0.06, hd = d / 2 - 0.06;
  compound(b, w, d, { gates: [{ face: 'front', at: -1.0, width: 0.6 }, { face: 'front', at: 0.6, width: 0.32 }] });
  // bog‘ tuprog‘i va daraxt qatorlari
  const soil = mat('#9a7a55', { rough: 0.95 });
  b.box(2 * hw - 0.12, 0.008, 1.55, soil, 0, Y0, -hd + 0.85);
  b.box(1.35, 0.008, 1.4, soil, -hw + 0.73, Y0, 0.1);
  b.box(1.2, 0.008, 1.9, soil, hw - 0.66, Y0, 0.3);
  const drip = mat('#3a3d42', { rough: 0.7 });
  let k = 0;
  for (let z = -hd + 0.25; z <= -0.6; z += 0.4) {
    b.box(2 * hw - 0.3, 0.008, 0.008, drip, 0, Y0 + 0.01, z + 0.12);
    for (let x = -hw + 0.3; x <= hw - 0.25; x += 0.46) tree(b, x, z, 0.82, k++ % 4 === 1 ? 'blossom' : 'fruit', k);
  }
  for (let z = -0.15; z <= 0.7; z += 0.42) for (let x = -hw + 0.3; x <= -0.95; x += 0.42) tree(b, x, z, 0.78, k++ % 3 === 0 ? 'blossom' : 'fruit', k);
  for (let z = -0.15; z <= 1.15; z += 0.42) for (let x = 1.4; x <= hw - 0.2; x += 0.42) tree(b, x, z, 0.78, k++ % 3 === 1 ? 'blossom' : 'fruit', k);
  // ombor-binosi: ikki qavatli qanotlar + oldinga chiqqan baland markaziy qism (katta lavha), yashil tomlar
  const W = 2.0, D = 1.1, H = 0.6, cx = 0.15, cz = 0.05;
  const roofG = '#4f7d63';
  block(b, W, H, D, cx, cz, { floors: 2, faces: ['back', 'left', 'right'], bay: 0.32, winW: 0.13, winH: 0.15, roof: roofG, parapet: '#efe2c8', ac: 0, seed: 9 });
  for (const t of [-0.72, 0.72]) {
    rollerDoor(b, 'front', W, D, cx, Y0, cz, t, 0.24, 0.22);
    shopfront(b, 'front', W, D, cx, Y0 + 0.36, cz, t, 0.34, 0.18, { mull: 2 });
  }
  for (const t of [-W / 2 + 0.06, W / 2 - 0.06]) stripe(b, 'front', W, D, cx, Y0, cz, t, 0.08, H - 0.02, '#b07a46', true);
  stripe(b, 'right', W, D, cx, Y0, cz, -0.35, 0.08, H - 0.02, '#b07a46', true);
  // markaziy minora
  const TW = 0.78, TD = 0.62, TH = 0.84, tz = cz + D / 2 - TD / 2 + 0.1;
  block(b, TW, TH, TD, cx, tz, { faces: ['left', 'right'], bay: 0.3, winW: 0.12, winH: 0.14, roof: roofG, parapet: '#efe2c8' });
  rollerDoor(b, 'front', TW, TD, cx, Y0, tz, 0, 0.3, 0.24);
  sign(b, 'front', TW, TD, cx, Y0 + 0.36, tz, 0, 0.66, 0.4, { lines: [txt('SAG GARDENS', '#2f6b35', 1, { serif: true })], bg: P.cap, logo: 'nuts', logoColor: '#7a5a2e', logoPos: 'top' }, '#f3e8d2');
  // orqadagi baland blok va tomdagi katta sovutgich
  block(b, 0.6, 0.18, 0.4, cx - 0.2, cz - 0.25, { faces: [], roof: roofG, parapet: '#efe2c8' }, Y0 + H);
  const chill = mat('#c9ced3', { metal: 0.4, rough: 0.4 });
  b.box(0.5, 0.1, 0.28, chill, cx + 0.62, Y0 + H, cz - 0.15);
  for (let i = 0; i < 3; i++) b.cyl(0.05, 0.05, 0.006, mat('#3a3f46'), cx + 0.46 + i * 0.16, Y0 + H + 0.1, cz - 0.15, 14);
  acUnit(b, cx - 0.65, Y0 + H, cz + 0.2);
  // yashil soyabon (yuk eshiklari ustida), ustunlar
  awning(b, 'front', W, D, cx, Y0 + 0.31, cz, 0, W - 0.05, 0.4, mat(roofG, { rough: 0.6 }), 0.12, P.steelDark);
  // yuk maydoni
  for (let i = 0; i < 6; i++) pallet(b, -0.45 + (i % 3) * 0.2, 1.05 + Math.floor(i / 3) * 0.2, 0.15, 0.08, 0.14, i % 2 ? '#a77b45' : '#7c9a3c');
  truck(b, -1.0, 1.75, 0, { stripe: '#4f8f45' });
  forklift(b, 0.55, 0.95, -0.4);
  forklift(b, 0.85, 1.25, 2.6);
  tree(b, -2.32, 2.32, 0.8, 'cypress', 1);
  tree(b, 2.32, 2.32, 0.8, 'cypress', 2);
}

/**
 * Pure Milky — sut fermasi (pure_milky/1–4.png): uzun molxona — terrakota tom ustida shamollatish ko‘tarmasi (monitor)
 * va dumaloq ventilyatorlar, old tomoni ochiq (sariq oxur to‘sig‘i, ichida sigirlar); +X uchida uchburchak frontonli ofis
 * («PURE MILKY» lavhasi), orqasida ko‘k tomli sut sexi, kumush siloslar, gorizontal sisterna; oldida yayov maydoni, pichan soyaboni.
 */
function pureMilky(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 1.0, width: 0.5 }], wood: true });
  const terracotta = mat('#d9734a', { rough: 0.65 });
  const wall = mat(P.wall, { rough: 0.85 });
  const steel = mat('#e1e5e9', { metal: 0.4, rough: 0.28 });
  const yellow = mat('#f0c419', { rough: 0.45 });
  const blueRoof = mat('#5b7fb5', { rough: 0.55 });
  // ---- molxona (X bo‘ylab), old (+Z) tomoni ochiq
  const W = 3.0, D = 1.3, cx = -0.75, cz = -0.62, Hw = 0.3;
  b.box(W, 0.012, D, mat('#77685a', { rough: 0.95 }), cx, Y0, cz);
  b.box(W, Hw, 0.05, wall, cx, Y0, cz - D / 2 + 0.025);
  b.box(0.05, Hw, D, wall, cx - W / 2 + 0.025, Y0, cz);
  b.box(0.05, Hw, D, wall, cx + W / 2 - 0.025, Y0, cz);
  // orqa devordagi yuqori derazalar
  for (let i = 0; i < 8; i++) b.box(0.2, 0.06, 0.006, mat('#3a4048', { rough: 0.3, metal: 0.3 }), cx - W / 2 + 0.3 + i * 0.35, Y0 + Hw - 0.1, cz - D / 2 - 0.002);
  // ustunlar, past parapet, sariq oxur to‘sig‘i va oxurdagi pichan
  const fz = cz + D / 2;
  for (let i = 0; i <= 8; i++) b.box(0.045, Hw, 0.045, mat('#f1e7d3', { rough: 0.7 }), cx - W / 2 + 0.03 + i * ((W - 0.06) / 8), Y0, fz - 0.025);
  b.box(W, 0.035, 0.05, wall, cx, Y0, fz - 0.025);
  for (const y of [0.08, 0.15]) b.box(W - 0.06, 0.012, 0.012, yellow, cx, Y0 + y, fz - 0.16);
  for (let i = 0; i < 40; i++) b.box(0.008, 0.15, 0.008, yellow, cx - W / 2 + 0.06 + i * ((W - 0.12) / 39), Y0, fz - 0.16);
  b.box(W - 0.08, 0.018, 0.09, mat('#e4c45c', { rough: 0.95 }), cx, Y0 + 0.012, fz - 0.08);
  // ichki to‘siqlar va sigirlar (boshlari oxurga qaragan)
  for (let i = 1; i < 9; i++) b.box(0.008, 0.008, 0.45, mat(P.steel, { metal: 0.5, rough: 0.4 }), cx - W / 2 + i * (W / 9), Y0 + 0.1, cz + 0.05);
  for (let i = 0; i < 8; i++) cow(b, cx - W / 2 + 0.22 + i * 0.365, cz + 0.2, 0, i + 1, 1.25);
  // tom: asosiy nishablar + shamollatish ko‘tarmasi (jalyuzi tasma) + yuqori tom + ventilyatorlar
  b.gableRoof(W + 0.16, D + 0.24, 0.3, terracotta, cx, Y0 + Hw, cz);
  b.box(W - 0.3, 0.09, 0.36, mat('#e9dcc2', { rough: 0.8 }), cx, Y0 + Hw + 0.21, cz);
  for (const sz of [-1, 1]) {
    b.box(W - 0.36, 0.05, 0.006, mat('#3a3f46', { rough: 0.4, metal: 0.3 }), cx, Y0 + Hw + 0.235, cz + sz * 0.182);
    for (let i = 0; i < 16; i++) b.box(0.012, 0.055, 0.008, mat('#e9dcc2', { rough: 0.8 }), cx - (W - 0.36) / 2 + i * ((W - 0.36) / 15), Y0 + Hw + 0.233, cz + sz * 0.184);
  }
  b.gableRoof(W - 0.2, 0.52, 0.09, terracotta, cx, Y0 + Hw + 0.3, cz);
  for (let i = 0; i < 4; i++) {
    const vx = cx - 1.05 + i * 0.7;
    b.cyl(0.04, 0.04, 0.06, steel, vx, Y0 + Hw + 0.36, cz, 14);
    b.add(new THREE.ConeGeometry(0.055, 0.035, 14), steel, vx, Y0 + Hw + 0.44, cz);
  }
  // ---- ofis (molxonaning +X uchida), uchburchak fronton, lavha +X tomonga qaragan
  const OW = 0.8, OD = 1.0, OH = 0.48, ox = cx + W / 2 + OW / 2, oz = -0.55;
  block(b, OW, OH, OD, ox, oz, { faces: ['front', 'back'], bay: 0.3, winW: 0.12, winH: 0.12, roof: '#c9b79a', ac: 1, seed: 4 });
  b.box(0.04, OH, OD, wall, ox + OW / 2 - 0.02, Y0, oz);
  b.gableRoof(OW + 0.06, OD + 0.1, 0.16, terracotta, ox, Y0 + OH, oz);
  const gable = new THREE.Shape();
  gable.moveTo(-OD / 2 - 0.03, 0);
  gable.lineTo(OD / 2 + 0.03, 0);
  gable.lineTo(OD / 2 + 0.03, 0.03);
  gable.lineTo(0, 0.2);
  gable.lineTo(-OD / 2 - 0.03, 0.03);
  gable.closePath();
  const gg = new THREE.ExtrudeGeometry(gable, { depth: 0.05, bevelEnabled: false });
  gg.rotateY(Math.PI / 2);
  b.add(gg, mat(P.cap, { rough: 0.7 }), ox + OW / 2 - 0.02, Y0 + OH - 0.01, oz);
  b.doorOn('right', OW, OD, ox, Y0, oz, 0.08, 0.24, 0.27, '#2b2f36', true);
  sign(b, 'right', OW, OD, ox, Y0 + OH - 0.17, oz, 0.08, 0.62, 0.22, { lines: [txt('PURE MILKY', '#2a5aa0', 1)], bg: null, logo: 'leaf', logoColor: '#3d9a45', logoPos: 'top' });
  stripe(b, 'right', OW, OD, ox, Y0, oz, -0.36, 0.1, OH - 0.04, '#b07a46', true);
  shopfront(b, 'right', OW, OD, ox, Y0 + 0.05, oz, 0.38, 0.14, 0.2, { mull: 1 });
  shopfront(b, 'front', OW, OD, ox, Y0 + 0.04, oz, 0.1, 0.4, 0.22, { mull: 2 });
  // ---- sut sexi: ofis orqasida, ko‘k tom, katta oynadan po‘lat sisternalar
  const AW = 0.72, AD = 0.62, AH = 0.34, ax = ox + 0.06, az = -1.42;
  block(b, AW, AH, AD, ax, az, { faces: ['back', 'left'], bay: 0.3, winW: 0.12, winH: 0.1, roof: '#5b7fb5' });
  shopfront(b, 'right', AW, AD, ax, Y0 + 0.05, az, 0, 0.48, 0.24, { mull: 2, warm: true });
  for (const t of [-0.14, 0.14]) {
    const q = onFace('right', AW, AD, ax, az, t, -0.09);
    b.cyl(0.07, 0.07, 0.2, steel, q.x, Y0 + 0.04, q.z, 16);
  }
  b.gableRoof(AW + 0.06, AD + 0.08, 0.07, blueRoof, ax, Y0 + AH, az);
  // ---- siloslar (sariq narvon-qafas), quvurlar, gorizontal sisterna
  silo(b, 2.08, -1.55, 0.15, 0.45, { legs: 0.14, rail: P.yellow });
  silo(b, 2.08, -1.08, 0.15, 0.45, { legs: 0.14, rail: P.yellow });
  b.box(0.3, 0.02, 0.02, steel, 1.86, Y0 + 0.45, -1.3);
  const tank = new THREE.CylinderGeometry(0.1, 0.1, 0.46, 20);
  tank.rotateX(Math.PI / 2);
  b.add(tank, steel, 2.12, Y0 + 0.13, -0.42);
  for (const z of [-0.6, -0.24]) b.box(0.12, 0.04, 0.03, mat(P.steelDark), 2.12, Y0, z);
  // ---- yayov maydoni (oldi-chap): tuproq, yog‘och to‘siq, soyabon, suv oxurlari, sigirlar
  const px = -1.05, pz = 0.95, pw = 2.3, pd = 1.4;
  b.box(pw, 0.008, pd, mat('#b08d68', { rough: 0.98 }), px, Y0, pz);
  const wood = mat(P.wood, { rough: 0.8 });
  for (const y of [0.06, 0.12]) {
    for (const sz of [-1, 1]) b.box(pw, 0.014, 0.014, wood, px, Y0 + y, pz + (sz * pd) / 2);
    for (const sx of [-1, 1]) b.box(0.014, 0.014, pd, wood, px + (sx * pw) / 2, Y0 + y, pz);
  }
  for (let i = 0; i <= 8; i++) for (const sz of [-1, 1]) b.box(0.025, 0.15, 0.025, wood, px - pw / 2 + (pw * i) / 8, Y0, pz + (sz * pd) / 2);
  for (let i = 1; i < 5; i++) for (const sx of [-1, 1]) b.box(0.025, 0.15, 0.025, wood, px + (sx * pw) / 2, Y0, pz - pd / 2 + (pd * i) / 5);
  canopy(b, -1.85, 0.62, 0.6, 0.5, 0.22, mat('#9aa3ad', { metal: 0.4, rough: 0.45 }), mat(P.steelDark), { slope: 0.1 });
  for (const [x, z, r] of [[-1.85, 0.62, 0], [-0.25, 1.45, 0], [-1.3, 1.5, Math.PI / 2]] as const) {
    b.box(0.26, 0.06, 0.09, mat('#a7b0b9', { metal: 0.4, rough: 0.4 }), x, Y0, z, r);
    b.box(0.23, 0.004, 0.07, mat('#5fa8d8', { rough: 0.15 }), x, Y0 + 0.06, z, r);
  }
  for (const [x, z, r] of [[-1.55, 1.05, 0.6], [-1.0, 0.7, 2.4], [-0.6, 1.15, -0.9], [-1.95, 1.35, 1.8], [-0.2, 0.55, 3.6]] as const) cow(b, x, z, r, 7, 1.35);
  // ---- pichan soyaboni va kichik xona (old-o‘ng), forklift
  canopy(b, 1.95, 1.25, 0.6, 0.5, 0.26, blueRoof, mat(P.steelDark), { slope: 0.1 });
  for (let i = 0; i < 6; i++) b.rbox(0.13, 0.085, 0.11, mat('#e1c25c', { rough: 0.95 }), 1.8 + (i % 2) * 0.15, Y0 + Math.floor(i / 2) * 0.085, 1.2 + ((i >> 1) % 2) * 0.12, 0.012);
  block(b, 0.36, 0.26, 0.3, 0.55, 0.45, { faces: ['front', 'right'], bay: 0.3, winW: 0.1, winH: 0.09, roof: '#5b7fb5' });
  b.gableRoof(0.4, 0.34, 0.06, blueRoof, 0.55, Y0 + 0.26, 0.45);
  forklift(b, 1.25, 0.75, 0.6);
  // ---- daraxtlar
  for (const [x, z, kk] of [[-2.05, -1.72, 'round'], [-0.85, -1.74, 'cypress'], [0.45, -1.72, 'round'], [0.4, 1.72, 'round'], [2.28, 0.25, 'cypress'], [2.28, 1.75, 'round']] as const) tree(b, x, z, 0.8, kk);
}

/** Besh Qozon — osh markazi: majolika tasmali bino, ochiq yog‘och qozonxona (mis qalpoqli qozonlar), terasa. */
function beshQozon(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: -1.2, width: 0.34 }, { face: 'right', at: 0.9, width: 0.4 }] });
  const W = 1.95, D = 1.2, H = 0.5, cx = -0.75, cz = -0.3;
  block(b, W, H, D, cx, cz, { faces: ['back', 'left'], bay: 0.36, winW: 0.14, winH: 0.13, ac: 3, seed: 6, roof: '#5f72a0' });
  // majolika tasmalar (old va o‘ng tomon)
  let p = onFace('front', W, D, cx, cz, 0, 0.012);
  b.add(new THREE.BoxGeometry(W + 0.02, 0.07, 0.022), tileMat([10, 1]), p.x, Y0 + H - 0.09, p.z, p.ry);
  p = onFace('right', W, D, cx, cz, 0, 0.012);
  b.add(new THREE.BoxGeometry(D + 0.02, 0.07, 0.022), tileMat([6, 1]), p.x, Y0 + H - 0.09, p.z, p.ry);
  for (const t of [-0.6, 0.55]) shopfront(b, 'front', W, D, cx, Y0 + 0.03, cz, t, 0.52, 0.28, { frame: '#5a3b26', mull: 3 });
  b.doorOn('front', W, D, cx, Y0, cz, 0, 0.2, 0.27, '#5a3b26', true);
  shopfront(b, 'right', W, D, cx, Y0 + 0.03, cz, 0, 0.6, 0.26, { frame: '#5a3b26', mull: 3 });
  // ko‘tarilgan markaziy parapet va lavha
  p = onFace('front', W, D, cx, cz, 0, 0.015);
  b.box(0.8, 0.14, 0.04, mat(P.wall, { rough: 0.85 }), p.x, Y0 + H, p.z);
  b.box(0.5, 0.06, 0.04, mat(P.wall, { rough: 0.85 }), p.x, Y0 + H + 0.14, p.z);
  sign(b, 'front', W, D + 0.07, cx, Y0 + H - 0.02, cz, 0, 0.62, 0.24, { lines: [txt('BESH QOZON', '#5b3518', 1, { serif: true })], bg: null, logo: 'kazan', logoColor: '#b06a2c', logoPos: 'top' });
  awning(b, 'front', W, D, cx, Y0 + 0.33, cz, 0, W - 0.1, 0.16, stripeMat('#8a5a33', '#f1e3c3', 10), 0.35);
  // ochiq qozonxona: yog‘och ustunlar, ko‘k tom, majolika chekka, uchta qozon
  const kx = 0.95, kz = -0.35, kw = 1.4, kd = 1.35;
  b.box(kw, 0.01, kd, mat('#cdb48c', { rough: 0.9 }), kx, Y0, kz);
  const wood = mat(P.wood, { rough: 0.75 });
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) b.box(0.04, 0.34, 0.04, wood, kx + sx * (kw / 2 - 0.04), Y0, kz + sz * (kd / 2 - 0.04));
  const roof = new THREE.BoxGeometry(kw + 0.08, 0.02, kd + 0.08);
  addTilted(b, roof, mat('#4e6aa8', { rough: 0.55, metal: 0.25 }), kx, Y0 + 0.37, kz, Math.PI / 2, 0.06);
  b.add(new THREE.BoxGeometry(0.03, 0.05, kd + 0.08), tileMat([8, 1]), kx + kw / 2 + 0.03, Y0 + 0.32, kz);
  b.add(new THREE.BoxGeometry(kw + 0.08, 0.05, 0.03), tileMat([8, 1]), kx, Y0 + 0.32, kz + kd / 2 + 0.03);
  for (let i = 0; i < 3; i++) {
    const qx = kx + 0.1, qz = kz - 0.4 + i * 0.4;
    b.cyl(0.11, 0.12, 0.08, mat('#b9643f', { rough: 0.9 }), qx, Y0, qz, 18);
    const bowl = new THREE.SphereGeometry(0.11, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    b.add(bowl, mat('#1f1d1c', { rough: 0.5, metal: 0.3 }), qx, Y0 + 0.13, qz);
    b.cyl(0.1, 0.1, 0.006, mat('#e0b648', { rough: 0.7 }), qx, Y0 + 0.125, qz, 18);
    b.add(new THREE.ConeGeometry(0.12, 0.07, 18, 1, true), mat('#b8733a', { rough: 0.3, metal: 0.8 }), qx, Y0 + 0.27, qz);
    b.cyl(0.02, 0.02, 0.09, mat('#b8733a', { rough: 0.3, metal: 0.8 }), qx, Y0 + 0.29, qz, 10);
  }
  b.box(0.12, 0.08, 0.6, wood, kx - 0.45, Y0, kz + 0.1);
  // terasa
  b.box(W, 0.008, 0.95, mat(P.pavingLight), cx, Y0, 0.85);
  for (const [x, z] of [[-1.35, 0.75], [-0.75, 1.0], [-0.15, 0.75], [0.6, 0.95]]) cafeTable(b, x, z);
  for (const [x, z] of [[-1.75, 0.42], [0.18, 0.42], [1.65, 0.6]]) pot(b, x, z, '#2f6fb5', 1.6);
  for (const [x, z, kk] of [[-1.8, 1.25, 'cypress'], [1.8, 1.25, 'round'], [1.82, -1.28, 'cypress'], [-0.35, -1.3, 'round']] as const) tree(b, x, z, 0.8, kk, Math.round(x * 3 + z * 7));
}

/** Crafers — qandolat fabrikasi: qizil tasmali ikki qavatli korpus, shisha kirish, uchta silos, yuk rampasi. */
function crafers(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 1.65, width: 0.6 }, { face: 'front', at: -0.3, width: 0.5 }] });
  const W = 3.0, D = 1.55, H = 0.64, cx = 0.3, cz = -0.32;
  block(b, W, H, D, cx, cz, { floors: 2, faces: ['back', 'left'], bay: 0.38, winW: 0.16, winH: 0.12, ac: 7, seed: 13, roof: '#7d8aa3' });
  // old tomon: shisha markaz, ikki chetda derazalar, qizil tasmalar
  shopfront(b, 'front', W, D, cx, Y0 + 0.03, cz, 0, 0.9, 0.56, { mull: 5 });
  for (const t of [-1.0, 1.0]) {
    shopfront(b, 'front', W, D, cx, Y0 + 0.05, cz, t, 0.55, 0.2, { mull: 3 });
    shopfront(b, 'front', W, D, cx, Y0 + 0.37, cz, t, 0.55, 0.18, { mull: 3 });
  }
  for (const t of [-1.42, -0.6, 0.6, 1.42]) stripe(b, 'front', W, D, cx, Y0, cz, t, 0.09, H, P.red);
  let p = onFace('front', W, D, cx, cz, 0, 0.02);
  b.box(1.05, 0.22, 0.05, mat(P.wall), p.x, Y0 + H - 0.05, p.z);
  sign(b, 'front', W, D + 0.09, cx, Y0 + H - 0.04, cz, 0, 0.75, 0.21, { lines: [txt('CRAFERS', '#cf2f27', 1, { serif: true })], bg: null, logo: 'wheat', logoColor: '#e3a12f', logoPos: 'top' });
  awning(b, 'front', W, D, cx, Y0 + 0.3, cz, 0, 0.6, 0.2, mat(P.red, { rough: 0.5 }), 0.1);
  // o‘ng tomon: yuk rampasi
  shopfront(b, 'right', W, D, cx, Y0 + 0.37, cz, 0, 1.2, 0.18, { mull: 6 });
  rollerDoor(b, 'right', W, D, cx, Y0, cz, -0.35, 0.28, 0.26);
  rollerDoor(b, 'right', W, D, cx, Y0, cz, 0.3, 0.28, 0.26);
  stripe(b, 'right', W, D, cx, Y0, cz, 0.72, 0.09, H, P.red);
  truck(b, 2.1, 0.65, 0, { logo: { lines: [txt('CRAFERS', '#cf2f27', 1, { serif: true })], bg: '#f3f3f1', logo: 'wheat', logoColor: '#e3a12f' } });
  // tomdagi zinapoya minorasi
  block(b, 0.42, 0.24, 0.42, cx + 0.95, cz - 0.4, { faces: ['front'], bay: 0.3, winW: 0.1, winH: 0.08, roof: '#7d8aa3' }, Y0 + H);
  stripe(b, 'front', 0.42, 0.42, cx + 0.95, Y0 + H, cz - 0.4, 0.12, 0.06, 0.24, P.red);
  // siloslar (orqa-chap) va qizil zinapoyalar
  for (let i = 0; i < 3; i++) silo(b, -1.9, -1.45 + i * 0.47, 0.19, 0.55, { legs: 0.14, rail: P.red });
  const red = mat(P.red, { rough: 0.5 });
  b.box(0.05, 0.02, 1.0, red, -1.55, Y0 + 0.78, -0.98);
  b.box(0.05, 0.02, 0.45, red, -1.33, Y0 + 0.78, -0.98, Math.PI / 2);
  // old hovli: avtoturargoh chiziqlari, gulzorlar
  for (let i = 0; i < 5; i++) b.box(0.012, 0.003, 0.32, mat(P.lineY), -1.9 + i * 0.3, Y0 + 0.004, 0.95);
  car(b, -1.6, 1.0, '#e8e8e8', 0);
  forklift(b, 1.75, -0.95, 1.4);
  pallet(b, 1.9, -1.35, 0.16, 0.1, 0.14, '#e7e3da');
  bed(b, 0.6, 0.6, 1.6, true, 4, 0.14);
  for (const [x, z, kk] of [[-2.3, 1.75, 'round'], [-2.33, 0.4, 'cypress'], [2.32, -1.78, 'cypress'], [0.6, -1.8, 'round']] as const) tree(b, x, z, 0.8, kk, Math.round(x * 4 + z * 9));
}

// =========================== 3-bosqich: hunarmandchilik, kiyim, bozor ===========================

/** Bibi Hanum — tikuvchilik ustaxonasi: o‘ymakor yog‘och ustunli ayvon, manekenlarda milliy liboslar, tomida koshinli minora. */
function bibiHanum(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 0.55, width: 0.4 }] });
  const W = 1.85, D = 1.2, H = 0.56, cx = -0.05, cz = -0.42;
  block(b, W, H, D, cx, cz, { floors: 2, faces: ['back', 'left', 'right'], bay: 0.4, winW: 0.13, winH: 0.15, frame: '#5a3b26', ac: 3, seed: 7, roof: '#4e6aa8' });
  shopfront(b, 'front', W, D, cx, Y0 + 0.03, cz, 0, 1.4, 0.26, { frame: '#6e4626', mull: 6 });
  for (const t of [-0.75, 0.75]) carvedPanel(b, 'front', W, D, cx, Y0 + 0.33, cz, t, 0.22, 0.18);
  for (const t of [-0.4, 0.4]) {
    const q = onFace('right', W, D, cx, cz, t, 0.01);
    b.add(new THREE.BoxGeometry(0.16, 0.2, 0.012), tileMat([1, 2]), q.x, Y0 + 0.13, q.z, q.ry);
  }
  sign(b, 'front', W, D, cx, Y0 + 0.37, cz, 0, 0.75, 0.13, { lines: [txt('BIBI HANUM', '#4e3018', 1, { serif: true })], bg: '#f1e3c3' }, '#c9a46a');
  // ayvon: o‘ymakor ustunlar, ko‘k tunuka tom
  const vz = cz + D / 2 + 0.22;
  const carvedPost = mat('#7a4a24', { rough: 0.65 });
  for (let i = 0; i < 5; i++) {
    const x = cx - 0.85 + i * 0.425;
    b.box(0.045, 0.3, 0.045, carvedPost, x, Y0, vz + 0.18);
    b.box(0.07, 0.025, 0.07, mat('#c08a4e'), x, Y0 + 0.29, vz + 0.18);
  }
  const vroof = new THREE.BoxGeometry(W + 0.05, 0.016, 0.5);
  addTilted(b, vroof, mat('#4f6aa6', { metal: 0.3, rough: 0.5 }), cx, Y0 + 0.33, vz - 0.02, 0, 0.12);
  b.add(new THREE.BoxGeometry(W + 0.05, 0.035, 0.012), carvedPost, cx, Y0 + 0.3, vz + 0.2);
  const robes = ['#c23b6e', '#3b6ec2', '#e0a030', '#7a3bc2', '#2f9a6a', '#d9532f'];
  for (let i = 0; i < 6; i++) mannequin(b, cx - 0.78 + i * 0.31, vz + (i % 2 ? 0.02 : 0.08), robes[i]);
  // gilam va tikuv stoli
  b.add(new THREE.PlaneGeometry(0.36, 0.5).rotateX(-Math.PI / 2), stripeMat('#b8323b', '#e9c46a', 6), -0.25, Y0 + 0.004, 0.75);
  b.box(0.18, 0.05, 0.1, mat(P.woodDark), 0.25, Y0, 0.7);
  b.box(0.06, 0.04, 0.04, mat('#e8e2d6', { rough: 0.4 }), 0.25, Y0 + 0.05, 0.7);
  // tomdagi koshinli minora
  block(b, 0.32, 0.18, 0.32, cx + 0.1, cz - 0.1, { faces: [], roof: '#4e6aa8' }, Y0 + H);
  for (const face of ['front', 'back', 'left', 'right'] as const) {
    const q = onFace(face, 0.32, 0.32, cx + 0.1, cz - 0.1, 0, 0.008);
    b.add(new THREE.PlaneGeometry(0.2, 0.12), tileMat([1, 1]), q.x, Y0 + H + 0.1, q.z, q.ry);
  }
  // orqa-o‘ng pergola (matolar) va kirish eshigi
  pergola(b, 1.12, -0.85, 0.5, 0.75, 0.28);
  for (let i = 0; i < 4; i++) b.box(0.14, 0.06, 0.1, mat(robes[i], { rough: 0.9 }), 1.12, Y0 + i * 0.06, -1.0 + (i % 2) * 0.22);
  b.doorOn('right', W, D, cx, Y0, cz, -0.1, 0.13, 0.24, '#4f8f8a');
  for (const [x, z, kk] of [[-1.3, 1.25, 'round'], [1.3, 1.25, 'cypress'], [-1.3, -1.25, 'cypress'], [1.32, 0.2, 'cypress']] as const) tree(b, x, z, 0.8, kk, Math.round(x * 3 + z * 5));
}

/** IDEAL — kiyim do‘koni: ikki qavatli zamonaviy bino, ikki qavatli vitrinalar (ramkali), to‘q soyabon, orqada yuk eshigi. */
function ideal(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 0, width: 0.42 }, { face: 'right', at: 0.45, width: 0.42 }] });
  const W = 1.65, D = 1.25, H = 0.72, cx = -0.05, cz = -0.25;
  block(b, W, H, D, cx, cz, { floors: 2, faces: ['back', 'left', 'right'], bay: 0.4, winW: 0.15, winH: 0.17, ac: 3, seed: 21, roof: '#5b6b8c', skip: [{ face: 'right', at: 0.25, width: 0.34 }] });
  // ikki qavatli vitrinalar va qalin ramkalar
  for (const t of [-0.42, 0.42]) {
    shopfront(b, 'front', W, D, cx, Y0 + 0.04, cz, t, 0.62, 0.28, { mull: 3 });
    shopfront(b, 'front', W, D, cx, Y0 + 0.4, cz, t, 0.62, 0.26, { mull: 3 });
    const q = onFace('front', W, D, cx, cz, t, 0.03);
    const frame = mat(P.cap, { rough: 0.7 });
    b.add(new THREE.BoxGeometry(0.7, 0.04, 0.06), frame, q.x, Y0 + H - 0.03, q.z, q.ry);
    for (const k of [-1, 1]) {
      const r = onFace('front', W, D, cx, cz, t + k * 0.335, 0.03);
      b.add(new THREE.BoxGeometry(0.035, H - 0.02, 0.06), frame, r.x, Y0 + (H - 0.02) / 2, r.z, r.ry);
    }
  }
  // vitrina orti: manekenlar (oynaga yopishgan holda)
  for (let i = 0; i < 6; i++) {
    const t = -0.68 + i * 0.27 + (i > 2 ? 0.0 : 0);
    const q = onFace('front', W, D, cx, cz, t, 0.016);
    const y = Y0 + (i % 2 ? 0.42 : 0.06);
    b.add(new THREE.PlaneGeometry(0.05, 0.16), mat(['#2b3d5c', '#c9b49a', '#7a2e3a', '#e8e2d6', '#3d6b4f', '#5a5f66'][i], { rough: 0.7 }), q.x, y + 0.08, q.z, q.ry);
  }
  awning(b, 'front', W, D, cx, Y0 + 0.36, cz, 0, W + 0.02, 0.24, mat('#2e3238', { metal: 0.3, rough: 0.5 }), 0.08);
  const fp = onFace('front', W, D, cx, cz, 0, 0.24);
  b.add(new THREE.PlaneGeometry(0.42, 0.06), signMat({ lines: [txt('IDEAL', '#ffffff', 1)], bg: '#2e3238' }, 7), fp.x, Y0 + 0.335, fp.z, fp.ry);
  stripe(b, 'right', W, D, cx, Y0, cz, -0.5, 0.1, H, '#b07a46', true);
  // zinapoya
  b.box(0.5, 0.02, 0.12, mat(P.cap), cx, Y0, cz + D / 2 + 0.3);
  // orqa: yuk eshigi, qutilar, yuk mashinasi
  rollerDoor(b, 'right', W, D, cx, Y0, cz, 0.25, 0.24, 0.24);
  truck(b, 1.2, -0.75, Math.PI / 2 + 0.0, {});
  for (let i = 0; i < 3; i++) pallet(b, 0.95, 0.05 + i * 0.12, 0.08, 0.06, 0.08, '#c79a62');
  block(b, 0.35, 0.36, 0.45, cx - 0.98, cz - 0.3, { faces: ['back', 'left'], bay: 0.3, winW: 0.1, winH: 0.1, roof: '#5b6b8c' });
  for (const [x, z, kk] of [[-1.3, 1.25, 'cypress'], [1.3, 1.25, 'round'], [-1.3, 0.3, 'round'], [1.32, -0.2, 'cypress']] as const) tree(b, x, z, 0.8, kk, Math.round(x * 3 + z * 5));
}

/** Rishton — kulolchilik ustaxonasi: majolika portal, ko‘k tomlar, yog‘och ustaxona-pergola, kulolchilik xumdoni, tomdagi bog‘. */
function rishton(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: -0.85, width: 0.32 }] });
  const W = 1.35, D = 1.0, H = 0.5, cx = -0.3, cz = -0.45;
  block(b, W, H, D, cx, cz, { faces: ['back', 'left', 'right'], bay: 0.38, winW: 0.12, winH: 0.15, frame: '#5a3b26', roof: '#3a64b5' });
  portal(b, 'front', W, D, cx, Y0, cz, 0.15, 0.42, 0.48, { lines: [txt('RISHTON', '#ffffff', 1, { serif: true })], bg: '#1f4f96' });
  shopfront(b, 'front', W, D, cx, Y0 + 0.08, cz, -0.42, 0.24, 0.2, { frame: '#5a3b26', mull: 2 });
  for (const t of [-0.25, 0.2]) {
    const q = onFace('left', W, D, cx, cz, t, 0.01);
    b.add(new THREE.CircleGeometry(0.045, 16), tileMat([1, 1]), q.x, Y0 + 0.36, q.z, q.ry);
  }
  // ikkinchi qavat (orqada) va tomdagi pergola
  block(b, 0.7, 0.3, 0.55, cx - 0.25, cz - 0.2, { faces: ['front', 'left', 'back'], bay: 0.3, winW: 0.11, winH: 0.12, frame: '#5a3b26', roof: '#3a64b5' }, Y0 + H);
  pergola(b, cx + 0.35, cz + 0.05, 0.5, 0.55, 0.2, Y0 + H + 0.01);
  for (const [x, z] of [[cx + 0.2, cz + 0.25], [cx + 0.5, cz - 0.1]]) b.add(blobPlant(), mat('#5d9a3e', { rough: 0.95 }), x, Y0 + H + 0.06, z);
  // o‘ng tomondagi yog‘och ustaxona (pergola + soyabon) — stollarda ko‘k kulolchilik
  pergola(b, 0.85, -0.3, 0.8, 1.0, 0.28);
  const pRoof = new THREE.BoxGeometry(0.86, 0.012, 1.06);
  addTilted(b, pRoof, mat('#8a5a33', { rough: 0.8 }), 0.85, Y0 + 0.33, -0.3, 0, 0);
  for (const [x, z] of [[0.7, -0.55], [0.7, -0.05], [1.05, -0.3]]) {
    b.box(0.22, 0.05, 0.12, mat(P.wood, { rough: 0.7 }), x, Y0 + 0.02, z);
    for (let i = 0; i < 3; i++) pot(b, x - 0.07 + i * 0.07, z, i % 2 ? '#1f5fa8' : '#2bb3c0', 0.9, false);
  }
  for (let i = 0; i < 4; i++) b.box(0.012, 0.012, 0.012, mat('#1f5fa8'), 0.5, Y0 + 0.18 + i * 0.03, -0.75);
  // xumdon (gumbazsimon pech)
  const kiln = new THREE.LatheGeometry([[0, 0], [0.17, 0], [0.17, 0.08], [0.14, 0.17], [0.08, 0.25], [0.035, 0.29], [0.035, 0.33], [0, 0.33]].map(([u, v]) => new THREE.Vector2(u, v)), 20);
  b.add(kiln, mat('#d9b98c', { rough: 0.9 }), 1.12, Y0, -1.15);
  b.add(new THREE.CircleGeometry(0.06, 12, 0, Math.PI), mat('#2a2523'), 1.12, Y0 + 0.04, -0.98);
  b.box(0.12, 0.04, 0.005, mat('#2a2523'), 1.12, Y0, -0.98);
  // hovli: ko‘zalar, butalar, sarvlar
  for (const [x, z, c] of [[-1.15, 0.35, '#1f5fa8'], [-0.95, 0.42, '#2bb3c0'], [0.25, 0.35, '#1f5fa8'], [0.95, 0.5, '#b9643f'], [1.12, 0.62, '#b9643f'], [-0.5, 0.8, '#2bb3c0']] as const) pot(b, x, z, c, 1.4, x < 0.6);
  b.box(0.3, 0.06, 0.18, mat(P.wood), 0.2, Y0, 0.85);
  for (let i = 0; i < 4; i++) pot(b, 0.1 + i * 0.07, 0.85, i % 2 ? '#1f5fa8' : '#f1e3c3', 0.8, false);
  for (const [x, z, kk] of [[-1.3, 1.25, 'cypress'], [1.3, 1.25, 'round'], [-1.3, -1.25, 'cypress'], [-0.35, 1.25, 'cypress'], [1.32, 0.22, 'cypress']] as const) tree(b, x, z, 0.85, kk, Math.round(x * 3 + z * 5));
  b.add(palm(), mat('#4f8f3a', { rough: 0.9 }), -1.05, Y0 + 0.24, 0.85);
  b.cyl(0.012, 0.016, 0.24, mat('#8a6a48'), -1.05, Y0, 0.85, 6);
}
function blobPlant() {
  const g = new THREE.IcosahedronGeometry(0.05, 1);
  g.scale(1, 0.8, 1);
  return g;
}
function palm() {
  const g = new THREE.ConeGeometry(0.12, 0.06, 7, 1, true);
  g.rotateX(Math.PI);
  return g;
}

/** Chorsu — gumbazli bozor: feruza koshinli qovurg‘ali gumbaz, ravoqli kirish, atrofda rasta-do‘konlar. */
function chorsu(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 0, width: 0.8 }, { face: 'back', at: 0, width: 0.6 }, { face: 'left', at: 0, width: 0.5 }, { face: 'right', at: 0, width: 0.5 }] });
  // maydon naqshi
  const ring = new THREE.RingGeometry(1.95, 2.55, 64);
  ring.rotateX(-Math.PI / 2);
  b.add(ring, mat('#e8dcc4', { rough: 0.9 }), 0, Y0 + 0.002, 0);
  const R = 1.72, drumH = 0.36;
  const cream = mat(P.wall, { rough: 0.85 });
  b.cyl(R + 0.06, R + 0.08, 0.05, mat(P.base), 0, Y0, 0, 64);
  b.cyl(R, R, drumH, cream, 0, Y0, 0, 64);
  // baraban derazalari
  const nWin = 28;
  for (let i = 0; i < nWin; i++) {
    const a = (i / nWin) * Math.PI * 2;
    if (Math.abs(Math.sin(a) - 1) < 0.02) continue;
    const ry = Math.PI / 2 - a;
    b.add(new THREE.PlaneGeometry(0.2, 0.17), glassMat(true), Math.cos(a) * (R + 0.003), Y0 + 0.16, Math.sin(a) * (R + 0.003), ry);
    b.add(new THREE.CircleGeometry(0.1, 10, 0, Math.PI), glassMat(true), Math.cos(a) * (R + 0.003), Y0 + 0.245, Math.sin(a) * (R + 0.003), ry);
  }
  // tayanch ustunlar (kontrforslar)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    const g = new THREE.BoxGeometry(0.1, 0.44, 0.22);
    b.add(g, cream, Math.cos(a) * (R + 0.08), Y0 + 0.22, Math.sin(a) * (R + 0.08), Math.PI / 2 - a);
    const cap = new THREE.BoxGeometry(0.1, 0.04, 0.24);
    b.add(cap, mat(P.cap), Math.cos(a) * (R + 0.08), Y0 + 0.46, Math.sin(a) * (R + 0.08), Math.PI / 2 - a);
  }
  // gumbaz
  const domeH = 0.55;
  const dome = new THREE.SphereGeometry(R + 0.04, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, domeH, 1);
  const tex = domeTileTexture().clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 4);
  tex.needsUpdate = true;
  b.add(dome, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.28, metalness: 0.15 }), 0, Y0 + drumH, 0);
  for (let k = 0; k < 8; k++) {
    const rib = new THREE.TorusGeometry(R + 0.05, 0.04, 5, 40, Math.PI);
    rib.scale(1, domeH, 1);
    rib.rotateY((k * Math.PI) / 8);
    b.add(rib, mat(P.cap, { rough: 0.6 }), 0, Y0 + drumH, 0);
  }
  b.cyl(R + 0.07, R + 0.07, 0.04, mat(P.cap), 0, Y0 + drumH - 0.02, 0, 64);
  // tepa: yorug‘lik fonari va tilla nayza
  const topY = Y0 + drumH + (R + 0.04) * domeH;
  b.cyl(0.42, 0.45, 0.06, mat(P.cap), 0, topY - 0.05, 0, 32);
  b.cyl(0.32, 0.32, 0.1, clearGlass('#9fd6ea', 0.6), 0, topY, 0, 24);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.box(0.015, 0.1, 0.015, mat(P.cap), Math.cos(a) * 0.32, topY, Math.sin(a) * 0.32);
  }
  const cap = new THREE.SphereGeometry(0.34, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.45, 1);
  b.add(cap, mat('#3a9cc6', { rough: 0.3 }), 0, topY + 0.1, 0);
  const gold = mat('#d9a93a', { metal: 0.85, rough: 0.25 });
  b.add(new THREE.SphereGeometry(0.045, 12, 8), gold, 0, topY + 0.29, 0);
  b.add(new THREE.ConeGeometry(0.03, 0.22, 10), gold, 0, topY + 0.43, 0);
  b.add(new THREE.SphereGeometry(0.03, 10, 8), gold, 0, topY + 0.36, 0);
  // asosiy kirish (old) — ravoqli portal va lavha
  const pz = R - 0.02;
  b.box(1.0, 0.62, 0.32, cream, 0, Y0, pz + 0.12);
  b.box(1.06, 0.04, 0.36, mat(P.cap), 0, Y0 + 0.62, pz + 0.12);
  b.add(new THREE.PlaneGeometry(0.5, 0.3), glassMat(true), 0, Y0 + 0.16, pz + 0.281);
  b.add(new THREE.CircleGeometry(0.25, 20, 0, Math.PI), glassMat(true), 0, Y0 + 0.31, pz + 0.281);
  const archF = new THREE.RingGeometry(0.25, 0.29, 20, 1, 0, Math.PI);
  b.add(archF, mat(P.cap), 0, Y0 + 0.31, pz + 0.283);
  for (const sx of [-1, 1]) b.add(new THREE.PlaneGeometry(0.16, 0.5), tileMat([1, 3]), sx * 0.38, Y0 + 0.31, pz + 0.282);
  b.add(new THREE.PlaneGeometry(0.62, 0.11), signMat({ lines: [txt('CHORSU', '#1d3d73', 1, { serif: true })], bg: null }, 0.62 / 0.11), 0, Y0 + 0.52, pz + 0.283);
  for (let i = 0; i < 3; i++) b.box(0.7 - i * 0.08, 0.016, 0.07, mat(P.cap), 0, Y0 + i * 0.016, pz + 0.31 + (2 - i) * 0.05);
  // xizmat kirishlari (orqa, yon)
  for (const a of [Math.PI / 2 + Math.PI, 0, Math.PI]) {
    const x = Math.cos(a) * (R + 0.05), z = Math.sin(a) * (R + 0.05);
    const ry = Math.PI / 2 - a;
    b.add(new THREE.BoxGeometry(0.55, 0.42, 0.16), cream, x, Y0 + 0.21, z, ry);
    const o = 0.081;
    b.add(new THREE.PlaneGeometry(0.34, 0.26), mat('#a9afb6', { metal: 0.5, rough: 0.45 }), x + Math.cos(a) * o, Y0 + 0.13, z + Math.sin(a) * o, ry);
  }
  // rasta-do‘konlar (soyabonli)
  const aw = ['#2f74c9', '#3d8a48', '#f2efe8', '#cf3a31', '#2f74c9', '#e8b931'];
  const goods = ['#d9442f', '#f2c94c', '#7cae3f', '#e27a2c', '#c77ddb'];
  let n = 0;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.17;
    if (Math.abs(Math.sin(a) - 1) < 0.35 || Math.abs(Math.sin(a) + 1) < 0.2 || Math.abs(Math.cos(a)) > 0.985) continue;
    const r = 2.3;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const ry = Math.PI / 2 - a;
    const g = new Builder();
    g.box(0.26, 0.07, 0.12, mat(P.wood, { rough: 0.75 }), 0, 0, 0);
    for (let k = 0; k < 3; k++) g.box(0.07, 0.025, 0.08, mat(goods[(k + n) % goods.length], { rough: 0.8 }), -0.08 + k * 0.08, 0.07, 0);
    for (const sx of [-1, 1]) g.box(0.012, 0.2, 0.012, mat(P.steelDark), sx * 0.13, 0, -0.07);
    const top = new THREE.BoxGeometry(0.3, 0.012, 0.22);
    top.rotateX(0.3);
    g.add(top, mat(aw[n % aw.length], { rough: 0.7 }), 0, 0.2, 0.0);
    b.mergeFrom(g, x, z, ry, Y0);
    n++;
  }
  // orqa: yuk mashinalari
  truck(b, 1.55, -2.45, Math.PI / 2, {});
  truck(b, -1.6, -2.45, -Math.PI / 2, {});
  for (const [x, z] of [[2.6, 2.6], [-2.6, 2.6], [2.6, -2.6], [-2.6, -2.6]]) {
    tree(b, x, z, 0.85, 'cypress', Math.round(x * 3 + z));
    tree(b, x * 0.9, z * 0.75, 0.8, 'round', Math.round(x + z * 2));
  }
  for (const [x, z] of [[-1.1, 2.7], [1.1, 2.7]]) bed(b, x, z, 1.2, true, Math.round(x * 3));
}

// =========================== 4-bosqich: sanoat, qurilish, qayta ishlash ===========================

/** Ko‘lxatib g‘isht — ofis-ombor, g‘isht xumdoni zali (ravoqlar), baland g‘isht mo‘ri, loy shiyponi, g‘isht taxlamlari. */
function kolxatib(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: -1.35, width: 0.55 }, { face: 'right', at: 0.9, width: 0.4 }] });
  // ofis-ombor
  const W = 1.7, D = 0.95, H = 0.5, cx = -0.2, cz = 0.3;
  block(b, W, H, D, cx, cz, { faces: ['back', 'left', 'right'], bay: 0.38, winW: 0.13, winH: 0.13, ac: 3, seed: 15, roof: '#5f72a0' });
  rollerDoor(b, 'front', W, D, cx, Y0, cz, -0.45, 0.32, 0.27);
  rollerDoor(b, 'front', W, D, cx, Y0, cz, 0.05, 0.32, 0.27);
  for (const t of [-0.45, 0.05]) {
    const q = onFace('front', W, D, cx, cz, t, -0.08);
    for (let k = 0; k < 2; k++) brickStack(b, q.x - 0.08 + k * 0.16, q.z + 0.12, 0.12, 0.12, 0.1);
  }
  shopfront(b, 'front', W, D, cx, Y0 + 0.04, cz, 0.6, 0.3, 0.24, { mull: 2 });
  b.doorOn('right', W, D, cx, Y0, cz, 0.2, 0.14, 0.25, '#7a4e2d');
  let p = onFace('front', W, D, cx, cz, 0, 0.02);
  b.box(0.9, 0.18, 0.04, mat(P.wall), p.x, Y0 + H - 0.04, p.z);
  sign(b, 'front', W, D + 0.08, cx, Y0 + H - 0.03, cz, 0, 0.82, 0.19, { lines: [txt('KOLXATIB GISHT', '#8a3b1f', 1, { serif: true })], bg: null, logo: 'bricks', logoColor: '#c8643c', logoPos: 'top' });
  stripe(b, 'front', W, D, cx, Y0, cz, 0.9 - 0.06, 0.07, H, '#b07a46', true);
  // xumdon zali (g‘isht devor, ravoqlar, metall tom)
  const KW = 2.3, KD = 0.75, KH = 0.3, kx = 1.05, kz = -1.0;
  const brick = mat('#b65f3c', { rough: 0.9 });
  b.rbox(KW, KH, KD, brick, kx, Y0, kz, 0.03);
  const dark = mat('#2c2420', { rough: 0.9 });
  for (let i = 0; i < 6; i++) {
    const x = kx - KW / 2 + 0.22 + i * 0.37;
    b.add(new THREE.PlaneGeometry(0.15, 0.12), dark, x, Y0 + 0.06, kz + KD / 2 + 0.002);
    b.add(new THREE.CircleGeometry(0.075, 10, 0, Math.PI), dark, x, Y0 + 0.12, kz + KD / 2 + 0.002);
  }
  for (let i = 0; i < 3; i++) b.box(KW + 0.01, 0.006, KD + 0.01, mat('#8f4a2c'), kx, Y0 + 0.08 + i * 0.07, kz);
  canopy(b, kx, kz, KW + 0.1, KD + 0.12, KH + 0.12, mat('#5f72a0', { metal: 0.3, rough: 0.5 }), mat(P.steelDark, { metal: 0.5 }), { slope: 0 });
  for (let i = 0; i < 5; i++) b.box(0.02, 0.06, KD + 0.1, mat(P.steelDark), kx - KW / 2 + 0.1 + i * 0.52, Y0 + KH + 0.07, kz);
  // mo‘ri
  chimney(b, -0.15, -1.45, 0.13, 1.25);
  b.box(0.02, 1.2, 0.04, mat(P.yellow), -0.02, Y0, -1.45);
  // loy shiyponi (chap-orqa)
  canopy(b, -1.75, -1.15, 1.05, 0.75, 0.3, mat('#5f72a0', { metal: 0.3, rough: 0.5 }), mat(P.steelDark, { metal: 0.5 }), { slope: 0.08 });
  const clay = mat('#b07a4a', { rough: 1 });
  for (const x of [-2.0, -1.5]) b.add(new THREE.ConeGeometry(0.24, 0.2, 14), clay, x, Y0 + 0.1, -1.15);
  b.box(1.0, 0.07, 0.04, mat(P.base), -1.75, Y0, -0.8);
  // g‘isht taxlamlari, yuk mashinasi, forklift
  const stacks = [[-2.1, 0.0], [-1.85, 0.0], [-2.1, 0.3], [0.95, 0.15], [1.2, 0.15], [1.45, 0.15], [1.7, 0.6], [1.95, 0.6], [1.0, -0.4], [1.25, -0.4]];
  for (const [x, z] of stacks) brickStack(b, x, z, 0.17, 0.12, 0.14);
  truck(b, -1.35, 1.3, 0, { open: true, load: '#c8643c' });
  forklift(b, -0.6, 1.1, 0.5);
  for (const [x, z, kk] of [[2.3, 1.75, 'round'], [-2.32, 1.78, 'cypress'], [2.33, -0.55, 'cypress'], [-2.32, -0.5, 'round']] as const) tree(b, x, z, 0.8, kk, Math.round(x * 3 + z * 5));
}

/** AKFA Aluminium — katta ishlab chiqarish zali: qizil vertikal tasmalar va soyabonlar, shisha ofis burchagi, profil taxlamlari. */
function akfa(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: -1.35, width: 0.6 }, { face: 'right', at: 0.9, width: 0.45 }] });
  const W = 3.3, D = 1.85, H = 0.58, cx = 0.45, cz = -0.38;
  block(b, W, H, D, cx, cz, { floors: 2, faces: ['back', 'right'], bay: 0.42, winW: 0.16, winH: 0.1, ac: 7, seed: 17, roof: '#7a8496' });
  for (const t of [-1.6, -0.7, 0.2, 1.6]) stripe(b, 'front', W, D, cx, Y0, cz, t, 0.09, H, P.red);
  stripe(b, 'left', W, D, cx, Y0, cz, 0.85, 0.09, H, P.red);
  stripe(b, 'right', W, D, cx, Y0, cz, -0.85, 0.09, H, P.red);
  // shisha ofis (o‘ng-old), chap qismda ko‘tarma eshiklar
  shopfront(b, 'front', W, D, cx, Y0 + 0.04, cz, 0.95, 1.0, 0.24, { mull: 6 });
  shopfront(b, 'front', W, D, cx, Y0 + 0.33, cz, 0.95, 1.0, 0.2, { mull: 6 });
  shopfront(b, 'front', W, D, cx, Y0 + 0.33, cz, -1.15, 0.7, 0.16, { mull: 5 });
  rollerDoor(b, 'front', W, D, cx, Y0, cz, -1.15, 0.36, 0.27);
  b.doorOn('front', W, D, cx, Y0, cz, -0.25, 0.18, 0.26, '#2b2f36', true);
  // lavha bloki
  let p = onFace('front', W, D, cx, cz, -0.25, 0.04);
  b.box(0.75, 0.32, 0.08, mat(P.wall), p.x, Y0 + H - 0.12, p.z);
  sign(b, 'front', W, D + 0.16, cx, Y0 + H - 0.08, cz, -0.25, 0.66, 0.26, { lines: [txt('AKFA', '#d32f27', 1.15), txt('ALUMINIUM', '#3a3d42', 0.55)], bg: null });
  awning(b, 'front', W, D, cx, Y0 + 0.3, cz, -0.25, 0.5, 0.16, mat(P.red, { rough: 0.5 }), 0.1);
  // tomda chiroq tasmasi (skylight) va havo quvurlari
  b.box(2.2, 0.08, 0.35, mat(P.wall), cx - 0.2, Y0 + H, cz - 0.1);
  b.box(2.1, 0.03, 0.3, clearGlass('#a8cde0', 0.75), cx - 0.2, Y0 + H + 0.08, cz - 0.1);
  const duct = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 12);
  duct.rotateZ(Math.PI / 2);
  b.add(duct, mat('#c3c9cf', { metal: 0.75, rough: 0.3 }), cx + 0.3, Y0 + H + 0.06, cz + 0.4);
  // chap tomonda qizil soyabonli ombor + profil taxlamlari
  canopy(b, -1.85, -0.4, 0.95, 1.55, 0.3, mat('#7a8496', { metal: 0.3, rough: 0.5 }), mat(P.steelDark, { metal: 0.5 }), { slope: 0.1 });
  b.box(0.04, 0.03, 1.6, mat(P.red), -1.85 - 0.5, Y0 + 0.28, -0.4);
  for (let i = 0; i < 4; i++) profileStack(b, -1.85, -1.0 + i * 0.38, 0.6, true);
  awning(b, 'front', W, D, cx, Y0 + 0.33, cz, -1.15, 0.6, 0.28, mat(P.red, { rough: 0.5 }), 0.12, P.steelDark);
  profileStack(b, 1.9, 0.75, 0.7, true, '#c7ccd1', 2);
  // silos va siklon (orqa-o‘ng)
  silo(b, 2.15, -1.55, 0.12, 0.3, { legs: 0.1, rail: P.yellow });
  cyclone(b, 2.15, -1.05, 0.34, { x: 2.1, z: -1.05, y: Y0 + 0.4 });
  truck(b, -1.35, 1.2, 0, {});
  forklift(b, -0.7, 0.9, 0.7);
  bed(b, 0.75, 0.75, 1.2, true, 4, 0.14);
  for (const [x, z, kk] of [[2.3, 1.75, 'round'], [-2.32, -1.78, 'cypress'], [2.32, 0.2, 'cypress'], [-0.4, 1.75, 'round']] as const) tree(b, x, z, 0.8, kk, Math.round(x * 3 + z * 5));
}

/** IMZO — eshik-deraza: qizil tasmali bino, katta shisha ko‘rgazma, yuk eshiklari, rom taxlamlari, qizil ustun-lavha. */
function imzo(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: -1.15, width: 0.55 }, { face: 'front', at: 1.2, width: 0.3 }] });
  const W = 2.55, D = 1.3, H = 0.52, cx = 0.25, cz = -0.38;
  block(b, W, H, D, cx, cz, { faces: ['back', 'left', 'right'], bay: 0.42, winW: 0.16, winH: 0.09, ac: 5, seed: 19, roof: '#6b7486' });
  for (const t of [-1.2, -0.25, 1.22]) stripe(b, 'front', W, D, cx, Y0, cz, t, 0.08, H, P.red);
  stripe(b, 'left', W, D, cx, Y0, cz, 0.0, 0.08, H, P.red);
  rollerDoor(b, 'front', W, D, cx, Y0, cz, -0.85, 0.32, 0.3);
  rollerDoor(b, 'front', W, D, cx, Y0, cz, -0.5, 0.2, 0.3);
  shopfront(b, 'front', W, D, cx, Y0 + 0.03, cz, 0.48, 1.0, 0.42, { mull: 5 });
  // vitrinadagi romlar (oyna oldida)
  for (let i = 0; i < 4; i++) {
    const q = onFace('front', W, D, cx, cz, 0.12 + i * 0.24, 0.017);
    b.add(new THREE.PlaneGeometry(0.1, 0.22), mat(i % 2 ? '#e9e5dc' : '#b07a46', { rough: 0.6 }), q.x, Y0 + 0.16, q.z, q.ry);
  }
  b.doorOn('front', W, D, cx, Y0, cz, 1.05, 0.14, 0.26, '#2b2f36', true);
  awning(b, 'front', W, D, cx, Y0 + 0.31, cz, 1.05, 0.3, 0.16, mat('#2e3238', { metal: 0.3 }), 0.1);
  sign(b, 'front', W, D, cx, Y0 + H - 0.08, cz, 0.6, 0.5, 0.11, { lines: [txt('IMZO', '#d32f27', 1)], bg: null });
  // rom taxlamlari (oq PVX va yog‘och)
  for (const [x, z, c] of [[-1.55, 0.25, '#f2f0ea'], [-1.25, 0.32, '#c08a4e'], [-1.6, -0.4, '#f2f0ea']] as const) {
    b.box(0.2, 0.02, 0.12, mat('#b98a55'), x, Y0, z);
    for (let k = 0; k < 4; k++) b.box(0.012, 0.2, 0.12, mat(c, { rough: 0.6 }), x - 0.06 + k * 0.04, Y0 + 0.02, z);
  }
  pallet(b, -0.3, 0.5, 0.15, 0.06, 0.12, '#c79a62');
  truck(b, -1.15, 1.0, 0, {});
  signPost(b, 1.45, 1.2, 0, { lines: [txt('IMZO', '#d32f27', 1)], bg: '#ffffff' }, 0.12, 0.2);
  bed(b, 0.55, 0.45, 1.1, true, 4, 0.12);
  for (const [x, z, kk] of [[1.82, 1.27, 'round'], [-1.82, -1.28, 'cypress'], [1.83, -1.28, 'round'], [-0.35, 1.27, 'cypress']] as const) tree(b, x, z, 0.8, kk, Math.round(x * 3 + z * 5));
}

/** DAFNA — mebel: shisha ko‘rgazma zali (iliq yorug‘lik), orqada arra-tishli tomli ustaxona, yog‘och ombori, siklon. */
function dafna(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: -1.2, width: 0.55 }, { face: 'front', at: 0.75, width: 0.4 }] });
  // ustaxona (arra-tishli tom)
  const SW = 2.6, SD = 1.65, SH = 0.36, sx = 0.3, sz = -0.75;
  block(b, SW, SH, SD, sx, sz, { faces: ['back', 'left', 'right'], bay: 0.4, winW: 0.15, winH: 0.08, roof: '#5d6f93' });
  const bays = 4, bd = SD / bays, th = 0.2;
  for (let i = 0; i < bays; i++) {
    const z0 = sz - SD / 2 + i * bd;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(bd, 0); sh.lineTo(bd, th); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: SW - 0.06, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    g.translate((SW - 0.06) / 2, 0, 0);
    b.addGroups(g, [mat(P.wall, { rough: 0.85 }), mat('#5d6f93', { rough: 0.55, metal: 0.25 })], sx, Y0 + SH, z0);
    b.add(new THREE.PlaneGeometry(SW - 0.1, th * 0.75), clearGlass('#a8cde0', 0.8), sx, Y0 + SH + th * 0.42, z0 + bd + 0.003);
  }
  // ko‘rgazma zali (old-o‘ng)
  const W = 1.55, D = 0.85, H = 0.6, cx = 0.75, cz = 0.42;
  block(b, W, H, D, cx, cz, { faces: ['back'], ac: 2, seed: 23, roof: '#5d6f93' });
  shopfront(b, 'front', W, D, cx, Y0 + 0.03, cz, 0.3, 0.85, 0.5, { mull: 4 });
  shopfront(b, 'right', W, D, cx, Y0 + 0.03, cz, 0, 0.65, 0.5, { mull: 3 });
  shopfront(b, 'left', W, D, cx, Y0 + 0.03, cz, 0, 0.55, 0.3, { mull: 3 });
  let p = onFace('front', W, D, cx, cz, -0.4, 0.03);
  b.box(0.55, H + 0.12, 0.08, mat(P.wall), p.x, Y0, p.z);
  sign(b, 'front', W, D + 0.14, cx, Y0 + H - 0.2, cz, -0.4, 0.42, 0.26, { lines: [txt('DAFNA', '#a87c32', 1, { serif: true })], bg: null, logo: 'wheat', logoColor: '#a87c32', logoPos: 'top' });
  awning(b, 'front', W, D, cx, Y0 + 0.28, cz, 0.3, 0.9, 0.18, mat('#2e3238', { metal: 0.3 }), 0.08);
  stripe(b, 'front', W, D, cx, Y0, cz, -0.05, 0.06, H, '#b07a46', true);
  // ko‘rgazma oldida divan va kreslolar (oyna ortidagi iliq zal o‘rniga tashqi ko‘rinish)
  for (const [x, z] of [[0.55, 1.05], [1.1, 1.05]]) {
    b.rbox(0.16, 0.05, 0.08, mat('#e8dcc6', { rough: 0.9 }), x, Y0, z, 0.015);
    b.rbox(0.16, 0.05, 0.02, mat('#e8dcc6', { rough: 0.9 }), x, Y0 + 0.05, z - 0.03, 0.008);
  }
  // yog‘och ombori (chap) va forklift
  canopy(b, -1.45, -0.35, 0.8, 1.6, 0.3, mat('#5d6f93', { metal: 0.3, rough: 0.5 }), mat(P.steelDark, { metal: 0.5 }), { slope: 0.1 });
  for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) pallet(b, -1.6 + k * 0.3, -0.95 + i * 0.4, 0.22, 0.1 + (i % 2) * 0.05, 0.16, '#d9b47a');
  forklift(b, -1.0, 0.25, 0.3);
  for (let i = 0; i < 3; i++) pallet(b, -0.4 + i * 0.2, 0.3, 0.14, 0.05, 0.1, '#d9b47a');
  cyclone(b, 1.8, -0.65, 0.4, { x: 1.62, z: -0.65, y: Y0 + 0.3 });
  truck(b, -1.2, 1.35, 0, { stripe: '#2f4f86' });
  for (const [x, z, kk] of [[1.82, 1.82, 'round'], [-1.82, -1.82, 'cypress'], [1.83, -1.82, 'round'], [0.0, 1.82, 'cypress'], [-1.83, 0.6, 'round']] as const) tree(b, x, z, 0.8, kk, Math.round(x * 3 + z * 5));
}

/** Murad Buildings — qurilish firmasi: ikki qavatli shisha ofis, hovlida qurilish materiallari, kran-mashina, konteyner. */
function murad(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 0.95, width: 0.55 }, { face: 'left', at: 0.6, width: 0.3 }] });
  const W = 1.55, D = 1.1, H = 0.72, cx = -0.6, cz = 0.25;
  block(b, W, H, D, cx, cz, { floors: 2, faces: ['back', 'left', 'right'], bay: 0.4, winW: 0.15, winH: 0.15, ac: 3, seed: 25, roof: '#4f6aa8' });
  for (const t of [-0.5, 0.45]) {
    shopfront(b, 'front', W, D, cx, Y0 + 0.03, cz, t, 0.5, 0.3, { mull: 3 });
    shopfront(b, 'front', W, D, cx, Y0 + 0.39, cz, t, 0.5, 0.28, { mull: 3 });
  }
  let p = onFace('front', W, D, cx, cz, -0.02, 0.03);
  b.box(0.38, H + 0.06, 0.08, mat(P.wall), p.x, Y0, p.z);
  sign(b, 'front', W, D + 0.14, cx, Y0 + 0.36, cz, -0.02, 0.34, 0.3, { lines: [txt('MURAD', '#1d3d73', 1), txt('BUILDINGS', '#1d3d73', 0.6)], bg: null, logo: 'bars', logoColor: '#1d3d73', logoPos: 'top' });
  b.doorOn('front', W, D + 0.16, cx, Y0, cz, -0.02, 0.16, 0.26, '#2b2f36', true);
  const glassCanopy = new THREE.BoxGeometry(0.5, 0.012, 0.22);
  glassCanopy.translate(0, 0, 0.11);
  addTilted(b, glassCanopy, clearGlass('#cfe7ef', 0.6), p.x, Y0 + 0.3, p.z + 0.04, 0, 0.1);
  stripe(b, 'front', W, D, cx, Y0, cz, W / 2 - 0.05, 0.07, H, '#b07a46', true);
  // orqa garaj qanoti
  block(b, 0.6, 0.38, 0.55, -1.25, -0.75, { faces: ['back', 'left'], bay: 0.3, winW: 0.1, winH: 0.1, roof: '#4f6aa8' });
  rollerDoor(b, 'right', 0.6, 0.55, -1.25, Y0, -0.75, 0, 0.24, 0.24);
  // hovli: materiallar
  for (const [x, z, c, h] of [[0.5, -0.3, '#e9e6df', 0.1], [0.5, 0.0, '#e9e6df', 0.08], [0.75, -0.3, '#9aa0a6', 0.12], [0.75, 0.0, '#9aa0a6', 0.1], [1.65, -1.6, '#d9b47a', 0.08]] as const) pallet(b, x, z, 0.18, h, 0.16, c);
  profileStack(b, 1.0, -0.9, 0.7, true, '#5d636b', 2);
  profileStack(b, 0.35, -1.25, 0.6, true, '#9aa0a6', 2);
  for (let i = 0; i < 3; i++) pallet(b, 1.55, 0.2 + i * 0.18, 0.16, 0.07, 0.14, '#d9b47a');
  b.rbox(0.42, 0.22, 0.2, mat('#2f6bb5', { rough: 0.5, metal: 0.2 }), 1.6, Y0, -1.25, 0.01);
  for (let i = 0; i < 5; i++) b.box(0.004, 0.2, 0.205, mat('#25599c'), 1.42 + i * 0.09, Y0 + 0.01, -1.25);
  craneTruck(b, 0.2, -0.65, Math.PI * 0.85);
  forklift(b, 1.1, 0.6, -0.5);
  truck(b, 0.95, 1.15, 0, { stripe: '#2f74c9' });
  for (const [x, z, kk] of [[-1.82, 1.82, 'round'], [1.85, -1.82, 'cypress'], [-1.83, -1.83, 'cypress'], [0.25, 1.82, 'cypress'], [1.85, 1.0, 'round']] as const) tree(b, x, z, 0.8, kk, Math.round(x * 3 + z * 5));
}

/** Toshrangmetzavod Recycling — elektron chiqindilarni saralash: yashil panelli korpus, soyabonli saralash maydoni, konteynerlar. */
function recycling(b: Builder, w: number, d: number) {
  compound(b, w, d, { gates: [{ face: 'front', at: 1.4, width: 0.6 }, { face: 'front', at: -0.4, width: 0.32 }] });
  const W = 2.6, D = 1.4, H = 0.62, cx = 0.4, cz = -0.38;
  block(b, W, H, D, cx, cz, { floors: 2, faces: ['back', 'right'], bay: 0.4, winW: 0.16, winH: 0.12, ac: 6, seed: 27, roof: '#62749a' });
  const green = '#4c8a50';
  for (const t of [-1.22, -0.35, 1.22]) stripe(b, 'front', W, D, cx, Y0, cz, t, 0.1, H, green);
  for (const t of [-0.55, 0.55]) stripe(b, 'left', W, D, cx, Y0, cz, t, 0.1, H, green);
  stripe(b, 'right', W, D, cx, Y0, cz, 0, 0.1, H, green);
  shopfront(b, 'front', W, D, cx, Y0 + 0.36, cz, 0.4, 1.4, 0.2, { mull: 7 });
  shopfront(b, 'front', W, D, cx, Y0 + 0.36, cz, -0.8, 0.6, 0.2, { mull: 3 });
  for (const t of [-0.8, 0.0, 0.7]) rollerDoor(b, 'front', W, D, cx, Y0, cz, t, 0.3, 0.26);
  shopfront(b, 'left', W, D, cx, Y0 + 0.36, cz, 0, 0.6, 0.18, { mull: 3 });
  sign(b, 'front', W, D, cx, Y0 + 0.62 - 0.2, cz, 0.35, 1.25, 0.2, { lines: [txt('RECYCLING', '#2f7a3a', 1), txt('TOSHRANGMETZAVOD', '#2f7a3a', 0.45)], bg: P.wall, logo: 'recycle', logoColor: '#2f7a3a' }, P.wall);
  // tomdagi minora
  block(b, 0.38, 0.32, 0.38, cx + 0.85, cz - 0.3, { faces: [], roof: '#62749a' }, Y0 + H);
  stripe(b, 'front', 0.38, 0.38, cx + 0.85, Y0 + H, cz - 0.3, 0.1, 0.08, 0.32, green);
  b.cyl(0.03, 0.03, 0.22, mat('#c3c9cf', { metal: 0.7, rough: 0.3 }), cx - 0.8, Y0 + H, cz - 0.4, 10);
  // saralash maydoni (chap, soyabon ostida): maishiy texnika, setkali yashiklar
  canopy(b, -1.6, -0.3, 0.95, 1.4, 0.3, mat('#8a929e', { metal: 0.3, rough: 0.5 }), mat(P.steelDark, { metal: 0.5 }), { slope: 0.08 });
  const white = mat('#eef0f2', { rough: 0.5 });
  for (let i = 0; i < 9; i++) {
    const x = -1.95 + (i % 3) * 0.22, z = -0.8 + Math.floor(i / 3) * 0.32;
    b.rbox(0.1, 0.09, 0.09, white, x, Y0, z, 0.01);
    b.cyl(0.028, 0.028, 0.004, mat('#5d636b'), x, Y0 + 0.045, z + 0.046, 12);
    if (i % 2) b.rbox(0.1, 0.07, 0.09, white, x, Y0 + 0.09, z, 0.01);
  }
  const cage = mat('#9aa3ad', { metal: 0.5, rough: 0.4 });
  for (const [x, z] of [[-1.3, 0.6], [-1.75, 0.6]]) {
    b.box(0.2, 0.012, 0.16, mat('#b98a55'), x, Y0, z);
    for (let k = 0; k < 5; k++) b.box(0.004, 0.14, 0.16, cage, x - 0.1 + k * 0.05, Y0 + 0.012, z);
    for (let k = 0; k < 4; k++) b.rbox(0.07, 0.06, 0.06, mat(k % 2 ? '#d7dade' : '#8f969e', { rough: 0.5 }), x - 0.05 + (k % 2) * 0.1, Y0 + 0.015 + Math.floor(k / 2) * 0.06, z, 0.008);
  }
  // konteynerlar, yuk mashinasi, forklift, siklon
  for (const [x, z, r] of [[1.95, 0.55, 0], [2.15, -0.2, Math.PI / 2], [-0.9, 0.75, 0], [2.15, 0.15, Math.PI / 2]] as const) {
    dumpster(b, x, z, r);
    pallet(b, x, z, 0.12, 0.03, 0.07, '#9aa0a6', r, Y0 + 0.095);
  }
  truck(b, 1.4, 1.2, 0, { logo: { lines: [txt('', '#2f7a3a', 1)], bg: '#f3f3f1', logo: 'recycle', logoColor: '#2f7a3a' } });
  forklift(b, 0.55, 0.75, -0.4);
  cyclone(b, 2.05, -1.05, 0.36, { x: 1.7, z: -1.05, y: Y0 + 0.4 });
  for (const [x, z, kk] of [[-2.32, 1.75, 'cypress'], [2.32, -1.78, 'cypress'], [-2.32, -1.78, 'round'], [0.3, -1.82, 'round']] as const) tree(b, x, z, 0.8, kk, Math.round(x * 3 + z * 5));
}

export const BUSINESS_RECIPES: Record<string, Recipe> = {
  biz_korzinka: korzinka,
  biz_bon: bon,
  biz_safia: safia,
  biz_varnet: varnet,
  biz_sag_gardens: sagGardens,
  biz_pure_milky: pureMilky,
  biz_besh_qozon: beshQozon,
  biz_crafers: crafers,
  biz_bibi_hanum: bibiHanum,
  biz_ideal: ideal,
  biz_rishton: rishton,
  biz_chorsu: chorsu,
  biz_kolxatib: kolxatib,
  biz_akfa: akfa,
  biz_imzo: imzo,
  biz_dafna: dafna,
  biz_murad: murad,
  biz_recycling: recycling,
};

void acUnit;
void flatRoof;
void rng;
