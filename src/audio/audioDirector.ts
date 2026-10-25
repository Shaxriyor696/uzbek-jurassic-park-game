import { CATALOG } from '../game/catalog';
import { gatePhase } from '../game/defenseDefs';
import { footprintCenter } from '../game/grid';
import { HERD_BY_TYPE } from '../game/herdDefs';
import type { Game, SfxEvent } from '../game/game';
import { AUDIO_CONFIG, type SoundId } from './audioConfig';
import type { AmbientLoop, AudioEngine, Voice } from './audioEngine';

/**
 * O‘yin hodisalarini ovozlarga bog‘laydi (o‘yin mantig‘iga ta’sir qilmaydi). Vaqt — o‘yin vaqti (simTime):
 * pauzada dunyo ovozlari jim, yangi hodisa yo‘q; fon rejimida kontekst to‘xtaydi, qaytganda eski hodisalar
 * to‘planmaydi (har biri faqat o‘z paytida, joriy holatdan).
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Interfeys: bir harakatga bitta ovoz — bir xil «tik»da kelgan so‘rovlardan eng ustuvori chalinadi */
const UI_PRIORITY: Partial<Record<SoundId, number>> = { click: 0, back: 1, open: 2, close: 2, demolish: 3, confirm: 3, error: 4, task: 5 };

export class AudioDirector {
  private pendingUi: SoundId | null = null;
  private uiTimer: ReturnType<typeof setTimeout> | null = null;
  private construction = new Map<string, { next: number; voice: Voice | null; x: number; z: number; ratio: number }>();
  private vehicleVoices = new Map<string, Voice[]>();
  private gates = new Map<string, { phase: string; motor: Voice | null }>();
  private steps = new Map<string, { x: number; z: number; acc: number }>();
  private nextGrowl = 0;
  private lastStart = -9;
  private traffic: AmbientLoop;
  private city: AmbientLoop;
  private fountains: AmbientLoop[];
  private ambT = 0;
  private modes = new Map<string, string>();
  private onSfx = (e: SfxEvent) => this.ui(e);
  private onClick = (e: Event) => {
    const t = e.target as HTMLElement | null;
    // faqat interfeys tugmalari (xarita kanvasi emas). «click» hodisasida — tugmaning o‘z ovozi (open/close/confirm)
    // bilan bir hodisa ichida; ui() ulardan bittasini (eng muhimini) chaladi, ikki ovoz ketma-ket chiqmaydi
    if (t?.closest('button, [role="tab"], .card') && t.closest('[data-ui]')) this.ui('click');
  };

  constructor(private game: Game, readonly engine: AudioEngine) {
    game.sfxListeners.add(this.onSfx);
    window.addEventListener('click', this.onClick, { capture: true });
    this.traffic = engine.loop('traffic');
    this.city = engine.loop('city');
    this.fountains = [engine.loop('fountain'), engine.loop('fountain')];
    this.nextGrowl = game.simTime + rand(6, 14);
  }

  /** Interfeys ovozi so‘rovi (menyu ochish/yopish va boshqalar) */
  ui(id: SoundId) {
    if (this.pendingUi === null || (UI_PRIORITY[id] ?? 0) > (UI_PRIORITY[this.pendingUi] ?? 0)) this.pendingUi = id;
    if (this.uiTimer) return;
    this.uiTimer = setTimeout(() => {
      this.uiTimer = null;
      const s = this.pendingUi;
      this.pendingUi = null;
      if (s) this.engine.play(s);
    }, 0);
  }

  /** Har kadr (sahna sikli): eshituvchi kamerada; dunyo ovozlari holatdan */
  update(cam: { targetX: number; targetZ: number; azimuth: number; distance: number }, half: number, dt: number) {
    const e = this.engine, g = this.game;
    e.listener = { x: cam.targetX + half, z: cam.targetZ + half, rx: Math.cos(cam.azimuth), rz: -Math.sin(cam.azimuth), dist: cam.distance };
    const active = !g.paused && !g.tabHidden;
    e.setWorldActive(active);
    if (!e.ready) { g.traffic.events.length = 0; return; }
    if (!active) { g.traffic.events.length = 0; this.stopMotorsIfPaused(); return; }
    this.updateConstruction();
    this.updateVehicles();
    this.updateGates();
    this.updateDinos();
    this.updateAmbience(dt);
  }

  private stopMotorsIfPaused() {
    for (const s of this.gates.values()) if (s.motor) { s.motor.stop(0.1); s.motor = null; }
  }

