/**
 * 7 ta yangi dinozavr modeli (public/models/dinosaurs) — har biri uchun alohida sozlama. Qiymatlar GLB fayllarni
 * brauzerda tekshirib olingan (tools/dino-inspect.html): model o‘lchami (uzunlik — tana o‘qi bo‘yicha), old tomoni,
 * skelet, kliplar va oyoq yerga tekkan paytdagi tezlik (oyoq suyagi kuzatildi). Xulq sozlamalari — o‘yin uchun,
 * ilmiy tasdiqlangan xatti-harakat emas.
 */
export type HerdType = 'trex' | 'spinosaurus' | 'alice' | 'triceratops_jp' | 'triceratops' | 'ankylosaurus' | 'raptor';

export interface ClipSpec {
  clip: string;
  /** Klip bo‘lagi (soniya) — butun klip emas, faqat shu oraliq takrorlanadi */
  from?: number;
  to?: number;
  /** Oyoq yerga tekkanda o‘lchangan oldinga tezlik (model birligi / soniya, playback 1×da) */
  speed?: number;
  /** Faqat bitta kadr (statik poza) */
  frame?: number;
}

/**
 * Protsedurali yurish (animatsiyasi yo‘q, lekin ikki oyoqli skeleti bor modellar uchun): son suyagi butun oyoqni
 * tizzasi bilan birga yon o‘q atrofida buradi — tayanch fazasida oyoq uchi tana ostida bir tekis orqaga suriladi
 * (yer tezligi = qadam / tayanch vaqti), ko‘tarilish fazasida tizza bukiladi; tana tayanch oyoq yerda qolishi uchun
 * pastga/yuqoriga suriladi (oyoq sirpanmaydi, yerga botmaydi). Burilish ishoralari yuklanganda sinab aniqlanadi.
 */
export interface ProcGait {
  /** Model fazosidagi yon (son aylanish) o‘qi va oldinga o‘qi */
  lateral: [number, number, number];
  fwd: [number, number, number];
  legs: { hip: string; knee: string; ankle: string; toe: string; offset: number }[];
  tail: string[];
  /** Bitta qadam sikli (s) va tayanch ulushi */
  period: number;
  stance: number;
  /** Qadam uzunligi (model birligi) */
  stride: number;
  /** Ko‘tarilishda tizza bukilishi (rad) */
  lift: number;
}

export interface HerdDef {
  type: HerdType;
  name: string;
  /** public/models/dinosaurs ichidagi aniq fayl nomi (bo‘sh joy va qavs bilan ham) */
  file: string;
  /** Optimallashtirilgan nusxa ishlatilsa — asl fayl */
  sourceFile?: string;
  /** Modelning tana o‘qi bo‘yicha uzunligi (model birligi) */
  modelLength: number;
  /** O‘yindagi uzunlik (katak; 1 katak = 1 birlik) — masshtab = length / modelLength, barcha o‘qlarda bir xil */
  length: number;
  /** Modelning old tomoni (model XZ tekisligida, +X dan +Z ga burchak, radian) */
  forward: number;
  /**
   * Model markazidan eng uzoq nuqtagacha (odatda dum uchi) masofa, model birligida — o‘lchangan chegara qutisidan.
   * Tana doirasi shu bilan: dum boshqa dinozavr ichiga kirmasin
   */
  modelReach: number;
  /** Ovqat guruhi: o‘txo‘rlar faqat o‘txo‘rlarga, yirtqichlar yirtqichlarga ergashadi */
  diet: 'herbivore' | 'carnivore';
  /** Skelet/rig haqida (tekshiruv natijasi) */
  rig: string;
  /** Harakatlana oladimi (mos yurish klipi bor) */
  mobile: boolean;
  idle?: ClipSpec;
  walk?: ClipSpec;
  run?: ClipSpec;
  look?: ClipSpec[];
  /** Klipdagi siljish vertekslarga yozilgan (morph): ko‘rinishda bekor qilinadi, siljishni faqat o‘yin boshqaradi */
  bakedMotion?: { speed: number };
  /** Klip o‘rniga skelet bo‘yicha protsedurali yurish */
  gait?: ProcGait;
  /** Skeleti yo‘q model: yumshoq rig (three/softRig.ts) va qadam parametrlari */
  soft?: { legs: 2 | 4; baseFrac?: number; jaw?: { t: number; y: number; slope: number }; head?: { t: number; ramp: number; y: number; yMin: number }; hipFrac: number; kneeFrac: number; colMul: number; fwd: [number, number, number]; lateral: [number, number, number]; period: number; stance: number; stride: number; lift: number };
  /**
   * Jag‘ (tinch pozada og‘zi ochiq modellar): yopiq burchak (rad, model o‘qi atrofida, vizual tekshirilgan) va
   * vaqti-vaqti bilan qisqa ochilish burchagi
   */
  jaw?: { bone: string; axis: [number, number, number]; closed: number; open: number };
  /**
   * Tana jonliligi: bo‘yin/bosh suyaklari (asosdan boshga; `auto` — eng oldingi suyakdan avtomatik topiladi), tos va
   * dum suyaklari; bo‘yinning burilish chegarasi (rad). Skeleti yo‘q modellarda bosh `soft.head` mintaqasi bilan.
   */
  head?: { neck?: string[]; auto?: boolean; hips?: string; tail?: string[]; spine?: string[]; maxYaw: number; maxPitch: number; tailDamp?: number };
  /** Sayr va uzoq yo‘lda playback tezligi (yurish/yugurish klipiga nisbatan) */
  wanderRate: number;
  travelRate: number;
  /** Burilish tezligi (rad/s) */
  turnRate: number;
  /** Xulq og‘irliklari */
  behave: { wander: number; travel: number; rest: number; look: number; follow: number; watch: number; shore: number };
  restTime: [number, number];
  /** Quvishda quvuvchi bo‘la oladimi (yugurish klipi bor) */
  canChase: boolean;
  /** Boshlang‘ich joy turi */
  home: PoiKind;
  /** Shu turdan nechta nusxa (yo‘q bo‘lsa 1) */
  count?: number;
  limits: string;
}

