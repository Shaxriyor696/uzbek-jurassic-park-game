import { useState, type ReactNode } from 'react';
import { audioEngine } from '../audio';
import { assetUrl, useGame, useScene } from './useGame';
import { Icon } from './icons';
import { Onboarding } from './Onboarding';

function Modal({ title, children, onClose, testid }: { title: string; children: ReactNode; onClose?: () => void; testid: string }) {
  return (
    <div className="modal-backdrop" data-ui data-testid={testid + '-backdrop'}>
      <div className="modal panel" role="dialog" aria-modal="true" aria-label={title} data-testid={testid}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label="Yopish" data-testid="modal-close"><Icon.close /></button>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Modals() {
  const g = useGame();
  const scene = useScene();
  if (!g.modal) return null;
  const close = () => g.openModal(null);

  if (g.modal === 'onboarding') return <Onboarding />;

  if (g.modal === 'settings') {
    const saved = g.lastSavedAt ? new Date(g.lastSavedAt).toLocaleTimeString('uz-UZ') : 'hali saqlanmagan';
    return (
      <Modal title="Sozlamalar" onClose={close} testid="settings-modal">
        <div className="settings-list">
          <div className="setting">
            <div>
              <b>Saqlash</b>
              <small>Oxirgi saqlash: {saved}. Avtosaqlash: {g.autosaveBlocked ? 'o‘chiq (buzilgan fayl)' : 'yoqilgan'}.</small>
              {g.saveError && <small className="error">{g.saveError}</small>}
            </div>
            <button className="btn-primary" onClick={() => g.saveNow(true)} data-testid="save-now">Saqlash</button>
          </div>
          <div className="setting">
            <div><b>Dastyor tanishtiruvi</b><small>Uch sahifali qisqa tanishtiruvni qayta ko‘rish — shahar va topshiriqlar o‘zgarmaydi.</small></div>
            <button className="btn-ghost" onClick={() => g.startOnboarding(true)} data-testid="replay-onboarding">Ko‘rish</button>
          </div>
          <div className="setting">
            <div><b>Yangi shahar</b><small>Joriy shahar o‘chiriladi — avval tasdiq so‘raladi.</small></div>
            <button className="btn-ghost" onClick={() => g.openModal('confirmNew')} data-testid="new-city">Yangi shahar</button>
          </div>
          <div className="setting">
            <div><b>Grafik sifat</b><small>Pastda soyalar o‘chadi va piksel zichligi 1 bo‘ladi. FPS: {scene?.fps ?? '—'}</small></div>
            <div className="segmented">
              <button className={g.settings.quality === 'high' ? 'on' : ''} onClick={() => g.setQuality('high')} data-testid="q-high">Yuqori</button>
              <button className={g.settings.quality === 'low' ? 'on' : ''} onClick={() => g.setQuality('low')} data-testid="q-low">Past</button>
            </div>
          </div>
          <div className="setting">
            <div><b>Boshqaruv yordami</b><small>Sichqoncha va klaviatura tugmalari.</small></div>
            <button className="btn-ghost" onClick={() => g.openModal('help')} data-testid="open-help">Ko‘rish</button>
          </div>
          <div className="setting">
            <div><b>Dastyor</b><small>{g.tutorial.skipped ? 'Yo‘riqnoma o‘tkazilgan.' : 'Maslahat oynasini qayta ochish.'}</small></div>
            <button className="btn-ghost" onClick={() => (g.tutorial.skipped ? (g.resumeTutorial(), close()) : g.reopenDastyor())} data-testid="reopen-dastyor">
              {g.tutorial.skipped ? 'Qayta yoqish' : 'Qayta ochish'}
            </button>
          </div>
          <div className="setting">
            <div><b>Kamera</b><small>Boshlang‘ich ko‘rinishga qaytish (Home).</small></div>
            <button className="btn-ghost" onClick={() => { scene?.resetCamera(); close(); }} data-testid="reset-camera">Qaytarish</button>
          </div>
          <SoundSettings />
        </div>
      </Modal>
    );
  }

  if (g.modal === 'confirmNew') {
    return (
      <Modal title="Yangi shahar boshlansinmi?" onClose={close} testid="confirm-modal">
        <p>Joriy shahar, mablag‘ va topshiriqlar o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.</p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={close} data-testid="confirm-cancel">Bekor qilish</button>
          <button className="btn-danger" onClick={() => g.confirmNewCity()} data-testid="confirm-yes">Ha, yangi shahar</button>
        </div>
      </Modal>
    );
  }

  if (g.modal === 'help') {
    return (
      <Modal title="Boshqaruv" onClose={() => g.openModal('settings')} testid="help-modal">
        <div className="help-intro" data-testid="help-intro">
          <img src={assetUrl('assets/brand/logo-384.png')} alt="Uzbek Jurassic Park" draggable={false} />
          <p><b>Uzbek Jurassic Park</b> — O‘zbekiston muhitidagi shahar qurish va boshqarish o‘yini. Uylar, yo‘llar, biznes va xizmat binolarini quring, budjetni boshqaring, aholi ehtiyojlarini (yo‘l, elektr, suv, ta’lim, tibbiyot) qondiring va shaharni atrofdagi dinozavrlardan himoya qiling. Yo‘lda Dastyor yordam beradi.</p>
          <button className="btn-ghost" onClick={() => g.startOnboarding(true)} data-testid="help-onboarding">Dastyor tanishtiruvi</button>
        </div>
        <table className="help-table">
          <tbody>
            <tr><td>Chap tugma bosish</td><td>Tanlash, qurish yoki buzish</td></tr>
            <tr><td>Chap tugma sudrash</td><td>Yo‘l rejimida yo‘l chizish, boshqa rejimda xaritani siljitish</td></tr>
            <tr><td>O‘ng tugma sudrash</td><td>Kamerani aylantirish (360°)</td></tr>
            <tr><td>O‘rta tugma sudrash</td><td>Xaritani siljitish</td></tr>
            <tr><td>G‘ildirak</td><td>Yaqinlashtirish / uzoqlashtirish</td></tr>
            <tr><td>W A S D / strelkalar</td><td>Xaritani siljitish</td></tr>
            <tr><td>Q / E</td><td>Kamerani aylantirish</td></tr>
            <tr><td>R</td><td>Qurilayotgan obyektni 90° aylantirish</td></tr>
            <tr><td>Home</td><td>Boshlang‘ich kamera</td></tr>
            <tr><td>P</td><td>Pauza</td></tr>
            <tr><td>Delete</td><td>Tanlangan obyektni buzish</td></tr>
            <tr><td>Esc</td><td>Rejimdan chiqish / oynani yopish</td></tr>
          </tbody>
        </table>
        {/* 3D modellar CC-BY-4.0 — muallif va manba ko‘rsatilishi shart; kichik havola */}
        <button className="credits-link" onClick={() => g.openModal('credits')} data-testid="open-credits">Mualliflar va litsenziyalar</button>
      </Modal>
    );
  }

  if (g.modal === 'credits') {
    const c = scene?.dinoWalker.credits;
    const d = scene?.dinoWalker.diag;
    const link = (v?: string) => {
      const m = v?.match(/^(.*?)\s*\((https?:[^)]+)\)\s*$/);
      return m ? <><span>{m[1]}</span> — <a href={m[2]} target="_blank" rel="noreferrer">{m[2]}</a></> : v?.startsWith('http') ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : <span>{v ?? '—'}</span>;
    };
    return (
      <Modal title="Mualliflar va litsenziyalar" onClose={() => g.openModal('help')} testid="credits-modal">
        <div className="credits" data-testid="credits">
          <h3>Yuradigan dinozavr (apatozavr)</h3>
          {c ? (
            <table className="help-table">
              <tbody>
                <tr><td>Model</td><td data-testid="credit-title">{c.title ?? '—'}</td></tr>
                <tr><td>Muallif</td><td data-testid="credit-author">{link(c.author)}</td></tr>
                <tr><td>Litsenziya</td><td data-testid="credit-license">{link(c.license)}</td></tr>
                <tr><td>Manba</td><td data-testid="credit-source">{link(c.source)}</td></tr>
              </tbody>
            </table>
          ) : (
            <p>{d?.status === 'error' ? `Model yuklanmadi: ${d.error}` : 'Model yuklanmoqda — ma’lumot GLB faylning o‘zidan o‘qiladi.'}</p>
          )}
          <h3>Yangi dinozavrlar</h3>
          <table className="help-table" data-testid="herd-credits">
            <tbody>
              {(scene?.herdView.status ?? []).map((h) => (
                <tr key={h.type} data-testid={'herd-credit-' + h.type}>
                  <td>{h.name}</td>
                  <td>
                    {h.status === 'ok' && h.credits ? (
                      <>
                        <div>{h.credits.title ?? '—'}</div>
                        <div>{link(h.credits.author)}</div>
                        <div>{link(h.credits.license)}</div>
                        <div>{link(h.credits.source)}</div>
                      </>
                    ) : h.status === 'error' ? `Model yuklanmadi: ${h.error}` : 'Yuklanmoqda…'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="credits-note">
            Yangi modellar muallif ma’lumoti ham GLB ichidagi <code>asset.extras</code> dan o‘qiladi. Uzbek Jurassic Park da faqat masshtab, joy va
            animatsiya vaqti boshqariladi; geometriya va teksturalar o‘zgartirilmagan. Xulq (sayr, ergashish, quvish) — o‘yin sozlamasi.
          </p>
          <p className="credits-note">
            Model Uzbek Jurassic Park uchun yaratilmagan; muallif ma’lumotlari GLB ichidagi <code>asset.extras</code> dan olingan.
            Uzbek Jurassic Park da o‘zgartirildi: masshtab va joylashuv; klipning oldinga yurish qismi (0,62–4,96 s) takrorlanib, qadamlar
            orasida morph og‘irliklari blend qilinadi, dam pozasi 4,96–5,75 s. Geometriya va teksturalar o‘zgartirilmagan.
          </p>
        </div>
      </Modal>
    );
  }

  if (g.modal === 'invalidSave') {
    const download = () => {
      const blob = new Blob([g.invalidSaveInfo?.raw ?? ''], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'uzbek-jurassic-park-buzilgan-saqlash.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    return (
      <Modal title="Saqlangan shahar ochilmadi" testid="invalid-modal">
        <p>Saqlash fayli tekshiruvdan o‘tmadi: <b>{g.invalidSaveInfo?.error}</b></p>
        <p>Fayl o‘chirilmadi. Avtosaqlash o‘chirildi, shuning uchun eski fayl ustidan yozilmaydi.</p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={download}>Faylni yuklab olish</button>
          <button className="btn-ghost" onClick={close} data-testid="invalid-close">Hozircha yopish</button>
          <button className="btn-danger" onClick={() => g.openModal('confirmNew')}>Yangi shahar boshlash</button>
        </div>
      </Modal>
    );
  }
  return null;
}

/** Ovoz sozlamalari: umumiy, muhit, o‘yin effektlari, interfeys, o‘chirish — brauzerda saqlanadi */
function SoundSettings() {
  const [, force] = useState(0);
  const e = audioEngine();
  const s = e?.settings;
  const set = (p: Partial<NonNullable<typeof s>>) => { e?.setSettings(p); force((n) => n + 1); };
  const row = (key: 'master' | 'ambience' | 'effects' | 'ui', label: string) => (
    <label className="sound-row" key={key}>
      <span>{label}</span>
      <input type="range" min={0} max={100} value={Math.round((s?.[key] ?? 0) * 100)} onChange={(ev) => set({ [key]: Number(ev.target.value) / 100 })} data-testid={'vol-' + key} disabled={!e} />
      <b>{Math.round((s?.[key] ?? 0) * 100)}</b>
    </label>
  );
  return (
    <div className="setting sound-setting">
      <div style={{ width: '100%' }}>
        <b>Ovoz</b>
        <small>{!e ? 'Ovoz tizimi ishga tushmagan.' : e.ready ? 'Musiqa yo‘q (to‘plamda musiqa yo‘q). Ovozlar birinchi bosishdan keyin yoqiladi.' : 'Ovoz birinchi bosishdan keyin yoqiladi (brauzer talabi).'}</small>
        <div className="sound-rows">
          {row('master', 'Umumiy')}
          {row('ambience', 'Muhit')}
          {row('effects', 'O‘yin effektlari')}
          {row('ui', 'Interfeys')}
        </div>
      </div>
      <button className={'btn-ghost' + (s?.muted ? ' on' : '')} onClick={() => set({ muted: !s?.muted })} data-testid="mute" disabled={!e}>{s?.muted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}</button>
    </div>
  );
}

