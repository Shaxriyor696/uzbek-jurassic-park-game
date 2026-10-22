import { AUDIO_CONFIG, SOUNDS, type Bus, type SoundId } from './audioConfig';

/**
 * Yagona audio dvigatel (Web Audio). Kanallar: master → muhit / effektlar / interfeys. Fayllar bir marta
 * yuklanadi va keshlanadi (har obyekt uchun qayta yuklanmaydi); yuklanmasa — jim, o‘yin to‘xtamaydi.
 * Brauzer autoplay siyosati: kontekst birinchi bosish/klavishdan keyin yoqiladi. Fon rejimida to‘xtatiladi.
 */

export interface AudioSettings { master: number; ambience: number; effects: number; ui: number; muted: boolean }

export interface Listener { x: number; z: number; /** kamera chap→o‘ng yo‘nalishi (dunyo XZ) */ rx: number; rz: number; /** kamera masofasi (yaqinlashtirish) */ dist: number }

export interface Voice { stop(fade?: number): void; setPosition?(x: number, z: number): void; ended: boolean }

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(AUDIO_CONFIG.storageKey);
    if (raw) {
      const s = JSON.parse(raw);
      const n = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
      const D = AUDIO_CONFIG.defaults;
      return { master: n(s.master, D.master), ambience: n(s.ambience, D.ambience), effects: n(s.effects, D.effects), ui: n(s.ui, D.ui), muted: s.muted === true };
    }
  } catch { /* localStorage yo‘q — boshlang‘ich qiymatlar */ }
  return { ...AUDIO_CONFIG.defaults };
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  settings: AudioSettings = loadSettings();
  private master!: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  /** Dunyo ovozlari (muhit + effektlar) — pauzada jim; interfeys alohida */
  private world!: GainNode;
  private cache = new Map<string, Promise<AudioBuffer | null>>();
  private buffers = new Map<string, AudioBuffer | null>();
  private voices = new Set<Voice>();
  listener: Listener = { x: 0, z: 0, rx: 1, rz: 0, dist: 20 };
  /** Diagnostika va sinovlar uchun */
  stats = { played: 0, skipped: 0, failed: [] as string[], byId: {} as Record<string, number> };
  private base: string;
  private unlockBound = () => this.unlock();
  private visBound = () => this.onVisibility();
  private worldOn = true;

  constructor(base: string) {
    this.base = base.endsWith('/') ? base : base + '/';
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, this.unlockBound, { capture: true });
    document.addEventListener('visibilitychange', this.visBound);
  }

  /** Birinchi o‘yinchi harakati: kontekst yaratiladi/davom ettiriladi, muhim ovozlar oldindan yuklanadi */
  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        const c = this.ctx;
        this.master = c.createGain();
        this.master.connect(c.destination);
        this.world = c.createGain();
        this.world.connect(this.master);
        for (const b of ['ambience', 'effects', 'ui'] as Bus[]) {
          this.buses[b] = c.createGain();
          this.buses[b].connect(b === 'ui' ? this.master : this.world);
        }
        this.applySettings();
        // muhim ovozlar (interfeys, qadam, qurilish) oldindan; qolganlari birinchi kerak bo‘lganda
        for (const s of Object.values(SOUNDS)) if ((s as { preload?: boolean }).preload) for (const f of s.files) void this.load(f);
        // qolganlari fonda (birinchi hodisada jim qolmasin), ketma-ket — tarmoqni bir zumda band qilmaydi
        setTimeout(() => {
          const rest = Object.values(SOUNDS).filter((s) => !(s as { preload?: boolean }).preload).flatMap((s) => s.files);
          void rest.reduce((p, f) => p.then(() => this.load(f)).then(() => undefined), Promise.resolve());
        }, 1200);
      }
      if (this.ctx.state === 'suspended' && document.visibilityState === 'visible') void this.ctx.resume().catch(() => {});
      for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.removeEventListener(ev, this.unlockBound, { capture: true });
    } catch { /* audio yo‘q — o‘yin ovozsiz ishlaydi */ }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private onVisibility() {
    if (!this.ctx) return;
    // fon rejimi: hammasi to‘xtaydi; qaytganda eski hodisalar to‘planmaydi (yangi ovozlar faqat keyingi hodisalardan)
    if (document.visibilityState === 'hidden') void this.ctx.suspend().catch(() => {});
    else void this.ctx.resume().catch(() => {});
  }

  /** Pauza: dunyo ovozlari (muhit, dinozavr, transport, qurilish) silliq jim bo‘ladi; interfeys qoladi */
  setWorldActive(on: boolean) {
    if (on === this.worldOn || !this.ctx) { this.worldOn = on; return; }
    this.worldOn = on;
    this.world.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.08);
  }

  get worldActive() {
    return this.worldOn;
  }

  setSettings(p: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...p };
    try { localStorage.setItem(AUDIO_CONFIG.storageKey, JSON.stringify(this.settings)); } catch { /* saqlab bo‘lmadi — sessiya davomida ishlaydi */ }
    this.applySettings();
  }

  private applySettings() {
    if (!this.ctx) return;
    const s = this.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.03);
    this.buses.ambience.gain.setTargetAtTime(s.ambience, t, 0.03);
    this.buses.effects.gain.setTargetAtTime(s.effects, t, 0.03);
    this.buses.ui.gain.setTargetAtTime(s.ui, t, 0.03);
  }

  /** Fayl bir marta yuklanadi (kesh); xato — null (ovoz chalinmaydi) */
  load(file: string): Promise<AudioBuffer | null> {
    let p = this.cache.get(file);
    if (p) return p;
    p = (async () => {
      if (!this.ctx) return null;
      try {
        const res = await fetch(this.base + file);
        const type = res.headers.get('content-type') ?? '';
        // SPA serverlari yo‘q faylga HTML qaytarishi mumkin — bu muvaffaqiyat emas
        if (!res.ok || type.includes('text/html')) throw new Error(`${res.status} ${type}`);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(file, buf);
        return buf;
      } catch (e) {
        this.stats.failed.push(file + ': ' + String(e));
        this.buffers.set(file, null);
        return null;
      }
    })();
    this.cache.set(file, p);
    return p;
  }

  /** Yuklangan bo‘lsa — darhol; yo‘q bo‘lsa yuklashni boshlab, bu safar jim (eskirgan ovoz kechikib yangramasin) */
  private ready1(file: string): AudioBuffer | null {
    const b = this.buffers.get(file);
    if (b === undefined) void this.load(file);
    return b ?? null;
  }

  isLoaded(id: SoundId) {
    return SOUNDS[id].files.every((f) => !!this.buffers.get(f));
  }

  /** Fazoviy balandlik va chap/o‘ng: kameraga (eshituvchiga) masofa bo‘yicha */
  spatial(x: number, z: number): { gain: number; pan: number } {
    const L = this.listener;
    const d = Math.hypot(x - L.x, z - L.z);
    const ref = AUDIO_CONFIG.refDistance, max = AUDIO_CONFIG.maxDistance;
    // uzoqlashtirilgan kamera — hamma narsa biroz pastroq
    const zoom = Math.max(0.35, Math.min(1, 26 / Math.max(10, L.dist)));
    let g = d <= ref ? 1 : d >= max ? 0 : 1 - (d - ref) / (max - ref);
    g = g * g * zoom;
    const pan = d < 0.5 ? 0 : Math.max(-1, Math.min(1, ((x - L.x) * L.rx + (z - L.z) * L.rz) / Math.max(d, 4)));
    return { gain: g, pan };
  }

  /**
   * Qisqa ovoz. at — fazoviy joy (yo‘q bo‘lsa 2D). Ovozlar soni cheklangan: limitda past ustuvorlikdagisi chalinmaydi.
   */
  play(id: SoundId, opts: { at?: { x: number; z: number }; gain?: number; rate?: number; variant?: number; offset?: number; duration?: number; loop?: boolean; priority?: number } = {}): Voice | null {
    if (!this.ready) return null;
    const def = SOUNDS[id];
    if (def.bus !== 'ui' && !this.worldOn) return null;
    const file = def.files[opts.variant !== undefined ? opts.variant % def.files.length : Math.floor(Math.random() * def.files.length)];
    const buf = this.ready1(file);
    if (!buf) { this.stats.skipped++; return null; }
    let sp = { gain: 1, pan: 0 };
    if (opts.at) {
      sp = this.spatial(opts.at.x, opts.at.z);
      if (sp.gain < 0.01) return null; // juda uzoq — eshitilmaydi
    }
    const live = [...this.voices].filter((v) => !v.ended);
    if (!opts.loop && def.bus !== 'ui' && live.length >= AUDIO_CONFIG.maxVoices && (opts.priority ?? 0) < 2) { this.stats.skipped++; return null; }
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    src.loop = !!opts.loop;
    const g = c.createGain();
    const base = def.gain * (opts.gain ?? 1);
    g.gain.value = base * sp.gain;
    let pan: StereoPannerNode | null = null;
    if (opts.at && c.createStereoPanner) { pan = c.createStereoPanner(); pan.pan.value = sp.pan; src.connect(g).connect(pan).connect(this.buses[def.bus]); }
    else src.connect(g).connect(this.buses[def.bus]);
    const voice: Voice = {
      ended: false,
      stop: (fade = 0.06) => {
        if (voice.ended) return;
        voice.ended = true;
        try { g.gain.setTargetAtTime(0, c.currentTime, fade / 3); src.stop(c.currentTime + fade); } catch { /* allaqachon to‘xtagan */ }
      },
      setPosition: (x, z) => {
        if (voice.ended) return;
        const s = this.spatial(x, z);
        g.gain.setTargetAtTime(base * s.gain, c.currentTime, 0.1);
        if (pan) pan.pan.setTargetAtTime(s.pan, c.currentTime, 0.1);
      },
    };
    src.onended = () => { voice.ended = true; this.voices.delete(voice); try { src.disconnect(); g.disconnect(); pan?.disconnect(); } catch { /* */ } };
    src.start(c.currentTime, opts.offset ?? 0, opts.loop ? undefined : opts.duration);
    this.voices.add(voice);
    this.stats.played++;
    this.stats.byId[id] = (this.stats.byId[id] ?? 0) + 1;
    return voice;
  }

  /** Faol qisqa ovozlar soni (sinov va diagnostika) */
  get activeVoices() {
    return [...this.voices].filter((v) => !v.ended).length;
  }

  /** Muhit loopi: fayl chetlari silliqlangan — keyingi nusxa oldingisi tugashidan crossfade vaqtida boshlanadi */
  loop(id: SoundId): AmbientLoop {
    return new AmbientLoop(this, id);
  }

  /** @internal AmbientLoop uchun */
  _raw() {
    return { ctx: this.ctx, buses: this.buses, buffer: (id: SoundId) => this.ready1(SOUNDS[id].files[0]) };
  }

  dispose() {
    for (const v of this.voices) v.stop(0.01);
    this.voices.clear();
    document.removeEventListener('visibilitychange', this.visBound);
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.removeEventListener(ev, this.unlockBound, { capture: true });
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

/** Uzluksiz muhit (transport shovqini, shahar, favvora): balandlik silliq o‘zgaradi; 0 da manba to‘xtatiladi (resurs tejaladi) */
export class AmbientLoop {
  private out: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private srcs: { s: AudioBufferSourceNode; end: number }[] = [];
  private nextAt = 0;
  level = 0;
  constructor(private eng: AudioEngine, private id: SoundId) {}

  /** Har kadr (yoki yarim soniyada): kerakli balandlik va (ixtiyoriy) chap/o‘ng */
  update(level: number, pan = 0) {
    const r = this.eng._raw();
    const c = r.ctx;
    if (!c || c.state !== 'running') return;
    const def = SOUNDS[this.id];
    if (!this.out) {
      this.out = c.createGain();
      this.out.gain.value = 0;
      if (c.createStereoPanner) { this.pan = c.createStereoPanner(); this.out.connect(this.pan).connect(r.buses[def.bus]); }
      else this.out.connect(r.buses[def.bus]);
    }
    this.level = level;
    this.out.gain.setTargetAtTime(def.gain * level, c.currentTime, AUDIO_CONFIG.ambienceRamp / 3);
    this.pan?.pan.setTargetAtTime(pan, c.currentTime, 0.3);
    const buf = r.buffer(this.id);
    if (!buf) return;
    const now = c.currentTime;
    this.srcs = this.srcs.filter((x) => x.end > now);
    if (level < 0.005) {
      // jim — manbalar tugashi kutiladi, yangisi boshlanmaydi
      return;
    }
    const xf = AUDIO_CONFIG.loopCrossfade;
    if (!this.srcs.length) this.nextAt = now + 0.05;
    while (this.nextAt < now + 2) {
      const s = c.createBufferSource();
      s.buffer = buf;
      s.connect(this.out);
      s.start(this.nextAt);
      const end = this.nextAt + buf.duration;
      s.onended = () => { try { s.disconnect(); } catch { /* */ } };
      this.srcs.push({ s, end });
      this.nextAt = end - xf;
    }
  }

  stop() {
    for (const x of this.srcs) try { x.s.stop(); } catch { /* */ }
    this.srcs = [];
    try { this.out?.disconnect(); this.pan?.disconnect(); } catch { /* */ }
    this.out = null;
    this.pan = null;
  }
}
