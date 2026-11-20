// Runs three actual extracted n8n Code node scripts with a tiny fake n8n context.
// Uses fictional fixtures only; does not connect to Airtable or Vapi.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.join(__dirname, '..');
const sample = JSON.parse(fs.readFileSync(path.join(root, 'examples/fictional-records.json')));
const asItems = values => values.map(json => ({ json }));
const runCode = (filename, context) => {
  const code = fs.readFileSync(path.join(root, 'scripts', filename), 'utf8');
  return vm.runInNewContext(`(function(){${code}\n})()`, context, {timeout: 2000});
};
const buyerItems = asItems(sample.buyers);
const dealItems = asItems(sample.listings);
const match = runCode('01_match_buyers_to_listings.js', {
  $: name => ({all: () => name === 'Buyer Record Search' ? buyerItems : dealItems})
});
assert.strictEqual(match.length, 1, 'Only one fictional buyer should match');
assert.strictEqual(match[0].json.topDeals[0].dealId, 'listing-example-002', 'Priority ranking');
const prep = runCode('02_prepare_call_data.js', {
  $: () => ({all: () => match})
});
assert.strictEqual(prep.length, 1);
assert.strictEqual(prep[0].json.selectedDealCount, 2);
assert.match(prep[0].json.agentInstructions, /Sample property B/);
const normalized = runCode('03_normalize_phone.js', { $input: {all: () => prep} });
assert.strictEqual(normalized.length, 1);
assert.strictEqual(normalized[0].json.phone, '+14155550100');
console.log('PASS: matching, ranking, briefing, and basic US phone normalization');
