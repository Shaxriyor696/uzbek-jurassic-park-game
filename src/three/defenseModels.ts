import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Builder, mat, wallMat } from './builder';
import { buildProgress, type BuildState } from '../game/construction';
import { DEFENSE_CONFIG, type GateState } from '../game/defenseDefs';
import { DIRS, variantKey, type WallVariant } from '../game/defense';
import { E, W } from '../game/roadNetwork';

/**
 * «Shahar himoyasi» 3D modellari (namuna rasmlar asosida, haqiqiy hajmli geometriya — plane/sprite emas):
 * och beton poydevor va qalin ustunlar, to‘q kulrang po‘lat panellar va vertikal tayoqlar, mustahkamlovchi
 * to‘sinlar, ustunlarda ko‘k-yashil milliy naqsh (girih), tepada kichik sariq ogohlantirish chiroqlari.
 *
 * Koordinatalar: 1 katak = 1 birlik, y=0 — yer. Devor katagi markazi (0,0); qo‘llar N(−z)/E(+x)/S(+z)/W(−x).
 * Darvoza: eni x bo‘ylab (−1,5..1,5), qanotlar ichki tomonda (z = +leafTrack) yon tomonga suriladi.
 * Geometriya va materiallar umumiy: tayyor devorlar 16×16 katakli bo‘laklarda material bo‘yicha birlashtiriladi.
 */

const L = DEFENSE_CONFIG.look;

// ---------- materiallar ----------

function ornamentTexture(): THREE.Texture {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#0f5a5c';
  c.fillRect(0, 0, s, s);
  // girih: sakkiz qirrali yulduzlar va ularni bog‘lovchi chiziqlar
  const star = (cx: number, cy: number, r: number) => {
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.PI / 8;
      const rr = i % 2 ? r * 0.55 : r;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
  };
  c.strokeStyle = '#e9dfc4';
  c.lineWidth = 5;
  for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s], [s / 2, s / 2]]) { star(x, y, s * 0.3); c.stroke(); }
  c.fillStyle = '#2bb3a8';
  for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s], [s / 2, s / 2]]) { star(x, y, s * 0.22); c.fill(); }
  c.strokeStyle = '#7fe0d4';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(s / 2, 0); c.lineTo(s / 2, s * 0.2); c.moveTo(s / 2, s); c.lineTo(s / 2, s * 0.8);
  c.moveTo(0, s / 2); c.lineTo(s * 0.2, s / 2); c.moveTo(s, s / 2); c.lineTo(s * 0.8, s / 2);
  c.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 2);
  t.anisotropy = 4;
  return t;
}

let MATS: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const lamp = new THREE.MeshStandardMaterial({ color: '#ffb21e', emissive: '#ff9500', emissiveIntensity: 1.1, roughness: 0.3 });
  return {
    concrete: wallMat('#ddd6c8'),
    concreteDark: mat('#c7bfae', { rough: 0.9 }),
    steel: mat('#5d646d', { rough: 0.5, metal: 0.45 }),
    steelDark: mat('#454b53', { rough: 0.45, metal: 0.5 }),
    ornament: new THREE.MeshStandardMaterial({ map: ornamentTexture(), roughness: 0.4, metalness: 0.1 }),
    lamp,
    box: mat('#7d848c', { rough: 0.6, metal: 0.3 }),
    dirt: mat('#9b7650', { rough: 1 }),
    pallet: mat('#a77b47', { rough: 0.85 }),
    cone: mat('#f07a1a', { rough: 0.6 }),
  };
}
function M() {
  return (MATS ??= makeMats());
}

// ---------- qismlar ----------

/** Qism guruhlari: qurilish bosqichlari ularni navbat bilan ko‘rsatadi */
export interface Parts { base: Builder; pillar: Builder; panel: Builder; light: Builder }
const newParts = (): Parts => ({ base: new Builder(), pillar: new Builder(), panel: new Builder(), light: new Builder() });

