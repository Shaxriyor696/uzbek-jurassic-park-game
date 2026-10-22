// 7 ta yangi dinozavr brauzer sinovi: GLB yuklanishi va teksturalar, uy va bir-biriga nisbatan masshtab, harakat
// (yo‘l topish, quvish, kuzatish), pauza, saqlash/yuklash, eski dinozavr saqlanishi, mualliflik, suratlar.
// Ishga tushirish: npm run build && npm run test:dinozavrlar
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4331;
const URL = `http://localhost:${PORT}/?test=1&instant`;
const OUT = 'test-results/dinozavrlar';
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
page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const G = (fn, a) => page.evaluate(fn, a);
const frames = async (n = 2) => {
  const s = await G(() => window.__BOYOTA__.scene.frameCount);
  await page.waitForFunction(([s, n]) => window.__BOYOTA__.scene.frameCount >= s + n, [s, n], { timeout: 400000 });
};
const sim = (sec) => G((sec) => { const g = window.__BOYOTA__.game; for (let i = 0; i < sec * 20; i++) g.update(0.05); }, sec);

try {
  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForFunction(() => window.__BOYOTA__, null, { timeout: 120000 });
  await page.click('[data-testid="dastyor-ok"]').catch(() => {});
  const t0 = Date.now();
  await page.waitForFunction(() => window.__BOYOTA__.scene.herdView.status.every((s) => s.status === 'ok' || s.status === 'error'), null, { timeout: 600000 });
  const st = await G(() => window.__BOYOTA__.scene.herdView.diag());
  check('7 ta model yuklandi (navbat bilan), sahnada 13 nusxa (raptor, ankilozavr, JP triseratops — 3 tadan)', st.length === 7 && st.every((s) => s.status === 'ok' && s.inScene) && st.reduce((a, s) => a + s.count, 0) === 13, st.map((s) => `${s.type}:${s.status}×${s.count}${s.loadMs ? ' ' + s.loadMs + 'ms' : ''}`).join(', ') + ` (jami ${Date.now() - t0} ms)`);
  const tex = await G(() => {
    const out = {};
    window.__BOYOTA__.scene.scene.getObjectByName('herd').children.forEach((r) => {
      let maps = 0, missing = 0;
      r.traverse((o) => { if (o.isMesh) { const m = o.material; if (m.map) { maps++; if (!m.map.image || !m.map.image.width) missing++; } } });
      out[r.name] = [maps, missing];
    });
    return out;
  });
  check('Har modelda teksturalar yuklangan (rasm o‘lchami bor)', Object.values(tex).every(([m, x]) => m > 0 && x === 0), JSON.stringify(tex));
  const house = await G(() => {
    const s = window.__BOYOTA__.scene, g = window.__BOYOTA__.game;
    const h = g.list.find((o) => o.type === 'uy_a');
    const box = new (Object.getPrototypeOf(s.selBox.box).constructor)().setFromObject(s.nodes.get(h.id).obj);
    return +(box.max.y - box.min.y).toFixed(2);
  });
  const size = Object.fromEntries(st.map((s) => [s.type, s.size]));
  const H = (t) => size[t].height;
  check('Masshtab: T-rex, Spinozavr, Alice bir qavatli uy tomidan baland; uzunligi uy enidan katta', ['trex', 'spinosaurus', 'alice'].every((t) => H(t) > house && size[t].length > 2), `uy ${house}; ` + ['trex', 'spinosaurus', 'alice'].map((t) => `${t} h${H(t)} l${size[t].length}`).join(', '));
  check('Masshtab: Triseratoplar va Ankilozavr uy tomidan past, lekin yirik', ['triceratops_jp', 'triceratops', 'ankylosaurus'].every((t) => H(t) < house && H(t) > 0.6), ['triceratops_jp', 'triceratops', 'ankylosaurus'].map((t) => `${t} h${H(t)}`).join(', '));
  check('Masshtab: Raptor yiriklardan ancha kichik, odamdan (~0,18) katta', H('raptor') < H('triceratops') && H('raptor') > 0.25, `raptor h${H('raptor')}`);

  // harakat (o‘yin vaqti): 3 daqiqa
  const before = await G(() => window.__BOYOTA__.game.herd.dinos.map((d) => ({ t: d.type, x: d.x, z: d.z })));
  let modes = new Set(), chase = 0, clear = true;
  for (let i = 0; i < 72; i++) {
    await sim(5);
    const r = await G(() => { const h = window.__BOYOTA__.game.herd; return { m: h.dinos.map((d) => d.mode), clear: h.allClear() }; });
    r.m.forEach((m) => modes.add(m));
    if (r.m.includes('chase')) chase++;
    clear &&= r.clear;
  }
  const after = await G(() => window.__BOYOTA__.game.herd.dinos.map((d) => ({ t: d.type, x: d.x, z: d.z })));
  const dist = before.map((b, i) => `${b.t}:${Math.hypot(after[i].x - b.x, after[i].z - b.z).toFixed(1)}`);
  check('6 daqiqada yettalasi ham joyini o‘zgartirdi', before.every((b, i) => Math.hypot(after[i].x - b.x, after[i].z - b.z) > 1.5), dist.join(', '));
  check('Xulq holatlari xilma-xil (sayr, dam, kuzatish/ergashish va b.)', modes.size >= 4, [...modes].join(','));
  check('Hech qachon bino, suv, tog‘ yoki shahar ichiga kirmadi', clear);
  check('Quvish sodir bo‘ldi (5 s qadam bilan kuzatildi)', chase > 0, `${chase} marta`);

  // harakat kadrlari (vizual): raptor yugurayotganida 3 kadr
  await G(() => { const h = window.__BOYOTA__.game.herd; const r = h.dinos.find((d) => d.type === 'raptor'); r.mode = 'travel'; r.timer = 0; r.target = null; });
  for (let k = 0; k < 40; k++) { await sim(0.5); const m = await G(() => window.__BOYOTA__.game.herd.dinos.find((d) => d.type === 'raptor').speed); if (m > 0.8) break; }
  for (let f = 0; f < 3; f++) {
    await G(() => { const r = window.__BOYOTA__.game.herd.dinos.find((d) => d.type === 'raptor'); window.__BOYOTA__.scene.cam.set({ targetX: r.x - 20, targetZ: r.z - 20, azimuth: -r.heading, polar: 0.35, distance: 6 }); });
    await frames(3);
    await page.screenshot({ path: `${OUT}/raptor-${f}.png` });
    await sim(0.12);
  }
  // triseratops yurishi
  for (const t of ['triceratops_jp', 'triceratops', 'trex', 'alice', 'spinosaurus', 'ankylosaurus']) {
    await G((t) => { const d = window.__BOYOTA__.game.herd.dinos.find((q) => q.type === t); d.mode = 'wander'; d.timer = 0; d.target = null; }, t);
    for (let k = 0; k < 60; k++) { await sim(0.5); const v = await G((t) => window.__BOYOTA__.game.herd.dinos.find((d) => d.type === t).speed, t); if (v > 0.2) break; }
    for (let f = 0; f < 2; f++) {
      await G((t) => { const r = window.__BOYOTA__.game.herd.dinos.find((d) => d.type === t); window.__BOYOTA__.scene.cam.set({ targetX: r.x - 20, targetZ: r.z - 20, azimuth: -r.heading, polar: 0.35, distance: 7 }); }, t);
      await frames(3);
      await page.screenshot({ path: `${OUT}/${t}-${f}.png` });
      await sim(0.4);
    }
  }
  // har model surati
  const all = await G(() => window.__BOYOTA__.game.herd.dinos.map((d) => ({ t: d.type, x: d.x, z: d.z })));
  for (const d of all) {
    await G((d) => window.__BOYOTA__.scene.cam.set({ targetX: d.x - 20, targetZ: d.z - 20, azimuth: 0.7, polar: 0.5, distance: 14 }), d);
    await frames(3);
    await page.screenshot({ path: `${OUT}/model-${d.t}.png` });
  }

  // Alice og‘zi: ko‘pincha yopiq, vaqti-vaqti bilan ochiladi (o‘yin vaqti bilan)
  await G(() => { window.__BOYOTA__.game.paused = true; });
  const jawAt = async (simT, name) => {
    await G((t) => { const g = window.__BOYOTA__.game; g.simTime = t; const a = g.herd.dinos.find((d) => d.type === 'alice'); const def = window.__BOYOTA__.scene.herdView; window.__BOYOTA__.scene.cam.set({ targetX: a.x - 20 + Math.cos(a.heading) * 1.6, targetZ: a.z - 20 + Math.sin(a.heading) * 1.6, azimuth: Math.PI / 2 - a.heading + 1.2, polar: 0.3, distance: 4 }); void def; }, simT);
    await frames(3);
    await page.screenshot({ path: `${OUT}/alice-jaw-${name}.png` });
    return G(() => { const b = window.__BOYOTA__.scene.scene.getObjectByName('herd-alice').getObjectByName('joint_Jaw_01_048'); return +b.quaternion.angleTo(b.userData.__r ?? (b.userData.__r = b.quaternion.clone())).toFixed(3); });
  };
  const angles = [];
  for (let t = 0; t < 14; t += 0.4) angles.push(await G((t) => { const g = window.__BOYOTA__.game; g.simTime = t; window.__BOYOTA__.scene.herdView.update(0.016, window.__BOYOTA__.scene.cam.camera.position); const b = window.__BOYOTA__.scene.scene.getObjectByName('herd-alice').getObjectByName('joint_Jaw_01_048'); return b.quaternion.toArray(); }, t));
  const distinct = new Set(angles.map((q) => q.map((v) => v.toFixed(3)).join())).size;
  check('Alice jag‘i harakatlanadi (ko‘pincha bir xil yopiq holat, ba’zan ochiladi)', distinct >= 3 && distinct < angles.length, `${distinct} xil holat / ${angles.length} namuna`);
  await jawAt(5, 'closed');

  // pauza
  await G(() => { window.__BOYOTA__.game.paused = true; });
  const p1 = await G(() => JSON.stringify(window.__BOYOTA__.game.herd.dinos));
  await frames(20);
  check('Pauzada dinozavrlar va taymerlar to‘xtaydi', p1 === (await G(() => JSON.stringify(window.__BOYOTA__.game.herd.dinos))));
  // saqlash/yuklash (pauzada — sahifa yopilguncha holat o‘zgarmasin)
  await G(() => window.__BOYOTA__.game.saveNow(true));
  const s1 = await G(() => window.__BOYOTA__.game.herd.dinos.map((d) => [d.id, d.type, +d.x.toFixed(3), +d.z.toFixed(3)]));
  await page.goto(URL);
  await page.waitForFunction(() => window.__BOYOTA__, null, { timeout: 120000 });
  const s2 = await G(() => window.__BOYOTA__.game.herd.dinos.map((d) => [d.id, d.type, +d.x.toFixed(3), +d.z.toFixed(3)]));
  // yuklangach o‘yin bir necha kadr yurgan bo‘lishi mumkin — joy 1 katak ichida (qayta joylanmagan), ID va tur aynan
  const same = s1.length === s2.length && s1.every((a, i) => a[0] === s2[i][0] && a[1] === s2[i][1] && Math.hypot(a[2] - s2[i][2], a[3] - s2[i][3]) < 1);
  check('Saqlash/yuklash: 13 ta, o‘sha ID, tur va joy (qayta joylanmadi); takrorlanmadi', same && new Set(s2.map((x) => x[1])).size === 7, JSON.stringify(s1.map((a, i) => [a[1], +Math.hypot(a[2] - s2[i][2], a[3] - s2[i][3]).toFixed(3)])));
  await page.waitForFunction(() => window.__BOYOTA__.scene.dinoWalker.diag.status !== 'loading', null, { timeout: 300000 });
  check('Eski yuruvchi dinozavr (apatozavr) saqlangan', (await G(() => window.__BOYOTA__.game.dinos.length)) === 2);
  const saved = await G(() => JSON.parse(localStorage.getItem('boyota.save.v1')));
  check('Saqlashda sxema 10 va herd maydoni (holat, taymer, maqsad)', saved.schemaVersion === 10 && saved.creatures.herd.length === 13 && saved.creatures.herd.every((d) => 'mode' in d && 'timer' in d && 'target' in d && 'partner' in d));

  // mualliflik
  await G(() => window.__BOYOTA__.game.openModal('credits'));
  await frames(2);
  // og‘ir sahnada modal chizilishi sekin — matn to‘liq bo‘lguncha kutiladi
  await page.waitForFunction(() => ((document.querySelector('[data-testid="herd-credits"]')?.textContent ?? '').match(/CC-BY-4\.0/g) ?? []).length >= 7, null, { timeout: 120000 }).catch(() => {});
  const cr = await page.locator('[data-testid="herd-credits"]').textContent();
  check('Mualliflik bo‘limida 7 model (GLB dan: muallif, litsenziya, manba)', (cr.match(/CC-BY-4\.0/g) ?? []).length === 7 && /Ziggertron/.test(cr) && /Marco/.test(cr) && /Alexey Zaika/.test(cr) && /Radassic/.test(cr) && /Yea/.test(cr));
  await page.screenshot({ path: `${OUT}/credits.png` });
  const ri = await G(() => window.__BOYOTA__.scene.renderer.info);
  check('Sahifada xato yo‘q', errors.length === 0, errors.slice(0, 3).join(' | ') + ` (chizish ${ri.render.calls}, uchburchak ${ri.render.triangles}, geometriya ${ri.memory.geometries}, tekstura ${ri.memory.textures})`);
} catch (e) {
  check('Sinov xatosiz tugadi', false, String(e?.stack || e));
} finally {
  writeFileSync(`${OUT}/natija.json`, JSON.stringify(results, null, 2));
  const fail = results.filter((r) => !r.ok).length;
  console.log(`Jami: ${results.length - fail} o‘tdi, ${fail} xato`);
  await browser.close();
  stop();
  process.exit(fail ? 1 : 0);
}
