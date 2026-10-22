import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WORLD_ORIGIN } from '../game/grid';
import { groundHeight } from '../game/terrain';
import { HERD_DEFS, HERD_BY_TYPE, herdScale, type ClipSpec, type HerdDef, type HerdType, type ProcGait } from '../game/herdDefs';
import type { Game } from '../game/game';
import type { HerdDino } from '../game/herd';
import { buildSoftRig, softHead, softJaw, softPose, type SoftRig } from './softRig';

/**
 * 7 ta yangi dinozavrning 3D ko‘rinishi. Har GLB bir marta, navbat bilan (kichigidan) yuklanadi; xato bo‘lsa faqat
 * o‘sha model ko‘rinmaydi — o‘yin davom etadi. Joy, yo‘nalish va animatsiya fazasi o‘yin holatidan (Game.herd) —
 * renderer faqat ko‘rsatadi, shuning uchun pauza/saqlash bilan mos. Masshtab barcha o‘qlarda bir xil (proporsiya
 * saqlanadi). Raptor klipida oldinga siljish vertekslarga yozilgan — u bekor qilinadi (siljishni faqat o‘yin beradi).
 */
export interface HerdModelStatus {
  type: HerdType;
  name: string;
  status: 'waiting' | 'loading' | 'ok' | 'error';
  error?: string;
  loadMs?: number;
  credits?: { title?: string; author?: string; license?: string; source?: string };
  /** O‘yin birligida o‘lcham (yuklangandan keyin o‘lchanadi) */
  size?: { length: number; height: number; width: number };
}

/** Protsedurali yurish uchun skelet ma’lumoti (yuklanganda tinch pozadan o‘lchanadi) */
interface GaitRig {
  g: ProcGait;
  axis: THREE.Vector3;
  up: THREE.Vector3;
  legs: {
    hip: THREE.Bone; knee: THREE.Bone; ankle: THREE.Bone; toe: THREE.Bone; offset: number;
    rest: THREE.Quaternion[]; par: THREE.Quaternion[];
    /** son → barmoq: oldinga va pastga tashkil etuvchi, uzunlik */
    f0: number; L: number;
    sHip: number; sKnee: number;
  }[];
  tail: { b: THREE.Bone; rest: THREE.Quaternion; par: THREE.Quaternion }[];
  toeY: number;
  amp: number;
}

/** Tana jonliligi: bo‘yin-bosh zanjiri, dum, tos (skeletli modellar) */
interface BodyRig {
  neck: THREE.Bone[];
  spine: THREE.Bone[];
  tail: THREE.Bone[];
  hips: THREE.Bone | null;
  rest: Map<THREE.Bone, THREE.Quaternion>;
  /** Model fazosida: tik, yon va oldinga o‘qlar; bosh ko‘tarilish ishorasi */
  up: THREE.Vector3;
  lat: THREE.Vector3;
  fwd: THREE.Vector3;
  pitchSign: number;
}

/** Bosh va tana holati (silliq, prujinali) */
interface Life {
  /** Qiyalikda tana egilishi (oldinga-orqaga va yonga, silliq) */
  tiltF: number;
  tiltS: number;
  /** Silliq yurish kuchi (holat almashganda dum/tos sakramasin) */
  walk: number;
  yaw: number;
  pitch: number;
  lean: number;
  seed: number;
  leanSign: number;
}

interface Inst {
  def: HerdDef;
  body: BodyRig | null;
  /**
   * O‘tgan kadrda qo‘shilgan burilish (suyak → ko‘paytma). Klipli modellarda tinch pozaga qaytarilmaydi: AnimationMixer
   * qiymat o‘zgarmasa suyakka qayta yozmaydi — shuning uchun o‘z qo‘shimchamiz aniq teskari amal bilan olib tashlanadi.
   */
  applied: Map<THREE.Bone, THREE.Quaternion>;
  /** Dum yumshatish: yurish siklidagi o‘rtacha poza (suyak → kvaternion) */
  tailMean: Map<THREE.Bone, THREE.Quaternion> | null;
  life: Life;
  lean: THREE.Group;
  model: THREE.Object3D;
  soft: SoftRig | null;
  softAmp: number;
  jaw: { b: THREE.Bone; rest: THREE.Quaternion; par: THREE.Quaternion; axis: THREE.Vector3 } | null;
  gait: GaitRig | null;
  root: THREE.Group;
  yaw: THREE.Group;
  motion: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  acts: Partial<Record<'idle' | 'walk' | 'run' | 'look0' | 'look1', { a: THREE.AnimationAction; spec: ClipSpec; dur: number }>>;
  weights: Record<string, number>;
}

