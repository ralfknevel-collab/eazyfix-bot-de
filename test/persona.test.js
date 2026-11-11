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

// Port van eazyfix-bot 90c0dfd (feedback 72/74/79/80, binnendienst 03-08-2026):
// de NL-bot verzon dat eine ausgehärtete Spachtelmasse in einer "arbeitenden
// Fuge" herausgezogen wird. Falsch: die Epoxidprodukte sind dauerhaft elastisch.
// Echte Ursache dort: falsches Produkt für die Tiefe (Spachtelmasse 0,5-2 cm;
// flache Fugen 0-6 mm gehören zum Feinspachtel).
test('beide Prompts verbieten die Behauptung, ein EAZYFIX-Produkt löse sich durch eine arbeitende Naht', () => {
  assert.match(BASE_SYSTEM_PROMPT, /löst sich eine EAZYFIX®-Reparatur nicht ab/);
  assert.match(BASE_SYSTEM_PROMPT, /dauerhaft elastisch/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /EIGENE PRODUKTE LÖSEN SICH NICHT/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /dauerhaft elastisch/);
});

test('flache Nähte und Fugen (0-6 mm) routen zum Feinspachtel, nicht zur Spachtelmasse', () => {
  assert.match(BASE_SYSTEM_PROMPT, /flache Nähte, Fugen oder Risse bis 6 mm/);
  assert.match(BASE_SYSTEM_PROMPT, /Nähte und Fugen zwischen Teilen, die arbeiten/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /Flache Nähte, Fugen und Risse \(0 bis 6 mm tief\)/);
});

test('Feinspachtel-Rat nennt immer die Vorbereitung (reinigen, anschleifen, staubfrei)', () => {
  assert.match(BASE_SYSTEM_PROMPT, /DIE VORBEREITUNG GEHÖRT IMMER DAZU/);
  assert.match(BASE_SYSTEM_PROMPT, /staub- und fettfrei/);
});

test('Diagnose-Prompt erkennt Kunststofffenster und blockt den Nahaufnahme-Umweg', () => {
  assert.match(IMAGE_DIAGNOSE_PROMPT, /KUNSTSTOFF-Fenster \(PVC\)/);
  assert.match(IMAGE_DIAGNOSE_PROMPT, /verschweißten Eckverbindungen/);
  assert.match(IMAGE_DIAGNOSE_PROMPT, /auch wenn keine Schadstelle sichtbar ist/);
});

// Feedback 83/84 eazyfix-bot NL (11-08-2026, Port e99def2): auf einem Foto einer
// aufgegangenen Gehrungsverbindung in einer Fensterrahmen-Ecke empfahl der Bot
// den Feinspachtel ("flache Naht, 0-6 mm"). Falsch: eine offene konstruktive
// Verbindung ist die Spachtelmasse-Route. Die Website nennt die Spachtelmasse
// "sehr gut zum Füllen von Rissen, Astlöchern und Fugen"; die Schichtdicke
// erreicht man, indem die Verbindung zuerst großzügig ausgefräst wird.
test('offene konstruktive Verbindungen routen zu Ausfräsen + Spachtelmasse, nicht zum Feinspachtel', () => {
  assert.match(BASE_SYSTEM_PROMPT, /aufgegangene konstruktive Verbindung/i);
  assert.match(BASE_SYSTEM_PROMPT, /Gehrungs- oder Eckverbindung/);
  assert.match(BASE_SYSTEM_PROMPT, /mindestens 0,5 cm/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /AUFGEGANGENE KONSTRUKTIVE VERBINDUNG/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /über beide Teile der Verbindung verteilt/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /mitten durch ein Teil, wo keine Verbindung hingehört/);
  assert.match(IMAGE_DIAGNOSE_PROMPT, /"offene Verbindung"/);
});

