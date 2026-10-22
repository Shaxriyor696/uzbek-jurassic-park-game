import * as THREE from 'three';
import type { BuildState } from '../game/construction';

/**
 * Qurilish maydoni (3D): ko‘k vaqtinchalik to‘siq, tuproq, poydevor va armatura, beton karkas va qavatlar, iskala,
 * taxlangan materiallar, kichik binolardan tashqari — minora krani. Binoning o‘z yakuniy modeli devor va pardoz
 * bosqichida kesish tekisligi bilan pastdan yuqoriga ochiladi; obodonlashtirish (yo‘lak, maysa, daraxtlar) yakunda.
 * 30-soniyada aynan shu model oddiy holatda almashadi — sakrash yo‘q.
 *
 * Vaqt: faqat BuildState.elapsed (o‘yin vaqti) dan — pauzada to‘xtaydi, saqlangan joyidan davom etadi.
 * Geometriya va materiallar barcha maydonlar uchun umumiy; har maydonda faqat InstancedMesh va kesish uchun
 * nusxalangan model materiallari (maydon tugaganda tozalanadi).
 * Koordinatalar: guruh markazi footprint markazi, model aylantirilmagan lokal tizimda (eni W × bo‘yi D).
 */

// ---------- umumiy resurslar ----------
const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const unitBoxC = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0);
const M = {
  fence: new THREE.MeshStandardMaterial({ color: '#2f6fd6', roughness: 0.55 }),
  post: new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.5, metalness: 0.3 }),
  concrete: new THREE.MeshStandardMaterial({ color: '#b9b6b0', roughness: 0.9 }),
  slab: new THREE.MeshStandardMaterial({ color: '#cfccc5', roughness: 0.85 }),
  rebar: new THREE.MeshStandardMaterial({ color: '#4a3a30', roughness: 0.6, metalness: 0.4 }),
  dirt: new THREE.MeshStandardMaterial({ color: '#9b7650', roughness: 1 }),
  mound: new THREE.MeshStandardMaterial({ color: '#86603d', roughness: 1 }),
  brick: new THREE.MeshStandardMaterial({ color: '#c0563b', roughness: 0.8 }),
  block: new THREE.MeshStandardMaterial({ color: '#c9c7c2', roughness: 0.85 }),
  timber: new THREE.MeshStandardMaterial({ color: '#d1a464', roughness: 0.8 }),
  pipe: new THREE.MeshStandardMaterial({ color: '#3c4148', roughness: 0.5, metalness: 0.5 }),
  pallet: new THREE.MeshStandardMaterial({ color: '#a77b47', roughness: 0.85 }),
  blueStack: new THREE.MeshStandardMaterial({ color: '#2f63c4', roughness: 0.6 }),
  scaffold: new THREE.MeshStandardMaterial({ color: '#9aa2aa', roughness: 0.45, metalness: 0.5 }),
  plank: new THREE.MeshStandardMaterial({ color: '#c99a55', roughness: 0.8 }),
  net: new THREE.MeshStandardMaterial({ color: '#2f6fd6', roughness: 0.7, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  crane: new THREE.MeshStandardMaterial({ color: '#f2b51c', roughness: 0.5, metalness: 0.2 }),
  craneDark: new THREE.MeshStandardMaterial({ color: '#3a3f46', roughness: 0.5, metalness: 0.4 }),
  cable: new THREE.MeshStandardMaterial({ color: '#25282c', roughness: 0.6 }),
  cabin: new THREE.MeshStandardMaterial({ color: '#e8e6e0', roughness: 0.6 }),
  cabinGlass: new THREE.MeshStandardMaterial({ color: '#7fb4d4', roughness: 0.1, metalness: 0.3 }),
  hazard: new THREE.MeshStandardMaterial({ color: '#e6c229', roughness: 0.5 }),
};
M.net.userData.noShadow = true;

const sm = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface Item { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number }

/** InstancedMesh + har bir nusxaning asl o‘lchami (ko‘rinish ulushini 0..1 bilan boshqarish uchun). */
class Inst {
  mesh: THREE.InstancedMesh;
  constructor(public items: Item[], geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) {
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    this.mesh.count = items.length;
    this.mesh.castShadow = !mat.userData.noShadow;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    for (let i = 0; i < items.length; i++) this.set(i, 0);
  }
  /** k: 0 — ko‘rinmaydi, 1 — to‘liq (balandlik bo‘yicha o‘sadi) */
  set(i: number, k: number, kxz = 1) {
    const it = this.items[i];
    const v = Math.max(0, Math.min(1, k));
    tmpQ.setFromAxisAngle(UP, it.ry ?? 0);
    tmpS.set(v > 0 ? it.sx * kxz : 0, it.sy * v, v > 0 ? it.sz * kxz : 0);
    tmpP.set(it.x, it.y, it.z);
    this.mesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
  }
  done() { this.mesh.instanceMatrix.needsUpdate = true; }
}

export class ConstructionSite {
  readonly group = new THREE.Group();
  private clones: THREE.Material[] = [];
  private sprites: THREE.Object3D | null = null;
  private clipY = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  /** Asosiy hajmdan tashqaridagi (obodonlashtirish) qismlar yakungacha yashirin — lokal tekisliklar */
  private rectLocal: THREE.Plane[] = [];
  private rectWorld: THREE.Plane[] = [];
  private H: number;
  private floors: number;
  private core: { x0: number; x1: number; z0: number; z1: number };
  private fence: Inst;
  private dirt: THREE.Mesh;
  private mounds: Inst;
  private footings: Inst;
  private beams: Inst;
  private rebar: Inst;
  private cols: Inst;
  private colTops: Inst;
  private slabs: Inst;
  private poles: Inst;
  private planks: Inst;
  private nets: Inst;
  private stacks: { inst: Inst; inner: boolean }[] = [];
  private cabin: THREE.Group | null = null;
  private crane: Crane | null = null;
  private ncols: number;

  constructor(model: THREE.Object3D, W: number, D: number) {
    this.group.name = 'construction-site';
    this.group.add(model);
    const g = this.group;

    // --- modelni tayyorlash: materiallarni nusxalab kesish tekisliklarini ulash (umumiy materiallarga tegilmaydi)
    model.updateMatrixWorld(true);
    const all: { x: number; y: number; z: number }[] = [];
    let Hmax = 0.2;
    model.traverse((o) => {
      if (o.name === 'sprites') { this.sprites = o; return; }
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
      const pos = m.geometry.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      const step = Math.max(1, Math.floor(pos.count / 400));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        Hmax = Math.max(Hmax, v.y);
        all.push({ x: v.x, y: v.y, z: v.z });
      }
    });
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || o.parent?.name === 'sprites') return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const cl = mats.map((mt) => {
        const c = mt.clone();
        c.clippingPlanes = [this.clipY, ...this.rectPlanes()];
        c.clipShadows = true;
        this.clones.push(c);
        return c;
      });
      m.material = Array.isArray(m.material) ? cl : cl[0];
    });
    if (this.sprites) this.sprites.visible = false;
    // bino balandligi — vertekslarning 97% i (ingichka antenna/bayroq ustunlari hisobga olinmaydi)
    const qq = (arr: number[], p: number) => { const s2 = [...arr].sort((a, b) => a - b); return s2.length ? s2[Math.max(0, Math.min(s2.length - 1, Math.floor(p * (s2.length - 1))))] : 0; };
    const H = Math.max(0.25, Math.min(Hmax, qq(all.map((p) => p.y), 0.97)));
    // asosiy hajm: balandligi binoning ~40% idan yuqori vertekslar (hovli, maysa, chiroqlar kirmaydi)
    const pts = all.filter((p) => p.y > Math.max(0.22, H * 0.4));
    this.H = H;
    this.floors = Math.max(1, Math.min(14, Math.round((H - 0.05) / 0.24)));
    // asosiy hajm: balandroq vertekslar (bino), chetdagi 4% chiqindilarni hisobga olmasdan
    const q = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.floor(p * (s.length - 1))))]; };
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    const inset = (lim: number, v: number) => Math.max(-lim, Math.min(lim, v));
    this.core = pts.length > 8
      ? { x0: inset(W / 2 - 0.1, q(xs, 0.02)), x1: inset(W / 2 - 0.1, q(xs, 0.98)), z0: inset(D / 2 - 0.1, q(zs, 0.02)), z1: inset(D / 2 - 0.1, q(zs, 0.98)) }
      : { x0: -W / 4, x1: W / 4, z0: -D / 4, z1: D / 4 };
    const c = this.core;
    const cw = c.x1 - c.x0, cd = c.z1 - c.z0, ccx = (c.x0 + c.x1) / 2, ccz = (c.z0 + c.z1) / 2;
    // obodonlashtirish qismlarini yakungacha yashiruvchi to‘rt tekislik (asosiy hajm atrofida 0,04 chet)
    const e = 0.04;
    this.rectLocal = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -(c.x0 - e)),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), c.x1 + e),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -(c.z0 - e)),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), c.z1 + e),
    ];

    // --- to‘siq (perimetr bo‘ylab panellar)
    const hw = W / 2 - 0.03, hd = D / 2 - 0.03;
    const fenceItems: Item[] = [];
    const side = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 0.34));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        fenceItems.push({ x: lerp(x0, x1, t), y: 0.03, z: lerp(z0, z1, t), sx: len / n - 0.012, sy: 0.17, sz: 0.012, ry: Math.atan2(-(z1 - z0), x1 - x0) });
      }
    };
    side(-hw, hd, hw, hd); side(hw, hd, hw, -hd); side(hw, -hd, -hw, -hd); side(-hw, -hd, -hw, hd);
    this.fence = new Inst(fenceItems, unitBox, M.fence, g);

    // --- tuproq va qazilgan tepachalar
    this.dirt = new THREE.Mesh(unitBox, M.dirt);
    this.dirt.scale.set(W - 0.08, 0.02, D - 0.08);
    this.dirt.position.y = 0.062;
    this.dirt.receiveShadow = true;
    g.add(this.dirt);
    this.mounds = new Inst([
      { x: ccx - cw * 0.3, y: 0.07, z: ccz + cd * 0.25, sx: 0.28, sy: 0.08, sz: 0.2 },
      { x: ccx + cw * 0.28, y: 0.07, z: ccz - cd * 0.3, sx: 0.22, sy: 0.06, sz: 0.24 },
    ], unitCyl, M.mound, g);

    // --- poydevor: ustun ostliklari setkasi, ular orasidagi to‘sinlar, armatura
    const nx = Math.max(2, Math.round(cw / 0.5) + 1), nz = Math.max(2, Math.round(cd / 0.5) + 1);
    const grid: { x: number; z: number }[] = [];
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) grid.push({ x: c.x0 + 0.05 + ((cw - 0.1) * i) / (nx - 1), z: c.z0 + 0.05 + ((cd - 0.1) * k) / (nz - 1) });
    this.ncols = grid.length;
    this.footings = new Inst(grid.map((p) => ({ x: p.x, y: 0.07, z: p.z, sx: 0.13, sy: 0.06, sz: 0.13 })), unitBox, M.concrete, g);
    const beamItems: Item[] = [];
    for (let i = 0; i < nx; i++) beamItems.push({ x: grid[i * nz].x, y: 0.07, z: ccz, sx: 0.06, sy: 0.045, sz: cd - 0.1 });
    for (let k = 0; k < nz; k++) beamItems.push({ x: ccx, y: 0.07, z: grid[k].z, sx: cw - 0.1, sy: 0.045, sz: 0.06 });
    this.beams = new Inst(beamItems, unitBox, M.concrete, g);
    const rb: Item[] = [];
    for (const p of grid) for (const [dx, dz] of [[-0.03, -0.03], [0.03, -0.03], [-0.03, 0.03], [0.03, 0.03]]) rb.push({ x: p.x + dx, y: 0.13, z: p.z + dz, sx: 0.008, sy: 0.12, sz: 0.008 });
    this.rebar = new Inst(rb, unitBox, M.rebar, g);

    // --- karkas: har qavat uchun ustunlar va plita
    const fh = (H - 0.08) / this.floors;
    const colItems: Item[] = [];
    const tops: Item[] = [];
    const slabItems: Item[] = [];
    for (let f = 0; f < this.floors; f++) {
      for (const p of grid) colItems.push({ x: p.x, y: 0.13 + f * fh, z: p.z, sx: 0.07, sy: fh - 0.025, sz: 0.07 });
      slabItems.push({ x: ccx, y: 0.13 + (f + 1) * fh - 0.025, z: ccz, sx: cw - 0.02, sy: 0.025, sz: cd - 0.02 });
    }
    for (const p of grid) for (const [dx, dz] of [[-0.02, -0.02], [0.02, 0.02]]) tops.push({ x: p.x + dx, y: 0, z: p.z + dz, sx: 0.007, sy: 0.09, sz: 0.007 });
    this.cols = new Inst(colItems, unitBox, M.concrete, g);
    this.slabs = new Inst(slabItems, unitBox, M.slab, g);
    this.colTops = new Inst(tops, unitBox, M.rebar, g);

    // --- iskala: asosiy hajm atrofida (footprint ichida qoladi)
    const sx0 = Math.max(-W / 2 + 0.05, c.x0 - 0.07), sx1 = Math.min(W / 2 - 0.05, c.x1 + 0.07);
    const sz0 = Math.max(-D / 2 + 0.05, c.z0 - 0.07), sz1 = Math.min(D / 2 - 0.05, c.z1 + 0.07);
    const poleItems: Item[] = [];
    const ring = (fn: (x: number, z: number) => void) => {
      const nX = Math.max(2, Math.round((sx1 - sx0) / 0.32)), nZ = Math.max(2, Math.round((sz1 - sz0) / 0.32));
      for (let i = 0; i <= nX; i++) { fn(lerp(sx0, sx1, i / nX), sz0); fn(lerp(sx0, sx1, i / nX), sz1); }
      for (let i = 1; i < nZ; i++) { fn(sx0, lerp(sz0, sz1, i / nZ)); fn(sx1, lerp(sz0, sz1, i / nZ)); }
    };
    ring((x, z) => poleItems.push({ x, y: 0.07, z, sx: 0.012, sy: 1, sz: 0.012 }));
    this.poles = new Inst(poleItems, unitBox, M.scaffold, g);
    const plankItems: Item[] = [];
    for (let f = 0; f <= this.floors; f++) {
      const y = 0.13 + f * fh;
      plankItems.push({ x: (sx0 + sx1) / 2, y, z: sz1, sx: sx1 - sx0, sy: 0.012, sz: 0.06 });
      plankItems.push({ x: (sx0 + sx1) / 2, y, z: sz0, sx: sx1 - sx0, sy: 0.012, sz: 0.06 });
      plankItems.push({ x: sx1, y, z: (sz0 + sz1) / 2, sx: 0.06, sy: 0.012, sz: sz1 - sz0 });
      plankItems.push({ x: sx0, y, z: (sz0 + sz1) / 2, sx: 0.06, sy: 0.012, sz: sz1 - sz0 });
    }
    this.planks = new Inst(plankItems, unitBox, M.plank, g);
    // himoya to‘ri — rasmdagi kabi ikki tomonda (fasad qolgan tomonlardan ko‘rinadi)
    this.nets = new Inst([
      { x: (sx0 + sx1) / 2, y: 0.07, z: sz0 - 0.012, sx: sx1 - sx0, sy: 1, sz: 0.004 },
      { x: sx0 - 0.012, y: 0.07, z: (sz0 + sz1) / 2, sx: 0.004, sy: 1, sz: sz1 - sz0 },
    ], unitBox, M.net, g);
    this.scaffoldBox = { sx0, sx1, sz0, sz1, fh };

    // --- materiallar: asosiy hajmdan tashqaridagi bo‘sh joylarga (bo‘lmasa — ichkariga, karkasdan oldin yo‘qoladi)
    const free: { x: number; z: number; inner: boolean }[] = [];
    for (let z = -D / 2 + 0.2; z <= D / 2 - 0.2; z += 0.3) for (let x = -W / 2 + 0.2; x <= W / 2 - 0.2; x += 0.3) {
      if (x > sx0 - 0.12 && x < sx1 + 0.12 && z > sz0 - 0.12 && z < sz1 + 0.12) continue;
      free.push({ x, z, inner: false });
    }
    const big = W * D >= 9;
    const craneNeeded = H >= 0.85 || W * D >= 16;
    // kran tagligi — asosiy hajmdan eng uzoq burchak
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ x: a * (W / 2 - 0.22), z: b * (D / 2 - 0.22) }));
    const distCore = (p: { x: number; z: number }) => Math.hypot(Math.max(c.x0 - p.x, 0, p.x - c.x1), Math.max(c.z0 - p.z, 0, p.z - c.z1));
    corners.sort((a, b) => distCore(b) - distCore(a));
    const craneAt = corners[0];
    const usable = free.filter((p) => !craneNeeded || Math.hypot(p.x - craneAt.x, p.z - craneAt.z) > 0.3);
    if (big && usable.length > 3) {
      // vaqtinchalik ofis va hojatxona (rasmlardagi kabi)
      const p = usable.splice(usable.length - 1, 1)[0];
      this.cabin = new THREE.Group();
      const cb = new THREE.Mesh(unitBox, M.cabin); cb.scale.set(0.34, 0.16, 0.18); cb.castShadow = true;
      const roof = new THREE.Mesh(unitBox, M.fence); roof.scale.set(0.36, 0.02, 0.2); roof.position.y = 0.16;
      const win = new THREE.Mesh(unitBox, M.cabinGlass); win.scale.set(0.12, 0.06, 0.005); win.position.set(0.06, 0.07, 0.092);
      const wc = new THREE.Mesh(unitBox, M.fence); wc.scale.set(0.08, 0.17, 0.08); wc.position.set(-0.26, 0, 0.0); wc.castShadow = true;
      this.cabin.add(cb, roof, win, wc);
      this.cabin.position.set(Math.max(-W / 2 + 0.36, Math.min(W / 2 - 0.2, p.x)), 0.07, p.z);
      g.add(this.cabin);
    }
    const kinds: [THREE.Material, number, number, number][] = [[M.brick, 0.13, 0.1, 0.11], [M.block, 0.13, 0.12, 0.11], [M.timber, 0.2, 0.06, 0.1], [M.blueStack, 0.12, 0.09, 0.1], [M.pipe, 0.22, 0.05, 0.08]];
    const spots = usable.length ? usable : [
      { x: c.x0 + 0.15, z: c.z0 + 0.15, inner: true }, { x: c.x1 - 0.15, z: c.z1 - 0.15, inner: true }, { x: c.x0 + 0.15, z: c.z1 - 0.15, inner: true },
    ];
    // materiallar kran (yoki maydon burchagi) yonida bir joyga taxlanadi — rasmlardagi kabi
    const anchor = craneNeeded ? craneAt : corners[0];
    const take = [...spots].sort((p1, p2) => Math.hypot(p1.x - anchor.x, p1.z - anchor.z) - Math.hypot(p2.x - anchor.x, p2.z - anchor.z))
      .filter((p) => !craneNeeded || Math.hypot(p.x - anchor.x, p.z - anchor.z) > 0.3).slice(0, 8);
    take.forEach((p, i) => {
      const [mt, sx, sy, sz] = kinds[i % kinds.length];
      const items: Item[] = [{ x: p.x, y: 0.07, z: p.z, sx: sx + 0.02, sy: 0.02, sz: sz + 0.02 }];
      for (let l = 0; l < 3; l++) items.push({ x: p.x, y: 0.09 + l * sy, z: p.z, sx, sy: sy * 0.95, sz, ry: (i % 2) * 0.2 });
      const stack = new Inst(items, unitBox, mt, g);
      this.stacks.push({ inst: stack, inner: p.inner });
    });

    // --- kran (katta yoki ko‘p qavatli binolar)
    if (craneNeeded) {
      const pick = take.find((p) => !p.inner) ?? { x: craneAt.x * 0.6, z: craneAt.z * 0.6 };
      const corePts = [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]];
      const reach = Math.max(...corePts.map(([x, z]) => Math.hypot(x - craneAt.x, z - craneAt.z)), Math.hypot(pick.x - craneAt.x, pick.z - craneAt.z)) + 0.15;
      this.crane = new Crane(craneAt.x, craneAt.z, H + 0.65, Math.min(5.5, reach), { x: pick.x, z: pick.z }, c);
      g.add(this.crane.group);
    }
  }

  private scaffoldBox: { sx0: number; sx1: number; sz0: number; sz1: number; fh: number };

  private rectPlanes(): THREE.Plane[] {
    if (!this.rectWorld.length) this.rectWorld = [0, 1, 2, 3].map(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6));
    return this.rectWorld;
  }

  /** Qurilish holatini chizadi (har kadr; faqat elapsed ga bog‘liq). */
  update(b: BuildState) {
    const t = Math.max(0, Math.min(30, (b.elapsed / b.duration) * 30));
    const H = this.H, F = this.floors, fh = this.scaffoldBox.fh;
    this.group.updateMatrixWorld(true);

    // to‘siq: 0–1,8 s ketma-ket o‘rnatiladi; 28–29,2 s olib tashlanadi
    const fn = this.fence.items.length;
    for (let i = 0; i < fn; i++) this.fence.set(i, sm((i / fn) * 1.6, (i / fn) * 1.6 + 0.3, t) * (1 - sm(28 + (i / fn) * 0.6, 28.6 + (i / fn) * 0.6, t)));
    this.fence.done();
    // tuproq: 0,3–1,2 s; 28,4–29,6 s yer ostiga tushadi (obodonlashtirish ochiladi)
    this.dirt.visible = t > 0.3;
    this.dirt.scale.y = 0.02 * sm(0.3, 1.2, t);
    this.dirt.position.y = 0.062 - 0.08 * sm(28.4, 29.6, t);
    for (let i = 0; i < this.mounds.items.length; i++) this.mounds.set(i, sm(0.8 + i * 0.4, 1.8 + i * 0.4, t) * (1 - sm(5, 6, t)));
    this.mounds.done();

    // poydevor 1,5–5,5 s; armatura 2–4,5 s (karkas boshlanganda ostliklar ichida qoladi)
    const nf = this.footings.items.length;
    for (let i = 0; i < nf; i++) this.footings.set(i, sm(1.5 + (i / nf) * 2, 2.3 + (i / nf) * 2, t) * (1 - sm(27.6, 28, t)));
    this.footings.done();
    const nb = this.beams.items.length;
    for (let i = 0; i < nb; i++) this.beams.set(i, sm(3 + (i / nb) * 2, 3.6 + (i / nb) * 2, t) * (1 - sm(27.6, 28, t)));
    this.beams.done();
    const nr = this.rebar.items.length;
    for (let i = 0; i < nr; i++) this.rebar.set(i, sm(2 + (i / nr) * 2.2, 2.4 + (i / nr) * 2.2, t) * (1 - sm(6.2, 7, t)));
    this.rebar.done();

    // bino o‘z modeli 18–27,4 s da pastdan ochiladi — devor yetgan qavatlarda karkas va plita ko‘rinmaydi
    const clipH = t < 18 ? -1 : lerp(0.02, H + 0.05, sm(18, 27.4, t));
    // karkas 6–18 s: har qavat o‘z vaqt oralig‘ida — avval ustunlar, keyin plita (pastdan yuqoriga)
    const slot = 12 / F;
    let builtTop = 0.13;
    for (let f = 0; f < F; f++) {
      const s0 = 6 + f * slot;
      const kc = sm(s0, s0 + slot * 0.55, t), ks = sm(s0 + slot * 0.5, s0 + slot * 0.95, t);
      const floorTop = 0.13 + (f + 1) * fh;
      const vanish = (1 - sm(27.5, 28, t)) * (clipH >= floorTop ? 0 : 1);
      for (let k = 0; k < this.ncols; k++) this.cols.set(f * this.ncols + k, kc * vanish);
      this.slabs.set(f, ks > 0 ? vanish : 0, ks > 0 ? 0.25 + 0.75 * ks : 0);
      if (kc > 0) builtTop = 0.13 + f * fh + (fh - 0.025) * kc;
    }
    this.cols.done();
    this.slabs.done();
    // eng yuqori tayyor ustunlar ustidagi armatura chiqindilari (karkas davomida)
    const topVis = t > 6.2 && t < 18.5;
    for (let i = 0; i < this.colTops.items.length; i++) {
      const it = this.colTops.items[i];
      it.y = builtTop;
      this.colTops.set(i, topVis ? 1 : 0);
    }
    this.colTops.done();

    // bino o‘z modeli: 18–27,4 s pastdan yuqoriga ochiladi (devor, deraza, eshik, tom, fasad); obodonlashtirish 28,6 s dan
    this.clipY.constant = clipH;
    const showYard = t >= 28.6;
    this.rectLocal.forEach((pl, i) => {
      if (showYard) this.rectWorld[i].set(new THREE.Vector3(0, 1, 0), 1e6);
      else this.rectWorld[i].copy(pl).applyMatrix4(this.group.matrixWorld);
    });
    if (this.sprites) this.sprites.visible = t >= 28.8;

    // iskala: karkas bilan birga o‘sadi, 24–28 s yuqoridan pastga olib tashlanadi
    const scafTop = t < 7 ? 0 : t < 18 ? builtTop + 0.12 : t < 24 ? H + 0.1 : lerp(H + 0.1, 0, sm(24, 27.8, t));
    const sH = Math.max(0, scafTop - 0.07);
    for (let i = 0; i < this.poles.items.length; i++) {
      this.poles.items[i].sy = Math.max(0.001, sH);
      this.poles.set(i, sH > 0.01 ? 1 : 0);
    }
    this.poles.done();
    for (let i = 0; i < this.planks.items.length; i++) this.planks.set(i, this.planks.items[i].y < scafTop - 0.02 ? 1 : 0);
    this.planks.done();
    for (let i = 0; i < this.nets.items.length; i++) {
      this.nets.items[i].sy = Math.max(0.001, sH * 0.92);
      this.nets.set(i, sH > 0.05 ? 1 : 0);
    }
    this.nets.done();

    // materiallar: 0,6–4 s keladi; ichkaridagilar karkasdan oldin ketadi; 18–28 s ishlatilgan sari kamayadi
    this.stacks.forEach(({ inst, inner }, si) => {
      const arrive = sm(0.6 + si * 0.35, 1.2 + si * 0.35, t);
      const leave = inner ? 1 - sm(5.2, 6, t) : 1 - sm(18 + si * 1.1, 19 + si * 1.1, t);
      const layers = inst.items.length - 1;
      inst.set(0, arrive * (inner ? leave : 1 - sm(27.8, 28.4, t)));
      for (let l = 0; l < layers; l++) inst.set(l + 1, arrive * (leave > (l + 0.5) / layers ? 1 : 0));
      inst.done();
    });
    if (this.cabin) {
      this.cabin.visible = t > 0.8 && t < 29.2;
      this.cabin.scale.setScalar(sm(0.8, 1.5, t) * (1 - sm(28.6, 29.2, t)) || 0.0001);
    }
    // kran: 3–6 s o‘rnatiladi, 6–27,6 s yuk tashiydi, 28–29,4 s yig‘ib olinadi
    if (this.crane) this.crane.update(t, builtTop, clipH, H);
    void fh;
  }

  dispose() {
    for (const m of this.clones) m.dispose();
    this.clones = [];
    this.group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
    this.group.removeFromParent();
  }
}

