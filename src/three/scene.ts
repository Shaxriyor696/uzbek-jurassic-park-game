import * as THREE from 'three';
import { DinoWalker } from './dinoWalker';
import { ConstructionSite } from './constructionSite';
import { CATALOG } from '../game/catalog';
import { DEFAULT_CAMERA, type Game } from '../game/game';
import { ENTRY_CELL, isWater, footprintCells, footprintCenter, footprintSize, isLockedRoadCell } from '../game/grid';
import { E as EAST, manhattanPath, N as NORTH, S as SOUTH, straightPath, W as WEST } from '../game/roadNetwork';
import type { ObjectType, PlacedObject, Rotation } from '../game/types';
import { previewSupply, stationCapacity, stationRadius, supplyWord, usesNaturalWater, UTILITY_CONFIG } from '../game/utilities';
import { CameraController } from './camera';
import { createEnvironment, HALF, type Environment } from './environment';
import { createForest, createTerrainView, type TerrainView } from './terrainView';
import { createWaterView, type WaterView } from './waterView';
import { HerdView } from './herdView';
import { patrolPath } from '../game/dino';
import type { TerrainState } from '../game/terrain';
import { ModelFactory } from './modelFactory';
import { bridgeExtras, roadMesh } from './roads';
import { statusIconTexture } from './textures';
import { busStopModel, POLICE_LIGHTS, vehicleModel, type VehicleModel } from './vehicleModels';
import { DefenseView, defensePreviewModel, gateModel, gateSite, setGateOpen, wallProxy, wallRubble, wallSite, type DefenseSite, type GateModel } from './defenseModels';
import { gateCenter, variantKey, wallVariant, type DefenseEval } from '../game/defense';
import { isDefense, isWallPiece } from '../game/defenseDefs';

export interface HoverHint {
  text: string;
  ok: boolean;
  x: number;
  y: number;
}

interface Node {
  obj: THREE.Object3D;
  key: string;
  sprites: THREE.Sprite[];
}

const CLICK_PX = 5;

export function cellToWorld(x: number, z: number) {
  return new THREE.Vector3(x - HALF + 0.5, 0, z - HALF + 0.5);
}

/**
 * Three.js sahnasi: renderer, yorug‘lik, muhit, obyektlarni domen holatidan sinxronlash,
 * qurilish preview, overlaylar va sichqoncha/klaviatura boshqaruvi.
 */
