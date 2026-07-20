# Actieoverzicht: waar bot en mens verschillen

Werkoverzicht bij de analyse van 268 live-chatgesprekken (juni 2024 – juni 2026).
Geordend naar wat ermee te doen valt, niet naar onderwerp: blok A, B en D kun je
zelf aanpassen, blok C moet eerst langs de binnendienst.
Volledige onderbouwing met chat-id's staat in `chatanalyse-DE-2026-07.md`.

---

## A. De mens wist iets dat de bot niet weet → kennis toevoegen

Feiten die meerdere keren en over meerdere jaren consistent door medewerkers zijn
gegeven. Deze kunnen zonder verdere verificatie de kennisbank in.

| Onderwerp | Wat de mens zei | Wat de bot nu doet | Waar aanpassen |
|---|---|---|---|
| Levertijd DE | 3 tot 5 werkdagen, verzending vanuit NL, geen express | weet niets, moet doorverwijzen | `kennis-extra.json` |
| Hoeveelheid | L × B × D in cm ÷ 150 = aantal kokers; 1 koker ≈ vuistgroot gat | kent alleen "150 ml" | `kennis-extra.json` + foto-flow |
| Tweede laag | uitgeharde laag eerst schuren, anders hecht hij niet | zegt alleen "in lagen opbouwen" | `kennis-extra.json` + stappenplan |
| Temperatuur | per 10 °C kouder verdubbelt de droogtijd; verwerken 0-30 °C; uitgehard vorstbestendig | noemt alleen "ca. 4 uur" | `persona.js` + `kennis-extra.json` |
| 24-uursvenster | impregnering langer dan 24 uur onbedekt = opnieuw frezen | onbekend | `kennis-extra.json` + stappenplan |
| Ondergronden | hecht op alles behalve kunststof; MDF en multiplex kunnen wel; niet tegen glas | onbekend | `kennis-extra.json` |
| Houdbaarheid | aangebroken koker minstens 1 jaar; componenten reageren pas na mengen | onbekend | `kennis-extra.json` |
| Grote schade | stuk hout inlijmen, rondom minstens 5 mm spachtelmasse | adviseert laag-op-laag vullen | `persona.js` foto-flow |
| Nabewerken | uitgehard is te boren, schroeven en beitelen | onbekend | `kennis-extra.json` |
| Frees | schacht 3 mm, kop 6 mm, alleen roterend (niet oscillerend) | kent alleen "30.000 t/min" | `kennis-extra.json` |
| Kitpistool | elk gangbaar stevig pistool volstaat | onbekend | `kennis-extra.json` |
| Te dun aangebracht | "hardt alleen uit als het massa maakt" | noemt de grens, niet de reden | `kennis-extra.json` |
| Retour | 30 dagen, portaal MontaReturns, sets alleen compleet retour | onbekend | `kennis-extra.json` |
| Korting | nieuwsbrief geeft eenmalig 10 %; geen volumekorting | onbekend | `kennis-extra.json` |
| Landen | AT → eazy-fix.at, FR → .fr, BE → .be, NL → .nl, geen levering CH | onbekend | `persona.js` |

---

## B. De mens deed iets dat de bot niet mag of kan → escalatieregel

Hier is het verschil principieel: de mens had toegang en bevoegdheid, de bot niet.
Zonder expliciete regel gaat de bot dit improviseren. Bijna drie op de tien
gesprekken bevatten minstens één van deze signalen.

| Wat de mens deed | Wat de bot moet doen |
|---|---|
| orderstatus opzoeken, bestelnummers en klantnamen noemen | bestelnummer uitvragen, doorverwijzen, nooit gegevens tonen |
| "gaat vandaag nog de deur uit" | alleen de algemene indicatie, nooit een garantie |
| gratis producten en terugbetaling toezeggen | begrip tonen, gegevens verzamelen, escaleren |
| btw-teruggave bevestigen | altijd naar de binnendienst |
| terugbellen of zelf mailen | telefoonnummer en e-mailadres geven, links in de chat zetten |
| winkelvoorraad bevestigen | verkooppunt noemen plus advies om vooraf te bellen |
| interne acties beloven ("ik pas de site aan") | melding aannemen en doorgeven, meer niet |
| webshopstoring live meekijken | URL en foutmelding uitvragen, gebundeld doorsturen |

---

