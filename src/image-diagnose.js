// Pass-1 van de foto-analyse: parse en valideer de snelle, gestructureerde
// JSON-diagnose. Die diagnose stuurt (1) of de foto bruikbaar is en (2) de
// zoekopdracht naar de EAZYFIX®-websitekennis voor pass-2.

const ERNST_WAARDEN = ['licht', 'matig', 'ernstig'];

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
  return {
    duidelijk: obj.duidelijk,
    // is_hout ontbreekt bij oude antwoorden: dan standaard true (geen valse afwijzing).
    isHout: typeof obj.is_hout === 'boolean' ? obj.is_hout : true,
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
    return `Op deze foto kan ik de schade nog niet goed inschatten: ${reden}. Stuur gerust een nieuwe foto, dan kijk ik er opnieuw naar.`;
  }
  return 'Op deze foto kan ik de schade nog niet goed inschatten. Stuur gerust een scherpe foto van dichtbij, recht van voren en bij goed daglicht, dan kijk ik er opnieuw naar.';
}

// Reply als de foto duidelijk geen hout is (steen, baksteen, metselwerk, beton,
// metaal, kunststof). EAZYFIX® is uitsluitend houtherstel, dus geen gok.
function nietHoutReply(diagnose) {
  const mat = diagnose && diagnose.materiaal ? diagnose.materiaal.trim() : '';
  const watIkZie = mat
    ? `Op deze foto zie ik ${mat} en geen hout.`
    : 'Op deze foto zie ik geen hout.';
  return `${watIkZie} EAZYFIX® is gespecialiseerd in houtherstel, dus voor deze schade kan ik je geen passend advies geven. Gaat het toch om hout, stuur dan een scherpe close-up van het houten deel, dan kijk ik er opnieuw naar.`;
}

module.exports = { parseDiagnose, buildRagQuery, unclearReply, nietHoutReply };
