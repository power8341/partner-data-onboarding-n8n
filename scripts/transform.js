// Mapping and validation rules for partner policy files.
// The same function is embedded in the n8n Code node (see scripts/build_workflow.js),
// so the logic tested here is exactly what runs in n8n.
const MAPPINGS = {
  A: { columns: { ref: 'policy_id', mail: 'customer_email', offer: 'product', start: 'start_date', price: 'premium_eur' }, dateFormat: 'DD/MM/YYYY', decimal: ',' },
  B: { columns: { PolicyNumber: 'policy_id', Email: 'customer_email', Product: 'product', StartDate: 'start_date', AnnualPremium: 'premium_eur' }, dateFormat: 'YYYY-MM-DD', decimal: '.' },
};

function toIsoDate(value, format) {
  const s = String(value || '').trim();
  let y, m, d;
  if (format === 'DD/MM/YYYY') {
    const p = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!p) return null; [, d, m, y] = p;
  } else {
    const p = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!p) return null; [, y, m, d] = p;
  }
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  // reject impossible dates like 31/02 that JavaScript would roll over
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${m}-${d}`;
}

function transform(rows, runId) {
  const valid = [], rejected = [], seen = new Set();
  for (const row of rows) {
    const { partner, ...raw } = row;
    const map = MAPPINGS[partner];
    const reject = (reason) => rejected.push({ run_id: runId, partner: partner || 'unknown', raw_row: JSON.stringify(raw), reason });
    if (!map) { reject('unknown partner'); continue; }

    const r = {};
    for (const [src, target] of Object.entries(map.columns)) r[target] = raw[src] === undefined ? '' : String(raw[src]).trim();

    if (!r.policy_id) { reject('missing policy id'); continue; }
    if (!r.customer_email) { reject('missing email'); continue; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.customer_email)) { reject('invalid email'); continue; }
    const date = toIsoDate(r.start_date, map.dateFormat);
    if (!date) { reject('invalid start date'); continue; }
    const premium = Number(r.premium_eur.replace(map.decimal, '.'));
    if (!Number.isFinite(premium) || premium <= 0) { reject('premium must be greater than 0'); continue; }
    if (seen.has(r.policy_id)) { reject('duplicate policy id in file'); continue; }
    seen.add(r.policy_id);

    valid.push({ policy_id: r.policy_id, partner, customer_email: r.customer_email.toLowerCase(),
                 product: r.product, start_date: date, premium_eur: Math.round(premium * 100) / 100 });
  }
  return { valid, rejected };
}

module.exports = { transform, toIsoDate, MAPPINGS };
