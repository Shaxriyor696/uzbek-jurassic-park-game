import * as THREE from 'three';
import { inBounds, LAND_MAX, LAND_MIN, MAP_MAX, MAP_MIN, WORLD_ORIGIN } from '../game/grid';
import { BUILD_MAX_H, natureNoise, snowLine, type Mountain, type TerrainField } from '../game/terrain';
import { spriteGroup, type SpriteKind, type SpriteSpot } from './sprites';
import { grassTexture } from './textures';

/**
 * Tog‘larning 3D ko‘rinishi — haqiqiy hajmli balandlik meshlari (billboard yoki fon rasmi emas).
 * Balandlik TerrainField.heightAt dan (qurilish/dinozavr to‘sig‘i bilan bir xil manba). Yer CHUNK×CHUNK katakli
 * bo‘laklarga bo‘lingan: har bo‘lak alohida mesh (kamera ko‘rmasa chizilmaydi), faqat relyefli kataklar
 * uchburchaklanadi. Material umumiy. Daraxtlar — o‘yindagi rasmli (PNG dan qirqilgan) tabiiy daraxtlar, tur bo‘yicha
 * InstancedMesh (burchakli 3D konuslar emas).
 * Tog‘lar statik — har kadrda hech narsa qayta hisoblanmaydi.
 */
const CHUNK = 20;
/** Katakka nechta bo‘lak (0.5 katak qadam — collision namunalari bilan aynan bir xil nuqtalar) */
const SUB = 2;

const c = (hex: string) => new THREE.Color(hex);
const ROCK: Record<Mountain['kind'], THREE.Color> = {
  rocky: c('#8a8073'),
  snowy: c('#7d848c'),
  pine: c('#7b7663'),
  valley: c('#918670'),
};
const SNOW = c('#f3f6fa');
const FOREST_TINT = c('#c7dcb6');
const OUTER_TINT = c('#f4f8ec');
const WHITE = c('#ffffff');

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Kichik deterministik shovqin (rang tebranishi uchun) */
const jitter = (x: number, z: number) => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

let sharedMat: THREE.MeshStandardMaterial | null = null;
/** Umumiy material: o‘t qismida yer bilan aynan bir xil o‘t teksturasi; qoya/qorda tekstura o‘chadi (grass atributi). */
function terrainMaterial() {
  if (sharedMat) return sharedMat;
  const m = new THREE.MeshStandardMaterial({ map: grassTexture(), vertexColors: true, roughness: 1 });
  // etakda yer bilan bir tekislikda — z-fighting bo‘lmasin, relyef ustun chiqsin
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -2;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float grass;\nattribute vec3 gtint;\nvarying float vGrass;\nvarying vec3 vTint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrass = grass;\nvTint = gtint;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGrass;\nvarying vec3 vTint;')
      // o‘t: yer bilan bir xil tekstura × o‘t tusi; qoya/qor: vertex rangi (oraliqda ochiq «halqa» chiqmasin)
      .replace('#include <map_fragment>', `vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  diffuseColor.rgb *= mix( vColor.rgb, sampledDiffuseColor.rgb * vTint, vGrass );`)
      .replace('#include <color_fragment>', '');
  };
  m.customProgramCacheKey = () => 'boyota-terrain-2';
  sharedMat = m;
  return m;
}

export interface TerrainView {
  group: THREE.Group;
  /** Sichqoncha nurini relyefga urib, katak koordinatasini beradi (tog‘ ko‘rinsa — uning ustidagi katak) */
  meshes: THREE.Mesh[];
  stats: { chunks: number; triangles: number; trees: number };
  dispose(): void;
}

