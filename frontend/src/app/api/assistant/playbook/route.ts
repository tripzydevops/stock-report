import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

interface PlaybookRequest {
  symbol: string;
  shares: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss?: number;
  targetPrice?: number;
  currency?: string;
  isDividend?: boolean;
  pnlPercent?: number;
  strategyType?: string;
  language?: 'tr' | 'en';
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PlaybookRequest;
    const {
      symbol,
      shares,
      entryPrice,
      currentPrice,
      stopLoss: rawStopLoss,
      targetPrice: rawTargetPrice,
      currency = 'TRY',
      isDividend = false,
      pnlPercent = 0,
      strategyType = 'SWING',
      language = 'tr',
    } = body;

    if (!symbol || !entryPrice || !currentPrice || !shares) {
      return NextResponse.json({ error: 'Missing required position parameters' }, { status: 400 });
    }

    const cleanSym = symbol.replace('.IS', '').trim().toUpperCase();
    const currSym = currency === 'USD' ? '$' : '₺';
    const isEn = language === 'en';
    const supabase = getServerSupabase();

    // 1. Fetch latest market data from Supabase
    let latestOrb: any = null;
    let recentCatalysts: any[] = [];

    try {
      const { data: orbData } = await supabase
        .from('opening_direction')
        .select('*')
        .eq('symbol', `${cleanSym}.IS`)
        .order('date', { ascending: false })
        .limit(1);

      if (orbData && orbData.length > 0) {
        latestOrb = orbData[0];
      }

      const { data: catData } = await supabase
        .from('market_catalysts')
        .select('title, ai_verdict, ai_takeaway, impact_score, category, published_at')
        .eq('symbol', cleanSym)
        .order('published_at', { ascending: false })
        .limit(3);

      if (catData) {
        recentCatalysts = catData;
      }
    } catch (dbErr) {
      console.warn('DB lookup error in playbook route:', dbErr);
    }

    // 2. Deterministic Mathematical Trade Calculations
    const defaultStop = rawStopLoss && rawStopLoss > 0 
      ? rawStopLoss 
      : Number((entryPrice * 0.94).toFixed(2)); // Default 6% risk if not set
    const stopLoss = defaultStop;
    const initialRiskPerShare = Math.max(0.01, entryPrice - stopLoss);
    const rMultiple = Number(((currentPrice - entryPrice) / initialRiskPerShare).toFixed(2));

    // Target 1: +1.25R scale-out
    const target1Price = Number((entryPrice + 1.25 * initialRiskPerShare).toFixed(2));
    // Target 2: +2.25R runner exit
    const target2Price = rawTargetPrice && rawTargetPrice > entryPrice
      ? rawTargetPrice
      : Number((entryPrice + 2.25 * initialRiskPerShare).toFixed(2));

    // Scale-out Tranches
    const t1Shares = Math.max(1, Math.ceil(shares * 0.5));
    const t2Shares = Math.max(0, shares - t1Shares);

    const t1Proceeds = Number((t1Shares * target1Price).toFixed(2));
    const t1Profit = Number((t1Shares * (target1Price - entryPrice)).toFixed(2));
    const t2Proceeds = Number((t2Shares * target2Price).toFixed(2));
    const t2Profit = Number((t2Shares * (target2Price - entryPrice)).toFixed(2));

    // Expected Pullback / Re-accumulation Zone (The "Buy Back Cheaper" Blueprint)
    // Pullback levels: EMA 20 zone or 38.2% - 50% retracement of the move from entry to T1
    const moveRange = Math.max(1, target1Price - entryPrice);
    const pullback382 = Number((target1Price - 0.382 * moveRange).toFixed(2));
    const pullback500 = Number((target1Price - 0.500 * moveRange).toFixed(2));
    const pullbackSupportMin = Math.min(pullback382, pullback500);
    const pullbackSupportMax = Math.max(pullback382, pullback500);

    // Number of shares you could buy back at the pullback zone using the locked-in T1 proceeds
    const potentialRebuyShares = Math.floor(t1Proceeds / pullbackSupportMax);

    // 3. Posture Evaluation
    let postureTitle = isEn ? 'Developing Trend' : 'Gelişen Trend Pozisyonu';
    let postureStatus: 'HEALTHY' | 'TARGET_HIT' | 'OVEREXTENDED' | 'NEAR_SUPPORT' | 'STOP_RISK' = 'HEALTHY';
    let postureColor = 'text-blue-600 bg-blue-50 border-blue-200';

