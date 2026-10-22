/** Kod bilan chizilgan SVG ikonlar (G033 toolbar uslubida qayta yaratilgan, rasm fayli emas). */
import type { JSX } from 'react';

type P = { size?: number };

const wrap = (size: number, children: JSX.Element | JSX.Element[], vb = '0 0 24 24') => (
  <svg width={size} height={size} viewBox={vb} aria-hidden="true" fill="currentColor">{children}</svg>
);

export const Icon = {
  road: ({ size = 22 }: P) => wrap(size, [
    <path key="a" d="M8 2h3l-1 20H3z" />, <path key="b" d="M13 2h3l5 20h-7z" />,
    <rect key="c" x="11.2" y="4" width="1.6" height="3" rx=".5" />, <rect key="d" x="11.2" y="10" width="1.6" height="3" rx=".5" />,
    <rect key="e" x="11.2" y="16" width="1.6" height="4" rx=".5" />,
  ]),
  house: ({ size = 22 }: P) => wrap(size, <path d="M12 3 2 11.5h3V21h5.5v-6h3v6H19v-9.5h3z" />),
  shop: ({ size = 22 }: P) => wrap(size, [
    <path key="a" d="M12 2 7 7l5 5 5-5z" />, <path key="b" d="M6 8 1 13l5 5 5-5z" />,
    <path key="c" d="M18 8l-5 5 5 5 5-5z" />, <path key="d" d="M12 14l-5 5 5 5 5-5z" opacity=".55" />,
  ]),
  bolt: ({ size = 22 }: P) => wrap(size, <path d="M13.5 1 4 13.5h6.2L8.8 23 20 9.6h-6.4z" />),
  tap: ({ size = 22 }: P) => wrap(size, [
    <path key="a" d="M10 3h4v2h3v2h-3v2h5a2 2 0 0 1 2 2v3h-3v-2H7V9h3V7H7V5h3z" />,
    <path key="b" d="M19.5 17c0 1.4-1 2.5-2 2.5s-2-1.1-2-2.5c0-1.2 2-3.5 2-3.5s2 2.3 2 3.5z" />,
  ]),
  service: ({ size = 22 }: P) => wrap(size, <path d="M12 2 2 7v2h20V7zM4 10h3v8H4zm6.5 0h3v8h-3zM17 10h3v8h-3zM2 19h20v3H2z" />),
  tree: ({ size = 22 }: P) => wrap(size, <path d="M12 2c-2.6 0-4.5 2-4.5 4.3-1.8.5-3 2-3 3.9 0 2.4 2 4.3 4.5 4.3h2v4.5H8.5V21h7v-2h-2.5v-4.5h2c2.5 0 4.5-1.9 4.5-4.3 0-1.9-1.2-3.4-3-3.9C16.5 4 14.6 2 12 2z" />),
  tower: ({ size = 22 }: P) => wrap(size, <path d="M11 1h2v3h1.5l1 4H17v14h-4v-5h-2v5H7V8h1.5l1-4H11zM2 12h4v10H2zm16 3h4v7h-4z" />),
  bulldozer: ({ size = 22 }: P) => wrap(size, <path d="M4 7h7l2 5h3V9h2v3h1.5a1.5 1.5 0 0 1 1.5 1.5V17h1.5v4.5H22l-2.5-2.5h-1.2a3 3 0 0 1-5.6 0H9.3a3 3 0 0 1-5.6 0H2V13l2-1zm2 2v3h5.3L10 9zM6.5 17.5a1.2 1.2 0 1 0 0 .01zm9 0a1.2 1.2 0 1 0 0 .01z" />),
  coin: ({ size = 26 }: P) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#f5b81e" /><circle cx="12" cy="12" r="8.2" fill="#ffd34d" stroke="#e09a12" strokeWidth="1" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#c47d0a">$</text>
    </svg>
  ),
  people: ({ size = 22 }: P) => wrap(size, <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7.5 0a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM1 20c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5v1H1zm16.5-6.3c3 .3 5.5 2.4 5.5 5.3v2h-4.4v-1c0-2.5-.4-4.6-1.1-6.3z" />),
  smile: ({ size = 26 }: P) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#3ccf62" />
      <circle cx="8.3" cy="9.5" r="1.5" fill="#0f2a4d" /><circle cx="15.7" cy="9.5" r="1.5" fill="#0f2a4d" />
      <path d="M6.8 13.5c1 2.6 3 3.9 5.2 3.9s4.2-1.3 5.2-3.9" stroke="#0f2a4d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  ),
  pause: ({ size = 22 }: P) => wrap(size, <path d="M6 4h4.2v16H6zm7.8 0H18v16h-4.2z" />),
  play: ({ size = 22 }: P) => wrap(size, <path d="M7 4v16l13-8z" />),
  gear: ({ size = 24 }: P) => wrap(size, <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L14.9 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.4 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.9h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM12.9 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />),
  help: ({ size = 20 }: P) => wrap(size, <path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm1.2 17.5h-2.5V16h2.5zm2.4-8.3c-.4.8-1.1 1.3-1.7 1.8-.6.4-.9.8-.9 1.6v.6h-2.4v-.8c0-1.4.6-2.1 1.4-2.7.6-.4 1.2-.8 1.2-1.6 0-.8-.6-1.4-1.6-1.4-1 0-1.7.6-1.9 1.6L7.5 9c.3-2.2 2.1-3.6 4.4-3.6 2.4 0 4.1 1.4 4.1 3.4 0 .5-.1 1-.4 1.4z" />),
  close: ({ size = 18 }: P) => wrap(size, <path d="M5.6 4.2 12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4z" />),
  task: ({ size = 26 }: P) => wrap(size, <path d="M9 2h6v2h4v18H5V4h4zm1 2v2h4V4zm-1.7 9.3-1.1 1.1 3.3 3.3 6.3-6.3-1.1-1.1-5.2 5.2z" />),
  check: ({ size = 16 }: P) => wrap(size, <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />),
  cross: ({ size = 16 }: P) => wrap(size, <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z" />),
  rotate: ({ size = 18 }: P) => wrap(size, <path d="M12 4V1L7.5 5.5 12 10V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z" />),
  home: ({ size = 18 }: P) => wrap(size, <path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z" />),
  gov: ({ size = 22 }: P) => wrap(size, <path d="M12 2 3 6.5V8h18V6.5zM5 9.5h2.5v7H5zm5.75 0h2.5v7h-2.5zm5.75 0H19v7h-2.5zM3 18h18v3H3z" />),
  fort: ({ size = 22 }: P) => wrap(size, <path d="M2 21V9h3V6h2.5v3h3V6h3v3h3V6H19v3h3v12h-8v-5a2 2 0 0 0-4 0v5zm3.5-8h2v3h-2zm11 0h2v3h-2z" />),
  shield: ({ size = 22 }: P) => wrap(size, <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm0 3.2 5 1.9V11c0 3.6-2.2 6.8-5 8.1z" />),
  medical: ({ size = 22 }: P) => wrap(size, <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />),
  book: ({ size = 22 }: P) => wrap(size, <path d="M3 4.5C5.5 3.5 9 3.6 11.2 5v15c-2.2-1.3-5.7-1.4-8.2-.4zm18 0c-2.5-1-6-.9-8.2.5v15c2.2-1.3 5.7-1.4 8.2-.4zM5 8h4v1.3H5zm0 3h4v1.3H5zm10-3h4v1.3h-4zm0 3h4v1.3h-4z" />),
  graduation: ({ size = 22 }: P) => wrap(size, <path d="M12 3 1 9l11 6 9-4.9V17h2V9zM5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8L12 17z" />),
  briefcase: ({ size = 22 }: P) => wrap(size, <path d="M9 3h6a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v4H2V8a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2zm0 2v1h6V5zM2 13.5h8.5V15h3v-1.5H22V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />),
  drop: ({ size = 20 }: P) => wrap(size, <path d="M12 2s7 7.6 7 12.5a7 7 0 0 1-14 0C5 9.6 12 2 12 2z" />),
  wrench: ({ size = 20 }: P) => wrap(size, <path d="M21.7 6.3a5.5 5.5 0 0 1-7.4 6.6l-8 8a2.1 2.1 0 0 1-3-3l8-8a5.5 5.5 0 0 1 6.6-7.4l-3.3 3.3 1.1 2.7 2.7 1.1z" />),
  chart: ({ size = 20 }: P) => wrap(size, <path d="M3 13h4v8H3zm7-5h4v13h-4zm7-5h4v18h-4z" />),
  heart: ({ size = 20 }: P) => wrap(size, <path d="M12 21s-8.5-5.3-8.5-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.5 3.2C20.5 15.7 12 21 12 21z" />),
  chevron: ({ size = 16 }: P) => wrap(size, <path d="M6.4 8.3 12 13.9l5.6-5.6L19 9.7l-7 7-7-7z" />),
  warn: ({ size = 18 }: P) => wrap(size, <path d="M12 2 1 21h22zm-1.2 7h2.4v6h-2.4zm0 7.5h2.4V19h-2.4z" />),
};

/** Elektr stansiyasi kartasi: alohida PNG yo‘q (PRD 06), shuning uchun kod bilan chizilgan rasm. */
export function PowerPlantArt() {
  return (
    <svg viewBox="0 0 120 80" className="card-art-svg" aria-label="Elektr stansiyasi (kod bilan chizilgan)">
      <defs>
        <linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e9f6ff" /><stop offset="1" stopColor="#d6ecfa" /></linearGradient>
      </defs>
      <rect width="120" height="80" fill="url(#pg)" />
      <path d="M10 62 60 42l50 20-50 16z" fill="#c9c3b6" />
      <path d="M22 56V40l26-9 22 8v17l-22 9z" fill="#e2d4b8" />
      <path d="M22 40l26-9 22 8-26 9z" fill="#5f6b80" />
      <path d="M44 48v17l26-9V39z" fill="#cdbd9e" />
      <rect x="74" y="14" width="7" height="40" fill="#f4f4f4" /><rect x="74" y="24" width="7" height="4" fill="#d2433a" /><rect x="74" y="34" width="7" height="4" fill="#d2433a" />
      <rect x="86" y="20" width="7" height="36" fill="#f4f4f4" /><rect x="86" y="28" width="7" height="4" fill="#d2433a" /><rect x="86" y="38" width="7" height="4" fill="#d2433a" />
      <path d="M78 64l14-5 12 4-14 5z" fill="#2b4f86" /><path d="M14 64l12-4 10 3-12 5z" fill="#2b4f86" />
      <path d="M57 8 49 22h6l-3 10 10-15h-6l4-9z" fill="#f2b705" stroke="#0f2a4d" strokeWidth="1" />
    </svg>
  );
}
