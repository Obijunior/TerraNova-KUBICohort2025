import React, { useState, useEffect } from 'react';
import { useWallet } from '@/app/context/WalletContext';
import { ArrowUpRight, ArrowDownRight, Search } from 'lucide-react';
import TradingPoolSection from './TradingPoolSection';
import { mockMinerals, getCurrentPrice, calculatePriceChange } from '@/app/utils/mockData';
import type { PositionConfig, CompanyAsset } from '@/app/trade/page';
import { convertUSDtoXRP } from '../../../apis/src/services/xrpPriceService';

type MockMineralEntry = {
  priceHistory: { date: string; price: number; }[];
};

const typedMockMinerals: Record<string, MockMineralEntry> = mockMinerals;

type MineralPool = {
  id: string;
  key: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  liquidity: string;
  tradingFee: string;
  tokensInPool: number;
};

type UserPosition = {
  id: string;
  symbol: string;
  amount: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
};

type TraderViewProps = {
  walletConnected: boolean;
  positionConfigs: PositionConfig[];
  setPositionConfigs: React.Dispatch<React.SetStateAction<PositionConfig[]>>;
  closedPnL: number;
  setClosedPnL: React.Dispatch<React.SetStateAction<number>>;
  companyAssets: CompanyAsset[];
};

export default function TraderView({ 
  walletConnected, 
  positionConfigs, 
  setPositionConfigs, 
  closedPnL, 
  // setClosedPnL,
  companyAssets
}: TraderViewProps) {
  const mineralPools: MineralPool[] = companyAssets.map(asset => {
    const mineralData = typedMockMinerals[asset.key];
    const change24h = mineralData ? calculatePriceChange(mineralData.priceHistory) : 0;
    const liquidity = asset.tokensInPool * asset.price;

    return {
      id: asset.symbol,
      key: asset.key,
      symbol: asset.symbol,
      name: asset.name,
      type: 'Commodity', // Assuming all are commodities
      price: asset.price,
      change24h: change24h,
      liquidity: `$${(liquidity / 1_000_000).toFixed(1)}M`,
      tradingFee: `${asset.feePercentage}%`,
      tokensInPool: asset.tokensInPool,
    };
  });

  const [selectedPool, setSelectedPool] = useState<MineralPool | null>(null);
  const [tradeAmount, setTradeAmount] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [estimatedXRP, setEstimatedXRP] = useState<string>(''); 
  const [buyError, setBuyError] = useState<string | null>(null);
  const { xrpBalance, setXrpBalance, refreshBalance } = useWallet();

  const userPositions: UserPosition[] = (() => {
    return positionConfigs.map(config => {
      const currentPrice = getCurrentPrice(typedMockMinerals[config.mineralKey].priceHistory);
      const pnl = (currentPrice - config.entryPrice) * config.amount;
      const pnlPercent = ((currentPrice - config.entryPrice) / config.entryPrice) * 100;

      return {
        id: config.id,
        symbol: config.symbol,
        amount: config.amount,
        entryPrice: config.entryPrice,
        currentPrice,
        pnl,
        pnlPercent
      };
    });
  })();

  const portfolioValue = userPositions.reduce((sum, position) => sum + position.amount * position.currentPrice, 0);
  const openPnL = userPositions.reduce((sum, position) => sum + position.pnl, 0);
  const totalPnL = openPnL + closedPnL;
  const totalInitialValue = userPositions.reduce((sum, position) => sum + position.amount * position.entryPrice, 0);
  const totalPnLPercent = totalInitialValue > 0 ? (openPnL / totalInitialValue) * 100 : 0;

  const filteredPools = mineralPools.filter(pool =>
    pool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pool.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const itemsPerPage = 5;
  const totalPages = Math.ceil(filteredPools.length / itemsPerPage) || 1;
  const paginatedPools = filteredPools.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  // Handles the asynchronous price calculation
  useEffect(() => {
    const tradeValue = parseFloat(tradeAmount || '0');
    let cancelled = false;
    let timeoutId: number | undefined;

    if (selectedPool && tradeValue > 0) {
      const calculateXRP = async () => {
        const estimatedUSD = tradeValue * selectedPool.price;
        try {
          const resp = await convertUSDtoXRP(estimatedUSD);
          const xrpAmount = resp ?? 0;
          const formatted = (Number(xrpAmount) || 0).toFixed(6);
          if (!cancelled) setEstimatedXRP(prev => (prev !== formatted ? formatted : prev));
        } catch (error) {
          console.error("Error converting USD to XRP:", error);
          if (!cancelled) setEstimatedXRP(prev => (prev !== 'N/A' ? 'N/A' : prev));
        }
      };

      calculateXRP();
    } else {
      // schedule the clear to avoid calling setState synchronously inside the effect
      timeoutId = window.setTimeout(() => {
        setEstimatedXRP(prev => (prev !== '' ? '' : prev));
      }, 0);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [tradeAmount, selectedPool]); // Dependencies

  return (
    <div className="space-y-8">
      {/* Portfolio Stats */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg p-6 border border-stone-200 shadow-sm">
          <p className="text-sm text-secondary mb-2">Portfolio Value</p>
          <p className="text-3xl font-bold text-primary">${portfolioValue.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg p-6 border border-stone-200 shadow-sm">
          <p className="text-sm text-secondary mb-2">Total P&L</p>
          <p className={`text-3xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {totalPnL < 0 ? '-' : ''}${Math.abs(totalPnL).toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg p-6 border border-stone-200 shadow-sm">
          <p className="text-sm text-secondary mb-2">Active Positions</p>
          <p className="text-3xl font-bold text-primary">{userPositions.length}</p>
        </div>
        <div className="bg-white rounded-lg p-6 border border-stone-200 shadow-sm">
          <p className="text-sm text-secondary mb-2">24h Change</p>
          <p className={`text-3xl font-bold ${totalPnLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%</p>
        </div>
      </section>

      {/* Your Positions */}
      <section className="mb-8">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-stone-100">
            <h2 className="text-2xl font-bold text-primary">Your Positions</h2>
          </div>
          {userPositions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Asset</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Entry Price</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Current Price</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">P&L</th>
                    {/* <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Actions</th>s */}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {userPositions.map(position => (
                    <tr key={position.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-primary">{position.symbol}</td>
                      <td className="px-6 py-4 text-primary">{position.amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-primary">${position.entryPrice.toFixed(2)}</td>
                      <td className="px-6 py-4 text-primary">${position.currentPrice.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <div className={position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                          <div className="font-semibold">{position.pnl < 0 ? '-' : ''}${Math.abs(position.pnl).toFixed(2)}</div>
                          <div className="text-xs">{position.pnlPercent >= 0 ? '+' : '-'}{Math.abs(position.pnlPercent).toFixed(2)}%</div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-secondary">No active positions. Start trading to create positions.</p>
            </div>
          )}
        </div>
      </section>

      {/* Available Trading Pools */}
      <section>
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-stone-100 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-primary mb-1">Available Markets</h2>
              <p className="text-sm text-secondary">Buy tokenized mineral commodities</p>
            </div>
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-secondary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by name or symbol..."
                className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Asset</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">24h Change</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Liquidity</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Fee</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {paginatedPools.map(pool => (
                  <tr key={pool.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-primary">{pool.symbol}</div>
                      <div className="text-sm text-secondary">{pool.name}</div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-primary">${pool.price.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-1 font-medium ${
                        pool.change24h >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {pool.change24h >= 0 ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4" />
                        )}
                        <span>{pool.change24h >= 0 ? '+' : ''}{pool.change24h}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-primary">{pool.liquidity}</div>
                        <div className="text-xs text-secondary">{pool.tokensInPool.toLocaleString()} tokens</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-primary font-medium">{pool.tradingFee}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedPool(pool)}
                        disabled={!walletConnected}
                        className="backdrop-blur-sm px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-opacity-90 transition-all font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        Buy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-stone-100 flex justify-between items-center text-sm">
            <span className="text-secondary">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-stone-200 rounded-md hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-stone-200 rounded-md hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* Trade Options */}
      <section>
        <TradingPoolSection positionConfigs={positionConfigs} setPositionConfigs={setPositionConfigs} />
      </section>

      {/* Risk Disclaimer */}
      <section className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex gap-4">
          <div className="text-xl font-bold text-blue-900">ℹ</div>
          <div>
            <h4 className="font-semibold text-blue-900 mb-1">Trading Risk Disclosure</h4>
            <p className="text-sm text-blue-800">
              Mineral commodity trading involves substantial risk and is not suitable for all investors. 
              Prices are volatile and can fluctuate rapidly. Only trade with capital you can afford to lose.
              Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </section>

      {/* Trade Modal */}
      {selectedPool && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-stone-200 shadow-lg">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold text-primary">{selectedPool.symbol}</h3>
                <p className="text-sm text-secondary">{selectedPool.name}</p>
              </div>
              <button 
                onClick={() => setSelectedPool(null)} 
                className="text-secondary hover:text-primary transition-colors text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="mb-6 p-4 bg-stone-50 rounded-lg space-y-3 border border-stone-200">
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Current Price</span>
                <span className="font-semibold text-primary">${selectedPool.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Pool Liquidity</span>
                <span className="font-semibold text-primary">{selectedPool.tokensInPool} tokens</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Trading Fee</span>
                <span className="font-semibold text-primary">{selectedPool.tradingFee}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-primary mb-2">Trade Amount</label>
                <input
                  type="number"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full px-4 py-3 border border-stone-200 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                />
                <p className="text-xs text-secondary mt-2">
                  Estimated cost: ${(parseFloat(tradeAmount || '0') * selectedPool.price).toFixed(2)} / {estimatedXRP || '... '} XRP
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4">
                <button
                  onClick={async () => {
                    setBuyError(null);
                    const mineralKey = selectedPool.key;

                    // Recompute required XRP at purchase time to avoid races
                    const tradeValue = parseFloat(tradeAmount || '0');
                    const estimatedUSD = tradeValue * selectedPool.price;
                    let requiredXrp = 0;
                    try {
                      const resp = await convertUSDtoXRP(estimatedUSD);
                      requiredXrp = Number(resp ?? 0);
                    } catch (err) {
                      console.error('Failed to convert USD to XRP at purchase time', err);
                      setBuyError('Unable to verify price — try again');
                      return;
                    }

                    const walletXrp = parseFloat(xrpBalance || '0');
                    if (requiredXrp > walletXrp) {
                      setBuyError('Insufficient XRP balance');
                      return;
                    }

                    if (mineralKey && ['oil', 'gold', 'silver'].includes(mineralKey)) {
                      const currentPrice = getCurrentPrice(typedMockMinerals[mineralKey as 'oil' | 'gold' | 'silver'].priceHistory);
                      const newId = (Math.max(...positionConfigs.map(p => parseInt(p.id)), 0) + 1).toString();
                      setPositionConfigs([
                        ...positionConfigs,
                        {
                          id: newId,
                          symbol: selectedPool.symbol,
                          amount: parseFloat(tradeAmount),
                          entryPrice: currentPrice,
                          mineralKey: mineralKey as 'oil' | 'gold' | 'silver'
                        }
                      ]);

                      // Deduct XRP from wallet balance locally and then refresh from backend
                      const newBalance = walletXrp - requiredXrp;
                      setXrpBalance(newBalance.toFixed(6));
                      try { await refreshBalance(); } catch {}

                      setSelectedPool(null);
                      setTradeAmount('');
                      setEstimatedXRP(''); // Reset XRP estimate on successful trade
                    }
                  }}
                  disabled={!tradeAmount || !walletConnected || estimatedXRP === 'N/A' || estimatedXRP === ''}
                  className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Buy
                </button>
                <button
                  onClick={() => {
                    setSelectedPool(null);
                    setTradeAmount('');
                    setEstimatedXRP(''); // Reset XRP estimate on cancel
                  }}
                  className="px-4 py-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-colors font-semibold"
                >
                  Cancel
                </button>
              </div>
              {!walletConnected && (
                <p className="text-xs text-red-600 text-center pt-2">Please connect a wallet to trade</p>
              )}

              {buyError && (
                <p className="text-xs text-red-600 text-center pt-2">{buyError}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
