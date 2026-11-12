// Contextparameters uit het iframe-adres (port eazyfix-bot context.js, november 2026):
// de Duitse site (eazy-fix.nl/de, JKC) geeft mee op welke pagina, bij welk product of
// welke klus de bezoeker de chat opent, en in welke taal. Alleen bekende waarden tellen:
// een product of pagina moet in de kennis van de site staan, een klus, taal en land op
// de vaste lijst. Zo kan niemand via het adres eigen tekst in de prompt zetten.

const { DATA, siteBase } = require('./kennis');

// Klus-sleutels: de sjablonen van JKC gebruiken op elke taalversie dezelfde
// Nederlandse sleutels; Duitse varianten worden ook herkend.
const KLUSSEN = {
  kozijn: 'einen Fensterrahmen oder ein Fenster', deur: 'eine Tür', trap: 'eine Treppe', vloer: 'einen Holzboden',
  dorpel: 'eine Schwelle', muur: 'eine Wand', dak: 'einen Dachrand', boeiboord: 'ein Stirnbrett',
  schutting: 'einen Zaun', meubel: 'ein Möbelstück',
};
const KLUS_ALIAS = {
  fenster: 'kozijn', fensterrahmen: 'kozijn', tuer: 'deur', treppe: 'trap', boden: 'vloer', holzboden: 'vloer',
  schwelle: 'dorpel', wand: 'muur', dach: 'dak', stirnbrett: 'boeiboord', zaun: 'schutting', moebel: 'meubel',
};
const TALEN = { de: 'Deutsch', nl: 'Niederländisch', en: 'Englisch' };
// Land waarvoor de bezoeker advies zoekt: deze chat is er voor Duitsland en Oostenrijk
// (verzending en winkels); andere landen vallen stil weg.
const LANDEN = { de: 'Deutschland', at: 'Österreich' };
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const PAD_RE = /^\/?[a-z0-9][a-z0-9\-/]{0,119}$/;

function zuiverTitel(t) {
  return String(t || '').split('|')[0].replace(/\s+/g, ' ').trim().slice(0, 100);
}

function vindProduct(slug) {
  if (!SLUG_RE.test(slug)) return null;
  const p = DATA.find((x) => x.type === 'product' && x.slug === slug);
  return p ? { slug, titel: zuiverTitel(p.title) } : null;
}

// Pagina als slug ("holzboden-reparieren") of pad ("/de/heimwerker-coach/...").
function vindPagina(waarde) {
  const v = String(waarde || '').toLowerCase().trim();
  if (!PAD_RE.test(v)) return null;
  const pad = '/' + v.replace(/^\/+|\/+$/g, '') + '/';
  const p = DATA.find((x) => {
    if (!x.url || x.type === 'video') return false;
    try { return new URL(x.url).pathname.endsWith(pad); } catch { return false; }
  });
  return p ? { pad: new URL(p.url).pathname, titel: zuiverTitel(p.title), type: p.type } : null;
}

// Lees en controleer de context uit de request-body. Geeft altijd een object terug;
// onbekende of ongeldige velden vallen weg.
function parseContext(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ctx = {};
  const s = (k) => (typeof r[k] === 'string' ? r[k].toLowerCase().trim().slice(0, 120) : '');
  const product = vindProduct(s('product'));
  if (product) ctx.product = product;
  const pagina = vindPagina(s('page'));
  if (pagina) ctx.pagina = pagina;
  const klus = KLUS_ALIAS[s('klus')] || s('klus');
  if (KLUSSEN[klus]) ctx.klus = klus;
  if (TALEN[s('lang')]) ctx.lang = s('lang');
  if (LANDEN[s('country')]) ctx.country = s('country');
  return ctx;
}

// Notitie voor het model (in het Duits, zoals de persona), of '' zonder bruikbare context.
function contextNote(ctx) {
  if (!ctx) return '';
  const site = siteBase();
  const delen = [];
  if (ctx.product) delen.push(`der Besucher hat den Chat auf der Produktseite von ${ctx.product.titel} geöffnet (${site}/product/${ctx.product.slug}/)`);
  else if (ctx.pagina) delen.push(`der Besucher hat den Chat auf der Seite "${ctx.pagina.titel}" geöffnet (${new URL(site).origin}${ctx.pagina.pad})`);
  if (ctx.klus) delen.push(`es geht wahrscheinlich um ${KLUSSEN[ctx.klus]}`);
  const regels = [];
  if (delen.length) {
    regels.push(`KONTEXT DER WEBSITE (nur zur Orientierung): ${delen.join('; ')}. Nutze das, um eine vage oder kurze Frage zu ergänzen, zum Beispiel "wie viel brauche ich?" oder "geht das auch draußen?". Die Frage des Besuchers geht immer vor: geht es um etwas anderes, folge der Frage und dränge dieses Produkt oder diese Reparatur nicht auf. Sag nicht, dass du weißt, auf welcher Seite der Besucher ist.`);
  }
  if (ctx.lang && ctx.lang !== 'de') {
    regels.push(`SPRACHE: der Chat steht auf der Website auf ${TALEN[ctx.lang]}. Antworte auf ${TALEN[ctx.lang]}, es sei denn, der Besucher schreibt selbst in einer anderen Sprache; dann antwortest du in dieser Sprache.`);
  }
  if (ctx.country === 'at') {
    regels.push('LAND: der Besucher sucht Rat für Österreich. Österreich hat einen eigenen Webshop: verweise für Bestellung, Preise und Versand auf eazy-fix.at.');
  }
  return regels.join('\n');
}

// Extra zoekwoorden voor de kennisinjectie bij een korte vraag op een productpagina,
// zodat "wie viel brauche ich?" de kennis van dat product ophaalt.
function contextZoekterm(ctx, vraag) {
  if (!ctx || !ctx.product) return '';
  return String(vraag || '').length < 80 ? ctx.product.titel : '';
}

module.exports = { parseContext, contextNote, contextZoekterm, KLUSSEN, KLUS_ALIAS, TALEN, LANDEN };
