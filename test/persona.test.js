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
  assert.match(BASE_SYSTEM_PROMPT, /03222 1097923/);
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

// Audit foto-analyse 20-07-2026 (zusterbot): op "wat kost dit ongeveer aan materiaal?"
// rekende de bot een prijs voor. De chat-prompt verbood het verzinnen van bedragen al
// (blok PREISE), de foto-prompt bevatte geen enkele prijsregel.
test('foto-prompt verbiedt verzonnen bedragen en verwijst naar de webshop', () => {
  assert.match(IMAGE_ANALYSIS_PROMPT, /Erfinde NIEMALS einen Betrag/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /keinen Gesamtpreis und keine Preisspanne/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /Webshop auf eazy-fix\.de/);
});

// Correctie 20-07-2026: de prijsregel verwees alleen naar de webshop, terwijl EAZYFIX
// ook fysieke verkooppunten heeft met een opzoekfunctie op plaats of postcode.
test('prijsregel noemt naast de webshop ook de verkooppunten', () => {
  assert.match(IMAGE_ANALYSIS_PROMPT, /Verkaufsstelle in seiner Nähe/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /Stadt oder Postleitzahl/);
});

// Regressies uit de analyse van 268 live-chatgesprekken (docs/chatanalyse-DE-2026-07.md).
// De laagste beoordelingen ontstonden niet door verkeerde informatie maar door de
// vorm: een link in plaats van een antwoord, en een kaal "nee" zonder alternatief.
test('basis-prompt eist eerst antwoorden, daarna pas een link', () => {
  assert.match(BASE_SYSTEM_PROMPT, /ANTWORTEN STATT VERWEISEN/);
  assert.match(BASE_SYSTEM_PROMPT, /NIEMALS nur einen Link/);
  assert.match(BASE_SYSTEM_PROMPT, /Ein "Nein" darf nie allein stehen/);
});

test('basis-prompt verbiedt te ontkennen dat de bot een bot is', () => {
  assert.match(BASE_SYSTEM_PROMPT, /BIST DU EIN BOT/);
  assert.match(BASE_SYSTEM_PROMPT, /digitale Assistent von EAZYFIX®/);
  assert.match(BASE_SYSTEM_PROMPT, /Streite das NIEMALS ab/);
});

// De menselijke medewerker kon in het ordersysteem kijken, coulance geven en
// terugbellen. De bot kan dat niet en moet dat eerlijk zeggen in plaats van te
// improviseren; bijna drie op de tien gesprekken raken dit.
test('basis-prompt bevat het escalatieblok voor bestelling, levering en retour', () => {
  assert.match(BASE_SYSTEM_PROMPT, /BESTELLUNG, LIEFERUNG, RETOURE UND REKLAMATION/);
  assert.match(BASE_SYSTEM_PROMPT, /KEINEN Zugriff auf das Bestellsystem/);
  // geen leveringsbelofte, geen coulance, geen fiscale toezegging
  assert.match(BASE_SYSTEM_PROMPT, /Versprich NIEMALS einen konkreten Liefertermin/);
  assert.match(BASE_SYSTEM_PROMPT, /Sag NIEMALS eine Gutschrift/);
  assert.match(BASE_SYSTEM_PROMPT, /Umsatzsteuer/);
  // kan niet bellen of mailen
  assert.match(BASE_SYSTEM_PROMPT, /kannst nicht telefonieren/);
  // Amazon-bestellingen horen bij Amazon
  assert.match(BASE_SYSTEM_PROMPT, /Amazon/);
});

test('basis-prompt geeft de voorraad-disclaimer bij verkooppunten', () => {
  assert.match(BASE_SYSTEM_PROMPT, /Lagerbestand einer Verkaufsstelle/);
});

// Duitse klanten krijgen het Duitse nummer (staat ook zo op eazy-fix.de);
// alleen bij een Nederlandstalige bezoeker geldt het Nederlandse nummer.
test('basis-prompt geeft standaard het Duitse telefoonnummer', () => {
  assert.match(BASE_SYSTEM_PROMPT, /03222 1097923/);
  assert.match(BASE_SYSTEM_PROMPT, /Standard ist die deutsche Nummer/);
  // de NL-uitzondering staat er precies één keer, als uitzondering
  const nl = BASE_SYSTEM_PROMPT.match(/\+31 85 201 201 1/g) || [];
  assert.equal(nl.length, 1, 'het NL-nummer hoort alleen in de uitzonderingsregel');
  assert.match(BASE_SYSTEM_PROMPT, /NIEDERLÄNDISCH/);
});

test('foto-analyse-prompt gebruikt het Duitse nummer', () => {
  assert.match(IMAGE_ANALYSIS_PROMPT, /03222 1097923/);
  assert.doesNotMatch(IMAGE_ANALYSIS_PROMPT, /\+31 85/);
});

// Door de binnendienst bevestigde feiten (navraag 2026-07-21). Deze mag de bot
// voortaan zelf noemen; ze staan in de persona omdat kennis.js liefer-/versand-/
// garantie-vragen bewust naar de binnendienst stuurt (SERVICE_INTENT) en de persona
// altijd aanwezig en leidend is.
test('basis-prompt mag de levertijd als richtwaarde noemen (3 bis 5 Werktage)', () => {
  assert.match(BASE_SYSTEM_PROMPT, /3 bis 5 Werktage/);
  // maar nooit een concrete leverdag beloven
  assert.match(BASE_SYSTEM_PROMPT, /kein fester Termin/);
});

test('basis-prompt noemt gratis verzending vanaf 50 euro', () => {
  assert.match(BASE_SYSTEM_PROMPT, /ab 50 € Bestellwert ist der Versand kostenlos/);
});

test('basis-prompt noemt de 10 jaar garantie, afwikkeling via de binnendienst', () => {
  assert.match(BASE_SYSTEM_PROMPT, /10 Jahre Garantie/);
});

test('basis-prompt kleurt de uitgeharde spachtelmasse licht eiken', () => {
  assert.match(BASE_SYSTEM_PROMPT, /hell eichenfarben/);
});

// Correctie 2026-07-21: de Hornbach-filialen zijn gestopt en er is geen kaart meer
// op de Duitse site. De persona stuurt nu online-first (webshop/Amazon/Hornbach online)
// en verwijst niet meer naar een verkooppunten-kaart.
test('basis-prompt is online-first voor verkooppunten en noemt geen dode kaart', () => {
  assert.match(BASE_SYSTEM_PROMPT, /online bei HORNBACH/);
  assert.match(BASE_SYSTEM_PROMPT, /HolzLand MAHL/);
  assert.doesNotMatch(BASE_SYSTEM_PROMPT, /Verkaufsstellen-Karte auf eazy-fix\.de\/verkaufsstellen/);
});
