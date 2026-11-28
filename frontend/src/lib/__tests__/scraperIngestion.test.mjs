import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';

test('ingestAuditedDividends verifies all 4 scraper ingestion & guard outcomes against local PostgREST mock', async () => {
  const store = [
    {
      id: 'seed-confirmed-asels',
      symbol: 'ASELS.IS',
      ex_date: '2026-12-01',
      payment_date: '2026-12-03',
      amount: 1.85,
      currency: 'TRY',
      frequency: 'Semi-Annual',
      is_confirmed: true,
      source: 'KAP_OFFICIAL',
    },
  ];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET' && url.pathname.endsWith('/asset_dividends')) {
        const sym = url.searchParams.get('symbol')?.replace(/^eq\./, '');
        const ex = url.searchParams.get('ex_date')?.replace(/^eq\./, '');
        const matches = store.filter((r) => (!sym || r.symbol === sym) && (!ex || r.ex_date === ex));
        const accept = req.headers['accept'] || '';
        if (accept.includes('application/vnd.pgrst.object+json')) {
          if (matches.length === 0) {
            res.statusCode = 406;
            res.end(JSON.stringify({ message: '0 rows' }));
          } else if (matches.length > 1) {
            res.statusCode = 406;
            res.end(JSON.stringify({
              code: 'PGRST116',
              details: `Results contain ${matches.length} rows, but 1 was requested`,
              message: 'JSON object requested, multiple (or no) rows returned'
            }));
          } else {
            res.statusCode = 200;
            res.end(JSON.stringify(matches[0]));
          }
          return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify(matches));
        return;
      }

      if ((req.method === 'POST' || req.method === 'PATCH') && url.pathname.endsWith('/asset_dividends')) {
        const incoming = JSON.parse(body || '{}');
        const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');
        const rows = Array.isArray(incoming) ? incoming : [incoming];
        for (const r of rows) {
          const idx = idFilter
            ? store.findIndex((x) => x.id === idFilter)
            : store.findIndex((x) => x.symbol === r.symbol && x.ex_date === r.ex_date);
          if (idx >= 0) {
            store[idx] = { ...store[idx], ...r };
          } else {
            store.push({ id: `row-${store.length + 1}`, ...r });
          }
        }
        res.statusCode = req.method === 'PATCH' ? 200 : 201;
        res.end(JSON.stringify(rows));
        return;
      }

      res.statusCode = 200;
      res.end('[]');
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const mockUrl = `http://127.0.0.1:${port}`;

  process.env.SUPABASE_URL = mockUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-service-role-key';

  try {
    const { ingestAuditedDividends } = await import('../../../scripts/scrape_bist_dividends_playwright.mjs');
    const mockDb = createClient(mockUrl, 'local-test-service-role-key');

    const extractedRecords = [
      // 1. Confirmed Fintables record (already has .IS suffix -> must NOT become FROTO.IS.IS)
      {
        symbol: 'FROTO.IS',
        exDate: '2026-11-26',
        payDate: '2026-11-30',
        hasDeclaredPayDate: true,
        grossDps: 3.61,
        netDps: 3.07,
        hasDeclaredNet: true,
        source: 'FINTABLES_DIVIDEND_CALENDAR',
      },
      // 2. Gross-only İş Yatırım record -> must save amount = 0 and is_confirmed = false
      {
        symbol: 'TUPRS',
        exDate: '2026-12-10',
        payDate: '2026-12-14',
        hasDeclaredPayDate: false,
        grossDps: 8.5,
        netDps: null,
        hasDeclaredNet: false,
        source: 'ISYATIRIM_CORPORATE_ACTIONS',
      },
      // 3. Unconfirmed scrape for already-confirmed ASELS -> must NOT downgrade seed-confirmed-asels
      {
        symbol: 'ASELS',
        exDate: '2026-12-01',
        payDate: '2026-12-03',
        hasDeclaredPayDate: false,
        grossDps: 2.2,
        netDps: null,
        hasDeclaredNet: false,
        source: 'ISYATIRIM_CORPORATE_ACTIONS',
      },
    ];

    const summary = await ingestAuditedDividends(extractedRecords, mockDb);
    assert.equal(summary.extracted, 3);
    assert.equal(summary.audited, 3);
    assert.equal(summary.failed, 0);

    // Outcome 2: Exactly one .IS suffix
    const froto = store.find((r) => r.symbol === 'FROTO.IS');
    assert.ok(froto, 'FROTO.IS must exist with exactly one .IS suffix');
    assert.equal(froto.is_confirmed, true);
    assert.equal(froto.amount, 3.07);

    // Outcome 3: Gross-only record stays unconfirmed with zero creditable amount
    const tuprs = store.find((r) => r.symbol === 'TUPRS.IS');
    assert.ok(tuprs, 'TUPRS.IS must exist with canonical .IS suffix');
    assert.equal(tuprs.is_confirmed, false);
    assert.equal(tuprs.amount, 0);
    assert.equal(tuprs.source, 'ISYATIRIM_CORPORATE_ACTIONS_GROSS_ONLY_UNCONFIRMED');

    // Outcome 4: Existing confirmed record survives unconfirmed scrape unchanged
    const asels = store.find((r) => r.id === 'seed-confirmed-asels');
    assert.equal(asels.is_confirmed, true);
    assert.equal(asels.amount, 1.85);
    assert.equal(asels.source, 'KAP_OFFICIAL');

    // Outcome 5: Later confirmed Fintables record upgrades the gross-only TUPRS.IS placeholder
    const upgradeSummary = await ingestAuditedDividends([
      {
        symbol: 'TUPRS',
        exDate: '2026-12-10',
        payDate: '2026-12-14',
        hasDeclaredPayDate: true,
        grossDps: 8.5,
        netDps: 7.225,
        hasDeclaredNet: true,
        source: 'FINTABLES_DIVIDEND_CALENDAR',
      },
    ], mockDb);
    assert.equal(upgradeSummary.audited, 1);
    assert.equal(upgradeSummary.failed, 0);
    const tuprsUpgraded = store.find((r) => r.symbol === 'TUPRS.IS');
    assert.equal(tuprsUpgraded.is_confirmed, true);
    assert.equal(tuprsUpgraded.amount, 7.225);
    assert.equal(tuprsUpgraded.source, 'FINTABLES_DIVIDEND_CALENDAR');
  } finally {
    server.close();
  }
});

