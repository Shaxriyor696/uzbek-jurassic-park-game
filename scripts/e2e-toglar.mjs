// Kengaytirilgan xarita (80×80) va 3D tog‘lar brauzer sinovi: relyef, tik joyda qizil preview va sabab, yangi hududda
// qurish, kamera chegarasi/yer ostiga kirmaslik, tuman, saqlash/yuklashda tog‘lar siljimasligi, suratlar.
// Ishga tushirish: npm run build && npm run test:toglar
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4330;
const URL = `http://localhost:${PORT}/?test=1&instant`;
const OUT = 'test-results/toglar';
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
  await page.waitForFunction(([s, n]) => window.__BOYOTA__.scene.frameCount >= s + n, [s, n], { timeout: 120000 });
};
const ov = () => G(() => window.__BOYOTA__.scene.overlayState());
const setCam = async (c) => { await G((c) => window.__BOYOTA__.scene.cam.set(c), c); await frames(3); };

try {
  await page.goto(URL);
  await G(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForFunction(() => window.__BOYOTA__, null, { timeout: 120000 });
  await frames(3);
  await page.click('[data-testid="dastyor-ok"]').catch(() => {});

  const t = await G(() => {
    const { game: g, scene: s } = window.__BOYOTA__;
    return { kinds: [...new Set(g.terrain.mountains.map((m) => m.kind))].sort(), n: g.terrain.mountains.length, flat: g.terrainField.flatRatio(), stats: s.terrainView?.stats, forest: s.forest?.count ?? 0, mapSize: g.terrain.mapSize };
  });
  check('Xarita 80×80; 4 xil tog‘ (qoyali, qarag‘ayli, qorli, vodiyli) haqiqiy 3D mesh', t.mapSize === 80 && t.kinds.join() === 'pine,rocky,snowy,valley' && t.stats.chunks > 0 && t.stats.triangles > 10000, JSON.stringify(t));
  check('Xaritaning kamida 70% tekis (qurish mumkin)', t.flat >= 0.7, (t.flat * 100).toFixed(1) + '%');
  check('Tog‘larda va chekkalarda tabiiy (rasmli) daraxtlar bor', t.stats.trees > 200 && t.forest > 1000, `tog‘da ${t.stats.trees}, chekkada ${t.forest}`);
  check('Tog‘ meshlari bo‘laklarga bo‘lingan, umumiy material, soya tashlamaydi', await G(() => {
    const ms = window.__BOYOTA__.scene.terrainView.meshes;
    return ms.length > 4 && new Set(ms.map((m) => m.material)).size === 1 && ms.every((m) => !m.castShadow && m.receiveShadow);
  }));

  // tik katak: qurish rejimida qizil iz + sabab
  const steep = await G(() => {
    const g = window.__BOYOTA__.game;
    for (let z = -20; z <= 59; z++) for (let x = -20; x <= 59; x++) if (g.terrainField.cellHeight(x, z) > 1.5 && g.terrainField.cellHeight(x + 1, z) > 1.5) return { x, z, h: g.terrainField.cellHeight(x, z) };
    return null;
  });
  check('Xarita ichida tik (tog‘) katak bor', !!steep, JSON.stringify(steep));
  await G(() => window.__BOYOTA__.game.setTool('build', 'daraxt'));
  await setCam({ targetX: steep.x - 20 + 0.5, targetZ: steep.z - 20 + 0.5, azimuth: 0.3, polar: 1.15, distance: 30 });
  // ekrandagi nuqta — relyef sirtida (katak markazi, balandligi bilan)
  const pt = await G(([x, z, h]) => {
    const s = window.__BOYOTA__.scene;
    const v = s.cam.camera.position.clone().set(x - 20 + 0.5, h, z - 20 + 0.5).project(s.cam.camera);
    const r = s.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, [steep.x, steep.z, await G(([x, z]) => window.__BOYOTA__.game.terrainField.heightAt(x + 0.5, z + 0.5), [steep.x, steep.z])]);
  await page.mouse.move(pt.x, pt.y, { steps: 3 });
  await frames(3);
  const o1 = await ov();
  const hint = await page.locator('[data-testid="hover-hint"]').textContent().catch(() => '');
  check('Tog‘ ustida: qizil preview va «Bu joyning qiyaligi qurilish uchun mos emas»', o1.footprintVisible && o1.footprintColor === '#ff4d4d' && /qiyaligi qurilish uchun mos emas/.test(hint), `${o1.footprintColor} «${hint}»`);
  await page.screenshot({ path: `${OUT}/01-tik-joy-qizil.png` });
  const before = await G(() => window.__BOYOTA__.game.list.length);
  const money0 = await G(() => window.__BOYOTA__.game.money);
  await page.mouse.down(); await page.mouse.up(); await frames(3);
  check('Tog‘ ustiga qurilmaydi (bosilganda ham), pul yechilmaydi', (await G(() => window.__BOYOTA__.game.list.length)) === before && (await G(() => window.__BOYOTA__.game.money)) >= money0);

  // yangi hududda qurish
  const flat = await G(() => {
    const g = window.__BOYOTA__.game;
    for (let z = 45; z <= 57; z++) for (let x = -18; x <= -8; x++) {
      let ok = true;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (g.terrainField.cellHeight(x + dx, z + dz) > 0 || g.objectAt(x + dx, z + dz)) ok = false;
      if (ok) return { x, z };
    }
    return null;
  });
  await setCam({ targetX: flat.x - 20 + 0.5, targetZ: flat.z - 20 + 0.5 + 3, azimuth: 0, polar: 1.1, distance: 26 });
  const p2 = await G(([x, z]) => window.__BOYOTA__.scene.cellToClient(x, z), [flat.x, flat.z]);
  await page.mouse.move(p2.x, p2.y, { steps: 3 });
  await frames(3);
  const o2 = await ov();
  check('Yangi hududda (xaritaning eski chegarasidan tashqarida) yashil preview', o2.footprintColor === '#3ddc84', JSON.stringify(flat));
  await page.mouse.down(); await page.mouse.up(); await frames(3);
  const placed = await G(([x, z]) => window.__BOYOTA__.game.objectAt(x, z)?.type ?? null, [flat.x, flat.z]);
  check('Yangi hududda daraxt (obyekt) qurildi', placed === 'daraxt', String(placed));
  await G(() => window.__BOYOTA__.game.setTool('select'));

  // kamera
  await setCam({ targetX: 0, targetZ: 0, azimuth: 0.6, polar: 0.8, distance: 999 });
  const cam = await G(() => ({ d: window.__BOYOTA__.scene.cam.state.distance, far: window.__BOYOTA__.scene.cam.camera.far, fog: [window.__BOYOTA__.scene.scene.fog.near, window.__BOYOTA__.scene.scene.fog.far] }));
  check('Kamera: maksimal masofa 80×80 xaritaga mos, far tog‘larni kesmaydi, tuman uzoqda', cam.d === 120 && cam.far >= 1000 && cam.fog[0] > 100 && cam.fog[1] > 300, JSON.stringify(cam));
  await page.screenshot({ path: `${OUT}/02-butun-xarita.png` });
  await setCam({ targetX: 99, targetZ: -99, azimuth: 0, polar: 0.5, distance: 20 });
  const pan = await G(() => window.__BOYOTA__.scene.cam.state);
  check('Kamera nishoni xarita chegarasida qoladi', Math.abs(pan.targetX) <= 44 && Math.abs(pan.targetZ) <= 44, `${pan.targetX}, ${pan.targetZ}`);
  // tog‘ yonida past burchak: kamera relyef ichiga kirmaydi
  const m = await G(() => { const g = window.__BOYOTA__.game; return g.terrain.mountains.filter((q) => Math.abs(q.x - 20) < 60 && Math.abs(q.z - 20) < 60).sort((a, b) => b.h - a.h)[0]; });
  let under = 0;
  for (let a = 0; a < 12; a++) {
    await setCam({ targetX: Math.max(-44, Math.min(44, m.x - 20)), targetZ: Math.max(-44, Math.min(44, m.z - 20)), azimuth: (a / 12) * 6.28, polar: 0.44, distance: 12 });
    under += await G(() => { const s = window.__BOYOTA__.scene, p = s.cam.camera.position; return p.y < window.__BOYOTA__.game.terrainField.heightAt(p.x + 20, p.z + 20) + 2 ? 1 : 0; });
  }
  check('Kamera tog‘ ichiga kirmaydi (12 burchakdan)', under === 0, `${under} ta`);
  await page.screenshot({ path: `${OUT}/03-tog-yaqin.png` });

  // saqlash/yuklash
  await G(() => window.__BOYOTA__.game.saveNow(true));
  const t1 = await G(() => JSON.stringify(window.__BOYOTA__.game.terrain));
  await page.goto(URL);
  await page.waitForFunction(() => window.__BOYOTA__, null, { timeout: 120000 });
  await frames(3);
  const t2 = await G(() => JSON.stringify(window.__BOYOTA__.game.terrain));
  const saved = await G(() => JSON.parse(localStorage.getItem('boyota.save.v1')));
  check('Qayta yuklashda tog‘lar siljimaydi (saqlangan terrain bir xil), sxema 10', t1 === t2 && saved.schemaVersion === 10 && saved.terrain.version === 2 && saved.terrain.waters.length > 5);
  check('Yangi hududdagi obyekt saqlandi', (await G(([x, z]) => window.__BOYOTA__.game.objectAt(x, z)?.type ?? null, [flat.x, flat.z])) === 'daraxt');
  const ri = await G(() => window.__BOYOTA__.scene.renderer.info.render);
  check('Sahifada xato yo‘q', errors.length === 0, errors.slice(0, 3).join(' | ') + ` (chizish: ${ri.calls} chaqiriq)`);
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
