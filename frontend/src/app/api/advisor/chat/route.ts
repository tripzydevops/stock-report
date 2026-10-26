import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, language = 'tr', holdings = [], metrics = {} } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key') {
      // Fallback to client-side deterministic reasoning engine
      return NextResponse.json({ 
        success: false, 
        fallback: true,
        reason: 'Gemini API key not configured' 
      });
    }

    // Call Gemini REST API directly from Next.js serverless route
    const systemInstruction = language === 'tr'
      ? `Sen Türkiye (BIST) ve Küresel (ABD) temettü hisseleri konusunda uzman, objektif ve veri odaklı bir Baş Portföy & Temettü Danışmanısın (Lead Dividend Architect).
Kullanıcının portföyündeki hisseleri ve sorduğu sektörü analiz et.
Sektör şampiyonları:
- Enerji & Rafineri: 1 numara TÜPRAŞ (TUPRS, %7.4 verim, yılda 2 taksit Nisan/Ekim, rafineri tekeli). Defansif elektrik şampiyonu ENERJİSA (ENJSA, %6.8 verim, TÜFE regülasyonlu şebeke tekeli). Aygaz (%5.4 verim, Tüpraş'ın %10.2 ortağı). Petkim petrokimya döngüseldir (%3 verim).
- Bankacılık: Özel bankalar (AKBNK CAR %19.4, ROE %34; GARAN ROE %37) açık ara kamu bankalarından (HALKB, VAKBN ROE %18, verim %1.2) üstündür. Kamu bankalarında kâr sermayeye eklenir, temettü çok zayıftır.
- GYO: Torunlar GYO (TRGYO) BIST'in temettü kralıdır. EN BÜYÜK AVANTAJI %0 STOPAJDIR (sıfır vergi). Mall of Istanbul kira kalkanı vardır.
- Otomotiv & Sanayi: Türk Traktör (TTRAK, %7.8 verim, %75 kâr dağıtımı) ve Ford Otosan (FROTO, %6.2 verim, Euro ihracat tekeli). Borusan Boru (BRSAN) temettü için düşüktür (%3).
- Tüketim & Perakende: BİM (BIMAS, yılda 3 taksitle öder - 18 Aralık 2026'da ödemesi var). Coca-Cola İçecek (CCOLA, %52 3Y CAGR döviz büyümesi).
- Finans: İş Yatırım (ISMEN, %8.55 verim, 84% 3Y CAGR) ve Türkiye Sigorta (TURSG, %7.09 verim, Ağustos ayı ödemesiyle nakit akışını çeşitlendirir).
- Telekom: Turkcell (TCELL, yılda 2 taksit - 9 Aralık 2026'da 2. taksit kesinleşti).
- Global: SCHD (%3.65 temettü kralları sepeti), JEPI (%7.5 aylık covered call nakit akışı).

Kullanıcının sorusuna net, maddeli, yüzdeler ve somut şirket isimleri vererek Türkçe cevap ver. Asla genel geçer kaçamak yanıt verme.`
      : `You are the Lead Dividend Architect and Senior Quantitative Portfolio Advisor specializing in BIST and US dividend equities. Provide rigorous, data-driven, structured responses with clear verdicts.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const promptPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${systemInstruction}\n\nKullanıcı Portföyü Özeti: Toplam Yıllık Temettü ~₺${metrics.annualTRY || 1600}, Aktif Varlıklar: ${holdings.map((h: any) => `${h.symbol} (${h.shares} lot)`).join(', ')}\n\nKullanıcı Sorusu: "${message}"`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000,
      }
    };

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptPayload),
    });

    if (!res.ok) {
      console.warn('Gemini API call failed, falling back to local engine:', res.statusText);
      return NextResponse.json({ success: false, fallback: true });
    }

    const data = await res.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!replyText) {
      return NextResponse.json({ success: false, fallback: true });
    }

    return NextResponse.json({ success: true, reply: replyText });
  } catch (error: any) {
    console.error('Advisor chat route error:', error);
    return NextResponse.json({ success: false, fallback: true, error: error.message });
  }
}