export type PoiKind = 'foothill' | 'valley' | 'forest' | 'meadow' | 'shore' | 'cityEdge' | 'slope';


export const HERD_DEFS: HerdDef[] = [
  {
    type: 'trex', name: 'Tiranozavr (T. rex)', file: 'jurassic_world_dominion_t_rexdecalcomaniaar.glb',
    modelLength: 16.785, length: 4.4, forward: Math.PI / 2, modelReach: 9.623, diet: 'carnivore',
    rig: 'Skelet bor (77 suyak: son, boldir, panja, barmoq, dum, bosh), animatsiya kliplari yo‘q', mobile: true,
    // oyoq: son (y 4,51) → barmoq (y 0,23) ≈ 4,3 birlik; qadam 0,9×; sikl 1,7 s, tayanch 60%
    walk: { clip: '(protsedurali yurish)', speed: 3.87 / (0.6 * 1.7) },
    gait: {
      lateral: [1, 0, 0], fwd: [0, 0, 1], period: 1.7, stance: 0.6, stride: 3.87, lift: 0.55,
      legs: [
        { hip: 'TRex_Hips_L_Leg_upper1_03', knee: 'TRex_Hips_L_Leg_lower1_04', ankle: 'TRex_Hips_L_Leg_foot_05', toe: 'TRex_Hips_L_Leg_foot_toe_06', offset: 0 },
        { hip: 'TRex_Hips_R_Leg_upper1_013', knee: 'TRex_Hips_R_Leg_lower1_014', ankle: 'TRex_Hips_R_Leg_foot_015', toe: 'TRex_Hips_R_Leg_foot_toe_016', offset: 0.5 },
      ],
      tail: ['TRex_Hips_Tail1_053', 'TRex_Hips_Tail2_054', 'TRex_Hips_Tail3_055', 'TRex_Hips_Tail4_056', 'TRex_Hips_Tail5_057'],
    },
    head: {
      neck: ['TRex_Hips_Spine_025', 'TRex_Hips_Spine_Head_T1_026', 'TRex_Hips_Spine_Head_T2_027', 'TRex_Hips_Spine_Head_028'],
      hips: 'TRex_Hips_02', spine: ['TRex_Hips_Spine_T1_023', 'TRex_Hips_Spine_T2_024'], maxYaw: 0.75, maxPitch: 0.28,
      tail: ['TRex_Hips_Tail1_053', 'TRex_Hips_Tail2_054', 'TRex_Hips_Tail3_055', 'TRex_Hips_Tail4_056', 'TRex_Hips_Tail5_057'],
    },
    wanderRate: 0.55, travelRate: 0.8, turnRate: 0.35,
    behave: { wander: 2.5, travel: 2, rest: 1.2, look: 0, follow: 0.3, watch: 1.8, shore: 0.8 }, restTime: [2, 5], canChase: false, home: 'cityEdge',
    limits: 'Faylda animatsiya yo‘q — yurish skelet bo‘yicha protsedurali (oyoq, tana tebranishi, dum). Bosh va qo‘l harakati, yugurish yo‘q.',
  },
  {
    type: 'spinosaurus', name: 'Spinozavr',
    // asl fayl (82 MB, 1,5 mln uchburchak) saqlangan; o‘yinda alohida soddalashtirilgan nusxa (gltf-transform: join + weld + simplify 10%)
    file: 'optimized/spinosaurus_mirabilis.lod.glb', sourceFile: 'spinosaurus_mirabilis.glb',
    modelLength: 1.097, length: 4.8, forward: Math.atan2(0.6237, -0.7817), modelReach: 0.678, diet: 'carnivore',
    rig: 'Skelet yo‘q (bitta skan 13 bo‘lakka bo‘lingan), animatsiya yo‘q — o‘yinda «yumshoq rig» quriladi', mobile: true,
    // oyoq ≈ son balandligi 0,42×0,527 ≈ 0,22; qadam 0,2; sikl 1,6 s, tayanch 60%
    // qadam 0,14 (kichikroq — go‘sht cho‘zilmasin), sikl 1,6 s
    walk: { clip: '(protsedurali yurish, yumshoq rig)', speed: 0.14 / (0.6 * 1.6) },
    soft: {
      legs: 2, hipFrac: 0.42, kneeFrac: 0.2, colMul: 1.6, baseFrac: 0.021, fwd: [-0.7817, 0, 0.6237], lateral: [0.6237, 0, 0.7817],
      period: 1.6, stance: 0.6, stride: 0.14, lift: 0.28,
      // pastki jag‘: boshning yon profilidan o‘lchangan bo‘g‘in (t 0,3135; y 0,326); fayldagi poza ~25° ochiq
      jaw: { t: 0.3135, y: 0.326, slope: -0.05 },
      // bo‘yin asosi (profildan): t 0,17, y 0,40; bosh t > 0,20; qo‘llar (y < 0,25) kirmaydi
      head: { t: 0.17, ramp: 0.09, y: 0.4, yMin: 0.265 },
    },
    head: { maxYaw: 0.5, maxPitch: 0.18 },
    wanderRate: 0.6, travelRate: 0.8, turnRate: 0.35,
    behave: { wander: 2.5, travel: 1.5, rest: 1, look: 0, follow: 0.2, watch: 0.8, shore: 3 }, restTime: [2, 5], canChase: false, home: 'shore',
    limits: 'Rig va animatsiya yo‘q: yuklanganda geometriyadan oyoqlar topilib, son va tizza atrofida vertekslar shaderda buriladi (yumshoq rig). Bosh, dum, qo‘l harakati yo‘q; yugurish yo‘q. Fayl og‘ir (82 MB).',
  },
  {
    type: 'alice', name: 'Alice (allozavrsimon yirtqich)', file: 'land_of_the_lost_2009_alice (1).glb',
    modelLength: 11.817, length: 3.8, forward: 0, modelReach: 7.09, diet: 'carnivore',
    rig: 'Skelet bor (57 suyak: son, tizza, panja, dum, bo‘yin, bosh), animatsiya kliplari yo‘q', mobile: true,
    // oyoq: son (y 2,61) → barmoq (y 0,25) ≈ 2,43 birlik; qadam 0,9×; sikl 1,35 s
    walk: { clip: '(protsedurali yurish)', speed: 2.19 / (0.6 * 1.35) },
    gait: {
      lateral: [0, 0, 1], fwd: [1, 0, 0], period: 1.35, stance: 0.6, stride: 2.19, lift: 0.6,
      legs: [
        { hip: 'joint_HipLT_01_01', knee: 'joint_KneeLT_01_02', ankle: 'joint_FootLT_01_03', toe: 'joint_ToeLT_01_04', offset: 0 },
        { hip: 'joint_HipRT_01_011', knee: 'joint_KneeRT_01_012', ankle: 'joint_FootRT_01_013', toe: 'joint_ToeRT_01_014', offset: 0.5 },
      ],
      tail: ['joint_Tail01_01_022', 'joint_Tail02_01_023', 'joint_Tail03_01_024', 'joint_Tail04_01_025'],
    },
    // fayldagi poza — og‘iz katta ochiq; +0,55 rad da to‘liq yopiladi (kadrlar bilan tekshirildi)
    jaw: { bone: 'joint_Jaw_01_048', axis: [0, 0, 1], closed: 0.55, open: 0.18 },
    head: {
      neck: ['joint_NeckRotate_01_041', 'joint_NeckA_01_042', 'joint_NeckB_01_043', 'joint_Head_01_045'],
      hips: 'joint_HipMaster_01_00', spine: ['joint_TorsoRotate_01_026', 'joint_TorsoA_01_027', 'joint_TorsoB_01_028'], maxYaw: 0.85, maxPitch: 0.32,
      tail: ['joint_Tail01_01_022', 'joint_Tail02_01_023', 'joint_Tail03_01_024', 'joint_Tail04_01_025'],
    },
    wanderRate: 0.6, travelRate: 0.85, turnRate: 0.45,
    behave: { wander: 2.5, travel: 2.5, rest: 1, look: 0, follow: 0.4, watch: 1.2, shore: 0.8 }, restTime: [2, 4], canChase: false, home: 'forest',
    limits: 'Animatsiya yo‘q — yurish skelet bo‘yicha protsedurali. Turi vizual tekshirildi: ikki oyoqli, boshida shoxchali yirik yirtqich (allozavrga o‘xshash).',
  },
  {
    type: 'triceratops_jp', name: 'Triseratops (JP varianti)', file: 'jurassic_park_the_game_-_triceratops.glb',
    modelLength: 8.205, length: 2.15, forward: Math.PI / 2, modelReach: 4.421, diet: 'herbivore',
    rig: 'Skelet bor (116 suyak), 50 ta klip', mobile: true,
    idle: { clip: 'sk92_idle_triceratops' },
    walk: { clip: 'sk92_move_triceratopswalk', speed: 1.1 },
    run: { clip: 'sk92_move_triceratopsrun', speed: 7.5 },
    look: [{ clip: 'sk92_triceratops_lookleft' }, { clip: 'sk92_triceratops_lookright' }],
    // suyak nomlari shifrlangan — bo‘yin zanjiri eng oldingi suyakdan (shox/tumshuq) avtomatik topiladi
    head: { auto: true, maxYaw: 0.6, maxPitch: 0.25 },
    wanderRate: 1, travelRate: 1, turnRate: 0.5,
    behave: { wander: 3, travel: 2, rest: 1, look: 1.2, follow: 0.8, watch: 1, shore: 1 }, restTime: [2, 5], canChase: true, home: 'meadow', count: 3,
    limits: 'Klipdagi yurish/yugurish joyida (in-place) — siljishni o‘yin beradi, tezlik oyoq qadamiga moslangan.',
  },
  {
    type: 'triceratops', name: 'Triseratops', file: 'triceratops.glb',
    modelLength: 8.415, length: 2.4, forward: Math.PI / 2, modelReach: 4.821, diet: 'herbivore',
    rig: 'Skelet bor (20 suyak), 1 klip «Base Stack» (11,5 s, aralash harakatlar)', mobile: true,
    idle: { clip: 'Base Stack', frame: 0 },
    walk: { clip: 'Base Stack', from: 0.1, to: 1.2, speed: 1.55 },
    // klipdagi dum juda kuchli silkinadi (uchi 0,55 s da ~0,75 birlik) — yurish siklining o‘rtacha pozasiga 60% yaqinlashtiriladi
    head: { neck: ['Head_05'], spine: ['FrontBody_04'], hips: 'Body_00', tail: ['Tail1_01', 'Tail2_02', 'Tail3_03'], maxYaw: 0.6, maxPitch: 0.25, tailDamp: 0.6 },
    wanderRate: 1, travelRate: 1, turnRate: 0.5,
    behave: { wander: 3, travel: 2, rest: 1.2, look: 0, follow: 0.8, watch: 1, shore: 1 }, restTime: [2, 5], canChase: false, home: 'foothill',
    limits: 'Yugurish klipi yo‘q — quvishda yurish tezligida qochadi. Tinch turish — klipning 0-kadridagi statik poza.',
  },
  {
    type: 'ankylosaurus', name: 'Ankilozavr', file: 'dino_crisis_-_ankylosaurus.glb',
    modelLength: 28.53, length: 2.5, forward: -Math.PI / 2, modelReach: 20.09, diet: 'herbivore',
    rig: 'Skelet yo‘q (bitta mesh), animatsiya yo‘q — o‘yinda «yumshoq rig» (4 oyoq) quriladi', mobile: true,
    // oyoq ≈ 0,40×9,0 ≈ 3,6; qadam 2,7; sikl 1,7 s
    walk: { clip: '(protsedurali yurish, yumshoq rig)', speed: 2.7 / (0.6 * 1.7) },
    soft: {
      legs: 4, hipFrac: 0.4, kneeFrac: 0.18, colMul: 1.5, fwd: [0, 0, -1], lateral: [1, 0, 0], period: 1.7, stance: 0.6, stride: 2.7, lift: 0.45,
      // bosh (profildan): t > 5,8 (tana oldi), y > 2,6 (oldingi oyoqlar kirmaydi)
      head: { t: 5.8, ramp: 1.0, y: 5.0, yMin: 2.6 },
    },
    head: { maxYaw: 0.4, maxPitch: 0.15 },
    wanderRate: 1, travelRate: 1, turnRate: 0.35,
    behave: { wander: 2.5, travel: 1.2, rest: 1.6, look: 0, follow: 0.3, watch: 0.6, shore: 1 }, restTime: [3, 6], canChase: false, home: 'meadow', count: 3,
    limits: 'Rig va animatsiya yo‘q: 4 oyoqli yumshoq rig (shaderda son/tizza burilishi). Dum va bosh harakati yo‘q; sekin, ko‘proq dam oladi; yugurish yo‘q.',
  },
  {
    type: 'raptor', name: 'Raptor', file: 'jurassic_world_raptor3jurassicworldmoviemaker.glb',
    modelLength: 13.31, length: 1.4, forward: 0, modelReach: 8.093, diet: 'carnivore',
    rig: 'Skelet yo‘q; 116 pozali morph-target klip (yugurish sikli, 10 s)', mobile: true,
    idle: { clip: 'EFS5_time_uniform_116poses', frame: 0 },
    run: { clip: 'EFS5_time_uniform_116poses', speed: 34.86 },
    bakedMotion: { speed: 34.86 },
    wanderRate: 0.6, travelRate: 0.75, turnRate: 1.1,
    behave: { wander: 2.5, travel: 3, rest: 0.5, look: 0, follow: 1, watch: 1.2, shore: 0.5 }, restTime: [2, 4], canChase: true, home: 'forest', count: 3,
    limits: 'Faqat yugurish klipi bor: sayrda shu klip sekinlashtirib o‘ynaladi (oyoq qadami tezlikka mos). Tinch turish — statik poza (alohida idle klip yo‘q).',
  },
];

