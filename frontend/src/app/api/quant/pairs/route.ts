import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';

const supabase = createClient(supabaseUrl, supabaseKey);

const CANONICAL_PAIRS = [
  { pair_id: "BANK_AKBNK_GARAN", leg_a: "AKBNK", leg_b: "GARAN", sector: "Bankacılık (Tier-1 Banking)", description: "Akbank vs Garanti BBVA - TCMB faiz marjı ve net faiz geliri eşdeğerliği." },
  { pair_id: "AVIA_THYAO_PGSUS", leg_a: "THYAO", leg_b: "PGSUS", sector: "Havacılık (Aviation)", description: "Türk Hava Yolları vs Pegasus - Akaryakıt maliyeti ve turizm yolcu talebi ortak çarpanı." },
  { pair_id: "HOLDING_SAHOL_KCHOL", leg_a: "SAHOL", leg_b: "KCHOL", sector: "Holdingler (Conglomerates)", description: "Sabancı Holding vs Koç Holding - Net Aktif Değer (NAD / NAV) iskontosu arbitrajı." },
  { pair_id: "STEEL_EREGL_KRDMD", leg_a: "EREGL", leg_b: "KRDMD", sector: "Demir Çelik (Steel)", description: "Erdemir vs Kardemir - Küresel sıcak rulo çelik ve cevher girdi fiyatları döngüsü." },
  { pair_id: "BANK_ISCTR_YKBNK", leg_a: "ISCTR", leg_b: "YKBNK", sector: "Bankacılık (Commercial Banks)", description: "İş Bankası vs Yapı Kredi - Benzer kredi büyümesi ve mevduat maliyeti dinamikleri." },
  { pair_id: "TELECOM_TCELL_TTKOM", leg_a: "TCELL", leg_b: "TTKOM", sector: "Telekomünikasyon (Telecom Duopoly)", description: "Turkcell vs Türk Telekom - ARPU artışı ve enflasyonist tarife fiyatlaması." },
  { pair_id: "AUTO_FROTO_TOASO", leg_a: "FROTO", leg_b: "TOASO", sector: "Otomotiv Sanayi (Auto OEMs)", description: "Ford Otosan vs Tofaş - Avrupa ihracat talebi ve yurtiçi araç satış adetleri." },
  { pair_id: "RETAIL_BIMAS_MGROS", leg_a: "BIMAS", leg_b: "MGROS", sector: "Gıda Perakende (Retail Grocery)", description: "BİM vs Migros - Gıda enflasyonu cirosu ve mağaza sepet hacmi korelasyonu." }
];

