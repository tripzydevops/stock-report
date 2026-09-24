import React, { useState } from 'react';

export interface AssetData {
  id: string;
  symbol: string;
  name: string;
  market: string;
  price: number;
  changePercent: number;
  rsi: number;
  emaStatus: 'Above 200 EMA' | 'Below 200 EMA' | 'Near 50 EMA';
  volumeRatio: number;
}

interface AssetTableProps {
  assets: AssetData[];
}

export default function AssetTable({ assets }: AssetTableProps) {
  const [filter, setFilter] = useState('All');
  const [sortConfig, setSortConfig] = useState<{ key: keyof AssetData; direction: 'asc' | 'desc' } | null>(null);

  const markets = ['All', 'US', 'BIST', 'TEFAS'];

  const filteredAssets = assets.filter(a => filter === 'All' || a.market === filter);

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
    if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
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
    if (status === 'Above 200 EMA') return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (status === 'Below 200 EMA') return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  };

  return (
    <div className="w-full bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tracked Assets</h2>
        <div className="flex space-x-2">
          {markets.map(m => (
            <button
              key={m}
              onClick={() => setFilter(m)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                filter === m 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {['symbol', 'name', 'market', 'price', 'changePercent', 'rsi', 'emaStatus', 'volumeRatio'].map((key) => (
                <th 
                  key={key} 
                  onClick={() => requestSort(key as keyof AssetData)}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hidden sm:table-cell"
                >
                  {key.replace('changePercent', 'Change%').replace('emaStatus', 'EMA Status').replace('volumeRatio', 'Vol Ratio')}
                  {sortConfig?.key === key && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedAssets.map((asset) => (
              <tr key={asset.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 dark:text-white">{asset.symbol}</td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-300 hidden sm:table-cell">{asset.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 hidden md:table-cell">{asset.market}</td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white font-medium">{asset.price.toFixed(2)}</td>
                <td className={`px-6 py-4 whitespace-nowrap font-medium ${asset.changePercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {asset.changePercent > 0 ? '+' : ''}{asset.changePercent.toFixed(2)}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-300 hidden lg:table-cell">{asset.rsi.toFixed(1)}</td>
                <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getEmaBadge(asset.emaStatus)}`}>
                    {asset.emaStatus}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-300 hidden lg:table-cell">{asset.volumeRatio.toFixed(2)}x</td>
              </tr>
            ))}
            {sortedAssets.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  No assets found for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
