import { CATALOG } from './catalog';
import { RoadGraph, type Cell } from './roadGraph';
import type { RoadGrid } from './roadNetwork';
import { CITY_TRAFFIC_CONFIG, MIGRATION_CONFIG, POLICE_CONFIG, settleSize, VEHICLE_SPECS, type VehicleKind } from './trafficDefs';
import { bodyPoints, cellOf, dirIndex, headingDir, lookAhead, newDrive, stepVehicle, type Drive, type VehicleState } from './vehicles';
import { gateCenter } from './defense';
import type { ObjectStatus, PlacedObject } from './types';

/**
 * Transport: 1) ko‘chib kelish (yangi aholi avtomobil/avtobusda tashqi yo‘ldan keladi, uyga yetganda bir marta
 * qo‘shiladi, transport chiqish yo‘li orqali ketadi); 2) shahar ichidagi cheklangan transport (aholining uy–ish–xizmat
 * safarlari va bekatli avtobuslar — saqlanmaydi, aholiga qarab asta-sekin paydo bo‘ladi).
 * Aholining yagona hisobi — uylardagi residents; transport faqat yo‘ldagilar va band qilingan o‘rinlarni yuritadi.
 */

export interface TripStop { house: string; count: number; done: boolean }

export type TripPhase = 'arriving' | 'unloading' | 'leaving';

export interface Trip {
  id: string;
  kind: VehicleKind;
  people: number;
  stops: TripStop[];
  phase: TripPhase;
  v: VehicleState;
  /** Tushirish yoki kutish taymeri (s) */
  timer: number;
}

export interface MigrationSave { seq: number; demand: Record<string, number>; trips: Trip[] }

export type MigrationBlock = 'ok' | 'noVacancy' | 'noRoad' | 'noSupply' | 'noEntry' | 'unsafe' | 'gateClosed' | 'full' | 'waiting';

export const MIGRATION_BLOCK_TEXT: Record<MigrationBlock, string> = {
  ok: 'Yangi aholi kelmoqda',
  waiting: 'Keyingi oilalar navbatda',
  noVacancy: 'Bo‘sh uy yo‘q — yangi uy quring.',
  noRoad: 'Uyga yo‘l ulanmagan.',
  noSupply: 'Suv yoki elektr yetishmayapti.',
  noEntry: 'Kirish yo‘li yo‘q: yo‘lni xarita chetidagi tashqi yo‘lgacha olib boring.',
  unsafe: 'Kirish yo‘li xavfsiz emas.',
  gateClosed: 'Darvoza yopiq.',
  full: 'Transport navbatda: bir vaqtda ko‘pi bilan 8 ta.',
};

export type VehicleStatus = 'Dinozavrga ketmoqda' | 'Dinozavrni chiqarmoqda' | 'Bo‘limga qaytmoqda' | 'Kelyapti' | 'Darvozada kutmoqda' | 'Yo‘l band' | 'Yo‘lovchilar joylashmoqda' | 'Qaytmoqda' | 'Manzilga ketmoqda' | 'Manzilda' | 'Uyga qaytmoqda' | 'Bekatda';

export interface TrafficWorld {
  objects: Map<string, PlacedObject>;
  roads: RoadGrid;
  /** Yo‘l/obyektlar versiyasi (grafik shu o‘zgarganda qayta quriladi) */
  version: number;
  statuses: Map<string, ObjectStatus>;
  population: number;
  /** Dinozavr tanalari: band kataklar va doiralar */
  dinoCells: Set<string>;
  dinoBodies: { x: number; z: number; r: number }[];
  /** Katak bo‘sh yer (shahar chetidagi tuproq yo‘l uchun) */
  free?: (x: number, z: number) => boolean;
  /** Himoyalangan (devor ichidagi) hudud */
  inside?: (x: number, z: number) => boolean;
  /** Shahar ichiga kirgan dinozavrlar */
  intruders?: { id: string; x: number; z: number }[];
  /** Faol politsiya/xavfsizlik bo‘limlari */
  stations?: PlacedObject[];
  /** Dinozavrni chiqarib yuborish (politsiya yetib kelganda) */
  evict?: (id: string) => void;
  /** Uyga odamlarni joylashtirish (sig‘imdan oshmaydi) — qo‘shilgan son */
  deliver: (houseId: string, count: number) => number;
}

/** Shahar ichidagi transport (saqlanmaydi) */
interface CityVehicle {
  v: VehicleState;
  phase: 'out' | 'atDest' | 'back' | 'bus';
  home: string;
  dest: string;
  timer: number;
  route?: { stops: string[]; idx: number };
}

export interface GateSignal { request: boolean; busy: boolean }

/** Politsiya maxsus mashinasi (saqlanmaydi — dinozavr ichkarida bo‘lsa yangidan chiqadi) */
interface PoliceUnit { v: VehicleState; station: string; dino: string; phase: 'go' | 'escort' | 'back'; retarget: number }

const isHouse = (o: PlacedObject | undefined) => !!o && CATALOG[o.type].kind === 'house';

