# Livegang Duitse chat op eazy-fix.nl/de (23 november 2026)

Alles staat klaar op de tak `nieuwe-site`. De huidige Duitse chat (main) blijft tot de livegang ongewijzigd.

## Al gedaan (11-11-2026)

- Kennis van de nieuwe site (eazy-fix.nl/de, preview) opgehaald: 55 pagina's, productlinks naar `/de/product/...`.
- Websitekoppeling van NL overgenomen: `/embed`, contextparameters, formulier na 3 foto's, smiley-beoordeling, video's, bolletjes, beveiligingskoppen.
- Supabase (project ozpnyfhzfptrhmopbbyq, waar ook NL staat): tabellen `chats_eazyfix_de`, `feedback_eazyfix_de`, `leads_eazyfix_de` en overzicht `smileys_de` voor Nina.
- Persona: garantieformulier, contactwegen, geen live chat met medewerker, verzendkosten 4,99 euro tot 50 euro.
- Winkelvragen gebruiken nu de winkelzoeker.
- Tests 224 groen, examenset 32/32, browsertest lokaal (vraag, 3 foto's, formulier, smiley).
- Inbouwhandleiding voor JKC: `docs/inbouw-website-jkc.md`.

## Nog nodig vóór 23 november

1. Antwoorden van Eazyfix (Nina):
   - Welk telefoonnummer voor Duitsland: 03222 1097923 (nu in de chat) of +31 85 201 201 1 (FAQ van de nieuwe site)?
   - Blijft eazy-fix.de bestaan of stuurt het door naar eazy-fix.nl/de? De chat noemt nu "eazy-fix.de" als webshop.
   - Duitse Mailchimp-lijsten (AI Chat en nieuwsbrief): de lijst-id's.
2. JKC: iframe op de Duitse site naar `https://eazyfix-bot-de.onrender.com/embed` (zie inbouwhandleiding) en de drie punten uit hoofdstuk 6 van die handleiding.
3. Vlak voor de livegang de kennis opnieuw ophalen (de site kan nog veranderen):
   `EZ_PREVIEW=<token> node scripts/pull-site.js` (na de livegang zonder token).

## Op 23 november (volgorde)

1. Render (srv-d99u7k57vvec738916kg), omgevingsvariabelen:
   - `SUPABASE_URL` en `SUPABASE_SERVICE_KEY` naar project ozpnyfhzfptrhmopbbyq (dezelfde waarden als de NL-bot).
   - `MAILCHIMP_API_KEY` (zelfde account als NL), `MAILCHIMP_LIST_AICHAT`, `MAILCHIMP_LIST_NIEUWSBRIEF` (Duitse lijsten).
   - `TELEGRAM_*` mag blijven (alleen het alarm bij het dagplafond, zonder gespreksinhoud).
2. Tak `nieuwe-site` samenvoegen met main en pushen (Render zet hem automatisch live).
3. Controleren: `/health` met x-health-key (kennisSite = https://www.eazy-fix.nl/de), een vraag via `/api/chat/stream` met prefix `livetest-`, de chat in de Duitse site openen.
4. Nina laten weten: overzicht `smileys_de` in Supabase.

## Let op

- De oude gesprekken van de Duitse chat staan in het oude Supabase-project (zywhyxcoxtqfnjsyjidr). Na het omzetten schrijft de chat in het nieuwe project; het oude blijft ongemoeid tot er een besluit is over verhuizen of wissen.
- Foto's van de Duitse chat komen in dezelfde (privé) bucket `chat-fotos` als NL; beide bots ruimen na 12 maanden op.
