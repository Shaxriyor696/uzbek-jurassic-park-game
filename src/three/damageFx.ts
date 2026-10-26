import * as THREE from 'three';

/**
 * Dinozavr zarari ko‘rinishi (qon/jarohat yo‘q — faqat bino shikasti):
 *  1 — yoriqlar va mayda qoldiqlar; 2 — biroz qiyshaygan, tomda teshik, tutun; 3 — kuchliroq; 4 — qulagan (cho‘kkan,
 *  yonboshlagan), vayrona uyumi va qalin tutun. Zarba paytida — bo‘laklar sachraydi va chang ko‘tariladi.
 * Geometriya va materiallar umumiy (har binoga yangi yaratilmaydi); tutun va zarba zarrachalari DamageFx.update da.
 */

const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
const crackMat = new THREE.MeshBasicMaterial({ color: '#2b2622' });
const holeMat = new THREE.MeshStandardMaterial({ color: '#1f1b18', roughness: 1 });
const rubbleMats = ['#8a8178', '#a39686', '#6f655c', '#b5654a', '#c9b79c'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
const dustMat = new THREE.MeshStandardMaterial({ color: '#9c8f7c', roughness: 1, transparent: true, opacity: 0.85 });

let smokeTex: THREE.Texture | null = null;
function smokeTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

/** Deterministik tasodif (bir xil bino — bir xil yoriqlar; har qayta qurishda sakramaydi) */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Puff { sprite: THREE.Sprite; base: THREE.Vector3; t: number; period: number; size: number; dark: number }
interface Bit { mesh: THREE.Object3D; v: THREE.Vector3; spin: THREE.Vector3; t: number; life: number; dust?: boolean }

export class DamageFx {
  private puffs: Puff[] = [];
  private bits: Bit[] = [];
  readonly root = new THREE.Group();

  /** Tutun manbai (bino ustidan uzluksiz ko‘tariladi) */
  addSmoke(parent: THREE.Object3D, at: THREE.Vector3, n: number, dark: number, r: () => number) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: smokeTexture(), color: new THREE.Color().setScalar(0.55 - dark * 0.3), transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(m);
      s.renderOrder = 4;
      const base = at.clone().add(new THREE.Vector3((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4));
      s.position.copy(base);
      parent.add(s);
      const period = 2.6 + r() * 1.6;
      this.puffs.push({ sprite: s, base, t: (i / n) * period, period, size: 0.45 + r() * 0.3 + dark * 0.3, dark });
    }
  }

  /** Zarba: bo‘laklar sachraydi, chang ko‘tariladi */
  burst(x: number, y: number, z: number, big: boolean) {
    const r = rng((x * 7919 + z * 104729 + performance.now()) | 0);
    const n = big ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(r() < 0.5 ? rockGeo : chunkGeo, rubbleMats[Math.floor(r() * rubbleMats.length)]);
      const s = (big ? 0.05 : 0.035) + r() * 0.05;
      m.scale.setScalar(s);
      m.position.set(x + (r() - 0.5) * 0.3, y, z + (r() - 0.5) * 0.3);
      const a = r() * Math.PI * 2, sp = 0.8 + r() * (big ? 1.8 : 1.2);
      this.root.add(m);
      this.bits.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * sp, 1.6 + r() * 2.2, Math.sin(a) * sp), spin: new THREE.Vector3(r() * 9, r() * 9, r() * 9), t: 0, life: 0.9 + r() * 0.5 });
    }
    for (let i = 0; i < (big ? 4 : 2); i++) {
      const mat = new THREE.SpriteMaterial({ map: smokeTexture(), color: '#b9ab95', transparent: true, depthWrite: false, opacity: 0.8 });
      const s = new THREE.Sprite(mat);
      s.position.set(x + (r() - 0.5) * 0.5, y * 0.6, z + (r() - 0.5) * 0.5);
      s.scale.setScalar(0.3);
      s.renderOrder = 4;
      this.root.add(s);
      this.bits.push({ mesh: s, v: new THREE.Vector3((r() - 0.5) * 0.4, 0.35 + r() * 0.3, (r() - 0.5) * 0.4), spin: new THREE.Vector3(), t: 0, life: 1.2 + r() * 0.5, dust: true });
    }
  }

  update(dt: number) {
    // tutun: ko‘tariladi, kengayadi, so‘nadi va qaytadan (bino olib tashlansa — ro‘yxatdan chiqadi)
    this.puffs = this.puffs.filter((p) => attached(p.sprite));
    for (const p of this.puffs) {
      p.t = (p.t + dt) % p.period;
      const k = p.t / p.period;
      p.sprite.position.set(p.base.x + Math.sin(k * 3 + p.period) * 0.08, p.base.y + k * (0.9 + p.dark * 0.5), p.base.z + k * 0.12);
      p.sprite.scale.setScalar(p.size * (0.5 + k * 1.3));
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI) * (0.55 + p.dark * 0.3);
    }
    for (const b of this.bits) {
      b.t += dt;
      if (b.dust) {
        b.mesh.position.addScaledVector(b.v, dt);
        b.mesh.scale.setScalar(0.3 + b.t * 0.9);
        (((b.mesh as THREE.Sprite).material) as THREE.SpriteMaterial).opacity = Math.max(0, 0.8 * (1 - b.t / b.life));
        continue;
      }
      b.v.y -= 9 * dt;
      b.mesh.position.addScaledVector(b.v, dt);
      if (b.mesh.position.y < 0.02) { b.mesh.position.y = 0.02; b.v.multiplyScalar(0.35); b.v.y = Math.abs(b.v.y) * 0.3; }
      b.mesh.rotation.x += b.spin.x * dt; b.mesh.rotation.y += b.spin.y * dt; b.mesh.rotation.z += b.spin.z * dt;
    }
    const done = this.bits.filter((b) => b.t >= b.life);
    for (const b of done) {
      this.root.remove(b.mesh);
      if (b.dust) ((b.mesh as THREE.Sprite).material as THREE.Material).dispose();
    }
    if (done.length) this.bits = this.bits.filter((b) => b.t < b.life);
  }
}

