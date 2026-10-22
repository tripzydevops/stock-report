import React, { useState } from 'react';
import { addAsset } from '../lib/api';

interface AddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddAssetModal({ isOpen, onClose, onSuccess }: AddAssetModalProps) {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [assetClass, setAssetClass] = useState('Stock');
  const [market, setMarket] = useState('US');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await addAsset({ symbol, name, asset_class: assetClass, market });
      onSuccess();
      onClose();
      // Reset form
      setSymbol('');
      setName('');
      setAssetClass('Stock');
      setMarket('US');
    } catch (err: any) {
      setError(err.message || 'Failed to add asset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 p-6 z-10 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add New Asset</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Symbol / Ticker</label>
            <input 
              type="text" required 
              value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL, O, SCHD"
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white uppercase"
            />
          </div>

          {/* Quick-add Midas Favorites Chips */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Popular Midas US Assets (REITs, ETFs & Dividend Kings):
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { s: 'O', n: 'Realty Income (Monthly REIT)', c: 'Stock' },
                { s: 'VICI', n: 'VICI Properties (REIT)', c: 'Stock' },
                { s: 'SCHD', n: 'Schwab US Dividend ETF', c: 'ETF' },
                { s: 'JEPI', n: 'JPMorgan Equity Premium ETF', c: 'ETF' },
                { s: 'PLD', n: 'Prologis (Logistics REIT)', c: 'Stock' },
                { s: 'VOO', n: 'Vanguard S&P 500 ETF', c: 'ETF' },
                { s: 'KO', n: 'The Coca-Cola Co (Dividend King)', c: 'Stock' },
              ].map(q => (
                <button
                  key={q.s}
                  type="button"
                  onClick={() => {
                    setSymbol(q.s);
                    setName(q.n);
                    setAssetClass(q.c);
                    setMarket('US');
                  }}
                  className="px-2 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                >
                  +{q.s}
                </button>
              ))}
            </div>
          </div>

          {/* Quick-add BIST GYO Favorites Chips */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Popüler BIST GYO (Turkish REITs):
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { s: 'EKGYO', n: 'Emlak Konut GYO', c: 'Stock' },
                { s: 'TRGYO', n: 'Torunlar GYO', c: 'Stock' },
                { s: 'ISGYO', n: 'İş GYO', c: 'Stock' },
                { s: 'OZKGY', n: 'Özak GYO', c: 'Stock' },
                { s: 'ALGYO', n: 'Alarko GYO', c: 'Stock' },
                { s: 'RYGYO', n: 'Reysaş GYO', c: 'Stock' },
              ].map(q => (
                <button
                  key={q.s}
                  type="button"
                  onClick={() => {
                    setSymbol(q.s);
                    setName(q.n);
                    setAssetClass(q.c);
                    setMarket('BIST');
                  }}
                  className="px-2 py-1 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                >
                  +{q.s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asset Name</label>
            <input 
              type="text" required
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apple Inc."
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Market</label>
              <select 
                value={market} onChange={(e) => setMarket(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
              >
                <option value="US">US Market</option>
                <option value="BIST">BIST (Turkey)</option>
                <option value="TEFAS">TEFAS Funds</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asset Class</label>
              <select 
                value={assetClass} onChange={(e) => setAssetClass(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
              >
                <option value="Stock">Stock</option>
                <option value="ETF">ETF</option>
                <option value="Fund">Mutual Fund</option>
                <option value="Crypto">Crypto</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-200 dark:border-gray-700 mt-6">
            <button 
              type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Adding...
                </>
              ) : 'Add Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
