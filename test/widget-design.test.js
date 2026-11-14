const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Port eazyfix-bot: review design en gebruiksvriendelijkheid 13-11-2026 (REVIEW-DESIGN-CHATBOT.md): M1 t/m M4,
// verbeterpunten 1 t/m 13 en 15, snelle winst 9 t/m 11. De tests draaien de echte functies
// uit public/index.html, zoals de andere widgettests.
const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const fn = (naam) => {
  const m = html.match(new RegExp('function ' + naam + '\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}'));
  assert.ok(m, naam + ' niet gevonden');
  return m[0];
};
const TEKSTEN = new Function('return (' + html.match(/const TEKSTEN = (\{[\s\S]*?\n    \});/)[1] + ');')();

test('scrollen: de chat schuift nooit vanzelf omhoog, niet voorbij het begin van het antwoord en niet voorbij het eind', () => {
  const volgDoel = new Function(fn('volgDoel') + '; return volgDoel;')();
  assert.equal(volgDoel(0, 900, 300), 300, 'meeschuiven tot het anker bovenaan staat');
  assert.equal(volgDoel(0, 200, 300), 200, 'kort antwoord: gewoon tot onderaan');
  assert.equal(volgDoel(450, 900, 300), 450, 'nooit vanzelf terug omhoog');
  assert.equal(volgDoel(0, 900, -20), 0);
  // Tijdens het binnenkomen gaat elke scrollLog via deze regel, en de klant die omhoog scrolt wint.
  assert.match(fn('scrollLog'), /if \(volg\) \{\s+if \(!volg\.klant\) \{\s+log\.scrollTop = volgDoel\(log\.scrollTop, maxScroll\(\), ankerTop\(\)\);/);
  assert.match(html, /if \(volg && !volg\.klant && log\.scrollTop < Math\.min\(volg\.gezet, maxScroll\(\)\) - 4\) volg\.klant = true;/);
  // Na het opmaken nog één keer dezelfde regel, in beide routes.
  assert.equal(html.split('stopVolgen();').length - 1, 2);
  assert.match(html, /<button type="button" class="lees-verder" id="leesVerder" hidden>/);
  assert.match(html, /leesVerderBtn\.hidden = maxScroll\(\) - log\.scrollTop < 60;/);
});

test('foto (M1): na het laden van de foto en bij elke stap opnieuw schuiven; voortgangskaartje met verwachting', () => {
  assert.match(html, /img\.onload = \(\) => \{ URL\.revokeObjectURL\(img\.src\); scrollLog\(\); \};/);
  assert.match(fn('sendPhoto'), /balk\.style\.width = Math\.min\(92, \(n \+ 1\) \* 25\) \+ '%';\n\s+scrollLog\(\);/);
  assert.match(html, /kaart\.setAttribute\('role', 'status'\);/);
  assert.match(html, /max-width: 200px; height: auto; max-height: 180px;/);
  for (const t of Object.values(TEKSTEN)) assert.ok(t.fotoKop && /20/.test(t.fotoDuur));
});

test('startknopjes: vier onderwerpen, op een productpagina passende vragen, zonder foto geen fotoknop', () => {
  const maak = (ctx, nofoto, taal = 'nl') => new Function('T', 'CONTEXT', 'document', fn('startKnoppen') + '; return startKnoppen();')(
    TEKSTEN[taal], ctx, { documentElement: { classList: { contains: (c) => c === 'nofoto' && nofoto } } });
  const algemeen = maak({}, false);
  assert.deepEqual(algemeen.map((k) => k.tekst), ['Mijn hout is zacht of rot', 'Gat of scheur in de muur', 'Welk product heb ik nodig?', 'Ik stuur een foto']);
  assert.equal(algemeen[3].foto, true, '"Ik stuur een foto" opent het fotomenu');
  assert.deepEqual(maak({ product: 'premium-houtrotvuller' }, false).map((k) => k.tekst), ['Hoeveel heb ik nodig?', 'Hoe gebruik ik dit?', 'Ik stuur een foto']);
  assert.equal(maak({}, true).length, 3);
  assert.deepEqual(maak({}, false, 'de').map((k) => k.tekst), ['Mein Holz ist weich oder faul', 'Loch oder Riss in der Wand', 'Welches Produkt brauche ich?', 'Ich schicke ein Foto']);
  // De opening gebruikt de bestaande keuzeknopjes; een fotoknopje stuurt geen tekst.
  assert.match(fn('toonOpening'), /renderKeuzes\(out, startKnoppen\(\), \{ start: true, label: T\.startGroep \}\);/);
  assert.match(fn('renderKeuzes'), /if \(k\.foto\) \{ kiesFoto\(\); return; \}/);
  assert.doesNotMatch(html, /datescheiding|deelname|👇/);
});

test('gesprek bewaren per tabblad: terugzetten, foto als plaatsaanduiding, geblokkeerde opslag geeft geen fout', () => {
  const bron = 'let conversationId = "c-1"; const history = []; const OPSLAG = "eazyfix-de-gesprek"; let extras = {};\n'
    + fn('bewaarGesprek') + '\n' + fn('wisGesprek') + '\n' + fn('leesGesprek')
    + '\nreturn { bewaarGesprek, wisGesprek, leesGesprek, history, zet: (e) => { extras = e; } };';
  const opslag = {};
  const ss = { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } };
  const g = new Function('sessionStorage', bron)(ss);
  assert.equal(g.leesGesprek(), null, 'leeg: niets terug te zetten');
  g.history.push({ role: 'user', content: '[foto van de schade verstuurd] kozijn' }, { role: 'assistant', content: 'Dat is houtrot.' });
  g.zet({ 0: { foto: 1, bijschrift: 'kozijn', t: '09:05' }, 1: { keuzes: ['Binnen', 'Buiten'], t: '09:06' } });
  g.bewaarGesprek();
  assert.doesNotMatch(opslag['eazyfix-de-gesprek'], /base64|data:image/, 'geen foto in de opslag');
  const terug = g.leesGesprek();
  assert.equal(terug.conversationId, 'c-1');
  assert.equal(terug.history.length, 2);
  assert.deepEqual(terug.extras['1'].keuzes, ['Binnen', 'Buiten']);
  g.wisGesprek();
  assert.equal(g.leesGesprek(), null);
  opslag['eazyfix-de-gesprek'] = '{"v":1,"conversationId":"x","history":[{"role":"system","content":"hack"}]}';
  assert.equal(g.leesGesprek(), null, 'alleen user- en assistant-beurten');
  opslag['eazyfix-de-gesprek'] = 'geen json';
  assert.equal(g.leesGesprek(), null);
  const dicht = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); }, removeItem: () => { throw new Error('SecurityError'); } };
  const g2 = new Function('sessionStorage', bron)(dicht);
  assert.doesNotThrow(() => { g2.bewaarGesprek(); g2.wisGesprek(); });
  assert.equal(g2.leesGesprek(), null);
  // Terugzetten bij het laden, en "Nieuw gesprek" en afronden wissen de opslag.
  assert.match(html, /const bewaard = leesGesprek\(\);\n\s+if \(bewaard\) herstelGesprek\(bewaard\); else toonOpening\(\);/);
  assert.match(fn('herstelGesprek'), /link\.className = 'nieuwlink'/);
  assert.match(fn('herstelGesprek'), /fotoPlekBubbel\(x\.foto/);
  assert.match(fn('nieuwGesprek'), /wisGesprek\(\);/);
  assert.match(fn('eindigGesprek'), /wisGesprek\(\);/);
});

