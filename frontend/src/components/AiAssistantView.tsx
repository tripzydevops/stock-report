'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface SourceCitation {
  title: string;
  source: string;
  url?: string;
  published?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolsExecuted?: string[];
  sources?: SourceCitation[];
}

export default function AiAssistantView() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: isEn
        ? "Hello! I am your **Autonomous Market & Portfolio Copilot**. You can ask me anything freely—querying our **internal Supabase database** (44+ dividend schedules, 146+ ORB session setups, holdings), retrieving **live external financial news**, or conducting **6-month forward-looking scenario modeling** on any stock."
        : "Merhaba! Ben **Piyasa & Portföy AI Asistanınızım**. Doğal dille dilediğiniz soruyu sorabilirsiniz—**Supabase veritabanımıza** (44+ temettü takvimi, 146+ ORB açılış seansı, portföy), **canlı harici finans haberlerine** ve hisselerin **6 aylık ileriye dönük senaryo modellerine** anında erişip analiz edebilirim.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputQuery.trim();
    if (!query || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setIsLoading(true);

    try {
      let response: Response | null = null;
      let lastError: any = null;

      // Retry up to 2 times to handle transient mobile carrier network handovers (WiFi to 4G/LTE)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetch('/api/assistant/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [...messages, userMessage].map((m) => ({
                role: m.role,
                content: m.content,
              })),
              language,
            }),
          });
          if (response && response.ok) break;
        } catch (fetchErr: any) {
          lastError = fetchErr;
          if (attempt === 0) {
            // Wait 800ms for carrier socket handover and retry once
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error(`API returned ${response?.status || 'network error'}`);
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || (isEn ? 'Analysis complete.' : 'Analiz tamamlandı.'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolsExecuted: data.tools_executed || [],
        sources: data.sources_used || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error('Failed to get response from AI Assistant:', err);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: isEn
          ? `⚠️ Unable to retrieve real-time data: ${err.message}. Please verify network connection.`
          : `⚠️ Veri alınırken bir aksaklık oluştu: ${err.message}. Lütfen bağlantınızı kontrol edin.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome_reset',
        role: 'assistant',
        content: isEn
          ? "Sohbet sıfırlandı. How can I assist your market analysis today?"
          : "Sohbet geçmişi temizlendi. Bugün hangi hisse, temettü takvimi veya seans verisini analiz etmek istersiniz?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const getToolDisplayName = (toolKey: string) => {
    switch (toolKey) {
      case 'tool_query_dividends':
        return isEn ? '📊 Supabase Dividend Database' : '📊 Supabase Temettü Veritabanı (44 Varlık)';
      case 'tool_analyze_morning_orb_session':
        return isEn ? '⚡ 15-min ORB Session Scanner' : '⚡ 15dk ORB Açılış Seans Analizi (146 Hisse)';
      case 'tool_fetch_live_news':
        return isEn ? '📰 Live Financial News & KAP' : '📰 Canlı Finans Haberleri & KAP Bildirimleri';
      case 'tool_get_stock_profile':
        return isEn ? '🏛️ Quantitative Stock Factors' : '🏛️ Şirket Temel & Teknik Faktörleri';
      case 'tool_generate_six_month_outlook':
        return isEn ? '🔮 6-Month Forward-Looking Model' : '🔮 6 Aylık Senaryo & Volatilite Modeli';
      default:
        return `🔧 ${toolKey}`;
    }
  };

  // Helper to format inline markdown (**bold**, *italic*, `code`)
  const formatInlineMarkdown = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={i} className="font-extrabold text-blue-600 dark:text-blue-400">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return (
          <em key={i} className="italic text-gray-700 dark:text-gray-300">
            {part.slice(1, -1)}
          </em>
        );
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code key={i} className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-amber-600 dark:text-amber-400 font-semibold border border-slate-200 dark:border-slate-700">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  // Helper to format markdown text gracefully
  const renderFormattedMarkdown = (text: string) => {
    const lines = text.split('\n');
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    const elements: React.ReactNode[] = [];

    const flushTable = (keyPrefix: string) => {
      if (tableHeaders.length > 0 && tableRows.length > 0) {
        elements.push(
          <div key={`table-${keyPrefix}`} className="my-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 shadow-xs max-w-full">
            <table className="w-full text-left text-xs border-collapse min-w-[320px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-100/80 dark:bg-gray-800/90">
                  {tableHeaders.map((th, idx) => (
                    <th key={idx} className="px-3 py-2 font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                      {formatInlineMarkdown(th.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-gray-100 dark:border-gray-800/60 hover:bg-blue-50/30 dark:hover:bg-blue-900/10">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                        {formatInlineMarkdown(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      } else if (tableHeaders.length > 0) {
        elements.push(
          <p key={`single-header-${keyPrefix}`} className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 my-1">
            {formatInlineMarkdown(tableHeaders.join(' · '))}
          </p>
        );
      }
      tableHeaders = [];
      tableRows = [];
      inTable = false;
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Table line
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());

        // Check if separator line
        if (cells.every((c) => /^:?-+:?$/.test(c))) {
          // separator row, ignore
          return;
        }

        if (!inTable) {
          inTable = true;
          tableHeaders = cells;
        } else {
          tableRows.push(cells);
        }
        return;
      }

      // If we exit table
      if (inTable) {
        flushTable(`flush-${index}`);
      }

      // Headers
      if (trimmed.startsWith('### ')) {
        elements.push(
          <h3 key={index} className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mt-4 mb-2 flex items-center gap-2">
            {formatInlineMarkdown(trimmed.replace('### ', ''))}
          </h3>
        );
      } else if (trimmed.startsWith('#### ')) {
        elements.push(
          <h4 key={index} className="text-sm sm:text-base font-semibold text-blue-600 dark:text-blue-400 mt-3 mb-1.5">
            {formatInlineMarkdown(trimmed.replace('#### ', ''))}
          </h4>
        );
      } else if (trimmed.startsWith('> ')) {
        elements.push(
          <div key={index} className="p-3 my-2.5 rounded-xl border-l-4 border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-xs sm:text-sm text-gray-700 dark:text-gray-300">
            {formatInlineMarkdown(trimmed.replace('> ', ''))}
          </div>
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(
          <li key={index} className="ml-4 list-disc text-xs sm:text-sm text-gray-700 dark:text-gray-300 my-0.5">
            {formatInlineMarkdown(trimmed.replace(/^[-*]\s+/, ''))}
          </li>
        );
      } else if (/^\d+\.\s+/.test(trimmed)) {
        elements.push(
          <li key={index} className="ml-4 list-decimal text-xs sm:text-sm text-gray-700 dark:text-gray-300 my-0.5">
            {formatInlineMarkdown(trimmed.replace(/^\d+\.\s+/, ''))}
          </li>
        );
      } else if (trimmed === '---') {
        elements.push(<hr key={index} className="my-3 border-gray-200 dark:border-gray-700/60" />);
      } else if (trimmed.length > 0) {
        elements.push(
          <p key={index} className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 my-1 leading-relaxed">
            {formatInlineMarkdown(trimmed)}
          </p>
        );
      }
    });

    if (inTable) {
      flushTable('end');
    }

    return elements;
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-130px)] md:h-[calc(100vh-140px)] max-w-5xl mx-auto w-full px-2 sm:px-4">
      {/* Top Banner / System Status */}
      <div className="flex items-center justify-between p-2.5 sm:p-4 mb-2 rounded-2xl bg-gradient-to-r from-blue-900/30 via-purple-900/20 to-gray-900/40 border border-gray-200 dark:border-gray-800 shadow-sm backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-lg sm:text-xl shadow-md shadow-blue-500/20 shrink-0">
            🤖
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-white">
                {isEn ? 'Autonomous Market & Portfolio Copilot' : 'Otonom Piyasa & Portföy Asistanı'}
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {isEn ? 'Connected: Supabase DB + Live News + ORB' : 'Bağlı: Supabase DB + Canlı Haberler + ORB'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {isEn
                ? 'Open queries across all stocks, morning sessions, dividend calendars, and 6-month outlooks'
                : 'Tüm hisseler, sabah seansı, temettü takvimleri ve 6 aylık projeksiyonlar için serbest sorgu alanı'}
            </p>
          </div>
        </div>

        <button
          onClick={handleClearHistory}
          className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium transition-colors"
        >
          {isEn ? 'Clear Chat' : 'Sohbeti Temizle'}
        </button>
      </div>

      {/* Main Chat Thread */}
      <div className="flex-1 overflow-y-auto px-1 sm:px-2 py-3 space-y-4 no-scrollbar">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 sm:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs shrink-0 font-bold shadow-sm ${
                  isUser
                    ? 'bg-blue-600 text-white'
                    : 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                }`}
              >
                {isUser ? '👤' : '🤖'}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-white dark:bg-gray-800/90 text-gray-900 dark:text-gray-100 border border-gray-200/80 dark:border-gray-700/80 rounded-tl-none'
                }`}
              >
                {/* Tool Badges on Assistant Messages */}
                {!isUser && msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5 pb-2 border-b border-gray-100 dark:border-gray-700/60">
                    {msg.toolsExecuted.map((t, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/70"
                      >
                        {getToolDisplayName(t)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Content */}
                <div className="text-xs sm:text-sm">
                  {isUser ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  ) : (
                    <div>{renderFormattedMarkdown(msg.content)}</div>
                  )}
                </div>

                {/* Source Citations */}
                {!isUser && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/60">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      {isEn ? 'Verified Sources & Data Feeds:' : 'Doğrulanan Kaynaklar ve Veri Akışları:'}
                    </span>
                    <div className="space-y-0.5">
                      {msg.sources.map((s, idx) => (
                        <div key={idx} className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                          <span className="text-blue-500">🔗</span>
                          {s.url ? (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline text-blue-600 dark:text-blue-400 font-medium"
                            >
                              {s.title}
                            </a>
                          ) : (
                            <span className="font-medium text-gray-700 dark:text-gray-300">{s.title}</span>
                          )}
                          <span className="text-[10px] text-gray-400">({s.source})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                <div className={`text-[10px] mt-1.5 text-right ${isUser ? 'text-blue-100' : 'text-gray-400'}`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 flex items-center justify-center text-xs animate-pulse font-bold">
              🤖
            </div>
            <div className="bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700/80 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
              <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                {isEn ? 'Querying database & analyzing news...' : 'Veritabanı taranıyor & canlı haberler analiz ediliyor...'}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Clean Unconstrained Input Bar - Sticky on Mobile above bottom navigation */}
      <div className="sticky bottom-[58px] md:static bg-white/95 dark:bg-[#070b13]/95 backdrop-blur-md pt-2 pb-1 z-20">
        <form onSubmit={handleSendMessage} className="relative flex items-end gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isEn
                ? 'Ask freely about any stock (e.g. TURSG, THYAO), January dividends, morning session ORB...'
                : 'Serbestçe sorun (Örn: Ocak temettüleri, TURSG 6 aylık analiz, sabah seansı neden pozitif...)'
            }
            className="flex-1 max-h-32 min-h-[40px] py-2 px-2.5 sm:px-3 rounded-xl resize-none text-xs sm:text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
          />

          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span>{isEn ? 'Send' : 'Gönder'}</span>
            <span>🚀</span>
          </button>
        </form>
      </div>
    </div>
  );
}