  // ---------- qurilish: 30 s davomida tanaffusli zarbalar, tugaganda to‘xtaydi ----------
  private updateConstruction() {
    const g = this.game, t = g.simTime;
    const seen = new Set<string>();
    for (const o of g.objects.values()) {
      if (!o.build) continue;
      seen.add(o.id);
      const c = footprintCenter(o);
      let s = this.construction.get(o.id);
      if (!s) { s = { next: t + rand(0.2, 1.5), voice: null, x: c.x, z: c.z, ratio: 0 }; this.construction.set(o.id, s); }
      s.ratio = o.build.elapsed / o.build.duration;
      if (t >= s.next && s.ratio < 0.93) {
        s.voice = this.engine.play('constructionHits', { at: c, rate: rand(0.94, 1.06) });
        s.next = t + 2.5 + rand(AUDIO_CONFIG.constructionGap[0], AUDIO_CONFIG.constructionGap[1]);
      }
    }
    for (const [id, s] of this.construction) {
      if (seen.has(id)) continue;
      s.voice?.stop(0.08);
      // tayyor bo‘ldi (bekor qilinmagan) — qisqa tasdiq
      if (g.objects.has(id) && s.ratio > 0.8) this.engine.play('buildDone', { at: { x: s.x, z: s.z } });
      this.construction.delete(id);
    }
  }

  // ---------- transport: faqat hodisalarda (dvigatel, eshik, jo‘nash), yaqindagilarga ustuvorlik ----------
  private updateVehicles() {
    const g = this.game, t = g.simTime;
    const vs = new Map(g.traffic.allVehicles().map((v) => [v.id, v]));
    for (const ev of g.traffic.events) {
      const at = { x: ev.x, z: ev.z };
      if (this.engine.spatial(at.x, at.z).gain < 0.05) continue; // uzoqdagilar jim
      let v: Voice | null = null;
      if (ev.type === 'start') {
        // bir vaqtda ko‘p mashina ovozi chiqmasin
        if (t - this.lastStart < 0.8) continue;
        this.lastStart = t;
        v = this.engine.play('carStart', { at, rate: ev.kind === 'police' ? 1.1 : rand(0.95, 1.05) });
      } else if (ev.type === 'doorOpen') v = this.engine.play('busDoorOpen', { at });
      else if (ev.type === 'doorClose') v = this.engine.play('busDoorClose', { at });
      else if (ev.type === 'depart') v = this.engine.play('busDepart', { at });
      if (v) { const list = this.vehicleVoices.get(ev.id) ?? []; list.push(v); this.vehicleVoices.set(ev.id, list); }
    }
    g.traffic.events.length = 0;
    for (const [id, list] of this.vehicleVoices) {
      const v = vs.get(id);
      const live = list.filter((x) => !x.ended);
      if (!v) { for (const x of live) x.stop(0.1); this.vehicleVoices.delete(id); continue; } // transport ketdi — ovozi ham
      for (const x of live) x.setPosition?.(v.x, v.z);
      if (live.length) this.vehicleVoices.set(id, live); else this.vehicleVoices.delete(id);
    }
  }

  // ---------- darvoza: harakatlanayotganda motor, to‘xtaganda qulf ----------
  private updateGates() {
    const g = this.game;
    const seen = new Set<string>();
    for (const o of g.objects.values()) {
      if (o.type !== 'himoya_darvoza' || o.build || !o.gate) continue;
      seen.add(o.id);
      const ph = gatePhase(o.gate);
      const c = footprintCenter(o);
      let s = this.gates.get(o.id);
      if (!s) { s = { phase: ph, motor: null }; this.gates.set(o.id, s); }
      const moving = ph === 'opening' || ph === 'closing';
      if (moving && !s.motor) s.motor = this.engine.play('gateMotor', { at: c, loop: true });
      if (!moving && s.motor) {
        s.motor.stop(0.12);
        s.motor = null;
        if (ph === 'open' || ph === 'closed') this.engine.play('gateLock', { at: c });
      }
      s.motor?.setPosition?.(c.x, c.z);
      s.phase = ph;
    }
    for (const [id, s] of this.gates) if (!seen.has(id)) { s.motor?.stop(0.1); this.gates.delete(id); }
  }

  // ---------- dinozavrlar: qadam — yurganda (masofa bo‘yicha), to‘xtasa jim; kamdan-kam bo‘kirish ----------
  private updateDinos() {
    const g = this.game, t = g.simTime;
    const L = this.engine.listener;
    const list: { id: string; x: number; z: number; len: number; diet: string; mode?: string; type?: string }[] = [
      ...g.herd.dinos.map((d) => ({ id: d.id, x: d.x, z: d.z, len: HERD_BY_TYPE[d.type].length, diet: HERD_BY_TYPE[d.type].diet, mode: d.mode, type: d.type })),
      ...g.dinos.map((d, i) => ({ id: 'apato' + i, x: d.ax, z: d.az, len: d.len, diet: 'herbivore' })),
    ];
    for (const d of list) {
      const s = this.steps.get(d.id);
      if (!s) { this.steps.set(d.id, { x: d.x, z: d.z, acc: 0 }); continue; }
      const moved = Math.hypot(d.x - s.x, d.z - s.z);
      s.x = d.x; s.z = d.z;
      // kichik (raptor) — og‘ir qadam qo‘yilmaydi
      if (d.len < 1.8 || moved > 3) continue;
      s.acc += moved;
      const stride = d.len * 0.38; // bir oyoq yerga tekkuncha bosib o‘tiladigan masofa (yurish va yugurishda — tezlikka mos tezlashadi)
      if (s.acc >= stride) {
        s.acc %= stride;
        const heavy = d.len >= 3.5;
        this.engine.play('dinoStep', { at: d, gain: heavy ? (d.len > 6 ? 1.2 : 1) : 0.55, rate: heavy ? (d.len > 6 ? 0.72 : rand(0.86, 0.96)) : rand(1.12, 1.22) });
      }
      // shaharga hujum boshlandi — bo‘kirish (umumiy tanaffus bilan)
      const prev = this.modes.get(d.id);
      if (d.mode && prev !== d.mode) {
        this.modes.set(d.id, d.mode);
        if ((d.mode === 'raid' || d.mode === 'probe') && t >= this.nextGrowl - 6) this.growl(d, t);
      }
    }
    if (t >= this.nextGrowl) {
      // kameraga yaqin dinozavrlardan bittasi
      const near = list.filter((d) => Math.hypot(d.x - L.x, d.z - L.z) < AUDIO_CONFIG.maxDistance * 0.8);
      if (near.length) this.growl(near[Math.floor(Math.random() * near.length)], t);
      else this.nextGrowl = t + 4;
    }
  }

