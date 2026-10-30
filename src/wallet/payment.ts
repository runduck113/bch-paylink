import type { DappConnectionManager } from '@wizardconnect/dapp';
import type { SignTransactionRequest } from '@wizardconnect/core';
import { FEE_RATE_SAT_PER_BYTE, NETWORK, WALLET_ADDRESS_SCAN_COUNT } from '../config';
import { deriveWalletAddresses, type WalletAddress } from '../lib/hdAddresses';
import { collectWalletUtxos, mapInputsToPaths } from '../lib/walletUtxos';
import { planPayment, planPrep, PlanError, type BuyerUtxo, type PaymentPlan, type TxPlan } from '../lib/plan';
import { buildWcTransaction, toRelaySignRequest } from '../lib/buildTx';
import type { Invoice } from '../lib/invoice';
import { sameTxSkeleton } from '../lib/txReceipt';
import { broadcast, getProvider } from './electrum';

export interface WalletSnapshot {
  addresses: WalletAddress[];
  utxos: BuyerUtxo[];
  /** receive/0: gets the receipt NFT and the change. */
  buyerAddress: string;
}

/** Derive the wallet's addresses from the xpubs it shared and fetch their coins. */
export async function loadWallet(manager: DappConnectionManager): Promise<WalletSnapshot> {
  const addresses = deriveWalletAddresses(manager.getSessionPaths(), WALLET_ADDRESS_SCAN_COUNT, NETWORK);
  const provider = getProvider();
  const utxos = await collectWalletUtxos(addresses, (a) => provider.getUtxos(a));
  return { addresses, utxos, buyerAddress: addresses[0].address };
}

export type Next =
  | { kind: 'pay'; plan: PaymentPlan }
  | { kind: 'prep'; plan: TxPlan; reason: string }
  | { kind: 'blocked'; reason: string };

/** What the buyer can do next with this wallet: pay directly, prepare first, or nothing (with why). */
export function nextStep(invoice: Invoice, w: WalletSnapshot): Next {
  const common = { buyerUtxos: w.utxos, buyerAddress: w.buyerAddress, feeRate: FEE_RATE_SAT_PER_BYTE, network: NETWORK };
  try {
    return { kind: 'pay', plan: planPayment({ ...common, invoice }) };
  } catch (e) {
    if (!(e instanceof PlanError)) throw e;
    if (e.code !== 'NO_GENESIS_UTXO') return { kind: 'blocked', reason: e.message };
    try {
      return { kind: 'prep', plan: planPrep(common), reason: e.message };
    } catch (e2) {
      if (e2 instanceof PlanError) return { kind: 'blocked', reason: e2.message };
      throw e2;
    }
  }
}

type RelayTransaction = SignTransactionRequest['transaction'];

/**
 * Ask the wallet to sign `plan`, check it signed what we asked for, broadcast it ourselves, return the txid.
 * The WizardConnect response carries only the signed hex, so the dapp always broadcasts (broadcast: false
 * in the request; if the wallet broadcasts anyway, Electrum's "already known" is treated as success).
 */
export async function signAndBroadcast(
  manager: DappConnectionManager,
  plan: TxPlan,
  w: WalletSnapshot,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const built = buildWcTransaction(plan, { provider: getProvider(), buyerAddress: w.buyerAddress, userPrompt, broadcast: false });
  const inputPaths = mapInputsToPaths(plan.inputs, w.addresses);
  // The relay JSON.stringifies messages, so the request is pre-serialised (hex tx + relay-safe source outputs);
  // the declared type expects libauth objects, hence the cast.
  const transaction = toRelaySignRequest(built) as unknown as RelayTransaction;
  const res = await manager.signTransaction({ transaction, inputPaths }, signal ? { signal } : undefined);
  const signedHex = res.signedTransaction;
  if (!sameTxSkeleton(built.hex, signedHex)) {
    throw new Error('The wallet returned a different transaction than requested. Nothing was sent.');
  }
  return broadcast(signedHex);
}
