import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CATALOG } from '../game/catalog';
import type { ObjectType } from '../game/types';
import { Builder, C, mat, photoMat, wallMat } from './builder';
import { BUSINESS_RECIPES } from './businessModels';
import { EDUCATION_RECIPES } from './educationModels';
import { hospitalRecipe } from './hospitalModel';
import { CIVIC_RECIPES } from './civicModels';

/**
 * Model factory. Har bir obyekt turi uchun procedural model (kod orqali, rasmlardan uslub olingan).
 * Kelajakda GLB/glTF ga o‘tish: katalogdagi `gltfUrl` ni to‘ldirish kifoya — `getModel` avval
 * procedural modelni qaytaradi, GLB yuklangach `onUpgrade` orqali almashtiradi.
 *
 * Model koordinatalari: footprint markazi (0,0,0), old tomon (kirish) +Z, 1 birlik = 1 katak.
 */
export interface ModelSource {
  create(type: ObjectType): THREE.Object3D;
}

type Recipe = (b: Builder, w: number, d: number) => void;

function plot(b: Builder, w: number, d: number, color = C.paving) {
  b.box(w - 0.04, 0.03, d - 0.04, mat(color), 0, 0, 0);
}

function lawn(b: Builder, w: number, d: number, x = 0, z = 0) {
  b.box(w, 0.035, d, mat(C.lawn), x, 0, z);
}

/** Uy hovlisi chegarasi: past butazor qatori, oldida yo‘lak uchun ochiq joy, burchaklarda gullar. */
function garden(b: Builder, w: number, d: number, gapX = 0, gapW = 0.45) {
  const hx = w / 2 - 0.08, hz = d / 2 - 0.08;
  b.hedgeRow(0, -hz, w - 0.2, true);
  b.hedgeRow(-hx, 0, d - 0.2, false);
  b.hedgeRow(hx, 0, d - 0.2, false);
  const l = gapX - gapW / 2 + hx, r = hx - (gapX + gapW / 2);
  if (l > 0.05) b.hedgeRow(-hx + l / 2, hz, l, true);
  if (r > 0.05) b.hedgeRow(hx - r / 2, hz, r, true);
  const cols = [C.flowerRed, C.flowerYellow, C.blossom, '#ffffff'];
  for (let i = 0; i < 8; i++) b.bush(-hx + 0.12 + (i % 2) * 0.1, -hz + 0.15 + Math.floor(i / 2) * 0.12, 0.55, cols[i % 4]);
}


