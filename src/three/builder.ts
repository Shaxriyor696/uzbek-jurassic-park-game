import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { spriteGroup, type SpriteSpot } from './sprites';
import { facadeImage, facadeTexture, latticeTexture, roofTexture, stuccoTexture, windowGlassTexture, type FacadeStyle } from './textures';

/** Daraxt palitralari (G001: to‘q va och yashil, pushti gullagan). */
let treeCounter = 0;

/** Silliq, biroz notekis «yaproq to‘pi» — ikosaedr + shovqin, silliq normallar. Kesh qilinadi. */
const blobCache = new Map<string, THREE.BufferGeometry>();
export function blob(r: number, seed: number, detail = 2): THREE.BufferGeometry {
  const key = r.toFixed(3) + ':' + (seed % 5) + ':' + detail;
  let base = blobCache.get(key);
  if (!base) {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.attributes.position as THREE.BufferAttribute;
    const k = (seed % 5) * 1.7;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.09 * Math.sin(x * 23 + k) * Math.cos(z * 19 - k) + 0.06 * Math.sin(y * 29 + k * 2);
      p.setXYZ(i, x * n, y * n * 0.92, z * n);
    }
    g.computeVertexNormals();
    base = g;
    blobCache.set(key, base);
  }
  return base.clone();
}

/** Umumiy materiallar (reuse). */
const matCache = new Map<string, THREE.Material>();