export class Traffic {
  trips: Trip[] = [];
  /** Navbatdagi (hali jo‘natilmagan) yangi aholi, uy bo‘yicha */
  demand = new Map<string, number>();
  seq = 1;
  city: CityVehicle[] = [];
  police: PoliceUnit[] = [];
  graph: RoadGraph | null = null;
  block: MigrationBlock = 'ok';
  /** Darvozalar uchun signal (ochish so‘rovi, o‘tish band) */
  gateSignals = new Map<string, GateSignal>();
  /** Transport ovoz hodisalari (audio tizimi o‘qib, tozalaydi): dvigatel ishga tushdi, eshik, jo‘nash */
  events: { type: 'start' | 'doorOpen' | 'doorClose' | 'depart'; id: string; kind: VehicleKind; x: number; z: number }[] = [];
  private ev(type: 'start' | 'doorOpen' | 'doorClose' | 'depart', v: VehicleState) {
    if (this.events.length < 32) this.events.push({ type, id: v.id, kind: v.kind, x: v.x, z: v.z });
  }
  /** Yetib kelishlar (sahna «+N» belgisi va Dastyor uchun) */
  arrivals: { house: string; count: number; x: number; z: number; t: number }[] = [];
  private drives = new Map<string, Drive>();
  private dispatchT = 0;
  private validateT = 0;
  private citySpawnT = 0;
  private time = 0;
  private routeCache = new Map<string, Cell[][] | null>();
  private routeKey = '';

  // ---------- hisoblar ----------

  /** Uyga band qilingan (yo‘lda kelayotgan) o‘rinlar */
  reserved(houseId: string): number {
    let n = 0;
    for (const t of this.trips) for (const s of t.stops) if (!s.done && s.house === houseId) n += s.count;
    return n;
  }

  /** Yo‘lda kelayotgan aholi (transportda) */
  get enRoute(): number {
    let n = 0;
    for (const t of this.trips) for (const s of t.stops) if (!s.done) n += s.count;
    return n;
  }

  get queued(): number {
    let n = 0;
    for (const v of this.demand.values()) n += v;
    return n;
  }

  /** Haqiqatan bo‘sh uy o‘rinlari: sig‘im − yashayotgan − band qilingan (tayyor uylar) */
  freeSeats(objects: Iterable<PlacedObject>): number {
    let n = 0;
    for (const o of objects) if (isHouse(o) && !o.build) n += Math.max(0, CATALOG[o.type].capacity - o.residents - this.reserved(o.id));
    return n;
  }

  /**
   * Hisob davri: mavjud ko‘chib kelish formulasi (houseForecast.nextDelta) endi darhol qo‘shilmaydi — navbatga
   * qo‘shiladi va transportda keladi. Navbat bo‘sh o‘rindan oshmaydi; ta’minot yo‘qolsa uyning navbati bekor.
   */
  addDemand(o: PlacedObject, nextDelta: number, served: boolean) {
    if (!served) { this.demand.delete(o.id); return; }
    // har uyga bir marta: oila joylashgan (yoki eski saqlashda aholisi bor) uyga qayta olib kelinmaydi
    if (o.settled || o.residents > 0) { this.demand.delete(o.id); return; }
    void nextDelta;
    const want = settleSize(o, CATALOG[o.type].capacity) - this.reserved(o.id);
    if (want > 0) this.demand.set(o.id, want);
    else this.demand.delete(o.id);
  }

  // ---------- grafik ----------

  ensureGraph(w: TrafficWorld): RoadGraph {
    if (!this.graph || this.graph.version !== w.version) {
      this.graph = new RoadGraph(w.roads, w.objects.values(), w.version, { free: w.free, inside: w.inside });
      this.routeCache.clear();
      // yo‘l o‘zgardi: harakatdagilar yo‘lini qayta hisoblaydi (joyidan)
      this.drives.clear();
    }
    return this.graph;
  }

  /** Qo‘lda yopilgan darvoza — reja tuzishda o‘tib bo‘lmaydi (transport uni o‘zboshimchalik bilan ochmaydi) */
  private closedGate = (x: number, z: number): boolean => {
    const g = this.graph?.gateAt(x, z);
    return !!g && !g.build && g.gate?.mode === 'manual' && g.gate.want === 'closed';
  };

  private gateKey(): string {
    if (!this.graph) return '';
    let k = '';
    for (const g of this.graph.gates.values()) { const c = gateCenter(g); k += g.id + (this.closedGate(c.x, c.z) ? 'c' : 'o'); }
    return k;
  }

  /** Kirish–uy–chiqish yo‘llari keshi: yo‘llar yoki darvoza holati o‘zgarganda tozalanadi (har kadrda hisoblanmaydi) */
  private cachedChain(name: string, f: () => Cell[][] | null) {
    const k = `${this.graph?.version}|${this.gateKey()}`;
    if (k !== this.routeKey) { this.routeKey = k; this.routeCache.clear(); }
    if (!this.routeCache.has(name)) this.routeCache.set(name, f());
    return this.routeCache.get(name)!;
  }

  private dangerAtEntry(w: TrafficWorld, c: Cell) {
    const r = MIGRATION_CONFIG.entryDangerRadius;
    return w.dinoBodies.some((b) => Math.hypot(b.x - c.x - 0.5, b.z - c.z - 0.5) < r + b.r);
  }

