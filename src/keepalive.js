// Houdt de Render-instance wakker. Render (free/starter) zet de service in
// slaapstand na ~15 min zonder inkomend verkeer; de eerste vraag daarna moet
// 'm eerst wakker maken en kan dan afhaken (bv. een weer-lookup die over de
// timeout gaat) -> "kan even niet ophalen". Deze zelf-ping raakt elke ~10 min
// de eigen /health, zodat Render continu verkeer ziet en niet inslaapt.
//
// Draait alleen live: Render zet automatisch RENDER_EXTERNAL_URL. Lokaal is die
// er niet, dus dan doet dit niets. /health is publiek (geen x-app-key nodig).

const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 min, ruim onder Render's ~15-min slaapdrempel
const PING_TIMEOUT_MS = 15000;

function startKeepAlive() {
  const base = process.env.RENDER_EXTERNAL_URL;
  if (!base) {
    console.log('Keep-alive:    ○ uit (geen RENDER_EXTERNAL_URL — lokaal/niet-Render)');
    return null;
  }
  if (typeof fetch !== 'function') {
    console.warn('Keep-alive:    ○ uit (global fetch ontbreekt; Node 18+ vereist)');
    return null;
  }
  const url = `${base.replace(/\/$/, '')}/health`;
  console.log(`Keep-alive:    ✓ aan (ping ${url} elke ${PING_INTERVAL_MS / 60000} min)`);

  const timer = setInterval(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) console.warn(`[keepalive] ping ${url} -> HTTP ${resp.status}`);
    } catch (e) {
      console.warn(`[keepalive] ping faalde: ${e.name}: ${e.message}`);
    } finally {
      clearTimeout(t);
    }
  }, PING_INTERVAL_MS);

  // Blokkeer een nette shutdown niet op deze timer.
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = { startKeepAlive };