const LOAD_ORDER: HerdType[] = ['ankylosaurus', 'triceratops', 'alice', 'triceratops_jp', 'trex', 'raptor', 'spinosaurus'];

export class HerdView {
  status: HerdModelStatus[] = HERD_DEFS.map((d) => ({ type: d.type, name: d.name, status: 'waiting' }));
  /** Nusxalar (dinozavr ID si bo‘yicha) va har tur uchun bir marta yuklangan GLB */
  inst = new Map<string, Inst>();
  private gltf = new Map<HerdType, GLTF>();
  private cloneFn: ((o: THREE.Object3D) => THREE.Object3D) | null = null;
  private group = new THREE.Group();

  constructor(scene: THREE.Scene, private game: Game, enabled = true) {
    this.group.name = 'herd';
    scene.add(this.group);
    if (enabled) void this.loadAll();
  }

  private async loadAll() {
    const { createGltfLoader, liteModelUrl } = await import('./gltfLoader');
    const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
    this.cloneFn = clone;
    const loader = createGltfLoader();
    // navbat: bir vaqtda bitta og‘ir fayl (xotira va tarmoq cho‘qqisi bo‘lmasin)
    for (const type of LOAD_ORDER) {
      const def = HERD_BY_TYPE[type];
      const st = this.status.find((s) => s.type === type)!;
      st.status = 'loading';
      const t0 = performance.now();
      try {
        const url = liteModelUrl(def.file);
        const g = await loader.loadAsync(url);
        st.loadMs = Math.round(performance.now() - t0);
        const ex = (g.parser.json.asset?.extras ?? {}) as Record<string, string>;
        st.credits = { title: ex.title, author: ex.author, license: ex.license, source: ex.source };
        this.gltf.set(type, g);
        // shu turdagi har bir dinozavr — mustaqil nusxa (skelet va animatsiya holati alohida)
        for (const d of this.game.herd.dinos) if (d.type === type && !this.inst.has(d.id)) this.inst.set(d.id, this.build(def, g, clone, st, d.id));
        st.status = 'ok';
      } catch (e) {
        st.status = 'error';
        st.error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  private build(def: HerdDef, g: GLTF, clone: (o: THREE.Object3D) => THREE.Object3D, st: HerdModelStatus, id: string): Inst {
    const model = clone(g.scene) as THREE.Group; // skelet va animatsiya holati mustaqil nusxa
    model.updateMatrixWorld(true);
    const gait = def.gait ? this.rigGait(model, def.gait) : null;
    const body = def.head && (def.head.neck || def.head.auto) ? this.rigBody(model, def) : null;
    const soft = def.soft ? buildSoftRig(model, def.soft, def.type) : null;
    if (def.soft && !soft) st.error = 'Yumshoq rig qurilmadi — statik';
    let jaw: Inst['jaw'] = null;
    const jb = def.jaw ? (model.getObjectByName(def.jaw.bone) as THREE.Bone | undefined) : undefined;
    if (def.jaw && jb) {
      jaw = { b: jb, rest: jb.quaternion.clone(), par: jb.parent!.getWorldQuaternion(new THREE.Quaternion()), axis: new THREE.Vector3(...def.jaw.axis).normalize() };
      this.setRot(jb, jaw.rest, jaw.par, jaw.axis, def.jaw.closed);
    }
    const s = herdScale(def);
    const motion = new THREE.Group();
    motion.add(model);
    const scaled = new THREE.Group();
    scaled.scale.setScalar(s); // proporsiya saqlanadi: barcha o‘qlarda bir xil
    scaled.add(motion);
    // engashish (burilishda tana ichkariga ozgina qiyshayadi) — yo‘nalish va masshtab orasida
    const lean = new THREE.Group();
    lean.add(scaled);
    const yaw = new THREE.Group();
    yaw.add(lean);
    const root = new THREE.Group();
    root.add(yaw);
    root.name = id;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = false;
      // skinned/morph mesh chegara qutisi animatsiyada o‘zgaradi — kesilib qolmasin
      if ((m as THREE.SkinnedMesh).isSkinnedMesh || m.morphTargetInfluences) m.frustumCulled = false;
    });
    let mixer: THREE.AnimationMixer | null = null;
    const acts: Inst['acts'] = {};
    if (g.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      const add = (key: keyof Inst['acts'], spec?: ClipSpec) => {
        if (!spec) return;
        const c = g.animations.find((a) => a.name === spec.clip);
        if (!c) return;
        // bitta klipning turli bo‘laklari (masalan turish kadri va yurish bo‘lagi) — alohida action
        const a = mixer!.clipAction(c.clone());
        a.play();
        a.setEffectiveWeight(key === 'idle' ? 1 : 0);
        a.timeScale = 0; // vaqtni o‘yin holatidan qo‘lda beramiz
        acts[key] = { a, spec, dur: c.duration };
      };
      add('idle', def.idle);
      add('walk', def.walk);
      add('run', def.run);
      add('look0', def.look?.[0]);
      add('look1', def.look?.[1]);
    }
    // yerga tegish: tinch pozadagi eng past nuqta y=0 ga
    if (mixer && acts.idle) { this.applyTime(acts.idle, 0); mixer.update(0); }
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scaled, true);
    // yumshoq rig: panja balandligi (ko‘rgazma tagligi yashirilgan bo‘lsa — uning ustidan)
    scaled.position.y = soft ? -soft.footY * s : -box.min.y;
    const size = box.getSize(new THREE.Vector3());
    st.size = { length: +Math.max(size.x, size.z).toFixed(2), height: +size.y.toFixed(2), width: +Math.min(size.x, size.z).toFixed(2) };
    this.group.add(root);
    let hsh = 0;
    for (let i = 0; i < id.length; i++) hsh = (hsh * 31 + id.charCodeAt(i)) | 0;
    // engashish ishorasi: + burchakda tananing tepasi burilish markazi tomonga (o‘yin yo‘nalishi oshganda — model chap tomoni)
    const f = def.forward, fv = new THREE.Vector3(Math.cos(f), 0, Math.sin(f)), inside = new THREE.Vector3(Math.cos(f + Math.PI / 2), 0, Math.sin(f + Math.PI / 2));
    const leanSign = new THREE.Vector3(0, 1, 0).applyAxisAngle(fv, 0.1).dot(inside) > 0 ? 1 : -1;
    const life: Life = { tiltF: 0, tiltS: 0, walk: 0, yaw: 0, pitch: 0, lean: 0, seed: (Math.abs(hsh) % 1000) / 100, leanSign };
    // dum yumshatish uchun: yurish bo‘lagidagi o‘rtacha dum pozasi (12 namuna)
    let tailMean: Inst['tailMean'] = null;
    if (mixer && body && def.head?.tailDamp && acts.walk) {
      const sums = new Map(body.tail.map((b) => [b, new THREE.Vector4()]));
      const w = acts.walk;
      for (const e of Object.values(acts)) e!.a.setEffectiveWeight(e === w ? 1 : 0);
      for (let i = 0; i < 12; i++) {
        this.applyTime(w, (i / 12) * ((w.spec.to ?? w.dur) - (w.spec.from ?? 0)));
        mixer.update(0);
        for (const b of body.tail) { const q = b.quaternion, sm = sums.get(b)!; const sg = sm.x * q.x + sm.y * q.y + sm.z * q.z + sm.w * q.w < 0 ? -1 : 1; sm.add(new THREE.Vector4(q.x, q.y, q.z, q.w).multiplyScalar(sg)); }
      }
      tailMean = new Map(body.tail.map((b) => { const v = sums.get(b)!.normalize(); return [b, new THREE.Quaternion(v.x, v.y, v.z, v.w)]; }));
      for (const e of Object.values(acts)) e!.a.setEffectiveWeight(e === acts.idle ? 1 : 0);
      if (acts.idle) { this.applyTime(acts.idle, 0); mixer.update(0); }
    }
    return { def, body, life, tailMean, applied: new Map(), lean, model, soft, softAmp: 0, jaw, gait, root, yaw, motion, mixer, acts, weights: { idle: 1, walk: 0, run: 0, look0: 0, look1: 0 } };
  }

