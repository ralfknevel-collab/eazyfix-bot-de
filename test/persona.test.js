const { test } = require('node:test');
const assert = require('node:assert');
const { BASE_SYSTEM_PROMPT, IMAGE_ANALYSIS_PROMPT, IMAGE_DIAGNOSE_PROMPT } = require('../src/persona');

test('persona-prompts geladen en niet leeg', () => {
  assert.ok(typeof BASE_SYSTEM_PROMPT === 'string' && BASE_SYSTEM_PROMPT.length > 500);
  assert.ok(typeof IMAGE_ANALYSIS_PROMPT === 'string' && IMAGE_ANALYSIS_PROMPT.length > 500);
  assert.ok(typeof IMAGE_DIAGNOSE_PROMPT === 'string' && IMAGE_DIAGNOSE_PROMPT.length > 200);
});

test('houtrot-identiteit (DE) aanwezig in basis-prompt', () => {
  assert.match(BASE_SYSTEM_PROMPT, /EAZYFIX®/);
  assert.match(BASE_SYSTEM_PROMPT, /Holzfäule/i);
  assert.match(BASE_SYSTEM_PROMPT, /\+31 85 201 201 1/);
});

test('analyse-prompt behoudt machine-leesbare tags en verplicht ernst-woord (DE)', () => {
  assert.match(IMAGE_ANALYSIS_PROMPT, /PRODUCTS:/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /FLOW:/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /"leicht", "mittel" oder "schwer"/);
  // Het rigide format is vervangen door een warm, doorlopend bericht.
  assert.doesNotMatch(IMAGE_ANALYSIS_PROMPT, /Was ich sehe:/);
});

test('analyse-prompt dwingt consistente ernst af en verbiedt naar de foto-analyse te verwijzen (DE)', () => {
  assert.match(IMAGE_ANALYSIS_PROMPT, /konsistent/i);
  assert.match(IMAGE_ANALYSIS_PROMPT, /Foto-Analyse/i);
});

// Regressie: de bot deed live twee keer een uitspraak over een concurrentproduct
// ("gewone plamuur is niet elastisch", plus een prijsvergelijking met twee merken
// bij naam). Die claim is niet houdbaar: merken voeren onder dezelfde productnaam
// vaak meerdere varianten. Beide prompts moeten die grens expliciet bevatten.
test('basis-prompt verbiedt uitspraken over producten van andere merken (DE)', () => {
  assert.match(BASE_SYSTEM_PROMPT, /ANDERE MARKEN UND WETTBEWERBER/);
  assert.match(BASE_SYSTEM_PROMPT, /Marken- oder Produktnamen einer anderen Marke/);
  assert.match(BASE_SYSTEM_PROMPT, /Zusammensetzung/);
  assert.match(BASE_SYSTEM_PROMPT, /"das ist nicht elastisch"/);
  // Het waarom: onder dezelfde naam zitten meerdere varianten.
  assert.match(BASE_SYSTEM_PROMPT, /mehrere Varianten/);
  assert.match(BASE_SYSTEM_PROMPT, /gewöhnlichen Spachtelmasse bis zu einem Epoxid/);
});

test('basis-prompt verbiedt prijsvergelijking met een ander merk (DE)', () => {
  assert.match(BASE_SYSTEM_PROMPT, /Vergleiche niemals Preise oder Kosten mit einer anderen Marke/);
  assert.match(BASE_SYSTEM_PROMPT, /günstiger oder teurer/);
});

test('basis-prompt zegt wat de bot in plaats daarvan doet bij een ander product (DE)', () => {
  assert.match(BASE_SYSTEM_PROMPT, /WAS DU STATTDESSEN TUST/);
  assert.match(BASE_SYSTEM_PROMPT, /nicht beurteilen kannst, weil es kein EAZYFIX®-Produkt ist/);
});

test('analyse-prompt verbiedt uitspraken over andermans product op de foto (DE)', () => {
  assert.match(IMAGE_ANALYSIS_PROMPT, /ANDERE MARKEN/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /Markenname auf dem Foto steht/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /Zusammensetzung/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /"das ist nicht elastisch"/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /mehrere Varianten/);
  // Wel benoemen wat er te zien is, in plaats van de samenstelling te duiden.
  assert.match(IMAGE_ANALYSIS_PROMPT, /was du auf dem Foto SIEHST/);
});

test('geen concurrentmerken bij naam in de prompts (DE)', () => {
  for (const p of [BASE_SYSTEM_PROMPT, IMAGE_ANALYSIS_PROMPT, IMAGE_DIAGNOSE_PROMPT]) {
    assert.doesNotMatch(p, /Polyfilla/i);
    assert.doesNotMatch(p, /W350/i);
    assert.doesNotMatch(p, /DRY FLEX/i);
  }
});

test('diagnose-prompt vraagt geldig JSON met de verwachte (contract-)velden', () => {
  assert.match(IMAGE_DIAGNOSE_PROMPT, /JSON/);
  assert.match(IMAGE_DIAGNOSE_PROMPT, /"duidelijk"/);
  assert.match(IMAGE_DIAGNOSE_PROMPT, /"schade_type"/);
  assert.match(IMAGE_DIAGNOSE_PROMPT, /"zoektermen"/);
  // ernst-waarden blijven het code-contract licht/matig/ernstig.
  assert.match(IMAGE_DIAGNOSE_PROMPT, /"licht", "matig", "ernstig"/);
});

// Audit 20-07-2026: de persona zette Premium All-in-One Spachtel weg als "vollständiges
// Paket" en als Holzfäule-route, terwijl de kennisbank een losse 150 ml universele koker
// beschrijft (0-1 cm, 7-10 min, 30 min uitharden). Die specs dragen de Holzfäule-route
// (0,5-2 cm, 4 uur) niet.
test('All-in-One Spachtel staat als universele koker, niet als Holzfaeule-set', () => {
  // Productbeschrijving staat in de basisprompt, de PRODUKTWAHL-lijst in de foto-prompt.
  assert.doesNotMatch(BASE_SYSTEM_PROMPT, /All-in-One Spachtel: vollständiges Paket/);
  assert.match(BASE_SYSTEM_PROMPT, /All-in-One Spachtel: universelle 2-Komponenten/);
  assert.match(BASE_SYSTEM_PROMPT, /KEIN Set und KEIN Ersatz für die Holzfäule-Vorgehensweise/);
  assert.doesNotMatch(IMAGE_ANALYSIS_PROMPT, /All-in-One Spachtel \(Holzfäule, komplettes Set\)/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /NICHT bei echter Holzfäule/);
});

// Audit 20-07-2026: persona zei "ca. 20 Min." waar de kennisbank 20-25 Min zegt (22 chunks),
// en "ca. 30.000 U/min" voor de frees waar de bron een ONDERGRENS bedoelt ("mindestens
// 30.000", 21 chunks). "Ca." leest als "25.000 gaat ook".
test('Verarbeitungszeit en Drehzahl volgen de kennisbank', () => {
  assert.match(BASE_SYSTEM_PROMPT, /Verarbeitungszeit 20 bis 25 Min/);
  assert.doesNotMatch(BASE_SYSTEM_PROMPT, /Verarbeitungszeit ca\. 20 Min/);
  assert.match(BASE_SYSTEM_PROMPT, /mindestens 30\.000 U\/min/);
  assert.doesNotMatch(BASE_SYSTEM_PROMPT, /ca\. 30\.000 U\/min/);
});
