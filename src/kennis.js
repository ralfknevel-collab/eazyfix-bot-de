// Zoeken in de EAZYFIX®-websitekennis (producten, FAQ, blog/how-to, video's).
// Bronnen worden samengevoegd, zodat een refresh van de ene bron de andere niet wist:
// - kennis.json        site-snapshot van eazy-fix.de (scripts/pull-site.js)
// - kennis-video.json  YouTube-kennis (nog NL @eazyfixnl; Duitse titels ontbreken,
//                       dus deze video's matchen niet op Duitse zoektermen en komen
//                       niet boven — tot er een Duitse video-bron is)
// - kennis-extra.json  handmatig gecureerde feiten (niet door een pull overschreven)
// De website blijft leidend; deze tool laat de bot de actuele kennis raadplegen.
// Taal: de kennis is Duits (eazy-fix.de); stemmer/synoniemen/intent zijn Duits.

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
const OUTDATED_SLUGS = new Set([]);

const DATA = dedupeData([
  ...loadSource('./kennis.json'),
  ...loadSource('./kennis-video.json'),
  ...loadSource('./kennis-extra.json'),
]).filter((p) => !OUTDATED_SLUGS.has(p.slug));

// Duitse stopwoorden (lidwoorden, voornaamwoorden, voorzetsels, hulpwerkwoorden,
// voegwoorden). Woorden van 2 tekens vallen sowieso al weg (len > 2-filter).
const STOP = new Set(
  ('der die das den dem des ein eine einen einem einer und oder von für mit auf ist dass ' +
   'wie was wer wo kann kannst muss musst soll sollst bei als auch nicht mein dein sein ihr ihre ' +
   'diese dieser dieses dies nach aus pro bin habe hat haben wird wirst werden sind war wurde ' +
   'müssen können darf dann aber weil denn doch vom beim zum zur noch wohl schon nur sehr über ' +
   'hier dort man sich wenn dann etwas ganz mehr').split(' ')
);