## C. Mens en bot spreken elkaar tegen → eerst beslissen

Niets hiervan doorvoeren voordat het bevestigd is.

| Punt | Wat de chats zeggen | Wat de bot nu zegt | Type |
|---|---|---|---|
| uithardtijd | 3 uur | 4 uur | feit, laten vaststellen |
| freesmarge | 0,5 cm extra | 2 cm extra | feit, laten vaststellen |
| verzendkosten | "onder 50 € gratis" | niets | vermoedelijk verspreking |
| levertijd | 2-4 werkdagen (2024) tegenover 3-5 (2025+) | niets | actualiseren |
| kleur pasta | okergeel tegenover lichtbeige | niets | feit |
| telefoonnummer | Duits nummer 03222 1097 923 | Nederlands +31 85 201 201 1 | beleidskeuze |
| inkleuren | externe merken genoemd | alleen eigen Abtönkonzentrat | beleidskeuze |
| Duitse winkels | 2024 wel, 2025 niet | 29 verkooppunten in de data | commerciële vraag |

---

## D. Fouten die in de bot zelf zitten → gewoon repareren

Dit is geen mens-versus-bot maar techniek, en het doet nu actief schade.

1. **Postcode-zoeken werkt niet.** In `verkooppunten.js` wordt alleen op het veld
   `zip` gezocht, maar 25 van de 29 Duitse verkooppunten hebben dat veld leeg.
   Een Duitse klant die zijn postcode intypt vindt daardoor nooit een
   Hornbach-filiaal, ook niet als dat in zijn eigen stad staat. De regex is
   bovendien nog op de Nederlandse postcodevorm gebouwd, en er is geen
   afstandsgrens: vandaar de klant die een verkooppunt op 350 km aangewezen kreeg.
2. **De productpagina spreekt de prompt tegen.** De pagina zegt "Reparaturen von
   5 bis 20 mm Tiefe" als totale diepte, terwijl de prompt zegt dat er geen
   maximum is en je dieper in lagen opbouwt. Omdat de prompt de website leidend
   verklaart, kan de bot zichzelf tegenspreken bij precies de vraag waar klanten
   mee zitten.
3. **Twee telefoonnummers in één bot.** Drie kennispagina's noemen het Duitse
   nummer, de prompt schrijft het Nederlandse voor.
4. **57 Nederlandse video's in de zoekindex.** Onschadelijk bij Duitse vragen,
   maar de 68 volledig Nederlandse gesprekken trekken ze wel omhoog, ten koste van
   echte tekstkennis.
5. **Ontbrekende zoekwoorden.** Levering, retour, houdbaarheid, verbruik en
   plaatmateriaal ontbreken, net als de Nederlandse spreektaal die op de Duitse
   bot binnenkomt: houtrotvuller, houtversterker, plamuur, koker, spaanplaat.

---

## E. Waar de bot het nu al beter doet dan de mens

Dit hoef je niet te bouwen, maar het is goed om te weten wat de winst is.
De bot is er 's avonds en in het weekend, en juist daar bleven per analysedeel
vijf tot acht gesprekken volledig onbeantwoord. Hij spreekt Frans en Engels
foutloos, terwijl meerdere Franstalige klanten nooit antwoord kregen. En hij
maakt geen taal- of machinevertaalfouten zoals "Rassen" in plaats van "Risse".

Wat je juist van de mens moet overnemen: eerst één of twee gerichte vragen
stellen voordat je een product noemt, en eerlijk zijn als iets niet zinvol is.
Alle vijfsterrenbeoordelingen volgden op dat patroon.

Drie regels komen rechtstreeks uit de laagste beoordelingen:
geef eerst het antwoord en pas daarna een link, laat een "nee" nooit kaal staan
maar noem reden en alternatief, en ontken nooit dat je een bot bent.

---

## Voorgestelde volgorde

**Zonder overleg te doen:** de postcode-fix, de synoniemgroepen, de
escalatieregels uit blok B en de drie promptregels uit blok E.

**Zodra blok C beantwoord is:** de kennis-entries uit blok A toevoegen en de
foto-flow bijwerken.

**Als testset:** de vragen die in de chats onbeantwoord bleven zijn de beste
uitbreiding van `eval/cases.js` die je kunt hebben — koker openen, tweede laag,
houdbaarheid, levertijd, kitpistool.