  /** Kirishdan (tashqi yo‘l uchidan) uy oldigacha va undan chiqishgacha to‘liq yo‘l (tur qoidalari bilan) */
  private planChain(g: RoadGraph, w: TrafficWorld, kind: VehicleKind, houses: PlacedObject[], entryIdx: number): Cell[][] | null {
    const e = g.entries[entryIdx];
    let at = e.stub[e.stub.length - 1];
    let dir: number | null = (e.dir + 2) % 4;
    const legs: Cell[][] = [];
    for (const h of houses) {
      const leg = g.route(at, dir, g.curbCells(h), kind, this.closedGate);
      if (!leg) return null;
      legs.push(leg);
      at = leg[leg.length - 1];
      dir = leg.length > 1 ? dirIndex(leg[leg.length - 2], at) : dir;
    }
    const out = g.route(at, kind === 'car' ? null : dir, g.stubEnds(), kind, this.closedGate);
    if (!out) return null;
    legs.push(out);
    void w;
    return legs;
  }

  // ---------- qadam ----------

  step(dt: number, w: TrafficWorld) {
    this.time += dt;
    const g = this.ensureGraph(w);
    this.gateSignals.clear();
    this.arrivals = this.arrivals.filter((a) => this.time - a.t < 3);
    if (MIGRATION_CONFIG.transport) {
      this.validateT -= dt;
      if (this.validateT <= 0) { this.validateT = 1; this.validateStops(g, w); }
      this.dispatchT -= dt;
      if (this.dispatchT <= 0) { this.dispatchT = MIGRATION_CONFIG.dispatchEvery; this.dispatch(g, w); }
    }
    this.stepCity(dt, g, w);
    this.dispatchPolice(dt, g, w);
    const all = this.allVehicles();
    for (const t of [...this.trips]) this.stepTrip(t, dt, g, w, all);
    for (const c of [...this.city]) this.stepCityVehicle(c, dt, g, w, all);
    for (const u of [...this.police]) this.stepPolice(u, dt, g, w, all);
  }

  /** Hamma transport (ko‘rinish, tanlash, dinozavr uchun) */
  allVehicles(): VehicleState[] {
    return [...this.trips.map((t) => t.v), ...this.city.map((c) => c.v), ...this.police.map((u) => u.v)];
  }

  private dispatch(g: RoadGraph, w: TrafficWorld) {
    const houses = [...w.objects.values()].filter((o) => isHouse(o) && !o.build);
    // to‘xtash sababi (birinchi to‘g‘ri kelgani)
    // oila hali joylashmagan uylar (har uyga bir marta)
    const vacant = houses.filter((o) => !o.settled && o.residents === 0 && CATALOG[o.type].capacity - this.reserved(o.id) > 0);
    const served = vacant.filter((o) => { const st = w.statuses.get(o.id); return st?.road && st.power && st.water; });
    if (!vacant.length) { this.block = 'noVacancy'; return; }
    if (!served.length) { this.block = vacant.some((o) => !w.statuses.get(o.id)?.road) ? 'noRoad' : 'noSupply'; return; }
    if (!g.entries.length) { this.block = 'noEntry'; return; }
    const safe = g.entries.map((e, i) => ({ e, i })).filter(({ e }) => !this.dangerAtEntry(w, e.stub[e.stub.length - 1]) && !this.dangerAtEntry(w, e.cell));
    // har uy uchun eng yaqin kirish va yo‘l (kesh)
    const reach = (h: PlacedObject, kind: VehicleKind, list: { i: number }[]) => {
      let best: { legs: Cell[][]; entry: number; len: number } | null = null;
      for (const { i } of list) {
        const legs = this.cachedChain(`${kind}|${h.id}|${i}`, () => this.planChain(g, w, kind, [h], i));
        if (!legs) continue;
        const len = legs[0].length;
        if (!best || len < best.len) best = { legs, entry: i, len };
      }
      return best;
    };
    const allEntries = g.entries.map((_, i) => ({ i }));
    const reachable = served.filter((h) => reach(h, 'car', allEntries));
    if (!reachable.length) {
      const open = served.some((h) => g.entries.some((e) => g.route(e.stub[e.stub.length - 1], (e.dir + 2) % 4, g.curbCells(h), 'car')));
      this.block = open ? 'gateClosed' : 'noRoad';
      return;
    }
    if (!safe.length) { this.block = 'unsafe'; return; }
    if (this.trips.length >= MIGRATION_CONFIG.maxTrips) { this.block = 'full'; return; }
    const want = reachable.filter((h) => (this.demand.get(h.id) ?? 0) > 0);
    if (!want.length) { this.block = 'waiting'; return; }
    this.block = 'ok';
    // avtobus: shahar rivojlangan va talab katta bo‘lsa — yaqin uylarga taqsimlab
    const totalDemand = want.reduce((s, h) => s + (this.demand.get(h.id) ?? 0), 0);
    const C = MIGRATION_CONFIG;
    if (w.population >= C.busMinPopulation && totalDemand >= C.busPeople[0]) {
      // avtobus — katta guruh (ko‘p qavatli uy: 8+ kishi) uchun; kichik uylarga avtomobil keladi
      const withRoute = want.filter((h) => (this.demand.get(h.id) ?? 0) >= C.busPeople[0]).map((h) => ({ h, r: reach(h, 'bus', safe) })).filter((x) => x.r).sort((a, b) => a.r!.len - b.r!.len);
      if (withRoute.length) {
        const first = withRoute[0];
        const fc = g.curbCells(first.h)[0];
        const group = [first, ...withRoute.slice(1).filter((x) => { const c = g.curbCells(x.h)[0]; return Math.abs(c.x - fc.x) + Math.abs(c.z - fc.z) <= 14; })].slice(0, C.busMaxStops);
        let total = 0;
        const stops: TripStop[] = [];
        for (const x of group) {
          const n = Math.min(this.demand.get(x.h.id) ?? 0, C.busPeople[1] - total);
          if (n <= 0) continue;
          stops.push({ house: x.h.id, count: n, done: false });
          total += n;
        }
        // butun zanjir (bekatlar tartibida) avtobusga mos bo‘lsa
        const legs = total >= C.busPeople[0] ? this.planChain(g, w, 'bus', stops.map((s) => w.objects.get(s.house)!), first.r!.entry) : null;
        if (legs) { this.launch('bus', stops, g, first.r!.entry, legs[0]); return; }
      }
    }
    // avtomobil: eng ko‘p kutayotgan uyga oila (1–4 kishi)
    const h = want.sort((a, b) => (this.demand.get(b.id) ?? 0) - (this.demand.get(a.id) ?? 0))[0];
    const r = reach(h, 'car', safe);
    if (!r) { this.block = 'unsafe'; return; }
    // butun oila bitta avtomobilda (ko‘pi bilan 4 kishi)
    const n = Math.max(1, Math.min(this.demand.get(h.id) ?? 0, C.carPeople[1]));
    this.launch('car', [{ house: h.id, count: n, done: false }], g, r.entry, r.legs[0]);
  }