const RECIPES: Record<string, Recipe> = {
  // ---- Uylar (G001 dagi uy kartalari): toza shtukatura devor, oq ramkali 3D derazalar ----
  house_a(b, w, d) {
    // G001: bir qavatli, krem devor, to‘q kulrang-ko‘k to‘rt nishabli tom, mo‘ri, yog‘och eshik
    plot(b, w, d, C.lawn);
    garden(b, w, d, 0);
    b.box(0.26, 0.031, 0.62, mat(C.paving), 0, 0.005, 0.66);
    const W = 1.15, D = 0.95, H = 0.5, Z = -0.1;
    b.building(W, H, D, { wall: '#efe2c9', floors: 1, bay: 0.32, winW: 0.15, winH: 0.22, muntin: true, skip: [{ face: 'front', at: 0, width: 0.2 }], roof: null, cornice: '#f6f1e6', plinth: '#cdbb9c' }, 0, 0.03, Z);
    b.doorOn('front', W, D, 0, 0.03, Z, 0, 0.15, 0.3);
    b.rbox(0.36, 0.035, 0.14, mat(C.stone), 0, 0.03, Z + D / 2 + 0.07, 0.01);
    b.rbox(0.36, 0.022, 0.1, mat(C.stone), 0, 0.03, Z + D / 2 + 0.16, 0.008);
    b.hipRoof(1.36, 1.16, 0.42, mat('#4c586d', { rough: 0.7 }), 0, H + 0.03, Z);
    b.rbox(0.11, 0.26, 0.11, wallMat('#d9c7a8'), 0.32, H + 0.2, Z - 0.22, 0.01);
    b.rbox(0.13, 0.025, 0.13, mat('#8f8a82'), 0.32, H + 0.46, Z - 0.22, 0.005);
    b.tree(-0.75, -0.75, 1.0).tree(0.8, 0.6, 0.85);
  },
  house_b(b, w, d) {
    // G001: terrakota tom, oldida ustunli ayvon, ochiq krem devor
    plot(b, w, d, C.lawn);
    garden(b, w, d, 0.2);
    b.box(0.26, 0.031, 0.5, mat(C.paving), 0.2, 0.005, 0.72);
    const W = 1.3, D = 1.0, H = 0.5, Z = -0.1;
    b.building(W, H, D, { wall: '#f3e6cf', floors: 1, bay: 0.34, winW: 0.16, winH: 0.22, muntin: true, frame: '#ffffff', skip: [{ face: 'front', at: 0.2, width: 0.25 }], roof: null, cornice: '#fbf6ec', plinth: '#d2bf9e' }, 0, 0.03, Z);
    b.doorOn('front', W, D, 0, 0.03, Z, 0.2, 0.15, 0.3, '#8a5a35');
    // ayvon: pol, 2 ustun, soyabon
    b.rbox(0.62, 0.035, 0.32, mat('#e2d6c0'), 0.2, 0.03, Z + D / 2 + 0.16, 0.01);
    for (const x of [-0.06, 0.46]) {
      b.cyl(0.022, 0.026, 0.38, mat('#ffffff', { rough: 0.5 }), x, 0.065, Z + D / 2 + 0.27, 12);
      b.rbox(0.06, 0.02, 0.06, mat('#ffffff'), x, 0.44, Z + D / 2 + 0.27, 0.005);
    }
    b.rbox(0.7, 0.035, 0.38, mat('#c8653d', { rough: 0.7 }), 0.2, 0.455, Z + D / 2 + 0.16, 0.01);
    b.hipRoof(1.5, 1.22, 0.4, mat('#c8653d', { rough: 0.72 }), 0, H + 0.03, Z);
    b.tree(-0.78, 0.6, 0.95).tree(0.8, -0.75, 1.05).tree(-0.8, -0.72, 0.85, 0, true);
  },
  house_c(b, w, d) {
    // G001: ikki qavatli, ikki nishabli ko‘k tom, balkon, yonida garaj
    plot(b, w, d, C.lawn);
    garden(b, w, d, -0.3);
    const W = 1.3, D = 1.4, H = 0.9, Z = -0.25;
    b.building(W, H, D, { wall: '#efe1c6', floors: 2, bay: 0.32, winW: 0.15, winH: 0.22, muntin: true, skip: [{ face: 'front', at: -0.3, width: 0.22 }], roof: null, cornice: '#f7f2e8', plinth: '#cdbb9c' }, 0, 0.03, Z);
    b.doorOn('front', W, D, 0, 0.03, Z, -0.3, 0.15, 0.3);
    // balkon (2-qavat)
    b.rbox(0.5, 0.025, 0.18, mat('#f7f3ea'), 0.28, 0.47, Z + D / 2 + 0.09, 0.008);
    for (let i = 0; i <= 6; i++) b.box(0.01, 0.1, 0.01, mat('#ffffff'), 0.06 + i * 0.073, 0.495, Z + D / 2 + 0.17);
    b.box(0.5, 0.012, 0.012, mat('#ffffff'), 0.28, 0.595, Z + D / 2 + 0.17);
    b.gableRoof(1.48, 1.56, 0.42, mat('#4c586d', { rough: 0.7 }), 0, H + 0.03, Z);
    b.box(1.48, 0.03, 0.03, mat('#f6f1e6'), 0, H + 0.02, Z + D / 2 + 0.06);
    b.rbox(0.11, 0.3, 0.11, wallMat('#d9c7a8'), -0.35, H + 0.15, Z - 0.35, 0.01);
    // garaj
    b.building(0.5, 0.36, 0.55, { wall: '#e6d6b8', floors: 1, faces: [], roof: '#bdb4a6', cornice: '#f6f1e6', plinth: null }, 0.62, 0.03, 0.62);
    for (let i = 0; i < 6; i++) b.box(0.36, 0.035, 0.012, mat(i % 2 ? '#c9ccd0' : '#b5b9be', { metal: 0.3, rough: 0.5 }), 0.62, 0.035 + i * 0.042, 0.9);
    b.box(0.3, 0.031, 0.62, mat(C.paving), -0.3, 0.005, 1.15);
    b.tree(-0.75, 1.15, 0.95).tree(0.8, -1.2, 1.05);
  },
  apartment(b, w, d) {
    // G032/G001: 5 qavatli krem turar-joy, oldida shisha to‘siqli balkonlar, tomida bog‘
    plot(b, w, d);
    const W = 2.3, D = 1.5, H = 1.6, Z = -0.35;
    b.building(W, H, D, { wall: '#efe3cb', floors: 5, bay: 0.27, winW: 0.13, winH: 0.17, muntin: false, skip: [{ face: 'front', at: 0, width: 0.32 }], roof: '#c9c2b5', cornice: '#f7f2e8', plinth: '#cdbb9c' }, 0, 0.03, Z);
    b.doorOn('front', W, D, 0, 0.03, Z, 0, 0.28, 0.26, '#2b2f36', true);
    for (let f = 1; f < 5; f++) {
      for (const x of [-0.8, -0.27, 0.27, 0.8]) {
        b.rbox(0.34, 0.022, 0.13, mat('#f7f3ea'), x, 0.03 + f * 0.32, Z + D / 2 + 0.065, 0.006);
        b.box(0.34, 0.09, 0.008, mat('#9cc6e6', { rough: 0.1, metal: 0.2 }), x, 0.052 + f * 0.32, Z + D / 2 + 0.125);
      }
    }
    b.rbox(0.6, 0.025, 0.28, mat('#ffffff'), 0, 0.31, Z + D / 2 + 0.14, 0.006);
    b.box(0.9, 0.05, 0.6, mat(C.grass), -0.5, H + 0.03, -0.4);
    b.tree(-0.5, -0.4, 0.55, H + 0.08).tree(0.5, -0.5, 0.45, H + 0.03);
    b.rbox(0.4, 0.18, 0.3, mat('#b8b5ae'), 0.55, H + 0.03, -0.2, 0.01);
    lawn(b, 2.6, 0.5, 0, 1.0);
    b.tree(-1.1, 1.05).tree(1.1, 1.05).tree(-0.6, 1.1, 0.8, 0, true);
  },
  // ---- Savdo (G036 supermarket, G032 ofis) ----
  shop(b, w, d) {
    // G036: keng vitrinali supermarket, yog‘och reyka panellar, to‘q soyabon, tomda konditsionerlar
    plot(b, w, d, C.asphalt);
    const W = 1.6, D = 0.85, H = 0.55, Z = -0.45;
    b.building(W, H, D, { wall: '#e8dcc6', floors: 1, bay: 0.4, winW: 0.3, groundWinH: 0.34, frame: '#2b2f36', faces: ['front'], skip: [{ face: 'front', at: 0.0, width: 0.3 }], roof: '#c9c4bb', cornice: '#d8cdb8', plinth: null }, 0, 0.03, Z);
    b.doorOn('front', W, D, 0, 0.03, Z, 0, 0.26, 0.32, '#2b2f36', true);
    for (let i = 0; i < 9; i++) b.box(0.02, 0.12, 0.01, mat('#a8743f', { rough: 0.6 }), -0.72 + i * 0.18, 0.42, Z + D / 2 + 0.006);
    b.rbox(1.64, 0.03, 0.24, mat('#3a3f46', { rough: 0.5 }), 0, 0.4, Z + D / 2 + 0.12, 0.008);
    for (const x of [-0.6, 0.6]) b.cyl(0.012, 0.012, 0.37, mat('#2b2f36'), x, 0.03, Z + D / 2 + 0.22, 8);
    b.rbox(0.5, 0.12, 0.03, mat('#d2433a'), 0.45, 0.6, Z + D / 2 + 0.01, 0.01);
    b.rbox(0.3, 0.12, 0.25, mat('#b8bcc2', { metal: 0.3 }), -0.45, H + 0.03, -0.6, 0.01);
    b.rbox(0.2, 0.1, 0.18, mat('#b8bcc2', { metal: 0.3 }), 0.45, H + 0.03, -0.55, 0.01);
    for (let i = 0; i < 5; i++) b.box(0.015, 0.032, 0.3, mat(C.white), -0.75 + i * 0.32, 0.005, 0.55);
    for (const x of [-0.5, -0.2, 0.2, 0.5]) b.cyl(0.015, 0.015, 0.08, mat('#2b2f36'), x, 0.03, 0.22, 8);
    b.car(-0.6, 0.55, '#d9433c').car(0.05, 0.55, '#3a7bd5').car(0.37, 0.55, '#f2f2f2');
    b.tree(-0.85, -0.85, 0.8).tree(0.85, 0.85, 0.8);
  },
  office(b, w, d) {
    plot(b, w, d);
    b.facade(2.4, 0.45, 2.2, 'shop', 0, 0.03, -0.1, 0.45, 0.4);
    b.facade(1.5, 2.6, 1.4, 'glass', 0, 0.48, -0.25, 0.26, 0.2);
    // vertikal ramkalar
    for (const x of [-0.76, 0.76]) b.box(0.06, 2.6, 0.06, mat(C.white), x, 0.48, 0.46);
    for (const x of [-0.76, 0.76]) b.box(0.06, 2.6, 0.06, mat(C.white), x, 0.48, -0.96);
    b.box(1.56, 0.1, 1.46, mat(C.white), 0, 3.08, -0.25);
    b.box(0.5, 0.18, 0.4, mat(C.concrete), 0.2, 3.18, -0.3);
    b.box(2.44, 0.05, 2.24, mat(C.creamDark), 0, 0.48, -0.1);
    b.box(0.8, 0.03, 0.25, mat(C.white), 0, 0.3, 1.06);
    b.tree(-1.2, 1.25).tree(1.2, 1.25).tree(-1.2, -1.25).tree(1.2, -1.25);
      },
  // ---- Xizmatlar (G027 maktab, G034 shifoxona) ----
  school(b, w, d) {
    // G027: ikki qavatli krem bino, to‘q ramkali derazalar, yog‘och vertikal panellar, shisha kirish bloki
    plot(b, w, d);
    const opts = { wall: '#ecdfc6', floors: 2, bay: 0.28, winW: 0.16, winH: 0.16, frame: '#2b2f36', muntin: true, roof: '#c9c4bb', cornice: '#f4ede0', plinth: '#cdbb9c' };
    b.building(2.6, 0.75, 0.8, opts, 0, 0.03, -0.95);
    b.building(0.7, 0.75, 1.0, opts, -0.95, 0.03, 0.0);
    // shisha kirish bloki
    b.building(0.6, 0.62, 0.35, { wall: '#3a3f46', floors: 1, bay: 0.15, winW: 0.12, groundWinH: 0.5, frame: '#2b2f36', faces: ['front', 'left', 'right'], roof: '#8f8a82', cornice: null, plinth: null, skip: [{ face: 'front', at: 0, width: 0.2 }] }, 0, 0.03, -0.37);
    b.doorOn('front', 0.6, 0.35, 0, 0.03, -0.37, 0, 0.2, 0.28, '#2b2f36', true);
    b.rbox(0.5, 0.025, 0.25, mat('#3a3f46'), 0, 0.36, -0.1, 0.006);
    for (const x of [-1.15, -0.7, 0.7, 1.15]) b.box(0.05, 0.6, 0.012, mat('#a8743f', { rough: 0.6 }), x, 0.1, -0.545);
    for (let i = 0; i < 4; i++) b.rbox(0.36 - i * 0.02, 0.02, 0.08, mat(C.stone), 0, 0.03 + i * 0.012, -0.12 + i * 0.07, 0.004);
    b.box(1.5, 0.035, 1.0, mat('#3f9d6b'), 0.55, 0.0, 0.55);
    b.box(1.6, 0.034, 1.1, mat('#c8573e'), 0.55, -0.001, 0.55);
    b.box(1.3, 0.036, 0.015, mat(C.white), 0.55, 0.0, 0.55);
    b.cyl(0.012, 0.012, 0.9, mat(C.metal), -0.35, 0.03, 0.5, 6);
    b.box(0.22, 0.12, 0.01, mat('#2e9ad6'), -0.23, 0.78, 0.5);
    b.tree(1.25, -0.2).tree(-1.25, 1.2).tree(1.25, 1.25, 0.8);
  },
  // Shifoxona: docs/shifoxona-rasmlar/1–4.png asosidagi model (three/hospitalModel.ts)
  hospital(b, w, d) {
    hospitalRecipe(b, w, d);
  },
  // ---- Elektr stansiyasi: PNG yo‘q, G032 sanoat ikonidan uslub ----
  power_plant(b, w, d) {
    plot(b, w, d, C.concrete);
    b.facade(1.5, 0.6, 1.0, 'beige', -0.5, 0.03, -0.7, 0.6, 0.35);
    b.box(1.56, 0.06, 1.06, mat(C.slateLight), -0.5, 0.63, -0.7);
    for (const x of [0.6, 0.95]) {
      b.cyl(0.11, 0.14, 1.6, mat(C.white), x, 0.03, -0.8, 14);
      b.cyl(0.115, 0.115, 0.12, mat(C.red), x, 1.2, -0.8, 14);
      b.cyl(0.112, 0.112, 0.12, mat(C.red), x, 1.48, -0.8, 14);
    }
    // quyosh panellari
    for (let i = 0; i < 3; i++) {
      const p = new THREE.BoxGeometry(0.5, 0.02, 0.3);
      b.add(p, mat('#2b4f86', { rough: 0.25, metal: 0.4 }), -0.85 + i * 0.55, 0.2, 0.75, 0, -0.5);
      b.box(0.03, 0.15, 0.03, mat(C.metal), -0.85 + i * 0.55, 0.03, 0.8);
    }
    // transformator hovlisi
    for (let i = 0; i < 3; i++) {
      b.box(0.18, 0.22, 0.18, mat(C.darkMetal), 0.35 + i * 0.3, 0.03, 0.2);
      b.cyl(0.015, 0.015, 0.5, mat(C.metal), 0.35 + i * 0.3, 0.03, 0.42, 5);
    }
    b.box(1.0, 0.012, 0.012, mat(C.darkMetal), 0.65, 0.52, 0.42);
    b.box(0.02, 0.15, 2.8, mat(C.metal), 1.42, 0.03, 0);
    b.box(2.8, 0.15, 0.02, mat(C.metal), 0, 0.03, -1.42);
    b.tree(-1.25, 1.25, 0.8).tree(1.25, 1.25, 0.8);
      },
  // ---- Suv stansiyasi (G037) ----
  water_plant(b, w, d) {
    plot(b, w, d, C.concrete);
    b.building(1.0, 0.5, 0.8, { wall: '#ece1cb', floors: 1, bay: 0.3, winW: 0.2, winH: 0.08, frame: '#3a3f46', roof: '#bdb7ad', cornice: '#f6f1e6', plinth: '#cdbb9c', skip: [{ face: 'front', at: 0, width: 0.25 }] }, -0.75, 0.03, -0.15);
    b.doorOn('front', 1.0, 0.8, -0.75, 0.03, -0.15, 0, 0.16, 0.28, '#3a3f46');
    b.rbox(0.3, 0.02, 0.12, mat('#8f949a', { metal: 0.4 }), -0.75, 0.35, 0.31, 0.005);
    b.rbox(0.18, 0.16, 0.14, mat('#d8dde2', { metal: 0.3 }), -0.95, 0.53, -0.3, 0.01);
    for (const [x, z] of [[0.45, -0.7], [0.95, 0.0]]) {
      // G037: beton rezervuar, tepasida panjara halqasi va narvon
      b.cyl(0.42, 0.42, 0.75, wallMat('#d8d4cc'), x, 0.03, z, 40);
      b.cyl(0.43, 0.43, 0.03, mat('#c4bfb5'), x, 0.76, z, 40);
      b.add(new THREE.SphereGeometry(0.42, 32, 6, 0, Math.PI * 2, 0, Math.PI / 6), wallMat('#d8d4cc'), x, 0.42 + 0.38, z);
      b.add(new THREE.TorusGeometry(0.4, 0.008, 6, 40).rotateX(Math.PI / 2), mat('#9aa3ad', { metal: 0.5 }), x, 0.92, z);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; b.cyl(0.005, 0.005, 0.12, mat('#9aa3ad', { metal: 0.5 }), x + Math.cos(a) * 0.4, 0.8, z + Math.sin(a) * 0.4, 4); }
      b.cyl(0.04, 0.05, 0.06, mat('#b8bcc2'), x, 0.86, z, 10);
      b.box(0.06, 0.78, 0.012, mat('#7d858e', { metal: 0.5 }), x - 0.3, 0.03, z + 0.3, Math.PI / 4);
    }
    // ko‘k quvurlar
    const pipe = mat(C.blue, { rough: 0.4, metal: 0.2 });
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 10), pipe, -0.1, 0.18, -0.4, 0, 0, Math.PI / 2);
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 10), pipe, 0.45, 0.18, 0.3, Math.PI / 2, 0, Math.PI / 2);
    b.cyl(0.05, 0.05, 0.3, pipe, -0.25, 0.03, 0.3, 10);
    for (let i = 0; i < 3; i++) {
      b.rbox(0.18, 0.04, 0.12, mat('#c4bfb5'), -0.3 + i * 0.25, 0.03, 0.75, 0.008);
      b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 14), mat('#2f74c9', { rough: 0.35, metal: 0.3 }), -0.3 + i * 0.25, 0.12, 0.75, 0, 0, Math.PI / 2);
    }
    b.box(0.02, 0.15, 2.8, mat(C.metal), -1.42, 0.03, 0);
    b.tree(-1.2, 1.2, 0.8).tree(1.25, 1.2, 0.8).tree(-1.2, -1.2, 0.8);
      },
  // ---- Bog‘ (G010) ----
  park(b, w, d) {
    plot(b, w, d, C.lawn);
    b.add(new THREE.RingGeometry(0.42, 0.6, 24).rotateX(-Math.PI / 2), mat(C.paving), 0, 0.04, 0);
    b.box(0.16, 0.012, 1.9, mat(C.paving), 0, 0.03, 0);
    b.box(1.9, 0.012, 0.16, mat(C.paving), 0, 0.03, 0);
    b.cyl(0.3, 0.32, 0.08, mat(C.stone), 0, 0.03, 0, 20);
    b.cyl(0.26, 0.26, 0.02, mat(C.water, { rough: 0.1 }), 0, 0.1, 0, 20);
    b.cyl(0.04, 0.05, 0.22, mat(C.stone), 0, 0.1, 0, 8);
    b.add(new THREE.SphereGeometry(0.07, 10, 6), mat('#bfe6fa', { rough: 0.1 }), 0, 0.34, 0);
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.tree(x, z, 1.05, 0, x < 0 && z > 0);
    b.bench(-0.3, 0.75, 0).bench(0.75, 0.3, -Math.PI / 2).lamp(0.25, -0.25).lamp(-0.25, 0.25);
    for (let i = 0; i < 8; i++) b.bush(-0.9 + i * 0.25, -0.92, 0.8, [C.flowerRed, C.flowerYellow, C.blossom, C.hedge][i % 4]);
      },
  tree(b) {
    b.box(0.9, 0.03, 0.9, mat(C.lawn), 0, 0, 0);
    b.tree(0, 0, 1.25);
    b.bush(0.3, 0.3, 0.8, C.flowerYellow);
  },
  // ---- Maxsus binolar (G004 Nest One, G005 Hilton, G006 Kongress) — konsept, aniq nusxa emas ----
  nest_one(b, w, d) {
    // Nest_One_01–04.png: baland asosiy minora (oq panjara + to‘q sariq vertikal chiziq), yonida jigarrang
    // tor minora, old-chapda oq turar-joy bloki, orqa-o‘ngda to‘q shisha blok, oldida past podium.
    plot(b, w, d);
    const P = (n: string) => photoMat(n);
    b.building(2.5, 0.55, 1.15, { wall: '#d9cdb8', floors: 2, bay: 0.2, winW: 0.13, winH: 0.15, frame: '#3a3f46', warm: true, groundWinH: 0.2, roof: '#9aa0a6', cornice: '#f1ece2', plinth: null }, 0.55, 0.03, 1.15);
    b.photoBox(1.2, 5.3, 1.05, { front: P('nest_main_a'), right: P('nest_main_b'), left: P('nest_main_b'), back: P('nest_main_a') }, mat('#55606c'), -0.05, 0.03, -0.25);
    b.photoBox(0.38, 4.7, 0.95, { front: P('nest_side'), right: P('nest_side'), left: P('nest_side') }, mat('#7a5a44'), 0.78, 0.03, -0.3);
    // toj: to‘q kulrang qism va shpil
    b.photoBox(0.95, 0.45, 0.8, { front: P('nest_dark_a'), right: P('nest_dark_b') }, mat('#3f4750'), -0.05, 5.33, -0.25);
    b.add(new THREE.ConeGeometry(0.12, 1.1, 8), mat('#3a3f46', { metal: 0.6, rough: 0.35 }), -0.05, 6.33, -0.25);
    b.cyl(0.012, 0.012, 0.5, mat('#3a3f46'), -0.05, 6.85, -0.25, 6);
    b.photoBox(1.05, 2.3, 1.0, { front: P('nest_white_a'), right: P('nest_white_b'), left: P('nest_white_b'), back: P('nest_white_a') }, mat('#e8e8e6'), -1.35, 0.03, 0.75);
    b.photoBox(1.1, 1.85, 0.95, { front: P('nest_dark_a'), right: P('nest_dark_b'), left: P('nest_dark_b'), back: P('nest_dark_a') }, mat('#e8e8e6'), 1.3, 0.03, -1.25);
    for (const [x, z] of [[-1.5, 0.75], [1.3, -1.25], [0.55, 1.15]]) b.box(0.3, 0.12, 0.25, mat(C.metal), x, x < 0 ? 2.35 : x > 1 ? 1.9 : 0.6, z);
    for (let i = 0; i < 7; i++) b.tree(-1.75 + i * 0.58, 1.85, 0.55);
    for (let i = 0; i < 5; i++) b.tree(1.85, -1.6 + i * 0.6, 0.55);
    b.lamp(-1.85, 1.85).lamp(1.85, 1.85);
  },
  hilton(b, w, d) {
    // Hilton_01–04.png: to‘lqinsimon panjarali (perforatsiyali) podium, ostida shisha qavat,
    // ustida oval shisha minora, old tomonda «Hilton» yozuvi va egilgan vertikal chok.
    plot(b, w, d);
    const glassBase = photoMat('hilton_ground', [3, 1], { rough: 0.2, metal: 0.3 });
    const lattice = photoMat('hilton_lattice', [0.45, 1], { rough: 0.7 });
    b.roundedBand(3.5, 2.3, 0.55, 0.3, glassBase, null, 0, 0.03, -0.05);
    b.roundedBand(3.62, 2.42, 0.6, 0.42, lattice, mat('#d8d6d0'), 0, 0.33, -0.05);
    b.roundedBand(3.66, 2.46, 0.62, 0.035, mat('#f1efe9', { rough: 0.4 }), null, 0, 0.75, -0.05);
    // tom ustidagi texnik bloklar
    for (const [x, z, sw] of [[-1.1, -0.6, 0.5], [1.0, -0.5, 0.6], [1.2, 0.5, 0.4]]) b.box(sw, 0.16, 0.35, mat('#a7abb0'), x, 0.76, z);
    // oval shisha minora: old yarmi — rasmdagi old fasad (yozuv va chok bilan), orqasi — takroriy shisha
    const H = 4.6;
    const front = new THREE.CylinderGeometry(0.85, 0.85, H, 32, 1, true, -Math.PI / 2, Math.PI);
    front.scale(1, 1, 0.62);
    b.add(front, photoMat('hilton_glass', undefined, { rough: 0.15, metal: 0.35 }), 0, 0.76 + H / 2, -0.3);
    const back = new THREE.CylinderGeometry(0.85, 0.85, H, 32, 1, true, Math.PI / 2, Math.PI);
    back.scale(1, 1, 0.62);
    b.add(back, photoMat('hilton_glass_tile', [3, 1.8], { rough: 0.15, metal: 0.35 }), 0, 0.76 + H / 2, -0.3);
    const cap = new THREE.CylinderGeometry(0.86, 0.86, 0.06, 32);
    cap.scale(1, 1, 0.63);
    b.add(cap, mat('#c9ccd0'), 0, 0.76 + H, -0.3);
    b.box(0.6, 0.1, 0.3, mat('#a7abb0'), 0.1, 0.82 + H, -0.35);
    // kirish soyaboni, mashinalar, bayroqlar
    b.box(1.0, 0.03, 0.4, mat('#eef0f2'), 0.3, 0.3, 1.3);
    b.car(-0.6, 1.45, '#f2f2f2', Math.PI / 2).car(-0.2, 1.45, '#2b2f36', Math.PI / 2).car(0.9, 1.45, '#9aa3ad', Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      b.cyl(0.006, 0.006, 0.45, mat('#d0d0d0'), -1.2 + i * 0.15, 0.03, 1.25, 5);
      b.box(0.07, 0.045, 0.004, mat(['#d2433a', '#2f74c9', '#f2f2f2', '#d2433a', '#2e9a4a'][i]), -1.165 + i * 0.15, 0.42, 1.25);
    }
    for (let i = 0; i < 7; i++) b.tree(-1.8 + i * 0.6, 1.4, 0.5);
    for (let i = 0; i < 6; i++) b.cypress(-1.85 + i * 0.12, -1.42, 0.5);
  },
  // ---- Qo‘shimcha (G031, G030, G011, G035, P005) ----
  police(b, w, d) {
    // G031: krem bino, to‘q ko‘k vertikal panellar, shisha soyabonli kirish, garaj va patrul mashinalari
    plot(b, w, d);
    b.building(2.0, 0.85, 1.2, { wall: '#ece1cb', floors: 2, bay: 0.28, winW: 0.15, winH: 0.24, frame: '#2b3a52', muntin: true, roof: '#bdb7ad', cornice: '#f6f1e6', plinth: '#cdbb9c', skip: [{ face: 'front', at: -0.2, width: 0.3 }] }, -0.2, 0.03, -0.6);
    b.building(0.44, 0.92, 0.1, { wall: '#2b3a52', floors: 2, bay: 0.3, winW: 0.24, winH: 0.28, frame: '#1d2738', faces: ['front'], roof: '#2b3a52', cornice: null, plinth: null, skip: [{ face: 'front', at: 0, width: 0.3 }] }, -0.4, 0.03, 0.03);
    b.doorOn('front', 0.44, 0.1, -0.4, 0.03, 0.03, 0, 0.22, 0.28, '#2b2f36', true);
    b.rbox(0.5, 0.02, 0.26, mat('#9cc6e6', { rough: 0.1, metal: 0.3 }), -0.4, 0.34, 0.2, 0.004);
    b.rbox(0.5, 0.1, 0.03, mat('#2b3a52'), -0.4, 0.75, 0.085, 0.006);
    // garaj
    b.building(0.75, 0.42, 0.6, { wall: '#e2d6bf', floors: 1, faces: [], roof: '#bdb7ad', cornice: '#f6f1e6', plinth: null }, 0.9, 0.03, -0.75);
    for (const x of [0.73, 1.07]) b.box(0.26, 0.3, 0.012, mat('#3a3f46', { metal: 0.3, rough: 0.5 }), x, 0.03, -0.445);
    b.car(0.6, 0.55, '#ffffff', 0).car(1.0, 0.55, '#1f4f9a', 0);
    b.cyl(0.012, 0.012, 0.9, mat(C.metal), -1.2, 0.03, 0.9, 6);
    b.box(0.22, 0.12, 0.01, mat('#2e9ad6'), -1.08, 0.78, 0.9);
    b.bench(-0.9, 0.6, 0).lamp(-0.95, 0.25).lamp(0.2, 0.3);
    b.tree(1.25, 1.2).tree(-1.25, -1.25);
  },
  fire_station(b, w, d) {
    // G030: krem bino, uchta qizil garaj darvozasi, qizil chiziqli minora, oldida o‘t o‘chirish mashinasi
    plot(b, w, d);
    const W = 2.2, D = 1.3, H = 0.8, Z = -0.5, X = -0.1;
    b.building(W, H, D, { wall: '#ece1cb', floors: 2, bay: 0.55, winW: 0.38, winH: 0.12, frame: '#2b2f36', roof: '#bdb7ad', cornice: '#f6f1e6', plinth: null, skip: [{ face: 'front', at: -0.55, width: 0.4 }, { face: 'front', at: 0, width: 0.4 }, { face: 'front', at: 0.55, width: 0.4 }] }, X, 0.03, Z);
    for (const gx of [-0.55, 0, 0.55]) {
      b.box(0.44, 0.4, 0.02, mat('#d2312a', { rough: 0.5 }), X + gx, 0.03, Z + D / 2 + 0.005);
      b.box(0.36, 0.34, 0.012, mat('#5b2420', { rough: 0.7 }), X + gx, 0.03, Z + D / 2 + 0.016);
      b.box(0.012, 0.34, 0.006, mat('#e0a51e'), X + gx - 0.1, 0.03, Z + D / 2 + 0.022).box(0.012, 0.34, 0.006, mat('#e0a51e'), X + gx + 0.1, 0.03, Z + D / 2 + 0.022);
    }
    b.building(0.38, 1.5, 0.38, { wall: '#ece1cb', floors: 4, bay: 0.3, winW: 0.12, winH: 0.2, frame: '#2b2f36', faces: ['front', 'right'], roof: '#bdb7ad', cornice: '#d2312a', plinth: null }, 1.1, 0.03, -0.9);
    b.box(0.05, 1.3, 0.012, mat('#d2312a'), 1.24, 0.15, -0.705);
    // o‘t o‘chirish mashinasi
    b.rbox(0.2, 0.17, 0.5, mat('#d2312a', { rough: 0.4, metal: 0.2 }), -0.1, 0.03, 0.75, 0.02);
    b.rbox(0.18, 0.05, 0.12, mat('#33475c', { rough: 0.15 }), -0.1, 0.13, 0.98, 0.01);
    b.box(0.16, 0.03, 0.3, mat('#d8dde2', { metal: 0.5 }), -0.1, 0.2, 0.68);
    for (const sx of [-0.105, 0.105]) for (const sz of [0.58, 0.92]) b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 12), mat('#2a2a2a'), -0.1 + sx, 0.06, sz, 0, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) b.box(0.08, 0.004, 0.02, mat('#e0b81e'), -0.6 + i * 0.25, 0.031, 0.35);
    b.tree(1.2, 1.2).tree(-1.25, 1.25, 0.8);
  },
  kindergarten(b, w, d) {
    // G011: oq-krem ikki qavatli bino, firuza va yog‘och aksentlar, o‘yin maydoni, soyabon mato
    plot(b, w, d, C.lawn);
    b.building(1.6, 0.7, 0.9, { wall: '#f1e9da', floors: 2, bay: 0.3, winW: 0.18, winH: 0.2, frame: '#3a3f46', roof: '#c9c4bb', cornice: '#fbf8f1', plinth: '#d8cdb8', skip: [{ face: 'front', at: 0.1, width: 0.3 }] }, 0.4, 0.03, -0.8);
    b.doorOn('front', 1.6, 0.9, 0.4, 0.03, -0.8, 0.1, 0.24, 0.27, '#2b2f36', true);
    b.rbox(0.5, 0.025, 0.24, mat('#d8d6d0'), 0.5, 0.34, -0.23, 0.006);
    for (const x of [-0.3, 0.95]) b.box(0.05, 0.6, 0.012, mat('#3aa39b'), x, 0.06, -0.345);
    b.box(0.16, 0.66, 0.012, mat('#a8743f'), 0.0, 0.04, -0.345);
    b.building(0.8, 0.45, 0.6, { wall: '#e9d9bd', floors: 1, bay: 0.3, winW: 0.16, winH: 0.18, frame: '#3a3f46', roof: '#c9c4bb', cornice: '#fbf8f1', plinth: null }, -0.7, 0.03, -0.95);
    // o‘yin maydoni
    b.box(1.3, 0.036, 1.0, mat('#3d8f8a'), -0.5, 0.0, 0.6);
    b.cyl(0.2, 0.2, 0.004, mat('#e8c9a0'), -0.25, 0.036, 0.8, 20);
    b.rbox(0.28, 0.26, 0.28, mat('#e8b931'), -0.8, 0.03, 0.45, 0.02);
    b.add(new THREE.ConeGeometry(0.2, 0.12, 4), mat('#2f8f6b'), -0.8, 0.35, 0.45, Math.PI / 4);
    b.add(new THREE.BoxGeometry(0.12, 0.02, 0.45), mat('#2f8f6b'), -0.55, 0.17, 0.45, 0, -0.55);
    for (const x of [-0.45, -0.05]) b.cyl(0.012, 0.012, 0.3, mat('#a8743f'), x, 0.03, 0.75, 6);
    b.box(0.44, 0.02, 0.02, mat('#a8743f'), -0.25, 0.32, 0.75);
    b.add(new THREE.ConeGeometry(0.42, 0.06, 3), mat('#efe0c2'), -0.3, 0.45, 0.35, 0.4);
    b.tree(1.25, 1.2).tree(0.9, 0.6, 0.8, 0, true).tree(-1.25, -0.2);
    for (let i = 0; i < 10; i++) b.box(0.02, 0.1, 0.02, mat(C.white), -1.4 + i * 0.3, 0.03, 1.38);
  },
  sport_field(b, w, d) {
    plot(b, w, d);
    b.box(1.9, 0.036, 2.5, mat(C.field), -0.4, 0.0, 0);
    b.box(1.7, 0.037, 0.02, mat(C.white), -0.4, 0.0, 0);
    b.add(new THREE.RingGeometry(0.2, 0.23, 20).rotateX(-Math.PI / 2), mat(C.white), -0.4, 0.045, 0);
    for (const z of [-1.15, 1.15]) b.box(0.4, 0.15, 0.03, mat(C.white), -0.4, 0.03, z);
    b.box(0.85, 0.036, 1.2, mat(C.court), 0.95, 0.0, 0.55);
    b.box(0.5, 0.35, 0.5, mat(C.cream), 1.0, 0.03, -0.9);
    for (let i = 0; i < 9; i++) b.box(0.015, 0.4, 0.015, mat(C.darkMetal), -1.35 + i * 0.3, 0.03, 1.32);
    b.tree(1.3, 1.3, 0.8).tree(1.3, -0.3, 0.8);
      },
  congress(b, w, d) {
    // Kongress_markazi_01–04.png: katta yumaloq burchakli zal, pastda shisha qavat, ustida
    // naqshli (girih) panjara fasad, old tomonda to‘lqinsimon oq chiziq, tekis kulrang tom.
    plot(b, w, d);
    const glass = photoMat('kongress_glass', [4, 1], { rough: 0.2, metal: 0.3 });
    const lattice = photoMat('kongress_lattice', [0.7, 1], { rough: 0.7 });
    b.roundedBand(4.2, 2.9, 0.5, 0.42, glass, null, 0, 0.03, -0.25);
    b.roundedBand(4.36, 3.06, 0.56, 0.62, lattice, mat('#9aa1a8', { rough: 0.8 }), 0, 0.45, -0.25);
    b.roundedBand(4.42, 3.12, 0.58, 0.05, mat('#e9e2d2', { rough: 0.4 }), null, 0, 1.06, -0.25);
    // to‘lqinsimon oq chiziq (old fasad)
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new THREE.Vector3(-2.2 + t * 4.4, 0.7 + 0.3 * Math.sin(t * Math.PI * 1.3 + 0.4), 1.31));
    }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.05, 8), mat('#f4efe4', { rough: 0.3 }), 0, 0, 0);
    for (const [x, z, sw] of [[-1.2, -0.9, 0.6], [-0.3, -0.7, 0.5], [0.6, -1.0, 0.7], [1.2, -0.3, 0.4]]) b.box(sw, 0.14, 0.35, mat('#b4b8bc'), x, 1.06, z);
    // maydon: plitka, sarv qatorlari, chiroqlar, bayroqlar
    b.box(4.6, 0.032, 0.6, mat(C.paving), 0, 0.0, 1.6);
    for (let i = 0; i < 10; i++) b.cypress(-2.25 + i * 0.5, 1.9, 0.85);
    for (let i = 0; i < 6; i++) b.cypress(-2.3, -1.6 + i * 0.5, 0.8).cypress(2.3, -1.6 + i * 0.5, 0.8);
    for (let i = 0; i < 4; i++) b.lamp(-1.5 + i * 1.0, 1.45);
    for (let i = 0; i < 4; i++) {
      b.cyl(0.006, 0.006, 0.5, mat('#d0d0d0'), 1.4 + i * 0.13, 0.03, 1.35, 5);
      b.box(0.07, 0.045, 0.004, mat(i % 2 ? '#2e9ad6' : '#2e9a4a'), 1.435 + i * 0.13, 0.47, 1.35);
    }
  },
  mall(b, w, d) {
    // Tashkent_City_Mall_01–04.png: keng savdo podiumi (oq/bej fasad, reklama ekranlari),
    // tomda ko‘k shisha gumbaz va yorug‘lik tuynuklari, bitta baland va ikkita egizak shisha minora.
    plot(b, w, d);
    const P = (n: string, r?: [number, number]) => photoMat(n, r);
    b.building(3.4, 0.75, 2.4, { wall: '#ebe6dc', floors: 2, bay: 0.32, winW: 0.24, winH: 0.16, frame: '#3a3f46', warm: true, groundWinH: 0.26, roof: '#c9c4bb', cornice: '#f6f3ec', plinth: null }, 0.35, 0.03, 0.45);
    // reklama ekranlari (Mall_01 dagi kabi)
    for (const [x, c] of [[-0.75, '#3a7bd5'], [0.0, '#e2574c'], [0.85, '#2e9a4a']] as const) {
      b.rbox(0.42, 0.2, 0.02, mat('#1f2329'), x, 0.42, 1.66, 0.006);
      b.box(0.38, 0.16, 0.006, mat(c, { emissive: c }), x, 0.44, 1.672);
    }
    b.box(2.4, 0.25, 1.5, mat('#bdb7ad'), 0.35, 0.78, 0.35);
    const dome = new THREE.SphereGeometry(0.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1.3, 0.55, 1);
    b.add(dome, mat('#3f8fd8', { rough: 0.12, metal: 0.4 }), 0.35, 1.03, 0.35);
    for (let i = 0; i < 4; i++) b.box(0.12, 0.05, 1.2, mat('#5aa2e0', { rough: 0.15, metal: 0.3 }), -0.95 + i * 0.22, 0.79, 0.6);
    b.photoBox(0.95, 4.0, 0.95, { front: P('mall_tower_a'), right: P('mall_tower_b'), left: P('mall_tower_b'), back: P('mall_tower_a') }, mat('#d8d6d0'), -1.85, 0.03, 1.35);
    b.photoBox(0.9, 3.0, 0.9, { front: P('mall_twin'), right: P('mall_twin'), left: P('mall_twin2'), back: P('mall_twin2') }, mat('#c9ccd0'), 0.75, 0.03, -1.75);
    b.photoBox(0.9, 3.3, 0.9, { front: P('mall_twin2'), right: P('mall_twin2'), left: P('mall_twin'), back: P('mall_twin') }, mat('#c9ccd0'), 1.85, 0.03, -1.45);
    for (let i = 0; i < 8; i++) b.tree(-2.25 + i * 0.64, 2.25, 0.5);
    for (let i = 0; i < 6; i++) b.tree(2.25, -2.0 + i * 0.7, 0.5);
    b.car(-0.6, 1.95, '#f2f2f2', Math.PI / 2).car(0.2, 1.95, '#d9433c', Math.PI / 2).car(1.0, 1.95, '#3a7bd5', Math.PI / 2);
  },
};

