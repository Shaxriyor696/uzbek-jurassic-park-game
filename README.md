# Uzbek Jurassic Park — 3D shahar qurish o‘yini (avvalgi nomi: BoyOta)

O‘yin nomi «Uzbek Jurassic Park». Saqlash kalitlari (`boyota.save.v1` va boshqalar) texnik identifikator sifatida o‘zgarmagan — eski shaharlar ochiladi. Logo: `public/assets/brand/uzbek-jurassic-park-logo-original.png` (asl fayl), kichraytirilgan nusxalar va ikonkalar o‘sha papkada.

Brauzerda ishlaydigan bir o‘yinchili shahar qurish o‘yini. React + TypeScript + Three.js + Vite.
Barcha 3D modellar hajmli geometriya (kod orqali, PNG namunalaridan uslub olingan); PNGlar faqat UI kartalari va Dastyor uchun ishlatiladi.

## Talablar

- Node.js 18 yoki undan yangi (sinovda Node 22.22 ishlatildi), npm 9+
- WebGL qo‘llaydigan desktop brauzer (Chrome, Edge, Firefox), oyna 1280×720 yoki kattaroq
- Internet faqat `npm install` uchun kerak; o‘yin o‘zi oflayn ishlaydi

## O‘rnatish va ishga tushirish

```bash
npm install        # bog‘liqliklarni o‘rnatish (package-lock.json bor)
npm run dev        # ishlab chiqish serveri: http://localhost:5173
npm run build      # TypeScript tekshiruvi + production build → dist/
npm run preview    # dist/ ni http://localhost:4173 da ochish
npm test           # domen unit testlari (Vitest, 50 ta)
npm run typecheck  # TypeScript tekshiruvi
npm run test:e2e   # brauzer qabul sinovlari A01–A12 (avval npm run build)
npm run test:aholi # aholi, ta’minot va budjet brauzer sinovi (avval npm run build)
npm run test:biznes # 18 biznes binosini menyu orqali qurish sinovi (avval npm run build)
node scripts/biznes-korinish.mjs  # har bir biznes binosini 4 rakursdan suratga olish + o‘lchamlar
```

`dist/` papkasi tayyor o‘yin: uni istalgan statik serverda ochish mumkin (`npm run preview` yoki `npx serve dist`).
`index.html` ni to‘g‘ridan-to‘g‘ri `file://` orqali ochish ishlamaydi — ES modullari server talab qiladi.

E2E sinovlari uchun Chromium kerak: `npx playwright-core install chromium` yoki `CHROMIUM_PATH=/yo‘l/chrome npm run test:e2e`.
`test:aholi` macOS da o‘rnatilgan Google Chrome ni o‘zi topadi.

## Boshqaruv

| Amal | Tugma |
|---|---|
| Tanlash / qurish / buzish | Chap tugma bosish |
| Yo‘l chizish | Yo‘l rejimida chap tugma bilan sudrash |
| Xaritani siljitish | O‘rta tugma sudrash, boshqa rejimlarda chap tugma sudrash, W A S D / strelkalar |
| Kamerani aylantirish (360°) | O‘ng tugma sudrash, Q / E |
| Yaqinlashtirish | G‘ildirak |
| Obyektni 90° aylantirish | R |
| Boshlang‘ich kamera | Home |
| Pauza | P yoki yuqoridagi tugma |
| Tanlanganni buzish | Delete |
| Rejimdan chiqish / oynani yopish | Esc |

Bosish va sudrash 5 px chegarasi bilan ajratiladi — kamera harakati tasodifiy qurilishga olib kelmaydi.

## Loyiha tuzilishi

```
src/
  game/                 domen holati (yagona haqiqat manbai, Three.js ga bog‘liq emas)
    types.ts            turlar
    catalog.ts          obyektlar katalogi: narx, daromad, xarajat, sig‘im, radius, rasm, modelFactoryKey
    grid.ts             40×40 xarita, suv, kirish katagi, footprint, occupancy
    placement.ts        joylashtirish va yo‘l chizish validatsiyasi
    roadNetwork.ts      bitmask → yo‘l shakli, BFS (kirishga ulangan tarmoq), Manhattan yo‘l
    utilities.ts        yo‘l ulanishi, elektr/suv radiusi, baxt, ta’minot xulosasi va sabablari
    simulation.ts       10 soniyalik hisob davri: ko‘chish, uzilish taymeri, uy prognozi
    budget.ts           davriy budjet — HUD, budjet paneli va hisob davri uchun yagona hisob
    tutorial.ts         Dastyor topshiriqlari (yo‘l → uy → elektr → suv → bog‘)
    saveStore.ts        localStorage (boyota.save.v1), sxema 2, 1→2 migratsiya, collision tekshiruvi
    presets.ts          boshlang‘ich mahalla va kirish yo‘li
    game.ts             Game klassi: barcha amallar, pauza, avtosaqlash
  three/
    scene.ts            renderer, yorug‘lik, sinxronlash, preview, overlay, sichqoncha/klaviatura
    camera.ts           orbit/pan/zoom, 25–75° qiyalik, chegaralar
    modelFactory.ts     procedural modellar + GLB/glTF manbai
    builder.ts          geometriyani material bo‘yicha birlashtirish, umumiy materiallar
    roads.ts            yo‘l bo‘laklari (yakun, to‘g‘ri, burilish, T, chorraha), ko‘prik
    environment.ts      yer, suv, qirg‘oq, tashqi daraxtlar (instanced), to‘r
    textures.ts         kod bilan chizilgan fasad/suv/o‘t teksturalari va holat ikonlari
  ui/                   React UI: Hud.tsx, Panels.tsx, Modals.tsx, icons.tsx, styles.css
public/assets/
  reference/            original PNGlar (manifest.json IDlari bilan) + manifest.json
  derived/              G001/G032 dan qirqilgan karta rasmlari
scripts/e2e.mjs         brauzer qabul sinovlari (A01–A12)
scripts/e2e-aholi.mjs   aholi, ta’minot, budjet, migratsiya va joylashuv brauzer sinovi
tests/domain.test.ts    domen unit testlari
docs/ASSETS.md          manifest.json dagi 87 yozuvning to‘liq xaritasi
test-results/           oxirgi sinov natijalari va skrinshotlar
```

## GLB/glTF ga o‘tish

`src/game/catalog.ts` dagi kerakli obyektga `gltfUrl: 'assets/models/uy_a.glb'` qo‘shing (faylni `public/assets/models/` ga qo‘ying).
`ModelFactory.create()` avval procedural modelni beradi, GLB yuklangach `onUpgrade` orqali uni almashtirish mumkin.
Modelning markazi footprint markazida, kirish tomoni +Z, 1 birlik = 1 katak (10 m) bo‘lishi kerak. V1 da hech qanday GLB fayl yo‘q — manzillar to‘qib chiqarilmagan.

## PRD asosidagi qoidalar (amalga oshirilgan)