// Port von eazyfix-bot NL, Feedback 90 (26-08-2026, Innendienst): bei tiefer Fäule
// in der Schwelle eines Hartholz-Tors fragte der Bot, ob die Stelle am tragenden
// Scharnier sitzt, und hängte daran einen Innendienst-Verweis. Falsch: Fäule am
// Beschlag ist eine normale Reparatur, die direkt erklärt wird. Website (DE):
// "Die Holzspachtelmasse kannst du wie Holz bearbeiten. Du kannst einfach
// Schrauben und Nägel einbringen"; Teilaustausch bei größer als eine Faust.
test('Fäule an Scharnier/Beschlag von Tor oder Tür wird direkt erklärt, nicht an den Innendienst', () => {
  assert.match(BASE_SYSTEM_PROMPT, /Scharnier, Schloss oder anderen Beschlag/);
  assert.match(BASE_SYSTEM_PROMPT, /auch nicht, wenn dieser Beschlag das Gewicht trägt/);
  assert.match(BASE_SYSTEM_PROMPT, /einfach wieder Schrauben einbringen/);
  assert.match(BASE_SYSTEM_PROMPT, /tragende Bauteile \(Balken, Sparren/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /Scharnier, Schloss oder anderen Beschlag/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /auch nicht, wenn dieser Beschlag das Gewicht trägt/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /tragende Bauteile \(Balken, Sparren/);
});

// Port NL feedback 91 (08-09-2026, Innendienst NL): bei einem Loch "so groß wie
// 3 Tennisbälle, 4 cm tief" empfahl der Bot einen Teilaustausch mit "einem
// passenden Stück Holz" und verwies für die Anzahl Kartuschen auf den Webshop.
// Innendienst: (1) die Fuge um ein Einsatzstück muss mindestens 5 mm sein, damit
// die Spannungen aufgefangen werden; (2) die Anzahl Kartuschen rechnet der Bot
// selbst aus; (3) eine Größenangabe ohne Messen ("so groß wie ein Tennisball")
// muss nutzbar sein. Website (DE): "Achte darauf, dass du mindestens 5 mm
// zwischen dem neuen und dem bestehenden Holzstück ausfüllst. So bleibt genügend
// Elastizität" (voorbeeld-/Hornbach-Seiten), Teilersatz bei größer als eine Faust
// (morsches-holz-erkennen-und-reparieren), Rechenregel "Breite x Höhe x Tiefe ...
// durch 150" (Produktseiten Standardset/Erweiterungsset). Tennisball ≈ 150 ml ist
// eine geometrische Schätzung (Durchmesser 6,5 bis 6,9 cm), gleich einer Kartusche.
test('Teilaustausch: Fuge von mindestens 5 mm, kein exakt passendes Einsatzstück', () => {
  assert.match(BASE_SYSTEM_PROMPT, /FUGE VON MINDESTENS 5 MM/);
  assert.match(BASE_SYSTEM_PROMPT, /NICHT exakt passend/);
  assert.match(BASE_SYSTEM_PROMPT, /Spannungen zwischen dem bestehenden und dem neuen Holz/);
  assert.doesNotMatch(BASE_SYSTEM_PROMPT, /ein passendes Stück Holz ein \(Teilaustausch\)/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /FUGE VON MINDESTENS 5 MM/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /NICHT exakt passend/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /KEINE flache Fuge für den Feinspachtel/);
});

test('Anzahl Kartuschen rechnet der Bot selbst aus, auch auf eine Tennisball-Angabe', () => {
  assert.match(BASE_SYSTEM_PROMPT, /MATERIALMENGE \(Anzahl Kartuschen\) AUSRECHNEN/);
  assert.match(BASE_SYSTEM_PROMPT, /teile das durch 150/);
  assert.match(BASE_SYSTEM_PROMPT, /ein Tennisball hat grob 150 ml/);
  assert.match(BASE_SYSTEM_PROMPT, /verweise ihn dafür nicht auf den Webshop/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /MENGE AUSRECHNEN/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /geteilt durch 150 ml pro Kartusche/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /eine Kartusche pro Tennisball/);
});

// Port van eazyfix-bot / repair-care-bot 5a9d74c (RC-feedback #164/#165, 2026-09-08):
// in een Engelstalig gesprek lekten vaktermen uit de kennis in het antwoord plus de
// letterlijke video-uitnodiging. De oude regel zonderde alleen namen uit en het model
// rekte die uitzondering op tot alle vakjargon. Beide prompts moeten nu expliciet
// zeggen dat ALLE andere woorden mee vertaald worden, met Duitse tegenvoorbeelden,
// en dat de video-zin meevertaalt.
test('andere taal: vakjargon uit DE-kennis wordt mee vertaald, alleen product- en merknamen blijven staan (beide prompts)', () => {
  for (const prompt of [BASE_SYSTEM_PROMPT, IMAGE_ANALYSIS_PROMPT]) {
    assert.match(prompt, /NUR Produkt- und Markennamen/);
    assert.match(prompt, /alle anderen Wörter übersetzt du mit/i);
    assert.match(prompt, /Fachbegriffe und Bauteilnamen aus dem deutschen Wissen/);
    assert.match(prompt, /"wood filler"/);
    assert.match(prompt, /"wood rot"/);
    assert.match(prompt, /"window frame, door"/);
    assert.match(prompt, /Video schreibst du in der Sprache deiner Antwort/);
  }
});

// Port eazyfix-bot (Meldung Nina, 10-11-2026): auf "Wann ist der Fertigspachtel
// trocken?" verwies der Bot an den Innendienst, obwohl eazy-fix.de die Zeit nennt
// (Produktseite: "Überstreichbar: Nach 2 Stunden"; Anleitung Wandschäden:
// "zuerst abschleifen? Warte dann 24 Stunden"). "Volledig droog na 1 dag" steht
// nicht auf der deutschen Seite und ist daher bewusst nicht übernommen.
test('Fertigspachtel: Trocknungszeit steht fest im Chat-Prompt', () => {
  const r = BASE_SYSTEM_PROMPT.split('\n').filter((x) => x.startsWith('- TROCKNUNGSZEIT EAZYFIX® Premium Fertigspachtel'));
  assert.equal(r.length, 1);
  assert.match(r[0], /nach 2 Stunden überstreichbar/);
  assert.match(r[0], /schleifen, dann 24 Stunden warten/);
  assert.match(r[0], /verweise dafür NICHT an den Innendienst/);
  assert.match(r[0], /gelten NUR für den EAZYFIX® Premium Fertigspachtel/);
});

// Port eazyfix-bot 6c1a93a (review 10-11-2026): de regels stonden "- " toe, het
// servervangnet stripMarkdown haalt streepjes weg, waardoor het antwoord aan het eind
// werd vervangen. De regel verbiedt het teken nu zelf.
test('Format: keine Aufzählungszeichen, nur eine Anleitung darf nummeriert sein', () => {
  const r = BASE_SYSTEM_PROMPT.split('\n').filter((x) => x.startsWith('- Schreib Fließtext OHNE Aufzählungszeichen.'));
  assert.equal(r.length, 1);
  assert.match(r[0], /Beginne eine Zeile NIE mit einem Strich, einem Sternchen oder einem Punkt/);
  assert.match(r[0], /NUR eine Anleitung, bei der die Reihenfolge der Schritte wichtig ist/);
  assert.doesNotMatch(BASE_SYSTEM_PROMPT, /Für Aufzählungen darfst du "- "/);
});

// Port eazyfix-bot e27380f en e6b0942 (review 10-11-2026): Widersprüche in Regeln und
// Meldungen, und eine vage erste Frage bekommt nur Rückfragen.
test('Regeln widersprechen sich nicht: nasses Holz, Dremel, vage erste Frage', () => {
  assert.doesNotMatch(BASE_SYSTEM_PROMPT, /Zu nass\? 24 Stunden trocknen\./);
  assert.match(BASE_SYSTEM_PROMPT, /^4\. Feuchtegehalt mit dem Holzfeuchtemessgerät messen: unter 18 %\. Zu nass\? Erst trocknen lassen, bis das Messgerät unter 18 % anzeigt\.$/m);
  const fraeser = BASE_SYSTEM_PROMPT.split('\n').filter((x) => x.startsWith('- Holzfäule Fräser:'));
  assert.equal(fraeser.length, 1);
  assert.match(fraeser[0], /Das ist die EINZIGE Ausnahme von der Regel zu anderen Marken/);
  const vage = BASE_SYSTEM_PROMPT.split('\n').filter((x) => x.startsWith('- VAGE ERSTE FRAGE:'));
  assert.equal(vage.length, 1);
  assert.match(vage[0], /Nenne dann noch KEINE Produkte, KEINE Schritte und KEINE Vorgehensweise/);
});

test('Fehlermeldungen für Besucher enthalten keinen Gedankenstrich', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'index.js'), 'utf8');
  const meldungen = [...src.matchAll(/(?:return|error:)\s*'([^'\n]{20,})'/g)].map((m) => m[1]);
  assert.ok(meldungen.length >= 5);
  for (const m of meldungen) assert.doesNotMatch(m, /[—–]/, m);
});