  private growl(d: { x: number; z: number; len: number; diet: string; type?: string }, t: number) {
    this.nextGrowl = t + rand(AUDIO_CONFIG.growlGap[0], AUDIO_CONFIG.growlGap[1]);
    // yirtqich — irillash, o‘txo‘r — kamdan-kam nafas/bo‘kirish; kattaroq tana — pastroq ohang
    const rate = Math.max(0.7, Math.min(1.4, 1.5 - d.len * 0.13));
    if (d.diet === 'carnivore') this.engine.play('dinoGrowl', { at: d, rate });
    else if (Math.random() < 0.35) this.engine.play('dinoHiss', { at: d, rate: rate * 0.95 });
  }

  // ---------- muhit: kamera atrofidagi yo‘l/transport va turar joy/bog‘lar zichligi bo‘yicha ----------
  private updateAmbience(dt: number) {
    const g = this.game, e = this.engine, L = e.listener;
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = 0.5;
    const R = 14;
    let roads = 0, houses = 0, parks = 0;
    const fountains: { x: number; z: number; d: number }[] = [];
    for (const o of g.objects.values()) {
      if (o.build) continue;
      const c = footprintCenter(o);
      const d = Math.hypot(c.x - L.x, c.z - L.z);
      if ((o.type === 'bog' || o.type === 'navoiy_kutubxona') && d < 16) fountains.push({ x: c.x, z: c.z, d });
      if (d > R) continue;
      if (o.type === 'road') roads++;
      else if (CATALOG[o.type].kind === 'house') houses++;
      else if (CATALOG[o.type].kind === 'park') parks++;
    }
    const veh = g.traffic.allVehicles().filter((v) => Math.hypot(v.x - L.x, v.z - L.z) < R).length;
    const zoom = L.dist > 45 ? 0.6 : 1;
    // bo‘sh xaritada gavjum transport shovqini yo‘q: yo‘l va transport bo‘lsagina
    const traffic = roads ? Math.min(1, roads / 60) * (0.35 + 0.65 * Math.min(1, veh / 5)) * zoom : 0;
    const city = Math.min(1, (houses + parks * 2) / 14) * zoom;
    this.traffic.update(traffic);
    this.city.update(city);
    fountains.sort((a, b) => a.d - b.d);
    this.fountains.forEach((f, i) => {
      const p = fountains[i];
      if (!p) { f.update(0); return; }
      const s = e.spatial(p.x, p.z);
      f.update(s.gain, s.pan);
    });
  }

  /** Diagnostika (sinovlar): faol qurilish, darvoza motori, transport ovozlari va muhit darajalari */
  debug() {
    return {
      construction: [...this.construction.values()].filter((s) => s.voice && !s.voice.ended).length,
      constructionTracked: this.construction.size,
      gateMotors: [...this.gates.values()].filter((s) => s.motor && !s.motor.ended).length,
      vehicleVoices: [...this.vehicleVoices.values()].reduce((a, l) => a + l.filter((v) => !v.ended).length, 0),
      traffic: this.traffic.level, city: this.city.level, fountain: this.fountains.map((f) => f.level),
    };
  }

  dispose() {
    this.game.sfxListeners.delete(this.onSfx);
    window.removeEventListener('click', this.onClick, { capture: true });
    if (this.uiTimer) clearTimeout(this.uiTimer);
    for (const s of this.construction.values()) s.voice?.stop(0.05);
    for (const l of this.vehicleVoices.values()) for (const v of l) v.stop(0.05);
    for (const s of this.gates.values()) s.motor?.stop(0.05);
    this.traffic.stop(); this.city.stop(); for (const f of this.fountains) f.stop();
    this.construction.clear(); this.vehicleVoices.clear(); this.gates.clear();
  }
}
