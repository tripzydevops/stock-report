'use client';

import React, { useState } from 'react';
import { 
  Sparkles, 
  ShieldCheck, 
  TrendingUp, 
  Coins, 
  Compass, 
  CheckCircle2, 
  ArrowRight, 
  ChevronRight, 
  X,
  Sliders,
  DollarSign,
  Layers
} from 'lucide-react';
import { userSignalBuffer } from '@/lib/userSignalBuffer';

export type LifestyleArchetype = 
  | 'passive_cashflow' 
  | 'momentum_growth' 
  | 'capital_preserver' 
  | 'balanced_compounder';

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';

export interface UserProfileContext {
  is_cold_start: boolean;
  lifestyle_archetype: LifestyleArchetype;
  risk_tolerance: RiskTolerance;
  account_size_try: number;
  account_size_usd: number;
  target_markets: string[];
  seed_watchlist: string[];
  completed_at?: string;
}

interface OnboardingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileSaved: (profile: UserProfileContext) => void;
  currentProfile?: UserProfileContext | null;
}

const ARCHETYPES = [
  {
    id: 'passive_cashflow' as LifestyleArchetype,
    title: 'Pasif Nakit Akışı',
    subtitle: 'Düzenli Temettü & Düşük Oynaklık',
    icon: Coins,
    color: 'from-amber-500 to-orange-500',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/10',
    badge: 'Temettü & Kira Benzeri Gelir',
    description: 'Düzenli nakit temettü ödeyen BIST 30 ve US temettü şampiyonlarına odaklanarak bileşik büyüme hedefler.',
    seedWatchlist: ['FROTO', 'TUPRS', 'ISMEN', 'TURSG', 'TTRAK']
  },
  {
    id: 'momentum_growth' as LifestyleArchetype,
    title: 'Momentum & Büyüme',
    subtitle: 'Trend Kırılımları & Yüksek Beta',
    icon: TrendingUp,
    color: 'from-blue-600 to-cyan-500',
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/10',
    badge: 'Stage 2 Yükseliş Trendi',
    description: 'Hacim patlaması, sabah ORB seans kırılımları ve EMA 20/50/200 hizalanması gösteren lider hisselere girer.',
    seedWatchlist: ['THYAO', 'ASELS', 'BIMAS', 'AAPL', 'MSFT']
  },
  {
    id: 'capital_preserver' as LifestyleArchetype,
    title: 'Sermaye Koruyucu',
    subtitle: 'Defansif Mavi Çip & Sıkı Risk Koruması',
    icon: ShieldCheck,
    color: 'from-emerald-600 to-teal-500',
    borderColor: 'border-emerald-500/30',
    bgColor: 'bg-emerald-500/10',
    badge: 'Maksimum Koruma',
    description: 'Düşük beta, güçlü bilançolu holdingler ve dar stop-loss kuralları ile sermaye erimesini önler.',
    seedWatchlist: ['KCHOL', 'SISE', 'ENKAI', 'AKBNK', 'MSFT']
  },
  {
    id: 'balanced_compounder' as LifestyleArchetype,
    title: 'Dengeli Bileşikçi (Önerilen)',
    subtitle: 'Büyüme + Temettü Hibrit Stratejisi',
    icon: Compass,
    color: 'from-indigo-600 to-purple-600',
    borderColor: 'border-indigo-500/30',
    bgColor: 'bg-indigo-500/10',
    badge: 'Optimal Hibrit Denge',
    description: 'Nakit akışı sağlayan sağlam temettü hisseleri ile momentum swing fırsatlarını akıllıca dengeler.',
    seedWatchlist: ['TURSG', 'FROTO', 'THYAO', 'ISMEN', 'AKBNK']
  }
];