export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: CameraController;
  private env: Environment;
  /** Tog‘lar (game.terrain o‘zgarsa — masalan boshqa tabdan yuklash — qayta quriladi) */
  terrainView: TerrainView | null = null;
  waterView: WaterView | null = null;
  private terrainRef: TerrainState | null = null;
  /** Chekka o‘rmon — tog‘lar yoki dinozavr marshruti o‘zgarsa qayta joylanadi */
  forest: { group: THREE.Group; count: number } | null = null;
  private forestKey: unknown = null;
  /** Testlar ham o‘qiydi (model o‘lchamlari) */
  readonly factory = new ModelFactory();
  private objectsRoot = new THREE.Group();
  private overlayRoot = new THREE.Group();
  private nodes = new Map<string, Node>();
  /** Tayyor himoya devorlari (bo‘laklarda birlashtirilgan) */
  readonly defenseView = new DefenseView();
  /** Himoyalangan hudud xaritasi (ichki maydon, himoyali/himoyasiz binolar, ochiq joy) */
  private protectRoot = new THREE.Group();
  private protectRef: DefenseEval | null = null;
  private gapMarker: THREE.Mesh | null = null;
  private sun: THREE.DirectionalLight;
  private worldVersion = -1;
  private lastQuality = '';
  private raf = 0;
  private lastT = performance.now();
  private elapsed = 0;
  private disposed = false;
  private dino: THREE.Group | null = null;
  private dinoRoot: THREE.Group | null = null;
  private jawBone: THREE.Bone | null = null;
  private wingBones: THREE.Object3D[] = [];

  // preview / overlay
  private ghost: THREE.Object3D | null = null;
  private ghostKey = '';
  private ghostMatOk = new THREE.MeshStandardMaterial({ color: '#3ddc84', transparent: true, opacity: 0.55, depthWrite: false, emissive: '#1b7f45', emissiveIntensity: 0.4 });
  private ghostMatBad = new THREE.MeshStandardMaterial({ color: '#ff5050', transparent: true, opacity: 0.55, depthWrite: false, emissive: '#7f1b1b', emissiveIntensity: 0.4 });
  private footprint: THREE.Mesh;
  private rangeDisk: THREE.Mesh;
  private rangeRing: THREE.Line;
  private selRange: THREE.Mesh;
  private selRing: THREE.Line;
  private roadPreview = new THREE.Group();
  private selBox = new THREE.Box3Helper(new THREE.Box3(), '#22d3ee');
  private hoverBox = new THREE.Box3Helper(new THREE.Box3(), '#ff4d4d');

  // input
  private pointer: { id: number; button: number; x: number; y: number; moved: boolean; lx: number; ly: number; touch: boolean } | null = null;
  private hoverCell: { x: number; z: number } | null = null;
  private roadStart: { x: number; z: number } | null = null;
  private roadPath: { x: number; z: number }[] = [];
  private keys = new Set<string>();
  private raycaster = new THREE.Raycaster();

  hint: HoverHint | null = null;
  private hintListeners = new Set<() => void>();
  fps = 0;
  /** Har kadr chaqiriladigan qo‘shimcha ishlar (audio) — dt soniyada */
  readonly frameHooks = new Set<(dt: number) => void>();
  frameCount = 0;
  /** Yuradigan dinozavr (public/models/apato.glb) */
  dinoWalker!: DinoWalker;
  herdView!: HerdView;
  private fpsFrames = 0;
  private fpsTime = 0;
  /** Telefon/planshet (sensorli ekran): GPU kuchsizroq — yengil sozlamalar */
  private readonly mobile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  /** Moslashuvchan o‘lchov: FPS past bo‘lsa render aniqligi (pixel ratio) pasayadi, yaxshilansa qaytadi */
  private dynScale = 1;
  private slowSecs = 0;
  private fastSecs = 0;
  /** FPS juda past — soyalar vaqtincha o‘chiriladi (saqlangan sozlama o‘zgarmaydi) */
  private autoNoShadows = false;

  constructor(private container: HTMLElement, private game: Game) {
    this.renderer = new THREE.WebGLRenderer({ antialias: !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches), powerPreference: 'high-performance' });
    // qurilish maydonida bino o‘z modeli kesish tekisligi bilan pastdan ochiladi
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.type = this.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'scene-canvas';
    this.renderer.domElement.setAttribute('data-testid', 'scene');
    // Konteyner CSS da absolute + inset:0 (to‘liq ekran). Bu yerda «relative» yozilsa balandligi kanvasga bog‘lanib qolib, pastki qism bo‘sh qolardi.
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#d6ecf7');
    // tuman kamera masofasiga qarab (updateFog) — yaqin/o‘rta masofa tiniq, faqat ufq yumshoq yo‘qoladi
    this.scene.fog = new THREE.Fog('#d6ecf7', 60, 220);

    // yumshoq kunduzgi yorug‘lik: osmondan keladigan sovuq to‘ldiruvchi + iliq quyosh
    const hemi = new THREE.HemisphereLight('#eaf6ff', '#b4c48f', 1.15);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#fff0d8', 2.3);
    this.sun.position.set(-16, 26, 12);
    this.sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    this.sun.shadow.radius = 3;
    const sc = this.sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 90;
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.env = createEnvironment();
    this.loadDinoModel();
    // ?nodino — faqat avtomatik sinovlar uchun (dinozavrlarsiz bo‘sh xarita); o‘yinchi uchun doim yoqilgan
    const noDino = new URLSearchParams(location.search).has('nodino');
    this.dinoWalker = new DinoWalker(this.scene, game, !noDino);
    // 7 ta yangi dinozavr (public/models/dinosaurs); ?nodino — sinovlar uchun o‘chiq
    if (noDino) { game.herd.disabled = true; game.herd.dinos = []; }
    this.herdView = new HerdView(this.scene, game, !noDino);
    this.scene.add(this.env.group, this.objectsRoot, this.overlayRoot, this.defenseView.root);
    this.overlayRoot.add(this.protectRoot);

    this.footprint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3ddc84', transparent: true, opacity: 0.45, depthWrite: false }));
    this.footprint.renderOrder = 2;
    const disk = () => new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f5c542', transparent: true, opacity: 0.16, depthWrite: false }));
    const ring = () => {
      const pts = [];
      for (let i = 0; i <= 96; i++) pts.push(new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2), 0, Math.sin((i / 96) * Math.PI * 2)));
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#f5c542' }));
    };
    this.rangeDisk = disk();
    this.rangeRing = ring();
    this.selRange = disk();
    this.selRing = ring();
    this.overlayRoot.add(this.footprint, this.rangeDisk, this.rangeRing, this.selRange, this.selRing, this.roadPreview, this.selBox, this.hoverBox);
    for (const o of [this.footprint, this.rangeDisk, this.rangeRing, this.selRange, this.selRing, this.selBox, this.hoverBox]) o.visible = false;

    const rect = container.getBoundingClientRect();
    this.cam = new CameraController(rect.width / Math.max(1, rect.height), game.camera, (s) => game.setCamera(s));
    this.resize();

    this.bindInput();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------- sinxronlash ----------------

  private async loadDinoModel() {
    const { createGltfLoader, liteModelUrl } = await import('./gltfLoader');
    const loader = createGltfLoader();
    loader.load(
      liteModelUrl('Pteradactal.glb'),
      (gltf: { scene: THREE.Group }) => {
        const root = new THREE.Group();
        const model = gltf.scene;
        model.name = 'dino';
        model.scale.setScalar(1.7);
        model.rotation.set(1.35, 0, 0);
        model.traverse((child: THREE.Object3D) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        const jawBone = model.getObjectByName('jaw16') as THREE.Bone | null;
        if (jawBone) {
          this.jawBone = jawBone;
        }
        model.traverse((child: THREE.Object3D) => {
          const name = child.name.toLowerCase();
          if (name.includes('wing') || name.includes('arm')) {
            child.userData.baseWingRotation = {
              x: child.rotation.x,
              y: child.rotation.y,
              z: child.rotation.z,
            };
            this.wingBones.push(child);
          }
        });
        root.add(model);
        root.position.set(24, 4.5, 20);
        this.dinoRoot = root;
        this.dino = model;
        this.scene.add(root);
      },
      undefined,
      (error: unknown) => {
        console.warn('Dino GLB yuklanmadi:', error);
      },
    );
  }

  private updateWalkingDino() {
    if (!this.dino || !this.dinoRoot) return;
    const t = this.elapsed;
    const x = 24 + Math.sin(t * 0.45) * 8;
    const z = 20 + Math.cos(t * 0.35) * 7.5;
    const y = 4.6 + Math.sin(t * 2.2) * 0.12;
    const dx = Math.cos(t * 0.45) * 8 * 0.45;
    const dz = -Math.sin(t * 0.35) * 7.5 * 0.35;
    const yaw = Math.atan2(dz, dx) + Math.PI / 2;

    this.dinoRoot.position.set(x, y, z);
    this.dinoRoot.rotation.y = yaw;
    this.dino.rotation.x = 1.35;
    this.dino.rotation.y = 0;
    this.dino.rotation.z = 0;

    if (this.jawBone) {
      const jawOpen = 0.18 + Math.sin(t * 1.6) * 0.22;
      this.jawBone.rotation.x = jawOpen;
      this.jawBone.rotation.z = 0;
    }

    for (let i = 0; i < this.wingBones.length; i++) {
      const wing = this.wingBones[i];
      const base = wing.userData.baseWingRotation ?? { x: wing.rotation.x, y: wing.rotation.y, z: wing.rotation.z };
      const dir = wing.name.toLowerCase().includes('left') ? -1 : 1;
      const flap = Math.sin(t * 1.8 + i * 0.7) * 0.22 * dir;
      wing.rotation.z = base.z + flap;
      wing.rotation.x = base.x + Math.abs(flap) * 0.12;
    }
  }

  /** Bekat old tomoni (+Z) qo‘shni yo‘lga qaraydi */
  private stopFacing(x: number, z: number) {
    const r = this.game.roads;
    if (r.isRoad(x, z + 1)) return 0;
    if (r.isRoad(x + 1, z)) return Math.PI / 2;
    if (r.isRoad(x, z - 1)) return Math.PI;
    if (r.isRoad(x - 1, z)) return -Math.PI / 2;
    return 0;
  }

  private wallVariantOf(o: PlacedObject) {
    return wallVariant(o, (x, z) => this.game.objectAt(x, z));
  }

  private nodeKey(o: PlacedObject) {
    if (isWallPiece(o.type)) {
      if (!o.build && (o.damage ?? 0) >= 1) return 'defb';
      if (!o.build) return 'defp';
      const v = this.wallVariantOf(o);
      return 'defs:' + variantKey(v) + '|' + v.pillarEdges;
    }
    if (o.type === 'himoya_darvoza') {
      const c = gateCenter(o);
      return `gate:${o.build ? 'q' : ''}:${this.game.roads.maskAt(c.x, c.z)}:${(o.damage ?? 0) >= 1 ? 'b' : ''}`;
    }
    if (o.type === 'avtobus_bekati') return 'stop:' + this.stopFacing(o.gridX, o.gridZ);
    if (o.type === 'road') return 'road:' + this.roadMask(o.gridX, o.gridZ) + (isWater(o.gridX, o.gridZ) ? ':kopr' : '');
    return `${o.type}:${o.rotation}:${o.gridX}:${o.gridZ}${o.build ? ':qurilish' : ''}`;
  }

  private roadMask(x: number, z: number) {
    let m = this.game.roads.maskAt(x, z);
    if (x === ENTRY_CELL.x && z === ENTRY_CELL.z && this.game.roads.hasEntry) m |= WEST; // eski kirish yo‘li xaritadan tashqariga davom etadi
    return m;
  }

  private buildNode(o: PlacedObject): THREE.Object3D {
    if (isWallPiece(o.type)) {
      // tayyor devor — DefenseView bo‘lagida; bu yerda faqat tanlash uchun ko‘rinmas tutqich
      if (o.build) {
        const site = wallSite(this.wallVariantOf(o), o.build);
        site.group.position.copy(cellToWorld(o.gridX, o.gridZ));
        site.group.userData.site = site;
        site.group.add(wallProxy());
        return site.group;
      }
      const g = new THREE.Group();
      g.add(wallProxy());
      if ((o.damage ?? 0) >= 1) g.add(wallRubble()); // buzilgan — vayrona (ta’mirlash kerak)
      g.position.copy(cellToWorld(o.gridX, o.gridZ));
      return g;
    }
    if (o.type === 'himoya_darvoza') {
      const c = gateCenter(o);
      const outer = new THREE.Group();
      outer.position.copy(cellToWorld(c.x, c.z));
      outer.add(roadMesh(this.game.roads.maskAt(c.x, c.z)));
      const inner = new THREE.Group();
      inner.rotation.y = -o.rotation * (Math.PI / 2);
      outer.add(inner);
      if (o.build) {
        const site = gateSite(o.build);
        inner.add(site.group);
        outer.userData.site = site;
      } else {
        const gm = gateModel(o.gate ?? null);
        inner.add(gm.group);
        outer.userData.gate = gm;
        // buzilgan darvoza: qanotlari yiqilgan (o‘tish ochiq)
        if ((o.damage ?? 0) >= 1) { gm.leafL.visible = false; gm.leafR.visible = false; }
      }
      return outer;
    }
    if (o.type === 'avtobus_bekati') {
      const g = busStopModel();
      g.position.copy(cellToWorld(o.gridX, o.gridZ));
      g.rotation.y = this.stopFacing(o.gridX, o.gridZ);
      return g;
    }
    if (o.type === 'road') {
      const g = new THREE.Group();
      const rm = roadMesh(this.roadMask(o.gridX, o.gridZ));
      g.add(rm);
      // yo‘lda turgan bezak mashinalar yo‘q — haqiqiy transport (traffic.ts) yuradi
      const onWater = isWater(o.gridX, o.gridZ);
      if (onWater || isLockedRoadCell(o.gridX, o.gridZ)) {
        // ko‘prik panjarasi yo‘l yo‘nalishi bo‘ylab: shimol–janub yo‘lda 90° buriladi
        const m = this.roadMask(o.gridX, o.gridZ);
        const br = bridgeExtras();
        if (m & (NORTH | SOUTH) && !(m & (EAST | WEST))) br.rotation.y = Math.PI / 2;
        g.add(br);
      }
      g.position.copy(cellToWorld(o.gridX, o.gridZ));
      return g;
    }
    const c = footprintCenter(o);
    if (o.build) {
      // qurilish maydoni: binoning o‘z modeli asosida (umumiy geometriya, materiallar nusxasi kesish uchun)
      const cat = CATALOG[o.type];
      const site = new ConstructionSite(this.factory.create(o.type), cat.width, cat.depth);
      site.group.position.set(c.x - HALF, 0, c.z - HALF);
      site.group.rotation.y = -o.rotation * (Math.PI / 2);
      site.group.userData.site = site;
      site.update(o.build);
      return site.group;
    }
    const obj = this.factory.create(o.type);
    obj.position.set(c.x - HALF, 0, c.z - HALF);
    obj.rotation.y = -o.rotation * (Math.PI / 2);
    return obj;
  }

  private syncObjects() {
    const seen = new Set<string>();
    for (const o of this.game.objects.values()) {
      seen.add(o.id);
      const key = this.nodeKey(o);
      let n = this.nodes.get(o.id);
      if (!n || n.key !== key) {
        if (n) this.removeNodeObj(n.obj);
        const obj = this.buildNode(o);
        obj.userData.id = o.id;
        obj.traverse((ch) => { ch.userData.id = o.id; });
        this.objectsRoot.add(obj);
        n = { obj, key, sprites: n?.sprites ?? [] };
        this.nodes.set(o.id, n);
      }
      this.syncStatusSprites(o, n);
    }
    for (const [id, n] of this.nodes) {
      if (seen.has(id)) continue;
      this.removeNodeObj(n.obj);
      for (const s of n.sprites) this.overlayRoot.remove(s);
      this.nodes.delete(id);
    }
    this.syncDefense();
    this.updateDecor();
    this.applyShadows();
  }

  /** Tayyor devorlar: o‘zgargan bo‘laklargina qayta birlashtiriladi */
  private syncDefense() {
    const cells: Parameters<DefenseView['sync']>[0] = [];
    for (const o of this.game.objects.values()) {
      if (!isWallPiece(o.type) || o.build || (o.damage ?? 0) >= 1) continue;
      const w = cellToWorld(o.gridX, o.gridZ);
      cells.push({ x: o.gridX, z: o.gridZ, v: this.wallVariantOf(o), wx: w.x, wz: w.z });
    }
    this.defenseView.sync(cells);
  }

  /** Node olib tashlanadi; qurilish maydoni bo‘lsa — uning vaqtinchalik resurslari tozalanadi (umumiylar emas). */
  private removeNodeObj(obj: THREE.Object3D) {
    this.objectsRoot.remove(obj);
    (obj.userData.site as ConstructionSite | undefined)?.dispose();
  }

  /** Har kadr: qurilish maydonlari holati (faqat o‘yin vaqtidagi elapsed dan). */
  private updateSites() {
    for (const [id, n] of this.nodes) {
      const gm = n.obj.userData.gate as GateModel | undefined;
      if (gm) { this.updateGate(id, n.obj, gm); continue; }
      const site = n.obj.userData.site as ConstructionSite | DefenseSite | undefined;
      if (!site) continue;
      const o = this.game.objects.get(id);
      if (o?.build) site.update(o.build);
    }
  }

  /** Darvoza qanotlari holati (o‘yin holatidan, har kadr); o‘tayotgan transport — traffic.ts */
  private updateGate(id: string, _obj: THREE.Object3D, gm: GateModel) {
    const s = this.game.objects.get(id)?.gate;
    if (s) setGateOpen(gm, s.open);
  }

  // ---------------- transport ----------------

  private vehicleRoot = new THREE.Group();
  private vehicleViews = new Map<string, VehicleModel & { kind: string }>();
  private stubRoot = new THREE.Group();
  private stubKey = '';
  private arrivalSprites = new Map<string, { sprite: THREE.Sprite; t0: number }>();
  private vehicleSel = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.9, depthWrite: false }));

  /**
   * Transport: har kadr faqat pozitsiya, burilish va g‘ildirak aylanishi yangilanadi; model faqat yangi transport
   * paydo bo‘lganda yaratiladi va xarita chetidan ketganda olib tashlanadi (geometriya umumiy).
   */
  private updateVehicles() {
    const g = this.game;
    if (!this.vehicleRoot.parent) { this.scene.add(this.vehicleRoot, this.stubRoot); this.vehicleSel.renderOrder = 6; this.overlayRoot.add(this.vehicleSel); }
    this.syncStubs();
    const seen = new Set<string>();
    for (const v of g.traffic.allVehicles()) {
      seen.add(v.id);
      let view = this.vehicleViews.get(v.id);
      if (!view) {
        view = { ...vehicleModel(v.kind, v.look), kind: v.kind };
        view.group.userData.vehicleId = v.id;
        view.group.traverse((o) => { o.userData.vehicleId = v.id; });
        this.vehicleRoot.add(view.group);
        this.vehicleViews.set(v.id, view);
      }
      view.group.position.set(v.x - HALF, 0.005, v.z - HALF);
      view.group.rotation.y = Math.atan2(Math.cos(v.heading), Math.sin(v.heading));
      for (const w of view.wheels) w.rotation.x = v.wheel;
    }
    for (const [id, view] of this.vehicleViews) if (!seen.has(id)) { this.vehicleRoot.remove(view.group); this.vehicleViews.delete(id); }
    // politsiya chirog‘i: qizil va ko‘k navbat bilan miltillaydi
    const ph = Math.floor(this.elapsed * 4) % 2;
    POLICE_LIGHTS.red.emissiveIntensity = ph ? 2.2 : 0.15;
    POLICE_LIGHTS.blue.emissiveIntensity = ph ? 0.15 : 2.2;
    const sel = g.selectedVehicle ? this.vehicleViews.get(g.selectedVehicle) : undefined;
    this.vehicleSel.visible = !!sel;
    if (sel) { this.vehicleSel.position.set(sel.group.position.x, 0.06, sel.group.position.z); this.vehicleSel.scale.setScalar(sel.kind === 'bus' ? 1.5 : 0.8); }
    else if (g.selectedVehicle) g.selectVehicle(null); // xaritadan ketdi
    this.updateArrivals();
  }

  /** Xarita chetidagi yo‘ldan tashqariga davom etadigan tashqi yo‘llar (transport shu yerdan kirib-chiqadi) */
  private syncStubs() {
    const gr = this.game.traffic.graph;
    const key = gr ? gr.entries.map((e) => `${e.cell.x},${e.cell.z},${e.stub.length}`).join(';') : '';
    if (key === this.stubKey) return;
    this.stubKey = key;
    for (const c of [...this.stubRoot.children]) this.stubRoot.remove(c);
    if (!gr) return;
    for (const e of gr.entries) for (const c of e.stub) {
      // xarita chetidan — asfalt tashqi yo‘l; shahar chetidan — tuproq yo‘l
      const rm = e.kind === 'edge' ? roadMesh(e.dir % 2 === 0 ? NORTH | SOUTH : EAST | WEST) : new THREE.Mesh(this.trackGeo, this.trackMat);
      if (e.kind === 'track') { rm.rotation.y = e.dir % 2 === 0 ? 0 : Math.PI / 2; rm.receiveShadow = true; }
      rm.position.copy(cellToWorld(c.x, c.z));
      this.stubRoot.add(rm);
    }
    this.forestKey = null; // tashqi yo‘l ustida daraxt qolmasin
  }

  private trackGeo = new THREE.BoxGeometry(0.62, 0.02, 1.02).translate(0, 0.01, 0);
  private trackMat = new THREE.MeshStandardMaterial({ color: '#a88a62', roughness: 1 });
  private arrivalTex = new Map<number, THREE.SpriteMaterial>();
  /** Uyga yetib kelganlar: «+N» belgisi qisqa ko‘tarilib so‘nadi (majburiy oyna yo‘q) */
  private updateArrivals() {
    const list = this.game.traffic.arrivals;
    const live = new Set<string>();
    for (const a of list) {
      const k = a.house + ':' + a.t;
      live.add(k);
      if (this.arrivalSprites.has(k)) continue;
      let m = this.arrivalTex.get(a.count);
      if (!m) {
        const cv = document.createElement('canvas');
        cv.width = 128; cv.height = 64;
        const c = cv.getContext('2d')!;
        c.fillStyle = 'rgba(22,163,74,0.92)';
        c.beginPath(); c.roundRect(4, 8, 120, 48, 22); c.fill();
        c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`+${a.count} 👤`, 64, 33);
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
        this.arrivalTex.set(a.count, m);
      }
      const sp = new THREE.Sprite(m.clone());
      sp.scale.set(1.1, 0.55, 1);
      sp.renderOrder = 11;
      const o = this.game.objects.get(a.house);
      const c = o ? footprintCenter(o) : { x: a.x + 1, z: a.z + 1 };
      sp.position.set(c.x - HALF, 1.4, c.z - HALF);
      this.overlayRoot.add(sp);
      this.arrivalSprites.set(k, { sprite: sp, t0: this.elapsed });
    }
    for (const [k, v] of this.arrivalSprites) {
      const age = this.elapsed - v.t0;
      v.sprite.position.y = 1.4 + age * 0.35;
      (v.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - age / 2.5);
      if (age > 2.5 || !live.has(k)) { this.overlayRoot.remove(v.sprite); this.arrivalSprites.delete(k); }
    }
  }

  /** Transportni tanlash (sichqoncha) */
  pickVehicle(clientX: number, clientY: number): string | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.cam.camera);
    const hit = this.raycaster.intersectObjects(this.vehicleRoot.children, true)[0];
    return (hit?.object.userData.vehicleId as string | undefined) ?? null;
  }


  private spriteMats = new Map<string, THREE.SpriteMaterial>();
  private damageMat(): THREE.SpriteMaterial {
    let m = this.spriteMats.get('damage');
    if (!m) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const c = cv.getContext('2d')!;
      c.fillStyle = '#dc2626';
      c.beginPath(); c.arc(32, 32, 29, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 5; c.lineCap = 'round';
      // yoriq belgisi
      c.beginPath(); c.moveTo(26, 12); c.lineTo(36, 28); c.lineTo(27, 36); c.lineTo(38, 52); c.stroke();
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
      this.spriteMats.set('damage', m);
    }
    return m;
  }

  private syncStatusSprites(o: PlacedObject, n: Node) {
    for (const s of n.sprites) this.overlayRoot.remove(s);
    n.sprites = [];
    const c = CATALOG[o.type];
    if ((o.damage ?? 0) >= 1 && !o.build) {
      // dinozavr shikastlagan — ta’mirlash belgisi
      const box = new THREE.Box3().setFromObject(n.obj);
      const fc = footprintCenter(o);
      const s = new THREE.Sprite(this.damageMat());
      s.scale.set(0.6, 0.6, 1);
      s.position.set(fc.x - HALF, Math.max(box.max.y, 0.4) + 0.45, fc.z - HALF);
      s.renderOrder = 10;
      s.userData.statusIcon = 'damage';
      this.overlayRoot.add(s);
      n.sprites.push(s);
      return;
    }
    if (o.type === 'road' || (!c.needsRoad && !c.needsUtilities)) return;
    const st = this.game.statuses.get(o.id);
    if (!st) return;
    // Xaritada har binoda faqat eng muhim bitta ogohlantirish: yo‘l → elektr → suv.
    // Qolgan muammolar bino tanlanganda panelda ko‘rinadi.
    const top = c.needsRoad && !st.road ? 'road' : c.needsUtilities && !st.power ? 'power' : c.needsUtilities && !st.water ? 'water' : null;
    if (!top) return;
    const missing = [top] as const;
    const box = new THREE.Box3().setFromObject(n.obj);
    const center = footprintCenter(o);
    missing.forEach((k, i) => {
      let m = this.spriteMats.get(k);
      if (!m) {
        m = new THREE.SpriteMaterial({ map: statusIconTexture(k), depthTest: false, transparent: true });
        this.spriteMats.set(k, m);
      }
      const s = new THREE.Sprite(m);
      s.scale.set(0.55, 0.55, 1);
      s.position.set(center.x - HALF + (i - (missing.length - 1) / 2) * 0.6, box.max.y + 0.45, center.z - HALF);
      s.renderOrder = 10;
      s.userData.statusIcon = k;
      this.overlayRoot.add(s);
      n.sprites.push(s);
    });
  }

  private shadowsOn: boolean | null = null;
  private seenMaterials = new WeakSet<THREE.Material>();

  /** Yangi qo‘shilgan modellar materiallari soyali dastur bilan kompilyatsiya bo‘lishi uchun. */
  private markNewMaterials() {
    this.objectsRoot.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m) && !this.seenMaterials.has(m)) {
        this.seenMaterials.add(m);
        m.needsUpdate = true;
      }
    });
  }

  /** Har soniyada: FPS < 28 (3 s) — aniqlik pasayadi, eng pastda soyalar o‘chadi; FPS ≥ 50 (6 s) — asta qaytadi */
  private adaptQuality() {
    if (this.fps < 28) { this.slowSecs++; this.fastSecs = 0; } else if (this.fps >= 50) { this.fastSecs++; this.slowSecs = 0; } else { this.slowSecs = 0; this.fastSecs = 0; }
    if (this.slowSecs >= 3) {
      this.slowSecs = 0;
      if (this.dynScale > 0.65) { this.dynScale = Math.max(0.6, this.dynScale - 0.15); this.resize(); }
      else if (!this.autoNoShadows && this.shadowsOn) { this.autoNoShadows = true; this.applyShadows(); }
    } else if (this.fastSecs >= 6) {
      this.fastSecs = 0;
      if (this.dynScale < 1) { this.dynScale = Math.min(1, this.dynScale + 0.1); this.resize(); }
    }
  }

  private applyShadows() {
    const high = this.game.settings.quality === 'high' && !this.autoNoShadows;
    if (this.shadowsOn === high) return;
    this.shadowsOn = high;
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    // Shader dasturlari soya holatiga bog‘liq — o‘zgarganda qayta kompilyatsiya
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
  }

  // ---------------- preview va overlay ----------------

  private updateOverlays() {
    const g = this.game;
    const roadTool = g.tool === 'road' || g.tool === 'bridge';
    const buildMode = g.tool === 'build' || roadTool || g.tool === 'wall';
    this.env.grid.visible = buildMode;

    // qurilish preview
    let showGhost = false;
    this.rangeDisk.visible = this.rangeRing.visible = false;
    this.footprint.visible = false;
    if (g.tool === 'build' && g.buildType && this.hoverCell && !g.modal) {
      const type = g.buildType;
      const rot = g.buildRotation;
      const { w, d } = footprintSize(type, rot);
      // kursor footprint markazida bo‘lishi uchun
      const gx = this.hoverCell.x - Math.floor((w - 1) / 2);
      const gz = this.hoverCell.z - Math.floor((d - 1) / 2);
      const res = g.checkPlacement(type, gx, gz, rot);
      const key = type;
      if (this.ghostKey !== key) {
        if (this.ghost) this.overlayRoot.remove(this.ghost);
        // himoya qismi: burchak ikki qo‘li bilan (aylantirish yo‘nalishni ko‘rsatadi), darvoza — yopiq holatda
        this.ghost = isDefense(type) ? defensePreviewModel(type, EAST | SOUTH) : type === 'avtobus_bekati' ? busStopModel() : this.factory.create(type);
        this.ghostKey = key;
        this.overlayRoot.add(this.ghost);
      }
      const ghost = this.ghost!;
      ghost.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) {
          (m as THREE.Mesh).material = res.ok ? this.ghostMatOk : this.ghostMatBad;
          m.castShadow = false;
        }
      });
      const c = footprintCenter({ type, gridX: gx, gridZ: gz, rotation: rot });
      // tog‘ ustida — arvoh va qizil iz relyef sirtida (aks holda tog‘ ichida ko‘rinmay qolardi)
      let lift = 0;
      if (g.terrainField) for (const fc of footprintCells(type, gx, gz, rot)) lift = Math.max(lift, g.terrainField.cellHeight(fc.x, fc.z));
      ghost.position.set(c.x - HALF, 0.02 + lift, c.z - HALF);
      ghost.rotation.y = -rot * (Math.PI / 2);
      showGhost = true;
      this.footprint.visible = true;
      this.footprint.scale.set(w, 1, d);
      this.footprint.position.set(c.x - HALF, 0.06 + lift, c.z - HALF);
      (this.footprint.material as THREE.MeshBasicMaterial).depthTest = lift === 0;
      (this.footprint.material as THREE.MeshBasicMaterial).color.set(res.ok ? '#3ddc84' : '#ff4d4d');
      const spot = { type, gridX: gx, gridZ: gz, rotation: rot };
      // elektr/suv sig‘im bo‘yicha (yo‘l tarmog‘i orqali) — radius doirasi ko‘rsatilmaydi
      const capKind = UTILITY_CONFIG.mode === 'capacity' && (CATALOG[type].kind === 'power' || CATALOG[type].kind === 'water');
      const r = capKind ? 0 : stationRadius(spot);
      if (r > 0) this.placeRange(this.rangeDisk, this.rangeRing, c.x, c.z, r, CATALOG[type].kind);
      let text = res.ok ? `${CATALOG[type].name} — ${fmtCost(res.cost)}` : res.reason;
      if (res.ok && capKind) text += ` · ${stationCapacity({ ...spot, id: '', residents: 0, outageTicks: 0, userPlaced: true })} ta binogacha ta’minlaydi`;
      if (res.ok && usesNaturalWater(spot)) text += capKind ? ' (ko‘l bo‘yida, tabiiy suv)' : ` · ko‘l bo‘yida: suv tabiiy manbadan, radius ${r} katak`;
      if (res.ok) {
        // Shu joyda nima yetishmasligini qurishdan oldin ko‘rsatadi
        const lacks = previewSupply({ type, gridX: gx, gridZ: gz, rotation: rot }, g.objects.values(), g.statuses, g.roads);
        if (lacks.length) text += ` · bu yerda ${lacks.map(supplyWord).join(', ')} yo‘q`;
      }
      if (this.armed?.kind === 'build' && this.armed.key === `${type}:${gx}:${gz}:${rot}` && res.ok) text = '👆 Tasdiqlash uchun shu joyga yana bir marta bosing · ' + text;
      this.setHint({ text, ok: res.ok });
      this.pendingPlacement = { type, gx, gz, rot };
    } else {
      this.pendingPlacement = null;
    }
    if (this.ghost) this.ghost.visible = showGhost;

    // yo‘l preview
    this.roadPreview.clear();
    if (roadTool && !g.modal) {
      const cells = this.roadStart ? this.roadPath : this.hoverCell ? [this.hoverCell] : [];
      if (cells.length) {
        const res = g.checkRoadPath(cells, g.tool === 'bridge');
        for (const c of cells) {
          const exists = g.roads.isRoad(c.x, c.z);
          const m = new THREE.Mesh(this.cellGeo, exists ? this.cellMatExisting : res.ok ? this.cellMatOk : this.cellMatBad);
          m.position.copy(cellToWorld(c.x, c.z)).setY(0.07 + (g.terrainField?.cellHeight(c.x, c.z) ?? 0));
          m.renderOrder = 3;
          this.roadPreview.add(m);
        }
        const text = !res.ok ? res.reason : g.tool === 'bridge' ? `${res.reason} — ${fmtCost(res.cost)}` : `Yo‘l: ${res.newCells.length} ta yangi katak — ${fmtCost(res.cost)}`;
        this.setHint({ text, ok: res.ok });
      }
    }

    // himoya devori: tortib chizish preview (yashil — quriladi, qizil — to‘siq, ko‘k — mavjud), yo‘nalish o‘qlari
    if (g.tool === 'wall' && !g.modal) {
      const cells = this.roadStart ? this.roadPath : this.hoverCell ? [this.hoverCell] : [];
      if (cells.length) {
        const plan = g.checkWallPath(cells);
        cells.forEach((c, i) => {
          const pc = plan.cells[i];
          const m = new THREE.Mesh(this.cellGeo, pc.state === 'exists' ? this.cellMatExisting : pc.state === 'new' ? this.cellMatOk : this.cellMatBad);
          m.position.copy(cellToWorld(c.x, c.z)).setY(0.07 + (g.terrainField?.cellHeight(c.x, c.z) ?? 0));
          m.renderOrder = 3;
          this.roadPreview.add(m);
          const nx = cells[i + 1] ?? null, pv = cells[i - 1] ?? null;
          const dir = nx ? { x: nx.x - c.x, z: nx.z - c.z } : pv ? { x: c.x - pv.x, z: c.z - pv.z } : (g.buildRotation % 2 ? { x: 0, z: 1 } : { x: 1, z: 0 });
          const a = new THREE.Mesh(this.arrowGeo, this.arrowMat);
          a.position.copy(m.position).setY(m.position.y + 0.01);
          a.rotation.y = Math.atan2(dir.x, dir.z);
          a.renderOrder = 4;
          this.roadPreview.add(a);
        });
        const total = `uzunlik ${cells.length} katak (≈${cells.length * 10} m), ${plan.newCount} ta yangi qism — ${fmtCost(plan.cost)}`;
        this.setHint({ text: plan.ok ? `Himoya devori: ${total}` : `${plan.reason} · ${total}`, ok: plan.ok });
      }
    }

    this.updateProtectOverlay();

    // buzish hover
    this.hoverBox.visible = false;
    if (g.tool === 'demolish' && this.hoverObjectId && !g.modal) {
      const n = this.nodes.get(this.hoverObjectId);
      if (n) {
        this.hoverBox.box.setFromObject(n.obj);
        this.hoverBox.visible = true;
        const chk = g.canDemolish(this.hoverObjectId);
        const o = g.objects.get(this.hoverObjectId)!;
        const impact = chk.ok ? g.demolishImpact(this.hoverObjectId) : [];
        const confirmTap = this.armed?.kind === 'demolish' && this.armed.id === this.hoverObjectId ? '👆 Buzishni tasdiqlash uchun yana bir marta bosing · ' : '';
        this.setHint({ text: chk.ok ? `${confirmTap}${CATALOG[o.type].name}ni buzish (bepul, narx qaytarilmaydi)${impact.length ? ' — diqqat: ' + impact.join('; ') : ''}` : chk.reason, ok: chk.ok });
      }
    }
    if (!(g.tool === 'build' && this.hoverCell) && !((roadTool || g.tool === 'wall') && (this.roadStart || this.hoverCell)) && !(g.tool === 'demolish' && this.hoverObjectId)) {
      this.setHint(null);
    }

    // tanlangan obyekt
    this.selBox.visible = false;
    this.selRange.visible = this.selRing.visible = false;
    if (g.selectedId) {
      const n = this.nodes.get(g.selectedId);
      const o = g.objects.get(g.selectedId);
      if (n && o) {
        this.selBox.box.setFromObject(n.obj);
        this.selBox.visible = true;
        const r = UTILITY_CONFIG.mode === 'capacity' && (CATALOG[o.type].kind === 'power' || CATALOG[o.type].kind === 'water') ? 0 : stationRadius(o);
        if (r > 0) {
          const c = footprintCenter(o);
          this.placeRange(this.selRange, this.selRing, c.x, c.z, r, CATALOG[o.type].kind);
        }
      }
    }
  }

  private pendingPlacement: { type: ObjectType; gx: number; gz: number; rot: Rotation } | null = null;
  private hoverObjectId: string | null = null;
  private cellGeo = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
  private cellMatOk = new THREE.MeshBasicMaterial({ color: '#3ddc84', transparent: true, opacity: 0.6, depthWrite: false });
  private cellMatBad = new THREE.MeshBasicMaterial({ color: '#ff4d4d', transparent: true, opacity: 0.6, depthWrite: false });
  private cellMatExisting = new THREE.MeshBasicMaterial({ color: '#a8e6ff', transparent: true, opacity: 0.35, depthWrite: false });
  private arrowGeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.3), new THREE.Vector2(-0.2, -0.12), new THREE.Vector2(0, -0.02), new THREE.Vector2(0.2, -0.12)])).rotateX(-Math.PI / 2).rotateY(Math.PI);
  private arrowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  private protectMats = {
    inside: new THREE.MeshBasicMaterial({ color: '#34d399', transparent: true, opacity: 0.16, depthWrite: false }),
    safe: new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.45, depthWrite: false }),
    open: new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.5, depthWrite: false }),
  };

  /**
   * Himoyalangan hudud xaritasi: devor ichidagi maydon (och yashil), himoyalangan binolar (yashil), tashqarida
   * qolganlar (qizil), ochiq joy (qizil halqa). Faqat himoya holati o‘zgarganda qayta quriladi.
   */
  private updateProtectOverlay() {
    const g = this.game;
    const show = g.defenseOverlay || g.tool === 'wall' || (g.tool === 'build' && !!g.buildType && isDefense(g.buildType));
    this.protectRoot.visible = show;
    if (!show) return;
    const d = g.defense;
    if (d !== this.protectRef) {
      this.protectRef = d;
      for (const ch of [...this.protectRoot.children]) { this.protectRoot.remove(ch); if ((ch as THREE.InstancedMesh).isInstancedMesh) (ch as THREE.InstancedMesh).dispose(); }
      this.gapMarker = null;
      const tiles = (cells: { x: number; z: number }[], m: THREE.Material, y: number) => {
        if (!cells.length) return;
        const im = new THREE.InstancedMesh(this.cellGeo, m, cells.length);
        const mx = new THREE.Matrix4();
        cells.forEach((c, i) => { const w = cellToWorld(c.x, c.z); im.setMatrixAt(i, mx.makeTranslation(w.x, y, w.z)); });
        im.renderOrder = 2;
        im.frustumCulled = false;
        this.protectRoot.add(im);
      };
      tiles(d.insideCells, this.protectMats.inside, 0.045);
      const fp = (ids: string[]) => ids.flatMap((id) => { const o = g.objects.get(id); return o ? footprintCells(o.type, o.gridX, o.gridZ, o.rotation) : []; });
      if (d.status !== 'none') {
        tiles(fp(d.protectedIds), this.protectMats.safe, 0.06);
        tiles(fp(d.exposedIds), this.protectMats.open, 0.06);
      }
      if (d.gap) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 40).rotateX(-Math.PI / 2), this.protectMats.open);
        ring.position.copy(cellToWorld(d.gap.x, d.gap.z)).setY(0.09);
        ring.renderOrder = 5;
        this.protectRoot.add(ring);
        this.gapMarker = ring;
      }
    }
    if (this.gapMarker) this.gapMarker.scale.setScalar(1 + 0.25 * Math.sin(this.elapsed * 4));
  }

  private placeRange(disk: THREE.Mesh, ring: THREE.Line, cx: number, cz: number, r: number, kind: string) {
    const color = kind === 'power' ? '#f5c542' : kind === 'water' ? '#38bdf8' : '#4ade80';
    (disk.material as THREE.MeshBasicMaterial).color.set(color);
    (ring.material as THREE.LineBasicMaterial).color.set(color);
    disk.scale.set(r, 1, r);
    ring.scale.set(r, 1, r);
    disk.position.set(cx - HALF, 0.05, cz - HALF);
    ring.position.set(cx - HALF, 0.07, cz - HALF);
    disk.visible = ring.visible = true;
  }

  private hintPos = { x: 0, y: 0 };
  private setHint(h: { text: string; ok: boolean } | null) {
    const next = h ? { ...h, ...this.hintPos } : null;
    const prev = this.hint;
    if (!next && !prev) return;
    if (next && prev && next.text === prev.text && next.ok === prev.ok && next.x === prev.x && next.y === prev.y) return;
    this.hint = next;
    for (const l of this.hintListeners) l();
  }

  subscribeHint(fn: () => void) {
    this.hintListeners.add(fn);
    return () => { this.hintListeners.delete(fn); };
  }

  // ---------------- koordinatalar ----------------

  private ndc(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  cellFromClient(clientX: number, clientY: number): { x: number; z: number } | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.cam.camera);
    const p = new THREE.Vector3();
    // tog‘ ko‘rinib turgan joyda — relyef sirtidagi nuqta (aks holda tog‘ ortidagi yer tekisligi tanlanardi)
    const hit = this.terrainView ? this.raycaster.intersectObjects(this.terrainView.meshes, false)[0] : undefined;
    if (hit) p.copy(hit.point);
    else if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
    const x = Math.floor(p.x + HALF);
    const z = Math.floor(p.z + HALF);
    return { x, z };
  }

  /** Testlar uchun: katak markazining ekran koordinatasi. */
  cellToClient(x: number, z: number) {
    const v = cellToWorld(x, z).project(this.cam.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  /** Testlar uchun: katakdagi yo‘l meshining shakli (end/straight/corner/t/cross). */
  roadShapeAt(x: number, z: number): string | null {
    const id = this.game.occ.get(x, z);
    const n = id ? this.nodes.get(id) : undefined;
    return (n?.obj.children[0]?.userData.roadShape as string | undefined) ?? null;
  }

  /** Testlar uchun: overlay holati. */
  overlayState() {
    return {
      ghostVisible: !!this.ghost?.visible,
      footprintVisible: this.footprint.visible,
      footprintColor: '#' + (this.footprint.material as THREE.MeshBasicMaterial).color.getHexString(),
      footprintSize: [this.footprint.scale.x, this.footprint.scale.z],
      pending: this.pendingPlacement,
      selectionRangeVisible: this.selRange.visible,
      selectionRangeRadius: this.selRange.scale.x,
      gridVisible: this.env.grid.visible,
      statusIcons: this.overlayRoot.children.filter((c) => c.userData.statusIcon).length,
    };
  }

  pickObject(clientX: number, clientY: number): string | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.cam.camera);
    const hits = this.raycaster.intersectObjects(this.objectsRoot.children, true);
    for (const h of hits) {
      const id = h.object.userData.id as string | undefined;
      if (id && this.game.objects.has(id)) return id;
    }
    const c = this.cellFromClient(clientX, clientY);
    return c ? this.game.occ.get(c.x, c.z) : null;
  }

  // ---------------- input ----------------

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.resize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  // ---- sensorli ekran: ikki barmoq — zoom, aylantirish va surish; bosish — avval ko‘rish, ikkinchi bosish — tasdiq ----
  private touches = new Map<number, { x: number; y: number }>();
  private gesture: { dist: number; angle: number; mx: number; my: number } | null = null;
  /** Telefonda qurish/buzish: birinchi bosish belgilaydi, ikkinchisi (shu joyga) tasdiqlaydi */
  private armed: { kind: 'build'; key: string; t: number } | { kind: 'demolish'; id: string; t: number } | null = null;

  private gestureState() {
    const [a, b] = [...this.touches.values()];
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        // ikkinchi barmoq: qurilish/chizish bekor, faqat kamera
        this.gesture = this.gestureState();
        this.roadStart = null;
        this.roadPath = [];
        if (this.pointer) this.pointer.moved = true;
        e.preventDefault();
        return;
      }
      if (this.touches.size > 2) return;
      this.hoverCell = this.cellFromClient(e.clientX, e.clientY);
    }
    if (this.pointer) return;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointer = { id: e.pointerId, button: e.button, x: e.clientX, y: e.clientY, moved: false, lx: e.clientX, ly: e.clientY, touch: e.pointerType === 'touch' };
    if (e.button === 0 && (this.game.tool === 'road' || this.game.tool === 'bridge' || this.game.tool === 'wall') && !this.game.modal) {
      const c = this.cellFromClient(e.clientX, e.clientY);
      if (c) {
        this.roadStart = c;
        this.roadPath = [c];
      }
    }
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    this.hintPos = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2 && this.gesture) {
        const n = this.gestureState(), o = this.gesture;
        if (n.dist > 10 && o.dist > 10) this.cam.zoom(o.dist / n.dist);
        let da = n.angle - o.angle;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.cam.orbit(-da, 0);
        this.cam.panScreen(n.mx - o.mx, n.my - o.my, this.renderer.domElement.clientHeight);
        this.gesture = n;
        return;
      }
    }
    const p = this.pointer;
    if (p && p.id === e.pointerId) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      // movementX telefonlarda doim ham bo‘lmaydi — oldingi nuqtadan farq
      const mx = e.clientX - p.lx, my = e.clientY - p.ly;
      p.lx = e.clientX; p.ly = e.clientY;
      if (!p.moved && Math.hypot(dx, dy) > (p.touch ? CLICK_PX * 2 : CLICK_PX)) p.moved = true;
      if (p.moved) {
        if (p.button === 2) this.cam.orbit(-mx * 0.006, my * 0.005);
        else if (p.button === 1 || (p.button === 0 && this.game.tool !== 'road' && this.game.tool !== 'bridge' && this.game.tool !== 'wall')) this.cam.panScreen(mx, my, this.renderer.domElement.clientHeight);
      }
    }
    this.hoverCell = this.cellFromClient(e.clientX, e.clientY);
    if (this.roadStart && this.hoverCell) {
      this.roadPath = this.game.tool === 'bridge' ? straightPath(this.roadStart, this.hoverCell) : manhattanPath(this.roadStart, this.hoverCell);
    }
    this.hoverObjectId = this.game.tool === 'demolish' ? this.pickObject(e.clientX, e.clientY) : null;
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.gesture = null;
    }
    const p = this.pointer;
    if (!p || p.id !== e.pointerId) return;
    this.pointer = null;
    try { this.renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const g = this.game;
    if (p.button !== 0) return;
    if (g.tool === 'wall') {
      if (this.roadStart && this.roadPath.length && !g.modal) g.buildWall(this.roadPath);
      this.roadStart = null;
      this.roadPath = [];
      return;
    }
    if (g.tool === 'road' || g.tool === 'bridge') {
      if (this.roadStart && this.roadPath.length && !g.modal) g.buildRoad(this.roadPath, g.tool === 'bridge');
      this.roadStart = null;
      this.roadPath = [];
      return;
    }
    if (p.moved || g.modal) return; // sudrash qurilishga olib kelmaydi
    if (g.tool === 'build' && p.touch && g.buildType) {
      // telefon: birinchi bosish — arvoh shu joyda; shu joyga ikkinchi bosish — qurish
      const cell = this.cellFromClient(e.clientX, e.clientY);
      if (!cell) return;
      this.hoverCell = cell;
      const { w, d } = footprintSize(g.buildType, g.buildRotation);
      const gx = cell.x - Math.floor((w - 1) / 2), gz = cell.z - Math.floor((d - 1) / 2);
      const key = `${g.buildType}:${gx}:${gz}:${g.buildRotation}`;
      if (this.armed?.kind === 'build' && this.armed.key === key && performance.now() - this.armed.t < 8000) {
        this.armed = null;
        g.placeBuilding(g.buildType, gx, gz, g.buildRotation);
      } else this.armed = { kind: 'build', key, t: performance.now() };
    } else if (g.tool === 'build' && this.pendingPlacement) {
      const { type, gx, gz, rot } = this.pendingPlacement;
      g.placeBuilding(type, gx, gz, rot);
    } else if (g.tool === 'demolish') {
      const id = this.pickObject(e.clientX, e.clientY);
      if (!id) return;
      if (!p.touch) { g.demolish(id); return; }
      // telefon: buzishdan oldin tasdiq — shu obyektga ikkinchi bosish
      this.hoverObjectId = id;
      if (this.armed?.kind === 'demolish' && this.armed.id === id && performance.now() - this.armed.t < 6000) { this.armed = null; g.demolish(id); }
      else this.armed = { kind: 'demolish', id, t: performance.now() };
    } else if (g.tool === 'select') {
      const vid = this.pickVehicle(e.clientX, e.clientY);
      if (vid) g.selectVehicle(vid);
      else { g.selectVehicle(null); g.select(this.pickObject(e.clientX, e.clientY)); }
    }
  };

  private onCancel = (e?: PointerEvent) => {
    if (e?.pointerType === 'touch') { this.touches.delete(e.pointerId); if (this.touches.size < 2) this.gesture = null; }
    this.pointer = null;
    this.roadStart = null;
    this.roadPath = [];
  };

  private onLeave = (e: PointerEvent) => {
    // barmoq ko‘tarilganda ham pointerleave keladi — telefonda arvoh va tasdiq belgisi joyida qoladi
    if (e.pointerType === 'touch') return;
    if (!this.pointer) {
      this.hoverCell = null;
      this.hoverObjectId = null;
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.cam.zoom(Math.exp(e.deltaY * 0.0012));
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const g = this.game;
    if (e.key === 'Escape') {
      if (g.modal && g.modal !== 'invalidSave') g.openModal(null);
      else if (this.roadStart) this.onCancel();
      else if (g.tool !== 'select') g.cancelTool();
      else if (g.selectedId) g.select(null);
      return;
    }
    if (g.modal) return;
    if (e.key === 'r' || e.key === 'R') {
      if (g.tool === 'build' || g.tool === 'wall') g.rotateBuild();
    } else if (e.key === 'Home') {
      this.resetCamera();
    } else if (e.key === 'p' || e.key === 'P') {
      g.togglePause();
    } else if (e.key === 'Delete' && g.selectedId) {
      g.demolish(g.selectedId);
    } else {
      this.keys.add(e.key.toLowerCase());
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = () => this.keys.clear();

  private onVisibility = () => {
    this.game.setTabHidden(document.visibilityState === 'hidden');
    this.lastT = performance.now();
  };

  resetCamera() {
    this.cam.set({ ...DEFAULT_CAMERA });
  }

  resize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const high = this.game.settings.quality === 'high';
    // telefonda ekran zichligi 2.5–3x; to‘liq zichlikda chizish GPU ni bo‘g‘adi
    const base = high ? Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2) : Math.min(window.devicePixelRatio || 1, 1);
    this.renderer.setPixelRatio(Math.max(0.6, base * this.dynScale));
    this.renderer.setSize(w, h);
    this.cam.resize(w / Math.max(1, h));
  };

  // ---------------- sikl ----------------

  private loop(now: number) {
    if (this.disposed) return;
    // 90/120 Hz telefon ekranlari: 60 kadrdan ortiq chizish faqat batareya va issiqlik (vaqt keyingi kadrga o‘tadi)
    if (this.mobile && now - this.lastT < 12) { this.raf = requestAnimationFrame(this.loop); return; }
    const dt = Math.min((now - this.lastT) / 1000, 0.25);
    this.lastT = now;
    this.elapsed += dt;
    this.frameCount++;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
      if (!this.game.tabHidden) this.adaptQuality();
    }

    // fon rejimi (Telegram «deactivated» yoki yashirin tab): simulyatsiya va og‘ir render to‘xtaydi
    if (this.game.tabHidden) { this.raf = requestAnimationFrame(this.loop); return; }
    this.game.update(dt);

    // klaviatura bilan kamera (WASD/strelkalar — pan, Q/E — aylantirish)
    if (!this.game.modal && this.keys.size) {
      const sp = this.cam.state.distance * 0.9 * dt;
      const k = this.keys;
      let dx = 0;
      let dz = 0;
      if (k.has('a') || k.has('arrowleft')) dx -= sp;
      if (k.has('d') || k.has('arrowright')) dx += sp;
      if (k.has('w') || k.has('arrowup')) dz += sp;
      if (k.has('s') || k.has('arrowdown')) dz -= sp;
      if (dx || dz) this.cam.panWorld(dx, dz);
      if (k.has('q')) this.cam.orbit(-1.6 * dt, 0);
      if (k.has('e')) this.cam.orbit(1.6 * dt, 0);
    }

    if (this.lastQuality !== this.game.settings.quality) {
      this.lastQuality = this.game.settings.quality;
      this.resize();
      this.applyShadows();
    }
    if (this.worldVersion !== this.game.worldVersion) {
      this.worldVersion = this.game.worldVersion;
      this.syncObjects();
      if (this.shadowsOn) this.markNewMaterials();
    }
    this.updateWalkingDino();
    this.dinoWalker.update(this.cam.state.distance);
    this.herdView.update(dt, this.cam.camera.position);
    this.updateSites();
    for (const h of this.frameHooks) h(dt);
    this.updateVehicles();
    this.updateOverlays();
    this.env.update(this.elapsed);
    this.syncTerrain();
    this.waterView?.update(this.elapsed);
    this.followCamera();
    this.renderer.render(this.scene, this.cam.camera);
    this.raf = requestAnimationFrame(this.loop);
  }

  private syncTerrain() {
    this.syncForest();
    if (this.terrainRef === this.game.terrain) return;
    this.terrainRef = this.game.terrain;
    if (this.terrainView) {
      this.scene.remove(this.terrainView.group);
      this.terrainView.dispose();
      this.terrainView = null;
    }
    if (this.waterView) {
      this.scene.remove(this.waterView.group);
      this.waterView.dispose();
      this.waterView = null;
    }
    if (this.game.terrainField) {
      this.terrainView = createTerrainView(this.game.terrainField);
      this.scene.add(this.terrainView.group);
      this.waterView = createWaterView(this.game.terrainField, (x, z) => !this.game.objectAt(x, z));
      this.scene.add(this.waterView.group);
      this.updateDecor();
      if (this.shadowsOn) this.markNewMaterials();
    }
  }

  /** Gul/tosh bezaklari: bino, ko‘l/soy va tog‘ ostida yashiriladi */
  private updateDecor() {
    const f = this.game.terrainField;
    this.env.setOccupied((x, z) => !this.game.objectAt(x, z) && !isWater(x, z) && !(f && f.cellHeight(x, z) > 0));
  }

  private syncForest() {
    const field = this.game.terrainField;
    const path = patrolPath();
    if (!field || (this.forestKey === path && this.terrainRef === this.game.terrain && this.forest)) return;
    this.forestKey = path;
    if (this.forest) {
      this.scene.remove(this.forest.group);
      this.forest.group.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    }
    // dinozavr marshruti yo‘lagi va kirish yo‘li daraxtsiz qoladi
    const blocked = new Set<string>();
    for (const p of path) {
      const r = 6;
      for (let z = Math.floor(p.z - r); z <= Math.ceil(p.z + r); z++) for (let x = Math.floor(p.x - r); x <= Math.ceil(p.x + r); x++) {
        if (Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) <= r) blocked.add(x + ',' + z);
      }
    }
    // yangi dinozavrlar turgan joy (statik modellar doim shu yerda) ham daraxtsiz
    for (const c of this.game.herd.occupied()) { const [x, z] = c.split(',').map(Number); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) blocked.add(x + dx + ',' + (z + dz)); }
    for (const e of this.game.traffic.graph?.entries ?? []) for (const c of e.stub) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) blocked.add(c.x + dx + ',' + (c.z + dz));
    const clear = (x: number, z: number) => !blocked.has(x + ',' + z) && !this.game.objectAt(x, z);
    this.forest = createForest(field, clear);
    this.scene.add(this.forest.group);
    if (this.shadowsOn) this.markNewMaterials();
  }

  private shadowHalf = 24;
  /** Tuman va soya kamerasi kamera nishoniga ergashadi: soya faqat ko‘rilayotgan yaqin hududda (masofaga cheklangan). */
  private followCamera() {
    const st = this.cam.state;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = 40 + st.distance * 0.9;
    fog.far = 170 + st.distance * 1.6;
    this.sun.target.position.set(st.targetX, 0, st.targetZ);
    this.sun.position.set(st.targetX - 16, 26, st.targetZ + 12);
    const half = Math.round(THREE.MathUtils.clamp(st.distance * 0.9, 24, 44));
    if (half !== this.shadowHalf) {
      this.shadowHalf = half;
      const sc = this.sun.shadow.camera;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.updateProjectionMatrix();
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.dinoWalker.dispose();
    this.factory.procedural.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function fmtCost(n: number) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' tanga';
}
