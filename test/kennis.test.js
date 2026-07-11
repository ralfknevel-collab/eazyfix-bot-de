const { test } = require('node:test');
const assert = require('node:assert');
const { search, classifyIntent, confidentSearch, searchContext, relevantVideos, cleanVideoTitle, runKennisTool, KENNIS_TOOL, DATA } = require('../src/kennis');
const { fixDepthUnits, EXCLUDE_PAGE, isListingJunk, dedupeByUrl } = require('../scripts/scrub');

test('kennis-dataset geladen met producten, blogs en pagina\'s', () => {
  assert.ok(Array.isArray(DATA) && DATA.length > 30);
  const types = new Set(DATA.map((p) => p.type));
  assert.ok(types.has('product'));
  assert.ok(types.has('blog'));
});

test('zoeken op houtrotvuller levert relevante pagina bovenaan', () => {
  const r = search('houtrotvuller', 3);
  assert.ok(r.length > 0);
  assert.ok(/houtrot/i.test(r[0].title + ' ' + r[0].text));
});

test('synoniemen: spreektaal vindt de juiste pagina', () => {
  const r = search('mijn raamhout voelt zacht', 3);
  assert.ok(r.length > 0);
  const blob = r.map((p) => p.title + ' ' + p.text).join(' ').toLowerCase();
  assert.ok(/kozijn|houtrot/.test(blob), 'zacht+raamhout moet houtrot/kozijn vinden');
});

test('meervoud/verbuiging matcht enkelvoud', () => {
  const r = search('kozijnen herstellen', 3);
  assert.ok(r.some((p) => /kozijn/i.test(p.title + ' ' + p.text)));
});

test('resultaten hebben geen dubbele titels', () => {
  const r = search('hout repareren', 3);
  const titles = r.map((p) => p.title.toLowerCase());
  assert.equal(new Set(titles).size, titles.length);
});

test('geen prijzen in de kennisdata', () => {
  assert.ok(!DATA.some((p) => /€|\b\d+,\d{2}\b/.test(p.text)), 'er mag geen bedrag in de tekst staan');
});

test('geen kortingen/acties in de kennisdata', () => {
  const rx = /kortingscode|% korting|vaderdagactie|kerstactie|prijzenrad|gratis (bezorging|verzending)/i;
  assert.ok(!DATA.some((p) => rx.test(p.text)), 'er mag geen korting/actie in de tekst staan');
});

test('geen reparatiediepte in cm (canoniek is mm) in de kennisdata', () => {
  const rx = /\b\d{1,2}\s*(?:en|tot|-|–)\s*\d{1,2}\s*cm\s+diep\b/i;
  const bad = DATA.filter((p) => rx.test(p.text)).map((p) => p.title);
  assert.deepEqual(bad, [], `reparatiediepte hoort in mm: ${bad.join(', ')}`);
});

test('fixDepthUnits corrigeert cm-diepte-bereik maar laat losse cm-maten staan', () => {
  assert.equal(fixDepthUnits('reparaties tussen de 5 en 20 cm diep.'), 'reparaties tussen de 5 en 20 mm diep.');
  assert.equal(fixDepthUnits('houtschades van 5 tot 20 cm diep'), 'houtschades van 5 tot 20 mm diep');
  // Losse maten (geen diepte-bereik) blijven ongemoeid.
  assert.equal(fixDepthUnits('Afmeting: 8 x ø 2 cm per flesje'), 'Afmeting: 8 x ø 2 cm per flesje');
  assert.equal(fixDepthUnits('verwijder ook 2 cm rondom het houtrot'), 'verwijder ook 2 cm rondom het houtrot');
});

test('geen niet-houtherstel service-/juridische pagina\'s in de kennisdata', () => {
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
    { url: 'https://x.nl/a/', text: 'kort' },
    { url: 'https://x.nl/a', text: 'veel langere inhoud hier' },
    { url: 'https://x.nl/b/', text: 'b' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out.find((p) => /\/a$/.test(p.url)).text, 'veel langere inhoud hier');
});

test('geen shop-funnel-/garantieruis in de kennisdata', () => {
  const rx = /niet goed geld terug|vandaag besteld|morgen in huis|bekijk de pakketten|pakket en bespaar|\bjaar (complete )?garantie\b/i;
  const bad = DATA.filter((p) => rx.test(p.text)).map((p) => p.title);
  assert.deepEqual(bad, [], `commerciële funnel-/garantieruis hoort niet in KB: ${bad.join(', ')}`);
});

test('scrub verwijdert promo-zin maar behoudt reparatiefeiten in lopende tekst', () => {
  const { scrubText } = require('../scripts/scrub');
  const prose = 'Meng de twee componenten en breng aan. Na 30 minuten uitgehard. Je krijgt er 10 jaar garantie op.';
  const out = scrubText(prose);
  assert.match(out, /twee componenten/);
  assert.match(out, /30 minuten uitgehard/);
  assert.doesNotMatch(out, /garantie/);
});

