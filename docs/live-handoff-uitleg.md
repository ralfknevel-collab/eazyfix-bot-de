# Live doorverbinden met een collega — uitleg

> Overlegdocument. Nog niets gebouwd. Bedoeld om samen met de collega te bespreken
> en de open keuzes te maken.

## Wat houdt het in?

Als de bot een vraag niet kan beantwoorden, verbindt hij de klant **live door naar
een collega** — in hetzelfde chatvenster. Is er niemand beschikbaar, dan vraagt de
bot om contactgegevens zodat de collega later terugbelt.

## Wat de klant merkt

- Klant chat gewoon met de bot.
- Weet de bot het antwoord niet, dan zegt hij: *"Momentje, ik haal er een collega bij."*
- De klant blijft in **hetzelfde chatvenster** — geen nieuw scherm, geen app. De
  collega typt gewoon mee, alsof de bot een mens werd.
- Is er **niemand beschikbaar** (na een paar minuten), dan vraagt de bot om naam +
  telefoon/e-mail, zodat de collega later terugbelt.

## Wat de collega merkt

- De collega heeft een **eigen webpagina (dashboard)**, afgeschermd met één wachtwoord.
- Komt er een klant die hulp nodig heeft, dan **piept** het dashboard en verschijnt
  er een teller.
- Collega opent het gesprek, ziet **het hele gesprek tot dan toe** (zodat hij weet
  waar het over gaat), en typt antwoorden terug.
- Belangrijk: **het dashboard moet openstaan** om live mee te kunnen typen. Staat het
  dicht, dan vangt de bot het op met "laat je gegevens achter".

## Wie doet wat (keuzes die we al maakten)

| Onderwerp | Keuze |
|---|---|
| Wanneer overdragen | **Bot beslist zelf** als hij het niet weet (geen knop voor de klant) |
| Waar collega typt | **Eigen webdashboard** met wachtwoord |
| Klant-scherm | Blijft **hetzelfde chatvenster** |
| Niemand online | Eerst even wachten, dan **contactgegevens vragen** |
| Collega gewaarschuwd via | **Geluid + teller** in dashboard |

## Wat het praktisch van jullie vraagt

- Iemand moet het dashboard **openhebben** tijdens "kantooruren" om live te kunnen
  reageren. Anders wordt het terugbel-werk.
- Afspraak nodig: **wie** kijkt op het dashboard, en **wanneer**?
- Buiten die uren: bot verzamelt contactgegevens → jullie bellen terug.

## Beperkingen / eerlijk

- **Niet 24/7 live** zonder dat iemand het scherm openhoudt. Een telefoon-melding
  (bijv. Telegram) zou dat oplossen, maar dat kozen we (nog) niet.
- Berichten komen via "elke 2 seconden checken" — voelt live, maar is geen
  seconde-precieze realtime. Voor klantenservice ruim genoeg.
- Eén gedeeld wachtwoord voor het dashboard — prima voor 1-2 personen, niet voor een
  groot team.

## Nog te beslissen (bespreek met collega)

1. **Wachttijd** voor "niemand bereikbaar" → 3 minuten oké, of korter/langer?
2. **Wie + wanneer** zit achter het dashboard?
3. Later toch een **telefoon-melding** (Telegram) willen, zodat het dashboard niet
   open hoeft?

## Hoe het technisch ongeveer werkt (voor de nieuwsgierige)

- Nieuwe webpagina voor de collega (dashboard) + aanpassing aan het bestaande
  chatvenster (live-modus).
- Gesprekken + berichten worden opgeslagen in **Supabase** (gebruiken we al voor
  logging/feedback). Twee nieuwe tabellen.
- De bot krijgt er een "knop" bij (interne tool) waarmee hij zelf besluit door te
  verbinden.
- Geen extra dienst of abonnement nodig; werkt op de huidige server.