test('schermlezer: gesprek als log zonder stukje-voor-stukje voorlezen, antwoord in één keer; labels en geen onzichtbare tabstops', () => {
  assert.match(html, /<div class="msgs" id="log" role="log" aria-live="off"/);
  assert.match(html, /<div class="sr-only" id="voorlezer" aria-live="polite" aria-atomic="true"><\/div>/);
  assert.ok(html.split('leesVoor(out.textContent);').length - 1 >= 4, 'tekst- en fotoantwoord worden voorgelezen');
  assert.match(fn('toonFout'), /leesVoor\(tekst\);/);
  assert.match(html, /<textarea id="in" rows="1" maxlength="4000" data-t-placeholder="typ" placeholder="[^"]*" data-t-label="jeVraag" aria-label="Deine Frage">/);
  assert.match(html, /<button id="send" type="submit" data-t-title="verstuur" title="Senden" aria-label="Senden">/);
  assert.match(html, /<input id="photo" type="file" accept="image\/\*" multiple tabindex="-1"/);
  assert.match(html, /<input id="photoCam" type="file" accept="image\/\*" capture="environment" tabindex="-1"/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.top \.dot, \.typing span \{ animation: none; \}/);
  assert.match(html, /\.top \.sluit:focus-visible, \.top \.groot:focus-visible \{[^}]*outline: 2px solid var\(--green\)/);
});

