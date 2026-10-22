// «Ta’lim» bo‘limi brauzer sinovi: 6 binoni haqiqiy menyu, sichqoncha va klaviatura bilan quradi, xizmat uzilishi,
// ko‘rsatkichlar, topshiriq mukofoti, saqlash va buzishni tekshiradi.
// Ishga tushirish: npm run build && npm run test:talim
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4323;
const URL = `http://localhost:${PORT}/?test=1&nodino&instant`;
const OUT = 'test-results/talim';
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
  const types = await G(() => window.__BOYOTA__.educationTypes);
  const cat = await G(() => Object.fromEntries(window.__BOYOTA__.educationTypes.map((t) => [t, window.__BOYOTA__.catalog[t]])));

  // ---------- menyu ----------
  await page.click('[data-testid="cat-talim"]');
  const cards = await page.locator('.card').all();
  const seen = [];
  let cardsOk = true;
  for (const c of cards) {
    const id = (await c.getAttribute('data-testid')).replace('card-', '');
    seen.push(id);
    const text = await c.innerText();
    const e = cat[id];
    if (!e || !text.includes(e.name) || !text.includes(`${e.width}×${e.depth}`) || !/o‘rin/.test(text) || !text.includes(`−${e.upkeep}/davr`) || !/\d/.test(text)) cardsOk = false;
  }
  await page.waitForTimeout(800);
  const brokenImgs = await G(() => [...document.querySelectorAll('.card img')].filter((i) => !(i.complete && i.naturalWidth > 0)).length);
  check('«Ta’lim» bo‘limida 6 bino', seen.length === 6 && types.every((t) => seen.includes(t)), seen.join(', '));
  check('Kartalarda nom, rasm, vazifa, narx, xarajat, maydon va sig‘im', cardsOk && brokenImgs === 0, `buzuq rasm: ${brokenImgs}`);
  await page.screenshot({ path: `${OUT}/menyu.png` });

  // ---------- xizmatli hudud: yo‘l + elektr + suv (API), maktab — sichqoncha bilan ----------
  await G(() => {
    const g = window.__BOYOTA__.game;
    const path = [];
    for (let x = 14; x <= 26; x++) path.push({ x, z: 16 });
    g.buildRoad(path);
    g.placeBuilding('elektr', 15, 13, 0);
    g.placeBuilding('suv', 19, 13, 0);
  });
  const p1 = await placeViaMouse('prezident_maktab', 16, 17, 0, 5, 4);
  check('Prezident maktabi: hajmli yashil preview, qurildi, pul bir marta yechildi (+ topshiriq mukofoti)',
    p1.ov.ghostVisible && p1.ov.footprintColor === '#3ddc84' && p1.o?.type === 'prezident_maktab' && p1.money === p1.m0 - cat.prezident_maktab.price + 1500,
    JSON.stringify({ color: p1.ov.footprintColor, delta: p1.money - p1.m0 }));
  const school = p1.o;
  let st = await G((id) => { const g = window.__BOYOTA__.game; const s = g.education; const b = s.perBuilding.get(id); return { active: b?.active, seats: s.seats, demand: s.demand, coverage: s.coverage, tasks: g.eduTasks }; }, school.id);
  check('Yo‘l, elektr, suv bor — maktab faol, o‘rinlar qo‘shildi, 1-topshiriq bajarildi', st.active && st.seats === 40 && st.tasks === 1, JSON.stringify(st));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.move(640, 300);

  // ma’lumot paneli
  await hoverCell(school.gridX + 2, school.gridZ + 1);
  await clickHere();
  let info = await page.locator('[data-testid="info-panel"]').innerText().catch(() => '');
  check('Ma’lumot paneli: nom, turi, Faol, sig‘im, band o‘rinlar, ta’sir, xarajat, yo‘l/elektr/suv',
    /Prezident maktabi/.test(info) && /Maktab/.test(info) && /Faol/.test(info) && /40 o‘rin/.test(info) && /Band o‘rinlar/.test(info) && /Xarajat/.test(info) && /Elektr/.test(info) && /Suv/.test(info),
    info.replace(/\n/g, ' | ').slice(0, 220));
  await page.screenshot({ path: `${OUT}/malumot-faol.png` });

  // suv uzildi
  await G(() => { const g = window.__BOYOTA__.game; g.demolish(g.objectAt(19, 13).id); });
  await frames(2);
  info = await page.locator('[data-testid="info-panel"]').innerText().catch(() => '');
  st = await G((id) => { const s = window.__BOYOTA__.game.education; return { active: s.perBuilding.get(id).active, seats: s.seats }; }, school.id);
  check('Suv uzilganda: To‘xtagan, sabab va yechim ko‘rsatiladi, o‘rinlar 0', !st.active && st.seats === 0 && /To‘xtagan/.test(info) && /Suv yo‘q/.test(info) && /Nega ishlamayapti/.test(info), info.replace(/\n/g, ' | ').slice(0, 200));
  await page.screenshot({ path: `${OUT}/malumot-toxtagan.png` });
  await G(() => window.__BOYOTA__.game.placeBuilding('suv', 19, 13, 0));
  await page.click('[data-testid="info-close"]');

  // ta’lim paneli
  await page.click('[data-testid="edu-toggle"]');
  const edu = await page.locator('[data-testid="edu-panel"]').innerText();
  const sum = await G(() => { const s = window.__BOYOTA__.game.education; return { demand: s.demand, seats: s.seats, coverage: s.coverage }; });
  check('«Ta’lim» paneli: talab, mavjud o‘rinlar, qamrov (≤100%)', edu.includes(`${sum.demand}`) && edu.includes(`${sum.seats}`) && edu.includes(`${sum.coverage}%`) && sum.coverage <= 100, edu.replace(/\n/g, ' | '));
  await page.screenshot({ path: `${OUT}/talim-paneli.png` });
  await page.click('[data-testid="edu-toggle"]');

  // bolalar kutubxonasi — 2-topshiriq
  await page.click('[data-testid="cat-talim"]').catch(() => {});
  if (!(await page.locator('[data-testid="card-bolalar_kutubxona"]').isVisible())) await page.click('[data-testid="cat-talim"]');
  const p2 = await placeViaMouse('bolalar_kutubxona', 21, 17, 1, 3, 4);
  st = await G(() => ({ tasks: window.__BOYOTA__.game.eduTasks }));
  check('Bolalar kutubxonasi (R bilan 90°) faol — 2-topshiriq, mukofot bir marta', p2.o?.rotation === 1 && st.tasks === 2 && p2.money === p2.m0 - cat.bolalar_kutubxona.price + 1000, JSON.stringify({ rot: p2.o?.rotation, tasks: st.tasks, delta: p2.money - p2.m0 }));

  // ---------- qolgan binolar (yarmi aylantirilgan) ----------
  const placed = [school, p2.o].filter(Boolean).map((o) => ({ ...o }));
  for (const [i, t] of types.filter((t) => t !== 'prezident_maktab' && t !== 'bolalar_kutubxona').entries()) {
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
    const r = await placeViaMouse(t, spot.x, spot.z, rot, w, d);
    const ok = r.ov.ghostVisible && r.ov.footprintColor === '#3ddc84' && r.ov.footprintSize[0] === w && r.ov.footprintSize[1] === d && r.o?.type === t && r.o.rotation === rot && r.money === r.m0 - e.price;
    check(`${e.name}: preview yashil, ${rot ? 'R bilan 90° (footprint almashdi), ' : ''}qurildi, −${e.price}`, ok, JSON.stringify({ fp: r.ov.footprintSize, color: r.ov.footprintColor, delta: r.money - r.m0 }));
    if (r.o) placed.push(r.o);
  }

  // ---------- mablag‘ yetmasa ----------
  await G(() => { window.__BOYOTA__.game.money = 1000; });
  await page.click('[data-testid="card-milliy_universitet"]');
  await G(() => { window.__BOYOTA__.game.buildRotation = 0; });
  const free = await G(() => { const g = window.__BOYOTA__.game; for (let z = 1; z < 36; z++) for (let x = 14; x < 36; x++) if (g.checkPlacement('road', x, z, 0) && [0,1,2,3,4].every((dx) => [0,1,2,3,4].every((dz) => !g.occ.get(x + dx, z + dz)))) return { x, z }; return null; });
  let poor = { color: null, built: true };
  if (free) {
    await hoverCell(free.x + 2, free.z + 2);
    const o = await ov();
    const n0 = await G(() => window.__BOYOTA__.game.objects.size);
    await clickHere();
    const n1 = await G(() => window.__BOYOTA__.game.objects.size);
    poor = { color: o.footprintColor, built: n1 !== n0, money: await G(() => window.__BOYOTA__.game.money) };
  }
  check('Mablag‘ yetmasa: preview qizil, qurilmaydi, pul o‘zgarmaydi', poor.color === '#ff4d4d' && !poor.built && poor.money === 1000, JSON.stringify(poor));
  // bekor qilish
  await page.keyboard.press('Escape');
  const tool = await G(() => window.__BOYOTA__.game.tool);
  check('Esc — qurish bekor qilinadi', tool === 'select', tool);
  await G(() => { window.__BOYOTA__.game.money = 300000; });
  await page.keyboard.press('Escape');
  await page.mouse.move(640, 300);

  // ---------- band joy ----------
  await page.click('[data-testid="cat-talim"]').catch(() => {});
  if (!(await page.locator('[data-testid="card-invento"]').isVisible())) await page.click('[data-testid="cat-talim"]');
  await page.click('[data-testid="card-invento"]');
  await G(() => { window.__BOYOTA__.game.buildRotation = 0; });
  await hoverCell(school.gridX + 1, school.gridZ + 1);
  const red = await ov();
  const n0 = await G(() => window.__BOYOTA__.game.objects.size);
  await clickHere();
  const n1 = await G(() => window.__BOYOTA__.game.objects.size);
  check('Band joyda preview qizil, qurilmaydi', red.footprintColor === '#ff4d4d' && n0 === n1, red.footprintColor);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.move(640, 300);

  // ---------- refresh ----------
  await page.click('[data-testid="settings"]');
  await page.click('[data-testid="save-now"]');
  await page.keyboard.press('Escape');
  const snap = await G(() => [...window.__BOYOTA__.game.objects.values()].map((o) => `${o.id}:${o.type}:${o.gridX}:${o.gridZ}:${o.rotation}`).sort().join('|'));
  const before = await G(() => { const g = window.__BOYOTA__.game; return { money: g.money, tasks: g.eduTasks, skill: g.skill }; });
  await page.reload();
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(4);
  const snap2 = await G(() => [...window.__BOYOTA__.game.objects.values()].map((o) => `${o.id}:${o.type}:${o.gridX}:${o.gridZ}:${o.rotation}`).sort().join('|'));
  const after = await G(() => { const g = window.__BOYOTA__.game; return { money: g.money, tasks: g.eduTasks, skill: g.skill }; });
  check('Refresh: 6 bino turi, joyi, burilishi, topshiriq va malaka tiklandi; mukofot takrorlanmadi',
    snap === snap2 && JSON.stringify(before) === JSON.stringify(after) && placed.every((p) => snap2.includes(`${p.id}:${p.type}:${p.gridX}:${p.gridZ}:${p.rotation}`)),
    JSON.stringify(after));

  // ---------- malaka vaqt davomida (2 davr): xizmatli hududda faol IT maktabi ----------
  const it = await G(() => {
    const g = window.__BOYOTA__.game;
    g.money = 300000;
    const a = g.placeBuilding('elektr', 22, 13, 0).ok, b = g.placeBuilding('suv', 25, 13, 0).ok, c = g.placeBuilding('xorazmiy_maktab', 24, 17, 0).ok;
    const o = g.objectAt(24, 17);
    return { a, b, c, active: o ? g.education.perBuilding.get(o.id)?.active : null, delta: g.education.skillDelta };
  });
  check('Xizmatli hududdagi IT maktabi faol (malaka o‘sishi > 0)', it.c && it.active && it.delta > 0, JSON.stringify(it));
  const sk0 = await G(() => { const g = window.__BOYOTA__.game; if (g.paused) g.togglePause(); return g.skill; });
  const tc = await G(() => window.__BOYOTA__.game.tickCount);
  await page.waitForFunction((tc) => window.__BOYOTA__.game.tickCount >= tc + 2, tc, { timeout: 240000 });
  const sk1 = await G(() => { const g = window.__BOYOTA__.game; g.togglePause(); return { skill: g.skill, delta: g.education.skillDelta }; });
  check('Malaka hisob davrlarida asta o‘sadi (darhol emas)', sk1.skill > sk0, `${sk0} → ${sk1.skill}`);

  // ---------- buzish ----------
  const v = placed.find((p) => p.type === 'invento') ?? placed[placed.length - 1];
  await page.click('[data-testid="cat-buzish"]');
  const m3 = await G(() => window.__BOYOTA__.game.money);
  await hoverCell(v.gridX + 1, v.gridZ + 1);
  await clickHere();
  const gone = await G(([x, z]) => !window.__BOYOTA__.game.objectAt(x, z), [v.gridX + 1, v.gridZ + 1]);
  check('Buzish vositasi bilan buzildi, narx qaytarilmadi', gone && (await G(() => window.__BOYOTA__.game.money)) === m3);
  await page.keyboard.press('Escape');

  // ---------- topshiriq paneli: yo‘riqnoma o‘tkazilgach ta’lim topshirig‘i ko‘rinadi ----------
  await G(() => window.__BOYOTA__.game.skipTutorial());
  await frames(1);
  const task = await page.locator('[data-testid="edu-task"]').innerText().catch(() => '');
  check('Topshiriq panelida joriy ta’lim topshirig‘i (3/3, o‘rinlar/talab, mukofot)', /Ta’lim 3\/3/.test(task) && /O‘rinlar \d+ \/ talab \d+/.test(task) && /Mukofot/.test(task), task.replace(/\n/g, ' | '));
  await page.screenshot({ path: `${OUT}/topshiriq.png` });

  // ---------- umumiy ko‘rinish ----------
  await G(() => window.__BOYOTA__.game.select(null));
  for (const [i, az] of [0.6, 2.2, 3.7, 5.3].entries()) {
    await G((az) => window.__BOYOTA__.scene.cam.set({ targetX: 6.5, targetZ: 0, azimuth: az, polar: 0.62, distance: 32 }), az);
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
