import * as THREE from 'three';
import { Builder, mat } from './builder';
import { flatRoof, onFace, sign, tree, txt, Y0, type Face } from './businessParts';
import { basic, bench, facePanel, glassBox, hvac, lawn, plaza, texMat } from './educationModels';
import { girihPanelTexture, ribbonWindowTexture, warmCurtainTexture } from './textures';

/**
 * Shifoxona (docs/shifoxona-rasmlar/1–4.png): to‘rt qavatli oq-krem bino. Old tomonda oldinga chiqqan baland markaziy
 * blok — katta iliq yoritilgan oynali fasad, ikki yonida milliy geometrik naqshli panellar, tepasida ko‘k
 * «SHIFOXONA» yozuvi; uning oldida ustunli, shisha tomli kirish ayvoni, zinapoya va panjarali pandus. Yon qanotlarda
 * ko‘k lenta derazalar, burchak risalitlarida oltin rangli tik detallar va naqshli panellar. O‘ng yonda soyabonli
 * tez yordam kirishi (dekorativ mashina) va unga boradigan asfalt yo‘l. Tom pog‘onali: texnik bloklar,
 * konditsionerlar va burchaklarda kichik bog‘lar. Atrofda maysa, butalar, past chiroqlar, sarv va daraxtlar.
 * Orqa va yon tomonlar 2–3-rasmlar bo‘yicha (lenta derazalar, oltin tasmalar, naqsh, xizmat eshiklari).
 * Footprint 3×3 (PRD) — model shu maydonga bir xil nisbatda kichraytirilgan.
 */
