// «Biznes» bo‘limi brauzer sinovi: 18 obyektni haqiqiy menyu, sichqoncha va klaviatura bilan quradi.
// Ishga tushirish: npm run build && npm run test:biznes
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4322;
const URL = `http://localhost:${PORT}/?test=1&nodino&instant`;
const OUT = 'test-results/biznes';
mkdirSync(OUT, { recursive: true });
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const exe = process.env.CHROMIUM_PATH || (existsSync(MAC_CHROME) ? MAC_CHROME : undefined);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); } };
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(String(PORT)) && r()));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/GLTFLoader/.test(m.text())) errors.push(m.text()); });
const G = (fn, a) => page.evaluate(fn, a);
const frames = async (n = 2) => {
  const s = await G(() => window.__BOYOTA__.scene.frameCount);
  await page.waitForFunction(([s, n]) => window.__BOYOTA__.scene.frameCount >= s + n, [s, n], { timeout: 60000 });
};
const ov = () => G(() => window.__BOYOTA__.scene.overlayState());
async function hoverCell(x, z) {
  await G(([x, z]) => window.__BOYOTA__.scene.cam.set({ targetX: x - 20 + 0.5, targetZ: z - 20 + 0.5 + 3, azimuth: 0, polar: 1.1, distance: 26 }), [x, z]);
  await frames(2);
  const p = await G(([x, z]) => window.__BOYOTA__.scene.cellToClient(x, z), [x, z]);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await frames(2);
}
async function clickHere() {
  await page.mouse.down();
  await page.mouse.up();
  await frames(2);
}