test('merknaam EAZYFIX genormaliseerd in tool-output, URLs ongemoeid', () => {
  const out = runKennisTool({ onderwerp: 'houtrot kozijn repareren' });
  // Geen mixed-case brand-tekst (zonder hyphen) in de context.
  const leaks = (out.match(/\beazyfix\b/gi) || []).filter((m) => m !== 'EAZYFIX');
  assert.deepEqual(leaks, [], `merknaam moet EAZYFIX zijn: ${leaks.join(', ')}`);
  // Domein in bronregels blijft hoofdlettergevoelig (eazy-fix.nl).
  assert.match(out, /eazy-fix\.nl/);
});

test('geen mixed-case merknaam in titels van de kennisdata', () => {
  const rx = /\bEazy-?fix\b(?![\w./@-])/;
  const bad = DATA.filter((p) => rx.test(p.title || '')).map((p) => p.title);
  assert.deepEqual(bad, [], `titels moeten EAZYFIX gebruiken: ${bad.slice(0, 5).join(' | ')}`);
});

test('geen kennisentry noemt Houtrotvuller als één-component (is 2-componenten)', () => {
  const rx = /houtrotvuller[^.]*\b(een|één|1)[\s-]?componen|\b(een|één|1)[\s-]?componen[^.]*houtrotvuller/i;
  const bad = DATA.filter((p) => rx.test(p.text) && !/twee|2[\s-]?componen/i.test(p.text)).map((p) => p.title);
  assert.deepEqual(bad, [], `Houtrotvuller is 2-componenten: ${bad.join(', ')}`);
});

