/** .env ni o'qish (qiymatlar konsolga chiqarilmaydi) */
import { readFileSync, existsSync } from 'fs';
export function loadEnv(path = new URL('../.env', import.meta.url)) {
  const out = { ...process.env };
  if (existsSync(path)) for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trimStart().startsWith('#') && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