  /** Tinch pozadan: suyaklar, ota-suyak aylanishi, son → barmoq vektori; burilish ishoralari sinab aniqlanadi */
  private rigGait(model: THREE.Object3D, g: ProcGait): GaitRig | null {
    const bone = (n: string) => model.getObjectByName(n) as THREE.Bone | undefined;
    const axis = new THREE.Vector3(...g.lateral).normalize();
    const fwd = new THREE.Vector3(...g.fwd).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
    const wp = (o: THREE.Object3D) => model.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    const legs: GaitRig['legs'] = [];
    for (const l of g.legs) {
      const hip = bone(l.hip), knee = bone(l.knee), ankle = bone(l.ankle), toe = bone(l.toe);
      if (!hip || !knee || !ankle || !toe) return null;
      const rest = [hip.quaternion.clone(), knee.quaternion.clone(), ankle.quaternion.clone()];
      const par = [wq(hip.parent!), wq(knee.parent!), wq(ankle.parent!)];
      const h = wp(hip), t = wp(toe);
      const v = t.clone().sub(h);
      const leg = { hip, knee, ankle, toe, offset: l.offset, rest, par, f0: v.dot(fwd), L: Math.hypot(v.dot(fwd), v.y), sHip: 1, sKnee: 1 };
      // ishora: son +burchakda barmoq oldinga siljishi, tizza +burchakda barmoq ko‘tarilishi kerak
      const t0 = wp(toe);
      this.setRot(leg.hip, leg.rest[0], leg.par[0], axis, 0.15);
      model.updateMatrixWorld(true);
      if (wp(toe).sub(t0).dot(fwd) < 0) leg.sHip = -1;
      hip.quaternion.copy(rest[0]);
      this.setRot(leg.knee, leg.rest[1], leg.par[1], axis, 0.3);
      model.updateMatrixWorld(true);
      if (wp(toe).y < t0.y) leg.sKnee = -1;
      knee.quaternion.copy(rest[1]);
      model.updateMatrixWorld(true);
      legs.push(leg);
    }
    const tail = g.tail.map(bone).filter((b): b is THREE.Bone => !!b).map((b) => ({ b, rest: b.quaternion.clone(), par: wq(b.parent!) }));
    const toeY = Math.min(...legs.map((l) => wp(l.toe).y));
    return { g, axis, up, legs, tail, toeY, amp: 0 };
  }

