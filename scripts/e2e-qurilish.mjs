// Bosqichma-bosqich qurilish brauzer sinovi: joylashtirish (sichqoncha), bir martalik to‘lov, qurilish maydoni va kran,
// panel (foiz, bosqich, qolgan vaqt), pauza, o‘rtada refresh, real vaqtda to‘liq tugash, bekor qilish, suratlar.
// Ishga tushirish: npm run build && npm run test:qurilish
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4327;
const URL = `http://localhost:${PORT}/?test=1&nodino`;
const OUT = 'test-results/qurilish';
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


const placeViaMouse = async (t, x, z, rot, w, d) => {
  await page.click(`[data-testid="card-${t}"]`);
  await G(() => { window.__BOYOTA__.game.buildRotation = 0; });
  for (let k = 0; k < rot; k++) await page.keyboard.press('r');
  await hoverCell(x + Math.floor((w - 1) / 2), z + Math.floor((d - 1) / 2));
  const o = await ov();
  const m0 = await G(() => window.__BOYOTA__.game.money);
  await clickHere();
  const res = await G(([x, z]) => { const g = window.__BOYOTA__.game; const o = g.objectAt(x, z); return { money: g.money, o: o ? { id: o.id, type: o.type, rotation: o.rotation, gridX: o.gridX, gridZ: o.gridZ } : null }; }, [x, z]);
  return { ov: o, m0, ...res };
};

