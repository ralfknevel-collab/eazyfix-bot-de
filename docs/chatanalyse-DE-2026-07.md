# Analyse live-chat DE (jun 2024 – jun 2026) → verbeteringen voor de bot

Bron: `Chatgeschiedenis DE.xml`, 268 gesprekken, 3.510 berichten waarvan 1.417 van
klanten. Periode 2024-06-03 t/m 2026-06-23. Geanalyseerd in 8 delen door aparte
analyse-agents plus een onafhankelijke tweede pass; alle bevindingen zijn
terug te voeren op een chat-id.

Status: concept. Alles onder "Te verifiëren" mag NIET in de bot voordat de
binnendienst/Repair Care het bevestigt. De bot mag niets verzinnen; een
onbevestigd feit uit een chat is nog geen kennis.

---

## 1. Wat de cijfers zeggen

Onderwerpverdeling (regex-telling over klantberichten, chats kunnen meetellen in
meerdere categorieën):

| onderwerp | chats | dekt de bot dit nu? |
|---|---|---|
| techniek/verwerking | 42 | deels — stappenplan wel, detailregels niet |
| levering/bestelling | 38 | **nee** |
| productkeuze | 32 | ja |
| kleur/afwerking | 23 | deels |
| houtsoort/ondergrond | 19 | **deels — hechtingsgrenzen ontbreken** |
| verkooppunten | 17 | ja (tool), maar zie §4.2 |
| factuur/betaling | 13 | deels |
| prijs/korting | 13 | deels — nieuwsbriefkorting ontbreekt |
| houdbaarheid/aangebroken koker | 12 | **nee** |
| B2B/handelaar | 9 | deels — MoreApp-route ontbreekt |
| garantie | 7 | **nee** |
| retour/klacht | 6 | **nee** |

Taal: 131 gesprekken alleen Duits, **68 alleen Nederlands**, 27 gemengd, plus
losse Franse en Engelse gesprekken. Referer: 125× Google, 27× eazy-fix.**nl**,
25× eazy-fix.de. De DE-chat krijgt dus structureel NL-, FR- en EN-verkeer.

