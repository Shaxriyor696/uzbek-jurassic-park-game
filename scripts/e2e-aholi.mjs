// BoyOta — aholi, ta’minot va budjet uchun brauzer sinovi.
// Ishga tushirish: npm run build && npm run test:aholi
// Brauzer: CHROMIUM_PATH yoki tizimdagi Google Chrome (macOS).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4318;
const URL = `http://localhost:${PORT}/?test=1&nodino&instant`;
const OUT = 'test-results';
mkdirSync(OUT, { recursive: true });
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const exe = process.env.CHROMIUM_PATH || (existsSync(MAC_CHROME) ? MAC_CHROME : undefined);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
const stopServer = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); } };
await new Promise((res, rej) => {
  const t = setTimeout(() => { stopServer(); rej(new Error('preview server ishga tushmadi')); }, 20000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(); } });
});

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

const G = (fn, arg) => page.evaluate(fn, arg);
const state = () => G(() => {
  const g = window.__BOYOTA__.game;
  return { money: g.money, pop: g.population, tick: g.tickCount, objects: g.objects.size, net: g.budget.net, paused: g.paused, az: g.camera.azimuth, tool: g.tool, rot: g.buildRotation };
});
const house = (x, z) => G(([x, z]) => { const g = window.__BOYOTA__.game; const o = g.objectAt(x, z); return o ? { ...o, st: { ...g.statuses.get(o.id) }, f: g.houseForecast(o.id) } : null; }, [x, z]);
const text = (id) => page.locator(`[data-testid="${id}"]`).innerText();
const visible = (id) => page.locator(`[data-testid="${id}"]`).isVisible();
const num = (s) => Number(s.replace(/\s/g, '').replace('−', '-').replace(/[^\d+-].*$/, ''));
async function frames(n = 2) {
  const start = await G(() => window.__BOYOTA__.scene.frameCount);
  await page.waitForFunction(([s, n]) => window.__BOYOTA__.scene.frameCount >= s + n, [start, n], { timeout: 90000 });
}
async function waitTicks(n) {
  const t = (await state()).tick;
  await page.waitForFunction((t) => window.__BOYOTA__.game.tickCount >= t, t + n, { timeout: n * 45000 + 30000 });
  await frames(2);
}
async function focus(x, z) {
  await G(([x, z]) => window.__BOYOTA__.scene.cam.set({ targetX: x - 20 + 0.5, targetZ: z - 20 + 0.5, azimuth: 0, polar: 1.25, distance: 30 }), [x, z]);
  await frames(2);
}
async function clickCell(x, z) {
  await focus(x, z);
  const p = await G(([x, z]) => window.__BOYOTA__.scene.cellToClient(x, z), [x, z]);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await frames(2);
  await page.mouse.down();
  await page.mouse.up();
  await frames(2);
}
const road = (a, b) => G(([a, b]) => { const g = window.__BOYOTA__.game; const cells = []; for (let x = a; x <= b; x++) cells.push({ x, z: 16 }); return g.buildRoad(cells).ok; }, [a, b]);
const build = (t, x, z) => G(([t, x, z]) => window.__BOYOTA__.game.placeBuilding(t, x, z, 0).ok, [t, x, z]);
const boxes = () => G(() => {
  const out = {};
  for (const sel of ['.task-panel', '.supply-panel', '.dastyor-bubble', '.info-panel', '.budget-panel', '.camera-compass', '.toolbar', '.topbar', '.logo']) {
    const e = document.querySelector(sel);
    if (!e) continue;
    const r = e.getBoundingClientRect();
    if (r.width && r.height) out[sel] = { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
  }
  const tb = document.querySelector('.topbar');
  out.chips = [...tb.children].map((c) => { const r = c.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; });
  out.vw = innerWidth; out.vh = innerHeight;
  return out;
});
const hit = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;

try {
  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(6);

  // ---------- 1. boshlang‘ich holat ----------
  let s = await state();
  check('Boshlang‘ich aholi = boshlang‘ich uylardagi yashovchilar yig‘indisi', s.pop === 106 && (await text('population')).replace(/\s/g, '') === '106', `pop=${s.pop}`);
  check('Ta’minot paneli: 5 / 5 uy', (await text('supply-road')) === '5 / 5 uy' && (await text('supply-power')) === '5 / 5 uy' && (await text('supply-water')) === '5 / 5 uy');
  await page.screenshot({ path: `${OUT}/a1-boshlangich.png` });
  await page.click('[data-testid="dastyor-ok"]');
  check('Dastyor yopiladi, topshiriq paneli qoladi', !(await visible('dastyor')) && (await visible('task-panel')));

  // ---------- 2. sabab: stansiya radiusidan tashqaridagi uyga aholi kelmaydi ----------
  await road(14, 26);
  check('Uy qurildi (yo‘l yonida, boshlang‘ich stansiyalardan uzoqda)', await build('uy_a', 22, 17));
  let h = await house(22, 17);
  check('Yangi uy bo‘sh, yo‘l bor, elektr va suv yo‘q', h.residents === 0 && h.st.road && !h.st.power && !h.st.water, JSON.stringify(h.st));
  await frames(3);
  const ov = await G(() => window.__BOYOTA__.scene.overlayState());
  check('Xaritada binoga bitta ogohlantirish belgisi (2 ta muammo bo‘lsa ham)', ov.statusIcons === 1, `icons=${ov.statusIcons}`);
  await clickCell(22, 17);
  check('Uy paneli ochildi: nom, 0 / 8, bo‘sh joy 8', (await visible('info-panel')) && (await text('info-title')) === 'Uy A' && (await text('info-residents')) === '0 / 8' && (await text('info-vacant')) === '8');
  const why = await text('info-why');
  check('«Nega aholi kelmayapti?» sababi ko‘rinadi', /Nega aholi kelmayapti\?/.test(why) && /Elektr/.test(why) && /Suv/.test(why), why.replace(/\n/g, ' | '));
  check('Holat: «Aholi kelmayapti», «+N» prognozi ko‘rsatilmaydi', (await text('info-state')) === 'Aholi kelmayapti' && !(await visible('info-forecast')) && !/Keyingi davrda/.test(await text('info-panel')));
  const fit = await G(() => { const w = document.querySelector('[data-testid="info-why"]').getBoundingClientRect(); const p = document.querySelector('[data-testid="info-panel"]').getBoundingClientRect(); return { why: Math.round(w.bottom), panel: Math.round(p.bottom) }; });
  check('1280×720 da sabab bloki aylantirmasdan ko‘rinadi', fit.why <= fit.panel, JSON.stringify(fit));
  check('Dastyor maslahati shu holatdan', (await text('advice')).trim() === 'Bir uyga elektr yetishmayapti.', await text('advice'));
  check('Ta’minot paneli: elektr 5 / 6, suv 5 / 6', (await text('supply-road')) === '6 / 6 uy' && (await text('supply-power')) === '5 / 6 uy' && (await text('supply-water')) === '5 / 6 uy');
  await page.screenshot({ path: `${OUT}/a2-nega-kelmayapti.png` });
  await waitTicks(2);
  h = await house(22, 17);
  check('2 davrdan keyin ham bo‘sh (ta’minotsiz uyga hech kim kelmaydi)', h.residents === 0 && (await state()).pop === 106);

  // ---------- 3. tuzatish: stansiyalar → aholi asta ko‘chib keladi ----------
  check('Elektr va suv stansiyasi qurildi', (await build('elektr', 19, 13)) && (await build('suv', 23, 13)));
  await frames(3);
  h = await house(22, 17);
  check('Uy to‘liq ta’minlandi, belgi yo‘qoldi', h.st.power && h.st.water && (await G(() => window.__BOYOTA__.scene.overlayState())).statusIcons === 0);
  check('Panel: «Ko‘chib kelmoqda», «Keyingi davrda: +2 kishi»', (await text('info-state')) === 'Ko‘chib kelmoqda' && (await text('info-forecast')).trim() === 'Keyingi davrda: +2 kishi' && !(await visible('info-why')), await text('info-forecast'));
  const tk = (await state()).tick;
  await waitTicks(1);
  const after1 = (await state()).tick - tk;
  h = await house(22, 17);
  s = await state();
  check('1 davrdan keyin uyda 2 kishi, umumiy aholi 108', h.residents === 2 * after1 && s.pop === 106 + 2 * after1, `residents=${h.residents}, pop=${s.pop}, davr=${after1}`);
  await waitTicks(2);
  h = await house(22, 17);
  s = await state();
  check('Yana 2 davr: residents oshdi, HUD = panel = domen', h.residents >= 6 && s.pop === 106 + h.residents && (await text('info-residents')) === `${h.residents} / 8` && (await text('population')).replace(/\s/g, '') === String(s.pop), `residents=${h.residents}, pop=${s.pop}`);
  await page.screenshot({ path: `${OUT}/a3-kochib-kelmoqda.png` });
  await waitTicks(2);
  h = await house(22, 17);
  check('Sig‘imdan oshmaydi: 8 / 8, «To‘la»', h.residents === 8 && (await text('info-state')) === 'To‘la', `residents=${h.residents}`);

  // ---------- 4. uzilish: ogohlantirish, keyin ketish, tiklanish ----------
  const waterId = await G(() => window.__BOYOTA__.game.objectAt(23, 13).id);
  await G((id) => window.__BOYOTA__.game.demolish(id), waterId);
  await frames(3);
  check('Suv stansiyasi buzildi: panel va belgi darhol yangilandi', (await page.locator('[data-testid="info-water"]').getAttribute('data-ok')) === 'false' && (await text('info-state')) === 'Ogohlantirish' && (await G(() => window.__BOYOTA__.scene.overlayState())).statusIcons === 1, await text('info-forecast'));
  await waitTicks(3);
  h = await house(22, 17);
  check('3 davr ogohlantirish: hech kim ketmadi', h.residents === 8 && h.outageTicks === 3, `residents=${h.residents}, taymer=${h.outageTicks}`);
  check('Panel: «Aholi ketmoqda», «Keyingi davrda: −1 kishi»', (await text('info-state')) === 'Aholi ketmoqda' && (await text('info-forecast')).trim() === 'Keyingi davrda: −1 kishi', await text('info-forecast'));
  await waitTicks(1);
  h = await house(22, 17);
  check('4-davrda 1 kishi ketdi', h.residents === 7, `residents=${h.residents}`);
  await build('suv', 23, 13);
  await frames(3);
  h = await house(22, 17);
  check('Suv tiklandi: belgi yo‘q, yana «Ko‘chib kelmoqda +1»', h.st.water && (await text('info-forecast')).trim() === 'Keyingi davrda: +1 kishi' && (await G(() => window.__BOYOTA__.scene.overlayState())).statusIcons === 0, await text('info-forecast'));
  await waitTicks(1);
  h = await house(22, 17);
  check('Tiklangach taymer 0, uy yana to‘ldi', h.residents === 8 && h.outageTicks === 0);
  await page.click('[data-testid="info-close"]');
  check('Uy panelini yopish ishlaydi', !(await visible('info-panel')));

  // ---------- 5. budjet ----------
  await page.click('[data-testid="money"]');
  check('Mablag‘ belgisi bosilganda «Shahar budjeti» ochiladi', await visible('budget-panel'));
  const ids = ['houseTax', 'business', 'power', 'water', 'parks', 'services'];
  const vals = {};
  for (const id of ids) vals[id] = Number(await page.locator(`[data-testid="budget-${id}"]`).getAttribute('data-value'));
  const sum = ids.reduce((a, id) => a + vals[id], 0);
  const netPanel = Number(await page.locator('[data-testid="budget-net"]').getAttribute('data-value'));
  const hudNet = num(await text('hud-net'));
  s = await state();
  check('Budjet qatorlari yig‘indisi = sof natija', sum === netPanel, `${JSON.stringify(vals)} → ${sum} / ${netPanel}`);
  check('HUD, panel va domen bir xil sof natija', hudNet === netPanel && netPanel === s.net, `hud=${hudNet}, panel=${netPanel}, domen=${s.net}`);
  check('Uy solig‘i = 2 × aholi; balans = HUD mablag‘', vals.houseTax === s.pop * 2 && num(await text('budget-balance')) === s.money && num(await page.locator('[data-testid="money"] .chip-value').innerText()) === s.money, `soliq=${vals.houseTax}, pop=${s.pop}`);
  await page.screenshot({ path: `${OUT}/a4-budjet.png` });
  const m0 = s.money;
  await waitTicks(1);
  s = await state();
  check('Davr yakunida balans aynan ko‘rsatilgan sof natijaga o‘zgardi', s.money - m0 === netPanel, `Δ=${s.money - m0}, net=${netPanel}`);

  // ---------- 6. pauza ----------
  await page.click('[data-testid="pause"]');
  const p0 = await state();
  await page.waitForTimeout(12000);
  const p1 = await state();
  check('Pauzada 12 s: pul, aholi, davr o‘zgarmaydi', p0.paused && p0.money === p1.money && p0.pop === p1.pop && p0.tick === p1.tick);
  await page.mouse.move(640, 300);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(800, 300, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  check('Pauzada kamera va panel ishlaydi', Math.abs((await state()).az - p1.az) > 0.1 && (await visible('budget-panel')));

  // ---------- 7. UI bosishlari xaritaga o‘tmaydi ----------
  await G(() => window.__BOYOTA__.game.setTool('build', 'daraxt'));
  const u0 = await state();
  const bb = await page.locator('[data-testid="budget-panel"]').boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.move(bb.x + 40, bb.y + 60);
  await page.mouse.down();
  await page.mouse.move(bb.x + 140, bb.y + 160, { steps: 5 });
  await page.mouse.up();
  const sb = await page.locator('[data-testid="supply-panel"]').boundingBox();
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height - 12);
  await frames(2);
  const u1 = await state();
  check('Panel ustidagi bosish/sudrash qurmaydi va kamerani surmaydi', u1.objects === u0.objects && u1.money === u0.money && Math.abs(u1.az - u0.az) < 1e-9);
  await page.keyboard.press('Escape');
  await page.click('[data-testid="supply-toggle"]');
  check('Ta’minot paneli yig‘iladi', !(await visible('supply-road')));
  await page.click('[data-testid="supply-toggle"]');
  await page.click('[data-testid="budget-close"]');
  check('Budjet panelini yopish ishlaydi', !(await visible('budget-panel')));
  await page.click('[data-testid="pause"]');

  // ---------- 8. mavjud boshqaruv: qurish, aylantirish, buzish ----------
  await page.click('[data-testid="pause"]');
  await page.click('[data-testid="cat-uylar"]');
  await page.click('[data-testid="card-uy_c"]');
  await page.keyboard.press('r');
  const rot = (await state()).rot;
  const b0 = await state();
  await clickCell(28, 22);
  const placed = await G(() => { const o = window.__BOYOTA__.game.objectAt(28, 22); return o ? { type: o.type, rotation: o.rotation, residents: o.residents } : null; });
  check('Sichqoncha bilan qurish va R bilan aylantirish ishlaydi', placed && placed.type === 'uy_c' && rot === 1 && placed.rotation === 1 && placed.residents === 0 && (await state()).money === b0.money - 1200, JSON.stringify(placed));
  await page.keyboard.press('Escape');
  await page.click('[data-testid="cat-buzish"]');
  await clickCell(28, 22);
  check('Buzish ishlaydi', !(await G(() => window.__BOYOTA__.game.objectAt(28, 22))));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.click('[data-testid="pause"]');

  // ---------- 9. refresh ----------
  await page.click('[data-testid="pause"]');
  await page.click('[data-testid="settings"]');
  await page.click('[data-testid="save-now"]');
  await page.keyboard.press('Escape');
  const snap = await G(() => { const g = window.__BOYOTA__.game; return { money: g.money, pop: g.population, tick: g.tickCount, net: g.budget.net, objs: [...g.objects.values()].map((o) => `${o.id}:${o.residents}:${o.outageTicks}`).sort().join('|') }; });
  await page.reload();
  await page.waitForFunction(() => window.__BOYOTA__);
  await G(() => { const g = window.__BOYOTA__.game; if (!g.paused) g.togglePause(); });
  const snap2 = await G(() => { const g = window.__BOYOTA__.game; return { money: g.money, pop: g.population, tick: g.tickCount, net: g.budget.net, objs: [...g.objects.values()].map((o) => `${o.id}:${o.residents}:${o.outageTicks}`).sort().join('|') }; });
  check('Refresh: pul, aholi, davr, budjet va taymerlar aynan tiklandi', snap.money === snap2.money && snap.pop === snap2.pop && snap.tick === snap2.tick && snap.net === snap2.net && snap.objs === snap2.objs, `pul ${snap.money}/${snap2.money}, aholi ${snap.pop}/${snap2.pop}`);

  // ---------- 10. eski (1-sxema) saqlash ----------
  const oldRaw = await G(() => {
    // sahifadan chiqishdagi avtosaqlash eski faylni ustidan yozmasligi uchun
    window.__BOYOTA__.game.autosaveBlocked = true;
    const d = JSON.parse(localStorage.getItem('boyota.save.v1'));
    d.schemaVersion = 1;
    for (const o of d.placedObjects) delete o.outageTicks;
    const raw = JSON.stringify(d);
    localStorage.setItem('boyota.save.v1', raw);
    localStorage.removeItem('boyota.save.v1.backup-schema1');
    return raw;
  });
  await page.goto('about:blank');
  await page.goto(URL);
  await page.waitForFunction(() => window.__BOYOTA__);
  const mig = await G(() => { const g = window.__BOYOTA__.game; if (!g.paused) g.togglePause(); return { money: g.money, pop: g.population, n: g.objects.size, modal: g.modal, blocked: g.autosaveBlocked, backup: localStorage.getItem('boyota.save.v1.backup-schema1') }; });
  check('Eski save shaharni saqlagan holda yuklandi, asl nusxa alohida saqlandi', mig.modal === null && !mig.blocked && mig.backup === oldRaw && mig.money === snap.money && mig.pop === snap.pop, `pul ${mig.money}, aholi ${mig.pop}, obyekt ${mig.n}`);

  // ---------- 11. joylashuv: keng va tor oynalar ----------
  await G(() => { const g = window.__BOYOTA__.game; g.reopenDastyor(); });
  for (const [w, hgt] of [[1440, 900], [1280, 720], [1024, 640], [820, 620], [640, 700]]) {
    await page.setViewportSize({ width: w, height: hgt });
    await frames(3);
    for (const mode of ['dastyor', 'uy', 'budjet']) {
      await G((mode) => {
        const g = window.__BOYOTA__.game;
        g.setTool('select');
        if (mode === 'dastyor') { g.select(null); g.toggleBudget(false); }
        if (mode === 'uy') g.select(g.objectAt(22, 17).id);
        if (mode === 'budjet') g.toggleBudget(true);
      }, mode);
      await frames(2);
      const b = await boxes();
      const names = Object.keys(b).filter((k) => k.startsWith('.'));
      const overlaps = [];
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (hit(b[names[i]], b[names[j]])) overlaps.push(`${names[i]}×${names[j]}`);
      const outside = names.filter((k) => b[k].l < 0 || b[k].t < 0 || b[k].r > b.vw || b[k].b > b.vh);
      const chipsCut = b.chips.some((c) => c.l < 0 || c.r > b.vw) || (b['.logo'] && b.chips.some((c) => c.l < b['.logo'].r - 1));
      check(`Joylashuv ${w}×${hgt} (${mode}): ustma-ust yo‘q, ekrandan chiqmaydi, HUD kesilmagan`, !overlaps.length && !outside.length && !chipsCut, [overlaps.join(', '), outside.join(', '), chipsCut ? 'HUD kesilgan' : ''].filter(Boolean).join(' / '));
      await page.screenshot({ path: `${OUT}/layout-${w}x${hgt}-${mode}.png` });
    }
  }
  const tools = await G(() => [...document.querySelectorAll('.tool-btn')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
  check('640 px kenglikda barcha qurilish tugmalari ko‘rinadi', tools);

  check('Sahifa xatolari yo‘q', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('Sinov skripti xatosi', false, String(e?.stack || e));
  await page.screenshot({ path: `${OUT}/aholi-xato.png` }).catch(() => {});
} finally {
  await browser.close();
  stopServer();
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  writeFileSync(`${OUT}/aholi-natijalar.json`, JSON.stringify({ passed, failed, results }, null, 2));
  console.log(`\nJami: ${passed} o‘tdi, ${failed} xato`);
  process.exit(failed ? 1 : 0);
}
