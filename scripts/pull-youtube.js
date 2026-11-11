// Trek de kennis uit de Duitse EAZYFIX YouTube-video's (@eazyfix-de) naar
// src/kennis-video.json, zodat de bot ook de video-uitleg kan raadplegen en Duitse
// videokaartjes kan tonen. Tot 11-11-2026 stond hier het Nederlandse kanaal
// (@eazyfixnl): de Duitse bot had daardoor alleen Nederlandse video's, die nooit
// matchten (review REVIEW-CHATBOT-DE.md, punt 6).
//
// Werkwijze: yt-dlp haalt per video de titel + beschrijving op. Claude schoont elke
// beschrijving op tot nette, doorzoekbare Duitse kennis en gooit niet-instructieve
// clips weg. Geen audio/captions/ffmpeg nodig.
//
// Vereist: yt-dlp op PATH (of via YT_DLP=/pad/naar/yt-dlp) en ANTHROPIC_API_KEY.
// Gebruik: npm run yt:pull

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
const { scrubText, normalizeBrand } = require('./scrub');

const CHANNEL = process.env.YT_CHANNEL || 'https://www.youtube.com/@eazyfix-de/videos';
const YTDLP = process.env.YT_DLP || 'yt-dlp';
const MODEL = process.env.YT_CLEAN_MODEL || 'claude-haiku-4-5';
const TARGET = path.join(__dirname, '..', 'src', 'kennis-video.json');
const CONCURRENCY = 4;
const MIN_DESC = 150; // beschrijvingen korter dan dit bevatten te weinig om uit te halen

const CLEAN_PROMPT = `Du verarbeitest den Titel und die YouTube-Beschreibung eines EAZYFIX-Anleitungsvideos zu sauberem, durchsuchbarem Wissen für einen Holzfäule-Reparatur-Assistenten für deutsche Heimwerker.

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt, ohne anderen Text, ohne Markdown:
- "keep": true oder false. false, wenn das Video nicht anleitend ist (reine Werbung, Stimmungsbild, "abonnieren", Ankündigung, keine konkrete Reparatur- oder Produkterklärung). true, wenn brauchbare Erklärung drin ist (Schritte, Vorgehensweise, Produktanwendung, Tipps).
- "text": wenn keep true ist: schreib das Wissen in flüssigem Deutsch (du-Form), für einen Heimwerker. Beginne mit 1 Satz, was das Video zeigt. Gib danach die Vorgehensweise und die richtige Anwendung der EAZYFIX-Produkte in Fließtext oder kurzen Schritten. Behalte konkrete Fakten (Mischungsverhältnisse, Trocknungszeiten, Drehzahl, Reihenfolge). Wenn keep false ist: leerer String "".

KANONISCHE PRODUKTFAKTEN (maßgeblich; widerspricht die Beschreibung, folge DIESEN Fakten und übernimm den Fehler NICHT):
- Premium Holzspachtelmasse: ZWEI-Komponenten-Epoxid (Mischungsverhältnis 2:1, kommt fertig dosiert aus der Kartusche). Nenne sie nie einkomponentig.
- Holzimprägnierung: zwei Komponenten (Verhältnis 1:1), mit einem Rührstäbchen mischen, ca. 25 Minuten einziehen lassen.
- Premium Holz Feinspachtel: NUR für oberflächliche Schäden in gesundem Holz (Kratzer, Löcher, Fugen bis 6 mm). NIE bei Holzfäule; bei Fäule immer fräsen + Holzimprägnierung + Holzspachtelmasse.
- Holzfäule Fräser: in ein hochtouriges rotierendes Multitool (Dremel-Typ, ca. 30.000 U/min), nicht in eine gewöhnliche Bohrmaschine.
- Benutze die deutschen Produktnamen: Premium Holzspachtelmasse, Holzimprägnierung, Premium Holz Feinspachtel, Holzfäule Fräser, Holzfeuchtemessgerät, Abtönkonzentrat, Premium Fertigspachtel. Keine niederländischen Namen (Houtrotvuller, Houtversterker, Houtplamuur).

REGELN für "text":
- Erfinde NICHTS. Nutze nur, was in Titel und Beschreibung steht. (Ausnahme: die kanonischen Produktfakten oben gehen einer widersprüchlichen Beschreibung immer vor.)
- Schreib den Markennamen IMMER als EAZYFIX (Großbuchstaben).
- KEINE Zeitstempel (0:00), KEINE URLs, KEINE Links, KEINE Preise, KEIN "abonnieren/liken/folgen", KEINE Social-Media- oder Newsletter-Texte, KEINE Hashtags.
- Kurz und sachlich, keine Werbesprache.`;

