import * as THREE from 'three';
import { DINO, DINO_SCALE, dinoPose, feetAt, type DinoProfile } from '../game/dino';
import type { Game } from '../game/game';
import { WORLD_ORIGIN } from '../game/grid';

/**
 * public/models/apato.glb — yuradigan dinozavr (renderer qismi).
 * GLB bir marta asinxron yuklanadi; skelet yo‘q, animatsiya — morph target og‘irliklari (vertex keshi).
 * Yuklangach: tuzilma tekshiriladi (diag), oyoqlar o‘rtasining klip bo‘yicha X siljishi (root motion) shu faylning
 * o‘zidan hisoblanib domenga beriladi (Game.setDinoProfile). Har kadrda domen holatidan model ildizi joylanadi va
 * morph og‘irliklari klipdan (ikki vaqt blend) olinadi — AnimationMixer ishlatilmaydi, vaqt o‘yin vaqtiga bog‘liq.
 */
const HALF = WORLD_ORIGIN;

export interface DinoDiag {
  status: 'loading' | 'ok' | 'error';
  error?: string;
  url: string;
  meshes: number;
  morphTargets: number[];
  skins: number;
  clip?: { name: string; duration: number; tracks: string[] };
  textures: { name: string; w: number; h: number }[];
  /** Klipdagi oldinga siljish (tA → tB, model birligi) */
  forwardShift?: number;
  /** Barcha oyoqlar yerda bo‘lgan oraliqlar (soniya) */
  plantedIntervals?: [number, number][];
  modelBox?: { min: number[]; max: number[] };
  /** Model birligi → katak */
  scale?: number;
  loadMs?: number;
}

export interface DinoCredits { author?: string; title?: string; license?: string; source?: string }

interface Instance {
  group: THREE.Group;
  model: THREE.Object3D;
  morph: { mesh: THREE.Mesh; interp: THREE.Interpolant }[];
  last: string;
}

export class DinoWalker {
  /** Barcha dinozavrlar shu guruhda; har biri alohida 'apato' guruhi (model nusxasi: geometriya/material umumiy) */
  readonly root = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private morphMeshes: { mesh: THREE.Mesh; interp: THREE.Interpolant }[] = [];
  private interps = new Map<string, THREE.Interpolant>();
  private instances: Instance[] = [];
  private profile: DinoProfile | null = null;
  private body: { mesh: THREE.Mesh; interp: THREE.Interpolant } | null = null;
  private footGroups: number[][] = [];
  private frame = 0;
  private disposed = false;
  diag: DinoDiag = { status: 'loading', url: '', meshes: 0, morphTargets: [], skins: 0, textures: [] };
  credits: DinoCredits | null = null;

  constructor(private scene: THREE.Scene, private game: Game, enabled = true) {
    this.root.name = 'apato-herd';
    scene.add(this.root);
    if (enabled) void this.load();
    else this.diag.status = 'error', this.diag.error = 'o‘chirilgan (?nodino)';
  }

