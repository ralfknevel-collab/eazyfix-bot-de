const { test } = require('node:test');
const assert = require('node:assert');
const { BASE_SYSTEM_PROMPT, IMAGE_ANALYSIS_PROMPT, IMAGE_DIAGNOSE_PROMPT } = require('../src/persona');

test('persona-prompts geladen en niet leeg', () => {
  assert.ok(typeof BASE_SYSTEM_PROMPT === 'string' && BASE_SYSTEM_PROMPT.length > 500);
  assert.ok(typeof IMAGE_ANALYSIS_PROMPT === 'string' && IMAGE_ANALYSIS_PROMPT.length > 500);
  assert.ok(typeof IMAGE_DIAGNOSE_PROMPT === 'string' && IMAGE_DIAGNOSE_PROMPT.length > 200);
});

test('houtrot-identiteit aanwezig in basis-prompt', () => {
  assert.match(BASE_SYSTEM_PROMPT, /EAZYFIX®/);
  assert.match(BASE_SYSTEM_PROMPT, /houtrot/i);
  assert.match(BASE_SYSTEM_PROMPT, /\+31 \(0\)85 201 201 1/);
});

test('analyse-prompt behoudt machine-leesbare tags en verplicht ernst-woord', () => {
  assert.match(IMAGE_ANALYSIS_PROMPT, /PRODUCTS:/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /FLOW:/);
  assert.match(IMAGE_ANALYSIS_PROMPT, /"licht", "matig" of "ernstig"/);
  // Het rigide format is vervangen door een warm, doorlopend bericht.
  assert.doesNotMatch(IMAGE_ANALYSIS_PROMPT, /Wat ik zie:/);
});

test('analyse-prompt dwingt consistente ernst af en verbiedt naar de foto-analyse te verwijzen', () => {
  assert.match(IMAGE_ANALYSIS_PROMPT, /consistent/i);
  assert.match(IMAGE_ANALYSIS_PROMPT, /foto-analyse/i);
});

test('diagnose-prompt vraagt geldig JSON met de verwachte velden', () => {
  assert.match(IMAGE_DIAGNOSE_PROMPT, /JSON/);
  assert.match(IMAGE_DIAGNOSE_PROMPT, /"duidelijk"/);
  assert.match(IMAGE_DIAGNOSE_PROMPT, /"schade_type"/);
  assert.match(IMAGE_DIAGNOSE_PROMPT, /"zoektermen"/);
});