    if (currentPrice <= stopLoss) {
      postureStatus = 'STOP_RISK';
      postureTitle = isEn ? 'Stop Loss Breached / High Risk' : 'Zarar Kes Seviyesi Aşındı / Risk';
      postureColor = 'text-rose-700 bg-rose-50 border-rose-300';
    } else if (currentPrice >= target1Price) {
      postureStatus = 'TARGET_HIT';
      postureTitle = isEn ? 'Target 1 Achieved — Scale-Out Active' : 'Hedef 1 Ulaşıldı — Kâr Realizasyonu Aktif';
      postureColor = 'text-emerald-700 bg-emerald-50 border-emerald-300';
    } else if (pnlPercent >= 3.0) {
      postureStatus = 'OVEREXTENDED';
      postureTitle = isEn ? 'Impulse Move — Approaching Target 1' : 'Hızlı Yükseliş — Hedef 1 Bölgesine Yakın';
      postureColor = 'text-amber-700 bg-amber-50 border-amber-300';
    } else if (currentPrice < entryPrice) {
      postureStatus = 'NEAR_SUPPORT';
      postureTitle = isEn ? 'Pullback Near Entry Support' : 'Maliyet Desteğinde Konsolidasyon';
      postureColor = 'text-indigo-700 bg-indigo-50 border-indigo-200';
    }

    // 4. Generate AI Commentary via Gemini if key is available
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    let aiSynthesis = '';

