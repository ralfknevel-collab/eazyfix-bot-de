// Tests voor de weer-lookup zonder netwerk (global fetch wordt gemockt):
// - WeatherAPI-fout → fallback naar Open-Meteo i.p.v. direct "nicht verfügbar"
// - WeatherAPI HTTP 400 (onbekende plaats) → nette Kein-Standort-melding
// - Beide bronnen falen → neutrale Duitse melding zonder Engelse e.message
// - Duitse postcode (5 cijfers) wordt geweigerd zonder enige netwerkcall (rechtstreeks
//   getest: Open-Meteo's geocoding resolvt Duitse postcodes onbetrouwbaar)
// - geocode() cachet: tweede aanvraag voor dezelfde plaats doet geen nieuwe fetch

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const weather = require('../src/weather');

const realFetch = global.fetch;
const realKey = process.env.WEATHERAPI_KEY;

function mkResp(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// Minimale geldige Open-Meteo forecast-respons.
const openMeteoBody = {
  current: { temperature_2m: 18.4, precipitation: 0, relative_humidity_2m: 60 },
  daily: {
    time: ['2026-07-15', '2026-07-16', '2026-07-17'],
    temperature_2m_min: [10, 11, 12],
    temperature_2m_max: [20, 21, 22],
    precipitation_probability_max: [10, 20, 30],
    precipitation_sum: [0, 1, 2],
  },
};

beforeEach(() => {
  process.env.WEATHERAPI_KEY = 'test-key';
});

afterEach(() => {
  global.fetch = realFetch;
  if (realKey === undefined) delete process.env.WEATHERAPI_KEY;
  else process.env.WEATHERAPI_KEY = realKey;
});

test('WeatherAPI-fout (401, verlopen key) valt terug op Open-Meteo', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('weatherapi.com')) return mkResp(401, { error: { message: 'API key invalid' } });
    return mkResp(200, openMeteoBody);
  };
  // Unieke lat/lon per test zodat de module-cache niet in de weg zit.
  const out = await weather.lookup({ lat: 50.11, lon: 8.68 });
  assert.match(out, /Aktuelles Wetter für/);
  assert.match(out, /18 Grad Celsius/);
  assert.ok(!out.includes('nicht verfügbar'), 'Open-Meteo werkte, dus geen storing melden');
});

test('WeatherAPI HTTP 400 (onbekende plaats) geeft Kein-Standort-melding', async () => {
  global.fetch = async (url) => {
    assert.ok(String(url).includes('weatherapi.com'), 'bij 400 mag er geen Open-Meteo-fallback komen');
    return mkResp(400, { error: { message: 'No matching location found.' } });
  };
  const out = await weather.lookup({ plaats: 'Xyzstadt' });
  assert.match(out, /Kein Standort gefunden für "Xyzstadt"/);
  assert.ok(!out.includes('nicht verfügbar'), 'verkeerde plaats is geen storing');
});

test('beide bronnen falen: neutrale Duitse melding, geen Engelse e.message', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('weatherapi.com')) return mkResp(401, {});
    return mkResp(404, {});
  };
  const out = await weather.lookup({ lat: 51.0, lon: 9.0 });
  assert.match(out, /Wetterdaten momentan nicht verfügbar\. Berate auf Basis der allgemeinen Regeln\./);
  assert.ok(!out.includes('HTTP'), 'Engelse foutdetails horen alleen in de serverlog');
  assert.ok(!out.includes('fetch'), 'Engelse foutdetails horen alleen in de serverlog');
});

test('zonder WEATHERAPI_KEY gaat de lookup direct via Open-Meteo', async () => {
  delete process.env.WEATHERAPI_KEY;
  let weatherApiCalled = false;
  global.fetch = async (url) => {
    if (String(url).includes('weatherapi.com')) weatherApiCalled = true;
    return mkResp(200, openMeteoBody);
  };
  const out = await weather.lookup({ lat: 52.52, lon: 13.4 });
  assert.match(out, /Aktuelles Wetter für/);
  assert.strictEqual(weatherApiCalled, false);
});

test('Duitse postcode (5 cijfers) wordt geweigerd zonder enige netwerkcall', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return mkResp(200, {}); };
  const out = await weather.lookup({ postcode: '10115' });
  assert.match(out, /Postleitzahl.*nicht zuverlässig/);
  assert.ok(!out.includes('nicht verfügbar'), 'geweigerde postcode is geen storing');
  assert.strictEqual(calls, 0, 'postcode wordt vooraf geweigerd, geen Open-Meteo-omweg');
});

test('Duitse postcode wordt ook geweigerd zonder WEATHERAPI_KEY (Open-Meteo-route)', async () => {
  delete process.env.WEATHERAPI_KEY;
  let calls = 0;
  global.fetch = async () => { calls++; return mkResp(200, { results: [{ name: 'New York City', admin1: 'New York', latitude: 40.7, longitude: -74.0 }] }); };
  const out = await weather.lookup({ postcode: '10115' });
  assert.match(out, /Postleitzahl.*nicht zuverlässig/);
  assert.ok(!out.includes('New York'), 'postcode mag nooit een verkeerde plaats opleveren');
  assert.strictEqual(calls, 0, 'postcode wordt vooraf geweigerd, geen geocode-call');
});

test('geocode cachet: tweede aanvraag voor dezelfde plaats doet geen nieuwe fetch', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return mkResp(200, { results: [{ name: 'Musterstadt', admin1: 'Bayern', latitude: 48.1, longitude: 11.5 }] }); };
  const geo1 = await weather.geocode('Musterstadt-Cache-Test');
  const geo2 = await weather.geocode('Musterstadt-Cache-Test');
  assert.ok(geo1);
  assert.ok(geo2);
  assert.equal(calls, 1);
});
