import * as THREE from 'three';
import { Builder, mat } from './builder';
import { VEHICLE_SPECS, type VehicleKind } from '../game/trafficDefs';

/**
 * Transport 3D modellari (namuna rasmlar asosida, hajmli geometriya — sprite emas). Old tomon +Z, 1 katak = 10 m.
 * Avtomobil: oq oilaviy krossover, qoramtir oynalar, qora plastik qoplama, tomida yuk qutisi va relslar.
 * Avtobus: oq kuzov, firuza pastki qism va to‘lqin chiziq, qoramtir oynalar, o‘ng tomonda yo‘lovchi eshigi,
 * yuk bo‘limlari, «qo‘chqor shoxi» oynachalar. Salon yo‘q — oynalar qoramtir (ichkari ko‘rinmaydi).
 * G‘ildiraklar alohida (aylanadi). Geometriya va materiallar barcha nusxalarda umumiy.
 */

let M: ReturnType<typeof mats> | null = null;
function mats() {
  const glass = new THREE.MeshStandardMaterial({ color: '#141a20', roughness: 0.08, metalness: 0.6, envMapIntensity: 1.2 });
  const head = new THREE.MeshStandardMaterial({ color: '#f4f8ff', emissive: '#dfe9ff', emissiveIntensity: 0.6, roughness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: '#c3121e', emissive: '#a00010', emissiveIntensity: 0.55, roughness: 0.3 });
  return {
    white: [mat('#eeedea', { rough: 0.35, metal: 0.25 }), mat('#f4f4f2', { rough: 0.35, metal: 0.2 }), mat('#e6e3dc', { rough: 0.35, metal: 0.25 })],
    plastic: mat('#2b2e33', { rough: 0.7 }),
    silver: mat('#b9bec4', { rough: 0.3, metal: 0.7 }),
    roofBox: mat('#33373c', { rough: 0.45, metal: 0.2 }),
    teal: mat('#119ea6', { rough: 0.35, metal: 0.2 }),
    glass, head, tail,
    amber: new THREE.MeshStandardMaterial({ color: '#ff9d1a', emissive: '#ff8a00', emissiveIntensity: 0.4, roughness: 0.3 }),
    tire: mat('#1f2124', { rough: 0.9 }),
    rim: mat('#c9ced3', { rough: 0.25, metal: 0.8 }),
  };
}
const m = () => (M ??= mats());

