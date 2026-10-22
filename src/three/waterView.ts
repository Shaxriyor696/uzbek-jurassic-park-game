import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAND_MAX, LAND_MIN, WORLD_ORIGIN } from '../game/grid';
import { CORE_WATER_BODIES, natureNoise, waterBox, waterDepth, type TerrainField } from '../game/terrain';
import { blob } from './builder';
import { waterTexture } from './textures';

/**
 * Tabiiy ko‘l va soylar ko‘rinishi. Chegara TerrainField.waterDepthAt dan (qurilish/dinozavr to‘sig‘i bilan bir
 * manba). Har bir havzalar to‘dasi uchun bitta tekis sirt: tiniq sayozlik (tubidagi toshchalar ko‘rinadi), chuqur
 * ko‘k o‘rta, ho‘l qum qirg‘oq va o‘tga silliq o‘tish; ustida harakatlanuvchi to‘lqin qatlami. Qirg‘oqda yumaloq
 * toshlar va qamish to‘dalari (instanslangan).
 */
const PX = 10; // katakka piksel
const TILE = 24; // bo‘lak (katak)

const hex = (h: string) => new THREE.Color(h);
const DEEP = hex('#1d6db3');
const MID = hex('#2c9bd0');
const SHALLOW = hex('#59cfc8');
const CLEAR = hex('#b9d9a6');
const SAND_WET = hex('#cdb47c');
const SAND = hex('#e0cd98');
const GRASS = hex('#9cb84c');

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

let reedGeo: THREE.BufferGeometry | null = null;
/** Qamish/o‘t to‘dasi: ingichka, egilgan barglar (yashil → sarg‘ish uch) */
function reeds() {
  if (reedGeo) return reedGeo;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + hash(i, 3) * 0.6;
    const h = 0.22 + hash(i, 7) * 0.2;
    const w = 0.018 + hash(i, 9) * 0.01;
    const lean = 0.05 + hash(i, 11) * 0.1;
    const g = new THREE.BufferGeometry();
    // barg: pastda eni w, uchi ingichka, yon tomonga egilgan
    const ox = Math.cos(a) * 0.04, oz = Math.sin(a) * 0.04;
    const lx = Math.cos(a) * lean, lz = Math.sin(a) * lean;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const pos = [
      ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + lx * 0.45 + px * 0.6, h * 0.55, oz + lz * 0.45 + pz * 0.6,
      ox - px, 0, oz - pz, ox + lx * 0.45 + px * 0.6, h * 0.55, oz + lz * 0.45 + pz * 0.6, ox + lx * 0.45 - px * 0.6, h * 0.55, oz + lz * 0.45 - pz * 0.6,
      ox + lx * 0.45 - px * 0.6, h * 0.55, oz + lz * 0.45 - pz * 0.6, ox + lx * 0.45 + px * 0.6, h * 0.55, oz + lz * 0.45 + pz * 0.6, ox + lx, h, oz + lz,
    ];
    const base = new THREE.Color('#5d8f34'), tip = new THREE.Color(i % 3 === 0 ? '#c9b85a' : '#9cc153');
    const col: number[] = [];
    for (let k = 0; k < 9; k++) {
      const y = pos[k * 3 + 1] / h;
      const c = base.clone().lerp(tip, y);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    parts.push(g);
  }
  reedGeo = mergeGeometries(parts, false)!;
  reedGeo.computeVertexNormals();
  return reedGeo;
}

export interface WaterView {
  group: THREE.Group;
  bodies: number;
  tiles: number;
  update(t: number): void;
  dispose(): void;
}