export const HERD_BY_TYPE: Record<HerdType, HerdDef> = Object.fromEntries(HERD_DEFS.map((d) => [d.type, d])) as Record<HerdType, HerdDef>;

export const herdScale = (d: HerdDef) => d.length / d.modelLength;
/** Tana va dum uchun xavfsiz radius (katak): istalgan burilishda butun tana (dum uchi bilan) shu doira ichida */
export const herdRadius = (d: HerdDef) => Math.max(d.length * 0.48, d.modelReach * (d.length / d.modelLength)) + 0.1;

/** Quvish sozlamalari (o‘yin soniyalari) */
export const CHASE = { durMin: 5, durMax: 10, coolMin: 20, coolMax: 35, maxPairs: 2, maxDist: 34, giveUpDist: 40 };

/** Har nusxaning doimiy ID si: birinchisi — eski saqlashlar bilan mos `herd-<tur>`, keyingilari `herd-<tur>-2`, `-3` */
export const herdId = (type: HerdType, k: number) => (k === 0 ? 'herd-' + type : `herd-${type}-${k + 1}`);
/** Barcha nusxalar (tur, tartib raqami, ID) */
export const HERD_SLOTS = HERD_DEFS.flatMap((d) => Array.from({ length: d.count ?? 1 }, (_, k) => ({ def: d, k, id: herdId(d.type, k) })));
