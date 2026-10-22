// BoyOta — brauzerdagi qabul sinovlari (PRD 09, A01–A12).
// Haqiqiy sichqoncha/klaviatura hodisalari bilan ishlaydi; holatni faqat o‘qish uchun ?test=1 dagi
// window.__BOYOTA__ ishlatiladi (A03 dagi «mablag‘ yetmasligi» uchun pul vaqtincha kamaytiriladi).
//
// Ishga tushirish: npm run build && npm run test:e2e
// Chromium yo‘li: CHROMIUM_PATH muhit o‘zgaruvchisi yoki `npx playwright-core install chromium`.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4317;
const URL = `http://localhost:${PORT}/?test=1&nodino&instant`;
const OUT = 'test-results';
mkdirSync(OUT, { recursive: true });

const results = [];
function check(id, name, ok, detail = '') {
  results.push({ id, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
const stopServer = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); } };
await new Promise((res, rej) => {
  const t = setTimeout(() => { stopServer(); rej(new Error('preview server ishga tushmadi (port band bo‘lishi mumkin)')); }, 20000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(); } });
});

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

const G = (fn, arg) => page.evaluate(fn, arg);
const state = () => G(() => {
  const { game: g } = window.__BOYOTA__;
  return { money: g.money, pop: g.population, objects: g.objects.size, tool: g.tool, step: g.tutorial.step, completed: g.tutorial.completed,
    skipped: g.tutorial.skipped, tick: g.tickCount, paused: g.paused, cam: { ...g.camera }, rot: g.buildRotation, modal: g.modal, happy: g.happiness };
});
const TEST_CAM = { targetX: 6, targetZ: 0, azimuth: 0, polar: 1.25, distance: 42 };
const setCam = (c = TEST_CAM) => G((c) => window.__BOYOTA__.scene.cam.set(c), c);
const cellXY = (x, z) => G(([x, z]) => window.__BOYOTA__.scene.cellToClient(x, z), [x, z]);
const objAt = (x, z) => G(([x, z]) => { const o = window.__BOYOTA__.game.objectAt(x, z); return o ? { ...o } : null; }, [x, z]);
const statusOf = (x, z) => G(([x, z]) => { const g = window.__BOYOTA__.game; const o = g.objectAt(x, z); return o ? { ...g.statuses.get(o.id) } : null; }, [x, z]);
const overlay = () => G(() => window.__BOYOTA__.scene.overlayState());
/** Haqiqiy render kadrlarini kutish (dasturiy render sekin bo‘lishi mumkin). */
async function frames(n = 2) {
  const start = await G(() => window.__BOYOTA__?.scene.frameCount ?? 0);
  await page.waitForFunction(([s, n]) => (window.__BOYOTA__?.scene.frameCount ?? 0) >= s + n, [start, n], { timeout: 20000 });
}

