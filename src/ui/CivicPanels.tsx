import { useState } from 'react';
import { CIVIC_BY_TYPE, CIVIC_CONFIG, isCivic } from '../game/civicDefs';
import { isSecurity } from '../game/civic';
import { fmt, type Game } from '../game/game';
import { TAX_PER_RESIDENT, TICK_SECONDS } from '../game/simulation';
import type { PlacedObject } from '../game/types';
import { signed } from './Hud';
import { Icon } from './icons';
import { useGame, useScene } from './useGame';

/** Boshqaruv/xizmat binosi uchun ma’lumot paneli bloki (InfoPanel ichida). */
export function CivicInfo({ o }: { o: PlacedObject }) {
  const g = useGame();
  const st = g.statuses.get(o.id);
  const def = isCivic(o.type) ? CIVIC_BY_TYPE[o.type] : null;
  const needs = def?.needs ?? { road: true, power: true, water: false };
  const active = !!st?.active;
  const problems: { text: string; fix: string }[] = [];
  if (needs.road && !st?.road) problems.push({ text: 'Yo‘lga ulanmagan', fix: 'Bino chetiga tegib turgan yo‘l quring va uni shahar ko‘chasiga ulang.' });
  if (needs.power && !st?.power) problems.push({ text: 'Elektr yo‘q', fix: 'Yo‘lga ulangan elektr stansiyasini 8 katak ichida quring.' });
  if (needs.water && !st?.water) problems.push({ text: 'Suv yo‘q', fix: 'Yo‘lga ulangan suv stansiyasini 6 katak ichida quring.' });
  return (
    <div className="edu-info civic-info" data-testid="info-civic">
      <div className="kv-row">
        <span className="kv-ico"><Icon.gov size={20} /></span>
        <span className="kv-label">Vazifa</span>
        <b data-testid="info-civic-role">{def?.roleName ?? 'Mahalla xavfsizligi'}</b>
      </div>
      <div className="kv-row">
        <span className="kv-ico"><Icon.wrench size={20} /></span>
        <span className="kv-label">Holat</span>
        <span className={'state-chip ' + (active ? 'ok' : 'bad')} data-testid="info-civic-state" data-active={active}>{active ? 'Faol' : 'To‘xtagan'}</span>
      </div>
      {problems.length > 0 && (
        <div className="why" data-testid="info-why">
          <b>Nega ishlamayapti?</b>
          <ul>{problems.map((p) => <li key={p.text}><b>{p.text}</b> — {p.fix}</li>)}</ul>
        </div>
      )}
      {o.type === 'hokimlik' && (active ? <HokimlikBody /> : <div className="info-note">To‘xtagan — murojaatlar ko‘rsatilmaydi. Asosiy boshqaruv (budjet, ta’minot paneli) baribir ishlaydi.</div>)}
      {o.type === 'moliya' && (active ? <MoliyaBody /> : <div className="info-note">To‘xtagan — hisobot yo‘q. «Shahar budjeti» paneli (pul tugmasi) baribir ishlaydi.</div>)}
      {o.type === 'soliq' && (active ? <SoliqBody /> : <div className="info-note">To‘xtagan — hisobot yo‘q. Soliqlar baribir yig‘ilaveradi (bino soliq yaratmaydi ham, to‘xtatmaydi ham).</div>)}
      {o.type === 'milliy_bank' && <BankBody active={active} />}
      {o.type === 'ekologiya' && (active ? <EkologiyaBody /> : <div className="info-note">To‘xtagan — monitoring yo‘q. Muammolar baribir hokimlik murojaatlarida ko‘rinadi.</div>)}
      {o.type === 'suv_tozalash' && <TozalashBody id={o.id} />}
      {isSecurity(o.type) && <SecurityBody id={o.id} />}
    </div>
  );
}

function Row({ label, value, tone, testid }: { label: string; value: string; tone?: 'pos' | 'neg' | ''; testid?: string }) {
  return (
    <div className="civic-row">
      <span>{label}</span>
      <b className={tone ?? ''} data-testid={testid}>{value}</b>
    </div>
  );
}

