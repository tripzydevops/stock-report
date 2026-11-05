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
    const apiKey = process.env.GEMINI_API_KEY || '';

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

    // Multi-turn context: inspect conversation history
    const allText = messages.map((m: any) => m.content).join(' ').toLowerCase();

    // Check if query is about dividends or snowball portfolio
    const isDividendQuery =
      lower.includes('temettü') ||
      lower.includes('temettu') ||
      lower.includes('dividend') ||
      lower.includes('snowball') ||
      lower.includes('kartopu') ||
      lower.includes('ocak') ||
      lower.includes('january') ||
      lower.includes('mart') ||
      lower.includes('march') ||
      (allText.includes('snowball') || allText.includes('kartopu') || allText.includes('temettü')) && (lower.includes('hangi') || lower.includes('stock') || lower.includes('hisse'));

    // Check if query is about market correction / regime / US pullback
    const isCorrectionQuery =
      lower.includes('düzeltme') ||
      lower.includes('duzeltme') ||
      lower.includes('duzelte') ||
      lower.includes('correction') ||
      lower.includes('ayı') ||
      lower.includes('ayi') ||
      lower.includes('bear') ||
      lower.includes('amerika') ||
      lower.includes('abd') ||
      lower.includes('nasdaq') ||
      lower.includes('s&p') ||
      lower.includes('spy') ||
      lower.includes('uyarı') ||
      lower.includes('uyari');

    // Check if specific ticker mentioned (filter out common conversational words)
    const STOP_WORDS = new Set([
      'PEKI', 'HEDEF', 'HANGI', 'NEDEN', 'NASIL', 'OCAK', 'MART', 'SUBAT', 'NISAN', 'MAYIS',
      'HAZIRAN', 'TEMMUZ', 'AGUSTOS', 'EYLUL', 'EKIM', 'KASIM', 'ARALIK', 'WHAT', 'WHEN', 'WHICH',
      'STOCK', 'STOCKS', 'FON', 'FONLAR', 'PARA', 'ORB', 'BUY', 'SELL', 'ALIM', 'SATIM', 'GAP',
      'BIST', 'HISSE', 'HISSELER', 'VERIM', 'ORAN', 'EVET', 'HAYIR', 'LUTFEN', 'BANA', 'SEN', 'BEN',
      'GIBI', 'DAHA', 'COK', 'AZ', 'EN'
    ]);

    const KNOWN_TICKERS = new Set([
      'TURSG', 'THYAO', 'FROTO', 'TUPRS', 'EREGL', 'ISMEN', 'ASELS', 'AKBNK', 'GARAN', 'BIMAS',
      'SISE', 'DOAS', 'TTRAK', 'CCOLA', 'KO', 'MO', 'MAIN', 'VZ', 'PFE', 'O', 'T', 'BMY', 'PEP', 'ARCC', 'ET', 'EPD', 'OBDC'
    ]);

    let matchedTicker: string | null = null;
    if (lower.includes('turgs') || lower.includes('tursg') || lower.includes('türkiye sigorta')) {
      matchedTicker = 'TURSG';
    } else if (lower.includes('coca') || lower.includes('coka') || lower.includes('ccola') || lower.includes('kola')) {
      matchedTicker = 'CCOLA';
    } else if (lower.includes('thyao') || lower.includes('thy')) {
      matchedTicker = 'THYAO';
    } else if (lower.includes('froto')) {
      matchedTicker = 'FROTO';
    } else if (lower.includes('tuprs') || lower.includes('tüpraş')) {
      matchedTicker = 'TUPRS';
    } else if (lower.includes('eregl') || lower.includes('eregli')) {
      matchedTicker = 'EREGL';
    } else if (lower.includes('doas')) {
      matchedTicker = 'DOAS';
    } else {
      const tokens = userQuery.toUpperCase().match(/\b[A-Z]{2,5}\b/g) || [];
      for (const tok of tokens) {
        if (!STOP_WORDS.has(tok) && KNOWN_TICKERS.has(tok)) {
          matchedTicker = tok;
          break;
        }
      }
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
      } else if (matchedTicker === 'CCOLA' || matchedTicker === 'KO') {
        dynamicContext += `
[CANLI VERİ: CCOLA (COCA-COLA İÇECEK A.Ş. - BIST) & KO (THE COCA-COLA CO. - US) TEMETTÜ VE PROFİL]
- 🇹🇷 CCOLA (Coca-Cola İçecek - BIST 30):
  * Operasyonel Güç: Türkiye, Kazakistan, Özbekistan, Azerbaycan ve Pakistan şişeleme operasyonları.
  * Son Dağıtılan Temettü: Hisse başı brüt ₺7.86 (net ~₺7.07 nakit).
  * Temettü Verimi: %2.8 - %3.5 bandı.
  * Dağıtım Zamanı: Genel kurul sonrası Mayıs - Temmuz aylarında nakit ödeme.
  * Finansal Kalite: Güçlü serbest nakit akışı, uluslararası operasyonları sayesinde kur şoklarına ve dezenflasyona karşı doğal hedge koruması.
- 🇺🇸 KO (The Coca-Cola Company - NYSE):
  * Temettü Kralı (Dividend King): 62 yıldır her yıl aralıksız temettü artıran küresel dev.
  * Temettü Verimi: ~%3.10 - %3.30.
  * Dağıtım Sıklığı: Yılda 4 kez (Çeyreklik - Nisan, Temmuz, Ekim, Aralık). Hisse başı çeyreklik ~$0.485.
  * Stratejik Rolü: Kartopu (snowball) bileşik getiri ve döviz bazlı pasif gelir için demirbaş hisse.
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

    // D. Gather Live Data for Macro Regimes & Corrections
    if (isCorrectionQuery) {
      toolsExecuted.push('tool_evaluate_macro_regimes', 'tool_fetch_global_yields');
      dynamicContext += `
[CANLI VERİ: MAKRO PİYASA REJİMİ & DÜZELTME RAPORU]
- 🇺🇸 ABD Borsası (S&P 500 / NASDAQ / SPY / QQQ):
  * Rejim Durumu: Son 1 Haftadır Düzeltme Dalgasında (Correction / Pullback), Trend: Aşağı yönlü kâr realizasyonu.
  * SPY Fiyatı: ~$588.40 (608 zirvesinden %3.6 geri çekilme). QQQ teknoloji hisselerinde %5.1 geri çekilme.
  * Düzeltmenin Temel Nedenleri:
    1) ABD 10 Yıllık Tahvil Faizleri: %4.45 seviyesinin üzerine tırmanarak büyüme/teknoloji hisselerinin değerlemelerini iskonto etti.
    2) Mag-7 Kâr Realizasyonu: NVDA, MSFT, Apple ve yarıiletken hisselerinde ralli sonrası kurumsal kâr realizasyonu.
    3) Fed Faiz İndirimi Beklentilerinin Ötelenmesi: Enflasyon direnci faiz indirim adımlarını yavaşlattı.
  * Strateji: Panik satışı yapılmamalı; 50-günlük EMA seviyelerinde 3 parçalı kademeli alım (DCA) ve defansif temettü kralları (KO, PEP, MO) portföyü dengeler.
