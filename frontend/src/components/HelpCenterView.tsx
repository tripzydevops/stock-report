'use client';

import React, { useState, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { TabId } from './SidebarNav';

interface HelpCenterViewProps {
  onNavigateToTab: (tab: TabId) => void;
  onOpenSettings?: () => void;
}

type HelpCategory = 'all' | 'basics' | 'signals' | 'portfolio' | 'dividend' | 'quant' | 'scorecard' | 'faq';

type WalkthroughTab = 
  | 'signals'
  | 'copilot'
  | 'calculator'
  | 'dca'
  | 'stoploss'
  | 'dividend'
  | 'tax_arbitrage'
  | 'recovery'
  | 'orb'
  | 'gemini'
  | 'backtest';

interface FaqItem {
  qTr: string;
  qEn: string;
  aTr: string;
  aEn: string;
  category: HelpCategory;
  tag: string;
}

export default function HelpCenterView({ onNavigateToTab, onOpenSettings }: HelpCenterViewProps) {
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>('all');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0); // First FAQ open by default
  const [activeWalkthroughTab, setActiveWalkthroughTab] = useState<WalkthroughTab>('signals');

  const categories: { id: HelpCategory; labelTr: string; labelEn: string; icon: string }[] = [
    { id: 'all', labelTr: 'Tümü', labelEn: 'All Topics', icon: '🌐' },
    { id: 'basics', labelTr: 'Yeni Başlayanlar', labelEn: 'Beginner Basics', icon: '🌱' },
    { id: 'signals', labelTr: 'Sinyaller & DCA', labelEn: 'Signals & DCA', icon: '🎯' },
    { id: 'portfolio', labelTr: 'Portföy & Hesaplama', labelEn: 'Portfolio & Sizing', icon: '💼' },
    { id: 'dividend', labelTr: 'Temettü & Arbitraj', labelEn: 'Dividends & Arbitrage', icon: '💰' },
    { id: 'quant', labelTr: 'KAP, Quant & ORB', labelEn: 'KAP, Quant & ORB', icon: '🏛️' },
    { id: 'scorecard', labelTr: 'Karneler & Toparlanma', labelEn: 'Scorecard & Recovery', icon: '📈' },
    { id: 'faq', labelTr: 'Sıkça Sorulan Sorular', labelEn: 'FAQ', icon: '❓' },
  ];

  const faqs: FaqItem[] = [
    {
      qTr: 'Hisselerim %10 - %20 düştü, ne yapmalıyım? Panik yapmalı mıyım?',
      qEn: 'My stocks are down 10% - 20%, what should I do? Should I panic?',
      aTr: 'Kesinlikle panik yapıp dip seviyeden satış yapmayın! BIST 100 endeksi düzeltme rejimindeyken en kaliteli şirketler (TURSG, ISMEN, AKBNK) bile düşebilir. Eğer hisseniz yüksek temettü ödeyen kârlı bir şirketse, fiyat düşüşü temettü verimini artırır (%8.55 verim gibi). Bu dönemlerde tek seferde alım yapmak yerine nakdinizi 3 parçaya bölüp kademeli alım (DCA) yaparak maliyetinizi hızla aşağı çekin. Ancak stop seviyesini aşmış kısa vadeli (Swing) hisselerde inatlaşmamalı, disiplinli olunmalıdır.',
      aEn: 'Never panic sell at the market bottom! When the BIST 100 index enters a correction regime, even the strongest fundamental compounders (TURSG, ISMEN, AKBNK) experience pullbacks. If your stock is a cash-flow-rich dividend payer, price dips push dividend yields higher (e.g., above 8.5%). Divide your capital into 3 tranches and accumulate via DCA to rapidly reduce your average cost. For short-term swing setups whose stop loss was breached, exit with discipline instead of bagholding.',
      category: 'basics',
      tag: 'Risk & Psikoloji',
    },
    {
      qTr: 'Kademeli Alım (DCA - Dollar Cost Averaging) nasıl çalışır?',
      qEn: 'How does Staggered Accumulation (DCA) work in practice?',
      aTr: 'DCA, elinizdeki nakdin tamamını tek bir fiyattan yatırmak yerine zamana ve fiyat seviyelerine yayarak ortalama maliyetinizi düşürme yöntemidir. Örneğin ₺30,000 bütçeniz varsa: 1. Kademe: ₺32.60 fiyattan ₺10,000 alım, 2. Kademe: Fiyat ₺31.08\'e indiğinde ₺10,000 alım, 3. Kademe: Fiyat ₺28.78 desteğine geldiğinde ₺10,000 alım. Sonuçta ortalama maliyetiniz ₺30.15 seviyesine iner ve hisse ₺31\'e ulaştığında kâra geçersiniz.',
      aEn: 'DCA is the practice of splitting capital across multiple price levels instead of going all-in at one price. For instance, with a ₺30,000 allocation: Tranche 1: ₺10,000 at ₺32.60, Tranche 2: ₺10,000 at ₺31.08 on a dip, Tranche 3: ₺10,000 at ₺28.78 deep support. Your resulting average cost drops to ₺30.15, meaning you turn profitable as soon as the stock recovers to ₺31.',
      category: 'signals',
      tag: 'DCA Stratejisi',
    },
    {
      qTr: 'Sinyallerdeki "Giriş", "Hedef" ve "Zarar Kes (Stop-Loss)" ne anlama gelir?',
      qEn: 'What do "Entry", "Target", and "Stop-Loss" mean in the Trade Cards?',
      aTr: 'Giriş (Entry): Algoritmaların matematiksel olarak yüksek olasılıklı gördüğü ideal alım seviyesidir. Hedef (Target 1 & 2): Kâr realizasyonu yapılacak teknik direnç seviyeleridir. Zarar Kes (Stop-Loss): Eğer piyasa aleyhinize dönerse maksimum katlanabileceğiniz zararı sınırlayan güvenlik kalkanıdır. Fiyat stop seviyesini kırarsa sistem sizi korumak için pozisyonu kapatmanızı tavsiye eder.',
      aEn: 'Entry: The statistically optimal price level where algorithmic edge is confirmed. Target (1 & 2): Technical resistance zones where taking profit is recommended. Stop-Loss: The protective invalidation level that caps your maximum downside risk. If the price closes below the stop level, capital preservation dictates closing the trade.',
      category: 'signals',
      tag: 'Sinyal Mantığı',
    },
    {
      qTr: 'Sinyal kartlarındaki "Neden Tetiklendi?" ve "Geçersizlik Kuralı" ne anlama gelir?',
      qEn: 'What do "Why It Fired" and "Invalidation Rule" mean on the Trade Cards?',
      aTr: 'MarketPulse "kara kutu" (black-box) yapay zeka çalıştırmaz. Bir sinyal üretildiğinde, karşılanan tüm nicel kurallar (örneğin: EMA20 geri kazanımı, 20 günlük zirveden %4 düzeltme, 1.8x hacim patlaması, mum kapanışının üst %35 bantta olması) şeffaf bir kontrol listesi olarak "Neden Tetiklendi?" kutusunda listelenir. "Geçersizlik Kuralı" (Invalidation Rule) ise stratejinin teknik tezinin hangi kesin piyasa olayında çökeceğini belirtir (örneğin: \'Kapanışın EMA20 altında kalması veya breakout mumunun dip seviyesinin kırılması tezi bozar\'). Bu, stop-loss tetiklenmeden önce bile tezi çürüyen işlemlerden erken çıkış disiplini kazandırır.',
      aEn: 'MarketPulse never operates as an opaque black box. When a signal fires, every quantitative parameter satisfied (e.g. EMA20 reclaim, pullback 4.2% off 20-day high, 1.8x volume surge, closing in upper 35% of daily range) is explicitly itemized in the "Why It Fired" checklist. The "Invalidation Rule" dictates the exact price or structural condition that invalidates the underlying trade thesis (e.g., \'Daily close below EMA20 cancels the breakout setup\'). This instills disciplined execution, allowing traders to exit invalidated positions even before a hard stop is tagged.',
      category: 'signals',
      tag: 'Şeffaf Algoritma',
    },
    {
      qTr: 'Sinyal kartlarındaki "Posizyon Hesapla" butonu nasıl çalışır ve riskimi nasıl yönetir?',
      qEn: 'How does the "Position Calculator" button work and manage my risk?',
      aTr: 'Sinyal kartlarındaki "Posizyon Hesapla" butonuna bastığınızda etkileşimli Posizyon Büyüklüğü Hesaplama Modalı açılır. Toplam portföy bakiyenizi ve işlem başına göze aldığınız maksimum risk yüzdesini (örn. %1 veya %2) girdiğinizde, hissenin Giriş Fiyatı ve Stop-Loss mesafesini otomatik kullanarak alabileceğiniz maksimum lot miktarını ve sermaye tahsisini hesaplar. Bu sayede hiçbir işlemde hesabınızı tehlikeye atacak aşırı lot almaz, matematiksel sermaye yönetimini korursunuz.',
      aEn: 'Clicking "Posizyon Hesapla" on any signal card launches the interactive Position Sizing Modal. By entering your total portfolio balance and chosen risk-per-trade tolerance (e.g., 1% or 2%), the calculator combines the setup\'s Entry Price and Stop-Loss distance to compute the exact maximum share quantity and capital allocation. This enforces rigorous risk budgeting, preventing emotional over-allocation on any single trade.',
      category: 'portfolio',
      tag: 'Risk Yönetimi',
    },
    {
      qTr: 'Yapay Zeka Analizi ve İşlem Planı ("YZ Analiz & Planı") tek modalda nasıl birleştirildi?',
      qEn: 'How was the AI Analysis and Trade Plan consolidated into the unified modal?',
      aTr: 'Kullanıcı deneyimini sadeleştirmek ve kartlardaki görsel kalabalığı önlemek amacıyla, önceden dağınık olan analiz akordeonu ve yardımcı pilot tek bir profesyonel modalda ("💡 YZ Analiz & Planı") birleştirilmiştir. Kart üzerindeki butona tıklandığında: 1) Hızlı Bakış (Giriş, stop, hedefler, güven puanı), 2) YZ Kurulumu & Planı (Neden tetiklendi, geçersizlik, risk metrikleri), 3) KAP & Piyasa (Şirket açıklamaları, endeks rejimi, göreceli güç), 4) AI Asistanı sekmeleri altında tüm kurumsal bilgiye tek pencereden erişebilirsiniz.',
      aEn: 'To streamline user experience and remove card clutter, the previous inline analysis accordion and co-pilot view have been unified into a single comprehensive blueprint modal ("💡 YZ Analiz & Planı"). Clicking the button gives instant access to: 1) Brief Summary (Entry, stop, targets, confidence stars), 2) Technical Setup & Plan (Why it fired checklist, invalidation rule, risk sizing), 3) KAP & Market Context (Corporate disclosures, index regime, relative strength), and 4) AI Assistant tab for deep multi-turn scenario analysis.',
      category: 'signals',
      tag: 'Birleşik YZ Modalı',
    },
    {
      qTr: 'Temettü dağıtımında (Ex-Date) hisseyi satıp temettü sonrası geri almak mantıklı mı? (Stopaj & Fiyat Düzeltmesi)',
      qEn: 'Is selling before the ex-date and rebuying post-distribution a viable tax arbitrage strategy?',
      aTr: 'Borsa İstanbul kurallarına göre, temettü dağıtım günü (Ex-Date) hisse senedinin referans açılış fiyatı dağıtılan Brüt Temettü tutarı kadar doğrudan düşürülür. Ancak bireysel yatırımcılar temettü üzerinden %10 stopaj (gelir vergisi kesintisi) öderken, BIST hisse alım-satım kârında %0 vergi uygulanır (ve komisyonsuz aracı kurumlarda işlem maliyeti sıfırdır). Dolayısıyla hisseyi temettüye taşıyan yatırımcı brüt düşüş yaşayıp net temettü alarak %10 vergi kaybına uğrar. Ex-date öncesi satıp ex-date günü düzeltilmiş fiyattan geri alan yatırımcı ise bu %10 stopaj kaybını cebinde tutabilir. Sistem bu senaryoyu Temettü ve Portföy sayfalarında simüle ederek en kârlı kararı vermenizi sağlar.',
      aEn: 'On Borsa Istanbul, the reference opening price on the ex-dividend date automatically drops by the exact Gross Dividend per Share (DPS). However, individual Turkish tax residents pay a 10% withholding tax (stopaj) on dividends, while capital gains on BIST equities are subject to 0% tax (with 0% commission on zero-fee brokers). Consequently, holding through ex-date incurs a 10% tax leakage between the gross price drop and net cash received. Selling cum-dividend and rebuying on the ex-date allows disciplined investors to eliminate this 10% dividend tax friction. MarketPulse simulates this scenario directly in the Dividend & Portfolio views.',
      category: 'dividend',
      tag: 'Vergi Arbitrajı',
    },
    {
      qTr: 'İşlem Sonrası Toparlanma Takibi (Post-Exit Recovery Tracking) nedir ve geriye dönük testleri bozar mı?',
      qEn: 'What is Post-Exit Recovery Tracking and does it compromise historical backtest integrity?',
      aTr: 'Günlük pipeline\'ın 10. adımında çalışan Post-Exit Recovery Tracking modülü, stop seviyesi tetiklenmiş veya vadesi dolmuş kapalı işlemleri 5, 10 ve 20 bar boyunca gözlemler. Amacı; hissenin sonradan Hedef 1\'e ulaşıp ulaşmadığını veya yeni bir 20 günlük zirve yapıp yapmadığını tespit etmektir. En kritik kural: Bu takip kesinlikle geçmiş geriye dönük test (backtest) defterini DEĞİŞTİRMEZ veya kazandı/kaybetti kayıtlarını tahrif etmez! Sadece stop mesafelerinin kurumsal likidite avlarına karşı çok dar olup olmadığını inceleyen bağımsız bir denetim ve optimizasyon katmanıdır.',
      aEn: 'Operating in Step 10 of the daily pipeline, Post-Exit Recovery Tracking observes closed or stopped-out setups across subsequent 5, 10, and 20 trading sessions. It measures whether the asset subsequently rebounded to Target 1, Target 2, or set fresh 20-day highs. Crucially, this tracker NEVER mutates or overrides historical backtest ledger records. It functions strictly as an independent audit and diagnostic layer to evaluate whether stop-losses were placed too tightly against institutional liquidity sweeps.',
      category: 'scorecard',
      tag: 'Toparlanma Takibi',
    },
    {
      qTr: 'Sabah Açılış Seansı (ORB - Opening Range Breakout) tarayıcısı nedir ve nasıl kullanılır?',
      qEn: 'What is the Opening Range Breakout (ORB) Scanner and how should it be traded?',
      aTr: 'ORB tarayıcısı, BIST seansı açıldıktan sonraki ilk 15 dakikalık (10:00 - 10:15) fiyat hareketinin en yüksek ve en düşük seviyelerini referans alır. Fiyat bu 15 dakikalık tavanı 20 günlük ortalama açılış hacminin en az 1.5 katı üzerinde bir hacimle yukarı kırdığında ve pozitif gap ile desteklendiğinde gün içi güçlü bir yön kırılımı sinyali üretir. Açılış Seansı sekmesinden anlık taranan hisseleri ve yön tahminlerini takip edebilirsiniz.',
      aEn: 'The ORB scanner benchmarks the high and low range established in the opening 15 minutes of the trading session (10:00–10:15 BIST / 09:30–09:45 US). When an asset breaks above its 15-minute high on >= 1.5x opening volume surge with a positive opening gap, it signals strong institutional continuation. Track live scans and directional probabilities under the Opening Direction (ORB) tab.',
      category: 'quant',
      tag: 'Açılış Seansı (ORB)',
    },
    {
      qTr: 'Strateji Karnesi (Scorecard) sayfası nedir ve metrikler nasıl yorumlanmalıdır?',
      qEn: 'What is the Strategy Scorecard view and how should its metrics be interpreted?',
      aTr: 'Strateji Karnesi, sistemde kayıtlı 1,173\'ten fazla geçmiş işlemin şeffaf denetim defteridir. Her strateji için: Kazanma Oranı (% Win Rate), Kâr Faktörü (Profit Factor: Toplam Kâr / Toplam Zarar), Sharpe Oranı (Risk düzeltilmiş getiri kalitesi), Maksimum Kayıp (Max Drawdown) ve Ortalama Elde Tutma Süresi listelenir. Ayrıca sağ üstteki filtrelerle strateji veya pazar (BIST / US) bazında filtreleme yapabilir, denetim kaydını Excel olarak indirebilirsiniz.',
      aEn: 'The Strategy Scorecard serves as an immutable public audit ledger of over 1,173 historical trade setups. For each active strategy, it reports: Win Rate %, Profit Factor (Gross Profits / Gross Losses), Sharpe Ratio (risk-adjusted return efficiency), Maximum Drawdown, and Average Holding Days. Use the top filters to analyze metrics by strategy or exchange (BIST vs US) or export the audit log to Excel.',
      category: 'scorecard',
      tag: 'Strateji Karnesi',
    },
    {
      qTr: 'Mobil cihazlarda canlı senkronizasyon ve gezinme nasıl yapılır?',
      qEn: 'How does live synchronization and navigation work on mobile devices?',
      aTr: 'MarketPulse tamamen mobil öncelikli (mobile-first) tasarlanmıştır. Telefonunuzda sol üstteki hamburger menüsüne dokunarak 9 sekmenin tamamına erişebilir, alt kısımda tek dokunuşla "Verileri Şimdi Senkronize Et" butonunu çalıştırabilirsiniz. Ayrıca başlık alanındaki canlı senkronizasyon ikonuna dokunarak son dakika fiyatlarını ve KAP bildirimlerini anında güncelleyebilirsiniz.',
      aEn: 'MarketPulse is engineered with a strict mobile-first architecture. On smartphones, tap the top-left hamburger menu to access all 9 navigation modules and trigger the quick "Verileri Şimdi Senkronize Et" sync card. Alternatively, tap the sync icon in the top header to refresh real-time prices and KAP announcements on demand.',
      category: 'basics',
      tag: 'Mobil Kullanım',
    },
    {
      qTr: 'BIST ve ABD (US) hisseleri için sinyal ve risk kuralları neden farklıdır?',
      qEn: 'Why do BIST and US (Midas) stocks use different signal and risk parameters?',
      aTr: 'BIST ve ABD borsaları tamamen farklı mikro-yapılara sahiptir. BIST\'te günlük %10 taban/tavan marj limitleri ve devre kesici (circuit breaker) rejimleri bulunur; bu sebeple stop-loss seviyeleri taban kilidi riskini önleyecek şekilde dinamik ATR tamponlarıyla (örn. %4-%6) korunur ve kâr hedefleri tavan sınırlarına göre optimize edilir. ABD hisselerinde ise marj sınırı yoktur, yüksek likidite ve bilanço/kazanç (earnings) gap riskleri mevcuttur; bu nedenle momentum kırılımları daha agresif trend sürerken (runner hedefleri daha geniş), bilanço dönemlerinde hacim ve gap filtreleri daha sıkı tutulur.',
      aEn: 'BIST and US exchanges operate under fundamentally distinct market dynamics. BIST enforces daily +/-10% circuit breaker price bands; consequently, stop losses use dynamic ATR buffers (typically 4%–6%) to guard against lock-limit traps, and profit targets respect daily price caps. Conversely, US equities trade without daily circuit breaker limits, presenting massive liquidity but high earnings gap volatility. US momentum algorithms therefore allow wider trend runners (+2.25R to +3.5R) while applying stringent volume thresholds and earnings date filters.',
      category: 'signals',
      tag: 'Piyasa Dinamikleri',
    },
    {
      qTr: 'Hangi stratejiler BIST ve ABD için aktif, hangileri neden devre dışı bırakıldı?',
      qEn: 'Which strategies are active for BIST vs. US, and why were some retired?',
      aTr: '5 yıllık nicel geriye dönük test (backtest) sonuçlarımıza göre piyasa bazlı filtreleme uygulanmıştır: 1) BIST için: Momentum Breakout (+%797 getiri, 1.69 Sharpe) ve Pullback Reclaim (+%579 getiri, 1.70 Sharpe) ana motorlardır. Ayrıca VCP, Squeeze, AVWAP, Likidite Avı ve High Tight Flag devrededir. Zayıf kalan Göreceli Güç (RS) devreden çıkarılmıştır. 2) ABD (US) için: Pullback Reclaim (+%36 getiri, sadece -%14.2 Max DD), Likidite Avı (+%21.7 getiri), Connors RSI-2 ve Minervini VCP devrededir. ABD büyük ölçekli hisselerinde çok fazla sahte kırılım (whipsaw) üreten Momentum Breakout (-%5.2) ve Squeeze (-%3.6) ABD taramasından kaldırılmıştır.',
      aEn: 'Based on our empirical 5-year simulation, each market uses a strictly verified strategy whitelist: 1) For BIST: Momentum Breakout (+797% return, 1.69 Sharpe) and Pullback Reclaim (+579%, 1.70 Sharpe) lead the alpha engine, supported by VCP, Squeeze, AVWAP, Liquidity Sweeps, and High Tight Flags. Underperforming RS Leaders was retired. 2) For US: Pullback Reclaim (+36.2% return, only -14.2% Max DD), Liquidity Sweeps (+21.7%), Connors RSI-2, and Minervini VCP are active. Daily breakouts (-5.2%) and Squeezes (-3.6%) were retired for US equities due to excessive institutional false breakouts.',
      category: 'signals',
      tag: 'Backtest & Whitelist',
    },
    {
      qTr: 'Minervini VCP ve High Tight Flag stratejileri nedir ve nasıl çalışır?',
      qEn: 'What are Minervini VCP and High Tight Flag strategies, and how do they work?',
      aTr: '1) Minervini VCP (Volatility Contraction Pattern - Oynaklık Daralma Kalıbı): Mark Minervini\'nin ABD Şampiyonu stratejisidir. Fiyatın dalgalanması birbirini takip eden dalgalarda giderek daralır (örneğin: önce -%15, sonra -%8, en son -%3). Hacim kurur (VDU) ve dar pivot kırıldığında çok sıkı (%3-%5) stopla 1:3+ kâr hedeflenir. 2) High Tight Flag (Yüksek Dar Bayrak): William O\'Neil ve Dan Zanger\'ın patlayıcı modelidir; hisse 40 barda en az +%60 yükselir, ardından 10 barda %20\'den daha sığ bir bayrakta konsolide olup hacim patlamasıyla yeni zirveye kırılır. BIST\'te %66.7 kazanma oranı ve 2.89 kâr faktörü üretmiştir.',
      aEn: '1) Minervini VCP (Volatility Contraction Pattern): Developed by US Investing Champion Mark Minervini. Price volatility contracts through consecutive waves (e.g. -15% -> -8% -> -3%) while volume dries up, triggering on a tight pivot break with minimal 3-5% risk and 1:3+ reward. 2) High Tight Flag (HTF): Created by William O\'Neil and Dan Zanger; stock surges >= 60% over 40 bars, consolidates tightly (<20% depth) over 10 bars, and breaks out on heavy volume. It demonstrated a 66.7% win rate and 2.89 profit factor on BIST.',
      category: 'quant',
      tag: 'Top Trader Stratejileri',
    },
    {
      qTr: 'Kademeli Çıkış Planı (Hedef 1 ve Hedef 2 Koşucu) nasıl uygulanır?',
      qEn: 'How should Multi-Tier Targets (Target 1 & Target 2 Runner) be executed?',
      aTr: 'Profesyonel risk yönetiminde tüm pozisyonu tek bir fiyattan satmak yerine kademeli kâr realizasyonu (scale-out) uygulanır. MarketPulse her sinyal için 2 kademeli hedef belirler: 1) Hedef 1 (+1.25R): Pozisyonun %50\'si bu seviyede nakde çevrilerek ilk kâr kilitlenir ve kalan hisselerin stop-loss seviyesi giriş maliyetine (Breakeven) çekilerek işlem tamamen risksiz hale getirilir. 2) Hedef 2 (+2.25R Koşucu / Runner): Kalan %50 hisse ile büyük trend dalgası sürülür. Ayrıca swing işlemleri için T0 (+%3) hızlı kâr alma seviyesi gün içi koruma sunar.',
      aEn: 'Institutional risk management avoids all-or-nothing exits by scaling out across multiple targets. MarketPulse provides a structured multi-tier blueprint: 1) Target 1 (+1.25R): Sell 50% of the position to secure banked profit, immediately moving your stop-loss on the remaining shares to Breakeven (entry price) for a risk-free trade. 2) Target 2 (+2.25R Runner): The remaining 50% rides the larger macro trend expansion. For short-term swings, a T0 (+3%) quick profit target provides intra-week profit acceleration.',
      category: 'signals',
      tag: 'Kademeli Çıkış',
    },
    {
      qTr: 'Güvenli Mod (Turmoil Guard) nedir ve neden açmalıyım?',
      qEn: 'What is Turmoil Guard and why should I enable it?',
      aTr: 'Piyasa genelinde sert satış dalgası veya düzeltme olduğunda (BIST Rejimi: Bearish), "Aşırı Satım / Ortalamaya Dönüş (Mean Reversion)" sinyalleri "düşen bıçak" tuzağı yaratabilir. Güvenli Mod açıkken, algoritma bu tehlikeli dip arayışlarını gizler ve sadece güçlü trend düzeltmelerini ve kurumsal nakit akışına sahip temettü liderlerini listeler.',
      aEn: 'During broad index sell-offs (Bearish Regime), catching falling knives via Mean Reversion can be treacherous. Turmoil Guard suppresses knife-catching setups and only surfaces resilient 50 EMA trend pullbacks and cash-generative dividend compounders.',
      category: 'signals',
      tag: 'Risk Kalkanı',
    },
    {
      qTr: 'Temettü Kartopu (DRIP) Projeksiyonu nedir?',
      qEn: 'What is the Dividend Snowball (DRIP) Forecast?',
      aTr: 'DRIP (Dividend Reinvestment Plan), şirketinizin hesabınıza yatırdığı nakit temettüyü harcamak yerine tekrar aynı hisseden almak için kullanmanızdır. İlk yıllarda küçük görünen temettüler (örneğin aylık ₺100), 5. ve 10. yıllarda katlanarak maaşınızı geçen dev bir pasif gelir kartopuna dönüşür.',
      aEn: 'DRIP (Dividend Reinvestment Plan) is the disciplined compounding process of reinvesting dividend payouts into purchasing more shares. While initial payouts may seem modest (e.g. ₺100/mo), compounding over 5 to 10 years turns this into a substantial passive income snowball that can cover your living expenses.',
      category: 'dividend',
      tag: 'Bileşik Getiri',
    },
    {
      qTr: 'AI Danışmanına herhangi bir sektör ve hisse hakkında nasıl soru sorabilirim?',
      qEn: 'How do I query the AI Advisor about any sector or stock?',
      aTr: 'Temettü sayfamızdaki "AI Danışmanı" modülüne örneğin: "Enerji sektöründe en yüksek temettü veren hisseler hangileri?" veya "ISMEN vs TURSG kıyasla" yazabilirsiniz. Sistem dahili 20+ sektör kurallarıyla yanıt verir. Dilerseniz Ayarlar panelinden kendi ücretsiz Google Gemini API anahtarınızı girerek canlı LLM akıl yürütmesini de etkinleştirebilirsiniz.',
      aEn: 'In the Dividend tab, open the "AI Advisor" chat and ask queries like: "Which energy sector stocks yield the highest dividends?" or "Compare ISMEN vs TURSG". The system leverages comprehensive sector intelligence. You can also connect your free Google Gemini API key in Settings for live web-scale LLM reasoning.',
      category: 'dividend',
      tag: 'AI & Gemini',
    },
    {
      qTr: 'KAP Bildirimleri nasıl çalışır ve hisseleri nasıl etkiler?',
      qEn: 'How do KAP Filings work and how do they impact stock prices?',
      aTr: 'MarketPulse KAP motoru Kamuyu Aydınlatma Platformu\'nu canlı olarak tarar. Şirketlerin pay geri alımları (Hisse fiyatını yukarı destekleyen en güçlü pozitif sinyal), yüksek tutarlı yeni iş sözleşmeleri ve kâr payı dağıtım kararlarını yapay zeka ile anında sınıflandırıp bildirim olarak sunar.',
      aEn: 'The KAP engine monitors official disclosures in real time. Share buybacks (one of the strongest institutional price catalysts), massive new contract wins, and dividend distribution votes are classified via AI sentiment to give you immediate execution advantage.',
      category: 'quant',
      tag: 'KAP Haberleri',
    },
    {
      qTr: 'USD ve TRY varlıklarım portföyümde nasıl hesaplanır?',
      qEn: 'How are USD and TRY holdings calculated in my portfolio?',
      aTr: 'MarketPulse çift para birimli entegre portföy defterine sahiptir. ABD hisseleriniz (Midas / US) canlı TCMB / serbest piyasa USD/TRY kuruyla anlık olarak TL\'ye dönüştürülür. İsterseniz portföy sayfasındaki "TRY / USD" butonuyla tüm portföyünüzü tek dokunuşla dolar veya lira bazında görüntüleyebilirsiniz.',
      aEn: 'MarketPulse supports seamless multi-currency accounting. Your US holdings are converted to TRY using live exchange rates. Use the "TRY / USD" toggle in the Portfolio header to view your entire net worth denominated in either currency with 1 tap.',
      category: 'portfolio',
      tag: 'Döviz & Kurlar',
    },
  ];

  const filteredFaqs = useMemo(() => {
    return faqs.filter(faq => {
      const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory || (selectedCategory === 'faq');
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const content = `${faq.qTr} ${faq.qEn} ${faq.aTr} ${faq.aEn} ${faq.tag}`.toLowerCase();
      return content.includes(q);
    });
  }, [faqs, selectedCategory, searchQuery]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Knowledge Base Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 text-white p-6 sm:p-10 shadow-xl border border-blue-500/30">
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-bold text-blue-100">
            <span>💡</span>
            <span>{language === 'tr' ? 'MarketPulse Akademi & Bilgi Merkezi' : 'MarketPulse Academy & Documentation'}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
            {language === 'tr'
              ? 'MarketPulse\'ı Nasıl Kullanırsınız? Eksiksiz Rehber'
              : 'How to Use MarketPulse: Complete User Guide'}
          </h1>

          <p className="text-sm sm:text-base text-blue-100/90 leading-relaxed">
            {language === 'tr'
              ? 'Borsa düşüşlerinde panik yapmadan sermayenizi nasıl büyüteceğinizi, kademeli alım (DCA) kurallarını, pozisyon hesaplayıcıyı, temettü arbitrajını ve birleşik YZ analiz planını öğrenin.'
              : 'Learn how to navigate corrections without panic, apply disciplined DCA accumulation, size positions mathematically, execute dividend tax arbitrage, and unlock unified AI trade blueprints.'}
          </p>

          {/* Search Box */}
          <div className="pt-2">
            <div className="relative max-w-xl">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-base">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === 'tr' ? 'Örn: Kademeli Alım, Posizyon Hesapla, YZ Analiz, Temettü...' : 'Search: DCA, Position Calculator, AI Blueprint, Dividends...'}
                className="w-full pl-11 pr-10 py-3.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm font-semibold shadow-lg focus:outline-none focus:ring-4 focus:ring-white/30 transition-all border border-white/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold p-1 rounded-full"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Category Navigation Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar touch-pan-x -mx-3 px-3 sm:mx-0 sm:px-0">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shadow-xs active:scale-95 ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-blue-500/30 ring-2 ring-blue-400/30'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{language === 'tr' ? cat.labelTr : cat.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* 3-Step Quick Start Card */}
      <div className="bg-white dark:bg-[#090e1a] rounded-3xl p-5 sm:p-8 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl font-black">
              🚀
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {language === 'tr' ? '3 Adımda Kolay Başlangıç Kılavuzu' : '3-Step Quick Start Guide'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'tr' ? 'MarketPulse ile ilk 5 dakikada kurumsal standartta yatırım yapın' : 'Get started like an institutional investor in 5 minutes'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
            {language === 'tr' ? 'HIZLI REHBER' : 'QUICK START'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-blue-500/30">
              1
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'tr' ? 'Sinyalleri & YZ Planını İnceleyin' : 'Scan Live Signals & AI Blueprint'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Sinyaller sekmesine gidin. Yeşil "ALIM BÖLGESİ" etiketli kartlarda "💡 YZ Analiz & Planı" butonuna basarak tetiklenme şartlarını ve hedefleri inceleyin.'
                : 'Open the Signals tab. On setups marked "BUY ZONE", tap "💡 YZ Analiz & Planı" to inspect why it fired, invalidation conditions, and multi-tier targets.'}
            </p>
            <button
              onClick={() => onNavigateToTab('signals')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{language === 'tr' ? 'Sinyallere Git' : 'Open Signals'}</span>
              <span>→</span>
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-emerald-500/30">
              2
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'tr' ? 'Posizyon Hesapla & Portföye Ekle' : 'Size Position & Add to Portfolio'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? '"Posizyon Hesapla" butonuyla bütçenize göre maksimum risksiz lot miktarını öğrenin. Ardından Portföyüm sayfasından işleminizi kaydedin.'
                : 'Tap "Posizyon Hesapla" to determine exact share allocation based on your capital risk budget, then record the purchase into My Portfolio.'}
            </p>
            <button
              onClick={() => onNavigateToTab('portfolio')}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline pt-1 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{language === 'tr' ? 'Portföye Git' : 'Open Portfolio'}</span>
              <span>→</span>
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-purple-500/30">
              3
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {language === 'tr' ? 'Temettü Kartopu & Arbitraj ile Katlayın' : 'Compound via DRIP & Arbitrage'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Nakit temettüleri DRIP kartopuyla yeniden hisseye dönüştürün ve Ex-date öncesi %10 stopaj kaybını önleyen arbitraj stratejisini uygulayın.'
                : 'Reinvest dividend payouts into additional shares and execute ex-date tax arbitrage to eliminate the 10% withholding tax leakage.'}
            </p>
            <button
              onClick={() => onNavigateToTab('dividend')}
              className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline pt-1 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{language === 'tr' ? 'Temettü & Kartopu' : 'Open Dividends'}</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Core Concept Deep-Dives */}
      <div className="bg-white dark:bg-[#090e1a] rounded-3xl p-5 sm:p-8 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-6">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>🔬</span>
            <span>{language === 'tr' ? 'İnteraktif Strateji & Özellik Rehberi' : 'Interactive Feature & Strategy Walkthroughs'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {language === 'tr' ? 'Platformun tüm algoritmalarını, modüllerini ve matematiksel modellerini keşfedin' : 'Explore all platform algorithms, mathematical models, and modules'}
          </p>
        </div>

        {/* Tab Controls for Walkthrough */}
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar touch-pan-x">
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('signals')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'signals'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            🎯 {language === 'tr' ? 'Sinyal & İşlem Planı' : 'Signals & Trade Plan'}
          </button>
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('copilot')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'copilot'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            💡 {language === 'tr' ? 'YZ Analiz & Planı Modalı' : 'AI Blueprint Modal'}
          </button>
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('calculator')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'calculator'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            🧮 {language === 'tr' ? 'Posizyon Hesaplama' : 'Position Calculator'}
          </button>
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('tax_arbitrage')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'tax_arbitrage'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            🔄 {language === 'tr' ? 'Temettü Stopaj Arbitrajı' : 'Dividend Tax Arbitrage'}
          </button>
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('recovery')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'recovery'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            🔁 {language === 'tr' ? 'Toparlanma Takibi' : 'Recovery Tracker'}
          </button>
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('orb')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'orb'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            🔔 {language === 'tr' ? 'Açılış Seansı (ORB)' : 'Opening Range (ORB)'}
          </button>
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('dca')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'dca'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            💧 {language === 'tr' ? 'Kademeli Alım (DCA)' : 'Staggered DCA'}
          </button>
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('stoploss')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'stoploss'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            🛡️ {language === 'tr' ? 'Zarar Kes (Stop-Loss)' : 'Stop-Loss Discipline'}
          </button>
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('dividend')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'dividend'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            💰 {language === 'tr' ? 'Temettü Kartopu (DRIP)' : 'Dividend DRIP'}
          </button>
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('gemini')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'gemini'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            🤖 {language === 'tr' ? 'AI Gemini Danışmanı' : 'AI Gemini Engine'}
          </button>
          <button
            type="button"
            onClick={() => setActiveWalkthroughTab('backtest')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeWalkthroughTab === 'backtest'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            🏆 {language === 'tr' ? '5Y Backtest & Karne' : '5Y Backtest & Scorecard'}
          </button>
        </div>

        {/* Walkthrough Content Panes */}
        {activeWalkthroughTab === 'signals' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-slate-900/10 dark:from-blue-950/40 dark:via-indigo-950/20 dark:to-slate-900/40 border border-blue-500/30 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-base">🧠</span>
                <span className="text-xs font-black text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                  {language === 'tr' ? 'Şeffaf Algoritma: Neden ve Nasıl Tetiklenir?' : 'Non-Black-Box Algorithmic Edge'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'MarketPulse asla "kara kutu" tahminler üretmez. Her sinyal kartında algoritmanın doğruladığı kesin nicel şartlar, strateji tezi ve matematiksel risk/ödül haritası listelenir. Böylece bir hisseyi neden aldığınızı ve hangi şartta çıkacağınızı her zaman tam olarak bilirsiniz.'
                  : 'MarketPulse never relies on opaque black-box predictions. Every trade card explicitly enumerates the exact mathematical conditions satisfied, trade thesis rationale, and calculated risk-to-reward ratios so you always know why a setup triggered and where to exit.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">✓</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {language === 'tr' ? '1. Neden Tetiklendi? (Tetikleyiciler)' : '1. Why It Fired (Triggers)'}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {language === 'tr'
                    ? 'Fiyatın EMA20 üzerine geri çıkması, 20 günlük zirveden kontrollü düzeltme derinliği, 1.5x+ hacim patlaması ve mum gövdesinin üst %35 bantta kapanması gibi somut kurallar teyit edilir.'
                    : 'Confirms price reclaiming EMA20, controlled pullback depth off 20-day highs, 1.5x+ volume expansion, and bullish wick closure in the top 35% of the daily range.'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">🎯</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {language === 'tr' ? '2. Çok Kademeli Çıkış Planı' : '2. Multi-Tier Exit Blueprint'}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {language === 'tr'
                    ? 'Hedef 1 (+1.25R) seviyesinde pozisyonun %50\'si satılır ve stop maliyete (breakeven) çekilerek sıfır riskli "Free Trade" moduna geçilir. Hedef 2 (+2.25R Koşucu) ile trend sürülür.'
                    : 'Target 1 (+1.25R) scales out 50% profit and shifts stop-loss to Breakeven for a risk-free ride. Target 2 (+2.25R Runner) lets remaining shares capture the extended macro trend.'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-xs">🛡️</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {language === 'tr' ? '3. Geçersizlik Kuralı (Invalidation)' : '3. Thesis Invalidation Rule'}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {language === 'tr'
                    ? 'Fiyat stop seviyesine varmasa dahi teknik yapının çöktüğü anı (örneğin: "Kapanış EMA20 veya breakout barının altında gerçekleşirse") tespit ederek erken ve ucuz çıkış disiplini sağlar.'
                    : 'Specifies the precise technical event that dismantles the setup thesis (e.g., closing below EMA20), enabling disciplined capital defense before full stops are triggered.'}
                </p>
              </div>
            </div>

            {/* BIST vs US Market Dynamics Comparison Box */}
            <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚖️</span>
                  <span className="text-xs font-black uppercase tracking-wider text-blue-400">
                    {language === 'tr' ? 'BIST vs. ABD (US) Piyasa Dinamikleri Farkı' : 'BIST vs. US Equities Market Dynamics'}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-900/60 text-blue-300 border border-blue-700/50">
                  Adaptive Regimes
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-1.5">
                  <div className="flex items-center gap-2 text-rose-400 font-bold">
                    <span>🇹🇷</span>
                    <span>{language === 'tr' ? 'BIST (Borsa İstanbul) Kuralları' : 'BIST Exchange Mechanics'}</span>
                  </div>
                  <ul className="space-y-1 text-slate-300 list-disc list-inside">
                    <li>{language === 'tr' ? 'Günlük +/- %10 taban/tavan marj sınırları ve devre kesici koruması' : '+/-10% daily circuit breaker bands and trading halt mechanisms'}</li>
                    <li>{language === 'tr' ? 'Taban kilidi riskini önleyen dinamik ATR stop tamponu (%4-%6)' : 'Dynamic ATR stop buffers (4%–6%) guarding against lock-limit traps'}</li>
                    <li>{language === 'tr' ? 'T0 (+%3) ve Hedef 1 tavan tavan senaryolarına göre optimize' : 'T0 (+3%) and Target 1 calibrated to respect daily price ceilings'}</li>
                  </ul>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-1.5">
                  <div className="flex items-center gap-2 text-blue-400 font-bold">
                    <span>🇺🇸</span>
                    <span>{language === 'tr' ? 'ABD (Midas / US) Kuralları' : 'US Market Mechanics'}</span>
                  </div>
                  <ul className="space-y-1 text-slate-300 list-disc list-inside">
                    <li>{language === 'tr' ? 'Fiyat marj sınırı yok; devasa likidite ve küresel kurumsal hacim' : 'No price ceiling bands; massive global institutional liquidity'}</li>
                    <li>{language === 'tr' ? 'Bilanço (Earnings) öncesi gap riskini engelleyen filtreler' : 'Strict pre-earnings filters preventing overnight gap-down shocks'}</li>
                    <li>{language === 'tr' ? 'Genişletilmiş koşucu (+2.25R - +3.5R) ile mega trend sürüşü' : 'Extended runner targets (+2.25R to +3.5R) riding secular macro trends'}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeWalkthroughTab === 'copilot' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-base">💡</span>
                <span className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                  {language === 'tr' ? 'Birleşik YZ Analiz & Planı Modalı' : 'Unified AI Co-Pilot & Trade Blueprint Modal'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'Kartlarda önceden yer alan gereksiz uzunluktaki açılır akordeon kaldırılmış, tüm yapay zeka analizleri ve işlem planı tek bir butonda ("💡 YZ Analiz & Planı") toplanmıştır. Bu modal 4 ana sekmeden oluşur:'
                  : 'The redundant inline accordion has been removed from trade cards in favor of a unified modal ("💡 YZ Analiz & Planı"). This brings together 4 cohesive analytical views:'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-blue-600 dark:text-blue-400">1. Hızlı Bakış (Brief)</div>
                <p className="text-slate-600 dark:text-slate-400">
                  {language === 'tr' ? 'Giriş, stop, hedefler, 10-yıldızlı güven skoru ve çok günlük kurumsal akümülasyon durumu.' : 'Entry, stop, targets, 10-star setup score, and multi-day accumulation badge.'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-emerald-600 dark:text-emerald-400">2. YZ Kurulumu & Planı</div>
                <p className="text-slate-600 dark:text-slate-400">
                  {language === 'tr' ? 'Onaylanan teknik tetikleyiciler listesi, tezi bozan geçersizlik kuralı ve kademeli kâr alma adımları.' : 'Itemized technical trigger checklist, invalidation rule, and multi-tier scale-out steps.'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-purple-600 dark:text-purple-400">3. KAP & Piyasa Bağlamı</div>
                <p className="text-slate-600 dark:text-slate-400">
                  {language === 'tr' ? 'Hisseyle ilgili son KAP bildirimleri, endeks trend rejimi (Bullish/Bearish) ve XU100/SPY göreceli gücü.' : 'Recent KAP company filings, index regime status (Bullish/Bearish), and relative strength.'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-600 dark:text-amber-400">4. AI Asistanı (Gemini)</div>
                <p className="text-slate-600 dark:text-slate-400">
                  {language === 'tr' ? 'Hisseye özel doğal dilde senaryo soruları sorabileceğiniz interaktif yapay zeka danışmanı.' : 'Conversational agent powered by Gemini for scenario analysis and custom risk queries.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeWalkthroughTab === 'calculator' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
              <span className="text-xs font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider block">
                {language === 'tr' ? 'Matematiksel Posizyon Büyüklüğü Hesaplama (Position Sizing)' : 'Mathematical Capital Risk Budgeting'}
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'Başarılı yatırımcılar ne kadar kazanacaklarına değil, tek bir işlemde ne kadar kaybedebileceklerine odaklanır. Sinyal kartındaki "Posizyon Hesapla" butonu, portföyünüzün %1 veya %2\'sinden fazlasını asla riske atmayacak şekilde lot miktarını otomatik belirler.'
                  : 'Professional traders control risk first. The "Posizyon Hesapla" modal automatically solves for optimal lot sizing so that no single setup risks more than 1% or 2% of your total liquid account equity.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-3 font-mono text-xs">
              <div className="text-amber-400 font-bold"># Posizyon Boyutlandırma Formülü:</div>
              <div className="space-y-1 text-slate-300">
                <p>1. Sermaye Riski = Toplam Portföy × Risk Toleransı (%) [Örn: ₺100,000 × %1 = ₺1,000]</p>
                <p>2. Hisse Başına Risk = Giriş Fiyatı - Stop-Loss [Örn: ₺350 - ₺332.50 = ₺17.50]</p>
                <p>3. Alınacak Lot Sayısı = Sermaye Riski / Hisse Başına Risk [₺1,000 / ₺17.50 = 57 Lot]</p>
                <p>4. Toplam Pozisyon Tutarı = 57 Lot × ₺350 = ₺19,950 (%19.9 Portföy Ağırlığı)</p>
              </div>
            </div>
          </div>
        )}

        {activeWalkthroughTab === 'tax_arbitrage' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2">
              <span className="text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider block">
                {language === 'tr' ? 'BIST Temettü Dağıtımında Stopaj Arbitrajı Mantığı' : 'BIST Ex-Dividend Tax Arbitrage Mechanics'}
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'Borsa İstanbul\'da temettü dağıtım günü (Ex-Date) hisse senedinin açılış fiyatı dağıtılan BRÜT temettü kadar doğrudan düşer. Ancak bireysel yatırımcı %10 STOPAJ (vergi) kesintisi sonrası NET temettü alır. Öte yandan BIST hisse alım-satımında sermaye kazancı vergisi %0\'dır.'
                  : 'On Borsa Istanbul, the stock\'s opening price drops by the exact GROSS dividend on ex-date. Yet domestic individual investors only receive the NET dividend after a 10% withholding tax. Conversely, capital gains on BIST equities are taxed at 0%.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-rose-600 dark:text-rose-400 block">Senaryo A: Hisseyi Temettüye Taşımak</span>
                <p className="text-slate-600 dark:text-slate-400">
                  {language === 'tr'
                    ? 'Hisse ₺10 brüt temettü dağıttığında fiyatı ₺10 düşer. Fakat hesabınıza ₺9 net temettü geçer. Hisse başı ₺1.00 (%10) doğrudan vergi sızıntısı yaşanır.'
                    : 'A ₺10 gross dividend drops price by ₺10. But you receive only ₺9 net cash. You instantly incur a ₺1.00 (10%) tax leakage to withholding tax.'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 block">Senaryo B: Dağıtım Öncesi Satıp Sonrası Geri Almak</span>
                <p className="text-slate-600 dark:text-slate-400">
                  {language === 'tr'
                    ? 'Ex-date öncesi seans kapanışında hisseyi satıp, ex-date sabahı ₺10 iskontolu fiyattan geri alırsanız, sıfır komisyon ile %10 stopaj kesintisi tamamen cebinizde kalır!'
                    : 'Selling right before the ex-date and repurchasing at the ex-date opening discounted price legally captures the 10% withholding tax spread without paying dividend tax.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeWalkthroughTab === 'recovery' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 sm:p-5 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 space-y-2">
              <span className="text-xs font-black text-cyan-700 dark:text-cyan-300 uppercase tracking-wider block">
                {language === 'tr' ? 'İşlem Sonrası Toparlanma Takibi (Post-Exit Recovery Tracking)' : 'Post-Exit Recovery Tracking Architecture'}
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'Günlük pipeline\'ın 10. adımında çalışan bu modül; stop seviyesine değerek kapanan veya vadesi dolan sinyallerin sonraki 5, 10 ve 20 seanslık fiyat hareketini izler. Hissenin sonradan Hedef 1\'e veya yeni 20 günlük zirveye ulaşıp ulaşmadığını kayıt altına alır.'
                  : 'Operating in Step 10 of the daily pipeline, this system tracks closed/stopped setups for 5, 10, and 20 sessions post-exit. It records whether the asset subsequently rebounded to Target 1, Target 2, or set new 20-day highs.'}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 text-white border border-slate-800 text-xs space-y-2">
              <span className="font-bold text-amber-400 block">🛡️ Geçmiş Backtest Defteri Asla Bozulmaz</span>
              <p className="text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'Toparlanma takibi bağımsız bir gözlem katmanıdır. Tarihsel geriye dönük testlerde (backtest) bir işlem stop olduysa stop olarak kalır. Bu sayede hem katı sermaye koruma disiplini korunur hem de algoritmalarımızın stop mesafelerinin "likidite avlarına" karşı çok sıkı olup olmadığı bilimsel olarak ölçülür.'
                  : 'Recovery tracking operates as a read-only empirical observation layer. It NEVER alters historical backtest trades or converts losses into wins. This safeguards execution discipline while providing quant data on whether stops were set too tightly.'}
              </p>
            </div>
          </div>
        )}

        {activeWalkthroughTab === 'orb' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 sm:p-5 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 space-y-2">
              <span className="text-xs font-black text-orange-700 dark:text-orange-300 uppercase tracking-wider block">
                {language === 'tr' ? '15-Dakikalık Açılış Seansı Kırılımı (ORB Scanner)' : '15-Minute Opening Range Breakout Scanner'}
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'BIST seansı 10:00\'da açıldıktan sonra ilk 15 dakikada (10:00–10:15) oluşan yüksek ve alçak seviyeler günün ana referans koridorudur. Kurumsal algoritmalar bu tavanın üzerinde hacimli alım yaptığında gün boyu süren güçlü trendler oluşur.'
                  : 'The high and low range established during the first 15 minutes of trading (10:00–10:15 BIST / 09:30–09:45 US) forms the opening benchmark. High-volume breakouts beyond this corridor frequently initiate intraday continuation.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-900 dark:text-white block mb-1">Açılış Gap Oranı</span>
                <span className="text-slate-500">Pozitif açılış boşluğu (%0.5 - %2.5) alıcı iştahını doğrular.</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-900 dark:text-white block mb-1">Hacim Çarpanı &ge; 1.5x</span>
                <span className="text-slate-500">İlk 15 dakikalık hacmin 20 günlük açılış ortalamasının üzerinde olması.</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-900 dark:text-white block mb-1">15D Tavan Kırılımı</span>
                <span className="text-slate-500">Tavanın üzerinde kalıcı kapanış gün boyu momentumu destekler.</span>
              </div>
            </div>
          </div>
        )}

        {activeWalkthroughTab === 'dca' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2">
              <span className="text-xs font-black text-blue-700 dark:text-blue-300 uppercase tracking-wider block">
                {language === 'tr' ? 'Kademeli Alım (DCA) Örnek Senaryosu:' : 'Real-World DCA Accumulation Scenario:'}
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'Diyelim ki ISMEN hissesini ₺32.60\'tan 76 adet aldınız (Maliyet: ₺2,477). BIST düzeltmeye girdi ve hisse ₺31.08\'e geriledi. Eğer panik yapıp satarsanız ₺115 zarar edersiniz. Ancak sistemin tavsiye ettiği gibi 2. Kademede 66 adet daha eklerseniz ortalama maliyetiniz ₺31.89\'a düşer! Hisse ₺28.78\'e indiğinde 3. Kademeyi eklerseniz maliyet ₺30.15\'e iner ve hisse en ufak bir tepki verdiğinde doğrudan kâra geçersiniz.'
                  : 'Suppose you buy 76 shares of ISMEN at ₺32.60 (Cost: ₺2,477). If BIST pulls back and price falls to ₺31.08, panic selling locks in a loss. But deploying Tranche 2 (66 shares) immediately drops your cost basis to ₺31.89! Adding Tranche 3 near ₺28.78 drops your average to ₺30.15, meaning any market rebound immediately turns the entire position into net profit.'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-900 dark:text-white block mb-1">Tranche 1: %33</span>
                <span className="text-slate-500">İlk sinyal teyidinde pozisyon açma</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-900 dark:text-white block mb-1">Tranche 2: %33</span>
                <span className="text-slate-500">Destek testinde maliyet düşürme</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-900 dark:text-white block mb-1">Tranche 3: %34</span>
                <span className="text-slate-500">Aşırı iskontolu dip dönüşünde alım</span>
              </div>
            </div>
          </div>
        )}

        {activeWalkthroughTab === 'stoploss' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2">
              <span className="text-xs font-black text-rose-700 dark:text-rose-300 uppercase tracking-wider block">
                {language === 'tr' ? 'Stop-Loss Ne Zaman Çalıştırılmalı?' : 'When to Honor Stop-Losses:'}
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'Kısa vadeli momentum ve swing hisselerinde (örneğin AKBNK stop seviyesi ₺67.50 kırıldığında) piyasa yapısı bozulmuştur. Burada inatlaşıp beklemek sermayenizi kilitleyebilir. Sistem pozisyonunuz stop-loss seviyesini aştığında "PAUSE" uyarısı verir. Bu hisselerde toparlanma tepkisinde nakite geçip, sermayenizi TURSG ve ISMEN gibi yüksek temettülü sağlam şirketlere kaydırmalısınız.'
                  : 'For short-term swing setups (such as AKBNK breaching its ₺67.50 stop level), technical structure is invalidated. Bagholding ties up valuable capital. The engine marks this as PAUSE. Capital should be disciplined, cutting risk on bounces and rotating into dependable dividend compounders like TURSG and ISMEN.'}
              </p>
            </div>
          </div>
        )}

        {activeWalkthroughTab === 'dividend' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
              <span className="text-xs font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider block">
                {language === 'tr' ? 'Bileşik Getiri Kartopu (DRIP):' : 'The Compounding DRIP Snowball:'}
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'ISMEN %8.55, TURSG %7.09, TRGYO %5.20 ve SCHD %3.80 gibi hisseler piyasa düşse dahi nakit üretir. "Kartopu & Projeksiyon" sekmesinde bu nakit akışını simüle edebilirsiniz. Her yıl temettünüzle yeni hisse aldığınızda, sonraki yıl hem eski hisseleriniz hem de bedava aldığınız yeni hisseler temettü öder. Bu geometrik büyüme 10 yıl içinde finansal özgürlük sağlar.'
                  : 'Quality assets like ISMEN (8.55%), TURSG (7.09%), and SCHD (3.80%) generate hard cashflow regardless of short-term market noise. Reinvesting this cashflow generates an exponential compounding curve where free shares produce additional dividends every subsequent year.'}
              </p>
            </div>
          </div>
        )}

        {activeWalkthroughTab === 'gemini' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 space-y-2">
              <span className="text-xs font-black text-purple-700 dark:text-purple-300 uppercase tracking-wider block">
                {language === 'tr' ? 'Google Gemini Entegrasyonu Nasıl Yapılır?' : 'How to Connect Google Gemini AI:'}
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'MarketPulse dahili olarak 20+ sektör analiz kurallarına sahiptir. Eğer Google AI Studio üzerinden aldığınız ücretsiz Gemini API anahtarınızı sol alt menüdeki "Ayarlar" sekmesinden eklerseniz, AI Danışmanı canlı web verileriyle birleşerek dilediğiniz tüm hisseler için detaylı bilanço ve temettü gerekçesi üretir.'
                  : 'MarketPulse includes built-in reasoning across 20+ financial sectors. By adding your free Gemini API key in the Settings drawer, you unlock live multi-step generative reasoning and financial sanity checks for any stock on BIST or US exchanges.'}
              </p>
            </div>
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <span>⚙️</span>
                <span>{language === 'tr' ? 'Ayarlar Panelini Aç' : 'Open Settings Panel'}</span>
              </button>
            )}
          </div>
        )}

        {activeWalkthroughTab === 'backtest' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-slate-900/10 dark:from-amber-950/40 dark:via-orange-950/20 dark:to-slate-900/40 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🏆</span>
                <span className="text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                  {language === 'tr' ? '5 Yıllık Gerçekleşen İstatistiksel Backtest Raporu (2021–2026)' : '5-Year Empirical Institutional Backtest Report (2021–2026)'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'BIST 100 (101 hisse) ve ABD (32 mega-cap hisse ve ETF) üzerinde 5 yıllık geçmiş veride tüm stratejiler komisyon ve kayma (slippage) dahil edilerek test edilmiştir. Tek tip kurallar yerine piyasa mikro-yapılarına göre ayrıştırılmış strateji filtreleri uygulanmaktadır.'
                  : 'All quantitative strategies were tested across 5 years of historical data on 101 BIST stocks and 32 US tickers with realistic commissions and slippage. Market-differentiated rules outperform universal static models by aligning with each exchange\'s microstructure.'}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                    <span>🇹🇷</span>
                    <span>Borsa İstanbul (BIST 100) — En İyi Stratejiler</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                    Kombine: +%749.9 (1.55 Sharpe)
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">🚀 Momentum Breakout</span>
                      <span className="text-[11px] text-slate-500">20 Günlük Zirve Kırılımı + Hacim</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">+%797.1</span>
                      <span className="text-[10px] text-slate-400">Sharpe: 1.69 | %56.7 WR</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">🛡️ Trend Pullback Reclaim</span>
                      <span className="text-[11px] text-slate-500">Düzeltme & EMA20 Geri Kazanımı</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">+%579.7</span>
                      <span className="text-[10px] text-slate-400">Sharpe: 1.70 | MaxDD: -%23.6</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">⚓ Anchored VWAP Bounce</span>
                      <span className="text-[11px] text-slate-500">60G Kurumsal Dip Testi</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">+%210.2</span>
                      <span className="text-[10px] text-slate-400">Sharpe: 0.86 | PF: 1.22</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">⚡ High Tight Flag (HTF)</span>
                      <span className="text-[11px] text-slate-500">+%60+ Yükseliş Sonrası Dar Bayrak</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">+%32.4</span>
                      <span className="text-[10px] text-slate-400">%66.7 WR | PF: 2.89 | MaxDD: -%5.1</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                    <span>🇺🇸</span>
                    <span>ABD Borsaları (Midas / US) — En İyi Stratejiler</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                    Düşük Risk / Drawdown Odaklı
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">🛡️ Trend Pullback Reclaim</span>
                      <span className="text-[11px] text-slate-500">ABD'nin #1 Numaralı Trend Motoru</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">+%36.2</span>
                      <span className="text-[10px] text-slate-400">PF: 1.33 | MaxDD: Sadece -%14.2</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">🪤 Liquidity Sweep Reclaim</span>
                      <span className="text-[11px] text-slate-500">20G Stop Avı & Kurumsal Emilim</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">+%21.7</span>
                      <span className="text-[10px] text-slate-400">PF: 1.17 | Kurumsal Dark-Pool</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">🎯 Connors RSI-2 Rebound</span>
                      <span className="text-[11px] text-slate-500">Stage-2'de Panik Dip Dönüşü (RSI2 &le; 10)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">+%19.6</span>
                      <span className="text-[10px] text-slate-400">%53.4 WR | MaxDD: -%15.8</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">📐 Minervini VCP Pattern</span>
                      <span className="text-[11px] text-slate-500">Oynaklık Daralması & Dar Pivot Kırılımı</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 block">Sıfır Risk Savunması</span>
                      <span className="text-[10px] text-slate-400">MaxDD: -%4.7 | 1:3+ Asimetrik</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800 text-xs space-y-1.5">
              <span className="font-bold text-amber-400 block">⚠️ ABD'de Ham Breakout Neden Kaldırıldı?</span>
              <p className="text-slate-300 leading-relaxed">
                {language === 'tr'
                  ? 'ABD mega-cap hisselerinde (AAPL, NVDA, MSFT vb.) basit 20 günlük tepe kırılımları (-%5.2) kurumsal algoritmaların likidite avı nedeniyle sıkça sahte kırılıma (whipsaw) yol açar. Bu nedenle ABD pazarında kırılımlar yerine Minervini VCP (dar pivot), Pullback Reclaim (+%36.2) ve Likidite Avı (+%21.7) kullanılmaktadır. BIST\'te ise taban kuralı korumasıyla ham kırılımlar (+%797.1) lider durumdadır.'
                  : 'In US large caps, naive 20-day breakouts (-5.2%) are frequently exploited by institutional algorithms as liquidity traps. Thus, US screening focuses on Volatility Contractions (VCP), Pullback Reclaims (+36.2%), and Liquidity Sweeps (+21.7%). Conversely, on BIST, cluster momentum and circuit breaker guards make raw breakouts (+797.1%) the highest alpha generator.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Every Page in the App Explained (All 9 Modules) */}
      <div className="space-y-4">
        <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
          <span>📱</span>
          <span>{language === 'tr' ? '9 Temel Modül ve Sayfa Rehberi' : 'All 9 Platform Modules & Views Explained'}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Sinyaller */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090e1a] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600">🎯</span>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'tr' ? 'Sinyaller & Fırsatlar' : 'Signals & Alpha Picks'}
                </h3>
                <span className="text-[10px] text-slate-400">
                  {language === 'tr' ? 'Algoritmik Sinyaller & YZ Planı' : 'Algorithmic Setups & AI Blueprint'}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Pullback Reclaim, Minervini VCP ve Kurumsal Likidite taramaları. Her kartta "Posizyon Hesapla" ve "💡 YZ Analiz & Planı" butonları yer alır.'
                : 'Pullback Reclaims, Minervini VCP, and Institutional Sweeps. Each card provides instant access to the Position Calculator and unified AI Blueprint.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateToTab('signals')}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                {language === 'tr' ? 'Sayfayı Aç →' : 'Open View →'}
              </button>
            </div>
          </div>

          {/* Card 2: Portföy */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090e1a] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">💼</span>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'tr' ? 'Canlı Portföyüm' : 'My Live Portfolio'}
                </h3>
                <span className="text-[10px] text-slate-400">Maliyet Takibi, Nakit Defteri & DCA</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Varlıklarınızın anlık kâr/zarar oranı, stop-loss mesafesi, nakit defteri ve kademeli alım aksiyonları. TRY ve USD varlıkları konsolide eder.'
                : 'Live PnL tracking, distance to stop levels, cash balance ledger, and automated DCA tranche recommendations across both TRY and USD assets.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateToTab('portfolio')}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                {language === 'tr' ? 'Sayfayı Aç →' : 'Open View →'}
              </button>
            </div>
          </div>

          {/* Card 3: Temettü */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090e1a] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600">💰</span>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'tr' ? 'Temettü Gelirleri' : 'Dividend Tracker'}
                </h3>
                <span className="text-[10px] text-slate-400">Pasif Nakit Akışı & Stopaj Arbitrajı</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Yıllık ve aylık temettü takvimi, güvenlik puanları, %10 stopaj tasarruf simülatörü ve doğal dilde soru sorabileceğiniz AI danışmanı.'
                : 'Monthly and annual dividend cashflow calendar, payout safety scores, 10% withholding tax arbitrage modeling, and conversational AI advisor.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateToTab('dividend')}
                className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                {language === 'tr' ? 'Sayfayı Aç →' : 'Open View →'}
              </button>
            </div>
          </div>

          {/* Card 4: Kartopu Projeksiyon */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090e1a] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600">🔮</span>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'tr' ? 'Kartopu & Projeksiyon' : 'Snowball & Comparator'}
                </h3>
                <span className="text-[10px] text-slate-400">DRIP Simülatörü & BIST/US Kıyaslama</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Temettülerinizi yeniden yatırarak 5, 10, 20 yılda ulaşabileceğiniz servet simülatörü. Midas ABD temettü hisseleriyle BIST hisselerini kıyaslar.'
                : 'Compound growth simulator projecting dividend reinvestment milestones over 5, 10, and 20 years, alongside BIST vs US stock comparisons.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateToTab('forecast')}
                className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
              >
                {language === 'tr' ? 'Sayfayı Aç →' : 'Open View →'}
              </button>
            </div>
          </div>

          {/* Card 5: KAP Bildirimleri */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090e1a] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600">⚡</span>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'tr' ? 'KAP Bildirimleri' : 'KAP Catalysts'}
                </h3>
                <span className="text-[10px] text-slate-400">Canlı Şirket Haberleri & Geri Alımlar</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Pay geri alımları (Buybacks), yeni dev sözleşmeler ve temettü kararlarını anında yakalayan canlı KAP akışı ve duygu puanlaması.'
                : 'Real-time crawler highlighting share buybacks, major contract signings, and dividend filings classified via AI sentiment.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateToTab('catalysts')}
                className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                {language === 'tr' ? 'Sayfayı Aç →' : 'Open View →'}
              </button>
            </div>
          </div>

          {/* Card 6: Kurumsal Quant Hub */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090e1a] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">🏛️</span>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'tr' ? 'Kurumsal Quant Hub (PRO)' : 'Quant Hub (PRO)'}
                </h3>
                <span className="text-[10px] text-slate-400">Stat-Arb, Eşbütünleşme & Z-Score</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Hedge fonların kullandığı çift işlem (Pairs Trading) ve Z-Score spread arbitraj modelleri. Değer, Kalite ve Momentum faktör sıralaması.'
                : 'Statistical arbitrage and cointegration pair trading engine modeling mean-reverting spreads, paired with Value, Quality & Momentum factor ranks.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateToTab('quant')}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                {language === 'tr' ? 'Sayfayı Aç →' : 'Open View →'}
              </button>
            </div>
          </div>

          {/* Card 7: Strateji Karnesi */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090e1a] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600">📈</span>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'tr' ? 'Strateji Karnesi & Denetim' : 'Strategy Scorecard & Audit'}
                </h3>
                <span className="text-[10px] text-slate-400">1,173+ Geçmiş İşlem & Toparlanma</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Geçmiş işlemlerin şeffaf denetim defteri, strateji kazanma oranları, kâr faktörleri, Sharpe oranları ve işlem sonrası toparlanma analizleri.'
                : 'Public audit ledger of 1,173+ historical trades, strategy win rates, profit factors, Sharpe ratios, and post-exit recovery tracking stats.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateToTab('scorecard')}
                className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                {language === 'tr' ? 'Sayfayı Aç →' : 'Open View →'}
              </button>
            </div>
          </div>

          {/* Card 8: Açılış Seansı ORB */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090e1a] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-600">🔔</span>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'tr' ? 'Açılış Seansı (ORB)' : 'Opening Range (ORB)'}
                </h3>
                <span className="text-[10px] text-slate-400">15-Dk Koridor & Hacim Kırılımı</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Sabah 10:00 - 10:15 aralığındaki açılış koridorunun yönünü, pozitif gap oranlarını ve 1.5x üzeri hacim patlamalarını yakalayan seans motoru.'
                : 'Morning 15-minute range breakout scanner tracking gap percentages and 1.5x volume expansions for high-probability opening trades.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateToTab('orb')}
                className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
              >
                {language === 'tr' ? 'Sayfayı Aç →' : 'Open View →'}
              </button>
            </div>
          </div>

          {/* Card 9: Rehber & SSS */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#090e1a] border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600">📖</span>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {language === 'tr' ? 'Rehber, Akademi & SSS' : 'Academy & Help Center'}
                </h3>
                <span className="text-[10px] text-slate-400">Tüm Kavramlar & Arama Merkezi</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'tr'
                ? 'Aradığınız tüm soruların cevapları, kavram rehberi, strateji karşılaştırmaları ve interaktif animasyonlu eğitim adımları.'
                : 'Comprehensive searchable documentation, interactive walkthroughs, strategy glossaries, and step-by-step risk management guides.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                {language === 'tr' ? 'Şu An Bu Sayfadasınız' : 'Currently Viewing'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Accordion Section */}
      <div className="bg-white dark:bg-[#090e1a] rounded-3xl p-5 sm:p-8 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>❓</span>
              <span>{language === 'tr' ? 'Sıkça Sorulan Sorular (SSS)' : 'Frequently Asked Questions (FAQ)'}</span>
            </h2>
            <p className="text-xs text-slate-500">
              {language === 'tr' ? 'Kullanıcıların en çok merak ettiği sorular ve detaylı kurumsal açıklamalar' : 'Answers to the most common investing and platform questions'}
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-400">
            {filteredFaqs.length} {language === 'tr' ? 'Konu' : 'Items'}
          </span>
        </div>

        <div className="space-y-3">
          {filteredFaqs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              {language === 'tr' ? 'Aradığınız kriterlere uygun soru bulunamadı.' : 'No matching questions found.'}
            </div>
          ) : (
            filteredFaqs.map((faq, idx) => {
              const isOpen = expandedFaq === idx;
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isOpen
                      ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-500/50 shadow-xs'
                      : 'bg-slate-50/70 dark:bg-slate-850/40 border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedFaq(isOpen ? null : idx)}
                    className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-base shrink-0">{isOpen ? '📂' : '📁'}</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                        {language === 'tr' ? faq.qTr : faq.qEn}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hidden sm:inline">
                        {faq.tag}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-blue-200/40 dark:border-blue-900/40 animate-in fade-in duration-150">
                      <p>{language === 'tr' ? faq.aTr : faq.aEn}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