  private async load() {
    const { liteModelUrl, createGltfLoader } = await import('./gltfLoader');
    const url = liteModelUrl('apato.glb');
    this.diag.url = url;
    const t0 = performance.now();
    try {
      const gltf = await createGltfLoader().loadAsync(url);
      if (this.disposed) return;
      this.setup(gltf as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[]; parser: { json: { asset?: { extras?: Record<string, string> }; skins?: unknown[] } } });
      this.diag.loadMs = Math.round(performance.now() - t0);
    } catch (e) {
      this.diag.status = 'error';
      this.diag.error = String((e as Error)?.message ?? e);
      console.warn('[dino] apato.glb yuklanmadi:', e);
    }
  }

  private setup(gltf: { scene: THREE.Group; animations: THREE.AnimationClip[]; parser: { json: { asset?: { extras?: Record<string, string> }; skins?: unknown[] } } }) {
    const model = gltf.scene;
    const json = gltf.parser.json;
    const ex = json.asset?.extras ?? {};
    this.credits = { author: ex.author, title: ex.title, license: ex.license, source: ex.source };
    this.diag.skins = json.skins?.length ?? 0;

    const meshes: THREE.Mesh[] = [];
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes.push(m);
      m.castShadow = true;
      // harakatlanayotgan morph tanada o‘z soyasi yiltillaydi (shadow acne) — faqat yerga soya tushiradi
      m.receiveShadow = false;
      // vertekslar animatsiyada geometriya chegarasidan chiqadi — kesib tashlanmasin
      m.frustumCulled = false;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) {
        const tex = (mt as THREE.MeshStandardMaterial).map;
        const img = tex?.image as { width?: number; height?: number } | undefined;
        if (tex && img) this.diag.textures.push({ name: mt.name, w: img.width ?? 0, h: img.height ?? 0 });
      }
    });
    this.diag.meshes = meshes.length;
    this.diag.morphTargets = meshes.map((m) => m.geometry.morphAttributes.position?.length ?? 0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    this.diag.modelBox = { min: box.min.toArray(), max: box.max.toArray() };

    const clip = gltf.animations[0];
    if (!clip) throw new Error('GLB da animatsiya yo‘q');
    this.diag.clip = { name: clip.name, duration: clip.duration, tracks: clip.tracks.map((t) => t.name) };
    for (const tr of clip.tracks) {
      const [node, prop] = tr.name.split('.');
      if (prop !== 'morphTargetInfluences') continue;
      const mesh = meshes.find((m) => m.name === node) ?? (model.getObjectByName(node) as THREE.Mesh | undefined);
      if (mesh?.morphTargetInfluences) {
        const interp = tr.createInterpolant();
        this.morphMeshes.push({ mesh, interp });
        this.interps.set(node, interp);
      }
    }
    if (!this.morphMeshes.length) throw new Error('Morph target treklari topilmadi');

    // root motion: asosiy tana meshidagi oyoq vertekslari (dam pozasida y < 1.2), 4 oyoq guruhi o‘rtachasi
    const body = this.morphMeshes.reduce((a, b) => ((a.mesh.geometry.attributes.position.count >= b.mesh.geometry.attributes.position.count) ? a : b));
    const g = body.mesh.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const targets = g.morphAttributes.position as THREE.BufferAttribute[];
    const groups: number[][] = [[], [], [], []];
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) >= 1.2) continue;
      groups[(pos.getX(i) > -5 ? 0 : 2) + (pos.getZ(i) > 0 ? 0 : 1)].push(i);
    }
    const pick = groups.map((gr) => gr.filter((_, k) => k % Math.max(1, Math.floor(gr.length / 24)) === 0));
    const times = Array.from((clip.tracks.find((t) => t.name.startsWith(body.mesh.name)) ?? clip.tracks[0]).times);
    const feetX: number[] = [];
    const planted: boolean[] = [];
    for (const t of times) {
      const w = body.interp.evaluate(t) as Float32Array;
      const nz: [number, number][] = [];
      for (let k = 0; k < w.length; k++) if (Math.abs(w[k]) > 1e-6) nz.push([k, w[k]]);
      let sx = 0;
      let allDown = true;
      for (const gr of pick) {
        let gx = 0, miny = Infinity;
        for (const i of gr) {
          let x = pos.getX(i), y = pos.getY(i);
          for (const [k, wk] of nz) { x += wk * targets[k].getX(i); y += wk * targets[k].getY(i); }
          gx += x;
          miny = Math.min(miny, y);
        }
        sx += gx / gr.length;
        if (miny > 0.06) allDown = false;
      }
      feetX.push(sx / pick.length);
      planted.push(allDown);
    }
    const intervals: [number, number][] = [];
    let start = -1;
    planted.forEach((p, i) => {
      if (p && start < 0) start = i;
      if ((!p || i === planted.length - 1) && start >= 0) { intervals.push([times[start], times[p ? i : i - 1]]); start = -1; }
    });
    this.diag.plantedIntervals = intervals.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]);
    const profile: DinoProfile = { times, feetX, tA: DINO.T_A, tB: DINO.T_B, tR: DINO.T_R };
    this.diag.forwardShift = +(feetAt(profile, profile.tB) - feetAt(profile, profile.tA)).toFixed(2);
    if (!(this.diag.forwardShift > 5)) throw new Error(`Klipda oldinga yurish topilmadi (siljish ${this.diag.forwardShift})`);

    this.body = body;
    this.footGroups = pick;
    this.model = model;
    this.profile = profile;
    this.diag.scale = DINO_SCALE;
    this.diag.status = 'ok';
    this.game.setDinoProfile(profile);
  }

  /** Har dinozavr uchun model nusxasi: birinchisi asl model, keyingilari clone (geometriya va materiallar umumiy). */
  private instanceFor(i: number): Instance {
    let inst = this.instances[i];
    if (inst) return inst;
    const model = i === 0 ? this.model! : this.model!.clone(true);
    const morph: Instance['morph'] = [];
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      const interp = m.isMesh ? this.interps.get(m.name) : undefined;
      if (interp && m.morphTargetInfluences) morph.push({ mesh: m, interp });
    });
    const group = new THREE.Group();
    group.name = 'apato';
    group.add(model);
    this.root.add(group);
    inst = { group, model, morph, last: '' };
    this.instances[i] = inst;
    return inst;
  }

  /** Har kadr: domen holatidan joylashuv va morph og‘irliklari. camDist — uzoqda yangilanish siyraklashadi. */
  update(camDist: number) {
    const p = this.profile;
    const list = this.game.dinos;
    if (!this.model || !p) return;
    // ortiqcha nusxalar (dinozavrlar kamaygan bo‘lsa) olib tashlanadi — umumiy geometriyaga tegilmaydi
    while (this.instances.length > list.length) {
      const inst = this.instances.pop()!;
      this.root.remove(inst.group);
    }
    this.frame++;
    list.forEach((s, i) => {
      const inst = this.instanceFor(i);
      const pose = dinoPose(p, s);
      inst.group.position.set(pose.baseX - HALF, 0, pose.baseZ - HALF);
      inst.group.rotation.y = -pose.heading;
      inst.model.scale.setScalar(pose.scale);
      inst.model.position.set(-pose.fA * pose.scale, 0.03 * pose.scale, 0);
      const key = `${pose.t1.toFixed(4)}|${pose.t2.toFixed(4)}|${pose.a.toFixed(3)}`;
      if (key === inst.last) return; // pauza — o‘zgarish yo‘q
      void camDist; // poza har kadrda joylashuv bilan birga yangilanadi (aks holda oyoqlar sakrab ko‘rinadi)
      inst.last = key;
      for (const { mesh, interp } of inst.morph) {
        const infl = mesh.morphTargetInfluences!;
        const w1 = interp.evaluate(pose.t1) as Float32Array;
        if (pose.a <= 0) { for (let k = 0; k < infl.length; k++) infl[k] = w1[k]; continue; }
        for (let k = 0; k < infl.length; k++) infl[k] = (1 - pose.a) * w1[k];
        const w2 = interp.evaluate(pose.t2) as Float32Array;
        for (let k = 0; k < infl.length; k++) infl[k] += pose.a * w2[k];
      }
    });
  }

  /**
   * Sinov uchun: joriy kadrdagi 4 oyoq guruhi markazi dunyo koordinatasida (katak) va eng past nuqtasi (model birligi).
   * Yerda turgan oyoq (minY < 0,06) qadam davomida joyida qolishi kerak.
   */
  footStats(index = 0): { x: number; z: number; minY: number; lx: number; lz: number }[] {
    const s = this.game.dinos[index], p = this.profile;
    if (!s || !p || !this.body) return [];
    const pose = dinoPose(p, s);
    const g = this.body.mesh.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const tg = g.morphAttributes.position as THREE.BufferAttribute[];
    const w1 = Float32Array.from(this.body.interp.evaluate(pose.t1) as Float32Array);
    const w2 = Float32Array.from(this.body.interp.evaluate(pose.t2) as Float32Array);
    const c = Math.cos(pose.heading), sn = Math.sin(pose.heading);
    return this.footGroups.map((gr) => {
      let sx = 0, sz = 0, miny = Infinity;
      for (const i of gr) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        for (let k = 0; k < w1.length; k++) {
          const w = (1 - pose.a) * w1[k] + pose.a * w2[k];
          if (w) { x += w * tg[k].getX(i); y += w * tg[k].getY(i); z += w * tg[k].getZ(i); }
        }
        sx += x; sz += z; miny = Math.min(miny, y);
      }
      const lx = (sx / gr.length - pose.fA) * pose.scale, lz = (sz / gr.length) * pose.scale;
      // model +Z → dunyoda chapga: root.rotation.y = -heading
      return { x: pose.baseX + c * lx - sn * lz, z: pose.baseZ + sn * lx + c * lz, minY: miny, lx: sx / gr.length, lz: sz / gr.length };
    });
  }

  /** Sinov uchun: joriy kadrdagi tana vertekslaridan namunalar dunyo koordinatasida (katak). */
  bodyPoints(index = 0, every = 9): { x: number; z: number; y: number }[] {
    const s = this.game.dinos[index], p = this.profile;
    if (!s || !p || !this.body) return [];
    const pose = dinoPose(p, s);
    const g = this.body.mesh.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const tg = g.morphAttributes.position as THREE.BufferAttribute[];
    const w1 = Float32Array.from(this.body.interp.evaluate(pose.t1) as Float32Array);
    const w2 = Float32Array.from(this.body.interp.evaluate(pose.t2) as Float32Array);
    const nz: [number, number][] = [];
    for (let k = 0; k < w1.length; k++) { const w = (1 - pose.a) * w1[k] + pose.a * w2[k]; if (w) nz.push([k, w]); }
    const c = Math.cos(pose.heading), sn = Math.sin(pose.heading);
    const out: { x: number; z: number; y: number }[] = [];
    for (let i = 0; i < pos.count; i += every) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      for (const [k, w] of nz) { x += w * tg[k].getX(i); y += w * tg[k].getY(i); z += w * tg[k].getZ(i); }
      const lx = (x - pose.fA) * pose.scale, lz = z * pose.scale;
      out.push({ x: pose.baseX + c * lx - sn * lz, z: pose.baseZ + sn * lx + c * lz, y: y * pose.scale });
    }
    return out;
  }

  dispose() {
    this.disposed = true;
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
        for (const v of Object.values(mt)) if (v instanceof THREE.Texture) v.dispose();
        mt.dispose();
      }
    });
    this.morphMeshes = [];
    this.instances = [];
    this.model = null;
  }
}
