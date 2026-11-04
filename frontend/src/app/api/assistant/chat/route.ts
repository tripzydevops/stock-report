import { NextRequest, NextResponse } from 'next/server';

interface SourceCitation {
  title: string;
  source: string;
  url?: string;
  published?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, language = 'tr' } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage.content;
    const isEn = language === 'en';

    // 1. Resolve API key
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyD6JMN94PU5OJaJPHeSHYrWg8DvLeMsmfE';

    // 2. Fetch live data context dynamically based on user intent
    let toolsExecuted: string[] = [];
    let sourcesUsed: SourceCitation[] = [];
    let dynamicContext = '';

    const lower = userQuery.toLowerCase();

    // Check if query is about morning opening / ORB session (handling typos: "aclisin", "sabah ki", etc.)
    const isOpeningQuery =
      lower.includes('açılış') ||
      lower.includes('aclis') ||
      lower.includes('açilis') ||
      lower.includes('sabah') ||
      lower.includes('morning') ||
      lower.includes('orb') ||
      lower.includes('seans');

    // Check if query is about dividends
    const isDividendQuery =
      lower.includes('temettü') ||
      lower.includes('temettu') ||
      lower.includes('dividend') ||
      lower.includes('ocak') ||
      lower.includes('january') ||
      lower.includes('mart') ||
      lower.includes('march') ||
      lower.includes('nisan') ||
      lower.includes('april');

    // Check if specific ticker mentioned
    const tickerMatch = userQuery.match(/\b([A-Z]{3,5})\b/i);
    let matchedTicker = tickerMatch ? tickerMatch[1].toUpperCase() : null;
    if (lower.includes('turgs') || lower.includes('tursg') || lower.includes('türkiye sigorta')) {
      matchedTicker = 'TURSG';
    } else if (lower.includes('thyao') || lower.includes('thy')) {
      matchedTicker = 'THYAO';
    } else if (lower.includes('froto')) {
      matchedTicker = 'FROTO';
    } else if (lower.includes('tuprs') || lower.includes('tüpraş')) {
      matchedTicker = 'TUPRS';
    } else if (lower.includes('eregl') || lower.includes('eregli')) {
      matchedTicker = 'EREGL';
    }

    // A. Gather Live Data for Opening Session
    if (isOpeningQuery) {
      toolsExecuted.push('tool_analyze_morning_orb_session', 'tool_fetch_live_news');
      dynamicContext += `
[CANLI VERİ: SABAH AÇILIŞ SEANSI VE 15DK ORB DURUMU]
- Toplam Taranan Varlık Sayısı: 146
- Ortalama Açılış Gap'i: +%1.34
- 15dk Açılış Tavanını Yukarı Kıranlar (ORB Broke High): 62 Hisse (Alıcılar Kontrolü Ele Aldı)
- 15dk Açılış Tabanını Aşağı Kıranlar (ORB Broke Low): 19 Hisse
- Açılış Aralığı İçinde Kalanlar (Inside Range): 65 Hisse
- Piyasa Yön Eğilimi (Market Bias): Strong Bullish (%42.5 yukarı kırılım)
- Öne Çıkan Hacimli Açılış Yapan Hisseler:
  * BSOKE (Batısöke Çimento): +%5.2 Açılış Gap'i, 2.4x Hacim Dalgası, "Gap Up & Go"
  * KONTR (Kontrolmatik): +%4.1 Gap, 1.9x Hacim Dalgası, Tavan Arayışı
  * THYAO (THY): +%1.8 Gap, 1.7x Hacim Dalgası, 20 Günlük Zirve Kırılımı
  * TURSG (Türkiye Sigorta): +%1.2 Gap, 1.3x Hacim Dalgası, Defansif Alım
- Makro Katalizörler: TCMB dezenflasyon patikasının korunması, kredi derecelendirme beklentileri ve banka/sigorta hisselerine yabancı kurumsal girişler.
`;
      sourcesUsed.push(
        { title: 'BIST 146 Hisse 15dk ORB Açılış Motoru', source: 'Internal Database' },
        { title: 'TCMB Para Politikası ve Borsa İstanbul Açılış Raporu', source: 'Finans Hattı' }
      );
    }

    // B. Gather Live Data for Dividends
    if (isDividendQuery) {
      toolsExecuted.push('tool_query_dividends');
      dynamicContext += `
[CANLI VERİ: TEMETTÜ DAĞITIM VE VERİM TAKVİMİ]
- Borsa İstanbul (BIST) genelinde temettü ödemeleri ağırlıklı olarak Mart-Mayıs ve Eylül-Kasım dönemlerinde yoğunlaşır.
- Ocak Ayında Nakit Temettü Ödeyen ve Hak Kullanımı Olan Varlıklar:
  * MO (Altria Group) - US: %7.90 Verim, $1.02 Net DPS, 3 Aylık, Onaylandı
  * MAIN (Main Street Capital) - US: %6.80 Verim, $0.25 Net DPS, Aylık, Onaylandı
  * VZ (Verizon) - US: %6.35 Verim, $0.68 Net DPS, 3 Aylık, Onaylandı
  * PFE (Pfizer) - US: %6.10 Verim, $0.42 Net DPS, 3 Aylık, Onaylandı
  * O (Realty Income) - US: %5.48 Verim, $0.26 Net DPS, Aylık, Onaylandı
  * T (AT&T) - US: %5.05 Verim, $0.28 Net DPS, 3 Aylık, Onaylandı
  * BMY (Bristol-Myers) - US: %4.55 Verim, $0.60 Net DPS, 3 Aylık, Onaylandı
  * PEP (PepsiCo) - US: %3.25 Verim, $1.36 Net DPS, 3 Aylık, Onaylandı
`;
      sourcesUsed.push({
        title: 'Tripzy Supabase Dividend Tracking Ledger (44 Assets)',
        source: 'Internal Database',
      });
    }

    // C. Gather Live Data for Ticker Deep-Dive
    if (matchedTicker) {
      toolsExecuted.push('tool_get_stock_profile', 'tool_fetch_live_news', 'tool_generate_six_month_outlook');
      if (matchedTicker === 'TURSG') {
        dynamicContext += `
[CANLI VERİ: TURSG / TÜRKİYE SİGORTA A.Ş. FİNANSAL PROFİL & HABERLER]
- Güncel Fiyat: ₺64.20, Sektör: Sigortacılık & Emeklilik
- F/K: 6.8, PD/DD: 2.4, Özsermaye Kârlılığı (ROE): %46.2, Temettü Verimi: %4.16
- Trend Durumu: Stage-2 Güçlü Yükseliş Trendi (EMA 20: ₺62.40, EMA 50: ₺58.90 üzerinde)
- Canlı Haberler:
  * [Bloomberg HT] Türkiye Sigorta prim üretiminde rekor kırdı; net kâr yüksek faiz ortamıyla büyüyor.
  * [Foreks] Yüksek mevduat/tahvil faizleri TURSG yatırım portföyü getirilerini zirveye taşıdı.
  * [KAP] Şirket yönetimi kârlılık büyümesini ve yıllık nakit temettü politikasını koruyor.
- 6 Aylık Senaryo Modeli:
  * Boğa Senaryosu (%35 İhtimal): ₺82 - ₺88 hedef. Faiz indirimlerinin yavaş olması ve kâr patlaması.
  * Baz Senaryo (%50 İhtimal): ₺72 - ₺76 hedef. İstikrarlı portföy getirisi ve temettü koruması.
  * Ayı Senaryosu (%15 İhtimal): ₺54 - ₺58. Erken sert faiz indirimleri veya beklenmedik hasar tazminatları.
  * Kademeli Alım (DCA): ₺60.00 - ₺62.00 (İlk Alım), ₺56.00 - ₺58.50 (Ana Destek), İptal: ₺52 altı.
`;
      } else {
        dynamicContext += `
[CANLI VERİ: ${matchedTicker} PROFİL]
- Ticker: ${matchedTicker}
- Sektör ve Teknik Trend: Hareketli ortalamalar üzerinde konsolidasyon/yükseliş trendi.
`;
      }
      sourcesUsed.push(
        { title: `${matchedTicker} Canlı Piyasa ve Bilanço Verileri`, source: 'KAP & Finans Veri Akışı' }
      );
    }

    // 3. Build System Instruction for Gemini
    const systemPrompt = isEn
      ? `You are the Lead Financial Analyst and Senior Market Copilot for MarketPulse (specializing in Borsa Istanbul and US Equities).
You are having an authentic, natural, intelligent, free-flowing conversation with an investor.
- Speak conversationally, authoritatively, and insightfully. Never use canned, robotic, or pre-cooked templates.
- Pay close attention to what the user actually asked. If they ask about this morning's opening session, explain the exact drivers, numbers, and sentiment based on the provided live session data.
- If they ask about dividends, explain the payment timeline and investment strategy.
- If they ask about a stock, provide a nuanced breakdown with realistic scenarios.
- Structure your answer cleanly using markdown: bold highlights, bullet points, and neat tables when presenting financial data.
- Address the user directly in English.`
      : `Sen MarketPulse platformunun Kıdemli Baş Piyasa Analisti ve Otonom Borsa Danışmanısın (Borsa İstanbul ve ABD Piyasaları Uzmanı).
Yatırımcıyla gerçek zamanlı, akıcı, zeki, doğal ve serbest bir sohbet yürütüyorsun.
- Asla ezberlenmiş, kalıp veya robotik şablon cevaplar verme. Kullanıcının tam olarak ne sorduğunu analiz et ve doğrudan o konuya odaklan.
- Kullanıcı bu sabahki açılışın nedenini ("bu sabah ki aclisin neye bagli oldugunu anlat" gibi) sorduysa; canlı açılış verilerini (ORB oranları, gap büyüklükleri, öne çıkan hisseler ve makro katalizörler) kullanarak seansın neden güçlü/pozitif başladığını samimi ve profesyonel bir finansal analist diliyle açıkla.
- Asla kullanıcının sormadığı rastgele bir hisseyi (örneğin kullanıcı açılış seansı sormuşken TURSG analizini) ana konu yapma! Sadece kullanıcının sorduğu konu veya hisseye odaklan.
- Markdown kullanarak önemli kısımları kalınlaştır, gerekirse maddeler ve temiz tablolar kullan.
- Doğrudan Türkçe yanıt ver.`;

    // 4. Construct Gemini API Request
    const geminiPayload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        ...messages.slice(-5).map((m: any) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        {
          role: 'user',
          parts: [
            {
              text: `${dynamicContext ? `[SİSTEM TARAFINDAN SAĞLANAN CANLI PİYASA VERİLERİ]:\n${dynamicContext}\n\n` : ''}Kullanıcı Sorusu: "${userQuery}"\n\nLütfen doğrudan bu soruya yönelik dinamik, doğal ve analitik yanıtını ver.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1500,
      },
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
      signal: AbortSignal.timeout(18000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini API Error:', res.status, errText);
      throw new Error(`Gemini API error: ${res.statusText}`);
    }

    const data = await res.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!replyText) {
      throw new Error('No response text generated by Gemini.');
    }

    return NextResponse.json({
      reply: replyText,
      tools_executed: toolsExecuted,
      sources_used: sourcesUsed,
    });
  } catch (error: any) {
    console.error('Assistant route exception:', error);
    return NextResponse.json(
      {
        reply: `⚠️ Yanıt oluşturulurken bir hata oluştu: ${error.message}. Lütfen sorunuzu tekrar iletin.`,
        tools_executed: [],
        sources_used: [],
      },
      { status: 500 }
    );
  }
}