// Port eazyfix-bot 20c1c43 (Besluit Ralf 10-11-2026): kurze erste Rückfragen und
// Zwischenraum zwischen Zeilen im Chat.
test('erste Rückfragen: höchstens drei kurze Fragen, je eine pro Zeile', () => {
  const r = BASE_SYSTEM_PROMPT.split('\n').filter((x) => x.startsWith('- FORM DER ERSTEN RÜCKFRAGEN:'));
  assert.equal(r.length, 1);
  assert.match(r[0], /höchstens DREI Fragen, jede in einer eigenen Zeile und jede EINE kurze Frage/);
  assert.match(r[0], /Hänge keine zweite Frage/);
});

test('Chatseite: Zeilen direkt untereinander bekommen nach dem Abschluss Zwischenraum', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /\.msg \.lsp \{ display: block; height: 7px; \}/);
  assert.match(html, /function regelRuimte\(answerEl\)/);
  assert.equal(html.split('linkifyEmails(out); regelRuimte(out);').length - 1, 5);
});

// Port eazyfix-bot (Ralf 11-11-2026): keine Ankündigung der Rückfragen.
test('vage erste Frage: keine Ankündigung der Fragen', () => {
  const r = BASE_SYSTEM_PROMPT.split('\n').filter((x) => x.startsWith('- VAGE ERSTE FRAGE:'));
  assert.equal(r.length, 1);
  assert.match(r[0], /Kündige deine Fragen NICHT an/);
});