// Holzfäule-synoniemen: woorden uit dezelfde groep tellen als elkaar, zodat
// spreektaal ("mein Fensterholz ist weich") de juiste pagina ("Holzfäule Fenster")
// vindt. Duitse termen, afgestemd op de DE-kennis (eazy-fix.de).
// Nederlandse spreektaal staat bewust IN de Duitse groepen, niet in eigen groepen:
// een kwart van de gesprekken op de Duitse chat is Nederlands ("mijn kozijn is
// zacht", "past de koker in een kitpistool"), en alleen zo vindt zo'n vraag de
// Duitse pagina. Een losse NL-groep zou wel NL-woorden onderling koppelen, maar
// niet aan hun Duitse tegenhanger.
const SYNGROUPS = [
  ['holzfäule', 'fäule', 'fäulnis', 'faul', 'faules', 'morsch', 'morsches', 'weich', 'weiches', 'schwammig', 'angegriffen', 'vermodert', 'verrottet', 'houtrot', 'zacht', 'aangetast'],
  ['fensterrahmen', 'rahmen', 'fenster', 'fensterholz', 'kozijn', 'raamkozijn', 'raam'],
  ['tür', 'türen', 'türrahmen', 'türpfosten', 'deur', 'deurkozijn'],
  ['fensterbank', 'schwelle', 'türschwelle', 'sohlbank', 'dorpel', 'onderdorpel', 'vensterbank'],
  ['lack', 'farbe', 'anstrich', 'lackschicht', 'blättert', 'abblättern', 'blase', 'abplatzen', 'verf', 'lak', 'bladdert'],
  ['fräser', 'fräsen', 'holzfäulefräser', 'ausfräsen', 'wegfräsen', 'abtragen'],
  ['dremel', 'multitool', 'bohrmaschine', 'akkuschrauber', 'maschine', 'drehzahl', 'umdrehungen', 'rotary', 'rotationswerkzeug'],
  ['holzspachtelmasse', 'spachtelmasse', 'spachtel', 'füllen', 'auffüllen', 'epoxid', 'epoxy', 'abdichten', 'houtrotvuller', 'vulmiddel'],
  ['feinspachtel', 'holzfeinspachtel', 'feinspachteln', 'plamuur', 'plamuren'],
  ['holzimprägnierung', 'imprägnierung', 'imprägnieren', 'vorbehandeln', 'härter', 'verfestiger', 'primer', 'houtversterker', 'verharder'],
  ['mischungsverhältnis', 'verhältnis', 'mischen', 'anmischen', 'anrühren'],
  ['aushärten', 'trocknen', 'trocknungszeit', 'härten', 'aushärtezeit', 'verarbeitungszeit'],
  ['feuchte', 'feucht', 'feuchtigkeit', 'feuchtemessgerät', 'holzfeuchtemessgerät', 'feuchtigkeitsmesser', 'holzfeuchte', 'nass', 'feuchtegehalt'],
  ['schleifen', 'glatt', 'schmirgeln', 'schleifpapier'],
  ['überstreichen', 'streichen', 'lackieren', 'grundierung', 'decklack', 'überlackieren'],
  ['set', 'paket', 'reparaturset', 'starterset', 'standardset', 'starterpaket', 'erweiterungsset', 'komplettset'],
  ['kaufen', 'bestellen', 'webshop', 'verkaufsstelle', 'händler', 'laden', 'preis', 'kosten'],
  ['werkzeug', 'breitspachtel', 'schmalspachtel', 'mischspachtel', 'modellierstrips', 'mischbrett', 'kartuschenpresse'],
  ['treppe', 'treppenstufe', 'stufe'],
  ['möbel', 'tisch', 'schrank', 'möbelstück'],
  // Onderstaande groepen komen uit de analyse van 268 live-chatgesprekken
  // (docs/chatanalyse-DE-2026-07.md). Het zijn de woorden waarmee klanten hun
  // vraag echt stellen; ze ontbraken hierboven, waardoor zoek_kennis op deze
  // onderwerpen niets of het verkeerde ophaalde.
  ['lieferung', 'lieferzeit', 'liefern', 'versand', 'versandkosten', 'verschicken', 'paket', 'werktage', 'bestellung', 'bestellt', 'amazon', 'levertijd', 'bezorging', 'verzending'],
  ['haltbarkeit', 'haltbar', 'angebrochen', 'geöffnet', 'lagerung', 'lagern', 'aufbewahren', 'aufbewahrung', 'mindesthaltbarkeit', 'houdbaar', 'aangebroken'],
  ['ergiebigkeit', 'menge', 'wieviel', 'reicht', 'ausreichend', 'verbrauch', 'kartuschen', 'inhalt'],
  ['kartuschenpistole', 'silikonpistole', 'auspresspistole', 'kartusche', 'kartuschenpresse', 'pistole', 'koker', 'tube', 'kitpistool', 'kitpatroon'],
  ['oszillierend', 'rotierend', 'schaft', 'kopfdurchmesser', 'aufsatz'],
  ['untergrund', 'haftung', 'haftet', 'kunststoff', 'pvc', 'melamin', 'glas', 'mdf', 'spanplatte', 'sperrholz', 'multiplex', 'styropor', 'stein', 'beton', 'spaanplaat', 'kunststof', 'boeidelen'],
  ['einfärben', 'abtönen', 'abtönkonzentrat', 'farbkonzentrat', 'pigment', 'ockergelb', 'beige', 'lasur', 'beize'],
  ['garantie', 'gewährleistung', 'reklamation', 'umtausch', 'retoure', 'rücksendung', 'rückgabe', 'widerruf', 'defekt', 'beschwerde'],
  ['temperatur', 'kälte', 'kalt', 'frost', 'frostsicher', 'winter', 'hitze', 'grad'],
  ['teilersatz', 'einleimen', 'einkleben', 'kleben', 'laminieren', 'holzstück', 'ersetzen'],
  ['bohren', 'schrauben', 'schraube', 'schraubloch', 'dübel', 'nachbearbeiten', 'schroefgat', 'schroefgaten', 'voorboren'],
  ['rabatt', 'gutschein', 'aktionscode', 'newsletter', 'angebot'],
];