/** Qalin beton ustun: poydevor, naqshli panel, po‘lat burchak himoyasi, qopqoq, sariq chiroq */
function pillar(p: Parts, x: number, z: number, w: number, h: number) {
  const m = M();
  p.base.box(w + 0.14, 0.32, w + 0.14, m.concrete, x, 0, z);
  p.base.box(w + 0.08, 0.06, w + 0.08, m.concreteDark, x, 0.32, z);
  p.pillar.box(w, h - 0.48, w, m.concrete, x, 0.38, z);
  // naqsh har to‘rt yuzada (biroz bo‘rtib chiqqan)
  const ph = Math.min(0.66, h - 0.8), py = 0.58;
  p.pillar.box(w * 0.56, ph, 0.014, m.ornament, x, py, z + w / 2 + 0.005);
  p.pillar.box(w * 0.56, ph, 0.014, m.ornament, x, py, z - w / 2 - 0.005);
  p.pillar.box(0.014, ph, w * 0.56, m.ornament, x + w / 2 + 0.005, py, z);
  p.pillar.box(0.014, ph, w * 0.56, m.ornament, x - w / 2 - 0.005, py, z);
  // naqsh ramkasi (och beton)
  for (const s of [-1, 1]) {
    p.pillar.box(w * 0.66, 0.035, 0.02, m.concreteDark, x, py - 0.035, z + s * (w / 2 + 0.006));
    p.pillar.box(w * 0.66, 0.035, 0.02, m.concreteDark, x, py + ph, z + s * (w / 2 + 0.006));
    p.pillar.box(0.02, 0.035, w * 0.66, m.concreteDark, x + s * (w / 2 + 0.006), py - 0.035, z);
    p.pillar.box(0.02, 0.035, w * 0.66, m.concreteDark, x + s * (w / 2 + 0.006), py + ph, z);
  }
  // po‘lat burchak himoyasi
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.pillar.box(0.045, h - 0.62, 0.045, m.steelDark, x + sx * (w / 2 - 0.005), 0.38, z + sz * (w / 2 - 0.005));
  // qopqoq
  p.pillar.box(w + 0.1, 0.07, w + 0.1, m.concreteDark, x, h - 0.1, z);
  p.light.box(w * 0.72, 0.08, w * 0.72, m.steelDark, x, h - 0.03, z);
  p.light.cyl(0.075, 0.075, 0.03, m.steelDark, x, h + 0.05, z, 12);
  p.light.cyl(0.055, 0.062, 0.1, m.lamp, x, h + 0.08, z, 12);
}

/**
 * Devor qo‘li: markazdan `dir` tomonga [a, b] oraliqda (katakda) — poydevor, panel tayoqlari, uch to‘sin.
 * Tayoqlar global qadamga bog‘langan (0,1) — qo‘shni kataklarda uzilmasdan davom etadi.
 */
function arm(p: Parts, dir: (typeof DIRS)[number], a: number, b: number, picketsFrom: number, picketsTo: number) {
  const m = M();
  const len = b - a;
  if (len <= 0.001) return;
  const mid = (a + b) / 2;
  const ry = dir.dx !== 0 ? 0 : Math.PI / 2;
  const at = (t: number) => ({ x: dir.dx * t, z: dir.dz * t });
  const c = at(mid);
  const T = L.thick;
  p.base.box(len, L.baseH, T, m.concrete, c.x, 0, c.z, ry);
  p.base.box(len, 0.05, T - 0.1, m.concreteDark, c.x, L.baseH, c.z, ry);
  // pastki, o‘rta va yuqori to‘sinlar
  for (const y of [L.baseH + 0.07, 0.86, L.panelTop - 0.1]) p.panel.box(len, 0.06, 0.075, m.steel, c.x, y, c.z, ry);
  // vertikal tayoqlar
  const top = L.panelTop - L.baseH - 0.05;
  for (let t = Math.ceil(picketsFrom / 0.1 - 0.5) * 0.1 + 0.05; t < picketsTo - 0.02; t += 0.1) {
    const q = at(t);
    p.panel.box(0.042, top, 0.05, m.steelDark, q.x, L.baseH + 0.05, q.z);
    p.panel.box(0.03, 0.05, 0.03, m.steel, q.x, L.baseH + 0.05 + top, q.z);
  }
}

function cellParts(v: WallVariant): Parts {
  const p = newParts();
  const m = M();
  const pw = L.pillarW, bw = L.cornerPillarW;
  if (v.junction) pillar(p, 0, 0, bw, L.pillarH + 0.08);
  for (const d of DIRS) {
    if (!(v.arms & d.bit)) continue;
    const a = v.junction ? bw / 2 : 0;
    const edgeP = (v.pillarEdges & d.bit) !== 0;
    arm(p, d, a, 0.5, a + (v.junction ? 0.03 : 0), edgeP ? 0.5 - pw / 2 - 0.02 : 0.5);
    if (v.edgePillars & d.bit) pillar(p, d.dx * 0.5, d.dz * 0.5, pw, L.pillarH);
  }
  // to‘g‘ri qismda poydevorni quchoqlagan po‘lat qisqich (namunadagidek)
  if (!v.junction) {
    const along = v.arms & (E | W) ? 0 : Math.PI / 2;
    p.base.box(0.09, L.baseH + 0.04, L.thick + 0.07, m.steelDark, 0, 0, 0, along);
  }
  return p;
}