function jump(g: Game, scene: ReturnType<typeof useScene>, x: number, z: number) {
  if (!scene) return;
  const s = scene.cam.state;
  scene.cam.set({ ...s, targetX: x - 20 + 0.5, targetZ: z - 20 + 0.5, distance: Math.min(s.distance, 16) });
  g.emit();
}

/** Hokimlik: shahar holati, budjet xulosasi, murojaatlar (bosilsa kamera joyga o‘tadi). */
function HokimlikBody() {
  const g = useGame();
  const scene = useScene();
  const b = g.budget;
  const list = g.appeals;
  return (
    <div className="civic-body" data-testid="hokimlik-body">
      <div className="civic-h">Shahar holati</div>
      <Row label="Aholi" value={fmt(g.population)} />
      <Row label="Baxt" value={g.happiness + '%'} />
      <Row label="Balans" value={fmt(g.money)} tone={g.money < 0 ? 'neg' : ''} />
      <Row label="Sof natija / davr" value={signed(b.net)} tone={b.net >= 0 ? 'pos' : 'neg'} />
      <div className="civic-h">Aholi murojaatlari ({list.length})</div>
      {list.length === 0 && <div className="info-note">Murojaat yo‘q — shaharda hammasi joyida.</div>}
      <div className="appeals" data-testid="appeals">
        {list.slice(0, 8).map((a) => (
          <button key={a.id} className={'appeal ' + a.tone} onClick={() => jump(g, scene, a.x, a.z)} data-testid={'appeal-' + a.id} title="Xaritada ko‘rsatish">
            <b>{a.title}</b>
            <span>{a.text}</span>
            <span className="appeal-fix">Yechim: {a.fix}</span>
            <span className="appeal-go"><Icon.chevron /> ({a.x}, {a.z})</span>
          </button>
        ))}
      </div>
      <RuleBox />
    </div>
  );
}

/** Moliya: daromad va xarajat, qurilish (bir martalik) alohida, kamomad sababi, prognoz. */
function MoliyaBody() {
  const g = useGame();
  const b = g.budget;
  const c = g.civic.construction;
  const exp = b.lines.filter((l) => l.kind === 'expense' && l.amount > 0).sort((x, y) => y.amount - x.amount);
  return (
    <div className="civic-body" data-testid="moliya-body">
      <div className="civic-h">Doimiy daromad / davr</div>
      {b.lines.filter((l) => l.kind === 'income').map((l) => <Row key={l.id} label={l.label} value={signed(l.amount)} tone="pos" />)}
      <div className="civic-h">Doimiy xizmat xarajati / davr</div>
      {b.lines.filter((l) => l.kind === 'expense').map((l) => <Row key={l.id} label={l.label} value={signed(-l.amount)} tone={l.amount ? 'neg' : ''} />)}
      <Row label="Sof natija / davr" value={signed(b.net)} tone={b.net >= 0 ? 'pos' : 'neg'} testid="moliya-net" />
      <div className="civic-h">Qurilish xarajati (bir martalik)</div>
      <Row label="Joriy davrda" value={fmt(c.period)} testid="moliya-build-period" />
      <Row label="O‘tgan davrda" value={fmt(c.lastPeriod)} />
      <Row label="Jami" value={fmt(c.total)} testid="moliya-build-total" />
      {g.civic.lastPenalty > 0 && <Row label="Jarima (o‘tgan davr)" value={signed(-g.civic.lastPenalty)} tone="neg" />}
      <div className="civic-h">Prognoz</div>
      <Row label="Keyingi davrdan keyin balans" value={g.paused ? 'Pauza' : '≈ ' + fmt(g.money + b.net)} testid="moliya-forecast" />
      {b.net < 0 && exp[0] && (
        <div className="why" data-testid="moliya-why">
          <b>Nega daromad xarajatdan kam?</b>
          <ul>
            <li>Eng katta xarajat: <b>{exp[0].label}</b> ({fmt(exp[0].amount)} / davr, {exp[0].count} ta).</li>
            {b.idleBusinesses > 0 && <li>{b.idleBusinesses} ta biznes daromad bermayapti (yo‘l, elektr, suv yoki aholi yo‘q).</li>}
            <li>Daromad: uylarga aholi kelsin (soliq) va bizneslarni ta’minotga ulang.</li>
          </ul>
        </div>
      )}
      <div className="info-note">Hisobot mavjud budjetdan olinadi — pul ikkinchi marta yechilmaydi. Ko‘p sarflashning o‘zi jarima emas.</div>
    </div>
  );
}