  private launch(kind: VehicleKind, stops: TripStop[], g: RoadGraph, entryIdx: number, firstLeg: Cell[]) {
    for (const s of stops) {
      const left = (this.demand.get(s.house) ?? 0) - s.count;
      if (left > 0) this.demand.set(s.house, left); else this.demand.delete(s.house);
    }
    const e = g.entries[entryIdx];
    const start = e.stub[e.stub.length - 1];
    const d = (e.dir + 2) % 4;
    const heading = Math.atan2([-1, 0, 1, 0][d], [0, 1, 0, -1][d]);
    const id = 'm' + this.seq++;
    const people = stops.reduce((s, x) => s + x.count, 0);
    const v: VehicleState = { id, kind, x: start.x + 0.5, z: start.z + 0.5, heading, speed: 0, wheel: 0, look: this.seq % 3 };
    // tashqi yo‘l uchidagi qatorga
    const off = VEHICLE_SPECS[kind].lane;
    v.x += -Math.sin(heading) * off;
    v.z += Math.cos(heading) * off;
    const t: Trip = { id, kind, people, stops, phase: 'arriving', v, timer: 0 };
    this.trips.push(t);
    this.drives.set(id, newDrive(firstLeg, kind));
  }

  /** Manzil uy yaroqsiz bo‘lsa — boshqa mos uy; topilmasa bekat bekor (yo‘lovchilar transportda qoladi) */
  private validateStops(g: RoadGraph, w: TrafficWorld) {
    for (const t of this.trips) {
      if (t.phase === 'leaving') continue;
      let changed = false;
      for (const s of t.stops) {
        if (s.done) continue;
        const o = w.objects.get(s.house);
        const st = o ? w.statuses.get(o.id) : undefined;
        const ok = isHouse(o) && !o!.build && st?.road && st.power && st.water && CATALOG[o!.type].capacity - o!.residents - this.reserved(o!.id) + s.count >= s.count;
        if (ok) continue;
        const here = cellOf(t.v, g);
        const alt = [...w.objects.values()].find((h) => {
          if (!isHouse(h) || h.build || h.id === s.house) return false;
          const hs = w.statuses.get(h.id);
          if (!(hs?.road && hs.power && hs.water)) return false;
          if (CATALOG[h.type].capacity - h.residents - this.reserved(h.id) - (this.demand.get(h.id) ?? 0) < s.count) return false;
          return !!g.route(here, headingDir(t.v.heading), g.curbCells(h), t.kind, this.closedGate);
        });
        if (alt) s.house = alt.id;
        else { s.done = true; s.count = 0; }
        changed = true;
      }
      t.stops = t.stops.filter((s) => !(s.done && s.count === 0));
      if (changed) {
        this.drives.delete(t.id);
        if (!t.stops.some((s) => !s.done) && t.phase === 'arriving') t.phase = 'leaving';
      }
    }
  }

  /** Joriy maqsad uchun yo‘l (joyidan, yo‘nalishini hisobga olib) */
  private plan(t: { v: VehicleState; kind: VehicleKind }, g: RoadGraph, targets: Cell[], avoid?: Cell | null): Drive | null {
    const here = cellOf(t.v, g);
    const blocked = (x: number, z: number) => this.closedGate(x, z) || (!!avoid && avoid.x === x && avoid.z === z);
    const cells = g.route(here, t.kind === 'car' ? null : headingDir(t.v.heading), targets, t.kind, blocked)
      ?? g.route(here, null, targets, t.kind, blocked);
    return cells ? newDrive(cells, t.kind) : null;
  }

  private tripTarget(t: Trip, g: RoadGraph, w: TrafficWorld): Cell[] {
    if (t.phase === 'leaving') return g.stubEnds();
    const s = t.stops.find((x) => !x.done);
    const h = s ? w.objects.get(s.house) : undefined;
    return h ? g.curbCells(h) : g.stubEnds();
  }