export function createTerrainView(field: TerrainField): TerrainView {
  const group = new THREE.Group();
  group.name = 'terrain';
  const meshes: THREE.Mesh[] = [];
  const stats = { chunks: 0, triangles: 0, trees: 0 };
  const material = terrainMaterial();
  const treeSpots: SpriteSpot[] = [];
  const eps = 0.25;
  const tmpC = new THREE.Color();

  for (let cz = LAND_MIN; cz <= LAND_MAX; cz += CHUNK) {
    for (let cx = LAND_MIN; cx <= LAND_MAX; cx += CHUNK) {
      const x1 = Math.min(LAND_MAX + 1, cx + CHUNK), z1 = Math.min(LAND_MAX + 1, cz + CHUNK);
      // bo‘lakda relyefli katak bormi
      const cells: [number, number][] = [];
      for (let z = cz; z < z1; z++) for (let x = cx; x < x1; x++) if (field.cellHeight(x, z) > BUILD_MAX_H) cells.push([x, z]);
      if (!cells.length) continue;
      const nx = (x1 - cx) * SUB + 1, nz = (z1 - cz) * SUB + 1;
      const pos = new Float32Array(nx * nz * 3);
      const nor = new Float32Array(nx * nz * 3);
      const col = new Float32Array(nx * nz * 3);
      const uv = new Float32Array(nx * nz * 2);
      const grass = new Float32Array(nx * nz);
      const gtint = new Float32Array(nx * nz * 3);
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const px = cx + i / SUB, pz = cz + j / SUB;
          const h = field.heightAt(px, pz);
          const k = j * nx + i;
          const wx = px - WORLD_ORIGIN, wz = pz - WORLD_ORIGIN;
          pos[k * 3] = wx; pos[k * 3 + 1] = h; pos[k * 3 + 2] = wz;
          uv[k * 2] = wx / 4; uv[k * 2 + 1] = wz / 4; // yer kvadratlari bilan bir xil UV — o‘t teksturasi uzluksiz
          // normal — markaziy ayirma (bo‘laklar chegarasida ham bir xil, chok ko‘rinmaydi)
          const gx = (field.heightAt(px + eps, pz) - field.heightAt(px - eps, pz)) / (2 * eps);
          const gz = (field.heightAt(px, pz + eps) - field.heightAt(px, pz - eps)) / (2 * eps);
          const n = new THREE.Vector3(-gx, 1, -gz).normalize();
          nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z;
          const slope = Math.hypot(gx, gz);
          const m = field.dominant(px, pz);
          const base = inBounds(Math.floor(px), Math.floor(pz)) ? WHITE : OUTER_TINT;
          let g = 1;
          tmpC.copy(base);
          let tint = base;
          if (m) {
            const rel = h / m.h;
            const soft = m.kind === 'pine' ? 0.5 : m.kind === 'valley' ? 0.4 : 0;
            // tik joy — qoya; baland alp qismi (qoyali va qorli tog‘larda) — yalang‘och
            g = 1 - smooth(0.55 + soft, 1.05 + soft, slope);
            if (m.kind === 'rocky' || m.kind === 'snowy') g *= 1 - smooth(0.45, 0.75, rel);
            // o‘rmonli qiyalik — biroz to‘qroq o‘t
            const forest = m.kind === 'pine' || m.kind === 'valley' ? smooth(0.6, 2.5, h) * (1 - smooth(0.7, 0.95, rel)) : 0;
            tint = base.clone().lerp(FOREST_TINT, forest * 0.8);
            tmpC.copy(ROCK[m.kind]).multiplyScalar(0.86 + jitter(px, pz) * 0.24 + Math.min(0.12, h * 0.006));
            // qor: qor chizig‘idan yuqorida; juda tik qoya devorlarida ushlanmaydi
            const snow = smooth(snowLine(m) - 0.6, snowLine(m) + 0.9, h + (jitter(pz, px) - 0.5) * 1.6) * (1 - smooth(2.6, 4, slope));
            if (snow > 0) { tmpC.lerp(SNOW, snow); g *= 1 - snow; }
          }
          col[k * 3] = tmpC.r; col[k * 3 + 1] = tmpC.g; col[k * 3 + 2] = tmpC.b;
          gtint[k * 3] = tint.r; gtint[k * 3 + 1] = tint.g; gtint[k * 3 + 2] = tint.b;
          grass[k] = g;
        }
      }
      const idx: number[] = [];
      for (const [x, z] of cells) {
        for (let sz = 0; sz < SUB; sz++) for (let sx = 0; sx < SUB; sx++) {
          const i = (x - cx) * SUB + sx, j = (z - cz) * SUB + sz;
          const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
          idx.push(a, d, b, b, d, e);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('grass', new THREE.BufferAttribute(grass, 1));
      geo.setAttribute('gtint', new THREE.BufferAttribute(gtint, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = 'mountain-chunk';
      mesh.receiveShadow = true; // soya faqat kamera atrofidagi yaqin hududda (scene.ts — soya kamerasi)
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      meshes.push(mesh);
      stats.chunks++;
      stats.triangles += idx.length / 3;

      // daraxtlar: o‘tli, yumshoq qiyalikda; qoya (tik) va qorda emas; to‘da-to‘da (shovqin bo‘yicha)
      for (const [x, z] of cells) {
        for (let t = 0; t < 2; t++) {
          const px = x + 0.1 + jitter(x * 1.3 + t * 7, z) * 0.8, pz = z + 0.1 + jitter(z * 2.3, x + t * 5) * 0.8;
          const m = field.dominant(px, pz);
          if (!m) continue;
          const h = field.heightAt(px, pz);
          const rel = h / m.h;
          const grove = natureNoise(px * 0.12, pz * 0.12, m.seed);
          const base = m.kind === 'pine' ? 0.75 : m.kind === 'valley' ? 0.55 : m.kind === 'rocky' ? (rel < 0.45 ? 0.3 : 0) : rel < 0.38 ? 0.35 : 0;
          const density = base * (0.35 + grove * 1.1);
          if (jitter(px * 3.7, pz * 1.9) >= density || h < 0.2 || h > snowLine(m) - 1.4) continue;
          const gx = (field.heightAt(px + eps, pz) - field.heightAt(px - eps, pz)) / (2 * eps);
          const gz = (field.heightAt(px, pz + eps) - field.heightAt(px, pz - eps)) / (2 * eps);
          if (Math.hypot(gx, gz) > 0.9) continue; // jarlik — daraxt yo‘q
          // tanasi yerga botib tursin (qiyalikda osilib qolmasin): atrofdagi eng past nuqta
          const y = Math.min(h, field.heightAt(px + 0.12, pz), field.heightAt(px - 0.12, pz), field.heightAt(px, pz + 0.12), field.heightAt(px, pz - 0.12)) - 0.04;
          // balandda — ignabargli (cypress), etakda — aralash
          const r = jitter(pz * 5.1, px * 2.7);
          const kind: SpriteKind = rel > 0.3 || r < 0.55 ? 'cypress' : r < 0.78 ? 'tree1' : 'tree2';
          treeSpots.push({ kind, x: px - WORLD_ORIGIN, y, z: pz - WORLD_ORIGIN, s: (kind === 'cypress' ? 1.5 : 1.25) + jitter(px * 3, pz * 5) * 0.7, shade: 0.72 + jitter(px, pz * 4) * 0.3, flip: r < 0.5 });
        }
      }
    }
  }
  if (treeSpots.length) {
    const trees = spriteGroup(treeSpots);
    trees.name = 'mountain-trees';
    trees.traverse((o) => { o.castShadow = false; });
    group.add(trees);
    stats.trees = treeSpots.length;
  }

  return {
    group,
    meshes,
    stats,
    dispose() {
      for (const ch of group.children) {
        // material va daraxt geometriyasi umumiy — faqat bo‘lak geometriyasi tozalanadi
        if (ch instanceof THREE.Mesh && !(ch instanceof THREE.InstancedMesh)) ch.geometry.dispose();
      }
      group.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
      group.clear();
    },
  };
}

/**
 * Xarita chekkasidan tashqaridagi tabiiy o‘rmon (rasmli daraxtlar, to‘da-to‘da). Qurish mumkin bo‘lgan xarita ichiga
 * tushmaydi; tog‘ kataklarida emas (ular uchun yuqoridagi tog‘ daraxtlari); `clear(x, z)` false bo‘lgan joyda
 * (dinozavr marshruti, kirish yo‘li, suv, mavjud obyektlar) ham yo‘q. Xaritadan uzoqlashgan sari zichroq.
 */
export function createForest(field: TerrainField, clear: (x: number, z: number) => boolean): { group: THREE.Group; count: number } {
  const spots: SpriteSpot[] = [];
  for (let z = LAND_MIN; z <= LAND_MAX; z++) {
    for (let x = LAND_MIN; x <= LAND_MAX; x++) {
      if (inBounds(x, z) || field.cellHeight(x, z) > BUILD_MAX_H || !clear(x, z)) continue;
      let wet = false; // ko‘l/soy va qirg‘og‘ida (2 katak) daraxt yo‘q
      for (let dz = -2; dz <= 2 && !wet; dz++) for (let dx = -2; dx <= 2 && !wet; dx++) wet = field.isWaterCell(x + dx, z + dz);
      if (wet) continue;
      const e = Math.max(MAP_MIN - x, x - MAP_MAX, MAP_MIN - z, z - MAP_MAX);
      const grove = natureNoise(x * 0.07, z * 0.07, 404);
      const density = (0.22 + 0.78 * smooth(0.3, 0.62, grove)) * (0.45 + 0.55 * smooth(1, 10, e));
      for (let t = 0; t < 2; t++) {
        const r = jitter(x * 1.91 + t * 13.1, z * 0.73 + t * 3.7);
        if (r >= density * (t === 0 ? 1 : 0.7)) continue;
        const px = x + 0.12 + jitter(x * 4.1 + t, z * 2.2) * 0.76, pz = z + 0.12 + jitter(z * 3.3, x * 1.7 + t) * 0.76;
        const k = jitter(px * 7.3, pz * 5.9);
        const kind: SpriteKind = k < 0.38 ? 'tree1' : k < 0.68 ? 'tree2' : k < 0.87 ? 'cypress' : k < 0.885 ? 'blossom' : 'bush';
        const s = (kind === 'bush' ? 1.1 : 1.05) + jitter(px * 2.9, pz * 6.1) * 0.7;
        spots.push({ kind, x: px - WORLD_ORIGIN, y: 0, z: pz - WORLD_ORIGIN, s, shade: 0.74 + jitter(pz * 1.3, px * 8.1) * 0.28, flip: k * 10 % 1 < 0.5 });
      }
    }
  }
  const group = spriteGroup(spots);
  group.name = 'edge-forest';
  return { group, count: spots.length };
}
