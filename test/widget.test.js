const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Widget van de Duitse bot (port eazyfix-bot public/index.html, november 2026):
// standaard Duits, vertaaltabel compleet, video's ook na een foto-analyse.
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const tabel = html.match(/const TEKSTEN = (\{[\s\S]*?\n    \});/);

test('widget: standaardtaal Duits, site eazy-fix.nl/de, land alleen DE of AT', () => {
  assert.match(html, /<html lang="de">/);
  assert.match(html, /const LANG = \(window\.EF_CTX && window\.EF_CTX\.lang\) \|\| 'de';/);
  assert.match(html, /: 'de', country: \['de', 'at'\]/);
  assert.match(html, /let SITE = 'https:\/\/www\.eazy-fix\.nl\/de';/);
  assert.doesNotMatch(html, /bot-avatar-nina/, 'geen foto van Nina in de Duitse chat');
  assert.match(html, /\/bot-avatar-de-60\.png/); // verkleind naar 60 px (review design 13-11)
});

test('widget: vertaaltabel heeft dezelfde sleutels in nl, en en de; Duitse fase-labels', () => {
  const T = new Function('return (' + tabel[1] + ');')();
  const nl = Object.keys(T.nl).sort().join(',');
  assert.strictEqual(Object.keys(T.en).sort().join(','), nl);
  assert.strictEqual(Object.keys(T.de).sort().join(','), nl);
  for (const sleutel of html.matchAll(/data-t(?:-title|-placeholder)?="([a-zA-Z]+)"/g)) assert.ok(sleutel[1] in T.de, 'onbekende sleutel ' + sleutel[1]);
  const m = html.match(/function faseLabel\(phase\)\s*\{[\s\S]*?\n    \}/);
  const faseLabel = new Function('const T = (' + tabel[1] + ').de;\n' + m[0] + '\n return faseLabel;')();
  assert.strictEqual(faseLabel('foto'), 'Foto ansehen');
  assert.strictEqual(faseLabel('advies'), 'Rat erstellen');
  assert.match(T.de.disclaimer, /12 Monate/);
});

test('widget rendert videos uit het foto-done-event en de fallback-route; smileys, geen duimpjes', () => {
  assert.match(html, /renderVideos\(out, klaarData\.videos\)/);
  assert.match(html, /renderVideos\(out, data\.videos\)/);
  assert.match(html, /const DUIMPJES_TESTFASE = false;/);
  assert.match(html, /\/api\/feedback\/gesprek/);
  assert.match(html, /\/api\/lead/);
});

test('linkifySite: eazy-fix.de en eazy-fix.nl/de, niet de Nederlandse site', () => {
  const re = new Function(html.match(/const SITE_RE = (\/[^\n]+\/gi);/)[0] + ' return SITE_RE;')();
  const vind = (t) => { re.lastIndex = 0; const m = re.exec(t); return m && m[1]; };
  assert.equal(vind('Schau auf eazy-fix.de nach.'), 'eazy-fix.de');
  assert.equal(vind('https://www.eazy-fix.nl/de/faq/ hilft'), 'https://www.eazy-fix.nl/de/faq/');
  assert.equal(vind('www.eazy-fix.nl/kozijn'), null);
});

// Review 11-11-2026: de productlijst in de widget stond nog in het Nederlands
// (Houtrotvuller ...), waardoor in het Duits geen enkele productnaam een link werd.
test('widget: productlinks met Duitse namen en paden die in de kennis bestaan', () => {
  const kennis = require('../src/kennis.json');
  const paden = new Set(kennis.map((x) => x.url.replace('https://www.eazy-fix.nl/de', '')));
  const blok = html.slice(html.indexOf('const PRODUCTS = ['), html.indexOf('function linkifyProducts'));
  assert.doesNotMatch(blok, /houtrot|houtplamuur|houtversterker|muurvuller/i);
  const gevonden = [...blok.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(gevonden.length >= 20);
  for (const p of gevonden) assert.ok(paden.has(p), 'pad bestaat niet op de site: ' + p);
  const PRODUCTS = new Function(blok.slice(0, blok.indexOf('const TOOLS')) + ' return PRODUCTS;')();
  const pad = (t) => (PRODUCTS.find((p) => p.re.test(t)) || {}).path;
  assert.equal(pad('Premium Holz Feinspachtel One Shot'), '/product/eazyfix-premium-one-shot/');
  assert.equal(pad('Premium Holz Feinspachtel'), '/product/premium-holz-fein-spachtel/');
  assert.equal(pad('Holzfäule Fräser'), '/product/holzfaeule-fraeser/');
});

// Review 11-11-2026: vóór het laden van het script stonden Nederlandse teksten in de HTML.
test('widget: statische HTML is Duits (geen Nederlandse knopteksten vóór het laden)', () => {
  const body = html.slice(html.indexOf('<body'), html.indexOf('<script>', html.indexOf('<body')));
  assert.doesNotMatch(body, /Klusadviseur|Gesprek beëindigen|Maak foto|Kies uit bibliotheek|Typ je bericht|Verstuur"|Foto toevoegen/);
  assert.match(body, /Gespräch abschließen/);
  assert.match(body, /maxlength="4000"/);
  assert.doesNotMatch(html, /url\('bg\.png'\)/, 'geen Nederlandse sitefoto als achtergrond');
  assert.match(html, /\(cls === 'bot' \? 'EAZYFIX · ' : ''\)/); // \"Gesendet\" weggelaten (review design 13-11)
});

// Verzoek JKC (Rik, 11-11-2026): sluitknop en Escape sturen {type:'close'} naar de website.
test('widget: sluitknop alleen in de inbouwversie, knop en Escape sturen close', () => {
  const h = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(h, /<button type="button" class="sluit" id="sluit" data-t-title="sluiten"/);
  assert.match(h, /\.top \.sluit, \.top \.groot \{ display: none;/);
  assert.match(h, /html\.embed \.top \.sluit \{ display: flex; \}/);
  assert.match(h, /function sluitChat\(\) \{ postToSite\(\{ type: 'close' \}\); \}/);
  assert.match(h, /if \(e\.key !== 'Escape'\) return;\n\s*if \(!photoMenu\.hidden\) \{ hidePhotoMenu\(\); return; \}\n\s*if \(EMBED\) sluitChat\(\);/);
  for (const t of ['Chat sluiten', 'Close chat', 'Chat schließen']) assert.ok(h.includes(`sluiten: '${t}'`), t);
});

test('widget: fullscreen-knop volgt de stand van de website en luistert alleen naar eigen sites', () => {
  const h = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(h, /<button type="button" class="groot" id="groot" aria-pressed="false"><\/button>/);
  assert.match(h, /html\.embed\.kan-groot \.top \.groot \{ display: flex; \}/);
  assert.match(h, /postToSite\(\{ type: siteGroot \? 'collapse' : 'expand' \}\)/);
  assert.match(h, /d\.source !== 'eazyfix-site' \|\| d\.type !== 'state'/);
  assert.match(h, /e\.source !== window\.parent/);
  assert.match(h, /classList\.toggle\('kan-groot', d\.canExpand === true\)/);
  for (const o of ['https://www.eazy-fix.nl', 'https://www.eazy-fix.de', 'https://eazyfix.jkc-dev.nl']) assert.ok(h.includes(`'${o}'`), o);
  for (const t of ['Volledig scherm', 'Full screen', 'Vollbild']) assert.ok(h.includes(`groter: '${t}'`), t);
});
