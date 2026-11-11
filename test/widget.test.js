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
  assert.match(html, /\/bot-avatar-de\.png/);
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