export default function OnboardingWizardModal({
  isOpen,
  onClose,
  onProfileSaved,
  currentProfile
}: OnboardingWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedArchetype, setSelectedArchetype] = useState<LifestyleArchetype>(
    currentProfile?.lifestyle_archetype || 'balanced_compounder'
  );
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>(
    currentProfile?.risk_tolerance || 'moderate'
  );
  const [accountSizeTry, setAccountSizeTry] = useState<number>(
    currentProfile?.account_size_try || 300000
  );
  const [targetMarkets, setTargetMarkets] = useState<string[]>(
    currentProfile?.target_markets || ['BIST', 'US']
  );

  if (!isOpen) return null;

  const currentArchetypeObj = ARCHETYPES.find(a => a.id === selectedArchetype) || ARCHETYPES[3];

  const handleToggleMarket = (market: string) => {
    if (targetMarkets.includes(market)) {
      if (targetMarkets.length > 1) {
        setTargetMarkets(targetMarkets.filter(m => m !== market));
      }
    } else {
      setTargetMarkets([...targetMarkets, market]);
    }
  };

  const handleFinish = () => {
    const profile: UserProfileContext = {
      is_cold_start: false,
      lifestyle_archetype: selectedArchetype,
      risk_tolerance: riskTolerance,
      account_size_try: accountSizeTry,
      account_size_usd: Math.round(accountSizeTry / 38.0),
      target_markets: targetMarkets,
      seed_watchlist: currentArchetypeObj.seedWatchlist,
      completed_at: new Date().toISOString()
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('market_pulse_user_profile', JSON.stringify(profile));
    }

    // Buffer interaction via Layer 1 Signal Module
    userSignalBuffer.recordArchetypeSelection(selectedArchetype, {
      risk_tolerance: riskTolerance,
      account_size_try: accountSizeTry,
      target_markets: targetMarkets
    });
    userSignalBuffer.flush();

    onProfileSaved(profile);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Yatırımcı Kimliği & Strateji Sihirbazı
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Adım {step} / 3 — {step === 1 ? 'Yatırımcı Arketipi' : step === 2 ? 'Risk & Sermaye Ölçeği' : 'Otonom Ajan Sentezi'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PROGRESS BAR */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1">
          <div 
            className="bg-blue-600 h-1 transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* MODAL BODY */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* ================= STEP 1: ARCHETYPE SELECTION ================= */}
          {step === 1 && (
            <div className="space-y-3.5">
              <div className="bg-blue-50 dark:bg-blue-950/40 p-3.5 rounded-2xl border border-blue-200/50 dark:border-blue-800/40 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                🎯 <strong>Geçmiş işlem geçmişiniz olmasa bile</strong>, otonom çoklu ajan sistemimiz (Screener, DividendSafety, RiskGuard) tavsiyelerini doğrudan sizin yaşam tarzı arketipinize göre özelleştirir.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ARCHETYPES.map((arch) => {
                  const isSelected = selectedArchetype === arch.id;
                  const Icon = arch.icon;
                  return (
                    <button
                      key={arch.id}
                      type="button"
                      onClick={() => setSelectedArchetype(arch.id)}
                      className={`relative text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected 
                          ? `${arch.bgColor} ${arch.borderColor} ring-2 ring-blue-500 shadow-md` 
                          : 'bg-white dark:bg-slate-850/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${arch.color} text-white flex items-center justify-center shadow-xs`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                        <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                          {arch.title}
                        </h3>
                        <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                          {arch.subtitle}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">
                          {arch.description}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400">İzleme Listesi:</span>
                        <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">
                          {arch.seedWatchlist.slice(0, 3).join(', ')}...
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= STEP 2: RISK & CAPITAL SCALE ================= */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Risk Tolerance */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Risk Toleransı (İşlem Başına Risk)
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'conservative' as RiskTolerance, label: 'Korumacı', risk: '%0.5 Risk', desc: 'Sıkı ATR Stop' },
                    { id: 'moderate' as RiskTolerance, label: 'Dengeli', risk: '%1.0 Risk', desc: 'Standart Model' },
                    { id: 'aggressive' as RiskTolerance, label: 'Agresif', risk: '%2.0 Risk', desc: 'Geniş Marj' }
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRiskTolerance(r.id)}
                      className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                        riskTolerance === r.id
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/40 font-bold'
                          : 'bg-white dark:bg-slate-850/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="text-xs font-black">{r.label}</div>
                      <div className="text-[11px] font-mono mt-0.5">{r.risk}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Capital Scale (TRY) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Hedef Portföy Büyüklüğü (TRY)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { val: 50000, label: '₺50.000' },
                    { val: 150000, label: '₺150.000' },
                    { val: 300000, label: '₺300.000' },
                    { val: 1000000, label: '₺1.000.000+' }
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setAccountSizeTry(item.val)}
                      className={`py-2 px-3 rounded-xl border text-center font-mono text-xs font-bold transition-all cursor-pointer ${
                        accountSizeTry === item.val
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Markets */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Tercih Edilen Piyasalar
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { id: 'BIST', label: 'Borsa İstanbul (BIST)', desc: 'TL Bazlı Hisseler & Temettüler' },
                    { id: 'US', label: 'ABD Borsaları (NYSE/NASDAQ)', desc: 'USD Bazlı Global Şirketler' }
                  ].map((m) => {
                    const active = targetMarkets.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleToggleMarket(m.id)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-900 dark:text-emerald-200 ring-1 ring-emerald-500'
                            : 'bg-white dark:bg-slate-850/60 border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black">{m.label}</span>
                          {active && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{m.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 3: REASONING ENGINE PREVIEW ================= */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-4 sm:p-5 text-white space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-widest bg-white/20 px-2 py-0.5 rounded-full">
                    Kişiselleştirilmiş Ajan Konfigürasyonu
                  </span>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-lg font-black">{currentArchetypeObj.title}</h3>
                  <p className="text-xs text-blue-100">{currentArchetypeObj.subtitle}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/20 text-xs">
                  <div>
                    <div className="text-[10px] text-blue-200">Risk Limiti</div>
                    <div className="font-bold font-mono">
                      {riskTolerance === 'conservative' ? '%0.5' : riskTolerance === 'moderate' ? '%1.0' : '%2.0'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-blue-200">Portföy Bütçesi</div>
                    <div className="font-bold font-mono">₺{accountSizeTry.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-blue-200">Piyasalar</div>
                    <div className="font-bold font-mono">{targetMarkets.join(', ')}</div>
                  </div>
                </div>
              </div>

              {/* Multi-Agent Rule Synthesis */}
              <div className="bg-white dark:bg-slate-850 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  Otonom Ajan Kuralları (Cold-Start Çözümü)
                </h4>
                <div className="space-y-2 text-slate-600 dark:text-slate-300 text-[11px]">
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <span><strong>Screener Agent:</strong> Seçtiğiniz profile uygun lider hisseleri ({currentArchetypeObj.seedWatchlist.slice(0, 3).join(', ')}) öncelikli tarar.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <span><strong>Dividend Safety Agent:</strong> Nakit akışı ve KAP temettü ödeme takvimini otomatik doğrular.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                    <span><strong>RiskGuard Agent:</strong> ₺{accountSizeTry.toLocaleString()} sermayenize göre maksimum lot ve kesin stop-loss hesaplar.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-850/50 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((step - 1) as any)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Geri
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              Şimdilik Atla
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((step + 1) as any)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              Devam Et
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              Stratejimi Aktifleştir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
