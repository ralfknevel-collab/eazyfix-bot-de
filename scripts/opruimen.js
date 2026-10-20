// Handmatig opruimen van gesprekken en foto's ouder dan de bewaartermijn.
// Gebruik: node scripts/opruimen.js            (verwijdert)
//          DRY_RUN=1 node scripts/opruimen.js  (telt alleen)
// Vereist SUPABASE_URL en SUPABASE_SERVICE_KEY in .env. Zie src/retentie.js.
require('dotenv').config();
const { opruimen } = require('../src/retentie');

opruimen({ dryRun: Boolean(process.env.DRY_RUN) })
  .then((r) => {
    console.log(`${r.dryRun ? 'DRY_RUN: ' : ''}bewaartermijn ${r.days} dagen (grens ${r.cutoff}): ${r.gesprekken} gesprekken, ${r.fotos} foto's${r.dryRun ? ' zouden weggaan' : ' verwijderd'}`);
  })
  .catch((e) => { console.error('✗', e.message); process.exit(1); });