const cellCache = new Map<string, THREE.Group>();

/** Tayyor devor katagi (umumiy shablon — klon geometriyani ulashadi) */
export function wallCellModel(v: WallVariant): THREE.Group {
  const key = variantKey(v) + '|' + v.pillarEdges;
  let t = cellCache.get(key);
  if (!t) {
    const p = cellParts(v);
    const all = new Builder();
    for (const b of [p.base, p.pillar, p.panel, p.light]) all.mergeFrom(b);
    t = all.build();
    cellCache.set(key, t);
  }
  return t.clone();
}

/** Ko‘rinish (arvoh) uchun — burchak yoki yolg‘iz devor */
export function defensePreviewModel(type: string, arms: number): THREE.Group {
  if (type === 'himoya_darvoza') return gateModel(null).group;
  const junction = type === 'himoya_burchak';
  let edge = 0;
  for (const d of DIRS) if (arms & d.bit) edge |= d.bit;
  return wallCellModel({ arms, junction, edgePillars: edge, conns: 0, pillarEdges: edge });
}

// ---------- darvoza ----------

function leaf(b: Builder, side: -1 | 1) {
  const m = M();
  const w = 1.5, h = 1.22, y0 = 0.07;
  const x0 = side < 0 ? -w : 0;
  const cx = x0 + w / 2;
  const z = L.leafTrack;
  // ramka
  b.box(w, 0.08, 0.08, m.steelDark, cx, y0, z);
  b.box(w, 0.08, 0.08, m.steelDark, cx, y0 + h - 0.08, z);
  b.box(0.08, h, 0.08, m.steelDark, x0 + 0.04, y0, z);
  b.box(0.08, h, 0.08, m.steelDark, x0 + w - 0.04, y0, z);
  for (const y of [0.48, 0.88]) b.box(w - 0.08, 0.06, 0.07, m.steel, cx, y, z);
  // vertikal taxtalar
  for (let x = x0 + 0.12; x < x0 + w - 0.08; x += 0.085) b.box(0.05, h - 0.12, 0.045, m.steel, x, y0 + 0.06, z - 0.005);
  // diagonal mustahkamlovchi
  const dx = w - 0.16, dy = h - 0.2;
  const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * (side < 0 ? 1 : -1);
  b.add(new THREE.BoxGeometry(len, 0.07, 0.04), m.steelDark, cx, y0 + h / 2, z + 0.045, 0, 0, ang);
  // pastki roliklar
  for (const x of [x0 + 0.2, x0 + w - 0.2]) b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), m.steelDark, x, 0.05, z, 0, Math.PI / 2, 0);
}

export interface GateParts { parts: Parts; leafL: Builder; leafR: Builder }

function gateParts(): GateParts {
  const m = M();
  const p = newParts();
  const bw = L.cornerPillarW, H = L.pillarH + 0.14;
  // ostona va qanot yo‘lagi (relsi): yo‘l sathida
  p.base.box(3.2, 0.03, 0.12, m.steelDark, 0, 0.005, L.leafTrack);
  for (const s of [-1, 1]) p.base.box(1.5, 0.025, 0.1, m.steelDark, s * 2.25, 0.005, L.leafTrack);
  for (const s of [-1, 1]) pillar(p, s * 1.5, 0, bw, H);
  // yuqori to‘sin (qanotlar ustidan) va kronshteynlar
  p.pillar.box(3 + bw, 0.12, 0.44, m.steelDark, 0, H - 0.2, 0.17);
  p.pillar.box(3 + bw, 0.04, 0.48, m.steel, 0, H - 0.08, 0.17);
  for (const x of [-1.05, -0.35, 0.35, 1.05]) p.pillar.box(0.07, 0.08, 0.36, m.steel, x, H - 0.28, 0.17);
  // boshqaruv qutisi
  p.base.box(0.24, 0.38, 0.18, m.box, 1.5 + 0.08, 0, -0.42);
  p.light.cyl(0.035, 0.035, 0.06, m.lamp, 1.5 + 0.08, 0.38, -0.42, 10);
  const leafL = new Builder(), leafR = new Builder();
  leaf(leafL, -1);
  leaf(leafR, 1);
  return { parts: p, leafL, leafR };
}

export interface GateModel {
  group: THREE.Group;
  leafL: THREE.Object3D;
  leafR: THREE.Object3D;
  parts: Record<keyof Parts, THREE.Object3D>;
}