test('geen kennisentry adviseert Houtplamuur vóór houtrot (plamuur nooit voor rot)', () => {
  // "houtrot ... met plamuur" of "plamuur voor houtrot" als advies; correcte
  // contexten (negatie, "tenzij", houtrotvuller) zijn uitgesloten.
  const p1 = /houtrot\b(?!vuller)[^.\n]{0,40}\bmet\b[^.\n]{0,20}\bplamuur/i;
  const p2 = /\bplamuur[^.\n]{0,20}\bvoor\b[^.\n]{0,20}houtrot\b(?!vuller)/i;
  const bad = [];
  for (const p of DATA) {
    for (const s of p.text.split(/\n|(?<=[.!?])\s+/)) {
      if ((p1.test(s) || p2.test(s)) && !/nooit|niet|geen|tenzij|houtrotvuller/i.test(s)) {
        bad.push(`${p.title} :: ${s.trim().slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(bad, [], `Houtplamuur is nooit voor houtrot:\n${bad.join('\n')}`);
});

test('productvraag rangschikt het juiste productpagina bovenaan (slug-identiteit)', () => {
  const vuller = search('Premium Houtrotvuller mengverhouding', 4);
  assert.equal(vuller[0].type, 'product');
  assert.ok(/houtrotvuller/i.test(vuller[0].title), `verwacht Houtrotvuller bovenaan, kreeg: ${vuller[0].title}`);
  // Houtrotvuller moet boven Houtplamuur staan (de oorspronkelijke misorder).
  const idxVuller = vuller.findIndex((p) => /houtrotvuller/i.test(p.title));
  const idxPlamuur = vuller.findIndex((p) => /houtplamuur/i.test(p.title));
  assert.ok(idxPlamuur === -1 || idxVuller < idxPlamuur, 'Houtrotvuller hoort vóór Houtplamuur');

  const plamuur = search('Premium Houtplamuur', 4);
  assert.equal(plamuur[0].type, 'product');
  assert.ok(/houtplamuur/i.test(plamuur[0].title), `verwacht Houtplamuur bovenaan, kreeg: ${plamuur[0].title}`);

  const muur = search('muurvuller', 4);
  assert.equal(muur[0].type, 'product');
  assert.ok(/muurvuller/i.test(muur[0].title), `verwacht Muurvuller bovenaan, kreeg: ${muur[0].title}`);
});

test('geen video bij koop-/prijsvraag zonder hoe-doe-ik-intentie', () => {
  assert.deepEqual(relevantVideos('wat kost de houtrotvuller'), []);
  assert.deepEqual(relevantVideos('waar kan ik de muurvuller kopen'), []);
  // Hoe-doe-ik-intentie mag wél een video opleveren.
  assert.ok(relevantVideos('hoe repareer ik houtrot in mijn kozijn').length >= 0);
});

test('fillerwoord triggert geen (verkeerde) video — alleen object/product/techniek', () => {
  // "Het brokkelt makkelijk af" matchte eerder op "Muurvuller makkelijk afstrijken".
  assert.deepEqual(relevantVideos('Het is zacht en vochtig. Het brokkelt makkelijk af'), []);
  // Pure reken-/omvangvraag zonder object of product: geen video.
  assert.deepEqual(relevantVideos('hoe kan ik het vulvolume berekenen?'), []);
  assert.deepEqual(relevantVideos('Ja ik wil het volledige stappenplan'), []);
});

test('klacht over de video zelf onderdrukt een nieuwe videokaart', () => {
  assert.deepEqual(relevantVideos('Het filmpje is niet van een houtrotreparatie maar van de muurvuller'), []);
  assert.deepEqual(relevantVideos('ik krijg weer een filmpje over de muurvuller'), []);
});

test('service-/retour-/klachtvraag met productnaam levert geen video', () => {
  // Productnaam ("plamuur") zonder hoe-doe-ik-intentie: geen instructievideo.
  assert.deepEqual(relevantVideos('Een klant is teruggekomen met een koker plamuur die is gescheurd. Komt dat vaker voor?'), []);
  assert.deepEqual(relevantVideos('is de houtrotvuller nog houdbaar na een jaar?'), []);
  assert.deepEqual(relevantVideos('waar vind ik mijn factuur voor de plamuur'), []);
});

test('niche-video (aanbranden) wint nooit van een echte reparatievideo', () => {
  const v = relevantVideos('Hoeveel houtrotvuller heb ik nodig voor een gat');
  assert.ok(v.length <= 1);
  if (v.length) assert.doesNotMatch(v[0].title, /aanbranden/i);
});

test('object-vraag levert nog steeds een relevante video (geen regressie)', () => {
  const v = relevantVideos('hoe repareer ik houtrot in mijn kozijn');
  assert.equal(v.length, 1);
  assert.match(v[0].title, /kozijn|houtrot/i);
});

test('verouderde koker-video (180 ml) is uit de kennis gepruned', () => {
  assert.ok(DATA.every((p) => p.slug !== 'yt-24600OjFDS0'), 'yt-24600OjFDS0 hoort gepruned te zijn');
});

test('kennis bevat de gecureerde koker-inhoud (150 ml, niet in gram)', () => {
  const ctx = searchContext('hoe groot is de koker van de houtrotvuller');
  assert.match(ctx, /150\s?ml/i);
});

test('cleanVideoTitle normaliseert merknaam naar EAZYFIX', () => {
  // Merknaam midden in de titel wordt hoofdletters (leidende merk-prefix wordt los gestript).
  assert.equal(cleanVideoTitle('Houtrot repareren met de Eazyfix® vuller'), 'Houtrot repareren met de EAZYFIX® vuller');
  assert.doesNotMatch(cleanVideoTitle('Zo werkt de eazyfix methode'), /eazyfix/);
});

test('runKennisTool geeft sitebron-tekst terug', () => {
  const out = runKennisTool({ onderwerp: 'houtrot kozijn repareren' });
  assert.match(out, /eazy-fix\.nl/);
  assert.ok(out.length > 50);
});

test('intentherkenning: commercieel/service vs inhoudelijk (how-to wint bij mix)', () => {
  assert.equal(classifyIntent('wat kost de houtrotvuller'), 'service');
  assert.equal(classifyIntent('hoe betaal ik'), 'service');
  assert.equal(classifyIntent('wanneer wordt mijn bestelling bezorgd'), 'service');
  assert.equal(classifyIntent('retourneren'), 'service');
  assert.equal(classifyIntent('houtrotvuller mengverhouding'), 'content');
  assert.equal(classifyIntent('houtrot in kozijn repareren'), 'content');
  // Gemengd: prijs + how-to → inhoudelijk (persona verwijst de prijs apart door).
  assert.equal(classifyIntent('wat kost het en hoe meng ik de vuller'), 'content');
});

test('commerciële vraag krijgt geen kennis-injectie en wordt doorverwezen', () => {
  assert.equal(searchContext('wat kost de houtrotvuller'), '');
  const tool = runKennisTool({ onderwerp: 'wanneer wordt mijn bestelling bezorgd' });
  assert.match(tool, /commerciële of servicezaken/);
  assert.match(tool, /\+31 \(0\)85 201 201 1/);
});

test('zwakke/off-topic vraag injecteert geen kennis (confidence-drempel)', () => {
  for (const q of ['kun je een mop vertellen', 'wat is de hoofdstad van frankrijk', 'het weer morgen']) {
    assert.equal(confidentSearch(q).length, 0, `verwacht geen betrouwbare treffer voor: ${q}`);
    assert.equal(searchContext(q), '', `verwacht lege context voor: ${q}`);
  }
  // Echte reparatievragen blijven wél matchen.
  for (const q of ['houtrotvuller mengverhouding', 'houtrot in kozijn repareren', 'plamuur voor krasjes']) {
    assert.ok(confidentSearch(q).length > 0, `verwacht treffer voor: ${q}`);
  }
});

test('lege vraag geeft nette terugval: niet verzinnen, verwijs naar binnendienst', () => {
  const out = runKennisTool({ onderwerp: '' });
  assert.match(out, /Geen betrouwbare informatie/);
  assert.match(out, /\+31 \(0\)85 201 201 1/);
  assert.doesNotMatch(out, /algemene EAZYFIX-kennis/);
});

test('tool-spec heeft naam zoek_kennis en verplicht onderwerp', () => {
  assert.equal(KENNIS_TOOL.name, 'zoek_kennis');
  assert.deepEqual(KENNIS_TOOL.input_schema.required, ['onderwerp']);
});