/** Minora krani: taglik, minora, aylanuvchi qism, strela, qarshi og‘irlik, aravacha, tros, ilgak va yuk. */
class Crane {
  readonly group = new THREE.Group();
  private slew = new THREE.Group();
  private trolley: THREE.Mesh;
  private cable: THREE.Mesh;
  private hook = new THREE.Group();
  private load: THREE.Group;
  private jibY: number;
  private cycle = 4.3;

  constructor(private x: number, private z: number, mastH: number, private reach: number, private pick: { x: number; z: number }, private core: { x0: number; x1: number; z0: number; z1: number }) {
    const g = this.group;
    g.position.set(x, 0, z);
    const add = (parent: THREE.Object3D, mat: THREE.Material, sx: number, sy: number, sz: number, px: number, py: number, pz: number, geo = unitBox) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(px, py, pz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // taglik (beton bloklar)
    add(g, M.concrete, 0.3, 0.06, 0.3, 0, 0.06, 0);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, M.concrete, 0.1, 0.05, 0.1, a * 0.1, 0.12, b * 0.1);
    // minora: to‘rt ustun va panjara
    const w = 0.045;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, M.crane, 0.012, mastH, 0.012, a * w, 0.12, b * w);
    const levels = Math.max(3, Math.round(mastH / 0.12));
    for (let i = 0; i <= levels; i++) {
      const y = 0.12 + (mastH * i) / levels;
      add(g, M.crane, w * 2, 0.008, 0.008, 0, y, w); add(g, M.crane, w * 2, 0.008, 0.008, 0, y, -w);
      add(g, M.crane, 0.008, 0.008, w * 2, w, y, 0); add(g, M.crane, 0.008, 0.008, w * 2, -w, y, 0);
    }
    this.jibY = 0.12 + mastH; // guruh y = 0, shuning uchun lokal = dunyo balandligi
    // aylanuvchi qism
    this.slew.position.y = this.jibY;
    g.add(this.slew);
    add(this.slew, M.craneDark, 0.13, 0.04, 0.13, 0, 0, 0);
    add(this.slew, M.cabin, 0.08, 0.07, 0.07, 0.02, 0.04, 0.08);
    add(this.slew, M.cabinGlass, 0.004, 0.05, 0.06, 0.062, 0.05, 0.08);
    // apex va tortqichlar
    add(this.slew, M.crane, 0.02, 0.22, 0.02, 0, 0.04, 0);
    const L = this.reach;
    // strela (ikki ustki-pastki tasma va diagonal)
    add(this.slew, M.crane, L, 0.012, 0.012, L / 2, 0.06, 0.025);
    add(this.slew, M.crane, L, 0.012, 0.012, L / 2, 0.06, -0.025);
    add(this.slew, M.crane, L, 0.012, 0.012, L / 2, 0.11, 0);
    const nd = Math.max(4, Math.round(L / 0.12));
    for (let i = 0; i < nd; i++) {
      const m = add(this.slew, M.crane, 0.006, 0.065, 0.006, (i + 0.5) * (L / nd), 0.055, 0);
      m.rotation.z = i % 2 ? 0.7 : -0.7;
    }
    // qarshi strela va og‘irlik
    add(this.slew, M.crane, 0.38, 0.014, 0.05, -0.19, 0.06, 0);
    add(this.slew, M.concrete, 0.1, 0.1, 0.08, -0.33, 0.0, 0);
    // tortqichlar (apexdan strela uchiga va orqaga)
    const tie = (tx: number) => {
      // apex uchidan (0; 0,26) strela/qarshi strela nuqtasiga (tx; 0,12)
      const dx = tx, dy = 0.12 - 0.26;
      const m = new THREE.Mesh(unitBoxC, M.cable);
      m.scale.set(Math.hypot(dx, dy), 0.004, 0.004);
      m.position.set(dx / 2, 0.26 + dy / 2, 0);
      m.rotation.z = Math.atan2(dy, dx);
      this.slew.add(m);
    };
    tie(L * 0.7);
    tie(-0.3);
    // aravacha, tros, ilgak, yuk
    this.trolley = add(this.slew, M.craneDark, 0.05, 0.025, 0.06, 0.5, 0.035, 0);
    this.cable = add(this.slew, M.cable, 0.005, 1, 0.005, 0.5, 0.035, 0);
    this.slew.add(this.hook);
    add(this.hook, M.hazard, 0.04, 0.03, 0.03, 0, 0, 0);
    add(this.hook, M.craneDark, 0.01, 0.03, 0.01, 0, -0.03, 0);
    this.load = new THREE.Group();
    add(this.load, M.pallet, 0.12, 0.015, 0.1, 0, -0.07, 0);
    add(this.load, M.brick, 0.1, 0.06, 0.08, 0, -0.055, 0);
    this.hook.add(this.load);
  }

  /** t — 30 s shkalasi; builtTop — karkas balandligi; clipH — devor ochilgan balandlik. */
  update(t: number, builtTop: number, clipH: number, H: number) {
    const setup = sm(3, 6, t), gone = sm(28, 29.4, t);
    this.group.visible = t > 3 && gone < 1;
    this.group.scale.set(1, Math.max(0.001, setup * (1 - gone)), 1);
    // qutb koordinatalari (kran markazidan)
    const pAng = Math.atan2(this.pick.z - this.z, this.pick.x - this.x);
    const pR = Math.max(0.25, Math.hypot(this.pick.x - this.x, this.pick.z - this.z));
    const working = t >= 6 && t < 27.6;
    const top = Math.max(builtTop, clipH, 0.15);
    const safe = Math.min(this.jibY - 0.12, Math.max(H, top) + 0.3); // xavfsiz balandlik: bino ustidan
    let ang = pAng, r = pR, hookY = safe, loaded = false;
    if (working) {
      const k = Math.floor((t - 6) / this.cycle);
      const u = ((t - 6) % this.cycle) / this.cycle;
      // maqsad: asosiy hajm ustida, har siklda boshqa nuqta
      const c = this.core;
      const fx = [0.3, 0.7, 0.5, 0.25, 0.75][k % 5], fz = [0.4, 0.6, 0.3, 0.7, 0.5][k % 5];
      const tx = lerp(c.x0, c.x1, fx), tz = lerp(c.z0, c.z1, fz);
      const tAng = Math.atan2(tz - this.z, tx - this.x);
      const tR = Math.max(0.25, Math.min(this.reach - 0.05, Math.hypot(tx - this.x, tz - this.z)));
      const tY = Math.max(top, 0.15) + 0.1; // yuk qurilgan qismning ustiga tushadi (ichidan o‘tmaydi)
      const groundY = 0.19;
      let d = tAng - pAng;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (u < 0.14) { hookY = lerp(safe, groundY, sm(0, 0.14, u)); }
      else if (u < 0.2) { hookY = groundY; loaded = u > 0.17; }
      else if (u < 0.34) { hookY = lerp(groundY, safe, sm(0.2, 0.34, u)); loaded = true; }
      else if (u < 0.58) { const s = sm(0.34, 0.58, u); ang = pAng + d * s; r = lerp(pR, tR, s); loaded = true; }
      else if (u < 0.72) { ang = tAng; r = tR; hookY = lerp(safe, tY, sm(0.58, 0.72, u)); loaded = true; }
      else if (u < 0.78) { ang = tAng; r = tR; hookY = tY; loaded = u < 0.75; }
      else if (u < 0.88) { ang = tAng; r = tR; hookY = lerp(tY, safe, sm(0.78, 0.88, u)); }
      else { const s = sm(0.88, 1, u); ang = tAng - d * s; r = lerp(tR, pR, s); }
    }
    // lokal: strela +X bo‘yicha; aylanish Y atrofida (three: +X → (cos, -sin) z ga — shuning uchun -ang)
    this.slew.rotation.y = -ang;
    const yLocal = hookY - this.jibY; // slew koordinatasida (manfiy)
    this.trolley.position.x = r;
    this.hook.position.set(r, yLocal + 0.03, 0);
    const len = Math.max(0.01, 0.035 - (yLocal + 0.045));
    this.cable.position.set(r, yLocal + 0.045, 0);
    this.cable.scale.y = len;
    this.load.visible = loaded;
  }
}
