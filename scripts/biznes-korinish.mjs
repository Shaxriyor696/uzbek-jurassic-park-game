// Biznes binolarini sahnada joylashtirib, har birini 4 rakursdan suratga oladi va model chegaralarini o‘lchaydi.
// Ishga tushirish: npm run build && node scripts/biznes-korinish.mjs [chiqish-papka] [tur1,tur2,...]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = process.argv[2] || 'test-results/biznes';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
mkdirSync(OUT, { recursive: true });
const PORT = 4320;
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const exe = process.env.CHROMIUM_PATH || (existsSync(MAC_CHROME) ? MAC_CHROME : undefined);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); } };
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes(String(PORT)) && r()));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const G = (fn, a) => page.evaluate(fn, a);
const frames = async (n = 3) => {
  const s = await G(() => window.__BOYOTA__.scene.frameCount);
  await page.waitForFunction(([s, n]) => window.__BOYOTA__.scene.frameCount >= s + n, [s, n], { timeout: 60000 });
};
try {
  await page.goto(`http://localhost:${PORT}/?test=1`);
  await G(() => localStorage.clear());
  await page.goto(`http://localhost:${PORT}/?test=1`);
  await page.waitForFunction(() => window.__BOYOTA__);
  await frames(4);
  // UI ni yashirib, faqat sahnani suratga olamiz
  await page.addStyleTag({ content: '.ui-layer, .hover-hint { display: none !important; }' });
  await G(() => {
    const g = window.__BOYOTA__.game;
    g.togglePause();
    g.money = 1e9;
    for (const o of g.list) if (o.type === 'daraxt') g.demolish(o.id);
  });
  const types = await G(() => window.__BOYOTA__.businessTypes);
  const list = ONLY ?? types;
  const results = [];
  for (const t of list) {
    // bo‘sh joy topib qurish (yo‘l shart emas — faqat ko‘rinish uchun)
    const placed = await G((t) => {
      const g = window.__BOYOTA__.game;
      for (let z = 30; z >= 2; z--) for (let x = 14; x <= 36; x++) {
        if (g.checkPlacement(t, x, z, 0).ok) {
          // atrofida 1 katak bo‘sh joy qolsin
          let free = true;
          for (let dz = -1; dz <= 7 && free; dz++) for (let dx = -1; dx <= 7 && free; dx++) {
            const id = g.occ.get(x + dx, z + dz);
            if (id) free = false;
          }
          if (!free) continue;
          const r = g.placeBuilding(t, x, z, 0);
          if (r.ok) return { x, z, id: g.objectAt(x, z).id };
        }
      }
      return null;
    }, t);
    if (!placed) { results.push({ type: t, error: 'joy topilmadi' }); continue; }
    await frames(2);
    const info = await G(({ t, id }) => {
      const { game: g, scene } = window.__BOYOTA__;
      const o = g.objects.get(id);
      const obj = scene.factory.create(t);
      obj.updateMatrixWorld(true);
      let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], meshes = 0, tris = 0;
      const out = [];
      obj.traverse((m) => {
        if (!m.isMesh) return;
        meshes++;
        const geo = m.geometry;
        tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
        geo.computeBoundingBox();
        const boxes = [];
        if (m.isInstancedMesh) {
          // billboard daraxtlar: kameraga buriladi, shuning uchun eni X va Z da bir xil olinadi
          const im = new m.matrixWorld.constructor();
          for (let i = 0; i < m.count; i++) {
            m.getMatrixAt(i, im);
            const bb = geo.boundingBox.clone().applyMatrix4(im);
            const half = (bb.max.x - bb.min.x) / 2, c = (bb.max.z + bb.min.z) / 2;
            bb.min.z = c - half; bb.max.z = c + half;
            boxes.push(bb.applyMatrix4(m.matrixWorld));
          }
        } else boxes.push(geo.boundingBox.clone().applyMatrix4(m.matrixWorld));
        for (const bb of boxes) {
          for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], bb.min.getComponent(k)); max[k] = Math.max(max[k], bb.max.getComponent(k)); }
          const c = window.__BOYOTA__.catalog[t];
          if (bb.max.x > c.width / 2 + 1e-3 || bb.min.x < -c.width / 2 - 1e-3 || bb.max.z > c.depth / 2 + 1e-3 || bb.min.z < -c.depth / 2 - 1e-3) {
            out.push({ mat: m.material?.color?.getHexString?.() ?? m.name, min: bb.min.toArray().map((v) => +v.toFixed(2)), max: bb.max.toArray().map((v) => +v.toFixed(2)) });
          }
        }
      });
      const c = window.__BOYOTA__.catalog[t];
      return { w: c.width, d: c.depth, min, max, meshes, tris: Math.round(tris), x: o.gridX, z: o.gridZ, outside: out.slice(0, 5) };
    }, { t, id: placed.id });
    results.push({ type: t, ...info });
    const cx = placed.x + info.w / 2 - 20, cz = placed.z + info.d / 2 - 20;
    // baland binolar (universitet) to‘liq sig‘ishi uchun masofa balandlikka ham bog‘liq
    const dist = Math.max(info.w, info.d) * 1.05 + 1.0 + Math.max(0, info.max[1] - 1.2) * 1.3;
    let i = 0;
    for (const az of [0.55, 0.55 + Math.PI / 2, 0.55 + Math.PI, 0.55 + 1.5 * Math.PI]) {
      await G(([cx, cz, az, dist]) => window.__BOYOTA__.scene.cam.set({ targetX: cx, targetZ: cz, azimuth: az, polar: 0.62, distance: dist }), [cx, cz, az, dist]);
      await frames(3);
      await page.screenshot({ path: `${OUT}/${t}-${++i}.png`, timeout: 120000 });
    }
  }
  writeFileSync(`${OUT}/olchamlar.json`, JSON.stringify(results, null, 2));
  for (const r of results) {
    if (r.error) { console.log(r.type, r.error); continue; }
    const ex = [r.max[0] - r.min[0], r.max[1] - r.min[1], r.max[2] - r.min[2]].map((v) => v.toFixed(2));
    const inside = r.min[0] >= -r.w / 2 - 1e-3 && r.max[0] <= r.w / 2 + 1e-3 && r.min[2] >= -r.d / 2 - 1e-3 && r.max[2] <= r.d / 2 + 1e-3 && r.min[1] >= -1e-3;
    console.log(`${r.type.padEnd(12)} ${r.w}×${r.d}  o‘lcham ${ex.join(' × ')}  footprint ichida: ${inside ? 'ha' : 'YO‘Q'}  mesh ${r.meshes}, uchburchak ${r.tris}`);
    if (!inside) console.log('   chegaradan chiqqan:', JSON.stringify(r.outside));
  }
  console.log('Sahifa xatolari:', errors.length ? errors.slice(0, 5).join(' | ') : 'yo‘q');
} finally {
  await browser.close();
  stop();
}