- Xarita 40×40, boshlang‘ich mablag‘ 500 000, hisob davri 10 soniya faol simulyatsiya.
- Yo‘l: katak × 100, mavjud katak qayta narxlanmaydi, mablag‘ yetmasa butun harakat bekor qilinadi.
- Bino yo‘lga perimetrdagi (diagonal emas) kirishga ulangan yo‘l orqali ulanadi. Bog‘ va daraxt yo‘l talab qilmaydi.
- Elektr radiusi 8, suv 6 (markazdan markazgacha Evklid masofasi). Stansiya yo‘lga ulangan bo‘lsa faol hisoblanadi.
- Uy va aholi (v0.4 da o‘zgargan, quyidagi «Aholi, ta’minot va budjet» bo‘limiga qarang).
- Soliq 2 tanga/aholi. Biznes daromad oladi, agar yo‘l, elektr va suv bo‘lsa va aholi > 0 bo‘lsa. Xizmat xarajati qurilgandan boshlab olinadi.
- Baxt: yo‘l 25 + elektr 25 + suv 25 + bog‘ (4) 10 + maktab (6) 5 + shifoxona (6) 10. Umumiy baxt aholiga og‘irliklangan.
- Qarzga tushish mumkin; qarzda qurilish bloklanadi. Buzish bepul, narx qaytarilmaydi.
- Pauza va fon tab simulyatsiyani to‘xtatadi. Bitta kadrdagi dt 0,25 s bilan cheklangan — qaytganda sakrash bo‘lmaydi.
- Saqlash: `boyota.save.v1`. Avtosaqlash 500 ms debounce bilan ishlaydi, qo‘lda saqlash darhol yoziladi. Buzilgan fayl o‘chirilmaydi: avtosaqlash o‘chadi va foydalanuvchiga tanlov beriladi.

## Aholi, ta’minot va budjet (v0.4)

**Aholi**
- Sig‘im (`capacity`, katalogda) va yashovchilar (`residents`, obyektda) alohida; bo‘sh joy = sig‘im − yashovchilar. Umumiy aholi = barcha uylardagi `residents` yig‘indisi.
- Yangi qurilgan uy bo‘sh. Yo‘l, elektr va suv bor bo‘lsa, har hisob davrida ko‘pi bilan 2 kishi ko‘chib keladi; uy to‘lsa ko‘chish to‘xtaydi.
- Yo‘l, elektr yoki suv uzilsa: 3 davr faqat ogohlantirish, keyin har davrda ko‘pi bilan 1 kishi ketadi (muammolar nechta bo‘lishidan qat’i nazar). Ta’minot tiklansa taymer (`outageTicks`) 0 ga qaytadi.
- Boshlang‘ich mahalla uylari to‘la holda boshlanadi (ular «yangi qurilgan» emas).
- Uy ustiga bosilganda panel: yashovchilar / sig‘im, bo‘sh joy, yo‘l, elektr, suv, holat va keyingi davr prognozi. Prognoz (`houseForecast`) hisob davri qo‘llaydigan funksiyaning o‘zi. Ta’minot yetishmasa «Nega aholi kelmayapti?» bloki aniq sababni yozadi.

**Ta’minot**
- Qoidalar o‘zgarmagan: yo‘l — footprint yonidagi (diagonal emas) kirishga ulangan katak; elektr 8, suv 6 katak, markazdan markazgacha masofa ≤ radius; stansiya faqat yo‘lga ulangan bo‘lsa ishlaydi.
- Qurish, buzish va yuklashdan keyin tartib: yo‘l tarmog‘i → stansiya faolligi → bino ta’minoti → baxt.
- Uy paneli, xarita belgisi, «Ta’minot» paneli, Dastyor maslahati va ko‘chish hisobi bitta holatdan (`game.statuses`) oladi.
- Xaritada har binoda bitta belgi: yo‘l → elektr → suv ustuvorligida. Qolgan muammolar bino panelida.
- Qurilish previewidagi yozuv shu joyda nima yetishmasligini oldindan aytadi («bu yerda elektr, suv yo‘q»).

**Budjet**
- `computeBudget` — yagona hisob. HUD dagi «+N / davr», «Shahar budjeti» paneli va hisob davri shu natijadan foydalanadi. Panel yuqoridagi mablag‘ yoki davr belgisini bosganda ochiladi.
- Qatorlar: uy soliqlari, savdo va biznes daromadi (soliq emas, belgilangan to‘g‘ridan-to‘g‘ri daromad), elektr stansiyalari, suv stansiyalari, bog‘lar va maydonlar, xizmat binolari. Sof natija = daromad − xarajat.
- Bir davr tartibi: avval budjet joriy aholi bo‘yicha balansga qo‘shiladi, keyin aholi ko‘chadi. Shuning uchun panelda ko‘rinib turgan sof natija keyingi hisobda aynan qo‘llanadi; yangi kelganlar keyingi davrdan soliq to‘laydi. (Avval tartib teskari edi.)
- Qurilish narxi bir martalik, davriy xarajatga kirmaydi. Manfiy balans yashirilmaydi; qarzda qurilish bloklanadi.

**Saqlash**
- Sxema 2: har obyektda `outageTicks`. Kalit o‘sha: `boyota.save.v1`.
- Eski (1-sxema) shahar o‘zgarishsiz yuklanadi (taymerlar 0). Migratsiyadan oldin asl matn `boyota.save.v1.backup-schema1` kalitiga nusxalanadi. Nusxa olinmasa avtosaqlash o‘chadi va eski fayl ustidan yozilmaydi.

**Joylashuv**
- Chap ustun: topshiriq, «Ta’minot» (yig‘iladi), Dastyor (yopiladi). O‘ng ustun: uy/budjet paneli va kamera tugmalari. Ustunlar ustma-ust kelmaydi; joy yetmasa panel ichida aylanadi.
- 860 px dan tor oynada uy/budjet paneli ochiqligida chap ustun yashirinadi; qurilish menyusi gorizontal aylanadi.

## Biznes binolari (v0.5)

Pastki menyudagi **«Biznes»** bo‘limida 6 guruh va 18 ta korxona bor:

| Guruh | Obyektlar |
|---|---|
| Qishloq xo‘jaligi | Bukhara Varnet (issiqxona), Sag Gardens (yong‘oq/bodom bog‘i), Pure Milky (sut fermasi) |
| Oziq-ovqat | Bon!, Safia, Besh Qozon, Crafers |
| Savdo | Korzinka, Chorsu |
| Hunarmandchilik va kiyim | Bibi Hanum, IDEAL, Rishton |
| Sanoat va qurilish | Ko‘lxatib g‘isht, AKFA Aluminium, IMZO, DAFNA, Murad Buildings |
| Qayta ishlash | Toshrangmetzavod Recycling |

- **Sozlamalar bitta joyda:** `src/game/businesses.ts` — nom, guruh, vazifa, maydon (katak), narx, daromad.
- **Iqtisodiyot:** mavjud biznes qoidasi qayta ishlatilgan — yo‘l, elektr, suv bo‘lsa va shaharda aholi bo‘lsa, har davrda belgilangan daromad. Xarajat yo‘q. Narx/daromad nisbati mavjud bizneslar oralig‘ida (21–29 davrda o‘zini qoplaydi). Ishlab chiqarish, xomashyo, logistika simulyatsiyasi yo‘q; yuk mashinalari, uskunalar va mollar — bezak.
- **3D modellar:** `src/three/businessModels.ts` (18 ta generator) va `src/three/businessParts.ts` (umumiy detallar: krem poydevor, devor-panjara va darvozalar, gulzorlar, hajmli daraxtlar, tekis tom, konditsionerlar, vitrinalar, yozuvli lavhalar, soyabonlar, ko‘tarma eshiklar, yuk mashinasi, forklift, silos, mo‘ri, issiqxona, sigir va h.k.). Daraxt, sarv va butalar shahar bezagi va Nest One/Hilton dagi kabi rasmli sprite (`Builder.tree/cypress/bush`); toji footprint ichida qoladigan qilib suriladi. Sigir — dog‘li teksturali hajmli model. Pure Milky (monitor tomli molxona, frontonli ofis, sut sexi), Bukhara Varnet (baland shisha issiqxonalar, ichida pomidor va chiroqlar), Sag Gardens (baland markaziy lavhali qism) va Korzinka (tom ustidan chiqqan qizil fasad, katta sovutgichlar) rasmlarga yaqinroq qilib qayta ishlangan. Bino qismlari mesh geometriyadan; PNG faqat menyu kartasi va yozuv/naqsh teksturasi (lavha, majolika, gumbaz koshini, soyabon chizig‘i) sifatida. Butun bino rasmi biror yuzaga yopishtirilmagan. Har bir model to‘liq footprint ichida (sinov o‘lchaydi).
- **Rasmlar:** original rakurslar `docs/biznes-rasmlar/<tur>/1–4.png` da (o‘yinga yuklanmaydi), menyu kartalari `public/assets/business/<tur>.jpg`. 33–36 va 37–40 rasmlar bir xil edi (IDEAL).
- **GLB:** yaratilmagan. Katalogga `gltfUrl` qo‘shilsa, `ModelFactory` uni procedural model o‘rniga yuklaydi.
- **Tuzatilgan eski xato:** `scene.ts` sahna konteyneriga `position: relative` yozib, CSS dagi to‘liq ekranni bekor qilardi — kanvas oynaning ~70% balandligini egallab, pastda bo‘sh ko‘k tasma qolardi.