let client;
function anthropic() {
  if (!client) client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Haal per video een JSON-regel op met id, titel, beschrijving en url.
function fetchVideos() {
  return new Promise((resolve, reject) => {
    const args = [
      '--ignore-errors', '--no-warnings', '--skip-download',
      '--print', '%(.{id,title,description,webpage_url})j',
      CHANNEL,
    ];
    const proc = spawn(YTDLP, args);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => reject(new Error(`yt-dlp niet gevonden (${e.message}). Installeer yt-dlp of zet YT_DLP=/pad.`)));
    proc.on('close', () => {
      const vids = out.split('\n').filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((v) => v && v.id && v.title);
      if (!vids.length) return reject(new Error(`Geen videodata van yt-dlp. stderr: ${err.slice(-400)}`));
      resolve(vids);
    });
  });
}

// Producten die niet meer op de Duitse site staan (eazy-fix.nl/de, november 2026):
// hun video's horen niet in de kennis, anders raadt de bot ze weer aan.
const NIET_MEER_LEVERBAAR = /all[\s-]?in[\s-]?one/i;

async function cleanOne(v) {
  if (NIET_MEER_LEVERBAAR.test(v.title)) return { keep: false };
  const desc = (v.description || '').trim();
  if (desc.length < MIN_DESC) return { keep: false };
  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: CLEAN_PROMPT,
    messages: [{ role: 'user', content: `TITEL: ${v.title}\n\nBESCHREIBUNG:\n${desc}` }],
  });
  const raw = (msg.content.find((b) => b.type === 'text') || {}).text || '';
  let parsed;
  try { parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, '')); }
  catch { return { keep: false }; }
  return parsed;
}

async function mapPool(items, fn) {
  const res = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { res[idx] = await fn(items[idx], idx); }
      catch (e) { console.log(`  ⚠ fout bij item ${idx}: ${e.message}`); res[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return res;
}

(async () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY ontbreekt (.env).');
  console.log(`YouTube-kennis ophalen van ${CHANNEL} ...`);
  const videos = await fetchVideos();
  console.log(`${videos.length} video's gevonden. Beschrijvingen opschonen met ${MODEL} ...`);

  const cleaned = await mapPool(videos, async (v, idx) => {
    const r = await cleanOne(v);
    if (r.error) { console.log(`  ⚠ ${v.title.slice(0, 50)}: ${r.error}`); return null; }
    if (!r.keep || !r.text || r.text.trim().length < 40) { console.log(`  – overslaan: ${v.title.slice(0, 50)}`); return null; }
    console.log(`  ✓ ${v.title.slice(0, 50)}`);
    return {
      type: 'video',
      slug: `yt-${v.id}`,
      title: normalizeBrand(v.title.replace(/\s*#\S+/g, '').trim()),
      url: v.webpage_url || `https://www.youtube.com/watch?v=${v.id}`,
      text: scrubText(`${v.title}\n${r.text.trim()}`),
    };
  });

  // Alleen geldige video-entries; voorkomt dat een mislukt item de sort laat crashen.
  const ok = cleaned.filter((v) => v && v.title && v.text && v.url).sort((a, b) => a.title.localeCompare(b.title));
  fs.writeFileSync(TARGET, JSON.stringify(ok, null, 2) + '\n');
  console.log(`✓ ${ok.length} video's geschreven naar ${path.relative(process.cwd(), TARGET)} (${videos.length - ok.length} overgeslagen)`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