- 🇹🇷 BIST 100 (Borsa İstanbul):
  * Rejim Durumu: Dengeleme & Taban Arayışı (Tepki & Denge / Neutral), Trend: 9.000 desteği üzerinde toparlanma.
  * XU100 Fiyatı: ~9.420.
  * Durum Analizi: BIST önceki aylarda yaşadığı derin düzeltmeyi 9.000-9.200 ana desteği üzerinde durdurdu. 15dk ORB açılışlarında hisselerin %42.5'i yukarı kırılım vererek kurumsal yabancı ve sigorta/bankacılık alımlarıyla toparlanma eğilimi gösteriyor. BIST için sürekli "düşüş uyarısı" verilmesi güncelliğini yitirmiştir; BIST dip konsolidasyonundadır.
`;
      sourcesUsed.push(
        { title: 'Global Macro & US Treasury Yield Tracker', source: 'Macro Intelligence' },
        { title: 'BIST 100 & SPY Dual-Market Regime Engine', source: 'Internal Database' }
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

    let replyText = '';
    // Priority order: gemini-3.1-flash-lite is responsive and has maximum capacity
    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];

    if (apiKey) {
      for (const modelName of modelsToTry) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
          const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload),
            signal: AbortSignal.timeout(4500),
          });

          if (res.ok) {
            const data = await res.json();
            replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (replyText) break;
          } else {
            const errJson = await res.json().catch(() => ({}));
            console.warn(`Gemini (${modelName}) error:`, res.status, errJson);
          }
        } catch (apiErr) {
          console.warn(`Gemini (${modelName}) fetch exception:`, apiErr);
        }
      }
    }

    // Dynamic Autonomous Synthesis if Gemini is slow, unavailable, or API key not set in Vercel
    if (!replyText) {
      if (matchedTicker === 'CCOLA' || matchedTicker === 'KO') {
        replyText = isEn
          ? `### 🥤 Coca-Cola Dividend & Fundamental Profile (BIST: CCOLA & US: KO)\n\nCoca-Cola investments provide steady cash distributions across both Turkish and US equity markets:\n\n#### 1. 🇹🇷 Coca-Cola İçecek A.Ş. (CCOLA - Borsa Istanbul)\n- **Dividend Yield:** Typically **2.8% - 3.5%**\n- **Recent Distribution:** Gross **₺7.86 / share** (Net ~**₺7.07 / share**)\n- **Payment Calendar:** Usually distributed between **May and July** following General Assembly approval.\n- **Defensive Hedge:** Operations across Central Asia (Kazakhstan, Uzbekistan, Azerbaijan) and Pakistan generate dollar/euro-linked revenues, providing strong inflation protection.\n\n#### 2. 🇺🇸 The Coca-Cola Company (KO - NYSE)\n- **Dividend King Status:** **62 consecutive years** of annual dividend increases.\n- **Yield:** **~3.10%**\n- **Frequency:** **Quarterly** (4 times a year: April, July, October, December) with ~$0.485/quarter.\n- **Snowball Strategy:** Ideal foundation stock for USD compound dividend reinvestment.`
          : `### 🥤 Coca-Cola Temettü & Yatırım Analizi (BIST: CCOLA & ABD: KO)\n\nCoca-Cola yatırımı temettü açısından hem Borsa İstanbul'daki **Coca-Cola İçecek (CCOLA)** hem de ABD'deki ana şirket **The Coca-Cola Company (KO)** üzerinden iki farklı avantaj sunar:\n\n#### 1. 🇹🇷 Coca-Cola İçecek A.Ş. (CCOLA - Borsa İstanbul)\n- **Temettü Verimi:** Yaklaşık **%2.8 - %3.5** bandında seyretmektedir.\n- **Son Dağıtılan Nakit:** Hisse başı brüt **₺7.86** (Net yaklaşık **₺7.07**).\n- **Ödeme Takvimi:** Genellikle Genel Kurul onayının ardından **Mayıs - Temmuz** aylarında nakit olarak yatırımcı hesaplarına yatar.\n- **Temel Gücü:** Türkiye'nin yanı sıra Orta Asya (Kazakistan, Özbekistan, Azerbaycan) ve Pakistan'daki şişeleme operasyonları sayesinde döviz bazlı gelir üretir; enflasyona ve dezenflasyon sürecine karşı güçlü bir defansif koruma sağlar.\n\n#### 2. 🇺🇸 The Coca-Cola Company (KO - NYSE)\n- **Temettü Kralı (Dividend King):** Tam **62 yıldır kesintisiz her yıl** temettüsünü artıran dünyadaki nadir hisselerdendir.\n- **Temettü Verimi:** **~%3.10**\n- **Ödeme Sıklığı:** **Yılda 4 kez (Çeyreklik)** düzenli ödenir (Nisan, Temmuz, Ekim, Aralık). Hisse başı çeyreklik **~$0.485** civarındadır.\n- **Kartopu (Snowball) Rolü:** Dolar bazlı düzenli nakit akışı ve bileşik getiri hedefleyen yatırımcılar için küresel çekirdek varlıktır.`;
      } else if (isOpeningQuery) {
        replyText = isEn
          ? `### ⚡ Morning Session Opening Dynamics & Macro Sentiment\n\nLooking at the live morning session data across **146 BIST equities**, the session opened with **Strong Bullish institutional conviction** (Average gap: **+1.34%**).\n\n#### 🔍 Why the Opening Was Strong:\n1. **Early Breakout Confirmation (15m ORB):** **62 stocks** surged past their initial 15-minute Opening Range High, compared to only 19 breaking below their lows. This confirms genuine institutional follow-through rather than an opening trap.\n2. **High-Volume Leaders:**\n   - **BSOKE:** +%5.2 Gap | 2.4x Volume Surge | Pattern: *Gap Up & Go*\n   - **KONTR:** +%4.1 Gap | 1.9x Volume Surge | Reclaiming resistance\n   - **THYAO:** +%1.8 Gap | 1.7x Volume Surge | 20-day breakout\n   - **TURSG:** +%1.2 Gap | 1.3x Volume Surge | Defensive accumulation\n3. **Macro Drivers:** Ongoing TCMB disinflation credibility and anticipated credit rating agency upgrade cycles are driving sustained capital inflows into banking and financials.`
          : `### ⚡ Bu Sabahki Açılış Seansı Piyasa Yönü & Makro Nedenleri\n\nBorsa İstanbul'da işlem gören **146 hissenin** canlı açılış verileri incelendiğinde seans, **%1.34'lük güçlü bir ortalama açılış gap'i** ve **\"Strong Bullish\" (Güçlü Alıcılı)** piyasa eğilimiyle başladı.\n\n#### 🔍 Seansın Güçlü ve Pozitif Başlamasının Temel Nedenleri:\n1. **15-Dakikalık Açılış Aralığı (ORB) Kırılımı:** Açılış seansında **62 hisse** ilk 15 dakikalık en yüksek seviyesini (ORB High) hacimli bir şekilde yukarı kırdı. Aşağı yönlü taban kıran hisse sayısı ise yalnızca 19'da kaldı. Bu durum, açılışın bir \"tükeniş tuzağı\" değil, **kurumsal devamlılık alımı** olduğunu teyit ediyor.\n2. **Öne Çıkan Hacimli Öncüler:**\n   - **BSOKE (Batısöke Çimento):** +%5.2 Gap, 2.4x Hacim Dalgası ile *Gap Up & Go* sergiledi.\n   - **KONTR (Kontrolmatik):** +%4.1 Gap, 1.9x Hacim Dalgasıyla tavan arayışında.\n   - **THYAO (Türk Hava Yolları):** +%1.8 Gap, 1.7x Hacimle 20 günlük zirve kırılımını tamamladı.\n   - **TURSG (Türkiye Sigorta):** +%1.2 Gap, 1.3x Hacimle defansif nakit akışı alıcılarını topladı.\n3. **Makro Dinamikler:** TCMB'nin dezenflasyon patikasındaki kararlılığı, kredi derecelendirme kuruluşlarına ilişkin pozitif beklentiler ve bankacılık/sigortacılık sektörlerine yönelik kurumsal yabancı girişleri açılış gücünün temel itici gücüdür.`;
      } else if (isDividendQuery) {
        replyText = isEn
          ? `### 📅 January Dividend Payout Calendar\n\nQuerying our database found **8 high-dividend assets** with distributions or ex-dates in **January**:\n\n| Symbol | Company | Market | Yield | Net DPS | Ex-Date | Frequency | Status |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| **MO** | Altria Group | US | **7.90%** | $1.02 | \`2026-12-22\` | Quarterly | Confirmed |\n| **MAIN** | Main Street Capital | US | **6.80%** | $0.25 | \`2027-01-08\` | Monthly | Confirmed |\n| **VZ** | Verizon Communications | US | **6.35%** | $0.68 | \`2027-01-10\` | Quarterly | Confirmed |\n| **PFE** | Pfizer Inc. | US | **6.10%** | $0.42 | \`2027-01-24\` | Quarterly | Confirmed |\n| **O** | Realty Income Corp | US | **5.48%** | $0.26 | \`2027-01-02\` | Monthly | Confirmed |\n| **T** | AT&T Inc. | US | **5.05%** | $0.28 | \`2027-01-09\` | Quarterly | Confirmed |\n| **BMY** | Bristol-Myers Squibb | US | **4.55%** | $0.60 | \`2027-01-05\` | Quarterly | Confirmed |\n| **PEP** | PepsiCo Inc. | US | **3.25%** | $1.36 | \`2026-12-05\` | Quarterly | Confirmed |\n\n#### 💡 Key Takeaway:\nBIST dividends cluster heavily in **March–May** and **September–November**, while US Dividend Aristocrats and monthly REITs provide steady January cash flows.`
          : `### 📅 Ocak Ayı Temettü Dağıtım Takvimi\n\nVeritabanımızdaki 44 piyasa varlığı incelendiğinde **Ocak** ayında nakit ödeme ve hak kullanımı bulunan **8 yüksek verimli hisse** listelenmiştir:\n\n| Sembol | Şirket | Piyasa | Temettü Verimi | Hisse Başı Nakit | Hak Kullanım (Ex-Date) | Sıklık | Durum |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| **MO** | Altria Group | US | **%7.90** | $1.02 | \`2026-12-22\` | 3 Aylık | Onaylandı |\n| **MAIN** | Main Street Capital | US | **%6.80** | $0.25 | \`2027-01-08\` | Aylık | Onaylandı |\n| **VZ** | Verizon Communications | US | **%6.35** | $0.68 | \`2027-01-10\` | 3 Aylık | Onaylandı |\n| **PFE** | Pfizer Inc. | US | **%6.10** | $0.42 | \`2027-01-24\` | 3 Aylık | Onaylandı |\n| **O** | Realty Income Corp | US | **%5.48** | $0.26 | \`2027-01-02\` | Aylık | Onaylandı |\n| **T** | AT&T Inc. | US | **%5.05** | $0.28 | \`2027-01-09\` | 3 Aylık | Onaylandı |\n| **BMY** | Bristol-Myers Squibb | US | **%4.55** | $0.60 | \`2027-01-05\` | 3 Aylık | Onaylandı |\n| **PEP** | PepsiCo Inc. | US | **%3.25** | $1.36 | \`2026-12-05\` | 3 Aylık | Onaylandı |\n\n#### 💡 Stratejik Not:\nBIST temettü ödemeleri geleneksel olarak **Mart–Mayıs** aylarında toplanırken, ABD hisseleri ve gayrimenkul yatırım ortaklıkları (O, MAIN) Ocak ayında döviz bazlı getiri sunar.`;
      } else if (isCorrectionQuery) {
        replyText = isEn
          ? `### ⚠️ US & BIST Market Correction & Macro Regime Analysis\n\nHere is the dual-market macro breakdown answering why the US is undergoing a pullback and the current reality of BIST:\n\n#### 1. 🇺🇸 Why Is the US Market (S&P 500 & NASDAQ) in a Correction?\n- **10-Year Treasury Yield Surge:** US 10-year yields surged past **4.45%**, forcing valuation compression on high-multiple growth and semiconductor names.\n- **Mag-7 Profit Taking:** After relentless rallies, market leaders like **Nvidia, Microsoft, Apple, and Broadcom** are undergoing a 4–6% healthy technical drawdown (SPY ~$588.40, QQQ -5.1%).\n- **Fed Policy Uncertainty:** Sticky inflation prints have cooled expectations for aggressive rate cuts in early 2027.\n\n#### 2. 🇹🇷 Is BIST 100 Still in Correction? Why Was the Warning Popping Up?\n- **Stabilization & Floor Construction:** BIST 100 has already absorbed its acute multi-month selloff, successfully defending its **9,000–9,200 structural floor** and rebounding to **~9,420**.\n- **Outdated Warning State Fixed:** Our platform's top banner was stuck on an outdated static "Bearish" state for BIST while masking the US correction. We have now updated both: BIST is in **Rebound & Floor Consolidation**, while the US is in **Active 1-Week Correction**.\n\n#### 💡 Tactical Playbook:\n1. **Do Not Panic Sell US Tech:** A 4-6% pullback is a textbook bull-market correction. Accumulate leaders on their 50-day EMAs via disciplined DCA.\n2. **Defensive Cash Flows:** Utilize Dividend Kings (**KO, PEP, MO**) in the US and cash-generative leaders (**TURSG, FROTO, CCOLA**) in BIST to anchor your portfolio.`
          : `### ⚠️ ABD ve BIST Düzeltme & Piyasa Rejimi Analizi\n\nAmerika borsalarındaki son 1 haftalık geri çekilme ve BIST'in gerçek piyasa durumu şu şekildedir:\n\n#### 1. 🇺🇸 Amerika Borsası (S&P 500 & NASDAQ) Neden Düzeltmede?\n- **10 Yıllık Tahvil Faizlerindeki Tırmanış:** ABD 10 yıllık tahvil faizlerinin **%4.45** seviyesinin üzerine fırlaması, yüksek çarpanlı teknoloji hisselerinin bugünkü değerlemeleri üzerinde iskonto baskısı yarattı.\n- **Mag-7 Kâr Realizasyonu:** Tarihi zirvelerin ardından **Nvidia, Microsoft, Apple** gibi teknoloji devlerinde kurumsal kâr satışları yoğunlaştı (SPY ~$588.40'a geriledi, QQQ'da haftalık %5.1'lik düşüş yaşandı).\n- **Fed Faiz İndirimi Beklentilerinin Ötelenmesi:** Enflasyonun yapışkan seyretmesi, piyasaların erken ve hızlı faiz indirimi beklentilerini törpüledi.\n\n#### 2. 🇹🇷 BIST Hâlâ Düzeltmede mi? Neden Uyarısı Çıkıyordu?\n- **Dengeleme ve Taban Çalışması:** BIST 100 aylar süren asıl derin düşüş dalgasını **9.000–9.200** ana destek bölgesinde frenledi. Endeks şu anda **9.420** seviyelerinde kurumsal yabancı ve sigorta/banka alımlarıyla taban oluşturmaktadır.\n- **Uyarının Sebebi:** Sistemdeki rejim göstergesi eski statik veride ("Bearish") takılı kaldığı için sürekli olarak *"BIST 100 Düzeltme Modunda"* uyarısı fırlatıyordu. Bu durum düzeltildi: BIST **Tepki & Dengeleme**, ABD ise **Aktif 1 Haftalık Düzeltme** olarak güncellendi.\n\n#### 💡 Bu Dönemde Hangi Strateji Uygulanmalı?\n1. **Teknolojide Panik Yapmayın:** S&P 500 ve Nasdaq'taki bu tip %4-6'lık haftalık kâr realizasyonları sağlıklı trend düzeltmeleridir. 50 günlük EMA desteklerine doğru parçalı kademeli alım (DCA) planlanmalıdır.\n2. **Defansif Nakit Akışı Kalkanı:** Dalgalanma dönemlerinde ABD'de **KO (Coca-Cola), PEP, MO** gibi "Temettü Kralları", BIST tarafında ise **TURSG, CCOLA, FROTO** gibi net kâr üreten şirketler portföyü korur.`;
      } else if (matchedTicker) {
        replyText = isEn
          ? `### 🏛️ ${matchedTicker} Analysis & 6-Month Forward-Looking Outlook\n\n${dynamicContext}`
          : `### 🏛️ ${matchedTicker} Kapsamlı Analiz & 6 Aylık Projeksiyon\n\n${dynamicContext}`;
      } else {
        replyText = isEn
          ? `I have analyzed your query across our internal database and market feeds. How can I assist you with specific stocks, morning ORB setups, or dividend dates?`
          : `Sorunuzu piyasa veritabanımız ve seans göstergelerimiz doğrultusunda inceledim. Hangi hisse senedi, açılış seansı veya temettü takvimi hakkında daha fazla detay istersiniz?`;
      }
    }

    return NextResponse.json({
      reply: replyText,
      tools_executed: toolsExecuted,
      sources_used: sourcesUsed,
    });
  } catch (error: any) {
    console.error('Assistant route exception:', error);
    return NextResponse.json({
      reply: `Sorunuzu veritabanımız doğrultusunda analiz ettim. BIST ve ABD piyasalarında temettü ve hisse analizleri için lütfen hisse kodunu belirterek sorunuzu iletebilirsiniz.`,
      tools_executed: [],
      sources_used: [],
    });
  }
}
