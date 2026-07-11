// Zoeken in de EAZYFIX®-websitekennis (producten, FAQ, blog/how-to, video's).
// Bronnen worden samengevoegd, zodat een refresh van de ene bron de andere niet wist:
// - kennis.json        site-snapshot van eazy-fix.nl (scripts/pull-site.js)
// - kennis-video.json  YouTube-kennis (@eazyfixnl, scripts/pull-youtube.js)
// - kennis-extra.json  handmatig gecureerde feiten (niet door een pull overschreven)
// De website blijft leidend; deze tool laat de bot de actuele kennis raadplegen.

// Optionele bron inladen; ontbreekt het bestand, dan een lege lijst.
function loadSource(file) {
  try { return require(file); } catch { return []; }
}

// Ontdubbel de samengevoegde bronnen op canonieke URL. Volgorde site → video →
// extra betekent: een handmatige kennis-extra-entry overschrijft een gescrapete
// site-entry met dezelfde URL (laatste wint). Entries zonder URL blijven altijd.
function dedupeData(entries) {
  const byUrl = new Map();
  for (const p of entries) {
    const key = String(p.url || '').replace(/\/+$/, '').toLowerCase();
    if (key) byUrl.set(key, p);
  }
  const chosen = new Set(byUrl.values());
  return entries.filter((p) => !p.url || chosen.has(p));
}

// Verouderde/misleidende entries die uit de kennis moeten, ook al staan ze nog in
// een gescrapete bron (een re-pull mag ze niet terugbrengen). Op slug gefilterd.
// - yt-24600OjFDS0: oude koker-video (180 ml, oude dop, niet-bestaand tussendopje)
//   en de tekst "componenten altijd gescheiden houden" klopt niet meer: de
//   EAZYFIX® Premium Houtrotvuller komt in de juiste mengverhouding uit één koker.
const OUTDATED_SLUGS = new Set(['yt-24600OjFDS0']);

const DATA = dedupeData([
  ...loadSource('./kennis.json'),
  ...loadSource('./kennis-video.json'),
  ...loadSource('./kennis-extra.json'),
]).filter((p) => !OUTDATED_SLUGS.has(p.slug));

const STOP = new Set(
  ('de het een en of van voor met op in te is dat die ik je jij hoe wat waar kan kun moet ' +
   'bij aan om als ook nog wel niet mijn deze dit naar uit per ben heb hebben word worden ' +
   'zijn was wordt heeft moeten kunnen mag dan dus maar want hun zo er nog al').split(' ')
);

// Houtrot-synoniemen: woorden uit dezelfde groep tellen als elkaar, zodat
// spreektaal ("mijn raamhout is zacht") de juiste pagina ("houtrot kozijn") vindt.
const SYNGROUPS = [
  ['houtrot', 'rot', 'rotte', 'zacht', 'zachte', 'sponzig', 'week', 'aangetast', 'verrot', 'vergaan'],
  ['kozijn', 'raamhout', 'raamkozijn', 'venster', 'raam'],
  ['deur', 'deurpost'],
  ['dorpel', 'onderdorpel', 'drempel'],
  ['verf', 'lak', 'laklaag', 'bladdert', 'afbladderen', 'bobbel', 'bobbelt', 'craquele', 'pellen'],
  ['frees', 'frezen', 'houtrotfrees', 'uitfrezen', 'wegfrezen', 'weghalen', 'verwijderen'],
  ['dremel', 'multitool', 'boormachine', 'accuschroefmachine', 'accuschroef', 'machine', 'toerental', 'toeren', 'rotary'],
  ['houtrotvuller', 'vuller', 'vullen', 'epoxy', 'opvullen', 'dichten'],
  ['houtplamuur', 'plamuur', 'plamuren'],
  ['houtversterker', 'versterker', 'voorbehandelen', 'primer', 'verharder'],
  ['mengverhouding', 'verhouding', 'mengen', 'aanmaken', 'mengverhouding'],
  ['uitharden', 'drogen', 'droogtijd', 'harden', 'uithardingstijd', 'verwerkingstijd'],
  ['vocht', 'vochtig', 'vochtmeter', 'houtvochtmeter', 'nat', 'vochtgehalte'],
  ['schuren', 'glad', 'afwerken', 'schuurpapier'],
  ['overschilderen', 'schilderen', 'aflakken', 'grondverf', 'aflak'],
  ['set', 'pakket', 'reparatieset', 'startpakket', 'starterspakket', 'startset'],
  ['kopen', 'bestellen', 'webshop', 'verkooppunt', 'winkel', 'prijs', 'kosten'],
  ['gereedschap', 'reparatiemes', 'plamuurmes', 'aanbrandmes', 'mengmes', 'opbouwmes', 'modelleerstrips'],
  ['trap', 'traptrede', 'trede'],
  ['meubel', 'meubels', 'tafel', 'kast'],
  ['muur', 'muren', 'muurtje', 'wand', 'muurvuller', 'metselwerk', 'steen', 'beton'],
];