## Ta’lim binolari (v0.6)

Pastki menyudagi **«Ta’lim»** bo‘limida 6 ta bino:

| Bino | O‘yindagi vazifasi | Maydon | Narx | Xarajat/davr | Sig‘im |
|---|---|---|---|---|---|
| INVENTO — Tashkent City kampusi | Bog‘cha | 4×4 | 6 000 | 40 | 30 o‘rin |
| Toshkent Prezident maktabi | Maktab | 5×4 | 9 000 | 60 | 40 o‘rin |
| Muhammad al-Xorazmiy maktabi | IT va texnologiya maktabi | 5×5 | 12 000 | 80 | 30 o‘rin |
| Respublika bolalar kutubxonasi | Bolalar kutubxonasi | 4×3 | 4 000 | 25 | 60 o‘quvchi joyi |
| Alisher Navoiy Milliy kutubxonasi | Milliy kutubxona | 6×6 | 15 000 | 90 | 400 o‘quvchi joyi |
| O‘zbekiston Milliy universiteti | Universitet | 5×5 | 25 000 | 150 | 2 000 talaba |

- **Sozlamalar bitta joyda:** `src/game/educationDefs.ts` (binolar) va `src/game/education.ts` (`EDU_CONFIG`: talab ulushi, radiuslar, malaka, bonus, topshiriq mukofotlari). Hammasi o‘yin balansi uchun taxminiy qiymatlar.
- **Faollik:** yo‘l + elektr + suv bor va balans manfiy emas. Aks holda bino «To‘xtagan», hech qanday bonus bermaydi, ma’lumot panelida sabab va yechim yoziladi. Xizmat xarajati qurilgandan boshlab olinadi (budjetda «Ta’lim binolari» qatori).
- **Ta’lim talabi** = ceil(aholi × 20%) — yosh guruhlari simulyatsiyasi yo‘q, shuning uchun taxmin. **Mavjud o‘rinlar** = faol maktablar sig‘imi (Prezident, Al-Xorazmiy va eski «Maktab» — 25 o‘rin). **Ta’lim qamrovi** = min(o‘rin, talab)/talab, 100% dan oshmaydi; talab 0 bo‘lsa «—». Kutubxona, bog‘cha va universitet maktab o‘rnini bosmaydi.
- **Bog‘cha va bolalar kutubxonasi:** 10 katak ichidagi ta’minlangan uyga bir davrda +1 kishi ko‘proq ko‘chib keladi (mavjud migratsiyaga ulangan; nechta bino bo‘lsa ham +1).
- **Malaka (0–100):** faqat faol IT maktabi (+1/davr) va universitet (+2/davr) oshiradi, kutubxonalar o‘sishni +25%/+50% tezlashtiradi (jami ko‘pi bilan +50%). Bino qurilishi bilan darhol oshmaydi; malaka beruvchi bino ishlamasa har davrda −1. Ta’siri: biznes daromadiga ko‘pi bilan +10% («Malaka bonusi» qatori) — cheksiz daromad emas. Haqiqiy o‘quvchi/bitiruvchi soni simulyatsiya qilinmaydi va ko‘rsatilmaydi.
- **Yangi maktablar** 6 katak ichidagi uylarga eski maktab kabi +5% baxt beradi (faol bo‘lsa).
- **Dastyor topshiriqlari** (yo‘riqnoma tugagach yoki o‘tkazilgach): 1) maktab qurib xizmatlarga ulash (+1 500), 2) bolalar kutubxonasini ishlatish (+1 000), 3) talab kamida 30 bo‘lganda o‘rinlar talabga yetishi (+2 500). Ketma-ket, mukofot bir marta; bajarilganlar soni saqlanadi.
- **Saqlash:** sxema 3 — `education: { skill, tasksDone }`. 1- va 2-sxemadagi shaharlar ochiladi; eski fayl nusxasi `boyota.save.v1.backup-schema<N>` ga yoziladi.
- **3D modellar:** `src/three/educationModels.ts` — har bino o‘z rasmlari asosida alohida generator (umumiy bino rangini almashtirish emas). Yozuvlar devorga yopishgan canvas lavha (Georgia serif, o‘zbekcha ‘ belgisi bilan). Shisha, deraza, jalyuzi, rezina qoplama, bezakli oyna teksturalari canvasda chiziladi (`textures.ts`). Rasmlar: `docs/talim-rasmlar/<tur>/`, menyu kartalari `public/assets/education/<tur>.jpg`.
- **Sinov:** `npm test` (ta’lim unit testlari), `npm run build && npm run test:talim` (brauzer: menyu, qurish, R, mablag‘, band joy, Esc, ma’lumot paneli, suv uzilishi, ta’lim paneli, topshiriq mukofoti, refresh, malaka o‘sishi, buzish), `node scripts/biznes-korinish.mjs <papka> milliy_universitet,...` — 4 rakursli suratlar va footprint o‘lchovi.
- **Soddalashtirishlar:** universitet derazalari tekstura (har katak alohida 3D rom emas, lekin tik qovurg‘a va plitalar hajmli); Navoiy kutubxonasidagi tilla naqsh — soddalashtirilgan sakkiz qirrali yulduz, karniz tishlari yo‘q, yumaloq burchaklardagi shisha qismlar tekis; Al-Xorazmiy maktabining 4-rakursi berilmagan (23 ta rasm keldi), orqa tomoni izchil davom ettirilgan; archalar o‘rniga shahardagi rasmli sarv/daraxt spritelari; bolalar maydonchasidagi o‘yinchoqlar sodda shakllar.

## Shifoxona (v0.7)

Mavjud PRD «Shifoxona» obyekti yaxshilandi (parallel tizim yaratilmadi): menyuda **«Tibbiyot → Shifoxona»**.

