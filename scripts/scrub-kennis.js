// Schoon de bestaande kennissnapshots op met de commerciele scrub, zonder een
// volledige site-/YouTube-pull. Gebruik: node scripts/scrub-kennis.js
const fs = require('fs');
const path = require('path');
const { scrubText, normalizeBrand, isListingJunk, dedupeByUrl, EXCLUDE_PAGE } = require('./scrub');

// kennis.json kent niet-domein service-/juridische pagina's die helemaal weg
// moeten; de video-/extra-bronnen niet (geen klantenservice-URL's).
const SOURCES = [
  { file: 'kennis.json', dropPages: true },
  { file: 'kennis-video.json', dropPages: false },
  { file: 'kennis-extra.json', dropPages: false },
];

for (const { file, dropPages } of SOURCES) {
  const target = path.join(__dirname, '..', 'src', file);
  if (!fs.existsSync(target)) continue;
  const data = JSON.parse(fs.readFileSync(target, 'utf8'));

  // Niet-domein pagina's (alleen kennis.json) + listing-/navigatie-junk eruit,
  // daarna ontdubbelen op canonieke URL.
  let kept = data.filter((p) => !isListingJunk(p));
  if (dropPages) kept = kept.filter((p) => !EXCLUDE_PAGE.test(p.url || ''));
  kept = dedupeByUrl(kept);
  const dropped = data.length - kept.length;

  let changed = 0;
  for (const p of kept) {
    const beforeText = p.text;
    const beforeTitle = p.title || '';
    p.text = scrubText(p.text);
    p.title = normalizeBrand(p.title);
    if (p.text !== beforeText || (p.title || '') !== beforeTitle) changed++;
  }

  fs.writeFileSync(target, JSON.stringify(kept, null, 2) + '\n');
  const dropMsg = dropped ? `${dropped} junk/dubbel verwijderd, ` : '';
  console.log(`OK ${file}: ${dropMsg}${changed}/${kept.length} entries opgeschoond`);
}