/** Soliq: mavjud soliq va biznes tushumlari (yangi soliq qo‘shilmaydi). */
function SoliqBody() {
  const g = useGame();
  const b = g.budget;
  const line = (id: string) => b.lines.find((l) => l.id === id)!;
  const pop = g.population;
  const biz = line('business');
  return (
    <div className="civic-body" data-testid="soliq-body">
      <div className="civic-h">Uy soliqlari</div>
      <Row label="Soliq bazasi" value={`${fmt(pop)} aholi`} />
      <Row label="Stavka" value={`${TAX_PER_RESIDENT} / aholi / davr`} />
      <Row label="Hisob davri" value={`${TICK_SECONDS} soniya (o‘yin vaqti)`} />
      <Row label="Tushum" value={signed(line('houseTax').amount) + ' / davr'} tone="pos" testid="soliq-house" />
      <div className="civic-h">Biznes tushumi</div>
      <Row label="Ishlayotgan bizneslar" value={`${biz.count} ta`} />
      <Row label="Ishlamayotganlar" value={`${b.idleBusinesses} ta`} />
      <Row label="Shahar tushumi" value={signed(biz.amount) + ' / davr'} tone="pos" testid="soliq-business" />
      <Row label="Malaka bonusi" value={signed(line('skillBonus').amount) + ' / davr'} />
      <Row label="Jami soliq va tushum" value={signed(b.income) + ' / davr'} tone="pos" testid="soliq-total" />
      <div className="info-note">
        Korxonaning savdo tushumi, o‘z xarajati va foydasi o‘yinda simulyatsiya qilinmaydi: shahar har ishlayotgan
        biznesdan belgilangan tushum oladi (yo‘l, elektr, suv va aholi bo‘lsa). Soliq idorasi yangi soliq qo‘shmaydi va
        daromad yaratmaydi; u qurilmasa ham soliqlar yig‘ilaveradi.
      </div>
    </div>
  );
}

/** Milliy bank: maqsadli jamg‘arma — o‘tkazish/qaytarish, foiz yo‘q. */
function BankBody({ active }: { active: boolean }) {
  const g = useGame();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('5000');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const amt = (id: string) => Math.floor(Number(amounts[id] ?? '1000'));
  const B = CIVIC_CONFIG.BANK;
  return (
    <div className="civic-body" data-testid="bank-body">
      <Row label="Erkin budjet" value={fmt(g.money)} testid="bank-free" />
      <Row label="Jamg‘armalarda" value={fmt(g.savingsTotal)} testid="bank-saved" />
      {!active && <div className="info-note">Bank ishlamayapti: yangi maqsad ochish va pul o‘tkazish yopiq. Qaytarib olish mumkin.</div>}
      {g.civic.goals.map((goal) => {
        const pct = Math.min(100, Math.round((goal.saved / goal.target) * 100));
        return (
          <div key={goal.id} className="goal" data-testid={'goal-' + goal.id}>
            <div className="goal-head"><b>{goal.name}</b><span>{fmt(goal.saved)} / {fmt(goal.target)}</span></div>
            <div className="goal-bar"><div style={{ width: pct + '%' }} /></div>
            <div className="goal-actions">
              <input type="number" min={1} step={100} value={amounts[goal.id] ?? '1000'} onChange={(e) => setAmounts({ ...amounts, [goal.id]: e.target.value })} aria-label="Summa" data-testid={'goal-amount-' + goal.id} />
              <button className="btn-ghost small" disabled={!active || goal.saved >= goal.target} onClick={() => g.deposit(goal.id, amt(goal.id))} data-testid={'goal-deposit-' + goal.id}>O‘tkazish</button>
              <button className="btn-ghost small" disabled={goal.saved <= 0} onClick={() => g.withdraw(goal.id, amt(goal.id))} data-testid={'goal-withdraw-' + goal.id}>Qaytarish</button>
              <button className="icon-btn" onClick={() => g.closeGoal(goal.id)} aria-label="Yopish" title="Maqsadni yopish (pul qaytadi)"><Icon.close /></button>
            </div>
          </div>
        );
      })}
      {active && g.civic.goals.length < B.MAX_GOALS && (
        <div className="goal-new">
          <input value={name} maxLength={B.NAME_MAX} placeholder="Maqsad nomi" onChange={(e) => setName(e.target.value)} data-testid="goal-name" />
          <input type="number" min={1} step={500} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Kerakli summa" data-testid="goal-target" />
          <button className="btn-primary" onClick={() => { if (g.createGoal(name, Math.floor(Number(target))).ok) setName(''); }} data-testid="goal-create">Ochish</button>
        </div>
      )}
      <div className="info-note">Jamg‘armaga o‘tkazilgan pul erkin budjetdan ayiriladi, qaytarilsa qo‘shiladi. Foiz, kredit yoki yangi pul yo‘q.</div>
    </div>
  );
}

