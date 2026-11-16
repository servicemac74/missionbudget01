// Node port of Budget_Build_Script_Nov2026_v2.py (openpyxl -> xlsx).
// Faithful line-for-line port of the original's logic, EXCEPT for the
// deliberate adaptations noted inline with "ADAPTED:" - the source workbook's
// T2 block structure has moved on since the original script was last run
// (2026-11-05, against a pre-versioning snapshot of dropCOSTS): the
// `_budget_ingest_analysis` reconciliation pipeline (separate project, same
// sheet) now keeps TWO T2 blocks per month - an untouched historical "v1"
// baseline (posted-date stamp 110326) and a freshly-rebuilt "v2" snapshot
// (posted-date stamp = today's build date) - where the original script
// expected exactly one. Every adaptation below is scoped to that mismatch
// alone; nothing else about the original script's behavior was changed.
//
// Usage: node build_budget_tracker.js <xlsx> <template.html> <out.html> <SESSION_KEY> [prior.html]
const XLSX = require('xlsx');
const fs = require('fs');

const [, , XLSX_PATH, TEMPLATE, OUT, SESSION_KEY, PRIOR] = process.argv;
if (!XLSX_PATH || !TEMPLATE || !OUT || !SESSION_KEY) {
  console.error('Usage: node build_budget_tracker.js <xlsx> <template.html> <out.html> <SESSION_KEY> [prior.html]');
  process.exit(1);
}
const MONTH_CODE = '11NOVEMBER', MONTH_KEY = 'nov_2026', YEAR = 2026, MON = 11;
const TITLE = 'Bills — November 2026';
const M = 'exp_actual_short_';
const WEEKS_OK = ['Wk1', 'Wk2', 'Wk3', 'Wk4', 'Wk5'];
const WK_DATES = {
  Wk1: ['2026-11-01', '2026-11-08'], Wk2: ['2026-11-09', '2026-11-15'],
  Wk3: ['2026-11-16', '2026-11-22'], Wk4: ['2026-11-23', '2026-11-30'],
  Wk5: ['2026-11-30', '2026-11-30'],
};
const WEEKS = [
  { key: 'Wk1', label: 'Wk 1', dates: '11/1–11/8' }, { key: 'Wk2', label: 'Wk 2', dates: '11/9–11/15' },
  { key: 'Wk3', label: 'Wk 3', dates: '11/16–11/22' }, { key: 'Wk4', label: 'Wk 4', dates: '11/23–11/30' },
  { key: 'Wk5', label: 'Wk 5', dates: 'No due date' },
];

function colLetterToIndex0(letter) {
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const wb = XLSX.readFile(XLSX_PATH, { cellDates: false });
const ws = wb.Sheets['dropCOSTS'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });

function load(a, b) {
  const startIdx = colLetterToIndex0(a), endIdx = colLetterToIndex0(b);
  const hdr = [];
  for (let c = startIdx; c <= endIdx; c++) hdr.push(rows[5][c]); // sheet row 6 (1-idx) = rows[5]
  const out = [];
  for (let rowIdx = 6; rowIdx <= 1098; rowIdx++) { // sheet rows 7-1099 (1-idx), matching python's range(7,1100)
    const rowArr = rows[rowIdx] || [];
    const d = {};
    for (let i = 0; i < hdr.length; i++) d[hdr[i]] = rowArr[startIdx + i];
    d._row = rowIdx + 1;
    if (d[M + 'month'] === MONTH_CODE) out.push(d);
  }
  return out;
}
const T1 = load('E', 'AJ'), T2_ALL = load('AT', 'BY'), T3 = load('CJ', 'DO');

// ADAPTED: scope T2 to the latest posted-date stamp only (the "v2" current-
// state snapshot), excluding the frozen "v1" historical baseline block the
// reconciliation pipeline also stamps with an older date. The original
// script read T2 as a single unversioned block and had no such filter.
const postedCol = M + 'posteddate';
let latestPosted = null;
for (const r of T2_ALL) {
  const p = s(r[postedCol]);
  if (p && (latestPosted === null || p > latestPosted)) latestPosted = p;
}
const T2 = T2_ALL.filter(r => s(r[postedCol]) === latestPosted);
console.log('ADAPTED T2 filter: ' + T2_ALL.length + ' total T2 rows for ' + MONTH_CODE + ', latest posted-date = ' + latestPosted + ', ' + T2.length + ' rows kept (v2 snapshot only)');