export function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string } = {}): THREE.MeshStandardMaterial {
  const key = `c:${color}:${opts.rough ?? 0.85}:${opts.metal ?? 0}:${opts.emissive ?? ''}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0 });
    if (opts.emissive) {
      m.emissive.set(opts.emissive);
      m.emissiveIntensity = 0.5;
    }
    matCache.set(key, m);
  }
  return m;
}

export function facadeMat(style: FacadeStyle): THREE.MeshStandardMaterial {
  const key = 'f:' + style;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const glassy = style === 'glass' || style === 'glassDark';
    m = new THREE.MeshStandardMaterial({ map: facadeTexture(style), roughness: glassy ? 0.25 : 0.8, metalness: glassy ? 0.35 : 0.02 });
    matCache.set(key, m);
  }
  return m;
}

/** Cherepitsali tom materiali (rang saqlanadi, tekstura qatorlar beradi). */
function roofMat(m: Mat): Mat {
  const src = m as THREE.MeshStandardMaterial;
  if (!src.color || src.map) return m;
  const key = 'roof:' + src.color.getHexString();
  let r = matCache.get(key);
  if (!r) {
    const t = roofTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(4, 3);
    r = new THREE.MeshStandardMaterial({ color: src.color, map: t, roughness: 0.75 });
    matCache.set(key, r);
  }
  return r;
}

/** Rasmdan kesilgan fasad materiali. repeat=[u,v] berilsa tekstura takrorlanadi. */
export function photoMat(name: string, repeat?: [number, number], opts: { rough?: number; metal?: number } = {}): THREE.MeshStandardMaterial {
  const key = 'photo:' + name + ':' + (repeat ? repeat.join('x') : '') + ':' + (opts.rough ?? '') + (opts.metal ?? '');
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    let map = facadeImage(name, !!repeat);
    if (repeat) {
      map = map.clone();
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeat[0], repeat[1]);
      map.needsUpdate = true;
    }
    m = new THREE.MeshStandardMaterial({ map, roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0.08 });
    matCache.set(key, m);
  }
  return m;
}

/** Devor materiali: shtukatura teksturasi + rang. */
export function wallMat(color: string): THREE.MeshStandardMaterial {
  const key = 'wall:' + color;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const t = stuccoTexture();
    t.repeat.set(3, 3);
    m = new THREE.MeshStandardMaterial({ map: t, color, roughness: 0.88 });
    matCache.set(key, m);
  }
  return m;
}

/** Deraza oynasi materiali (iliq ichki yorug‘lik yoki sovuq osmon aksi). */
export function glassMat(warm = true): THREE.MeshStandardMaterial {
  const key = 'glass:' + warm;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: windowGlassTexture(warm), roughness: 0.12, metalness: 0.25 });
    if (warm) {
      m.emissive.set('#3a2408');
      m.emissiveIntensity = 0.35;
    }
    matCache.set(key, m);
  }
  return m;
}

export interface Opening { face: 'front' | 'back' | 'left' | 'right'; at: number; width: number }

export interface BuildingOpts {
  wall: string;
  floors: number;
  /** derazalar orasidagi masofa */
  bay?: number;
  winW?: number;
  winH?: number;
  /** deraza ramkasi rangi */
  frame?: string;
  warm?: boolean;
  /** pastki tasma (sokol) rangi; null — yo‘q */
  plinth?: string | null;
  /** tepa karniz rangi; null — yo‘q */
  cornice?: string | null;
  /** deraza ochilmaydigan joylar (eshik, garaj) */
  skip?: Opening[];
  /** qaysi tomonlarda deraza bor */
  faces?: Opening['face'][];
  /** ramka o‘rtasida krest */
  muntin?: boolean;
  /** deraza osti tokchasi */
  sill?: boolean;
  /** tom yuzasi (flat roof); null — qo‘yilmaydi */
  roof?: string | null;
  /** birinchi qavat derazalari balandroq (do‘kon vitrinasi kabi) */
  groundWinH?: number;
}

export function latticeMat(): THREE.MeshStandardMaterial {
  const key = 'lattice';
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: latticeTexture(), roughness: 0.75 });
    matCache.set(key, m);
  }
  return m;
}

/** Palitra — BoyOta namunalaridan (G001/G002, alohida obyekt PNGlari) olingan ranglar. */
export const C = {
  cream: '#efe4cf', creamDark: '#d8c7a6', white: '#f7f5f0', stone: '#d6cfc0', concrete: '#c4c0b8',
  slate: '#4b5568', slateLight: '#5f6b80', terracotta: '#c96a3f', blueRoof: '#55667f',
  glass: '#5b93c8', glassDark: '#2f5d88', frame: '#ffffff', door: '#7a4e2d', doorDark: '#5b3a22',
  grass: '#7fb84e', lawn: '#8cc45a', hedge: '#4c8a37', foliage: '#5c9b3d', foliageLight: '#74b34a',
  blossom: '#eaa5c8', flowerRed: '#e05a5a', flowerYellow: '#f2c94c', trunk: '#7a5536',
  asphalt: '#50545b', sidewalk: '#dcd5c5', curb: '#bfb7a6', paving: '#e6dfd0',
  red: '#d2433a', orange: '#e27a2c', blue: '#2f74c9', navy: '#1d3557', yellow: '#f3c432',
  tank: '#eef1f4', metal: '#9aa3ad', darkMetal: '#5d636b', water: '#3aa6dc', court: '#c8573e', field: '#3f9d4b',
};

type Mat = THREE.Material;

/**
 * Model quruvchi: geometriyalarni material bo‘yicha birlashtiradi (har modelda bir nechta draw call).
 * Barcha o‘lchamlar katakda (1 katak = 1 birlik = 10 m). Old tomon +Z.
 */
export class Builder {
  private parts = new Map<Mat, THREE.BufferGeometry[]>();
  /** Rasmli daraxtlar (billboard) — geometriya emas, alohida yig‘iladi. */
  private sprites: SpriteSpot[] = [];

  add(geo: THREE.BufferGeometry, m: Mat, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (geo.index) geo.dispose();
    const mtx = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(mtx);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    const list = this.parts.get(m) ?? [];
    list.push(g);
    this.parts.set(m, list);
    return this;
  }

  /** Pastki yuzasi y da turadigan quti. */
  box(w: number, h: number, d: number, m: Mat, x = 0, y = 0, z = 0, ry = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, ry);
  }

  cyl(rTop: number, rBot: number, h: number, m: Mat, x = 0, y = 0, z = 0, seg = 16) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), m, x, y + h / 2, z);
  }

  /** Fasad qutisi: yon tomonlarida qavat×oyna teksturasi. floorH — qavat balandligi, bay — oyna oralig‘i. */
  facade(w: number, h: number, d: number, style: FacadeStyle | Mat, x = 0, y = 0, z = 0, floorH = 0.3, bay = 0.3, ry = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const faceDims: [number, number][] = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      const [fw, fh] = faceDims[f];
      for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i;
        if (fw === 0) {
          uv.setXY(idx, 0.04, 0.04);
        } else {
          const nx = Math.max(1, Math.round(fw / bay));
          const ny = Math.max(1, Math.round(fh / floorH));
          uv.setXY(idx, uv.getX(idx) * nx, uv.getY(idx) * ny);
        }
      }
    }
    return this.add(geo, typeof style === 'string' ? facadeMat(style) : style, x, y + h / 2, z, ry);
  }

  /** Piramida (hip) tom. */
  hipRoof(w: number, d: number, h: number, m: Mat, x = 0, y = 0, z = 0) {
    const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.scale(w, h, d);
    this.box(w * 0.98, 0.035, d * 0.98, mat('#ece6da'), x, y - 0.01, z); // karniz (eaves)
    return this.add(geo, roofMat(m), x, y + h / 2, z);
  }

  /** Ikki nishabli (gable) tom; qirrasi X o‘qi bo‘ylab. */
  gableRoof(w: number, d: number, h: number, m: Mat, x = 0, y = 0, z = 0) {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.translate(0, 0, -w / 2);
    geo.rotateY(Math.PI / 2);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * 0.6);
    return this.add(geo, roofMat(m), x, y, z);
  }

  tree(x: number, z: number, s = 1, y = 0, blossom = false) {
    const v = treeCounter++;
    this.sprites.push({ kind: blossom ? 'blossom' : v % 2 ? 'tree1' : 'tree2', x, y, z, s: s * 1.05, shade: 0.86 + ((v * 37) % 15) / 100, flip: v % 3 === 0 });
    return this;
  }

  cypress(x: number, z: number, s = 1, y = 0) {
    this.sprites.push({ kind: 'cypress', x, y, z, s: s * 0.95, shade: 0.95 });
    treeCounter++;
    return this;
  }

  bush(x: number, z: number, s = 1, color = C.hedge, y = 0.02) {
    const v = treeCounter++;
    if (color === C.hedge) {
      this.sprites.push({ kind: 'bush', x, y, z, s: s * 0.7, shade: 0.85 + (v % 3) * 0.05, flip: v % 2 === 0 });
      return this;
    }
    const g = blob(0.08 * s, v);
    g.scale(1, 0.8, 1);
    return this.add(g, mat(color, { rough: 0.95 }), x, 0.07 * s, z);
  }

  /** Yumaloq qirrali quti (qo‘pol burchaklarsiz). */
  rbox(w: number, h: number, d: number, m: Mat, x = 0, y = 0, z = 0, r = 0.03, ry = 0) {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    return this.add(new RoundedBoxGeometry(w, h, d, 2, Math.max(0.002, rr)), m, x, y + h / 2, z, ry);
  }

  hedgeRow(x: number, z: number, len: number, alongX: boolean) {
    return this.rbox(alongX ? len : 0.09, 0.11, alongX ? 0.09 : len, mat(C.hedge, { rough: 0.95 }), x, 0.03, z, 0.04);
  }

  /** Klassik qora fonar ustuni (Togri_yol.png, Bog.png dagi kabi). */
  lamp(x: number, z: number) {
    const black = mat('#1f2226', { rough: 0.45, metal: 0.5 });
    const gold = mat('#b88a3e', { rough: 0.4, metal: 0.6 });
    this.cyl(0.03, 0.036, 0.05, black, x, 0, z, 10);
    this.cyl(0.011, 0.016, 0.4, black, x, 0.05, z, 10);
    this.cyl(0.018, 0.018, 0.01, gold, x, 0.24, z, 10);
    this.cyl(0.03, 0.02, 0.02, black, x, 0.45, z, 10);
    this.add(new THREE.CylinderGeometry(0.026, 0.02, 0.06, 6), mat('#ffd98a', { emissive: '#ffc35a', rough: 0.3 }), x, 0.5, z);
    this.add(new THREE.ConeGeometry(0.036, 0.035, 6), black, x, 0.548, z);
    this.cyl(0.004, 0.004, 0.02, black, x, 0.565, z, 6);
    return this;
  }

  car(x: number, z: number, color: string, ry = 0) {
    const g = new Builder();
    g.rbox(0.14, 0.055, 0.27, mat(color, { rough: 0.35, metal: 0.2 }), 0, 0.02, 0, 0.022);
    g.rbox(0.12, 0.055, 0.15, mat('#33475c', { rough: 0.15, metal: 0.3 }), 0, 0.06, -0.015, 0.022);
    for (const wx of [-0.065, 0.065]) for (const wz of [-0.08, 0.08]) g.add(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 10), mat('#2a2a2a'), wx, 0.024, wz, 0, 0, Math.PI / 2);
    this.mergeFrom(g, x, z, ry);
    return this;
  }

  bench(x: number, z: number, ry = 0) {
    const g = new Builder();
    g.box(0.18, 0.02, 0.06, mat(C.door), 0, 0.05, 0);
    g.box(0.18, 0.05, 0.015, mat(C.door), 0, 0.07, -0.03);
    this.mergeFrom(g, x, z, ry);
    return this;
  }

  /**
   * Rasm fasadli quti: har bir yon tomonga rasmdan kesilgan fasad qo‘yiladi (old/orqa/chap/o‘ng).
   * Pastki yuzasi y da. uvRep — tekstura necha marta takrorlanadi (tomon bo‘yicha).
   */
  photoBox(w: number, h: number, d: number, faces: { front: Mat; back?: Mat; left?: Mat; right?: Mat }, roof: Mat | null, x = 0, y = 0, z = 0) {
    const side = faces.right ?? faces.front;
    const sides: [Mat, number, number, number, number][] = [
      [faces.front, w, 0, 0, d / 2],
      [faces.back ?? faces.front, w, Math.PI, 0, -d / 2],
      [side, d, Math.PI / 2, w / 2, 0],
      [faces.left ?? side, d, -Math.PI / 2, -w / 2, 0],
    ];
    for (const [m, pw, ry, px, pz] of sides) {
      const g = new THREE.PlaneGeometry(pw, h);
      this.add(g, m, x + px, y + h / 2, z + pz, ry);
    }
    if (roof) this.box(w + 0.02, 0.04, d + 0.02, roof, x, y + h - 0.02, z);
    return this;
  }

  /** Geometriyani guruhlari bo‘yicha bo‘lib, har guruhga o‘z materialini beradi (Extrude: 0 — qopqoq, 1 — yon devor). */
  addGroups(geo: THREE.BufferGeometry, mats: (Mat | null)[], x = 0, y = 0, z = 0, ry = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const grp of g.groups) {
      const m = mats[grp.materialIndex ?? 0];
      if (!m) continue;
      const part = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const a = g.attributes[name] as THREE.BufferAttribute | undefined;
        if (!a) continue;
        const arr = (a.array as Float32Array).slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize);
        part.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
      }
      this.add(part, m, x, y, z, ry);
    }
    geo.dispose();
    return this;
  }

  /** Yumaloq burchakli to‘rtburchak «tasma» (podium): faqat yon devorlari, ixtiyoriy tom. */
  roundedBand(w: number, d: number, r: number, h: number, sideMat: Mat, roof: Mat | null, x = 0, y = 0, z = 0) {
    const sh = new THREE.Shape();
    const hw = w / 2, hd = d / 2;
    sh.moveTo(-hw + r, -hd);
    sh.lineTo(hw - r, -hd); sh.quadraticCurveTo(hw, -hd, hw, -hd + r);
    sh.lineTo(hw, hd - r); sh.quadraticCurveTo(hw, hd, hw - r, hd);
    sh.lineTo(-hw + r, hd); sh.quadraticCurveTo(-hw, hd, -hw, hd - r);
    sh.lineTo(-hw, -hd + r); sh.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2); // shape XY → XZ, ekstruziya +Y
    // yon devor UV: u — perimetr bo‘ylab (dunyo birligida), v — 0..1 balandlik
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const side = geo.groups[1];
    if (side) {
      for (let i = side.start; i < side.start + side.count; i++) {
        const vi = geo.index ? geo.index.getX(i) : i;
        const px = pos.getX(vi), pz = pos.getZ(vi);
        const ang = Math.atan2(pz / hd, px / hw);
        uv.setXY(vi, ((ang + Math.PI) / (Math.PI * 2)) * (w + d) * 2, pos.getY(vi) / h);
      }
    }
    return this.addGroups(geo, [roof, sideMat], x, y, z);
  }

  /**
   * Me’moriy bino bloki: shtukatura devor, sokol, karniz va har tomonda haqiqiy 3D derazalar
   * (ramka, oyna, krest, tokcha). Kesik-qirqim rasm emas — har qanday burchakdan toza ko‘rinadi.
   * Old tomon +Z. y — pastki sath.
   */
  building(w: number, h: number, d: number, o: BuildingOpts, x = 0, y = 0, z = 0) {
    const wall = wallMat(o.wall);
    this.rbox(w, h, d, wall, x, y, z, 0.012);
    if (o.plinth !== null) this.rbox(w + 0.02, Math.min(0.06, h * 0.12), d + 0.02, mat(o.plinth ?? '#cdbfa6', { rough: 0.8 }), x, y, z, 0.008);
    if (o.cornice !== null) this.rbox(w + 0.04, 0.035, d + 0.04, mat(o.cornice ?? '#f6f2ea', { rough: 0.6 }), x, y + h - 0.035, z, 0.01);
    if (o.roof !== null && o.roof !== undefined) this.box(w - 0.02, 0.012, d - 0.02, mat(o.roof, { rough: 0.9 }), x, y + h - 0.003, z);
    const floors = Math.max(1, o.floors);
    const fh = h / floors;
    const bay = o.bay ?? 0.3;
    const ww = o.winW ?? 0.14;
    const wh = Math.min(o.winH ?? fh * 0.5, fh * 0.75);
    const frameM = mat(o.frame ?? '#ffffff', { rough: 0.5 });
    const glass = glassMat(o.warm ?? true);
    const sillM = mat('#efe9dc', { rough: 0.6 });
    const faces = o.faces ?? ['front', 'back', 'left', 'right'];
    for (const face of faces) {
      const len = face === 'front' || face === 'back' ? w : d;
      const n = Math.max(1, Math.floor((len - 0.08) / bay));
      const step = (len - 0.08) / n;
      for (let f = 0; f < floors; f++) {
        const isGround = f === 0 && o.groundWinH;
        const hh = isGround ? Math.min(o.groundWinH!, fh * 0.85) : wh;
        const cy = y + f * fh + (isGround ? 0.035 + hh / 2 + 0.01 : fh * 0.55);
        for (let i = 0; i < n; i++) {
          const t = -len / 2 + 0.04 + step * (i + 0.5);
          const cw = isGround ? Math.min(step * 0.8, ww * 2) : ww;
          if (f === 0 && o.skip?.some((s) => s.face === face && Math.abs(s.at - t) < s.width / 2 + cw / 2)) continue;
          this.windowAt(face, w, d, x, cy, z, t, cw, hh, frameM, glass, sillM, !!o.muntin && !isGround, o.sill !== false && !isGround);
        }
      }
    }
    return this;
  }

  /** Bitta deraza: tomon (face) va tomon bo‘ylab joy (t) bo‘yicha. */
  private windowAt(face: Opening['face'], w: number, d: number, x: number, cy: number, z: number, t: number, ww: number, wh: number, frameM: Mat, glass: Mat, sillM: Mat, muntin: boolean, sill: boolean) {
    // lokal: deraza XY tekisligida, normal +Z; keyin tomonga buriladi
    const ry = face === 'front' ? 0 : face === 'back' ? Math.PI : face === 'right' ? Math.PI / 2 : -Math.PI / 2;
    const off = face === 'front' || face === 'back' ? d / 2 : w / 2;
    const place = (lx: number, ly: number, lz: number) => {
      const c = Math.cos(ry), s = Math.sin(ry);
      return [x + lx * c + lz * s, ly, z - lx * s + lz * c] as const;
    };
    const fr = 0.014;
    let [px, py, pz] = place(t, cy, off + 0.004);
    this.add(new THREE.BoxGeometry(ww + fr * 2, wh + fr * 2, 0.012), frameM, px, py, pz, ry);
    // shisha ramka yuzasidan (0,010) aniq oldinda, panjara undan ham oldinda — chuqurlik «urishmasin» (z-fighting)
    [px, py, pz] = place(t, cy, off + 0.016);
    this.add(new THREE.PlaneGeometry(ww, wh), glass, px, py, pz, ry);
    if (muntin) {
      [px, py, pz] = place(t, cy, off + 0.02);
      this.add(new THREE.BoxGeometry(0.008, wh, 0.004), frameM, px, py, pz, ry);
      [px, py, pz] = place(t, cy + wh * 0.18, off + 0.02);
      this.add(new THREE.BoxGeometry(ww, 0.008, 0.004), frameM, px, py, pz, ry);
    }
    if (sill) {
      [px, py, pz] = place(t, cy - wh / 2 - fr - 0.006, off + 0.012);
      this.add(new THREE.BoxGeometry(ww + 0.05, 0.012, 0.03), sillM, px, py, pz, ry);
    }
  }

  /** Eshik: ramka + panel + dastak; face tomonida, t — tomon bo‘ylab joy. */
  doorOn(face: Opening['face'], w: number, d: number, x: number, y: number, z: number, t: number, dw = 0.14, dh = 0.26, color = '#7a4e2d', glassDoor = false) {
    const ry = face === 'front' ? 0 : face === 'back' ? Math.PI : face === 'right' ? Math.PI / 2 : -Math.PI / 2;
    const off = face === 'front' || face === 'back' ? d / 2 : w / 2;
    const c = Math.cos(ry), s = Math.sin(ry);
    const at = (lx: number, ly: number, lz: number) => [x + lx * c + lz * s, ly, z - lx * s + lz * c] as const;
    // ramka (old yuzasi devordan 0,013 da); eshik tekisligi undan 0,006 oldinda — bir tekislikda bo‘lsa
    // turli burchakdan qaraganda chuqurlik «urishadi» (z-fighting) va eshik chiziq-chiziq bo‘lib tuslanadi
    let p = at(t, y + dh / 2, off + 0.006);
    this.add(new THREE.BoxGeometry(dw + 0.04, dh + 0.03, 0.014), mat('#f3efe6', { rough: 0.5 }), p[0], p[1] + 0.008, p[2], ry);
    p = at(t, y + dh / 2, off + 0.019);
    this.add(new THREE.PlaneGeometry(dw, dh), glassDoor ? glassMat(true) : mat(color, { rough: 0.6 }), p[0], p[1], p[2], ry);
    if (!glassDoor) {
      p = at(t + dw * 0.32, y + dh * 0.48, off + 0.027);
      this.add(new THREE.SphereGeometry(0.008, 6, 4), mat('#d4b06a', { metal: 0.7, rough: 0.3 }), p[0], p[1], p[2], ry);
    } else {
      p = at(t, y + dh / 2, off + 0.023);
      this.add(new THREE.BoxGeometry(0.008, dh, 0.004), mat('#2b2f36'), p[0], p[1], p[2], ry);
    }
    return this;
  }

  /** Boshqa builder qismlarini siljitib/aylantirib qo‘shadi. */
  mergeFrom(other: Builder, x = 0, z = 0, ry = 0, y = 0) {
    for (const [m, list] of other.parts) {
      for (const g of list) this.add(g, m, x, y, z, ry);
    }
    const c = Math.cos(ry), sn = Math.sin(ry);
    for (const sp of other.sprites) this.sprites.push({ ...sp, x: x + sp.x * c + sp.z * sn, z: z - sp.x * sn + sp.z * c, y: y + sp.y });
    return this;
  }

  /** Material bo‘yicha birlashtirilgan Group. */
  build(): THREE.Group {
    const group = new THREE.Group();
    for (const [m, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    if (this.sprites.length) group.add(spriteGroup(this.sprites));
    this.sprites = [];
    return group;
  }
}
