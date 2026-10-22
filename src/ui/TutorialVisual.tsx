/**
 * Dastyor va topshiriq paneli uchun ko‘rgazmali yo‘riqnoma: har bosqich 3 ta kichik kartochka
 * (nima tanlash → qanday harakat → natija) va qisqa izoh. Kartochkalarda o‘yin ikonlari
 * va foydalanuvchi bergan PNG rasmlar ishlatiladi.
 */
import type { JSX } from 'react';
import { CATALOG } from '../game/catalog';
import { TUTORIAL_STEPS, TUTORIAL_TOTAL } from '../game/tutorial';
import { Icon, PowerPlantArt } from './icons';
import { assetUrl } from './useGame';

/** Sichqoncha bilan sudrash belgisi. */
function DragIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M4 26h14" stroke="currentColor" strokeWidth="2.4" strokeDasharray="3 3" strokeLinecap="round" />
      <path d="M17 22l5 4-5 4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="20" y="3" width="11" height="17" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M25.5 3v6" stroke="currentColor" strokeWidth="2" />
      <rect x="20" y="3" width="5.5" height="6" rx="2.5" fill="currentColor" />
    </svg>
  );
}

/** Radius belgisi: markaz va doira, ichida son. */
function RadiusIcon({ n, color }: { n: number; color: string }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
      <circle cx="19" cy="19" r="16" fill={color} fillOpacity="0.16" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
      <text x="19" y="24" textAnchor="middle" fontSize="15" fontWeight="900" fill={color}>{n}</text>
    </svg>
  );
}

function Img({ src }: { src: string }) {
  return <img src={assetUrl(src)} alt="" draggable={false} />;
}

const card = (k: string) => CATALOG[k as keyof typeof CATALOG].cardImage!;

type Tile = { art: JSX.Element; label: string; tone?: 'cyan' | 'amber' | 'blue' | 'green' };

const STEPS: Tile[][] = [
  [
    { art: <Icon.road size={30} />, label: '«Yo‘l»', tone: 'cyan' },
    { art: <DragIcon />, label: 'Sudrang' },
    { art: <span className="tv-big">×3</span>, label: 'katak', tone: 'green' },
  ],
  [
    { art: <Img src={card('uy_a')} />, label: '«Uylar»' },
    { art: <span className="tv-key">R</span>, label: 'Aylantirish' },
    { art: <span className="tv-pair"><Icon.road size={20} /><Icon.house size={22} /></span>, label: 'Yo‘l yonida', tone: 'green' },
  ],
  [
    { art: <PowerPlantArt />, label: '«Elektr»' },
    { art: <RadiusIcon n={8} color="#e0a512" />, label: '8 katak', tone: 'amber' },
    { art: <span className="tv-pair"><Icon.bolt size={20} /><Icon.house size={22} /></span>, label: 'Uyga', tone: 'amber' },
  ],
  [
    { art: <Img src={card('suv')} />, label: '«Suv»' },
    { art: <RadiusIcon n={6} color="#2d8fe0" />, label: '6 katak', tone: 'blue' },
    { art: <span className="tv-pair"><Icon.tap size={20} /><Icon.house size={22} /></span>, label: 'Uyga', tone: 'blue' },
  ],
  [
    { art: <Img src={card('bog')} />, label: '«Bog‘lar»' },
    { art: <RadiusIcon n={4} color="#19a463" />, label: '4 katak', tone: 'green' },
    { art: <Icon.smile size={30} />, label: 'Baxt ↑', tone: 'green' },
  ],
];

export function StepTiles({ step }: { step: number }) {
  const tiles = STEPS[Math.min(step, STEPS.length - 1)];
  return (
    <div className="tv-row" data-testid="tutorial-visual">
      {tiles.map((t, i) => (
        <div key={i} className="tv-cell">
          <div className={'tv-tile' + (t.tone ? ' tv-' + t.tone : '')}>{t.art}</div>
          <div className="tv-label">{t.label}</div>
          {i < tiles.length - 1 && <span className="tv-arrow" aria-hidden="true">›</span>}
        </div>
      ))}
    </div>
  );
}

const STEP_ICON = [Icon.road, Icon.house, Icon.bolt, Icon.tap, Icon.tree];

/** 5 bosqichli yo‘l: bajarilgan — yashil belgi, joriy — ajratilgan. */
export function StepDots({ step, completed }: { step: number; completed: boolean }) {
  return (
    <div className="tv-dots" aria-label={`${completed ? TUTORIAL_TOTAL : step}/${TUTORIAL_TOTAL}`}>
      {TUTORIAL_STEPS.map((s, i) => {
        const done = completed || i < step;
        const cur = !completed && i === step;
        const I = STEP_ICON[i];
        return (
          <span key={i} className={'tv-dot' + (done ? ' done' : '') + (cur ? ' cur' : '')} title={s.title}>
            {done ? <Icon.check size={14} /> : <I size={14} />}
          </span>
        );
      })}
    </div>
  );
}