/** Yon profil (z,y) bo‘yicha eni X bo‘ylab prizma, markazda */
function prism(shape: THREE.Vector2[], width: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(shape), { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

function carBody(look: number, roofBox = true): THREE.Group {
  const k = m();
  const b = new Builder();
  const white = k.white[look % k.white.length];
  const W = 0.2, L = 0.46;
  // pastki kuzov va qora plastik qoplama (g‘ildirak arkalari, ostona)
  b.rbox(W, 0.075, L, white, 0, 0.03, 0, 0.025);
  b.box(W + 0.006, 0.03, L - 0.12, k.plastic, 0, 0.022, 0);
  b.rbox(W - 0.01, 0.03, 0.04, k.plastic, 0, 0.02, L / 2 - 0.02, 0.01);
  b.rbox(W - 0.01, 0.03, 0.04, k.plastic, 0, 0.02, -L / 2 + 0.02, 0.01);
  b.box(W * 0.6, 0.012, 0.02, k.silver, 0, 0.025, -L / 2 - 0.002);
  // salon (kabina): qiya old/orqa oyna profili; qoramtir oynalar, oq ustunlar
  const prof = (pts: [number, number][]) => pts.map(([z, y]) => new THREE.Vector2(-z, y));
  b.add(prism(prof([[-0.195, 0.095], [0.13, 0.095], [0.05, 0.165], [-0.165, 0.165]]), W - 0.03), white, 0, 0, 0);
  b.add(prism(prof([[-0.19, 0.103], [0.124, 0.103], [0.048, 0.159], [-0.162, 0.159]]), W - 0.018), k.glass, 0, 0, 0);
  b.add(prism(prof([[-0.198, 0.101], [0.136, 0.101], [0.05, 0.161], [-0.168, 0.161]]), W - 0.04), k.glass, 0, 0, 0);
  for (const zc of [-0.035, 0.065]) b.box(W - 0.014, 0.058, 0.014, white, 0, 0.101, zc);
  b.box(W - 0.026, 0.008, 0.215, white, 0, 0.162, -0.055);
  // kapot va panjara, faralar, orqa chiroqlar
  b.box(W - 0.04, 0.025, 0.012, k.plastic, 0, 0.05, L / 2);
  for (const s of [-1, 1]) {
    b.box(0.05, 0.012, 0.012, k.head, s * 0.07, 0.083, L / 2 - 0.002);
    b.box(0.045, 0.015, 0.01, k.tail, s * 0.075, 0.085, -L / 2 + 0.002);
    // yon oynachalar
    b.box(0.026, 0.018, 0.022, white, s * (W / 2 + 0.008), 0.1, 0.1);
    b.box(0.004, 0.014, 0.018, k.glass, s * (W / 2 + 0.022), 0.1, 0.1);
    // eshik tutqichlari
    b.box(0.004, 0.006, 0.02, k.silver, s * (W / 2 + 0.002), 0.09, 0.01);
    b.box(0.004, 0.006, 0.02, k.silver, s * (W / 2 + 0.002), 0.09, -0.08);
    // tom relslari
    b.box(0.008, 0.01, 0.22, k.silver, s * 0.07, 0.166, -0.055);
  }
  // tomdagi yuk qutisi
  if (roofBox) b.rbox(0.12, 0.032, 0.19, k.roofBox, 0, 0.172, -0.055, 0.014);
  return b.build();
}

function busBody(): THREE.Group {
  const k = m();
  const b = new Builder();
  const W = 0.25, L = 1.1, H = 0.31, y0 = 0.035;
  b.rbox(W, H, L, k.white[1], 0, y0, 0, 0.03);
  // firuza pastki qism va yon to‘lqin chiziq
  b.box(W + 0.004, 0.07, L - 0.02, k.teal, 0, y0 + 0.005, 0);
  b.box(W + 0.006, 0.022, L * 0.45, k.teal, 0, y0 + 0.11, -L * 0.22);
  b.add(new THREE.BoxGeometry(W + 0.005, 0.018, L * 0.3), k.teal, 0, y0 + 0.095, L * 0.08, 0, 0.12, 0);
  // qoramtir oynalar: yon tasma, old (katta) va orqa
  b.box(W + 0.004, 0.11, L - 0.2, k.glass, 0, y0 + 0.155, -0.04);
  b.add(new THREE.BoxGeometry(W - 0.02, 0.19, 0.012), k.glass, 0, y0 + 0.17, L / 2 + 0.002, 0, -0.08, 0);
  b.box(W - 0.05, 0.09, 0.01, k.glass, 0, y0 + 0.17, -L / 2 - 0.002);
  // yo‘lovchi eshigi (o‘ng tomonda: −X) va yuk bo‘limlari
  b.box(0.006, 0.24, 0.095, k.glass, -W / 2 - 0.002, y0 + 0.03, L / 2 - 0.13);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.box(0.004, 0.06, 0.006, k.plastic, s * (W / 2 + 0.003), y0 + 0.02, -0.25 + i * 0.16);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.box(0.004, 0.008, 0.012, k.amber, s * (W / 2 + 0.003), y0 + 0.04, -0.33 + i * 0.16);
  // tom: konditsioner bloki
  b.rbox(W * 0.72, 0.035, 0.3, k.white[2], 0, y0 + H, -0.1, 0.012);
  // faralar, orqa chiroqlar, bamperlar
  for (const s of [-1, 1]) {
    b.box(0.05, 0.016, 0.01, k.head, s * 0.085, y0 + 0.055, L / 2 + 0.003);
    b.box(0.012, 0.09, 0.01, k.tail, s * 0.11, y0 + 0.1, -L / 2 - 0.003);
    // «qo‘chqor shoxi» oynachalar
    b.box(0.006, 0.006, 0.05, k.plastic, s * (W / 2 + 0.02), y0 + 0.22, L / 2 + 0.01);
    b.box(0.014, 0.05, 0.016, k.white[2], s * (W / 2 + 0.03), y0 + 0.17, L / 2 + 0.035);
    b.box(0.004, 0.012, 0.004, k.amber, s * (W / 2 + 0.03), y0 + 0.19, L / 2 + 0.044);
  }
  b.box(W, 0.03, 0.02, k.teal, 0, y0 - 0.005, L / 2 - 0.005);
  b.box(W, 0.03, 0.02, k.teal, 0, y0 - 0.005, -L / 2 + 0.005);
  return b.build();
}

let wheelTpl: Map<VehicleKind, THREE.Group> | null = null;
function wheel(kind: VehicleKind): THREE.Group {
  wheelTpl ??= new Map();
  let t = wheelTpl.get(kind);
  if (!t) {
    const r = VEHICLE_SPECS[kind].wheelR, w = kind === 'bus' ? 0.04 : 0.03;
    const b = new Builder();
    b.add(new THREE.CylinderGeometry(r, r, w, 16), m().tire, 0, 0, 0, 0, 0, Math.PI / 2);
    b.add(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.004, 12), m().rim, 0, 0, 0, 0, 0, Math.PI / 2);
    // naycha (aylanish ko‘rinsin)
    b.add(new THREE.BoxGeometry(w + 0.006, r * 0.18, r * 1.05), m().tire, 0, 0, 0);
    t = b.build();
    wheelTpl.set(kind, t);
  }
  return t.clone();
}

/** «POLITSIYA» yozuvi (yon va orqa tomonda) */
let policeTextTex: THREE.Texture | null = null;
function policeText(): THREE.Texture {
  if (!policeTextTex) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#1238a8';
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#ffffff';
    c.font = 'bold 44px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('POLITSIYA', 128, 34);
    policeTextTex = new THREE.CanvasTexture(cv);
    policeTextTex.colorSpace = THREE.SRGBColorSpace;
  }
  return policeTextTex;
}

