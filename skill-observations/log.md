# Skill Observation Log

Observations captured during task-oriented work. Each entry identifies a
potential skill improvement or new skill opportunity.

**Status key:** OPEN = not yet actioned | ACTIONED = skill updated/created |
DECLINED = user decided not to pursue

---

## 2026-07-06

### Observation 1: Chrome negeert programmatic .click() op display:none file-input

**Status:** OPEN
**Date:** 2026-07-06
**Session context:** Foto-knop in repair-care-bot opende geen bestandskiezer in Chrome (wel in Safari). Zelfde code-pad in beide browsers (`input.click()` op verborgen `<input type=file>`).
**Skill:** superpowers:systematic-debugging
**Type:** open-source
**Phase/Area:** Hypothesevorming bij cross-browser bugs

**Issue:** Ik verspilde meerdere beurten aan theorie ("Chrome vs Safari verschil") zonder te reproduceren, en gokte de oorzaak eerst verkeerd om. Root cause bleek een bekende gotcha: een `input[type=file]` met `display:none` opent in sommige Chrome-versies de bestandskiezer niet bij een programmatic `.click()`; Safari wel. Fix = input offscreen positioneren (position:absolute; left:-9999px; opacity:0) ipv `display:none`, zodat hij gerenderd blijft. Bevestigd werkend door gebruiker.

**Suggested improvement:** Voeg aan systematic-debugging een checklist-item toe: bij "werkt in browser A niet, browser B wel" met identiek code-pad, check eerst bekende engine-gotchas (verborgen file-inputs, user-gesture/trust-eisen, autoplay, storage-partitioning) vóór lange theorie. En: als je een browser niet zelf kunt aansturen, geef de gebruiker één concrete console-oneliner als diagnostic ipv te gokken.

**Principle:** Cross-browser bugs met een identiek code-pad wijzen bijna altijd op een engine-specifieke API-gotcha, niet op eigen logica. Reproduceren of een gerichte diagnostic-oneliner laten draaien is sneller en betrouwbaarder dan hypothesevorming vanaf de zijlijn.

### Observation 2: Sibling-bot audits moeten fix-pariteit checken

**Date:** 2026-07-06
**Session context:** Codebase-audit van repair-care-bot (subagent, read-only) vanuit de eazyfix-bot-sessie
**Skill:** New skill candidate: codebase-audit / bot-pariteit-check
**Type:** internal
**Phase/Area:** Audit-methodiek

**Issue:** Tijdens de audit bleek dat een fix die in eazyfix-bot al gecommit is (2b2afd0: geen rauwe Anthropic-fout in chat + retry bij overload) niet geport is naar het zusterproject repair-care-bot: daar gaat err.message nog rauw naar de gebruiker (src/index.js stream-catch) en is er geen retry. Ook client-side foto-verkleining en de eval-harness (npm run eval) bestaan alleen in het ene project.

**Suggested improvement:** Bij elke audit of fix in een van de twee zusterbots standaard de recente commits van de andere bot diffen op portbare fixes (git log --oneline -15 in beide repos) en ontbrekende pariteit expliciet rapporteren.

**Principle:** Wanneer twee codebases bewust dezelfde architectuur delen, is "welke fixes van de zus ontbreken hier" een goedkopere en betrouwbaardere bugbron dan opnieuw vanaf nul zoeken.

### Observation 3: Verdwenen working-tree edits = check git-state, niet de "linter"-melding

**Status:** OPEN
**Date:** 2026-07-08
**Session context:** Feedback-fix in eazyfix-bot (rij 40, houtrot >4cm). Tijdens mijn edits aan persona.js + kennis-extra.json wisselde de gebruiker gelijktijdig van branch (feature → main) en startte een merge/cherry-pick. Mijn edits leken te verdwijnen (grep=0), kennis-extra.json kromp van 7 → 2 items, persona.js kwam in UU-conflictstaat. De harness meldde dit als "modified by user or linter — intentional, don't revert".
**Skill:** superpowers:systematic-debugging
**Type:** open-source
**Phase/Area:** Werken in een levende working tree / interpretatie van omgevingssignalen

**Issue:** De "modified by linter, intentional"-melding suggereerde een goedaardige opmaak-wijziging, maar de echte oorzaak was een concurrent git branch-switch + merge-conflict die mijn uncommitted edits mee versleepte. Blind vertrouwen op die melding (of blind mijn edits opnieuw toepassen) zou het lopende merge-werk van de gebruiker hebben geclobberd. Door in plaats daarvan git status / reflog / conflict-markers te inspecteren werd duidelijk wat er echt gebeurde, en kon ik stoppen en om richting vragen i.p.v. door te ploegen.

**Suggested improvement:** Voeg aan systematic-debugging een regel toe: als working-tree bestanden onverwacht wijzigen, krimpen of "modified by linter"-meldingen geven terwijl jij ze net bewerkte, behandel dat als een git-state-signaal. Draai eerst `git status`, `git reflog -5`, en grep op conflict-markers (`^<<<<<<<`) vóór je edits herhaalt of iets commit. Vertrouw de "intentional/linter"-annotatie niet als de inhoud niet als opmaak leest (bv. hele secties of array-items verdwenen).

**Principle:** Een working tree is gedeelde, levende state. Onverwachte bestandswijzigingen midden in je eigen edits duiden vaker op een concurrent git-operatie (branch-switch, merge, rebase, reset) dan op een linter. Diagnose via git-state kost seconden en voorkomt dat je andermans in-flight werk overschrijft; blind door-editen is de dure fout.

### Observation 4: Subagents kunnen geen rapportbestanden schrijven — briefing moet tekst-teruggave vragen

**Date:** 2026-07-20
**Session context:** Analyse van 268 live-chat transcripts (EAZYFIX DE) met 8 parallelle analyse-agents over 8 transcript-chunks.
**Skill:** task-observer (en elke skill die fan-out naar subagents beschrijft)
**Type:** open-source
**Phase/Area:** Delegatie naar subagents / promptontwerp voor parallelle analyse

**Issue:** De briefing droeg elke subagent op het rapport naar een bestand te schrijven én als eindantwoord terug te geven. De harness blokkeerde het schrijven ("Subagents should return findings as text, not write report files"); twee agents meldden dit expliciet in hun antwoord. Eén van de acht agents viel bovendien uit op een API-limiet en moest opnieuw gestart worden; omdat er geen bestand op schijf stond, was er geen tussenresultaat om op terug te vallen — alleen een volledige herstart hielp.

**Suggested improvement:** In fan-out-instructies standaard alleen om tekst-teruggave vragen, niet om een bestandspad. Plan daarnaast expliciet voor gedeeltelijke uitval: nummer de deeltaken, houd bij welke terugkwamen, en start alleen de ontbrekende opnieuw in plaats van de hele batch.

**Principle:** Bij parallelle delegatie is het resultaatkanaal van de subagent het enige betrouwbare artefact. Ontwerp de opdracht rond dat kanaal en ga ervan uit dat een deel van de fan-out faalt; per-deeltaak herstartbaarheid is goedkoper dan een volledige herhaling.
