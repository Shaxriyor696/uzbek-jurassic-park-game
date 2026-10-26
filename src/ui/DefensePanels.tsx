import { fmt } from '../game/game';
import { useState } from 'react';
import { DEFENSE_STATUS_TEXT, gateCenter } from '../game/defense';
import { DEFENSE_CONFIG, GATE_PHASE_NAME, gatePhase, isWallPiece } from '../game/defenseDefs';
import type { PlacedObject } from '../game/types';
import { Icon } from './icons';
import { isSecurity } from '../game/civic';
import { POLICE_CONFIG } from '../game/trafficDefs';
import { useGame, useScene } from './useGame';

/** Kamerani katakka olib borish */
function useJump() {
  const g = useGame();
  const scene = useScene();
  return (x: number, z: number) => {
    if (!scene) return;
    const s = scene.cam.state;
    scene.cam.set({ ...s, targetX: x - 20 + 0.5, targetZ: z - 20 + 0.5, distance: Math.min(s.distance, 18) });
    g.emit();
  };
}

/** Dastyor: himoya bo‘yicha 4 qadam — bajarilgan amallar hisobga olinadi (bir xil devorni qayta qurish shart emas) */
export function defenseSteps(g: ReturnType<typeof useGame>) {
  const list = g.list;
  const d = g.defense;
  const walls = list.some((o) => isWallPiece(o.type));
  const gates = list.some((o) => o.type === 'himoya_darvoza');
  return [
    { done: walls, title: 'Shahar chetiga devor quring', text: '«Shahar himoyasi» → «Himoya devori»ni tanlang va sichqoncha bilan shahar atrofida tortib chizing. Burilishda burchak qismi o‘zi qo‘yiladi.' },
    { done: gates, title: 'Yo‘l uchun darvoza qo‘ying', text: 'Devor yo‘l ustidan o‘tmaydi. Yo‘l katagiga «Himoya darvozasi»ni qo‘ying — transport o‘tadi, yopiq bo‘lsa dinozavr kirolmaydi.' },
    { done: d.status === 'closed', title: 'Ochiq joylarni yoping', text: 'Qizil halqa — ochiq joy. «Ochiq joyni ko‘rsatish» kamerani o‘sha yerga olib boradi. Darvozalarni yoping, qurilish tugashini kuting.' },
    { done: g.defenseChecked, title: 'Himoyani tekshiring', text: '«Himoyani tekshirish» tugmasini bosing: dinozavr tashqaridan shahar binolariga yo‘l topa olmasligi tekshiriladi.' },
  ];
}