// Lichte Nederlandse stemmer: haalt meervoud/verbuiging weg (kozijnen -> kozijn).
function stem(w) {
  w = w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const suf of ['tjes', 'tje', 'eren', 'heden', 'ingen', 'en', 'er', 'es', 'e', 's']) {
    if (w.length > suf.length + 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}

// Map: gestemd woord -> set van gestemde groepsleden (synoniemen).
const SYN = new Map();
for (const group of SYNGROUPS) {
  const stems = [...new Set(group.map(stem))];
  for (const s of stems) {
    if (!SYN.has(s)) SYN.set(s, new Set());
    for (const o of stems) SYN.get(s).add(o);
  }
}

function queryStems(q) {
  const base = (q == null ? '' : String(q))
    .toLowerCase().replace(/[^a-zà-ÿ0-9\s]/gi, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
  const expanded = new Set(base);
  for (const s of base) if (SYN.has(s)) for (const o of SYN.get(s)) expanded.add(o);
  return { base: [...new Set(base)], expanded: [...expanded] };
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-zà-ÿ0-9\s]/gi, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
}

// Merk-/productlijn-woorden die in veel titels/slugs terugkomen en daardoor geen
// onderscheidend signaal zijn (anders rangschikt "Premium Houtrotvuller" alle
// Premium-producten gelijk). Tellen niet mee voor de titel-/slug-identiteitsboost.
const RANK_GENERIC = new Set(['premium', 'eazyfix', 'rvs', 'shop'].map(stem));

// BM25-index eenmalig opbouwen bij laden.
const K1 = 1.5;
const B = 0.75;
const INDEX = DATA.map((p) => {
  const titleStems = tokenize(p.title);
  const slugStems = tokenize(String(p.slug || '').replace(/-/g, ' '));
  const tf = new Map();
  for (const t of tokenize(p.text)) tf.set(t, (tf.get(t) || 0) + 1);
  return {
    p, tf, len: [...tf.values()].reduce((a, b) => a + b, 0) || 1,
    title: new Set(titleStems), slug: new Set(slugStems),
  };
});
const AVGLEN = INDEX.reduce((a, d) => a + d.len, 0) / (INDEX.length || 1);
const DF = new Map();
for (const d of INDEX) for (const t of d.tf.keys()) DF.set(t, (DF.get(t) || 0) + 1);
const N = INDEX.length;
const idf = (t) => Math.log(1 + (N - (DF.get(t) || 0) + 0.5) / ((DF.get(t) || 0) + 0.5));

// Tel term-frequentie inclusief prefix-matches (kozijn ~ kozijnnaad).
function docTf(d, term) {
  let tf = d.tf.get(term) || 0;
  if (term.length >= 4) {
    for (const [k, c] of d.tf) if (k !== term && (k.startsWith(term) || term.startsWith(k)) && k.length >= 4) tf += c;
  }
  return tf;
}

// Scoor alle pagina's tegen een onderwerp (BM25 + synoniemen). Gesorteerd, met score.
function scoreAll(query) {
  const { expanded } = queryStems(query);
  if (!expanded.length) return [];
  const scored = INDEX.map((d) => {
    let s = 0;
    for (const term of expanded) {
      const generic = RANK_GENERIC.has(term);
      const tf = docTf(d, term);
      if (tf) {
        s += idf(term) * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * d.len / AVGLEN));
        if (d.title.has(term) && !generic) s += 2; // titel-treffer telt extra
      }
      // Onderscheidende product-identiteit: een term die exact in de slug van een
      // canonieke product-/contentpagina zit (bv. "houtrotvuller" in
      // premium-houtrotvuller) weegt zwaar. Zo wint de Houtrotvuller-PAGINA van een
      // product dat alleen "premium" deelt, én van losse blogs/video's die het woord
      // toevallig vaak noemen.
      if (!generic && d.slug.has(term) && (d.p.type === 'product' || d.p.type === 'pagina')) s += 5;
    }
    if (s > 0 && (d.p.type === 'product' || d.p.type === 'blog')) s *= 1.1;
    return { p: d.p, s };
  }).filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s);
  return scored;
}