- **Model:** `src/three/hospitalModel.ts` — `docs/shifoxona-rasmlar/1–4.png` asosida: 4 qavatli oq-krem bino, baland markaziy oynali blok, ikki yonida milliy naqshli panellar, ko‘k «SHIFOXONA» yozuvi, ko‘k lenta derazalar, oltin rangli tik tasmalar, shisha tomli ustunli ayvon, zinapoya va pandus, o‘ng yonda soyabonli tez yordam kirishi (dekorativ mashina), pog‘onali tom (texnik bloklar, konditsionerlar, kichik bog‘lar), maysa va daraxtlar. Footprint PRD dagi 3×3 qoldirildi (eski saqlanmalar buzilmasligi uchun) — model shu maydonga bir xil nisbatda kichraytirilgan.
- **Sozlamalar:** `src/game/health.ts` (`HEALTH_CONFIG`): narx 4 000, xarajat 50/davr, xizmat sig‘imi 150 kishi, talab = aholi soni, mukofot 2 000.
- **Faollik:** yo‘l + elektr + suv (ilgari faqat yo‘l), balans manfiy bo‘lsa ham «To‘xtagan». Elektr/suv tizimi radius bo‘yicha — sarf miqdori yo‘q, shuning uchun faqat «bor/yo‘q» talab qilinadi.
- **Qamrov:** faol sig‘im = faol shifoxonalar × 150; qamralgan = min(sig‘im, talab); qamrov ≤ 100%, aholi 0 bo‘lsa «—». Har shifoxonaning «qamrovga hissasi» talab sig‘imga qarab taqsimlanadi — aholi ikki marta sanalmaydi. Baxt bonusi (+10%, 6 katak) faqat faol shifoxonadan va bir marta.
- **Alohida salomatlik ko‘rsatkichi, xodimlar, bemorlar, transport** — yo‘q (o‘yinda mavjud emas); tez yordam mashinasi bezak.
- **Topshiriq:** «Shifoxona qur va uni yo‘l, elektr hamda suvga ula» — faol bo‘lganda +2 000, bir marta. Saqlash sxemasi 4: `health: { taskDone }`; 1–3-sxemalar ochiladi, eski fayl nusxasi `boyota.save.v1.backup-schema<N>`.
- **Sinov:** `npm test`, `npm run build && npm run test:shifoxona` (suratlar: `test-results/shifoxona/`).

## Boshqaruv, moliya va shahar xizmatlari (v0.8)

7 ta obyekt (`docs/boshqaruv-rasmlar/<tur>/`, Yong‘in/Transport/Elektr rasmlari ishlatilmagan):

| Bo‘lim | Obyekt | Maydon | Narx | Xarajat/davr | Faollik |
|---|---|---|---|---|---|
| Boshqaruv va moliya | Shahar hokimligi | 4×4 | 8 000 | 60 | yo‘l + elektr + suv |
| | Moliya boshqarmasi | 5×3 | 6 000 | 40 | yo‘l + elektr + suv |
| | Soliq idorasi | 5×5 | 6 000 | 40 | yo‘l + elektr + suv |
| | Milliy bank | 5×5 | 12 000 | 70 | yo‘l + elektr + suv |
| Shahar xizmatlari | Ekologiya markazi | 4×4 | 5 000 | 35 | yo‘l + elektr + suv |
| | Xavfsizlik xizmati | 4×4 | 4 500 | 35 | yo‘l + elektr |
| Suv | Suv tozalash inshooti | 6×5 | 7 000 | 45 | yo‘l + elektr |

- **Sozlamalar:** `src/game/civicDefs.ts` (`CIVIC`, `CIVIC_CONFIG`) — narx, xarajat, radius, sig‘im, bonus, qoida muddati va jarima. Mantiq: `src/game/civic.ts`, holat: `game.ts`. Modellar: `src/three/civicModels.ts`. Panellar: `src/ui/CivicPanels.tsx`.
- **Hokimlik:** shahar holati, budjet xulosasi va aholi murojaatlari — faqat mavjud holatdan (ta’minotsiz uylar, ishlamayotgan binolar, tozalanmagan oqova, bog‘siz uylar); har birida muammo, joy (katak) va yechim, bosilsa kamera o‘sha joyga o‘tadi. Hokimlik qurilmasa ham budjet va ta’minot panellari ishlaydi.
- **Moliya:** budjet qatorlari, qurilish xarajati (bir martalik: joriy/o‘tgan davr, jami) alohida, jarima, kamomad sababi, keyingi davr prognozi. Pul ikkinchi marta yechilmaydi; ko‘p sarflash jarima emas.
- **Soliq:** mavjud soliq (2/aholi/davr) va biznes tushumi — baza, stavka, hisob davri. Yangi soliq qo‘shilmaydi, bino daromad yaratmaydi. Korxona savdo tushumi/foydasi o‘yinda simulyatsiya qilinmaydi — panelda shunday yozilgan.
- **Milliy bank:** maqsadli jamg‘arma (≤5 ta): o‘tkazish erkin budjetdan ayiradi, qaytarish qo‘shadi; foiz va kredit yo‘q. Bank ishlamasa o‘tkazish yopiq, qaytarish ochiq; oxirgi bank buzilsa jamg‘arma budjetga qaytadi.
- **Ekologiya markazi:** yashillik (bog‘ radiusidagi uylar, bog‘lar, daraxtlar) va suv sifati (oqova) — haqiqiy holatdan. Chiqindi tizimi o‘yinda yo‘q — «hisoblanmaydi» deb ko‘rsatiladi. Markaz ifloslanishni o‘zi kamaytirmaydi.
- **Suv tozalash inshooti:** mavjud «Suv stansiyasi» ichimlik suvini beradi (o‘zgarmadi). Inshoot oqova suvni tozalaydi: yuklama = suvli uylar aholisi × 1 + ishlayotgan biznes × 8 (birlik/davr); 9 katak radius, sig‘im 150; har birlik bir marta tozalanadi; yangi ichimlik suvi yaratilmaydi.
- **Xavfsizlik xizmati:** 8 katak radiusdagi uylarni sig‘im (200 aholi) tugaguncha qamraydi, qamralgan uyga +5% baxt — bir marta. Eski «Politsiya» binosi ham shu qamrov tizimiga kiradi (parallel tizim emas). Boshqa xizmat muammolarini hal qilmaydi.
- **Yumshoq mas’uliyat (yagona aniq qoida):** «Tozalanmagan oqova 40 birlik/davrdan oshmasin». Yo‘riqnoma tugagach yoki o‘tkazilgach ishlaydi. Ogohlantirish (toast + topshiriq/Dastyor paneli + hokimlik va ekologiya panellari) → 30 hisob davri muddat (pauzada to‘xtaydi) → tuzatilmasa bir marta −300; jarima muammoni hal qilmaydi va takrorlanmaydi; tuzatilsa yopiladi. Inshootga pul yetmasa va inshoot bo‘lmasa muddat boshlanmaydi. Kam pul yoki norozilik jarima sababi emas.
- **Buzishdan oldin oqibat:** ma’lumot panelida va buzish vositasi maslahatida — qaysi uylar/binolar yo‘l, elektr yoki suvsiz qolishi, bank jamg‘armasi.
- **Saqlash:** sxema 5 — `civic` (jamg‘armalar, ogohlantirish, qurilish jurnali). 1–4-sxemalar ochiladi, eski fayl nusxasi `boyota.save.v1.backup-schema<N>`.
- **Sinov:** `npm test`, `npm run build && npm run test:boshqaruv`, model suratlari: `node scripts/biznes-korinish.mjs <papka> hokimlik,moliya,...`.
- **Soddalashtirishlar:** tosh plitka, deraza katagi va naqshlar — tekstura; Soliq idorasining egilgan galereyasi yumaloq burchakli to‘g‘ri hajm; bank minoralarining shisha qirralari soddalashtirilgan; gerb — umumlashtirilgan belgi (rasmiy gerb nusxasi emas); bayroq tekis to‘lqinli tekislik; archalar o‘rniga shahardagi sarv spritelari; Milliy bank, Soliq va Moliya uchun 3–4 rakursdan ko‘rinmagan tomonlar izchil davom ettirilgan.

## Yuradigan dinozavrlar (v0.9–v0.10)

