# EAZYFIX KI-Heimwerkerberater: integratie op eazy-fix.nl/de

Duitse tegenhanger van de Nederlandse chat. Werkt precies zoals de Nederlandse inbouw; alleen het adres en de standaardwaarden verschillen.

## 1. Samenvatting

- Endpoint: `https://eazyfix-bot-de.onrender.com/embed` (productie).
- Integratie: één cross-origin iframe en één `message`-listener, net als op de Nederlandse site. Geen API-sleutel, geen server-side koppeling.
- Standaardtaal is Duits; zonder `lang` toont de chat alles in het Duits.
- Het iframe zet geen cookies en bevat geen tracking.

## 2. Embed

```html
<iframe
  id="eazyfix-chat"
  src="https://eazyfix-bot-de.onrender.com/embed"
  title="EAZYFIX KI-Heimwerkerberater"
  allow="camera; geolocation"
  style="width: 100%; height: 480px; border: 0; display: block;"
  loading="lazy"></iframe>
```

Zelfde aanbevelingen als op de Nederlandse site: `src` pas zetten bij de klik op de knop, breedte 480 tot 600 px op desktop, volle breedte op mobiel.

## 3. postMessage-contract

Ongewijzigd ten opzichte van de Nederlandse chat. Valideer op `event.origin === 'https://eazyfix-bot-de.onrender.com'` en `data.source === 'eazyfix-chat'`.

| `type`   | velden           | betekenis                          |
|----------|------------------|------------------------------------|
| `ready`  |                  | iframe geladen en interactief      |
| `resize` | `height` (int)   | gewenste hoogte in px, 480 tot 820 |
| `event`  | `name` (string)  | `message_sent`, `photo_sent`, `answer_received`, `chat_ended`, `rating_given`, `new_chat`, `lead_given` |

## 4. Contextparameters

| parameter | waarden | effect |
|-----------|---------|--------|
| `product` | productslug uit `/de/product/<slug>/`, bv. `premium-holzspachtelmasse` | begroeting en advies gericht op dat product |
| `page`    | pad of slug, bv. `/de/holzboden-reparieren/` | context van de huidige pagina (genegeerd als `product` gezet is) |
| `klus`    | dezelfde sleutels als op de Nederlandse site (`kozijn`, `deur`, `trap`, `vloer`, `dorpel`, `muur`, `dak`, `boeiboord`, `schutting`, `meubel`); Duitse varianten zoals `fenster`, `tuer`, `treppe`, `boden`, `wand`, `zaun` werken ook | begroeting en advies vanuit die klus |
| `lang`    | `de` (standaard), `en`, `nl` | taal van de interface en van de antwoorden |
| `country` | `DE` of `AT` | land waarvoor de bezoeker advies zoekt (bij `AT` de verzendgegevens voor Oostenrijk) |
| `foto`    | `0` | geen foto-upload |

Voorbeeld voor een productpagina:

```php
<?php $src = add_query_arg([
  'product' => get_post_field('post_name', get_the_ID()),
  'lang'    => 'de',
  'country' => 'DE',
], 'https://eazyfix-bot-de.onrender.com/embed'); ?>
```

De server accepteert alleen slugs en paden die op eazy-fix.nl/de bestaan. Onbekende waarden worden stil genegeerd.

## 5. Domeinen en grenzen

- Framing is toegestaan vanaf `https://www.eazy-fix.nl`, `https://eazy-fix.nl`, `https://www.eazy-fix.de`, `https://eazy-fix.de` en `https://eazyfix.jkc-dev.nl`.
- Drie foto's gratis per bezoeker per dag; daarna vraagt de chat naam en e-mailadres voor vijf extra foto's (zelfde als NL).
- Status: `https://eazyfix-bot-de.onrender.com/health`.

## 6. Graag aan jullie kant

- Op de Duitse site het iframe naar `eazyfix-bot-de.onrender.com/embed` laten wijzen, niet naar de Nederlandse chat met `lang=de`: de Duitse chat heeft de Duitse producten, verkooppunten, verzendkosten en het Duitse telefoonnummer.
- Dezelfde tests als bij de Nederlandse inbouw: toetsenbord op iOS Safari in het iframe, "Foto aufnehmen" op een echte iPhone en Android, meegroeien van de hoogte en de events in de dataLayer.
