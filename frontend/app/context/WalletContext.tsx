'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { getXRPBalance } from '../../../apis/src/services/xrplNew';

interface WalletContextType {
  isConnected: boolean;
  walletAddress: string | null;
  connectWallet: (address: string) => void;
  disconnectWallet: () => void;
  xrpBalance: string | null;
  setXrpBalance: (b: string | null) => void;
  loadingBalance: boolean;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletData, setWalletData] = useState<{
    isConnected: boolean;
    walletAddress: string | null;
    mounted: boolean;
  }>(() => {
    // Initialize from localStorage
    const savedAddress = typeof window !== 'undefined' ? localStorage.getItem('walletAddress') : null;
    return {
      isConnected: !!savedAddress,
      walletAddress: savedAddress,
      mounted: true
    };
  });

  const [xrpBalance, setXrpBalanceState] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('xrpBalance') : null;
  });

  const [loadingBalance, setLoadingBalance] = useState(false);

  const setXrpBalance = (b: string | null) => {
    setXrpBalanceState(b);
    if (typeof window !== 'undefined') {
      if (b === null) localStorage.removeItem('xrpBalance');
      else localStorage.setItem('xrpBalance', b);
    }
  };

  const connectWallet = (address: string) => {
    setWalletData(prev => ({
      ...prev,
      walletAddress: address,
      isConnected: true
    }));
    if (typeof window !== 'undefined') localStorage.setItem('walletAddress', address);
  };

  const disconnectWallet = () => {
    setWalletData(prev => ({
      ...prev,
      walletAddress: null,
      isConnected: false
    }));
    if (typeof window !== 'undefined') localStorage.removeItem('walletAddress');
    // Also clear balance on disconnect
    setXrpBalance(null);
  };

  const refreshBalance = useCallback(async (): Promise<void> => {
    const address = walletData.walletAddress;
    if (!address) return setXrpBalance(null);

    try {
      setLoadingBalance(true);
      // getXRPBalance returns the balance already converted to XRP as a string
      const balance = await getXRPBalance(address);
      setXrpBalance(balance);
    } catch (err) {
      console.error('Failed to refresh XRP balance:', err);
      setXrpBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, [walletData.walletAddress]);

  // Auto-refresh when walletAddress changes
  useEffect(() => {
    if (walletData.walletAddress) {
      // fire-and-forget
      refreshBalance();
    }
  }, [walletData.walletAddress, refreshBalance]);

  return (
    <WalletContext.Provider value={{ 
      isConnected: walletData.isConnected, 
      walletAddress: walletData.walletAddress, 
      connectWallet, 
      disconnectWallet,
      xrpBalance,
      setXrpBalance,
      loadingBalance,
      refreshBalance
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