export function createWaterView(field: TerrainField, isFree: (x: number, z: number) => boolean = () => true): WaterView {
  const group = new THREE.Group();
  group.name = 'natural-water';
  // asl daryo/hovuz/ko‘l ham tabiiy shaklda; yangi soylar ularga qo‘shiladi (bir sirtda)
  const waters = [...CORE_WATER_BODIES, ...(field.state.waters ?? [])];
  // Butun yer TILE×TILE katakli bo‘laklarga bo‘linadi: suv tegadigan har bo‘lakka bitta sirt (uzun irmoq tarmog‘i
  // uchun ulkan rasm kerak emas; chegaralarda chuqurlik bir xil funksiyadan — choksiz)
  const boxed = waters.map((w) => ({ w, b: waterBox(w, 1.2) }));
  const tiles: { x0: number; z0: number; x1: number; z1: number; list: typeof boxed }[] = [];
  for (let tz = LAND_MIN; tz <= LAND_MAX; tz += TILE) {
    for (let tx = LAND_MIN; tx <= LAND_MAX; tx += TILE) {
      const list = boxed.filter(({ b }) => b.x0 < tx + TILE && b.x1 > tx && b.z0 < tz + TILE && b.z1 > tz);
      if (list.length) tiles.push({ x0: tx, z0: tz, x1: Math.min(LAND_MAX + 1, tx + TILE), z1: Math.min(LAND_MAX + 1, tz + TILE), list });
    }
  }
  const textures: THREE.Texture[] = [];
  const ripples: THREE.Texture[] = [];
  const stones: THREE.Matrix4[] = [], stoneCols: THREE.Color[] = [];
  const tufts: THREE.Matrix4[] = [];
  const tmp = new THREE.Color();

  for (const tile of tiles) {
    const { x0, z0, x1, z1, list } = tile;
    const W = (x1 - x0) * PX, H = (z1 - z0) * PX;
    const depth = (px: number, pz: number) => {
      let d = -Infinity;
      for (const { w, b } of list) if (px >= b.x0 && px <= b.x1 && pz >= b.z0 && pz <= b.z1) d = Math.max(d, waterDepth(w, px, pz));
      return d;
    };
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    const maskC = document.createElement('canvas');
    maskC.width = W; maskC.height = H;
    const mctx = maskC.getContext('2d')!;
    const mimg = mctx.createImageData(W, H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const px = x0 + (i + 0.5) / PX, pz = z0 + (j + 0.5) / PX;
        const d = depth(px, pz);
        const k = (j * W + i) * 4;
        let a = 0;
        if (d > 0) {
          const n = natureNoise(px * 1.3, pz * 1.3, 77);
          tmp.copy(SHALLOW).lerp(MID, smooth(0.25, 1.1, d)).lerp(DEEP, smooth(1.0, 2.6, d));
          // juda sayoz chet — tiniq, tubi (qum/o‘t) ko‘rinadi
          tmp.lerp(CLEAR, (1 - smooth(0, 0.35, d)) * 0.55);
          // sayozlikdagi tub toshchalari
          if (d < 1.1) {
            const gx = Math.floor(px * 3.2), gz = Math.floor(pz * 3.2);
            const cx = (gx + 0.5 + (hash(gx, gz) - 0.5) * 0.6) / 3.2, cz = (gz + 0.5 + (hash(gz, gx) - 0.5) * 0.6) / 3.2;
            const rr = 0.07 + hash(gx * 3, gz) * 0.06;
            if (hash(gx, gz * 7) < 0.55 && Math.hypot(px - cx, pz - cz) < rr) tmp.lerp(hash(gx, gz) < 0.5 ? CLEAR : SHALLOW, 0.35 * (1 - smooth(0.4, 1.1, d)));
          }
          tmp.multiplyScalar(0.94 + n * 0.12);
          a = 1;
          mimg.data[k] = mimg.data[k + 1] = mimg.data[k + 2] = Math.round(255 * smooth(0, 0.5, d));
          mimg.data[k + 3] = 255;
        } else if (d > -0.34) {
          tmp.copy(SAND_WET).lerp(SAND, smooth(-0.08, -0.3, d) * 0.8 + hash(Math.floor(px * 8), Math.floor(pz * 8)) * 0.15);
          a = 1;
        } else if (d > -1.0) {
          // o‘tga silliq o‘tish (yer teksturasi ostidan ko‘rinadi)
          tmp.copy(GRASS).lerp(SAND, 1 - smooth(-0.6, -0.34, d));
          a = smooth(-1.0, -0.4, d);
        }
        img.data[k] = Math.round(Math.min(1, tmp.r) * 255);
        img.data[k + 1] = Math.round(Math.min(1, tmp.g) * 255);
        img.data[k + 2] = Math.round(Math.min(1, tmp.b) * 255);
        img.data[k + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    mctx.putImageData(mimg, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mask = new THREE.CanvasTexture(maskC);
    textures.push(tex, mask);
    const w = x1 - x0, h = z1 - z0;
    const geo = new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);
    // PlaneGeometry UV: v=1 yuqorida (−z) — kanvas qatori j=0 ham −z tomonda
    const surf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false, roughness: 0.32, metalness: 0.02,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    tex.flipY = false;
    // yo‘l (0.03) va bino poydevoridan past, yerdan biroz yuqori
    surf.position.set(x0 + w / 2 - WORLD_ORIGIN, 0.008, z0 + h / 2 - WORLD_ORIGIN);
    surf.receiveShadow = true;
    surf.renderOrder = 1;
    surf.name = 'lake';
    // UV: kanvas (0,0) — chap-yuqori (x0, z0)
    const uv = geo.attributes.uv as THREE.BufferAttribute, pos = geo.attributes.position as THREE.BufferAttribute;
    for (let q = 0; q < uv.count; q++) uv.setXY(q, (pos.getX(q) + w / 2) / w, (pos.getZ(q) + h / 2) / h);
    group.add(surf);
    // harakatlanuvchi to‘lqin yaltirashi (faqat suv ustida — mask)
    // to‘lqin teksturasi dunyo masshtabida (~3 katakka bir takror); alphaMap o‘z transformi bilan 0..1 da qoladi
    const ripple = waterTexture().clone();
    ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
    ripple.repeat.set(w / 3, h / 3);
    ripple.needsUpdate = true;
    ripples.push(ripple);
    textures.push(ripple);
    const rip = new THREE.Mesh(geo.clone(), new THREE.MeshStandardMaterial({
      map: ripple, alphaMap: mask, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.08, metalness: 0.1,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    }));
    mask.flipY = false;
    rip.position.copy(surf.position).setY(0.012);
    rip.renderOrder = 2;
    rip.name = 'lake-ripple';
    group.add(rip);

    // qirg‘oq: toshlar va qamishlar
    for (let z = z0; z < z1; z += 0.33) {
      for (let x = x0; x < x1; x += 0.33) {
        const px = x + hash(x * 3, z) * 0.33, pz = z + hash(z * 5, x) * 0.33;
        const d = depth(px, pz);
        const r = hash(px * 7.7, pz * 3.3);
        if (!isFree(Math.floor(px), Math.floor(pz))) continue; // bino/yo‘l ustida bezak yo‘q
        if (d > -0.42 && d < 0.04 && r < 0.14) {
          const s = 0.7 + hash(px, pz * 9) * 1.3;
          stones.push(new THREE.Matrix4().compose(new THREE.Vector3(px - WORLD_ORIGIN, 0.01, pz - WORLD_ORIGIN),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r * 40, 0)), new THREE.Vector3(s * 1.2, s * 0.75, s)));
          stoneCols.push(new THREE.Color().setHSL(0.09, 0.06, 0.58 + hash(pz, px) * 0.2));
        } else if (d > -0.8 && d < -0.05 && r > 0.9 - 0.35 * natureNoise(px * 0.4, pz * 0.4, 5)) {
          const s = 0.8 + hash(px * 2, pz) * 0.7;
          tufts.push(new THREE.Matrix4().compose(new THREE.Vector3(px - WORLD_ORIGIN, 0, pz - WORLD_ORIGIN),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r * 30, 0)), new THREE.Vector3(s, s, s)));
        }
      }
    }
  }
  if (stones.length) {
    const sg = blob(0.08, 2, 1);
    const sm = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), stones.length);
    stones.forEach((m, i) => { sm.setMatrixAt(i, m); sm.setColorAt(i, stoneCols[i]); });
    sm.computeBoundingSphere();
    sm.castShadow = false;
    sm.receiveShadow = true;
    sm.name = 'shore-stones';
    group.add(sm);
  }
  if (tufts.length) {
    const tm = new THREE.InstancedMesh(reeds(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), tufts.length);
    tufts.forEach((m, i) => tm.setMatrixAt(i, m));
    tm.computeBoundingSphere();
    tm.castShadow = false;
    tm.name = 'shore-reeds';
    group.add(tm);
  }

  return {
    group,
    bodies: waters.length,
    tiles: tiles.length,
    update(t: number) {
      for (const r of ripples) r.offset.set((t * 0.01) % 1, (t * 0.006) % 1);
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
        if (o instanceof THREE.Mesh) {
          if (o.geometry !== reedGeo) o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      for (const t of textures) t.dispose();
      group.clear();
    },
  };
}
