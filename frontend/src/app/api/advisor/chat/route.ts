import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, language = 'tr', holdings = [], metrics = {}, geminiApiKey: clientApiKey } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const headerKey = req.headers.get('x-gemini-key');
    const apiKey = headerKey || clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'your-gemini-api-key') {
      // Fallback to client-side comprehensive multi-sector deterministic engine
      return NextResponse.json({ 
        success: false, 
        fallback: true,
        reason: 'Gemini API key not configured' 
      });
    }

    // Call Gemini REST API directly
    const systemInstruction = language === 'tr'
      ? `Sen Türkiye (BIST) ve Küresel (ABD) piyasalarında tüm sektörler konusunda uzman, kıdemli bir Baş Portföy & Temettü Danışmanısın (Lead Dividend Architect).
Kullanıcı herhangi bir sektörü (Havacılık, Enerji, Çimento, Savunma, İlaç/Sağlık, Teknoloji, Cam, Kimya, Madencilik, Gıda, Otomotiv, GYO, Bankacılık, Sigorta, Holding vb.) sorduğunda:
1. O sektördeki öne çıkan şirketleri ve temettü kültürlerini açıkla (Temettü verimi, kâr dağıtım oranı, nakit akışı istikrarı).
2. Sektörün 1 numaralı hissesini ve nedenini net olarak belirt.
3. Hangi hisselerin temettü için değil büyüme/yatırım (CapEx) için uygun olduğunu açıkla (Örn: THYAO filo yatırımı yapar temettü vermez; ASELS AR-GE yapar düşük temettü verir; SASA temettü vermez).
4. Kullanıcının mevcut portföy durumuyla ilişkilendir.
Maddeli, net yüzdeler ve profesyonel Türkçe ile doğrudan soruyu yanıtla.`
      : `You are the Lead Dividend Architect and Senior Quantitative Portfolio Advisor specializing in all BIST and Global sectors. Provide rigorous, data-driven, structured responses with clear verdicts on any sector asked.`;

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