function f(x) { const n = parseFloat(x); return isNaN(n) ? 0 : n; }
function s(x) { return x === null || x === undefined ? '' : String(x); }
function subOf(r) { const v = s(r[M + 'category_sub']).trim(); return (v === '?' || v === '??') ? 'uncategorized' : v; }
function mainOf(r) { const v = s(r[M + 'category_main']).trim(); return (v === '?' || v === '??') ? 'UNCATEGORIZED' : v; }
function san(x) { return x.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
function serialToISO(serial) {
  return new Date(EXCEL_EPOCH_MS + Math.round(serial) * 86400000).toISOString().slice(0, 10);
}
function isoDate(r, wk, anomalies, label) {
  const v = r[M + 'date'];
  if (typeof v === 'number' && !isNaN(v)) return serialToISO(v);
  const str = s(v).trim();
  const m = str.match(/^00\/(\d\d)\/(\d\d|\d{4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const d = new Date(Date.UTC(YEAR, MON - 1, day));
    if (d.getUTCMonth() === MON - 1 && d.getUTCDate() === day) return d.toISOString().slice(0, 10);
  }
  anomalies.push([label, r._row, wk, str]);
  return WK_DATES[wk][0];
}

// display names
const VENDORS = [
  ['ANTHROPIC', 'Claude (Anthropic)'], ['HIGGSFIELD', 'Higgsfield AI'], ['LINODE', 'Linode'],
  ['LALAL', 'Lalal.ai'], ['SUNO', 'Suno'], ['OPENAI', 'ChatGPT (OpenAI)'], ['OBSIDIAN', 'Obsidian'],
  ['MIDJOURNEY', 'Midjourney'], ['GODADDY', 'GoDaddy Domain'], ['SIGNALWIRE', 'SignalWire'],
  ['TWILIO', 'Twilio'], ['WISPR', 'Wispr Flow'],
];
const NAMES = {
  business_realestate_supra: 'Supra (RE)', 'credit_payment_credit cards_chase_amazon': 'Chase Amazon Card',
  debt_payment_credit_cards_cap1_inez: 'Cap One — Inez', debt_payment_delta_loan: 'Delta Loan',
  debt_payment_lge_autoloan_2024chryslerpacifica: 'Pacifica Loan', debt_payment_paypal: 'PayPal Credit',
  debt_payment_synchrony_auto_chris: 'Synchrony — Chris', debt_payment_synchrony_auto_chris_late: 'Synchrony — Chris (carry)',
  debt_payment_synchrony_auto_inez: 'Synchrony — Inez', debt_payment_synchrony_auto_inez_late: 'Synchrony — Inez (carry)',
  entertainment_birthday: 'Birthday', entertainment_datenight: 'Date Night', entertainment_familynight: 'Family Night',
  entertainment_holiday: 'Holiday', entertainment_netflix: 'Netflix', entertainment_phoneapppurchases: 'App Subscriptions',
  entertainment_plexpass: 'Plex Pass', giving_tithes: 'Tithes', 'income_from charlotte': 'From Charlotte',
  'income_inez morning care': 'Inez Morning Care', income_onepath: 'OnePath Payroll', 'income_random income': 'Other Income',
  income_realestate_closing: 'RE Closing', kids_enrichment: 'Kids Enrichment', kids_school_purchases: 'School Purchases',
  med_YMCA: 'YMCA', random_fee_monthly_maintenance_fee: 'Bank Maint. Fee', 'random_not categorized_amazon': 'Amazon',
  random_overdraftfee: 'Overdraft Fee', taxes_payment_annual_federal_2024: 'Federal Taxes 2024', uncategorized: 'Uncategorized',
  'util_country-fi_autoinsurance': 'Auto Insurance', 'util_country-fi_autoinsurance_late': 'Auto Insurance (carry)',
  'util_country-fi_homeinsurance': 'Home Insurance', util_gas: 'Gas Utility', util_HVAC: 'HVAC', util_phone: 'Phone',
  util_placeholder_insurance2023: 'Life Insurance', util_power_Grandview: 'Power — Grandview',
  util_power_Grandview_late: 'Power — Grandview (carry)', util_softwareexpenses_office365: 'Office 365',
  util_trashtaxi: 'Trash Taxi', util_water: 'Water', util_zander: 'Zander Insurance',
  // ADAPTED: the life-insurance catalog split (handoff v23) replaced the old
  // shared util_placeholder_insurance2023 sub with two distinct ones. The
  // original script's display() had a special-case branch for the old sub
  // (matched on merchant text) that no T1 row maps to anymore - kept below
  // for fidelity, but these two direct entries are what actually fire now.
  util_lifeinsurance_chris: 'Chris Life Insurance', util_lifeinsurance_inez: 'Inez Life Insurance',
};
for (let n = 1; n <= 5; n++) {
  NAMES['auto_gas_wk' + n] = 'Gas — Wk' + n;
  NAMES['food_groceries_wk' + n] = 'Groceries — Wk' + n;
}
const unknown = new Map(); const flags = [];
function display(r) {
  const sub = subOf(r), mo = s(r.MINT_ORIGINALDESCRIPTION).toUpperCase();
  if (sub === 'business_hamly_vendors') {
    for (const [k, v] of VENDORS) if (mo.includes(k)) return v;
    flags.push(['vendor-unmatched', r._row, mo]); return 'Business Vendor';
  }
  if (sub === 'util_placeholder_insurance2023') {
    if (mo.includes('UNITED OF OMAHA')) return 'Chris Life Insurance';
    if (mo.includes('INEZ LIFE INSURANCE')) return 'Inez Life Insurance';
    return 'Life Insurance';
  }
  if (sub in NAMES) return NAMES[sub];
  unknown.set(sub, (unknown.get(sub) || 0) + 1); return sub;
}
const CATTAG = {
  BUSINESS_HAMLY: 'BUSINESS', BUSINESS_RE: 'BUSINESS', CREDIT: 'DEBT', DEBT: 'DEBT', UTIL: 'UTIL',
  ENTERTAINMENT: 'ENT', MED: 'MED', RANDOM: 'RANDOM', INCOME: 'INCOME',
};
// ADAPTED: entertainment_phoneapppurchases_DUPLICATE_RETIRED (handoff v23 -
// the stray pristine-template duplicate catalog row, relabeled rather than
// deleted so it stays visible in the spreadsheet) is permanently unpaid and
// never matched by any real transaction - excluded here the same way
// logistics_balancecheck already is, so it never surfaces as a phantom bill.
const EXCL_SUBS = new Set(['logistics_balancecheck', 'xxfilter_out_atypicalexpense', 'entertainment_phoneapppurchases_DUPLICATE_RETIRED']);
const EXCL_L = new Set(['TRANSFERS', 'XXFILTER']);

const anoms = [];
// ---------- BILLS ----------
const bills = []; const used = new Map(); const skipped = [];
for (const r of T2) {
  const wk = s(r[M + 'week']);
  if (!WEEKS_OK.includes(wk) || s(r[M + 'bucket']) === 'DELETEDELETE') continue;
  // ADAPTED: the original script's BILLS loop never checked EXCL_SUBS at
  // all (it only ever mattered for t1Ok/tally, since no permanently-dead
  // catalog row existed yet) - added here so entertainment_phoneapp...
  // _DUPLICATE_RETIRED (and logistics_balancecheck, defensively) never
  // surface as a phantom bill on the Bills page.
  if (EXCL_SUBS.has(s(r[M + 'category_sub']).trim())) continue;
  const lg = s(r[M + 'category_logistics']), cm = s(r[M + 'category_main']);
  const inc = lg === 'INCOME';
  let amt;
  if (inc) amt = f(r[M + 'credit']);
  else {
    if (lg === 'TRANSFERS' || ['INCOME', 'XXFILTER', 'TRANSFERS'].includes(cm)) continue;
    amt = f(r[M + 'debit']);
  }
  if (amt <= 0) { skipped.push(['zero', r._row]); continue; }
  const sub = subOf(r);
  const base = san(sub) || 'bill';
  used.set(base, (used.get(base) || 0) + 1);
  const n = used.get(base);
  const bid = n === 1 ? base : base + '_' + String(n).padStart(2, '0');
  const tag = s(r[M + 'tag_incomelevel']);
  const p2 = s(r[M + 'purchaseID2']).trim();
  const tid = s(r.TEMP_UNIQUE_ID).trim();
  bills.push({
    id: bid, uid: tid || ('r' + r._row), name: display(r), sub, week: wk,
    logistics: lg, priority: s(r[M + 'priority']), date: isoDate(r, wk, anoms, 'bill'),
    amount: Math.round(amt * 100) / 100, paid: tag === 'income_0_PAID', tier: tag === 'income_2_MED' ? 'contingent' : 'firm',
    type: (p2 === 'automated' || p2 === 'auto') ? 'automated' : (p2 === 'weekly' ? 'weekly' : 'manual'), cat: CATTAG[mainOf(r)] || 'other',
    late: sub.includes('_late'), is_income: inc, merchant_desc: s(r.MINT_ORIGINALDESCRIPTION).trim(),
    _row: r._row,
  });
}

// ---------- ID STABILIZATION (spec 2.1) ----------
let stabReport = {};
if (PRIOR) {
  const pt = fs.readFileSync(PRIOR, 'utf8').replace(/\r\n/g, '\n'); // PRIOR may be CRLF (saved on Windows); normalize before regex matching
  const pm = pt.match(/^var BILLS = (\[[\s\S]*?\]);\n\/\/ \[END INJECT BILLS\]/m);
  const prior = JSON.parse(pm[1]);
  const realuid = b => /^r\d+$/.test(b.uid) ? null : b.uid;
  const passes = [
    b => realuid(b),
    b => JSON.stringify([b.sub, b.name, b.week, b.amount, b.merchant_desc]),
    b => JSON.stringify([b.sub, b.name, b.amount, b.merchant_desc]),
    b => JSON.stringify([b.sub, b.name, b.merchant_desc, b.week]),
    b => JSON.stringify([b.sub, b.name, b.merchant_desc]),
    b => JSON.stringify([b.sub, b.week, b.amount]),
    b => JSON.stringify([b.sub, b.week]),
    b => JSON.stringify([b.sub, b.is_income, b.name]),
  ];
  let free = prior.map((_, i) => i);
  const assign = new Map();
  for (const fn of passes) {
    for (let i = 0; i < bills.length; i++) {
      if (assign.has(i)) continue;
      const k = fn(bills[i]);
      if (k === null || k === undefined) continue;
      const idx = free.findIndex(j => fn(prior[j]) === k);
      if (idx !== -1) { assign.set(i, free[idx]); free.splice(idx, 1); }
    }
  }
  const usedIds = new Set(prior.map(p => p.id));
  const newids = []; const changed = [];
  for (let i = 0; i < bills.length; i++) {
    const nb = bills[i];
    if (assign.has(i)) {
      const pb = prior[assign.get(i)]; nb.id = pb.id;
      const ch = ['week', 'amount', 'paid', 'date', 'name'].filter(fld => pb[fld] !== nb[fld]);
      if (ch.length) changed.push([nb.id, Object.fromEntries(ch.map(fld => [fld, [pb[fld], nb[fld]]]))]);
    } else {
      const base = san(nb.sub) || 'bill'; let n = 2; let cand = base;
      while (usedIds.has(cand)) { cand = base + '_' + String(n).padStart(2, '0'); n++; }
      nb.id = cand; usedIds.add(cand); newids.push([cand, nb.name, nb.week, nb.amount]);
    }
  }
  const ids = bills.map(b => b.id);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate ids after stabilization');
  stabReport = {
    matched: assign.size, new: newids,
    removed: free.map(j => [prior[j].id, prior[j].name, prior[j].week, prior[j].amount]),
    changed,
  };
}

// ---------- WEEK_DATA ----------
const cards = {}; for (const w of WEEKS_OK) cards[w] = [];
function t1Ok(r) {
  if (!WEEKS_OK.includes(s(r[M + 'week']))) return false;
  if (EXCL_L.has(s(r[M + 'category_logistics'])) || EXCL_L.has(s(r[M + 'category_main']))) return false;
  if (EXCL_SUBS.has(s(r[M + 'category_sub']).trim())) return false;
  const t = s(r.TEMP_UNIQUE_ID).trim();
  return Boolean(t) && !t.endsWith('.000');
}
for (const r of T1) {
  if (!t1Ok(r)) continue;
  const wk = s(r[M + 'week']);
  cards[wk].push({
    id: 't1-' + s(r.TEMP_UNIQUE_ID).trim(), source: 'actual', week: wk,
    date: isoDate(r, wk, anoms, 't1card'), cat_logistics: s(r[M + 'category_logistics']), cat_sub: subOf(r),
    cat_main: mainOf(r), debit: f(r[M + 'debit']), credit: f(r[M + 'credit']),
    account: s(r.ACCOUNT_NAME), acct: s(r.ACCOUNT_NAME), description: s(r[M + 'description']),
    mint_orig: s(r.MINT_ORIGINALDESCRIPTION), purch2: s(r[M + 'purchaseID2']), schedule: s(r[M + 'schedule']),
    tag_income: s(r[M + 'tag_incomelevel']), tier: 'firm', _row: r._row, _k: 0,
  });
}
for (const r of T2) {
  const wk = s(r[M + 'week']);
  if (!WEEKS_OK.includes(wk) || s(r[M + 'bucket']) === 'DELETEDELETE') continue;
  const lg = s(r[M + 'category_logistics']), cm = s(r[M + 'category_main']);
  if (EXCL_L.has(lg) || EXCL_L.has(cm)) continue;
  if (EXCL_SUBS.has(s(r[M + 'category_sub']).trim())) continue;
  const inc = lg === 'INCOME';
  if ((inc ? f(r[M + 'credit']) : f(r[M + 'debit'])) <= 0) continue;
  const tid = s(r.TEMP_UNIQUE_ID).trim();
  const tag = s(r[M + 'tag_incomelevel']);
  cards[wk].push({
    id: tid ? ('t2-' + tid + '-r' + r._row) : ('t2-r' + r._row), source: 'theoretical', week: wk,
    date: isoDate(r, wk, [], 't2card'), cat_logistics: lg, cat_sub: subOf(r), cat_main: mainOf(r),
    debit: f(r[M + 'debit']), credit: f(r[M + 'credit']), account: '', acct: '',
    description: s(r[M + 'description']), mint_orig: s(r.MINT_ORIGINALDESCRIPTION), purch2: s(r[M + 'purchaseID2']),
    schedule: s(r[M + 'schedule']), tag_income: tag, tier: tag === 'income_2_MED' ? 'contingent' : 'firm',
    _row: r._row, _k: 1,
  });
}
for (const w of WEEKS_OK) {
  cards[w].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a._k - b._k || a._row - b._row));
  for (const c of cards[w]) { delete c._row; delete c._k; }
}
const catmap = {};
for (const w of WEEKS_OK) for (const c of cards[w]) (catmap[c.cat_main] = catmap[c.cat_main] || new Set()).add(c.cat_sub);
const CAT_MAP = {}; for (const k of Object.keys(catmap).sort()) CAT_MAP[k] = [...catmap[k]].sort();
// balances
const bal = {};
for (const r of T1) {
  if (s(r[M + 'category_sub']).trim() === 'logistics_balancecheck' && r.ACCOUNT_NAME && typeof r[M + 'date'] === 'number') {
    const a = s(r.ACCOUNT_NAME);
    if (!bal[a] || r[M + 'date'] >= bal[a][0]) bal[a] = [r[M + 'date'], f(r['balance logistics'])];
  }
}
const ACCT = {}; for (const a of Object.keys(bal)) ACCT[a] = Math.round(bal[a][1] * 100) / 100;
const WEEK_DATA = { week_dates: Object.fromEntries(WEEKS_OK.map(w => [w, WK_DATES[w]])), weeks: cards };

// ---------- RPT ----------
function tally(dataRows, kind) {
  const out = {}; const incFlag = {};
  for (const r of dataRows) {
    let lg = s(r[M + 'category_logistics']), cm = mainOf(r);
    if (!WEEKS_OK.includes(s(r[M + 'week'])) && kind !== 'actual') continue;
    if (s(r[M + 'bucket']) === 'DELETEDELETE') continue;
    if (EXCL_L.has(lg) || EXCL_L.has(cm)) continue;
    let sub = subOf(r);
    if (EXCL_SUBS.has(sub)) continue;
    if (kind === 'actual') {
      const t = s(r.TEMP_UNIQUE_ID).trim();
      if (!t || t.endsWith('.000')) continue;
    }
    let inc = lg === 'INCOME';
    if (kind === 'actual' && !s(r[M + 'category_main']).trim()) {
      if (f(r[M + 'credit']) > 0 && f(r[M + 'debit']) === 0) { inc = true; cm = 'INCOME'; }
      else cm = 'UNCATEGORIZED';
      sub = 'uncategorized';
    }
    const amt = inc ? f(r[M + 'credit']) : f(r[M + 'debit']);
    if (amt <= 0) continue;
    let key = kind === 'actual' ? 'actual' : (kind === 'frozen' ? 'frozen' : null);
    if (kind === 'updated') key = s(r[M + 'tag_incomelevel']) === 'income_2_MED' ? 'contingent' : 'updated';
    out[cm] = out[cm] || {}; out[cm][sub] = out[cm][sub] || { actual: 0, updated: 0, frozen: 0, contingent: 0 };
    out[cm][sub][key] += amt;
    incFlag[cm] = incFlag[cm] || inc;
  }
  return [out, incFlag];
}
const [ta, ia] = tally(T1, 'actual'), [tu, iu] = tally(T2, 'updated'), [tf, ifl] = tally(T3, 'frozen');
const cats = [...new Set([...Object.keys(ta), ...Object.keys(tu), ...Object.keys(tf)])].sort();
const isinc = {};
for (const d of [ia, iu, ifl]) for (const k of Object.keys(d)) isinc[k] = isinc[k] || d[k];
const categories = [];
for (const c of cats) {
  const subs = [...new Set([...Object.keys(ta[c] || {}), ...Object.keys(tu[c] || {}), ...Object.keys(tf[c] || {})])].sort();
  const sl = subs.map(sb => ({
    sub: sb,
    actual: Math.round(((ta[c] || {})[sb]?.actual || 0) * 100) / 100,
    updated: Math.round(((tu[c] || {})[sb]?.updated || 0) * 100) / 100,
    frozen: Math.round(((tf[c] || {})[sb]?.frozen || 0) * 100) / 100,
    contingent: Math.round(((tu[c] || {})[sb]?.contingent || 0) * 100) / 100,
  }));
  categories.push({
    cat: c, is_income: Boolean(isinc[c]),
    actual: Math.round(sl.reduce((s2, x) => s2 + x.actual, 0) * 100) / 100,
    updated: Math.round(sl.reduce((s2, x) => s2 + x.updated, 0) * 100) / 100,
    frozen: Math.round(sl.reduce((s2, x) => s2 + x.frozen, 0) * 100) / 100,
    contingent: Math.round(sl.reduce((s2, x) => s2 + x.contingent, 0) * 100) / 100,
    subs: sl,
  });
}
function tot(field, inc) { return Math.round(categories.filter(c => c.is_income === inc).reduce((s2, c) => s2 + c[field], 0) * 100) / 100; }
const exp = { actual: tot('actual', false), updated: tot('updated', false), frozen: tot('frozen', false) };
const inc = { actual: tot('actual', true), updated: tot('updated', true), frozen: tot('frozen', true) };
const RPT = {
  month: 'November 2026', generated: new Date().toISOString().slice(0, 10), weekCurrent: 'Wk1',
  totals: {
    expense: exp, income: inc, net: Object.fromEntries(Object.keys(exp).map(k => [k, Math.round((inc[k] - exp[k]) * 100) / 100])),
    contingent: { income: tot('contingent', true), expense: tot('contingent', false) },
  },
  categories,
};

// ---------- INJECT ----------
let t = fs.readFileSync(TEMPLATE, 'utf8');
const tmplMatches = (t.match(/<!-- template v17 -->/g) || []).length;
if (tmplMatches !== 1) throw new Error('expected exactly 1 "<!-- template v17 -->" marker, found ' + tmplMatches);
const clean = bills.map(({ _row, ...rest }) => rest);
function J(o) { return JSON.stringify(o, null, 2); }
function inject(txt, name, body, prefix) {
  prefix = prefix || '';
  const pat = new RegExp('^\\s*// \\[BEGIN INJECT ' + name + '\\]\\n[\\s\\S]*?^// \\[END INJECT ' + name + '\\]', 'm');
  const matches = txt.match(new RegExp(pat.source, 'gm'));
  if (!matches || matches.length !== 1) throw new Error('inject ' + name + ': expected 1 match, found ' + (matches ? matches.length : 0));
  const repl = prefix + '// [BEGIN INJECT ' + name + ']\n' + body + '\n// [END INJECT ' + name + ']';
  return txt.replace(pat, repl);
}
t = inject(t, 'BILLS', 'var BILLS = ' + J(clean) + ';');
t = inject(t, 'WEEKS', 'var WEEKS = ' + J(WEEKS) + ';');
t = inject(t, 'REPORT', '  var RPT = ' + J(RPT) + ';', '  ');
t = inject(t, 'WEEK_DATA', 'var WEEK_DATA = ' + J(WEEK_DATA) + ';\nvar CAT_MAP   = ' + J(CAT_MAP) + ';\nvar ACCT_BALANCES = ' + J(ACCT) + ';');
function sub1(txt, pat, rep) {
  const matches = txt.match(new RegExp(pat.source, (pat.flags || '') + 'g'));
  if (!matches || matches.length !== 1) throw new Error('sub1 ' + pat + ': expected 1 match, found ' + (matches ? matches.length : 0));
  return txt.replace(pat, rep);
}
t = sub1(t, /<title>Bills — Month YYYY<\/title>/, '<title>' + TITLE + '</title>');
t = sub1(t, /<div class="hdr-title">Bills — Month YYYY<\/div>/, '<div class="hdr-title">' + TITLE + '</div>');
t = sub1(t, /var SESSION_KEY = 'budget\/bills\/MONTH_YYYY';/, "var SESSION_KEY = '" + SESSION_KEY + "';");
t = sub1(t, /var MONTH_KEY = 'MONTH_YYYY';/, "var MONTH_KEY = '" + MONTH_KEY + "';");
t = sub1(t, /var MONTH_CODE = '00MONTH';/, "var MONTH_CODE = '" + MONTH_CODE + "';");
t = sub1(t, /var STAGED_MONTH_KEY = 'MONTH_YYYY';/, "var STAGED_MONTH_KEY = '" + MONTH_KEY + "';");
t = sub1(t, /var STAGED_MONTH_CODE = '00MONTH';/, "var STAGED_MONTH_CODE = '" + MONTH_CODE + "';");
t = sub1(t, /var NOTES_MONTH_KEY = 'MONTH_YYYY';/, "var NOTES_MONTH_KEY = '" + MONTH_KEY + "';");
fs.writeFileSync(OUT, t, 'utf8');

// ---------- VALIDATION ----------
function counter(arr) { const m = {}; for (const x of arr) m[x] = (m[x] || 0) + 1; return m; }
console.log('BILLS', clean.length, counter(clean.map(b => b.logistics)), counter(clean.map(b => b.week)));
console.log('paid', clean.filter(b => b.paid).length, 'contingent', clean.filter(b => b.tier === 'contingent').map(b => [b.id, b.amount, b.week]));
const eTot = clean.filter(b => !b.is_income && b.tier === 'firm').reduce((s2, b) => s2 + b.amount, 0);
const iTot = clean.filter(b => b.is_income && b.tier === 'firm').reduce((s2, b) => s2 + b.amount, 0);
console.log('T2 firm exp ' + eTot.toFixed(2) + ' inc ' + iTot.toFixed(2) + ' ; RPT updated exp ' + exp.updated + ' inc ' + inc.updated);
console.log('RPT totals', JSON.stringify(RPT.totals));
console.log('cards per week', Object.fromEntries(WEEKS_OK.map(w => [w, [cards[w].filter(c => c.source === 'actual').length, cards[w].filter(c => c.source === 'theoretical').length]])));
console.log('uncategorized T1 cards', Object.values(cards).flat().filter(c => c.source === 'actual' && c.cat_sub === 'uncategorized').length);
console.log('ACCT', ACCT);
console.log('unknown names', Object.fromEntries(unknown)); console.log('flags', flags); console.log('skipped', skipped);
console.log('date anomalies', anoms);
const dupKeys = counter(clean.map(b => JSON.stringify([b.sub, b.week, b.logistics])));
console.log('duplicates', Object.entries(dupKeys).filter(([, v]) => v > 1));
const pw = [];
for (const w of WEEKS_OK) {
  const [lo, hi] = WK_DATES[w];
  for (const c of cards[w]) if (!(lo <= c.date && c.date <= hi)) pw.push([c.source[0], w, c.date, c.cat_sub, c.debit || c.credit]);
}
console.log('date-in-week violations', pw.length); pw.forEach(x => console.log('  ', x));
console.log('STAB', JSON.stringify(stabReport, null, 1));
console.log('T1 vs T2-paid: T1 exp ' + exp.actual + ' inc ' + inc.actual + ' | T2 paid exp ' +
  clean.filter(b => b.paid && !b.is_income).reduce((s2, b) => s2 + b.amount, 0).toFixed(2) + ' inc ' +
  clean.filter(b => b.paid && b.is_income).reduce((s2, b) => s2 + b.amount, 0).toFixed(2));