Ikkita dinozavr (`DINO_SPECS` — `src/game/dino.ts`): **katta — 12 katak** (~120 m) va **biroz kichikroq — 9 katak**. Ikkalasi bitta yuklangan modeldan (geometriya va materiallar umumiy, morph og‘irliklari alohida) va ikkalasi yuradi.

`public/models/apato.glb` — «Jurassic world apato(jurassicworldmoviemaker)», muallif Yea, CC BY 4.0 (havolalar GLB ichidagi `asset.extras` dan; o‘yinda: Sozlamalar → «Mualliflar va litsenziyalar»). Model BoyOta uchun yaratilmagan.

- **Fayl tuzilmasi (tekshirilgan):** glTF 2.0, 41,7 MB, 5 mesh, 6 rasm (BODY 2048², qolganlari 128–256 px), **skelet yo‘q**; bitta klip `EFS1_AllParts_DirectCubicBSpline.001` (14,58 s) — faqat morph target og‘irliklari (har meshda 121 target, 351 kalit kadr). Ya’ni vertex keshi.
- **Animatsiya tahlili (vertekslarni hisoblab):** 0–0,6 s turibdi; 0,62–4,96 s **oldinga yuradi** — oyoqlar navbat bilan ko‘tariladi, yerdagi oyoq model fazosida joyida qoladi, tana ~10,8 birlik siljiydi (root motion vertekslarda); 4,96–5,75 s to‘rt oyoq yerda; 7,3–10,5 s orqaga qadam; 10,2–14,6 s asosan turibdi.
- **Tabiiy yurish:** klipning oldinga yurish qismi ishlatiladi. Xaritadagi siljish shu klipning oyoqlar o‘rtasi siljishidan olinadi (ikki marta qo‘shilmaydi). Qadam sikllari orasida (4,96 → 0,62) 0,55 s davomida morph og‘irliklari blend qilinadi, model ildizi shu blendga mos suriladi — oyoqlar ~2 birlikdan kam (tana ~80) siljiydi. Dam olish: 4,96–5,75 s oralig‘i sekin oldinga-orqaga (to‘rt oyoq yerda). Burilish faqat yurish va blend paytida, 8°/s, oyoqlar o‘rtasi atrofida; yo‘l to‘siqli bo‘lsa joyida sekin burilish (8°/s) — bu holatda oyoqlar biroz suriladi.
- **Moslashuvchan marshrut (v0.14):** xarita tashqarisiga ham qurish mumkin, shuning uchun marshrut shahar chegarasidan (barcha obyektlar to‘rtburchagi) 8 katak tashqarida quriladi va shahar kengaysa o‘zi siljiydi; xarita tashqarisidagi bino va yo‘llar ham to‘siq. Ikkala dinozavr yer bo‘ylab bir xil tezlikda yuradi (`rateOf`); yo‘lni faqat boshqa dinozavr to‘ssa — orqaga yurmay kutadi. Atrofdagi o‘tloq butunlay daraxtsiz.
- **Uzluksiz yurish (v0.13):** klipdan o‘lchangan takrorlanuvchi qadam sikli 1,17–4,88 s (har oyoq bir marta; siljishdan keyin oyoqlar farqi 1,2 birlik). Sikllar orasida ikkala poza davom etib turgan 0,25 s blend — har siklda to‘xtab qayta yurish yo‘q; faqat ba’zan (har siklda 6% ehtimol) to‘xtab dam oladi.
- **Marshrut (v0.12):** dinozavrlar shahar atrofidagi o‘tloq halqasi (20 katak, daraxtsiz) o‘rtasidan o‘tadigan yopiq yo‘l bo‘ylab aylanib yuradi (`patrolPath`, burchaklari yumaloq). Ikkalasi qarama-qarshi tomonlarda, bir yo‘nalishda — bir-birini to‘smaydi. Xarita ichidagi bino, yo‘l va qurilish maydonlari ustidan o‘tmaydi (haqiqiy vertekslar bilan sinalgan). Ketma-ket 4 marta yo‘l topilmasa — marshrutdagi eng yaqin bo‘sh joyga ko‘chadi (abadiy tiqilib qolmaydi).
- **Tabiat hududi:** xaritaning bo‘sh yeri + atrofidagi 14 katakli o‘tloq halqasi (`NATURE_ZONE`; u yerda qurilish yo‘q, daraxtlar tozalangan; g‘arbdagi kirish yo‘li to‘siq). Paydo bo‘lish — halqada, eng katta bo‘sh chetki hudud tomonda. Maqsad nuqta bir nechta nomzoddan tanlanadi: tana sig‘adigan, ko‘p yo‘nalishga burila oladigan va boshqa dinozavrdan uzoq joy. Devorga tiralib qolsa — klipning o‘z orqaga qadam qismi (5,75–10,17 s) bilan orqaga chiqadi.
- **Navigatsiya:** dinozavrlar xaritaning bo‘sh tabiat yerida yuradi — binolar, yo‘llar, suv va xarita chegarasi ularni chegaralaydi; bir-birini ham to‘siq deb biladi. Paydo bo‘lish joyi — eng katta bo‘sh hudud yonida, joyida to‘liq aylana oladigan joy (hech narsa buzilmaydi; joy topilmasa dinozavr qo‘yilmaydi va sababi yoziladi). Har qadam sikli boshida uning yo‘li qadam-baqadam simulyatsiya qilinib, butun tana (dumdan boshgacha, chet masofasi bilan) bino, yo‘l, suv, xarita va zona chegarasiga tekshiriladi; yopiq bo‘lsa boshqa yo‘nalish, joyida burilish yoki xavfsiz joyda dam. Joriy tana va rejalashtirilgan sikl yo‘lidagi kataklarga qurilish va yo‘l taqiqlanadi; keyingi sikl yangi binolarni hisobga olib qayta rejalashtiriladi.
- **Vaqt:** `Game.update` dagi o‘yin vaqti qadami (pauza va yashirin tabda to‘xtaydi, katta dt ≤ 0,25 s). O‘yinda tezlik sozlamasi yo‘q — qo‘shilsa, dinozavr shu qadam bilan birga tezlashadi.
- **Saqlash:** sxema 7 — `creatures.dinos` (6-sxemadagi bitta `dino` ro‘yxatga o‘tadi; uzunligi farq qilsa qayta joylashadi) (joy, yo‘nalish, holat, klip vaqti, blend, maqsad, rejalashtirilgan yo‘l, zona). Yuklanganda to‘siqlar qayta tekshiriladi; yaroqsiz bo‘lsa zonada qayta joylashadi. Soni har doim `DINO_SPECS` ga teng — ko‘paymaydi. 1–6-sxemalar ochiladi.
- **Kod:** `src/game/dino.ts` (domen), `src/three/dinoWalker.ts` (yuklash, tekshiruv, root-motion profili fayldan, morph blend), `src/ui/Modals.tsx` (Credits). Sinov: `npm run build && npm run test:dino`. Boshqa brauzer sinovlari `?nodino` bilan (dinozavrsiz bo‘sh xarita) ishlaydi — bu faqat sinov rejimi.
- **Cheklovlar:** klipda burilish yo‘q — burilish butun tanani oyoqlar o‘rtasi atrofida aylantiradi (yurishda ≤ ~1,5 model birligi qo‘shimcha surilish); klipning o‘zida oldingi o‘ng oyoq qadamdan oldin/keyin ~4,5 birlik «sudraladi» (tovon ko‘tarilib, uchi yerda) — bu manba animatsiyada; qadam sikllari orasida 0,55 s qisqa to‘xtash seziladi; qiya yer yo‘q (xarita tekis); GLB optimallashtirilmagan (morph targetlar fayl hajmining asosiy qismi).

