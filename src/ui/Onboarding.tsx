import { useEffect, useRef, useState } from 'react';
import { uiSound } from '../audio';
import { assetUrl, useGame } from './useGame';

/**
 * Dastyor tanishtiruvi (3 sahifa) — yangi shahar yaratilganda yoki sozlamalardan qayta ko‘rish uchun.
 * Ramka, matn, kartochkalar, ko‘rsatkich va tugmalar — haqiqiy interfeys elementlari; rasm faqat Dastyor
 * (assets/reference/G003.png — o‘yindagi asl obraz) va kartochka illyustratsiyalari (assets/onboarding).
 * Ochiq paytda simulyatsiya to‘xtaydi (Game.update), xaritaga bosish o‘tmaydi (to‘liq ekran qatlami).
 */

interface Card { img: string; label: string; alt: string }
interface Page { title: string; text: string; cards: Card[]; foot: string }

const PAGES: Page[] = [
  {
    title: 'Shahringizni birga quramiz!',
    text: 'Salom! Men Dastyorman. Bu yerda o‘z shahringizni qurasiz va boshqarasiz.',
    cards: [
      { img: 'road', label: 'Yo‘l quring', alt: 'Yo‘l' },
      { img: 'house', label: 'Uylar barpo eting', alt: 'Uy' },
      { img: 'business', label: 'Biznes oching', alt: 'Do‘kon' },
    ],
    foot: 'Har bir katta shahar birinchi qadamdan boshlanadi.',
  },
  {
    title: 'Aholi uchun qulay shahar',
    text: 'Uylarni yo‘l, suv va elektr bilan ta’minlang. Sharoit yaratilsa, odamlar ko‘chib keladi.',
    cards: [
      { img: 'utilities', label: 'Suv va elektr', alt: 'Suv jo‘mragi va elektr' },
      { img: 'services', label: 'Ta’lim va tibbiyot', alt: 'Maktab va shifoxona' },
      { img: 'jobs', label: 'Ish va daromad', alt: 'Do‘kon va tangalar' },
    ],
    foot: 'Xarajatlarni rejalang, aholi ehtiyojlarini kuzating.',
  },
  {
    title: 'Dinozavrlar olamiga xush kelibsiz!',
    text: 'Vodiyda turli dinozavrlar yashaydi. Ularni kuzating, shahringizni xavfsiz rivojlantiring!',
    cards: [
      { img: 'dinos', label: 'Dinozavrlarni kuzating', alt: 'Yerda yuradigan dinozavrlar va uchuvchi pterozavr' },
      { img: 'defense', label: 'Shaharni himoya qiling', alt: 'Chegara devori va darvoza' },
      { img: 'nature', label: 'Tabiatni asrang', alt: 'Daraxtlar va toza daryo' },
    ],
    foot: 'Chegara va darvoza quring, tabiat bilan uyg‘un yashang.',
  },
];

const Arrow = ({ back }: { back?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={back ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M4 11h12.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H4z" fill="currentColor" />
  </svg>
);

export function Onboarding() {
  const g = useGame();
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const primary = useRef<HTMLButtonElement>(null);
  const p = PAGES[page];
  const last = page === PAGES.length - 1;

  // klaviatura bilan ham boshqarish oson bo‘lsin — asosiy tugma fokusda
  useEffect(() => { primary.current?.focus({ preventScroll: true }); }, [page]);

  const go = (d: 1 | -1) => {
    uiSound('click');
    setDir(d);
    setPage((x) => Math.max(0, Math.min(PAGES.length - 1, x + d)));
  };
  const close = (finish: boolean) => {
    uiSound(finish ? 'confirm' : 'close');
    g.openModal(null);
  };

  return (
    <div className="ob-backdrop" data-ui data-testid="onboarding" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="ob-panel" role="dialog" aria-modal="true" aria-labelledby="ob-title">
        <img className="ob-corner left" src={assetUrl('assets/onboarding/corner.png')} alt="" draggable={false} />
        <img className="ob-corner right" src={assetUrl('assets/onboarding/corner.png')} alt="" draggable={false} />
        <div className="ob-hero">
          <img className="ob-dastyor" src={assetUrl('assets/reference/G003.png')} alt="Dastyor" draggable={false} />
          <span className="ob-name">Dastyor</span>
        </div>
        <div className={'ob-body ' + (dir > 0 ? 'fwd' : 'back')} key={page}>
          <h2 id="ob-title" className="ob-title">{p.title}</h2>
          <p className="ob-text">{p.text}</p>
          <div className="ob-cards">
            {p.cards.map((c) => (
              <figure className={'ob-card' + (page === 2 ? ' scene' : '')} key={c.img}>
                <div className="ob-art"><img src={assetUrl(`assets/onboarding/${c.img}.jpg`)} alt={c.alt} draggable={false} /></div>
                <figcaption>{c.label}</figcaption>
              </figure>
            ))}
          </div>
          <div className="ob-divider" aria-hidden="true"><span /></div>
          <p className="ob-foot">{p.foot}</p>
        </div>
        <div className="ob-bottom">
          <div className="ob-progress" aria-label={`Sahifa ${page + 1} / ${PAGES.length}`}>
            {PAGES.map((_, i) => <span key={i} className={'ob-dot' + (i === page ? ' on' : '')} />)}
            <span className="ob-count">{page + 1} / {PAGES.length}</span>
          </div>
          <div className="ob-actions">
            {page > 0 && <button type="button" className="ob-btn ghost" onClick={() => go(-1)} data-testid="ob-back"><Arrow back /> Orqaga</button>}
            {last
              ? <button type="button" ref={primary} className="ob-btn primary" onClick={() => close(true)} data-testid="ob-start">Shahar qurishni boshlash <Arrow /></button>
              : <button type="button" ref={primary} className="ob-btn primary" onClick={() => go(1)} data-testid="ob-next">Keyingi <Arrow /></button>}
            {!last && <button type="button" className="ob-btn soft" onClick={() => close(false)} data-testid="ob-skip">O‘tkazib yuborish</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
