/**
 * Smoke Test: Live Playwright BIST Dividend Scraper & Controlled Ingestion Boundary
 *
 * Verifies against live Fintables web pages:
 * 1. Chromium launches and accesses https://fintables.com/sermaye-artirimlari/temettuler.
 * 2. Virtualized table elements are resolved and parsed into structured records.
 * 3. Extracted records reach the controlled ingestion boundary (ingestAuditedDividends).
 * 4. Auditing, settlement, and precedence logic execute against an isolated database boundary.
 */

import http from 'node:http';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import {
  parseFintablesTableData,
  ingestAuditedDividends
} from './scrape_bist_dividends_playwright.mjs';

async function runLiveScraperSmokeTest() {
  console.log('🏁 Starting Live BIST Scraper Smoke Test...');

  // 1. Launch Playwright with realistic browser headers
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'tr-TR',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  let extractedRecords = [];

  try {
    const targetUrl = 'https://fintables.com/sermaye-artirimlari/temettuler';
    console.log(`🌐 Navigating to ${targetUrl}...`);
    const resp = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const status = resp ? resp.status() : 0;
    console.log(`📡 Response HTTP status: ${status} (final URL: ${page.url()})`);

    if (status >= 400) {
      throw new Error(`Target page returned HTTP ${status}`);
    }

    // Wait for sticky/virtualized table to render
    await page.waitForSelector('table tbody tr a[href*="/sirketler/"]', {
      state: 'attached',
      timeout: 15000
    });
    // Allow virtualized table to finish populating initial batch of rows
    await page.waitForTimeout(2000);

    const tableData = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return null;

      const ths = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim().toLowerCase());
      const trs = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('th, td')).map(cell => ({
          text: cell.innerText.trim().replace(/\s+/g, ' '),
          href: cell.querySelector('a')?.getAttribute('href') || null
        }))
      );

      return { headers: ths, rows: trs };
    });

    if (!tableData || !tableData.rows.length) {
      throw new Error('Table was found but contained 0 rows');
    }

    console.log(`📋 Headers extracted: ${JSON.stringify(tableData.headers)}`);
    console.log(`📄 Total raw table rows rendered: ${tableData.rows.length}`);

    extractedRecords = parseFintablesTableData(tableData);
    console.log(`✅ Successfully extracted & parsed ${extractedRecords.length} live records.`);

    if (extractedRecords.length === 0) {
      throw new Error('Parser yielded 0 records from live table rows');
    }

    console.log('🔍 First 3 extracted records:');
    console.log(JSON.stringify(extractedRecords.slice(0, 3), null, 2));

  } finally {
    await browser.close();
  }

  // 2. Controlled Ingestion Boundary Verification
  console.log('\n🛡️ Passing live records into Controlled Ingestion Boundary...');
  // Initialize isolated verification database as empty to test exact bounded insertion/upsert count
  const testStore = [];
  let insertCount = 0;
  let updateCount = 0;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET' && url.pathname.endsWith('/asset_dividends')) {
        const sym = url.searchParams.get('symbol')?.replace(/^eq\./, '');
        const ex = url.searchParams.get('ex_date')?.replace(/^eq\./, '');
        const matches = testStore.filter((r) => (!sym || r.symbol === sym) && (!ex || r.ex_date === ex));
        const accept = req.headers['accept'] || '';
        if (accept.includes('application/vnd.pgrst.object+json')) {
          if (matches.length === 0) {
            res.statusCode = 406;
            res.end(JSON.stringify({ message: '0 rows' }));
          } else if (matches.length > 1) {
            res.statusCode = 406;
            res.end(JSON.stringify({ code: 'PGRST116', message: 'multiple rows returned' }));
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
            ? testStore.findIndex((x) => x.id === idFilter)
            : testStore.findIndex((x) => x.symbol === r.symbol && x.ex_date === r.ex_date);
          if (idx >= 0) {
            testStore[idx] = { ...testStore[idx], ...r };
            updateCount++;
          } else {
            testStore.push({ id: `row-${testStore.length + 1}`, ...r });
            insertCount++;
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
  const mockDb = createClient(`http://127.0.0.1:${port}`, 'smoke-test-key');

  const SAMPLE_SIZE = 5;
  try {
    // Assert at least one record extracted from live Fintables
    if (extractedRecords.length < 1) {
      throw new Error(`Live extraction failed: expected at least 1 record, got ${extractedRecords.length}`);
    }

    // Audit and ingest bounded sample into controlled mock DB boundary
    const batch = extractedRecords.slice(0, SAMPLE_SIZE);
    const summary = await ingestAuditedDividends(batch, mockDb);

    // Assertions required for live smoke pipeline validation
    if (summary.audited < 1) {
      throw new Error(`Controlled boundary failed: expected audited >= 1, got ${summary.audited}`);
    }
    if (summary.failed !== 0) {
      throw new Error(`Controlled boundary failure: expected failed === 0, got ${summary.failed}`);
    }
    if (testStore.length !== batch.length) {
      throw new Error(`Isolated DB record mismatch: expected ${batch.length} stored rows, got ${testStore.length}`);
    }

    const skippedCount = batch.length - (insertCount + updateCount);
    console.log(
      `\n🏁 Live smoke result: extracted ${extractedRecords.length} | ingested sample ${batch.length} of ${extractedRecords.length} | inserted ${insertCount} | updated ${updateCount} | skipped ${skippedCount} | failed ${summary.failed}`
    );
    console.log('✅ Live scraper smoke test passed with complete pipeline validation.');
  } finally {
    server.close();
  }
}

runLiveScraperSmokeTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Live scraper smoke test failed:', err);
    process.exit(1);
  });
