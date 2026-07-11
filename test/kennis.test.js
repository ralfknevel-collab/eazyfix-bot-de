const { test } = require('node:test');
const assert = require('node:assert');
const { search, classifyIntent, confidentSearch, searchContext, relevantVideos, cleanVideoTitle, runKennisTool, KENNIS_TOOL, DATA } = require('../src/kennis');
const { fixDepthUnits, EXCLUDE_PAGE, isListingJunk, dedupeByUrl, scrubText } = require('../scripts/scrub');

// DE-kennis: gescrapete eazy-fix.de-snapshot + Duitse gecureerde FAQ. Retrieval
// (stemmer/synoniemen/intent) is Duits. Er is (nog) geen Duitse videobron, dus
// relevantVideos levert bewust niets (Nederlandse titels matchen niet op Duitse
// zoektermen).

test('kennis-dataset geladen met producten, blogs en pagina\'s', () => {
  assert.ok(Array.isArray(DATA) && DATA.length > 30);
  const types = new Set(DATA.map((p) => p.type));
  assert.ok(types.has('product'));
  assert.ok(types.has('blog'));
});

test('zoeken op Holzspachtelmasse levert relevante pagina bovenaan', () => {
  const r = search('Holzspachtelmasse', 3);
  assert.ok(r.length > 0);
  assert.ok(/holzspachtelmasse|holzfäule/i.test(r[0].title + ' ' + r[0].text));
});

test('synoniemen: spreektaal vindt de juiste pagina', () => {
  const r = search('mein Fensterholz fühlt sich weich an', 3);
  assert.ok(r.length > 0);
  const blob = r.map((p) => p.title + ' ' + p.text).join(' ').toLowerCase();
  assert.ok(/fenster|holzf(ä|ae)ule/.test(blob), 'weich+Fensterholz moet Holzfäule/Fenster vinden');
});

test('meervoud/verbuiging matcht enkelvoud (Duitse stemmer)', () => {
  const r = search('Fensterrahmen reparieren', 3);
  assert.ok(r.some((p) => /fenster/i.test(p.title + ' ' + p.text)));
});

test('resultaten hebben geen dubbele titels', () => {
  const r = search('Holz reparieren', 3);
  const titles = r.map((p) => p.title.toLowerCase());
  assert.equal(new Set(titles).size, titles.length);
});

test('geen prijzen in de kennisdata', () => {
  assert.ok(!DATA.some((p) => /€|\b\d+,\d{2}\b/.test(p.text)), 'er mag geen bedrag in de tekst staan');
});

test('geen kortingen/acties (DE) in de kennisdata', () => {
  const rx = /rabattcode|%\s?rabatt|gutschein|gl(ü|ue)cksrad|kostenlose(r|s)?\s+versand|nicht vorr(ä|ae)tig/i;
  const bad = DATA.filter((p) => rx.test(p.text)).map((p) => p.title);
  assert.deepEqual(bad, [], `er mag geen Rabatt/Aktion in de tekst staan: ${bad.join(', ')}`);
});

test('geen reparatiediepte in cm (canoniek is mm) in de kennisdata', () => {
  const rx = /\b\d{1,2}\s*(?:und|bis|-|–)\s*\d{1,2}\s*cm\s+tief\b/i;
  const bad = DATA.filter((p) => rx.test(p.text)).map((p) => p.title);
  assert.deepEqual(bad, [], `reparatiediepte hoort in mm: ${bad.join(', ')}`);
});

test('fixDepthUnits corrigeert cm-diepte-bereik maar laat losse cm-maten staan (DE)', () => {
  assert.equal(fixDepthUnits('Reparaturen zwischen 5 bis 20 cm tief.'), 'Reparaturen zwischen 5 bis 20 mm tief.');
  assert.equal(fixDepthUnits('Holzschäden von 5 und 20 cm tief'), 'Holzschäden von 5 und 20 mm tief');
  // Losse maten (geen diepte-bereik) blijven ongemoeid.
  assert.equal(fixDepthUnits('Maße: 8 x ø 2 cm pro Kartusche'), 'Maße: 8 x ø 2 cm pro Kartusche');
  assert.equal(fixDepthUnits('entferne auch 2 cm rundherum das morsche Holz'), 'entferne auch 2 cm rundherum das morsche Holz');
});