  private setRot(b: THREE.Object3D, rest: THREE.Quaternion, par: THREE.Quaternion, axis: THREE.Vector3, ang: number) {
    // local = P⁻¹ · Δ(o‘q, burchak) · P · rest — model fazosidagi o‘q atrofida burish
    const d = new THREE.Quaternion().setFromAxisAngle(axis, ang);
    b.quaternion.copy(par).invert().multiply(d).multiply(par).multiply(rest);
  }

  /** Protsedurali qadam: faza (s) — o‘yin holatidan; amp 0..1 — yurish/turish orasida silliq */
  private gaitPose(it: Inst, phase: number, walking: boolean, dt: number, step = 1) {
    const r = it.gait!;
    const g = r.g;
    r.amp += ((walking ? step : 0) - r.amp) * Math.min(1, dt / 0.35);
    const u = (((phase / g.period) % 1) + 1) % 1;
    for (const l of r.legs) {
      const v = (u + l.offset) % 1;
      let x: number, k = 0;
      if (v < g.stance) x = g.stride / 2 - (g.stride * v) / g.stance; // tayanch: bir tekis orqaga
      else { const s = (v - g.stance) / (1 - g.stance); x = -g.stride / 2 + g.stride * (0.5 - 0.5 * Math.cos(Math.PI * s)); k = g.lift * Math.sin(Math.PI * s); }
      x *= r.amp; k *= r.amp;
      const clamp = (a: number) => Math.max(-0.99, Math.min(0.99, a));
      const th = Math.asin(clamp((l.f0 + x) / l.L)) - Math.asin(clamp(l.f0 / l.L));
      this.setRot(l.hip, l.rest[0], l.par[0], r.axis, th * l.sHip);
      this.setRot(l.knee, l.rest[1], l.par[1], r.axis, k * l.sKnee);
      // panja yer bilan parallel qolsin (son va tizza burilishi qaytariladi)
      this.setRot(l.ankle, l.rest[2], l.par[2], r.axis, -(th * l.sHip + k * l.sKnee) * 0.8);
    }
    // dum qadamga mos ozgina chayqaladi (ikki qadamda bir marta)
    // dum va tos harakati — umumiy tana jonliligida (life)
    // tana: yerdagi (pastroq) barmoq tinch pozadagi balandlikda — oyoq yerga botmaydi va osilmaydi
    it.motion.position.y = 0;
    it.model.updateMatrixWorld(true);
    let low = Infinity;
    const p = new THREE.Vector3();
    for (const l of r.legs) { it.model.worldToLocal(l.toe.getWorldPosition(p)); low = Math.min(low, p.y); }
    it.motion.position.y = r.toeY - low;
  }

  /** 0..1: har ~8–13 o‘yin soniyasida 1,6 s silliq ochilib-yopiladi (o‘yin vaqti — pauzada to‘xtaydi) */
  private mouthOpen(d: HerdDino) {
    let h = 0;
    for (let i = 0; i < d.id.length; i++) h = (h * 31 + d.id.charCodeAt(i)) | 0;
    const cycle = 8 + (Math.abs(h) % 50) / 10;
    const p = ((this.game.simTime + (Math.abs(h) % 97) / 10) % cycle + cycle) % cycle;
    return p < 1.6 ? Math.sin((Math.PI * p) / 1.6) : 0;
  }

