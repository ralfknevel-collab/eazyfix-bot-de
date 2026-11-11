const { test } = require('node:test');
const assert = require('node:assert');
const m = require('../src/mailchimp');

// Port eazyfix-bot (november 2026). De Duitse lijsten volgen nog van Nina: zonder
// lijst-id staat de koppeling uit en blijven inschrijvingen in Supabase wachten.
const KEY = ['0123456789abcdef', '0123456789abcdef'].join('') + '-us21'; // nep-sleutel in stukken (GitHub push protection)

test('mailchimpEnabled: alleen met geldige sleutel én Duitse AI Chat-lijst', () => {
  assert.equal(m.mailchimpEnabled({}), false);
  assert.equal(m.mailchimpEnabled({ MAILCHIMP_API_KEY: KEY }), false, 'geen standaardlijst: nooit per ongeluk op de NL-lijst');
  assert.equal(m.mailchimpEnabled({ MAILCHIMP_API_KEY: KEY, MAILCHIMP_LIST_AICHAT: 'abc123def0' }), true);
  assert.equal(m.LIJST_AICHAT, '');
  assert.notEqual(m.lijsten({}).aichat, 'c53276f7d7', 'niet de Nederlandse lijst');
});

test('bouwAanmeldingen: AI Chat direct, nieuwsbrief met bevestigingsmail en label Land: DE', () => {
  const env = { MAILCHIMP_LIST_AICHAT: 'a1', MAILCHIMP_LIST_NIEUWSBRIEF: 'n1' };
  const zonder = m.bouwAanmeldingen({ naam: 'Max Muster', email: 'max@example.de', nieuwsbrief: false }, env);
  assert.deepEqual(zonder, [{ lijst: 'a1', status: 'subscribed', merge_fields: { FNAME: 'Max', LNAME: 'Muster' }, tags: ['AI-chat'] }]);
  const met = m.bouwAanmeldingen({ naam: 'Max Muster', email: 'max@example.de', nieuwsbrief: true }, env);
  assert.deepEqual(met[0].tags, ['AI-chat', 'Marketing akkoord']);
  assert.deepEqual(met[1], { lijst: 'n1', status: 'pending', merge_fields: { FNAME: 'Max', LNAME: 'Muster' }, tags: ['Bron: AI-chat', 'Land: DE'] });
  const geenNieuwsbriefLijst = m.bouwAanmeldingen({ naam: 'Max', email: 'max@example.de', nieuwsbrief: true }, { MAILCHIMP_LIST_AICHAT: 'a1' });
  assert.equal(geenNieuwsbriefLijst.length, 1, 'zonder nieuwsbrieflijst alleen AI Chat (met label Marketing akkoord)');
});
