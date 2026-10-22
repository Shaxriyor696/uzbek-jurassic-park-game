import * as THREE from 'three';

/**
 * Kod orqali chizilgan fasad teksturalari (rasm fayli emas).
 * Bitta tekstura «tile» = bitta qavat × bitta oyna oralig‘i.
 * Tile ning chap-past burchagi (0..0.12) toza devor rangi — tom va pastki yuzalar shu nuqtaga map qilinadi.
 */
const cache = new Map<string, THREE.Texture>();

function canvasTex(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

export type FacadeStyle = 'cream' | 'white' | 'beige' | 'glass' | 'glassDark' | 'shop' | 'brick' | 'terracottaWall';

const FACADES: Record<FacadeStyle, { wall: string; glass: string; frame: string; win: [number, number, number, number] }> = {
  cream: { wall: '#efe4cf', glass: '#5d8fbf', frame: '#ffffff', win: [0.28, 0.25, 0.72, 0.78] },
  white: { wall: '#f6f4ef', glass: '#4f86c0', frame: '#dfe6ee', win: [0.2, 0.22, 0.8, 0.8] },
  beige: { wall: '#dcc7a3', glass: '#577fa8', frame: '#f4ede0', win: [0.27, 0.24, 0.73, 0.8] },
  glass: { wall: '#d9e3ea', glass: '#4f8cc4', frame: '#c8d6e2', win: [0.06, 0.06, 0.94, 0.94] },
  glassDark: { wall: '#9fb2c2', glass: '#2f5d88', frame: '#8ca3b6', win: [0.05, 0.08, 0.95, 0.95] },
  shop: { wall: '#e9dfcf', glass: '#7fb0d6', frame: '#5b5f66', win: [0.05, 0.05, 0.95, 0.85] },
  brick: { wall: '#c98e62', glass: '#5d8fbf', frame: '#f2ece2', win: [0.3, 0.25, 0.7, 0.78] },
  terracottaWall: { wall: '#f3e9d6', glass: '#668fb6', frame: '#ffffff', win: [0.3, 0.3, 0.7, 0.8] },
};

export function facadeTexture(style: FacadeStyle): THREE.Texture {
  const f = FACADES[style];
  const glassy = style === 'glass' || style === 'glassDark';
  return canvasTex('facade-' + style, 128, (c, s) => {
    // devor: yengil vertikal gradient (pastda biroz to‘qroq) — tekis plastik ko‘rinmasin
    const wg = c.createLinearGradient(0, 0, 0, s);
    wg.addColorStop(0, f.wall);
    wg.addColorStop(1, shade(f.wall, 0.94));
    c.fillStyle = wg;
    c.fillRect(0, 0, s, s);
    const [x0, y0, x1, y1] = f.win;
    const px = (v: number) => Math.round(v * s);
    const L = px(x0), R = px(x1), T = s - px(y1), B = s - px(y0);
    if (!glassy) {
      // qavatlararo yupqa chiziq
      c.fillStyle = shade(f.wall, 0.9);
      c.fillRect(0, s - 3, s, 3);
      // oyna atrofidagi soya (chuqurlik hissi)
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(L - 4, T - 4, R - L + 10, B - T + 10);
    }
    c.fillStyle = f.frame;
    c.fillRect(L - 4, T - 4, R - L + 8, B - T + 8);
    // shisha: osmon aksi — yuqorisi och, pasti to‘q
    const g = c.createLinearGradient(0, T, 0, B);
    g.addColorStop(0, shade(f.glass, 1.35));
    g.addColorStop(0.45, f.glass);
    g.addColorStop(1, shade(f.glass, 0.7));
    c.fillStyle = g;
    c.fillRect(L, T, R - L, B - T);
    // diagonal yaltirash
    c.save();
    c.beginPath();
    c.rect(L, T, R - L, B - T);
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath();
    c.moveTo(L, B); c.lineTo(L + (R - L) * 0.45, T); c.lineTo(L + (R - L) * 0.7, T); c.lineTo(L + (R - L) * 0.25, B);
    c.fill();
    c.restore();
    // rom (krest) va tokcha
    c.fillStyle = f.frame;
    if (!glassy) {
      c.fillRect((L + R) / 2 - 2, T, 4, B - T);
      c.fillRect(L, T + (B - T) * 0.38, R - L, 3);
      c.fillStyle = shade(f.frame, 0.92);
      c.fillRect(L - 7, B + 3, R - L + 14, 5);
    } else {
      c.fillRect(L, T, R - L, 2);
    }
    // toza devor nuqtasi (0..0.12 burchak)
    c.fillStyle = f.wall;
    c.fillRect(0, s - px(0.12), px(0.12), px(0.12));
  });
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

/** Kongress markazi / Hilton podiumi uchun geometrik panjara naqsh (girih uslubida, soddalashtirilgan). */
export function latticeTexture(): THREE.Texture {
  return canvasTex('lattice', 128, (c, s) => {
    c.fillStyle = '#e8dcc4';
    c.fillRect(0, 0, s, s);
    c.strokeStyle = '#b9a785';
    c.lineWidth = 3;
    const h = s / 2;
    for (const [ox, oy] of [[0, 0], [h, 0], [0, h], [h, h]]) {
      c.beginPath();
      c.moveTo(ox + h / 2, oy + 4);
      c.lineTo(ox + h - 4, oy + h / 2);
      c.lineTo(ox + h / 2, oy + h - 4);
      c.lineTo(ox + 4, oy + h / 2);
      c.closePath();
      c.stroke();
      c.beginPath();
      c.arc(ox + h / 2, oy + h / 2, h / 6, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = '#e8dcc4';
    c.fillRect(0, s - 15, 15, 15);
  });
}

const imgLoader = new THREE.TextureLoader();
function imageTex(name: string) {
  const hit = cache.get('img:' + name);
  if (hit) return hit;
  const t = imgLoader.load(import.meta.env.BASE_URL + 'assets/derived/' + name);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set('img:' + name, t);
  return t;
}

/** Suv: Shahar_qismlari/Kanal.png dan kesib olingan, choksiz qilingan tekstura. */
export function waterTexture(): THREE.Texture {
  return imageTex('textures/water.jpg');
}

/** O‘t: G001 dagi bo‘sh maydon o‘tidan olingan tekstura (to‘r chiziqlari olib tashlangan). */
export function grassTexture(): THREE.Texture {
  return imageTex('textures/grass.jpg');
}

/** Rasmlardan kesilgan fasad (Toshkent City binolari va boshqalar). */
export function facadeImage(name: string, repeat = false): THREE.Texture {
  const t = imageTex('facades/' + name + '.jpg');
  if (!repeat) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Asfalt: Togri_yol.png dagi rangdan, mayda donador shovqin. */
export function asphaltTexture(): THREE.Texture {
  return canvasTex('asphalt', 256, (c, s) => {
    c.fillStyle = '#5f5957';
    c.fillRect(0, 0, s, s);
    let seed = 21;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) {
      const v = 70 + Math.floor(rnd() * 60);
      c.fillStyle = `rgba(${v},${v - 4},${v - 6},0.35)`;
      c.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
    for (let i = 0; i < 25; i++) {
      c.fillStyle = `rgba(40,38,38,${0.05 + rnd() * 0.07})`;
      c.beginPath();
      c.arc(rnd() * s, rnd() * s, 10 + rnd() * 30, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** Piyodalar yo‘lagi plitkalari (Togri_yol/Kanal dagi och-bej plitka). */
export function pavingTexture(): THREE.Texture {
  return canvasTex('paving', 256, (c, s) => {
    c.fillStyle = '#d9c3ac';
    c.fillRect(0, 0, s, s);
    let seed = 33;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 4;
    const t = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 228 + Math.floor(rnd() * 16);
      c.fillStyle = `rgb(${v},${v - 22},${v - 46})`;
      c.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    }
  });
}

/** Holat indikatori ikonlari (sprite uchun). */
export function statusIconTexture(kind: 'power' | 'water' | 'road'): THREE.Texture {
  return canvasTex('icon-' + kind, 128, (c, s) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 8;
    c.strokeStyle = '#e04646';
    c.stroke();
    c.fillStyle = kind === 'power' ? '#f2b705' : kind === 'water' ? '#2d8fe0' : '#4a4f57';
    c.beginPath();
    if (kind === 'power') {
      c.moveTo(70, 18); c.lineTo(36, 70); c.lineTo(60, 70); c.lineTo(52, 110); c.lineTo(92, 52); c.lineTo(66, 52); c.closePath();
    } else if (kind === 'water') {
      c.moveTo(64, 20); c.bezierCurveTo(90, 56, 98, 70, 98, 82); c.arc(64, 82, 34, 0, Math.PI, false); c.bezierCurveTo(30, 70, 38, 56, 64, 20);
    } else {
      c.moveTo(48, 22); c.lineTo(80, 22); c.lineTo(100, 106); c.lineTo(28, 106); c.closePath();
    }
    c.fill();
    if (kind === 'road') {
      c.fillStyle = '#ffffff';
      for (const y of [32, 58, 84]) c.fillRect(60, y, 8, 14);
    }
  }, false);
}

/** Tom cherepitsasi: gorizontal qatorlar + yengil rang tebranishi (rang material orqali beriladi). */
export function roofTexture(): THREE.Texture {
  return canvasTex('roof', 128, (c, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, s, s);
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rows = 8;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 8;
      for (let x = -16; x < s; x += 16) {
        const v = 225 + Math.floor(rnd() * 30);
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.fillRect(x + off, r * rh, 15, rh - 3);
      }
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.fillRect(0, r * rh + rh - 3, s, 3);
    }
  });
}

/** Shtukatura: oq asosli mayda donador devor (rang material orqali beriladi). */
export function stuccoTexture(): THREE.Texture {
  return canvasTex('stucco', 128, (c, s) => {
    c.fillStyle = '#f4f4f4';
    c.fillRect(0, 0, s, s);
    let seed = 77;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const v = 225 + Math.floor(rnd() * 30);
      c.fillStyle = `rgba(${v},${v},${v},0.5)`;
      c.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
  });
}

/** Deraza oynasi: yuqorida osmon aksi, pastda iliq ichki yorug‘lik (rasmlardagi kabi). */
export function windowGlassTexture(warm: boolean): THREE.Texture {
  return canvasTex('winglass-' + warm, 64, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s);
    if (warm) {
      g.addColorStop(0, '#9cc6e6');
      g.addColorStop(0.45, '#6f9ec4');
      g.addColorStop(0.55, '#d9a560');
      g.addColorStop(1, '#f2c27a');
    } else {
      g.addColorStop(0, '#b9dcf3');
      g.addColorStop(0.5, '#5d93c4');
      g.addColorStop(1, '#3a6f9f');
    }
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.beginPath();
    c.moveTo(0, s * 0.7); c.lineTo(s * 0.5, 0); c.lineTo(s * 0.75, 0); c.lineTo(s * 0.1, s);  c.lineTo(0, s);
    c.fill();
  }, false);
}

// ---------- Biznes binolari uchun materiallar (lavha, soyabon, majolika, gumbaz) ----------

export type SignLogo = 'cart' | 'wheat' | 'recycle' | 'leaf' | 'kazan' | 'bricks' | 'bars' | 'nuts' | 'shield' | 'drop' | null;

export interface SignSpec {
  lines: { text: string; color: string; size: number; serif?: boolean; italic?: boolean }[];
  /** Fon rangi; null — shaffof (harflar devorga yozilgandek) */
  bg: string | null;
  logo?: SignLogo;
  logoColor?: string;
  /** Logo matndan oldin (chapda) yoki tepada */
  logoPos?: 'left' | 'top';
}

function drawLogo(c: CanvasRenderingContext2D, kind: SignLogo, x: number, y: number, s: number, color: string) {
  c.save();
  c.translate(x, y);
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (kind === 'cart') {
    c.lineWidth = s * 0.1;
    c.beginPath(); c.moveTo(-s * 0.5, -s * 0.35); c.lineTo(-s * 0.32, -s * 0.35); c.lineTo(-s * 0.15, s * 0.2); c.lineTo(s * 0.42, s * 0.2); c.lineTo(s * 0.5, -s * 0.2); c.lineTo(-s * 0.26, -s * 0.2); c.stroke();
    for (const wx of [-s * 0.1, s * 0.32]) { c.beginPath(); c.arc(wx, s * 0.38, s * 0.08, 0, Math.PI * 2); c.fill(); }
  } else if (kind === 'wheat' || kind === 'leaf') {
    for (let i = 0; i < 3; i++) {
      c.save(); c.rotate((i - 1) * 0.45);
      for (let k = 0; k < (kind === 'wheat' ? 3 : 1); k++) {
        c.beginPath(); c.ellipse(0, -s * 0.15 - k * s * 0.17, s * 0.09, s * 0.17, 0, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    c.lineWidth = s * 0.06; c.beginPath(); c.moveTo(0, -s * 0.05); c.lineTo(0, s * 0.45); c.stroke();
  } else if (kind === 'recycle') {
    c.lineWidth = s * 0.13;
    for (let i = 0; i < 3; i++) {
      c.save(); c.rotate((i * Math.PI * 2) / 3);
      c.beginPath(); c.moveTo(-s * 0.32, s * 0.2); c.lineTo(-s * 0.05, -s * 0.28); c.stroke();
      c.beginPath(); c.moveTo(s * 0.02, -s * 0.38); c.lineTo(s * 0.1, -s * 0.16); c.lineTo(-s * 0.14, -s * 0.2); c.closePath(); c.fill();
      c.restore();
    }
  } else if (kind === 'kazan') {
    c.beginPath(); c.ellipse(0, s * 0.05, s * 0.48, s * 0.12, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(0, s * 0.05, s * 0.42, 0, Math.PI); c.fill();
    c.lineWidth = s * 0.06;
    for (const dx of [-0.15, 0, 0.15]) { c.beginPath(); c.moveTo(dx * s, -s * 0.12); c.quadraticCurveTo(dx * s + s * 0.08, -s * 0.3, dx * s, -s * 0.45); c.stroke(); }
  } else if (kind === 'bricks') {
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3 - r; k++) c.fillRect(-s * 0.45 + k * s * 0.32 + r * s * 0.16, s * 0.25 - r * s * 0.26, s * 0.28, s * 0.2);
  } else if (kind === 'bars') {
    for (let i = 0; i < 5; i++) { const h = s * (0.4 + (i % 3) * 0.25 + (i === 2 ? 0.2 : 0)); c.fillRect(-s * 0.48 + i * s * 0.2, s * 0.45 - h, s * 0.14, h); }
  } else if (kind === 'shield') {
    // ko‘k qalqon ichida yashil barg (Ekologiya markazi)
    c.beginPath(); c.moveTo(0, -s * 0.48); c.lineTo(s * 0.4, -s * 0.34); c.lineTo(s * 0.36, s * 0.12); c.quadraticCurveTo(s * 0.2, s * 0.4, 0, s * 0.5);
    c.quadraticCurveTo(-s * 0.2, s * 0.4, -s * 0.36, s * 0.12); c.lineTo(-s * 0.4, -s * 0.34); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, -s * 0.36); c.lineTo(s * 0.3, -s * 0.25); c.lineTo(s * 0.27, s * 0.1); c.quadraticCurveTo(s * 0.15, s * 0.32, 0, s * 0.4);
    c.quadraticCurveTo(-s * 0.15, s * 0.32, -s * 0.27, s * 0.1); c.lineTo(-s * 0.3, -s * 0.25); c.closePath(); c.fill();
    c.fillStyle = '#3fae49'; c.beginPath(); c.ellipse(0, 0, s * 0.13, s * 0.26, 0.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ffffff'; c.lineWidth = s * 0.03; c.beginPath(); c.moveTo(-s * 0.1, s * 0.2); c.lineTo(s * 0.08, -s * 0.18); c.stroke();
  } else if (kind === 'drop') {
    c.beginPath(); c.moveTo(0, -s * 0.45); c.quadraticCurveTo(s * 0.38, s * 0.05, s * 0.3, s * 0.22); c.arc(0, s * 0.18, s * 0.3, 0, Math.PI); c.quadraticCurveTo(-s * 0.38, s * 0.05, 0, -s * 0.45); c.fill();
  } else if (kind === 'nuts') {
    c.beginPath(); c.ellipse(-s * 0.18, 0, s * 0.2, s * 0.28, -0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c98b3c'; c.beginPath(); c.ellipse(s * 0.2, s * 0.05, s * 0.2, s * 0.26, 0.4, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

/** Yozuvli lavha teksturasi; aspect = eni/bo‘yi. */
export function signTexture(spec: SignSpec, aspect: number): THREE.Texture {
  const key = 'sign:' + JSON.stringify(spec) + ':' + aspect.toFixed(2);
  const hit = cache.get(key);
  if (hit) return hit;
  // uzun ingichka lavhalar xira bo‘lmasligi uchun eni nisbatga qarab (512..2048)
  const W = Math.min(2048, Math.max(512, Math.round(aspect * 96)));
  const H = Math.max(32, Math.round(W / aspect));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  if (spec.bg) { c.fillStyle = spec.bg; c.fillRect(0, 0, W, H); }
  const logo = spec.logo ?? null;
  const top = logo && spec.logoPos === 'top';
  const logoS = top ? H * 0.38 : H * 0.7;
  const total = spec.lines.reduce((a, l) => a + l.size, 0);
  const textTop = top ? H * 0.42 : 0;
  const textH = H - textTop;
  let cy = textTop + (textH - total * textH * 0.85) / 2;
  const leftPad = logo && !top ? logoS * 1.15 : 0;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  let maxW = 0;
  for (const l of spec.lines) {
    const px = Math.round(l.size * textH * 0.85);
    c.font = `${l.italic ? 'italic ' : ''}${l.serif ? '700' : '900'} ${px}px ${l.serif ? 'Georgia, "Times New Roman", serif' : '"Arial Black", Arial, sans-serif'}`;
    maxW = Math.max(maxW, Math.min(W - leftPad - 16, c.measureText(l.text).width));
  }
  const blockX = (W - (maxW + leftPad)) / 2 + leftPad;
  for (const l of spec.lines) {
    const px = Math.round(l.size * textH * 0.85);
    c.font = `${l.italic ? 'italic ' : ''}${l.serif ? '700' : '900'} ${px}px ${l.serif ? 'Georgia, "Times New Roman", serif' : '"Arial Black", Arial, sans-serif'}`;
    c.fillStyle = l.color;
    c.fillText(l.text, blockX + maxW / 2, cy, W - leftPad - 16);
    cy += px;
  }
  if (logo) {
    const col = spec.logoColor ?? spec.lines[0]?.color ?? '#000';
    if (top) drawLogo(c, logo, W / 2, H * 0.21, logoS, col);
    else drawLogo(c, logo, blockX - logoS * 0.62, H / 2, logoS, col);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Soyabon chiziqlari (masalan, pushti-oq). */
export function stripeTexture(a: string, b: string, n = 8): THREE.Texture {
  return canvasTex(`stripe:${a}:${b}:${n}`, 128, (c, s) => {
    for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect((i * s) / n, 0, s / n + 1, s); }
  });
}

/** Majolika (ko‘k-oq-feruza naqshli koshin). */
export function tileTexture(): THREE.Texture {
  return canvasTex('majolica', 128, (c, s) => {
    c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, s, s);
    const q = s / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const x = i * q + q / 2, y = j * q + q / 2;
      c.fillStyle = '#1f5fa8';
      c.beginPath(); c.moveTo(x, y - q * 0.45); c.lineTo(x + q * 0.45, y); c.lineTo(x, y + q * 0.45); c.lineTo(x - q * 0.45, y); c.closePath(); c.fill();
      c.fillStyle = '#2bb3c0';
      c.beginPath(); c.arc(x, y, q * 0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f4f1e8';
      c.beginPath(); c.arc(x, y, q * 0.08, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = '#1f5fa8'; c.lineWidth = 2; c.strokeRect(1, 1, s - 2, s - 2);
  });
}

/** Chorsu gumbazi: feruza fonda ko‘k romb naqsh. */
export function domeTileTexture(): THREE.Texture {
  return canvasTex('dome-tiles', 256, (c, s) => {
    c.fillStyle = '#4fb8d8'; c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) for (let x = 0; x < s; x += 8) { c.fillStyle = (x + y) % 16 ? '#5cc4e2' : '#46a9cc'; c.fillRect(x, y, 7, 7); }
    const cx = s / 2, cy = s / 2;
    c.fillStyle = '#1d5c9e';
    c.beginPath(); c.moveTo(cx, cy - 70); c.lineTo(cx + 46, cy); c.lineTo(cx, cy + 70); c.lineTo(cx - 46, cy); c.closePath(); c.fill();
    c.fillStyle = '#e9f5f8';
    c.beginPath(); c.moveTo(cx, cy - 46); c.lineTo(cx + 30, cy); c.lineTo(cx, cy + 46); c.lineTo(cx - 30, cy); c.closePath(); c.fill();
    c.fillStyle = '#2f86c0';
    c.beginPath(); c.moveTo(cx, cy - 24); c.lineTo(cx + 15, cy); c.lineTo(cx, cy + 24); c.lineTo(cx - 15, cy); c.closePath(); c.fill();
  });
}

/** Yog‘och o‘ymakor panjara (Bibi Hanum, Rishton). */
export function carvedTexture(): THREE.Texture {
  return canvasTex('carved', 128, (c, s) => {
    c.fillStyle = '#7a4a24'; c.fillRect(0, 0, s, s);
    c.strokeStyle = '#c08a4e'; c.lineWidth = 5;
    for (let i = -s; i < s * 2; i += 24) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + s, s); c.stroke();
      c.beginPath(); c.moveTo(i + s, 0); c.lineTo(i, s); c.stroke();
    }
    c.strokeStyle = '#5a3418'; c.lineWidth = 6; c.strokeRect(3, 3, s - 6, s - 6);
  });
}

/** Golshtin sigir terisi: oq fonda tartibsiz qora dog‘lar (silindrik UV uchun gorizontal takrorlanadi). */
export function cowHideTexture(): THREE.Texture {
  return canvasTex('cowhide', 128, (c, s) => {
    c.fillStyle = '#f6f3ec';
    c.fillRect(0, 0, s, s);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    c.fillStyle = '#1f1d1b';
    for (let i = 0; i < 7; i++) {
      const cx = rnd() * s, cy = 18 + rnd() * (s - 36), r = 10 + rnd() * 16;
      for (const dx of [-s, 0, s]) {
        c.beginPath();
        for (let k = 0; k <= 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          const rr = r * (0.7 + 0.5 * Math.abs(Math.sin(a * 2.3 + i)));
          const px = cx + dx + Math.cos(a) * rr * 1.3, py = cy + Math.sin(a) * rr;
          if (k === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.fill();
      }
    }
  });
}

// ---------------- «Ta’lim» binolari teksturalari (canvas, rasm emas) ----------------

/** Universitet: bitta katak = bitta deraza — oq ramka, ko‘k oyna, o‘rtada tik o‘rinbosar (takrorlanadi). */
export function uniWindowTexture(): THREE.Texture {
  return canvasTex('edu:uniwin', 64, (c, s) => {
    c.fillStyle = '#f2f0ea';
    c.fillRect(0, 0, s, s);
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#3f78c8');
    g.addColorStop(1, '#1f4f9a');
    c.fillStyle = g;
    c.fillRect(s * 0.17, s * 0.16, s * 0.66, s * 0.62);
    c.fillStyle = '#e9eef4';
    c.fillRect(s * 0.48, s * 0.16, s * 0.04, s * 0.62);
    c.fillRect(s * 0.17, s * 0.44, s * 0.66, s * 0.03);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(s * 0.2, s * 0.19, s * 0.12, s * 0.2);
  });
}

/** Navoiy kutubxonasi: tilla rang naqshli (girih uslubida) ko‘k oyna — arkali derazalar uchun. */
export function ornateGlassTexture(): THREE.Texture {
  return canvasTex('edu:ornate', 128, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#2c5f9e');
    g.addColorStop(1, '#173d72');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.strokeStyle = '#c9a55a';
    c.lineWidth = 3;
    const n = 4;
    const cell = s / n;
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
      const cx = cell * (i + 0.5), cy = cell * (k + 0.5), r = cell * 0.42;
      c.beginPath();
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + Math.PI / 8;
        const rr = a % 2 ? r * 0.62 : r;
        const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
        if (a === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = '#dcc07a';
    c.lineWidth = 2;
    c.strokeRect(1, 1, s - 2, s - 2);
  });
}

/** Shisha parda devor: ko‘k oyna, tik va gorizontal o‘rinbosarlar (takrorlanadi). */
export function curtainGlassTexture(tint = '#2f6fb0', streak = true): THREE.Texture {
  return canvasTex('edu:curtain:' + tint + streak, 64, (c, s) => {
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, tint);
    g.addColorStop(1, '#1d4675');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(255,255,255,0.14)';
    if (streak) { c.beginPath(); c.moveTo(0, s * 0.7); c.lineTo(s * 0.7, 0); c.lineTo(s, 0); c.lineTo(0, s); c.fill(); }
    c.fillStyle = '#c9d2db';
    c.fillRect(0, 0, s, 3);
    c.fillRect(0, 0, 3, s);
  });
}

/** Yashil jalyuzi (tik qovurg‘alar) — INVENTO fasadi. */
export function louvreTexture(): THREE.Texture {
  return canvasTex('edu:louvre', 64, (c, s) => {
    for (let i = 0; i < 8; i++) {
      const x = (i * s) / 8;
      const g = c.createLinearGradient(x, 0, x + s / 8, 0);
      g.addColorStop(0, '#0f6e57');
      g.addColorStop(0.5, '#23a383');
      g.addColorStop(1, '#0b5644');
      c.fillStyle = g;
      c.fillRect(x, 0, s / 8, s);
    }
  });
}

/** Bolalar maydonchasi: rangli rezina qoplama (ko‘k, to‘q sariq, sariq, yashil dog‘lar). */
export function playFloorTexture(): THREE.Texture {
  return canvasTex('edu:playfloor', 256, (c, s) => {
    c.fillStyle = '#4f86c6';
    c.fillRect(0, 0, s, s);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cols = ['#f08a3c', '#f2c94c', '#6cbf5a', '#e2574c', '#57b7d8'];
    for (let i = 0; i < 16; i++) {
      c.fillStyle = cols[i % cols.length];
      c.beginPath();
      const cx = rnd() * s, cy = rnd() * s, r = 18 + rnd() * 34;
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * Math.PI * 2, rr = r * (0.7 + 0.4 * Math.sin(a * 3 + i));
        if (k === 0) c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        else c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      c.fill();
    }
  });
}

/** Gumbaz to‘ri (mis-jigarrang, romb panjara). */
export function domeLatticeTexture(): THREE.Texture {
  return canvasTex('edu:domelattice', 128, (c, s) => {
    c.fillStyle = '#6e4a3a';
    c.fillRect(0, 0, s, s);
    c.strokeStyle = '#9a6a52';
    c.lineWidth = 3;
    for (let i = -s; i < s * 2; i += 16) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + s, s); c.stroke();
      c.beginPath(); c.moveTo(i, s); c.lineTo(i + s, 0); c.stroke();
    }
  });
}

// ---------------- Shifoxona teksturalari ----------------

/** Milliy geometrik (girih) naqshli panel: krem fon, feruza-ko‘k sakkiz qirrali yulduzlar, tilla hoshiya. */
export function girihPanelTexture(): THREE.Texture {
  return canvasTex('health:girih', 128, (c, s) => {
    c.fillStyle = '#efe6d2';
    c.fillRect(0, 0, s, s);
    const cell = s / 2;
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) {
      const cx = cell * (i + 0.5), cy = cell * (k + 0.5);
      for (const [r, col, lw] of [[cell * 0.46, '#2b7f8f', 5], [cell * 0.3, '#1f5f8f', 4]] as const) {
        c.strokeStyle = col;
        c.lineWidth = lw;
        c.beginPath();
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          const rr = a % 2 ? r * 0.7 : r;
          const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
          if (a === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        c.stroke();
      }
      c.fillStyle = '#3a8fa0';
      c.beginPath();
      c.arc(cx, cy, cell * 0.08, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#c9a55a';
    c.lineWidth = 4;
    c.strokeRect(2, 2, s - 4, s - 4);
  });
}

/** Iliq yoritilgan ichki makon ko‘rinadigan baland oyna: ko‘k ramkalar, iliq och sariq fon. */
export function warmCurtainTexture(): THREE.Texture {
  return canvasTex('health:warmcurtain', 64, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#f4dfae');
    g.addColorStop(1, '#d8b479');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(70,120,160,0.35)';
    c.fillRect(0, 0, s, s * 0.18);
    c.fillStyle = '#2b5f8f';
    c.fillRect(0, 0, s, 4);
    c.fillRect(0, 0, 4, s);
  });
}

/** Shifoxona lenta derazasi: ko‘k oyna, tik ramkalar (gorizontal takrorlanadi). */
export function ribbonWindowTexture(): THREE.Texture {
  return canvasTex('health:ribbon', 64, (c, s) => {
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#3f7fa8');
    g.addColorStop(1, '#22567d');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(255,240,200,0.18)';
    c.fillRect(s * 0.15, s * 0.55, s * 0.5, s * 0.3);
    c.fillStyle = '#d9d4c6';
    c.fillRect(0, 0, 5, s);
    c.fillRect(0, 0, s, 3);
    c.fillRect(0, s - 3, s, 3);
  });
}

// ---------------- Boshqaruv binolari teksturalari ----------------

/** O‘zbekiston bayrog‘i (ko‘k-oq-yashil, ingichka qizil chiziqlar, oq yarim oy va yulduzlar). */
export function uzFlagTexture(): THREE.Texture {
  const key = 'civic:flag';
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const c = cv.getContext('2d')!;
  const W = 256, H = 128;
  c.fillStyle = '#1eb4e8'; c.fillRect(0, 0, W, H * 0.33);
  c.fillStyle = '#ffffff'; c.fillRect(0, H * 0.33, W, H * 0.34);
  c.fillStyle = '#1eb53a'; c.fillRect(0, H * 0.67, W, H * 0.33);
  c.fillStyle = '#ce1126'; c.fillRect(0, H * 0.32, W, 3); c.fillRect(0, H * 0.67 - 2, W, 3);
  c.fillStyle = '#ffffff';
  c.beginPath(); c.arc(30, 21, 14, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1eb4e8'; c.beginPath(); c.arc(35, 21, 13, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffffff';
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) c.fillRect(52 + k * 9, 9 + r * 9, 4, 4);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Plitkali tosh qoplama (krem, ingichka choklar) — takrorlanadi. */
export function stoneTileTexture(base = '#e9dcc3'): THREE.Texture {
  return canvasTex('civic:stone:' + base, 64, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(120,100,70,0.28)';
    c.lineWidth = 1.5;
    c.strokeRect(0.5, 0.5, s - 1, s / 2 - 1);
    c.strokeRect(0.5, s / 2 + 0.5, s - 1, s / 2 - 1);
    c.beginPath(); c.moveTo(s / 2, 0); c.lineTo(s / 2, s / 2); c.stroke();
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(255,255,255,${rnd() * 0.12})`; c.fillRect(rnd() * s, rnd() * s, 2, 2); }
  });
}

/** Gerb doirasi (yashil-tilla) — hokimlik va xavfsizlik fasadi uchun soddalashtirilgan belgi. */
export function emblemTexture(): THREE.Texture {
  return canvasTex('civic:emblem', 128, (c, s) => {
    c.clearRect(0, 0, s, s);
    c.fillStyle = '#c9a24a'; c.beginPath(); c.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2f8f4a'; c.beginPath(); c.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1e6fb8'; c.beginPath(); c.arc(s / 2, s * 0.55, s * 0.18, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f4d77a'; c.beginPath(); c.arc(s / 2, s * 0.4, s * 0.12, Math.PI, 0); c.fill();
    c.strokeStyle = '#f4d77a'; c.lineWidth = 4;
    for (const sx of [-1, 1]) { c.beginPath(); c.arc(s / 2 + sx * s * 0.02, s / 2, s * 0.3, sx < 0 ? Math.PI * 0.6 : -Math.PI * 0.4, sx < 0 ? Math.PI * 1.4 : Math.PI * 0.4); c.stroke(); }
  }, false);
}

/** Tozalash havzasidagi suv (yashil-ko‘k, mayda to‘lqin). */
export function basinWaterTexture(): THREE.Texture {
  return canvasTex('civic:basin', 128, (c, s) => {
    c.fillStyle = '#7fc3c6';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      c.strokeStyle = `rgba(255,255,255,${0.08 + (i % 4) * 0.04})`;
      c.lineWidth = 2;
      c.beginPath(); c.arc(s / 2, s / 2, 4 + i * 1.6, 0, Math.PI * 2); c.stroke();
    }
  });
}