try {
  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(4);
  await page.click('[data-testid="dastyor-ok"]');
  await G(() => { const g = window.__BOYOTA__.game; g.togglePause(); g.money = 300000; for (const o of g.list) if (o.type === 'daraxt' && o.gridX > 13) g.demolish(o.id); });
  const types = await G(() => window.__BOYOTA__.businessTypes);
  const cat = await G(() => Object.fromEntries(window.__BOYOTA__.businessTypes.map((t) => [t, window.__BOYOTA__.catalog[t]])));

  // ---------- menyu ----------
  await page.click('[data-testid="cat-biznes"]');
  const groups = ['qishloq', 'oziq', 'savdo', 'hunar', 'sanoat', 'qayta'];
  const seen = [];
  let cardsOk = true;
  for (const gr of groups) {
    await page.click(`[data-testid="group-${gr}"]`);
    const cards = await page.locator('.card').all();
    for (const c of cards) {
      const id = (await c.getAttribute('data-testid')).replace('card-', '');
      seen.push(id);
      const text = await c.innerText();
      const e = cat[id];
      if (!e || e.group !== gr || !text.includes(e.name) || !text.includes(`${e.width}×${e.depth}`) || !/\d/.test(text) || !text.includes(e.description.slice(0, 10))) cardsOk = false;
    }
  }
  await page.waitForTimeout(800);
  const brokenImgs = await G(() => [...document.querySelectorAll('.card img')].filter((i) => !(i.complete && i.naturalWidth > 0)).length);
  check('«Biznes» bo‘limida 6 guruh va barcha 18 obyekt', seen.length === 18 && new Set(seen).size === 18 && types.every((t) => seen.includes(t)), `${seen.length} ta karta`);
  check('Kartalarda nom, rasm, narx, maydon va vazifa', cardsOk && brokenImgs === 0, `buzuq rasm: ${brokenImgs}`);
  await page.screenshot({ path: `${OUT}/menyu.png` });

  // ---------- har birini qurish ----------
  const placed = [];
  for (const [i, t] of types.entries()) {
    const e = cat[t];
    const rot = i % 2; // yarmi 90° aylantirilgan
    const w = rot ? e.depth : e.width, d = rot ? e.width : e.depth;
    const spot = await G(([t, rot, w, d]) => {
      const g = window.__BOYOTA__.game;
      for (let z = 1; z < 39; z++) for (let x = 14; x < 39; x++) {
        if (!g.checkPlacement(t, x, z, rot).ok) continue;
        let free = true;
        for (let dz = -1; dz <= d && free; dz++) for (let dx = -1; dx <= w && free; dx++) if (g.occ.get(x + dx, z + dz)) free = false;
        if (free) return { x, z };
      }
      return null;
    }, [t, rot, w, d]);
    if (!spot) { check(`${e.name}: joy topildi`, false); continue; }
    if (!(await page.locator(`[data-testid="card-${t}"]`).isVisible())) await page.click(`[data-testid="group-${e.group}"]`);
    await page.click(`[data-testid="card-${t}"]`);
    await G(() => { window.__BOYOTA__.game.buildRotation = 0; });
    for (let k = 0; k < rot; k++) await page.keyboard.press('r');
    await hoverCell(spot.x + Math.floor((w - 1) / 2), spot.z + Math.floor((d - 1) / 2));
    const o1 = await ov();
    const m0 = await G(() => window.__BOYOTA__.game.money);
    await clickHere();
    const res = await G(([x, z]) => { const g = window.__BOYOTA__.game; const o = g.objectAt(x, z); return { money: g.money, o: o ? { id: o.id, type: o.type, rotation: o.rotation, gridX: o.gridX, gridZ: o.gridZ } : null }; }, [spot.x, spot.z]);
    const ok = o1.ghostVisible && o1.footprintColor === '#3ddc84' && o1.pending?.gx === spot.x && o1.pending?.gz === spot.z && o1.footprintSize[0] === w && o1.footprintSize[1] === d
      && res.o?.type === t && res.o.rotation === rot && res.money === m0 - e.price;
    check(`${e.name}: hajmli preview (yashil), ${rot ? 'R bilan 90°, ' : ''}qurildi, −${e.price}`, ok, JSON.stringify({ ghost: o1.ghostVisible, color: o1.footprintColor, fp: o1.footprintSize, money: m0 - res.money }));
    if (res.o) placed.push({ ...res.o, w, d });
  }

  // ---------- band joy: qizil, qurilmaydi ----------
  const tgt = placed.find((p) => p.type === 'chorsu') ?? placed[0];
  await page.click('[data-testid="group-oziq"]');
  await page.click('[data-testid="card-bon"]');
  await G(() => { window.__BOYOTA__.game.buildRotation = 0; });
  await hoverCell(tgt.gridX + 1, tgt.gridZ + 1);
  const red = await ov();
  const n0 = await G(() => [window.__BOYOTA__.game.objects.size, window.__BOYOTA__.game.money]);
  await clickHere();
  const n1 = await G(() => [window.__BOYOTA__.game.objects.size, window.__BOYOTA__.game.money]);
  check('Band joyda preview qizil, bosilganda qurilmaydi, pul yechilmaydi', red.footprintColor === '#ff4d4d' && n0[0] === n1[0] && n0[1] === n1[1], red.footprintColor);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.move(640, 300);

  // ---------- tanlash va ma’lumot paneli ----------
  const k = placed.find((p) => p.type === 'korzinka');
  await hoverCell(k.gridX + 1, k.gridZ + 1);
  await clickHere();
  const info = await page.locator('[data-testid="info-panel"]').innerText().catch(() => '');
  check('Bosilganda ma’lumot paneli: nom, guruh, holat va sabab', /Korzinka/.test(info) && /Savdo/.test(info) && /Yo‘l/.test(info) && /Nega|Muammo/.test(info), info.split('\n').slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/malumot-paneli.png` });
  await page.click('[data-testid="info-close"]');

  // ---------- refresh: tur, joy, burilish ----------
  await page.click('[data-testid="settings"]');
  await page.click('[data-testid="save-now"]');
  await page.keyboard.press('Escape');
  const snap = await G(() => [...window.__BOYOTA__.game.objects.values()].map((o) => `${o.id}:${o.type}:${o.gridX}:${o.gridZ}:${o.rotation}`).sort().join('|'));
  const money = await G(() => window.__BOYOTA__.game.money);
  await page.reload();
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(4);
  const snap2 = await G(() => [...window.__BOYOTA__.game.objects.values()].map((o) => `${o.id}:${o.type}:${o.gridX}:${o.gridZ}:${o.rotation}`).sort().join('|'));
  const money2 = await G(() => window.__BOYOTA__.game.money);
  check('Refresh: 18 bino turi, joyi va burilishi tiklandi, pul o‘zgarmadi', snap === snap2 && money === money2 && placed.every((p) => snap2.includes(`${p.id}:${p.type}:${p.gridX}:${p.gridZ}:${p.rotation}`)), `${placed.length} ta`);

  // ---------- buzish ----------
  await G(() => { const g = window.__BOYOTA__.game; if (!g.paused) g.togglePause(); });
  const v = placed.find((p) => p.type === 'safia');
  await page.click('[data-testid="cat-buzish"]');
  const m3 = await G(() => window.__BOYOTA__.game.money);
  await hoverCell(v.gridX + 1, v.gridZ + 1);
  await clickHere();
  const gone = await G(([x, z]) => !window.__BOYOTA__.game.objectAt(x, z), [v.gridX + 1, v.gridZ + 1]);
  check('Buzish vositasi bilan buzildi, narx qaytarilmadi', gone && (await G(() => window.__BOYOTA__.game.money)) === m3);
  await page.keyboard.press('Escape');

  // ---------- umumiy ko‘rinish: bir necha rakurs ----------
  await G(() => { const g = window.__BOYOTA__.game; g.select(null); });
  for (const [i, az] of [0.6, 2.2, 3.7, 5.3].entries()) {
    await G((az) => window.__BOYOTA__.scene.cam.set({ targetX: 6.5, targetZ: 1, azimuth: az, polar: 0.62, distance: 30 }), az);
    await frames(3);
    await page.screenshot({ path: `${OUT}/tuman-${i + 1}.png` });
  }
  check('Sahifa xatolari yo‘q', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Sinov skripti xatosi', false, String(e?.stack || e));
  await page.screenshot({ path: `${OUT}/xato.png` }).catch(() => {});
} finally {
  await browser.close();
  stop();
  const passed = results.filter((r) => r.ok).length, failed = results.length - passed;
  writeFileSync(`${OUT}/natijalar.json`, JSON.stringify({ passed, failed, results }, null, 2));
  console.log(`\nJami: ${passed} o‘tdi, ${failed} xato`);
  process.exit(failed ? 1 : 0);
}