Belangrijkste patroon over alle 8 delen heen: **het grootste faalpunt van de
menselijke chat was niet de kwaliteit maar de beschikbaarheid.** In elk deel
bleven 5 tot 8 gesprekken volledig onbeantwoord omdat ze buiten kantooruren
binnenkwamen. Meerdere daarvan waren triviaal beantwoordbaar
("wie bekomme ich die Kartusche auf", coZ4wswyX5vaV; "hoe droog moet het hout
zijn", cozOLSJr-JuQH). Dat is precies de winst die de 24/7-bot pakt, mits de
kennis klopt.

---

## 2. Kennis die de mens gaf en die de bot NIET heeft

Gesorteerd op hoe vaak het terugkwam. Dit zijn kandidaat-entries voor
`kennis-extra.json`.

### 2.1 Bevestigd door meerdere gesprekken (hoge prioriteit)

1. **Levering DE: 3 tot 5 werkdagen, verzending vanuit Nederland, geen express.**
   Genoemd in minstens 12 gesprekken verspreid over twee jaar: coCEf5GtyBp6B,
   coYZZPrs1zkMX, cow-Qr0ozZVEZ, cohjjlXW2YGs7, colmrk32LU0ym, co2WcV4dKJTyJ,
   coR4a9ZW-2MM1, co_7DjVT16n-E, coxzpTZic6H7l, coNkQzYjVoOae, copO3LM5DHhv.
   Let op: in 2024 zei de agent "2 bis 4 Arbeitstage" (colNhUaLLittPi,
   coqodqEeMFlYz), vanaf 2025 consequent "3 bis 5".
2. **In Duitsland geen fysieke winkelverkoop; alleen eazy-fix.de of Amazon.de.**
   coUb5pDtcZkkj, coYZZPrs1zkMX, coR4a9ZW-2MM1, coKEZDo0K67b, coNkQzYjVoOae,
   cowjW61e8ZLAK. Dit is de belangrijkste correctie op het huidige botgedrag,
   zie §4.2.
3. **Hoeveelheidsberekening: lengte × breedte × diepte in cm gedeeld door 150 =
   aantal kokers.** Vuistregel-variant: één koker (150 ml) vult een gat "zo groot
   als een vuist". coEQdnEyvrwlpO, coMYkTzFunYJx, co6XMjG0yUS0h, co_7DjVT16n-E,
   conAHpL3kxv3Q, co06CSFSmSQUK. Klanten bestelden nu te weinig
   ("Starterset reichte bei weitem nicht", co9qAOO9m1nx).
4. **Tussen twee lagen spachtelmasse altijd de uitgeharde laag schuren.** Zonder
   schuren hecht de volgende laag niet (er vormt zich een toplaag bij uitharden).
   covBZpaj854Igq, cop9XOvpbBkpD, coJEjLp_4_hskK, co47CzSs5l8rH, co5uuZ2Jsm2jy,
   co6XMjG0yUS0h, cokOEpN7D_Rsk, coOprNO8us7N4, cor9fDhLQpf2TT. Zeer vaak
   gevraagd, één keer onbeantwoord gebleven.
5. **Epoxy hecht op vrijwel alles behalve kunststof/plastic** (PVC, melamine) en
   niet tegen glas. MDF en multiplex kunnen wel. Daarom is het mengplateau van
   plastic en hecht de epoxy niet aan de modelleerstrips. coqlyKDfi4JM6,
   coxaMgAdvOKTL, coCPHbFuET-Y-, co-V0DtNaKv1, co5AODC_DBpWQh, co7cqW0sDLql0.
6. **Aangebroken koker is met dop erop minstens een jaar houdbaar**; de
   componenten drogen niet uit omdat ze pas na mengen reageren. Een losgeraakte
   dop tijdens transport is dus onschadelijk. covBZpaj854Igq, coy_QYYHt7S-Y,
   coO5r7DMyGEBj, coAoV8TRuH23J, co_bZnYyVmDEY, coivCG194Dr18, coqlyKDfi4JM6.
7. **Bij grote of diepe schade: stuk nieuw hout inlijmen (deelvervanging)** in
   plaats van laag op laag vullen; rondom minstens 5 mm spachtelmasse. Genoemd in
   ruim tien gesprekken: covBZpaj854Igq, cop9XOvpbBkpD, co443Hg8KC0da,
   coOi_xSM-go9iL, coEVJXkCIq24Be, coj1xH6TtGkoh, codd8zID34mDc, cowcXDaplNBVe,
   co-wCOOlvF1Ez, cossNebiKW3N3, codzgYiqdTY5el, cor9fDhLQpf2TT, coSXjhMSvq3Gj,
   coEtVj-_5Kd3k, cowjW61e8ZLAK, coEQdnEyvrwlpO.
8. **De Feinspachtel heeft geen Holzimprägnierung nodig** en gaat direct op kaal,
   schoon, droog hout; alleen de Holzspachtelmasse vraagt voorbehandeling.
   cowRftkBC5VYJ, co47CzSs5l8rH, coL_-HGfNO2LW, co3nq6QGBP7xS, coCPHbFuET-Y-,
   comgofAHrtakJ, coIDujM2ElkDR2, co5vS4tZHJc19P.
9. **De kartusche past in elk gangbaar, stevig kitpistool** (zelfde maat als een
   siliconenkoker); een speciaal EAZYFIX-pistool is niet nodig, wel kracht.
   covdJsA9Ro7q4, co7u4LqMSJiH0K, coD5frgR6KCjM, coRIL55D3eCIm, coq8td0EMdvTP,
   coFdTEjMYsjVn. Eén keer bleef deze simpele vraag onbeantwoord.
10. **Buiten altijd overschilderen met een UV-bestendige lak** (mag kleurloos);
    eerst schuren, anders hecht de verf niet; daarna hecht elke verfsoort.
    coIDujM2ElkDR2, co2bJA016moxX, co-rEpUJ7y8L9n, coxtuexzyoxQH, coLRBQTDMBOp2,
    coEwrLgyIgS_-, co_7DjVT16n-E, coChzpTP26Df (boot: bootlak).
11. **Nieuwsbrief-aanmelding geeft eenmalig 10 % korting**, aanmelden onderaan
    elke pagina, code invullen op de betaalpagina. Verder geen volume- of
    handelaarskorting via de shop. coYdmECPo6gNr, co7uXS4haOeQFb, co0Hw5IXc7TrM,
    co_bZnYyVmDEY, covvVqp0SGCtm, coyrs830_9tj_, coCPHbFuET-Y-.
12. **Diagnose-vuistregels van de mens**: waar de verf scheurt of afbladdert zit
    meestal rot eronder; prik met een priem of schroevendraaier, veert het hout
    terug of is het zacht, dan is het rot. co-wCOOlvF1Ez, coqZcMU0wcSNa,
    cowcXDaplNBVe, coEwrLgyIgS_-, coRg31-SLxVaS, co443Hg8KC0da, co-4ksc1enjhs,
    cowjW61e8ZLAK. De bot heeft de priktest al in de prompt; de
    "scheurende verf = rot eronder"-regel niet, en die hoort ook in de foto-flow.
13. **Fräser-specificaties**: schacht 3 mm, kop 6 mm; past alleen in *roterende*
    multitools (Dremel-type, min. 30.000 t/min), niet in *oscillerende*
    multitools zoals de Makita DTM51, en niet in een accuschroevendraaier.
    co8YEp2jdaYTa, coclsTeHAOhlM, codzgYiqdTY5el, coLU-Qz48ijJi. De mens gaf hier
    eerst een fout advies en moest corrigeren.
14. **De uitgeharde reparatie blijft elastisch en werkt mee met het hout**,
    daarom scheurt hij niet opnieuw; hij wordt harder dan het omringende hout.
    coRg31-SLxVaS, copwY_lV9mEt, coqS7BgtknEIc, coHzETYVRXi94, cowRftkBC5VYJ.
15. **Nat hout aan de lucht laten drogen**, nooit afdekken met grondverf of
    plastic (sluit vocht in) en nooit met een föhn drogen. In het najaar afdekken
    met een zeil, laten luchten, desnoods wachten tot het voorjaar.
    condNngKKXDuv, co-4ksc1enjhs, co-wCOOlvF1Ez, coYHsWiyRYUj-.
16. **Schroefgaten**: vullen met Feinspachtel of All-in-One en er daarna weer in
    schroeven kan; draai de schroef eerst zo ver mogelijk in zodat een kuiltje
    ontstaat. coC_WxqrN_pG8, coiWymMGlECFT, co6HGmRqPjpE, coxG852GUcFll,
    cozdZCSUVJNzC. Klantfeedback (niet door de agent bevestigd): voorboren met
    ca. 1 mm kleiner dan de schroef, anders breekt de vulling (co9hoTe9ShzXW).
17. **Temperatuur bepaalt de uithardtijd.** Verwerking kan van 0 tot 30 °C zolang
    het droog blijft; vuistregel van de agent: **per 10 °C kouder verdubbelt de
    droogtijd** (bij 7 °C dus ca. 10 uur voor de spachtelmasse in plaats van
    ca. 4 bij 20 °C). Alle opgegeven tijden gelden bij 20 °C. Uitgehard is het
    product vorstbestendig. coqxxt6c0vX_0, coQzPnM8ustye, coVMkgQ47fxbg,
    colmrk32LU0ym, coW8-GMW31ohk, coOD69CLl2tpC, coLXch-T2RujH. Dit is de meest
    gestelde technische vraag die de bot nu niet kan beantwoorden, en hij hangt
    direct samen met de bestaande `weather_lookup`-regels.
18. **De uitgeharde reparatie is bewerkbaar als hout**: boren, schroeven,
    beitelen. coXaEA7ko0piG0, coceIUmqFBGi, coAR0uj0EZjul, cobCWOD2Xqu2N
    (die laatste bleef onbeantwoord).
19. **De spachtelmasse hardt alleen uit "als het massa maakt"**: te dun
    aangebracht (onder ca. 5 mm) hardt hij niet uit. Dat is de *reden* achter de
    minimum-laagdikte die al in de prompt staat, en die reden verklaart mislukte
    reparaties. coVMkgQ47fxbg, cossNebiKW3N3, coOprNO8us7N4.
20. **Retourbeleid** (het meest complete antwoord uit de hele set, cotUQkFywnfaZ7):
    30 dagen gratis retour; volledige terugbetaling inclusief verzendkosten bij
    een complete retour in originele staat en verpakking; bij deelretour geen
    vergoeding van verzendkosten; reparatiesets alleen als geheel retour (wegens
    de pakketkorting); terugbetaling binnen 14 dagen; via DHL of DPD; het portaal
    is eazyfix.montareturns.com. Verifiëren tegen de site voordat dit de bot in
    gaat.

### 2.2 Eenmalig genoemd, wel waardevol (na verificatie)

- **Houtversterker-venster van 24 uur**: zit de Holzimprägnierung er langer dan
  24 uur op zonder dat de spachtelmasse erop komt, dan hecht die niet meer en
  moet opnieuw gefreesd worden (coqZcMU0wcSNa; ondersteund door coo8ZnTcJy9La,
  "binnen 24 uur aanbrengen"). Dit is een kritieke werkregel die nergens in de
  bot staat.
- **Overtollige epoxy nooit met water of terpentine verwijderen** — strak
  afwerken of na uitharden schuren (col8j7cEDqzdR).
- **Uitgehard materiaal van RVS-gereedschap**: een nacht in water leggen, dan
  afkrabben (coDAIJeag2Aja). Kwast is wegwerp (coC69YGzVF2-D); groene kunststof
  spatels zijn herbruikbaar mits direct gereinigd (cok0HmgdKdkhR).
- **Geen lossingsmiddel in het assortiment**; gebruik een kunststofplaat of
  perspex-restje als mal, de epoxy hecht daar niet aan (co27OHup0sRY,
  coCPHbFuET-Y-). Modelleerstrips zijn kunststof, 50 cm.
- **Holzfeuchtemessgerät: stand D is hout**; A t/m C zijn voor andere materialen
  en niet gekalibreerd. Bediening: rode knop, dan Mode tot D (coQjqD9mPJ51p).
- **Te dikke laag in één keer wordt heet (exotherm) en kan opbollen**
  (cop9XOvpbBkpD, comgofAHrtakJ).
- **Uithardingstest**: na ca. 4 uur met een stokje op de reparatie tikken
  (co28blhdFn48k).
- **Assortimentsgrenzen**: geen verf (coOKIc3RvNYbj), geen beglazingskit (die
  loopt via Repair Care, cozUiyaoUHf278), geen preventieve houtbescherming
  (coRKGNgz8PBi), geen product om hele vlakken of deuren te spachtelen
  (co6XMjG0yUS0h), producten zijn niet spuitbaar of injecteerbaar
  (cozNYEIrlQCy2, coSpHt0V8DJxv). De Treppen-/Bodenspachtel is uit het
  assortiment, All-in-One is de vervanger (co1TbvRLrwpLf).
- **Toepassingen die wél kunnen**: boot inclusief onderwaterschip mits droog hout
  en bootlak (coChzpTP26Df), insectenschade mits de insecten weg zijn
  (cojS2fh7OG97), spaanplaat mits droog en voorbehandeld (coxG852GUcFll),
  HPL/Resopal met All-in-One (coqlyKDfi4JM6, na navraag bij een chemicus).
  Styropor wordt niet aangetast maar is als ondergrond ongeschikt
  (co-s1ssWc8K4A). Terrasplanken zijn lastig omdat de reparatie UV-lak nodig
  heeft (coEwrLgyIgS_-).
- **Lege of defecte kokers horen bij het klein chemisch afval** (cowo4YOVgpYaT).
- **Huidcontact met uitgeharde massa is onschadelijk**; alleen ongemengd/nog
  niet uitgehard vermijden, nitril handschoenen dragen (cohDT1d9gCA0V).
- **Rot stoppen kan alleen door het volledig te verwijderen**; de impregnering
  stopt rot niet (cowRftkBC5VYJ). Sterke mythebuster, past goed in de kennis.
- **Buitenland**: Frankrijk via eazy-fix.fr, België via eazy-fix.be, Nederland
  via eazy-fix.nl; niet naar Zwitserland (de webshop accepteert geen CH-postcode,
  Amazon DE is dan het alternatief), niet buiten Europa. Oostenrijk wordt wel
  beleverd (verzendkosten volgens één chat 7,99 €, gratis vanaf 50 €), maar heeft
  geen winkelverkoop. co0L3_lsRPqcb, co1TB4JmgVpp4, coRmbL46_Ypp2,
  coBKqIyK90z0u, coksjy93U_qJd, co6aJRQTqkb9s, covvVqp0SGCtm, co3trSN7GiuB9.
- **B2B bestelt via MoreApp** met een account-uitnodiging per e-mail; de webshop
  is voor consumenten; B2B heeft klantspecifieke prijzen (coUP_1UXsyLJ4).
- **Er is ook een Oostenrijkse site, eazy-fix.at**, en geen dealers in Oostenrijk
  (coPmUkF49HsoI). Dat maakt de landenlijst: DE, AT, NL, BE, FR, PL.
- **Producten die in de chats voorkomen maar niet in de botkennis staan**:
  Tür- und Scharnierspachtel (volgens de agent inzetbaar voor dezelfde doelen als
  de Feinspachtel, coE0531SMyetu) en de Trap-/Vloervuller (blijft flexibel,
  max 6 mm, co_SyhR9Kxl6O) — die laatste is inmiddels uit het assortiment met
  All-in-One als vervanger (co1TbvRLrwpLf). Controleer wat er nu écht in het
  DE-assortiment zit; de bot kent deze namen niet en kan er dus niets mee als een
  klant ernaar vraagt.
- **Wachtwoordeisen webshop-account**: minstens 12 tekens met hoofdletters,
  kleine letters, cijfers en leestekens (cokXTbfBiol7b). Klein, maar het kwam
  langs als supportvraag.
- **5 jaar tevredenheidsgarantie** met terugbetaling van de aankoopprijs; link in
  de header van de site (colmrk32LU0ym).
- **EAZYFIX en Repair Care**: zelfde ontwikkelteam, EAZYFIX is de doe-het-zelflijn
  en dochter van Repair Care; vergelijkbare kwaliteit, andere verwerking.
  Professionals kunnen via Repair Care opgeleid worden; wie het werk wil
  uitbesteden vindt opgeleide bedrijven via Repair Care. cofIlVp8H1J9z,
  coF1ZhdtQ7zKT, coqZcMU0wcSNa, co3trSN7GiuB9, co5zSphM88ks.

### 2.3 Te verifiëren vóór opname — hier spreken bronnen elkaar tegen

| onderwerp | wat de chats zeggen | wat de bot nu zegt |
|---|---|---|
| uithardtijd spachtelmasse | 3 uur bij 20 °C (colmrk32LU0ym, cojnNJ1GshJTw, co5Y6DU9fse0T) | ca. 4 uur |
| freesmarge rondom | "een halve centimeter extra" (cowjW61e8ZLAK) | ca. 2 cm gezond hout |
| verwerkingstijd | "10 Minuten" (co6XMjG0yUS0h) | 20-25 min spachtelmasse / 7-10 min All-in-One |
| verzendkosten | "Bestellungen unter 50 € werden kostenlos geliefert" (coxzpTZic6H7l) | niet in de bot; vermoedelijk verspreking voor "über 50 €" |
| levertijd | 2-4 werkdagen (2024) versus 3-5 werkdagen (2025-2026) | niet in de bot |
| reparatiedikte | "0,5 tot 200 mm" (co-V0DtNaKv1) versus "0,5 bis 20 mm" (covBZpaj854Igq) | 0,5-2 cm per laag, geen maximum totaal |
| kleur uitgeharde pasta | "ockergelb" (coxtuexzyoxQH) versus "hellbeige" (col8j7cEDqzdR) | staat niet in de bot |
| DE-telefoonnummer | 03222 1097 923, bereikbaar 8:30-16:15 (cogFCTXVSeMe3, coAX6ces_R7CJ) | alleen +31 85 201 201 1 |
| inkleuren | agents noemden consequent Mixol en Colorex | eigen Abtönkonzentrat |

De laatste twee zijn beleidsbeslissingen, geen feitenkwesties: welk
telefoonnummer wil je dat de bot geeft, en mag de bot een externe verfpigment-
merknaam noemen als het eigen Abtönkonzentrat niet volstaat? Nu verbiedt de
prompt elk merk van derden; de mens deed het tientallen keren wel.

---

## 3. Wat de mens deed en de bot niet mag

Dit hoort als expliciete escalatieregels in de prompt, want de bot heeft die
mogelijkheden niet en moet dat eerlijk zeggen in plaats van te improviseren.

1. **Orderstatus opzoeken.** De agent keek live in het ordersysteem, noemde
   bestelnummers, betaalstatus en klantnamen (coj1xH6TtGkoh, coqodqEeMFlYz,
   co6aJRQTqkb9s, coOoS_KHtIBz3, copdOGe5GKskn, copO3LM5DHhv, cowo4YOVgpYaT).
   De bot: bestelnummer uitvragen en naar de binnendienst verwijzen, nooit
   klantgegevens tonen of status bevestigen.
2. **Levertijd- en verzendbeloftes.** "Gaat vandaag nog de deur uit", "morgen in
   huis" (cozbw5XzX1YTE, coh19WFujvNU, cowo4YOVgpYaT, cowjW61e8ZLAK). De bot:
   alleen de geverifieerde indicatie noemen, nooit een garantie.
3. **Coulance en gratis producten.** Gratis vervangende koker, gratis mengmes,
   twee gratis tubes (cowo4YOVgpYaT, coJn5PMjyjnDf, coMcmbSyvPla7) en
   terugbetaling onder garantie (colmrk32LU0ym). De bot: begrip tonen, gegevens
   verzamelen, escaleren. Nooit zelf iets toezeggen.
4. **Fiscale toezeggingen.** "Erstattet ihr die deutsche Umsatzsteuer?" → "Ja"
   (coYdmECPo6gNr). Altijd naar de binnendienst.
5. **Terugbelbeloftes en zelf mailen** (coqJvQxxqYDM7, coViqQ00awrFV,
   cossNebiKW3N3, coI8WUyitf59Ni). De bot kan niet bellen of mailen; wel het
   telefoonnummer en e-mailadres geven, en links direct in de chat zetten.
6. **Voorraad bij winkels bevestigen** (coAztpAQaHtySu, colmrk32LU0ym). Zonder
   voorraadinzicht mag de bot dat niet; wel adviseren vooraf te bellen. Eén klant
   reed 60 km voor niets (coCrJng2w8V5d).
7. **Uitspraken over andere merken.** De agents noemden en beoordeelden
   regelmatig merken van derden (Mixol, Colorex, Jotun, en concurrenten in
   cowxfcYXiaLgw, coOD69CLl2tpC, co-wCOOlvF1Ez). De huidige botregel is hier
   strenger dan de praktijk was, en dat is verdedigbaar — maar zie de
   beleidsvraag in §2.3.
8. **Interne acties beloven** ("ik pas de website aan", "ik meld het bij onze
   chemicus", coOD69CLl2tpC, co3CWMZ2yaCkc, coDWuZRGeKXT_, cossNebiKW3N3).
   De bot: melding aannemen en zeggen dat hij hem doorgeeft, meer niet.

---

## 4. Concrete wijzigingen

### 4.1 Systeemprompt (`src/persona.js`)

1. **Antwoord eerst, link daarna.** Bij een ja/nee- of feitvraag eerst het
   directe antwoord in de chat, pas daarna eventueel een link of video. Nooit een
   link als enig antwoord. Dit veroorzaakte de laagste ratings in de hele set:
   cojnNJ1GshJTw (rating 1, "Monique Antworten sind unzureichend") en
   comgofAHrtakJ ("Monique, Sie sind ein Chatbot - das ist sinnlos!").
2. **Botidentiteit.** Op "ben jij een bot?" altijd eerlijk bevestigen en direct
   een menselijk alternatief aanbieden (telefoon, e-mail). Nooit ontkennen. De
   menselijke agent ontkende ooit zelf ("Das bin ich nicht", comgofAHrtakJ) en de
   bot draagt dezelfde naam Monique.
3. **Afraden met alternatief.** Als de bot iets afraadt, altijd reden plus
   alternatief plus vervolg. Kaal afraden kostte een klant: "Was ist das für eine
   Antwort?" (codd8zID34mDc). Eerlijk afraden mét alternatief leverde juist de
   hoogste waardering op ("mag ik je heel hartelijk danken voor je eerlijke
   advies", co06CSFSmSQUK).
4. **Escalatieblok bestellingen, betalingen, retour en garantie.** Zie §3.
   Nu ontbreekt elk pad hiervoor terwijl dit 38 + 13 + 6 gesprekken betreft.
   Formuleer als: erkennen dat de bot niet in het ordersysteem kan, vragen om
   bestelnummer, doorverwijzen met telefoonnummer én e-mailadres.
5. **Onderscheid webshop-bestelling versus Amazon-bestelling.** Bij een
   Amazon-order moet de klant naar Amazon; nu ontstond er verantwoordelijkheids-
   pingpong (coMcmbSyvPla7: "Was war zuerst da, das Ei oder das Huhn?").
6. **NL/DE-terminologie.** NL-klanten chatten op de DE-bot met NL-productnamen:
   houtrotvuller = Holzspachtelmasse, houtversterker = Holzimprägnierung,
   plamuur = Feinspachtel (let op: NL-plamuur gaat tot 1 cm, de DE Feinspachtel
   tot 6 mm; controleer of dat een verschil in assortiment of in terminologie is).
7. **Aanspreekvorm.** De mens duzde vrijwel altijd, ook tegen klanten die "Sie"
   gebruikten; niemand klaagde. Leg één lijn vast in de prompt in plaats van het
   aan het model over te laten.
8. **"Nee" mag nooit alleen staan.** De twee laagste ratings in de hele set
   ontstonden door een kaal nee: "Suchst du Farbe? Leider keine Farbe"
   (coTz3ZxS_vRga, rating 1) en het kale "kannst du auch ein Stück Holz
   einkleben" (codd8zID34mDc). Regel: bij elke afwijzing de reden, het
   alternatief uit het eigen assortiment en een vervolgstap noemen. Bij de
   kleurvraag concreet: wij verkopen geen verf, de pasta is inkleurbaar met het
   EAZYFIX® Abtönkonzentrat, en buiten sluit je af met een UV-bestendige lak.
9. **Escalatie voor webshopstoringen.** Zeven gesprekken in één deel gingen over
   een kapotte checkout, winkelwagen, kortingsveld of pagina (co8HqmbWv35ep,
   coIoVhaelytis, coS90z5jEnVsW, co-F9XvjLRN8, cokXTbfBiol7b). De bot kan dat
   niet oplossen, maar kan wel het juiste doen: de URL en de exacte foutmelding
   uitvragen, een andere browser of betaalmethode suggereren en gebundeld
   doorsturen naar desupport@eazy-fix.com. Nu heeft hij daar geen pad voor.
10. **Landenroutering.** Klant in Oostenrijk → eazy-fix.at, Frankrijk →
    eazy-fix.fr, België → eazy-fix.be, Nederland → eazy-fix.nl, Zwitserland →
    geen levering vanuit de webshop. Drie Franse en meerdere Engelse gesprekken
    bleven onbeantwoord; de bot kan die talen wél aan, mits de routering klopt.

### 4.2 Toolgedrag `find_verkooppunt` — hier zit een echte bug

De chats spreken elkaar tegen over of EAZYFIX in Duitse winkels ligt: in 2024 zei
de agent "wir verkaufen unsere Produkte in rund 20 deutschen Hornbachs"
(colmrk32LU0ym), in 2025 zeiden meerdere agents "im Moment gibt's leider keine
Läden in Deutschland" (coR4a9ZW-2MM1, coKEZDo0K67b, coUb5pDtcZkkj, coNkQzYjVoOae).
Laat de binnendienst vaststellen wat nu geldt.

Wat ik wél in de code kon verifiëren, en dat is ernstiger:

`src/verkooppunten.json` bevat 34 entries, waarvan 29 met een plaatsnaam
(25 Hornbach-filialen plus 4 dealers). Maar **slechts 4 daarvan hebben een
postcode**, en 25 hebben `zip: null`. In `src/verkooppunten.js:39` zoekt de
postcode-tak alleen in `s.zip`:

```js
const zip = q.match(/(\d{4})\s*[a-z]{0,2}/);      // NL-vorm 1234 AB, DE is 5-cijferig
const near = STORES.filter((s) => s.zip && ...);   // sluit 25 van de 29 filialen uit
```

Gevolg: een Duitse klant die zijn postcode geeft (de normale manier in DE) vindt
alleen de vier dealers met postcode, nooit een Hornbach-filiaal — ook niet als er
één in zijn stad staat. Dat verklaart de 350 km-verwijzing waar de klant
sarcastisch op reageerde: "gut, das sind nur 350km..." (co_7DjVT16n-E). En het
verklaart waarom de mens handmatig filialen moest opnoemen.

Nodig:
1. postcodes bij de Hornbach-filialen in de scraper (`scripts/pull-verkooppunten-de.js`)
   of anders een plaats→postcode-mapping;
2. de regex naar de Duitse vorm (5 cijfers);
3. een afstands- of regiogrens plus een eerlijke uitkomst als er niets in de buurt
   is: dan de webshop (en eventueel Amazon.de) noemen in plaats van iets ver weg;
4. de vaste disclaimer "wij hebben geen inzicht in de winkelvoorraad, bel vooraf"
   — één klant reed 60 km voor niets (coCrJng2w8V5d);
5. het geval "land zonder verkooppunten" afdekken (Oostenrijk, Zwitserland).

### 4.3 Foto-flow (`IMAGE_ANALYSIS_PROMPT`)

- Vuistregel toevoegen: scheurende of afbladderende verf rond de schade betekent
  dat er verder rot onder zit; de omvang is pas bekend na wegfrezen.
- Drempel voor deelvervanging expliciet maken: dieper dan ca. 2 cm of groter dan
  een vuist → stuk hout inlijmen adviseren, met uitleg waarom (kosten, laagdikte)
  en de video erbij. Nu adviseert de bot laag-op-laag vullen, wat bij grote gaten
  onnodig duur is.
- Hoeveelheidsindicatie meegeven (formule uit §2.1.3), zodat de klant weet
  hoeveel kokers hij nodig heeft.
- Alternatief als de klant géén foto kan sturen: overschakelen op gerichte
  vragen. Eén klant met een beperking liep hierop vast (cogFCTXVSeMe3, rating 3).
- Niet-hout randgevallen (boot van polyester, verzakkende vloer) doorverwijzen in
  plaats van forceren (co_io_5PUt60P, coZfOGrH8m16C).

### 4.4 Retrieval (`src/kennis.js`)

Termen die klanten gebruiken en die nu niet in de synoniemgroepen staan:
- levering: `lieferzeit`, `lieferung`, `versand`, `versandkosten`, `paket`,
  `bestellung`, `bestellt`, `amazon`, `webshop`
- houdbaarheid: `haltbar`, `haltbarkeit`, `mhd`, `angebrochen`, `lagerung`,
  `aufbewahren`
- hoeveelheid: `ergiebigkeit`, `menge`, `wieviel`, `reicht`, `kartuschen`
- gereedschap: `kartuschenpistole`, `silikonpistole`, `auspresspistole`,
  `oszillierend`, `rotierend`, `schaft`
- ondergronden: `mdf`, `sperrholz`, `spanplatte`, `multiplex`, `hpl`, `resopal`,
  `kunststoff`, `pvc`, `styropor`, `boot`
- kleur: `ockergelb`, `beige`, `einfärben`, `farbkonzentrat`, `pigment`, `lasur`
- garantie/klacht: `garantie`, `reklamation`, `umtausch`, `retoure`, `defekt`
- NL-termen die op de DE-bot binnenkomen: `houtrotvuller`, `houtversterker`,
  `plamuur`, `levertijd`, `houdbaar`

### 4.5 Buiten de bot, wel doorgeven

- De Trusted-Shops-widget overlapt de verzendknop van de chat, gemeld op pc én
  iPad (col8j7cEDqzdR, coOoS_KHtIBz3: "Das haben wir schon öfter gehört").
- Het offline-bericht op de Duitse site verwijst naar de FAQ van eazy-fix.**nl**
  en bevat de typefout "diene E-Mail Adresse" (coAX6ces_R7CJ, coEIxKY1TMksH,
  cozOLSJr-JuQH, coS-_ZPIefh92p). Met een 24/7-bot kan dat bericht grotendeels
  weg.
- Gepubliceerde telefoonnummers werken niet meer: "Alles was ich anrufe, gibt es
  nicht mehr" (co9qAOO9m1nx).
- Kapotte link naar een reparatieset op de mengplateau-pagina (coCPHbFuET-Y-),
  dode links in een mailcampagne (coDWuZRGeKXT_), niet-werkende QR-code op de
  verpakking (cok0HmgdKdkhR, cotppxykJG6uP).
- Amazon-listing gebruikt kleuraanduiding "Eiche" terwijl de pasta okergeel is
  (co3CWMZ2yaCkc), en er lag verlopen voorraad bij Amazon (copO3LM5DHhv).
- Bestelbevestigingsmails kwamen structureel niet aan (coj1xH6TtGkoh,
  coujmPTYMbC95).
- Er zijn Duitse instructievideo's (bijvoorbeeld uTatDFshn-4, cowcXDaplNBVe),
  maar de kennisbank bevat alleen NL-video's; de mens stuurde DE-klanten steeds
  NL-video's met de disclaimer "auf Niederländisch, aber gut zu verstehen".

---

## 5. Geverifieerd tegen de code, niet alleen tegen de chats

Om te voorkomen dat "dit staat niet in de botkennis" een aanname blijft, heb ik
de kernbegrippen geteld in `src/persona.js`, `src/kennis.json` en
`src/kennis-extra.json`. Nul treffers in álle drie:

`Lieferzeit`, `Versand`, `Rückgabe`, `Retoure`, `Widerruf`, `Rabatt`,
`angebrochen`, `Ergiebigkeit`, `Silikonpistole`, `ockergelb`, `Frost`, `MDF`,
`Spanplatte`, `montareturns`, `eazy-fix.at`, `eazy-fix.fr`.

Dat bevestigt de grote gaten: levering, retour, korting, houdbaarheid na
openen, verbruik, vorstbestendigheid, plaatmateriaal en de landensites zijn
letterlijk nergens vastgelegd.

Twee nuances die uit dezelfde controle komen:
- `Garantie` levert 114 treffers op, maar dat is de pagina "Unsere
  Erfolgsgarantie" (100 % succesgarantie op de reparatie als je het stappenplan
  volgt). De **5 jaar tevredenheidsgarantie met terugbetaling** uit
  colmrk32LU0ym staat er niet in en is dus echt nieuw — en moet geverifieerd.
- `Amazon` komt 18 keer voor in de site-kennis, dus het kanaal is niet onbekend;
  wat ontbreekt is het onderscheid in de afhandeling (Amazon-order → Amazon).

## 6. Tweede analyse (Codex): wat de kennisbank zelf verkeerd zegt

De onafhankelijke tweede pass keek niet naar de chats alleen, maar toetste ze
tegen de code. Die vond vier dingen die de eerste analyse miste. Ik heb ze
nagetrokken; hieronder staat per punt wat de controle opleverde.

**Bevestigd — de productpagina spreekt de prompt tegen.** De pagina
`premium-holzspachtelmasse` in `kennis.json` zegt: "Sie eignet sich für
Reparaturen von 5 bis 20 mm Tiefe." Dat is dezelfde marge als de prompt per
laag hanteert (0,5 tot 2 cm), maar het staat er als *totale* reparatiediepte.
De prompt waarschuwt juist expliciet dat er géén maximale totale diepte is en
dat je dieper gewoon in lagen opbouwt. Omdat de prompt zelf zegt dat de website
leidend is bij tegenspraak, kan `zoek_kennis` de bot hier tegen zijn eigen
instructie in duwen bij precies de vraag waar klanten mee zitten: een gat van
vier of vijf centimeter diep.

**Bevestigd — de bot heeft twee verschillende telefoonnummers.** Drie pagina's
in `kennis.json` noemen het Duitse nummer 03222 1097 923; geen enkele pagina
noemt het Nederlandse +31 85 201 201 1 dat de prompt overal voorschrijft.
Afhankelijk van of de bot zijn prompt of de opgehaalde pagina volgt, geeft hij
een ander nummer. Dat sluit aan bij de klacht "Alles was ich anrufe, gibt es
nicht mehr" (co9qAOO9m1nx). Kies één nummer en trek het gelijk.

**Bevestigd — Hornbach staat wél in de kennis.** Achttien pagina's in
`kennis.json` noemen Hornbach, en `verkooppunten.json` bevat 25 Duitse
Hornbach-filialen. Dat versterkt §4.2: het probleem is niet dat er geen Duitse
verkooppunten zijn, maar dat de bot ze niet kan vinden op postcode.

**Bevestigd — 57 Nederlandstalige video's staan in de zoekindex.** De opmerking
boven in `kennis.js` gaat ervan uit dat die niet bovenkomen omdat ze geen Duitse
titels hebben. Dat klopt voor Duitse vragen, maar niet voor de 68 gesprekken die
volledig in het Nederlands gaan: daar matchen ze juist wél, en dan concurreren
video-items met echte tekstkennis. Voorstel van de tweede pass: video's niet
gelijkwaardig meewegen in de zoekcontext.

**Niet bevestigd.** De claim dat er nog "180 ml" op oudere pagina's staat, klopt
niet: nul treffers in de huidige `kennis.json`. Waarschijnlijk al opgeschoond.

De tweede pass telde het serviceverkeer bovendien breder dan mijn regex: 74 van
de 268 gesprekken (28 %) bevatten minstens één service-signaal — bestelling of
betaling 26, levering 31, B2B 15, factuur 5, klachten 33, retour 3. Bijna drie op
de tien gesprekken gaat dus deels over iets waar de bot nu geen enkel pad voor
heeft.

Aanvullende retrieval-gaten die de tweede pass met echte klantzinnen testte:
"tube geöffnet aufbewahren" haalt een kostenpagina op in plaats van bewaaradvies;
een vraag over hechting op pvc of spaanplaat levert de impregnering en
NL-video's op in plaats van het feit dat epoxy niet op kunststof hecht; en een
vraag als "hoe droog moet het hout, 15 % of 10 %" komt uit bij verkeerde
entries in plaats van bij de grens van 18 %. Voeg daarbij de Nederlandse
spreektaal die op de Duitse bot binnenkomt: `kitpatroon`, `koker`, `plamuur`,
`houtrotvuller`, `houtversterker`, `schroefgaten`, `boeidelen`, `spaanplaat`
staan geen van alle in de synoniemgroepen.

## 7. Volgorde van aanpakken

1. Laat de binnendienst de tabel in §2.3 beslechten. Zonder die antwoorden mag
   niets van de leverings-, garantie- en tijdgegevens de bot in.
2. Voeg de bevestigde feiten uit §2.1 toe aan `kennis-extra.json`, in het Duits,
   in dezelfde stijl als de drie bestaande entries.
3. Repareer het verkooppunt-gedrag (§4.2). Dit levert nu actief schade op.
4. Voeg de escalatieregels voor bestellingen, betalingen, retour en garantie toe
   aan de prompt (§4.1.4).
5. Vul de synoniemgroepen aan (§4.4) en breid `eval/cases.js` uit met cases uit
   de echte chats: de onbeantwoorde vragen zijn de beste testset die er is
   (kartusche openen, tweede laag, houdbaarheid, levertijd, silikonpistool).
6. Werk daarna de foto-flow bij (§4.3).
