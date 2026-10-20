const { test } = require('node:test');
const assert = require('node:assert');
const { validateFeedback } = require('../src/feedback');

test('geldige up-feedback wordt geaccepteerd en omgezet', () => {
  const r = validateFeedback({ conversationId: 'c1', question: 'v', answer: 'a', rating: 'up', comment: 'top' });
  assert.equal(r.ok, true);
  assert.equal(r.value.conversation_id, 'c1');
  assert.equal(r.value.rating, 'up');
  assert.equal(r.value.comment, 'top');
});

test('geldige down zonder opmerking geeft comment null en lege question', () => {
  const r = validateFeedback({ conversationId: 'c1', answer: 'a', rating: 'down' });
  assert.equal(r.ok, true);
  assert.equal(r.value.comment, null);
  assert.equal(r.value.question, '');
});

test('onbekende rating wordt geweigerd', () => {
  const r = validateFeedback({ conversationId: 'c1', answer: 'a', rating: 'meh' });
  assert.equal(r.ok, false);
});

test('leeg antwoord wordt geweigerd', () => {
  const r = validateFeedback({ conversationId: 'c1', answer: '', rating: 'up' });
  assert.equal(r.ok, false);
});

test('ontbrekend conversationId wordt geweigerd', () => {
  const r = validateFeedback({ answer: 'a', rating: 'up' });
  assert.equal(r.ok, false);
});

// Privacy (port eazyfix-bot b934327): klantfoto's stonden in een openbare opslagmap met
// eeuwig geldige links. De gedeelde map chat-fotos is op privé gezet; in het logboek
// bewaren we het opslagpad (bucket/map/bestand), geen openbare link.
const { photoObjectPath, CHAT_BUCKET } = require('../src/feedback');

test('foto-opslagpad: bucket-relatief, zonder openbare URL, veilige mapnaam uit het gespreks-id', () => {
  assert.equal(CHAT_BUCKET, 'chat-fotos');
  const p = photoObjectPath({ conversation_id: 'c-1760990000000-ab12cd', stamp: 1760990001234, index: 0, mimeType: 'image/jpeg' });
  assert.equal(p, 'chat-fotos/c-1760990000000-ab12cd/1760990001234-0.jpg');
  const q = photoObjectPath({ conversation_id: '../../etc/passwd', stamp: 1, index: 2, mimeType: 'image/webp' });
  assert.equal(q, 'chat-fotos/.._.._etc_passwd/1-2.webp', 'geen padtrucs in de mapnaam');
  assert.doesNotMatch(p, /object\/public/);
});

// Bewaartermijn: gesprekken (chats_eazyfix_de) en foto's ouder dan 90 dagen gaan weg.
const { retentionDays, cutoffIso, CHATS_TABLE } = require('../src/retentie');

test('bewaartermijn: standaard 90 dagen, BEWAARTERMIJN_DAGEN overschrijft, grens is een ISO-tijdstip, Duitse tabel', () => {
  assert.equal(retentionDays({}), 90);
  assert.equal(retentionDays({ BEWAARTERMIJN_DAGEN: '30' }), 30);
  assert.equal(retentionDays({ BEWAARTERMIJN_DAGEN: 'x' }), 90);
  assert.equal(cutoffIso(90, Date.parse('2026-10-21T00:00:00Z')), '2026-07-23T00:00:00.000Z');
  assert.equal(CHATS_TABLE, 'chats_eazyfix_de');
});
