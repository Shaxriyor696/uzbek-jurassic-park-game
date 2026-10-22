import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BudgetLine } from '../game/budget';
import { OUTAGE_GRACE_TICKS, TAX_PER_RESIDENT, TICK_SECONDS, type HouseForecast } from '../game/simulation';
import type { SupplyKind } from '../game/utilities';
import { stationCapacity, stationRadius, usesNaturalWater, UTILITY_CONFIG } from '../game/utilities';
import { DastyorAdvice, signed } from './Hud';
import { BUSINESS_GROUPS, businessGroupName, type BusinessGroup } from '../game/businesses';
import { CATALOG, CATEGORIES, itemsInCategory, type CatalogEntry } from '../game/catalog';
import { fmt } from '../game/game';
import { footprintSize } from '../game/grid';
import { BRIDGE_PRICE } from '../game/placement';
import { TUTORIAL_STEPS, TUTORIAL_TOTAL } from '../game/tutorial';
import { EDU_CONFIG, EDU_TASKS, EDUCATION_BY_TYPE, isEducation, type EducationSummary } from '../game/education';
import { PHASES } from '../game/construction';
import { HEALTH_CONFIG, HEALTH_TASK, type HealthBuildingState, type HealthSummary } from '../game/health';
import { CivicInfo, civicCardRole, civicNeeds, DemolishImpact, RuleBox } from './CivicPanels';
import { isSecurity } from '../game/civic';
import type { Category } from '../game/types';
import { Icon, PowerPlantArt } from './icons';
import { assetUrl, useGame, useScene } from './useGame';
import { StepDots, StepTiles } from './TutorialVisual';
import { DefenseInfo } from './DefensePanels';
import { uiSound } from '../audio';
import { DEFENSE_PHASE_NAMES, isDefense } from '../game/defenseDefs';
import { DAMAGE_CONFIG, repairCost } from '../game/damage';
import { CONSTRUCTION } from '../game/construction';

const CAT_ICON: Record<string, (p: { size?: number }) => JSX.Element> = {
  road: Icon.road, house: Icon.house, shop: Icon.shop, bolt: Icon.bolt, tap: Icon.tap,
  service: Icon.service, tree: Icon.tree, tower: Icon.tower, briefcase: Icon.briefcase, book: Icon.book, medical: Icon.medical, gov: Icon.gov, shield: Icon.shield, fort: Icon.fort,
};

export function CardArt({ entry }: { entry: CatalogEntry }) {
  if (entry.type === 'avtobus_bekati') return <BusStopArt />;
  if (!entry.cardImage) return <PowerPlantArt />;
  return <img src={assetUrl(entry.cardImage)} alt={entry.name} loading="lazy" draggable={false} />;
}

/** Avtobus bekati kartasi rasmi */
function BusStopArt() {
  return (
    <svg viewBox="0 0 120 80" width="100%" height="100%" aria-hidden="true">
      <rect width="120" height="80" fill="#dff0f6" />
      <rect y="58" width="120" height="22" fill="#5b6066" />
      <path d="M0 69h120" stroke="#f2f2f2" strokeWidth="2" strokeDasharray="10 8" />
      <rect x="18" y="52" width="62" height="6" fill="#c9c4b8" />
      <rect x="22" y="24" width="3" height="28" fill="#b9bec4" />
      <rect x="72" y="24" width="3" height="28" fill="#b9bec4" />
      <rect x="25" y="28" width="47" height="18" fill="#1f2a33" opacity="0.75" />
      <rect x="16" y="20" width="66" height="6" rx="2" fill="#119ea6" />
      <rect x="90" y="14" width="3" height="44" fill="#b9bec4" />
      <rect x="84" y="10" width="15" height="13" rx="2" fill="#1d6fd6" />
      <text x="91.5" y="20" fontSize="8" fill="#fff" textAnchor="middle" fontWeight="bold">A</text>
    </svg>
  );
}

/** Ko‘prik kartasi rasmi: daryo ustidagi tosh tayanchli ko‘prik. */
function BridgeArt() {
  return (
    <svg viewBox="0 0 120 80" width="100%" height="100%" aria-hidden="true">
      <rect width="120" height="80" fill="#cfe8f5" />
      <rect y="50" width="120" height="30" fill="#4f9fd0" />
      <path d="M0 58 q15 -4 30 0 t30 0 t30 0 t30 0" stroke="#a9d6f0" strokeWidth="2" fill="none" />
      <rect x="0" y="44" width="18" height="36" fill="#7cb35b" />
      <rect x="102" y="44" width="18" height="36" fill="#7cb35b" />
      <rect x="44" y="40" width="10" height="30" fill="#9a9488" />
      <rect x="70" y="40" width="10" height="30" fill="#9a9488" />
      <rect x="6" y="36" width="108" height="8" rx="1" fill="#6b6f75" />
      <line x1="6" y1="40" x2="114" y2="40" stroke="#f3f3f3" strokeWidth="1" strokeDasharray="6 5" />
      <rect x="6" y="30" width="108" height="2.5" fill="#fafafa" />
      {[10, 30, 50, 70, 90, 110].map((x) => <rect key={x} x={x - 1.5} y="30" width="3" height="7" fill="#9a9488" />)}
    </svg>
  );
}

