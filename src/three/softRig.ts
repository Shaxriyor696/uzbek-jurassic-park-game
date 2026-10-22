import * as THREE from 'three';

/**
 * «Yumshoq rig» — skeleti yo‘q (bir yoki bir nechta oddiy mesh) modellar uchun protsedurali yurish. Yuklanganda
 * geometriyadan oyoqlar topiladi: eng past vertekslar (panjalar) yon va oldinga o‘q bo‘yicha guruhlanadi; har oyoq
 * ustida son (hip) va tizza bo‘g‘ini belgilanadi. Har vertekska oyoq raqami va og‘irlik yoziladi (son balandligidan
 * pastda 1, tana tomon silliq 0 ga). Yurishda vertekslar GPU shaderida bo‘g‘in atrofida buriladi (avval tizza, keyin
 * son). Model fayli o‘zgarmaydi; faqat xotiradagi geometriyaga atribut qo‘shiladi.
 */
export interface SoftRigSpec {
  legs: 2 | 4;
  /** Son va tizza balandligi (modelning to‘liq balandligiga nisbatan) */
  hipFrac: number;
  kneeFrac: number;
  /** Oyoq ustuni radiusi (panja guruhi radiusiga ko‘paytma) */
  colMul: number;
  fwd: [number, number, number];
  lateral: [number, number, number];
  /** Modelda ko‘rgazma tagligi bor (balandlikning shu ulushi) — u yashiriladi, panjalar uning ustidan qidiriladi */
  baseFrac?: number;
  /**
   * Pastki jag‘ (model fazosida, oldinga o‘q t va balandlik y bilan): bo‘g‘in nuqtasi, ajratuvchi chiziq qiyaligi.
   * Bo‘g‘indan oldinda va chiziqdan pastdagi vertekslar jag‘ hisoblanadi.
   */
  jaw?: { t: number; y: number; slope: number };
  /** Bosh-bo‘yin mintaqasi: t dan t+ramp gacha silliq, yMin dan yuqori; bo‘g‘in nuqtasi (t, y) */
  head?: { t: number; ramp: number; y: number; yMin: number };
}

export interface SoftLeg {
  hip: THREE.Vector3;
  knee: THREE.Vector3;
  foot: THREE.Vector3;
  /** Son → panja: oldinga tashkil etuvchi va uzunlik (model birligi) */
  f0: number;
  L: number;
  /** Juftlik fazasi */
  offset: number;
}

export interface SoftRig {
  legs: SoftLeg[];
  axis: THREE.Vector3;
  fwd: THREE.Vector3;
  footY: number;
  height: number;
  /** Shader uniformlari (barcha meshlar uchun bitta obyekt) */
  uniforms: {
    rigHip: { value: THREE.Vector3[] };
    rigKnee: { value: THREE.Vector3[] };
    rigHipAng: { value: number[] };
    rigKneeAng: { value: number[] };
    rigAxis: { value: THREE.Vector3 };
    rigUp: { value: THREE.Vector3 };
    rigHeadPivot: { value: THREE.Vector3 };
    rigHeadYaw: { value: number };
    rigHeadPitch: { value: number };
  };
  /** Tizza burilish ishorasi (panja orqaga bukilsin) */
  kneeSign: number;
  /** Jag‘ yopilish ishorasi */
  jawSign: number;
  /** Bosh ko‘tarilish ishorasi */
  pitchSign: number;
  meshes: THREE.Mesh[];
}

const SHADER_HEAD = `
attribute vec3 rigW;
attribute float rigH;
uniform vec3 rigHeadPivot;
uniform float rigHeadYaw;
uniform float rigHeadPitch;
uniform vec3 rigUp;
uniform vec3 rigHip[5];
uniform vec3 rigKnee[5];
uniform float rigHipAng[5];
uniform float rigKneeAng[5];
uniform vec3 rigAxis;
varying float vRigBase;
vec3 rigRotA(vec3 v, vec3 ax, float a) { float c = cos(a), s = sin(a); return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c); }
vec3 rigRot(vec3 v, float a) { return rigRotA(v, rigAxis, a); }
`;
// rigW: x — oyoq raqami (0..3; 4 — pastki jag‘; yo‘q bo‘lsa -1), y — son (jag‘) og‘irligi, z — tizza og‘irligi
const SHADER_POS = `
  vec3 transformed = vec3( position );
  int li = int(rigW.x + 0.5);
  // ko‘rgazma tagligi: joyida qoladi, fragmentda chizilmaydi (cho‘zilgan uchburchak bo‘lmasin)
  vRigBase = rigW.x < -1.5 ? 1.0 : 0.0;
  if (rigW.x > -0.5) {
    for (int i = 0; i < 5; i++) {
      if (i != li) continue;
      transformed = rigKnee[i] + rigRot(transformed - rigKnee[i], rigKneeAng[i] * rigW.z);
      transformed = rigHip[i] + rigRot(transformed - rigHip[i], rigHipAng[i] * rigW.y);
    }
  }
  // bosh-bo‘yin: avval tik o‘q atrofida (yon), keyin yon o‘q atrofida (tepa-past)
  if (rigH > 0.0) transformed = rigHeadPivot + rigRotA(rigRotA(transformed - rigHeadPivot, rigUp, rigHeadYaw * rigH), rigAxis, rigHeadPitch * rigH);
`;
const SHADER_NRM = `
  vec3 objectNormal = vec3( normal );
  if (rigW.x > -0.5) {
    int lj = int(rigW.x + 0.5);
    for (int i = 0; i < 5; i++) {
      if (i != lj) continue;
      objectNormal = rigRot(objectNormal, rigKneeAng[i] * rigW.z + rigHipAng[i] * rigW.y);
    }
  }
  if (rigH > 0.0) objectNormal = rigRotA(rigRotA(objectNormal, rigUp, rigHeadYaw * rigH), rigAxis, rigHeadPitch * rigH);
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3( tangent.xyz );
  #endif
`;

