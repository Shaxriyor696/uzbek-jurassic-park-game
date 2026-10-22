// Yuradigan dinozavr (public/models/apato.glb) brauzer sinovi: GLB tuzilmasi, mualliflik, yurish/dam/burilish sikllari,
// oyoq sirpanishi (o‘lchanadi), to‘siqlar, qurilishni bloklash, pauza, saqlash va turli rakurslardan suratlar.
// Ishga tushirish: npm run build && npm run test:dino
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4326;
const URL = `http://localhost:${PORT}/?test=1`;
const OUT = 'test-results/dino';
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
  await frames(3);
  await page.click('[data-testid="dastyor-ok"]');
  await page.waitForFunction(() => window.__BOYOTA__.scene.dinoWalker.diag.status !== 'loading', null, { timeout: 180000 });
  const diag = await G(() => window.__BOYOTA__.scene.dinoWalker.diag);
  check('GLB yuklandi: 5 mesh × 121 morph target, skelet yo‘q, 1 klip (EFS1_AllParts_DirectCubicBSpline.001, ~14,58 s)',
    diag.status === 'ok' && diag.meshes === 5 && diag.morphTargets.every((n) => n === 121) && diag.skins === 0 && diag.clip.name === 'EFS1_AllParts_DirectCubicBSpline.001' && Math.abs(diag.clip.duration - 14.583) < 0.01,
    JSON.stringify({ status: diag.status, err: diag.error, ms: diag.loadMs }));
  check('Teksturalar yuklandi (6 ta rasm, 5 materialda), o‘lchamlari aniqlandi', diag.textures.length === 5 && diag.textures.every((t) => t.w > 0 && t.h > 0), diag.textures.map((t) => `${t.name} ${t.w}×${t.h}`).join(', '));
  check('Klip ichida oldinga yurish aniqlandi (root motion) va to‘rt oyoq yerda turgan oraliqlar', diag.forwardShift > 9 && diag.plantedIntervals.some(([a, b]) => a <= 0.62 && b >= 0.6) && diag.plantedIntervals.some(([a, b]) => a <= 4.97 && b >= 5.7), `siljish ${diag.forwardShift}, oraliqlar ${JSON.stringify(diag.plantedIntervals)}`);
  const cr = await G(() => window.__BOYOTA__.scene.dinoWalker.credits);
  check('Mualliflik fayldan o‘qildi (asset.extras)', /Yea/.test(cr.author) && /CC-BY-4.0/.test(cr.license) && /sketchfab\.com\/3d-models/.test(cr.source) && /apato/.test(cr.title), JSON.stringify(cr));

  const st0 = await G(() => { const g = window.__BOYOTA__.game; return { lens: g.dinos.map((d) => d.len).join(','), d: g.dino, note: g.dinoNote, clear: g.dinoBodyClear(), count: (() => { let n = 0; window.__BOYOTA__.scene.scene.traverse((o) => { if (o.name === 'apato') n++; }); return n; })() }; });
  const z = st0.d?.zone;
  check('Ikkita dinozavr (12 va 9 katak) bo‘sh tabiat yerida (bino/yo‘l/suv ustida emas, bir-birining ustida emas)', !!st0.d && st0.clear && st0.count === 2 && st0.lens === '12,9', JSON.stringify({ lens: st0.lens, note: st0.note, count: st0.count }));
  const feet0 = await G(() => window.__BOYOTA__.scene.dinoWalker.footStats());
  check('Oyoqlar yer sathida (yerga botmagan, osilmagan; yurishda bitta oyoq ko‘tarilgan bo‘lishi mumkin)', feet0.length === 4 && feet0.every((f) => f.minY > -0.3 && f.minY < 1.2) && feet0.filter((f) => Math.abs(f.minY) < 0.1).length >= 2, feet0.map((f) => f.minY.toFixed(2)).join(', '));

  // ---------- yurish, oyoq sirpanishi ----------
  const sim = await G(() => {
    const { game: g, scene } = window.__BOYOTA__;
    if (g.paused) g.togglePause();
    const S = 1 / scene.dinoWalker.diag.scale; // katak → model birligi
    const modes = {}; let moved = 0, minTurn = 0, maxTurn = 0, clear = true;
    const prev = scene.dinoWalker.footStats();
    let px = g.dino.ax, pz = g.dino.az; const h0 = g.dino.heading;
    const secondStart = g.dinos[1] ? { ax: g.dinos[1].ax, az: g.dinos[1].az, heading: g.dinos[1].heading } : null;
    const cur = [0, 0, 0, 0], src = [0, 0, 0, 0], start = [null, null, null, null];
    const worst = { walk: 0, fade: 0, rest: 0, pivot: 0 };
    let worstSrc = 0;
    let walkSamples = 0, lastMode = g.dino.mode, pivotDeg = 0;
    for (let i = 0; i < 2400; i++) { // 120 o‘yin soniyasi
      const mode = g.dino.mode;
      const hb = g.dino.heading;
      g.update(0.05);
      if (mode === 'pivot') pivotDeg += Math.abs(g.dino.heading - hb) * 57.3;
      modes[mode] = (modes[mode] || 0) + 1;
      const f = scene.dinoWalker.footStats();
      if (mode !== lastMode) { cur.fill(0); src.fill(0); start.fill(null); lastMode = mode; }
      const c = Math.cos(g.dino.heading), sn = Math.sin(g.dino.heading), sc = 1 / S;
      for (let k = 0; k < 4; k++) {
        if (f[k].minY < 0.06 && prev[k].minY < 0.06) {
          // bizning harakat qo‘shgan siljish = dunyodagi siljish − modelning o‘z (manba animatsiya) siljishi
          const dlx = (f[k].lx - prev[k].lx) * sc, dlz = (f[k].lz - prev[k].lz) * sc;
          const ex = f[k].x - prev[k].x - (c * dlx - sn * dlz), ez = f[k].z - prev[k].z - (sn * dlx + c * dlz);
          // blend/dam/burilishda poza ataylab o‘zgaradi — u yerda dunyodagi siljishning o‘zi o‘lchanadi
          if (mode === 'walk') cur[k] += Math.hypot(ex, ez) * S;
          else {
            // blend/dam/burilish: tayanch boshlangan nuqtadan eng katta uzoqlashish (chayqalish yig‘ilmaydi)
            if (!start[k]) start[k] = { x: prev[k].x, z: prev[k].z };
            cur[k] = Math.max(cur[k], Math.hypot(f[k].x - start[k].x, f[k].z - start[k].z) * S);
          }
          src[k] += Math.hypot(f[k].lx - prev[k].lx, f[k].lz - prev[k].lz);
          worst[mode] = Math.max(worst[mode], cur[k]);
          if (mode === 'walk') { walkSamples++; worstSrc = Math.max(worstSrc, src[k]); }
        } else { cur[k] = 0; src[k] = 0; start[k] = null; }
        prev[k] = f[k];
      }
      moved += Math.hypot(g.dino.ax - px, g.dino.az - pz); px = g.dino.ax; pz = g.dino.az;
      const dh = g.dino.heading - h0; minTurn = Math.min(minTurn, dh); maxTurn = Math.max(maxTurn, dh);
      if (!g.dinoBodyClear()) clear = false;
    }
    g.togglePause();
    return { modes, moved, turn: maxTurn - minTurn, clear, worst, walkSamples, pivotDeg, worstSrc, second: { ...g.dinos[1] } , secondStart };
  });
  check('120 o‘yin soniyasida: yurish, blend, dam olish va burilish sikllari', sim.modes.walk > 0 && sim.modes.fade > 0 && sim.modes.rest > 0 && sim.turn > 0.3 && sim.moved > 2, JSON.stringify({ modes: sim.modes, moved: +sim.moved.toFixed(2), turn: +sim.turn.toFixed(2) }));
  check('Yurishda xaritadagi siljish oyoqqa qo‘shimcha sirpanish qo‘shmaydi (yurish ≤ 1,5, qadamlar orasidagi blend ≤ 3 model birligi; tana ~80)', sim.worst.walk <= 1.5 && sim.worst.fade <= 3 && sim.worst.rest <= 1.5 && sim.walkSamples > 100, `bir tayanishdagi siljish (model birligi): yurish (qo‘shilgan) ${sim.worst.walk.toFixed(2)}, blend ${sim.worst.fade.toFixed(2)}, dam ${sim.worst.rest.toFixed(2)}, joyida burilish ${sim.worst.pivot.toFixed(2)} (${sim.pivotDeg.toFixed(0)}° burildi); manba animatsiyadagi oyoq «roll»i ${sim.worstSrc.toFixed(2)}`);
  check('Tanalar hech qachon bino, yo‘l, suv, xarita chegarasi yoki bir-biriga kirmadi', sim.clear);

  // ---------- haqiqiy chizilgan vertekslar: bino/yo‘l ustiga chiqmasin (atrofga bino qo‘yib, 120 s) ----------
  const geo = await G(() => {
    const { game: g, scene } = window.__BOYOTA__;
    g.money = 1e8;
    // dinozavrlar yo‘liga to‘siq bo‘lsin: xarita ichidagi bo‘sh joylarga binolar
    let placed = 0;
    for (let z = 2; z < 38; z += 5) for (let x = 2; x < 38; x += 5) if (g.placeBuilding('bon', x, z, 0).ok) placed++;
    if (g.paused) g.togglePause();
    let bad = 0, total = 0, worst = null;
    for (let i = 0; i < 2400; i++) {
      g.update(0.05);
      if (i % 10) continue;
      for (let k = 0; k < g.dinos.length; k++) for (const p of scene.dinoWalker.bodyPoints(k, 17)) {
        total++;
        const cx = Math.floor(p.x), cz = Math.floor(p.z);
        const o = g.objectAt(cx, cz);
        if (o) { bad++; worst = worst ?? { cx, cz, type: o.type, dino: k }; }
      }
    }
    g.togglePause();
    return { placed, bad, total, worst };
  });
  check('Haqiqiy vertekslar: dinozavr tanasi (dum, bo‘yin, bosh) bino yoki yo‘l ustiga chiqmadi', geo.placed > 5 && geo.total > 1000 && geo.bad === 0, JSON.stringify(geo));
  check('Ikkinchi (kichikroq) dinozavr ham harakatlanadi', !!sim.secondStart && (Math.hypot(sim.second.ax - sim.secondStart.ax, sim.second.az - sim.secondStart.az) > 0.3 || Math.abs(sim.second.heading - sim.secondStart.heading) > 0.2), JSON.stringify({ from: sim.secondStart, to: [sim.second.ax, sim.second.az, sim.second.heading] }));

  // ---------- qurilishni bloklash va yo‘l yopilishi ----------
  const blk = await G(() => {
    const g = window.__BOYOTA__.game;
    g.money = 1e7;
    const res = [...g.dinoReserved()].map((k) => k.split(',').map(Number));
    const [x, z] = res[0];
    const r = g.checkPlacement('daraxt', x, z, 0);
    // tana atrofini daraxtlar bilan o‘rab qo‘yamiz (qurilish tizimi orqali)
    const set = new Set(g.dinoReserved());
    let placed = 0;
    for (const [a, b] of res) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const cx = a + dx, cz = b + dz;
      if (set.has(cx + ',' + cz) || g.objectAt(cx, cz)) continue;
      if (g.placeBuilding('daraxt', cx, cz, 0).ok) placed++;
    }
    if (g.paused) g.togglePause();
    let clear = true; const modes = {};
    for (let i = 0; i < 600; i++) { g.update(0.05); modes[g.dino.mode] = 1; if (!g.dinoBodyClear()) clear = false; }
    g.togglePause();
    return { ok: r.ok, reason: r.reason, placed, clear, modes };
  });
  check('Dinozavr turgan/yuradigan kataklarga qurib bo‘lmaydi (sabab ko‘rsatiladi)', !blk.ok && /dinozavr/.test(blk.reason), blk.reason);
  check('Atrofi yopilganda xavfsiz joyda turadi yoki buriladi — to‘siqqa kirmaydi', blk.placed > 0 && blk.clear, JSON.stringify(blk));
  // to‘siqlarni olib tashlaymiz
  await G(() => { const g = window.__BOYOTA__.game; for (const o of g.list) if (o.type === 'daraxt' && o.userPlaced) g.demolish(o.id); });

  // ---------- pauza, yashirin tab, katta dt ----------
  const pz = await G(async () => {
    const g = window.__BOYOTA__.game;
    if (!g.paused) g.togglePause();
    const a = JSON.stringify(g.dino);
    await new Promise((r) => setTimeout(r, 1500));
    const b = JSON.stringify(g.dino);
    g.togglePause();
    g.setTabHidden(true);
    const c0 = JSON.stringify(g.dino);
    await new Promise((r) => setTimeout(r, 1000));
    const c1 = JSON.stringify(g.dino);
    g.setTabHidden(false);
    const p0 = { x: g.dino.ax, z: g.dino.az };
    g.update(30);
    const jump = Math.hypot(g.dino.ax - p0.x, g.dino.az - p0.z);
    g.togglePause();
    return { pauseSame: a === b, hiddenSame: c0 === c1, jump };
  });
  check('Pauzada va yashirin tabda harakat va animatsiya to‘xtaydi; qaytganda sakramaydi (katta dt 0,25 s gacha cheklanadi — bir kadrlik oddiy qadam)', pz.pauseSame && pz.hiddenSame && pz.jump < 0.4, JSON.stringify(pz));

  // ---------- kamera rakurslari ----------
  await page.addStyleTag({ content: '[data-ui] { visibility: hidden !important; }' });
  const shotsAt = async (tag, az, dist, polar) => {
    const d = await G(() => window.__BOYOTA__.game.dino);
    await G(([x, z, az, dist, polar]) => window.__BOYOTA__.scene.cam.set({ targetX: x - 20, targetZ: z - 20, azimuth: az, polar, distance: dist }), [d.ax, d.az, az, dist, polar]);
    await frames(3);
    await page.screenshot({ path: `${OUT}/${tag}.png`, timeout: 120000 });
  };
  for (const [i, az] of [0.3, 1.9, 3.5, 5.0].entries()) {
    await G(() => { const g = window.__BOYOTA__.game; if (g.paused) g.togglePause(); for (let k = 0; k < 30; k++) g.update(0.05); g.togglePause(); });
    await shotsAt(`yaqin-${i + 1}`, az, 5.5, 0.9);
  }
  await shotsAt('uzoq', 0.6, 30, 0.7);
  await page.addStyleTag({ content: '[data-ui] { visibility: visible !important; }' });

  // ---------- saqlash va qayta yuklash ----------
  await page.click('[data-testid="settings"]');
  await page.click('[data-testid="save-now"]');
  await page.click('[data-testid="open-credits"]');
  const credTxt = await page.locator('[data-testid="credits"]').innerText().catch(() => '');
  check('Credits oynasi: muallif, model, litsenziya va havolalar', /Yea/.test(credTxt) && /CC-BY-4.0/.test(credTxt) && /sketchfab\.com\/3d-models/.test(credTxt) && /creativecommons\.org/.test(credTxt), credTxt.replace(/\n/g, ' | ').slice(0, 200));
  await page.screenshot({ path: `${OUT}/credits.png` });
  await page.keyboard.press('Escape');
  const before = await G(() => JSON.stringify(window.__BOYOTA__.game.dino));
  await page.reload();
  await page.waitForFunction(() => window.__BOYOTA__);
  await page.waitForFunction(() => window.__BOYOTA__.scene.dinoWalker.diag.status !== 'loading', null, { timeout: 180000 });
  const after = await G(() => ({ d: window.__BOYOTA__.game.dino, count: (() => { let n = 0; window.__BOYOTA__.scene.scene.traverse((o) => { if (o.name === 'apato') n++; }); return n; })() }));
  const b0 = JSON.parse(before);
  check('Refresh: joy, yo‘nalish va holat tiklandi; dinozavrlar ko‘paymadi', after.count === 2 && Math.hypot(after.d.ax - b0.ax, after.d.az - b0.az) < 0.5 && Math.abs(after.d.heading - b0.heading) < 0.2, JSON.stringify({ count: after.count, before: [b0.ax, b0.az, b0.mode], after: [after.d.ax, after.d.az, after.d.mode] }));
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
