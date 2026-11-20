const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { transform, toIsoDate } = require('../scripts/transform');

function readCsv(file, sep, partner) {
  const [header, ...lines] = fs.readFileSync(path.join(__dirname, '..', 'data', file), 'utf8').trim().split(/\r?\n/);
  const cols = header.split(sep);
  return lines.map(l => { const v = l.split(sep); return Object.fromEntries([['partner', partner], ...cols.map((c, i) => [c, v[i]])]); });
}

test('dates: both formats parse, impossible dates are rejected', () => {
  assert.equal(toIsoDate('31/12/2026', 'DD/MM/YYYY'), '2026-12-31');
  assert.equal(toIsoDate('2026-12-31', 'YYYY-MM-DD'), '2026-12-31');
  assert.equal(toIsoDate('31/02/2026', 'DD/MM/YYYY'), null);
  assert.equal(toIsoDate('2026-13-01', 'YYYY-MM-DD'), null);
});

test('partner A comma decimals are converted', () => {
  const { valid } = transform([{ partner: 'A', ref: 'A-1', mail: 'x@y.fr', offer: 'Home', start: '01/01/2026', price: '12,50' }], 'r');
  assert.equal(valid[0].premium_eur, 12.5);
});

test('sample files: 32 valid rows and 8 rejected rows with reasons', () => {
  const rows = [...readCsv('partner_a.csv', ';', 'A'), ...readCsv('partner_b.csv', ',', 'B')];
  const { valid, rejected } = transform(rows, 'test');
  assert.equal(valid.length, 32);
  assert.equal(rejected.length, 8);
  const reasons = rejected.map(r => r.reason).sort();
  assert.deepEqual(reasons, ['duplicate policy id in file', 'duplicate policy id in file', 'invalid email',
    'invalid start date', 'invalid start date', 'missing email', 'premium must be greater than 0', 'premium must be greater than 0']);
});

test('unknown partner is rejected, not loaded', () => {
  const { valid, rejected } = transform([{ partner: 'Z', id: '1' }], 'r');
  assert.equal(valid.length, 0);
  assert.equal(rejected[0].reason, 'unknown partner');
});