function patch(mat: THREE.Material, u: SoftRig['uniforms'], key: string) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SHADER_HEAD)
      .replace('#include <begin_vertex>', SHADER_POS)
      .replace('#include <beginnormal_vertex>', SHADER_NRM);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRigBase;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (vRigBase > 0.5) discard;');
  };
  mat.customProgramCacheKey = () => 'softrig-' + key;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Model (klon, identity transform bilan) uchun yumshoq rig quradi; topilmasa null */
export function buildSoftRig(model: THREE.Object3D, spec: SoftRigSpec, key: string): SoftRig | null {
  model.updateMatrixWorld(true);
  const fwd = new THREE.Vector3(...spec.fwd).normalize();
  const lat = new THREE.Vector3(...spec.lateral).normalize();
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  if (!meshes.length) return null;
  // model fazosidagi vertekslar (har meshning matritsasi bilan)
  const v = new THREE.Vector3();
  let yMin = Infinity, yMax = -Infinity;
  const sampleStep = (n: number) => Math.max(1, Math.floor(n / 60000));
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += sampleStep(p.count)) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); yMin = Math.min(yMin, v.y); yMax = Math.max(yMax, v.y); }
  }
  const H = yMax - yMin;
  // ko‘rgazma tagligi: eng pastki 1% qatlamning to‘rtburchagi (o‘lchab topilgan); panjalar shu taglik ustida
  let base: { x0: number; x1: number; z0: number; z1: number; top: number } | null = null;
  if (spec.baseFrac) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const m of meshes) {
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 2) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        if (v.y < yMin + H * 0.01) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
      }
    }
    const pad = H * 0.01;
    base = { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad, top: yMin + H * spec.baseFrac };
  }
  const inBase = (p: THREE.Vector3) => !!base && p.x > base.x0 && p.x < base.x1 && p.z > base.z0 && p.z < base.z1;
  const groundY = base ? base.top : yMin;
  // panjalar: yerdan (yoki taglikdan) 5% balandlik ichidagi vertekslar
  const feet: { f: number; l: number }[] = [];
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (base && (!inBase(v) || v.y < base.top + H * 0.003)) continue;
      if (v.y < groundY + H * 0.05) feet.push({ f: v.dot(fwd), l: v.dot(lat) });
    }
  }
  if (feet.length < 20) return null;
  const lMid = feet.reduce((s, q) => s + q.l, 0) / feet.length;
  const groups: { f: number; l: number }[][] = spec.legs === 2 ? [[], []] : [[], [], [], []];
  let fMid = 0;
  if (spec.legs === 4) {
    // oldingi/orqa: oldinga o‘q bo‘yicha 2 ta klaster (k-o‘rtacha)
    let a = Math.min(...feet.map((q) => q.f)), b = Math.max(...feet.map((q) => q.f));
    for (let it = 0; it < 10; it++) {
      let sa = 0, na = 0, sb = 0, nb = 0;
      for (const q of feet) { if (Math.abs(q.f - a) < Math.abs(q.f - b)) { sa += q.f; na++; } else { sb += q.f; nb++; } }
      a = na ? sa / na : a; b = nb ? sb / nb : b;
    }
    fMid = (a + b) / 2;
  }
  for (const q of feet) {
    const side = q.l < lMid ? 0 : 1;
    const gi = spec.legs === 2 ? side : (q.f > fMid ? 0 : 2) + side;
    groups[gi].push(q);
  }
  if (groups.some((g) => g.length < 5)) return null;
  const hipY = groundY + H * spec.hipFrac, kneeY = groundY + H * spec.kneeFrac;
  const legs: SoftLeg[] = [];
  const cols: { f: number; l: number; r: number }[] = [];
  groups.forEach((g, i) => {
    const f = g.reduce((s, q) => s + q.f, 0) / g.length, l = g.reduce((s, q) => s + q.l, 0) / g.length;
    const r = Math.max(...g.map((q) => Math.hypot(q.f - f, q.l - l))) * 0.7 + H * 0.02;
    cols.push({ f, l, r });
    const at = (y: number, lat2: number) => fwd.clone().multiplyScalar(f).add(lat.clone().multiplyScalar(lat2)).add(new THREE.Vector3(0, y, 0));
    // son bo‘g‘ini tana o‘rtasiga biroz yaqinroq
    const hip = at(hipY, lMid + (l - lMid) * 0.8), knee = at(kneeY, l), foot = at(groundY, l);
    const d = foot.clone().sub(hip);
    const offset = spec.legs === 2 ? (i === 0 ? 0 : 0.5) : [0, 0.5, 0.5, 0][i]; // diagonal juftlar (yurish)
    legs.push({ hip, knee, foot, f0: d.dot(fwd), L: Math.hypot(d.dot(fwd), d.y), offset });
  });
  // har verteksga oyoq va og‘irlik
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    const w = new Float32Array(p.count * 3);
    const hw = new Float32Array(p.count);
    const inv = new THREE.Matrix4().copy(m.matrixWorld);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(inv);
      w[i * 3] = -1;
      if (spec.head && !(base && v.y < base.top + H * 0.003 && inBase(v))) {
        hw[i] = smooth(spec.head.t, spec.head.t + spec.head.ramp, v.dot(fwd)) * smooth(spec.head.yMin - H * 0.02, spec.head.yMin, v.y);
      }
      // taglik (yuqori yuzasi bilan): yuqori yuzadan biroz yuqoriroqqacha
      if (base && v.y < base.top + H * 0.003 && inBase(v)) { w[i * 3] = -2; continue; }
      if (spec.jaw) {
        const t = v.dot(fwd), ysep = spec.jaw.y + spec.jaw.slope * (t - spec.jaw.t);
        const wj = smooth(spec.jaw.t - 0.004, spec.jaw.t + 0.02, t) * smooth(ysep + 0.004, ysep - 0.006, v.y);
        if (wj > 0.001) { w[i * 3] = 4; w[i * 3 + 1] = wj; w[i * 3 + 2] = 0; continue; }
      }
      if (v.y > hipY + H * 0.05) continue;
      const vf = v.dot(fwd), vl = v.dot(lat);
      let best = -1, bd = Infinity;
      cols.forEach((c, k) => {
        // ustun son tomon kengayadi (son tanaga qo‘shiladi)
        const rr = c.r * spec.colMul * (1 + 1.2 * smooth(kneeY, hipY, v.y));
        const dd = Math.hypot(vf - c.f, vl - c.l) / rr;
        if (dd < bd) { bd = dd; best = k; }
      });
      if (best < 0 || bd > 1) continue;
      const side = 1 - smooth(0.75, 1, bd);
      w[i * 3] = best;
      w[i * 3 + 1] = side * smooth(hipY + H * 0.05, hipY - H * 0.08, v.y);
      w[i * 3 + 2] = side * smooth(kneeY + H * 0.04, kneeY - H * 0.04, v.y);
    }
    m.geometry.setAttribute('rigW', new THREE.BufferAttribute(w, 3));
    m.geometry.setAttribute('rigH', new THREE.BufferAttribute(hw, 1));
  }
  // bo‘g‘inlar va o‘q mesh lokal fazosida (barcha meshlarning matritsasi bir xil deb tekshiramiz)
  const m0 = meshes[0].matrixWorld;
  if (!meshes.every((m) => m.matrixWorld.equals(m0))) return null;
  const toLocal = new THREE.Matrix4().copy(m0).invert();
  const rotLocal = new THREE.Matrix3().setFromMatrix4(toLocal);
  // jag‘ bo‘g‘ini (5-o‘rin): oldinga o‘q bo‘yicha t, balandlik y, tananing o‘rta chizig‘ida
  const hinge = spec.jaw ? fwd.clone().multiplyScalar(spec.jaw.t).add(lat.clone().multiplyScalar(lMid)).add(new THREE.Vector3(0, spec.jaw.y, 0)) : new THREE.Vector3();
  const uniforms: SoftRig['uniforms'] = {
    rigHip: { value: [0, 1, 2, 3].map((i) => (legs[i] ? legs[i].hip.clone().applyMatrix4(toLocal) : new THREE.Vector3())).concat([hinge.clone().applyMatrix4(toLocal)]) },
    rigKnee: { value: [0, 1, 2, 3, 4].map((i) => (legs[i] ? legs[i].knee.clone().applyMatrix4(toLocal) : new THREE.Vector3())) },
    rigHipAng: { value: [0, 0, 0, 0, 0] },
    rigKneeAng: { value: [0, 0, 0, 0, 0] },
    rigAxis: { value: lat.clone().applyMatrix3(rotLocal).normalize() },
    rigUp: { value: new THREE.Vector3(0, 1, 0).applyMatrix3(rotLocal).normalize() },
    rigHeadPivot: { value: spec.head ? fwd.clone().multiplyScalar(spec.head.t).add(lat.clone().multiplyScalar(lMid)).add(new THREE.Vector3(0, spec.head.y, 0)).applyMatrix4(toLocal) : new THREE.Vector3() },
    rigHeadYaw: { value: 0 },
    rigHeadPitch: { value: 0 },
  };
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const cl = mats.map((mt) => { const c = mt.clone(); patch(c, uniforms, key); return c; });
    m.material = Array.isArray(m.material) ? cl : cl[0];
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patch(depth, uniforms, key + '-depth');
    m.customDepthMaterial = depth;
    m.frustumCulled = false;
  }
  // tizza ishorasi: + burchakda panja orqaga ketsin (oyoq orqaga bukiladi)
  const l0 = legs[0];
  const rel = l0.foot.clone().sub(l0.knee).applyAxisAngle(lat, 0.3);
  const kneeSign = rel.dot(fwd) < l0.foot.clone().sub(l0.knee).dot(fwd) ? 1 : -1;
  // jag‘ ishorasi: + burchakda jag‘ uchi yuqoriga (og‘iz yopiladi)
  const tip = fwd.clone().multiplyScalar(0.1).add(new THREE.Vector3(0, -0.03, 0));
  const jawSign = tip.clone().applyAxisAngle(lat, 0.2).y > tip.y ? 1 : -1;
  // bosh ishorasi: + burchakda tumshuq yuqoriga
  const pitchSign = fwd.clone().applyAxisAngle(lat, 0.2).y > 0 ? 1 : -1;
  return { legs, axis: lat, fwd, footY: groundY, height: H, uniforms, kneeSign, jawSign, pitchSign, meshes };
}

