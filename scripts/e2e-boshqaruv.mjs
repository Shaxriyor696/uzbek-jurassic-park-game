// Boshqaruv va shahar xizmatlari brauzer sinovi: 7 binoni haqiqiy menyu va sichqoncha bilan quradi; hokimlik murojaatlari,
// moliya hisoboti, bank jamg‘armasi, ogohlantirish qoidasi, saqlash va buzishni tekshiradi.
// Ishga tushirish: npm run build && npm run test:boshqaruv
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4325;
const URL = `http://localhost:${PORT}/?test=1&nodino&instant`;
const OUT = 'test-results/boshqaruv';
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
  await G(() => { const g = window.__BOYOTA__.game; g.togglePause(); g.money = 400000; for (const o of g.list) if (o.type === 'daraxt' && o.gridX > 13) g.demolish(o.id); });
  const TYPES = ['hokimlik', 'moliya', 'soliq', 'milliy_bank', 'ekologiya', 'suv_tozalash', 'xavfsizlik'];
  const cat = await G((T) => Object.fromEntries(T.map((t) => [t, window.__BOYOTA__.catalog[t]])), TYPES);
  const openCat = async (c) => { if (!(await page.locator('[data-testid="card-tray"]').isVisible().catch(() => false)) || !(await page.locator(`[data-testid="card-${c === 'suv' ? 'suv_tozalash' : c === 'boshqaruv' ? 'hokimlik' : 'ekologiya'}"]`).isVisible().catch(() => false))) await page.click(`[data-testid="cat-${c}"]`); };

  // ---------- menyu ----------
  const seen = {};
  let cardsOk = true;
  for (const c of ['boshqaruv', 'shahar_xizmat', 'suv']) {
    await page.click(`[data-testid="cat-${c}"]`);
    await page.waitForTimeout(400);
    seen[c] = [];
    for (const el of await page.locator('.card').all()) {
      const id = (await el.getAttribute('data-testid')).replace('card-', '');
      seen[c].push(id);
      if (!TYPES.includes(id)) continue;
      const t = await el.innerText();
      const e = cat[id];
      if (!t.includes(e.name) || !t.includes(`${e.width}×${e.depth}`) || !t.includes(`−${e.upkeep}/davr`)) cardsOk = false;
    }
    if (c === 'boshqaruv') await page.screenshot({ path: `${OUT}/menyu-boshqaruv.png` });
    await page.click(`[data-testid="cat-${c}"]`);
  }
  const broken = await G(() => [...document.querySelectorAll('.card img')].filter((i) => !(i.complete && i.naturalWidth > 0)).length);
  check('Menyu: «Boshqaruv va moliya» 4 ta, «Shahar xizmatlari» 2 ta, «Suv»da tozalash inshooti',
    JSON.stringify(seen.boshqaruv) === JSON.stringify(['hokimlik', 'moliya', 'soliq', 'milliy_bank']) && JSON.stringify(seen.shahar_xizmat) === JSON.stringify(['ekologiya', 'xavfsizlik']) && seen.suv.includes('suv_tozalash') && seen.suv.includes('suv'),
    JSON.stringify(seen));
  check('Kartalarda nom, rasm, vazifa, narx, xarajat, maydon', cardsOk && broken === 0, `buzuq rasm: ${broken}`);

  // ---------- xizmatli hudud ----------
  await G(() => {
    const g = window.__BOYOTA__.game;
    const path = [];
    for (let x = 14; x <= 34; x++) path.push({ x, z: 16 });
    g.buildRoad(path);
    g.placeBuilding('elektr', 15, 13, 0); g.placeBuilding('suv', 19, 13, 0);
    g.placeBuilding('elektr', 27, 13, 0); g.placeBuilding('suv', 31, 13, 0);
  });

  // ---------- hokimlik (sichqoncha) ----------
  await page.click('[data-testid="cat-boshqaruv"]');
  const h = await placeViaMouse('hokimlik', 16, 17, 0, 4, 4);
  check('Hokimlik: preview yashil, qurildi, −8 000 bir marta', h.ov.footprintColor === '#3ddc84' && h.o?.type === 'hokimlik' && h.money === h.m0 - cat.hokimlik.price, JSON.stringify({ c: h.ov.footprintColor, d: h.money - h.m0 }));
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.mouse.move(640, 300);
  await hoverCell(17, 18); await clickHere();
  let info = await page.locator('[data-testid="info-panel"]').innerText().catch(() => '');
  const nAppeals = await page.locator('[data-testid="appeals"] .appeal').count();
  check('Hokimlik paneli: Faol, shahar holati, murojaatlar (muammo, joy, yechim)', /Shahar hokimligi/.test(info) && /Faol/.test(info) && /Shahar holati/.test(info) && /murojaatlari/.test(info) && nAppeals > 0 && /Yechim:/.test(info), `${nAppeals} ta murojaat`);
  await page.screenshot({ path: `${OUT}/hokimlik-paneli.png` });
  const cam0 = await G(() => ({ ...window.__BOYOTA__.scene.cam.state }));
  await page.locator('[data-testid="appeals"] .appeal').first().click();
  await frames(2);
  const cam1 = await G(() => ({ ...window.__BOYOTA__.scene.cam.state }));
  check('Murojaat bosilganda kamera tegishli joyga o‘tadi', cam0.targetX !== cam1.targetX || cam0.targetZ !== cam1.targetZ, JSON.stringify({ from: [cam0.targetX, cam0.targetZ], to: [cam1.targetX, cam1.targetZ] }));
  await page.click('[data-testid="info-close"]');

  // ---------- bank (sichqoncha) va jamg‘arma UI ----------
  await G(() => window.__BOYOTA__.scene.cam.set({ targetX: 3, targetZ: -1, azimuth: 0, polar: 1.1, distance: 26 }));
  await page.click('[data-testid="cat-boshqaruv"]').catch(() => {});
  if (!(await page.locator('[data-testid="card-milliy_bank"]').isVisible())) await page.click('[data-testid="cat-boshqaruv"]');
  const bk = await placeViaMouse('milliy_bank', 21, 17, 1, 5, 5);
  check('Milliy bank: R bilan 90°, qurildi, −12 000 bir marta', bk.o?.rotation === 1 && bk.money === bk.m0 - cat.milliy_bank.price, JSON.stringify({ rot: bk.o?.rotation, d: bk.money - bk.m0 }));
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.mouse.move(640, 300);
  await hoverCell(23, 19); await clickHere();
  await page.fill('[data-testid="goal-name"]', 'Yangi bog‘');
  await page.fill('[data-testid="goal-target"]', '5000');
  await page.click('[data-testid="goal-create"]');
  const gid = await G(() => window.__BOYOTA__.game.civic.goals[0]?.id);
  const tot0 = await G(() => window.__BOYOTA__.game.money + window.__BOYOTA__.game.savingsTotal);
  await page.fill(`[data-testid="goal-amount-${gid}"]`, '2000');
  await page.click(`[data-testid="goal-deposit-${gid}"]`);
  const b1 = await G(() => ({ money: window.__BOYOTA__.game.money, saved: window.__BOYOTA__.game.savingsTotal }));
  await page.fill(`[data-testid="goal-amount-${gid}"]`, '500');
  await page.click(`[data-testid="goal-withdraw-${gid}"]`);
  const b2 = await G(() => ({ money: window.__BOYOTA__.game.money, saved: window.__BOYOTA__.game.savingsTotal }));
  check('Bank: maqsad ochildi, 2000 o‘tkazildi, 500 qaytarildi; jami pul o‘zgarmadi (yaratilmadi)', !!gid && b1.saved === 2000 && b2.saved === 1500 && b1.money + b1.saved === tot0 && b2.money + b2.saved === tot0, JSON.stringify({ b1, b2, tot0 }));
  await page.screenshot({ path: `${OUT}/bank-paneli.png` });
  await page.click('[data-testid="info-close"]');

  // ---------- moliya (API bilan qurib, panel) ----------
  await G(() => window.__BOYOTA__.game.placeBuilding('moliya', 27, 17, 0));
  await hoverCell(29, 18); await clickHere();
  info = await page.locator('[data-testid="info-panel"]').innerText().catch(() => '');
  const net = await G(() => window.__BOYOTA__.game.budget.net);
  const netTxt = await page.locator('[data-testid="moliya-net"]').innerText().catch(() => '');
  check('Moliya paneli: doimiy va qurilish xarajatlari alohida, sof natija budjet bilan bir xil, prognoz', /Qurilish xarajati/.test(info) && /Prognoz/.test(info) && netTxt.replace(/[^\d−-]/g, '').replace('−', '-') === String(net), `${netTxt} vs ${net}`);
  await page.screenshot({ path: `${OUT}/moliya-paneli.png` });
  await page.click('[data-testid="info-close"]');

  // ---------- qolgan binolar (sichqoncha, yarmi aylantirilgan) ----------
  const placed = [h.o, bk.o].filter(Boolean);
  for (const [i, t] of ['soliq', 'ekologiya', 'suv_tozalash', 'xavfsizlik'].entries()) {
    const e = cat[t];
    const rot = i % 2;
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
    const c = t === 'suv_tozalash' ? 'suv' : t === 'soliq' ? 'boshqaruv' : 'shahar_xizmat';
    if (!(await page.locator(`[data-testid="card-${t}"]`).isVisible().catch(() => false))) await page.click(`[data-testid="cat-${c}"]`);
    const r = await placeViaMouse(t, spot.x, spot.z, rot, w, d);
    check(`${e.name}: preview yashil, ${rot ? 'R bilan 90° (footprint ' + w + '×' + d + '), ' : ''}qurildi, −${e.price}`,
      r.ov.footprintColor === '#3ddc84' && r.ov.footprintSize[0] === w && r.ov.footprintSize[1] === d && r.o?.type === t && r.o.rotation === rot && r.money === r.m0 - e.price,
      JSON.stringify({ fp: r.ov.footprintSize, d: r.money - r.m0 }));
    if (r.o) placed.push(r.o);
  }

  // ---------- mablag‘ yetmasa / Esc / band joy ----------
  await G(() => { window.__BOYOTA__.game.money = 1000; });
  if (!(await page.locator('[data-testid="card-xavfsizlik"]').isVisible().catch(() => false))) await page.click('[data-testid="cat-shahar_xizmat"]');
  await page.click('[data-testid="card-xavfsizlik"]');
  await G(() => { window.__BOYOTA__.game.buildRotation = 0; });
  await hoverCell(36, 36);
  const poor = await ov();
  const n0 = await G(() => window.__BOYOTA__.game.objects.size);
  await clickHere();
  check('Mablag‘ yetmasa: qizil, qurilmaydi, pul o‘zgarmaydi', poor.footprintColor === '#ff4d4d' && (await G(() => window.__BOYOTA__.game.objects.size)) === n0 && (await G(() => window.__BOYOTA__.game.money)) === 1000, poor.footprintColor);
  await page.keyboard.press('Escape');
  check('Esc — bekor qilindi', (await G(() => window.__BOYOTA__.game.tool)) === 'select');
  await G(() => { window.__BOYOTA__.game.money = 400000; });
  await page.keyboard.press('Escape'); await page.mouse.move(640, 300);
  if (!(await page.locator('[data-testid="card-xavfsizlik"]').isVisible().catch(() => false))) await page.click('[data-testid="cat-shahar_xizmat"]');
  await page.click('[data-testid="card-xavfsizlik"]');
  await hoverCell(17, 18);
  const red = await ov();
  const k0 = await G(() => window.__BOYOTA__.game.objects.size);
  await clickHere();
  check('Band joyda qizil, qurilmaydi', red.footprintColor === '#ff4d4d' && (await G(() => window.__BOYOTA__.game.objects.size)) === k0, red.footprintColor);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.mouse.move(640, 300);

  // ---------- ogohlantirish qoidasi (yo‘riqnoma o‘tkazilgach) ----------
  const inc = await G(async () => {
    const g = window.__BOYOTA__.game;
    g.skipTutorial();
    return { untreated: g.sewage.untreated, enabled: g.ruleEnabled };
  });
  await G(() => { const g = window.__BOYOTA__.game; if (g.paused) g.togglePause(); });
  const tc = await G(() => window.__BOYOTA__.game.tickCount);
  await page.waitForFunction((tc) => window.__BOYOTA__.game.tickCount >= tc + 1, tc, { timeout: 240000 });
  await G(() => { const g = window.__BOYOTA__.game; if (!g.paused) g.togglePause(); });
  await frames(2);
  const st = await G(() => { const g = window.__BOYOTA__.game; return { inc: g.civic.incident, untreated: g.sewage.untreated, tick: g.tickCount }; });
  const warnTxt = await page.locator('[data-testid="rule-warning"]').first().innerText().catch(() => '');
  if (st.untreated >= 40) {
    check('Tozalanmagan oqova ≥ 40 — ogohlantirish ochildi, muddat va yechim ko‘rsatildi (jarima hali yo‘q)', !!st.inc && !st.inc.penalized && st.inc.deadlineTick - st.inc.openedTick === 30 && /davr qoldi/.test(warnTxt) && /tozalash inshooti/.test(warnTxt), JSON.stringify({ st, warnTxt }));
  } else {
    check('Oqova tozalanmoqda — ogohlantirish yo‘q', !st.inc, JSON.stringify(st));
  }
  await page.screenshot({ path: `${OUT}/ogohlantirish.png` });

  // ---------- refresh ----------
  await page.click('[data-testid="settings"]');
  await page.click('[data-testid="save-now"]');
  await page.keyboard.press('Escape');
  const snap = await G(() => { const g = window.__BOYOTA__.game; return JSON.stringify({ o: [...g.objects.values()].map((o) => `${o.id}:${o.type}:${o.gridX}:${o.gridZ}:${o.rotation}`).sort(), goals: g.civic.goals, inc: g.civic.incident, money: g.money }); });
  await page.reload();
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(4);
  const snap2 = await G(() => { const g = window.__BOYOTA__.game; return JSON.stringify({ o: [...g.objects.values()].map((o) => `${o.id}:${o.type}:${o.gridX}:${o.gridZ}:${o.rotation}`).sort(), goals: g.civic.goals, inc: g.civic.incident, money: g.money }); });
  check('Refresh: 7 bino (tur, joy, burilish), jamg‘arma, ogohlantirish va pul tiklandi', snap === snap2 && placed.every((p) => snap2.includes(`${p.id}:${p.type}:${p.gridX}:${p.gridZ}:${p.rotation}`)), `${placed.length} ta`);

  // ---------- buzish: oqibat oldindan, keyin buziladi ----------
  await G(() => { const g = window.__BOYOTA__.game; if (!g.paused) g.togglePause(); });
  await page.click('[data-testid="cat-buzish"]');
  await hoverCell(28, 14);
  const hint = await page.locator('[data-testid="hover-hint"]').innerText().catch(() => '');
  check('Buzish vositasida stansiya ustida: oqibat oldindan aytiladi (binolar elektrsiz qoladi)', /buzish/.test(hint) && /diqqat:.*elektrsiz/.test(hint), hint);
  const v = placed.find((p) => p.type === 'xavfsizlik') ?? placed[placed.length - 1];
  const m3 = await G(() => window.__BOYOTA__.game.money);
  await hoverCell(v.gridX + 1, v.gridZ + 1);
  await clickHere();
  check('Buzish: bino olib tashlandi, narx qaytarilmadi', (await G(([x, z]) => !window.__BOYOTA__.game.objectAt(x, z), [v.gridX + 1, v.gridZ + 1])) && (await G(() => window.__BOYOTA__.game.money)) === m3);
  await page.keyboard.press('Escape');

  // ---------- umumiy ko‘rinish ----------
  await G(() => window.__BOYOTA__.game.select(null));
  for (const [i, az] of [0.6, 2.2, 3.7, 5.3].entries()) {
    await G((az) => window.__BOYOTA__.scene.cam.set({ targetX: 6, targetZ: -1, azimuth: az, polar: 0.62, distance: 32 }), az);
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
