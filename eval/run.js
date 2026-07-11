// Draait de examenset (eval/cases.js) tegen de echte bot-pijplijn.
// Gebruik: npm run eval        (vereist ANTHROPIC_API_KEY in .env)
//
// Doet echte API-calls (zoals productie). Mechanische checks zijn gratis;
// gedragsregels (judges) worden door een klein, goedkoop model beoordeeld.

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { runChat } = require('../src/chat');
const cases = require('./cases');

const JUDGE_MODEL = 'claude-haiku-4-5-20251001';
const CONCURRENCY = 3;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('✗ ANTHROPIC_API_KEY ontbreekt in .env');
  process.exit(1);
}
const anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

// Laat een klein model beoordelen of het antwoord aan een gedragsregel voldoet.
async function judge(rubric, text) {
  const res = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 300,
    system: 'Je beoordeelt of een antwoord van een chatbot aan één eis voldoet. ' +
      'Antwoord UITSLUITEND met JSON: {"pass": true|false, "reason": "<korte reden>"}.',
    messages: [{ role: 'user', content: `Eis:\n${rubric}\n\nAntwoord van de bot:\n"""\n${text}\n"""` }],
  });
  const raw = res.content.find((b) => b.type === 'text')?.text || '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { pass: false, reason: 'judge gaf geen JSON' };
  try { return JSON.parse(m[0]); } catch { return { pass: false, reason: 'judge-JSON onleesbaar' }; }
}

async function runCase(c) {
  const failures = [];
  let r;
  try {
    r = await runChat(c.messages);
  } catch (e) {
    return { name: c.name, ok: false, failures: ['runChat fout: ' + e.message], text: '' };
  }
  for (const [desc, fn] of (c.checks || [])) {
    if (!fn(r)) failures.push('check: ' + desc);
  }
  for (const rubric of (c.judges || [])) {
    const v = await judge(rubric, r.text);
    if (!v.pass) failures.push('judge: ' + rubric + ' — ' + (v.reason || ''));
  }
  return { name: c.name, ok: failures.length === 0, failures, tools: r.toolCalls.map((t) => t.name) };
}

async function mapPool(items, fn) {
  const out = [];
  let i = 0;
  async function w() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } }
  await Promise.all(Array.from({ length: CONCURRENCY }, w));
  return out;
}

(async () => {
  console.log(`Eval: ${cases.length} cases tegen de bot...\n`);
  const results = await mapPool(cases, runCase);
  let pass = 0;
  for (const res of results) {
    if (res.ok) { pass++; console.log(`✅ ${res.name}${res.tools && res.tools.length ? '  [tools: ' + res.tools.join(', ') + ']' : ''}`); }
    else {
      console.log(`❌ ${res.name}`);
      for (const f of res.failures) console.log(`     - ${f}`);
    }
  }
  console.log(`\n${pass}/${cases.length} geslaagd.`);
  process.exit(pass === cases.length ? 0 : 1);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