let gateTpl: { parts: Record<keyof Parts, THREE.Group>; leafL: THREE.Group; leafR: THREE.Group } | null = null;

/** Darvoza modeli (qanotlari alohida — ochilish animatsiyasi) */
export function gateModel(state: GateState | null): GateModel {
  if (!gateTpl) {
    const gp = gateParts();
    gateTpl = {
      parts: { base: gp.parts.base.build(), pillar: gp.parts.pillar.build(), panel: gp.parts.panel.build(), light: gp.parts.light.build() },
      leafL: gp.leafL.build(), leafR: gp.leafR.build(),
    };
  }
  const group = new THREE.Group();
  const parts = {
    base: gateTpl.parts.base.clone(), pillar: gateTpl.parts.pillar.clone(), panel: new THREE.Group(), light: gateTpl.parts.light.clone(),
  };
  const leafL = gateTpl.leafL.clone(), leafR = gateTpl.leafR.clone();
  parts.panel.add(leafL, leafR);
  group.add(parts.base, parts.pillar, parts.panel, parts.light);
  setGateOpen({ leafL, leafR }, state?.open ?? 0);
  return { group, leafL, leafR, parts };
}

/** Qanotlar yon tomonga suriladi (silliq boshlanib, silliq to‘xtaydi) */
export function setGateOpen(g: Pick<GateModel, 'leafL' | 'leafR'>, open: number) {
  const k = open * open * (3 - 2 * open);
  g.leafL.position.x = -1.5 * k;
  g.leafR.position.x = 1.5 * k;
}

// ---------- qurilish ----------

const sm = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

let propsTpl: THREE.Group | null = null;
/** Vaqtinchalik jihozlar: tuproq maydoni, po‘lat taxlami va konuslar (28–30 s da yig‘ib olinadi) */
function siteProps(): THREE.Group {
  if (!propsTpl) {
    const m = M();
    const b = new Builder();
    b.box(0.3, 0.05, 0.22, m.pallet, -0.2, 0, -0.62);
    for (let i = 0; i < 4; i++) b.box(0.28, 0.025, 0.03, m.steelDark, -0.2, 0.05 + (i % 2) * 0.025, -0.7 + i * 0.05);
    for (const x of [0.25, 0.42]) { b.cyl(0.005, 0.04, 0.1, m.cone, x, 0, -0.6, 10); }
    propsTpl = b.build();
  }
  return propsTpl.clone();
}

/**
 * Himoya qismi qurilish maydoni (krasiz — kichik qism uchun oddiy yig‘ish): 0–6 s maydon va poydevor, 6–18 s ustun
 * va asosiy konstruksiya, 18–28 s po‘lat panellar yoki darvoza qanotlari, 28–30 s chiroqlar va jihozlarni yig‘ish.
 * Vaqt faqat BuildState.elapsed dan (pauza, saqlash/yuklash bilan mos).
 */
export class DefenseSite {
  readonly group = new THREE.Group();
  private parts: Record<keyof Parts, THREE.Object3D>;
  private props: THREE.Object3D;
  private pad: THREE.Mesh;

  constructor(model: { parts: Record<keyof Parts, THREE.Object3D> }, root: THREE.Object3D, w: number) {
    this.parts = model.parts;
    this.group.add(root);
    this.props = siteProps();
    this.group.add(this.props);
    this.pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, 1), M().dirt);
    this.pad.position.y = 0.01;
    this.pad.receiveShadow = true;
    this.group.add(this.pad);
  }

  update(b: BuildState) {
    const t = buildProgress(b).t30;
    const set = (o: THREE.Object3D, k: number) => { o.visible = k > 0.001; o.scale.y = Math.max(0.001, k); };
    set(this.parts.base, sm(0.5, 6, t));
    set(this.parts.pillar, sm(6, 18, t));
    set(this.parts.panel, sm(18, 28, t));
    set(this.parts.light, sm(28, 30, t));
    const out = 1 - sm(28, 30, t);
    this.props.visible = out > 0.01;
    this.props.scale.setScalar(Math.max(0.01, out));
    this.pad.visible = t < 6;
    this.pad.scale.x = 1 - sm(4, 6, t) * 0.9;
  }

  dispose() {
    this.pad.geometry.dispose();
  }
}

/** Qurilayotgan devor katagi */
export function wallSite(v: WallVariant, b: BuildState): DefenseSite {
  const p = cellParts(v);
  const parts = { base: p.base.build(), pillar: p.pillar.build(), panel: p.panel.build(), light: p.light.build() };
  const root = new THREE.Group();
  root.add(parts.base, parts.pillar, parts.panel, parts.light);
  const s = new DefenseSite({ parts }, root, 1);
  s.update(b);
  return s;
}

