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

- Ook gedaan (11-11, avond): tak `nieuwe-site` staat op GitHub (nep-testsleutel in stukken voor de push-beveiliging), tweede videokaartje alleen over hetzelfde onderdeel, lengteregel foto als laatste blok, muurfoto en gedeelde locatie getest, privacylink naar /de/datenschutzerklaerung/, Duitse privacytekst voor de chat in `docs/datenschutz-chat-eazyfix-de.md`.

## Nog nodig vóór 23 november

1. Antwoorden van Eazyfix (Nina), beantwoord 12-11-2026 en verwerkt (main 8f40afb en de9f99f):
   - Telefoon 03222 1097923 (stond al zo in de chat; Nina past blogs en FAQ aan).
   - Adres wordt eazy-fix.de; eazy-fix.nl/de is alleen de testomgeving tot de overstap op 23 november. Zie stap 2a hieronder.
   - Oostenrijk: eigen webshop eazy-fix.at; Zwitserland bestelt ook via eazy-fix.at (17,78 euro, UPS).
   - Nieuwsbrief geeft eenmalig een kortingscode van 10 procent (staat in de chat en bij het vinkje).
   - Holzspachtelmasse hecht op MDF en multiplex; dieper dan 2 cm kan in lagen of met een nieuw stuk hout (stond al zo).
   - De 10 procent geldt NIET voor de Nederlandse nieuwsbrief (Ralf 12-11); de NL-bot noemt geen korting.
   - Bevestigingsmail op de lijst "Eazyfix Newsletter [de]": Duitse tekst, net als Nina voor NL heeft gemaakt.
2. JKC: iframe op de Duitse site naar `https://eazyfix-bot-de.onrender.com/embed` (zie inbouwhandleiding). De punten over de site zelf (winkelpagina met NL-winkels, live chat in de FAQ, twee telefoonnummers, NL-webinar op de productpagina) liggen bij Nina.
3. Privacy: de Duitse privacyverklaring noemt de chat nog niet; voorstel in `docs/datenschutz-chat-eazyfix-de.md` (bij Nina of wie de verklaring beheert).
4. Vlak voor de livegang de kennis opnieuw ophalen (de site kan nog veranderen):
   `EZ_PREVIEW=<token> node scripts/pull-site.js` (na de livegang zonder token).

## Op 23 november (volgorde)

1. Render (srv-d99u7k57vvec738916kg), omgevingsvariabelen:
   - `SUPABASE_URL` en `SUPABASE_SERVICE_KEY` naar project ozpnyfhzfptrhmopbbyq (dezelfde waarden als de NL-bot).
   - `MAILCHIMP_API_KEY` (zelfde sleutel als NL). De lijsten staan als standaard in de code (besluit Nina 11-11): AI Chat met label "Land: DE" en "Eazyfix Newsletter [de]" met Landcode DE.
   - `TELEGRAM_*` mag blijven (alleen het alarm bij het dagplafond, zonder gespreksinhoud).
2. Tak `nieuwe-site` samenvoegen met main en pushen (Render zet hem automatisch live).
2a. Overstap naar eazy-fix.de (zodra de nieuwe site daar draait): eerst controleren welke paden werken (staan de pagina's op eazy-fix.de/garantieformular/, /kontakt/, /product/... dus zonder /de/?). Daarna in src/ en public/ alle "eazy-fix.nl/de" vervangen door "eazy-fix.de" (ongeveer 110 plekken: persona, kennisbron in kennis.js, kennis-extra.json, producten.js, verkooppunten.js, lead.js, context.js, index.js), de kennis opnieuw ophalen van eazy-fix.de, tests draaien, een paar links uit de antwoorden aanklikken en pushen. eazy-fix.de staat al in de toegestane websites (abuse-guard.js), dus het iframe werkt daar zonder extra instelling.
2b. Direct naar de juiste pagina linken (port eazyfix-bot b175fa0, 12-11): in de NL-bot staat een vaste lijst PAGINA'S OP DE SITE in src/persona.js plus korte links in linkifySite. Na stap 2a de paden van eazy-fix.de uit de page-sitemap halen, elke pagina op 200 controleren, de lijst in het Duits overnemen en met een paar echte vragen testen (Verkaufsstellen, Versand, Rücksendung, Zahlung, Garantie, Kontakt).
3. Controleren: `/health` met x-health-key (kennisSite = https://www.eazy-fix.de na stap 2a), een vraag via `/api/chat/stream` met prefix `livetest-`, de chat in de Duitse site openen.
4. Nina laten weten: overzicht `smileys_de` in Supabase.

## Let op

- De oude gesprekken van de Duitse chat staan in het oude Supabase-project (zywhyxcoxtqfnjsyjidr). Na het omzetten schrijft de chat in het nieuwe project; het oude blijft ongemoeid tot er een besluit is over verhuizen of wissen.
- Foto's van de Duitse chat komen in dezelfde (privé) bucket `chat-fotos` als NL; beide bots ruimen na 12 maanden op.
