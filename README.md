# EAZYFIX bot (brein)

Zelfstandige chat-/analyse-service voor de EAZYFIX houtrot-bot. Levert de
endpoints die de EAZYFIX-app (en later de website) gebruiken.

## Lokaal draaien
1. `npm install`
2. Kopieer `.env.example` naar `.env` en vul `ANTHROPIC_API_KEY` in.
3. `npm start` (of `npm run dev` voor auto-herstart)
4. Testvenster: open `http://localhost:<PORT>/` in de browser.

## Omgevingsvariabelen
- `ANTHROPIC_API_KEY` (verplicht) — sleutel voor de AI.
- `APP_SECRET` (optioneel) — als gezet, eisen alle /api-calls de header `x-app-key`.
- `PORT` (optioneel) — luisterpoort; hostingplatforms zetten dit zelf.
- `MODEL` (optioneel) — standaard `claude-opus-5-5` (sinds 20-10-2026, daarvoor Opus 4.8).
  Denkstanden en het vangnet bij een weigering staan in `src/model.js`: tekstchat denkt
  kort (effort `low`), fotodiagnose op `xhigh`; weigert de veiligheidsfilter een vraag, dan
  probeert Anthropic hem server-side op een ander model (`fallbacks: 'default'`) en anders
  krijgt de Heimwerker een nette zin in plaats van een lege bubbel. Tests: `test/model.test.js`.
- `ALLOWED_ORIGIN` (optioneel) — komma-gescheiden lijst van websites die de API vanuit de
  browser mogen aanroepen; standaard de Render-host, `https://www.eazy-fix.de` en
  `https://eazy-fix.de`. localhost mag altijd.

## Bescherming tegen misbruik
Alle `/api/*`-routes zijn begrensd op ~20 aanvragen per minuut per bezoeker (IP), de
foto-analyse op 5 per minuut (melding als chatbubbel). Browsers mogen de API alleen
aanroepen vanaf de origins in `ALLOWED_ORIGIN` (herkomstcontrole); de native app stuurt
geen Origin en blijft werken. Achter Cloudflare + Render staat `trust proxy 2`, anders
telt de limiet per Cloudflare-adres in plaats van per bezoeker. Logica en tests:
`src/abuse-guard.js`, `test/abuse-guard.test.js`. Port van eazyfix-bot (cf9a663).

## Endpoints
- `GET /health` — status (geen sleutel nodig).
- `POST /api/chat` — chat (JSON).
- `POST /api/chat/stream` — chat met live meetypen (SSE).
- `POST /api/analyze-image` — foto-analyse; geeft `content`, `flow`, `productIds`.

## Bot bijschaven
De persoonlijkheid en kennis staan in `src/persona.js`. Pas alleen die teksten
aan om de bot bij te schaven; de servercode hoeft niet aangeraakt te worden.

## Deployen (voorbeeld: Render)
1. Push deze repo naar GitHub.
2. Render → New → Web Service → koppel de repo.
3. Build command: `npm install` · Start command: `npm start`.
4. Environment: zet `ANTHROPIC_API_KEY` en (optioneel) `APP_SECRET`. `PORT` zet
   Render zelf.
5. Na deploy krijg je een vast HTTPS-adres; gebruik dat in de app en het testvenster.
