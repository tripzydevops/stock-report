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