export function hospitalRecipe(b: Builder, w: number, d: number) {
  plaza(b, w, d, { chamfer: 0.35, top: '#dad6ce', base: '#a9a7a2' });
  const cream = mat('#efe5d1', { rough: 0.75 });
  const cream2 = mat('#f5eee0', { rough: 0.7 });
  const gold = mat('#c9a35a', { rough: 0.4, metal: 0.35 });
  const blue = mat('#2c6f95', { rough: 0.4 });
  const ribbon = texMat('ribbon', ribbonWindowTexture, { rough: 0.25, metal: 0.25 });
  const girih = texMat('girih', girihPanelTexture, { rough: 0.6 });
  const warm = texMat('warmCurtain', warmCurtainTexture, { rough: 0.3, metal: 0.1 });

  // ---- asosiy hajm (4 qavat) ----
  const W = 2.3, D = 1.2, H = 0.8, fh = 0.2, cx = 0, cz = -0.45;
  b.box(W, H, D, cream, cx, Y0, cz);
  b.box(W + 0.02, 0.05, D + 0.02, mat('#d9cdb4', { rough: 0.8 }), cx, Y0, cz);
  flatRoof(b, W, D, cx, Y0 + H, cz, '#8f9196', '#f5eee0');
  // lenta derazalar: har qavatda; old tomonda faqat qanotlarda
  const band = (face: Face, t: number, len: number) => {
    for (let f = 0; f < 4; f++) facePanel(b, face, W, D, cx, cz, t, 0.004, len, 0.11, Y0 + f * fh + 0.05, ribbon, [Math.max(1, Math.round(len / 0.11)), 1]);
  };
  band('front', -0.67, 0.42);
  band('front', 0.67, 0.42);
  for (const face of ['left', 'right'] as Face[]) {
    band(face, -0.33, 0.42);
    band(face, 0.36, 0.36);
  }
  band('back', -0.75, 0.6);
  band('back', 0, 0.5);
  band('back', 0.75, 0.6);
  // gorizontal qavat chiziqlari (krem karniz)
  for (let f = 1; f <= 4; f++) b.box(W + 0.03, 0.015, D + 0.03, cream2, cx, Y0 + f * fh - 0.01, cz);

  // ---- burchak risalitlari (old va orqa): oltin tasma, naqshli panel, tor derazalar ----
  const RW = 0.36;
  for (const sx of [-1, 1]) {
    for (const back of [false, true]) {
      const rx = cx + sx * (W / 2 - RW / 2);
      const rz = back ? cz - D / 2 - 0.03 : cz + D / 2 + 0.03;
      b.box(RW, H + 0.08, 0.06, cream2, rx, Y0, rz);
      const face: Face = back ? 'back' : 'front';
      const ft = (lt: number) => (back ? -lt : lt);
      // tor deraza ustuni
      for (let f = 0; f < 4; f++) facePanel(b, face, RW, 0.06, rx, rz, ft(sx * 0.07), 0.004, 0.13, 0.11, Y0 + f * fh + 0.05, ribbon, [1, 1]);
      // oltin tik tasma va naqsh paneli
      const pg = onFace(face, RW, 0.06, rx, rz, ft(-sx * 0.06), 0.012);
      b.box(face === 'front' || face === 'back' ? 0.045 : 0.02, H - 0.04, face === 'front' || face === 'back' ? 0.02 : 0.045, gold, pg.x, Y0 + 0.04, pg.z);
      facePanel(b, face, RW, 0.06, rx, rz, ft(-sx * 0.135), 0.006, 0.06, H - 0.12, Y0 + 0.08, girih, [1, 4]);
    }
    // yon tomonlarda: oltin tasma va naqsh paneli (2–3-rasmlar)
    const sf: Face = sx < 0 ? 'left' : 'right';
    const pg = onFace(sf, W, D, cx, cz, 0.02, 0.01);
    b.box(0.02, H - 0.04, 0.05, gold, pg.x, Y0 + 0.04, pg.z);
    facePanel(b, sf, W, D, cx, cz, -0.06, 0.006, 0.07, H - 0.12, Y0 + 0.08, girih, [1, 4]);
  }
  // orqa markazda ham oltin tasmalar
  for (const t of [-0.35, 0.35]) {
    const p = onFace('back', W, D, cx, cz, t, 0.01);
    b.box(0.05, H - 0.04, 0.02, gold, p.x, Y0 + 0.04, p.z);
  }

  // ---- markaziy baland blok: oynali fasad, naqshli panellar, «SHIFOXONA» ----
  const CW = 0.9, CD = 0.5, CH = 1.0;
  const ccz = cz + D / 2 - CD / 2 + 0.14;
  b.box(CW, CH, CD, cream2, cx, Y0, ccz);
  b.box(CW + 0.04, 0.03, CD + 0.04, cream, cx, Y0 + CH, ccz);
  flatRoof(b, CW - 0.02, CD - 0.02, cx, Y0 + CH + 0.03, ccz, '#8f9196', '#f5eee0');
  const cf = ccz + CD / 2;
  glassBox(b, 0.48, 0.58, 0.02, warm, cx, Y0 + 0.24, cf - 0.005, 0.08);
  for (let i = 0; i <= 5; i++) b.box(0.012, 0.58, 0.012, blue, cx - 0.24 + i * 0.096, Y0 + 0.24, cf + 0.008);
  for (let k = 0; k < 3; k++) b.box(0.48, 0.01, 0.012, blue, cx, Y0 + 0.24 + 0.19 * (k + 1), cf + 0.008);
  for (const sx of [-1, 1]) {
    facePanel(b, 'front', CW, CD, cx, ccz, sx * 0.34, 0.004, 0.13, 0.62, Y0 + 0.22, girih, [1, 4]);
    b.box(0.02, 0.66, 0.012, blue, cx + sx * 0.26, Y0 + 0.2, cf + 0.006);
  }
  sign(b, 'front', CW, CD, cx, Y0 + 0.86, ccz, 0, 0.78, 0.11, { lines: [txt('SHIFOXONA', '#1f4f8f', 0.95)], bg: null });
  // kirish eshiklari (oynali)
  glassBox(b, 0.46, 0.2, 0.012, texMat('doorGlass', ribbonWindowTexture, { rough: 0.2, metal: 0.3 }), cx, Y0 + 0.01, cf + 0.002, 0.08);

  // ---- kirish ayvoni: ustunlar, shisha tom, zinapoya, pandus ----
  const az0 = cf, AD = 0.42, AW = 1.0;
  const azc = az0 + AD / 2;
  b.box(AW, 0.05, AD, cream2, cx, Y0 + 0.24, azc);
  b.box(AW + 0.02, 0.012, AD + 0.02, blue, cx, Y0 + 0.232, azc);
  b.box(AW - 0.2, 0.012, AD - 0.14, mat('#7fb4d4', { rough: 0.08, metal: 0.35 }), cx, Y0 + 0.292, azc);
  for (let i = 1; i < 5; i++) b.box(0.006, 0.014, AD - 0.14, mat('#e9edf0'), cx - (AW - 0.2) / 2 + i * ((AW - 0.2) / 5), Y0 + 0.293, azc);
  b.box(AW, 0.03, 0.03, cream, cx, Y0 + 0.29, az0 + AD - 0.015);
  for (const sx of [-1, 1]) b.box(0.03, 0.03, AD, cream, cx + sx * (AW / 2 - 0.015), Y0 + 0.29, azc);
  for (const sx of [-0.45, -0.15, 0.15, 0.45]) {
    b.box(0.045, 0.24, 0.045, cream2, cx + sx, Y0, az0 + AD - 0.04);
    b.box(0.047, 0.16, 0.012, blue, cx + sx, Y0 + 0.04, az0 + AD - 0.015);
  }
  b.box(AW, 0.012, AD, mat('#e6dccb', { rough: 0.6 }), cx, Y0, azc);
  for (let k = 0; k < 3; k++) b.box(0.5, 0.02, 0.06, mat('#d8d2c5'), cx - 0.1, Y0 + k * 0.02 - 0.02 * 0, az0 + AD + 0.04 + (2 - k) * 0.05);
  const ramp = new THREE.BoxGeometry(0.14, 0.012, 0.5);
  ramp.rotateY(Math.PI / 2);
  ramp.rotateZ(0.1);
  b.add(ramp, mat('#d8d2c5'), cx - 0.62, Y0 + 0.025, az0 + AD + 0.05);
  const rail = mat('#b9bec4', { metal: 0.6, rough: 0.3 });
  for (const dz of [-0.07, 0.07]) b.box(0.5, 0.006, 0.006, rail, cx - 0.62, Y0 + 0.09, az0 + AD + 0.05 + dz);
  for (const x of [-0.35, 0.15]) b.box(0.006, 0.08, 0.2, rail, cx + x, Y0, az0 + AD + 0.12);
  // ayvon oldidagi tuvaklar
  for (const x of [-0.42, 0.42]) {
    b.box(0.08, 0.06, 0.08, mat('#e2d8c4'), cx + x, Y0, az0 + 0.06);
    b.bush(cx + x, az0 + 0.06, 0.5, undefined, Y0 + 0.06);
  }

  // ---- tez yordam kirishi (o‘ng yon) va asfalt yo‘l ----
  const ex = 1.12, ez = 0.42;
  b.box(0.5, 0.012, 1.55, mat('#6d7075', { rough: 0.85 }), ex, Y0, 0.72);
  b.box(0.5, 0.012, 0.36, mat('#6d7075', { rough: 0.85 }), 0.92, Y0, 1.32);
  for (let i = 0; i < 5; i++) b.box(0.012, 0.003, 0.1, mat('#eceae4'), ex, Y0 + 0.012, 0.2 + i * 0.25);
  b.box(0.46, 0.035, 0.36, cream2, ex, Y0 + 0.23, ez);
  b.box(0.48, 0.01, 0.38, blue, ex, Y0 + 0.225, ez);
  for (const sz of [-0.15, 0.15]) b.box(0.035, 0.23, 0.035, cream2, ex + 0.2, Y0, ez + sz);
  glassBox(b, 0.2, 0.2, 0.012, texMat('doorGlass', ribbonWindowTexture, { rough: 0.2, metal: 0.3 }), ex, Y0, cz + D / 2 + 0.002, 0.08);
  ambulance(b, ex - 0.02, ez + 0.05, 0);

  // ---- orqa va yon xizmat eshiklari (2–3-rasmlar) ----
  for (const [face, t] of [['back', 0.4], ['left', 0.15]] as const) {
    const p = onFace(face, W, D, cx, cz, t, 0.012);
    b.add(new THREE.PlaneGeometry(0.14, 0.2), mat('#5c646c', { rough: 0.5 }), p.x, Y0 + 0.11, p.z, p.ry);
    const q = onFace(face, W, D, cx, cz, t, 0.1);
    b.box(face === 'back' ? 0.26 : 0.18, 0.02, face === 'back' ? 0.18 : 0.26, cream2, q.x, Y0 + 0.24, q.z);
  }
  b.box(0.18, 0.14, 0.12, mat('#c9ccd0', { rough: 0.5, metal: 0.2 }), 0.85, Y0, cz - D / 2 - 0.12);

  // ---- tom: pog‘onali texnik bloklar, konditsionerlar, kichik bog‘lar ----
  const ry = Y0 + H;
  for (const [x, z, ww, dd, hh] of [[-0.45, -0.65, 0.7, 0.42, 0.14], [0.55, -0.7, 0.5, 0.36, 0.17], [0, -0.25, 0.36, 0.22, 0.1]] as const) {
    b.box(ww, hh, dd, cream2, x, ry, z);
    b.box(ww + 0.02, 0.015, dd + 0.02, cream, x, ry + hh, z);
  }
  b.box(0.36, 0.08, 0.26, cream2, cx, Y0 + CH + 0.03, ccz - 0.05);
  for (const [x, z, ww, dd] of [[-0.45, -0.65, 0.16, 0.12], [-0.25, -0.62, 0.12, 0.1], [0.5, -0.7, 0.14, 0.12], [0.75, -0.25, 0.12, 0.1], [-0.8, -0.2, 0.12, 0.1]] as const) {
    hvac(b, x, ry + (Math.abs(x + 0.45) < 0.3 && z < -0.5 ? 0.155 : x > 0.4 && z < -0.5 ? 0.185 : 0.012), z, ww, dd, 0.05);
  }
  for (const [x, z] of [[-0.95, 0.0], [0.95, 0.0], [-0.95, -0.9], [0.95, -0.9]] as const) {
    b.box(0.28, 0.04, 0.24, mat('#6f8f4a', { rough: 0.95 }), x, ry + 0.012, z);
    b.cypress(x - 0.05, z, 0.32, ry + 0.05);
    b.bush(x + 0.07, z + 0.03, 0.55, undefined, ry + 0.05);
  }

  // ---- hovli: maysalar, yo‘lak, past chiroqlar, daraxtlar ----
  lawn(b, -0.95, 0.75, 0.75, 0.45, 7, 3);
  lawn(b, -1.3, -0.4, 0.28, 1.1, 5, 7);
  lawn(b, 0.15, 1.25, 0.6, 0.3, 5, 11);
  lawn(b, -0.65, 1.3, 0.55, 0.28, 4, 5);
  for (const [x, z] of [[-0.55, 0.55], [-1.3, 0.55], [0.6, 0.95], [-0.25, 1.05], [-1.0, 1.15], [0.45, 1.45]] as const) {
    b.cyl(0.01, 0.01, 0.06, mat('#2a2d32', { metal: 0.4 }), x, Y0, z, 8);
    b.box(0.018, 0.01, 0.018, basic('#fff1c8'), x, Y0 + 0.06, z);
  }
  bench(b, -0.25, 1.4, Math.PI);
  for (const [x, z, k] of [
    [-1.3, 0.95, 'cypress'], [-0.8, 0.7, 'round'], [-1.32, 0.15, 'cypress'], [-1.32, -1.0, 'round'], [0.0, 1.25, 'cypress'],
    [-0.6, 1.3, 'round'], [0.55, 1.2, 'round'], [1.35, -0.3, 'cypress'], [1.35, -1.1, 'cypress'], [-0.3, -1.35, 'cypress'], [0.45, -1.35, 'round'],
  ] as const) tree(b, x, z, 0.65, k);
}

