// Builds workflows/partner_onboarding.json and embeds scripts/transform.js in the Code node,
// so the n8n workflow and the tested logic can never drift apart.
// Run: node scripts/build_workflow.js
const fs = require('node:fs');
const path = require('node:path');

const transformSrc = fs.readFileSync(path.join(__dirname, 'transform.js'), 'utf8')
  .replace(/module\.exports[\s\S]*$/, '');

const mapCode = `${transformSrc}
// ---- n8n entry point ----
const rows = $input.all().map(item => item.json);
const runId = new Date().toISOString();
const { valid, rejected } = transform(rows, runId);
return [
  ...valid.map(v => ({ json: { kind: 'valid', run_id: runId, ...v } })),
  ...rejected.map(r => ({ json: { kind: 'rejected', ...r } })),
];`;

const summaryCode = `const items = $input.all().map(i => i.json);
const valid = items.filter(i => i.kind === 'valid').length;
const rejected = items.filter(i => i.kind === 'rejected');
const reasons = {};
for (const r of rejected) reasons[r.partner + ': ' + r.reason] = (reasons[r.partner + ': ' + r.reason] || 0) + 1;
const lines = Object.entries(reasons).map(([k, n]) => '- ' + k + ' (' + n + ')');
return [{ json: {
  run_id: items.length ? items[0].run_id : new Date().toISOString(),
  rows_read: items.length, rows_loaded: valid, rows_rejected: rejected.length,
  message: 'Partner load finished: ' + valid + ' rows loaded, ' + rejected.length + ' rejected.' + (lines.length ? '\\n' + lines.join('\\n') : ''),
} }];`;

const PG = { postgres: { id: 'pgBeloyLocal01', name: 'Postgres beloy' } };
let n = 0;
const pos = (x, y) => [x, y];
const node = (name, type, typeVersion, position, parameters, extra = {}) =>
  ({ id: `node-${++n}`, name, type, typeVersion, position, parameters, ...extra });

const readNode = (name, file, y) => node(name, 'n8n-nodes-base.readWriteFile', 1, pos(220, y),
  { operation: 'read', fileSelector: file, options: {} });
const extractNode = (name, delimiter, y) => node(name, 'n8n-nodes-base.extractFromFile', 1.1, pos(440, y),
  { operation: 'csv', options: { delimiter } });
const tagNode = (name, partner, y) => node(name, 'n8n-nodes-base.set', 3.4, pos(660, y), {
  assignments: { assignments: [{ id: `p${partner}`, name: 'partner', value: partner, type: 'string' }] },
  includeOtherFields: true, options: {} });

const nodes = [
  node('Start', 'n8n-nodes-base.manualTrigger', 1, pos(0, 300), {}),
  readNode('Read partner A file', '/data/partner_a.csv', 200),
  extractNode('Extract CSV A', ';', 200),
  tagNode('Tag partner A', 'A', 200),
  readNode('Read partner B file', '/data/partner_b.csv', 400),
  extractNode('Extract CSV B', ',', 400),
  tagNode('Tag partner B', 'B', 400),
  node('Merge partners', 'n8n-nodes-base.merge', 3.2, pos(880, 300), {}),
  node('Map and validate', 'n8n-nodes-base.code', 2, pos(1100, 300), { mode: 'runOnceForAllItems', jsCode: mapCode }),
  node('Valid row?', 'n8n-nodes-base.if', 2.2, pos(1320, 220), {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'kind-valid', leftValue: '={{ $json.kind }}', rightValue: 'valid',
                     operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and' },
    options: {} }),
  node('Load policy (safe to rerun)', 'n8n-nodes-base.postgres', 2.6, pos(1560, 120), {
    operation: 'executeQuery',
    query: 'INSERT INTO policies (policy_id, partner, customer_email, product, start_date, premium_eur) VALUES ($1, $2, $3, $4, $5::date, $6::numeric) ON CONFLICT (policy_id) DO UPDATE SET customer_email = EXCLUDED.customer_email, product = EXCLUDED.product, start_date = EXCLUDED.start_date, premium_eur = EXCLUDED.premium_eur, loaded_at = now();',
    options: { queryReplacement: '={{ [$json.policy_id, $json.partner, $json.customer_email, $json.product, $json.start_date, $json.premium_eur] }}' } },
    { credentials: PG }),
  node('Log rejected row', 'n8n-nodes-base.postgres', 2.6, pos(1560, 320), {
    operation: 'executeQuery',
    query: 'INSERT INTO rejected_rows (run_id, partner, raw_row, reason) VALUES ($1, $2, $3::jsonb, $4);',
    options: { queryReplacement: '={{ [$json.run_id, $json.partner, $json.raw_row, $json.reason] }}' } },
    { credentials: PG }),
  node('Build run summary', 'n8n-nodes-base.code', 2, pos(1320, 480), { mode: 'runOnceForAllItems', jsCode: summaryCode }),
  node('Save run', 'n8n-nodes-base.postgres', 2.6, pos(1560, 480), {
    operation: 'executeQuery',
    query: 'INSERT INTO load_runs (run_id, rows_read, rows_loaded, rows_rejected) VALUES ($1, $2, $3, $4);',
    options: { queryReplacement: '={{ [$json.run_id, $json.rows_read, $json.rows_loaded, $json.rows_rejected] }}' } },
    { credentials: PG }),
  node('Send alert to Slack', 'n8n-nodes-base.httpRequest', 4.2, pos(1780, 480), {
    method: 'POST', url: 'https://hooks.slack.com/services/REPLACE/WITH/YOUR_WEBHOOK',
    sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ text: $('Build run summary').item.json.message }) }}", options: {} },
    { disabled: true, notes: 'Enable and paste your Slack incoming webhook URL to get the run summary.' }),
];

const c = (to, index = 0) => ({ node: to, type: 'main', index });
const connections = {
  'Start': { main: [[c('Read partner A file'), c('Read partner B file')]] },
  'Read partner A file': { main: [[c('Extract CSV A')]] },
  'Extract CSV A': { main: [[c('Tag partner A')]] },
  'Tag partner A': { main: [[c('Merge partners', 0)]] },
  'Read partner B file': { main: [[c('Extract CSV B')]] },
  'Extract CSV B': { main: [[c('Tag partner B')]] },
  'Tag partner B': { main: [[c('Merge partners', 1)]] },
  'Merge partners': { main: [[c('Map and validate')]] },
  'Map and validate': { main: [[c('Valid row?'), c('Build run summary')]] },
  'Valid row?': { main: [[c('Load policy (safe to rerun)')], [c('Log rejected row')]] },
  'Build run summary': { main: [[c('Save run')]] },
  'Save run': { main: [[c('Send alert to Slack')]] },
};

const workflow = { id: 'partnerOnboarding1', name: 'Partner data onboarding', active: false, nodes, connections,
  settings: { executionOrder: 'v1' }, pinData: {} };
fs.writeFileSync(path.join(__dirname, '..', 'workflows', 'partner_onboarding.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log(`wrote workflows/partner_onboarding.json with ${nodes.length} nodes`);
