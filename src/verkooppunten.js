// Lookup van EAZYFIX®-verkooppunten op plaats of postcode.
// Data: src/verkooppunten.json (geparsed van eazy-fix.nl/overzicht-verkooppunten).

// De DE-dataset is een object { map_url, verkooppunten:[...] }; de oude NL-vorm was
// een kale array. Beide vormen ondersteunen zodat de lookup nooit crasht.
const DATA = require('./verkooppunten.json');
const STORES = Array.isArray(DATA) ? DATA : (DATA.verkooppunten || []);
const MAP_URL = Array.isArray(DATA) ? null : (DATA.map_url || null);

function norm(s) {
  return (s == null ? '' : String(s)).trim().toLowerCase();
}

// Geef een korte, bot-vriendelijke regel per verkooppunt.
function formatStore(s) {
  const parts = [s.name];
  if (s.street) parts.push(s.street);
  if (s.zip || s.city) parts.push([s.zip, s.city].filter(Boolean).join(' ').trim());
  if (s.phone) parts.push('tel ' + s.phone);
  if (s.url) parts.push(s.url);
  return parts.join(', ');
}

// Zoek verkooppunten bij een plaats of postcode en meld hoe goed de match is.
// 1) plaatsnaam (exact of deel) → kind 'city'; anders 2) postcode → zelfde regio
// (eerste 2 cijfers) → kind 'region'. Geen echte afstandssortering: er zijn geen
// coördinaten per winkel, dus we claimen niet "dichtstbijzijnde".
// Geeft { stores, kind } met kind 'city' | 'region' | 'none'.
function findWithMatch(query, limit = 3) {
  const q = norm(query);
  if (!q) return { stores: [], kind: 'none' };

  const byCity = STORES.filter((s) => {
    const c = norm(s.city);
    return c === q || (q.length >= 3 && c.includes(q));
  });
  if (byCity.length) return { stores: byCity.slice(0, limit), kind: 'city' };

  const zip = q.match(/(\d{4})\s*[a-z]{0,2}/);
  if (zip) {
    const p2 = zip[1].slice(0, 2);
    const near = STORES.filter((s) => s.zip && s.zip.replace(/\s+/g, '').slice(0, 2) === p2);
    if (near.length) return { stores: near.slice(0, limit), kind: 'region' };
  }

  return { stores: [], kind: 'none' };
}

// Compat-wrapper: alleen de winkellijst (gebruikt door tests en de eval-harnas).
function findVerkooppunten(query, limit = 3) {
  return findWithMatch(query, limit).stores;
}

// Tool-definitie voor de Anthropic API (tool-use in de chat).
const VERKOOPPUNT_TOOL = {
  name: 'find_verkooppunt',
  description:
    'Suche physische EAZYFIX®-Verkaufsstellen zu einem Ort oder einer Postleitzahl in Deutschland. ' +
    'Nutze dieses Tool, sobald der Nutzer wissen möchte, wo Produkte physisch erhältlich sind ' +
    'und einen Ort oder eine Postleitzahl genannt hat. Kennst du den Ort noch nicht, frag zuerst danach.',
  input_schema: {
    type: 'object',
    properties: {
      plaats: {
        type: 'string',
        description: 'Ortsname oder Postleitzahl des Nutzers, z. B. "Essen" oder "45127".',
      },
    },
    required: ['plaats'],
  },
};

// Voer de verkooppunt-tool uit; geeft een korte tekst terug voor het model.
function runVerkooppuntTool(input) {
  const plaats = input && input.plaats;
  const { stores, kind } = findWithMatch(plaats, 3);
  if (!stores.length) {
    // Niets gevonden: niet gokken, maar naar de site/webshop én de binnendienst
    // verwijzen (conform de "nooit verzinnen"-regel).
    return `Keine EAZYFIX-Verkaufsstelle gefunden für "${plaats || ''}". ` +
      'Verweise den Nutzer auf die Verkaufsstellen-Karte auf eazy-fix.de/verkaufsstellen oder den Webshop für die Online-Bestellung, ' +
      'oder auf den EAZYFIX-Innendienst: +31 85 201 201 1.';
  }
  // Ehrliche Überschrift: bei einem Ortstreffer "in <Ort>", bei einem Postleitzahl-
  // Treffer "in der Region". Kein "nächstgelegene" — es gibt keine echte Entfernungssortierung.
  const kop = kind === 'city'
    ? `EAZYFIX-Verkaufsstellen in ${plaats}:`
    : 'EAZYFIX-Verkaufsstellen in der Region (nach Postleitzahl, nicht nach exakter Entfernung):';
  return `${kop}\n${stores.map(formatStore).join('\n')}`;
}

// Dispatch op toolnaam (uitbreidbaar voor latere tools).
function runTool(name, input) {
  if (name === 'find_verkooppunt') return runVerkooppuntTool(input);
  return `Onbekende tool: ${name}`;
}

module.exports = { findVerkooppunten, findWithMatch, formatStore, STORES, MAP_URL, VERKOOPPUNT_TOOL, runVerkooppuntTool, runTool };