    if (apiKey) {
      try {
        const prompt = `You are a Wall Street and Borsa Istanbul Lead Portfolio Risk Architect.
Generate an actionable 3-sentence institutional trade management synthesis for this position:
- Stock: ${cleanSym} (${currency})
- Shares Held: ${shares}
- Entry Price: ${currSym}${entryPrice.toFixed(2)}
- Current Price: ${currSym}${currentPrice.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%, ${rMultiple}R)
- Invalidation / Hard Stop: ${currSym}${stopLoss.toFixed(2)}
- Scale-Out Target 1 (+1.25R): ${currSym}${target1Price.toFixed(2)} (Sell ${t1Shares} shares, unlock ${currSym}${t1Proceeds})
- Runner Target 2 (+2.25R): ${currSym}${target2Price.toFixed(2)}
- Re-accumulation Pullback Zone: ${currSym}${pullbackSupportMin} - ${currSym}${pullbackSupportMax}
- Morning ORB Status: ${latestOrb ? `${latestOrb.gap_type} (${latestOrb.gap_percent}%), ${latestOrb.orb_status}` : 'Standard session'}
- Latest Catalysts: ${recentCatalysts.map(c => `${c.title} (${c.ai_verdict})`).join('; ') || 'None'}

Provide:
1) Action on Current Posture (Hold, Trim, or Stop).
2) Exact instructions for the 50% scale-out and moving stop to breakeven.
3) Exact price level to buy back when it pulls back.
Respond in ${isEn ? 'English' : 'Turkish'}. No fluff, maximum precision.`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 350 },
            }),
            signal: AbortSignal.timeout(6000),
          }
        );

        if (geminiRes.ok) {
          const gJson = await geminiRes.json();
          aiSynthesis = gJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        }
      } catch (gErr) {
        console.warn('Gemini synthesis failed, using fallback:', gErr);
      }
    }

    if (!aiSynthesis) {
      if (isEn) {
        aiSynthesis = `Position is currently trading at ${currSym}${currentPrice.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%). Institutional rule: Sell ${t1Shares} shares at Target 1 (${currSym}${target1Price.toFixed(2)}) to lock in ${currSym}${t1Profit.toFixed(2)} profit, then immediately adjust stop-loss to Breakeven (${currSym}${entryPrice.toFixed(2)}). When price pulls back into the ${currSym}${pullbackSupportMin}–${currSym}${pullbackSupportMax} support pocket, re-accumulate up to ${potentialRebuyShares} shares using the proceeds.`;
      } else {
        aiSynthesis = `Pozisyon cari olarak ${currSym}${currentPrice.toFixed(2)} seviyesinde işlem görüyor (${pnlPercent >= 0 ? '+' : ''}%${pnlPercent.toFixed(2)}). Kurumsal yönetim kuralı: Hedef 1 (${currSym}${target1Price.toFixed(2)}) seviyesinde ${t1Shares} adet hisseyi nakde çevirerek ${currSym}${t1Profit.toFixed(2)} net kârı kilitleyin ve kalan ${t2Shares} hissenin zarar kesini giriş maliyetinize (${currSym}${entryPrice.toFixed(2)}) çekin. Fiyat ${currSym}${pullbackSupportMin}–${currSym}${pullbackSupportMax} destek cebine düzeltme yaptığında, kilitlenen nakit ile ${potentialRebuyShares} adede kadar geri alım planlayın.`;
      }
    }

    return NextResponse.json({
      success: true,
      symbol: cleanSym,
      currency,
      shares,
      entryPrice,
      currentPrice,
      pnlPercent,
      rMultiple,
      posture: {
        status: postureStatus,
        title: postureTitle,
        color: postureColor,
      },
      invalidation: {
        stopLossPrice: stopLoss,
        distancePct: Number((((currentPrice - stopLoss) / currentPrice) * 100).toFixed(2)),
        breakevenPrice: entryPrice,
        invalidationRule: isEn
          ? `Trade thesis is invalidated on a daily close below ${currSym}${stopLoss.toFixed(2)}.`
          : `Günlük kapanış ${currSym}${stopLoss.toFixed(2)} seviyesinin altına indiğinde trade tezi tamamen geçersiz kılınır.`,
        breakevenCondition: isEn
          ? `Raise stop to Breakeven (${currSym}${entryPrice.toFixed(2)}) once Target 1 (${currSym}${target1Price.toFixed(2)}) is reached.`
          : `Hedef 1 (${currSym}${target1Price.toFixed(2)}) test edildiğinde stop-loss maliyete (${currSym}${entryPrice.toFixed(2)}) çekilerek işlem risksiz hale getirilir.`,
      },
      executionTranches: {
        tranche1: {
          label: isEn ? 'Tranche 1 (50% Scale-Out)' : 'Kademe 1 (%50 Kâr Realizasyonu)',
          targetPrice: target1Price,
          sharesToSell: t1Shares,
          proceeds: t1Proceeds,
          profitAmount: t1Profit,
          upsidePct: Number((((target1Price - currentPrice) / currentPrice) * 100).toFixed(2)),
          rule: isEn
            ? `Take 50% profit off the table. Frees ${currSym}${t1Proceeds.toFixed(2)} cash for re-accumulation on pullbacks.`
            : `Pozisyonun yarısını nakde çevirir. Düzeltmelerde geri alım için ${currSym}${t1Proceeds.toFixed(2)} nakit serbest bırakır.`,
        },
        tranche2: {
          label: isEn ? 'Tranche 2 (50% Runner)' : 'Kademe 2 (%50 Koşucu / Runner)',
          targetPrice: target2Price,
          sharesToSell: t2Shares,
          proceeds: t2Proceeds,
          profitAmount: t2Profit,
          upsidePct: Number((((target2Price - currentPrice) / currentPrice) * 100).toFixed(2)),
          rule: isEn
            ? `Let the remaining ${t2Shares} shares ride the broader trend. Trail stop beneath rising EMA20.`
            : `Kalan ${t2Shares} hisse ile ana trend sürülür. Stop seviyesi yükselen 20 günlük EMA altına ötelenir.`,
        },
      },
      buybackBlueprint: {
        supportMin: pullbackSupportMin,
        supportMax: pullbackSupportMax,
        potentialRebuyShares,
        projectedDiscountPct: Number((((target1Price - pullbackSupportMax) / target1Price) * 100).toFixed(2)),
        guideline: isEn
          ? `After selling Tranche 1 at ${currSym}${target1Price.toFixed(2)}, place limit re-accumulation orders between ${currSym}${pullbackSupportMin} and ${currSym}${pullbackSupportMax}. You can buy back ~${potentialRebuyShares} shares without adding new capital.`
          : `Kademe 1'i ${currSym}${target1Price.toFixed(2)} seviyesinde sattıktan sonra, ${currSym}${pullbackSupportMin} - ${currSym}${pullbackSupportMax} destek bandında limit geri alım emirleri planlayın. Dışarıdan ilave sermaye eklemeden ~${potentialRebuyShares} adet hisse geri alabilirsiniz.`,
      },
      aiSynthesis,
      recentCatalysts,
      morningOrb: latestOrb ? {
        gapType: latestOrb.gap_type,
        gapPercent: latestOrb.gap_percent,
        orbStatus: latestOrb.orb_status,
        bias: latestOrb.bias,
      } : null,
    });
  } catch (err: any) {
    console.error('Playbook generation error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