  /**
   * Og‘iz asosan yopiq; har ~8–13 o‘yin soniyasida 1,6 s silliq ochilib-yopiladi. Vaqt — o‘yin vaqti (pauzada to‘xtaydi).
   */
  private jawPose(it: Inst, d: HerdDino) {
    const j = it.def.jaw!;
    let h = 0;
    for (let i = 0; i < d.id.length; i++) h = (h * 31 + d.id.charCodeAt(i)) | 0;
    const cycle = 8 + (Math.abs(h) % 50) / 10;
    const p = ((this.game.simTime + (Math.abs(h) % 97) / 10) % cycle + cycle) % cycle;
    const m = p < 1.6 ? Math.sin((Math.PI * p) / 1.6) : 0;
    const a = j.closed + (j.open - j.closed) * m;
    this.setRot(it.jaw!.b, it.jaw!.rest, it.jaw!.par, it.jaw!.axis, a);
  }

  /** Bo‘yin-bosh zanjiri (nom bo‘yicha yoki eng oldingi suyakdan avtomatik), dum, tos; tinch poza saqlanadi */
  private rigBody(model: THREE.Object3D, def: HerdDef): BodyRig | null {
    const h = def.head!;
    const f = def.forward;
    const fwd = new THREE.Vector3(Math.cos(f), 0, Math.sin(f));
    const up = new THREE.Vector3(0, 1, 0);
    const lat = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const pitchSign = fwd.clone().applyAxisAngle(lat, 0.2).y > 0 ? 1 : -1;
    const byName = (n: string) => model.getObjectByName(n) as THREE.Bone | undefined;
    let neck: THREE.Bone[] = [];
    if (h.neck) neck = h.neck.map(byName).filter((b): b is THREE.Bone => !!b);
    else if (h.auto) {
      // eng oldingi suyak (shox/tumshuq) — uning ota-suyaklari tana o‘rtasidan oldinda bo‘lgani bo‘yin-bosh
      const bones: { b: THREE.Bone; f: number }[] = [];
      const p = new THREE.Vector3();
      model.traverse((o) => { if ((o as THREE.Bone).isBone) { o.getWorldPosition(p); bones.push({ b: o as THREE.Bone, f: model.worldToLocal(p.clone()).dot(fwd) }); } });
      if (bones.length) {
        const fs = bones.map((q) => q.f), mid = (Math.min(...fs) + Math.max(...fs)) / 2;
        const tip = bones.reduce((a, q) => (q.f > a.f ? q : a));
        let cur = tip.b.parent;
        const chain: THREE.Bone[] = [];
        while (cur && (cur as THREE.Bone).isBone && chain.length < 4) {
          const q = bones.find((x) => x.b === cur);
          if (!q || q.f < mid) break;
          chain.push(cur as THREE.Bone);
          cur = cur.parent;
        }
        neck = chain.reverse();
      }
    }
    const tail = (h.tail ?? []).map(byName).filter((b): b is THREE.Bone => !!b);
    const spine = (h.spine ?? []).map(byName).filter((b): b is THREE.Bone => !!b);
    const hips = h.hips ? byName(h.hips) ?? null : null;
    if (!neck.length && !tail.length) return null;
    const rest = new Map<THREE.Bone, THREE.Quaternion>();
    for (const b of [...neck, ...tail, ...spine, ...(hips ? [hips] : [])]) rest.set(b, b.quaternion.clone());
    return { neck, spine, tail, hips, rest, up, lat, fwd, pitchSign };
  }