const sites = () => G(() => { let n = 0; window.__BOYOTA__.scene.objectsRoot.traverse((o) => { if (o.userData.site) n++; }); return n; });
try {
  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(3);
  await page.click('[data-testid="dastyor-ok"]');
  await G(() => { const g = window.__BOYOTA__.game; g.togglePause(); g.money = 300000; for (const o of g.list) if (o.type === 'daraxt' && o.gridX > 13) g.demolish(o.id); });
  await G(() => {
    const g = window.__BOYOTA__.game;
    const path = []; for (let x = 14; x <= 34; x++) path.push({ x, z: 16 });
    g.buildRoad(path);
    g.placeBuilding('elektr', 15, 12, 0); g.placeBuilding('suv', 19, 12, 0);
  });
  check('Yo‘l darhol tayyor (qurilmaydi); stansiyalar qurilmoqda', await G(() => { const g = window.__BOYOTA__.game; return g.objectAt(20, 16)?.build === undefined && !!g.objectAt(15, 12)?.build && !!g.objectAt(19, 12)?.build; }));

  // ---------- uy: sichqoncha bilan ----------
  await page.click('[data-testid="cat-uylar"]');
  const h = await placeViaMouse('uy_b', 16, 17, 0, 2, 2);
  const hp = await G(() => window.__BOYOTA__.catalog.uy_b.price);
  check('Uy: preview yashil, joylashtirildi, pul bir marta yechildi, qurilish boshlandi', h.ov.footprintColor === '#3ddc84' && h.money === h.m0 - hp && (await G((id) => !!window.__BOYOTA__.game.objects.get(id).build, h.o.id)), JSON.stringify({ d: h.money - h.m0 }));
  const dast = await G(() => window.__BOYOTA__.game.dastyorMessage);
  check('Dastyor birinchi qurilishda tushuntiradi', /poydevordan/.test(dast ?? ''), dast);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.mouse.move(640, 300);

  // ---------- universitet: kran ----------
  await G(() => window.__BOYOTA__.game.placeBuilding('milliy_universitet', 22, 18, 0));
  await frames(2);
  check('Bir nechta parallel qurilish maydoni (4 ta: 2 stansiya, uy, universitet)', (await sites()) === 4, String(await sites()));
  const cr = await G(() => { let c = null; window.__BOYOTA__.scene.objectsRoot.traverse((o) => { if (o.userData.site?.crane) c = o.userData.site; }); let small = 0; window.__BOYOTA__.scene.objectsRoot.traverse((o) => { if (o.userData.site && !o.userData.site.crane) small++; }); return { has: !!c, small }; });
  check('Katta binoda minora krani bor, kichik uyda yo‘q', cr.has && cr.small >= 1, JSON.stringify(cr));

  // panel
  await G(() => { const g = window.__BOYOTA__.game; const o = g.objectAt(16, 17); o.build.elapsed = 18; g.select(o.id); });
  await frames(2);
  const info = await page.locator('[data-testid="info-panel"]').innerText().catch(() => '');
  check('Panel: nom, «Qurilmoqda — 60%», bosqich «devor va pardoz», «12 o‘yin soniyasi qoldi», bekor qilish va qaytariladigan summa', /Uy B/.test(info) && /Qurilmoqda — 60%/.test(info) && /devor va pardoz/.test(info) && /12 o‘yin soniyasi qoldi/.test(info) && /0 qaytariladi/.test(info), info.replace(/\n/g, ' | ').slice(0, 260));
  await page.screenshot({ path: `${OUT}/panel.png` });
  await G(() => window.__BOYOTA__.game.select(null));

  // ---------- kran harakati va pauza ----------
  const cranePos = () => G(() => { let p = null; window.__BOYOTA__.scene.objectsRoot.traverse((o) => { const s = o.userData.site; if (s?.crane) { const v = s.crane.hook.position; p = [v.x, v.y, s.crane.slew.rotation.y, s.crane.load.visible]; } }); return p; });
  const uni = await G(() => window.__BOYOTA__.game.objectAt(22, 18).id);
  const samples = [];
  for (const t of [6.3, 6.9, 7.4, 8.4, 9.0, 9.4, 10.1]) { await G(([id, t]) => { window.__BOYOTA__.game.objects.get(id).build.elapsed = t; }, [uni, t]); await frames(1); samples.push(await cranePos()); }
  const moved = new Set(samples.map((s) => s.map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join())).size;
  check('Kran: ilgak tushadi, yuk ulanadi, ko‘tariladi, strela buriladi, tushiradi va bo‘shatadi', moved >= 5 && samples.some((s) => s[3]) && samples.some((s) => !s[3]), JSON.stringify(samples.map((s) => s.map((v) => (typeof v === 'number' ? +v.toFixed(2) : v)))));
  // pauza (o‘yin pauzada) — real vaqtda o‘zgarmaydi
  const e0 = await G((id) => window.__BOYOTA__.game.objects.get(id).build.elapsed, uni);
  await page.waitForTimeout(1500);
  check('Pauzada qurilish to‘xtaydi', (await G((id) => window.__BOYOTA__.game.objects.get(id).build.elapsed, uni)) === e0);

  // ---------- suratlar: bosqichlar ----------
  await page.addStyleTag({ content: '[data-ui] { visibility: hidden !important; }' });
  for (const [i, t] of [2, 5, 10, 15, 21, 25, 28.7].entries()) {
    await G(([id, t]) => { window.__BOYOTA__.game.objects.get(id).build.elapsed = t; }, [uni, t]);
    await G((i) => window.__BOYOTA__.scene.cam.set({ targetX: 4.5, targetZ: 0.5, azimuth: 0.6 + i * 0.5, polar: 0.85, distance: 10 }), i);
    await frames(3);
    await page.screenshot({ path: `${OUT}/bosqich-${i + 1}-${String(t).replace('.', '_')}s.png`, timeout: 120000 });
  }
  await page.addStyleTag({ content: '[data-ui] { visibility: visible !important; }' });

  // ---------- o‘rtada refresh ----------
  await G(([id]) => { const g = window.__BOYOTA__.game; g.objects.get(id).build.elapsed = 12; g.objectAt(16, 17).build.elapsed = 9; }, [uni]);
  await page.click('[data-testid="settings"]');
  await page.click('[data-testid="save-now"]');
  await page.keyboard.press('Escape');
  const before = await G(() => { const g = window.__BOYOTA__.game; return { money: g.money, n: g.objects.size, b: g.constructing.map((o) => `${o.id}:${o.build.elapsed.toFixed(2)}`).sort().join() }; });
  await page.reload();
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(3);
  const after = await G(() => { const g = window.__BOYOTA__.game; return { money: g.money, n: g.objects.size, b: g.constructing.map((o) => `${o.id}:${o.build.elapsed.toFixed(2)}`).sort().join() }; });
  // yangilangan sahifa pauzasiz ochiladi — hammasi bir xil (kichik) o‘yin vaqtiga oldinga siljigan bo‘lishi kerak
  const pairs = (x) => Object.fromEntries(x.split(',').map((v) => v.split(':')));
  const pb = pairs(before.b), pa = pairs(after.b);
  const deltas = Object.keys(pb).map((k) => +pa[k] - +pb[k]);
  const same = deltas.length === 4 && deltas.every((d) => Math.abs(d - deltas[0]) < 0.05 && d >= 0 && d < 5);
  check('Qurilish o‘rtasida refresh: shu joydan davom etadi, qayta to‘lov va ikkinchi bino/kran yo‘q', before.money === after.money && before.n === after.n && same && (await sites()) === 4, JSON.stringify({ before, after, sites: await sites() }));

  // ---------- bekor qilish ----------
  await G(() => window.__BOYOTA__.game.placeBuilding('dokon', 28, 17, 0));
  const shop = await G(() => window.__BOYOTA__.game.objectAt(28, 17).id);
  await G((id) => window.__BOYOTA__.game.select(id), shop);
  await frames(2);
  const m1 = await G(() => window.__BOYOTA__.game.money);
  await page.click('[data-testid="build-cancel"]');
  await frames(2);
  const cancelled = await G(() => ({ gone: !window.__BOYOTA__.game.objectAt(28, 17), money: window.__BOYOTA__.game.money, free: window.__BOYOTA__.game.checkPlacement('dokon', 28, 17, 0).ok }));
  check('Bekor qilish: maydon bo‘shaydi, vaqtinchalik qismlar olib tashlanadi, pul o‘zgarmaydi (qaytariladigan: 0)', cancelled.gone && cancelled.free && cancelled.money === m1 && (await sites()) === 4, JSON.stringify(cancelled));

  // ---------- real vaqtda to‘liq qurilish (o‘yin soati bilan) ----------
  await G(() => { const g = window.__BOYOTA__.game; for (const o of g.constructing) if (o.gridX !== 16) o.build.elapsed = 29.5; });
  const pop0 = await G(() => window.__BOYOTA__.game.population);
  const res0 = await G(() => window.__BOYOTA__.game.objectAt(16, 17).residents);
  const start = await G(() => { const g = window.__BOYOTA__.game; if (g.paused) g.togglePause(); return { sim: g.simTime, el: g.objectAt(16, 17).build.elapsed, real: performance.now() }; });
  await page.waitForFunction(() => !window.__BOYOTA__.game.objectAt(16, 17).build, null, { timeout: 300000 });
  const end = await G(() => { const g = window.__BOYOTA__.game; g.togglePause(); return { sim: g.simTime, real: performance.now() }; });
  const simUsed = end.sim - start.sim, realUsed = (end.real - start.real) / 1000;
  check('Uy o‘yin vaqtida aniq (30 − o‘tgan) soniyada tugadi', Math.abs(simUsed - (30 - start.el)) < 0.3, `o‘yin vaqti ${simUsed.toFixed(2)} s (kutilgan ${(30 - start.el).toFixed(2)}), real ${realUsed.toFixed(1)} s (dasturiy render FPS ga bog‘liq: kadr ≤ 0,25 s)`);
  const fin = await G(() => { const g = window.__BOYOTA__.game; const o = g.objectAt(16, 17); return { st: g.statuses.has(o.id), res: o.residents, sites: (() => { let n = 0; window.__BOYOTA__.scene.objectsRoot.traverse((x) => { if (x.userData.site) n++; }); return n; })(), built: g.constructing.length }; });
  check('Tugagach: bino tizimga qo‘shildi, maydon va kran olib tashlandi; tugaguncha aholi yo‘q edi', fin.st && fin.sites === 0 && fin.built === 0 && res0 === 0, JSON.stringify({ ...fin, res0, pop0 }));
  // tugash bir marta: keyingi davrlarda aholi faqat qoidaga ko‘ra (≤2 kishi/davr)
  await G(() => { const g = window.__BOYOTA__.game; const o = g.objectAt(16, 17); g.togglePause(); for (let i = 0; i < 1; i++) g.tick(); g.togglePause(); return o.residents; });
  const r1 = await G(() => window.__BOYOTA__.game.objectAt(16, 17).residents);
  check('Xizmat/aholi faqat tugagandan keyin va bir marta qo‘shiladi', r1 <= 2, `1 davrdan keyin ${r1} kishi`);
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