// Zoek de meest relevante pagina's bij een onderwerp.
function search(query, limit = 3) {
  // Dubbele titels (pagina's met dezelfde naam) eruit; hoogste score wint.
  const seen = new Set();
  const out = [];
  for (const x of scoreAll(query)) {
    const key = x.p.title.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x.p);
    if (out.length >= limit) break;
  }
  return out;
}

// --- Intent-herkenning + betrouwbaarheidsdrempel (anti-gok) -------------------
// De kennisbank bevat bewust geen prijzen, betaal-, bezorg-, retour- of
// garantievoorwaarden. Een commerciële/service-vraag levert dus alleen zwakke,
// misleidende matches op. Die herkennen we en sturen we naar de binnendienst i.p.v.
// er productuitleg op te plakken. Een how-to/reparatie-signaal in dezelfde vraag
// wint: dan is het een inhoudelijke vraag (de persona verwijst de prijs apart door).
const SERVICE_INTENT = /\b(prijs|prijzen|prijslijst|kost|kosten|kostprijs|tarief|aanbieding|bestel|bestellen|bestelling|betaal|betalen|betaling|ideal|factuur|bezorg|bezorging|verzend|verzending|levertijd|geleverd|retour|retourneren|terugsturen|garantie|waarborg|account|inloggen|wachtwoord|vacature|vacatures|solliciteer|solliciteren|webshop|winkelwagen|winkelmand)\b/i;
const HOWTO_SIGNAL = /\b(repareer|repareren|reparatie|mengen|meng|mengverhouding|aanbreng|aanbrengen|gebruik|gebruiken|stap|stappen|drogen|schuren|verwijder|verwijderen|inwerk|uithard|uitharden|frees|frezen|behandel|behandelen|toepass|toepassen|hecht|hechting|droogtijd|verwerk|verwerken)\b/i;

function classifyIntent(query) {
  const q = String(query || '');
  if (SERVICE_INTENT.test(q) && !HOWTO_SIGNAL.test(q)) return 'service';
  return 'content';
}

// Onder deze BM25-topscore is een match te zwak om als leidende kennis te tellen;
// dan niet gokken maar doorverwijzen (gekalibreerd: reële vragen scoren >10, ruis <5).
const MIN_SCORE = 6;

// Zoek alleen voldoende sterke matches. Lege array = geen betrouwbare treffer.
function confidentSearch(query, limit = 3) {
  const seen = new Set();
  const out = [];
  for (const x of scoreAll(query)) {
    if (x.s < MIN_SCORE) break; // gesorteerd aflopend: vanaf hier alles te zwak
    const key = x.p.title.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x.p);
    if (out.length >= limit) break;
  }
  return out;
}

// Relevante EAZYFIX-video's bij een onderwerp, alleen als ze duidelijk passen.
// minScore (BM25-vloer) voorkomt dat er bij elke vraag of begroeting een video
// plakt. Daarna herrangschikken op titel-overlap: videotitels ("Houtrot in
// kozijn repareren stappenplan") zijn het sterkste relevantiesignaal, sterker
// dan een korte, generieke video die toevallig vaak "houtrot" zegt.
// Te generieke woorden mogen GEEN videomatch opleveren (anders triggert bv.
// "Ik wil de DF 16 gebruiken" een video via het woord "gebruiken").
const VIDEO_GENERIC = new Set(
  ['gebruiken', 'maken', 'doen', 'gaan', 'willen', 'hebben', 'zetten', 'kunnen', 'moeten',
   'nodig', 'goed', 'beste', 'manier', 'zelf', 'super', 'tip', 'video', 'instructie', 'stap',
   // merk/filler: komen in bijna elk antwoord/titel voor en mogen niet matchen
   'eazyfix', 'premium', 'repair', 'care', 'professioneel', 'alle', 'product', 'producten',
   // te algemeen: staan in vrijwel elk houtrot-antwoord (ook in puur diagnostische
   // vragen), dus mogen op zichzelf geen video triggeren
   'repareren', 'reparatie', 'herstellen', 'herstel', 'hout', 'schade', 'beschadiging', 'klus', 'plek',
   // 'houtrot'/'rot' staan in bijna elke videotitel -> te generiek om op te matchen;
   // de OBJECT-term (kozijn/deur/trap/muur) of productnaam bepaalt de video.
   'houtrot', 'rot', 'aangetast'].map(stem)
);