/** Yurish pozasi: faza (s), amp 0..1. Qaytaradi: tananing pastga/yuqoriga siljishi (model birligi) */
export function softPose(r: SoftRig, phase: number, amp: number, g: { period: number; stance: number; stride: number; lift: number }): number {
  const u = (((phase / g.period) % 1) + 1) % 1;
  let lowFoot = Infinity;
  r.legs.forEach((l, i) => {
    const v = (u + l.offset) % 1;
    let x: number, k = 0;
    if (v < g.stance) x = g.stride / 2 - (g.stride * v) / g.stance;
    else { const s = (v - g.stance) / (1 - g.stance); x = -g.stride / 2 + g.stride * (0.5 - 0.5 * Math.cos(Math.PI * s)); k = g.lift * Math.sin(Math.PI * s); }
    x *= amp; k *= amp;
    const c = (a: number) => Math.max(-0.99, Math.min(0.99, a));
    // son burchagi: panja tana ostida (l.f0 + x) ga borsin
    let th = Math.asin(c((l.f0 + x) / l.L)) - Math.asin(c(l.f0 / l.L));
    // ishora: +th panjani oldinga surishi kerak
    const test = l.foot.clone().sub(l.hip).applyAxisAngle(r.axis, 0.1).dot(r.fwd) - l.foot.clone().sub(l.hip).dot(r.fwd);
    if (test < 0) th = -th;
    r.uniforms.rigHipAng.value[i] = th;
    r.uniforms.rigKneeAng.value[i] = k * r.kneeSign;
    // panja balandligi (tizza 0 bo‘lgan tayanch oyoq uchun)
    if (v < g.stance) {
      const p = l.foot.clone().sub(l.hip).applyAxisAngle(r.axis, th).add(l.hip);
      lowFoot = Math.min(lowFoot, p.y);
    }
  });
  return Number.isFinite(lowFoot) ? r.footY - lowFoot : 0;
}

/** Pastki jag‘ burchagi (rad; musbat — yopiladi) */
export function softJaw(r: SoftRig, angle: number) {
  r.uniforms.rigHipAng.value[4] = angle * r.jawSign;
}

/**
 * Bosh burilishi: yaw — model fazosida tik o‘q atrofida (three konvensiyasi), pitch — musbat bo‘lsa tumshuq yuqoriga
 */
export function softHead(r: SoftRig, yaw: number, pitch: number) {
  r.uniforms.rigHeadYaw.value = yaw;
  r.uniforms.rigHeadPitch.value = pitch * r.pitchSign;
}
