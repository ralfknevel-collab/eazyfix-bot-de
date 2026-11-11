# Livegang Duitse chat op eazy-fix.nl/de (23 november 2026)

Alles staat klaar op de tak `nieuwe-site`. De huidige Duitse chat (main) blijft tot de livegang ongewijzigd.

## Al gedaan (11-11-2026)

- Kennis van de nieuwe site (eazy-fix.nl/de, preview) opgehaald: 55 pagina's, productlinks naar `/de/product/...`.
- Websitekoppeling van NL overgenomen: `/embed`, contextparameters, formulier na 3 foto's, smiley-beoordeling, video's, bolletjes, beveiligingskoppen.
- Supabase (project ozpnyfhzfptrhmopbbyq, waar ook NL staat): tabellen `chats_eazyfix_de`, `feedback_eazyfix_de`, `leads_eazyfix_de` en overzicht `smileys_de` voor Nina.
- Persona: garantieformulier, contactwegen, geen live chat met medewerker, verzendkosten 4,99 euro tot 50 euro.
- Winkelvragen gebruiken nu de winkelzoeker.
- Na codereview en iframe-test: productnamen in antwoorden zijn weer klikbaar (Duitse lijst), Duitse telefoonnummers klikbaar; assortiment gelijk aan de nieuwe site (geen All-in-One, wel One Shot; Fertigspachtel binnen en buiten).
- Tests 225 groen, examenset 32/32 (twee keer), browsertest lokaal (vraag, 3 foto's, formulier, smiley).
- Inbouwhandleiding voor JKC: `docs/inbouw-website-jkc.md`.

- Review 11-11 (REVIEW-CHATBOT-DE.md) verwerkt: webshop overal eazy-fix.nl/de, retour volgens de FAQ (30 dagen), geen geslacht raden, freesmarge 2 cm, één naam (KI-Heimwerkerberater), inhoud van de sets, kinderen en föhn, foto zonder winkelzoeker, muurfoto's naar de Fertigspachtel, 35 Duitse video's van @eazyfix-de, Duitse HTML-teksten. Tests 228, examenset 32/32.

## Nog nodig vóór 23 november

1. Antwoorden van Eazyfix (Nina):
   - Welk telefoonnummer voor Duitsland: 03222 1097923 (nu in de chat) of +31 85 201 201 1 (FAQ van de nieuwe site)?
   - Blijft eazy-fix.de bestaan? De chat noemt nu "eazy-fix.nl/de" als webshop (werkt in beide gevallen); wil Eazyfix liever eazy-fix.de, dan is dat één vervanging in src/persona.js.
   - Oostenrijk (nu: via eazy-fix.nl/de, 9,32 euro) en Zwitserland (nu: via de Oostenrijkse site, 17,78 euro): de binnendienst bevestigde dit in juli 2026, de oudere chats zeggen eazy-fix.at en geen Zwitserland. Graag nog één keer bevestigen.
   - Korting via de nieuwsbrief (10 procent?), MDF/multiplex, temperatuurregel, maximale laagdikte (site: 5 tot 20 mm, daarboven een nieuw stuk hout).
   - Bevestigingsmail op de lijst "Eazyfix Newsletter [de]": Duitse tekst, net als Nina voor NL heeft gemaakt.
2. JKC: iframe op de Duitse site naar `https://eazyfix-bot-de.onrender.com/embed` (zie inbouwhandleiding) en de drie punten uit hoofdstuk 6 van die handleiding.
3. Vlak voor de livegang de kennis opnieuw ophalen (de site kan nog veranderen):
   `EZ_PREVIEW=<token> node scripts/pull-site.js` (na de livegang zonder token).

## Op 23 november (volgorde)

1. Render (srv-d99u7k57vvec738916kg), omgevingsvariabelen:
   - `SUPABASE_URL` en `SUPABASE_SERVICE_KEY` naar project ozpnyfhzfptrhmopbbyq (dezelfde waarden als de NL-bot).
   - `MAILCHIMP_API_KEY` (zelfde sleutel als NL). De lijsten staan als standaard in de code (besluit Nina 11-11): AI Chat met label "Land: DE" en "Eazyfix Newsletter [de]" met Landcode DE.
   - `TELEGRAM_*` mag blijven (alleen het alarm bij het dagplafond, zonder gespreksinhoud).
2. Tak `nieuwe-site` samenvoegen met main en pushen (Render zet hem automatisch live).
3. Controleren: `/health` met x-health-key (kennisSite = https://www.eazy-fix.nl/de), een vraag via `/api/chat/stream` met prefix `livetest-`, de chat in de Duitse site openen.
4. Nina laten weten: overzicht `smileys_de` in Supabase.

## Let op

- De oude gesprekken van de Duitse chat staan in het oude Supabase-project (zywhyxcoxtqfnjsyjidr). Na het omzetten schrijft de chat in het nieuwe project; het oude blijft ongemoeid tot er een besluit is over verhuizen of wissen.
- Foto's van de Duitse chat komen in dezelfde (privé) bucket `chat-fotos` als NL; beide bots ruimen na 12 maanden op.