/** Qurilayotgan darvoza (qanotlar yopiq holatda paydo bo‘ladi) */
export function gateSite(b: BuildState): DefenseSite {
  const gm = gateModel(null);
  const s = new DefenseSite(gm, gm.group, 3);
  s.update(b);
  return s;
}

// ---------- tayyor devorlar: bo‘laklarda birlashtirish ----------

const CHUNK = 16;

/**
 * Ko‘p devor uchun: tayyor devor kataklari 16×16 katakli bo‘laklarda material bo‘yicha bitta meshga birlashadi
 * (yuzlab qism — bir necha draw call). Faqat o‘zgargan bo‘lak qayta quriladi.
 */
export class DefenseView {
  readonly root = new THREE.Group();
  private chunks = new Map<string, { sig: string; group: THREE.Group }>();

  /** cells: tayyor devor kataklari (dunyo pozitsiyasi bilan) */
  sync(cells: { x: number; z: number; v: WallVariant; wx: number; wz: number }[]) {
    const by = new Map<string, typeof cells>();
    for (const c of cells) {
      const k = Math.floor(c.x / CHUNK) + ':' + Math.floor(c.z / CHUNK);
      (by.get(k) ?? by.set(k, []).get(k)!).push(c);
    }
    for (const [k, list] of by) {
      const sig = list.map((c) => `${c.x},${c.z},${variantKey(c.v)},${c.v.pillarEdges}`).join(';');
      const old = this.chunks.get(k);
      if (old?.sig === sig) continue;
      if (old) this.drop(old.group);
      const group = this.buildChunk(list);
      this.root.add(group);
      this.chunks.set(k, { sig, group });
    }
    for (const [k, c] of this.chunks) if (!by.has(k)) { this.drop(c.group); this.chunks.delete(k); }
  }

  private buildChunk(list: { v: WallVariant; wx: number; wz: number }[]): THREE.Group {
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const c of list) {
      const tpl = wallCellModel(c.v);
      for (const ch of tpl.children) {
        const mesh = ch as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const g = mesh.geometry.clone().translate(c.wx, 0, c.wz);
        const m = mesh.material as THREE.Material;
        (byMat.get(m) ?? byMat.set(m, []).get(m)!).push(g);
      }
    }
    const group = new THREE.Group();
    for (const [m, gs] of byMat) {
      const merged = mergeGeometries(gs, false);
      for (const g of gs) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.userData.defenseChunk = true;
    return group;
  }

  private drop(g: THREE.Group) {
    this.root.remove(g);
    g.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
  }

  /** Sinov/diagnostika: bo‘laklar va draw call (mesh) soni */
  stats() {
    let meshes = 0;
    for (const c of this.chunks.values()) meshes += c.group.children.length;
    return { chunks: this.chunks.size, meshes };
  }
}

let rubbleTpl: THREE.Group | null = null;
/** Dinozavr buzgan devor qismi: past beton bo‘laklar va egilgan po‘lat (o‘tib bo‘ladi — ta’mirlash kerak) */
export function wallRubble(): THREE.Group {
  if (!rubbleTpl) {
    const k = M();
    const b = new Builder();
    for (const [x, z, s, r] of [[-0.25, 0.05, 0.22, 0.4], [0.05, -0.1, 0.3, -0.3], [0.28, 0.12, 0.18, 0.9], [-0.05, 0.2, 0.14, 1.4]] as const) {
      b.add(new THREE.BoxGeometry(s, s * 0.55, s * 0.8), k.concrete, x, s * 0.25, z, r, 0.2, 0.15);
    }
    b.add(new THREE.BoxGeometry(0.7, 0.04, 0.05), k.steelDark, 0, 0.12, -0.02, 0.3, 0, 0.35);
    b.add(new THREE.BoxGeometry(0.5, 0.04, 0.05), k.steel, 0.05, 0.06, 0.1, -0.6, 0, -0.2);
    b.box(0.9, 0.04, 0.4, k.concreteDark, 0, 0, 0);
    rubbleTpl = b.build();
  }
  return rubbleTpl.clone();
}

/** Tanlash va buzish uchun ko‘rinmas «tutqich» (geometriya umumiy) */
const proxyGeo = new THREE.BoxGeometry(0.9, 1.45, 0.9).translate(0, 0.725, 0);
const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
export function wallProxy(): THREE.Mesh {
  return new THREE.Mesh(proxyGeo, proxyMat);
}

