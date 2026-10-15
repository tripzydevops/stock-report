export type DateFilterPreset = 'ALL' | 'TODAY' | '7D' | '30D' | 'THIS_MONTH' | 'CUSTOM';

export interface DateRangeFilter {
  preset: DateFilterPreset;
  startDate: string | null; // 'YYYY-MM-DD'
  endDate: string | null;   // 'YYYY-MM-DD'
}

export function getCurrentDateStr(): string {
  // Returns today's ISO date string 'YYYY-MM-DD'
  try {
    return new Date().toISOString().slice(0, 10);
  } catch (e) {
    return '2026-10-15';
  }
}

export function getDateRangeFromPreset(
  preset: DateFilterPreset,
  customStart?: string | null,
  customEnd?: string | null
): DateRangeFilter {
  const todayStr = getCurrentDateStr();
  const now = new Date(todayStr);

  if (preset === 'ALL') {
    return { preset: 'ALL', startDate: null, endDate: null };
  }

  if (preset === 'TODAY') {
    return { preset: 'TODAY', startDate: todayStr, endDate: todayStr };
  }

  if (preset === '7D') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { preset: '7D', startDate: d.toISOString().slice(0, 10), endDate: todayStr };
  }

  if (preset === '30D') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return { preset: '30D', startDate: d.toISOString().slice(0, 10), endDate: todayStr };
  }

  if (preset === 'THIS_MONTH') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const startOfMonth = `${y}-${m}-01`;
    return { preset: 'THIS_MONTH', startDate: startOfMonth, endDate: todayStr };
  }

  if (preset === 'CUSTOM') {
    return {
      preset: 'CUSTOM',
      startDate: customStart || null,
      endDate: customEnd || null,
    };
  }

  return { preset: 'ALL', startDate: null, endDate: null };
}

export function isDateInRange(
  dateStr?: string | null,
  range?: DateRangeFilter | null
): boolean {
  if (!range || range.preset === 'ALL') return true;
  if (!dateStr) return false;

  // Extract 'YYYY-MM-DD' prefix in case dateStr contains timestamps
  const cleanDate = dateStr.slice(0, 10);

  if (range.startDate && cleanDate < range.startDate) {
    return false;
  }
  if (range.endDate && cleanDate > range.endDate) {
    return false;
  }
  return true;
}

export function formatFilterDisplay(
  range: DateRangeFilter,
  lang: 'tr' | 'en' = 'tr'
): string {
  if (range.preset === 'ALL') {
    return lang === 'tr' ? 'Tüm Zamanlar' : 'All Time';
  }
  if (range.preset === 'TODAY') {
    return lang === 'tr' ? `Bugün (${range.startDate})` : `Today (${range.startDate})`;
  }
  if (range.preset === '7D') {
    return lang === 'tr' ? `Son 7 Gün (${range.startDate} – ${range.endDate})` : `Last 7 Days (${range.startDate} – ${range.endDate})`;
  }
  if (range.preset === '30D') {
    return lang === 'tr' ? `Son 30 Gün (${range.startDate} – ${range.endDate})` : `Last 30 Days (${range.startDate} – ${range.endDate})`;
  }
  if (range.preset === 'THIS_MONTH') {
    return lang === 'tr' ? `Bu Ay (${range.startDate} – ${range.endDate})` : `This Month (${range.startDate} – ${range.endDate})`;
  }
  if (range.preset === 'CUSTOM') {
    if (range.startDate && range.endDate) {
      return `${range.startDate} – ${range.endDate}`;
    }
    if (range.startDate) {
      return `${range.startDate} → ...`;
    }
    if (range.endDate) {
      return `... → ${range.endDate}`;
    }
  }
  return lang === 'tr' ? 'Özel Tarih Aralığı' : 'Custom Range';
}