function attached(o: THREE.Object3D) {
  let p: THREE.Object3D | null = o;
  while (p) { if ((p as THREE.Scene).isScene) return true; p = p.parent; }
  return false;
}

/** Yoriq: 2–3 ta ingichka qora bo‘lak, singan chiziq (devor tekisligida) */
function crack(r: () => number, len: number) {
  const g = new THREE.Group();
  let x = 0, y = 0, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
  const segs = 2 + Math.floor(r() * 2);
  for (let i = 0; i < segs; i++) {
    const l = len / segs * (0.7 + r() * 0.6);
    const m = new THREE.Mesh(chunkGeo, crackMat);
    m.scale.set(0.04 + r() * 0.02, l, 0.02);
    m.position.set(x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2, 0);
    m.rotation.z = a - Math.PI / 2;
    g.add(m);
    x += Math.cos(a) * l; y += Math.sin(a) * l;
    a += (r() - 0.5) * 1.4;
  }
  return g;
}

/**
 * Shikastlangan bino: model aylantirilgan/egilgan «tayanch» ichida + yoriqlar, teshik, qoldiqlar va tutun.
 * obj — tayyor model (dunyo koordinatasida joylashgan); qaytariladigan guruh shu o‘rinda turadi.
 */
export function damagedBuilding(obj: THREE.Object3D, stage: 1 | 2 | 3 | 4, seed: number, fx: DamageFx): THREE.Object3D {
  const r = rng(seed);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group();
  // tayanch: bino asosi markazida — qiyshayish va cho‘kish shu nuqta atrofida
  const pivot = new THREE.Group();
  pivot.position.set(center.x, box.min.y, center.z);
  obj.position.sub(pivot.position);
  pivot.add(obj);
  wrap.add(pivot);
  const tilt = [0, 0, 0.035, 0.07, 0.14][stage];
  const dir = r() * Math.PI * 2;
  pivot.rotation.x = Math.cos(dir) * tilt;
  pivot.rotation.z = Math.sin(dir) * tilt;
  if (stage === 4) { pivot.scale.y = 0.45; pivot.position.y -= 0.02; }

  const overlay = new THREE.Group();
  wrap.add(overlay);
  const h = size.y * (stage === 4 ? 0.45 : 1);
  // yoriqlar — to‘rt yon devorda (qulagan binoda kerak emas, vayrona bor)
  if (stage < 4) {
    const n = stage * 4;
    for (let i = 0; i < n; i++) {
      const side = Math.floor(r() * 4);
      const c = crack(r, Math.min(h * 0.6, 0.3 + r() * 0.4));
      const u = (r() - 0.5) * 0.8, v = 0.25 + r() * 0.65;
      if (side < 2) {
        c.position.set(center.x + u * size.x, box.min.y + v * h, side === 0 ? box.max.z + 0.012 : box.min.z - 0.012);
        if (side === 1) c.rotation.y = Math.PI;
      } else {
        c.position.set(side === 2 ? box.max.x + 0.012 : box.min.x - 0.012, box.min.y + v * h, center.z + u * size.z);
        c.rotation.y = side === 2 ? Math.PI / 2 : -Math.PI / 2;
      }
      c.position.sub(pivot.position); // tayanch koordinatasiga — bino bilan birga qiyshayadi
      pivot.add(c);
    }
  }
  // tomda singan joy (teshik)
  if (stage >= 2 && stage < 4) {
    for (let i = 0; i < stage - 1; i++) {
      const m = new THREE.Mesh(chunkGeo, holeMat);
      m.scale.set(size.x * (0.18 + r() * 0.12), 0.05, size.z * (0.18 + r() * 0.12));
      m.position.set(center.x + (r() - 0.5) * size.x * 0.5, box.max.y - 0.02, center.z + (r() - 0.5) * size.z * 0.5);
      m.rotation.y = r() * Math.PI;
      m.position.sub(pivot.position);
      pivot.add(m);
    }
  }
  // qoldiqlar: asos atrofida (bosqichga qarab ko‘proq); qulagan binoda — katta uyum
  const debris = [0, 5, 9, 14, 26][stage];
  for (let i = 0; i < debris; i++) {
    const m = new THREE.Mesh(r() < 0.6 ? rockGeo : chunkGeo, rubbleMats[Math.floor(r() * rubbleMats.length)]);
    const s = (stage === 4 ? 0.07 : 0.04) + r() * (stage === 4 ? 0.12 : 0.06);
    m.scale.set(s * (0.8 + r() * 0.6), s * (0.6 + r() * 0.5), s * (0.8 + r() * 0.6));
    const a = r() * Math.PI * 2, rr = 0.5 + r() * 0.35;
    m.position.set(center.x + Math.cos(a) * size.x * rr, box.min.y + s * 0.4, center.z + Math.sin(a) * size.z * rr);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    overlay.add(m);
  }
  if (stage === 4) {
    const mound = new THREE.Mesh(rockGeo, dustMat);
    mound.scale.set(size.x * 0.55, 0.12, size.z * 0.55);
    mound.position.set(center.x, box.min.y + 0.02, center.z);
    overlay.add(mound);
  }
  if (stage >= 2) fx.addSmoke(overlay, new THREE.Vector3(center.x, box.min.y + h * 0.85, center.z), stage === 2 ? 2 : stage === 3 ? 3 : 4, stage >= 3 ? 1 : 0, r);
  return wrap;
}

/** Devor qismi qisman shikast: yoriqlar va qoldiqlar (katak markazida) */
export function wallDamage(stage: 1 | 2 | 3, seed: number): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group();
  for (let i = 0; i < stage * 2; i++) {
    const c = crack(r, 0.18 + r() * 0.2);
    const side = r() < 0.5 ? 1 : -1;
    c.position.set((r() - 0.5) * 0.6, 0.25 + r() * 0.45, side * 0.2);
    if (side < 0) c.rotation.y = Math.PI;
    if (r() < 0.5) { c.position.set(side * 0.2, c.position.y, (r() - 0.5) * 0.6); c.rotation.y = side * Math.PI / 2; }
    g.add(c);
  }
  for (let i = 0; i < stage * 4; i++) {
    const m = new THREE.Mesh(r() < 0.6 ? rockGeo : chunkGeo, rubbleMats[Math.floor(r() * 3)]);
    const s = 0.035 + r() * 0.05;
    m.scale.setScalar(s);
    m.position.set((r() - 0.5) * 0.9, s * 0.4, (r() - 0.5) * 0.9);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(m);
  }
  return g;
}
