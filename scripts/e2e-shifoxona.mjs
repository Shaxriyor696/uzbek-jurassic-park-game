// «Tibbiyot → Shifoxona» brauzer sinovi: haqiqiy menyu, sichqoncha va klaviatura bilan quradi; xizmat uzilishi,
// qamrov, bir nechta shifoxona, topshiriq mukofoti, saqlash, buzish va model suratlari.
// Ishga tushirish: npm run build && npm run test:shifoxona
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4324;
const URL = `http://localhost:${PORT}/?test=1&nodino&instant`;
const OUT = 'test-results/shifoxona';
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

try {
  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(4);
  await page.click('[data-testid="dastyor-ok"]');
  await G(() => { const g = window.__BOYOTA__.game; g.togglePause(); g.money = 300000; for (const o of g.list) if (o.type === 'daraxt' && o.gridX > 13) g.demolish(o.id); });
  const c = await G(() => window.__BOYOTA__.catalog.shifoxona);

  // ---------- menyu ----------
  await page.click('[data-testid="cat-tibbiyot"]');
  const cardTxt = await page.locator('[data-testid="card-shifoxona"]').innerText();
  // rasm yuklanishini kutamiz (dasturiy renderda sekin bo‘lishi mumkin)
  await page.waitForFunction(() => { const i = document.querySelector('[data-testid="card-shifoxona"] img'); return !!i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 }).catch(() => {});
  const img = await G(() => { const i = document.querySelector('[data-testid="card-shifoxona"] img'); return !!i && i.complete && i.naturalWidth > 0; });
  const cards = await page.locator('.card').count();
  check('«Tibbiyot» bo‘limida Shifoxona kartasi: nom, rasm, narx, xarajat, xizmat sig‘imi, maydon',
    cards === 1 && img && /Shifoxona/.test(cardTxt) && /4 000/.test(cardTxt) && /−50\/davr/.test(cardTxt) && /150 kishiga xizmat/.test(cardTxt) && /3×3 katak/.test(cardTxt), cardTxt.replace(/\n/g, ' | '));
  await page.screenshot({ path: `${OUT}/menyu.png` });

  // ---------- yo‘l + elektr + suv, shifoxona — sichqoncha bilan (R bilan 90°) ----------
  await G(() => {
    const g = window.__BOYOTA__.game;
    const path = [];
    for (let x = 14; x <= 26; x++) path.push({ x, z: 16 });
    g.buildRoad(path);
    g.placeBuilding('elektr', 15, 13, 0);
    g.placeBuilding('suv', 19, 13, 0);
  });
  const p1 = await placeViaMouse('shifoxona', 16, 17, 1, 3, 3);
  const st1 = await G((id) => { const g = window.__BOYOTA__.game; const h = g.health; return { active: h.perBuilding.get(id)?.active, cap: h.capacity, demand: h.demand, cov: h.coverage, task: g.healthTaskDone }; }, p1.o?.id);
  check('Preview yashil, R bilan 90°, qurildi; pul bir marta (−4 000) + topshiriq mukofoti (+2 000) bir marta',
    p1.ov.ghostVisible && p1.ov.footprintColor === '#3ddc84' && p1.o?.rotation === 1 && p1.money === p1.m0 - c.price + 2000 && st1.task,
    JSON.stringify({ color: p1.ov.footprintColor, rot: p1.o?.rotation, delta: p1.money - p1.m0 }));
  check('Yo‘l, elektr, suv bor — faol; xizmat sig‘imi 150, qamrov ≤ 100%', st1.active && st1.cap === 150 && st1.cov <= 100, JSON.stringify(st1));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.move(640, 300);
  const hosp = p1.o;

  // ma’lumot paneli
  await hoverCell(hosp.gridX + 1, hosp.gridZ + 1);
  await clickHere();
  let info = await page.locator('[data-testid="info-panel"]').innerText().catch(() => '');
  check('Ma’lumot paneli: nom, Faol, xizmat sig‘imi, qamrovga hissa, xarajat, yo‘l/elektr/suv',
    /Shifoxona/.test(info) && /Faol/.test(info) && /150 kishi/.test(info) && /Qamrovga hissasi/.test(info) && /Xarajat/.test(info) && /Elektr/.test(info) && /Suv/.test(info),
    info.replace(/\n/g, ' | ').slice(0, 240));
  await page.screenshot({ path: `${OUT}/malumot-faol.png` });

  // suv uzildi
  await G(() => { const g = window.__BOYOTA__.game; g.demolish(g.objectAt(19, 13).id); });
  await frames(2);
  info = await page.locator('[data-testid="info-panel"]').innerText().catch(() => '');
  const st2 = await G((id) => { const h = window.__BOYOTA__.game.health; return { active: h.perBuilding.get(id).active, cap: h.capacity, cov: h.coverage }; }, hosp.id);
  check('Suv uzilganda: To‘xtagan, «Suv ulanmagan — … suv tarmog‘iga ulang», sig‘im 0, qamrov 0%',
    !st2.active && st2.cap === 0 && st2.cov === 0 && /To‘xtagan/.test(info) && /Suv ulanmagan/.test(info) && /suv tarmog‘iga ulang/.test(info), info.replace(/\n/g, ' | ').slice(0, 260));
  await page.screenshot({ path: `${OUT}/malumot-toxtagan.png` });
  await G(() => window.__BOYOTA__.game.placeBuilding('suv', 19, 13, 0));
  await page.click('[data-testid="info-close"]');

  // tibbiyot paneli
  await page.click('[data-testid="health-toggle"]');
  const hp = await page.locator('[data-testid="health-panel"]').innerText();
  const sum = await G(() => { const s = window.__BOYOTA__.game.health; return { demand: s.demand, cap: s.capacity, cov: s.coverage }; });
  check('«Tibbiyot» paneli: talab, faol sig‘im, qamrov', hp.includes(`${sum.demand}`) && hp.includes(`${sum.cap}`) && hp.includes(`${sum.cov}%`), hp.replace(/\n/g, ' | '));
  await page.screenshot({ path: `${OUT}/tibbiyot-paneli.png` });
  await page.click('[data-testid="health-toggle"]');

  // ikkinchi shifoxona: hisob ikki marta sanalmaydi, mukofot takrorlanmaydi
  await page.click('[data-testid="cat-tibbiyot"]').catch(() => {});
  if (!(await page.locator('[data-testid="card-shifoxona"]').isVisible())) await page.click('[data-testid="cat-tibbiyot"]');
  const p2 = await placeViaMouse('shifoxona', 22, 13, 0, 3, 3);
  const st3 = await G(() => { const g = window.__BOYOTA__.game; const s = g.health; return { n: s.activeHospitals, cap: s.capacity, covered: s.covered, demand: s.demand, cov: s.coverage }; });
  check('Ikkinchi shifoxona: sig‘im 300, qamralgan = min(sig‘im, talab), qamrov ≤ 100%, mukofot yana berilmadi',
    st3.n === 2 && st3.cap === 300 && st3.covered === Math.min(300, st3.demand) && st3.cov <= 100 && p2.money === p2.m0 - c.price, JSON.stringify({ ...st3, delta: p2.money - p2.m0 }));

  // ---------- mablag‘ yetmasa ----------
  await G(() => { window.__BOYOTA__.game.money = 1000; });
  await page.click('[data-testid="card-shifoxona"]');
  await hoverCell(30, 25);
  const poorOv = await ov();
  const n0 = await G(() => window.__BOYOTA__.game.objects.size);
  await clickHere();
  const n1 = await G(() => [window.__BOYOTA__.game.objects.size, window.__BOYOTA__.game.money]);
  check('Mablag‘ yetmasa: preview qizil, qurilmaydi, pul o‘zgarmaydi', poorOv.footprintColor === '#ff4d4d' && n1[0] === n0 && n1[1] === 1000, poorOv.footprintColor);
  await page.keyboard.press('Escape');
  check('Esc — qurish bekor qilinadi', (await G(() => window.__BOYOTA__.game.tool)) === 'select');
  await G(() => { window.__BOYOTA__.game.money = 300000; });
  await page.keyboard.press('Escape');
  await page.mouse.move(640, 300);

  // ---------- band joy ----------
  await page.click('[data-testid="cat-tibbiyot"]').catch(() => {});
  if (!(await page.locator('[data-testid="card-shifoxona"]').isVisible())) await page.click('[data-testid="cat-tibbiyot"]');
  await page.click('[data-testid="card-shifoxona"]');
  await hoverCell(hosp.gridX + 1, hosp.gridZ + 1);
  const red = await ov();
  const k0 = await G(() => window.__BOYOTA__.game.objects.size);
  await clickHere();
  check('Band joyda preview qizil, qurilmaydi', red.footprintColor === '#ff4d4d' && (await G(() => window.__BOYOTA__.game.objects.size)) === k0, red.footprintColor);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.move(640, 300);

  // ---------- refresh ----------
  await page.click('[data-testid="settings"]');
  await page.click('[data-testid="save-now"]');
  await page.keyboard.press('Escape');
  const snap = await G(() => [...window.__BOYOTA__.game.objects.values()].map((o) => `${o.id}:${o.type}:${o.gridX}:${o.gridZ}:${o.rotation}`).sort().join('|'));
  const before = await G(() => { const g = window.__BOYOTA__.game; return { money: g.money, task: g.healthTaskDone, cap: g.health.capacity }; });
  await page.reload();
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(4);
  const snap2 = await G(() => [...window.__BOYOTA__.game.objects.values()].map((o) => `${o.id}:${o.type}:${o.gridX}:${o.gridZ}:${o.rotation}`).sort().join('|'));
  const after = await G(() => { const g = window.__BOYOTA__.game; return { money: g.money, task: g.healthTaskDone, cap: g.health.capacity }; });
  check('Refresh: shifoxonalar (tur, joy, burilish), holat va topshiriq tiklandi; mukofot takrorlanmadi',
    snap === snap2 && JSON.stringify(before) === JSON.stringify(after) && snap2.includes(`${hosp.id}:shifoxona:${hosp.gridX}:${hosp.gridZ}:1`), JSON.stringify(after));

  // ---------- xarajat o‘yin vaqtiga bog‘liq ----------
  const t0 = await G(() => { const g = window.__BOYOTA__.game; return { m: g.money, net: g.budget.net, tc: g.tickCount }; });
  await G(() => { const g = window.__BOYOTA__.game; if (g.paused) g.togglePause(); });
  await page.waitForFunction((tc) => window.__BOYOTA__.game.tickCount >= tc + 1, t0.tc, { timeout: 240000 });
  const t1 = await G(() => { const g = window.__BOYOTA__.game; g.togglePause(); return { m: g.money, tc: g.tickCount, last: g.lastReport.net }; });
  check('Xarajat hisob davrida olinadi (kadrga emas): pul o‘zgarishi = davrlar sof natijasi', t1.tc > t0.tc && (t1.tc - t0.tc === 1 ? t1.m === t0.m + t1.last : true), JSON.stringify({ t0, t1 }));

  // ---------- buzish ----------
  await page.click('[data-testid="cat-buzish"]');
  const m3 = await G(() => window.__BOYOTA__.game.money);
  await hoverCell(23, 14);
  await clickHere();
  const gone = await G(() => !window.__BOYOTA__.game.objectAt(23, 14));
  const cap = await G(() => window.__BOYOTA__.game.health.capacity);
  check('Buzish: bino olib tashlandi, narx qaytarilmadi, sig‘im 150 ga tushdi', gone && (await G(() => window.__BOYOTA__.game.money)) === m3 && cap === 150);
  await page.keyboard.press('Escape');

  // ---------- reference rakurslariga yaqin kamera ----------
  await G(() => window.__BOYOTA__.game.select(null));
  await page.addStyleTag({ content: '.ui-layer, .hover-hint { display: none !important; }' });
  const cx = hosp.gridX + 1.5 - 20, cz = hosp.gridZ + 1.5 - 20;
  // shifoxona R bilan 90° burilgan: old tomoni +X ga qaragan — rasmdagi rakurslar shunga nisbatan
  for (const [i, az] of [Math.PI / 2 + 0.6, Math.PI / 2 + 0.6 + Math.PI / 2, Math.PI / 2 + 0.6 + Math.PI, Math.PI / 2 + 0.6 + 1.5 * Math.PI].entries()) {
    await G(([cx, cz, az]) => window.__BOYOTA__.scene.cam.set({ targetX: cx, targetZ: cz, azimuth: az, polar: 0.85, distance: 6.5 }), [cx, cz, az]);
    await frames(3);
    await page.screenshot({ path: `${OUT}/rakurs-${i + 1}.png` });
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