// Kleine object/term -> video-term map (alleen wat in videotitels voorkomt).
// Bewust GEEN materiaalwoorden (steen/beton) zodat een muur-vraag de
// Muurvuller-video kiest en niet een plamuur-materialenvideo.
const VIDEO_SYN = {
  muur: ['muurvuller'], muren: ['muurvuller', 'muur'], muurtje: ['muurvuller', 'muur'], wand: ['muurvuller', 'muur'],
  raam: ['kozijn'], raamhout: ['kozijn'], raamkozijn: ['kozijn'], venster: ['kozijn'],
  onderdorpel: ['dorpel'], drempel: ['dorpel'],
};

// WHITELIST van termen die een video MOGEN triggeren: alleen concrete objecten
// (kozijn, deur, dorpel, muur, ...), productnamen en technieken met een eigen video.
// Alles daarbuiten (fillerwoorden als "makkelijk", "volledig", "vochtig",
// "brokkelt") mag NOOIT matchen. Zonder deze grens matchte "Het brokkelt makkelijk
// af" op de video "Muurvuller makkelijk afstrijken" (verkeerd product). Gestemd,
// zodat verbuigingen meelopen.
const VIDEO_TOPIC = new Set([
  // objecten
  'kozijn', 'raamkozijn', 'raam', 'raamhout', 'venster', 'dorpel', 'onderdorpel', 'drempel',
  'deur', 'deurpost', 'trap', 'trede', 'traptrede', 'meubel', 'raamluik', 'luik', 'boeiboord',
  'poortdeur', 'vloer', 'dak', 'muur', 'muren', 'muurtje', 'wand',
  // producten
  'houtrotvuller', 'houtplamuur', 'plamuur', 'houtversterker', 'versterker', 'muurvuller',
  'houtrotfrees', 'frees',
  // technieken met een eigen instructievideo
  'frezen', 'modelleren', 'deelvervanging', 'vervangen',
].map(stem));

