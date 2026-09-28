import React, { useState } from 'react';

export interface AssetData {
  id: string;
  symbol: string;
  name: string;
  market: string;
  price: number;
  changePercent: number;
  rsi: number;
  emaStatus: 'Above 200 EMA' | 'Below 200 EMA' | 'Near 50 EMA' | string;
  volumeRatio: number;
  high52w?: number;
  low52w?: number;
}

interface AssetTableProps {
  assets: AssetData[];
  onSelectAsset?: (asset: AssetData) => void;
}

export default function AssetTable({ assets, onSelectAsset }: AssetTableProps) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof AssetData; direction: 'asc' | 'desc' } | null>({
    key: 'changePercent',
    direction: 'desc'
  });

  const markets = ['All', 'US', 'BIST', 'TEFAS'];

  const filteredAssets = assets.filter(a => {
    const matchesMarket = filter === 'All' || a.market === filter;
    const matchesSearch = search === '' || 
      a.symbol.toLowerCase().includes(search.toLowerCase()) || 
      a.name.toLowerCase().includes(search.toLowerCase());
    return matchesMarket && matchesSearch;
  });

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const aVal = a[key] ?? 0;
    const bVal = b[key] ?? 0;
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const requestSort = (key: keyof AssetData) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getEmaBadge = (status: string) => {
    if (status.includes('Above 200')) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400';
    if (status.includes('Below 200')) return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400';
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400';
  };

  const getRsiBadge = (rsi: number) => {
    if (rsi >= 70) return 'text-amber-500 font-bold';
    if (rsi <= 35) return 'text-emerald-500 font-bold';
    return 'text-gray-600 dark:text-gray-300';
  };

  return (
    <div className="w-full bg-white dark:bg-gray-800 shadow-sm rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-gray-50/50 dark:bg-gray-800/50">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tracked Assets Universe ({assets.length} Total)</h2>
          <p className="text-xs text-gray-500">Real-time indicators across BIST 100, US Equities, and ETFs.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <input
            type="text"
            placeholder="Search symbol or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48"
          />

          <div className="flex space-x-1">
            {markets.map(m => (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className={`px-3 py-1.5 text-xs rounded-xl font-bold transition-all ${
                  filter === m 
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30' 
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/80 sticky top-0 z-10 backdrop-blur">
            <tr>
              <th onClick={() => requestSort('symbol')} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-500">
                Symbol {sortConfig?.key === 'symbol' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('name')} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-500 hidden sm:table-cell">
                Company Name
              </th>
              <th onClick={() => requestSort('market')} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-500 hidden md:table-cell">
                Market
              </th>
              <th onClick={() => requestSort('price')} className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-500">
                Price {sortConfig?.key === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('changePercent')} className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-500">
                Change % {sortConfig?.key === 'changePercent' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('rsi')} className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-500">
                RSI (14) {sortConfig?.key === 'rsi' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => requestSort('emaStatus')} className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-500 hidden sm:table-cell">
                200 EMA Status
              </th>
              <th onClick={() => requestSort('volumeRatio')} className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-500 hidden md:table-cell">
                Volume Ratio
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                History
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedAssets.map((asset) => (
              <tr 
                key={asset.id} 
                onClick={() => onSelectAsset?.(asset)}
                className="hover:bg-blue-50/50 dark:hover:bg-blue-950/30 cursor-pointer transition-colors group"
                title={`Click to view ${asset.symbol} daily OHLCV price history & indicators`}
              >
                <td className="px-5 py-3.5 whitespace-nowrap font-bold text-gray-900 dark:text-white">
                  {asset.symbol}
                  <div className="text-[11px] text-gray-500 sm:hidden">{asset.name}</div>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-gray-500 dark:text-gray-300 hidden sm:table-cell">{asset.name}</td>
                <td className="px-5 py-3.5 whitespace-nowrap hidden md:table-cell">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {asset.market}
                  </span>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-right text-gray-900 dark:text-white font-bold">
                  {asset.market === 'US' ? '$' : '₺'}{asset.price.toFixed(2)}
                </td>
                <td className={`px-5 py-3.5 whitespace-nowrap text-right font-bold ${asset.changePercent >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {asset.changePercent > 0 ? '+' : ''}{asset.changePercent.toFixed(2)}%
                </td>
                <td className={`px-5 py-3.5 whitespace-nowrap text-right ${getRsiBadge(asset.rsi)}`}>
                  {asset.rsi > 0 ? asset.rsi.toFixed(1) : '-'}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-center hidden sm:table-cell">
                  <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${getEmaBadge(asset.emaStatus)}`}>
                    {asset.emaStatus}
                  </span>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-right text-gray-500 dark:text-gray-300 hidden md:table-cell">
                  {asset.volumeRatio > 0 ? `${asset.volumeRatio.toFixed(2)}x` : '-'}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectAsset?.(asset);
                    }}
                    className="px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-800 transition-all inline-flex items-center gap-1 group-hover:shadow-sm"
                  >
                    <span>📊</span>
                    <span>OHLCV</span>
                  </button>
                </td>
              </tr>
            ))}
            {sortedAssets.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  No matching assets found for "{search}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