  private stepTrip(t: Trip, dt: number, g: RoadGraph, w: TrafficWorld, all: VehicleState[]) {
    if (t.phase === 'unloading') {
      t.timer -= dt;
      if (t.timer > 0) return;
      const s = t.stops.find((x) => !x.done);
      if (s) {
        const added = w.deliver(s.house, s.count);
        const o = w.objects.get(s.house);
        if (o && added > 0) this.arrivals.push({ house: s.house, count: added, x: o.gridX, z: o.gridZ, t: this.time });
        s.done = true;
      }
      t.phase = t.stops.some((x) => !x.done) ? 'arriving' : 'leaving';
      this.drives.delete(t.id);
      if (t.kind === 'bus') { this.ev('doorClose', t.v); this.ev('depart', t.v); } else this.ev('start', t.v);
      return;
    }
    let d = this.drives.get(t.id);
    if (!d) {
      d = this.plan(t, g, this.tripTarget(t, g, w)) ?? undefined;
      if (!d) {
        // yo‘l yo‘q: kutadi (teleport yo‘q); uzoq kutsa — kelayotgan safar bekor, chiqishga qaytadi
        t.timer += dt;
        if (t.timer > MIGRATION_CONFIG.giveUpSeconds && t.phase === 'arriving') this.cancel(t);
        return;
      }
      t.timer = 0;
      this.drives.set(t.id, d);
    }
    const done = this.drive(t.v, d, dt, g, w, all);
    if (d.wait && t.v.speed < 0.02) {
      d.waitT += dt;
      if (d.waitT > MIGRATION_CONFIG.giveUpSeconds) {
        // cheklangan qayta urinish: to‘siqni chetlab boshqa yo‘l; bo‘lmasa — kelayotgan safar bekor, qaytish
        const alt = this.plan(t, g, this.tripTarget(t, g, w), d.blockCell);
        if (alt) this.drives.set(t.id, alt);
        else if (t.phase === 'arriving') this.cancel(t);
        else d.waitT = 0;
      }
      return;
    }
    if (!done) return;
    if (t.phase === 'leaving') {
      // faqat tashqi yo‘l uchiga (xarita chetidan tashqarida) yetgach olib tashlanadi
      if (g.entryOfStubEnd(cellOf(t.v, g))) { this.trips = this.trips.filter((x) => x !== t); this.drives.delete(t.id); }
      else this.drives.delete(t.id);
      return;
    }
    t.phase = 'unloading';
    t.timer = MIGRATION_CONFIG.unloadSeconds[t.kind === 'bus' ? 'bus' : 'car'];
    if (t.kind === 'bus') this.ev('doorOpen', t.v);
  }

  /** Safar bekor: band qilingan o‘rinlar bo‘shaydi (odamlar keyinroq yana navbatga turadi), transport chiqishga qaytadi */
  private cancel(t: Trip) {
    for (const s of t.stops) if (!s.done && s.count > 0) this.demand.set(s.house, (this.demand.get(s.house) ?? 0) + s.count);
    t.stops = t.stops.filter((s) => s.done);
    t.phase = 'leaving';
    t.timer = 0;
    this.drives.delete(t.id);
  }

