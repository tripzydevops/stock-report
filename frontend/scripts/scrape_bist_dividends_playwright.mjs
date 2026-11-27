/**
 * MarketPulse: Automated BIST Dividend Scraper & Ingestor via Playwright
 *
 * Runs headless Chromium with genuine browser headers to bypass Cloudflare/WAF,
 * extracts announced BIST dividend payments using header-based dynamic table resolution,
 * audits them via mathematical & Turkish holiday rules, and upserts them into Supabase `asset_dividends`.
 *
 * Strict provenance:
 * - Fintables scrape: 'FINTABLES_DIVIDEND_CALENDAR'
 * - İş Yatırım scrape: 'ISYATIRIM_CORPORATE_ACTIONS'
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDividendUpsert, normalizeBistSymbol } from '../src/lib/dividendPrecedence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const calendarPath = path.resolve(__dirname, '../src/data/bist_calendar.json');

// Priority 5: Require explicit SUPABASE_SERVICE_ROLE_KEY for automated ingestion writes
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Fatal: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided for automated dividend ingestion.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Official BIST Market Holidays from bist_calendar.json (including religious holidays: Ramazan and Kurban Bayramı)
let bistHolidays = new Set();
try {
  const calData = JSON.parse(fs.readFileSync(calendarPath, 'utf8'));
  bistHolidays = new Set(Object.keys(calData.full_holidays || {}));
} catch (e) {
  console.error(`❌ Fatal: BIST authoritative calendar could not be loaded from ${calendarPath}: ${e.message}`);
}

// Priority 3: Fail closed if BIST calendar cannot be loaded in unattended production cron
if (!bistHolidays.size) {
  console.error('❌ Fatal: BIST authoritative calendar contains 0 holidays. Failing closed to prevent incorrect holiday settlement in cron.');
  process.exit(1);
}

// Official Turkish Public Holidays (Fixed annual fallback dates: MM-DD)
const TURKISH_FIXED_HOLIDAYS = new Set([
  '01-01', // Yılbaşı
  '04-23', // Ulusal Egemenlik ve Çocuk Bayramı
  '05-01', // Emek ve Dayanışma Günü
  '05-19', // Atatürk'ü Anma, Gençlik ve Spor Bayramı
  '07-15', // Demokrasi ve Milli Birlik Günü
  '08-30', // Zafer Bayramı
  '10-29'  // Cumhuriyet Bayramı
]);

/**
 * Checks if a date falls on an official BIST closed holiday
 */