## Bosqichma-bosqich qurilish (v0.11)

Yangi bino joylashtirilganda darhol tayyor bo‘lmaydi — **30 o‘yin soniyasida** quriladi (`src/game/construction.ts`: `CONSTRUCTION.constructionDurationSeconds = 30`, bitta joyda).

| O‘yin soniyasi | Bosqich | Nima ko‘rinadi |
|---|---|---|
| 0–6 | Maydon va poydevor | ko‘k to‘siq panellari ketma-ket, tuproq va tepachalar, poydevor ostliklari va to‘sinlari, armatura, taxlangan materiallar, vaqtinchalik ofis va hojatxona (katta maydonda), kran o‘rnatiladi |
| 6–18 | Karkas va qavatlar | har qavat o‘z navbatida: avval ustunlar, keyin plita (pastdan yuqoriga), ustunlar ustida armatura, iskala karkas bilan o‘sadi, kran yuk tashiydi |
| 18–28 | Devor va pardoz | binoning **o‘z yakuniy modeli** pastdan yuqoriga ochiladi (devor, deraza, eshik, tom, fasad); devor yetgan qavatlarda karkas yo‘qoladi; materiallar kamayadi; 24 s dan iskala yuqoridan pastga olinadi |
| 28–30 | Yakunlash | to‘siq, kran, kabina va qoldiq materiallar olib tashlanadi, tuproq yo‘qoladi, model hovlisi (yo‘lak, maysa, daraxtlar) ochiladi |

- **Har bino o‘z modeli bilan:** binoning asosiy hajmi va balandligi model vertekslaridan aniqlanadi (hovli, chiroqlar, antennalar hisobga olinmaydi); karkas, iskala va kran shunga moslashadi. 30-soniyada aynan o‘sha model oddiy holatga almashadi — sakrash yo‘q.
- **Kran** (balandligi ≥ 0,85 yoki maydoni ≥ 16 katak bo‘lgan binolarda): taglik, panjarali minora, aylanuvchi qism, strela, qarshi og‘irlik, tortqichlar, aravacha, tros, ilgak va yuk. Sikl (4,3 s): ilgak materiallar yoniga tushadi → yuk ulanadi → xavfsiz balandlikka ko‘tariladi → strela buriladi, aravacha suriladi → qurilgan qism ustiga tushiriladi → bo‘shatiladi → qaytadi. Kichik binolarda minora krani yo‘q. Material tashish — faqat vizual animatsiya (ombor hisobiga ulanmagan).
- **O‘yin mantig‘i:** narx joylashtirishda bir marta yechiladi, maydon darhol band. Qurilayotgan bino aholi, budjet (daromad, soliq va xizmat xarajati), ta’minot, ta’lim, tibbiyot, xavfsizlik, oqova, murojaatlar va topshiriqlarda hisoblanmaydi (`Game.active`). Tugaganda bir marta tizimlarga qo‘shiladi (`recompute`). Yo‘l, daraxt va bog‘ darhol joylashadi.
- **Vaqt:** o‘yin vaqti — pauzada va yashirin tabda to‘xtaydi, kadr ≤ 0,25 s (FPS ga bog‘liq emas). O‘yinda tezlik rejimlari (2×, 3×) yo‘q.
- **Bekor qilish:** qurilayotgan bino panelida «Qurilishni bekor qilish (0 qaytariladi)» — mavjud qoida (buzishda narx qaytarilmaydi) saqlangan va oldindan yozilgan; maydon bo‘shaydi, vaqtinchalik qismlar tozalanadi.
- **Saqlash:** sxema 8 — obyektda `build: { elapsed, duration, paid }`, `hints.construction`. Foiz va bosqich `elapsed` dan hisoblanadi; yuklanganda shu joydan davom etadi. Eski shaharlardagi binolar tayyor.
- **Dastyor:** birinchi qurilishda bir marta: «Bino avval poydevordan boshlanadi. Qurilish tugagach undan foydalanamiz!» (majburiy oyna emas).
- **Unumdorlik:** geometriya va qurilish materiallari barcha maydonlar uchun umumiy; takrorlanuvchi qismlar InstancedMesh; kesish uchun faqat shu maydon modeli materiallari nusxalanadi va tugaganda tozalanadi.
- **Sinov:** `npm test`; `npm run build && npm run test:qurilish`. Eski brauzer sinovlari `?instant` (faqat `test=1` bilan) — bino darhol tayyor.

## Prompt va PRD orasidagi noaniqliklar va mening talqinim

1. **Maktab/shifoxona qachon «faol»** — PRD aniq aytmaydi. Ular yo‘lga ulangan bo‘lsa baxt beradi deb oldim; elektr va suv shart qilinmadi.
2. **Soliq tartibi** — v0.4 dan: bir davrda avval soliq (joriy aholidan), keyin aholi ko‘chishi.
3. **Yo‘l narxi** — G002 kartalarida 100/150/200 ko‘rsatilgan, PRD esa har katak 100 deydi. PRD bo‘yicha barcha shakllar katakiga 100.
4. **Shifoxona qamrovi** — G043 da «5×5», PRD da radius 6. PRD tanlandi.
5. **Chap tugma sudrash** — PRD da pan o‘rta tugmada. Qulaylik uchun yo‘l rejimidan tashqarida chap sudrash ham pan qiladi (5 px chegara bilan, qurmaydi).
6. **Pauza** saqlanmaydi; sahifa yangilanganda o‘yin davom etadi.
7. **Dastyor maqsad uyi** — 2-bosqichdagi uy buzilsa, tarmoqqa ulangan boshqa foydalanuvchi uyi qabul qilinadi.
8. **Prompt «Yuqorida mablag‘ … va + tugma» (G001)** — PRD «+» cheksiz pul bermasin deydi. «+» tugmasi qo‘yilmadi.

## Katalog: v1 da bor

PRD jadvalidagi hamma 15 obyekt bor: Uy A, Uy B, Uy C, Ko‘p qavatli uy, Do‘kon, Ofis, Maktab, Shifoxona, Elektr stansiyasi, Suv stansiyasi, Bog‘, Daraxt, Yo‘l, Nest One konsepti va Hilton konsepti.

Qo‘shimcha obyektlar: Politsiya, Yong‘in bo‘limi, Bog‘cha, Sport maydoni, Kongress markazi konsepti va Tashkent City Mall konsepti (G007, 5×5, 18 000 tanga, +550 daromad). Ularning balansi men tanlagan qiymat; Politsiya va Yong‘in narxlari G043 dan olingan. Politsiya, Yong‘in va Bog‘chaning v1 da faqat xarajati bor, baxtga ta’siri yo‘q. Bu UI da ham yozilgan.

## Kengaytirilgan xarita va tog‘lar (v0.15)