/** Kamerani katakka markazlaydi — katak doim UI panellaridan bo‘sh ekran markazida bo‘ladi. */
async function focus(x, z) {
  await setCam({ ...TEST_CAM, distance: 30, targetX: x - 16 + 0.5, targetZ: z - 16 + 0.5 });
}
async function hover(x, z, keepCam = false) {
  if (!keepCam) await focus(x, z);
  const p = await cellXY(x, z);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await frames(2);
  return p;
}
async function clickCell(x, z) {
  const p = await hover(x, z);
  await page.mouse.down();
  await page.mouse.up();
  await frames(2);
  return p;
}
async function dragCells(a, b, button = 'left') {
  await focus((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  const p = await cellXY(a[0], a[1]);
  const q = await cellXY(b[0], b[1]);
  await page.mouse.move(p.x, p.y);
  await frames(1);
  await page.mouse.down({ button });
  await page.mouse.move(q.x, q.y, { steps: 8 });
  await frames(2);
  await page.mouse.up({ button });
  await frames(2);
}
async function place(card, x, z, rotations = 0) {
  await chooseCard(card);
  for (let i = 0; i < rotations; i++) await page.keyboard.press('r');
  const fp = await G((t) => { const g = window.__BOYOTA__.game; return { r: g.buildRotation, t }; }, card);
  await clickCell(x, z);
  return fp;
}
const CARD_CAT = { uy_a: 'uylar', uy_b: 'uylar', uy_c: 'uylar', elektr: 'elektr', suv: 'suv', bog: 'boglar', daraxt: 'boglar', maktab: 'xizmatlar' };
async function chooseCard(card) {
  if (!(await page.locator(`[data-testid="card-${card}"]`).isVisible())) await page.click(`[data-testid="cat-${CARD_CAT[card]}"]`);
  await page.click(`[data-testid="card-${card}"]`);
  await G(() => { window.__BOYOTA__.game.buildRotation = 0; });
  await frames(1);
}
async function roadTool() {
  const t = (await state()).tool;
  if (t !== 'road') await page.click('[data-testid="cat-yol"]');
  if ((await state()).tool !== 'road') await page.click('[data-testid="cat-yol"]');
}
async function selectTool() {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await frames(1);
}

try {
  // ---------- tayyorgarlik ----------
  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(6);
  let s = await state();
  await page.screenshot({ path: `${OUT}/01-boshlangich.png` });
  check('A09', 'Preset obyektlar topshiriqni bajarmaydi (bosqich 0)', s.step === 0, `step=${s.step}`);
  check('—', 'Boshlang‘ich mablag‘ 500 000', s.money === 500000, `money=${s.money}`);
  const title = await page.title();
  const bodyText = await page.locator('body').innerText();
  check('A11', 'Nom hamma joyda BoyOta, MYcity yo‘q', title === 'BoyOta' && !/mycity/i.test(bodyText), title);

  // Dastyor: G003 rasmi
  const dastyorSrc = await page.locator('.dastyor-img').getAttribute('src');
  const imgOk = await G(() => { const i = document.querySelector('.dastyor-img'); return i && i.complete && i.naturalWidth > 0; });
  check('A09', 'Dastyor oynasida G003 PNG yuklangan', imgOk && dastyorSrc.endsWith('G003.png'), dastyorSrc);
  await page.click('[data-testid="dastyor-ok"]');
  await frames(1);
  check('A09', 'Dastyorni yopish (Tushunarli)', !(await page.locator('[data-testid="dastyor"]').isVisible()));

  await setCam();
  await frames(3);

  // ---------- A01 kamera ----------
  const c0 = (await state()).cam;
  const mid = { x: 900, y: 360 };
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(mid.x + 300, mid.y, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  const c1 = (await state()).cam;
  check('A01', 'O‘ng tugma sudrash — orbit', Math.abs(c1.azimuth - c0.azimuth) > 0.5, `az ${c0.azimuth.toFixed(2)}→${c1.azimuth.toFixed(2)}`);
  // to‘liq 360° (bir necha marta)
  let total = 0;
  for (let i = 0; i < 4; i++) {
    const before = (await state()).cam.azimuth;
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(mid.x + 300, mid.y, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    const after = (await state()).cam.azimuth;
    total += ((before - after) + Math.PI * 4) % (Math.PI * 2);
  }
  check('A01', '360° aylantirish (azimut to‘liq aylanadi)', total + Math.abs(c1.azimuth - c0.azimuth) >= Math.PI * 2 - 0.2, `jami ${(total * 180 / Math.PI).toFixed(0)}° + birinchi`);
  // qiyalik chegarasi: pastga/yuqoriga juda ko‘p sudrash
  await page.mouse.move(mid.x, 200);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(mid.x, 620, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  const cHi = (await state()).cam;
  await page.mouse.move(mid.x, 600);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(mid.x, 120, { steps: 10 });
  await page.mouse.move(mid.x, 120, { steps: 1 });
  await page.mouse.up({ button: 'right' });
  const cLo = (await state()).cam;
  const deg = (r) => (r * 180) / Math.PI;
  check('A01', 'Qiyalik 25–75° oralig‘ida, yer ostiga o‘tmaydi', deg(cHi.polar) <= 75.01 && deg(cLo.polar) >= 24.99, `${deg(cLo.polar).toFixed(1)}°…${deg(cHi.polar).toFixed(1)}°`);
  // zoom
  await setCam();
  await page.mouse.move(mid.x, mid.y);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -400);
  await frames(2);
  const cz = (await state()).cam;
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -600);
  await frames(2);
  const czMin = (await state()).cam;
  check('A01', 'G‘ildirak — yaqinlashtirish va cheklov', cz.distance < TEST_CAM.distance && czMin.distance >= 5 - 1e-6, `${TEST_CAM.distance}→${cz.distance.toFixed(1)}, min ${czMin.distance.toFixed(1)}`);
  // pan (o‘rta tugma)
  await setCam();
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(mid.x - 200, mid.y - 100, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  const cp = (await state()).cam;
  check('A01', 'O‘rta tugma sudrash — xarita bo‘ylab siljish', Math.abs(cp.targetX - TEST_CAM.targetX) > 1, `targetX ${TEST_CAM.targetX}→${cp.targetX.toFixed(2)}`);
  // orqa tomondan ko‘rinish (skrinshot)
  await G(() => window.__BOYOTA__.scene.cam.set({ targetX: -6, targetZ: -2, azimuth: 3.7, polar: 0.6, distance: 12 }));
  await frames(4);
  await page.screenshot({ path: `${OUT}/02-orqa-tomondan.png` });
  await G(() => window.__BOYOTA__.scene.cam.set({ targetX: -6, targetZ: -2, azimuth: 0.6, polar: 0.7, distance: 12 }));
  await frames(4);
  await page.screenshot({ path: `${OUT}/03-old-tomondan.png` });
  await page.keyboard.press('Home');
  await frames(1);
  const ch = (await state()).cam;
  check('A01', 'Home — boshlang‘ich ko‘rinish', Math.abs(ch.distance - 21) < 1e-6 && Math.abs(ch.targetX + 6.5) < 1e-6, JSON.stringify(ch));
  await setCam();
  await frames(2);

  // Qurilish sinovlarida mablag‘ni aniq tekshirish uchun pauza (pauzada qurish mumkin)
  await page.click('[data-testid="pause"]');

  // ---------- A02 joylashtirish ----------
  await chooseCard('uy_a');
  const m0 = (await state()).money;
  await hover(18, 20);
  let ov = await overlay();
  check('A02', 'Yarim shaffof 3D preview va katakka yopishish', ov.ghostVisible && ov.pending && ov.pending.gx === 18 && ov.pending.gz === 20, JSON.stringify(ov.pending));
  check('A02', 'Yaroqli joy yashil', ov.footprintColor === '#3ddc84', ov.footprintColor);
  await chooseCard('uy_c');
  await hover(18, 20);
  const fpA = (await overlay()).footprintSize;
  await page.keyboard.press('r');
  await frames(3);
  const fpB = (await overlay()).footprintSize;
  check('A02', 'R — 90° aylantirish footprintni almashtiradi', fpA[0] === 2 && fpA[1] === 3 && fpB[0] === 3 && fpB[1] === 2, `${fpA} → ${fpB}`);
  // sudrash qurilishga olib kelmaydi
  const o0 = (await state()).objects;
  await focus(18, 20);
  const p18 = await cellXY(18, 20);
  await page.mouse.move(p18.x, p18.y);
  await page.mouse.down();
  await page.mouse.move(p18.x + 60, p18.y + 30, { steps: 6 });
  await page.mouse.up();
  await frames(2);
  check('A01', 'Qurilish rejimida sudrash tasodifiy qurmaydi', (await state()).objects === o0 && (await state()).money === m0);
  await page.keyboard.press('Escape');
  await frames(1);
  s = await state();
  check('A02', 'Escape bekor qiladi, mablag‘ o‘zgarmaydi', s.tool === 'select' && s.money === m0 && !(await overlay()).ghostVisible, `tool=${s.tool}`);

  // ---------- A03 cheklovlar ----------
  await chooseCard('uy_a');
  const before3 = await state();
  await hover(22, 4);
  const waterColor = (await overlay()).footprintColor;
  await clickCell(22, 4);
  const afterWater = await state();
  await hover(7, 10);
  const occColor = (await overlay()).footprintColor;
  await clickCell(7, 10);
  const afterOcc = await state();
  await hover(31, 12);
  const edgeColor = (await overlay()).footprintColor;
  await clickCell(31, 12);
  const afterEdge = await state();
  check('A03', 'Suvga qurish bloklanadi (qizil)', waterColor === '#ff4d4d' && afterWater.objects === before3.objects && afterWater.money === before3.money);
  check('A03', 'Collision bloklanadi (qizil)', occColor === '#ff4d4d' && afterOcc.objects === before3.objects);
  check('A03', 'Xarita chegarasi bloklanadi (qizil)', edgeColor === '#ff4d4d' && afterEdge.objects === before3.objects);
  await G(() => { window.__BOYOTA__.game.money = 300; });
  await clickCell(18, 20);
  const afterPoor = await state();
  check('A03', 'Mablag‘ yetmasa bloklanadi', afterPoor.objects === before3.objects && afterPoor.money === 300);
  await G((m) => { window.__BOYOTA__.game.money = m; }, before3.money);
  await page.keyboard.press('Escape');

  // ---------- A04 yo‘llar ----------
  await roadTool();
  await frames(2);
  check('A11', 'Yo‘l rejimida to‘r ko‘rinadi', (await overlay()).gridVisible);
  let m = (await state()).money;
  await dragCells([13, 16], [20, 16]);
  let m2 = (await state()).money;
  check('A04', 'Yo‘l chizish: faqat yangi kataklar × 100', m - m2 === 700, `${m}→${m2}`);
  await dragCells([13, 16], [20, 16]);
  check('A04', 'Mavjud katak qayta narxlanmaydi', (await state()).money === m2);
  await dragCells([17, 13], [17, 19]);
  await dragCells([20, 16], [20, 18]);
  await dragCells([15, 16], [15, 18]);
  const shapes = await G(() => { const sc = window.__BOYOTA__.scene; return { cross: sc.roadShapeAt(17, 16), end: sc.roadShapeAt(17, 13), straight: sc.roadShapeAt(16, 16), corner: sc.roadShapeAt(20, 16), t: sc.roadShapeAt(15, 16) }; });
  check('A04', 'To‘g‘ri, burilish, T va to‘rt tomonli chorraha', shapes.cross === 'cross' && shapes.end === 'end' && shapes.straight === 'straight' && shapes.corner === 'corner' && shapes.t === 't', JSON.stringify(shapes));
  // diagonal sudrash — L shakl, diagonal katak yo‘q
  await dragCells([17, 19], [14, 21]);
  const diag = await G(() => { const g = window.__BOYOTA__.game; return [g.roads.isRoad(14, 19), g.roads.isRoad(14, 20), g.roads.isRoad(16, 20)]; });
  check('A04', 'Bir harakatda diagonal yo‘q (Manhattan)', diag[0] && diag[1] && !diag[2], JSON.stringify(diag));
  s = await state();
  check('A09', '1-topshiriq real yo‘l bilan bajarildi', s.step >= 1, `step=${s.step}`);
  await page.screenshot({ path: `${OUT}/04-yollar.png` });

  // ---------- A05 tarmoq ----------
  await dragCells([24, 11], [27, 11]);
  const disc = await G(() => window.__BOYOTA__.game.roads.isConnected(24, 11));
  await place('uy_a', 25, 12);
  const h1 = await statusOf(25, 12);
  check('A05', 'Uzilgan yo‘l yonidagi uy ulanmagan', !disc && h1 && h1.road === false, JSON.stringify(h1));
  check('A06', 'Ta’minot yo‘qligi indikatori ko‘rinadi', (await overlay()).statusIcons > 0);
  await roadTool();
  await dragCells([17, 13], [23, 11]);
  const h2 = await statusOf(25, 12);
  check('A05', 'Kirishga bog‘langanda holat yangilanadi', h2.road === true);
  s = await state();
  check('A09', '2-topshiriq: tarmoqqa ulangan uy', s.step >= 2, `step=${s.step}`);

  // ---------- A06 elektr va suv ----------
  await place('elektr', 22, 18);
  const st = await statusOf(22, 18);
  const h3 = await statusOf(25, 12);
  check('A06', 'Faol stansiya radius ichida elektr beradi', st.active && h3.power, JSON.stringify({ active: st.active, power: h3.power }));
  await place('uy_a', 30, 27);
  const far = await statusOf(30, 27);
  check('A06', 'Radius tashqarisida elektr yo‘q', far.power === false);
  s = await state();
  check('A09', '3-topshiriq: elektr', s.step >= 3, `step=${s.step}`);
  await place('suv', 26, 9);
  check('A06', 'Suv stansiyasi radius ichida suv beradi', (await statusOf(25, 12)).water === true);
  s = await state();
  check('A09', '4-topshiriq: suv', s.step >= 4, `step=${s.step}`);
  await place('bog', 27, 12);
  s = await state();
  check('A09', '5-topshiriq: bog‘ — yo‘riqnoma yakunlandi', s.completed, `step=${s.step}`);
  await selectTool();
  await clickCell(22, 18);
  ov = await overlay();
  const infoVisible = await page.locator('[data-testid="info-panel"]').isVisible();
  check('A06', 'Tanlangan stansiya radiusi ko‘rinadi (8 katak) va ma’lumot paneli ochiladi', ov.selectionRangeVisible && ov.selectionRangeRadius === 8 && infoVisible, `r=${ov.selectionRangeRadius}`);
  await page.screenshot({ path: `${OUT}/05-stansiya-radiusi.png` });
  await page.keyboard.press('Escape');

  // ---------- A07 hisob ----------
  await page.click('[data-testid="pause"]');
  const t0 = await state();
  await page.waitForFunction((t) => window.__BOYOTA__.game.tickCount > t, t0.tick, { timeout: 40000 });
  const rep = await G(() => {
    const g = window.__BOYOTA__.game;
    return { ...g.lastReport, money: g.money, pop: g.population };
  });
  // shu davr ichida boshqa davr bo‘lmasligi uchun darhol o‘qiladi
  check('A07', 'Davriy hisob: mablag‘ o‘zgarishi = soliq + biznes − xarajat', Math.abs(rep.money - t0.money - rep.net) < 1e-6, `Δ=${rep.money - t0.money}, net=${rep.net}`);
  // soliq davr boshidagi aholidan olinadi; shu davrda ko‘chganlar (moved) keyingi davrdan to‘laydi
  check('A07', 'Soliq = 2 × davr boshidagi aholi', rep.tax === (rep.pop - rep.moved) * 2, `tax=${rep.tax}, pop=${rep.pop}, moved=${rep.moved}`);
  const newHouse = await objAt(25, 12);
  check('A07', 'Ta’minlangan uyga aholi ko‘chib keladi (davrda 2 kishigacha)', newHouse.residents >= 2, `residents=${newHouse.residents}`);

  // ---------- A08 pauza ----------
  await page.click('[data-testid="pause"]');
  const p0 = await state();
  await page.waitForTimeout(12000);
  const p1 = await state();
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(mid.x + 150, mid.y, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  const p2 = await state();
  check('A08', 'Pauzada 12 s: pul, aholi va davr o‘zgarmaydi', p0.paused && p0.money === p1.money && p0.pop === p1.pop && p0.tick === p1.tick, `money ${p0.money}/${p1.money}`);
  check('A08', 'Pauzada kamera ishlaydi', Math.abs(p2.cam.azimuth - p1.cam.azimuth) > 0.1);
  await page.click('[data-testid="pause"]');
  await setCam();

  // ---------- A12 buzish ----------
  await page.click('[data-testid="cat-buzish"]');
  await hover(22, 18);
  const hint = await page.locator('[data-testid="hover-hint"]').innerText().catch(() => '');
  await clickCell(22, 18);
  check('A12', 'Stansiya buzildi, ta’minot darhol yangilandi', !(await objAt(22, 18)) && (await statusOf(25, 12)).power === false, hint);
  await clickCell(14, 16);
  const cut = await statusOf(25, 12);
  check('A12', 'Yo‘l katagi olib tashlanganda ulanish qayta hisoblanadi', !(await objAt(14, 16)) && cut.road === false);
  await clickCell(30, 27);
  check('A12', 'Bino buzildi, occupancy bo‘shadi', !(await objAt(30, 27)));
  await clickCell(0, 16);
  check('A12', 'Kirish yo‘li buzilmaydi', !!(await objAt(0, 16)));
  await roadTool();
  await dragCells([13, 16], [15, 16]);
  check('A12', 'Yo‘l qayta qurilgach ulanish tiklandi', (await statusOf(25, 12)).road === true);
  await page.click('[data-testid="cat-yol"]');

  // ---------- A11 UI bosishlari sahnaga o‘tmaydi ----------
  await chooseCard('uy_a');
  const u0 = await state();
  const btn = page.locator('[data-testid="cat-suv"]');
  const box = await btn.boundingBox();
  const under = await G(([x, y]) => window.__BOYOTA__.scene.cellFromClient(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
  await page.locator('[data-testid="card-uy_a"]').click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await frames(2);
  const u1 = await state();
  check('A11', 'Menyu ustidagi bosish qurilishga o‘tmaydi', u1.objects === u0.objects && u1.money === u0.money, `tugma ostidagi katak ${JSON.stringify(under)}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // barcha kategoriya va kartalar
  const cats = ['yol', 'uylar', 'savdo', 'elektr', 'suv', 'xizmatlar', 'boglar', 'maxsus'];
  let cardsOk = true;
  let cardCount = 0;
  for (const c of cats) {
    await page.click(`[data-testid="cat-${c}"]`);
    const cards = await page.locator('.card').all();
    for (const card of cards) {
      await card.click();
      cardCount++;
      const t = (await state()).tool;
      if (t !== 'build' && t !== 'road') cardsOk = false;
    }
    await page.click(`[data-testid="cat-${c}"]`);
  }
  const brokenImgs = await G(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
  check('A11', `Barcha ${cardCount} ta karta tanlanadi`, cardsOk && cardCount > 15);
  // kartalar rasmlari
  for (const c of cats) {
    await page.click(`[data-testid="cat-${c}"]`);
    await page.waitForTimeout(400);
    await page.click(`[data-testid="cat-${c}"]`);
  }
  const broken2 = await G(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
  check('A11', 'Karta rasmlari mavjud fayllardan yuklanadi', brokenImgs.length === 0 && broken2.length === 0, broken2.join(', '));

  // sozlamalar tugmalari
  await page.click('[data-testid="settings"]');
  const settingsOpen = await page.locator('[data-testid="settings-modal"]').isVisible();
  await page.click('[data-testid="q-low"]');
  await frames(2);
  const low = await G(() => ({ q: window.__BOYOTA__.game.settings.quality, sh: window.__BOYOTA__.scene.renderer.shadowMap.enabled }));
  await page.click('[data-testid="q-high"]');
  await frames(2);
  const high = await G(() => ({ q: window.__BOYOTA__.game.settings.quality, sh: window.__BOYOTA__.scene.renderer.shadowMap.enabled }));
  check('A11', 'Grafik sifat: past (soyasiz) / yuqori', low.q === 'low' && !low.sh && high.q === 'high' && high.sh);
  await page.click('[data-testid="save-now"]');
  const saved = await G(() => !!localStorage.getItem('boyota.save.v1'));
  check('A10', 'Qo‘lda saqlash darhol yozadi', saved);
  await page.click('[data-testid="open-help"]');
  const helpOpen = await page.locator('[data-testid="help-modal"]').isVisible();
  await page.click('[data-testid="modal-close"]');
  await page.click('[data-testid="new-city"]');
  const confirmOpen = await page.locator('[data-testid="confirm-modal"]').isVisible();
  const beforeCancel = await state();
  await page.click('[data-testid="confirm-cancel"]');
  const afterCancel = await state();
  check('A11', 'Sozlamalar, yordam, yangi shahar tasdig‘i (bekor qilish)', settingsOpen && helpOpen && confirmOpen && afterCancel.objects === beforeCancel.objects && !afterCancel.modal);
  // modal ochiq bo‘lsa qurilish bloklanadi
  await page.click('[data-testid="settings"]');
  const mm = await state();
  await G(() => window.__BOYOTA__.game.setTool('build', 'daraxt'));
  const blocked = await G(() => window.__BOYOTA__.game.placeBuilding('daraxt', 20, 24, 0).ok);
  check('A11', 'Modal ochiq bo‘lsa qurilish bloklanadi', !blocked && (await state()).objects === mm.objects);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // ---------- A10 saqlash va tiklash ----------
  await place('uy_c', 28, 18, 1);
  const rotated = await objAt(27, 18);
  const tA = (await state()).tick;
  await page.waitForFunction((t) => window.__BOYOTA__.game.tickCount > t, tA, { timeout: 40000 });
  await page.waitForTimeout(800);
  const snap = await G(() => {
    const g = window.__BOYOTA__.game;
    return { money: g.money, step: g.tutorial.step, completed: g.tutorial.completed, n: g.objects.size, pop: g.population,
      objs: [...g.objects.values()].map((o) => `${o.id}:${o.type}:${o.gridX}:${o.gridZ}:${o.rotation}:${o.residents}`).sort().join('|') };
  });
  await page.reload();
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(3);
  const snap2 = await G(() => {
    const g = window.__BOYOTA__.game;
    return { money: g.money, step: g.tutorial.step, completed: g.tutorial.completed, n: g.objects.size, pop: g.population,
      objs: [...g.objects.values()].map((o) => `${o.id}:${o.type}:${o.gridX}:${o.gridZ}:${o.rotation}:${o.residents}`).sort().join('|') };
  });
  check('A10', 'Refreshdan keyin obyektlar, burilish, residents, pul va bosqich tiklandi',
    rotated?.rotation === 1 && snap.objs === snap2.objs && snap.money === snap2.money && snap.step === snap2.step && snap.pop === snap2.pop,
    `pul ${snap.money}/${snap2.money}, obyekt ${snap.n}/${snap2.n}, aholi ${snap.pop}/${snap2.pop}`);
  await page.screenshot({ path: `${OUT}/06-refreshdan-keyin.png` });

  // ---------- A09 skip saqlanadi ----------
  await G(() => { const g = window.__BOYOTA__.game; g.tutorial.completed = false; g.tutorial.step = 4; g.reopenDastyor(); });
  await frames(1);
  await page.click('[data-testid="dastyor-skip"]');
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(() => window.__BOYOTA__);
  s = await state();
  check('A09', 'O‘tkazib yuborish (skip) saqlanadi', s.skipped === true);

  // ---------- yangi shahar ----------
  await page.click('[data-testid="settings"]');
  await page.click('[data-testid="new-city"]');
  await page.click('[data-testid="confirm-yes"]');
  await frames(2);
  s = await state();
  check('A11', 'Yangi shahar faqat tasdiqdan keyin boshlanadi', s.money === 500000 && s.step === 0 && !s.skipped, `objects=${s.objects}`);

  const fps = await G(() => window.__BOYOTA__.scene.fps);
  check('—', 'Sahifa xatolari yo‘q', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  results.push({ id: 'info', name: `FPS (swiftshader dasturiy render, haqiqiy GPU emas): ${fps}`, ok: true, detail: '' });
} catch (e) {
  check('ERR', 'Sinov skripti xatosi', false, String(e?.stack || e));
  await page.screenshot({ path: `${OUT}/xato.png` }).catch(() => {});
} finally {
  await browser.close();
  stopServer();
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  writeFileSync(`${OUT}/e2e-natijalar.json`, JSON.stringify({ passed, failed, results }, null, 2));
  console.log(`\nJami: ${passed} o‘tdi, ${failed} xato`);
  process.exit(failed ? 1 : 0);
}