// De gebruiker heeft het OVER het videokaartje zelf (meestal een klacht: "het
// filmpje is niet van houtrot", "ik krijg weer een filmpje"). Plak dan GEEN nieuwe
// (mogelijk opnieuw verkeerde) video; een woord als "muurvuller" in zo'n klacht mag
// niet opnieuw de muurvuller-video triggeren.
const VIDEO_COMPLAINT = /\b(filmpje|filmpjes|video|video's|videokaartje|kaartje)\b/i;

// Niche/afwerk-video's die nooit als hoofdadvies bij een houtrotvraag horen
// (aanbranden, als lijm gebruiken, mengplateau-plastic, plamuur over vuller,
// resten van gereedschap, bewerken als hout). Ze winnen anders van een echte
// reparatievideo omdat ze de productnaam toevallig in de titel dragen.
const VIDEO_NICHE = new Set([
  'yt-ETy10MKIp_w', // houtrotvuller aanbranden
  'yt-VsjrZm68nD0', // houtrotvuller/plamuur als lijm
  'yt-TnkDCof8lN0', // houtrotvuller en plastic (mengplateau)
  'yt-Nawd7NHdvvs', // plamuur over de houtrotvuller
  'yt-I_vI6sy82VE', // uitgeharde resten op gereedschap
  'yt-2fVPMwXiLcI', // houtrotvuller bewerken als hout
]);

// Kies de best passende video op basis van de VRAAG van de gebruiker (niet het
// antwoord; dat noemt vaak voorbeelden/objecten en zou bij een begroeting of
// diagnosevraag een verkeerde video triggeren).
// Een instructievideo hoort ALLEEN bij een echte hoe-doe-ik-/reparatievraag. Een
// losse productnaam in een service-, klacht- of retourvraag ("een koker plamuur is
// gescheurd, komt dat vaker voor?", "waar vind ik mijn factuur") mag GEEN video
// opleveren; daarom is een hoe-/reparatie-signaal verplicht (dit dekt meteen ook
// koop-/prijsvragen af, die dat signaal missen).
const VIDEO_HOWTO = /\b(hoe|repareren|repareer|reparatie|aanbrengen|aanbreng|gebruiken|gebruik|stappenplan|mengen|mengverhouding|verwijderen|frezen|schuren|aanmaken|toepassen|stap|vullen|opvullen|dichtsmeren|modelleren|afwerken|behandelen|verwerken)\b/i;

function relevantVideos(query, { limit = 1 } = {}) {
  const q = String(query || '');
  if (!VIDEO_HOWTO.test(q)) return []; // geen hoe-/reparatie-intentie → geen instructievideo
  if (VIDEO_COMPLAINT.test(q)) return []; // gebruiker praat over de video zelf → geen nieuwe plakken
  const base = tokenize(q).map(stem).filter((t) => t.length > 2 && !VIDEO_GENERIC.has(t));
  // Alleen object-/product-/techniek-termen mogen een video triggeren (geen filler).
  const topic = base.filter((t) => VIDEO_TOPIC.has(t));
  if (!topic.length) return [];
  const want = new Set(topic);
  for (const t of topic) for (const extra of (VIDEO_SYN[t] || [])) want.add(stem(extra));
  const seen = new Set();
  const cand = [];
  for (const p of DATA) {
    if (p.type !== 'video') continue;
    if (VIDEO_NICHE.has(p.slug)) continue; // niche/afwerk-video's nooit als hoofdadvies
    const key = p.title.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const titleStems = [...new Set(
      tokenize(cleanVideoTitle(p.title)).map(stem).filter((t) => t.length > 2 && !VIDEO_GENERIC.has(t))
    )];
    const hits = titleStems.filter((t) => want.has(t)).length;
    if (hits < 1) continue;
    const frag = /^\s*stap\s*\d/i.test(p.title) ? 1 : 0; // deelstap-video = lagere prioriteit
    // Volledige stappenplan/instructievideo > losse "... repareren"-video > overig.
    const howto = /stappenplan|instructievideo/i.test(p.title) ? 2 : (/repareren|reparatie|verwijderen/i.test(p.title) ? 1 : 0);
    cand.push({ p, hits, frag, howto });
  }
  // Niet-deelstap eerst; dan meeste treffers; dan volledige how-to.
  cand.sort((a, b) => a.frag - b.frag || b.hits - a.hits || b.howto - a.howto);
  return cand.slice(0, limit).map((x) => ({
    title: cleanVideoTitle(x.p.title),
    url: x.p.url,
    thumb: ytThumb(x.p.url),
  }));
}

// Maak van een YouTube-titel een nette kaarttitel: pak het eerste deel vóór een
// "|"-scheiding (gooit "... | Zo doe je dat | EAZYFIX"-ruis weg) en haal een
// losse "Eazyfix:"-prefix weg. Valt terug op de originele titel.
function cleanVideoTitle(t) {
  let s = String(t || '').split('|')[0].trim();
  s = s.replace(/\s*[-–]\s*eazyfix[®\s]*$/i, '').trim(); // brand-staart "- EAZYFIX®"
  s = s.replace(/^eazyfix[®\s]*:?\s*/i, '').trim();
  if (!s) return String(t || '').trim();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  // Merknaam altijd in hoofdletters, ook midden in de titel ("Eazyfix®" -> "EAZYFIX®").
  return s.replace(/eazyfix/gi, 'EAZYFIX');
}

// Thumbnail-URL afleiden uit een YouTube-watch-link.
function ytThumb(url) {
  const m = String(url || '').match(/[?&]v=([\w-]+)/) || String(url || '').match(/youtu\.be\/([\w-]+)/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : '';
}

// Maak een kort fragment rond de eerste (synoniem-)treffer.
// Zoekt het eerste woord waarvan de stam een van de zoekstammen prefix-matcht.
function excerpt(text, stems, len = 500) {
  const set = new Set(stems);
  let pos = -1;
  const re = /[a-zà-ÿ0-9]+/gi;
  let m;
  while ((m = re.exec(text))) {
    const s = stem(m[0]);
    let hit = set.has(s);
    if (!hit && s.length >= 4) for (const q of set) if (q.length >= 4 && (q.startsWith(s) || s.startsWith(q))) { hit = true; break; }
    if (hit) { pos = m.index; break; }
  }
  if (pos < 0) pos = 0;
  const start = Math.max(0, pos - 120);
  const slice = text.slice(start, start + len).trim();
  return (start > 0 ? '… ' : '') + slice + (text.length > start + len ? ' …' : '');
}

// Merknaam in zichtbare context altijd EAZYFIX. De lookahead spaart URLs/domeinen
// (eazy-fix.nl) en slugs, die hoofdlettergevoelig zijn.
function normalizeBrand(s) {
  return String(s || '').replace(/\bEazy-?fix\b(?![\w./@-])/gi, 'EAZYFIX');
}

function formatEntry(p, ts) {
  const label = { product: 'Product', blog: 'Blog', pagina: 'Pagina', video: 'Video' }[p.type] || 'Pagina';
  return `[${label}] ${normalizeBrand(p.title)}\n${normalizeBrand(excerpt(p.text, ts))}\n(${p.url})`;
}

const KENNIS_TOOL = {
  name: 'zoek_kennis',
  description:
    'Doorzoek de EAZYFIX®-website (producten, FAQ en blog/how-to) op een onderwerp. ' +
    'Gebruik deze tool voor productdetails, mengverhoudingen, gebruiksaanwijzingen, ' +
    'veelgestelde vragen of klusadvies, zodat je antwoord klopt met de actuele website. ' +
    'De website is leidend boven je eigen aannames; raadpleeg haar bij twijfel.',
  input_schema: {
    type: 'object',
    properties: {
      onderwerp: {
        type: 'string',
        description: 'Waar de gebruiker info over wil, bijv. "houtrotvuller mengverhouding" of "houtrot in kozijn".',
      },
    },
    required: ['onderwerp'],
  },
};

// Tekst voor een commerciële/service-vraag: de bot heeft hier bewust geen kennis
// van; niet gokken maar doorverwijzen.
function serviceFallback(onderwerp) {
  return `De vraag over "${onderwerp || ''}" gaat over commerciële of servicezaken ` +
    '(zoals prijzen, bestellen, betalen, bezorgen, retour of garantie). Daar heeft de EAZYFIX®-bot ' +
    'bewust geen gegevens over. Verzin NIETS: verwijs de klusser vriendelijk naar de webshop op ' +
    'eazy-fix.nl of de EAZYFIX®-binnendienst (+31 (0)85 201 201 1). Voor een fysiek verkooppunt mag ' +
    'je de tool find_verkooppunt gebruiken als de klusser een plaats of postcode noemt.';
}

// Tekst voor een inhoudelijke vraag zonder betrouwbare treffer: niet gokken.
function noMatchFallback(onderwerp) {
  return `Geen betrouwbare informatie gevonden op eazy-fix.nl over "${onderwerp || ''}". ` +
    'Verzin zelf NIETS en gok niet. Zeg de klusser eerlijk en vriendelijk, in je normale warme ' +
    'doe-het-zelf-toon, dat je dit even niet zeker weet, en verwijs voor een betrouwbaar antwoord ' +
    'naar de EAZYFIX®-binnendienst: +31 (0)85 201 201 1.';
}

function runKennisTool(input) {
  const onderwerp = input && input.onderwerp;
  if (classifyIntent(onderwerp) === 'service') return serviceFallback(onderwerp);
  const stems = queryStems(onderwerp).expanded;
  const found = confidentSearch(onderwerp, 3);
  if (!found.length) return noMatchFallback(onderwerp);
  return 'Gevonden op eazy-fix.nl (leidend):\n\n' + found.map((p) => formatEntry(p, stems)).join('\n\n');
}

// Geformatteerde kennis-context voor injectie in een prompt (bv. pass-2 van de
// foto-analyse). Geeft lege string als er niets gevonden is.
function searchContext(query, limit = 3) {
  // Commerciële/service-vraag: geen (misleidende) productkennis injecteren; de
  // persona verwijst zulke vragen naar de binnendienst.
  if (classifyIntent(query) === 'service') return '';
  const stems = queryStems(query).expanded;
  // Alleen voldoende sterke matches injecteren — zwakke treffers leiden tot gokken.
  const found = confidentSearch(query, limit);
  if (!found.length) return '';
  return 'RELEVANTE EAZY-FIX.NL KENNIS (leidend boven aannames):\n\n' +
    found.map((p) => formatEntry(p, stems)).join('\n\n');
}

module.exports = { search, scoreAll, confidentSearch, classifyIntent, searchContext, relevantVideos, cleanVideoTitle, runKennisTool, KENNIS_TOOL, DATA };