// Lichte Duitse stemmer: vouwt umlauten uit (ä -> ae, zodat "Holzfäule" matcht met
// de slug "holzfaeule") en haalt veelvoorkomende meervoud-/verbuigingsuitgangen weg.
// Query en documenten lopen door dezelfde stem, dus consistentie > taalkundige perfectie.
function stem(w) {
  w = w.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  for (const suf of ['ungen', 'heiten', 'keiten', 'nisse', 'chen', 'lein', 'ung', 'nis', 'en', 'er', 'es', 'st', 'e', 'n', 's']) {
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
// onderscheidend signaal zijn (anders rangschikt "Premium Holzspachtelmasse" alle
// Premium-producten gelijk). Tellen niet mee voor de titel-/slug-identiteitsboost.
const RANK_GENERIC = new Set(['premium', 'eazyfix', 'edelstahl', 'shop'].map(stem));

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

// Tel term-frequentie inclusief prefix-matches (fenster ~ fensterrahmen).
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
      // canonieke product-/contentpagina zit (bv. "holzspachtelmasse" in
      // premium-holzspachtelmasse) weegt zwaar. Zo wint de Holzspachtelmasse-PAGINA
      // van een product dat alleen "premium" deelt, én van losse blogs/video's die
      // het woord toevallig vaak noemen.
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
// Stammen + \w* zodat Duitse verbuigingen meelopen (bezahle/bezahlen/bezahlt,
// Lieferung/liefern, Bestellung/bestellen). \b vooraan houdt de stam woordinitieel.
// Uitgebreid met paket/sendung/zustell/umtausch/reklamation: die woorden komen in
// de echte chats vaak voor ("wann kommt mein Paket an", "ich möchte umtauschen")
// maar vielen buiten de poort, waardoor zulke vragen alsnog productkennis kregen
// in plaats van een doorverwijzing. Over service-onderwerpen heeft de bot bewust
// geen eigen data: hij verwijst naar de website of de binnendienst.
const SERVICE_INTENT = /\b(preis|preisliste|kost|tarif|angebot|bestell|zahl|bezahl|sofort|kreditkart|paypal|rechnung|liefer|versand|versend|paket|sendung|zustell|retour|rücksend|zurücksend|umtausch|widerruf|garantie|gewährleist|reklamation|konto|einlogg|anmeld|passwort|stellenangebot|bewerb|webshop|warenkorb|gutschein|rabatt)\w*/i;
const HOWTO_SIGNAL = /\b(reparier|reparatur|misch|auftrag|anwend|anbring|aufbring|schritt|trocken|trocknung|schleif|entfern|einwirk|aushärt|fräs|behandel|vorbehandel|haft|verarbeit|grundier|füll|auffüll|modellier|überstreich|überlackier)\w*/i;

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
// LET OP: de videobron (kennis-video.json) is nog NL; Duitse zoektermen matchen niet
// op Nederlandse titels, dus er komt momenteel geen video boven. De whitelist hieronder
// is al Duits, zodat het werkt zodra er een Duitse video-bron wordt toegevoegd.
const VIDEO_GENERIC = new Set(
  ['verwenden', 'machen', 'tun', 'gehen', 'wollen', 'haben', 'setzen', 'können', 'müssen', 'brauchen',
   'nötig', 'gut', 'beste', 'weg', 'art', 'selbst', 'super', 'tipp', 'video', 'anleitung', 'schritt',
   // merk/filler: komen in bijna elk antwoord/titel voor en mogen niet matchen
   'eazyfix', 'premium', 'repair', 'care', 'professionell', 'alle', 'produkt', 'produkte',
   // te algemeen: staan in vrijwel elk houtrot-antwoord (ook in puur diagnostische
   // vragen), dus mogen op zichzelf geen video triggeren
   'reparieren', 'reparatur', 'herstellen', 'herstellung', 'holz', 'schaden', 'beschädigung', 'arbeit', 'stelle',
   // 'holzfäule'/'faul' staan in bijna elke videotitel -> te generiek om op te matchen;
   // de OBJECT-term (fenster/tür/treppe) of productnaam bepaalt de video.
   'holzfäule', 'fäule', 'faul', 'angegriffen'].map(stem)
);

// Kleine object/term -> video-term map (alleen wat in videotitels voorkomt).
const VIDEO_SYN = {
  fenster: ['fensterrahmen'], fensterholz: ['fensterrahmen'], rahmen: ['fensterrahmen'],
  türschwelle: ['fensterbank'], schwelle: ['fensterbank'],
};

// WHITELIST van termen die een video MOGEN triggeren: alleen concrete objecten
// (fenster, tür, fensterbank, treppe, ...), productnamen en technieken met een eigen
// video. Alles daarbuiten (fillerwoorden) mag NOOIT matchen. Gestemd, zodat
// verbuigingen meelopen.
const VIDEO_TOPIC = new Set([
  // objecten
  'fensterrahmen', 'rahmen', 'fenster', 'fensterholz', 'fensterbank', 'schwelle', 'türschwelle',
  'tür', 'türen', 'türrahmen', 'treppe', 'treppenstufe', 'stufe', 'möbel', 'fensterladen', 'laden',
  'boden', 'dach',
  // producten
  'holzspachtelmasse', 'spachtelmasse', 'feinspachtel', 'holzimprägnierung', 'imprägnierung',
  'holzfäulefräser', 'fräser',
  // technieken met een eigen instructievideo
  'fräsen', 'modellieren', 'teilerneuerung', 'ersetzen',
].map(stem));

// De gebruiker heeft het OVER het videokaartje zelf (meestal een klacht: "das Video
// ist nicht von Holzfäule", "ich bekomme wieder ein Video"). Plak dan GEEN nieuwe
// (mogelijk opnieuw verkeerde) video.
const VIDEO_COMPLAINT = /\b(video|videos|clip|clips|filmchen|kärtchen|videokärtchen)\b/i;

// Niche/afwerk-video's die nooit als hoofdadvies bij een houtrotvraag horen. Op slug;
// nog NL-slugs (blijven staan tot er een Duitse video-bron is).
const VIDEO_NICHE = new Set([]);

// Kies de best passende video op basis van de VRAAG van de gebruiker (niet het
// antwoord). Een instructievideo hoort ALLEEN bij een echte hoe-doe-ik-/reparatievraag.
const VIDEO_HOWTO = /\b(wie|reparieren|reparier|reparatur|auftragen|auftrag|verwenden|verwend|gebrauch|anleitung|stappenplan|ablaufplan|mischen|mischungsverhältnis|entfernen|fräsen|schleifen|anmischen|anwenden|schritt|füllen|auffüllen|modellieren|abschleifen|behandeln|verarbeiten)\b/i;

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
    const frag = /^\s*(stap|schritt)\s*\d/i.test(p.title) ? 1 : 0; // deelstap-video = lagere prioriteit
    // Volledig stappenplan/instructievideo > losse "... reparieren"-video > overig.
    const howto = /stappenplan|ablaufplan|instructievideo|instruktionsvideo/i.test(p.title) ? 2 : (/repareren|reparieren|reparatie|reparatur|verwijderen|entfernen/i.test(p.title) ? 1 : 0);
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
// "|"-scheiding en haal een losse "Eazyfix:"-prefix weg. Valt terug op de originele titel.
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
// (eazy-fix.de) en slugs, die hoofdlettergevoelig zijn.
function normalizeBrand(s) {
  return String(s || '').replace(/\bEazy-?fix\b(?![\w./@-])/gi, 'EAZYFIX');
}

function formatEntry(p, ts) {
  const label = { product: 'Produkt', blog: 'Blog', pagina: 'Seite', video: 'Video' }[p.type] || 'Seite';
  return `[${label}] ${normalizeBrand(p.title)}\n${normalizeBrand(excerpt(p.text, ts))}\n(${p.url})`;
}

const KENNIS_TOOL = {
  name: 'zoek_kennis',
  description:
    'Durchsuche die EAZYFIX®-Website (Produkte, FAQ und Blog/Anleitungen) zu einem Thema. ' +
    'Nutze dieses Tool für Produktdetails, Mischungsverhältnisse, Gebrauchsanweisungen, ' +
    'häufige Fragen oder Reparaturtipps, damit deine Antwort mit der aktuellen Website übereinstimmt. ' +
    'Die Website ist maßgeblich über deinen eigenen Annahmen; zieh sie im Zweifel zurate.',
  input_schema: {
    type: 'object',
    properties: {
      onderwerp: {
        type: 'string',
        description: 'Wozu der Nutzer Infos möchte, z. B. "Holzspachtelmasse Mischungsverhältnis" oder "Holzfäule im Fensterrahmen".',
      },
    },
    required: ['onderwerp'],
  },
};

// Tekst voor een commerciële/service-vraag: de bot heeft hier bewust geen kennis
// van; niet gokken maar doorverwijzen.
function serviceFallback(onderwerp) {
  return `Die Frage zu "${onderwerp || ''}" betrifft kommerzielle oder Service-Themen ` +
    '(wie Preise, Bestellung, Bezahlung, Lieferung, Rücksendung oder Garantie). Dazu hat der ' +
    'EAZYFIX®-Bot bewusst keine Daten. Erfinde NICHTS: verweise den Heimwerker freundlich an den ' +
    'Webshop auf eazy-fix.de oder den EAZYFIX®-Innendienst (+31 85 201 201 1). Für eine physische ' +
    'Verkaufsstelle darfst du das Tool find_verkooppunt nutzen, wenn der Heimwerker einen Ort oder ' +
    'eine Postleitzahl nennt.';
}

// Tekst voor een inhoudelijke vraag zonder betrouwbare treffer: niet gokken.
function noMatchFallback(onderwerp) {
  return `Keine verlässlichen Informationen auf eazy-fix.de zu "${onderwerp || ''}" gefunden. ` +
    'Erfinde selbst NICHTS und rate nicht. Sag dem Heimwerker ehrlich und freundlich, in deinem ' +
    'normalen warmen Heimwerker-Ton, dass du das gerade nicht sicher weißt, und verweise für eine ' +
    'verlässliche Antwort an den EAZYFIX®-Innendienst: +31 85 201 201 1.';
}

function runKennisTool(input) {
  const onderwerp = input && input.onderwerp;
  if (classifyIntent(onderwerp) === 'service') return serviceFallback(onderwerp);
  const stems = queryStems(onderwerp).expanded;
  const found = confidentSearch(onderwerp, 3);
  if (!found.length) return noMatchFallback(onderwerp);
  return 'Gefunden auf eazy-fix.de (maßgeblich):\n\n' + found.map((p) => formatEntry(p, stems)).join('\n\n');
}

// Geformatteerde kennis-context voor injectie in een prompt (bv. pass-2 van de
// foto-analyse). Geeft lege string als er niets gevonden is.
function searchContext(query, limit = 3) {
  // Commerciële/service-vraag: geen (misleidende) productkennis injecteren; de
  // persona verwijst zulke vragen naar de binnendienst.
  if (classifyIntent(query) === 'service') return '';
  const stems = queryStems(query).expanded;
  // Alleen voldoende sterke matches injecteren — zwakke treffers leiden tot gokken.
  // Video's tellen hier NIET mee als leidende kennis: een video-entry is alleen een
  // titel, geen tekst met feiten, en zou een echte productpagina verdringen. Ze
  // blijven wel beschikbaar via relevantVideos (eigen pad, als aanvulling).
  // Nodig sinds de Nederlandse spreektaal in de synoniemgroepen staat: daardoor
  // matchen de Nederlandstalige video's wél op Nederlandse vragen.
  const found = confidentSearch(query, limit + 3).filter((p) => p.type !== 'video').slice(0, limit);
  if (!found.length) return '';
  return 'RELEVANTES EAZY-FIX.DE-WISSEN (maßgeblich über Annahmen):\n\n' +
    found.map((p) => formatEntry(p, stems)).join('\n\n');
}

module.exports = { search, scoreAll, confidentSearch, classifyIntent, searchContext, relevantVideos, cleanVideoTitle, runKennisTool, KENNIS_TOOL, DATA };