/** Politsiya chirog‘i materiallari (sahna har kadr navbat bilan yondiradi) */
export const POLICE_LIGHTS = {
  red: new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1010', emissiveIntensity: 1.5, roughness: 0.3 }),
  blue: new THREE.MeshStandardMaterial({ color: '#2a5cff', emissive: '#1040ff', emissiveIntensity: 1.5, roughness: 0.3 }),
};

/** Politsiya avtomobili: oq krossover, ko‘k-firuza bezak, «POLITSIYA» yozuvi, tomida qizil-ko‘k chiroq paneli */
function policeBody(): THREE.Group {
  const k = m();
  const g = carBody(1, false);
  const b = new Builder();
  const W = 0.2, L = 0.46;
  const blue = mat('#1238a8', { rough: 0.4, metal: 0.2 }), cyan = mat('#21b8e0', { rough: 0.4 });
  const text = new THREE.MeshStandardMaterial({ map: policeText(), roughness: 0.4 });
  for (const s of [-1, 1]) {
    // eshiklardagi ko‘k panel va firuza chiziqlar
    b.box(0.004, 0.034, 0.24, blue, s * (W / 2 + 0.002), 0.052, -0.01);
    b.box(0.004, 0.006, 0.3, cyan, s * (W / 2 + 0.003), 0.045, -0.01);
    b.box(0.004, 0.005, 0.3, cyan, s * (W / 2 + 0.003), 0.093, -0.02);
    b.add(new THREE.PlaneGeometry(0.2, 0.05), text, s * (W / 2 + 0.0045), 0.069, -0.01, s * Math.PI / 2);
  }
  // kapotdagi ko‘k chiziq va orqa yozuv
  b.box(0.06, 0.004, 0.11, blue, 0, 0.106, 0.17);
  b.add(new THREE.PlaneGeometry(0.12, 0.03), text, 0, 0.07, -L / 2 - 0.004, Math.PI);
  // chiroq paneli: qizil — o‘rta qora — ko‘k
  b.box(0.13, 0.012, 0.035, k.plastic, 0, 0.168, -0.03);
  b.box(0.05, 0.02, 0.03, POLICE_LIGHTS.red, -0.04, 0.178, -0.03);
  b.box(0.05, 0.02, 0.03, POLICE_LIGHTS.blue, 0.04, 0.178, -0.03);
  g.add(b.build());
  return g;
}

const bodyTpl = new Map<string, THREE.Group>();

export interface VehicleModel { group: THREE.Group; wheels: THREE.Object3D[] }

/** Transport modeli: kuzov (umumiy shablon klon) + alohida aylanadigan g‘ildiraklar */
export function vehicleModel(kind: VehicleKind, look: number): VehicleModel {
  const key = kind + (kind === 'car' ? look % 3 : '');
  let tpl = bodyTpl.get(key);
  if (!tpl) { tpl = kind === 'car' ? carBody(look) : kind === 'police' ? policeBody() : busBody(); bodyTpl.set(key, tpl); }
  const group = new THREE.Group();
  group.add(tpl.clone());
  const sp = VEHICLE_SPECS[kind];
  const axles = kind === 'bus' ? [0.34, -0.3] : [0.145, -0.145];
  const wheels: THREE.Object3D[] = [];
  for (const z of axles) for (const s of [-1, 1]) {
    const w = wheel(kind);
    w.position.set(s * (sp.width / 2 - (kind === 'bus' ? 0.01 : 0.005)), sp.wheelR, z);
    group.add(w);
    wheels.push(w);
  }
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, wheels };
}

/** Avtobus bekati (yo‘l chetidagi soyabon, belgisi bilan) */
let stopTpl: THREE.Group | null = null;
export function busStopModel(): THREE.Group {
  if (!stopTpl) {
    const k = m();
    const b = new Builder();
    b.box(0.7, 0.03, 0.34, mat('#c9c4b8'), 0, 0, 0);
    for (const x of [-0.3, 0.3]) b.box(0.03, 0.34, 0.03, k.silver, x, 0.03, -0.12);
    b.box(0.68, 0.22, 0.012, k.glass, 0, 0.1, -0.13);
    b.rbox(0.76, 0.03, 0.36, k.teal, 0, 0.37, -0.02, 0.01);
    b.box(0.5, 0.03, 0.08, mat('#8a6a48'), 0, 0.09, -0.06);
    b.box(0.02, 0.5, 0.02, k.silver, 0.36, 0.03, 0.14);
    b.box(0.12, 0.12, 0.012, mat('#1d6fd6', { rough: 0.4 }), 0.36, 0.48, 0.14);
    b.box(0.07, 0.03, 0.014, k.white[1], 0.36, 0.5, 0.14);
    stopTpl = b.build();
  }
  return stopTpl.clone();
}