- **Xarita o‘lchami** bitta joyda: `src/game/grid.ts` → `MAP_CONFIG` (`coreSize` 40, `expand` 20, `landMargin` 40). Xarita 40×40 dan **80×80** ga (maydon 4 baravar) kengaydi: kataklar −20…59. Asl xarita (0…39) joyida qoladi, shuning uchun eski koordinatalar o‘zgarmaydi. Xaritadan tashqariga endi qurib bo‘lmaydi («Xarita chegarasidan tashqariga qurib bo‘lmaydi»).
- **Tog‘lar** (`src/game/terrain.ts`, `src/three/terrainView.ts`): 4 tur — qoyali tizma, qarag‘ayli yashil tog‘, qorli cho‘qqilar, vodiyli tizma. Hammasi haqiqiy hajmli balandlik meshi (billboard yoki fon rasmi emas). Etagi silliq o‘tloq bo‘lib, yer bilan bir xil teksturaga o‘tadi. Tik joy qoya rangida, baland joy qorda. Daraxtlar qoya va qorda o‘smaydi.
- **Bitta balandlik manbasi:** `TerrainField.heightAt` ham meshni, ham to‘siqlarni beradi. Balandligi 0,04 dan oshgan katakka qurib bo‘lmaydi: qizil preview chiqadi va «Bu joyning qiyaligi qurilish uchun mos emas» deb yoziladi. Dinozavrlar balandligi 0,15 dan oshgan katakdan o‘tmaydi.
- **Joylashuv:**
  - Tog‘lar xarita chekkalari bo‘ylab va tashqaridagi tabiat yerida turadi; ikki qator, burilishi va o‘lchami har xil.
  - Ular asl xaritaga, obyektlarga, suvga, kirish yo‘liga, dinozavrlarga va dinozavr marshruti yo‘lagiga tushmaydi.
  - Xaritaning kamida 70% tekis qoladi.
- **Tog‘lar doimiy:** obyekt emas, narxi yo‘q, qurilish bosqichi yo‘q, buzib bo‘lmaydi.
- **Saqlash** (sxema 9):
  - `terrain` maydoni: versiya, seed, xarita o‘lchami va har tog‘ning joyi hamda shakli. Qayta yuklashda tog‘lar siljimaydi.
  - Eski saqlash ochilganda asl nusxasi `boyota.save.v1.backup-schema8` ga yoziladi. Obyektlar joyida qoladi, tog‘lar faqat bo‘sh joyga yaratiladi.
- **Chekka o‘rmon:** xaritadan tashqarida rasmli tabiiy daraxtlar to‘da-to‘da o‘sadi, xaritadan uzoqlashgan sari zichroq. Dinozavr marshruti va kirish yo‘li daraxtsiz qoladi.
- **Kamera va tuman:**
  - Eng uzoq masofa 120, nishon xarita ichida qoladi, `far` = 1200.
  - Kamera relyefdan kamida 2,5 birlik baland turadi.
  - Tuman kamera masofasiga qarab uzoqlashadi. Ufqda katta o‘tloq tekisligi bor, shuning uchun yer cheti uzilib ko‘rinmaydi.
- **Unumdorlik:**
  - Relyef 20×20 katakli bo‘laklarga bo‘lingan; kamera ko‘rmagan bo‘lak chizilmaydi.
  - Faqat relyefli kataklar uchburchaklanadi. Material umumiy, daraxtlar instanslangan.
  - Tog‘lar statik va soya tashlamaydi.
  - Soya kamerasi kamera nishoniga ergashadi: soya faqat yaqin atrofda chiziladi.
- **Sinov:** `npm run build && npm run test:toglar`.

## 7 ta yangi dinozavr (v0.16)

- **Fayllar:** `public/models/dinosaurs/` (asl fayllar o‘zgartirilmagan). Manzil `import.meta.env.BASE_URL` + `encodeURIComponent(fayl)`, shuning uchun bo‘sh joy va qavsli nom ham, ichki manzil (GitHub Pages) ham ishlaydi.
- **Sozlama:** `src/game/herdDefs.ts`. Har model uchun alohida:
  - fayl, uzunlik va masshtab (barcha o‘qlarda bir xil);
  - old tomoni, rig, kliplar, oyoq qadami tezligi;
  - burilish tezligi, xulq og‘irliklari, cheklovlar.
- **Mantiq:** `src/game/herd.ts`.
  - **Navigatsiya:** katakli maydonda to‘siqdan masofa hisoblanadi, yo‘l A* bilan topiladi va har tana radiusiga mos ravishda silliqlanadi.
  - **Xulq:** dam, atrofga qarash, sayr, uzoq yo‘l, shahar chetida kuzatish, ergashish, qisqa quvish va qochish.
  - **Quvish qoidalari:** 5–10 s davom etadi, keyin 20–40 s tanaffus. Bir vaqtda ko‘pi bilan 2 juft quvadi.
  - **Teleport yo‘q:** yo‘l topilmasa, dinozavr to‘xtab, boshqa maqsad tanlaydi.
  - **Yurish taqiqlangan joylar:** bino, yo‘l (shu jumladan kirish yo‘li bezagi), suv, tog‘ va shahar ichi.
  - **Vaqt:** hammasi o‘yin vaqti bilan yuradi va pauzada to‘xtaydi.
  - **Saqlash:** `creatures.herd`, sxema 10.
- **Ko‘rinish:** `src/three/herdView.ts`.
  - **Yuklash:** navbat bilan, har model bir marta. Bittasi yuklanmasa ham o‘yin davom etadi.
  - **Animatsiya:** faza o‘yin holatidan olinadi, shuning uchun oyoq qadami siljishga mos.
  - **Skeleti yo‘q modellar:** `src/three/softRig.ts` — «yumshoq rig».
- **Mualliflik:** Sozlamalar → Mualliflar. Har model uchun `asset.extras` dan muallif, litsenziya va manba ko‘rsatiladi.
- **Sinov:** `npm run build && npm run test:dinozavrlar`. Modellarni tekshirish vositasi: `tools/dino-inspect.html` (faqat `npm run dev` da).

## Katalog: rasmi bor, lekin v1 ga qo‘shilmagan

Aylanma chorraha (G009), Estakada (G019), Olti qatorli yo‘l (G029), To‘rt qatorli yo‘l (G041), Tor ko‘cha (G040), Tramvayli yo‘l (G042), Yashil bulvar (G044), Egri yo‘l (G018, alohida egri bo‘lak yo‘q — faqat 90° burilish), Kanal (G020, quriladigan obyekt sifatida), Ko‘l (G021, quriladigan obyekt sifatida), Ko‘prik (G022, faqat kirishdagi dekorativ ko‘prik), Metro kirish (G028), Chiqindi saralash (G012), G008 to‘plamidagi alohida bezaklar (avtobus bekati, kafe, o‘yin maydoni, avtoturargoh).
Bu obyektlar uchun tugma yoki karta ko‘rsatilmaydi.

## Men yaratgan va vaqtinchalik qismlar (keyin almashtirish oson)

- **Barcha 3D modellar procedural** (`src/three/modelFactory.ts`). Ular rasmlardan uslub olgan talqin, aniq arxitektura nusxasi yoki avtomatik 3D rekonstruksiya emas. Ko‘rinmagan tomonlar mantiqan davom ettirilgan. GLB bilan almashtirish uchun yuqoridagi bo‘limga qarang.
- **Yo‘l bo‘laklari**, yer, suv, qirg‘oq va tashqi daraxtlar procedural.
- **Fasad, suv va o‘t teksturalari** canvas orqali kodda chizilgan (`textures.ts`).
- **Ikonlar** (toolbar, HUD, holat belgilari) — SVG/canvas, G033 uslubida qayta chizilgan.
- **Elektr stansiyasi karta rasmi** — kodda chizilgan SVG, chunki PNG yo‘q.
- **Uy A/B/C, Ko‘p qavatli uy va Ofis kartalari** — G001/G032 dan qirqilgan (`public/assets/derived`).
- **Boshlang‘ich mahalla joylashuvi** va qo‘shimcha obyektlar balansi.
- Barcha o‘zbekcha matnlar.
- **Tabiat bezaklari** (daraxtlar, gul to‘plamlari, toshlar) xarita bo‘ylab tasodifiy, lekin har safar bir xil joylashadi. Ular o‘yin mantiqiga ta’sir qilmaydi: katakka yo‘l yoki bino qurilsa, undagi bezak yashiriladi. Yo‘llardagi mashinalar ham shunchaki bezak.

