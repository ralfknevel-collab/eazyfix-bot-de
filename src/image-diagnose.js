// Pass-1 van de foto-analyse: parse en valideer de snelle, gestructureerde
// JSON-diagnose. Die diagnose stuurt (1) of de foto bruikbaar is en (2) de
// zoekopdracht naar de EAZYFIX®-websitekennis voor pass-2.

const ERNST_WAARDEN = ['licht', 'matig', 'ernstig'];

// Noodsignalen in het bijschrift bij een foto.
//
// WAAROM DETERMINISTISCH EN NIET ALLEEN VIA DE PROMPT: de veiligheidsregel in
// BASE_SYSTEM_PROMPT vuurt pas in de chatflow. Maar bij "geen hout" of een
// onduidelijke foto keert de fotoflow al ná pass 1 terug (nietHoutReply /
// unclearReply) en draait pass 2 nooit. Een noodsignaal in het bijschrift zou
// dan onbeantwoord blijven. Deze check draait daarom vóór alle foto-analyse.
//
// BEWUST SMAL GEHOUDEN: alleen ondubbelzinnige formuleringen. Duitse spreektaal
// zit vol hyperbool ("diese Arbeit bringt mich um", "ich sterbe vor Hitze") en
// daar mag geen crisisnummer op afgaan; dat zou de bot onbruikbaar maken en het
// signaal juist devalueren. Vandaar "mich umbringen" (en niet "bringt mich um")
// en "sterben wollen" (en niet het kale "sterben"). Vals-negatieven vangt de
// promptregel in de chatflow alsnog op; vals-positieven vangt niemand op.
const NOOD_RE = new RegExp([
  'suizid',
  'selbstmord',
  '(mich|mir)\\s+(selbst\\s+)?umbringen',
  '(mir|mich)\\s+(et)?was\\s+antun',
  '(will|wollte|möchte|werde)\\s+(nicht\\s+mehr\\s+leben|sterben)',
  'nicht\\s+mehr\\s+leben\\s+(zu\\s+)?wollen',
  'will\\s+nicht\\s+mehr\\s+(hier\\s+)?sein',
  'keinen\\s+(ausweg|sinn)\\s+mehr',
  'lebensmüde',
].join('|'), 'i');

// Bevat de vrije gebruikerstekst bij een foto een noodsignaal?
function containsDistressSignal(text) {
  return typeof text === 'string' && NOOD_RE.test(text);
}

// Antwoord bij een noodsignaal. Identiek aan de regel in BASE_SYSTEM_PROMPT
// (persona.js), zodat chat en fotoflow hetzelfde zeggen. Geen foto-analyse,
// geen vervolgvraag.
function distressReply() {
  return 'Es tut mir leid, dass es dir gerade so schwer fällt. Bitte sprich darüber mit der Telefonseelsorge: kostenlos und rund um die Uhr unter 0800 111 0 111 oder 0800 111 0 222, auch per Chat auf telefonseelsorge.de. Bei akuter Gefahr wähle den Notruf 112.';
}

// Haal het eerste complete JSON-object uit een tekst (het model kan markdown of
// omringende tekst toevoegen). Probeer eerst de hele string, daarna de eerste
// { ... } substring.
function extractJson(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const pogingen = [text.trim()];
  const start = text.indexOf('{');
  const eind = text.lastIndexOf('}');
  if (start !== -1 && eind > start) pogingen.push(text.slice(start, eind + 1));
  for (const p of pogingen) {
    try {
      const obj = JSON.parse(p);
      if (obj && typeof obj === 'object') return obj;
    } catch (_) { /* volgende poging */ }
  }
  return null;
}

