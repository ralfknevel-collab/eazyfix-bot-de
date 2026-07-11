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
