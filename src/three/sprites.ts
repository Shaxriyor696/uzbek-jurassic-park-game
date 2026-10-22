import * as THREE from 'three';

/**
 * Rasmli daraxtlar (billboard). Daraxt tasvirlari foydalanuvchi bergan PNG lardan qirqib olingan
 * (Shahar_qismlari/Togri_yol.png, Daraxtzor.png → public/assets/derived/sprites). Har bir daraxt
 * ekranga doim yuzi bilan turadigan to‘rtburchak; soya xaritasida esa quyoshga qaraydi, shuning
 * uchun yerga dumaloq daraxt soyasi tushadi.
 */
export type SpriteKind = 'tree1' | 'tree2' | 'blossom' | 'cypress' | 'bush';

const KINDS: Record<SpriteKind, { aspect: number; height: number }> = {
  tree1: { aspect: 0.809, height: 0.85 },
  tree2: { aspect: 0.814, height: 0.85 },
  blossom: { aspect: 0.809, height: 0.8 },
  cypress: { aspect: 0.325, height: 0.8 },
  bush: { aspect: 1.277, height: 0.26 },
};

export const SPRITE_KINDS = Object.keys(KINDS) as SpriteKind[];

const loader = new THREE.TextureLoader();
const textures = new Map<SpriteKind, THREE.Texture>();
const materials = new Map<SpriteKind, { color: THREE.MeshBasicMaterial; depth: THREE.MeshDepthMaterial }>();

function texture(kind: SpriteKind) {
  let t = textures.get(kind);
  if (!t) {
    t = loader.load(import.meta.env.BASE_URL + 'assets/derived/sprites/' + kind + '.png');
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures.set(kind, t);
  }
  return t;
}

/** Instans markazini kamera fazosiga o‘tkazib, to‘rtburchakni ekran tekisligida yoyadi. */
function billboard(shader: { vertexShader: string }) {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `
    vec4 mvPosition = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
      float bbSx = instanceMatrix[0].x < 0.0 ? -length(instanceMatrix[0].xyz) : length(instanceMatrix[0].xyz);
      float bbSy = length(instanceMatrix[1].xyz);
    #else
      float bbSx = 1.0;
      float bbSy = 1.0;
    #endif
    mvPosition = modelViewMatrix * mvPosition;
    mvPosition.xy += vec2(position.x * bbSx, position.y * bbSy);
    gl_Position = projectionMatrix * mvPosition;
    `,
  );
}

function spriteMaterials(kind: SpriteKind) {
  let m = materials.get(kind);
  if (!m) {
    const map = texture(kind);
    const color = new THREE.MeshBasicMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide });
    color.alphaToCoverage = true;
    color.onBeforeCompile = billboard;
    color.customProgramCacheKey = () => 'billboard';
    const depth = new THREE.MeshDepthMaterial({ map, alphaTest: 0.45, depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = billboard;
    depth.customProgramCacheKey = () => 'billboard-depth';
    m = { color, depth };
    materials.set(kind, m);
  }
  return m;
}

const geoCache = new Map<SpriteKind, THREE.PlaneGeometry>();
function quad(kind: SpriteKind) {
  let g = geoCache.get(kind);
  if (!g) {
    const k = KINDS[kind];
    g = new THREE.PlaneGeometry(k.height * k.aspect, k.height);
    g.translate(0, k.height / 2 - 0.01, 0);
    geoCache.set(kind, g);
  }
  return g;
}

export interface SpriteSpot {
  kind: SpriteKind;
  x: number;
  y: number;
  z: number;
  s: number;
  /** 1 = asl rang; <1 — to‘qroq (xilma-xillik uchun) */
  shade?: number;
  flip?: boolean;
}

/** Bir nechta daraxtni tur bo‘yicha InstancedMesh larga yig‘adi. */
export function spriteGroup(spots: SpriteSpot[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sprites';
  for (const kind of SPRITE_KINDS) {
    const list = spots.filter((s) => s.kind === kind);
    if (!list.length) continue;
    const { color, depth } = spriteMaterials(kind);
    const mesh = new THREE.InstancedMesh(quad(kind), color, list.length);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    list.forEach((s, i) => {
      m.makeScale(s.flip ? -s.s : s.s, s.s, s.s);
      m.setPosition(s.x, s.y, s.z);
      mesh.setMatrixAt(i, m);
      const v = s.shade ?? 1;
      mesh.setColorAt(i, c.setRGB(v, v, v));
    });
    mesh.userData.spots = list;
    g.add(mesh);
  }
  return g;
}

/** Instansni yashirish/ko‘rsatish (bezak daraxtlari band katakda yashiriladi). */
export function setSpriteVisible(mesh: THREE.InstancedMesh, i: number, visible: boolean) {
  const s = (mesh.userData.spots as SpriteSpot[])[i];
  const m = new THREE.Matrix4();
  if (visible) {
    m.makeScale(s.flip ? -s.s : s.s, s.s, s.s);
    m.setPosition(s.x, s.y, s.z);
  } else m.makeScale(0, 0, 0);
  mesh.setMatrixAt(i, m);
}