test('parseDateToIso and parseFintablesTableData handle Turkish month dates and th+td sticky columns', async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-test-service-role-key';

  const { parseDateToIso, parseFintablesTableData } = await import('../../../scripts/scrape_bist_dividends_playwright.mjs');

  assert.equal(parseDateToIso('28 Ara 2026 Bildirim'), '2026-12-28');
  assert.equal(parseDateToIso('5 Mayıs 2026'), '2026-05-05');
  assert.equal(parseDateToIso('03.04.2026'), '2026-04-03');

  const records = parseFintablesTableData({
    headers: [
      '225 şirket',
      'tarih',
      'temettü verim (%)',
      'hisse başı brüt tl',
      'hisse başı net tl',
      'toplam temettü (tl)',
      'dağıtma oranı (%)',
      'durum'
    ],
    rows: [
      [{ text: '', href: null }], // spacer row
      [
        { text: 'MEDTR G16,94 %-0,18', href: '/sirketler/MEDTR/sermaye-artirimlari-temettuler' },
        { text: '28 Ara 2026 Bildirim', href: '/borsa-haber-akisi/123' },
        { text: '% 0,67', href: null },
        { text: '₺ 0,1134', href: null },
        { text: '₺ 0,0964', href: null },
        { text: '₺ 13.499.991', href: null },
        { text: 'N/A', href: null },
        { text: 'Bekliyor', href: null }
      ]
    ]
  });

    assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    symbol: 'MEDTR',
    exDate: '2026-12-28',
    payDate: '2026-12-30',
    hasDeclaredPayDate: false,
    grossDps: 0.1134,
    netDps: 0.0964,
    hasDeclaredNet: true,
    source: 'FINTABLES_DIVIDEND_CALENDAR'
  });
});