/** Dastyor maslahat oynasi — G003 milliy choponli obraz. */
export function Dastyor() {
  const g = useGame();
  const t = g.tutorial;
  if (!g.dastyorOpen || t.skipped) return null;
  const step = Math.min(t.step, TUTORIAL_TOTAL - 1);
  const cheer = g.dastyorMessage;
  return (
    <div className="dastyor" data-testid="dastyor">
      <div className="dastyor-figure">
        <img className="dastyor-img" src={assetUrl('assets/reference/G003.png')} alt="Dastyor" draggable={false} />
      </div>
      <div className="dastyor-bubble panel" data-ui>
        <div className="dastyor-head">
          <span className="dastyor-name">Dastyor</span>
          <StepDots step={t.step} completed={t.completed} />
        </div>
        {cheer && <div className="dastyor-cheer"><Icon.check size={16} /> {cheer}</div>}
        {t.completed ? (
          <>
            <p data-testid="dastyor-text" className="dastyor-done"><Icon.smile size={24} /> Shaharni erkin quring!</p>
            <EduTaskBlock kids />
            <HealthTaskBlock kids />
            <RuleBox compact />
          </>
        ) : (
          <>
            <div className="dastyor-step" data-testid="dastyor-text">
              <span className="dastyor-num">{step + 1}</span> {TUTORIAL_STEPS[step].title}
            </div>
            <StepTiles step={step} />
            <div className="dastyor-short">{TUTORIAL_STEPS[step].short}</div>
          </>
        )}
        <DastyorAdvice />
        <div className="dastyor-actions">
          <button className="btn-primary" onClick={() => g.closeDastyor()} data-testid="dastyor-ok"><Icon.check size={16} /> Tushunarli</button>
          {!t.completed && (
            <button className="btn-ghost small" onClick={() => g.skipTutorial()} data-testid="dastyor-skip" title="Yo‘riqnomani o‘tkazish">O‘tkazish</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pastki qurilish kategoriyalari va obyekt kartalari. */
export function BuildMenu() {
  const g = useGame();
  const [open, setOpen] = useState<Category | null>(null);
  const [group, setGroup] = useState<BusinessGroup>('savdo');
  const isBiz = open === 'biznes';
  const items = open ? itemsInCategory(open).filter((e) => !isBiz || e.group === group) : [];

  const chooseCategory = (c: Category) => {
    if (open === c) {
      setOpen(null);
      uiSound('close');
      g.cancelTool();
      return;
    }
    uiSound('open');
    setOpen(c);
    if (c === 'yol') g.setTool('road');
    else if (g.tool !== 'select') g.cancelTool();
  };

  const chooseItem = (e: CatalogEntry) => {
    if (e.type === 'road') g.setTool('road');
    else if (e.type === 'himoya_devor') g.setTool('wall');
    else g.setTool('build', e.type);
  };

  const selectedType = g.tool === 'road' ? 'road' : g.tool === 'wall' ? 'himoya_devor' : g.tool === 'build' ? g.buildType : null;
  const bridgeOn = g.tool === 'bridge';
  const catName = CATEGORIES.find((c) => c.id === open)?.name;

  return (
    <div className="build-menu" data-ui>
      {open && (
        <div className="card-tray panel" data-testid="card-tray">
          <div className="tray-head">
            <span className="tray-title">{catName}</span>
            <span className="tray-hint">
              {g.tool === 'road' ? 'Sudrab yo‘l chizing · Esc — bekor qilish' : bridgeOn ? 'Qirg‘oqdan qirg‘oqqa to‘g‘ri chiziqda torting · Esc — bekor qilish' : g.tool === 'wall' ? 'Sudrab devor chizing (to‘g‘ri yoki 90°) · Esc — bekor qilish' : g.tool === 'build' ? 'R — 90° aylantirish · Esc — bekor qilish' : 'Kartani tanlang'}
            </span>
            {g.tool === 'build' && (
              <button className="btn-ghost small" onClick={() => g.rotateBuild()} data-testid="rotate"><Icon.rotate /> Aylantirish</button>
            )}
            <button className="icon-btn" onClick={() => { setOpen(null); g.cancelTool(); }} aria-label="Yopish"><Icon.close /></button>
          </div>
          {isBiz && (
            <div className="group-tabs" role="tablist" aria-label="Biznes guruhlari">
              {BUSINESS_GROUPS.map((gr) => (
                <button key={gr.id} role="tab" aria-selected={group === gr.id} className={'group-tab' + (group === gr.id ? ' on' : '')}
                  onClick={() => setGroup(gr.id)} data-testid={'group-' + gr.id}>{gr.name}</button>
              ))}
            </div>
          )}
          <div className="cards">
            {items.map((e) => {
              const fp = footprintSize(e.type, 0);
              const edu = isEducation(e.type) ? EDUCATION_BY_TYPE[e.type] : null;
              return (
                <button key={e.type} className={'card' + (selectedType === e.type ? ' selected' : '')} onClick={() => chooseItem(e)}
                  data-testid={'card-' + e.type} title={e.description}>
                  <div className="card-art"><CardArt entry={e} /></div>
                  <div className="card-name">{e.name}</div>
                  {isDefense(e.type) ? (
                    <>
                      <div className="card-role" data-testid={'card-role-' + e.type}>Shahar himoyasi</div>
                      <div className="card-meta">{fp.w}×{fp.d} katak · {CONSTRUCTION.constructionDurationSeconds} s qurilish{e.upkeep ? ` · −${e.upkeep}/davr` : ''}</div>
                    </>
                  ) : civicCardRole(e.type) ? (
                    <>
                      <div className="card-role" data-testid={'card-role-' + e.type}>{civicCardRole(e.type)}</div>
                      <div className="card-meta">{fp.w}×{fp.d} katak · −{e.upkeep}/davr</div>
                    </>
                  ) : e.type === 'shifoxona' ? (
                    <>
                      <div className="card-role" data-testid="card-role-shifoxona">Tibbiyot</div>
                      <div className="card-meta">{fp.w}×{fp.d} katak · {HEALTH_CONFIG.SERVICE_CAPACITY} kishiga xizmat · −{e.upkeep}/davr</div>
                    </>
                  ) : edu ? (
                    <>
                      <div className="card-role" data-testid={'card-role-' + e.type}>{edu.roleName}</div>
                      <div className="card-meta">{fp.w}×{fp.d} katak · {fmt(edu.capacity)} o‘rin · −{edu.upkeep}/davr</div>
                    </>
                  ) : (
                    <div className="card-meta">{fp.w}×{fp.d} katak{e.capacity ? ` · ${e.capacity} aholi` : e.income ? ` · +${e.income}/davr` : e.upkeep ? ` · −${e.upkeep}` : ''}</div>
                  )}
                  {(e.group || edu || e.type === 'shifoxona' || civicCardRole(e.type) || isDefense(e.type)) && <div className="card-desc">{e.description}</div>}
                  <div className={'card-price' + (g.money < e.price ? ' short' : '')}><Icon.coin size={16} /> {fmt(e.price)}{e.type === 'road' || e.type === 'himoya_devor' ? ' / katak' : ''}</div>
                </button>
              );
            })}
            {open === 'yol' && (
              <button className={'card' + (bridgeOn ? ' selected' : '')} onClick={() => g.setTool('bridge')} data-testid="card-bridge"
                title="Daryo va ko‘l ustidan yo‘l o‘tkazish. To‘g‘ri chiziqda, qirg‘oqdan qirg‘oqqa tortiladi.">
                <div className="card-art"><BridgeArt /></div>
                <div className="card-name">Ko‘prik</div>
                <div className="card-meta">faqat suv ustidagi katak</div>
                <div className={'card-price' + (g.money < BRIDGE_PRICE ? ' short' : '')}><Icon.coin size={16} /> {fmt(BRIDGE_PRICE)} / katak</div>
              </button>
            )}
          </div>
        </div>
      )}
      <div className="toolbar panel">
        {CATEGORIES.map((c) => {
          const I = CAT_ICON[c.icon];
          return (
            <button key={c.id} className={'tool-btn' + (open === c.id ? ' active' : '')} onClick={() => chooseCategory(c.id)} data-testid={'cat-' + c.id}>
              <span className="tool-icon"><I /></span>
              <span>{c.name}</span>
            </button>
          );
        })}
        <button className={'tool-btn danger' + (g.tool === 'demolish' ? ' active' : '')}
          onClick={() => { setOpen(null); g.setTool(g.tool === 'demolish' ? 'select' : 'demolish'); }} data-testid="cat-buzish">
          <span className="tool-icon"><Icon.bulldozer /></span>
          <span>Buzish</span>
        </button>
      </div>
    </div>
  );
}

const SUPPLY_ROWS: { kind: SupplyKind; label: string; ok: string; bad: string; icon: JSX.Element }[] = [
  { kind: 'road', label: 'Yo‘l', ok: 'Ulangan', bad: 'Ulanmagan', icon: <Icon.road size={20} /> },
  { kind: 'power', label: 'Elektr', ok: 'Bor', bad: 'Yo‘q', icon: <Icon.bolt size={20} /> },
  { kind: 'water', label: 'Suv', ok: 'Bor', bad: 'Yo‘q', icon: <Icon.drop size={20} /> },
];

function SupplyRow({ kind, label, ok, okText, badText, icon }: { kind: string; label: string; ok: boolean; okText: string; badText: string; icon: JSX.Element }) {
  return (
    <div className={'kv-row supply ' + kind}>
      <span className="kv-ico">{icon}</span>
      <span className="kv-label">{label}</span>
      <span className={'kv-state ' + (ok ? 'ok' : 'bad')} data-testid={'info-' + kind} data-ok={ok}>
        <span className="kv-dot">{ok ? <Icon.check size={13} /> : <Icon.cross size={13} />}</span> {ok ? okText : badText}
      </span>
    </div>
  );
}

const HOUSE_STATE: Record<HouseForecast['state'], { text: string; tone: 'ok' | 'info' | 'warn' | 'bad' }> = {
  moving_in: { text: 'Ko‘chib kelmoqda', tone: 'info' },
  full: { text: 'To‘la', tone: 'ok' },
  blocked: { text: 'Aholi kelmayapti', tone: 'bad' },
  warning: { text: 'Ogohlantirish', tone: 'warn' },
  leaving: { text: 'Aholi ketmoqda', tone: 'bad' },
};

/** Keyingi davr prognozi — faqat haqiqiy hisobdan (houseForecast), qo‘lda yozilgan son emas. */
function forecastText(f: HouseForecast, paused: boolean): { text: string; tone: string } {
  if (paused && f.nextDelta !== 0) return { text: 'Pauza: ko‘chish to‘xtatilgan', tone: 'warn' };
  switch (f.state) {
    case 'moving_in': return { text: `Oila kelmoqda: ${f.nextDelta} kishi (transportda)`, tone: 'info' };
    case 'full': return { text: f.vacant > 0 ? 'Oila joylashgan — bu uyga yana odam olib kelinmaydi' : 'Uy to‘la — ko‘chish to‘xtagan', tone: 'ok' };
    case 'blocked': return { text: 'Muammo tuzatilmaguncha aholi kelmaydi', tone: 'bad' };
    case 'warning': return { text: `${f.graceLeft} davrdan keyin aholi keta boshlaydi`, tone: 'warn' };
    case 'leaving': return { text: `Keyingi davrda: −${-f.nextDelta} kishi`, tone: 'bad' };
  }
}

/** Tanlangan bino ma’lumoti. Uy uchun: yashovchilar, bo‘sh joy, ta’minot va ko‘chish sababi. */
export function InfoPanel() {
  const g = useGame();
  if (g.tool !== 'select' || !g.selectedId) return null;
  const o = g.objects.get(g.selectedId);
  if (o?.build) return <ConstructionInfo id={o.id} />;
  const st = g.statuses.get(g.selectedId);
  if (!o || !st) return null;
  const c = CATALOG[o.type];
  const fp = footprintSize(o.type, o.rotation);
  const demolish = g.canDemolish(o.id);
  const isStation = c.kind === 'power' || c.kind === 'water';
  const f = g.houseForecast(o.id);
  const cn = civicNeeds(o.type);
  const needs = SUPPLY_ROWS.filter((r) => (cn ? cn[r.kind] : r.kind === 'road' ? c.needsRoad : c.needsUtilities));
  const isCiv = !!cn || isSecurity(o.type);
  const missing = needs.filter((r) => !st[r.kind]);
  const state = f ? HOUSE_STATE[f.state] : null;
  const fc = f ? forecastText(f, g.paused) : null;
  const businessOk = st.road && st.power && st.water && g.population > 0;
  const eduDef = isEducation(o.type) ? EDUCATION_BY_TYPE[o.type] : null;
  const eduSum = eduDef ? g.education : null;
  const eduSt = eduSum?.perBuilding.get(o.id) ?? null;
  const healthSum = o.type === 'shifoxona' ? g.health : null;
  const healthSt = healthSum?.perBuilding.get(o.id) ?? null;
  return (
    <div className="info-panel side-panel panel" data-ui data-testid="info-panel">
      <div className="info-head">
        <div className="info-title" data-testid="info-title">{c.name}</div>
        <button className="icon-btn" onClick={() => g.select(null)} aria-label="Yopish" data-testid="info-close"><Icon.close /></button>
      </div>
      {o.type !== 'road' && <div className="info-art"><CardArt entry={c} /></div>}

      <div className="kv-list">
        {f && (
          <>
            <div className="kv-row">
              <span className="kv-ico"><Icon.people size={20} /></span>
              <span className="kv-label">Yashovchilar</span>
              <b data-testid="info-residents">{f.residents} / {f.capacity}</b>
            </div>
            <div className="kv-row">
              <span className="kv-ico"><Icon.house size={20} /></span>
              <span className="kv-label">Bo‘sh joy</span>
              <b data-testid="info-vacant">{f.vacant}</b>
            </div>
          </>
        )}
        {o.type === 'road' && <SupplyRow kind="road" label="Kirishga ulangan" ok={st.road} okText="Ha" badText="Yo‘q" icon={<Icon.road size={20} />} />}
        {needs.map((r) => <SupplyRow key={r.kind} kind={r.kind} label={r.label} ok={st[r.kind]} okText={r.ok} badText={r.bad} icon={r.icon} />)}
        {isStation && <SupplyRow kind="active" label="Ishlayapti" ok={st.active} okText="Ha" badText="Yo‘lga ulanmagan" icon={<Icon.wrench size={20} />} />}
        {state && (
          <div className="kv-row">
            <span className="kv-ico heart"><Icon.heart size={20} /></span>
            <span className="kv-label">Holat</span>
            <span className={'state-chip ' + state.tone} data-testid="info-state">{state.text}</span>
          </div>
        )}
      </div>

      {/* «blocked» holatida prognoz o‘rnini quyidagi «Nega aholi kelmayapti?» bloki egallaydi */}
      {fc && f?.state !== 'blocked' && <div className={'forecast ' + fc.tone} data-testid="info-forecast"><Icon.people size={18} /> {fc.text}</div>}

      {eduDef && eduSt && eduSum && <EducationInfo def={eduDef} st={eduSt} sum={eduSum} />}
      {healthSt && healthSum && <HealthInfo st={healthSt} sum={healthSum} />}
      {isCiv && <CivicInfo o={o} />}
      {isDefense(o.type) && <DefenseInfo o={o} />}

      {missing.length > 0 && !eduDef && !healthSt && !isCiv && (
        <div className="why" data-testid="info-why">
          <b>{f ? (f.state === 'blocked' ? 'Nega aholi kelmayapti?' : `Muammo (ogohlantirish ${OUTAGE_GRACE_TICKS} davr)`) : 'Muammolar'}</b>
          <ul>
            {missing.map((r) => <li key={r.kind}><b>{r.label}:</b> {g.supplyReason(o.id, r.kind)}</li>)}
          </ul>
          {f?.state === 'blocked' && <div className="why-foot">Tuzatilgach har davrda 2 kishigacha ko‘chib keladi.</div>}
        </div>
      )}

      <div className="info-grid">
        <span>Maydon</span><b>{fp.w}×{fp.d} katak</b>
        {f && <><span>Baxt</span><b>{st.happiness}%</b></>}
        {f && <><span>Soliq</span><b>+{o.residents * TAX_PER_RESIDENT} / davr</b></>}
        {c.kind === 'business' && <><span>Daromad</span><b>{businessOk ? `+${c.income}` : `0 (bazaviy +${c.income})`} / davr</b></>}
        {c.upkeep > 0 && <><span>Xarajat</span><b>−{c.upkeep} / davr</b></>}
        {isStation && UTILITY_CONFIG.mode === 'capacity' && <><span>Ta’minlaydi</span><b data-testid="info-capacity">{stationCapacity(o)} ta binogacha{usesNaturalWater(o) ? ' (ko‘l bo‘yida)' : ''}</b></>}
        {c.utilityRadius > 0 && !(isStation && UTILITY_CONFIG.mode === 'capacity') && <><span>Radius</span><b data-testid="info-radius">{stationRadius(o)} katak{usesNaturalWater(o) ? ' (ko‘l bo‘yida, tabiiy suv)' : ''}</b></>}
        {!o.userPlaced && <><span>Kelib chiqishi</span><b>Boshlang‘ich mahalla</b></>}
      </div>
      {c.kind === 'business' && !businessOk && missing.length === 0 && <div className="info-note">Shaharda aholi yo‘q — biznes daromad bermaydi.</div>}
      {c.group && <div className="info-note" data-testid="info-business"><b>{businessGroupName(c.group)}.</b> {c.description} Daromad mavjud biznes qoidasi bo‘yicha: yo‘l, elektr, suv va shaharda aholi bo‘lsa. Ishlab chiqarish simulyatsiyasi yo‘q; mashina va uskunalar bezak.</div>}
      {c.source === 'qoshimcha' && !c.group && !isDefense(o.type) && <div className="info-note">PRD jadvalidan tashqari obyekt: balans prototip uchun tanlangan.</div>}
      {(o.damage ?? 0) > 0 && (
        <div className="why" data-testid="damage-info">
          <b>{(o.damage ?? 0) >= 1 ? (isDefense(o.type) ? 'Dinozavr buzgan — bu joy ochiq!' : 'Dinozavr shikastlagan — bino ishlamayapti.') : `Shikastlangan: ${Math.round((o.damage ?? 0) * 100)}%`}</b>
          <div style={{ marginTop: 6 }}>
            <button className="btn-ghost small" disabled={g.money < repairCost(o)} onClick={() => g.repair(o.id)} data-testid="repair">
              <Icon.wrench size={14} /> Ta’mirlash (−{fmt(repairCost(o))}, {DAMAGE_CONFIG.repairSeconds} s)
            </button>
          </div>
        </div>
      )}
      {demolish.ok && <DemolishImpact id={o.id} />}
      <button className="btn-danger" disabled={!demolish.ok} onClick={() => g.demolish(o.id)} data-testid="info-demolish">
        <Icon.bulldozer size={18} /> {demolish.ok ? 'Buzish (narx qaytarilmaydi)' : demolish.reason}
      </button>
    </div>
  );
}

const LINE_ICON: Record<BudgetLine['id'], JSX.Element> = {
  houseTax: <Icon.house size={20} />,
  business: <Icon.shop size={20} />,
  power: <Icon.bolt size={20} />,
  water: <Icon.drop size={20} />,
  parks: <Icon.tree size={20} />,
  services: <Icon.service size={20} />,
  skillBonus: <Icon.graduation size={20} />,
  education: <Icon.book size={20} />,
  defense: <Icon.fort size={20} />,
};

function BudgetRow({ line }: { line: BudgetLine }) {
  const v = line.kind === 'income' ? line.amount : -line.amount;
  return (
    <div className={'kv-row budget ' + line.id}>
      <span className="kv-ico">{LINE_ICON[line.id]}</span>
      <span className="kv-label">{line.label}{line.count > 0 && <small> · {line.count} ta</small>}</span>
      <b className={v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'} data-testid={'budget-' + line.id} data-value={v}>{signed(v)}</b>
    </div>
  );
}

/** «Shahar budjeti»: davriy daromad va xarajat qatorlari, sof natija va balans — g.budget dan. */
export function BudgetPanel() {
  const g = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    if (!g.budgetOpen) return;
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [g.budgetOpen]);
  if (!g.budgetOpen) return null;
  const b = g.budget;
  const r = g.lastReport;
  const left = Math.max(0, Math.ceil(TICK_SECONDS - g.tickAccumulator));
  return (
    <div className="budget-panel side-panel panel" data-ui data-testid="budget-panel">
      <div className="info-head">
        <div className="info-title">Shahar budjeti</div>
        <button className="icon-btn" onClick={() => g.toggleBudget(false)} aria-label="Yopish" data-testid="budget-close"><Icon.close /></button>
      </div>
      <div className="kv-list">
        <div className="budget-section pos">Daromad / davr <b data-testid="budget-income">{signed(b.income)}</b></div>
        {b.lines.filter((l) => l.kind === 'income').map((l) => <BudgetRow key={l.id} line={l} />)}
        <div className="budget-section neg">Xarajat / davr <b data-testid="budget-expense">{signed(-b.expense)}</b></div>
        {b.lines.filter((l) => l.kind === 'expense').map((l) => <BudgetRow key={l.id} line={l} />)}
      </div>
      <div className={'budget-net ' + (b.net >= 0 ? 'pos' : 'neg')}>
        <Icon.chart size={22} />
        <span>Sof natija</span>
        <b data-testid="budget-net" data-value={b.net}>{signed(b.net)} / davr</b>
      </div>
      <div className="kv-row balance">
        <span className="kv-ico"><Icon.coin size={22} /></span>
        <span className="kv-label">Balans</span>
        <b className={g.money < 0 ? 'neg' : ''} data-testid="budget-balance">{fmt(g.money)}</b>
      </div>
      <div className="budget-notes">
        <div>{g.paused ? 'Pauza — hisob to‘xtatilgan.' : `Keyingi hisob ${left} soniyadan keyin: balans ${signed(b.net)}.`}</div>
        {r && <div data-testid="budget-last">Oxirgi davr ({r.tick}): {signed(r.net)}, aholi {signed(r.moved)}.</div>}
        {b.idleBusinesses > 0 && <div className="warn">{b.idleBusinesses} ta biznes daromad bermayapti (yo‘l, elektr, suv yoki aholi yo‘q).</div>}
        {g.money < 0 && <div className="warn">Balans manfiy: qarz paytida yangi qurilish bloklanadi.</div>}
        <div>Qurilish narxi bir martalik — bu yerga kirmaydi.</div>
      </div>
    </div>
  );
}

/** Ta’lim binosi: turi, holati, sig‘im, band o‘rinlar, ta’siri, muammo va yechim — g.education dan. */
function EducationInfo({ def, st, sum }: { def: (typeof EDUCATION_BY_TYPE)[keyof typeof EDUCATION_BY_TYPE]; st: NonNullable<ReturnType<EducationSummary['perBuilding']['get']>>; sum: EducationSummary }) {
  const isSchool = def.role === 'school' || def.role === 'it_school';
  const growsSkill = def.role === 'it_school' || def.role === 'university';
  return (
    <div className="edu-info" data-testid="info-education">
      <div className="kv-row">
        <span className="kv-ico"><Icon.book size={20} /></span>
        <span className="kv-label">Turi</span>
        <b data-testid="info-edu-role">{def.roleName}</b>
      </div>
      <div className="kv-row">
        <span className="kv-ico"><Icon.wrench size={20} /></span>
        <span className="kv-label">Holat</span>
        <span className={'state-chip ' + (st.active ? 'ok' : 'bad')} data-testid="info-edu-state" data-active={st.active}>{st.active ? 'Faol' : 'To‘xtagan'}</span>
      </div>
      <div className="kv-row">
        <span className="kv-ico"><Icon.people size={20} /></span>
        <span className="kv-label">Sig‘im</span>
        <b data-testid="info-edu-capacity">{fmt(def.capacity)} {def.role === 'university' ? 'talaba' : def.role === 'library' || def.role === 'kids_library' ? 'o‘quvchi joyi' : 'o‘rin'}</b>
      </div>
      {st.used !== null && (
        <div className="kv-row">
          <span className="kv-ico"><Icon.people size={20} /></span>
          <span className="kv-label">Band o‘rinlar</span>
          <b data-testid="info-edu-used">{st.used} / {def.capacity}</b>
        </div>
      )}
      <div className="forecast info" data-testid="info-edu-effect">
        <Icon.graduation size={18} /> {st.active ? def.effect : 'To‘xtagan — ta’sir va bonus berilmaydi.'}
        {st.active && isSchool && <> Shahar: o‘rinlar {sum.seats} / talab {sum.demand}.</>}
        {st.active && growsSkill && <> Malaka: {Math.floor(sum.skill)} / {EDU_CONFIG.SKILL_MAX} ({sum.skillDelta >= 0 ? '+' : ''}{sum.skillDelta.toFixed(1)}/davr).</>}
      </div>
      {st.problems.length > 0 && (
        <div className="why" data-testid="info-why">
          <b>Nega ishlamayapti?</b>
          <ul>
            {st.problems.map((p) => <li key={p.kind}><b>{p.text}:</b> {p.fix}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Shifoxona: holat, xizmat sig‘imi, qamrovga hissa, ta’sir, muammo va yechim — g.health dan. */
function HealthInfo({ st, sum }: { st: HealthBuildingState; sum: HealthSummary }) {
  const share = sum.demand > 0 ? Math.round((st.served / sum.demand) * 100) : 0;
  return (
    <div className="edu-info" data-testid="info-health">
      <div className="kv-row">
        <span className="kv-ico"><Icon.medical size={20} /></span>
        <span className="kv-label">Turi</span>
        <b>Tibbiyot</b>
      </div>
      <div className="kv-row">
        <span className="kv-ico"><Icon.wrench size={20} /></span>
        <span className="kv-label">Holat</span>
        <span className={'state-chip ' + (st.active ? 'ok' : 'bad')} data-testid="info-health-state" data-active={st.active}>{st.active ? 'Faol' : 'To‘xtagan'}</span>
      </div>
      <div className="kv-row">
        <span className="kv-ico"><Icon.people size={20} /></span>
        <span className="kv-label">Xizmat sig‘imi</span>
        <b data-testid="info-health-capacity">{st.capacity} kishi</b>
      </div>
      <div className="kv-row">
        <span className="kv-ico"><Icon.heart size={20} /></span>
        <span className="kv-label">Qamrovga hissasi</span>
        <b data-testid="info-health-share">{st.active ? `${st.served} kishi (${share}%)` : '0'}</b>
      </div>
      <div className="forecast info" data-testid="info-health-effect">
        <Icon.medical size={18} /> {st.active
          ? `Shahar qamrovi: ${sum.covered} / ${sum.demand} aholi. ${HEALTH_CONFIG.HAPPINESS_RADIUS} katak ichidagi uylarga +${HEALTH_CONFIG.HAPPINESS_BONUS}% baxt.`
          : 'To‘xtagan — xizmat va baxt bonusi berilmaydi.'}
      </div>
      {st.problems.length > 0 && (
        <div className="why" data-testid="info-why">
          <b>Nega ishlamayapti?</b>
          <ul>
            {st.problems.map((p) => <li key={p.kind}><b>{p.text}</b> — {p.fix}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Qurilayotgan bino: nom, «Qurilmoqda — X%», bosqich, qolgan o‘yin vaqti, bekor qilish (oqibati bilan). */
function ConstructionInfo({ id }: { id: string }) {
  const g = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  const o = g.objects.get(id);
  const p = g.buildInfo(id);
  if (!o || !p) return null;
  const c = CATALOG[o.type];
  const fp = footprintSize(o.type, o.rotation);
  const idx = PHASES.findIndex((x) => x.id === p.phase.id);
  const def = isDefense(o.type);
  return (
    <div className="info-panel side-panel panel" data-ui data-testid="info-panel">
      <div className="info-head">
        <div className="info-title" data-testid="info-title">{c.name}</div>
        <button className="icon-btn" onClick={() => g.select(null)} aria-label="Yopish" data-testid="info-close"><Icon.close /></button>
      </div>
      <div className="info-art"><CardArt entry={c} /></div>
      <div className="build-box" data-testid="build-info">
        <div className="build-title"><Icon.wrench size={18} /> <b data-testid="build-percent">Qurilmoqda — {p.percent}%</b></div>
        <div className="build-bar"><div style={{ width: p.ratio * 100 + '%' }} /></div>
        <div className="build-phase" data-testid="build-phase">Bosqich: {(def ? DEFENSE_PHASE_NAMES[p.phase.id] : p.phase.name).toLowerCase()} ({idx + 1}/{PHASES.length})</div>
        {o.build?.hold && <div className="why" data-testid="build-hold"><b>Maydonda dinozavr bor.</b> U o‘tib ketgach qurilish yakunlanadi (ichiga qamab qo‘yilmaydi).</div>}
        <div className="build-left" data-testid="build-left">{Math.ceil(p.remaining)} o‘yin soniyasi qoldi{g.paused ? ' (pauza — qurilish to‘xtagan)' : ''}</div>
        <ol className="build-steps">
          {PHASES.map((ph, i) => <li key={ph.id} className={i < idx ? 'done' : i === idx ? 'now' : ''}>{def ? DEFENSE_PHASE_NAMES[ph.id] : ph.name}</li>)}
        </ol>
        <div className="info-note">{def ? 'Qurilish tugaguncha bu qism himoya hisoblanmaydi (maydon esa band). Narx joylashtirishda bir marta to‘langan.' : 'Qurilish tugaguncha bino aholi qabul qilmaydi, xizmat va daromad bermaydi. Narx joylashtirishda bir marta to‘langan.'}</div>
      </div>
      <div className="info-grid"><span>Maydon</span><b>{fp.w}×{fp.d} katak</b></div>
      <div className="why" data-testid="build-cancel-note"><b>Bekor qilinsa:</b> vaqtinchalik qismlar olib tashlanadi, maydon bo‘shaydi. Qaytariladigan pul: <b>0</b> (mavjud qoida — buzishda narx qaytarilmaydi).</div>
      <button className="btn-danger" onClick={() => g.demolish(o.id)} data-testid="build-cancel"><Icon.bulldozer size={18} /> Qurilishni bekor qilish (0 qaytariladi)</button>
    </div>
  );
}

/** Yig‘iladigan «Tibbiyot» paneli: talab, faol xizmat sig‘imi, qamrov. */
export function HealthPanel() {
  const g = useGame();
  const [open, setOpen] = useState(false);
  const s = g.health;
  const cov = s.coverage === null ? '—' : s.coverage + '%';
  const ok = s.coverage === null || s.coverage >= 100;
  return (
    <div className="supply-panel health-panel panel" data-ui data-testid="health-panel">
      <button className="panel-head" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="health-toggle">
        <span className="head-icon"><Icon.medical size={18} /></span>
        <span className="head-title">Tibbiyot</span>
        {!open && <span className={'head-badge ' + (ok ? 'ok' : 'bad')}>Qamrov {cov}</span>}
        <span className={'head-chevron' + (open ? ' open' : '')}><Icon.chevron /></span>
      </button>
      {open && (
        <div className="supply-rows">
          <div className="supply-row"><span className="supply-label">Tibbiy xizmat talabi</span><b data-testid="health-demand">{s.demand}</b></div>
          <div className="supply-row"><span className="supply-label">Faol xizmat sig‘imi</span><b data-testid="health-capacity">{s.capacity}</b></div>
          <div className="supply-row"><span className="supply-label">Qamrov</span><b className={ok ? 'ok' : 'bad'} data-testid="health-coverage">{cov}</b></div>
          <div className="edu-note">Talab = aholi soni. Har faol shifoxona {HEALTH_CONFIG.SERVICE_CAPACITY} kishiga xizmat ko‘rsatadi.</div>
        </div>
      )}
    </div>
  );
}

/** Shifoxona topshirig‘i bloki. */
export function HealthTaskBlock({ kids = false }: { kids?: boolean }) {
  const g = useGame();
  if (g.healthTaskDone) return null;
  return (
    <div className="edu-task health-task" data-testid="health-task">
      <div className="edu-task-head"><Icon.medical size={16} /> Tibbiyot: <b>{HEALTH_TASK.title}</b></div>
      <div className="edu-task-text" data-testid="health-task-text">{kids ? HEALTH_TASK.hint : HEALTH_TASK.task}</div>
      <div className="edu-task-reward">Mukofot: <Icon.coin size={14} /> {fmt(HEALTH_TASK.reward)}</div>
    </div>
  );
}

/** Yig‘iladigan «Ta’lim» paneli: talab, mavjud o‘rinlar, qamrov va malaka. */
export function EducationPanel() {
  const g = useGame();
  const [open, setOpen] = useState(false);
  const s = g.education;
  const cov = s.coverage === null ? '—' : s.coverage + '%';
  return (
    <div className="supply-panel edu-panel panel" data-ui data-testid="edu-panel">
      <button className="panel-head" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="edu-toggle">
        <span className="head-icon"><Icon.graduation size={18} /></span>
        <span className="head-title">Ta’lim</span>
        {!open && <span className={'head-badge ' + (s.coverage === null || s.coverage >= 100 ? 'ok' : 'bad')}>Qamrov {cov}</span>}
        <span className={'head-chevron' + (open ? ' open' : '')}><Icon.chevron /></span>
      </button>
      {open && (
        <div className="supply-rows">
          <div className="supply-row"><span className="supply-label">Ta’lim talabi</span><b data-testid="edu-demand">{s.demand}</b></div>
          <div className="supply-row"><span className="supply-label">Mavjud o‘rinlar</span><b data-testid="edu-seats">{s.seats}</b></div>
          <div className="supply-row"><span className="supply-label">Ta’lim qamrovi</span><b className={s.coverage === null || s.coverage >= 100 ? 'ok' : 'bad'} data-testid="edu-coverage">{cov}</b></div>
          <div className="supply-row"><span className="supply-label">Malaka</span><b data-testid="edu-skill">{Math.floor(s.skill)} / {EDU_CONFIG.SKILL_MAX}</b></div>
          <div className="edu-note">Talab = aholi × {Math.round(EDU_CONFIG.DEMAND_PER_RESIDENT * 100)}% (taxmin). O‘rinlarni faqat faol maktablar beradi.</div>
        </div>
      )}
    </div>
  );
}

/** Joriy ta’lim topshirig‘i (yo‘riqnoma tugagan yoki o‘tkazilgan bo‘lsa). */
export function EduTaskBlock({ kids = false }: { kids?: boolean }) {
  const g = useGame();
  if (g.eduTasks >= EDU_TASKS.length) {
    return <div className="edu-task done" data-testid="edu-task"><Icon.check size={16} /> Ta’lim topshiriqlari bajarildi!</div>;
  }
  const t = EDU_TASKS[g.eduTasks];
  const s = g.education;
  return (
    <div className="edu-task" data-testid="edu-task">
      <div className="edu-task-head"><Icon.book size={16} /> Ta’lim {g.eduTasks + 1}/{EDU_TASKS.length}: <b>{t.title}</b></div>
      <div className="edu-task-text" data-testid="edu-task-text">{kids ? t.hint : t.task}</div>
      {g.eduTasks === 2 && <div className="edu-task-progress">O‘rinlar {s.seats} / talab {s.demand}</div>}
      <div className="edu-task-reward">Mukofot: <Icon.coin size={14} /> {fmt(t.reward)}</div>
    </div>
  );
}

export function Toasts() {
  const g = useGame();
  return (
    <div className="toasts" data-ui>
      {g.toasts.map((t) => <div key={t.id} className={'toast ' + t.tone}>{t.text}</div>)}
    </div>
  );
}

export function HoverHint() {
  const scene = useScene();
  const hint = useSyncExternalStore(
    (fn) => (scene ? scene.subscribeHint(fn) : () => {}),
    () => scene?.hint ?? null,
  );
  if (!hint) return null;
  return (
    <div className={'hover-hint ' + (hint.ok ? 'ok' : 'bad')} style={{ left: hint.x + 16, top: hint.y + 18 }} data-testid="hover-hint">
      {hint.text}
    </div>
  );
}