// Port eazyfix-bot 9d05f53 (review 11-11-2026): natürlichere Antworten für Privatleute.
test('review 11-11: Regeln für natürliche Antworten stehen genau einmal da', () => {
  const regeln = BASE_SYSTEM_PROMPT.split('\n');
  const eine = (start) => { const r = regeln.filter((x) => x.startsWith(start)); assert.equal(r.length, 1, start); return r[0]; };
  assert.match(eine('- WAS DER HEIMWERKER SCHON GESAGT HAT, GILT:'), /bitte NICHT noch einmal um den Stichtest/);
  assert.match(eine('- KEINE WIEDERHOLTEN FRAGEN:'), /stell sie nicht noch einmal/);
  assert.match(eine('- KÜNDIGE DEINE FRAGEN NIE AN, in keiner Antwort'), /Noch zwei Fragen:/);
  assert.match(eine('- ENDE DEINER ANTWORT:'), /VOR diesem Abschluss, nie danach/);
  assert.match(eine('- DANKE ODER ABSCHLUSS:'), /Wiederhole deine früheren Fragen dann NICHT/);
  assert.match(eine('- LÄNGE:'), /zuerst die Antwort in ein oder zwei Sätzen/);
  assert.match(eine('- EINFACHE SPRACHE:'), /nie "kosmetischer Schaden"/);
  assert.match(eine('- UNSICHER ODER WEITERVERWEISEN:'), /ZUERST, was du sicher weißt/);
  assert.match(eine('- Die Vorschau von weather_lookup reicht bis übermorgen'), /Tu NIE so, als wäre morgen oder übermorgen das Wochenende/);
  assert.match(eine('- Nenne ein Produkt beim ERSTEN Mal in deiner Antwort vollständig'), /nimm den kurzen Namen ohne EAZYFIX®/);
  assert.doesNotMatch(BASE_SYSTEM_PROMPT, /IMMER vollständig mit "EAZYFIX®" davor, auch bei Wiederholung/);
  assert.doesNotMatch(IMAGE_ANALYSIS_PROMPT, /IMMER vollständig mit "EAZYFIX®" davor, auch bei Wiederholung/);
});