export class ProceduralModelSource implements ModelSource {
  private templates = new Map<ObjectType, THREE.Group>();

  create(type: ObjectType): THREE.Object3D {
    let t = this.templates.get(type);
    if (!t) {
      const c = CATALOG[type];
      const b = new Builder();
      const recipe = RECIPES[c.modelFactoryKey] ?? BUSINESS_RECIPES[c.modelFactoryKey] ?? EDUCATION_RECIPES[c.modelFactoryKey] ?? CIVIC_RECIPES[c.modelFactoryKey];
      if (!recipe) throw new Error('Model retsepti yo‘q: ' + c.modelFactoryKey);
      recipe(b, c.width, c.depth);
      t = b.build();
      // Shaffof shisha va yozuv qatlamlari soya tashlamaydi
      t.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && !Array.isArray(m) && m.userData.noShadow) o.castShadow = false;
      });
      t.name = 'tpl:' + type;
      this.templates.set(type, t);
    }
    return t.clone(); // geometriya va materiallar umumiy
  }

  dispose() {
    for (const t of this.templates.values()) t.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.templates.clear();
  }
}

/** GLB/glTF manbai — katalogda gltfUrl berilgan turlar uchun. V1 da ishlatilmaydi (GLB fayl yo‘q). */
export class GLTFModelSource {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<THREE.Object3D>>();

  load(url: string): Promise<THREE.Object3D> {
    let p = this.cache.get(url);
    if (!p) {
      p = this.loader.loadAsync(url).then((g) => g.scene);
      this.cache.set(url, p);
    }
    return p.then((s) => s.clone());
  }
}

export class ModelFactory implements ModelSource {
  readonly procedural = new ProceduralModelSource();
  readonly gltf = new GLTFModelSource();

  /** Procedural modelni darhol qaytaradi; gltfUrl bo‘lsa yuklanib onUpgrade orqali beriladi. */
  create(type: ObjectType, onUpgrade?: (obj: THREE.Object3D) => void): THREE.Object3D {
    const url = CATALOG[type].gltfUrl;
    if (url && onUpgrade) {
      this.gltf.load(url).then(onUpgrade).catch((e) => console.warn('GLB yuklanmadi, procedural model qoladi:', url, e));
    }
    return this.procedural.create(type);
  }
}
