import React, { useState, useEffect } from 'react';
import { Search, Users, DollarSign, Info } from 'lucide-react';
import type { PositionConfig } from '@/app/trade/page';
import { useWallet } from '@/app/context/WalletContext';
import { convertUSDtoXRP } from '../../../apis/src/services/xrpPriceService';
import { createSellOffer, loginWithSeed } from '../../../apis/src/services/xrplNew';

type TradingPoolSectionProps = {
  positionConfigs: PositionConfig[];
  setPositionConfigs: React.Dispatch<React.SetStateAction<PositionConfig[]>>;
};

type PosWithIssuer = PositionConfig & { issuer?: string };

type Order = {
  id: string;
  type: 'sell' | 'buy';
  seller: string;
  asset: string;
  assetName: string;
  mineralKey?: 'oil' | 'gold' | 'silver';
  amount: number;
  pricePerToken: number;
  totalValue: number;
  timestamp: string;
};

export default function TradingPoolSection({ positionConfigs, setPositionConfigs }: TradingPoolSectionProps) {
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [estimatedXRP, setEstimatedXRP] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const { walletAddress, isConnected, xrpBalance, setXrpBalance, refreshBalance } = useWallet();

  // Local peer-to-peer sell orders (users list positions here)
  const [sellOrders, setSellOrders] = useState<Order[]>(() => [
    {
      id: 'seed-1',
      type: 'sell',
      seller: 'rEXAMPLe1qvPqPYb8rX',
      asset: 'OIL',
      assetName: 'Crude Oil',
      mineralKey: 'oil',
      amount: 25,
      pricePerToken: 58.75,
      totalValue: 25 * 58.75,
      timestamp: '10 mins ago'
    },
    {
      id: 'seed-2',
      type: 'sell',
      seller: 'rEXAMPLE2zK6yQJ9v2M',
      asset: 'GOLD',
      assetName: 'Gold',
      mineralKey: 'gold',
      amount: 5,
      pricePerToken: 2650.0,
      totalValue: 5 * 2650.0,
      timestamp: '1 hour ago'
    }
  ]);
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [sellAmountStr, setSellAmountStr] = useState('');
  const [sellPriceStr, setSellPriceStr] = useState('');
  const [onXrpl, setOnXrpl] = useState(false);
  const [seedStr, setSeedStr] = useState('');
  const [platformFeeUsd, setPlatformFeeUsd] = useState<number>(0);
  const [youllReceiveUsd, setYoullReceiveUsd] = useState<number>(0);
  const [currentMarketPrice, setCurrentMarketPrice] = useState<number | null>(null);

  // Compute fees and suggested/current prices when selected position or inputs change
  useEffect(() => {
    let cancelled = false;
    const pos = positionConfigs.find(p => p.id === selectedPositionId);
    const amt = Number(sellAmountStr || 0);
    const price = Number(sellPriceStr || 0);

    const nextCurrent = pos ? pos.entryPrice : null;
    let nextPlatform = 0;
    let nextYoull = 0;

    if (amt > 0 && price > 0) {
      const totalUsd = amt * price;
      const fee = totalUsd * 0.005; // 0.5%
      nextPlatform = fee;
      nextYoull = totalUsd - fee;

    }

    const tid = window.setTimeout(() => {
      if (cancelled) return;
      setCurrentMarketPrice(nextCurrent);
      setPlatformFeeUsd(nextPlatform);
      setYoullReceiveUsd(nextYoull);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [selectedPositionId, sellAmountStr, sellPriceStr, positionConfigs]);
  
  const listForSale = async () => {
    setActionError(null);
    if (!isConnected || !walletAddress) {
      setActionError('Connect your wallet to list a position for sale');
      return;
    }
    if (!selectedPositionId) {
      setActionError('Select a position to sell');
      return;
    }
    const pos = positionConfigs.find(p => p.id === selectedPositionId);
    if (!pos) {
      setActionError('Selected position not found');
      return;
    }
    const sellAmount = Number(sellAmountStr || 0);
    const sellPrice = Number(sellPriceStr || 0);
    if (!sellAmount || sellAmount <= 0 || sellAmount > pos.amount) {
      setActionError('Invalid sell amount');
      return;
    }
    if (!sellPrice || sellPrice <= 0) {
      setActionError('Set a valid sell price');
      return;
    }

    // If user wants to publish the sell offer on XRPL, call backend
    if (onXrpl) {
      if (!seedStr) {
        setActionError('Provide your XRPL seed to publish the offer (test/demo only)');
        return;
      }

      try {
        const usd = sellAmount * sellPrice;
        const conv = await convertUSDtoXRP(usd);
        const xrpAmount = Number(conv ?? 0);

        const issuer = (pos as PosWithIssuer).issuer || walletAddress;

        const sellerWallet = loginWithSeed(seedStr);

        const resp = await createSellOffer(
          sellerWallet,
          pos.symbol,
          issuer,
          String(sellAmount),
          String(xrpAmount)
        );

        const txHash = resp?.result?.hash || `user-${Date.now()}`;

        const order: Order = {
          id: txHash,
          type: 'sell',
          seller: walletAddress || 'unknown',
          asset: pos.symbol,
          assetName: pos.symbol,
          mineralKey: pos.mineralKey,
          amount: sellAmount,
          pricePerToken: sellPrice,
          totalValue: sellAmount * sellPrice,
          timestamp: 'Just now (on-XRPL)'
        };

        setSellOrders(prev => [order, ...prev]);

        setPositionConfigs(prev => prev.map(p => p.id === pos.id ? { ...p, amount: p.amount - sellAmount } : p).filter(p => p.amount > 0));

        setSelectedPositionId('');
        setSellAmountStr('');
        setSellPriceStr('');
        setSeedStr('');
        setOnXrpl(false);
        return;
      } catch (err: unknown) {
        console.error('Failed to create sell offer on XRPL', err);
        const msg = err instanceof Error ? err.message : String(err);
        setActionError(msg || 'Failed to publish sell offer');
        return;
      }
    }

    const order: Order = {
      id: `user-${Date.now()}`,
      type: 'sell',
      seller: walletAddress || 'unknown',
      asset: pos.symbol,
      assetName: pos.symbol,
      mineralKey: pos.mineralKey,
      amount: sellAmount,
      pricePerToken: sellPrice,
      totalValue: sellAmount * sellPrice,
      timestamp: 'Just now'
    };

    setSellOrders(prev => [order, ...prev]);

    // reduce user's position amount (remove if zero)
    setPositionConfigs(prev => prev.map(p => p.id === pos.id ? { ...p, amount: p.amount - sellAmount } : p).filter(p => p.amount > 0));

    // reset form
    setSelectedPositionId('');
    setSellAmountStr('');
    setSellPriceStr('');
  };

  // Use peer-to-peer sell orders (not company assets)
  const filteredOrders = sellOrders.filter(order =>
    order.asset.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.assetName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalLockedLiquidity = React.useMemo(() => {
    return sellOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0);
  }, [sellOrders]);

  const availableTokens = React.useMemo(() => {
    return sellOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
  }, [sellOrders]);

  // Estimate XRP when purchaseAmount changes
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const amt = parseFloat(purchaseAmount || '0');

    if (amt > 0 && selectedOrder) {
      const usd = amt * selectedOrder.pricePerToken;
      convertUSDtoXRP(usd)
        .catch((err) => {
          console.error('Failed to estimate XRP for purchaseAmount', err);
          if (!cancelled) setEstimatedXRP('N/A');
        });
    } else {
      // schedule the clear to avoid calling setState synchronously inside the effect
      timeoutId = window.setTimeout(() => {
        if (!cancelled) setEstimatedXRP('');
      }, 0);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [purchaseAmount, selectedOrder]);

  return (
    <div className="space-y-6">
      {/* Pool Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-linear-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
            <p className="text-sm font-medium text-blue-900">Available Tokens</p>
          </div>
          <p className="text-3xl font-bold text-blue-900">{availableTokens}</p>
        </div>

        <div className="bg-linear-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-600 rounded-lg">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <p className="text-sm font-medium text-purple-900">Total Pool Value</p>
          </div>
          <p className="text-3xl font-bold text-purple-900">${totalLockedLiquidity.toLocaleString('en-US', {maximumFractionDigits:2, minimumFractionDigits:2})}</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-blue-900 text-sm mb-1">How Trading Pools Work</h4>
            <p className="text-xs text-blue-800">
              Trade directly with other users in peer-to-peer markets. Sellers list their positions, and buyers can purchase at the listed price. All trades are executed instantly on the XRPL blockchain with minimal fees.
            </p>
          </div>
        </div>
      </div>

      {/* Main Trading Pool Interface */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-primary mb-1">Trading Pool</h2>
              <p className="text-sm text-secondary">Buy or sell positions from other traders</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('buy')}
                className={`px-6 py-2 rounded-lg font-medium transition-all ${
                  activeTab === 'buy'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Buy Orders
              </button>
              <button
                onClick={() => setActiveTab('sell')}
                className={`px-6 py-2 rounded-lg font-medium transition-all ${
                  activeTab === 'sell'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Create Sell Order
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative mt-4 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assets..."
              className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
        </div>

        {/* Content */}
        {activeTab === 'buy' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Asset</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Seller</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Price/Token</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Total Value</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Listed</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredOrders.length > 0 ? (
                  filteredOrders.map(order => (
                    <tr key={order.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-primary">{order.asset}</div>
                        <div className="text-xs text-secondary">{order.assetName}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-mono text-sm text-primary">{order.seller}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-primary">{order.amount.toLocaleString()}</div>
                        <div className="text-xs text-secondary">tokens</div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-primary">
                        ${order.pricePerToken.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-green-600">${order.totalValue.toLocaleString()}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-secondary">{order.timestamp}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
                        >
                          Buy
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-secondary">
                      No orders found. Try adjusting your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 w-full">
            <div className="bg-stone-50 rounded-xl p-6 border border-stone-200">
              <h3 className="text-lg font-bold text-primary mb-4">Create Sell Order</h3>
              <p className="text-sm text-secondary mb-6">
                List your position for other traders to purchase. Your tokens will be held in escrow until sold or canceled.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-primary mb-2">Select Position</label>
                  <select
                    value={selectedPositionId}
                    onChange={(e) => setSelectedPositionId(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-200 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                  >
                    <option value="">Choose a position to sell...</option>
                    {positionConfigs.map((p) => (
                      <option key={p.id} value={p.id}>{`${p.symbol} - ${p.amount.toLocaleString()} tokens @ $${p.entryPrice.toFixed(2)}/token`}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-primary mb-2">Amount to Sell</label>
                  <input
                    type="number"
                    value={sellAmountStr}
                    onChange={(e) => setSellAmountStr(e.target.value)}
                    placeholder="Enter amount of tokens"
                    className="w-full px-4 py-3 border border-stone-200 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-primary mb-2">Price per Token (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={sellPriceStr}
                    onChange={(e) => setSellPriceStr(e.target.value)}
                    placeholder="Set your selling price"
                    className="w-full px-4 py-3 border border-stone-200 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                  <p className="text-xs text-secondary mt-2">
                    Current market price: {currentMarketPrice ? `$${currentMarketPrice.toFixed(2)}` : '-'}
                  </p>
                </div>

                <div className="pt-4 border-t border-stone-200">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-secondary">Platform Fee (0.5%)</span>
                    <span className="font-semibold text-primary">${platformFeeUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-secondary">Network Fee</span>
                    <span className="font-semibold text-primary">~0.00001 XRP</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-stone-200">
                    <span className="font-semibold text-primary">You&apos;ll Receive</span>
                    <span className="font-bold text-green-600 text-lg">${youllReceiveUsd.toFixed(2)}</span>
                  </div>
                </div>

                {actionError && (
                  <p className="text-xs text-red-600">{actionError}</p>
                )}
                <div className="mt-3">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={onXrpl} onChange={(e) => setOnXrpl(e.target.checked)} className="w-4 h-4" />
                    <span className="text-sm text-secondary">Publish on XRPL (test/demo — requires seed)</span>
                  </label>

                  {onXrpl && (
                    <div className="mt-3">
                      <label className="block text-sm font-semibold text-primary mb-2">XRPL Seed (test account)</label>
                      <input
                        type="password"
                        value={seedStr}
                        onChange={(e) => setSeedStr(e.target.value)}
                        placeholder="s------------"
                        className="w-full px-4 py-3 border border-stone-200 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                      <p className="text-xs text-secondary mt-2">Do not use mainnet secrets here. This is for test/demo purposes only.</p>
                    </div>
                  )}

                  <button
                    onClick={listForSale}
                    disabled={!isConnected || !selectedPositionId || !sellAmountStr || !sellPriceStr}
                    className="w-full mt-4 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    List for Sale
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Buy Order Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-stone-200 shadow-lg">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold text-primary">{selectedOrder.asset}</h3>
                <p className="text-sm text-secondary">{selectedOrder.assetName}</p>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)} 
                className="text-secondary hover:text-primary transition-colors text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="mb-6 p-4 bg-stone-50 rounded-lg space-y-3 border border-stone-200">
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Seller</span>
                <span className="font-mono text-sm font-semibold text-primary">{selectedOrder.seller}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Available Amount</span>
                <span className="font-semibold text-primary">{selectedOrder.amount} tokens</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Price per Token</span>
                <span className="font-semibold text-primary">${selectedOrder.pricePerToken.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-secondary">Total Value</span>
                <span className="font-semibold text-green-600">${selectedOrder.totalValue.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-primary mb-2">Amount to Purchase</label>
                <input
                  type="number"
                  value={purchaseAmount}
                  onChange={(e) => setPurchaseAmount(e.target.value)}
                  placeholder={`Max ${selectedOrder.amount} tokens`}
                  max={selectedOrder.amount}
                  className="w-full px-4 py-3 border border-stone-200 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent text-sm"
                />
                <p className="text-xs text-secondary mt-2">
                  Cost: ${(parseFloat(purchaseAmount || '0') * selectedOrder.pricePerToken).toFixed(2)} / {estimatedXRP || '... '} XRP
                </p>
              </div>

                <div className="grid grid-cols-2 gap-3 pt-4">
                <button
                  onClick={async () => {
                    setActionError(null);
                    if (!selectedOrder) return;
                    const amt = Number(purchaseAmount || 0);
                    if (!amt || amt <= 0 || amt > selectedOrder.amount) {
                      setActionError('Enter a valid purchase amount');
                      return;
                    }

                    // compute required XRP
                    const estimatedUSD = amt * selectedOrder.pricePerToken;
                    let requiredXrp = 0;
                    try {
                      const resp = await convertUSDtoXRP(estimatedUSD);
                      requiredXrp = Number(resp ?? 0);
                    } catch (err) {
                      console.error('Failed to convert USD to XRP at purchase time', err);
                      setActionError('Unable to verify price — try again');
                      return;
                    }

                    const walletXrp = Number(xrpBalance || '0');
                    if (requiredXrp > walletXrp) {
                      setActionError('Insufficient XRP balance');
                      return;
                    }

                    // Deduct XRP locally and refresh
                    setXrpBalance((walletXrp - requiredXrp).toFixed(6));
                    try { await refreshBalance(); } catch {}

                    // update the sell order (reduce/remove)
                    setSellOrders(prev => prev.flatMap(o => {
                      if (o.id !== selectedOrder.id) return [o];
                      const remaining = o.amount - amt;
                      if (remaining > 0) {
                        return [{ ...o, amount: remaining, totalValue: remaining * o.pricePerToken }];
                      }
                      return [];
                    }));

                    // add/update buyer position
                    const existing = positionConfigs.find(p => p.symbol === selectedOrder.asset && p.mineralKey === selectedOrder.mineralKey);
                    if (existing) {
                      setPositionConfigs(prev => prev.map(p => p.id === existing.id ? { ...p, amount: p.amount + amt } : p));
                    } else {
                      const newId = (Math.max(...positionConfigs.map(p => parseInt(p.id)), 0) + 1).toString();
                      setPositionConfigs(prev => [...prev, {
                        id: newId,
                        symbol: selectedOrder.asset,
                        amount: amt,
                        entryPrice: selectedOrder.pricePerToken,
                        mineralKey: selectedOrder.mineralKey || 'oil'
                      }] );
                    }

                    // reset modal
                    setSelectedOrder(null);
                    setPurchaseAmount('');
                    setEstimatedXRP('');
                  }}
                  disabled={!purchaseAmount || parseFloat(purchaseAmount) <= 0}
                  className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Confirm Purchase
                </button>
                <button
                  onClick={() => {
                    setSelectedOrder(null);
                    setPurchaseAmount('');
                  }}
                  className="px-4 py-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-colors font-semibold"
                >
                  Cancel
                </button>
              </div>
              {actionError && (
                <p className="text-xs text-red-600 text-center pt-2">{actionError}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
