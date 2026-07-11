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
- `MODEL` (optioneel) — standaard `claude-opus-4-8`.

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