/** Tez yordam mashinasi (dekorativ): oq kuzov, qizil chiziq, ko‘k chiroq. Old tomoni +Z. */
function ambulance(b: Builder, x: number, z: number, ry: number) {
  const g = new Builder();
  const white = mat('#f6f6f4', { rough: 0.35, metal: 0.15 });
  g.rbox(0.13, 0.11, 0.24, white, 0, 0.025, -0.01, 0.015);
  g.rbox(0.13, 0.07, 0.07, white, 0, 0.025, 0.13, 0.015);
  g.box(0.11, 0.035, 0.005, mat('#33475c', { rough: 0.15, metal: 0.3 }), 0, 0.06, 0.167);
  g.box(0.132, 0.018, 0.2, mat('#d63a31', { rough: 0.5 }), 0, 0.07, -0.01);
  g.box(0.06, 0.012, 0.03, mat('#3a7bd5', { emissive: '#3a7bd5', rough: 0.3 }), 0, 0.137, 0.08);
  for (const sx of [-1, 1]) g.box(0.004, 0.04, 0.012, mat('#d63a31'), sx * 0.067, 0.09, -0.06);
  for (const sx of [-0.06, 0.06]) for (const sz of [-0.08, 0.1]) {
    const wgeo = new THREE.CylinderGeometry(0.022, 0.022, 0.018, 10);
    wgeo.rotateZ(Math.PI / 2);
    g.add(wgeo, mat('#26282b'), sx, 0.022, sz);
  }
  b.mergeFrom(g, x, z, ry, Y0);
}