/** Chap ustundagi yig‘iladigan «Shahar himoyasi» paneli */
export function DefensePanel() {
  const g = useGame();
  const jump = useJump();
  const [open, setOpen] = useState(false);
  const d = g.defense;
  const tone = d.status === 'closed' ? 'ok' : d.status === 'none' || d.status === 'empty' ? '' : 'bad';
  const inside = g.dinosInside;
  const intruders = g.herd.dinos.filter((h) => h.mode !== 'leave' && g.inCityArea(h.x, h.z)).length;
  const stations = g.active.filter((o) => isSecurity(o.type) && g.statuses.get(o.id)?.active).length;
  const broken = g.damaged('defense');
  const cityDmg = g.damaged('city');
  const steps = defenseSteps(g);
  const cur = steps.findIndex((s) => !s.done);
  const wallLen = d.wallBuilt;
  return (
    <div className="supply-panel defense-panel panel" data-ui data-testid="defense-panel">
      <button className="panel-head" onClick={() => { setOpen(!open); g.setDefenseOverlay(!open); }} aria-expanded={open} data-testid="defense-toggle">
        <span className="head-icon"><Icon.fort size={18} /></span>
        <span className="head-title">Shahar himoyasi</span>
        {!open && <span className={'head-badge ' + tone} data-testid="defense-badge">{d.status === 'closed' ? 'Yopiq' : d.status === 'none' ? 'Yo‘q' : d.status === 'empty' ? '—' : 'Ochiq'}</span>}
        <span className={'head-chevron' + (open ? ' open' : '')}><Icon.chevron /></span>
      </button>
      {open && (
        <div className="supply-rows">
          <div className="supply-row"><span className="supply-label">Himoya holati</span><b className={tone} data-testid="defense-status">{DEFENSE_STATUS_TEXT[d.status]}</b></div>
          <div className="supply-row"><span className="supply-label">Tayyor devor</span><b data-testid="defense-length">{wallLen} katak (≈{wallLen * 10} m)</b></div>
          <div className="supply-row"><span className="supply-label">Darvozalar</span><b data-testid="defense-gates">{d.gates}{d.gatesOpen ? ` (${d.gatesOpen} ochiq)` : ''}</b></div>
          <div className="supply-row"><span className="supply-label">Qurilayotgan qismlar</span><b data-testid="defense-building">{d.constructing}</b></div>
          <div className="supply-row"><span className="supply-label">Himoyalangan binolar</span><b className="ok">{d.protectedIds.length}</b></div>
          <div className="supply-row"><span className="supply-label">Tashqarida / ochiq</span><b className={d.exposedIds.length && d.status !== 'none' ? 'bad' : ''} data-testid="defense-exposed">{d.status === 'none' ? '—' : d.exposedIds.length}</b></div>
          <div className="supply-row"><span className="supply-label">Shahar ichida dinozavr</span><b className={intruders ? 'bad' : 'ok'} data-testid="defense-intruders">{intruders || 'Yo‘q'}</b></div>
          <div className="supply-row"><span className="supply-label">Politsiya mashinalari</span><b data-testid="defense-police">{g.traffic.police.length} / {stations ? Math.min(POLICE_CONFIG.maxTotal, stations * POLICE_CONFIG.perStation) : 0}</b></div>
          {intruders > 0 && !stations && <div className="why"><b>Shaharda dinozavr bor.</b> Politsiya yoki Xavfsizlik xizmati binosini quring — maxsus mashina uni shahardan chiqaradi.</div>}
          {broken.list.length > 0 && (
            <div className="why" data-testid="defense-damaged">
              <b>Shikastlangan himoya qismlari: {broken.list.length}</b>{broken.list.some((o) => (o.damage ?? 0) >= 1) ? ' (buzilganlari — ochiq joy)' : ''}
              <div style={{ marginTop: 6 }}><button className="btn-ghost small" disabled={g.money < broken.cost} onClick={() => g.repairAll('defense')} data-testid="repair-defense"><Icon.wrench size={14} /> Hammasini ta’mirlash (−{broken.cost})</button></div>
            </div>
          )}
          {cityDmg.list.length > 0 && (
            <div className="why" data-testid="city-damaged">
              <b>Shikastlangan binolar: {cityDmg.list.length}</b>
              {cityDmg.list.some((o) => (o.damage ?? 0) >= 1) ? ` (${cityDmg.list.filter((o) => (o.damage ?? 0) >= 1).length} tasi ishlamayapti)` : ' (hali ishlayapti, lekin keyingi hujumda buzilishi mumkin)'}
              <div style={{ marginTop: 6 }}><button className="btn-ghost small" disabled={g.money < cityDmg.cost} onClick={() => g.repairAll('city')} data-testid="repair-city"><Icon.wrench size={14} /> Hammasini ta’mirlash (−{fmt(cityDmg.cost)})</button></div>
            </div>
          )}
          <div className="supply-row"><span className="supply-label">Ichkarida dinozavr</span><b className={inside ? 'bad' : 'ok'} data-testid="defense-inside">{inside ? `${inside} ta — ichkarida qolgan` : 'Yo‘q'}</b></div>
          {d.status === 'gap' && <div className="why"><b>Chegarada ochiq joy bor.</b> Dinozavr tashqaridan binolarga yetib bora oladi.</div>}
          {d.status === 'gateOpen' && <div className="why"><b>Darvoza ochiq.</b> Dinozavr kirishi mumkin.</div>}
          {d.status === 'construction' && <div className="edu-note">Qurilish tugagach chegara yopiladi. Qurilayotgan qism hali himoya hisoblanmaydi.</div>}
          <div className="defense-actions">
            {d.gap && <button className="btn-ghost small" onClick={() => jump(d.gap!.x, d.gap!.z)} data-testid="defense-show-gap"><Icon.warn size={14} /> Ochiq joyni ko‘rsatish</button>}
            <button className="btn-ghost small" onClick={() => g.checkDefense()} data-testid="defense-check"><Icon.check size={14} /> Himoyani tekshirish</button>
          </div>
          <div className="edu-note">Xaritada: och yashil — devor ichidagi maydon, yashil — himoyalangan bino, qizil — tashqarida qolgan bino va ochiq joy.</div>
          <div className="edu-task defense-task" data-testid="defense-dastyor">
            <div className="edu-task-head"><Icon.task size={16} /> Dastyor: {cur < 0 ? <b>shahar himoyalangan!</b> : <b>{cur + 1}/4 — {steps[cur].title}</b>}</div>
            {cur >= 0 && <div className="edu-task-text">{steps[cur].text}</div>}
            <ol className="defense-steps">{steps.map((s, i) => <li key={i} className={s.done ? 'done' : i === cur ? 'now' : ''}>{s.done ? '✓ ' : ''}{s.title}</li>)}</ol>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tanlangan himoya qismi: darvoza boshqaruvi yoki devor holati */
export function DefenseInfo({ o }: { o: PlacedObject }) {
  const g = useGame();
  const d = g.defense;
  if (o.type !== 'himoya_darvoza') {
    return (
      <div className="kv-list" data-testid="defense-info">
        <div className="kv-row"><span className="kv-ico"><Icon.fort size={20} /></span><span className="kv-label">Chegara</span><b>{DEFENSE_STATUS_TEXT[d.status]}</b></div>
        <div className="edu-note">Devor dinozavr navigatsiyasida haqiqiy to‘siq. Elektr talab qilmaydi; chiroqlar bezak.</div>
      </div>
    );
  }
  const s = o.gate;
  if (!s) return null;
  const ph = gatePhase(s);
  const c = gateCenter(o);
  const danger = g.herd.dinos.some((h) => Math.hypot(h.x - c.x - 0.5, h.z - c.z - 0.5) < DEFENSE_CONFIG.gateRun.dangerRadius)
    || g.dinos.some((a) => Math.hypot(a.ax - c.x - 0.5, a.az - c.z - 0.5) < DEFENSE_CONFIG.gateRun.dangerRadius + a.len * 0.4);
  const tone = ph === 'closed' ? 'ok' : ph === 'waiting' ? 'warn' : ph === 'open' ? 'bad' : 'info';
  return (
    <div className="gate-box" data-testid="gate-panel">
      <div className="kv-row">
        <span className="kv-ico"><Icon.fort size={20} /></span>
        <span className="kv-label">Holat</span>
        <span className={'state-chip ' + tone} data-testid="gate-state">{GATE_PHASE_NAME[ph]}</span>
      </div>
      <div className="kv-row"><span className="kv-ico"><Icon.gear size={20} /></span><span className="kv-label">Rejim</span><b data-testid="gate-mode">{s.mode === 'auto' ? 'Avtomatik' : 'Qo‘lda'}</b></div>
      <div className="gate-buttons">
        <button className={'btn-ghost small' + (s.mode === 'manual' && s.want === 'open' ? ' on' : '')} onClick={() => g.gateCommand(o.id, 'open')} data-testid="gate-open">Ochish</button>
        <button className={'btn-ghost small' + (s.mode === 'manual' && s.want === 'closed' ? ' on' : '')} onClick={() => g.gateCommand(o.id, 'close')} data-testid="gate-close">Yopish</button>
        <button className={'btn-ghost small' + (s.mode === 'auto' ? ' on' : '')} onClick={() => g.gateCommand(o.id, 'auto')} data-testid="gate-auto">Avtomatik</button>
      </div>
      {ph === 'waiting' && <div className="why"><b>Darvoza yo‘li band.</b> Yopilish kutilmoqda — o‘tish joyidagi dinozavr yoki mashina ustiga yopilmaydi.</div>}
      {danger && <div className="why" data-testid="gate-danger"><b>Yaqinda dinozavr bor.</b> {s.mode === 'auto' ? 'Avtomatik rejim darvozani ochmaydi.' : 'Qo‘lda ochilsa dinozavr kirishi mumkin.'}</div>}
      {g.traffic.gateSignals.get(o.id)?.busy && <div className="edu-note">Transport o‘tmoqda — darvoza uning ustiga yopilmaydi.</div>}
      {s.mode === 'manual' && s.want === 'closed' && g.traffic.trips.some((t) => g.traffic.waitReason(t.id)?.startsWith('Darvoza qo‘lda')) && <div className="why"><b>Transport darvozada kutmoqda.</b> Qo‘lda yopilgan darvozani transport o‘zi ochmaydi.</div>}
      <div className="edu-note">Avtomatik: transport yaqinlashsa ochiladi, o‘tgach yopiladi; dinozavr {DEFENSE_CONFIG.gateRun.dangerRadius} katak ichida bo‘lsa ochilmaydi. Dinozavr uchun hech qachon ochilmaydi.</div>
    </div>
  );
}
