import * as THREE from 'three';
import { ENTRY_CELL, inBounds, LAND_MAX, LAND_MIN, MAP_CONFIG, MAP_MAX, MAP_MIN, MAP_SIZE, WORLD_ORIGIN } from '../game/grid';
import { blob, Builder, mat } from './builder';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { grassTexture, waterTexture } from './textures';
import { setSpriteVisible, spriteGroup, type SpriteKind, type SpriteSpot } from './sprites';

/** Dunyo = katak − HALF (grid.ts dagi WORLD_ORIGIN; asl xarita markazi dunyo (0,0) da) */
export const HALF = WORLD_ORIGIN;
/** Bezak joyi indeksi (butun yer bo‘yicha) va unga teskari */
const LAND_W = LAND_MAX - LAND_MIN + 1;
const landIndex = (x: number, z: number) => (z - LAND_MIN) * LAND_W + (x - LAND_MIN);
const cellX = (i: number) => (i % LAND_W) + LAND_MIN;
const cellZ = (i: number) => Math.floor(i / LAND_W) + LAND_MIN;

/** Yer hamma joyda; suvlar (asl daryo/hovuz/ko‘l ham) — waterView dagi tabiiy shakldagi sirt */
function waterAt(_x: number, _z: number) {
  return false;
}

function quad(x0: number, z0: number, x1: number, z1: number, y: number, uvScale: number) {
  // 1 katakli bo‘laklar: qo‘shni kvadratlar bilan cho‘qqilar mos tushadi (T-birikma yorig‘idan suv chizig‘i ko‘rinmaydi)
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.round(x1 - x0)), Math.max(1, Math.round(z1 - z0)));
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / uvScale, pos.getZ(i) / uvScale);
  return g;
}

export interface Environment {
  group: THREE.Group;
  water: THREE.Mesh;
  grid: THREE.LineSegments;
  update(t: number): void;
  /** Band kataklardagi bezak (daraxt, gul, tosh)ni yashiradi. */
  setOccupied(isFree: (x: number, z: number) => boolean): void;
}

