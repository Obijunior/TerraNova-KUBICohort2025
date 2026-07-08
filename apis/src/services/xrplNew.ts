// npx ts-node test-xrpl.ts full
import { Client, TrustSet, Wallet, xrpToDrops, Payment, OfferCreate } from "xrpl";

// ---------------------------------------------
// XRPL CLIENT CONNECTOR
// ---------------------------------------------
const XRPL_WS = process.env.XRPL_WS || "wss://s.altnet.rippletest.net:51233";

let client: Client | null = null;

export async function getClient(): Promise<Client> {
  if (client && client.isConnected()) return client;
  client = new Client(XRPL_WS);  // Changed from xrpl.Client
  await client.connect();
  return client;
}

// Helper to submit & wait for validation
async function submitAndWait(tx: any, wallet: Wallet) {
  const c = await getClient();
  const signed = wallet.sign(tx);
  const result = await c.submitAndWait(signed.tx_blob);
  return result;
}

// ---------------------------------------------
// CREATE ACCOUNT (TESTNET)
// ---------------------------------------------
export async function createXRPLAccount(fundOnTestnet = true) {
  const c = await getClient();
  const wallet = Wallet.generate();

  // If testnet faucet is available, fund it
  if (fundOnTestnet && (c as any).fundWallet) {
    try {
      const funded = await (c as any).fundWallet(wallet);
      const { seed, address } = funded.wallet;
      return { seed, address, wallet: Wallet.fromSeed(seed) };
    } catch (err) {
      console.warn("Funding failed, returning unfunded wallet.");
      return { seed: wallet.seed, address: wallet.address, wallet };
    }
  }

  return { seed: wallet.seed, address: wallet.address, wallet };
}

// ---------------------------------------------
// LOGIN WITH SEED
// ---------------------------------------------
export function loginWithSeed(seed: string) {
  try {
    return Wallet.fromSeed(seed);
  } catch (err) {
    throw new Error("Invalid XRPL seed.");
  }
}

// ---------------------------------------------
// CREATE TRUSTLINE
// ---------------------------------------------
export async function createTrustline(
  holderWallet: Wallet,
  issuerAddress: string,
  currency: string,
  limit = "1000000000"
) {
  const c = await getClient();

  const tx: TrustSet = {
    TransactionType: "TrustSet",
    Account: holderWallet.address,
    LimitAmount: {
      currency,
      issuer: issuerAddress,
      value: limit,
    },
  };

  const prepared = await c.autofill(tx);
  return await submitAndWait(prepared, holderWallet);
}

// ---------------------------------------------
// ISSUE (MINT) FUNGIBLE TOKEN
// ---------------------------------------------
export async function issueFungibleToken(
  issuerWallet: Wallet,
  recipient: string,
  currency: string,
  amount: string
) {
  const c = await getClient();

  const tx: Payment = {
    TransactionType: "Payment",
    Account: issuerWallet.address,
    Destination: recipient,
    Amount: {
      currency,
      issuer: issuerWallet.address,
      value: amount,
    },
  };

  const prepared = await c.autofill(tx);
  return await submitAndWait(prepared, issuerWallet);
}

// ---------------------------------------------
// BUY OFFER (BUY TOKEN USING XRP)
// ---------------------------------------------
export async function createBuyOffer(
  buyerWallet: Wallet,
  currency: string,
  issuerAddress: string,
  tokenAmount: string,
  xrpAmount: string
) {
  const c = await getClient();

  const tx: OfferCreate = {
    TransactionType: "OfferCreate",
    Account: buyerWallet.address,
    TakerPays: xrpToDrops(xrpAmount),
    TakerGets: {
      currency,
      issuer: issuerAddress,
      value: tokenAmount,
    },
  };

  const prepared = await c.autofill(tx);
  return await submitAndWait(prepared, buyerWallet);
}

// ---------------------------------------------
// SELL OFFER (SELL TOKEN → RECEIVE XRP)
// ---------------------------------------------
export async function createSellOffer(
  sellerWallet: Wallet,
  currency: string,
  issuerAddress: string,
  tokenAmount: string,
  xrpAmount: string
) {
  const c = await getClient();

  const tx: OfferCreate = {
    TransactionType: "OfferCreate",
    Account: sellerWallet.address,
    TakerPays: {
      currency,
      issuer: issuerAddress,
      value: tokenAmount,
    },
    TakerGets: xrpToDrops(xrpAmount),
  };

  const prepared = await c.autofill(tx);
  return await submitAndWait(prepared, sellerWallet);
}

// get account balance
// ---------------------------------------------
// Get wallet XRP balance
// ---------------------------------------------
export async function getXRPBalance(walletAddress: string): Promise<string> {
  const client = await getClient(); // reuse your existing client connection
  const accountInfo = await client.request({
    command: "account_info",
    account: walletAddress,
    ledger_index: "validated"
  });
  
  // Balance comes in drops (1 XRP = 1,000,000 drops)
  const balanceInDrops = accountInfo.result.account_data.Balance;
  const balanceInXRP = (parseInt(balanceInDrops) / 1_000_000).toString();
  return balanceInXRP;
}