function isBistHoliday(dateObj) {
  const y = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${y}-${mm}-${dd}`;
  return bistHolidays.has(dateStr) || TURKISH_FIXED_HOLIDAYS.has(`${mm}-${dd}`);
}

/**
 * Calendar-aware date helper: checks if a date falls on a weekend or BIST holiday.
 */
function isTurkishBusinessDay(dateObj) {
  const day = dateObj.getDay();
  if (day === 0 || day === 6) return false; // 0=Sunday, 6=Saturday
  if (isBistHoliday(dateObj)) return false;
  return true;
}

/**
 * Calculates BIST T+2 business-day settlement date (skipping weekends and official BIST market holidays).
 */
function calculateBistTPlus2Settlement(exDateStr) {
  const parts = exDateStr.split('-');
  if (parts.length !== 3) return null;
  const cur = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  if (isNaN(cur.getTime())) return null;

  let added = 0;
  while (added < 2) {
    cur.setDate(cur.getDate() + 1);
    if (isTurkishBusinessDay(cur)) {
      added++;
    }
  }
  const resY = cur.getFullYear();
  const resM = String(cur.getMonth() + 1).padStart(2, '0');
  const resD = String(cur.getDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

/**
 * Shifts a date string (YYYY-MM-DD) forward to the next valid Turkish business day if on weekend/holiday.
 */
function rollToNextBusinessDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const cur = new Date(y, m - 1, d);

  while (!isTurkishBusinessDay(cur)) {
    cur.setDate(cur.getDate() + 1);
  }

  const resY = cur.getFullYear();
  const resM = String(cur.getMonth() + 1).padStart(2, '0');
  const resD = String(cur.getDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

function parseTurkishNumber(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[^\d,.-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

const TURKISH_MONTHS = {
  oca: '01', ocak: '01',
  sub: '02', şub: '02', subat: '02', şubat: '02',
  mar: '03', mart: '03',
  nis: '04', nisan: '04',
  may: '05', mayis: '05', mayıs: '05',
  haz: '06', haziran: '06',
  tem: '07', temmuz: '07',
  agu: '08', ağu: '08', agustos: '08', ağustos: '08',
  eyl: '09', eylul: '09', eylül: '09',
  eki: '10', ekim: '10',
  kas: '11', kasim: '11', kasım: '11',
  ara: '12', aralik: '12', aralık: '12'
};

export function parseDateToIso(dStr) {
  if (!dStr) return '';
  const str = String(dStr).trim();
  const m = str.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) {
    const year = m[3];
    const month = m[2].padStart(2, '0');
    const day = m[1].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  // Match Turkish text dates such as "28 Ara 2026 Bildirim" or "5 Mayıs 2026"
  const tm = str.toLowerCase().match(/(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})/i);
  if (tm) {
    const month = TURKISH_MONTHS[tm[2]];
    if (month) {
      const day = tm[1].padStart(2, '0');
      return `${tm[3]}-${month}-${day}`;
    }
  }
  return '';
}

/**
 * Parses extracted Fintables table headers and rows into normalized dividend records.
 * Supports both legacy `<td>`-only tables and current `<th> + <td>` sticky-column tables.
 */
export function parseFintablesTableData({ headers = [], rows = [] }) {
  if (!rows.length) return [];

  const symIdx = headers.findIndex(h => /kod|hisse|sembol|ticker|şirket/i.test(h));
  const exDateIdx = headers.findIndex(h => /hak kullanım|ex-date|dağıtım tarihi|tarih/i.test(h));
  const payDateIdx = headers.findIndex(h => /ödeme tarihi|hesaba geçiş|nakit ödeme/i.test(h));
  const grossIdx = headers.findIndex(h => /brüt|gross/i.test(h));
  const netIdx = headers.findIndex(h => /net/i.test(h));

  if (symIdx === -1 || grossIdx === -1) {
    console.warn(`⚠️ Warning: Critical columns (symbol/gross) not found via header match (${JSON.stringify(headers)}). Falling back to default layout.`);
  }

  const effectiveSymIdx = symIdx !== -1 ? symIdx : 0;
  const effectiveExIdx = exDateIdx !== -1 ? exDateIdx : 1;
  const effectiveGrossIdx = grossIdx !== -1 ? grossIdx : 3;
  const effectiveNetIdx = netIdx !== -1 ? netIdx : 4;

  const records = [];
  for (const row of rows) {
    if (!row || row.length < 4) continue;
    const symCell = row[effectiveSymIdx];
    const symHref = typeof symCell === 'object' && symCell !== null ? symCell.href : null;
    const symText = typeof symCell === 'object' && symCell !== null ? symCell.text : String(symCell || '');

    let sym = '';
    const hrefMatch = symHref ? String(symHref).match(/\/sirketler\/([A-Za-z0-9]+)\b/i) : null;
    if (hrefMatch) {
      sym = hrefMatch[1].toUpperCase();
    } else {
      sym = symText.split(/\s+/)[0].replace('.IS', '').trim().toUpperCase();
    }
    if (!sym || sym.length > 6) continue;

    const getText = idx => {
      if (idx < 0 || idx >= row.length) return '';
      const cell = row[idx];
      return typeof cell === 'object' && cell !== null ? String(cell.text || '') : String(cell || '');
    };

    const exDate = parseDateToIso(getText(effectiveExIdx));
    const rawPayStr = payDateIdx !== -1 ? getText(payDateIdx).trim() : '';
    const parsedPayDate = parseDateToIso(rawPayStr);
    const hasDeclaredPayDate = Boolean(parsedPayDate);
    const payDate = parsedPayDate || (exDate ? calculateBistTPlus2Settlement(exDate) : null);
    const grossDps = parseTurkishNumber(getText(effectiveGrossIdx) || '0');
    const netDpsRaw = parseTurkishNumber(getText(effectiveNetIdx) || '0');
    const hasDeclaredNet = netDpsRaw > 0;
    const netDps = hasDeclaredNet ? netDpsRaw : null;

    if (exDate && grossDps > 0) {
      records.push({
        symbol: sym,
        exDate,
        payDate,
        hasDeclaredPayDate,
        grossDps,
        netDps,
        hasDeclaredNet,
        source: 'FINTABLES_DIVIDEND_CALENDAR'
      });
    }
  }
  return records;
}

export async function scrapeAndIngestBistDividends() {
  console.log('🚀 Launching Playwright browser for BIST Dividend Scraping...');
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
  const extractedRecords = [];

  try {
    // 1. Primary Source: Fintables Temettüler (with dynamic link discovery fallback if URL changes)
    const fintablesUrls = ['https://fintables.com/sermaye-artirimlari/temettuler'];
    try {
      let tableData = null;
      for (let i = 0; i < fintablesUrls.length; i++) {
        const targetUrl = fintablesUrls[i];
        console.log(`🌐 Navigating to Fintables Temettüler (${targetUrl})...`);
        const resp = await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        const status = resp ? resp.status() : 0;
        if (status >= 400) {
          console.warn(`⚠️ Fintables returned HTTP ${status} for ${targetUrl} (final URL: ${page.url()}).`);
          if (i === 0) {
            // Self-healing fallback: discover dividend link from Fintables homepage
            await page.goto('https://fintables.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
            const discovered = await page.evaluate(() => {
              const link = Array.from(document.querySelectorAll('a[href]')).find(a =>
                /sermaye-artirimlari\/temett|temettu/i.test(a.getAttribute('href') || '')
              );
              return link ? new URL(link.getAttribute('href'), location.origin).href : null;
            });
            if (discovered && !fintablesUrls.includes(discovered)) {
              console.log(`🔎 Discovered fallback Fintables dividend URL: ${discovered}`);
              fintablesUrls.push(discovered);
            }
          }
          continue;
        }

        await page.waitForSelector('table tbody tr a[href*="/sirketler/"]', { state: 'attached', timeout: 15000 }).catch(() => null);
        await page.waitForTimeout(500);

        tableData = await page.evaluate(() => {
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

        if (tableData && tableData.rows.length > 0) break;
        console.warn(`⚠️ Fintables returned 0 table rows on ${targetUrl} (HTTP ${status}).`);
      }

      if (tableData && tableData.rows.length > 0) {
        console.log(`📋 Resolved Table Headers: ${JSON.stringify(tableData.headers)}`);
        const parsed = parseFintablesTableData(tableData);
        extractedRecords.push(...parsed);
        console.log(`📊 Successfully extracted ${extractedRecords.length} records from Fintables.`);
      }
    } catch (fintablesErr) {
      console.warn(`⚠️ Fintables scrape note: ${fintablesErr.message}`);
    }

    // 2. Fallback Source: İş Yatırım Sermaye Artırımları (Properly parsed if Fintables fails)
    if (extractedRecords.length === 0) {
      console.log('🌐 Attempting fallback to İş Yatırım Sermaye Artırımları...');
      try {
        await page.goto('https://arastirma.isyatirim.com.tr/sermaye-artirimlari/', {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        await page.waitForTimeout(3000);

        const isTableData = await page.evaluate(() => {
          const table = document.querySelector('table');
          if (!table) return null;
          const ths = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim().toLowerCase());
          const trs = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
          );
          return { headers: ths, rows: trs };
        });

        if (isTableData && isTableData.rows.length > 0) {
          const { headers, rows } = isTableData;
          const symIdx = headers.findIndex(h => /kod|hisse|şirket/i.test(h));
          const exIdx = headers.findIndex(h => /tarih|hak kullanım/i.test(h));
          const grossIdx = headers.findIndex(h => /temettü|brüt|nakit/i.test(h));

          for (const row of rows) {
            const sym = (row[symIdx !== -1 ? symIdx : 0] || '').replace('.IS', '').trim().toUpperCase();
            const exDate = parseDateToIso(row[exIdx !== -1 ? exIdx : 1] || '');
            const grossDps = parseTurkishNumber(row[grossIdx !== -1 ? grossIdx : 2] || '0');
            if (sym && exDate && grossDps > 0) {
              const payDate = calculateBistTPlus2Settlement(exDate);
              extractedRecords.push({
                symbol: sym,
                exDate,
                payDate,
                hasDeclaredPayDate: false, // Inferred via T+2 settlement
                grossDps,
                netDps: null, // No net DPS column in İş Yatırım
                hasDeclaredNet: false,
                source: 'ISYATIRIM_CORPORATE_ACTIONS'
              });
            }
          }
          console.log(`📊 Successfully extracted ${extractedRecords.length} fallback records from İş Yatırım.`);
        }
      } catch (isErr) {
        console.warn(`⚠️ İş Yatırım fallback note: ${isErr.message}`);
      }
    }

  } catch (err) {
    console.error('❌ Scraper encountered unhandled error:', err.message);
  } finally {
    await browser.close();
  }

  // Priority 8: Fail loudly if no records extracted
  if (extractedRecords.length === 0) {
    console.error('❌ Scraper extracted 0 records from all sources. Aborting with failure code to alert cron.');
    process.exit(1);
  }

  console.log(`\n🔍 Extracted ${extractedRecords.length} announced dividend declarations.`);
  return await ingestAuditedDividends(extractedRecords, supabase);
}

export async function ingestAuditedDividends(extractedRecords, dbClient = supabase) {
  // 3. Mathematical Audit & Supabase Ingestion
  let auditedCount = 0;
  let failedCount = 0;

  for (const item of extractedRecords) {
    // Audit Rule 1: If Net DPS is provided, check bounds: 0 < netDps <= grossDps * 1.02
    if (item.netDps !== null) {
      if (item.netDps <= 0 || item.netDps > item.grossDps * 1.02) {
        console.warn(`⚠️ Skipping corrupted item for ${item.symbol}: Net DPS (${item.netDps}) out of bounds vs Gross (${item.grossDps})`);
        failedCount++;
        continue;
      }
    }

    // Audit Rule 2: Ensure payment date is a valid Turkish business day (not weekend or public holiday)
    let finalPayDate = item.payDate;
    if (finalPayDate) {
      const normalizedPayDate = rollToNextBusinessDay(finalPayDate);
      if (normalizedPayDate !== finalPayDate) {
        console.log(`📅 Adjusted holiday/weekend payDate ${finalPayDate} -> ${normalizedPayDate} for ${item.symbol}`);
        finalPayDate = normalizedPayDate;
      }
    }
    // Strict Cash-Ledger Protection:
    // A confirmed dividend requires BOTH a source-declared net DPS and a source-declared payment date.
    // If net DPS is not declared, DO NOT store gross DPS as the creditable amount.
    // Setting amount = 0 and is_confirmed = false ensures processDueDividendsToCashLedger() can NEVER credit it.
    const hasDeclaredNet = item.hasDeclaredNet === true && item.netDps !== null && item.netDps > 0;
    const hasDeclaredPayDate = item.hasDeclaredPayDate === true && Boolean(finalPayDate);
    const isConfirmed = hasDeclaredNet && hasDeclaredPayDate;

    // Do NOT write gross DPS into the field consumed as a user cash credit.
    const creditableAmount = hasDeclaredNet ? item.netDps : 0;
    const provenance = !hasDeclaredNet ? `${item.source}_GROSS_ONLY_UNCONFIRMED` : item.source;

    // Canonical BIST symbol with .IS suffix (matches asset_dividends table)
    const canonicalSymbol = normalizeBistSymbol(item.symbol);

    const row = {
      symbol: canonicalSymbol,
      ex_date: item.exDate,
      payment_date: finalPayDate,
      amount: creditableAmount,
      currency: 'TRY',
      frequency: 'Semi-Annual',
      is_confirmed: isConfirmed,
      source: provenance
    };

    try {
      const { data: existing } = await dbClient
        .from('asset_dividends')
        .select('id, is_confirmed, source, amount')
        .eq('symbol', canonicalSymbol)
        .eq('ex_date', item.exDate)
        .maybeSingle();

      const decision = evaluateDividendUpsert(existing || null, row);

      if (decision.action === 'SKIP') {
        console.log(`🛡️ [GUARDED] Preserving existing dividend for ${canonicalSymbol} on ${item.exDate} (${decision.reason}).`);
        auditedCount++;
        continue;
      }

      let dbError = null;
      if (decision.action === 'UPDATE' && existing?.id) {
        const { error } = await dbClient
          .from('asset_dividends')
          .update(decision.payload)
          .eq('id', existing.id);
        dbError = error;
      } else {
        const { error } = await dbClient
          .from('asset_dividends')
          .upsert(decision.payload, { onConflict: 'symbol,ex_date' });
        dbError = error;
      }

      if (dbError) {
        console.warn(`⚠️ Supabase upsert failed for ${canonicalSymbol}: ${dbError.message}`);
        failedCount++;
      } else {
        auditedCount++;
        const netStr = item.netDps !== null ? `₺${item.netDps.toFixed(4)}` : 'NULL (Açıklanmadı -> Creditable: ₺0.00)';
        const statusStr = decision.payload.is_confirmed ? 'CONFIRMED' : 'ESTIMATED';
        console.log(`✅ [AUDITED & SAVED] ${canonicalSymbol} | Status: ${statusStr} | Source: ${decision.payload.source} | Ex: ${item.exDate} | Pay: ${finalPayDate || 'TBD'} | Net: ${netStr} | Gross: ₺${item.grossDps.toFixed(4)}`);
      }
    } catch (upsertErr) {
      console.warn(`⚠️ Upsert exception for ${canonicalSymbol}: ${upsertErr.message}`);
      failedCount++;
    }
  }

  console.log(`\n🎉 Ingestion finished: ${auditedCount} verified BIST corporate actions synced, ${failedCount} skipped/failed.`);

  // If all upserts failed, fail the process
  if (auditedCount === 0 && extractedRecords.length > 0) {
    console.error('❌ All records failed database ingestion. Exiting with failure code.');
    process.exit(1);
  }

  return { extracted: extractedRecords.length, audited: auditedCount, failed: failedCount };
}

if (process.argv[1]?.endsWith('scrape_bist_dividends_playwright.mjs')) {
  scrapeAndIngestBistDividends()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal scrape error:', err);
      process.exit(1);
    });
}