  /**
   * Bitta transport harakati: oldingi transportga masofa, dinozavr, darvoza — ruxsat etilgan tezlik.
   * Darvozaga ochilish so‘rovi va o‘tish bandligi shu yerda yoziladi.
   */
  private drive(v: VehicleState, d: Drive, dt: number, g: RoadGraph, w: TrafficWorld, all: VehicleState[]): boolean {
    const sp = VEHICLE_SPECS[v.kind];
    const half = sp.length / 2;
    let limit: number = sp.speed;
    d.wait = null;
    const brake = (gap: number) => Math.sqrt(2 * sp.accel * Math.max(0, gap));
    // darvoza: bandlik (tana o‘tish joyida) va so‘rov (oldinda)
    for (const gate of g.gates.values()) {
      if (gate.build) continue;
      const gc = gateCenter(gate);
      const inside = bodyPoints(v).some((p) => Math.abs(p.x - gc.x - 0.5) < (gate.rotation % 2 === 0 ? 1.6 : 0.75) && Math.abs(p.z - gc.z - 0.5) < (gate.rotation % 2 === 0 ? 0.75 : 1.6));
      if (inside) this.signal(gate.id).busy = true;
    }
    const ahead = lookAhead(v, d, half + 5);
    let gateDone = false;
    for (const p of ahead) {
      const gate = g.gateAt(p.cell.x, p.cell.z);
      if (gate && !gate.build && !gateDone) {
        gateDone = true;
        const s = gate.gate;
        const passable = !!s && s.open >= 1 && s.want === 'open';
        const committed = this.signal(gate.id).busy;
        if (!committed) {
          if (s?.mode === 'auto') this.signal(gate.id).request = true;
          if (!passable) {
            // tashqarida xavfsiz kutish chizig‘i: o‘tish joyidan oldin
            const gap = p.s - half - 0.75;
            limit = Math.min(limit, brake(gap));
            d.wait = s?.mode === 'manual' && s.want === 'closed' ? 'gate-closed' : s?.mode === 'auto' && s.want === 'closed' && (s.open === 0) ? 'gate-danger' : 'gate-opening';
            d.blockCell = { ...p.cell };
          }
        }
      }
      if (p.s > half + 2.2) continue;
      // dinozavr: oldinda tana — sekinlashib to‘xtaydi (urilmaydi, ichidan o‘tmaydi)
      const hit = w.dinoCells.has(p.cell.x + ',' + p.cell.z) && w.dinoBodies.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < b.r + sp.width);
      if (hit) {
        limit = Math.min(limit, brake(p.s - half - 0.35));
        d.wait = 'blocked';
        d.blockCell = { ...p.cell };
        break;
      }
    }
    // oldingi transport (shu yo‘nalishda) — xavfsiz masofa
    const hx = Math.cos(v.heading), hz = Math.sin(v.heading);
    for (const o of all) {
      if (o === v) continue;
      const rx = o.x - v.x, rz = o.z - v.z;
      const along = rx * hx + rz * hz;
      if (along <= 0 || along > 3) continue;
      const lat = Math.abs(rx * hz - rz * hx);
      if (lat > 0.17) continue;
      if (Math.cos(o.heading - v.heading) < 0.2) continue;
      const gap = along - half - VEHICLE_SPECS[o.kind].length / 2 - 0.18;
      const lim = brake(gap);
      if (lim < limit) { limit = lim; if (!d.wait && lim < 0.05) d.wait = 'traffic'; }
    }
    if (!d.wait) d.waitT = 0;
    return stepVehicle(v, d, dt, limit);
  }

  private signal(id: string): GateSignal {
    let s = this.gateSignals.get(id);
    if (!s) { s = { request: false, busy: false }; this.gateSignals.set(id, s); }
    return s;
  }

  // ---------- shahar ichidagi transport ----------

  private stepCity(dt: number, g: RoadGraph, w: TrafficWorld) {
    const C = CITY_TRAFFIC_CONFIG;
    this.citySpawnT -= dt;
    if (this.citySpawnT > 0) return;
    this.citySpawnT = C.spawnEvery;
    const active = [...w.objects.values()].filter((o) => !o.build);
    const cars = this.city.filter((c) => c.phase !== 'bus').length;
    const carTarget = Math.min(C.carMax, Math.floor(w.population / C.peoplePerCar));
    if (cars < carTarget) {
      const homes = active.filter((o) => isHouse(o) && o.residents > 0 && g.curbCells(o).length);
      const dests = active.filter((o) => { const k = CATALOG[o.type].kind; return (k === 'business' || k === 'service' || k === 'education') && g.curbCells(o).length && w.statuses.get(o.id)?.road; });
      if (homes.length && dests.length) {
        const n = this.seq++;
        const home = homes[(n * 7919) % homes.length], dest = dests[(n * 104729) % dests.length];
        const start = g.curbCells(home)[0];
        const cells = g.route(start, null, g.curbCells(dest), 'car', this.closedGate);
        if (cells && cells.length > 1) {
          const v: VehicleState = { id: 'c' + n, kind: 'car', x: start.x + 0.5, z: start.z + 0.5, heading: Math.atan2(cells[1].z - start.z, cells[1].x - start.x), speed: 0, wheel: 0, look: n % 3 };
          this.city.push({ v, phase: 'out', home: home.id, dest: dest.id, timer: 0 });
          this.ev('start', v);
          this.drives.set(v.id, newDrive(cells, 'car'));
        }
      }
    } else if (cars > carTarget) {
      // aholi kamaygan: yangi safar boshlanmaydi, mavjudlari uyga qaytib tugaydi
    }
    // bekatli avtobuslar
    const stops = active.filter((o) => o.type === 'avtobus_bekati' && g.curbCells(o).length).sort((a, b) => Math.atan2(a.gridZ - 20, a.gridX - 20) - Math.atan2(b.gridZ - 20, b.gridX - 20));
    const buses = this.city.filter((c) => c.phase === 'bus');
    // shahar avtobusi: bekatlar bo‘lsa va yo‘lovchi bo‘ladigan aholi yetarli bo‘lsa (bo‘sh qatnamaydi)
    const busTarget = stops.length >= 2 && w.population >= C.busMinPopulation ? Math.min(C.busMax, 1 + Math.floor(w.population / C.peoplePerBus)) : 0;
    if (buses.length < busTarget) {
      const k = buses.length;
      const first = stops[(k * Math.max(1, Math.floor(stops.length / busTarget))) % stops.length];
      const at = g.curbCells(first)[0];
      const n = this.seq++;
      const v: VehicleState = { id: 'b' + n, kind: 'bus', x: at.x + 0.5, z: at.z + 0.5, heading: 0, speed: 0, wheel: 0, look: 0 };
      this.city.push({ v, phase: 'bus', home: first.id, dest: first.id, timer: C.busDwell, route: { stops: stops.map((s) => s.id), idx: stops.indexOf(first) } });
    }
    for (const b of buses) if (b.route) b.route.stops = stops.map((s) => s.id);
    // bekatlar yetmay qolsa — ortiqcha avtobus keyingi bekatda tugaydi
    if (buses.length > busTarget) { const extra = buses[buses.length - 1]; extra.route = { stops: [], idx: 0 }; }
  }

  private stepCityVehicle(c: CityVehicle, dt: number, g: RoadGraph, w: TrafficWorld, all: VehicleState[]) {
    const C = CITY_TRAFFIC_CONFIG;
    const drop = () => { this.city = this.city.filter((x) => x !== c); this.drives.delete(c.v.id); };
    if (c.phase === 'atDest') {
      c.timer -= dt;
      if (c.timer > 0) return;
      const home = w.objects.get(c.home);
      if (!home) { drop(); return; }
      const d = this.plan({ v: c.v, kind: 'car' }, g, g.curbCells(home));
      if (!d) { drop(); return; }
      this.drives.set(c.v.id, d);
      c.phase = 'back';
      this.ev('start', c.v);
      return;
    }
    if (c.phase === 'bus') {
      const r = c.route!;
      if (!r.stops.length) { drop(); return; }
      if (!this.drives.has(c.v.id)) {
        c.timer -= dt;
        if (c.timer > 0) return;
        r.idx = (r.idx + 1) % r.stops.length;
        const stop = w.objects.get(r.stops[r.idx]);
        const d = stop ? this.plan({ v: c.v, kind: 'bus' }, g, g.curbCells(stop)) : null;
        if (!d) { c.timer = C.busDwell; return; }
        this.drives.set(c.v.id, d);
        this.ev('doorClose', c.v);
        this.ev('depart', c.v);
      }
    }
    let d = this.drives.get(c.v.id);
    if (!d) {
      const tgt = w.objects.get(c.phase === 'out' ? c.dest : c.home);
      d = tgt ? this.plan({ v: c.v, kind: c.v.kind }, g, g.curbCells(tgt)) ?? undefined : undefined;
      if (!d) { if (c.phase !== 'bus') drop(); return; }
      this.drives.set(c.v.id, d);
    }
    const done = this.drive(c.v, d, dt, g, w, all);
    if (d.wait && c.v.speed < 0.02) {
      d.waitT += dt;
      if (d.waitT > MIGRATION_CONFIG.giveUpSeconds) { const alt = this.plan({ v: c.v, kind: c.v.kind }, g, d.cells.slice(-1), d.blockCell); if (alt) this.drives.set(c.v.id, alt); else d.waitT = 0; }
      return;
    }
    if (!done) return;
    this.drives.delete(c.v.id);
    if (c.phase === 'out') { c.phase = 'atDest'; c.timer = C.dwell[0] + ((c.v.wheel * 13) % (C.dwell[1] - C.dwell[0])); }
    else if (c.phase === 'back') drop(); // uyga yetdi — hovliga kirdi, safar tugadi
    else if (c.phase === 'bus') { c.timer = C.busDwell; this.ev('doorOpen', c.v); }
  }

  // ---------- politsiya ----------

  private policeT = 0;
  /** Shahar ichidagi har dinozavrga (biriktirilmagan bo‘lsa) eng yaqin bo‘limdan mashina — limit bilan */
  private dispatchPolice(dt: number, g: RoadGraph, w: TrafficWorld) {
    this.policeT -= dt;
    if (this.policeT > 0) return;
    this.policeT = 1;
    for (const dn of w.intruders ?? []) {
      if (this.police.some((u) => u.dino === dn.id && u.phase !== 'back')) continue;
      if (this.police.length >= POLICE_CONFIG.maxTotal) return;
      const st = (w.stations ?? [])
        .filter((s) => this.police.filter((u) => u.station === s.id).length < POLICE_CONFIG.perStation && g.curbCells(s).length)
        .sort((a, b) => Math.hypot(a.gridX - dn.x, a.gridZ - dn.z) - Math.hypot(b.gridX - dn.x, b.gridZ - dn.z))[0];
      if (!st) return;
      const at = g.curbCells(st)[0];
      const id = 'p' + this.seq++;
      const v: VehicleState = { id, kind: 'police', x: at.x + 0.5, z: at.z + 0.5, heading: 0, speed: 0, wheel: 0, look: 0 };
      this.police.push({ v, station: st.id, dino: dn.id, phase: 'go', retarget: 0 });
      this.ev('start', v);
    }
  }

  /** Dinozavrga eng yaqin yo‘l kataklari */
  private nearDino(g: RoadGraph, x: number, z: number): Cell[] {
    const out: { c: Cell; d: number }[] = [];
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
      const c = { x: Math.floor(x) + dx, z: Math.floor(z) + dz };
      if (g.has(c.x, c.z) && !g.gateAt(c.x, c.z)) out.push({ c, d: Math.hypot(c.x + 0.5 - x, c.z + 0.5 - z) });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, 6).map((q) => q.c);
  }

  private stepPolice(u: PoliceUnit, dt: number, g: RoadGraph, w: TrafficWorld, all: VehicleState[]) {
    const drop = () => { this.police = this.police.filter((x) => x !== u); this.drives.delete(u.v.id); };
    const dn = (w.intruders ?? []).find((q) => q.id === u.dino);
    if (u.phase !== 'back' && !dn) { u.phase = 'back'; this.drives.delete(u.v.id); }
    if (dn && u.phase === 'go' && Math.hypot(dn.x - u.v.x, dn.z - u.v.z) < POLICE_CONFIG.evictDistance) {
      // sirena va chiroq bilan yaqinlashdi — dinozavr shahardan chiqib ketadi
      w.evict?.(u.dino);
      u.phase = 'escort';
    }
    u.retarget -= dt;
    if (u.phase !== 'back' && dn && (u.retarget <= 0 || !this.drives.has(u.v.id))) {
      u.retarget = 3;
      const d = this.plan({ v: u.v, kind: 'police' }, g, this.nearDino(g, dn.x, dn.z));
      if (d) this.drives.set(u.v.id, d);
    }
    if (u.phase === 'back' && !this.drives.has(u.v.id)) {
      const st = w.objects.get(u.station);
      const d = st ? this.plan({ v: u.v, kind: 'police' }, g, g.curbCells(st)) : null;
      if (!d) { drop(); return; }
      this.drives.set(u.v.id, d);
    }
    const d = this.drives.get(u.v.id);
    if (!d) return;
    const done = this.drive(u.v, d, dt, g, w, all);
    if (done) {
      this.drives.delete(u.v.id);
      if (u.phase === 'back') drop(); // bo‘limga qaytdi
    }
  }

  // ---------- holat ----------

  /** Transport holati (UI) */
  statusOf(id: string): { kind: VehicleKind; status: VehicleStatus; people: number; stops: TripStop[]; migration: boolean } | null {
    const t = this.trips.find((x) => x.id === id);
    const d = this.drives.get(id);
    const waitS: VehicleStatus | null = d?.wait === 'gate-closed' || d?.wait === 'gate-danger' || d?.wait === 'gate-opening' ? 'Darvozada kutmoqda' : d?.wait === 'blocked' ? 'Yo‘l band' : null;
    if (t) {
      const status: VehicleStatus = t.phase === 'unloading' ? 'Yo‘lovchilar joylashmoqda' : waitS ?? (t.phase === 'leaving' ? 'Qaytmoqda' : 'Kelyapti');
      return { kind: t.kind, status, people: t.stops.filter((s) => !s.done).reduce((a, s) => a + s.count, 0), stops: t.stops, migration: true };
    }
    const pu = this.police.find((x) => x.v.id === id);
    if (pu) return { kind: 'police', status: pu.phase === 'go' ? 'Dinozavrga ketmoqda' : pu.phase === 'escort' ? 'Dinozavrni chiqarmoqda' : 'Bo‘limga qaytmoqda', people: 0, stops: [], migration: false };
    const c = this.city.find((x) => x.v.id === id);
    if (!c) return null;
    const status: VehicleStatus = waitS ?? (c.phase === 'bus' ? (d ? 'Manzilga ketmoqda' : 'Bekatda') : c.phase === 'out' ? 'Manzilga ketmoqda' : c.phase === 'atDest' ? 'Manzilda' : 'Uyga qaytmoqda');
    return { kind: c.v.kind, status, people: 0, stops: [], migration: false };
  }

  waitReason(id: string): string | null {
    const d = this.drives.get(id);
    if (!d?.wait) return null;
    return { 'gate-closed': 'Darvoza qo‘lda yopiq — transport uni o‘zi ochmaydi', 'gate-danger': 'Darvoza yaqinida dinozavr bor — xavfsiz kutish nuqtasida', 'gate-opening': 'Darvoza ochilishini kutmoqda', blocked: 'Oldinda dinozavr — yo‘l bo‘shashini kutmoqda', traffic: 'Oldidagi transportni kutmoqda' }[d.wait];
  }

  /** Dinozavrlar uchun: transport joylari va yo‘l kutayotganlar */
  vehicleBodies(): { x: number; z: number; r: number; waiting: boolean }[] {
    return this.allVehicles().map((v) => ({ x: v.x, z: v.z, r: VEHICLE_SPECS[v.kind].length / 2, waiting: this.drives.get(v.id)?.wait === 'blocked' }));
  }

  // ---------- saqlash ----------

  save(): MigrationSave {
    return { seq: this.seq, demand: Object.fromEntries(this.demand), trips: this.trips.map((t) => structuredClone(t)) };
  }

  load(s: MigrationSave | undefined, objects: Map<string, PlacedObject>) {
    this.trips = [];
    this.demand.clear();
    this.city = [];
    this.police = [];
    this.drives.clear();
    this.graph = null;
    if (!s) return;
    this.seq = Number.isInteger(s.seq) && s.seq > 0 ? s.seq : 1;
    for (const [k, n] of Object.entries(s.demand ?? {})) if (objects.has(k) && Number.isInteger(n) && n > 0) this.demand.set(k, n);
    for (const t of s.trips ?? []) if (isTrip(t)) this.trips.push(structuredClone(t));
    // band qilingan o‘rinlar sig‘imdan oshmasin
    for (const o of objects.values()) {
      if (!isHouse(o)) continue;
      let free = CATALOG[o.type].capacity - o.residents;
      for (const t of this.trips) for (const st of t.stops) if (!st.done && st.house === o.id) { st.count = Math.max(0, Math.min(st.count, free)); free -= st.count; }
      // navbat yangi qoidaga: joylashgan uyga yo‘q, qolganiga — uy hajmiga mos bitta oila
      const dm = this.demand.get(o.id);
      if (dm !== undefined) {
        const reservedHere = CATALOG[o.type].capacity - o.residents - free;
        const n = o.settled || o.residents > 0 ? 0 : Math.min(dm, Math.max(0, free), settleSize(o, CATALOG[o.type].capacity) - reservedHere);
        if (n > 0) this.demand.set(o.id, n); else this.demand.delete(o.id);
      }
    }
  }
}

export function isTrip(v: unknown): v is Trip {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  const n = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const ve = t.v as Record<string, unknown> | undefined;
  return typeof t.id === 'string' && (t.kind === 'car' || t.kind === 'bus') && n(t.people) && Array.isArray(t.stops)
    && (t.stops as unknown[]).every((s) => { const q = s as Record<string, unknown>; return !!q && typeof q.house === 'string' && Number.isInteger(q.count) && (q.count as number) >= 0 && typeof q.done === 'boolean'; })
    && (t.phase === 'arriving' || t.phase === 'unloading' || t.phase === 'leaving') && n(t.timer)
    && !!ve && [ve.x, ve.z, ve.heading, ve.speed, ve.wheel].every(n) && ve.kind === t.kind;
}