// Parse en valideer de pass-1 diagnose. Geeft een genormaliseerd object of null
// als de input onbruikbaar is (geen object, of "duidelijk" geen boolean).
function parseDiagnose(text) {
  const obj = extractJson(text);
  if (!obj || typeof obj.duidelijk !== 'boolean') return null;
  const ernstRaw = typeof obj.ernst === 'string' ? obj.ernst.toLowerCase().trim() : '';
  const zoektermen = Array.isArray(obj.zoektermen)
    ? obj.zoektermen.filter((t) => typeof t === 'string' && t.trim() !== '')
    : [];
  // Productfoto (koker/verpakking) i.p.v. houtschade: hoort bij een productvraag,
  // niet bij een schade-analyse. Default false, zodat een ontbrekend veld nooit een
  // echte schadefoto als product wegleidt.
  const isProduct = obj.is_product === true;
  return {
    duidelijk: obj.duidelijk,
    // is_hout ontbreekt bij oude antwoorden: dan standaard true (geen valse afwijzing).
    isHout: typeof obj.is_hout === 'boolean' ? obj.is_hout : true,
    isProduct,
    materiaal: typeof obj.materiaal === 'string' ? obj.materiaal : '',
    redenOnduidelijk: typeof obj.reden_onduidelijk === 'string' ? obj.reden_onduidelijk : '',
    schadeType: typeof obj.schade_type === 'string' ? obj.schade_type : '',
    ernst: ERNST_WAARDEN.includes(ernstRaw) ? ernstRaw : 'matig',
    zoektermen,
  };
}

// Bouw de zoekopdracht voor zoek_kennis uit schade_type + zoektermen.
function buildRagQuery(diagnose) {
  return [diagnose.schadeType, ...(diagnose.zoektermen || [])]
    .filter((s) => typeof s === 'string' && s.trim() !== '')
    .join(' ');
}

// Kort, vriendelijk antwoord dat om een betere foto vraagt bij een onduidelijke
// foto. Geen gok over de schade.
function unclearReply(diagnose) {
  const reden = diagnose && diagnose.redenOnduidelijk ? diagnose.redenOnduidelijk.trim() : '';
  if (reden) {
    return `Auf diesem Foto kann ich den Schaden noch nicht gut einschätzen: ${reden}. Schick gerne ein neues Foto, dann schaue ich es mir noch einmal an.`;
  }
  return 'Auf diesem Foto kann ich den Schaden noch nicht gut einschätzen. Schick gerne ein scharfes Foto aus der Nähe, frontal und bei gutem Tageslicht, dann schaue ich es mir noch einmal an.';
}

// Reply als de foto duidelijk geen hout is (steen, baksteen, metselwerk, beton,
// metaal, kunststof). EAZYFIX® is uitsluitend houtherstel, dus geen gok.
function nietHoutReply(diagnose) {
  const mat = diagnose && diagnose.materiaal ? diagnose.materiaal.trim() : '';
  const watIkZie = mat
    ? `Auf diesem Foto sehe ich ${mat} und kein Holz.`
    : 'Auf diesem Foto sehe ich kein Holz.';
  return `${watIkZie} EAZYFIX® ist auf Holzreparatur spezialisiert, daher kann ich dir für diesen Schaden keinen passenden Rat geben. Geht es doch um Holz, schick eine scharfe Nahaufnahme des Holzteils, dann schaue ich es mir noch einmal an.`;
}

// Bouw de pass-2 analyse-prompt. Puur, zodat het contract testbaar is: één foto
// vs. meerdere, lopend gesprek als aanvulling, en een optioneel bijschrift wanneer
// de gebruiker foto + vraag in één beurt stuurt (dan geen los tweede antwoord).
function buildAnalysisPrompt({ imageCount = 1, hasPrior = false, caption = '' } = {}) {
  const cap = typeof caption === 'string' ? caption.trim() : '';
  let text = imageCount > 1
    ? `Analysiere diese ${imageCount} Fotos der beschädigten Stelle (verschiedene Winkel/Details desselben Schadens).`
    : 'Analysiere dieses Foto der beschädigten Stelle.';
  if (hasPrior) {
    text += ' Dieses Gespräch läuft bereits; dieses Foto ergänzt den zuvor besprochenen Schaden. Mach damit weiter und behandle es nicht als eigenständigen neuen Fall.';
  }
  if (cap) {
    text += ` Der Nutzer schreibt dazu: "${cap}". Geh in deiner Analyse konkret darauf ein.`;
  }
  return text;
}

module.exports = { parseDiagnose, buildRagQuery, unclearReply, nietHoutReply, buildAnalysisPrompt,
  containsDistressSignal, distressReply };