/** Ekologiya: yashillik, suv sifati (oqova), chiqindi (tizim yo‘q), muammolar va qoida. */
function EkologiyaBody() {
  const g = useGame();
  const scene = useScene();
  const gr = g.green;
  const sw = g.sewage;
  const pct = gr.houses ? Math.round((gr.greenHouses / gr.houses) * 100) : 0;
  const issues = g.appeals.filter((a) => a.id === 'sewage' || a.id === 'green');
  return (
    <div className="civic-body" data-testid="eko-body">
      <div className="civic-h">Yashillik</div>
      <Row label="Bog‘ yonidagi uylar" value={`${gr.greenHouses} / ${gr.houses} (${pct}%)`} testid="eko-green" />
      <Row label="Bog‘lar / daraxtlar" value={`${gr.parks} / ${gr.trees}`} />
      <div className="civic-h">Suv sifati (oqova)</div>
      <Row label="Oqova yuklamasi" value={`${sw.load} birlik/davr`} testid="eko-load" />
      <Row label="Tozalanmoqda" value={`${sw.treated}`} tone="pos" />
      <Row label="Tozalanmagan" value={`${sw.untreated}`} tone={sw.untreated ? 'neg' : ''} testid="eko-untreated" />
      <div className="civic-h">Chiqindi</div>
      <div className="info-note">O‘yinda chiqindi yig‘ish tizimi hali yo‘q — ko‘rsatkich hisoblanmaydi.</div>
      {issues.length > 0 && <div className="civic-h">Muammolar</div>}
      <div className="appeals">
        {issues.map((a) => (
          <button key={a.id} className={'appeal ' + a.tone} onClick={() => jump(g, scene, a.x, a.z)}>
            <b>{a.title}</b><span>{a.text}</span><span className="appeal-fix">Yechim: {a.fix}</span>
          </button>
        ))}
      </div>
      <RuleBox />
      <div className="info-note">Markaz ifloslanishni o‘zi tozalamaydi va suv tozalash inshooti o‘rnini bosmaydi.</div>
    </div>
  );
}

function TozalashBody({ id }: { id: string }) {
  const g = useGame();
  const sw = g.sewage;
  const p = sw.perPlant.get(id);
  return (
    <div className="civic-body" data-testid="tozalash-body">
      <Row label="Tozalash sig‘imi" value={`${CIVIC_CONFIG.SEWAGE.PLANT_CAPACITY} birlik/davr`} />
      <Row label="Hozir tozalanmoqda" value={`${p?.treated ?? 0}`} tone="pos" testid="tozalash-treated" />
      <Row label={`Hududdagi yuklama (${CIVIC_CONFIG.SEWAGE.PLANT_RADIUS} katak)`} value={`${p?.areaLoad ?? 0}`} />
      <Row label="Shaharda tozalanmagan" value={`${sw.untreated}`} tone={sw.untreated ? 'neg' : ''} />
      <div className="info-note">
        Oqova suvni tozalaydi: uylar (har aholi {CIVIC_CONFIG.SEWAGE.PER_RESIDENT}) va ishlayotgan bizneslar ({CIVIC_CONFIG.SEWAGE.PER_BUSINESS}).
        Ichimlik suvini suv stansiyasi beradi — bu inshoot yangi suv yaratmaydi.
      </div>
    </div>
  );
}