## Grafika (v0.3 — rasmlardan olingan ko‘rinish)

- **Daraxtlar** endi kod bilan chizilgan shakl emas: `Shahar_qismlari/Togri_yol.png` va `Daraxtzor.png` dan qirqib olingan haqiqiy daraxt tasvirlari (`public/assets/derived/sprites`). Ular doim kameraga qarab turadi (billboard) va yerga soya tashlaydi. Pushti gullagan daraxt shu rasmdan rang o‘zgartirib olingan.
- **O‘t** G001 dagi maydondan, **suv** `Kanal.png` dan olingan va choksiz qilingan tekstura (`public/assets/derived/textures`).
- **Toshkent City binolari** (Nest One, Hilton, Kongress markazi, Tashkent City Mall): har birining shakli 4 rakursli rasm bo‘yicha qayta yasaldi. Fasadlari rasmlardan qirqilib, perspektivasi to‘g‘rilangan holda tegishli tomonlarga qo‘yildi (`public/assets/derived/facades`). Tashkent City Mall yangi obyekt sifatida «Maxsus binolar» ga qo‘shildi (5×5, narx va daromad men tanlagan).
- **Uylar, ko‘p qavatli uy, do‘kon, maktab, shifoxona, suv stansiyasi, politsiya, o‘t o‘chirish, bog‘cha** rasmlar uslubida toza 3D bino sifatida yasaldi: shtukatura devor, sokol va karniz, har tomonda haqiqiy 3D derazalar (ramka, oyna, krest, tokcha), eshiklar, ayvon, balkon, garaj, soyabonlar. Avvalgi (v0.2 dagi) devorga yopishtirilgan rasm bo‘laklari olib tashlandi, chunki ular burchaklarda bir-biriga mos kelmasdi.
- **Dastyor va topshiriq paneli** endi uzun matn o‘rniga ikonli kartochkalar bilan tushuntiradi: nima tanlash → qanday harakat → natija (masalan «Yo‘l» → sudrang → ×3 katak), radius belgisi, bosqichlar yo‘li (5 ta ikonli nuqta) va bitta qisqa jumla (`src/ui/TutorialVisual.tsx`).
- **Asfalt, plitka va fonarlar** `Togri_yol.png` dagi rang va shakl bo‘yicha qayta chizildi (klassik qora fonar ustunlari).
- Yumshoq kunduzgi yorug‘lik, ACES tone mapping, yumshoq soyalar.
- **Rostini aytganda:** natija rasmlarga yaqin, lekin aynan bir xil emas. Rasmlar bitta burchakdan render qilingan tasvir, o‘yin esa har tomondan aylantiriladigan 3D. Shuning uchun rasmdan qirqilgan fasad boshqa burchakdan qaralganda tekis ko‘rinadi, tom va ko‘rinmaydigan tomonlar taxminiy. Rasmlar bilan 1:1 bir xil ko‘rinish uchun 3D dizayner yoki AI xizmati (Meshy, Tripo) orqali tayyorlangan GLB modellar kerak; o‘yin ularni `gltfUrl` orqali qabul qilishga tayyor.
- Yonma-yon solishtirish: `test-results/solishtirish-toshkent-city.png`.

## Tekshiruv natijalari

To‘liq natijalar: `test-results/` (`unit-log.txt`, `e2e-log.txt`, `e2e-natijalar.json`, skrinshotlar).

- `npm run build` — TypeScript xatosiz, Vite build muvaffaqiyatli.
- `npm test` — 44/44 domen testi o‘tdi. v0.4 da qo‘shilgani: ko‘chish (+2/davr, sig‘im, prognoz), uzilish taymeri va tiklanish, buzilgan uy aholisi, ta’minot xulosasi va radius chegarasi, budjet qatorlari = sof natija = balans o‘zgarishi, sxema 2 va 1→2 migratsiya.
- `npm run test:e2e` — 59/59 brauzer tekshiruvi o‘tdi (A01–A12). Ular haqiqiy sichqoncha va klaviatura hodisalari bilan, headless Chrome (SwiftShader) da 1280×720 o‘lchamda bajarildi.
- `npm run test:aholi` — 57/57 o‘tdi: ta’minotsiz uyga aholi kelmasligi va sababi, ta’minlangach +2/davr, sig‘im chegarasi, 3 davr ogohlantirish va −1/davr, tiklanish, budjet qatorlari = HUD = balans o‘zgarishi, pauza, refresh, eski save migratsiyasi, 5 xil oyna o‘lchamida panellar ustma-ust kelmasligi. Bu sinovda yo‘l va binolar asosan `game` metodlari orqali qurilgan, panellar esa haqiqiy bosishlar bilan tekshirilgan.

Sinovlardagi yordamchi aralashuvlar (rost aytish uchun):
- A03 da «mablag‘ yetmasligi»ni tekshirish uchun pul test hook orqali vaqtincha 300 qilib qo‘yildi.
- A09 dagi «skip saqlanadi» tekshiruvida yo‘riqnoma test hook bilan 4-bosqichga qaytarildi.
- «Modal ochiq bo‘lsa qurilish bloklanadi» sinovi `placeBuilding` ni to‘g‘ridan-to‘g‘ri chaqirgan.
- Qurilish sinovlarida mablag‘ hisobi aniq bo‘lishi uchun o‘yin pauzaga qo‘yilgan; pauzada qurish ruxsat etilgan.
- Test hook (`window.__BOYOTA__`) faqat `?test=1` parametri bilan ochiladi va o‘yinchi UI siga hech narsa qo‘shmaydi.


## Ma’lum cheklovlar

- **FPS o‘lchanmagan.** Sinov muhitida faqat dasturiy render (SwiftShader) bor edi va u 1280×720 da 2–5 FPS berdi. Bu haqiqiy GPU natijasi emas. PRD dagi 300 obyektda 30 FPS maqsadi tekshirilmagan. Sozlamalar oynasida joriy FPS ko‘rinadi — uni o‘z kompyuteringizda o‘lchang.
- Haqiqiy GPU li brauzerda qo‘lda vizual sinov o‘tkazilmagan. Rasm va sinovlar faqat headless Chromium da olingan.
- Mobil teginish boshqaruvi yo‘q (PRD bo‘yicha v1 talabi emas).
- Taxminan 520 px dan tor oynada yuqori HUD belgilari sig‘maydi.
- Xarita chegarasi tekshiruvi joylashtirishda o‘chirilgan (xaritadan tashqariga qurish mumkin) — v0.4 da tegilmagan.
- Kabel/quvur, transport AI, odamlar yurishi va ovoz yo‘q (PRD bo‘yicha v1 talabi emas). Sozlamalardagi «Ovoz» bandi o‘chirilgan va bu tushuntirilgan.
- Har bir yo‘l katagi alohida obyekt (klon) sifatida chiziladi, InstancedMesh ishlatilmagan. Geometriya va materiallar umumiy. Juda katta yo‘l tarmog‘ida draw call ko‘payishi mumkin. Tashqi daraxtlar InstancedMesh.
- JS bundle ~920 KB (gzip ~255 KB) — asosan Three.js.
- Biznes modellarining har biri ~45–65 draw call (material bo‘yicha birlashtirilgan) va 20–66 ming uchburchak. LOD yo‘q. 18 tasi birga turganda dasturiy renderda (SwiftShader) sezilarli sekinlashadi; haqiqiy GPU da o‘lchanmagan.