export function createEnvironment(): Environment {
  const group = new THREE.Group();

  // Yer: suv bo‘lmagan kataklar
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 });
  const outerMat = new THREE.MeshStandardMaterial({ map: grassTexture(), color: '#f4f8ec', roughness: 1 });
  const inner = new Builder();
  const outer = new Builder();
  // xarita ichi — har katak alohida (suv kataklari tushib qoladi); tashqarisi (suvsiz) — 4 ta katta to‘rtburchak
  for (let z = MAP_MIN; z <= MAP_MAX; z++) {
    for (let x = MAP_MIN; x <= MAP_MAX; x++) {
      if (waterAt(x, z)) continue;
      inner.add(quad(x - HALF, z - HALF, x + 1 - HALF, z + 1 - HALF, 0, 4), grassMat);
    }
  }
  const L0 = LAND_MIN - HALF, L1 = LAND_MAX + 1 - HALF, M0 = MAP_MIN - HALF, M1 = MAP_MAX + 1 - HALF;
  outer.add(quad(L0, L0, L1, M0, 0, 4), outerMat);
  outer.add(quad(L0, M1, L1, L1, 0, 4), outerMat);
  outer.add(quad(L0, M0, M0, M1, 0, 4), outerMat);
  outer.add(quad(M1, M0, L1, M1, 0, 4), outerMat);
  const ground = inner.build();
  const outerGround = outer.build();
  for (const m of [ground, outerGround]) m.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
  ground.name = 'ground';
  group.add(ground, outerGround);
  // Yer chegarasidan nari ufqqacha o‘tloq (tuman ichida yo‘qoladi) — keng ko‘rinishda yer cheti «uzilmaydi»
  const skirtTex = grassTexture().clone();
  skirtTex.repeat.set(250, 250);
  skirtTex.needsUpdate = true;
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ map: skirtTex, color: '#f4f8ec', roughness: 1 }));
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -0.14;
  skirt.receiveShadow = false;
  skirt.name = 'horizon';
  group.add(skirt);

  // Suv tekisligi (barcha yer ostida; faqat suv kataklarida ko‘rinadi)
  const wtex = waterTexture();
  wtex.repeat.set(MAP_SIZE * 0.36, MAP_SIZE * 0.36);
  const water = new THREE.Mesh(
    // faqat xarita ostida (suv kataklari faqat xarita ichida) — tashqarida yer ostidan suv ko‘rinmaydi
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
    new THREE.MeshStandardMaterial({ map: wtex, color: '#ffffff', roughness: 0.08, metalness: 0.05 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((MAP_MIN + MAP_MAX + 1) / 2 - HALF, -0.1, (MAP_MIN + MAP_MAX + 1) / 2 - HALF);
  water.receiveShadow = true;
  water.visible = false; // eski to‘rtburchak suv o‘rniga tabiiy sirt (waterView)
  water.name = 'water';
  group.add(water);

  // Tabiiy bezak: daraxtlar, gul to‘plamlari, toshlar (instanced). Xarita ichidagilari katak band bo‘lsa yashiriladi.
  // Xarita ichida bezak daraxt yo‘q (0); xarita tashqarisida birinchi OUTER_CLEAR katak ochiq, undan nari siyrak.
  const EDGE_TREE_BAND = 0;
  const OUTER_CLEAR = MAP_CONFIG.landMargin + 1; // butun tashqi o‘tloq daraxtsiz — tog‘lardagi qarag‘aylar terrainView da
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const treeSpots: (SpriteSpot & { cell: number })[] = [];
  const flowerGeo = flowerPatchGeometry();
  const rockGeo = blob(0.09, 3, 1);
  rockGeo.scale(1.3, 0.7, 1);
  rockGeo.translate(0, 0.03, 0);
  type Spot = { m: THREE.Matrix4; color: THREE.Color; cell: number };
  const kinds: Spot[][] = [[], [], [], [], [], []]; // 3 xil daraxt, qarag‘ay, gul, tosh
  const pushSpot = (k: number, x: number, z: number, s: number, cell: number, color?: THREE.Color) => {
    kinds[k].push({
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(x, 0, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0)),
        new THREE.Vector3(s, s, s),
      ),
      color: color ?? new THREE.Color(1, 1, 1),
      cell,
    });
  };
  for (let z = LAND_MIN; z <= LAND_MAX; z++) {
    for (let x = LAND_MIN; x <= LAND_MAX; x++) {
      const inMap = inBounds(x, z);
      if (waterAt(x, z)) continue;
      if (Math.abs(z - ENTRY_CELL.z) <= 0 && x < 2) continue;
      const cell = landIndex(x, z);
      const wx = x - HALF, wz = z - HALF;
      const r = rnd();
      const edge = Math.max(MAP_MIN - x, MAP_MIN - z, x - MAP_MAX, z - MAP_MAX, 0);
      // Xarita ichida daraxtlar faqat chekka tasmada (EDGE_TREE_BAND katak) — o‘rta qurilish hududi ochiq qoladi.
      const inner = Math.min(x - MAP_MIN, z - MAP_MIN, MAP_MAX - x, MAP_MAX - z);
      const density = inMap ? (inner < EDGE_TREE_BAND ? 0.3 : 0) : edge < OUTER_CLEAR ? 0 : 0.1;
      if (r < density) {
        const n = inMap || edge >= 10 ? 1 : 1 + Math.floor(rnd() * 2);
        for (let i = 0; i < n; i++) {
          const s = 0.9 + rnd() * 0.6;
          const pine = rnd() < 0.12;
          const blossom = !pine && rnd() < 0.08;
          const kind: SpriteKind = pine ? 'cypress' : blossom ? 'blossom' : rnd() < 0.5 ? 'tree1' : 'tree2';
          treeSpots.push({ kind, x: wx + 0.22 + rnd() * 0.56, y: 0, z: wz + 0.22 + rnd() * 0.56, s, shade: 0.8 + rnd() * 0.22, flip: rnd() < 0.5, cell });
        }
      } else if (r < density + 0.07) {
        pushSpot(4, wx + 0.5, wz + 0.5, 0.8 + rnd() * 0.5, cell);
      } else if (r < density + 0.1) {
        pushSpot(5, wx + 0.2 + rnd() * 0.6, wz + 0.2 + rnd() * 0.6, 0.7 + rnd() * 0.8, cell, new THREE.Color().setHSL(0.1, 0.05, 0.75 + rnd() * 0.15));
      }
    }
  }
  const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const rockMat = mat('#c9c2b4', { rough: 0.9 });
  const geos = [null, null, null, null, flowerGeo, rockGeo];
  const decor: { mesh: THREE.InstancedMesh; spots: Spot[] }[] = [];
  kinds.forEach((spots, k) => {
    if (!spots.length || !geos[k]) return;
    const mesh = new THREE.InstancedMesh(geos[k]!, k === 5 ? rockMat : vcMat, spots.length);
    spots.forEach((sp, i) => { mesh.setMatrixAt(i, sp.m); mesh.setColorAt(i, sp.color); });
    mesh.castShadow = k !== 4;
    mesh.receiveShadow = true;
    mesh.name = 'decor';
    decor.push({ mesh, spots });
    group.add(mesh);
  });
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const trees = spriteGroup(treeSpots);
  group.add(trees);

  // Shahar kirishi — faqat daryo ustidagi ko‘prik (yo‘l obyekti); g‘arbga cho‘zilgan bezak yo‘l yo‘q

  // To‘r chiziqlari (qurilish rejimida ko‘rinadi)
  const pts: number[] = [];
  const g0 = MAP_MIN - HALF, g1 = MAP_MAX + 1 - HALF;
  for (let i = MAP_MIN; i <= MAP_MAX + 1; i++) {
    pts.push(i - HALF, 0.012, g0, i - HALF, 0.012, g1);
    pts.push(g0, 0.012, i - HALF, g1, 0.012, i - HALF);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28 }));
  grid.visible = false;
  group.add(grid);
  // doimiy, juda xira to‘r (G001 dagi bo‘sh maydon kabi)
  const faintGrid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, depthWrite: false }));
  group.add(faintGrid);

  return {
    group, water, grid,
    update(t: number) {
      wtex.offset.set((t * 0.004) % 1, (t * 0.0025) % 1);
    },
    setOccupied(isFree) {
      for (const { mesh, spots } of decor) {
        let changed = false;
        spots.forEach((sp, i) => {
          if (sp.cell < 0) return;
          const free = isFree(cellX(sp.cell), cellZ(sp.cell));
          mesh.setMatrixAt(i, free ? sp.m : zero);
          changed = true;
        });
        if (changed) mesh.instanceMatrix.needsUpdate = true;
      }
      for (const ch of trees.children) {
        const mesh = ch as THREE.InstancedMesh;
        const spots = mesh.userData.spots as { cell: number }[];
        spots.forEach((sp, i) => {
          if (sp.cell < 0) return;
          setSpriteVisible(mesh, i, isFree(cellX(sp.cell), cellZ(sp.cell)));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

function colorize(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.index) g = g.toNonIndexed();
  return g;
}

function prep(g: THREE.BufferGeometry, hex: string, x: number, y: number, z: number) {
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  return colorize(g, hex);
}

/** Yovvoyi gullar to‘plami (G001 dagi sariq/pushti/oq gullar). */
function flowerPatchGeometry() {
  const cols = ['#f2c94c', '#f4a7c6', '#ffffff', '#e86a6a', '#c9a7f0'];
  const parts: THREE.BufferGeometry[] = [];
  let sd = 9;
  const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4; i++) {
    const g = blob(0.07, i, 1);
    g.scale(1.3, 0.6, 1.3);
    parts.push(prep(g, '#5f9a42', (r() - 0.5) * 0.5, 0.03, (r() - 0.5) * 0.5));
  }
  for (let i = 0; i < 18; i++) {
    parts.push(prep(new THREE.IcosahedronGeometry(0.022, 0), cols[i % cols.length], (r() - 0.5) * 0.55, 0.07 + r() * 0.03, (r() - 0.5) * 0.55));
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
}