  /**
   * Boshning maqsad yo‘nalishi (tanaga nisbatan; o‘yin konvensiyasida) va silliq yaqinlashish. Yurganda — burilishni
   * oldindan sezadi; diqqat nuqtasi bo‘lsa — unga; tinch turganda — sekin atrofga qaraydi. Pauzada o‘zgarmaydi.
   */
  private lifeStep(it: Inst, d: HerdDino, dt: number) {
    const L = it.life, h = it.def.head;
    const maxYaw = h?.maxYaw ?? 0.4, maxPitch = h?.maxPitch ?? 0.15;
    const t = this.game.simTime, s = L.seed;
    let yaw: number, pitch: number;
    if (d.speed > 0.05 && d.want !== undefined) {
      yaw = Math.atan2(Math.sin(d.want - d.heading), Math.cos(d.want - d.heading)) * 1.3 + 0.07 * Math.sin(t * 0.9 + s);
      pitch = -0.04 + 0.03 * Math.sin(t * 0.6 + s);
    } else if (d.focus) {
      const to = Math.atan2(d.focus.z - d.z, d.focus.x - d.x);
      yaw = Math.atan2(Math.sin(to - d.heading), Math.cos(to - d.heading));
      pitch = 0.04 + 0.03 * Math.sin(t * 0.5 + s);
    } else {
      // atrofga qarash: bir-biriga karrali bo‘lmagan sekin to‘lqinlar — takrorlanmaydi, keskin emas
      yaw = maxYaw * (0.65 * Math.sin(t * 0.21 + s) + 0.35 * Math.sin(t * 0.53 + 2.1 * s));
      pitch = maxPitch * (0.5 * Math.sin(t * 0.17 + 1.3 * s) - 0.35);
    }
    yaw = Math.max(-maxYaw, Math.min(maxYaw, yaw));
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    const walkT = d.anim === 'walk' || d.anim === 'run' ? (d.step ?? 1) : 0;
    L.walk += (walkT - L.walk) * (1 - Math.exp(-dt * 3.5));
    const k = 1 - Math.exp(-dt * 3);
    L.yaw += (yaw - L.yaw) * k;
    L.pitch += (pitch - L.pitch) * k;
    // burilishda tana ichkariga engashadi (tezlik × burchak tezligi)
    const leanT = Math.max(-0.07, Math.min(0.07, (d.omega ?? 0) * d.speed * 0.35));
    L.lean += (leanT - L.lean) * (1 - Math.exp(-dt * 3));
    // qiyalik: tana yer sirtiga moslanadi (old/orqa oyoqlar orasidagi balandlik farqi bo‘yicha), keskin emas
    const a = it.def.length * 0.35, ch = Math.cos(d.heading), sh = Math.sin(d.heading);
    const hf = groundHeight(d.x + ch * a, d.z + sh * a), hb = groundHeight(d.x - ch * a, d.z - sh * a);
    const hl = groundHeight(d.x - sh * a * 0.5, d.z + ch * a * 0.5), hr = groundHeight(d.x + sh * a * 0.5, d.z - ch * a * 0.5);
    const tf = Math.max(-0.5, Math.min(0.5, Math.atan2(hf - hb, 2 * a))), ts = Math.max(-0.2, Math.min(0.2, Math.atan2(hr - hl, a)));
    const kt = 1 - Math.exp(-dt * 4);
    L.tiltF += (tf - L.tiltF) * kt;
    L.tiltS += (ts - L.tiltS) * kt;
    const fwdL = new THREE.Vector3(Math.cos(it.def.forward), 0, Math.sin(it.def.forward));
    const latL = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwdL).normalize();
    // + tiltF: tumshuq yuqoriga (tepaga chiqyapti)
    const pitchS = fwdL.clone().applyAxisAngle(latL, 0.1).y > 0 ? 1 : -1;
    it.lean.quaternion.setFromAxisAngle(fwdL, L.lean * L.leanSign + L.tiltS * L.leanSign)
      .premultiply(new THREE.Quaternion().setFromAxisAngle(latL, L.tiltF * pitchS));
  }

  /** Tinch poza (har kadr boshida — qo‘shimcha burilishlar to‘planib qolmasin) */
  private resetBody(it: Inst) {
    if (!it.body) return;
    if (it.mixer) {
      for (const [b, m] of it.applied) b.quaternion.premultiply(m.clone().invert()).normalize();
      it.applied.clear();
      return;
    }
    for (const [b, q] of it.body.rest) b.quaternion.copy(q);
  }

  /**
   * Qo‘shimcha burilishlar (animatsiya/qadam pozasi ustidan): bo‘yin-bosh (boshga tomon ko‘proq), dum (burilishda
   * orqada qoladi + qadam bilan chayqaladi), tos (qadamga mos yonga chayqalish). Model fazosidagi o‘q atrofida.
   */
  private applyBody(it: Inst, d: HerdDino, walkAmp: number, gaitU: number) {
    const B = it.body;
    if (!B) return;
    it.model.updateMatrixWorld(true);
    const Mw = it.model.getWorldQuaternion(new THREE.Quaternion()).invert();
    const ops: { b: THREE.Bone; d: THREE.Quaternion; R: THREE.Quaternion }[] = [];
    const rel = (b: THREE.Bone) => Mw.clone().multiply(b.parent!.getWorldQuaternion(new THREE.Quaternion()));
    const n = B.neck.length;
    const wsum = (n * (n + 1)) / 2;
    B.neck.forEach((b, i) => {
      const w = (i + 1) / wsum;
      const dq = new THREE.Quaternion().setFromAxisAngle(B.up, -it.life.yaw * w)
        .multiply(new THREE.Quaternion().setFromAxisAngle(B.lat, B.pitchSign * it.life.pitch * w));
      ops.push({ b, d: dq, R: rel(b) });
    });
    const om = d.omega ?? 0;
    const u = gaitU * Math.PI * 2;
    // qadam bilan bosh biroz tebranadi (bir siklda ikki marta), tinch turganda nafas
    const bob = 0.035 * Math.sin(u * 2) * walkAmp + 0.012 * Math.sin(this.game.simTime * 1.3 + it.life.seed) * (1 - walkAmp);
    if (n) {
      const b = B.neck[n - 1];
      ops.push({ b, d: new THREE.Quaternion().setFromAxisAngle(B.lat, B.pitchSign * bob), R: rel(b) });
    }
    // bel: burilishda tananing oldi burilish tomonga oldinroq buriladi (dum teskari), yurishda chayqaladi, nafas
    B.spine.forEach((b, i) => {
      const k = (i + 1) / B.spine.length;
      const a = -Math.max(-0.14, Math.min(0.14, om * 0.12)) * (0.6 + 0.4 * k) + Math.sin(u + Math.PI / 2) * 0.025 * walkAmp;
      const breath = 0.01 * Math.sin(this.game.simTime * 1.3 + it.life.seed) * (1 - walkAmp);
      ops.push({ b, d: new THREE.Quaternion().setFromAxisAngle(B.up, a).multiply(new THREE.Quaternion().setFromAxisAngle(B.lat, B.pitchSign * breath)), R: rel(b) });
    });
    B.tail.forEach((b, i) => {
      const k = (i + 1) / B.tail.length;
      // o‘yin yo‘nalishi oshganda (ω>0) dum avvalgi yo‘nalishda qoladi → model aylanishi +ω·τ
      const a = Math.max(-0.12, Math.min(0.12, om * 0.09 * (0.5 + k))) + Math.sin(u + i * 0.5) * 0.03 * walkAmp * (0.6 + k);
      ops.push({ b, d: new THREE.Quaternion().setFromAxisAngle(B.up, a), R: rel(b) });
    });
    if (B.hips && walkAmp > 0.01) ops.push({ b: B.hips, d: new THREE.Quaternion().setFromAxisAngle(B.fwd, Math.sin(u) * 0.03 * walkAmp), R: rel(B.hips) });
    // local = R⁻¹ · Δ · R · local (R — ota-suyakning model fazosidagi aylanishi; o‘zgarishlardan oldin olingan)
    for (const o of ops) {
      const m = o.R.clone().invert().multiply(o.d).multiply(o.R).normalize();
      o.b.quaternion.premultiply(m).normalize();
      const prev = it.applied.get(o.b);
      it.applied.set(o.b, prev ? m.multiply(prev).normalize() : m);
    }
  }

  private applyTime(e: { a: THREE.AnimationAction; spec: ClipSpec; dur: number }, phase: number) {
    const sp = e.spec;
    let t: number;
    if (sp.frame !== undefined) t = sp.frame;
    else if (sp.from !== undefined && sp.to !== undefined) { const L = sp.to - sp.from; t = sp.from + (((phase % L) + L) % L); }
    else t = ((phase % e.dur) + e.dur) % e.dur;
    e.a.time = t;
    return t;
  }

  /** Har kadr: joy/yo‘nalish o‘yin holatidan; animatsiya fazasi o‘yin holatidan; vaznlar silliq almashadi */
  update(dt: number, _camPos: THREE.Vector3) {
    for (const d of this.game.herd.dinos) {
      let it = this.inst.get(d.id);
      if (!it) {
        // yangi nusxa (masalan, eski saqlashga qo‘shilgan) — model allaqachon yuklangan bo‘lsa quriladi
        const g = this.gltf.get(d.type);
        if (!g || !this.cloneFn) continue;
        it = this.build(HERD_BY_TYPE[d.type], g, this.cloneFn, this.status.find((s) => s.type === d.type)!, d.id);
        this.inst.set(d.id, it);
      }
      this.place(it, d);
      // pauzada bosh va tana holati ham to‘xtaydi
      const ldt = this.game.paused ? 0 : dt;
      this.lifeStep(it, d, ldt);
      this.resetBody(it);
      if (it.jaw) this.jawPose(it, d);
      if (it.gait) {
        this.gaitPose(it, d.phase.walk, d.anim === 'walk', dt, d.step ?? 1);
        this.applyBody(it, d, Math.min(it.gait.amp, it.life.walk + 0.001), (((d.phase.walk / it.gait.g.period) % 1) + 1) % 1);
        continue;
      }
      if (it.soft) {
        it.softAmp += ((d.anim === 'walk' ? (d.step ?? 1) : 0) - it.softAmp) * Math.min(1, dt / 0.35);
        it.motion.position.y = softPose(it.soft, d.phase.walk, it.softAmp, it.def.soft!);
        // og‘iz: asosan yopiq (≈0,44 rad), vaqti-vaqti bilan biroz ochiladi
        if (it.def.soft!.jaw) softJaw(it.soft, 0.44 - 0.3 * this.mouthOpen(d));
        // bosh: model aylanishi konvensiyasida yon burilish teskari ishorali
        if (it.def.soft!.head) softHead(it.soft, -it.life.yaw, it.life.pitch);
        continue;
      }
      if (!it.mixer) continue;
      const want: Record<string, number> = { idle: 0, walk: 0, run: 0, look0: 0, look1: 0 };
      const key = d.anim === 'look' ? (d.lookIdx === 1 ? 'look1' : 'look0') : d.anim;
      // sekin yurishda klip turish pozasi bilan qadam uzunligi nisbatida aralashadi (ritm saqlanadi, qadam qisqaradi)
      if ((key === 'walk' || key === 'run') && it.acts[key as keyof Inst['acts']] && it.acts.idle && !it.def.bakedMotion) {
        const st = Math.max(0, Math.min(1, d.step ?? 1));
        want[key] = st;
        want.idle = 1 - st;
      } else want[it.acts[key as keyof Inst['acts']] ? key : 'idle'] = 1;
      // raptor: siljish vertekslarda — ikki klip pozasini aralashtirib bo‘lmaydi (tana ikki joyga bo‘linadi), darhol almashadi
      const k = it.def.bakedMotion ? 1 : Math.min(1, dt / 0.3);
      let raptorT = 0;
      for (const name of Object.keys(it.acts) as (keyof Inst['acts'])[]) {
        const e = it.acts[name]!;
        it.weights[name] += (want[name] - it.weights[name]) * k;
        e.a.setEffectiveWeight(it.weights[name]);
        const ph = name === 'idle' ? d.phase.idle : name === 'walk' ? d.phase.walk : name === 'run' ? d.phase.run : d.phase.look;
        const t = this.applyTime(e, ph);
        if (it.weights[name] > 0.5) raptorT = t;
      }
      it.mixer.update(0);
      // klipdagi kuchli dum silkinishini yumshatish (o‘zgarish ham qayd qilinadi — keyingi kadrda aniq bekor qilinadi)
      if (it.tailMean && it.body) {
        const a = it.def.head!.tailDamp!;
        for (const b of it.body.tail) {
          const q0 = b.quaternion.clone().normalize();
          b.quaternion.copy(q0).slerp(it.tailMean.get(b)!, a).normalize();
          const m = b.quaternion.clone().multiply(q0.invert()).normalize();
          const prev = it.applied.get(b);
          it.applied.set(b, prev ? m.multiply(prev).normalize() : m);
        }
      }
      // klip ustidan: bosh-bo‘yin, dum (look klipi o‘ynayotganda bosh klipga qoldiriladi)
      if (it.body && d.anim !== 'look') {
        const wc = it.def.walk?.from !== undefined ? it.def.walk.to! - it.def.walk.from : (it.acts.walk?.dur ?? 1);
        this.applyBody(it, d, it.life.walk, (((d.phase.walk / wc) % 1) + 1) % 1);
      }
      // raptor: klipdagi oldinga siljish (vertekslarda) bekor qilinadi — joyida yuguradi, siljishni o‘yin beradi
      if (it.def.bakedMotion) {
        const f = it.def.forward;
        const off = it.def.bakedMotion.speed * raptorT;
        it.motion.position.set(-Math.cos(f) * off, 0, -Math.sin(f) * off);
      }
    }
  }

  private place(it: Inst, d: HerdDino) {
    it.root.position.set(d.x - WORLD_ORIGIN, groundHeight(d.x, d.z), d.z - WORLD_ORIGIN);
    // o‘yin yo‘nalishi (+X dan +Z ga) → three Y aylanishi; modelning old tomoni tuzatiladi
    it.yaw.rotation.y = it.def.forward - d.heading;
  }

  /** Testlar uchun: yuklangan modellar soni va har biri sahnadagi holati */
  diag() {
    return this.status.map((s) => {
      const its = [...this.inst.values()].filter((i) => i.def.type === s.type);
      return { ...s, inScene: its.length > 0, count: its.length, pos: its[0] ? its[0].root.position.toArray().map((v) => +v.toFixed(2)) : null };
    });
  }
}
