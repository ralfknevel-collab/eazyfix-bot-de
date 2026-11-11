const { test } = require('node:test');
const assert = require('node:assert');
const m = require('../src/mailchimp');

// Lijsten volgens Nina (Teams, 11-11-2026): AI Chat gedeeld met NL met label Land: DE;
// nieuwsbrief "Eazyfix Newsletter [de]" met Landcode DE en bevestigingsmail.
const KEY = ['0123456789abcdef', '0123456789abcdef'].join('') + '-us21'; // nep-sleutel in stukken (GitHub push protection)

test('mailchimpEnabled: alleen met geldige sleutel; standaardlijsten AI Chat en Newsletter [de]', () => {
  assert.equal(m.mailchimpEnabled({}), false);
  assert.equal(m.mailchimpEnabled({ MAILCHIMP_API_KEY: KEY }), true);
  assert.deepEqual(m.lijsten({}), { aichat: 'c53276f7d7', nieuwsbrief: '265659b591' });
  assert.notEqual(m.lijsten({}).nieuwsbrief, 'c2fc5605e9', 'niet de Nederlandse nieuwsbrief');
});

test('bouwAanmeldingen: AI Chat met Land: DE direct; Duitse nieuwsbrief met bevestigingsmail en Landcode DE', () => {
  const zonder = m.bouwAanmeldingen({ naam: 'Max Muster', email: 'max@example.de', nieuwsbrief: false }, {});
  assert.deepEqual(zonder, [{ lijst: 'c53276f7d7', status: 'subscribed', merge_fields: { FNAME: 'Max', LNAME: 'Muster' }, tags: ['AI-chat', 'Land: DE'] }]);
  const met = m.bouwAanmeldingen({ naam: 'Max Muster', email: 'max@example.de', nieuwsbrief: true }, {});
  assert.deepEqual(met[0].tags, ['AI-chat', 'Land: DE', 'Marketing akkoord']);
  assert.deepEqual(met[1], { lijst: '265659b591', status: 'pending', merge_fields: { FNAME: 'Max', LNAME: 'Muster', MMERGE5: 'ja (AI-chat)', COUNTRY: 'DE' }, tags: ['Bron: AI-chat', 'Land: DE'] });
});