test('foutmelding: rustige bubbel met "Opnieuw proberen", niet bij een daglimiet; geen technische tekst bij een foto', () => {
  const magOpnieuw = new Function(fn('magOpnieuw') + '; return magOpnieuw;')();
  assert.equal(magOpnieuw(0, 'De assistent is even overbelast. Probeer het over een minuut nog eens.'), true);
  assert.equal(magOpnieuw(500, 'Er ging even iets mis.'), true);
  assert.equal(magOpnieuw(429, 'Te veel vragen kort achter elkaar.'), true);
  assert.equal(magOpnieuw(429, 'Je hebt vandaag het maximum aantal vragen gesteld.'), false);
  assert.equal(magOpnieuw(429, "You have reached today's maximum number of questions."), false);
  assert.equal(magOpnieuw(400, 'Je bericht is te lang'), false);
  assert.doesNotMatch(html, /'Fout: '/);
  assert.match(html, /toonFout\(out, e2 instanceof TypeError \? T\.geenVerbinding : T\.misgegaan, nogEens\);/);
  assert.match(html, /\.err \.msg \{ background: #fff4f2; color: #8a1c12; border: 1px solid #f3c7c1;/);
  assert.match(fn('foutKnoppen'), /a\.href = telHref\(tel\);/);
  // Te lang: de vraag komt terug in het invoerveld.
  assert.match(fn('sendText'), /if \(resp\.status === 400 && !inEl\.value\) \{ inEl\.value = text;/);
  for (const t of Object.values(TEKSTEN)) assert.ok(t.opnieuw && t.belKlantenservice && t.zoekOp && t.duurtLanger);
});

test('productlinks: lichte onderstreepte links, de Duitse sets worden klikbaar, sitelinks breken niet af', () => {
  const blok = html.slice(html.indexOf('const PRODUCTS = ['), html.indexOf('const TOOLS = ['));
  const PRODUCTS = new Function(blok + ' return PRODUCTS;')();
  const prefix = '(?:EAZYFIX[\\s®]*(?:Premium\\s*)?|Premium\\s+)';
  const re = new RegExp(prefix + '(?:' + PRODUCTS.map((p) => '(?:' + p.re.source + ')').join('|') + ')', 'i');
  for (const [tekst, pad] of [['EAZYFIX® Holzfäule Starterset', '/product/eazyfix-holzfaeule-starterset/'], ['EAZYFIX® Holzfäule Erweiterungsset', '/product/eazyfix-holzfaeule-erweiterungsset/'], ['EAZYFIX® Starterset', '/product/eazyfix-holzfaeule-starterset/']]) {
    const m = tekst.match(re);
    assert.ok(m && m[0] === tekst, tekst);
    assert.equal(PRODUCTS.find((p) => p.re.test(m[0])).path, pad);
  }
  assert.match(html, /\.product-link \{\s+color: var\(--groen-tekst\); font-weight: 700;\s+text-decoration: underline; text-decoration-thickness: 1\.5px; text-underline-offset: 3px;\s+white-space: normal;/);
  assert.match(html, /\.site-link \{[^}]*white-space: nowrap; \}/);
});

test('merk: kleuren van de site, elke gebruikte kleurvariabele bestaat, geen oude kleuren en geen Google Fonts', () => {
  const root = html.match(/:root \{([\s\S]*?)\}/)[1];
  assert.match(root, /--navy: #090b2a;/);
  assert.match(root, /--green: #93d801;/);
  assert.match(root, /--groen-tekst: #4e7813;/);
  const gedeclareerd = new Set([...root.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]));
  for (const m of html.matchAll(/var\((--[a-z-]+)\)/g)) assert.ok(gedeclareerd.has(m[1]), 'niet gedeclareerd: ' + m[1]);
  assert.doesNotMatch(html, /#79c143|#000a31|#f3faec|#cfe7bb|#e2f1d3|#eef7e6|#4f8f22|121,193,67|Manrope/i);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(html, /src: url\('\/fonts\/inter-tight-latin\.woff2'\) format\('woff2'\);/);
  assert.match(html, /font-display: swap;/);
  assert.ok(fs.statSync(path.join(PUB, 'fonts', 'inter-tight-latin.woff2')).size > 10000);
  assert.match(fs.readFileSync(path.join(PUB, 'fonts', 'OFL.txt'), 'utf8'), /SIL Open Font License/);
  // Klantberichten donkerblauw met wit, verstuurknop limoen met donkerblauwe pijl.
  assert.match(html, /\.user \.msg \{ background: var\(--navy\); color: #fff;/);
  assert.match(html, /#send \{[^}]*background: var\(--green\); color: var\(--navy\);/);
});

test('logo en avatar als los bestand (met cache), geen ingebakken plaatje', () => {
  assert.doesNotMatch(html, /src="data:image/);
  assert.match(html, /<img class="logo" src="\/eazyfix-logo-kop\.png"/);
  assert.match(html, /\/bot-avatar-de-60\.png/);
  for (const f of ['eazyfix-logo-kop.png', 'bot-avatar-de-60.png']) assert.ok(fs.statSync(path.join(PUB, f)).size < 20000, f);
  assert.ok(fs.existsSync(path.join(PUB, 'bot-avatar-de.png')), 'oude avatar blijft: de chatknop van de site kan hem gebruiken');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  const staticCache = new Function(idx.match(/function staticCache\(res, filePath\) \{[\s\S]*?\n\}/)[0] + '; return staticCache;')();
  const kop = (f) => { const h = {}; staticCache({ setHeader: (k, v) => { h[k] = v; } }, f); return h['Cache-Control']; };
  assert.equal(kop('/app/public/fonts/inter-tight-latin.woff2'), 'public, max-age=31536000, immutable');
  assert.equal(kop('/app/public/eazyfix-logo-kop.png'), 'public, max-age=604800');
  assert.equal(kop('/app/public/productcheck.html'), undefined);
  assert.equal(kop('/app/public/productcheck-data.js'), undefined);
});

test('snelle winst: tijd met voorloopnul, één tekengrens met de server, Escape verlaat eerst het invoerveld', () => {
  assert.match(fn('nuTijd'), /hour: '2-digit', minute: '2-digit'/);
  const { MAX_MESSAGE_CHARS } = require('../src/abuse-guard');
  assert.equal(MAX_MESSAGE_CHARS, 4000);
  assert.match(html, /maxlength="4000"/);
  assert.match(html, /const MAX_TEKENS = 4000;/);
  assert.equal(TEKSTEN.de.tekens(3700, 4000), '3700 / 4000 Zeichen');
  const escapeInVeld = new Function('photoMenu', fn('escapeInVeld') + '; return escapeInVeld;')({ hidden: true });
  let gestopt = false, weg = false;
  escapeInVeld({ key: 'Escape', target: { tagName: 'TEXTAREA', blur: () => { weg = true; } }, stopPropagation: () => { gestopt = true; } });
  assert.ok(gestopt && weg, 'eerste Escape in het invoerveld: alleen het veld verlaten');
  gestopt = false;
  escapeInVeld({ key: 'Escape', target: { tagName: 'BODY' }, stopPropagation: () => { gestopt = true; } });
  assert.equal(gestopt, false, 'tweede Escape gaat door naar sluiten');
});

test('aanraakdoelen en mobiel: 44 px voor knoppen, 16 px in formuliervelden (geen inzoomen op iPhone)', () => {
  assert.match(html, /\.keuze \{[^}]*min-height: 44px;/);
  assert.match(html, /\.winkel \.wknop \{[^}]*min-height: 44px;/);
  assert.match(html, /\.top \.sluit, \.top \.groot \{ display: none; width: 44px; height: 44px;/);
  assert.match(html, /\.attach \{[^}]*width: 44px; height: 44px;/);
  assert.match(html, /#send \{ width: 44px; height: 44px;/);
  assert.match(html, /\.gegevens \.veld input \{[^}]*font-size: 16px;/);
  assert.match(html, /\.beoordeling textarea \{[^}]*font-size: 16px;/);
  assert.match(html, /\.eindknop \{[^}]*min-height: 44px;/);
  // Volledig scherm: leeskolom van hooguit 760 px.
  assert.match(html, /\.msgs \{[^}]*padding: 18px max\(16px, calc\(\(100% - 760px\) \/ 2\)\);/);
});

// Lichte vraag na 10 seconden stilte (besluit Ralf 14-11-2026; eerst 30, daarna 15, definitief 10).
const peilBron = (staat) => 'let peilTimer = null, peilKan = false, peilGetoond = false, beoordeeld = false;\n'
  + 'const PEIL_WACHT = 10000, PEIL_OPSLAG = "eazyfix-de-peil"; let conversationId = "c-1";\n'
  + 'function toonPeil() { peilTimer = null; if (!magPeil()) return; peilGetoond = true; bewaarPeil(); staat.getoond++; }\n'
  + ['bewaarPeil', 'leesPeil', 'wisPeil', 'stopPeil', 'startPeil', 'peilNaAntwoord', 'peilNieuweBeurt', 'magPeil'].map(fn).join('\n')
  + '\nreturn { startPeil, peilNaAntwoord, peilNieuweBeurt, leesPeil, toonPeil, magPeil, zet: (o) => { if ("beoordeeld" in o) beoordeeld = o.beoordeeld; if ("c" in o) conversationId = o.c; if ("getoond" in o) peilGetoond = o.getoond; }, lees: () => ({ peilKan, peilGetoond, beoordeeld, timer: peilTimer }) };';
function maakPeil({ zichtbaar = true, bezig = false, invoer = '', opslag = {} } = {}) {
  const staat = { getoond: 0, timers: [] };
  const doc = { visibilityState: zichtbaar ? 'visible' : 'hidden' };
  const ss = { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } };
  const p = new Function('staat', 'document', 'sessionStorage', 'setTimeout', 'clearTimeout', 'chatEl', 'sendBtn', 'inEl', 'pendingPhotos', 'log', peilBron(staat))(
    staat, doc, ss,
    (f, ms) => { staat.timers.push({ f, ms }); return staat.timers.length; }, () => {},
    { classList: { contains: () => false } }, { disabled: bezig }, { value: invoer }, [], { querySelector: () => null });
  return { p, staat, doc, opslag };
}

test('lichte vraag: timer van precies 10 seconden na een volledig antwoord, alleen bij een zichtbaar tabblad', () => {
  assert.match(html, /const PEIL_WACHT = 10000;/);
  assert.match(html, /const PEIL_OPSLAG = 'eazyfix-de-peil';/, 'eigen opslagsleutel, net als eazyfix-de-gesprek');
  assert.match(fn('startPeil'), /peilTimer = setTimeout\(toonPeil, PEIL_WACHT\);/);
  const { p, staat } = maakPeil();
  p.startPeil();
  assert.equal(staat.timers.length, 0, 'geen timer zonder antwoord (opening)');
  p.peilNaAntwoord();
  assert.equal(staat.timers.length, 1);
  assert.equal(staat.timers[0].ms, 10000);
  const verborgen = maakPeil({ zichtbaar: false });
  verborgen.p.peilNaAntwoord();
  assert.equal(verborgen.staat.timers.length, 0, 'verborgen tabblad: niet tellen');
  assert.match(html, /document\.addEventListener\('visibilitychange', \(\) => \{\n\s+if \(document\.visibilityState === 'visible'\) startPeil\(\); else stopPeil\(\);/);
  // Elke nieuwe beurt (verzenden, keuzeknopje, opnieuw proberen) zet hem uit; typen zet hem stil.
  assert.match(fn('beurt'), /peilNieuweBeurt\(\);/);
  assert.match(html, /wegKeuzes\(\);\n\s+peilNieuweBeurt\(\);\n\s+sendBtn\.disabled = true;\n\s+try \{\n\s+const text = inEl\.value\.trim\(\);/);
  assert.match(html, /function peilNaTypen\(\) \{ if \(inEl\.value\.trim\(\)\) stopPeil\(\); else startPeil\(\); \}/);
  assert.match(fn('kiesFoto'), /stopPeil\(\);/);
  // Alleen na een geslaagd antwoord (tekst, foto via stream, foto via terugval) en na terugzetten; niet na een fout.
  assert.equal(html.split('peilNaAntwoord();').length - 1, 4);
  assert.doesNotMatch(fn('toonFout'), /peil/i);
  assert.doesNotMatch(fn('haperKnop'), /peil/i);
});

test('lichte vraag: één keer per gesprek, niet tijdens een antwoord of terwijl de klant typt', () => {
  const { p, staat, opslag } = maakPeil();
  p.peilNaAntwoord();
  staat.timers[0].f();
  assert.equal(staat.getoond, 1);
  p.peilNaAntwoord();
  assert.equal(staat.timers.length, 1, 'na tonen geen nieuwe timer');
  p.toonPeil();
  assert.equal(staat.getoond, 1, 'nooit twee keer');
  assert.deepEqual(JSON.parse(opslag['eazyfix-de-peil']), { c: 'c-1', getoond: true, beoordeeld: false });
  // Herladen: dezelfde gesprekscode leest de vlag terug, een ander gesprek niet.
  const terug = maakPeil({ opslag: { 'eazyfix-de-peil': opslag['eazyfix-de-peil'] } });
  terug.p.leesPeil();
  terug.p.peilNaAntwoord();
  assert.equal(terug.staat.timers.length, 0, 'teruggezet gesprek: niet opnieuw tonen');
  const ander = maakPeil({ opslag: { 'eazyfix-de-peil': opslag['eazyfix-de-peil'] } });
  ander.p.zet({ c: 'c-2' });
  ander.p.leesPeil();
  ander.p.peilNaAntwoord();
  assert.equal(ander.staat.timers.length, 1);
  // Bij afgaan van de timer nog eens kijken: niet tijdens een binnenkomend antwoord, niet met tekst in het veld.
  for (const opt of [{ bezig: true }, { invoer: 'nog een vraag' }]) {
    const x = maakPeil(opt);
    x.p.peilNaAntwoord();
    x.staat.timers[0].f();
    assert.equal(x.staat.getoond, 0, JSON.stringify(opt));
  }
  const nieuweBeurt = maakPeil();
  nieuweBeurt.p.peilNaAntwoord();
  nieuweBeurt.p.peilNieuweBeurt();
  nieuweBeurt.staat.timers[0].f();
  assert.equal(nieuweBeurt.staat.getoond, 0, 'na verzenden geen vraag');
  const alBeoordeeld = maakPeil();
  alBeoordeeld.p.zet({ beoordeeld: true });
  alBeoordeeld.p.peilNaAntwoord();
  assert.equal(alBeoordeeld.staat.timers.length, 0, 'al beoordeeld via "Gesprek afronden": geen regeltje');
});

test('lichte vraag: na een oordeel via het regeltje geen tweede smileykaart, nieuw gesprek zet alles terug', () => {
  const toon = fn('toonPeil');
  assert.match(toon, /apiFetch\('\/api\/feedback\/gesprek', \{/);
  assert.match(toon, /JSON\.stringify\(\{ conversationId, rating: keuze, comment: keuze === 'blij' \? '' : tekstveld\.value \}\)/);
  assert.match(toon, /if \(!resp\.ok && resp\.status !== 409\) throw new Error/, '409 telt als gelukt');
  assert.match(toon, /if \(keuze === 'blij'\) \{ toelichting\.classList\.remove\('aan'\); verstuur\(\); return; \}/);
  assert.match(toon, /postToSite\(\{ type: 'event', name: 'rating_prompt_shown' \}\);/);
  assert.match(toon, /postToSite\(\{ type: 'event', name: 'rating_given' \}\);/);
  assert.match(toon, /rij\.setAttribute\('role', 'group'\);\n\s+rij\.setAttribute\('aria-label', T\.peilVraag\);/);
  assert.match(toon, /leesVoor\(T\.peilVoorlees\);/);
  assert.doesNotMatch(toon.split('let keuze = null;')[0], /\.focus\(/, 'bij automatisch tonen de focus niet verplaatsen');
  assert.match(toon, /maxlength="1000"/);
  assert.match(toon, /if \(teLaag > 0\) log\.scrollTo\(/, 'na Niet goed: veld en knop helemaal in beeld');
  assert.match(toon, /if \(onderaan\) log\.scrollTop = maxScroll\(\);/);
  const eind = fn('eindigGesprek');
  const tak = eind.match(/if \(beoordeeld\) \{[\s\S]*?\n {6}\}/);
  assert.ok(tak, 'eindigGesprek kent de al-beoordeeld-tak');
  assert.match(tak[0], /return;/);
  assert.doesNotMatch(tak[0], /smileys|SMILEYS|hoeWas/);
  assert.ok(eind.indexOf('if (beoordeeld)') < eind.indexOf('T.hoeWas'), 'de tak komt vóór de smileykaart');
  assert.match(eind, /\.peil:not\(\.klaar\)'\)\.forEach\(\(el\) => el\.remove\(\)\)/);
  assert.match(eind, /beoordeeld = true;\n\s+postToSite\(\{ type: 'event', name: 'rating_given' \}\);/);
  assert.match(fn('nieuwGesprek'), /peilNieuweBeurt\(\); peilGetoond = false; beoordeeld = false; wisPeil\(\);/);
  // Klein en aanraakbaar: 44 px per smiley, 16 px in het opmerkingenveld, rustig bij minder beweging.
  assert.match(html, /\.peil \.smileys button \{[^}]*min-width: 44px; min-height: 44px;/);
  assert.match(html, /\.peil textarea \{[^}]*font-size: 16px;/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\s+\.peil \{ animation: none; \}/);
});

test('lichte vraag: teksten in alle talen', () => {
  assert.equal(TEKSTEN.nl.peilVraag, 'Heb je hier wat aan?');
  assert.equal(TEKSTEN.en.peilVraag, 'Was this helpful?');
  assert.equal(TEKSTEN.de.peilVraag, 'Hilft dir das weiter?');
  for (const [taal, t] of Object.entries(TEKSTEN)) {
    assert.ok(t.peilVoorlees.startsWith(t.peilVraag + ' '), taal);
    assert.ok(t.peilDank && t.goed && t.gingWel && t.nietGoed && t.opslaanFout, taal);
  }
});
