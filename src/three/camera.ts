import * as THREE from 'three';
import type { CameraState } from '../game/types';
import { MAP_MAX, MAP_MIN, MAP_SIZE, WORLD_ORIGIN } from '../game/grid';
import { groundHeight } from '../game/terrain';

/** Xarita markazi dunyo koordinatasida (grid.ts konfiguratsiyasidan) */
const MAP_CENTER = (MAP_MIN + MAP_MAX + 1) / 2 - WORLD_ORIGIN;

/** PRD 02: orbit 360°, qiyalik yer ustida 25–75°, zoom va pan chegaralangan (xarita o‘lchamidan). */
export const CAM_LIMITS = {
  minElevation: THREE.MathUtils.degToRad(25),
  maxElevation: THREE.MathUtils.degToRad(75),
  minDistance: 5,
  /** 80×80 xarita bitta kadrda ko‘rinadigan masofa */
  maxDistance: Math.round(MAP_SIZE * 1.5),
  /** Kamera nishoni xarita ichida (+ chetdan bir oz) qoladi */
  panLimit: MAP_SIZE / 2 + 4,
  /** Kamera relyef (tog‘) sirtidan kamida shuncha baland */
  groundClearance: 2.5,
  far: 1200,
};

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  state: CameraState;
  private onChange: (s: CameraState) => void;

  constructor(aspect: number, initial: CameraState, onChange: (s: CameraState) => void) {
    // yaqin chegara 0,3 (eng yaqin kamera masofasi 5) — uzoq chegara katta bo‘lgani uchun chuqurlik aniqligi saqlansin
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.3, CAM_LIMITS.far);
    this.state = { ...initial };
    this.onChange = onChange;
    this.clamp();
    this.apply();
  }

  set(s: CameraState) {
    this.state = { ...s };
    this.clamp();
    this.apply();
  }

  orbit(dAzimuth: number, dElevation: number) {
    this.state.azimuth += dAzimuth;
    this.state.polar += dElevation;
    this.clamp();
    this.apply();
  }

  zoom(factor: number) {
    this.state.distance *= factor;
    this.clamp();
    this.apply();
  }

  /** Ekran bo‘yicha siljitish (piksel). */
  panScreen(dx: number, dy: number, viewportH: number) {
    const k = (this.state.distance * 1.4) / viewportH;
    const az = this.state.azimuth;
    // kamera o‘ng vektori va yerga proyeksiyalangan old vektori
    const rightX = Math.cos(az);
    const rightZ = -Math.sin(az);
    const fwdX = -Math.sin(az);
    const fwdZ = -Math.cos(az);
    this.state.targetX += (-dx * rightX + dy * fwdX) * k;
    this.state.targetZ += (-dx * rightZ + dy * fwdZ) * k;
    this.clamp();
    this.apply();
  }

  panWorld(dx: number, dz: number) {
    const az = this.state.azimuth;
    // dx — o‘ngga, dz — oldinga (ekran bo‘yicha)
    this.state.targetX += dx * Math.cos(az) - dz * Math.sin(az);
    this.state.targetZ += -dx * Math.sin(az) - dz * Math.cos(az);
    this.clamp();
    this.apply();
  }

  private clamp() {
    const s = this.state;
    const L = CAM_LIMITS;
    s.polar = THREE.MathUtils.clamp(s.polar, L.minElevation, L.maxElevation);
    s.distance = THREE.MathUtils.clamp(s.distance, L.minDistance, L.maxDistance);
    s.targetX = THREE.MathUtils.clamp(s.targetX, MAP_CENTER - L.panLimit, MAP_CENTER + L.panLimit);
    s.targetZ = THREE.MathUtils.clamp(s.targetZ, MAP_CENTER - L.panLimit, MAP_CENTER + L.panLimit);
    s.azimuth = ((s.azimuth % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  private apply() {
    const s = this.state;
    const c = Math.cos(s.polar);
    this.camera.position.set(
      s.targetX + s.distance * c * Math.sin(s.azimuth),
      s.distance * Math.sin(s.polar),
      s.targetZ + s.distance * c * Math.cos(s.azimuth),
    );
    // tog‘ ichiga kirmasin: kamera ostidagi relyefdan kamida groundClearance baland
    const p = this.camera.position;
    const floor = groundHeight(p.x + WORLD_ORIGIN, p.z + WORLD_ORIGIN) + CAM_LIMITS.groundClearance;
    if (p.y < floor) p.y = floor;
    this.camera.lookAt(s.targetX, 0, s.targetZ);
    this.camera.updateMatrixWorld();
    this.onChange({ ...s });
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
