import * as THREE from 'three';
import { pieceForMask, type RoadShape, N, E, S, W } from '../game/roadNetwork';
import { Builder, C, mat } from './builder';
import { asphaltTexture, pavingTexture } from './textures';

const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92 });
const pavingMat = new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.85 });

/**
 * Yo‘l bo‘laklari: bitmask → shakl (yakun, to‘g‘ri, burilish, T, chorraha) → kanonik mesh + burilish.
 * Uslub: G039 (to‘g‘ri yo‘l), G013 (chorraha), G038 (T chorraha) — asfalt, oq chiziqlar, piyodalar yo‘lagi.
 */
const CANON_MASK: Record<RoadShape, number> = {
  isolated: 0, end: S, straight: N | S, corner: N | E, t: N | E | S, cross: N | E | S | W,
};

const SW = 0.17; // piyodalar yo‘lagi eni
const ROAD_H = 0.03;
const WALK_H = 0.055;

function buildTile(shape: RoadShape): THREE.Group {
  const mask = CANON_MASK[shape];
  const b = new Builder();
  const asphalt = asphaltMat;
  const walk = pavingMat;
  const curb = mat(C.curb);
  const white = mat('#f4f4f0', { rough: 0.6 });
  b.box(1, ROAD_H, 1, asphalt, 0, 0, 0);
  const sides: [number, number, number][] = [
    [N, 0, -0.5 + SW / 2],
    [E, 0.5 - SW / 2, 0],
    [S, 0, 0.5 - SW / 2],
    [W, -0.5 + SW / 2, 0],
  ];
  // yopiq tomonlarda piyodalar yo‘lagi, burchaklarda doim
  for (const [bit, x, z] of sides) {
    if (mask & bit) continue;
    const alongX = bit === N || bit === S;
    b.box(alongX ? 1 : SW, WALK_H, alongX ? SW : 1, walk, x, 0, z);
    b.box(alongX ? 1 : 0.02, WALK_H + 0.004, alongX ? 0.02 : 1, curb, alongX ? 0 : x + (bit === E ? -SW / 2 : SW / 2), 0, alongX ? z + (bit === S ? -SW / 2 : SW / 2) : 0);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(SW, WALK_H, SW, walk, sx * (0.5 - SW / 2), 0, sz * (0.5 - SW / 2));

  const open = [N, E, S, W].filter((bit) => mask & bit).length;
  const dashY = ROAD_H;
  if (open >= 3) {
    // chorrahada piyodalar o‘tish joyi (zebra)
    for (const [bit] of sides) {
      if (!(mask & bit)) continue;
      const alongX = bit === N || bit === S;
      const off = 0.5 - SW - 0.06;
      for (let i = -2; i <= 2; i++) {
        const t = i * 0.1;
        if (alongX) b.box(0.05, 0.004, 0.1, white, t, dashY, bit === N ? -off : off);
        else b.box(0.1, 0.004, 0.05, white, bit === E ? off : -off, dashY, t);
      }
    }
  } else {
    for (const [bit] of sides) {
      if (!(mask & bit)) continue;
      const alongX = bit === E || bit === W;
      const sgn = bit === E || bit === S ? 1 : -1;
      for (const d of [0.12, 0.36]) {
        if (alongX) b.box(0.14, 0.004, 0.028, white, sgn * d, dashY, 0);
        else b.box(0.028, 0.004, 0.14, white, 0, dashY, sgn * d);
      }
    }
  }
  // chekka oq chiziqlar (Togri_yol.png dagi kabi)
  if (shape === 'straight') for (const sx of [-1, 1]) b.box(0.018, 0.004, 1, white, sx * (0.5 - SW - 0.035), dashY, 0);
  // chiroq ustuni (to‘g‘ri yo‘lda)
  if (shape === 'straight') b.lamp(0.5 - SW / 2, 0);
  if (shape === 'end' || shape === 'isolated') b.bush(0, -0.5 + SW / 2, 0.8);
  return b.build();
}

const templates = new Map<RoadShape, THREE.Group>();

export function roadMesh(mask: number): THREE.Object3D {
  const piece = pieceForMask(mask);
  let t = templates.get(piece.shape);
  if (!t) {
    t = buildTile(piece.shape);
    templates.set(piece.shape, t);
  }
  const g = t.clone();
  g.rotation.y = -piece.rotation * (Math.PI / 2);
  g.userData.roadShape = piece.shape;
  return g;
}

/** Kirish ko‘prigi uchun qo‘shimchalar (daryo ustidagi kataklar). */
let bridgeTpl: THREE.Group | null = null;
export function bridgeExtras(): THREE.Object3D {
  if (!bridgeTpl) {
    const b = new Builder();
    b.box(1, 0.16, 1, mat(C.concrete), 0, -0.16, 0);
    b.box(0.25, 0.3, 0.25, mat(C.stone), 0, -0.45, 0);
    for (const z of [-0.49, 0.49]) {
      b.box(1, 0.1, 0.03, mat(C.white), 0, WALK_H, z);
      for (const x of [-0.45, 0, 0.45]) b.box(0.05, 0.16, 0.05, mat(C.stone), x, WALK_H, z);
    }
    bridgeTpl = b.build();
  }
  return bridgeTpl.clone();
}
