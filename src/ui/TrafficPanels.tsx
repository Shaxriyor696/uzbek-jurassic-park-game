import { useEffect, useState } from 'react';
import { CATALOG } from '../game/catalog';
import { MIGRATION_BLOCK_TEXT } from '../game/traffic';
import { MIGRATION_CONFIG, POLICE_CONFIG } from '../game/trafficDefs';
import { Icon } from './icons';
import { useGame } from './useGame';

/** «Aholi» paneli: yashayotgan, bo‘sh uy o‘rinlari, yo‘lda kelayotganlar, kelish to‘xtagan bo‘lsa — aniq sabab */
export function PopulationPanel() {
  const g = useGame();
  const [open, setOpen] = useState(false);
  const t = g.traffic;
  const block = t.block;
  const stalled = block !== 'ok' && block !== 'waiting' && block !== 'full';
  // kelish to‘xtasa panel o‘zi ochiladi (sababi va tugma ko‘rinsin)
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (stalled && block !== 'noVacancy' && shown !== block) { setOpen(true); setShown(block); }
  }, [stalled, block, shown]);
  return (
    <div className="supply-panel population-panel panel" data-ui data-testid="population-panel">
      <button className="panel-head" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="population-toggle">
        <span className="head-icon"><Icon.people size={18} /></span>
        <span className="head-title">Aholi</span>
        {!open && <span className={'head-badge ' + (stalled ? 'bad' : 'ok')} data-testid="population-badge">{g.enRoute > 0 ? `+${g.enRoute} yo‘lda` : stalled ? 'Kelmayapti' : 'Kelmoqda'}</span>}
        <span className={'head-chevron' + (open ? ' open' : '')}><Icon.chevron /></span>
      </button>
      {open && (
        <div className="supply-rows">
          <div className="supply-row"><span className="supply-label">Yashayotgan aholi</span><b data-testid="pop-living">{g.population}</b></div>
          <div className="supply-row"><span className="supply-label">Bo‘sh uy o‘rinlari</span><b data-testid="pop-free">{g.freeSeats}</b></div>
          <div className="supply-row"><span className="supply-label">Yo‘lda kelayotganlar</span><b data-testid="pop-enroute">{g.enRoute}</b></div>
          <div className="supply-row"><span className="supply-label">Navbatda (keyingi safarlar)</span><b>{t.queued}</b></div>
          <div className="supply-row"><span className="supply-label">Ko‘chish transporti</span><b>{t.trips.length} / {MIGRATION_CONFIG.maxTrips}</b></div>
          {stalled && <div className="why" data-testid="pop-reason"><b>Kelish to‘xtagan:</b> {MIGRATION_BLOCK_TEXT[block]}</div>}
          {block === 'noEntry' && <EntryButton />}
          {block === 'gateClosed' && <button className="btn-ghost small" onClick={() => g.autoAllGates()} data-testid="gates-auto"><Icon.fort size={14} /> Darvozani avtomatik qilish</button>}
          <div className="edu-note">Yangi aholi xarita chetidagi tashqi yo‘ldan avtomobil yoki avtobusda keladi va uyga yetganda aholiga qo‘shiladi.</div>
        </div>
      )}
    </div>
  );
}

/** Xarita chetigacha kirish yo‘lini bir bosishda qurish (narxi oldindan ko‘rsatiladi) */
function EntryButton() {
  const g = useGame();
  const p = g.suggestEntryRoad();
  if (!p) return <div className="edu-note">Xarita chetigacha bo‘sh yo‘l topilmadi — yo‘lni o‘zingiz xarita chetigacha chizing.</div>;
  const cost = p.length * CATALOG.road.price;
  return (
    <button className="btn-ghost small" onClick={() => g.buildEntryRoad()} disabled={g.money < cost} data-testid="build-entry">
      <Icon.road size={14} /> Kirish yo‘lini qurish ({p.length} katak — {cost})
    </button>
  );
}

/** Tanlangan transport: turi, yo‘lovchilar, manzillar, holati */
export function VehiclePanel() {
  const g = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 300);
    return () => clearInterval(iv);
  }, []);
  const id = g.selectedVehicle;
  if (!id) return null;
  const st = g.traffic.statusOf(id);
  if (!st) return null;
  const why = g.traffic.waitReason(id);
  return (
    <div className="info-panel side-panel panel" data-ui data-testid="vehicle-panel">
      <div className="info-head">
        <div className="info-title">{st.kind === 'police' ? 'Politsiya mashinasi' : `${st.kind === 'bus' ? 'Avtobus' : 'Avtomobil'}${st.migration ? ' — yangi aholi' : ' — shahar transporti'}`}</div>
        <button className="icon-btn" onClick={() => g.selectVehicle(null)} aria-label="Yopish"><Icon.close /></button>
      </div>
      <div className="kv-list">
        <div className="kv-row"><span className="kv-ico"><Icon.road size={20} /></span><span className="kv-label">Holat</span><b data-testid="vehicle-status">{st.status}</b></div>
        {st.migration && <div className="kv-row"><span className="kv-ico"><Icon.people size={20} /></span><span className="kv-label">Yo‘lovchilar</span><b data-testid="vehicle-people">{st.people}</b></div>}
      </div>
      {why && <div className="why"><b>Kutish sababi:</b> {why}</div>}
      {st.migration && st.stops.length > 0 && (
        <div className="edu-note" data-testid="vehicle-stops">
          <b>Manzillar:</b>
          <ul>
            {st.stops.map((s, i) => {
              const o = g.objects.get(s.house);
              return <li key={i}>{o ? `${CATALOG[o.type].name} (${o.gridX}, ${o.gridZ})` : 'uy'} — {s.count} kishi {s.done ? '✓ joylashdi' : ''}</li>;
            })}
          </ul>
        </div>
      )}
      {st.kind === 'police' && <div className="edu-note">Shaharga kirgan dinozavrni chiroq va sirena bilan shahardan chiqaradi (qurolsiz). Har bo‘limdan {POLICE_CONFIG.perStation} tagacha, jami {POLICE_CONFIG.maxTotal} tagacha.</div>}
      {!st.migration && st.kind !== 'police' && <div className="edu-note">Aholining kundalik safarlari (uy — ish, do‘kon, xizmat) yoki bekatlar bo‘yicha qatnaydigan avtobus. Soni aholiga qarab cheklangan.</div>}
    </div>
  );
}