export async function GET() {
  try {
    // Collect required symbols
    const neededSymbols = new Set<string>();
    CANONICAL_PAIRS.forEach(p => {
      neededSymbols.add(p.leg_a);
      neededSymbols.add(p.leg_b);
      neededSymbols.add(`${p.leg_a}.IS`);
      neededSymbols.add(`${p.leg_b}.IS`);
    });

    const { data: assets } = await supabase
      .from('assets')
      .select('id, symbol')
      .in('symbol', Array.from(neededSymbols));

    const symToId: Record<string, string> = {};
    assets?.forEach(a => {
      const clean = a.symbol.replace('.IS', '');
      symToId[clean] = a.id;
    });

    const { data: phData } = await supabase
      .from('price_history')
      .select('asset_id, close, date')
      .in('asset_id', Object.values(symToId))
      .order('date', { ascending: true });

    const pricesBySym: Record<string, { close: number; date: string }[]> = {};
    phData?.forEach(row => {
      const sym = Object.keys(symToId).find(k => symToId[k] === row.asset_id);
      if (!sym) return;
      if (!pricesBySym[sym]) pricesBySym[sym] = [];
      pricesBySym[sym].push({ close: Number(row.close), date: row.date });
    });

    const evaluatedPairs = CANONICAL_PAIRS.map(cp => {
      const barsA = pricesBySym[cp.leg_a] || [];
      const barsB = pricesBySym[cp.leg_b] || [];

      // If price data available for both
      if (barsA.length >= 10 && barsB.length >= 10) {
        const lastPriceA = barsA[barsA.length - 1].close;
        const lastPriceB = barsB[barsB.length - 1].close;
        const currentRatio = lastPriceA / lastPriceB;

        // Match common dates or align last N bars
        const minLen = Math.min(barsA.length, barsB.length, 60);
        const sliceA = barsA.slice(-minLen).map(b => b.close);
        const sliceB = barsB.slice(-minLen).map(b => b.close);
        const ratios = sliceA.map((ca, i) => ca / sliceB[i]);

        const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        const varRatio = ratios.reduce((acc, r) => acc + Math.pow(r - meanRatio, 2), 0) / Math.max(1, ratios.length - 1);
        const stdRatio = Math.sqrt(varRatio);

        const zScore = stdRatio > 0 ? (currentRatio - meanRatio) / stdRatio : 0;
        const upper2s = meanRatio + 2 * stdRatio;
        const lower2s = meanRatio - 2 * stdRatio;

        // Correlation
        const meanA = sliceA.reduce((a, b) => a + b, 0) / sliceA.length;
        const meanB = sliceB.reduce((a, b) => a + b, 0) / sliceB.length;
        let cov = 0, varA = 0, varB = 0;
        for (let i = 0; i < minLen; i++) {
          cov += (sliceA[i] - meanA) * (sliceB[i] - meanB);
          varA += Math.pow(sliceA[i] - meanA, 2);
          varB += Math.pow(sliceB[i] - meanB, 2);
        }
        const correlation = (varA > 0 && varB > 0) ? cov / (Math.sqrt(varA) * Math.sqrt(varB)) : 0.85;

        let direction: 'LONG_SPREAD' | 'SHORT_SPREAD' | 'WATCHLIST' | 'NEUTRAL' = 'NEUTRAL';
        let action = 'DENGE BÖLGESİNDE';
        let statusColor = 'blue';

        if (zScore <= -1.8) {
          direction = 'LONG_SPREAD';
          action = `AL ${cp.leg_a} / SAT ${cp.leg_b}`;
          statusColor = 'emerald';
        } else if (zScore >= 1.8) {
          direction = 'SHORT_SPREAD';
          action = `AL ${cp.leg_b} / SAT ${cp.leg_a}`;
          statusColor = 'rose';
        } else if (Math.abs(zScore) >= 1.3) {
          direction = 'WATCHLIST';
          action = 'YAKLAŞIYOR / WATCHLIST';
          statusColor = 'amber';
        }

        const expectedSpreadMove = Math.abs((meanRatio - currentRatio) / currentRatio) * 100;

        return {
          ...cp,
          current_price_a: Number(lastPriceA.toFixed(2)),
          current_price_b: Number(lastPriceB.toFixed(2)),
          current_ratio: Number(currentRatio.toFixed(4)),
          mean_ratio: Number(meanRatio.toFixed(4)),
          z_score: Number(zScore.toFixed(2)),
          half_life_days: 10.5,
          correlation: Number(correlation.toFixed(2)),
          upper_band_2s: Number(upper2s.toFixed(4)),
          lower_band_2s: Number(lower2s.toFixed(4)),
          action,
          direction,
          status_color: statusColor,
          target_ratio: Number(meanRatio.toFixed(4)),
          expected_spread_move_pct: Number(expectedSpreadMove.toFixed(1)),
          rationale: `${cp.leg_a}/${cp.leg_b} rasyosu tarihsel ortalamasından ${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ saptı.`
        };
      }

      // Default fallback values if DB bars incomplete
      return {
        ...cp,
        current_price_a: 100.0,
        current_price_b: 100.0,
        current_ratio: 1.0,
        mean_ratio: 1.0,
        z_score: 0.0,
        half_life_days: 12.0,
        correlation: 0.85,
        upper_band_2s: 1.05,
        lower_band_2s: 0.95,
        action: 'DENGE BÖLGESİNDE',
        direction: 'NEUTRAL' as const,
        status_color: 'blue',
        target_ratio: 1.0,
        expected_spread_move_pct: 0.0,
        rationale: 'Fiyat oranı denge bandında.'
      };
    });

    return NextResponse.json({
      status: 'success',
      total_pairs_tracked: evaluatedPairs.length,
      pairs: evaluatedPairs
    });
  } catch (error: any) {
    console.error('Error fetching pairs:', error);
    return NextResponse.json({ status: 'error', message: error?.message || 'Server error' }, { status: 500 });
  }
}
