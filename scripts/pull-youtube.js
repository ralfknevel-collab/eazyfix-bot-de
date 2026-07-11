// Trek de kennis uit de EAZYFIX YouTube-video's (@eazyfixnl) naar
// src/kennis-video.json, zodat de bot ook de video-uitleg kan raadplegen.
//
// Werkwijze: yt-dlp haalt per video de titel + beschrijving op (die bevatten
// het volledige stappenplan met producten). Claude schoont elke beschrijving
// op tot nette, doorzoekbare kennis en gooit niet-instructieve clips weg.
// Geen audio/captions/ffmpeg nodig.
//
// Vereist: yt-dlp op PATH (of via YT_DLP=/pad/naar/yt-dlp) en ANTHROPIC_API_KEY.
// Gebruik: npm run yt:pull

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
const { scrubText, normalizeBrand } = require('./scrub');

const CHANNEL = process.env.YT_CHANNEL || 'https://www.youtube.com/@eazyfixnl/videos';
const YTDLP = process.env.YT_DLP || 'yt-dlp';
const MODEL = process.env.YT_CLEAN_MODEL || 'claude-haiku-4-5';
const TARGET = path.join(__dirname, '..', 'src', 'kennis-video.json');
const CONCURRENCY = 4;
const MIN_DESC = 150; // beschrijvingen korter dan dit bevatten te weinig om uit te halen

const CLEAN_PROMPT = `Je verwerkt de titel en YouTube-beschrijving van een EAZYFIX-instructievideo tot nette, doorzoekbare kennis voor een houtrot-reparatie-assistent.

Antwoord UITSLUITEND met een geldig JSON-object, zonder andere tekst, zonder markdown:
- "keep": true of false. false als de video niet-instructief is (puur promo, sfeerbeeld, "abonneer", aankondiging, geen concrete reparatie- of productuitleg). true als er bruikbare uitleg in zit (stappen, werkwijze, producttoepassing, tips).
- "text": als keep true is: schrijf de kennis in vloeiend Nederlands, gericht op een doe-het-zelver. Begin met 1 zin wat de video behandelt. Geef daarna de werkwijze/stappen en het juiste EAZYFIX-productgebruik in lopende tekst of korte stappen. Behoud concrete feiten (mengverhoudingen, droogtijden, toerental, volgorde). Als keep false is: lege string "".

CANONIEKE PRODUCTFEITEN (leidend — als de beschrijving hiermee in strijd is, volg DEZE feiten en neem de fout NIET over):
- Premium Houtrotvuller: TWEE-componenten epoxy (mengverhouding 2:1). Noem hem nooit één-/eencomponent.
- Houtversterker: twee componenten (verhouding 1:1, blauw+geel → groen), ca. 25 min laten intrekken.
- Premium Houtplamuur: ALLEEN voor cosmetische schade in gezond hout (krasjes, gaatjes, naden). NOOIT voor houtrot — bij rot altijd frezen + houtversterker + Houtrotvuller.
- Houtrotfrees: in een hoogtoerig roterend gereedschap (multitool/Dremel, ca. 30.000 tpm), niet in een gewone boormachine.

REGELS voor "text":
- Verzin NIETS. Gebruik alleen wat in titel/beschrijving staat. Geen feit erin? Laat het weg. (Uitzondering: de canonieke productfeiten hierboven gaan altijd vóór een tegenstrijdige beschrijving.)
- Schrijf de merknaam ALTIJD als EAZYFIX (hoofdletters).
- GEEN tijdstempels (0:00), GEEN URL's, GEEN links, GEEN prijzen, GEEN "abonneer/like/volg ons", GEEN social media of nieuwsbrief-teksten.
- Engelse beschrijving? Geef de "text" toch in het Nederlands.
- Kort en feitelijk, geen marketingtaal.`;

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

async function cleanOne(v) {
  const desc = (v.description || '').trim();
  if (desc.length < MIN_DESC) return { keep: false };
  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: CLEAN_PROMPT,
    messages: [{ role: 'user', content: `TITEL: ${v.title}\n\nBESCHRIJVING:\n${desc}` }],
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
      title: normalizeBrand(v.title),
      url: v.webpage_url || `https://www.youtube.com/watch?v=${v.id}`,
      text: scrubText(`${v.title}\n${r.text.trim()}`),
    };
  });

  // Alleen geldige video-entries; voorkomt dat een mislukt item de sort laat crashen.
  const ok = cleaned.filter((v) => v && v.title && v.text && v.url).sort((a, b) => a.title.localeCompare(b.title));
  fs.writeFileSync(TARGET, JSON.stringify(ok, null, 2) + '\n');
  console.log(`✓ ${ok.length} video's geschreven naar ${path.relative(process.cwd(), TARGET)} (${videos.length - ok.length} overgeslagen)`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