test('Duplicate (symbol, ex_date) rows cause maybeSingle() to surface PGRST116 error and halt unsafe writes', async () => {
  // Setup local mock database with 2 duplicate rows for the same symbol and ex_date
  const store = [
    {
      id: 'dup-1',
      symbol: 'SISE.IS',
      ex_date: '2026-11-20',
      payment_date: '2026-11-24',
      amount: 1.0,
      currency: 'TRY',
      frequency: 'Annual',
      is_confirmed: true,
      source: 'KAP_OFFICIAL',
    },
    {
      id: 'dup-2',
      symbol: 'SISE.IS',
      ex_date: '2026-11-20',
      payment_date: '2026-11-24',
      amount: 1.0,
      currency: 'TRY',
      frequency: 'Annual',
      is_confirmed: false,
      source: 'YAHOO_ESTIMATED',
    },
  ];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && url.pathname.endsWith('/asset_dividends')) {
      const sym = url.searchParams.get('symbol')?.replace(/^eq\./, '');
      const ex = url.searchParams.get('ex_date')?.replace(/^eq\./, '');
      const matches = store.filter((r) => (!sym || r.symbol === sym) && (!ex || r.ex_date === ex));
      const accept = req.headers['accept'] || '';
      if (accept.includes('application/vnd.pgrst.object+json')) {
        if (matches.length === 0) {
          res.statusCode = 406;
          res.end(JSON.stringify({ message: '0 rows' }));
        } else if (matches.length > 1) {
          // Standard PostgREST error when requesting single object on duplicate rows
          res.statusCode = 406;
          res.end(JSON.stringify({
            code: 'PGRST116',
            details: `Results contain ${matches.length} rows, but 1 was requested`,
            message: 'JSON object requested, multiple (or no) rows returned'
          }));
        } else {
          res.statusCode = 200;
          res.end(JSON.stringify(matches[0]));
        }
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify(matches));
      return;
    }
    res.statusCode = 200;
    res.end('[]');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const mockUrl = `http://127.0.0.1:${port}`;

  try {
    const mockDb = createClient(mockUrl, 'local-test-service-role-key');
    const { upsertDividendEvent } = await import('../dividendPersistence.ts');
    const { ingestAuditedDividends } = await import('../../../scripts/scrape_bist_dividends_playwright.mjs');

    // 1. Verify upsertDividendEvent surfaces error rather than silently choosing a row
    const persistResult = await upsertDividendEvent(mockDb, {
      symbol: 'SISE.IS',
      ex_date: '2026-11-20',
      payment_date: '2026-11-24',
      amount: 1.25,
      currency: 'TRY',
      frequency: 'Annual',
      is_confirmed: true,
      source: 'FINTABLES_DIVIDEND_CALENDAR',
    });

    assert.equal(persistResult.action, 'ERROR');
    assert.equal(persistResult.reason, 'fetch_existing_failed');
    assert.match(persistResult.error, /JSON object requested, multiple/);

    // 2. Verify ingestAuditedDividends treats duplicate fetch error as failed and does not corrupt store
    const ingestSummary = await ingestAuditedDividends([
      {
        symbol: 'SISE',
        exDate: '2026-11-20',
        payDate: '2026-11-24',
        hasDeclaredPayDate: true,
        grossDps: 1.5,
        netDps: 1.25,
        hasDeclaredNet: true,
        source: 'FINTABLES_DIVIDEND_CALENDAR',
      },
    ], mockDb);

    assert.equal(ingestSummary.extracted, 1);
    assert.equal(ingestSummary.audited, 0, 'Must not audit/save record when duplicate rows exist');
    assert.equal(ingestSummary.failed, 1, 'Must mark duplicate row lookup as failed');

    // Verify existing store was untouched
    assert.equal(store.length, 2);
  } finally {
    server.close();
  }
});