test('geen niet-houtherstel service-/juridische pagina\'s (DE) in de kennisdata', () => {
  const bad = DATA.filter((p) => EXCLUDE_PAGE.test(p.url || '')).map((p) => p.title);
  assert.deepEqual(bad, [], `service-/juridische pagina's horen niet in KB: ${bad.join(', ')}`);
});

test('geen listing-/navigatie-junk (titel = kaal label) in de kennisdata', () => {
  const bad = DATA.filter((p) => isListingJunk(p)).map((p) => `${p.title} (${p.url})`);
  assert.deepEqual(bad, [], `listing-junk hoort niet in KB: ${bad.join(', ')}`);
});

test('geen dubbele canonieke URLs in de kennisdata', () => {
  const counts = new Map();
  for (const p of DATA) {
    const key = String(p.url || '').replace(/\/+$/, '').toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const dupes = [...counts].filter(([, n]) => n > 1).map(([u]) => u);
  assert.deepEqual(dupes, [], `dubbele URLs: ${dupes.join(', ')}`);
});

test('dedupeByUrl houdt per URL de entry met de langste tekst', () => {
  const out = dedupeByUrl([
    { url: 'https://x.de/a/', text: 'kort' },
    { url: 'https://x.de/a', text: 'veel langere inhoud hier' },
    { url: 'https://x.de/b/', text: 'b' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out.find((p) => /\/a$/.test(p.url)).text, 'veel langere inhoud hier');
});

test('scrub verwijdert promo-zin maar behoudt reparatiefeiten (DE)', () => {
  const prose = 'Mische die zwei Komponenten und trage sie auf. Nach 30 Minuten ausgehärtet. Du bekommst 10 Jahre Garantie darauf.';
  const out = scrubText(prose);
  assert.match(out, /zwei Komponenten/);
  assert.match(out, /30 Minuten ausgehärtet/);
  assert.doesNotMatch(out, /Garantie/);
});

test('merknaam EAZYFIX genormaliseerd in tool-output, domein (eazy-fix.de) ongemoeid', () => {
  const out = runKennisTool({ onderwerp: 'Holzfäule im Fensterrahmen reparieren' });
  // URL-/bronregels bevatten hoofdlettergevoelige slugs (eazyfix-...); alleen de
  // zichtbare PROZA moet EAZYFIX zijn, dus strip de (url)-regels vóór de check.
  const prose = out.replace(/\(https?:\/\/[^)]*\)/g, '');
  const leaks = (prose.match(/\beazyfix\b/gi) || []).filter((m) => m !== 'EAZYFIX');
  assert.deepEqual(leaks, [], `merknaam moet EAZYFIX zijn: ${leaks.join(', ')}`);
  assert.match(out, /eazy-fix\.de/);
});

test('geen mixed-case merknaam in titels van de kennisdata', () => {
  const rx = /\bEazy-?fix\b(?![\w./@-])/;
  const bad = DATA.filter((p) => rx.test(p.title || '')).map((p) => p.title);
  assert.deepEqual(bad, [], `titels moeten EAZYFIX gebruiken: ${bad.slice(0, 5).join(' | ')}`);
});

test('productvraag rangschikt een productpagina bovenaan; Holzspachtelmasse vóór Feinspachtel', () => {
  const r = search('Premium Holzspachtelmasse', 5);
  assert.equal(r[0].type, 'product', `verwacht een product bovenaan, kreeg: ${r[0].type}`);
  const idxMasse = r.findIndex((p) => /holzspachtelmasse/i.test(p.title));
  const idxFein = r.findIndex((p) => /feinspachtel/i.test(p.title));
  assert.ok(idxMasse !== -1, 'Holzspachtelmasse-pagina hoort in de top');
  assert.ok(idxFein === -1 || idxMasse < idxFein, 'Holzspachtelmasse hoort vóór Feinspachtel');
});

test('geen video bij koop-/prijsvraag zonder hoe-doe-ik-intentie', () => {
  assert.deepEqual(relevantVideos('was kostet die Holzspachtelmasse'), []);
  assert.deepEqual(relevantVideos('wo kann ich den Feinspachtel kaufen'), []);
});

test('geen Duitse videobron: instructievraag levert (nog) geen videokaart', () => {
  // Er is geen Duitse videobron; Nederlandse titels matchen niet op Duitse termen.
  assert.deepEqual(relevantVideos('wie repariere ich Holzfäule im Fensterrahmen'), []);
});

test('klacht over de video zelf onderdrukt een nieuwe videokaart', () => {
  assert.deepEqual(relevantVideos('Das Video ist nicht von einer Holzreparatur'), []);
  assert.deepEqual(relevantVideos('ich bekomme schon wieder ein Video'), []);
});

test('kennis bevat de gecureerde Kartuscheninhoud (150 ml, niet in gram)', () => {
  const ctx = searchContext('Kartusche Holzspachtelmasse Schichtdicke');
  assert.match(ctx, /150\s?ml/i);
});

test('cleanVideoTitle normaliseert merknaam naar EAZYFIX', () => {
  assert.equal(cleanVideoTitle('Holzfäule reparieren mit dem Eazyfix® Spachtel'), 'Holzfäule reparieren mit dem EAZYFIX® Spachtel');
  assert.doesNotMatch(cleanVideoTitle('So funktioniert die eazyfix Methode'), /eazyfix/);
});

test('runKennisTool geeft sitebron-tekst (eazy-fix.de) terug', () => {
  const out = runKennisTool({ onderwerp: 'Holzfäule im Fensterrahmen reparieren' });
  assert.match(out, /eazy-fix\.de/);
  assert.ok(out.length > 50);
});

test('intentherkenning (DE): commercieel/service vs inhoudelijk (how-to wint bij mix)', () => {
  assert.equal(classifyIntent('was kostet die Holzspachtelmasse'), 'service');
  assert.equal(classifyIntent('wie bezahle ich'), 'service');
  assert.equal(classifyIntent('wann wird meine Bestellung geliefert'), 'service');
  assert.equal(classifyIntent('Rücksendung'), 'service');
  assert.equal(classifyIntent('Holzspachtelmasse Mischungsverhältnis'), 'content');
  assert.equal(classifyIntent('Holzfäule im Fensterrahmen reparieren'), 'content');
  // Gemengd: prijs + how-to → inhoudelijk (persona verwijst de prijs apart door).
  assert.equal(classifyIntent('was kostet es und wie mische ich die Masse'), 'content');
});

test('commerciële vraag krijgt geen kennis-injectie en wordt doorverwezen (DE)', () => {
  assert.equal(searchContext('was kostet die Holzspachtelmasse'), '');
  const tool = runKennisTool({ onderwerp: 'wann wird meine Bestellung geliefert' });
  assert.match(tool, /kommerzielle oder Service-Themen/);
  assert.match(tool, /\+31 85 201 201 1/);
});

test('zwakke/off-topic vraag injecteert geen kennis (confidence-drempel)', () => {
  for (const q of ['erzähl mir einen Witz', 'was ist die Hauptstadt von Frankreich', 'das Wetter morgen']) {
    assert.equal(confidentSearch(q).length, 0, `verwacht geen betrouwbare treffer voor: ${q}`);
    assert.equal(searchContext(q), '', `verwacht lege context voor: ${q}`);
  }
  for (const q of ['Holzspachtelmasse Mischungsverhältnis', 'Holzfäule im Fensterrahmen reparieren', 'Feinspachtel für Kratzer']) {
    assert.ok(confidentSearch(q).length > 0, `verwacht treffer voor: ${q}`);
  }
});

test('lege vraag geeft nette terugval: niet verzinnen, verwijs naar binnendienst (DE)', () => {
  const out = runKennisTool({ onderwerp: '' });
  assert.match(out, /Keine verlässlichen Informationen/);
  assert.match(out, /\+31 85 201 201 1/);
});

test('tool-spec heeft naam zoek_kennis en verplicht onderwerp', () => {
  assert.equal(KENNIS_TOOL.name, 'zoek_kennis');
  assert.deepEqual(KENNIS_TOOL.input_schema.required, ['onderwerp']);
});
