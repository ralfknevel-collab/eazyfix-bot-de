// Live weer voor de weather_lookup-tool: actuele temp + regenkans + 3-daagse
// vooruitblik. Gebruikt WeatherAPI.com als WEATHERAPI_KEY gezet is (account-
// gebonden key, betrouwbaar vanaf Render), anders Open-Meteo (gratis, geen key,
// maar IP-gebonden rate-limit). De bot vertaalt de cijfers zelf naar klusadvies
// (regen tijdens uitharden, hout moet droog zijn, uit direct zonlicht) op basis
// van de persona.

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

if (typeof fetch !== 'function') {
  console.error('[weather] FATAL: global fetch ontbreekt. Node 18+ vereist (huidige: ' + process.version + ').');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Aparte foutklasse voor "we weten niet waar" (geen locatie meegegeven, geocoding
// vond niets, postcode geweigerd, of WeatherAPI meldt expliciet "onbekende plaats").
// Onderscheid met een netwerk/API-fout is nodig zodat lookup() weet dat nogmaals
// proberen bij de andere provider geen zin heeft: een bevestigd onbekende plaats
// of geweigerde postcode vindt de andere provider ook niet.
class LocationNotFoundError extends Error {}

async function fetchOnce(url) {
  // AbortSignal.timeout pas vanaf Node 17.3; val terug op een handmatige timeout.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

// Open-Meteo deelt op Render een uitgaand IP en kan 429 geven. Kort opnieuw
// proberen met backoff; alleen voor 429 en 5xx. Drie pogingen omdat de geocoding
// hier volledig van afhangt: zie geocode().
async function fetchJson(url) {
  const delays = [600, 1500, 3000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(url);
    } catch (e) {
      const retryable = e.status === 429 || (e.status >= 500 && e.status < 600);
      if (!retryable || attempt >= delays.length) throw e;
      await sleep(delays[attempt]);
    }
  }
}

// Plaatsnamen veranderen niet van coördinaten: cache geocode-hits lang (24u) zodat
// niet elke vraag opnieuw het rate-limit-gevoelige Open-Meteo-geocoding-endpoint
// raakt (dat deelt hetzelfde IP-gebonden 429-risico als de forecast-endpoint, zie
// fetchJson hierboven). Alleen positieve hits cachen, geen null (anders blijft een
// tijdelijke miss hangen).
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 uur
const geoCache = new Map(); // genormaliseerde query (lowercase) -> { ts, geo }

// Plaats/postcode → { lat, lon, naam } of null.
async function geocode(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  const cacheKey = q.toLowerCase();
  const hit = geoCache.get(cacheKey);
  if (hit && (Date.now() - hit.ts) < GEO_CACHE_TTL_MS) return hit.geo;

  // language=de; geen country-filter zodat DE + AT (+ CH) plaatsnamen resolven.
  const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=1&language=de`;
  const data = await fetchJson(url);
  const geoHit = data && Array.isArray(data.results) ? data.results[0] : null;
  if (!geoHit) return null;
  const naam = [geoHit.name, geoHit.admin1].filter(Boolean).join(', ');
  const geo = { lat: geoHit.latitude, lon: geoHit.longitude, naam };
  geoCache.set(cacheKey, { ts: Date.now(), geo });
  return geo;
}

function dagLabel(i) {
  return i === 0 ? 'Heute' : i === 1 ? 'Morgen' : i === 2 ? 'Übermorgen' : `Tag ${i + 1}`;
}

// Cache de samenvatting per ~1km (2 decimalen) zodat herhaalde/nabije vragen
// niet steeds de weer-API raken (voorkomt 429 op het gedeelde Render-IP).
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const CACHE_MAX = 500; // harde bovengrens tegen onbegrensde groei
const cache = new Map(); // key -> { ts, text }

// Schrijf via deze helper i.p.v. cache.set: ruimt verlopen entries op en
// begrenst de omvang. Entries werden voorheen alleen gelezen en nooit
// verwijderd, waardoor de Map onbegrensd groeide bij unieke locaties.
function cacheSet(key, text) {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.ts >= CACHE_TTL_MS) cache.delete(k);
  }
  // Nog steeds vol (allemaal verse entries)? Gooi de oudste eruit
  // (Map itereert in insertion-volgorde).
  while (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { ts: now, text });
}

// Formatteert genormaliseerde data naar leesbare tekst voor de bot.
function format(plek, cur, days) {
  const lines = [`Aktuelles Wetter für ${plek}:`];
  if (cur) {
    lines.push(`Jetzt: ${Math.round(cur.temp)} Grad Celsius, ${cur.precip || 0} mm Niederschlag, Luftfeuchtigkeit ${Math.round(cur.hum)}%.`);
  }
  days.forEach((d, i) => {
    lines.push(
      `${dagLabel(i)}: ${Math.round(d.min)} bis ${Math.round(d.max)} Grad Celsius, ` +
      `Regenwahrscheinlichkeit ${d.rainProb ?? 0}%, ${d.precip ?? 0} mm Niederschlag.`
    );
  });
  return lines.join('\n');
}

// WeatherAPI.com: één call levert current + 3-daagse. Account-key (niet
// IP-gebonden), dus betrouwbaar vanaf Render. q = "lat,lon" of plaatsnaam.
async function viaWeatherApi({ plaats, postcode, lat, lon, key }) {
  const la = Number(lat), lo = Number(lon);
  const q = (Number.isFinite(la) && Number.isFinite(lo))
    ? `${la.toFixed(4)},${lo.toFixed(4)}`
    : String(plaats || postcode || '').trim();
  if (!q) throw new LocationNotFoundError('Kein Standort bekannt. Frag den Heimwerker nach einem Ortsnamen oder einer Postleitzahl.');
  // Deutsche Postleitzahl (5 Ziffern) NICHT an WeatherAPI durchreichen: "10115" (Berlin)
  // liefert dort New York, andere Postleitzahlen gar nichts. Rechtstreeks getest (juli
  // 2026): Open-Meteo's geocoding kent Duitse postcodes ook niet betrouwbaar (4 van de 5
  // testpostcodes, waaronder Berlin/Hamburg/Köln/Stuttgart, gaven geen enkel resultaat;
  // alleen München resolvde correct). Een omweg via Open-Meteo lost het dus niet op. Een
  // verkeerde plaats is erger dan geen, dus vragen we liever om een plaatsnaam. Greift nur
  // bei einer reinen Postleitzahl, niet bij ortsnamen met cijfers en niet bij lat/lon.
  if (/^\d{5}$/.test(q)) {
    throw new LocationNotFoundError('Für eine deutsche Postleitzahl kann ich das Wetter leider nicht zuverlässig abrufen. Nenn mir bitte den Ortsnamen, dann schaue ich es nach.');
  }

  const cacheKey = `wa:${q.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) return hit.text;

  const url = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&days=3&aqi=no&alerts=no&lang=de`;
  let data;
  try {
    data = await fetchJson(url);
  } catch (e) {
    // WeatherAPI antwoordt HTTP 400 bij een onbekende plaatsnaam ("no matching
    // location found"): dat is geen storing maar een verkeerde locatie. Geef
    // dezelfde Duitse melding als de Open-Meteo-route bij een mislukte geocode,
    // i.p.v. misleidend "Wetterdaten nicht verfügbar".
    if (e.status === 400) {
      throw new LocationNotFoundError(`Kein Standort gefunden für "${q}". Frag den Heimwerker nach einem Ortsnamen oder einer Postleitzahl.`);
    }
    throw e;
  }

  const loc = data.location || {};
  const plek = [loc.name, loc.region].filter(Boolean).join(', ') || q;
  const c = data.current || {};
  const cur = { temp: c.temp_c, precip: c.precip_mm, hum: c.humidity };
  const days = (data.forecast?.forecastday || []).map(fd => ({
    min: fd.day?.mintemp_c,
    max: fd.day?.maxtemp_c,
    rainProb: fd.day?.daily_chance_of_rain,
    precip: fd.day?.totalprecip_mm,
  }));

  const text = format(plek, cur, days);
  cacheSet(cacheKey, text);
  return text;
}

// Open-Meteo: gratis, geen key, maar IP-gebonden rate-limit (429 op gedeeld
// Render-IP). Fallback wanneer geen WEATHERAPI_KEY is gezet.
async function viaOpenMeteo({ plaats, postcode, lat, lon }) {
  let naam = null;
  let la = Number(lat);
  let lo = Number(lon);

  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    const q = String(plaats || postcode || '').trim();
    // Zelfde weigering als in viaWeatherApi (zie daar), en om dezelfde reden: een
    // Duitse postcode rechtstreeks aan geocode() geven levert bij Open-Meteo net zo
    // goed een verkeerde plaats op als bij WeatherAPI (rechtstreeks getest: "10115"
    // gaf hier zonder deze check New York City, niet Berlin). Zonder WEATHERAPI_KEY
    // komt een postcode altijd via deze functie binnen, dus de weigering moet hier
    // ook staan.
    if (/^\d{5}$/.test(q)) {
      throw new LocationNotFoundError('Für eine deutsche Postleitzahl kann ich das Wetter leider nicht zuverlässig abrufen. Nenn mir bitte den Ortsnamen, dann schaue ich es nach.');
    }
    const geo = await geocode(q);
    if (!geo) {
      throw new LocationNotFoundError(`Kein Standort gefunden für "${q}". Frag den Heimwerker nach einem Ortsnamen oder einer Postleitzahl.`);
    }
    la = geo.lat; lo = geo.lon; naam = geo.naam;
  }

  const cacheKey = `om:${la.toFixed(2)},${lo.toFixed(2)}`;
  const hit = cache.get(cacheKey);
  if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) return hit.text;

  const params = new URLSearchParams({
    latitude: la.toFixed(4),
    longitude: lo.toFixed(4),
    current: 'temperature_2m,precipitation,relative_humidity_2m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    forecast_days: '3',
    timezone: 'auto',
  });
  const data = await fetchJson(`${FORECAST_URL}?${params.toString()}`);

  const plek = naam || `Standort ${la.toFixed(2)}, ${lo.toFixed(2)}`;
  const c = data.current || {};
  const cur = { temp: c.temperature_2m, precip: c.precipitation, hum: c.relative_humidity_2m };
  const d = data.daily || {};
  const days = (Array.isArray(d.time) ? d.time : []).map((_, i) => ({
    min: d.temperature_2m_min[i],
    max: d.temperature_2m_max[i],
    rainProb: d.precipitation_probability_max[i],
    precip: d.precipitation_sum[i],
  }));

  const text = format(plek, cur, days);
  cacheSet(cacheKey, text);
  return text;
}

// { plaats?, postcode?, lat?, lon? } → leesbare weersamenvatting (3 dagen).
// Gebruikt WeatherAPI als WEATHERAPI_KEY gezet is, anders Open-Meteo.
// Faalt WeatherAPI (verlopen key/quota/429/timeout), dan proberen we ALTIJD
// eerst het keyloze Open-Meteo voordat we "nicht verfügbar" melden. Bij een
// bevestigde LocationNotFoundError (postcode geweigerd, of WeatherAPI/Open-Meteo
// vond de plaats echt niet) heeft de andere provider proberen geen zin: die
// vriendelijke melding gaat direct terug, zonder omweg.
async function lookup({ plaats, postcode, lat, lon } = {}) {
  const key = process.env.WEATHERAPI_KEY;
  const ctx = `plaats=${plaats || ''} postcode=${postcode || ''} lat=${lat ?? ''} lon=${lon ?? ''}`;
  if (key) {
    try {
      return await viaWeatherApi({ plaats, postcode, lat, lon, key });
    } catch (e) {
      if (e instanceof LocationNotFoundError) return e.message;
      console.error(`[weather] WeatherAPI faalde (${ctx}): ${e.name}: ${e.message}, val terug op Open-Meteo`);
    }
  }
  try {
    return await viaOpenMeteo({ plaats, postcode, lat, lon });
  } catch (e) {
    if (e instanceof LocationNotFoundError) return e.message;
    console.error(`[weather] lookup faalde via Open-Meteo (${ctx}): ${e.name}: ${e.message}`);
    // Geen e.message in de tool-output: die is Engels ("HTTP 400", "fetch
    // failed") en zou in het Duitse antwoord lekken. Details staan in de log.
    return 'Wetterdaten momentan nicht verfügbar. Berate auf Basis der allgemeinen Regeln.';
  }
}

// Anthropic tool-definitie.
const WEATHER_TOOL = {
  name: 'weather_lookup',
  description: 'Hole das AKTUELLE Wetter und die 3-Tage-Vorschau (Temperatur jetzt, min/max pro Tag, Regenwahrscheinlichkeit, Niederschlag). Nutze dies IMMER bei Fragen wie "kann ich heute reparieren", "kann ich jetzt draußen arbeiten", "wie ist das Wetter", oder wenn Regen oder Temperatur den Reparatur-Rat bestimmen (frische Reparatur darf während des Aushärtens nicht nass werden, Holz muss trocken sein). Gib lat und lon durch, wenn sie bekannt sind (geteilter Standort), sonst Ort oder Postleitzahl. Frag den Nutzer nicht nach Koordinaten.',
  input_schema: {
    type: 'object',
    properties: {
      plaats: { type: 'string', description: 'Ortsname, z. B. "Göppingen", "Berlin".' },
      postcode: { type: 'string', description: 'Postleitzahl oder die ersten Ziffern, z. B. "73033".' },
      lat: { type: 'number', description: 'Breitengrad des geteilten Standorts (falls bekannt).' },
      lon: { type: 'number', description: 'Längengrad des geteilten Standorts (falls bekannt).' },
    },
  },
};

// Runner voor de tool-registry. ctx.geo is de door de browser gedeelde locatie;
// gebruik die als het model zelf geen coördinaten of plaats meegaf.
function runWeatherTool(input = {}, ctx = {}) {
  const inp = { ...input };
  const geo = ctx.geo;
  if ((!Number.isFinite(Number(inp.lat)) || !Number.isFinite(Number(inp.lon))) &&
      geo && Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lon))) {
    inp.lat = Number(geo.lat);
    inp.lon = Number(geo.lon);
  }
  return lookup(inp);
}

module.exports = { lookup, geocode, LocationNotFoundError, WEATHER_TOOL, runWeatherTool };