function SecurityBody({ id }: { id: string }) {
  const g = useGame();
  const s = g.security;
  const b = s.perBuilding.get(id);
  return (
    <div className="civic-body" data-testid="security-body">
      <Row label="Xizmat sig‘imi" value={`${CIVIC_CONFIG.SECURITY.CAPACITY} aholi`} />
      <Row label="Xizmat ko‘rsatilmoqda" value={`${b?.served ?? 0} aholi, ${b?.houses ?? 0} uy`} testid="security-served" />
      <Row label="Xizmat hududi" value={`${CIVIC_CONFIG.SECURITY.RADIUS} katak`} />
      <Row label="Shahar qamrovi" value={`${s.served} / ${s.population} aholi`} />
      <div className="info-note">Qamralgan uylarga +{CIVIC_CONFIG.SECURITY.HAPPINESS_BONUS}% baxt (nechta bino bo‘lsa ham bir marta). Suv, oqova yoki boshqa xizmat muammolarini hal qilmaydi.</div>
    </div>
  );
}

/** Qoida va ogohlantirish holati (hokimlik, ekologiya va topshiriq panelida). */
export function RuleBox({ compact = false }: { compact?: boolean }) {
  const g = useGame();
  const R = CIVIC_CONFIG.RULE;
  const inc = g.civic.incident;
  const un = g.sewage.untreated;
  if (compact && !inc) return null;
  return (
    <div className={'rule-box' + (inc ? (inc.penalized ? ' bad' : ' warn') : '')} data-testid="rule-box">
      {!compact && <div className="rule-text"><b>Qoida:</b> tozalanmagan oqova {R.SEWAGE_ALERT} birlik/davrdan oshmasin. Ogohlantirishdan keyin {R.GRACE_TICKS} davr muddat; tuzatilmasa bir marta −{R.PENALTY}.</div>}
      {inc && !inc.penalized && <div data-testid="rule-warning"><Icon.warn size={14} /> Ogohlantirish: oqova tozalanmayapti ({un}). {Math.max(0, inc.deadlineTick - g.tickCount)} davr qoldi. Yechim: suv tozalash inshooti quring.</div>}
      {inc && inc.penalized && <div data-testid="rule-penalized"><Icon.warn size={14} /> Jarima olingan. Muammo hali bor ({un}) — inshoot qurilsa ogohlantirish yopiladi.</div>}
      {!inc && !compact && (g.ruleEnabled ? un >= R.SEWAGE_ALERT ? <div>Oqova {un}: inshootga mablag‘ yetganda muddat boshlanadi.</div> : <div className="ok">Hozir qoidabuzarlik yo‘q.</div> : <div>Yo‘riqnoma tugaguncha qoida ishlamaydi.</div>)}
    </div>
  );
}

/** Buzishdan oldin oqibat ogohlantirishi. */
export function DemolishImpact({ id }: { id: string }) {
  const g = useGame();
  const list = g.demolishImpact(id);
  if (!list.length) return null;
  return (
    <div className="why" data-testid="demolish-impact">
      <b>Buzilsa:</b>
      <ul>{list.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

export function civicCardRole(type: string): string | null {
  if (isCivic(type)) return CIVIC_BY_TYPE[type].roleName;
  return null;
}

export const civicNeeds = (type: string) => (isCivic(type) ? CIVIC_BY_TYPE[type].needs : type === 'politsiya' ? { road: true, power: true, water: false } : null);
